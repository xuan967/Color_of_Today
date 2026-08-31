if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface TimePalette_Params {
    monthOffset?: number;
    dayColorMap?: Map<string, string>;
    monthGroups?: Map<string, PhotoInfo[]>;
    loading?: boolean;
    selectedKey?: string;
    dayPhotos?: PhotoInfo[];
    exportPm?: image.PixelMap | null;
    exportShow?: boolean;
    exportBusy?: boolean;
    pageIn?: boolean;
}
import fs from "@ohos:file.fs";
import image from "@ohos:multimedia.image";
import promptAction from "@ohos:promptAction";
import router from "@ohos:router";
import { PhotoDao } from "@normalized:N&&&entry/src/main/ets/model/PhotoDao&";
import type { PhotoInfo } from "@normalized:N&&&entry/src/main/ets/model/PhotoDao&";
import { DailyColorManager } from "@normalized:N&&&entry/src/main/ets/manager/DailyColorManager&";
import { extractDayColor } from "@normalized:N&&&entry/src/main/ets/utils/ColorExtract&";
import { renderPaletteCard } from "@normalized:N&&&entry/src/main/ets/utils/CanvasExporter&";
import type { PaletteDay } from "@normalized:N&&&entry/src/main/ets/utils/CanvasExporter&";
import { CaptureService } from "@normalized:N&&&entry/src/main/ets/service/CaptureService&";
import { hexToRgb } from "@normalized:N&&&entry/src/main/ets/utils/ColorUtil&";
interface GridCell {
    day: number; // 0 表示月首留白
    key: string;
    hex: string;
}
interface MonthRange {
    start: string;
    end: string;
}
class TimePalette extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__monthOffset = new ObservedPropertySimplePU(0, this, "monthOffset");
        this.__dayColorMap = new ObservedPropertyObjectPU(new Map(), this, "dayColorMap");
        this.__monthGroups = new ObservedPropertyObjectPU(new Map(), this, "monthGroups");
        this.__loading = new ObservedPropertySimplePU(true, this, "loading");
        this.__selectedKey = new ObservedPropertySimplePU('', this, "selectedKey");
        this.__dayPhotos = new ObservedPropertyObjectPU([], this, "dayPhotos");
        this.__exportPm = new ObservedPropertyObjectPU(null, this, "exportPm");
        this.__exportShow = new ObservedPropertySimplePU(false, this, "exportShow");
        this.__exportBusy = new ObservedPropertySimplePU(false, this, "exportBusy");
        this.__pageIn = new ObservedPropertySimplePU(false, this, "pageIn");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: TimePalette_Params) {
        if (params.monthOffset !== undefined) {
            this.monthOffset = params.monthOffset;
        }
        if (params.dayColorMap !== undefined) {
            this.dayColorMap = params.dayColorMap;
        }
        if (params.monthGroups !== undefined) {
            this.monthGroups = params.monthGroups;
        }
        if (params.loading !== undefined) {
            this.loading = params.loading;
        }
        if (params.selectedKey !== undefined) {
            this.selectedKey = params.selectedKey;
        }
        if (params.dayPhotos !== undefined) {
            this.dayPhotos = params.dayPhotos;
        }
        if (params.exportPm !== undefined) {
            this.exportPm = params.exportPm;
        }
        if (params.exportShow !== undefined) {
            this.exportShow = params.exportShow;
        }
        if (params.exportBusy !== undefined) {
            this.exportBusy = params.exportBusy;
        }
        if (params.pageIn !== undefined) {
            this.pageIn = params.pageIn;
        }
    }
    updateStateVars(params: TimePalette_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__monthOffset.purgeDependencyOnElmtId(rmElmtId);
        this.__dayColorMap.purgeDependencyOnElmtId(rmElmtId);
        this.__monthGroups.purgeDependencyOnElmtId(rmElmtId);
        this.__loading.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedKey.purgeDependencyOnElmtId(rmElmtId);
        this.__dayPhotos.purgeDependencyOnElmtId(rmElmtId);
        this.__exportPm.purgeDependencyOnElmtId(rmElmtId);
        this.__exportShow.purgeDependencyOnElmtId(rmElmtId);
        this.__exportBusy.purgeDependencyOnElmtId(rmElmtId);
        this.__pageIn.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__monthOffset.aboutToBeDeleted();
        this.__dayColorMap.aboutToBeDeleted();
        this.__monthGroups.aboutToBeDeleted();
        this.__loading.aboutToBeDeleted();
        this.__selectedKey.aboutToBeDeleted();
        this.__dayPhotos.aboutToBeDeleted();
        this.__exportPm.aboutToBeDeleted();
        this.__exportShow.aboutToBeDeleted();
        this.__exportBusy.aboutToBeDeleted();
        this.__pageIn.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __monthOffset: ObservedPropertySimplePU<number>; // 0=本月，-1=上月
    get monthOffset() {
        return this.__monthOffset.get();
    }
    set monthOffset(newValue: number) {
        this.__monthOffset.set(newValue);
    }
    private __dayColorMap: ObservedPropertyObjectPU<Map<string, string>>;
    get dayColorMap() {
        return this.__dayColorMap.get();
    }
    set dayColorMap(newValue: Map<string, string>) {
        this.__dayColorMap.set(newValue);
    }
    private __monthGroups: ObservedPropertyObjectPU<Map<string, PhotoInfo[]>>;
    get monthGroups() {
        return this.__monthGroups.get();
    }
    set monthGroups(newValue: Map<string, PhotoInfo[]>) {
        this.__monthGroups.set(newValue);
    }
    private __loading: ObservedPropertySimplePU<boolean>;
    get loading() {
        return this.__loading.get();
    }
    set loading(newValue: boolean) {
        this.__loading.set(newValue);
    }
    private __selectedKey: ObservedPropertySimplePU<string>;
    get selectedKey() {
        return this.__selectedKey.get();
    }
    set selectedKey(newValue: string) {
        this.__selectedKey.set(newValue);
    }
    private __dayPhotos: ObservedPropertyObjectPU<PhotoInfo[]>;
    get dayPhotos() {
        return this.__dayPhotos.get();
    }
    set dayPhotos(newValue: PhotoInfo[]) {
        this.__dayPhotos.set(newValue);
    }
    private __exportPm: ObservedPropertyObjectPU<image.PixelMap | null>;
    get exportPm() {
        return this.__exportPm.get();
    }
    set exportPm(newValue: image.PixelMap | null) {
        this.__exportPm.set(newValue);
    }
    private __exportShow: ObservedPropertySimplePU<boolean>;
    get exportShow() {
        return this.__exportShow.get();
    }
    set exportShow(newValue: boolean) {
        this.__exportShow.set(newValue);
    }
    private __exportBusy: ObservedPropertySimplePU<boolean>;
    get exportBusy() {
        return this.__exportBusy.get();
    }
    set exportBusy(newValue: boolean) {
        this.__exportBusy.set(newValue);
    }
    private __pageIn: ObservedPropertySimplePU<boolean>;
    get pageIn() {
        return this.__pageIn.get();
    }
    set pageIn(newValue: boolean) {
        this.__pageIn.set(newValue);
    }
    aboutToAppear(): void {
        this.loadMonth();
        setTimeout(() => {
            Context.animateTo({ duration: 340, curve: Curve.EaseOut }, () => {
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
            }
            else if (dayKeys.length > 0) {
                this.selectedKey = dayKeys[dayKeys.length - 1];
            }
            this.dayPhotos = this.photosOf(this.selectedKey);
        }
        finally {
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
        }
        catch (err) {
            promptAction.showToast({ message: '生成失败，请重试' });
        }
        finally {
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
            }
            else {
                promptAction.showToast({ message: '保存到相册失败' });
            }
        }
        catch (err) {
            promptAction.showToast({ message: '保存失败' });
        }
    }
    private cellTextColor(hex: string): string {
        const rgb = hexToRgb(hex);
        const lum = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
        return lum > 0.55 ? '#1A1A1A' : '#F5F5F5';
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#0D0D0F');
            Column.opacity(this.pageIn ? 1 : 0);
            Column.translate({ y: this.pageIn ? 0 : 14 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 顶部导航
            Row.create({ space: 8 });
            // 顶部导航
            Row.width('100%');
            // 顶部导航
            Row.height(52);
            // 顶部导航
            Row.padding({ left: 12, right: 16 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('‹');
            Text.fontSize(26);
            Text.fontColor('#1A1A1A');
            Text.width(36);
            Text.height(36);
            Text.textAlign(TextAlign.Center);
            Text.onClick(() => {
                router.back();
            });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('‹');
            Text.fontSize(20);
            Text.fontColor('#616161');
            Text.width(40);
            Text.height(36);
            Text.textAlign(TextAlign.Center);
            Text.onClick(() => {
                this.monthOffset--;
                this.loadMonth();
            });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.monthLabel());
            Text.fontSize(17);
            Text.fontWeight(FontWeight.Medium);
            Text.fontColor('#1A1A1A');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('›');
            Text.fontSize(20);
            Text.fontColor('#616161');
            Text.width(40);
            Text.height(36);
            Text.textAlign(TextAlign.Center);
            Text.onClick(() => {
                this.monthOffset++;
                this.loadMonth();
            });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('导出');
            Text.fontSize(13);
            Text.fontColor('#FFFFFF');
            Text.padding({ left: 14, right: 14, top: 7, bottom: 7 });
            Text.backgroundColor('#1A1A1A');
            Text.borderRadius(16);
            Text.opacity(this.exportBusy ? 0.5 : 1);
            Text.onClick(() => {
                this.doExport();
            });
        }, Text);
        Text.pop();
        // 顶部导航
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.loading) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 10 });
                        Column.width('100%');
                        Column.layoutWeight(1);
                        Column.justifyContent(FlexAlign.Center);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        LoadingProgress.create();
                        LoadingProgress.width(34);
                        LoadingProgress.height(34);
                        LoadingProgress.color('#9E9E9E');
                    }, LoadingProgress);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('正在为每一天着色…');
                        Text.fontSize(13);
                        Text.fontColor('#9E9E9E');
                    }, Text);
                    Text.pop();
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Scroll.create();
                        Scroll.layoutWeight(1);
                        Scroll.scrollBar(BarState.Off);
                        Scroll.align(Alignment.Top);
                    }, Scroll);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.padding({ left: 16, right: 16, bottom: 30 });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        // 色卡主体
                        Column.create({ space: 10 });
                        // 色卡主体
                        Column.padding(18);
                        // 色卡主体
                        Column.backgroundColor('#151518');
                        // 色卡主体
                        Column.borderRadius(22);
                        // 色卡主体
                        Column.width('100%');
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width(12);
                        Column.height(12);
                        Column.borderRadius(6);
                        Column.backgroundColor(DailyColorManager.getInstance().getActiveColor().hex);
                    }, Column);
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.monthLabel());
                        Text.fontSize(22);
                        Text.fontWeight(FontWeight.Medium);
                        Text.fontColor('#F5F5F5');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                    }, Blank);
                    Blank.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('岁月色卡');
                        Text.fontSize(13);
                        Text.fontColor('#9E9E9E');
                    }, Text);
                    Text.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const w = _item;
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create(w);
                                Text.fontSize(12);
                                Text.fontColor('#757575');
                                Text.textAlign(TextAlign.Center);
                                Text.layoutWeight(1);
                            }, Text);
                            Text.pop();
                        };
                        this.forEachUpdateFunction(elmtId, ['一', '二', '三', '四', '五', '六', '日'], forEachItemGenFunction, (w: string) => w, false, false);
                    }, ForEach);
                    ForEach.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Grid.create();
                        Grid.columnsTemplate('1fr 1fr 1fr 1fr 1fr 1fr 1fr');
                        Grid.columnsGap(7);
                        Grid.rowsGap(7);
                        Grid.width('100%');
                    }, Grid);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const cell = _item;
                            {
                                const itemCreation2 = (elmtId, isInitialRender) => {
                                    GridItem.create(() => { }, false);
                                };
                                const observedDeepRender = () => {
                                    this.observeComponentCreation2(itemCreation2, GridItem);
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        If.create();
                                        if (cell.day <= 0) {
                                            this.ifElseBranchUpdateFunction(0, () => {
                                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                    Column.create();
                                                    Column.aspectRatio(1);
                                                }, Column);
                                                Column.pop();
                                            });
                                        }
                                        else if (cell.hex === '') {
                                            this.ifElseBranchUpdateFunction(1, () => {
                                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                    Column.create();
                                                    Column.width('100%');
                                                    Column.aspectRatio(1);
                                                    Column.justifyContent(FlexAlign.Center);
                                                    Column.backgroundColor('#1E1E22');
                                                    Column.borderRadius(12);
                                                    Column.onClick(() => {
                                                        this.selectDay(cell);
                                                    });
                                                }, Column);
                                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                    Text.create(`${cell.day}`);
                                                    Text.fontSize(13);
                                                    Text.fontColor('#4A4A4E');
                                                }, Text);
                                                Text.pop();
                                                Column.pop();
                                            });
                                        }
                                        else {
                                            this.ifElseBranchUpdateFunction(2, () => {
                                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                    Stack.create();
                                                    Stack.width('100%');
                                                    Stack.aspectRatio(1);
                                                    Stack.borderRadius(12);
                                                    Stack.border({
                                                        width: this.selectedKey === cell.key ? 2.5 : 0,
                                                        color: Color.White
                                                    });
                                                    Stack.onClick(() => {
                                                        this.selectDay(cell);
                                                    });
                                                }, Stack);
                                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                    Column.create();
                                                    Column.width('100%');
                                                    Column.height('100%');
                                                    Column.backgroundColor(cell.hex);
                                                }, Column);
                                                Column.pop();
                                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                    Text.create(`${cell.day}`);
                                                    Text.fontSize(14);
                                                    Text.fontWeight(FontWeight.Medium);
                                                    Text.fontColor(this.cellTextColor(cell.hex));
                                                }, Text);
                                                Text.pop();
                                                Stack.pop();
                                            });
                                        }
                                    }, If);
                                    If.pop();
                                    GridItem.pop();
                                };
                                observedDeepRender();
                            }
                        };
                        this.forEachUpdateFunction(elmtId, this.buildCells(), forEachItemGenFunction, (cell: GridCell) => `${cell.key}_${cell.day}`, false, false);
                    }, ForEach);
                    ForEach.pop();
                    Grid.pop();
                    // 色卡主体
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        // 选中日详情
                        if (this.selectedKey !== '' && this.dayPhotos.length > 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create({ space: 10 });
                                    Column.width('100%');
                                    Column.margin({ top: 18 });
                                }, Column);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(this.selectedLabel());
                                    Text.fontSize(14);
                                    Text.fontColor('#BDBDBD');
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Scroll.create();
                                    Scroll.scrollable(ScrollDirection.Horizontal);
                                    Scroll.scrollBar(BarState.Off);
                                    Scroll.width('100%');
                                }, Scroll);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create({ space: 10 });
                                }, Row);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    ForEach.create();
                                    const forEachItemGenFunction = _item => {
                                        const p = _item;
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            Image.create(`file://${p.localPath}`);
                                            Image.width(96);
                                            Image.height(96);
                                            Image.borderRadius(14);
                                            Image.objectFit(ImageFit.Cover);
                                        }, Image);
                                    };
                                    this.forEachUpdateFunction(elmtId, this.dayPhotos, forEachItemGenFunction, (p: PhotoInfo) => `${p.id}`, false, false);
                                }, ForEach);
                                ForEach.pop();
                                Row.pop();
                                Scroll.pop();
                                Column.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('每一天，都有它的颜色。');
                        Text.fontSize(14);
                        Text.fontColor('#8A8A8E');
                        Text.letterSpacing(2);
                        Text.margin({ top: 26 });
                    }, Text);
                    Text.pop();
                    Column.pop();
                    Scroll.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 导出预览浮层
            if (this.exportShow && this.exportPm !== null) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Stack.create();
                        Stack.width('100%');
                        Stack.height('100%');
                    }, Stack);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.height('100%');
                        Column.backgroundColor('rgba(0,0,0,0.75)');
                        Column.onClick(() => {
                            this.exportShow = false;
                        });
                    }, Column);
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 16 });
                        Column.justifyContent(FlexAlign.Center);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Image.create(this.exportPm);
                        Image.width('72%');
                        Image.borderRadius(18);
                        Image.shadow({ radius: 24, color: 'rgba(0,0,0,0.6)' });
                    }, Image);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 14 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        SaveButton.create({ text: SaveDescription.SAVE_IMAGE, buttonType: ButtonType.Capsule });
                        SaveButton.onClick((event: ClickEvent, result: SaveButtonOnClickResult) => {
                            if (result === SaveButtonOnClickResult.SUCCESS) {
                                this.saveExportToAlbum();
                            }
                            else {
                                promptAction.showToast({ message: '未授权保存到相册' });
                            }
                        });
                    }, SaveButton);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('完成');
                        Text.fontSize(15);
                        Text.fontColor(Color.White);
                        Text.height(40);
                        Text.padding({ left: 22, right: 22 });
                        Text.textAlign(TextAlign.Center);
                        Text.backgroundColor('rgba(255,255,255,0.14)');
                        Text.borderRadius(20);
                        Text.onClick(() => {
                            this.exportShow = false;
                        });
                    }, Text);
                    Text.pop();
                    Row.pop();
                    Column.pop();
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
    rerender() {
        this.updateDirtyElements();
    }
    static getEntryName(): string {
        return "TimePalette";
    }
}
registerNamedRoute(() => new TimePalette(undefined, {}), "", { bundleName: "com.coloroftoday.app", moduleName: "entry", pagePath: "pages/TimePalette", pageFullPath: "entry/src/main/ets/pages/TimePalette", integratedHsp: "false", moduleType: "followWithHap" });
