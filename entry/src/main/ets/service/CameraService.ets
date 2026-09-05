import camera from '@ohos.multimedia.camera';
import abilityAccessCtrl from '@ohos.abilityAccessCtrl';
import common from '@ohos.app.ability.common';
import colorFilter from 'libentry.so';
import { BusinessError } from '@ohos.base';

/**
 * Camera Kit 封装：权限申请、前后置摄像头切换、预览流绑定到 GL 消费 Surface。
 * 预览帧走向：Camera PreviewOutput → OH_NativeImage 消费面 → OES 纹理 → Shader → XComponent。
 */
export class CameraService {
  private manager: camera.CameraManager | null = null;
  private devices: camera.CameraDevice[] = [];
  private currentIndex: number = 0;
  private input: camera.CameraInput | null = null;
  private previewOutput: camera.PreviewOutput | null = null;
  private session: camera.PhotoSession | null = null;
  private started: boolean = false;
  private glSurfaceId: string = '';

  static async ensureCameraPermission(context: common.Context): Promise<boolean> {
    const atManager = abilityAccessCtrl.createAtManager();
    const result = await atManager.requestPermissionsFromUser(context, ['ohos.permission.CAMERA']);
    return result.authResults.length > 0
      && result.authResults.every((r: number) => r === 0);
  }

  /** 是否存在可切换的其他摄像头 */
  canSwitch(): boolean {
    return this.findIndex(camera.CameraPosition.CAMERA_POSITION_BACK) >= 0
      && this.findIndex(camera.CameraPosition.CAMERA_POSITION_FRONT) >= 0;
  }

  /** 当前是否为前置摄像头（前置预览通常需要镜像） */
  isFront(): boolean {
    if (this.devices.length === 0) {
      return false;
    }
    return this.devices[this.currentIndex].cameraPosition === camera.CameraPosition.CAMERA_POSITION_FRONT;
  }

  /** 启动预览（默认优先后置）。onPreviewSize 回传预览流分辨率（用于 shader 等比裁剪）。 */
  async start(context: common.Context,
    glSurfaceId: string,
    targetAspect: number,
    onPreviewSize: (w: number, h: number) => void): Promise<string | null> {
    this.glSurfaceId = glSurfaceId;
    const err = await this.openManager(context);
    if (err !== null) {
      return err;
    }
    this.currentIndex = this.pickDefaultIndex();
    return this.openCurrent(targetAspect, onPreviewSize);
  }

  /** 按镜头朝向切换；多后摄设备不会再被误当成“前置”。 */
  async switchTo(context: common.Context,
    targetAspect: number,
    onPreviewSize: (w: number, h: number) => void): Promise<string | null> {
    const managerError = await this.openManager(context);
    if (managerError !== null) {
      return managerError;
    }
    if (!this.canSwitch()) {
      return '没有可切换的摄像头';
    }

    const oldIndex = this.currentIndex;
    const oldPosition = this.devices[oldIndex].cameraPosition;
    const targetPosition = oldPosition === camera.CameraPosition.CAMERA_POSITION_FRONT
      ? camera.CameraPosition.CAMERA_POSITION_BACK
      : camera.CameraPosition.CAMERA_POSITION_FRONT;
    const targetIndex = this.findIndex(targetPosition);
    if (targetIndex < 0) {
      return '没有找到目标朝向的摄像头';
    }

    await this.stop();
    this.currentIndex = targetIndex;
    const switchError = await this.openCurrent(targetAspect, onPreviewSize);
    if (switchError === null) {
      return null;
    }

    // 切换失败时尽力恢复原镜头，避免页面停留在永久黑屏状态。
    const recoveryIndex = this.findIndex(oldPosition);
    if (recoveryIndex >= 0) {
      this.currentIndex = recoveryIndex;
      const recoveryError = await this.openCurrent(targetAspect, onPreviewSize);
      if (recoveryError === null) {
        return `${switchError}；已恢复原镜头`;
      }
      return `${switchError}；恢复原镜头失败：${recoveryError}`;
    }
    return switchError;
  }

  private findIndex(position: camera.CameraPosition): number {
    for (let i = 0; i < this.devices.length; i++) {
      if (this.devices[i].cameraPosition === position) {
        return i;
      }
    }
    return -1;
  }

  private pickDefaultIndex(): number {
    const backIndex = this.findIndex(camera.CameraPosition.CAMERA_POSITION_BACK);
    return backIndex >= 0 ? backIndex : 0;
  }

  private async openManager(context: common.Context): Promise<string | null> {
    try {
      if (this.manager === null) {
        this.manager = camera.getCameraManager(context);
      }
      this.devices = this.manager.getSupportedCameras();
      if (this.devices.length === 0) {
        return '未找到可用相机';
      }
      if (this.currentIndex >= this.devices.length) {
        this.currentIndex = 0;
      }
      return null;
    } catch (err) {
      const e = err as BusinessError;
      return `相机管理失败 ${e.code}: ${e.message}`;
    }
  }

  private selectProfile(profiles: camera.Profile[], targetAspect: number): camera.Profile {
    let best = profiles[0];
    let bestAspectError = Number.MAX_VALUE;
    let bestPixels = 0;
    const safeTarget = targetAspect > 0 ? targetAspect : 9 / 16;
    for (const profile of profiles) {
      const width = profile.size.width;
      const height = profile.size.height;
      if (width <= 0 || height <= 0) {
        continue;
      }
      const maxSide = Math.max(width, height);
      const portraitAspect = Math.min(width, height) / maxSide;
      const aspectError = Math.abs(portraitAspect - safeTarget);
      const pixels = width * height;
      const withinBudget = maxSide <= 1920;
      const bestWithinBudget = Math.max(best.size.width, best.size.height) <= 1920;
      if ((withinBudget && !bestWithinBudget)
        || (withinBudget === bestWithinBudget && aspectError < bestAspectError - 0.0001)
        || (withinBudget === bestWithinBudget && Math.abs(aspectError - bestAspectError) <= 0.0001
          && pixels > bestPixels)) {
        best = profile;
        bestAspectError = aspectError;
        bestPixels = pixels;
      }
    }
    return best;
  }

  private async openCurrent(targetAspect: number,
    onPreviewSize: (w: number, h: number) => void): Promise<string | null> {
    try {
      const device = this.devices[this.currentIndex];
      const sceneMode = camera.SceneMode.NORMAL_PHOTO;
      const capability = this.manager!.getSupportedOutputCapability(device, sceneMode);
      const profiles: camera.Profile[] = capability.previewProfiles;
      if (profiles.length === 0) {
        return '该相机不支持预览流';
      }
      const profile = this.selectProfile(profiles, targetAspect);
      onPreviewSize(profile.size.width, profile.size.height);
      colorFilter.setPreviewSize(profile.size.width, profile.size.height);
      console.info(`[TodayColor] camera position=${device.cameraPosition}, profile=` +
        `${profile.size.width}x${profile.size.height}, targetAspect=${targetAspect}`);

      this.previewOutput = this.manager!.createPreviewOutput(profile, this.glSurfaceId);
      this.input = this.manager!.createCameraInput(device);
      await this.input.open();

      this.session = this.manager!.createSession(sceneMode) as camera.PhotoSession;
      this.session.beginConfig();
      this.session.addInput(this.input);
      this.session.addOutput(this.previewOutput);
      await this.session.commitConfig();
      await this.session.start();
      this.started = true;
      return null;
    } catch (err) {
      const e = err as BusinessError;
      console.error(`[TodayColor] cam open FAILED code=${e.code} msg=${e.message}`);
      await this.stop();
      return `${e.message} (code ${e.code})`;
    }
  }

  /** 点击对焦（归一化坐标 0-1，相对预览画面左上角） */
  tapFocus(x: number, y: number): void {
    if (this.input === null || this.session === null) {
      return;
    }
    try {
      this.session.setFocusMode(camera.FocusMode.FOCUS_MODE_AUTO);
      this.session.setFocusPoint({ x: x, y: y });
    } catch (err) {
      // 部分相机不支持自动点焦，忽略
    }
  }

  /** 变焦范围 [min, max]，相机未就绪返回 [1,1] */
  zoomRange(): Array<number> {
    if (this.session === null) {
      return [1, 1];
    }
    try {
      return this.session.getZoomRatioRange();
    } catch (err) {
      return [1, 1];
    }
  }

  /** 设置变焦倍率（内部夹紧到支持范围） */
  setZoom(ratio: number): void {
    if (this.session === null) {
      return;
    }
    try {
      const range = this.session.getZoomRatioRange();
      const clamped = Math.min(range[1], Math.max(range[0], ratio));
      this.session.setZoomRatio(clamped);
    } catch (err) {
      // 设备不支持变焦，忽略
    }
  }

  async stop(): Promise<void> {
    const session = this.session;
    const previewOutput = this.previewOutput;
    const input = this.input;
    this.session = null;
    this.previewOutput = null;
    this.input = null;
    const wasStarted = this.started;
    this.started = false;

    if (session !== null && wasStarted) {
      try {
        await session.stop();
      } catch (err) {
        console.error(`[TodayColor] camera session stop: ${JSON.stringify(err)}`);
      }
    }
    if (session !== null) {
      try {
        await session.release();
      } catch (err) {
        console.error(`[TodayColor] camera session release: ${JSON.stringify(err)}`);
      }
    }
    if (previewOutput !== null) {
      try {
        await previewOutput.release();
      } catch (err) {
        console.error(`[TodayColor] preview release: ${JSON.stringify(err)}`);
      }
    }
    if (input !== null) {
      try {
        await input.close();
      } catch (err) {
        console.error(`[TodayColor] camera input close: ${JSON.stringify(err)}`);
      }
    }
  }
}
