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
import { CameraService } from '../service/CameraService';
import { CaptureService } from '../service/CaptureService';
import { CollectionService } from '../service/CollectionService';
import { EchoService, EchoResult } from '../service/EchoService';
import { ColorPaletteSheet } from '../components/ColorPalette';

/**
 * 相机取景页（App 主页）：
 * 全屏实时颜色隔离取景；顶部今日色卡（点按开调色盘），底部玻璃控制条。
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
  @State starting: boolean = true;
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

  private xcController: XComponentController = new XComponentController();
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

  aboutToAppear(): void {
    this.loadData();
  }

  aboutToDisappear(): void {
    if (this.echoTimer >= 0) {
      clearInterval(this.echoTimer);
    }
    this.cameraService.stop();
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

  private async startPipeline(): Promise<void> {
    if (this.pipelineStarted) {
      return;
    }
    this.pipelineStarted = true;
    const context = getContext(this);
    await DailyColorManager.getInstance().init(context);
    await PhotoDao.getInstance().init(context);
    this.today = DailyColorManager.getInstance().getActiveColor();
    colorFilter.setColor(this.today.hue, this.today.threshold, this.today.saturationBoost);

    const granted = await CameraService.ensureCameraPermission(context);
    if (!granted) {
      this.camError = '需要相机权限才能取景，请在设置中开启';
      this.starting = false;
      return;
    }

    // 路径一：XComponent 生命周期回调（组件 onLoad 后 attach 一次，覆盖注入时序差异）
    colorFilter.attachXComponent();
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      await this.sleep(200);
      ready = colorFilter.isRendererReady();
      if (!ready && i === 5) {
        colorFilter.attachXComponent();
      }
    }
    // 路径二兜底：surfaceId 直接创建 NativeWindow（官方推荐路径，部分设备回调注入异常时可用）
    if (!ready) {
      const sid: string = await this.xcController.getXComponentSurfaceId();
      ready = colorFilter.initFromSurfaceId(Number(sid));
      for (let i = 0; i < 15 && !ready; i++) {
        await this.sleep(200);
        ready = colorFilter.isRendererReady();
      }
    }
    if (!ready) {
      this.camError = '渲染管线初始化失败';
      this.starting = false;
      return;
    }

    colorFilter.setMirror(this.cameraService.isFront() ? 1 : 0);
    const camSurfaceId = colorFilter.getCameraSurfaceId();
    const err = await this.cameraService.start(context, camSurfaceId, () => {});
    this.starting = false;
    this.canSwitch = this.cameraService.canSwitch();
    const range = this.cameraService.zoomRange();
    this.zoomMin = range[0];
    this.zoomMax = range[1];
    if (err !== null) {
      this.camError = `相机启动失败：${err}`;
    }
  }

  /** 前后置摄像头切换 */
  private async doSwitchCamera(): Promise<void> {
    if (this.switching) {
      return;
    }
    this.switching = true;
    const context = getContext(this);
    const err = await this.cameraService.switchTo(context, () => {});
    this.switching = false;
    if (err !== null) {
      promptAction.showToast({ message: `切换失败：${err}` });
      return;
    }
    colorFilter.setMirror(this.cameraService.isFront() ? 1 : 0);
    this.zoomRatio = 1;
  }

  /** 点击对焦：归一化坐标下发相机 + 显示对焦环 */
  private handleTapFocus(e: ClickEvent): void {
    const w = Number(px2vp(display.getDefaultDisplaySync().width));
    const h = Number(px2vp(display.getDefaultDisplaySync().height));
    this.cameraService.tapFocus(e.x / w, e.y / h);
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
    if (this.camError !== '') {
      promptAction.showToast({ message: this.camError });
      return;
    }
    this.capBusy = true;
    try {
      vibrator.startVibration({ type: 'time', duration: 40 }, { id: 0, usage: 'touch' });
      this.flashOpacity = 0.9;
      animateTo({ duration: 280, curve: Curve.EaseOut }, () => {
        this.flashOpacity = 0;
      });

      const frame = colorFilter.captureFrame();
      if (frame === null || frame.data.byteLength === 0) {
        promptAction.showToast({ message: '拍照失败，请稍后重试' });
        return;
      }
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

      const context = getContext(this);
      const localPath = await CaptureService.persistSnapshot(context, snap, this.today.name);
      if (localPath === null) {
        promptAction.showToast({ message: '保存失败' });
      } else {
        this.currentPhotoPath = localPath;
        await CaptureService.recordPhoto(localPath, '', frame.width, frame.height);
        // 图鉴收集：按当前取景色相匹配传统色，首次命中即点亮
        const unlockedColor = await CollectionService.onPhotoCaptured(context,
          this.today.hue, DailyColorManager.getDateKey(new Date()));
        if (unlockedColor !== null) {
          promptAction.showToast({ message: `点亮图鉴 · ${unlockedColor.name}`, duration: 2400 });
        }
        this.refreshStats();
        // 浮层常驻：由用户选择“存入相册”(SaveButton 安全控件) 或“完成”
      }
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
      // 预览窗：固定 16:9（与相机流一致），初始布局即最终布局，规避 surface 尺寸同步问题
      Column() {
        XComponent({ id: 'cameraPreview', type: 'surface', libraryname: 'entry', controller: this.xcController })
          .width('100%')
          .aspectRatio(9 / 16)
          .borderRadius(18)
          .clip(true)
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
            // 16:9 窗口首次布局即稳定；同步 buffer 几何保证各设备一致
            const density = display.getDefaultDisplaySync().densityPixels;
            const wPx = Math.round(Number(newArea.width) * density);
            const hPx = Math.round(Number(newArea.height) * density);
            if (wPx > 0 && hPx > 0) {
              colorFilter.setSurfaceGeometry(wPx, hPx);
            }
          })
          .onLoad(() => {
            this.startPipeline();
          })
          .onDestroy(() => {
            colorFilter.releaseRenderer();
          })
      }
      .width('100%')
      .height('100%')
      .padding({ top: 46 })

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

      // 取景浮层（错误提示 / 加载中）
      if (this.starting || this.camError !== '') {
        Column({ space: 10 }) {
          if (this.starting) {
            LoadingProgress().width(36).height(36).color(Color.White)
            Text('正在唤醒相机…').fontSize(13).fontColor('rgba(255,255,255,0.85)')
          } else {
            Text(this.camError).fontSize(14).fontColor('rgba(255,255,255,0.9)').textAlign(TextAlign.Center)
          }
        }
        .width('100%')
        .padding({ left: 40, right: 40 })
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
      Column({ space: 8 }) {
        Row({ space: 8 }) {
          Circle({ width: 13, height: 13 })
            .fill(this.today.hex)
            .border({ width: 1.5, color: 'rgba(255,255,255,0.9)' })
          Text(this.today.name)
            .fontSize(18)
            .fontWeight(FontWeight.Medium)
            .fontColor(Color.White)
          Text('›')
            .fontSize(16)
            .fontColor('rgba(255,255,255,0.6)')
        }
        .padding({ left: 16, right: 12, top: 9, bottom: 9 })
        .backgroundColor('rgba(0,0,0,0.28)')
        .borderRadius(22)
        .onClick(() => {
          this.paletteOpen = true;
        })

        Text(this.echoLine)
          .fontSize(12.5)
          .fontColor('rgba(255,255,255,0.82)')
          .maxLines(2)
          .textAlign(TextAlign.Center)
          .opacity(this.echoReady ? 1 : 0)
          .translate({ y: this.echoReady ? 0 : 6 })
          .shadow({ radius: 6, color: 'rgba(0,0,0,0.45)' })
      }
      .width('100%')
      .padding({ top: 64 })
      .hitTestBehavior(HitTestMode.None)

      // 右上角：构图线开关
      Stack() {
        Line().startPoint([8, 2]).endPoint([8, 22])
          .stroke('rgba(255,255,255,0.9)').strokeWidth(1.6)
        Line().startPoint([16, 2]).endPoint([16, 22])
          .stroke('rgba(255,255,255,0.9)').strokeWidth(1.6)
        Line().startPoint([2, 8]).endPoint([22, 8])
          .stroke('rgba(255,255,255,0.9)').strokeWidth(1.6)
        Line().startPoint([2, 16]).endPoint([22, 16])
          .stroke('rgba(255,255,255,0.9)').strokeWidth(1.6)
      }
      .width(24)
      .height(24)
      .opacity(this.gridOn ? 1 : 0.55)
      .position({ x: '100%', y: 120 })
      .translate({ x: '-160%' })
      .onClick(() => {
        this.gridOn = !this.gridOn;
      })

      // 底部玻璃控制条：缩略图 | 快门 | 前后置切换
      Row({ space: 12 }) {
        // 左：缩略图 + 今日计数角标
        Stack({ alignContent: Alignment.TopEnd }) {
          if (this.latestThumb !== '') {
            Image(`file://${this.latestThumb}`)
              .width(50)
              .height(50)
              .borderRadius(14)
              .objectFit(ImageFit.Cover)
              .border({ width: 1.5, color: 'rgba(255,255,255,0.85)' })
              .onClick(() => {
                router.pushUrl({ url: 'pages/Gallery' });
              })
          } else {
            Column()
              .width(50)
              .height(50)
              .borderRadius(14)
              .backgroundColor('rgba(255,255,255,0.10)')
              .border({ width: 1.5, color: 'rgba(255,255,255,0.4)' })
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
            .translate({ x: 6, y: -6 })
        }
        .width(56)
        .height(56)

        Blank()

        // 中：快门
        Column()
          .width(74)
          .height(74)
          .borderRadius(37)
          .backgroundColor('rgba(255,255,255,0.14)')
          .border({ width: 3, color: Color.White })
          .scale({ x: this.capBusy ? 0.92 : 1, y: this.capBusy ? 0.92 : 1 })
          .animation({ duration: 120, curve: Curve.EaseOut })
          .onClick(() => {
            this.doCapture();
          })

        Blank()

        // 右：前后置摄像头切换
        Column() {
          Text('⟳')
            .fontSize(22)
            .fontColor(Color.White)
            .width(50)
            .height(50)
            .textAlign(TextAlign.Center)
            .backgroundColor('rgba(255,255,255,0.10)')
            .borderRadius(25)
            .border({ width: 1.2, color: 'rgba(255,255,255,0.55)' })
        }
        .width(56)
        .height(56)
        .justifyContent(FlexAlign.Center)
        .opacity(this.canSwitch ? 1 : 0.35)
        .onClick(() => {
          this.doSwitchCamera();
        })
      }
      .width('calc(100% - 40vp)')
      .padding({ left: 20, right: 20, top: 14, bottom: 14 })
      .backgroundColor('rgba(0,0,0,0.30)')
      .borderRadius(40)
      .backdropBlur(12)
      .position({ x: 20, y: '100%' })
      .translate({ y: '-130%' })

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

      // 拍照浮层（截图合成根节点 = captureOverlay，与预览窗同为 16:9）
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
            .aspectRatio(9 / 16)
            .borderRadius(18)
            .clip(true)
          }
          .width('100%')
          .height('100%')
          .padding({ top: 46 })

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
