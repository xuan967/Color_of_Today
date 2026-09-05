if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface Gallery_Params {
    photos?: PhotoInfo[];
    viewing?: PhotoInfo | null;
    pageIn?: boolean;
    today?: ColorPreset;
}
import promptAction from "@ohos:promptAction";
import router from "@ohos:router";
import { COLOR_PRESETS } from "@normalized:N&&&entry/src/main/ets/model/ColorPreset&";
import type { ColorPreset } from "@normalized:N&&&entry/src/main/ets/model/ColorPreset&";
import { DailyColorManager } from "@normalized:N&&&entry/src/main/ets/manager/DailyColorManager&";
import { PhotoDao } from "@normalized:N&&&entry/src/main/ets/model/PhotoDao&";
import type { PhotoInfo } from "@normalized:N&&&entry/src/main/ets/model/PhotoDao&";
import { CaptureService } from "@normalized:N&&&entry/src/main/ets/service/CaptureService&";
class Gallery extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__photos = new ObservedPropertyObjectPU([], this, "photos");
        this.__viewing = new ObservedPropertyObjectPU(null, this, "viewing");
        this.__pageIn = new ObservedPropertySimplePU(false, this, "pageIn");
        this.__today = new ObservedPropertyObjectPU(COLOR_PRESETS[0], this, "today");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: Gallery_Params) {
        if (params.photos !== undefined) {
            this.photos = params.photos;
        }
        if (params.viewing !== undefined) {
            this.viewing = params.viewing;
        }
        if (params.pageIn !== undefined) {
            this.pageIn = params.pageIn;
        }
        if (params.today !== undefined) {
            this.today = params.today;
        }
    }
    updateStateVars(params: Gallery_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__photos.purgeDependencyOnElmtId(rmElmtId);
        this.__viewing.purgeDependencyOnElmtId(rmElmtId);
        this.__pageIn.purgeDependencyOnElmtId(rmElmtId);
        this.__today.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__photos.aboutToBeDeleted();
        this.__viewing.aboutToBeDeleted();
        this.__pageIn.aboutToBeDeleted();
        this.__today.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __photos: ObservedPropertyObjectPU<PhotoInfo[]>;
    get photos() {
        return this.__photos.get();
    }
    set photos(newValue: PhotoInfo[]) {
        this.__photos.set(newValue);
    }
    private __viewing: ObservedPropertyObjectPU<PhotoInfo | null>;
    get viewing() {
        return this.__viewing.get();
    }
    set viewing(newValue: PhotoInfo | null) {
        this.__viewing.set(newValue);
    }
    private __pageIn: ObservedPropertySimplePU<boolean>;
    get pageIn() {
        return this.__pageIn.get();
    }
    set pageIn(newValue: boolean) {
        this.__pageIn.set(newValue);
    }
    private __today: ObservedPropertyObjectPU<ColorPreset>;
    get today() {
        return this.__today.get();
    }
    set today(newValue: ColorPreset) {
        this.__today.set(newValue);
    }
    aboutToAppear(): void {
        this.today = DailyColorManager.getInstance().getActiveColor();
        this.refresh();
        setTimeout(() => {
            Context.animateTo({ duration: 340, curve: Curve.EaseOut }, () => {
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
            Column.backgroundColor('#FAFAFA');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 顶栏
            Row.create({ space: 10 });
            // 顶栏
            Row.width('100%');
            // 顶栏
            Row.height(56);
            // 顶栏
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
            Column.create();
            Column.width(14);
            Column.height(14);
            Column.borderRadius(7);
            Column.backgroundColor(this.today.hex);
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`今日相册 · ${this.today.name}`);
            Text.fontSize(17);
            Text.fontWeight(FontWeight.Medium);
            Text.fontColor('#1A1A1A');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 岁月色卡入口（隐蔽而优雅）
            Row.create({ space: 4 });
            // 岁月色卡入口（隐蔽而优雅）
            Row.padding({ left: 10, right: 10, top: 6, bottom: 6 });
            // 岁月色卡入口（隐蔽而优雅）
            Row.backgroundColor('#F0F0F2');
            // 岁月色卡入口（隐蔽而优雅）
            Row.borderRadius(14);
            // 岁月色卡入口（隐蔽而优雅）
            Row.onClick(() => {
                router.pushUrl({ url: 'pages/TimePalette' });
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(10);
            Column.height(10);
            Column.borderRadius(3);
            Column.backgroundColor(this.today.hex);
            Column.opacity(0.85);
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('岁月色卡');
            Text.fontSize(12);
            Text.fontColor('#616161');
        }, Text);
        Text.pop();
        // 岁月色卡入口（隐蔽而优雅）
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.photos.length} 张`);
            Text.fontSize(13);
            Text.fontColor('#9E9E9E');
        }, Text);
        Text.pop();
        // 顶栏
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.strokeWidth(0.5);
            Divider.color('#EEEEEE');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.photos.length === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 12 });
                        Column.width('100%');
                        Column.layoutWeight(1);
                        Column.justifyContent(FlexAlign.Center);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width(64);
                        Column.height(64);
                        Column.borderRadius(32);
                        Column.backgroundColor(this.today.hex);
                        Column.opacity(0.25);
                    }, Column);
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('今天还没有照片');
                        Text.fontSize(15);
                        Text.fontColor('#757575');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('回到取景页，拍下属于今天的颜色吧');
                        Text.fontSize(13);
                        Text.fontColor('#BDBDBD');
                    }, Text);
                    Text.pop();
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Grid.create();
                        Grid.columnsTemplate('1fr 1fr');
                        Grid.columnsGap(10);
                        Grid.rowsGap(10);
                        Grid.padding(14);
                        Grid.scrollBar(BarState.Off);
                        Grid.layoutWeight(1);
                    }, Grid);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const photo = _item;
                            {
                                const itemCreation2 = (elmtId, isInitialRender) => {
                                    GridItem.create(() => { }, false);
                                };
                                const observedDeepRender = () => {
                                    this.observeComponentCreation2(itemCreation2, GridItem);
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Image.create(`file://${photo.localPath}`);
                                        Image.width('100%');
                                        Image.aspectRatio(0.72);
                                        Image.objectFit(ImageFit.Cover);
                                        Image.borderRadius(14);
                                        Image.onClick(() => {
                                            this.viewing = photo;
                                        });
                                    }, Image);
                                    GridItem.pop();
                                };
                                observedDeepRender();
                            }
                        };
                        this.forEachUpdateFunction(elmtId, this.photos, forEachItemGenFunction, (photo: PhotoInfo) => `${photo.id}`, false, false);
                    }, ForEach);
                    ForEach.pop();
                    Grid.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 全屏查看
            if (this.viewing !== null) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Stack.create();
                        Stack.width('100%');
                        Stack.height('100%');
                        Stack.backgroundColor(Color.Black);
                    }, Stack);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Image.create(`file://${this.viewing.localPath}`);
                        Image.width('100%');
                        Image.height('100%');
                        Image.objectFit(ImageFit.Contain);
                    }, Image);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.padding({ left: 18, right: 18, bottom: 46 });
                        Row.position({ x: 0, y: '100%' });
                        Row.translate({ y: '-100%' });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('‹');
                        Text.fontSize(26);
                        Text.fontColor(Color.White);
                        Text.width(40);
                        Text.height(40);
                        Text.textAlign(TextAlign.Center);
                        Text.backgroundColor('rgba(0,0,0,0.35)');
                        Text.borderRadius(20);
                        Text.onClick(() => {
                            this.viewing = null;
                        });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                    }, Blank);
                    Blank.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('删除');
                        Text.fontSize(14);
                        Text.fontColor(Color.White);
                        Text.height(40);
                        Text.padding({ left: 18, right: 18 });
                        Text.textAlign(TextAlign.Center);
                        Text.backgroundColor('rgba(0,0,0,0.35)');
                        Text.borderRadius(20);
                        Text.onClick(() => {
                            this.deleteCurrent();
                        });
                    }, Text);
                    Text.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 2 });
                        Column.width('100%');
                        Column.padding({ top: 60 });
                        Column.hitTestBehavior(HitTestMode.None);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`${this.viewing.colorName} · ${this.viewing.colorHex}`);
                        Text.fontSize(14);
                        Text.fontColor(Color.White);
                        Text.shadow({ radius: 8, color: 'rgba(0,0,0,0.6)' });
                    }, Text);
                    Text.pop();
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
        return "Gallery";
    }
}
registerNamedRoute(() => new Gallery(undefined, {}), "", { bundleName: "com.coloroftoday.app", moduleName: "entry", pagePath: "pages/Gallery", pageFullPath: "entry/src/main/ets/pages/Gallery", integratedHsp: "false", moduleType: "followWithHap" });
