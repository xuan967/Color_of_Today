import fs from '@ohos.file.fs';
import image from '@ohos.multimedia.image';
import promptAction from '@ohos.promptAction';
import router from '@ohos.router';
import { PhotoDao, PhotoInfo } from '../model/PhotoDao';
import { DailyColorManager } from '../manager/DailyColorManager';
import { extractDayColor } from '../utils/ColorExtract';
import { renderPaletteCard, PaletteDay } from '../utils/CanvasExporter';
import { CaptureService } from '../service/CaptureService';
import { hexToRgb } from '../utils/ColorUtil';

interface GridCell {
  day: number;   // 0 表示月首留白
  key: string;
  hex: string;
}

interface MonthRange {
  start: string;
  end: string;
}

/**
 * 岁月色卡：把每天拍摄照片提取的主色调汇成月历色卡（类似贡献图），
 * 支持翻月、查看某日照片，并可离屏渲染为高清长图存入相册。
 */
@Entry
@Component
struct TimePalette {
  @State monthOffset: number = 0;              // 0=本月，-1=上月
  @State dayColorMap: Map<string, string> = new Map();
  @State monthGroups: Map<string, PhotoInfo[]> = new Map();
  @State loading: boolean = true;
  @State selectedKey: string = '';
  @State dayPhotos: PhotoInfo[] = [];
  @State exportPm: image.PixelMap | null = null;
  @State exportShow: boolean = false;
  @State exportBusy: boolean = false;
  @State pageIn: boolean = false;

  aboutToAppear(): void {
    this.loadMonth();
    setTimeout(() => {
      animateTo({ duration: 340, curve: Curve.EaseOut }, () => {
        this.pageIn = true;
      });
    }, 30);
  }
  private monthDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + this.monthOffset, 1);
  }

  private monthLabel(): string {
    const d = this.monthDate();
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }

  private range(): MonthRange {
    const d = this.monthDate();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const mm = `${m}`.padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    return { start: `${y}${mm}01`, end: `${y}${mm}${lastDay}` };
  }

  private daysInMonth(): number {
    const d = this.monthDate();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }

  /** 周一为首列的月首偏移 */
  private leadingBlanks(): number {
    const d = this.monthDate();
    return (d.getDay() + 6) % 7;
  }

  private buildCells(): GridCell[] {
    const cells: GridCell[] = [];
    const leading = this.leadingBlanks();
    const total = this.daysInMonth();
    const label = this.monthLabel();
    void label;
    for (let i = 0; i < leading; i++) {
      cells.push({ day: 0, key: '', hex: '' });
    }
    for (let day = 1; day <= total; day++) {
      const d = this.monthDate();
      const key = `${d.getFullYear()}${`${d.getMonth() + 1}`.padStart(2, '0')}${`${day}`.padStart(2, '0')}`;
      const hex = this.dayColorMap.get(key);
      cells.push({ day: day, key: key, hex: hex ?? '' });
    }
    return cells;
  }

  private async loadMonth(): Promise<void> {
    this.loading = true;
    try {
      const context = getContext(this);
      await PhotoDao.getInstance().init(context);
      const r = this.range();
      const cached = await PhotoDao.getInstance().queryDayColors(r.start, r.end);
      const photos = await PhotoDao.getInstance().queryPhotosBetween(r.start, r.end);

      const groups = new Map<string, PhotoInfo[]>();
      const dayKeys: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        let arr = groups.get(p.dateKey);
        if (arr === undefined) {
          arr = [];
          groups.set(p.dateKey, arr);
          dayKeys.push(p.dateKey);
        }
        arr.push(p);
      }

      // 未缓存的日子：提取主色并落库
      for (let i = 0; i < dayKeys.length; i++) {
        const key = dayKeys[i];
        if (cached.has(key)) {
          continue;
        }
        const arr = groups.get(key);
        if (arr === undefined || arr.length === 0) {
          continue;
        }
        const paths: string[] = [];
        for (let j = 0; j < arr.length; j++) {
          paths.push(arr[j].localPath);
        }
        const hex = await extractDayColor(paths);
        if (hex !== null) {
          await PhotoDao.getInstance().saveDayColor(key, hex);
          cached.set(key, hex);
        }
      }

      this.dayColorMap = cached;
      this.monthGroups = groups;
      // 默认选中本月今天
      const todayKey = DailyColorManager.getDateKey(new Date());
      if (todayKey >= r.start && todayKey <= r.end && this.dayColorMap.has(todayKey)) {
        this.selectedKey = todayKey;
      } else if (dayKeys.length > 0) {
        this.selectedKey = dayKeys[dayKeys.length - 1];
      }
      this.dayPhotos = this.photosOf(this.selectedKey);
    } finally {
      this.loading = false;
    }
  }

  private photosOf(dateKey: string): PhotoInfo[] {
    const arr = this.monthGroups.get(dateKey);
    return arr ?? [];
  }

  private selectDay(cell: GridCell): void {
    if (cell.day <= 0) {
      return;
    }
    this.selectedKey = cell.key;
    this.dayPhotos = this.photosOf(cell.key);
  }

  /** 选中日的展示文案，如 “08月29日 · 3 张” */
  private selectedLabel(): string {
    if (this.selectedKey.length !== 8) {
      return '';
    }
    const m = this.selectedKey.substring(4, 6);
    const d = this.selectedKey.substring(6, 8);
    return `${m}月${d}日 · ${this.dayPhotos.length} 张`;
  }

  private async doExport(): Promise<void> {
    if (this.exportBusy) {
      return;
    }
    this.exportBusy = true;
    try {
      const cells = this.buildCells();
      const days: PaletteDay[] = [];
      for (let i = 0; i < cells.length; i++) {
        days.push({ day: cells[i].day, hex: cells[i].hex });
      }
      this.exportPm = await renderPaletteCard(this.monthLabel(), days, '每一天，都有它的颜色。');
      this.exportShow = true;
    } catch (err) {
      promptAction.showToast({ message: '生成失败，请重试' });
    } finally {
      this.exportBusy = false;
    }
  }

  private async saveExportToAlbum(): Promise<void> {
    if (this.exportPm === null) {
      return;
    }
    try {
      const context = getContext(this);
      const packer = image.createImagePacker();
      const opts: image.PackingOption = { format: 'image/jpeg', quality: 95 };
      const data: ArrayBuffer = await packer.packToData(this.exportPm, opts);
      packer.release();

      const dir = `${context.filesDir}/cards`;
      if (!fs.accessSync(dir)) {
        fs.mkdirSync(dir, true);
      }
      const path = `${dir}/palette_${this.range().start}.jpg`;
      const file = fs.openSync(path, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
      fs.writeSync(file.fd, data);
      fs.closeSync(file.fd);

      const uri = await CaptureService.saveToAlbum(context, path);
      if (uri !== null) {
        promptAction.showToast({ message: '色卡已保存到系统相册' });
      } else {
        promptAction.showToast({ message: '保存到相册失败' });
      }
    } catch (err) {
      promptAction.showToast({ message: '保存失败' });
    }
  }

  private cellTextColor(hex: string): string {
    const rgb = hexToRgb(hex);
    const lum = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
    return lum > 0.55 ? '#1A1A1A' : '#F5F5F5';
  }

  build() {
    Stack() {
      Column() {
        // 顶部导航
        Row({ space: 8 }) {
          Text('‹')
            .fontSize(26)
            .fontColor('#1A1A1A')
            .width(36)
            .height(36)
            .textAlign(TextAlign.Center)
            .onClick(() => {
              router.back();
            })
          Blank()
          Text('‹')
            .fontSize(20)
            .fontColor('#616161')
            .width(40)
            .height(36)
            .textAlign(TextAlign.Center)
            .onClick(() => {
              this.monthOffset--;
              this.loadMonth();
            })
          Text(this.monthLabel())
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor('#1A1A1A')
          Text('›')
            .fontSize(20)
            .fontColor('#616161')
            .width(40)
            .height(36)
            .textAlign(TextAlign.Center)
            .onClick(() => {
              this.monthOffset++;
              this.loadMonth();
            })
          Blank()
          Text('导出')
            .fontSize(13)
            .fontColor('#FFFFFF')
            .padding({ left: 14, right: 14, top: 7, bottom: 7 })
            .backgroundColor('#1A1A1A')
            .borderRadius(16)
            .opacity(this.exportBusy ? 0.5 : 1)
            .onClick(() => {
              this.doExport();
            })
        }
        .width('100%')
        .height(52)
        .padding({ left: 12, right: 16 })

        if (this.loading) {
          Column({ space: 10 }) {
            LoadingProgress().width(34).height(34).color('#9E9E9E')
            Text('正在为每一天着色…').fontSize(13).fontColor('#9E9E9E')
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
        } else {
          Scroll() {
            Column() {
              // 色卡主体
              Column({ space: 10 }) {
                Row() {
                  Column()
                    .width(12)
                    .height(12)
                    .borderRadius(6)
                    .backgroundColor(DailyColorManager.getInstance().getActiveColor().hex)
                  Text(this.monthLabel())
                    .fontSize(22)
                    .fontWeight(FontWeight.Medium)
                    .fontColor('#F5F5F5')
                  Blank()
                  Text('岁月色卡')
                    .fontSize(13)
                    .fontColor('#9E9E9E')
                }
                .width('100%')

                Row() {
                  ForEach(['一', '二', '三', '四', '五', '六', '日'], (w: string) => {
                    Text(w)
                      .fontSize(12)
                      .fontColor('#757575')
                      .textAlign(TextAlign.Center)
                      .layoutWeight(1)
                  }, (w: string) => w)
                }
                .width('100%')

                Grid() {
                  ForEach(this.buildCells(), (cell: GridCell) => {
                    GridItem() {
                      if (cell.day <= 0) {
                        Column().aspectRatio(1)
                      } else if (cell.hex === '') {
                        Column() {
                          Text(`${cell.day}`)
                            .fontSize(13)
                            .fontColor('#4A4A4E')
                        }
                        .width('100%')
                        .aspectRatio(1)
                        .justifyContent(FlexAlign.Center)
                        .backgroundColor('#1E1E22')
                        .borderRadius(12)
                        .onClick(() => {
                          this.selectDay(cell);
                        })
                      } else {
                        Stack() {
                          Column()
                            .width('100%')
                            .height('100%')
                            .backgroundColor(cell.hex)
                          Text(`${cell.day}`)
                            .fontSize(14)
                            .fontWeight(FontWeight.Medium)
                            .fontColor(this.cellTextColor(cell.hex))
                        }
                        .width('100%')
                        .aspectRatio(1)
                        .borderRadius(12)
                        .border({
                          width: this.selectedKey === cell.key ? 2.5 : 0,
                          color: Color.White
                        })
                        .onClick(() => {
                          this.selectDay(cell);
                        })
                      }
                    }
                  }, (cell: GridCell) => `${cell.key}_${cell.day}`)
                }
                .columnsTemplate('1fr 1fr 1fr 1fr 1fr 1fr 1fr')
                .columnsGap(7)
                .rowsGap(7)
                .width('100%')
              }
              .padding(18)
              .backgroundColor('#151518')
              .borderRadius(22)
              .width('100%')

              // 选中日详情
              if (this.selectedKey !== '' && this.dayPhotos.length > 0) {
                Column({ space: 10 }) {
                  Text(this.selectedLabel())
                    .fontSize(14)
                    .fontColor('#BDBDBD')
                  Scroll() {
                    Row({ space: 10 }) {
                      ForEach(this.dayPhotos, (p: PhotoInfo) => {
                        Image(`file://${p.localPath}`)
                          .width(96)
                          .height(96)
                          .borderRadius(14)
                          .objectFit(ImageFit.Cover)
                      }, (p: PhotoInfo) => `${p.id}`)
                    }
                  }
                  .scrollable(ScrollDirection.Horizontal)
                  .scrollBar(BarState.Off)
                  .width('100%')
                }
                .width('100%')
                .margin({ top: 18 })
              }

              Text('每一天，都有它的颜色。')
                .fontSize(14)
                .fontColor('#8A8A8E')
                .letterSpacing(2)
                .margin({ top: 26 })
            }
            .padding({ left: 16, right: 16, bottom: 30 })
          }
          .layoutWeight(1)
          .scrollBar(BarState.Off)
          .align(Alignment.Top)
        }
      }
      .width('100%')
      .height('100%')
      .backgroundColor('#0D0D0F')
        .opacity(this.pageIn ? 1 : 0)
        .translate({ y: this.pageIn ? 0 : 14 })

      // 导出预览浮层
      if (this.exportShow && this.exportPm !== null) {
        Stack() {
          Column()
            .width('100%')
            .height('100%')
            .backgroundColor('rgba(0,0,0,0.75)')
            .onClick(() => {
              this.exportShow = false;
            })

          Column({ space: 16 }) {
            Image(this.exportPm)
              .width('72%')
              .borderRadius(18)
              .shadow({ radius: 24, color: 'rgba(0,0,0,0.6)' })
            Row({ space: 14 }) {
              SaveButton({ text: SaveDescription.SAVE_IMAGE, buttonType: ButtonType.Capsule })
                .onClick((event: ClickEvent, result: SaveButtonOnClickResult) => {
                  if (result === SaveButtonOnClickResult.SUCCESS) {
                    this.saveExportToAlbum();
                  } else {
                    promptAction.showToast({ message: '未授权保存到相册' });
                  }
                })
              Text('完成')
                .fontSize(15)
                .fontColor(Color.White)
                .height(40)
                .padding({ left: 22, right: 22 })
                .textAlign(TextAlign.Center)
                .backgroundColor('rgba(255,255,255,0.14)')
                .borderRadius(20)
                .onClick(() => {
                  this.exportShow = false;
                })
            }
          }
          .justifyContent(FlexAlign.Center)
        }
        .width('100%')
        .height('100%')
      }
    }
    .width('100%')
    .height('100%')
  }
}
