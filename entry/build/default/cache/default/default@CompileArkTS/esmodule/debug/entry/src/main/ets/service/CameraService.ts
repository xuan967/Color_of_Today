import camera from "@ohos:multimedia.camera";
import abilityAccessCtrl from "@ohos:abilityAccessCtrl";
import type common from "@ohos:app.ability.common";
import colorFilter from "@normalized:Y&&&libentry.so&";
import type { BusinessError } from "@ohos:base";
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
    private session: camera.CaptureSession | null = null;
    private started: boolean = false;
    private glSurfaceId: number = 0;
    static async ensureCameraPermission(context: common.Context): Promise<boolean> {
        const atManager = abilityAccessCtrl.createAtManager();
        const result = await atManager.requestPermissionsFromUser(context, ['ohos.permission.CAMERA']);
        return result.authResults.length > 0
            && result.authResults.every((r: number) => r === 0);
    }
    /** 是否存在可切换的其他摄像头 */
    canSwitch(): boolean {
        return this.devices.length > 1;
    }
    /** 当前是否为前置摄像头（前置预览通常需要镜像） */
    isFront(): boolean {
        if (this.devices.length === 0) {
            return false;
        }
        return this.devices[this.currentIndex].cameraPosition === camera.CameraPosition.CAMERA_POSITION_FRONT;
    }
    /** 启动预览（默认优先后置）。onPreviewSize 回传预览流分辨率（用于 shader 等比裁剪）。 */
    async start(context: common.Context, glSurfaceId: number, onPreviewSize: (w: number, h: number) => void): Promise<string | null> {
        this.glSurfaceId = glSurfaceId;
        const err = await this.openManager(context);
        if (err !== null) {
            return err;
        }
        this.currentIndex = this.pickDefaultIndex();
        return this.openCurrent(context, onPreviewSize);
    }
    /** 切换到下一个摄像头（前后置循环），返回错误信息或 null */
    async switchTo(context: common.Context, onPreviewSize: (w: number, h: number) => void): Promise<string | null> {
        if (this.devices.length < 2) {
            return '没有可切换的摄像头';
        }
        await this.stop();
        this.currentIndex = (this.currentIndex + 1) % this.devices.length;
        const err = await this.openManager(context);
        if (err !== null) {
            return err;
        }
        return this.openCurrent(context, onPreviewSize);
    }
    private pickDefaultIndex(): number {
        for (let i = 0; i < this.devices.length; i++) {
            if (this.devices[i].cameraPosition === camera.CameraPosition.CAMERA_POSITION_BACK) {
                return i;
            }
        }
        return 0;
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
        }
        catch (err) {
            const e = err as BusinessError;
            return `相机管理失败 ${e.code}: ${e.message}`;
        }
    }
    private async openCurrent(context: common.Context, onPreviewSize: (w: number, h: number) => void): Promise<string | null> {
        try {
            const device = this.devices[this.currentIndex];
            const capability = this.manager!.getSupportedOutputCapability(device);
            const profiles: camera.Profile[] = capability.previewProfiles;
            if (profiles.length === 0) {
                return '该相机不支持预览流';
            }
            // 取不超过 1920 宽的最大分辨率
            let profile = profiles[0];
            let bestPixels = 0;
            for (const p of profiles) {
                if (p.size.width <= 1920 && p.size.width * p.size.height > bestPixels) {
                    bestPixels = p.size.width * p.size.height;
                    profile = p;
                }
            }
            onPreviewSize(profile.size.width, profile.size.height);
            colorFilter.setPreviewSize(profile.size.width, profile.size.height);
            this.previewOutput = this.manager!.createPreviewOutput(profile, `${this.glSurfaceId}`);
            this.input = this.manager!.createCameraInput(device);
            await this.input.open();
            this.session = this.manager!.createCaptureSession();
            this.session.beginConfig();
            this.session.addInput(this.input);
            this.session.addOutput(this.previewOutput);
            await this.session.commitConfig();
            await this.session.start();
            this.started = true;
            return null;
        }
        catch (err) {
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
        }
        catch (err) {
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
        }
        catch (err) {
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
        }
        catch (err) {
            // 设备不支持变焦，忽略
        }
    }
    async stop(): Promise<void> {
        try {
            if (this.session !== null && this.started) {
                await this.session.stop();
            }
            if (this.session !== null) {
                await this.session.release();
                this.session = null;
            }
            if (this.input !== null) {
                await this.input.close();
                this.input = null;
            }
            if (this.previewOutput !== null) {
                await this.previewOutput.release();
                this.previewOutput = null;
            }
        }
        catch (err) {
            console.error(`[TodayColor] camera stop: ${JSON.stringify(err)}`);
        }
        this.started = false;
    }
}
