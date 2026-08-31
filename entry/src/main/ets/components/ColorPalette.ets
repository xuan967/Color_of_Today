import { COLOR_PRESETS, ColorPreset } from '../model/ColorPreset';
import { hsvToHex } from '../utils/ColorUtil';

/**
 * 调色盘底部面板：
 * - 20 官方预设色一键切换
 * - 色相 / 容差 / 饱和度滑杆，拖动实时生效
 * - “恢复今日色”回到每日随机
 */
@Component
export struct ColorPaletteSheet {
  activeColor: ColorPreset = COLOR_PRESETS[0];
  isCustom: boolean = false;
  onLive: (p: ColorPreset) => void = () => {};
  onApply: (p: ColorPreset) => void = () => {};
  onRestoreDaily: () => void = () => {};
  onOpenCollection: () => void = () => {};
  onClose: () => void = () => {};

  @State hue: number = 0.62;
  @State sat: number = 0.75;
  @State thr: number = 0.05;
  @State boost: number = 1.2;
  @State draftHex: string = '#8A2BE2';

  aboutToAppear(): void {
    this.hue = this.activeColor.hue;
    this.sat = this.activeColor.saturationBoost;
    this.thr = this.activeColor.threshold;
    this.boost = this.activeColor.saturationBoost;
    this.draftHex = this.activeColor.hex;
  }

  private emitLive(): void {
    this.draftHex = hsvToHex(this.hue, Math.min(1, (this.boost - 1) * 0.6 + 0.45), 0.9);
    const preset: ColorPreset = {
      id: -1,
      name: '自定义',
      nameEn: 'Custom',
      hex: this.draftHex,
      hue: this.hue,
      threshold: this.thr,
      saturationBoost: this.boost,
      mood: '你选的颜色，就是今天的限定。'
    };
    this.onLive(preset);
  }

  private applyPreset(p: ColorPreset): void {
    this.hue = p.hue;
    this.thr = p.threshold;
    this.boost = p.saturationBoost;
    this.draftHex = p.hex;
    this.onApply(p);
  }

  private hueGradient(): string[] {
    return ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];
  }

  build() {
    Column({ space: 16 }) {
      // 标题行
      Row() {
        Text('限定色调色盘')
          .fontSize(17)
          .fontWeight(FontWeight.Medium)
          .fontColor(Color.White)
        Blank()
        if (this.isCustom) {
          Text('恢复今日色')
            .fontSize(13)
            .fontColor(this.activeColor.hex === '#FFFFFF' ? Color.White : this.activeColor.hex)
            .padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .borderRadius(14)
            .backgroundColor('rgba(255,255,255,0.10)')
            .onClick(() => {
              this.onRestoreDaily();
              this.onClose();
            })
        }
        Text('×')
          .fontSize(20)
          .fontColor('rgba(255,255,255,0.9)')
          .width(32)
          .height(32)
          .textAlign(TextAlign.Center)
          .margin({ left: 8 })
          .onClick(() => {
            this.onClose();
          })
      }
      .width('100%')

      // 图鉴入口（隐蔽而克制）
      Row() {
        Text('东方色彩图鉴')
          .fontSize(13)
          .fontColor('rgba(255,255,255,0.85)')
        Blank()
        Text('›')
          .fontSize(14)
          .fontColor('rgba(255,255,255,0.5)')
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 10, bottom: 10 })
      .backgroundColor('rgba(255,255,255,0.07)')
      .borderRadius(14)
      .onClick(() => {
        this.onOpenCollection();
      })

      // 预设色板 5 列
      Grid() {
        ForEach(COLOR_PRESETS, (p: ColorPreset) => {
          GridItem() {
            Column() {
              Column()
                .width(34)
                .height(34)
                .borderRadius(17)
                .backgroundColor(p.hex)
                .border({
                  width: this.activeColor.id === p.id ? 2.5 : 0,
                  color: Color.White
                })
            }
            .width('100%')
            .height(44)
            .justifyContent(FlexAlign.Center)
            .onClick(() => {
              this.applyPreset(p);
            })
          }
        }, (p: ColorPreset) => `${p.id}`)
      }
      .columnsTemplate('1fr 1fr 1fr 1fr 1fr')
      .rowsGap(6)
      .height(196)
      .scrollBar(BarState.Off)
      .width('100%')

      // 色相滑杆（渐变轨道）
      Column({ space: 6 }) {
        Stack() {
          Row()
            .width('100%')
            .height(14)
            .borderRadius(7)
            .linearGradient({
              angle: 90,
              colors: this.hueGradient().map((c: string) => [c, 1.0]) as Array<[ResourceColor, number]>
            })
          Slider({ value: Math.round(this.hue * 360), min: 0, max: 360, step: 1, style: SliderStyle.OutSet })
            .width('100%')
            .trackColor(Color.Transparent)
            .selectedColor(Color.Transparent)
            .blockColor(Color.White)
            .onChange((value: number) => {
              this.hue = value / 360;
              this.emitLive();
            })
        }
        .width('100%')
      }
      .alignItems(HorizontalAlign.Start)

      // 容差滑杆
      Row() {
        Text('容差').fontSize(13).fontColor('rgba(255,255,255,0.75)').width(44)
        Slider({ value: this.thr, min: 0.02, max: 0.12, step: 0.005, style: SliderStyle.OutSet })
          .layoutWeight(1)
          .trackColor('rgba(255,255,255,0.20)')
          .selectedColor(Color.White)
          .blockColor(Color.White)
          .onChange((value: number) => {
            this.thr = Math.round(value * 1000) / 1000;
            this.emitLive();
          })
        Text(`${this.thr.toFixed(3)}`)
          .fontSize(12)
          .fontColor('rgba(255,255,255,0.85)')
          .width(44)
          .textAlign(TextAlign.End)
      }
      .width('100%')

      // 饱和度增益滑杆
      Row() {
        Text('浓度').fontSize(13).fontColor('rgba(255,255,255,0.75)').width(44)
        Slider({ value: this.boost, min: 1.0, max: 2.0, step: 0.05, style: SliderStyle.OutSet })
          .layoutWeight(1)
          .trackColor('rgba(255,255,255,0.20)')
          .selectedColor(Color.White)
          .blockColor(Color.White)
          .onChange((value: number) => {
            this.boost = Math.round(value * 100) / 100;
            this.emitLive();
          })
        Text(`${this.boost.toFixed(2)}x`)
          .fontSize(12)
          .fontColor('rgba(255,255,255,0.85)')
          .width(44)
          .textAlign(TextAlign.End)
      }
      .width('100%')

      // 应用按钮
      Text('使用此颜色')
        .fontSize(15)
        .fontWeight(FontWeight.Medium)
        .fontColor('#0A0A0A')
        .width('100%')
        .height(44)
        .textAlign(TextAlign.Center)
        .backgroundColor(this.draftHex)
        .borderRadius(22)
        .onClick(() => {
          const preset: ColorPreset = {
            id: -1,
            name: '自定义',
            nameEn: 'Custom',
            hex: this.draftHex,
            hue: this.hue,
            threshold: this.thr,
            saturationBoost: this.boost,
            mood: '你选的颜色，就是今天的限定。'
          };
          this.onApply(preset);
          this.onClose();
        })
    }
    .padding({ left: 20, right: 20, top: 18, bottom: 34 })
    .backgroundColor('rgba(18,18,20,0.94)')
    .borderRadius({ topLeft: 24, topRight: 24 })
    .width('100%')
  }
}
