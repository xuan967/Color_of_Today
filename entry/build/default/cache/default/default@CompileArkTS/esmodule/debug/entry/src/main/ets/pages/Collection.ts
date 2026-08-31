if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface Collection_Params {
    colors?: OrientalColor[];
    unlocked?: Map<string, number>;
    unlockedCount?: number;
    lastUnlocked?: string;
    pageIn?: boolean;
    detail?: OrientalColor | null;
    detailCount?: number;
    detailDate?: string;
}
interface DetailGlow_Params {
    color?: OrientalColor;
    glow?: number;
}
interface CollectionCard_Params {
    color?: OrientalColor;
    unlocked?: boolean;
    isLatest?: boolean;
    count?: number;
    firstDateKey?: string;
    onOpen?: () => void;
    glow?: number;
}
import promptAction from "@ohos:promptAction";
import router from "@ohos:router";
import type { OrientalColor } from '../model/OrientalColor';
import { CollectionService } from "@normalized:N&&&entry/src/main/ets/service/CollectionService&";
import { PhotoDao } from "@normalized:N&&&entry/src/main/ets/model/PhotoDao&";
import { hexToRgb } from "@normalized:N&&&entry/src/main/ets/utils/ColorUtil&";
class CollectionCard extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__color = new SynchedPropertyObjectOneWayPU(params.color, this, "color");
        this.__unlocked = new SynchedPropertySimpleOneWayPU(params.unlocked, this, "unlocked");
        this.__isLatest = new SynchedPropertySimpleOneWayPU(params.isLatest, this, "isLatest");
        this.__count = new SynchedPropertySimpleOneWayPU(params.count, this, "count");
        this.__firstDateKey = new SynchedPropertySimpleOneWayPU(params.firstDateKey, this, "firstDateKey");
        this.onOpen = () => { };
        this.__glow = new ObservedPropertySimplePU(14, this, "glow");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: CollectionCard_Params) {
        if (params.onOpen !== undefined) {
            this.onOpen = params.onOpen;
        }
        if (params.glow !== undefined) {
            this.glow = params.glow;
        }
    }
    updateStateVars(params: CollectionCard_Params) {
        this.__color.reset(params.color);
        this.__unlocked.reset(params.unlocked);
        this.__isLatest.reset(params.isLatest);
        this.__count.reset(params.count);
        this.__firstDateKey.reset(params.firstDateKey);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__color.purgeDependencyOnElmtId(rmElmtId);
        this.__unlocked.purgeDependencyOnElmtId(rmElmtId);
        this.__isLatest.purgeDependencyOnElmtId(rmElmtId);
        this.__count.purgeDependencyOnElmtId(rmElmtId);
        this.__firstDateKey.purgeDependencyOnElmtId(rmElmtId);
        this.__glow.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__color.aboutToBeDeleted();
        this.__unlocked.aboutToBeDeleted();
        this.__isLatest.aboutToBeDeleted();
        this.__count.aboutToBeDeleted();
        this.__firstDateKey.aboutToBeDeleted();
        this.__glow.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __color: SynchedPropertySimpleOneWayPU<OrientalColor>;
    get color() {
        return this.__color.get();
    }
    set color(newValue: OrientalColor) {
        this.__color.set(newValue);
    }
    private __unlocked: SynchedPropertySimpleOneWayPU<boolean>;
    get unlocked() {
        return this.__unlocked.get();
    }
    set unlocked(newValue: boolean) {
        this.__unlocked.set(newValue);
    }
    private __isLatest: SynchedPropertySimpleOneWayPU<boolean>;
    get isLatest() {
        return this.__isLatest.get();
    }
    set isLatest(newValue: boolean) {
        this.__isLatest.set(newValue);
    }
    private __count: SynchedPropertySimpleOneWayPU<number>;
    get count() {
        return this.__count.get();
    }
    set count(newValue: number) {
        this.__count.set(newValue);
    }
    private __firstDateKey: SynchedPropertySimpleOneWayPU<string>;
    get firstDateKey() {
        return this.__firstDateKey.get();
    }
    set firstDateKey(newValue: string) {
        this.__firstDateKey.set(newValue);
    }
    private onOpen: () => void;
    private __glow: ObservedPropertySimplePU<number>;
    get glow() {
        return this.__glow.get();
    }
    set glow(newValue: number) {
        this.__glow.set(newValue);
    }
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
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.onClick(() => {
                this.onOpen();
            });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.unlocked) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Context.animation({ duration: 1150, curve: Curve.EaseInOut });
                        Column.width('100%');
                        Column.aspectRatio(0.82);
                        Column.justifyContent(FlexAlign.Center);
                        Column.backgroundColor(this.color.hex);
                        Column.borderRadius(16);
                        Column.shadow({
                            radius: this.glow,
                            color: `${this.color.hex}70`,
                            offsetY: 4
                        });
                        Context.animation(null);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.color.name);
                        Text.fontSize(17);
                        Text.fontWeight(FontWeight.Medium);
                        Text.fontColor(this.adaptiveText(this.color.hex));
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`${this.count} 次`);
                        Text.fontSize(11);
                        Text.fontColor(this.adaptiveText(this.color.hex) === '#1A1A1A'
                            ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.65)');
                    }, Text);
                    Text.pop();
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.color.poem);
                        Text.fontSize(11);
                        Text.fontColor('#8A8A8E');
                        Text.maxLines(1);
                        Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 4 });
                        Column.width('100%');
                        Column.aspectRatio(0.82);
                        Column.justifyContent(FlexAlign.Center);
                        Column.backgroundColor('#19191C');
                        Column.borderRadius(16);
                        Column.border({ width: 0.8, color: '#26262B' });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('？');
                        Text.fontSize(22);
                        Text.fontColor('#3A3A40');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('未遇见');
                        Text.fontSize(11);
                        Text.fontColor('#4A4A50');
                    }, Text);
                    Text.pop();
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('？ ？ ？');
                        Text.fontSize(11);
                        Text.fontColor('#3A3A40');
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
class DetailGlow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__color = new SynchedPropertyObjectOneWayPU(params.color, this, "color");
        this.__glow = new ObservedPropertySimplePU(18, this, "glow");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: DetailGlow_Params) {
        if (params.glow !== undefined) {
            this.glow = params.glow;
        }
    }
    updateStateVars(params: DetailGlow_Params) {
        this.__color.reset(params.color);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__color.purgeDependencyOnElmtId(rmElmtId);
        this.__glow.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__color.aboutToBeDeleted();
        this.__glow.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __color: SynchedPropertySimpleOneWayPU<OrientalColor>;
    get color() {
        return this.__color.get();
    }
    set color(newValue: OrientalColor) {
        this.__color.set(newValue);
    }
    private __glow: ObservedPropertySimplePU<number>;
    get glow() {
        return this.__glow.get();
    }
    set glow(newValue: number) {
        this.__glow.set(newValue);
    }
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
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Context.animation({ duration: 1250, curve: Curve.EaseInOut });
            Column.width(180);
            Column.height(180);
            Column.borderRadius(90);
            Column.backgroundColor(this.color.hex);
            Column.shadow({ radius: this.glow, color: `${this.color.hex}66` });
            Context.animation(null);
        }, Column);
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
class Collection extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__colors = new ObservedPropertyObjectPU([], this, "colors");
        this.__unlocked = new ObservedPropertyObjectPU(new Map(), this, "unlocked");
        this.__unlockedCount = new ObservedPropertySimplePU(0, this, "unlockedCount");
        this.__lastUnlocked = new ObservedPropertySimplePU('', this, "lastUnlocked");
        this.__pageIn = new ObservedPropertySimplePU(false, this, "pageIn");
        this.__detail = new ObservedPropertyObjectPU(null, this, "detail");
        this.__detailCount = new ObservedPropertySimplePU(0, this, "detailCount");
        this.__detailDate = new ObservedPropertySimplePU('', this, "detailDate");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: Collection_Params) {
        if (params.colors !== undefined) {
            this.colors = params.colors;
        }
        if (params.unlocked !== undefined) {
            this.unlocked = params.unlocked;
        }
        if (params.unlockedCount !== undefined) {
            this.unlockedCount = params.unlockedCount;
        }
        if (params.lastUnlocked !== undefined) {
            this.lastUnlocked = params.lastUnlocked;
        }
        if (params.pageIn !== undefined) {
            this.pageIn = params.pageIn;
        }
        if (params.detail !== undefined) {
            this.detail = params.detail;
        }
        if (params.detailCount !== undefined) {
            this.detailCount = params.detailCount;
        }
        if (params.detailDate !== undefined) {
            this.detailDate = params.detailDate;
        }
    }
    updateStateVars(params: Collection_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__colors.purgeDependencyOnElmtId(rmElmtId);
        this.__unlocked.purgeDependencyOnElmtId(rmElmtId);
        this.__unlockedCount.purgeDependencyOnElmtId(rmElmtId);
        this.__lastUnlocked.purgeDependencyOnElmtId(rmElmtId);
        this.__pageIn.purgeDependencyOnElmtId(rmElmtId);
        this.__detail.purgeDependencyOnElmtId(rmElmtId);
        this.__detailCount.purgeDependencyOnElmtId(rmElmtId);
        this.__detailDate.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__colors.aboutToBeDeleted();
        this.__unlocked.aboutToBeDeleted();
        this.__unlockedCount.aboutToBeDeleted();
        this.__lastUnlocked.aboutToBeDeleted();
        this.__pageIn.aboutToBeDeleted();
        this.__detail.aboutToBeDeleted();
        this.__detailCount.aboutToBeDeleted();
        this.__detailDate.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __colors: ObservedPropertyObjectPU<OrientalColor[]>;
    get colors() {
        return this.__colors.get();
    }
    set colors(newValue: OrientalColor[]) {
        this.__colors.set(newValue);
    }
    private __unlocked: ObservedPropertyObjectPU<Map<string, number>>;
    get unlocked() {
        return this.__unlocked.get();
    }
    set unlocked(newValue: Map<string, number>) {
        this.__unlocked.set(newValue);
    }
    private __unlockedCount: ObservedPropertySimplePU<number>;
    get unlockedCount() {
        return this.__unlockedCount.get();
    }
    set unlockedCount(newValue: number) {
        this.__unlockedCount.set(newValue);
    }
    private __lastUnlocked: ObservedPropertySimplePU<string>;
    get lastUnlocked() {
        return this.__lastUnlocked.get();
    }
    set lastUnlocked(newValue: string) {
        this.__lastUnlocked.set(newValue);
    }
    private __pageIn: ObservedPropertySimplePU<boolean>;
    get pageIn() {
        return this.__pageIn.get();
    }
    set pageIn(newValue: boolean) {
        this.__pageIn.set(newValue);
    }
    private __detail: ObservedPropertyObjectPU<OrientalColor | null>;
    get detail() {
        return this.__detail.get();
    }
    set detail(newValue: OrientalColor | null) {
        this.__detail.set(newValue);
    }
    private __detailCount: ObservedPropertySimplePU<number>;
    get detailCount() {
        return this.__detailCount.get();
    }
    set detailCount(newValue: number) {
        this.__detailCount.set(newValue);
    }
    private __detailDate: ObservedPropertySimplePU<string>;
    get detailDate() {
        return this.__detailDate.get();
    }
    set detailDate(newValue: string) {
        this.__detailDate.set(newValue);
    }
    aboutToAppear(): void {
        this.load();
        setTimeout(() => {
            Context.animateTo({ duration: 340, curve: Curve.EaseOut }, () => {
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
            // 顶栏
            Row.create({ space: 10 });
            // 顶栏
            Row.width('100%');
            // 顶栏
            Row.height(56);
            // 顶栏
            Row.padding({ left: 12, right: 20 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('‹');
            Text.fontSize(26);
            Text.fontColor('#F5F5F5');
            Text.width(36);
            Text.height(36);
            Text.textAlign(TextAlign.Center);
            Text.onClick(() => {
                router.back();
            });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('东方色彩图鉴');
            Text.fontSize(18);
            Text.fontWeight(FontWeight.Medium);
            Text.fontColor('#F5F5F5');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.unlockedCount} / ${this.colors.length}`);
            Text.fontSize(14);
            Text.fontColor('#8A8A8E');
        }, Text);
        Text.pop();
        // 顶栏
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('拍到即点亮 · 与三十种传统色相遇');
            Text.fontSize(12);
            Text.fontColor('#6A6A70');
            Text.width('100%');
            Text.padding({ left: 20, bottom: 12 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Grid.create();
            Grid.columnsTemplate('1fr 1fr 1fr');
            Grid.columnsGap(12);
            Grid.rowsGap(16);
            Grid.padding({ left: 18, right: 18 });
            Grid.scrollBar(BarState.Off);
            Grid.layoutWeight(1);
        }, Grid);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const c = _item;
                {
                    const itemCreation2 = (elmtId, isInitialRender) => {
                        GridItem.create(() => { }, false);
                    };
                    const observedDeepRender = () => {
                        this.observeComponentCreation2(itemCreation2, GridItem);
                        {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                if (isInitialRender) {
                                    let componentCall = new CollectionCard(this, {
                                        color: c,
                                        unlocked: this.unlocked.has(c.name),
                                        isLatest: this.lastUnlocked === c.name,
                                        count: this.unlocked.get(c.name) ?? 0,
                                        firstDateKey: '',
                                        onOpen: () => {
                                            if (this.unlocked.has(c.name)) {
                                                this.detail = c;
                                                this.detailCount = this.unlocked.get(c.name) ?? 0;
                                            }
                                            else {
                                                promptAction.showToast({ message: '继续拍摄，与它相遇。' });
                                            }
                                        }
                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Collection.ets", line: 209, col: 15 });
                                    ViewPU.create(componentCall);
                                    let paramsLambda = () => {
                                        return {
                                            color: c,
                                            unlocked: this.unlocked.has(c.name),
                                            isLatest: this.lastUnlocked === c.name,
                                            count: this.unlocked.get(c.name) ?? 0,
                                            firstDateKey: '',
                                            onOpen: () => {
                                                if (this.unlocked.has(c.name)) {
                                                    this.detail = c;
                                                    this.detailCount = this.unlocked.get(c.name) ?? 0;
                                                }
                                                else {
                                                    promptAction.showToast({ message: '继续拍摄，与它相遇。' });
                                                }
                                            }
                                        };
                                    };
                                    componentCall.paramsGenerator_ = paramsLambda;
                                }
                                else {
                                    this.updateStateVarsOfChildByElmtId(elmtId, {
                                        color: c,
                                        unlocked: this.unlocked.has(c.name),
                                        isLatest: this.lastUnlocked === c.name,
                                        count: this.unlocked.get(c.name) ?? 0,
                                        firstDateKey: ''
                                    });
                                }
                            }, { name: "CollectionCard" });
                        }
                        GridItem.pop();
                    };
                    observedDeepRender();
                }
            };
            this.forEachUpdateFunction(elmtId, this.colors, forEachItemGenFunction, (c: OrientalColor) => c.name, false, false);
        }, ForEach);
        ForEach.pop();
        Grid.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 点亮详情
            if (this.detail !== null) {
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
                        Column.backgroundColor('rgba(0,0,0,0.82)');
                        Column.onClick(() => {
                            this.detail = null;
                        });
                    }, Column);
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 14 });
                        Column.width('80%');
                    }, Column);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new DetailGlow(this, { color: this.detail }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Collection.ets", line: 252, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        color: this.detail
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    color: this.detail
                                });
                            }
                        }, { name: "DetailGlow" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.detail.name);
                        Text.fontSize(30);
                        Text.fontWeight(FontWeight.Medium);
                        Text.fontColor('#F5F5F5');
                        Text.letterSpacing(6);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.detail.poem);
                        Text.fontSize(15);
                        Text.fontColor('#C9C9CE');
                        Text.textAlign(TextAlign.Center);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.detail.mood);
                        Text.fontSize(12);
                        Text.fontColor('#7A7A80');
                        Text.textAlign(TextAlign.Center);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.detailCount > 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(`已遇见 ${this.detailCount} 次`);
                                    Text.fontSize(11);
                                    Text.fontColor('#5A5A60');
                                }, Text);
                                Text.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
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
        return "Collection";
    }
}
registerNamedRoute(() => new Collection(undefined, {}), "", { bundleName: "com.coloroftoday.app", moduleName: "entry", pagePath: "pages/Collection", pageFullPath: "entry/src/main/ets/pages/Collection", integratedHsp: "false", moduleType: "followWithHap" });
