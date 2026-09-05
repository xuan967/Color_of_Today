import camera from '@ohos.multimedia.camera';
import abilityAccessCtrl from '@ohos.abilityAccessCtrl';
import common from '@ohos.app.ability.common';
import colorFilter from 'libentry.so';
import { BusinessError } from '@ohos.base';

export interface CameraStartCallbacks {
  onPreviewSize: (width: number, height: number) => void;
  onFirstFrame: () => void;
  onRuntimeError: (message: string) => void;
}

export interface CameraSwitchResult {
  error: string | null;
  recovered: boolean;
}

/** Camera Kit 封装：能力探测、PhotoSession、首帧确认和失败恢复。 */
export class CameraService {
  private manager: camera.CameraManager | null = null;
  private devices: camera.CameraDevice[] = [];
  private currentIndex: number = -1;
  private usableBackIndex: number = -1;
  private usableFrontIndex: number = -1;
  private input: camera.CameraInput | null = null;
  private previewOutput: camera.PreviewOutput | null = null;
  private session: camera.PhotoSession | null = null;
  private started: boolean = false;
  private glSurfaceId: string = '';
  private activeOperationId: number = 0;

  private log(operationId: number, message: string): void {
    console.info(`[TodayColor][CameraService][op=${operationId}] ${message}`);
  }

  private logError(operationId: number, stage: string, err: BusinessError): void {
    console.error(`[TodayColor][CameraService][op=${operationId}] ${stage} failed ` +
      `code=${err.code}, message=${err.message}`);
  }

  static async ensureCameraPermission(context: common.Context, operationId: number): Promise<boolean> {
    console.info(`[TodayColor][CameraService][op=${operationId}] requesting camera permission`);
    const atManager = abilityAccessCtrl.createAtManager();
    const result = await atManager.requestPermissionsFromUser(context, ['ohos.permission.CAMERA']);
    const granted = result.authResults.length > 0
      && result.authResults.every((value: number) => value === 0);
    console.info(`[TodayColor][CameraService][op=${operationId}] camera permission granted=${granted}`);
    return granted;
  }

  canSwitch(): boolean {
    return this.usableBackIndex >= 0 && this.usableFrontIndex >= 0;
  }

  switchUnavailableReason(): string {
    if (this.devices.length === 0) {
      return '当前设备没有可用摄像头';
    }
    if (this.usableFrontIndex < 0) {
      return '当前设备或模拟器不支持前置摄像头';
    }
    if (this.usableBackIndex < 0) {
      return '当前设备或模拟器不支持后置摄像头';
    }
    return '';
  }

  isFront(): boolean {
    return this.currentIndex >= 0 && this.currentIndex < this.devices.length
      && this.devices[this.currentIndex].cameraPosition === camera.CameraPosition.CAMERA_POSITION_FRONT;
  }

  async start(context: common.Context, glSurfaceId: string, targetAspect: number,
    operationId: number, callbacks: CameraStartCallbacks): Promise<string | null> {
    this.activeOperationId = operationId;
    this.glSurfaceId = glSurfaceId;
    this.log(operationId, `start requested surfaceValid=${glSurfaceId !== '' && glSurfaceId !== '0'}, ` +
      `targetAspect=${targetAspect.toFixed(4)}`);
    const managerError = await this.openManager(context, operationId);
    if (managerError !== null) {
      return managerError;
    }
    this.currentIndex = this.pickDefaultIndex();
    return this.openCurrent(targetAspect, operationId, callbacks);
  }

  async switchTo(context: common.Context, targetAspect: number, operationId: number,
    callbacks: CameraStartCallbacks): Promise<CameraSwitchResult> {
    this.activeOperationId = operationId;
    const managerError = await this.openManager(context, operationId);
    if (managerError !== null) {
      return { error: managerError, recovered: false };
    }
    if (!this.canSwitch()) {
      const reason = this.switchUnavailableReason();
      this.log(operationId, `switch rejected: ${reason}`);
      return { error: reason, recovered: true };
    }

    const oldIndex = this.currentIndex;
    const oldPosition = this.devices[oldIndex].cameraPosition;
    const targetIndex = oldPosition === camera.CameraPosition.CAMERA_POSITION_FRONT
      ? this.usableBackIndex : this.usableFrontIndex;
    this.log(operationId, `switch position=${oldPosition} -> ${this.devices[targetIndex].cameraPosition}`);

    await this.stop(operationId);
    this.currentIndex = targetIndex;
    const switchError = await this.openCurrent(targetAspect, operationId, callbacks);
    if (switchError === null) {
      return { error: null, recovered: false };
    }

    this.log(operationId, `target facing failed, recovering index=${oldIndex}`);
    this.currentIndex = oldIndex;
    const recoveryError = await this.openCurrent(targetAspect, operationId, callbacks);
    if (recoveryError === null) {
      return { error: `${switchError}；已恢复原镜头`, recovered: true };
    }
    return { error: `${switchError}；恢复原镜头失败：${recoveryError}`, recovered: false };
  }

  private supportsSceneMode(modes: camera.SceneMode[], target: camera.SceneMode): boolean {
    for (const mode of modes) {
      if (mode === target) {
        return true;
      }
    }
    return false;
  }

  private refreshCapabilities(operationId: number): void {
    this.usableBackIndex = -1;
    this.usableFrontIndex = -1;
    const manager = this.manager!;
    this.log(operationId, `enumerated deviceCount=${this.devices.length}`);
    for (let index = 0; index < this.devices.length; index++) {
      const device = this.devices[index];
      let declaresPhoto = false;
      let profileCount = 0;
      try {
        const modes = manager.getSupportedSceneModes(device);
        declaresPhoto = this.supportsSceneMode(modes, camera.SceneMode.NORMAL_PHOTO);
      } catch (err) {
        this.logError(operationId, `query scene modes index=${index}`, err as BusinessError);
      }
      try {
        // 部分模拟器的场景枚举不完整，以实际 capability 查询结果作为最终能力证据。
        profileCount = manager.getSupportedOutputCapability(device,
          camera.SceneMode.NORMAL_PHOTO).previewProfiles.length;
      } catch (err) {
        this.logError(operationId, `query preview capability index=${index}`, err as BusinessError);
      }
      const usable = profileCount > 0;
      this.log(operationId, `device index=${index}, position=${device.cameraPosition}, ` +
        `type=${device.cameraType}, declaresNormalPhoto=${declaresPhoto}, ` +
        `previewProfiles=${profileCount}, usable=${usable}`);
      if (!usable) {
        continue;
      }
      if (device.cameraPosition === camera.CameraPosition.CAMERA_POSITION_BACK && this.usableBackIndex < 0) {
        this.usableBackIndex = index;
      } else if (device.cameraPosition === camera.CameraPosition.CAMERA_POSITION_FRONT
        && this.usableFrontIndex < 0) {
        this.usableFrontIndex = index;
      }
    }
    this.log(operationId, `facing capability back=${this.usableBackIndex >= 0}, ` +
      `front=${this.usableFrontIndex >= 0}, canSwitch=${this.canSwitch()}`);
  }

  private pickDefaultIndex(): number {
    return this.usableBackIndex >= 0 ? this.usableBackIndex : this.usableFrontIndex;
  }

  private async openManager(context: common.Context, operationId: number): Promise<string | null> {
    try {
      if (this.manager === null) {
        this.manager = camera.getCameraManager(context);
        this.log(operationId, 'CameraManager created');
      }
      this.devices = this.manager.getSupportedCameras();
      if (this.devices.length === 0) {
        return '未找到可用相机';
      }
      this.refreshCapabilities(operationId);
      if (this.usableBackIndex < 0 && this.usableFrontIndex < 0) {
        return '没有支持普通拍照预览的摄像头';
      }
      return null;
    } catch (err) {
      const error = err as BusinessError;
      this.logError(operationId, 'open camera manager', error);
      return `相机管理失败 ${error.code}: ${error.message}`;
    }
  }

  private selectProfile(profiles: camera.Profile[], targetAspect: number,
    operationId: number): camera.Profile {
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
      this.log(operationId, `profile candidate=${width}x${height}, portraitAspect=` +
        `${portraitAspect.toFixed(4)}, error=${aspectError.toFixed(4)}, withinBudget=${withinBudget}`);
      if ((withinBudget && !bestWithinBudget)
        || (withinBudget === bestWithinBudget && aspectError < bestAspectError - 0.0001)
        || (withinBudget === bestWithinBudget && Math.abs(aspectError - bestAspectError) <= 0.0001
          && pixels > bestPixels)) {
        best = profile;
        bestAspectError = aspectError;
        bestPixels = pixels;
      }
    }
    this.log(operationId, `profile selected=${best.size.width}x${best.size.height}`);
    return best;
  }

  private registerCallbacks(previewOutput: camera.PreviewOutput, session: camera.PhotoSession,
    operationId: number, callbacks: CameraStartCallbacks): void {
    let firstFrameDelivered = false;
    previewOutput.on('frameStart', (err: BusinessError) => {
      if (err !== undefined && err.code !== 0) {
        this.logError(operationId, 'preview frameStart', err);
        callbacks.onRuntimeError(`预览首帧失败 (code ${err.code})`);
        return;
      }
      if (!firstFrameDelivered && operationId === this.activeOperationId) {
        firstFrameDelivered = true;
        this.log(operationId, 'preview first frame received');
        callbacks.onFirstFrame();
      }
    });
    previewOutput.on('frameEnd', (err: BusinessError) => {
      if (err !== undefined && err.code !== 0) {
        this.logError(operationId, 'preview frameEnd', err);
      } else {
        this.log(operationId, 'preview frame stream ended');
      }
    });
    previewOutput.on('error', (err: BusinessError) => {
      this.logError(operationId, 'preview runtime', err);
      callbacks.onRuntimeError(`预览输出异常 (code ${err.code})`);
    });
    session.on('error', (err: BusinessError) => {
      this.logError(operationId, 'photo session runtime', err);
      callbacks.onRuntimeError(`相机会话异常 (code ${err.code})`);
    });
  }

  private async openCurrent(targetAspect: number, operationId: number,
    callbacks: CameraStartCallbacks): Promise<string | null> {
    try {
      if (this.currentIndex < 0 || this.currentIndex >= this.devices.length) {
        return '没有可打开的摄像头';
      }
      const device = this.devices[this.currentIndex];
      const sceneMode = camera.SceneMode.NORMAL_PHOTO;
      const profiles = this.manager!.getSupportedOutputCapability(device, sceneMode).previewProfiles;
      if (profiles.length === 0) {
        return '该相机不支持预览流';
      }
      const profile = this.selectProfile(profiles, targetAspect, operationId);
      callbacks.onPreviewSize(profile.size.width, profile.size.height);
      colorFilter.setPreviewSize(profile.size.width, profile.size.height);
      this.log(operationId, `opening index=${this.currentIndex}, position=${device.cameraPosition}, ` +
        `surfaceValid=${this.glSurfaceId !== '' && this.glSurfaceId !== '0'}`);

      this.previewOutput = this.manager!.createPreviewOutput(profile, this.glSurfaceId);
      this.log(operationId, 'PreviewOutput created');
      this.input = this.manager!.createCameraInput(device);
      this.log(operationId, 'CameraInput created');
      await this.input.open();
      this.log(operationId, 'CameraInput opened');

      this.session = this.manager!.createSession(sceneMode) as camera.PhotoSession;
      this.log(operationId, 'PhotoSession created');
      this.registerCallbacks(this.previewOutput, this.session, operationId, callbacks);
      this.session.beginConfig();
      this.log(operationId, 'PhotoSession beginConfig');
      this.session.addInput(this.input);
      this.session.addOutput(this.previewOutput);
      this.log(operationId, 'PhotoSession input/output added');
      await this.session.commitConfig();
      this.log(operationId, 'PhotoSession commitConfig completed');
      await this.session.start();
      this.started = true;
      this.log(operationId, 'PhotoSession start completed; waiting for frameStart');
      return null;
    } catch (err) {
      const error = err as BusinessError;
      this.logError(operationId, 'open current camera', error);
      await this.stop(operationId);
      return `${error.message} (code ${error.code})`;
    }
  }

  tapFocus(x: number, y: number): void {
    if (this.session === null) {
      return;
    }
    try {
      this.session.setFocusMode(camera.FocusMode.FOCUS_MODE_AUTO);
      this.session.setFocusPoint({ x: x, y: y });
    } catch (err) {
      this.logError(this.activeOperationId, 'tap focus', err as BusinessError);
    }
  }

  zoomRange(): Array<number> {
    if (this.session === null) {
      return [1, 1];
    }
    try {
      return this.session.getZoomRatioRange();
    } catch (err) {
      this.logError(this.activeOperationId, 'get zoom range', err as BusinessError);
      return [1, 1];
    }
  }

  setZoom(ratio: number): void {
    if (this.session === null) {
      return;
    }
    try {
      const range = this.session.getZoomRatioRange();
      this.session.setZoomRatio(Math.min(range[1], Math.max(range[0], ratio)));
    } catch (err) {
      this.logError(this.activeOperationId, 'set zoom', err as BusinessError);
    }
  }

  async stop(operationId: number = this.activeOperationId): Promise<void> {
    const session = this.session;
    const previewOutput = this.previewOutput;
    const input = this.input;
    this.session = null;
    this.previewOutput = null;
    this.input = null;
    const wasStarted = this.started;
    this.started = false;
    this.log(operationId, `cleanup begin started=${wasStarted}`);

    if (previewOutput !== null) {
      try {
        previewOutput.off('frameStart');
        previewOutput.off('frameEnd');
        previewOutput.off('error');
      } catch (err) {
        this.logError(operationId, 'remove preview callbacks', err as BusinessError);
      }
    }
    if (session !== null) {
      try {
        session.off('error');
      } catch (err) {
        this.logError(operationId, 'remove session callback', err as BusinessError);
      }
    }
    if (session !== null && wasStarted) {
      try {
        await session.stop();
        this.log(operationId, 'PhotoSession stopped');
      } catch (err) {
        this.logError(operationId, 'stop PhotoSession', err as BusinessError);
      }
    }
    if (session !== null) {
      try {
        await session.release();
        this.log(operationId, 'PhotoSession released');
      } catch (err) {
        this.logError(operationId, 'release PhotoSession', err as BusinessError);
      }
    }
    if (previewOutput !== null) {
      try {
        await previewOutput.release();
        this.log(operationId, 'PreviewOutput released');
      } catch (err) {
        this.logError(operationId, 'release PreviewOutput', err as BusinessError);
      }
    }
    if (input !== null) {
      try {
        await input.close();
        this.log(operationId, 'CameraInput closed');
      } catch (err) {
        this.logError(operationId, 'close CameraInput', err as BusinessError);
      }
    }
    this.log(operationId, 'cleanup completed');
  }
}
