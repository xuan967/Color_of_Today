if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface Index_Params {
    today?: ColorPreset;
    photoCount?: number;
    latestThumb?: string;
    flashOpacity?: number;
    capturedPm?: image.PixelMap | null;
    showCapture?: boolean;
    camError?: string;
    cameraPhase?: CameraUiPhase;
    canSwitch?: boolean;
    gridOn?: boolean;
    paletteOpen?: boolean;
    focusX?: number;
    focusY?: number;
    focusShow?: boolean;
    zoomRatio?: number;
    zoomText?: string;
    echoLine?: string;
    echoNumber?: number;
    displayNumber?: number;
    echoReady?: boolean;
    xcController?: CameraPreviewController;
    cameraService?: CameraService;
    pipelineStarted?: boolean;
    capBusy?: boolean;
    switching?: boolean;
    currentPhotoPath?: string;
    zoomMin?: number;
    zoomMax?: number;
    pinchStartRatio?: number;
    focusTimer?: number;
    zoomTimer?: number;
    echoTimer?: number;
    firstFrameTimer?: number;
    previewAspect?: number;
    previewWidthVp?: number;
    previewHeightVp?: number;
    requestedSurfaceWidthPx?: number;
    requestedSurfaceHeightPx?: number;
    pageActive?: boolean;
    cameraOperationId?: number;
}
import display from "@ohos:display";
import image from "@ohos:multimedia.image";
import componentSnapshot from "@ohos:arkui.componentSnapshot";
import promptAction from "@ohos:promptAction";
import router from "@ohos:router";
import vibrator from "@ohos:vibrator";
import colorFilter from "@normalized:Y&&&libentry.so&";
import { COLOR_PRESETS } from "@normalized:N&&&entry/src/main/ets/model/ColorPreset&";
import type { ColorPreset } from "@normalized:N&&&entry/src/main/ets/model/ColorPreset&";
import { DailyColorManager } from "@normalized:N&&&entry/src/main/ets/manager/DailyColorManager&";
import { PhotoDao } from "@normalized:N&&&entry/src/main/ets/model/PhotoDao&";
import { CameraService } from "@normalized:N&&&entry/src/main/ets/service/CameraService&";
import type { CameraStartCallbacks, CameraSwitchResult } from "@normalized:N&&&entry/src/main/ets/service/CameraService&";
import { CaptureService } from "@normalized:N&&&entry/src/main/ets/service/CaptureService&";
import { CollectionService } from "@normalized:N&&&entry/src/main/ets/service/CollectionService&";
import { EchoService } from "@normalized:N&&&entry/src/main/ets/service/EchoService&";
import type { EchoResult } from "@normalized:N&&&entry/src/main/ets/service/EchoService&";
import { ColorPaletteSheet } from "@normalized:N&&&entry/src/main/ets/components/ColorPalette&";
/** API 12 官方 Surface 生命周期入口；SurfaceId 以 bigint 无损传入 Native。 */
enum CameraUiPhase {
    IDLE = 0,
    RENDERER_STARTING = 1,
    CAMERA_OPENING = 2,
    PREVIEWING = 3,
    SWITCHING = 4,
    ERROR = 5
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
        }
        else {
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
class Index extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__today = new ObservedPropertyObjectPU(COLOR_PRESETS[0], this, "today");
        this.__photoCount = new ObservedPropertySimplePU(0, this, "photoCount");
        this.__latestThumb = new ObservedPropertySimplePU('', this, "latestThumb");
        this.__flashOpacity = new ObservedPropertySimplePU(0, this, "flashOpacity");
        this.__capturedPm = new ObservedPropertyObjectPU(null, this, "capturedPm");
        this.__showCapture = new ObservedPropertySimplePU(false, this, "showCapture");
        this.__camError = new ObservedPropertySimplePU('', this, "camError");
        this.__cameraPhase = new ObservedPropertySimplePU(CameraUiPhase.IDLE, this, "cameraPhase");
        this.__canSwitch = new ObservedPropertySimplePU(false, this, "canSwitch");
        this.__gridOn = new ObservedPropertySimplePU(false, this, "gridOn");
        this.__paletteOpen = new ObservedPropertySimplePU(false, this, "paletteOpen");
        this.__focusX = new ObservedPropertySimplePU(0, this, "focusX");
        this.__focusY = new ObservedPropertySimplePU(0, this, "focusY");
        this.__focusShow = new ObservedPropertySimplePU(false, this, "focusShow");
        this.__zoomRatio = new ObservedPropertySimplePU(1, this, "zoomRatio");
        this.__zoomText = new ObservedPropertySimplePU('', this, "zoomText");
        this.__echoLine = new ObservedPropertySimplePU('', this, "echoLine");
        this.__echoNumber = new ObservedPropertySimplePU(0, this, "echoNumber");
        this.__displayNumber = new ObservedPropertySimplePU(0, this, "displayNumber");
        this.__echoReady = new ObservedPropertySimplePU(false, this, "echoReady");
        this.xcController = new CameraPreviewController();
        this.cameraService = new CameraService();
        this.pipelineStarted = false;
        this.capBusy = false;
        this.switching = false;
        this.currentPhotoPath = '';
        this.zoomMin = 1;
        this.zoomMax = 1;
        this.pinchStartRatio = 1;
        this.focusTimer = -1;
        this.zoomTimer = -1;
        this.echoTimer = -1;
        this.firstFrameTimer = -1;
        this.previewAspect = 9 / 16;
        this.previewWidthVp = 1;
        this.previewHeightVp = 1;
        this.requestedSurfaceWidthPx = 0;
        this.requestedSurfaceHeightPx = 0;
        this.pageActive = true;
        this.cameraOperationId = 0;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: Index_Params) {
        if (params.today !== undefined) {
            this.today = params.today;
        }
        if (params.photoCount !== undefined) {
            this.photoCount = params.photoCount;
        }
        if (params.latestThumb !== undefined) {
            this.latestThumb = params.latestThumb;
        }
        if (params.flashOpacity !== undefined) {
            this.flashOpacity = params.flashOpacity;
        }
        if (params.capturedPm !== undefined) {
            this.capturedPm = params.capturedPm;
        }
        if (params.showCapture !== undefined) {
            this.showCapture = params.showCapture;
        }
        if (params.camError !== undefined) {
            this.camError = params.camError;
        }
        if (params.cameraPhase !== undefined) {
            this.cameraPhase = params.cameraPhase;
        }
        if (params.canSwitch !== undefined) {
            this.canSwitch = params.canSwitch;
        }
        if (params.gridOn !== undefined) {
            this.gridOn = params.gridOn;
        }
        if (params.paletteOpen !== undefined) {
            this.paletteOpen = params.paletteOpen;
        }
        if (params.focusX !== undefined) {
            this.focusX = params.focusX;
        }
        if (params.focusY !== undefined) {
            this.focusY = params.focusY;
        }
        if (params.focusShow !== undefined) {
            this.focusShow = params.focusShow;
        }
        if (params.zoomRatio !== undefined) {
            this.zoomRatio = params.zoomRatio;
        }
        if (params.zoomText !== undefined) {
            this.zoomText = params.zoomText;
        }
        if (params.echoLine !== undefined) {
            this.echoLine = params.echoLine;
        }
        if (params.echoNumber !== undefined) {
            this.echoNumber = params.echoNumber;
        }
        if (params.displayNumber !== undefined) {
            this.displayNumber = params.displayNumber;
        }
        if (params.echoReady !== undefined) {
            this.echoReady = params.echoReady;
        }
        if (params.xcController !== undefined) {
            this.xcController = params.xcController;
        }
        if (params.cameraService !== undefined) {
            this.cameraService = params.cameraService;
        }
        if (params.pipelineStarted !== undefined) {
            this.pipelineStarted = params.pipelineStarted;
        }
        if (params.capBusy !== undefined) {
            this.capBusy = params.capBusy;
        }
        if (params.switching !== undefined) {
            this.switching = params.switching;
        }
        if (params.currentPhotoPath !== undefined) {
            this.currentPhotoPath = params.currentPhotoPath;
        }
        if (params.zoomMin !== undefined) {
            this.zoomMin = params.zoomMin;
        }
        if (params.zoomMax !== undefined) {
            this.zoomMax = params.zoomMax;
        }
        if (params.pinchStartRatio !== undefined) {
            this.pinchStartRatio = params.pinchStartRatio;
        }
        if (params.focusTimer !== undefined) {
            this.focusTimer = params.focusTimer;
        }
        if (params.zoomTimer !== undefined) {
            this.zoomTimer = params.zoomTimer;
        }
        if (params.echoTimer !== undefined) {
            this.echoTimer = params.echoTimer;
        }
        if (params.firstFrameTimer !== undefined) {
            this.firstFrameTimer = params.firstFrameTimer;
        }
        if (params.previewAspect !== undefined) {
            this.previewAspect = params.previewAspect;
        }
        if (params.previewWidthVp !== undefined) {
            this.previewWidthVp = params.previewWidthVp;
        }
        if (params.previewHeightVp !== undefined) {
            this.previewHeightVp = params.previewHeightVp;
        }
        if (params.requestedSurfaceWidthPx !== undefined) {
            this.requestedSurfaceWidthPx = params.requestedSurfaceWidthPx;
        }
        if (params.requestedSurfaceHeightPx !== undefined) {
            this.requestedSurfaceHeightPx = params.requestedSurfaceHeightPx;
        }
        if (params.pageActive !== undefined) {
            this.pageActive = params.pageActive;
        }
        if (params.cameraOperationId !== undefined) {
            this.cameraOperationId = params.cameraOperationId;
        }
    }
    updateStateVars(params: Index_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__today.purgeDependencyOnElmtId(rmElmtId);
        this.__photoCount.purgeDependencyOnElmtId(rmElmtId);
        this.__latestThumb.purgeDependencyOnElmtId(rmElmtId);
        this.__flashOpacity.purgeDependencyOnElmtId(rmElmtId);
        this.__capturedPm.purgeDependencyOnElmtId(rmElmtId);
        this.__showCapture.purgeDependencyOnElmtId(rmElmtId);
        this.__camError.purgeDependencyOnElmtId(rmElmtId);
        this.__cameraPhase.purgeDependencyOnElmtId(rmElmtId);
        this.__canSwitch.purgeDependencyOnElmtId(rmElmtId);
        this.__gridOn.purgeDependencyOnElmtId(rmElmtId);
        this.__paletteOpen.purgeDependencyOnElmtId(rmElmtId);
        this.__focusX.purgeDependencyOnElmtId(rmElmtId);
        this.__focusY.purgeDependencyOnElmtId(rmElmtId);
        this.__focusShow.purgeDependencyOnElmtId(rmElmtId);
        this.__zoomRatio.purgeDependencyOnElmtId(rmElmtId);
        this.__zoomText.purgeDependencyOnElmtId(rmElmtId);
        this.__echoLine.purgeDependencyOnElmtId(rmElmtId);
        this.__echoNumber.purgeDependencyOnElmtId(rmElmtId);
        this.__displayNumber.purgeDependencyOnElmtId(rmElmtId);
        this.__echoReady.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__today.aboutToBeDeleted();
        this.__photoCount.aboutToBeDeleted();
        this.__latestThumb.aboutToBeDeleted();
        this.__flashOpacity.aboutToBeDeleted();
        this.__capturedPm.aboutToBeDeleted();
        this.__showCapture.aboutToBeDeleted();
        this.__camError.aboutToBeDeleted();
        this.__cameraPhase.aboutToBeDeleted();
        this.__canSwitch.aboutToBeDeleted();
        this.__gridOn.aboutToBeDeleted();
        this.__paletteOpen.aboutToBeDeleted();
        this.__focusX.aboutToBeDeleted();
        this.__focusY.aboutToBeDeleted();
        this.__focusShow.aboutToBeDeleted();
        this.__zoomRatio.aboutToBeDeleted();
        this.__zoomText.aboutToBeDeleted();
        this.__echoLine.aboutToBeDeleted();
        this.__echoNumber.aboutToBeDeleted();
        this.__displayNumber.aboutToBeDeleted();
        this.__echoReady.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __today: ObservedPropertyObjectPU<ColorPreset>;
    get today() {
        return this.__today.get();
    }
    set today(newValue: ColorPreset) {
        this.__today.set(newValue);
    }
    private __photoCount: ObservedPropertySimplePU<number>;
    get photoCount() {
        return this.__photoCount.get();
    }
    set photoCount(newValue: number) {
        this.__photoCount.set(newValue);
    }
    private __latestThumb: ObservedPropertySimplePU<string>;
    get latestThumb() {
        return this.__latestThumb.get();
    }
    set latestThumb(newValue: string) {
        this.__latestThumb.set(newValue);
    }
    private __flashOpacity: ObservedPropertySimplePU<number>;
    get flashOpacity() {
        return this.__flashOpacity.get();
    }
    set flashOpacity(newValue: number) {
        this.__flashOpacity.set(newValue);
    }
    private __capturedPm: ObservedPropertyObjectPU<image.PixelMap | null>;
    get capturedPm() {
        return this.__capturedPm.get();
    }
    set capturedPm(newValue: image.PixelMap | null) {
        this.__capturedPm.set(newValue);
    }
    private __showCapture: ObservedPropertySimplePU<boolean>;
    get showCapture() {
        return this.__showCapture.get();
    }
    set showCapture(newValue: boolean) {
        this.__showCapture.set(newValue);
    }
    private __camError: ObservedPropertySimplePU<string>;
    get camError() {
        return this.__camError.get();
    }
    set camError(newValue: string) {
        this.__camError.set(newValue);
    }
    private __cameraPhase: ObservedPropertySimplePU<CameraUiPhase>;
    get cameraPhase() {
        return this.__cameraPhase.get();
    }
    set cameraPhase(newValue: CameraUiPhase) {
        this.__cameraPhase.set(newValue);
    }
    private __canSwitch: ObservedPropertySimplePU<boolean>;
    get canSwitch() {
        return this.__canSwitch.get();
    }
    set canSwitch(newValue: boolean) {
        this.__canSwitch.set(newValue);
    }
    private __gridOn: ObservedPropertySimplePU<boolean>;
    get gridOn() {
        return this.__gridOn.get();
    }
    set gridOn(newValue: boolean) {
        this.__gridOn.set(newValue);
    }
    private __paletteOpen: ObservedPropertySimplePU<boolean>;
    get paletteOpen() {
        return this.__paletteOpen.get();
    }
    set paletteOpen(newValue: boolean) {
        this.__paletteOpen.set(newValue);
    }
    private __focusX: ObservedPropertySimplePU<number>;
    get focusX() {
        return this.__focusX.get();
    }
    set focusX(newValue: number) {
        this.__focusX.set(newValue);
    }
    private __focusY: ObservedPropertySimplePU<number>;
    get focusY() {
        return this.__focusY.get();
    }
    set focusY(newValue: number) {
        this.__focusY.set(newValue);
    }
    private __focusShow: ObservedPropertySimplePU<boolean>;
    get focusShow() {
        return this.__focusShow.get();
    }
    set focusShow(newValue: boolean) {
        this.__focusShow.set(newValue);
    }
    private __zoomRatio: ObservedPropertySimplePU<number>;
    get zoomRatio() {
        return this.__zoomRatio.get();
    }
    set zoomRatio(newValue: number) {
        this.__zoomRatio.set(newValue);
    }
    private __zoomText: ObservedPropertySimplePU<string>;
    get zoomText() {
        return this.__zoomText.get();
    }
    set zoomText(newValue: string) {
        this.__zoomText.set(newValue);
    }
    private __echoLine: ObservedPropertySimplePU<string>;
    get echoLine() {
        return this.__echoLine.get();
    }
    set echoLine(newValue: string) {
        this.__echoLine.set(newValue);
    }
    private __echoNumber: ObservedPropertySimplePU<number>;
    get echoNumber() {
        return this.__echoNumber.get();
    }
    set echoNumber(newValue: number) {
        this.__echoNumber.set(newValue);
    }
    private __displayNumber: ObservedPropertySimplePU<number>;
    get displayNumber() {
        return this.__displayNumber.get();
    }
    set displayNumber(newValue: number) {
        this.__displayNumber.set(newValue);
    }
    private __echoReady: ObservedPropertySimplePU<boolean>;
    get echoReady() {
        return this.__echoReady.get();
    }
    set echoReady(newValue: boolean) {
        this.__echoReady.set(newValue);
    }
    private xcController: CameraPreviewController;
    private cameraService: CameraService;
    private pipelineStarted: boolean;
    private capBusy: boolean;
    private switching: boolean;
    private currentPhotoPath: string;
    private zoomMin: number;
    private zoomMax: number;
    private pinchStartRatio: number;
    private focusTimer: number;
    private zoomTimer: number;
    private echoTimer: number;
    private firstFrameTimer: number;
    private previewAspect: number;
    private previewWidthVp: number;
    private previewHeightVp: number;
    private requestedSurfaceWidthPx: number;
    private requestedSurfaceHeightPx: number;
    private pageActive: boolean;
    private cameraOperationId: number;
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
            Context.animateTo({ duration: 900, curve: Curve.EaseInOut }, () => {
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
        }
        else {
            this.echoLine = result.text;
            Context.animateTo({ duration: 900, curve: Curve.EaseInOut }, () => {
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
        }
        catch (err) {
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
                }
                catch (err) {
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
            console.error(`[TodayColor][CameraUI][op=${operationId}] first frame timeout`);
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
            console.error(`[TodayColor][CameraUI][op=${operationId}] pipeline exception: ${err.message}`);
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
        this.xcController.ensureRenderer(operationId);
        let ready = false;
        for (let i = 0; i < 20 && !ready; i++) {
            await this.sleep(200);
            if (!this.isOperationActive(operationId)) {
                return;
            }
            ready = colorFilter.isRendererReady();
        }
        if (!ready) {
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
        const err = await this.cameraService.start(context, camSurfaceId, this.previewAspect, operationId, this.createCameraCallbacks(operationId));
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
        const result: CameraSwitchResult = await this.cameraService.switchTo(context, this.previewAspect, operationId, this.createCameraCallbacks(operationId));
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
            Context.animateTo({ duration: 280, curve: Curve.EaseOut }, () => {
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
            }
            else {
                this.currentPhotoPath = localPath;
                await CaptureService.recordPhoto(localPath, '', snapInfo.size.width, snapInfo.size.height, capturedColor);
                // 图鉴收集：按当前取景色相匹配传统色，首次命中即点亮
                const unlockedColor = await CollectionService.onPhotoCaptured(context, capturedColor.hue, DailyColorManager.getDateKey(new Date()));
                if (unlockedColor !== null) {
                    promptAction.showToast({ message: `点亮图鉴 · ${unlockedColor.name}`, duration: 2400 });
                }
                this.refreshStats();
                console.info(`[TodayColor][CameraUI][op=${operationId}] capture persisted and metadata recorded`);
                // 浮层常驻：由用户选择“存入相册”(SaveButton 安全控件) 或“完成”
            }
        }
        catch (err) {
            console.error(`[TodayColor][CameraUI][op=${operationId}] capture exception: ${JSON.stringify(err)}`);
            promptAction.showToast({ message: '拍照处理失败，请稍后重试' });
        }
        finally {
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
        }
        else {
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
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
            Stack.backgroundColor(Color.Black);
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 系统相机式全屏预览；Shader 根据相机有效比例执行等比 cover。
            Column.create();
            // 系统相机式全屏预览；Shader 根据相机有效比例执行等比 cover。
            Column.width('100%');
            // 系统相机式全屏预览；Shader 根据相机有效比例执行等比 cover。
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            XComponent.create({ id: 'cameraPreview', type: 'surface', controller: this.xcController }, "com.coloroftoday.app/entry");
            XComponent.width('100%');
            XComponent.height('100%');
            XComponent.clip(true);
            XComponent.expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]);
            XComponent.onClick((e: ClickEvent) => {
                this.handleTapFocus(e);
            });
            Gesture.create(GesturePriority.Low);
            PinchGesture.create({ fingers: 2 });
            PinchGesture.onActionStart(() => {
                this.pinchStartRatio = this.zoomRatio;
            });
            PinchGesture.onActionUpdate((event: GestureEvent) => {
                const next = Math.min(this.zoomMax, Math.max(this.zoomMin, this.pinchStartRatio * event.scale));
                if (Math.abs(next - this.zoomRatio) > 0.05) {
                    this.zoomRatio = next;
                    this.cameraService.setZoom(next);
                    this.showZoomTip();
                }
            });
            PinchGesture.pop();
            Gesture.pop();
            XComponent.onAreaChange((_oldArea: Area, newArea: Area) => {
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
            });
            XComponent.onLoad(() => {
                this.startPipeline();
            });
        }, XComponent);
        // 系统相机式全屏预览；Shader 根据相机有效比例执行等比 cover。
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 九宫格构图线
            if (this.gridOn) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.height('100%');
                        Column.hitTestBehavior(HitTestMode.None);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                        Blank.layoutWeight(1);
                    }, Blank);
                    Blank.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.strokeWidth(0.8);
                        Divider.color('rgba(255,255,255,0.35)');
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                        Blank.layoutWeight(1);
                    }, Blank);
                    Blank.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.strokeWidth(0.8);
                        Divider.color('rgba(255,255,255,0.35)');
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                        Blank.layoutWeight(1);
                    }, Blank);
                    Blank.pop();
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.height('100%');
                        Row.hitTestBehavior(HitTestMode.None);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                        Blank.layoutWeight(1);
                    }, Blank);
                    Blank.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.vertical(true);
                        Divider.strokeWidth(0.8);
                        Divider.color('rgba(255,255,255,0.35)');
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                        Blank.layoutWeight(1);
                    }, Blank);
                    Blank.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.vertical(true);
                        Divider.strokeWidth(0.8);
                        Divider.color('rgba(255,255,255,0.35)');
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                        Blank.layoutWeight(1);
                    }, Blank);
                    Blank.pop();
                    Row.pop();
                });
            }
            // 对焦环
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 对焦环
            if (this.focusShow) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Context.animation({ duration: 180, curve: Curve.EaseOut });
                        Column.width(64);
                        Column.height(64);
                        Column.borderRadius(32);
                        Column.border({ width: 2, color: 'rgba(255,215,0,0.95)' });
                        Column.position({ x: this.focusX - 32, y: this.focusY - 32 });
                        Context.animation(null);
                        Column.hitTestBehavior(HitTestMode.None);
                    }, Column);
                    Column.pop();
                });
            }
            // 拍照白闪
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 拍照白闪
            Column.create();
            // 拍照白闪
            Column.width('100%');
            // 拍照白闪
            Column.height('100%');
            // 拍照白闪
            Column.backgroundColor(Color.White);
            // 拍照白闪
            Column.opacity(this.flashOpacity);
            // 拍照白闪
            Column.hitTestBehavior(HitTestMode.None);
        }, Column);
        // 拍照白闪
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 取景浮层（错误提示 / 加载中）
            if (this.isCameraLoading() || this.cameraPhase === CameraUiPhase.ERROR) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 10 });
                        Column.width('100%');
                        Column.padding({ left: 40, right: 40 });
                        Column.onClick(() => {
                            if (this.cameraPhase === CameraUiPhase.ERROR) {
                                this.startPipeline();
                            }
                        });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.isCameraLoading()) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    LoadingProgress.create();
                                    LoadingProgress.width(36);
                                    LoadingProgress.height(36);
                                    LoadingProgress.color(Color.White);
                                }, LoadingProgress);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(this.cameraPhase === CameraUiPhase.SWITCHING ? '正在切换镜头…' : '正在唤醒相机…');
                                    Text.fontSize(13);
                                    Text.fontColor('rgba(255,255,255,0.85)');
                                }, Text);
                                Text.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(this.camError);
                                    Text.fontSize(14);
                                    Text.fontColor('rgba(255,255,255,0.9)');
                                    Text.textAlign(TextAlign.Center);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('点击重试');
                                    Text.fontSize(13);
                                    Text.fontColor('rgba(255,255,255,0.65)');
                                }, Text);
                                Text.pop();
                            });
                        }
                    }, If);
                    If.pop();
                    Column.pop();
                });
            }
            // 变焦提示
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 变焦提示
            if (this.zoomText !== '') {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.zoomText);
                        Text.fontSize(15);
                        Text.fontColor(Color.White);
                        Text.padding({ left: 14, right: 14, top: 6, bottom: 6 });
                        Text.backgroundColor('rgba(0,0,0,0.35)');
                        Text.borderRadius(16);
                        Text.margin({ top: 132 });
                        Text.hitTestBehavior(HitTestMode.None);
                    }, Text);
                    Text.pop();
                });
            }
            // 顶部色卡 HUD（点按打开调色盘）
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 顶部色卡 HUD（点按打开调色盘）
            Column.create({ space: 8 });
            // 顶部色卡 HUD（点按打开调色盘）
            Column.width('100%');
            // 顶部色卡 HUD（点按打开调色盘）
            Column.padding({ top: 64, left: 24, right: 24 });
            // 顶部色卡 HUD（点按打开调色盘）
            Column.position({ x: 0, y: 0 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.padding({ left: 16, right: 12, top: 9, bottom: 9 });
            Row.backgroundColor('rgba(0,0,0,0.28)');
            Row.borderRadius(22);
            Row.onClick(() => {
                this.paletteOpen = true;
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Circle.create({ width: 13, height: 13 });
            Circle.fill(this.today.hex);
            Circle.border({ width: 1.5, color: 'rgba(255,255,255,0.9)' });
        }, Circle);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.today.name);
            Text.fontSize(18);
            Text.fontWeight(FontWeight.Medium);
            Text.fontColor(Color.White);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('›');
            Text.fontSize(16);
            Text.fontColor('rgba(255,255,255,0.6)');
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.echoLine);
            Text.fontSize(12.5);
            Text.fontColor('rgba(255,255,255,0.82)');
            Text.maxLines(2);
            Text.textAlign(TextAlign.Center);
            Text.opacity(this.echoReady ? 1 : 0);
            Text.translate({ y: this.echoReady ? 0 : 6 });
            Text.shadow({ radius: 6, color: 'rgba(0,0,0,0.45)' });
        }, Text);
        Text.pop();
        // 顶部色卡 HUD（点按打开调色盘）
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 右上角：构图线开关
            Stack.create();
            // 右上角：构图线开关
            Stack.width(24);
            // 右上角：构图线开关
            Stack.height(24);
            // 右上角：构图线开关
            Stack.opacity(this.gridOn ? 1 : 0.55);
            // 右上角：构图线开关
            Stack.position({ x: '100%', y: 120 });
            // 右上角：构图线开关
            Stack.translate({ x: '-160%' });
            // 右上角：构图线开关
            Stack.onClick(() => {
                this.gridOn = !this.gridOn;
            });
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Line.create();
            Line.startPoint([8, 2]);
            Line.endPoint([8, 22]);
            Line.stroke('rgba(255,255,255,0.9)');
            Line.strokeWidth(1.6);
        }, Line);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Line.create();
            Line.startPoint([16, 2]);
            Line.endPoint([16, 22]);
            Line.stroke('rgba(255,255,255,0.9)');
            Line.strokeWidth(1.6);
        }, Line);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Line.create();
            Line.startPoint([2, 8]);
            Line.endPoint([22, 8]);
            Line.stroke('rgba(255,255,255,0.9)');
            Line.strokeWidth(1.6);
        }, Line);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Line.create();
            Line.startPoint([2, 16]);
            Line.endPoint([22, 16]);
            Line.stroke('rgba(255,255,255,0.9)');
            Line.strokeWidth(1.6);
        }, Line);
        // 右上角：构图线开关
        Stack.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
            Row.create({ space: 12 });
            // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
            Row.width('100%');
            // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
            Row.height(160);
            // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
            Row.padding({ left: 24, right: 24, top: 16, bottom: 28 });
            // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
            Row.backgroundColor(Color.Black);
            // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
            Row.position({ x: 0, y: '100%' });
            // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
            Row.translate({ y: '-100%' });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 左：缩略图 + 今日计数角标
            Stack.create({ alignContent: Alignment.TopEnd });
            // 左：缩略图 + 今日计数角标
            Stack.width(56);
            // 左：缩略图 + 今日计数角标
            Stack.height(56);
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.latestThumb !== '') {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Image.create(`file://${this.latestThumb}`);
                        Image.width(50);
                        Image.height(50);
                        Image.borderRadius(14);
                        Image.objectFit(ImageFit.Cover);
                        Image.border({ width: 1.5, color: 'rgba(255,255,255,0.85)' });
                        Image.onClick(() => {
                            router.pushUrl({ url: 'pages/Gallery' });
                        });
                    }, Image);
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width(50);
                        Column.height(50);
                        Column.borderRadius(14);
                        Column.backgroundColor('rgba(255,255,255,0.10)');
                        Column.border({ width: 1.5, color: 'rgba(255,255,255,0.4)' });
                        Column.onClick(() => {
                            router.pushUrl({ url: 'pages/Gallery' });
                        });
                    }, Column);
                    Column.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.photoCount}`);
            Text.fontSize(11);
            Text.fontColor(Color.White);
            Text.padding({ left: 6, right: 6, top: 1, bottom: 1 });
            Text.backgroundColor(this.today.hex);
            Text.borderRadius(9);
            Text.translate({ x: 6, y: -6 });
        }, Text);
        Text.pop();
        // 左：缩略图 + 今日计数角标
        Stack.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 中：快门
            Column.create();
            Context.animation({ duration: 120, curve: Curve.EaseOut });
            // 中：快门
            Column.width(74);
            // 中：快门
            Column.height(74);
            // 中：快门
            Column.borderRadius(37);
            // 中：快门
            Column.backgroundColor('rgba(255,255,255,0.14)');
            // 中：快门
            Column.border({ width: 3, color: Color.White });
            // 中：快门
            Column.scale({ x: this.capBusy ? 0.92 : 1, y: this.capBusy ? 0.92 : 1 });
            Context.animation(null);
            // 中：快门
            Column.onClick(() => {
                this.doCapture();
            });
        }, Column);
        // 中：快门
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 右：前后置摄像头切换
            Column.create();
            // 右：前后置摄像头切换
            Column.width(56);
            // 右：前后置摄像头切换
            Column.height(56);
            // 右：前后置摄像头切换
            Column.justifyContent(FlexAlign.Center);
            // 右：前后置摄像头切换
            Column.opacity(this.canSwitch ? 1 : 0.35);
            // 右：前后置摄像头切换
            Column.onClick(() => {
                this.doSwitchCamera();
            });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('⟳');
            Text.fontSize(22);
            Text.fontColor(Color.White);
            Text.width(50);
            Text.height(50);
            Text.textAlign(TextAlign.Center);
            Text.backgroundColor('rgba(255,255,255,0.10)');
            Text.borderRadius(25);
            Text.border({ width: 1.2, color: 'rgba(255,255,255,0.55)' });
        }, Text);
        Text.pop();
        // 右：前后置摄像头切换
        Column.pop();
        // 底部不透明控制区：作为全屏 Surface 上方的浮层，不参与预览布局。
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 调色盘底部面板
            if (this.paletteOpen) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.height('100%');
                        Column.backgroundColor('rgba(0,0,0,0.45)');
                        Column.onClick(() => {
                            this.paletteOpen = false;
                        });
                    }, Column);
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.position({ x: 0, y: '100%' });
                        Column.translate({ y: '-100%' });
                    }, Column);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ColorPaletteSheet(this, {
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 856, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
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
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {});
                            }
                        }, { name: "ColorPaletteSheet" });
                    }
                    Column.pop();
                });
            }
            // 拍照浮层（截图合成根节点 = captureOverlay，与全屏预览采用同一几何）
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 拍照浮层（截图合成根节点 = captureOverlay，与全屏预览采用同一几何）
            if (this.showCapture && this.capturedPm !== null) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Stack.create();
                        Stack.width('100%');
                        Stack.height('100%');
                        Stack.backgroundColor(Color.Black);
                    }, Stack);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.height('100%');
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Stack.create({ alignContent: Alignment.BottomStart });
                        Stack.id('captureOverlay');
                        Stack.width('100%');
                        Stack.height('100%');
                        Stack.clip(true);
                    }, Stack);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Image.create(this.capturedPm);
                        Image.width('100%');
                        Image.height('100%');
                        Image.objectFit(ImageFit.Cover);
                    }, Image);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 3 });
                        Column.padding({ left: 18, bottom: 16 });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`${this.today.name} · ${this.today.hex}`);
                        Text.fontSize(15);
                        Text.fontWeight(FontWeight.Medium);
                        Text.fontColor(Color.White);
                        Text.shadow({ radius: 8, color: 'rgba(0,0,0,0.6)' });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`今日限定色 · ${this.formatNow()}`);
                        Text.fontSize(11);
                        Text.fontColor('rgba(255,255,255,0.9)');
                        Text.shadow({ radius: 8, color: 'rgba(0,0,0,0.6)' });
                    }, Text);
                    Text.pop();
                    Column.pop();
                    Stack.pop();
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        // 浮层控件（不进入截图）
                        Row.create({ space: 14 });
                        // 浮层控件（不进入截图）
                        Row.width('100%');
                        // 浮层控件（不进入截图）
                        Row.padding({ left: 22, right: 22, bottom: 54 });
                        // 浮层控件（不进入截图）
                        Row.position({ x: 0, y: '100%' });
                        // 浮层控件（不进入截图）
                        Row.translate({ y: '-100%' });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        SaveButton.create({ text: SaveDescription.SAVE_IMAGE, buttonType: ButtonType.Capsule });
                        SaveButton.onClick((event: ClickEvent, result: SaveButtonOnClickResult) => {
                            if (result === SaveButtonOnClickResult.SUCCESS) {
                                this.doSaveToAlbum();
                            }
                            else {
                                promptAction.showToast({ message: '未授权保存到相册' });
                            }
                        });
                    }, SaveButton);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                    }, Blank);
                    Blank.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('完成');
                        Text.fontSize(15);
                        Text.fontColor(Color.White);
                        Text.height(40);
                        Text.padding({ left: 20, right: 20 });
                        Text.textAlign(TextAlign.Center);
                        Text.backgroundColor('rgba(0,0,0,0.35)');
                        Text.borderRadius(20);
                        Text.onClick(() => {
                            this.closeCapture();
                        });
                    }, Text);
                    Text.pop();
                    // 浮层控件（不进入截图）
                    Row.pop();
                    Stack.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Stack.pop();
    }
    private formatNow(): string {
        const d = new Date();
        const p = (n: number) => `${n}`.padStart(2, '0');
        return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    rerender() {
        this.updateDirtyElements();
    }
    static getEntryName(): string {
        return "Index";
    }
}
registerNamedRoute(() => new Index(undefined, {}), "", { bundleName: "com.coloroftoday.app", moduleName: "entry", pagePath: "pages/Index", pageFullPath: "entry/src/main/ets/pages/Index", integratedHsp: "false", moduleType: "followWithHap" });
