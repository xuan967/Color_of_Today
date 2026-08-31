import promptAction from '@ohos.promptAction';
import router from '@ohos.router';
import common from '@ohos.app.ability.common';
import { OrientalColor } from '../model/OrientalColor';
import { CollectionService } from '../service/CollectionService';
import { PhotoDao } from '../model/PhotoDao';
import { hexToRgb } from '../utils/ColorUtil';

/** 图鉴单卡：已解锁且为最近点亮时，用 keyframeAnimate 做呼吸微光 */
@Component
struct CollectionCard {
  @Prop color: OrientalColor;
  @Prop unlocked: boolean;
  @Prop isLatest: boolean;
  @Prop count: number;
  @Prop firstDateKey: string;
  onOpen: () => void = () => {};

  @State glow: number = 14;

  aboutToAppear(): void {
    if (this.unlocked && this.isLatest) {
      this.startBreath();
    }
  }

  /** 呼吸微光：keyframeAnimate 无限循环 + Alternate 往返 */
  private startBreath(): void {
    this.getUIContext().keyframeAnimateTo({ iterations: -1 }, [
      { duration: 1150, curve: Curve.EaseInOut, event: () => {
        this.glow = 32;
      } },
      { duration: 1150, curve: Curve.EaseInOut, event: () => {
        this.glow = 14;
      } }
    ]);
  }

  private adaptiveText(hex: string): string {
    const rgb = hexToRgb(hex);
    const lum = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
    return lum > 0.55 ? '#1A1A1A' : '#F5F5F5';
  }

  build() {
    Column({ space: 6 }) {
      if (this.unlocked) {
        Column() {
          Text(this.color.name)
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.adaptiveText(this.color.hex))
          Text(`${this.count} 次`)
            .fontSize(11)
            .fontColor(this.adaptiveText(this.color.hex) === '#1A1A1A'
              ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.65)')
        }
        .width('100%')
        .aspectRatio(0.82)
        .justifyContent(FlexAlign.Center)
        .backgroundColor(this.color.hex)
        .borderRadius(16)
        .shadow({
          radius: this.glow,
          color: `${this.color.hex}70`,
          offsetY: 4
        })
        .animation({ duration: 1150, curve: Curve.EaseInOut })

        Text(this.color.poem)
          .fontSize(11)
          .fontColor('#8A8A8E')
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%')
      } else {
        Column({ space: 4 }) {
          Text('？')
            .fontSize(22)
            .fontColor('#3A3A40')
          Text('未遇见')
            .fontSize(11)
            .fontColor('#4A4A50')
        }
        .width('100%')
        .aspectRatio(0.82)
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#19191C')
        .borderRadius(16)
        .border({ width: 0.8, color: '#26262B' })

        Text('？ ？ ？')
          .fontSize(11)
          .fontColor('#3A3A40')
          .width('100%')
      }
    }
    .onClick(() => {
      this.onOpen();
    })
  }
}

/** 点亮详情浮层的大色块：呼吸光 */
@Component
struct DetailGlow {
  @Prop color: OrientalColor;
  @State glow: number = 18;

  aboutToAppear(): void {
    this.getUIContext().keyframeAnimateTo({ iterations: -1 }, [
      { duration: 1250, curve: Curve.EaseInOut, event: () => {
        this.glow = 46;
      } },
      { duration: 1250, curve: Curve.EaseInOut, event: () => {
        this.glow = 18;
      } }
    ]);
  }

  build() {
    Column()
      .width(180)
      .height(180)
      .borderRadius(90)
      .backgroundColor(this.color.hex)
      .shadow({ radius: this.glow, color: `${this.color.hex}66` })
      .animation({ duration: 1250, curve: Curve.EaseInOut })
  }
}

/**
 * 东方色彩图鉴：30 种传统色，拍到即点亮。
 * 已解锁显示色块/诗句/相遇次数，未解锁仅显示“？”；最近点亮的一张带呼吸微光。
 */
@Entry
@Component
struct Collection {
  @State colors: OrientalColor[] = [];
  @State unlocked: Map<string, number> = new Map();
  @State unlockedCount: number = 0;
  @State lastUnlocked: string = '';
  @State pageIn: boolean = false;
  @State detail: OrientalColor | null = null;
  @State detailCount: number = 0;
  @State detailDate: string = '';

  aboutToAppear(): void {
    this.load();
    setTimeout(() => {
      animateTo({ duration: 340, curve: Curve.EaseOut }, () => {
        this.pageIn = true;
      });
    }, 30);
  }
  private async load(): Promise<void> {
    const context = getContext(this);
    await PhotoDao.getInstance().init(context);
    const data = await CollectionService.loadCollection(context);
    this.colors = data.colors;
    this.unlocked = data.unlocks;
    this.unlockedCount = this.unlocked.size;
    this.lastUnlocked = await CollectionService.lastUnlockedName(context);
  }

  private formatDateKey(key: string): string {
    if (key.length !== 8) {
      return '';
    }
    return `${key.substring(0, 4)}.${key.substring(4, 6)}.${key.substring(6, 8)}`;
  }

  build() {
    Stack() {
      Column() {
        // 顶栏
        Row({ space: 10 }) {
          Text('‹')
            .fontSize(26)
            .fontColor('#F5F5F5')
            .width(36)
            .height(36)
            .textAlign(TextAlign.Center)
            .onClick(() => {
              router.back();
            })
          Text('东方色彩图鉴')
            .fontSize(18)
            .fontWeight(FontWeight.Medium)
            .fontColor('#F5F5F5')
          Blank()
          Text(`${this.unlockedCount} / ${this.colors.length}`)
            .fontSize(14)
            .fontColor('#8A8A8E')
        }
        .width('100%')
        .height(56)
        .padding({ left: 12, right: 20 })

        Text('拍到即点亮 · 与三十种传统色相遇')
          .fontSize(12)
          .fontColor('#6A6A70')
          .width('100%')
          .padding({ left: 20, bottom: 12 })

        Grid() {
          ForEach(this.colors, (c: OrientalColor) => {
            GridItem() {
              CollectionCard({
                color: c,
                unlocked: this.unlocked.has(c.name),
                isLatest: this.lastUnlocked === c.name,
                count: this.unlocked.get(c.name) ?? 0,
                firstDateKey: '',
                onOpen: () => {
                  if (this.unlocked.has(c.name)) {
                    this.detail = c;
                    this.detailCount = this.unlocked.get(c.name) ?? 0;
                  } else {
                    promptAction.showToast({ message: '继续拍摄，与它相遇。' });
                  }
                }
              })
            }
          }, (c: OrientalColor) => c.name)
        }
        .columnsTemplate('1fr 1fr 1fr')
        .columnsGap(12)
        .rowsGap(16)
        .padding({ left: 18, right: 18 })
        .scrollBar(BarState.Off)
        .layoutWeight(1)
      }
      .width('100%')
      .height('100%')
      .backgroundColor('#0D0D0F')
        .opacity(this.pageIn ? 1 : 0)
        .translate({ y: this.pageIn ? 0 : 14 })

      // 点亮详情
      if (this.detail !== null) {
        Stack() {
          Column()
            .width('100%')
            .height('100%')
            .backgroundColor('rgba(0,0,0,0.82)')
            .onClick(() => {
              this.detail = null;
            })

          Column({ space: 14 }) {
            DetailGlow({ color: this.detail })
            Text(this.detail.name)
              .fontSize(30)
              .fontWeight(FontWeight.Medium)
              .fontColor('#F5F5F5')
              .letterSpacing(6)
            Text(this.detail.poem)
              .fontSize(15)
              .fontColor('#C9C9CE')
              .textAlign(TextAlign.Center)
            Text(this.detail.mood)
              .fontSize(12)
              .fontColor('#7A7A80')
              .textAlign(TextAlign.Center)
            if (this.detailCount > 0) {
              Text(`已遇见 ${this.detailCount} 次`)
                .fontSize(11)
                .fontColor('#5A5A60')
            }
          }
          .width('80%')
        }
        .width('100%')
        .height('100%')
      }
    }
    .width('100%')
    .height('100%')
  }
}
