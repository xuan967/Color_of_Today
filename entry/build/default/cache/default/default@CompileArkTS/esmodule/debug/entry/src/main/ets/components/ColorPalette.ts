if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface ColorPaletteSheet_Params {
    activeColor?: ColorPreset;
    isCustom?: boolean;
    onLive?: (p: ColorPreset) => void;
    onApply?: (p: ColorPreset) => void;
    onRestoreDaily?: () => void;
    onOpenCollection?: () => void;
    onClose?: () => void;
    hue?: number;
    sat?: number;
    thr?: number;
    boost?: number;
    draftHex?: string;
}
import { COLOR_PRESETS } from "@normalized:N&&&entry/src/main/ets/model/ColorPreset&";
import type { ColorPreset } from "@normalized:N&&&entry/src/main/ets/model/ColorPreset&";
import { hsvToHex } from "@normalized:N&&&entry/src/main/ets/utils/ColorUtil&";
export class ColorPaletteSheet extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.activeColor = COLOR_PRESETS[0];
        this.isCustom = false;
        this.onLive = () => { };
        this.onApply = () => { };
        this.onRestoreDaily = () => { };
        this.onOpenCollection = () => { };
        this.onClose = () => { };
        this.__hue = new ObservedPropertySimplePU(0.62, this, "hue");
        this.__sat = new ObservedPropertySimplePU(0.75, this, "sat");
        this.__thr = new ObservedPropertySimplePU(0.05, this, "thr");
        this.__boost = new ObservedPropertySimplePU(1.2, this, "boost");
        this.__draftHex = new ObservedPropertySimplePU('#8A2BE2', this, "draftHex");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ColorPaletteSheet_Params) {
        if (params.activeColor !== undefined) {
            this.activeColor = params.activeColor;
        }
        if (params.isCustom !== undefined) {
            this.isCustom = params.isCustom;
        }
        if (params.onLive !== undefined) {
            this.onLive = params.onLive;
        }
        if (params.onApply !== undefined) {
            this.onApply = params.onApply;
        }
        if (params.onRestoreDaily !== undefined) {
            this.onRestoreDaily = params.onRestoreDaily;
        }
        if (params.onOpenCollection !== undefined) {
            this.onOpenCollection = params.onOpenCollection;
        }
        if (params.onClose !== undefined) {
            this.onClose = params.onClose;
        }
        if (params.hue !== undefined) {
            this.hue = params.hue;
        }
        if (params.sat !== undefined) {
            this.sat = params.sat;
        }
        if (params.thr !== undefined) {
            this.thr = params.thr;
        }
        if (params.boost !== undefined) {
            this.boost = params.boost;
        }
        if (params.draftHex !== undefined) {
            this.draftHex = params.draftHex;
        }
    }
    updateStateVars(params: ColorPaletteSheet_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__hue.purgeDependencyOnElmtId(rmElmtId);
        this.__sat.purgeDependencyOnElmtId(rmElmtId);
        this.__thr.purgeDependencyOnElmtId(rmElmtId);
        this.__boost.purgeDependencyOnElmtId(rmElmtId);
        this.__draftHex.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__hue.aboutToBeDeleted();
        this.__sat.aboutToBeDeleted();
        this.__thr.aboutToBeDeleted();
        this.__boost.aboutToBeDeleted();
        this.__draftHex.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private activeColor: ColorPreset;
    private isCustom: boolean;
    private onLive: (p: ColorPreset) => void;
    private onApply: (p: ColorPreset) => void;
    private onRestoreDaily: () => void;
    private onOpenCollection: () => void;
    private onClose: () => void;
    private __hue: ObservedPropertySimplePU<number>;
    get hue() {
        return this.__hue.get();
    }
    set hue(newValue: number) {
        this.__hue.set(newValue);
    }
    private __sat: ObservedPropertySimplePU<number>;
    get sat() {
        return this.__sat.get();
    }
    set sat(newValue: number) {
        this.__sat.set(newValue);
    }
    private __thr: ObservedPropertySimplePU<number>;
    get thr() {
        return this.__thr.get();
    }
    set thr(newValue: number) {
        this.__thr.set(newValue);
    }
    private __boost: ObservedPropertySimplePU<number>;
    get boost() {
        return this.__boost.get();
    }
    set boost(newValue: number) {
        this.__boost.set(newValue);
    }
    private __draftHex: ObservedPropertySimplePU<string>;
    get draftHex() {
        return this.__draftHex.get();
    }
    set draftHex(newValue: string) {
        this.__draftHex.set(newValue);
    }
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
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 16 });
            Column.padding({ left: 20, right: 20, top: 18, bottom: 34 });
            Column.backgroundColor('rgba(18,18,20,0.94)');
            Column.borderRadius({ topLeft: 24, topRight: 24 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 标题行
            Row.create();
            // 标题行
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('限定色调色盘');
            Text.fontSize(17);
            Text.fontWeight(FontWeight.Medium);
            Text.fontColor(Color.White);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.isCustom) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('恢复今日色');
                        Text.fontSize(13);
                        Text.fontColor(this.activeColor.hex === '#FFFFFF' ? Color.White : this.activeColor.hex);
                        Text.padding({ left: 12, right: 12, top: 6, bottom: 6 });
                        Text.borderRadius(14);
                        Text.backgroundColor('rgba(255,255,255,0.10)');
                        Text.onClick(() => {
                            this.onRestoreDaily();
                            this.onClose();
                        });
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('×');
            Text.fontSize(20);
            Text.fontColor('rgba(255,255,255,0.9)');
            Text.width(32);
            Text.height(32);
            Text.textAlign(TextAlign.Center);
            Text.margin({ left: 8 });
            Text.onClick(() => {
                this.onClose();
            });
        }, Text);
        Text.pop();
        // 标题行
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 图鉴入口（隐蔽而克制）
            Row.create();
            // 图鉴入口（隐蔽而克制）
            Row.width('100%');
            // 图鉴入口（隐蔽而克制）
            Row.padding({ left: 14, right: 14, top: 10, bottom: 10 });
            // 图鉴入口（隐蔽而克制）
            Row.backgroundColor('rgba(255,255,255,0.07)');
            // 图鉴入口（隐蔽而克制）
            Row.borderRadius(14);
            // 图鉴入口（隐蔽而克制）
            Row.onClick(() => {
                this.onOpenCollection();
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('东方色彩图鉴');
            Text.fontSize(13);
            Text.fontColor('rgba(255,255,255,0.85)');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('›');
            Text.fontSize(14);
            Text.fontColor('rgba(255,255,255,0.5)');
        }, Text);
        Text.pop();
        // 图鉴入口（隐蔽而克制）
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 预设色板 5 列
            Grid.create();
            // 预设色板 5 列
            Grid.columnsTemplate('1fr 1fr 1fr 1fr 1fr');
            // 预设色板 5 列
            Grid.rowsGap(6);
            // 预设色板 5 列
            Grid.height(196);
            // 预设色板 5 列
            Grid.scrollBar(BarState.Off);
            // 预设色板 5 列
            Grid.width('100%');
        }, Grid);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const p = _item;
                {
                    const itemCreation2 = (elmtId, isInitialRender) => {
                        GridItem.create(() => { }, false);
                    };
                    const observedDeepRender = () => {
                        this.observeComponentCreation2(itemCreation2, GridItem);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Column.create();
                            Column.width('100%');
                            Column.height(44);
                            Column.justifyContent(FlexAlign.Center);
                            Column.onClick(() => {
                                this.applyPreset(p);
                            });
                        }, Column);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Column.create();
                            Column.width(34);
                            Column.height(34);
                            Column.borderRadius(17);
                            Column.backgroundColor(p.hex);
                            Column.border({
                                width: this.activeColor.id === p.id ? 2.5 : 0,
                                color: Color.White
                            });
                        }, Column);
                        Column.pop();
                        Column.pop();
                        GridItem.pop();
                    };
                    observedDeepRender();
                }
            };
            this.forEachUpdateFunction(elmtId, COLOR_PRESETS, forEachItemGenFunction, (p: ColorPreset) => `${p.id}`, false, false);
        }, ForEach);
        ForEach.pop();
        // 预设色板 5 列
        Grid.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 色相滑杆（渐变轨道）
            Column.create({ space: 6 });
            // 色相滑杆（渐变轨道）
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(14);
            Row.borderRadius(7);
            Row.linearGradient({
                angle: 90,
                colors: this.hueGradient().map((c: string) => [c, 1.0]) as Array<[
                    ResourceColor,
                    number
                ]>
            });
        }, Row);
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Slider.create({ value: Math.round(this.hue * 360), min: 0, max: 360, step: 1, style: SliderStyle.OutSet });
            Slider.width('100%');
            Slider.trackColor(Color.Transparent);
            Slider.selectedColor(Color.Transparent);
            Slider.blockColor(Color.White);
            Slider.onChange((value: number) => {
                this.hue = value / 360;
                this.emitLive();
            });
        }, Slider);
        Stack.pop();
        // 色相滑杆（渐变轨道）
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 容差滑杆
            Row.create();
            // 容差滑杆
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('容差');
            Text.fontSize(13);
            Text.fontColor('rgba(255,255,255,0.75)');
            Text.width(44);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Slider.create({ value: this.thr, min: 0.02, max: 0.12, step: 0.005, style: SliderStyle.OutSet });
            Slider.layoutWeight(1);
            Slider.trackColor('rgba(255,255,255,0.20)');
            Slider.selectedColor(Color.White);
            Slider.blockColor(Color.White);
            Slider.onChange((value: number) => {
                this.thr = Math.round(value * 1000) / 1000;
                this.emitLive();
            });
        }, Slider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.thr.toFixed(3)}`);
            Text.fontSize(12);
            Text.fontColor('rgba(255,255,255,0.85)');
            Text.width(44);
            Text.textAlign(TextAlign.End);
        }, Text);
        Text.pop();
        // 容差滑杆
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 饱和度增益滑杆
            Row.create();
            // 饱和度增益滑杆
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('浓度');
            Text.fontSize(13);
            Text.fontColor('rgba(255,255,255,0.75)');
            Text.width(44);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Slider.create({ value: this.boost, min: 1.0, max: 2.0, step: 0.05, style: SliderStyle.OutSet });
            Slider.layoutWeight(1);
            Slider.trackColor('rgba(255,255,255,0.20)');
            Slider.selectedColor(Color.White);
            Slider.blockColor(Color.White);
            Slider.onChange((value: number) => {
                this.boost = Math.round(value * 100) / 100;
                this.emitLive();
            });
        }, Slider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.boost.toFixed(2)}x`);
            Text.fontSize(12);
            Text.fontColor('rgba(255,255,255,0.85)');
            Text.width(44);
            Text.textAlign(TextAlign.End);
        }, Text);
        Text.pop();
        // 饱和度增益滑杆
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 应用按钮
            Text.create('使用此颜色');
            // 应用按钮
            Text.fontSize(15);
            // 应用按钮
            Text.fontWeight(FontWeight.Medium);
            // 应用按钮
            Text.fontColor('#0A0A0A');
            // 应用按钮
            Text.width('100%');
            // 应用按钮
            Text.height(44);
            // 应用按钮
            Text.textAlign(TextAlign.Center);
            // 应用按钮
            Text.backgroundColor(this.draftHex);
            // 应用按钮
            Text.borderRadius(22);
            // 应用按钮
            Text.onClick(() => {
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
            });
        }, Text);
        // 应用按钮
        Text.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
