import promptAction from '@ohos.promptAction';
import router from '@ohos.router';
import { COLOR_PRESETS, ColorPreset } from '../model/ColorPreset';
import { DailyColorManager } from '../manager/DailyColorManager';
import { PhotoDao, PhotoInfo } from '../model/PhotoDao';
import { CaptureService } from '../service/CaptureService';

/**
 * 今日相册：网格展示今天拍摄的限定色照片，点击全屏查看，支持删除。
 */
@Entry
@Component
struct Gallery {
  @State photos: PhotoInfo[] = [];
  @State viewing: PhotoInfo | null = null;
  @State pageIn: boolean = false;
  @State today: ColorPreset = COLOR_PRESETS[0];

  aboutToAppear(): void {
    this.today = DailyColorManager.getInstance().getActiveColor();
    this.refresh();
    setTimeout(() => {
      animateTo({ duration: 340, curve: Curve.EaseOut }, () => {
        this.pageIn = true;
      });
    }, 30);
  }
  private async refresh(): Promise<void> {
    const dateKey = DailyColorManager.getDateKey(new Date());
    this.photos = await PhotoDao.getInstance().queryByDate(dateKey);
  }

  private async deleteCurrent(): Promise<void> {
    const target = this.viewing;
    if (target === null) {
      return;
    }
    await CaptureService.deletePhoto(target.localPath, target.uri);
    await PhotoDao.getInstance().deleteById(target.id);
    this.viewing = null;
    promptAction.showToast({ message: '已删除' });
    this.refresh();
  }

  build() {
    Stack() {
      Column() {
        // 顶栏
        Row({ space: 10 }) {
          Text('‹')
            .fontSize(26)
            .fontColor('#1A1A1A')
            .width(36)
            .height(36)
            .textAlign(TextAlign.Center)
            .onClick(() => {
              router.back();
            })
          Column()
            .width(14)
            .height(14)
            .borderRadius(7)
            .backgroundColor(this.today.hex)
          Text(`今日相册 · ${this.today.name}`)
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor('#1A1A1A')
          Blank()
          // 岁月色卡入口（隐蔽而优雅）
          Row({ space: 4 }) {
            Column()
              .width(10)
              .height(10)
              .borderRadius(3)
              .backgroundColor(this.today.hex)
              .opacity(0.85)
            Text('岁月色卡')
              .fontSize(12)
              .fontColor('#616161')
          }
          .padding({ left: 10, right: 10, top: 6, bottom: 6 })
          .backgroundColor('#F0F0F2')
          .borderRadius(14)
          .onClick(() => {
            router.pushUrl({ url: 'pages/TimePalette' });
          })
          Text(`${this.photos.length} 张`)
            .fontSize(13)
            .fontColor('#9E9E9E')
        }
        .width('100%')
        .height(56)
        .padding({ left: 12, right: 16 })

        Divider().strokeWidth(0.5).color('#EEEEEE')

        if (this.photos.length === 0) {
          Column({ space: 12 }) {
            Column()
              .width(64)
              .height(64)
              .borderRadius(32)
              .backgroundColor(this.today.hex)
              .opacity(0.25)
            Text('今天还没有照片')
              .fontSize(15)
              .fontColor('#757575')
            Text('回到取景页，拍下属于今天的颜色吧')
              .fontSize(13)
              .fontColor('#BDBDBD')
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
        } else {
          Grid() {
            ForEach(this.photos, (photo: PhotoInfo) => {
              GridItem() {
                Image(`file://${photo.localPath}`)
                  .width('100%')
                  .aspectRatio(0.72)
                  .objectFit(ImageFit.Cover)
                  .borderRadius(14)
                  .onClick(() => {
                    this.viewing = photo;
                  })
              }
            }, (photo: PhotoInfo) => `${photo.id}`)
          }
          .columnsTemplate('1fr 1fr')
          .columnsGap(10)
          .rowsGap(10)
          .padding(14)
          .scrollBar(BarState.Off)
          .layoutWeight(1)
        }
      }
      .width('100%')
      .height('100%')
      .backgroundColor('#FAFAFA')

      // 全屏查看
      if (this.viewing !== null) {
        Stack() {
          Image(`file://${this.viewing.localPath}`)
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Contain)

          Row() {
            Text('‹')
              .fontSize(26)
              .fontColor(Color.White)
              .width(40)
              .height(40)
              .textAlign(TextAlign.Center)
              .backgroundColor('rgba(0,0,0,0.35)')
              .borderRadius(20)
              .onClick(() => {
                this.viewing = null;
              })
            Blank()
            Text('删除')
              .fontSize(14)
              .fontColor(Color.White)
              .height(40)
              .padding({ left: 18, right: 18 })
              .textAlign(TextAlign.Center)
              .backgroundColor('rgba(0,0,0,0.35)')
              .borderRadius(20)
              .onClick(() => {
                this.deleteCurrent();
              })
          }
          .width('100%')
          .padding({ left: 18, right: 18, bottom: 46 })
          .position({ x: 0, y: '100%' })
          .translate({ y: '-100%' })

          Column({ space: 2 }) {
            Text(`${this.viewing.colorName} · ${this.viewing.colorHex}`)
              .fontSize(14)
              .fontColor(Color.White)
              .shadow({ radius: 8, color: 'rgba(0,0,0,0.6)' })
          }
          .width('100%')
          .padding({ top: 60 })
          .hitTestBehavior(HitTestMode.None)
        }
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Black)
      }
    }
    .width('100%')
    .height('100%')
  }
}
