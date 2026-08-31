import preferences from '@ohos.data.preferences';
import common from '@ohos.app.ability.common';
import { COLOR_PRESETS, ColorPreset } from '../model/ColorPreset';

const PREF_NAME = 'daily_color';
const KEY_DATE = 'date_key';
const KEY_INDEX = 'color_index';
const KEY_CUSTOM_HUE = 'custom_hue';
const KEY_CUSTOM_SAT = 'custom_sat';
const KEY_CUSTOM_THR = 'custom_thr';
const KEY_CUSTOM_HEX = 'custom_hex';
const KEY_CUSTOM_NAME = 'custom_name';
const KEY_CUSTOM_BOOST = 'custom_boost';

/**
 * 每日颜色生成器
 *
 * 策略（三层保障）：
 * 1. 确定性哈希：以本地日期键 YYYYMMDD 为种子做字符串哈希，映射到 20 色数组下标。
 *    纯函数、跨设备跨启动结果一致，不依赖存储也不会漂移。
 * 2. 避免撞色：若今日哈希结果与昨日相同，则顺延一位，保证“每天都是新颜色”。
 * 3. Preferences 缓存：当日首次生成后写入 date_key + color_index，
 *    后续启动直接读取，同时为将来“查看历史颜色”预留数据。
 */
export class DailyColorManager {
  private static instance: DailyColorManager | null = null;

  private pref: preferences.Preferences | null = null;
  private cachedDateKey: string = '';
  private cachedColor: ColorPreset = COLOR_PRESETS[0];

  static getInstance(): DailyColorManager {
    if (DailyColorManager.instance === null) {
      DailyColorManager.instance = new DailyColorManager();
    }
    return DailyColorManager.instance;
  }

  /** 幂等初始化：EntryAbility 启动时调用一次，页面兜底调用也安全 */
  async init(context: common.Context): Promise<void> {
    const todayKey = DailyColorManager.getDateKey(new Date());
    if (this.pref !== null && this.cachedDateKey === todayKey) {
      return;
    }
    const options: preferences.Options = { name: PREF_NAME };
    this.pref = await preferences.getPreferences(context, options);
    this.cachedDateKey = todayKey;

    const savedDate = await this.pref.get(KEY_DATE, '');
    const savedIndex = await this.pref.get(KEY_INDEX, -1);
    let index = -1;
    if (typeof savedDate === 'string' && savedDate === todayKey
      && typeof savedIndex === 'number') {
      index = Math.trunc(savedIndex);
    }
    if (index < 0 || index >= COLOR_PRESETS.length) {
      index = this.pickIndex(new Date());
      await this.pref.put(KEY_DATE, todayKey);
      await this.pref.put(KEY_INDEX, index);
      await this.pref.flush();
    }
    this.cachedColor = COLOR_PRESETS[index];
    await this.loadCustom();
  }

  /** 用户自定义颜色（调色盘选择），优先于每日随机色 */
  private customColor: ColorPreset | null = null;

  /** 当前生效颜色：自定义 > 每日随机 */
  getActiveColor(): ColorPreset {
    return this.customColor !== null ? this.customColor : this.cachedColor;
  }

  isCustomActive(): boolean {
    return this.customColor !== null;
  }

  private async loadCustom(): Promise<void> {
    if (this.pref === null) {
      return;
    }
    const hue = await this.pref.get(KEY_CUSTOM_HUE, -1);
    if (typeof hue === 'number' && hue >= 0 && hue <= 1) {
      const sat = await this.pref.get(KEY_CUSTOM_SAT, 0.75);
      const thr = await this.pref.get(KEY_CUSTOM_THR, 0.05);
      const hex = await this.pref.get(KEY_CUSTOM_HEX, '#8A2BE2');
      const name = await this.pref.get(KEY_CUSTOM_NAME, '自定义');
      const boost = await this.pref.get(KEY_CUSTOM_BOOST, 1.2);
      const preset: ColorPreset = {
        id: -1,
        name: typeof name === 'string' ? name : '自定义',
        nameEn: 'Custom',
        hex: typeof hex === 'string' ? hex : '#8A2BE2',
        hue: hue,
        threshold: typeof thr === 'number' ? thr : 0.05,
        saturationBoost: typeof boost === 'number' ? boost : 1.2,
        mood: '你选的颜色，就是今天的限定。'
      };
      this.customColor = preset;
    }
  }

  /** 应用并持久化自定义颜色 */
  async setCustomColor(context: common.Context, preset: ColorPreset): Promise<void> {
    if (this.pref === null) {
      const options: preferences.Options = { name: PREF_NAME };
      this.pref = await preferences.getPreferences(context, options);
    }
    this.customColor = preset;
    await this.pref.put(KEY_CUSTOM_HUE, preset.hue);
    await this.pref.put(KEY_CUSTOM_SAT, preset.saturationBoost);
    await this.pref.put(KEY_CUSTOM_THR, preset.threshold);
    await this.pref.put(KEY_CUSTOM_HEX, preset.hex);
    await this.pref.put(KEY_CUSTOM_NAME, preset.name);
    await this.pref.put(KEY_CUSTOM_BOOST, preset.saturationBoost);
    await this.pref.flush();
  }

  /** 清除自定义，恢复每日随机色 */
  async clearCustomColor(): Promise<void> {
    this.customColor = null;
    if (this.pref !== null) {
      await this.pref.put(KEY_CUSTOM_HUE, -1);
      await this.pref.flush();
    }
  }

  /** 获取今日主色调（init 完成后有效） */
  getColor(): ColorPreset {
    return this.cachedColor;
  }

  /** 本地日期键 YYYYMMDD，照片记录与“今日相册”查询共用同一格式 */
  static getDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}${m}${d}`;
  }

  /** 纯函数选色：今日哈希结果撞上昨日时顺延一位 */
  private pickIndex(today: Date): number {
    const todayIndex = DailyColorManager.hash(DailyColorManager.getDateKey(today))
      % COLOR_PRESETS.length;
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayIndex = DailyColorManager.hash(DailyColorManager.getDateKey(yesterday))
      % COLOR_PRESETS.length;
    return todayIndex === yesterdayIndex
      ? (todayIndex + 1) % COLOR_PRESETS.length
      : todayIndex;
  }

  private static hash(dateKey: string): number {
    let hash = 7;
    for (let i = 0; i < dateKey.length; i++) {
      hash = (hash * 31 + dateKey.charCodeAt(i)) % 2147483647;
    }
    return hash;
  }
}
