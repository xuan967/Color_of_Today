import common from '@ohos.app.ability.common';
import display from '@ohos.display';
import image from '@ohos.multimedia.image';
import componentSnapshot from '@ohos.arkui.componentSnapshot';
import promptAction from '@ohos.promptAction';
import router from '@ohos.router';
import vibrator from '@ohos.vibrator';
import colorFilter from 'libentry.so';
import { COLOR_PRESETS, ColorPreset } from '../model/ColorPreset';
import { DailyColorManager } from '../manager/DailyColorManager';
import { PhotoDao } from '../model/PhotoDao';
import { CameraService, CameraStartCallbacks, CameraSwitchResult } from '../service/CameraService';
import { CaptureService } from '../service/CaptureService';
import { CollectionService } from '../service/CollectionService';
import { EchoService, EchoResult } from '../service/EchoService';
import { ColorPaletteSheet } from '../components/ColorPalette';

/** API 12 官方 Surface 生命周期入口；SurfaceId 以 bigint 无损传入 Native。 */
enum CameraUiPhase {
  IDLE,
  RENDERER_STARTING,
  CAMERA_OPENING,
  PREVIEWING,
  SWITCHING,
  ERROR
}

class CameraPreviewController extends XComponentController {
  private surfaceId: string = '';
  private operationId: number = 0;

  setOperationId(operationId: number): void {
    this.operationId = operationId;
  }

  onSurfaceCreated(surfaceId: string): void {
    this.surfaceId = surfaceId;
    console.info(`[TodayColor][CameraUI][op=${this.operationId}] surface created`);
    if (this.operationId > 0) {
      colorFilter.startRenderer(BigInt(surfaceId), this.operationId);
    } else {
      console.info('[TodayColor][CameraUI][op=0] waiting for camera operation before renderer start');
    }
  }

  onSurfaceChanged(_surfaceId: string, rect: SurfaceRect): void {
    console.info(`[TodayColor][CameraUI][op=${this.operationId}] surface changed ` +
      `${rect.surfaceWidth}x${rect.surfaceHeight}`);
    colorFilter.setSurfaceGeometry(rect.surfaceWidth, rect.surfaceHeight);
  }

  onSurfaceDestroyed(_surfaceId: string): void {
    console.info(`[TodayColor][CameraUI][op=${this.operationId}] surface destroyed`);
    this.surfaceId = '';
    colorFilter.releaseRenderer();
  }

  ensureRenderer(operationId: number): boolean {
    this.setOperationId(operationId);
    if (colorFilter.isRendererReady()) {
      console.info(`[TodayColor][CameraUI][op=${operationId}] renderer already ready`);
      return true;
    }
    if (this.surfaceId === '') {
      console.error(`[TodayColor][CameraUI][op=${operationId}] renderer start skipped: surface unavailable`);
      return false;
    }
    const requested = colorFilter.startRenderer(BigInt(this.surfaceId), operationId);
    console.info(`[TodayColor][CameraUI][op=${operationId}] renderer start requested=${requested}`);
    return requested;
  }
}

/**
 * 相机取景页（App 主页）：
 * 全屏实时颜色隔离取景；顶部今日色签（点按开调色盘），底部不透明相机控制区。
 * 辅助功能：九宫格构图线、点击对焦、双指变焦、前后置切换。
 */
@Entry
@Component
struct Index {
  @State today: ColorPreset = COLOR_PRESETS[0];
  @State photoCount: number = 0;
  @State latestThumb: string = '';
  @State flashOpacity: number = 0;
  @State capturedPm: image.PixelMap | null = null;
  @State showCapture: boolean = false;
  @State camError: string = '';
  @State cameraPhase: CameraUiPhase = CameraUiPhase.IDLE;
  @State canSwitch: boolean = false;
  @State gridOn: boolean = false;
  @State paletteOpen: boolean = false;
  @State focusX: number = 0;
  @State focusY: number = 0;
  @State focusShow: boolean = false;
  @State zoomRatio: number = 1;
  @State zoomText: string = '';
  @State echoLine: string = '';
  @State echoNumber: number = 0;
  @State displayNumber: number = 0;
  @State echoReady: boolean = false;

  private xcController: CameraPreviewController = new CameraPreviewController();
  private cameraService: CameraService = new CameraService();
  private pipelineStarted: boolean = false;
  private capBusy: boolean = false;
  private switching: boolean = false;
  private currentPhotoPath: string = '';
  private zoomMin: number = 1;
  private zoomMax: number = 1;
  private pinchStartRatio: number = 1;
  private focusTimer: number = -1;
  private zoomTimer: number = -1;
  private echoTimer: number = -1;
  private firstFrameTimer: number = -1;
  private previewAspect: number = 9 / 16;
  private previewWidthVp: number = 1;
  private previewHeightVp: number = 1;
  private requestedSurfaceWidthPx: number = 0;
  private requestedSurfaceHeightPx: number = 0;
  private pageActive: boolean = true;
  private cameraOperationId: number = 0;

  aboutToAppear(): void {
    this.pageActive = true;
    this.loadData();
  }

  aboutToDisappear(): void {
    this.pageActive = false;
    this.pipelineStarted = false;
    this.cameraOperationId++;
    this.xcController.setOperationId(this.cameraOperationId);
    console.info(`[TodayColor][CameraUI][op=${this.cameraOperationId}] page disappearing`);
    if (this.echoTimer >= 0) {
      clearInterval(this.echoTimer);
    }
    if (this.focusTimer >= 0) {
      clearTimeout(this.focusTimer);
    }
    if (this.zoomTimer >= 0) {
      clearTimeout(this.zoomTimer);
    }
    this.clearFirstFrameTimer();
    this.cameraPhase = CameraUiPhase.IDLE;
    this.camError = '';
    this.cameraService.stop(this.cameraOperationId);
    colorFilter.releaseRenderer();
  }

  onPageShow(): void {
    this.refreshStats();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  private async loadData(): Promise<void> {
    const context = getContext(this);
    await DailyColorManager.getInstance().init(context);
    await PhotoDao.getInstance().init(context);
    this.today = DailyColorManager.getInstance().getActiveColor();
    colorFilter.setColor(this.today.hue, this.today.threshold, this.today.saturationBoost);
    this.refreshStats();
    this.refreshEcho();
  }

  /** 时空回声：自然 + 自我，淡入呈现，数字滚动 */
  private async refreshEcho(): Promise<void> {
    const context = getContext(this);
    const result: EchoResult = await EchoService.build(context, this.today.name);
    this.echoNumber = result.number;
    this.echoReady = false;
    if (result.number > 0) {
      this.displayNumber = 0;
      this.echoLine = result.text.replace('{n}', `${this.displayNumber}`);
      animateTo({ duration: 900, curve: Curve.EaseInOut }, () => {
        this.echoReady = true;
      });
      let step = 0;
      const steps = 14;
      if (this.echoTimer >= 0) {
        clearInterval(this.echoTimer);
      }
      this.echoTimer = setInterval(() => {
        step++;
        const eased = Math.round(result.number * (step / steps) * (2 - step / steps));
        this.displayNumber = Math.max(1, eased);
        this.echoLine = result.text.replace('{n}', `${this.displayNumber}`);
        if (step >= steps) {
          if (this.echoTimer >= 0) {
            clearInterval(this.echoTimer);
            this.echoTimer = -1;
          }
        }
      }, 55);
    } else {
      this.echoLine = result.text;
      animateTo({ duration: 900, curve: Curve.EaseInOut }, () => {
        this.echoReady = true;
      });
    }
  }

  private async refreshStats(): Promise<void> {
    const dateKey = DailyColorManager.getDateKey(new Date());
    this.photoCount = await PhotoDao.getInstance().countByDate(dateKey);
    const latest = await PhotoDao.getInstance().queryLatestByDate(dateKey);
    this.latestThumb = latest !== null ? latest.localPath : '';
  }

  private phaseName(phase: CameraUiPhase): string {
    switch (phase) {
      case CameraUiPhase.IDLE:
        return 'idle';
      case CameraUiPhase.RENDERER_STARTING:
        return 'rendererStarting';
      case CameraUiPhase.CAMERA_OPENING:
        return 'cameraOpening';
      case CameraUiPhase.PREVIEWING:
        return 'previewing';
      case CameraUiPhase.SWITCHING:
        return 'switching';
      default:
        return 'error';
    }
  }

  private rendererStatusSummary(): string {
    try {
      const status = colorFilter.getRendererStatus();
      return `nativeOp=${status.operationId}, stage=${status.stage}, message=${status.message}, ` +
        `eglError=0x${status.eglError.toString(16)}, running=${status.running}, ready=${status.ready}`;
    } catch (err) {
      return `native status unavailable: ${(err as Error).message}`;
    }
  }

  private nextCameraOperation(reason: string): number {
    this.cameraOperationId++;
    this.xcController.setOperationId(this.cameraOperationId);
    console.info(`[TodayColor][CameraUI][op=${this.cameraOperationId}] operation begin reason=${reason}`);
    return this.cameraOperationId;
  }

  private isOperationActive(operationId: number): boolean {
    return this.pageActive && operationId === this.cameraOperationId;
  }

  private setCameraPhase(operationId: number, phase: CameraUiPhase, error: string = ''): void {
    if (!this.isOperationActive(operationId)) {
      console.info(`[TodayColor][CameraUI][op=${operationId}] stale phase ignored ` +
        `target=${this.phaseName(phase)}, activeOp=${this.cameraOperationId}`);
      return;
    }
    const previous = this.phaseName(this.cameraPhase);
    this.cameraPhase = phase;
    this.camError = phase === CameraUiPhase.ERROR ? error : '';
    console.info(`[TodayColor][CameraUI][op=${operationId}] phase ${previous} -> ` +
      `${this.phaseName(phase)}${error === '' ? '' : `, reason=${error}`}`);
  }

  private clearFirstFrameTimer(): void {
    if (this.firstFrameTimer >= 0) {
      clearTimeout(this.firstFrameTimer);
      this.firstFrameTimer = -1;
    }
  }

  private refreshCameraControls(): void {
    try {
      this.canSwitch = this.cameraService.canSwitch();
      const range = this.cameraService.zoomRange();
      this.zoomMin = range[0];
      this.zoomMax = range[1];
      this.zoomRatio = Math.min(this.zoomMax, Math.max(this.zoomMin, this.zoomRatio));
      console.info(`[TodayColor][CameraUI][op=${this.cameraOperationId}] controls ` +
        `canSwitch=${this.canSwitch}, zoom=${this.zoomMin}..${this.zoomMax}`);
    } catch (err) {
      this.canSwitch = false;
      this.zoomMin = 1;
      this.zoomMax = 1;
      this.zoomRatio = 1;
      console.error(`[TodayColor][CameraUI][op=${this.cameraOperationId}] optional controls fallback: ` +
        `${(err as Error).message}`);
    }
  }

  private isCameraLoading(): boolean {
    return this.cameraPhase === CameraUiPhase.RENDERER_STARTING
      || this.cameraPhase === CameraUiPhase.CAMERA_OPENING
      || this.cameraPhase === CameraUiPhase.SWITCHING;
  }

  private createCameraCallbacks(operationId: number): CameraStartCallbacks {
    return {
      onPreviewSize: (width: number, height: number) => {
        console.info(`[TodayColor][CameraUI][op=${operationId}] preview profile ${width}x${height}`);
      },
      onFirstFrame: () => {
        if (!this.isOperationActive(operationId)) {
          console.info(`[TodayColor][CameraUI][op=${operationId}] stale first frame ignored`);
          return;
        }
        this.clearFirstFrameTimer();
        this.setCameraPhase(operationId, CameraUiPhase.PREVIEWING);
        try {
          colorFilter.setMirror(this.cameraService.isFront() ? 1 : 0);
          this.refreshCameraControls();
        } catch (err) {
          console.error(`[TodayColor][CameraUI][op=${operationId}] first-frame optional setup isolated: ` +
            `${(err as Error).message}`);
        }
      },
      onRuntimeError: (message: string) => {
        if (!this.isOperationActive(operationId)) {
          return;
        }
        this.clearFirstFrameTimer();
        this.pipelineStarted = false;
        this.setCameraPhase(operationId, CameraUiPhase.ERROR, message);
        this.cameraService.stop(operationId);
      }
    };
  }

  private waitForFirstFrame(operationId: number): void {
    this.clearFirstFrameTimer();
    this.firstFrameTimer = setTimeout(() => {
      if (!this.isOperationActive(operationId) || this.cameraPhase === CameraUiPhase.PREVIEWING) {
        return;
      }
      console.error(`[TodayColor][CameraUI][op=${operationId}] first frame timeout; ` +
        this.rendererStatusSummary());
      this.pipelineStarted = false;
      this.setCameraPhase(operationId, CameraUiPhase.ERROR, '相机已启动但未收到预览画面，点击重试');
      this.cameraService.stop(operationId);
    }, 8000);
  }

  private startPipeline(): void {
    if (this.pipelineStarted) {
      console.info(`[TodayColor][CameraUI][op=${this.cameraOperationId}] duplicate start ignored`);
      return;
    }
    this.pipelineStarted = true;
    const operationId = this.nextCameraOperation('start-or-retry');
    this.setCameraPhase(operationId, CameraUiPhase.RENDERER_STARTING);
    this.startPipelineInternal(operationId).catch((err: Error) => {
      console.error(`[TodayColor][CameraUI][op=${operationId}] pipeline exception: ${err.message}; ` +
        this.rendererStatusSummary());
      if (!this.isOperationActive(operationId)) {
        return;
      }
      this.pipelineStarted = false;
      this.setCameraPhase(operationId, CameraUiPhase.ERROR, '相机初始化异常，点击重试');
    });
  }

  private async startPipelineInternal(operationId: number): Promise<void> {
    const context = getContext(this);
    await DailyColorManager.getInstance().init(context);
    await PhotoDao.getInstance().init(context);
    this.today = DailyColorManager.getInstance().getActiveColor();
    colorFilter.setColor(this.today.hue, this.today.threshold, this.today.saturationBoost);

    const granted = await CameraService.ensureCameraPermission(context, operationId);
    if (!granted) {
      this.pipelineStarted = false;
      this.setCameraPhase(operationId, CameraUiPhase.ERROR, '需要相机权限才能取景，请在设置中开启');
      return;
    }

    const rendererRequested = this.xcController.ensureRenderer(operationId);
    console.info(`[TodayColor][CameraUI][op=${operationId}] renderer request completed ` +
      `requested=${rendererRequested}; ${this.rendererStatusSummary()}`);
    let ready = false;
    let readinessChecks = 0;
    for (let i = 0; i < 20 && !ready; i++) {
      await this.sleep(200);
      if (!this.isOperationActive(operationId)) {
        return;
      }
      readinessChecks++;
      ready = colorFilter.isRendererReady();
    }
    console.info(`[TodayColor][CameraUI][op=${operationId}] renderer readiness completed ` +
      `checks=${readinessChecks}, ready=${ready}; ${this.rendererStatusSummary()}`);
    if (!ready) {
      console.error(`[TodayColor][CameraUI][op=${operationId}] renderer initialization failed; ` +
        this.rendererStatusSummary());
      this.pipelineStarted = false;
      this.setCameraPhase(operationId, CameraUiPhase.ERROR, '渲染管线初始化失败，点击重试');
      return;
    }

    if (!this.isOperationActive(operationId)) {
      return;
    }
    // 重试可能发生在旧会话已经出画面但 UI 状态失败的场景，先关闭旧会话再重新绑定。
    await this.cameraService.stop(operationId);
    if (!this.isOperationActive(operationId)) {
      return;
    }
    this.setCameraPhase(operationId, CameraUiPhase.CAMERA_OPENING);
    const camSurfaceId: string = colorFilter.getCameraSurfaceId();
    console.info(`[TodayColor][CameraUI][op=${operationId}] camera consumer surface ` +
      `valid=${camSurfaceId !== '' && camSurfaceId !== '0'}; ${this.rendererStatusSummary()}`);
    const err = await this.cameraService.start(context, camSurfaceId, this.previewAspect,
      operationId, this.createCameraCallbacks(operationId));
    if (!this.isOperationActive(operationId)) {
      return;
    }
    this.refreshCameraControls();
    if (err !== null) {
      this.pipelineStarted = false;
      this.setCameraPhase(operationId, CameraUiPhase.ERROR, `相机启动失败：${err}`);
      return;
    }
    if (this.cameraPhase !== CameraUiPhase.PREVIEWING) {
      this.waitForFirstFrame(operationId);
    }
  }

  /** 前后置摄像头切换 */
  private async doSwitchCamera(): Promise<void> {
    if (this.switching) {
      return;
    }
    if (!this.canSwitch) {
      const reason = this.cameraService.switchUnavailableReason();
      console.info(`[TodayColor][CameraUI][op=${this.cameraOperationId}] switch unavailable: ${reason}`);
      promptAction.showToast({ message: reason });
      return;
    }
    this.switching = true;
    const operationId = this.nextCameraOperation('switch-facing');
    this.setCameraPhase(operationId, CameraUiPhase.SWITCHING);
    const context = getContext(this);
    const result: CameraSwitchResult = await this.cameraService.switchTo(context, this.previewAspect,
      operationId, this.createCameraCallbacks(operationId));
    this.switching = false;
    if (!this.isOperationActive(operationId)) {
      return;
    }
    if (result.error !== null) {
      promptAction.showToast({ message: `切换失败：${result.error}` });
      if (!result.recovered) {
        this.pipelineStarted = false;
        this.setCameraPhase(operationId, CameraUiPhase.ERROR, `镜头切换失败：${result.error}`);
        return;
      }
    }
    this.zoomRatio = 1;
    this.refreshCameraControls();
    if (this.cameraPhase !== CameraUiPhase.PREVIEWING) {
      this.waitForFirstFrame(operationId);
    }
  }

  /** 点击对焦：归一化坐标下发相机 + 显示对焦环 */
  private handleTapFocus(e: ClickEvent): void {
    const x = Math.min(1, Math.max(0, e.x / this.previewWidthVp));
    const y = Math.min(1, Math.max(0, e.y / this.previewHeightVp));
    this.cameraService.tapFocus(x, y);
    this.focusX = e.x;
    this.focusY = e.y;
    this.focusShow = true;
    if (this.focusTimer >= 0) {
      clearTimeout(this.focusTimer);
    }
    this.focusTimer = setTimeout(() => {
      this.focusShow = false;
    }, 900);
  }

  private showZoomTip(): void {
    this.zoomText = `${this.zoomRatio.toFixed(1)}x`;
    if (this.zoomTimer >= 0) {
      clearTimeout(this.zoomTimer);
    }
    this.zoomTimer = setTimeout(() => {
      this.zoomText = '';
    }, 900);
  }

  private async doCapture(): Promise<void> {
    if (this.capBusy || this.showCapture) {
      return;
    }
    if (this.cameraPhase !== CameraUiPhase.PREVIEWING) {
      promptAction.showToast({ message: this.camError === '' ? '相机尚未就绪' : this.camError });
      return;
    }
    this.capBusy = true;
    const operationId = this.cameraOperationId;
    console.info(`[TodayColor][CameraUI][op=${operationId}] capture begin color=${this.today.name}`);
    try {
      const capturedColor = this.today;
      vibrator.startVibration({ type: 'time', duration: 40 }, { id: 0, usage: 'touch' });
      this.flashOpacity = 0.9;
      animateTo({ duration: 280, curve: Curve.EaseOut }, () => {
        this.flashOpacity = 0;
      });

      const frame = colorFilter.captureFrame();
      if (frame === null || frame.data.byteLength === 0) {
        console.error(`[TodayColor][CameraUI][op=${operationId}] capture frame unavailable`);
        promptAction.showToast({ message: '拍照失败，请稍后重试' });
        return;
      }
      console.info(`[TodayColor][CameraUI][op=${operationId}] capture frame ` +
        `${frame.width}x${frame.height}, bytes=${frame.data.byteLength}`);
      const options: image.InitializationOptions = {
        size: { width: frame.width, height: frame.height },
        srcPixelFormat: image.PixelMapFormat.BGRA_8888
      };
      const pm = await image.createPixelMap(frame.data, options);

      // 显示浮层（照片 + 水印），等待渲染后整体截图合成
      this.capturedPm = pm;
      this.showCapture = true;
      await this.sleep(380);
      const snap = await componentSnapshot.get('captureOverlay');
      const snapInfo = await snap.getImageInfo();
      console.info(`[TodayColor][CameraUI][op=${operationId}] watermark snapshot ` +
        `${snapInfo.size.width}x${snapInfo.size.height}`);

      const context = getContext(this);
      const localPath = await CaptureService.persistSnapshot(context, snap, capturedColor.name);
      if (localPath === null) {
        console.error(`[TodayColor][CameraUI][op=${operationId}] persist snapshot failed`);
        promptAction.showToast({ message: '保存失败' });
      } else {
        this.currentPhotoPath = localPath;
        await CaptureService.recordPhoto(localPath, '', snapInfo.size.width, snapInfo.size.height, capturedColor);
        // 图鉴收集：按当前取景色相匹配传统色，首次命中即点亮
        const unlockedColor = await CollectionService.onPhotoCaptured(context,
          capturedColor.hue, DailyColorManager.getDateKey(new Date()));
        if (unlockedColor !== null) {
          promptAction.showToast({ message: `点亮图鉴 · ${unlockedColor.name}`, duration: 2400 });
        }
        this.refreshStats();
        console.info(`[TodayColor][CameraUI][op=${operationId}] capture persisted and metadata recorded`);
        // 浮层常驻：由用户选择“存入相册”(SaveButton 安全控件) 或“完成”
      }
    } catch (err) {
      console.error(`[TodayColor][CameraUI][op=${operationId}] capture exception: ${JSON.stringify(err)}`);
      promptAction.showToast({ message: '拍照处理失败，请稍后重试' });
    } finally {
      this.capBusy = false;
    }
  }

  /** 通过 SaveButton 安全控件临时授权写入系统相册（合规免权限路径） */
  private async doSaveToAlbum(): Promise<void> {
    if (this.currentPhotoPath === '') {
      return;
    }
    const context = getContext(this);
    const uri = await CaptureService.saveToAlbum(context, this.currentPhotoPath);
    if (uri !== null) {
      promptAction.showToast({ message: '已保存到系统相册' });
    } else {
      promptAction.showToast({ message: '保存到相册失败' });
    }
  }

  private closeCapture(): void {
    this.showCapture = false;
    this.capturedPm = null;
    this.currentPhotoPath = '';
  }

  /** 调色盘：拖动实时预览（不持久化） */
  private applyLiveColor(p: ColorPreset): void {
    this.today = p;
    colorFilter.setColor(p.hue, p.threshold, p.saturationBoost);
  }

  /** 调色盘：应用并持久化自定义颜色 */
  private async applyPersistColor(p: ColorPreset): Promise<void> {
    this.applyLiveColor(p);
    const context = getContext(this);
    await DailyColorManager.getInstance().setCustomColor(context, p);
    promptAction.showToast({ message: '已应用自定义限定色' });
  }

  /** 恢复每日随机限定色 */
  private async restoreDailyColor(): Promise<void> {
    const context = getContext(this);
    await DailyColorManager.getInstance().clearCustomColor();
    this.applyLiveColor(DailyColorManager.getInstance().getColor());
    promptAction.showToast({ message: '已恢复今日限定色' });
  }

  build() {
    Stack() {
      // 系统相机式全屏预览；Shader 根据相机有效比例执行等比 cover。
      Column() {
        XComponent({ id: 'cameraPreview', type: 'surface', controller: this.xcController })
          .width('100%')
          .height('100%')
          .clip(true)
          .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
          .onClick((e: ClickEvent) => {
            this.handleTapFocus(e);
          })
          .gesture(
            PinchGesture({ fingers: 2 })
              .onActionStart(() => {
                this.pinchStartRatio = this.zoomRatio;
              })
              .onActionUpdate((event: GestureEvent) => {
                const next = Math.min(this.zoomMax, Math.max(this.zoomMin, this.pinchStartRatio * event.scale));
                if (Math.abs(next - this.zoomRatio) > 0.05) {
                  this.zoomRatio = next;
                  this.cameraService.setZoom(next);
                  this.showZoomTip();
                }
              })
          )
          .onAreaChange((_oldArea: Area, newArea: Area) => {
            // ArkUI 区域只负责请求沉浸式 SurfaceRect；真实像素尺寸统一由 onSurfaceChanged 下发 Native。
            const density = display.getDefaultDisplaySync().densityPixels;
            this.previewWidthVp = Number(newArea.width);
            this.previewHeightVp = Number(newArea.height);
            const wPx = Math.round(this.previewWidthVp * density);
            const hPx = Math.round(this.previewHeightVp * density);
            if (wPx > 0 && hPx > 0) {
              this.previewAspect = wPx / hPx;
              if (wPx !== this.requestedSurfaceWidthPx || hPx !== this.requestedSurfaceHeightPx) {
                this.requestedSurfaceWidthPx = wPx;
                this.requestedSurfaceHeightPx = hPx;
                console.info(`[TodayColor][CameraUI][op=${this.cameraOperationId}] component area ` +
                  `${this.previewWidthVp}x${this.previewHeightVp}vp density=${density.toFixed(3)}, ` +
                  `request surface=${wPx}x${hPx}px aspect=${this.previewAspect.toFixed(4)}`);
                this.xcController.setXComponentSurfaceRect({
                  surfaceWidth: wPx,
                  surfaceHeight: hPx,
                  offsetX: 0,
                  offsetY: 0
                });
              }
            }
          })
          .onLoad(() => {
            this.startPipeline();
          })
      }
      .width('100%')
      .height('100%')

      // 九宫格构图线
      if (this.gridOn) {
        Column() {
          Blank().layoutWeight(1)
          Divider().strokeWidth(0.8).color('rgba(255,255,255,0.35)')
          Blank().layoutWeight(1)
          Divider().strokeWidth(0.8).color('rgba(255,255,255,0.35)')
          Blank().layoutWeight(1)
        }
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.None)

        Row() {
          Blank().layoutWeight(1)
          Divider().vertical(true).strokeWidth(0.8).color('rgba(255,255,255,0.35)')
          Blank().layoutWeight(1)
          Divider().vertical(true).strokeWidth(0.8).color('rgba(255,255,255,0.35)')
          Blank().layoutWeight(1)
        }
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.None)
      }

      // 对焦环
      if (this.focusShow) {
        Column()
          .width(64)
          .height(64)
          .borderRadius(32)
          .border({ width: 2, color: 'rgba(255,215,0,0.95)' })
          .position({ x: this.focusX - 32, y: this.focusY - 32 })
          .animation({ duration: 180, curve: Curve.EaseOut })
          .hitTestBehavior(HitTestMode.None)
      }

      // 拍照白闪
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(Color.White)
        .opacity(this.flashOpacity)
        .hitTestBehavior(HitTestMode.None)

      // 顶部可读性渐变：保留实时取景，不形成独立黑色页头。
      Column()
        .width('100%')
        .height(176)
        .linearGradient({
          direction: GradientDirection.Bottom,
          colors: [
            ['rgba(0,0,0,0.58)', 0.0],
            ['rgba(0,0,0,0)', 1.0]
          ] as Array<[ResourceColor, number]>
        })
        .position({ x: 0, y: 0 })
        .hitTestBehavior(HitTestMode.None)

      // 取景浮层（错误提示 / 加载中）
      if (this.isCameraLoading() || this.cameraPhase === CameraUiPhase.ERROR) {
        Column({ space: 10 }) {
          if (this.isCameraLoading()) {
            LoadingProgress().width(36).height(36).color(Color.White)
            Text(this.cameraPhase === CameraUiPhase.SWITCHING ? '正在切换镜头…' : '正在唤醒相机…')
              .fontSize(13)
              .fontColor('rgba(255,255,255,0.85)')
          } else {
            Text(this.camError).fontSize(14).fontColor('rgba(255,255,255,0.9)').textAlign(TextAlign.Center)
            Text('点击重试').fontSize(13).fontColor('rgba(255,255,255,0.65)')
          }
        }
        .width('100%')
        .padding({ left: 40, right: 40 })
        .onClick(() => {
          if (this.cameraPhase === CameraUiPhase.ERROR) {
            this.startPipeline();
          }
        })
      }

      // 变焦提示
      if (this.zoomText !== '') {
        Text(this.zoomText)
          .fontSize(15)
          .fontColor(Color.White)
          .padding({ left: 14, right: 14, top: 6, bottom: 6 })
          .backgroundColor('rgba(0,0,0,0.35)')
          .borderRadius(16)
          .margin({ top: 132 })
          .hitTestBehavior(HitTestMode.None)
      }

      // 顶部色卡 HUD（点按打开调色盘）
      Column({ space: 7 }) {
        Row({ space: 7 }) {
          Circle({ width: 12, height: 12 })
            .fill(this.today.hex)
            .border({ width: 1.2, color: 'rgba(255,255,255,0.88)' })
          Text(this.today.name)
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor(Color.White)
          Text('›')
            .fontSize(15)
            .fontColor('rgba(255,255,255,0.62)')
        }
        .padding({ left: 14, right: 11, top: 8, bottom: 8 })
        .backgroundColor('rgba(20,20,20,0.58)')
        .border({ width: 0.8, color: 'rgba(255,255,255,0.14)' })
        .borderRadius(20)
        .onClick(() => {
          this.paletteOpen = true;
        })

        Text(this.echoLine)
          .fontSize(12)
          .fontColor('rgba(255,255,255,0.72)')
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .textAlign(TextAlign.Center)
          .opacity(this.echoReady ? 1 : 0)
          .translate({ y: this.echoReady ? 0 : 4 })
          .shadow({ radius: 5, color: 'rgba(0,0,0,0.55)' })
      }
      .width('100%')
      .padding({ top: 58, left: 64, right: 64 })
      .alignItems(HorizontalAlign.Center)
      .position({ x: 0, y: 0 })

      // 右上角：构图线开关
      Stack() {
        Stack() {
          Line().startPoint([8, 2]).endPoint([8, 22])
            .stroke('rgba(255,255,255,0.92)').strokeWidth(1.4)
          Line().startPoint([16, 2]).endPoint([16, 22])
            .stroke('rgba(255,255,255,0.92)').strokeWidth(1.4)
          Line().startPoint([2, 8]).endPoint([22, 8])
            .stroke('rgba(255,255,255,0.92)').strokeWidth(1.4)
          Line().startPoint([2, 16]).endPoint([22, 16])
            .stroke('rgba(255,255,255,0.92)').strokeWidth(1.4)
        }
        .width(24)
        .height(24)
      }
      .width(42)
      .height(42)
      .backgroundColor('rgba(20,20,20,0.58)')
      .border({ width: 0.8, color: 'rgba(255,255,255,0.14)' })
      .borderRadius(21)
      .opacity(this.gridOn ? 1 : 0.68)
      .position({ x: '100%', y: 64 })
      .translate({ x: '-138%' })
      .onClick(() => {
        this.gridOn = !this.gridOn;
      })

      // 预览到黑色控制区的柔和过渡，不参与 Surface 尺寸计算和触摸命中。
      Column()
        .width('100%')
        .height(32)
        .linearGradient({
          direction: GradientDirection.Bottom,
          colors: [
            ['rgba(0,0,0,0)', 0.0],
            [Color.Black, 1.0]
          ] as Array<[ResourceColor, number]>
        })
        .position({ x: 0, y: '100%' })
        .translate({ y: -172 })
        .hitTestBehavior(HitTestMode.None)

      // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
      Row({ space: 12 }) {
        // 左：缩略图 + 今日计数角标
        Stack({ alignContent: Alignment.TopEnd }) {
          if (this.latestThumb !== '') {
            Image(`file://${this.latestThumb}`)
              .width(52)
              .height(52)
              .borderRadius(12)
              .objectFit(ImageFit.Cover)
              .border({ width: 1.2, color: 'rgba(255,255,255,0.58)' })
              .onClick(() => {
                router.pushUrl({ url: 'pages/Gallery' });
              })
          } else {
            Column()
              .width(52)
              .height(52)
              .borderRadius(12)
              .backgroundColor('rgba(255,255,255,0.08)')
              .border({ width: 1.2, color: 'rgba(255,255,255,0.42)' })
              .onClick(() => {
                router.pushUrl({ url: 'pages/Gallery' });
              })
          }
          Text(`${this.photoCount}`)
            .fontSize(11)
            .fontColor(Color.White)
            .padding({ left: 6, right: 6, top: 1, bottom: 1 })
            .backgroundColor(this.today.hex)
            .borderRadius(9)
            .border({ width: 1, color: Color.Black })
            .translate({ x: 5, y: -5 })
        }
        .width(60)
        .height(60)

        Blank()

        // 中：快门
        Stack() {
          Circle({ width: 78, height: 78 })
            .fill('rgba(0,0,0,0)')
            .stroke(Color.White)
            .strokeWidth(2.5)
          Circle({ width: 64, height: 64 })
            .fill(Color.White)
        }
          .width(78)
          .height(78)
          .scale({ x: this.capBusy ? 0.92 : 1, y: this.capBusy ? 0.92 : 1 })
          .animation({ duration: 120, curve: Curve.EaseOut })
          .onClick(() => {
            this.doCapture();
          })

        Blank()

        // 右：前后置摄像头切换
        Column() {
          Text('⟳')
            .fontSize(21)
            .fontColor(Color.White)
            .width(52)
            .height(52)
            .textAlign(TextAlign.Center)
            .backgroundColor('rgba(255,255,255,0.08)')
            .borderRadius(26)
            .border({ width: 1.2, color: 'rgba(255,255,255,0.42)' })
        }
        .width(60)
        .height(60)
        .justifyContent(FlexAlign.Center)
        .opacity(this.canSwitch ? 1 : 0.35)
        .onClick(() => {
          this.doSwitchCamera();
        })
      }
      .width('100%')
      .height(140)
      .padding({ left: 24, right: 24, top: 12, bottom: 22 })
      .backgroundColor(Color.Black)
      .position({ x: 0, y: '100%' })
      .translate({ y: '-100%' })

      // 调色盘底部面板
      if (this.paletteOpen) {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('rgba(0,0,0,0.45)')
          .onClick(() => {
            this.paletteOpen = false;
          })
        Column() {
          ColorPaletteSheet({
            activeColor: this.today,
            isCustom: DailyColorManager.getInstance().isCustomActive(),
            onLive: (p: ColorPreset) => {
              this.applyLiveColor(p);
            },
            onApply: (p: ColorPreset) => {
              this.applyPersistColor(p);
            },
            onRestoreDaily: () => {
              this.restoreDailyColor();
            },
            onOpenCollection: () => {
              this.paletteOpen = false;
              router.pushUrl({ url: 'pages/Collection' });
            },
            onClose: () => {
              this.paletteOpen = false;
            }
          })
        }
        .width('100%')
        .position({ x: 0, y: '100%' })
        .translate({ y: '-100%' })
      }

      // 拍照浮层（截图合成根节点 = captureOverlay，与全屏预览采用同一几何）
      if (this.showCapture && this.capturedPm !== null) {
        Stack() {
          Column() {
            Stack({ alignContent: Alignment.BottomStart }) {
              Image(this.capturedPm)
                .width('100%')
                .height('100%')
                .objectFit(ImageFit.Cover)

              Column({ space: 3 }) {
                Text(`${this.today.name} · ${this.today.hex}`)
                  .fontSize(15)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(Color.White)
                  .shadow({ radius: 8, color: 'rgba(0,0,0,0.6)' })
                Text(`今日限定色 · ${this.formatNow()}`)
                  .fontSize(11)
                  .fontColor('rgba(255,255,255,0.9)')
                  .shadow({ radius: 8, color: 'rgba(0,0,0,0.6)' })
              }
              .padding({ left: 18, bottom: 16 })
            }
            .id('captureOverlay')
            .width('100%')
            .height('100%')
            .clip(true)
          }
          .width('100%')
          .height('100%')

          // 浮层控件（不进入截图）
          Row({ space: 14 }) {
            SaveButton({ text: SaveDescription.SAVE_IMAGE, buttonType: ButtonType.Capsule })
              .onClick((event: ClickEvent, result: SaveButtonOnClickResult) => {
                if (result === SaveButtonOnClickResult.SUCCESS) {
                  this.doSaveToAlbum();
                } else {
                  promptAction.showToast({ message: '未授权保存到相册' });
                }
              })
            Blank()
            Text('完成')
              .fontSize(15)
              .fontColor(Color.White)
              .height(40)
              .padding({ left: 20, right: 20 })
              .textAlign(TextAlign.Center)
              .backgroundColor('rgba(0,0,0,0.35)')
              .borderRadius(20)
              .onClick(() => {
                this.closeCapture();
              })
          }
          .width('100%')
          .padding({ left: 22, right: 22, bottom: 54 })
          .position({ x: 0, y: '100%' })
          .translate({ y: '-100%' })
        }
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Black)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }

  private formatNow(): string {
    const d = new Date();
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
