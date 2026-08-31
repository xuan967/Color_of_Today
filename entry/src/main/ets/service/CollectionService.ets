import common from '@ohos.app.ability.common';
import preferences from '@ohos.data.preferences';
import { OrientalColor, CollectionData, loadOrientalColors, matchOrientalColor } from '../model/OrientalColor';
import { PhotoDao } from '../model/PhotoDao';

const KEY_LAST_UNLOCK = 'last_unlocked_name';

/**
 * 图鉴收集服务：拍照时按当前取景色相匹配传统色，首次命中即“点亮”并记录。
 * 纯本地实现：匹配在内存、解锁状态在 RDB、最近点亮在 Preferences。
 */
export class CollectionService {
  /** 拍照后调用；返回本次新点亮的传统色（已解锁过则返回 null） */
  static async onPhotoCaptured(context: common.Context,
    activeHue: number, dateKey: string): Promise<OrientalColor | null> {
    try {
      const colors = await loadOrientalColors(context);
      const match = matchOrientalColor(colors, activeHue);
      if (match === null) {
        return null;
      }
      const dao = PhotoDao.getInstance();
      const known = await dao.getColorUnlock(match.name);
      if (known !== null) {
        await dao.increaseColorUnlock(match.name);
        return null;
      }
      await dao.unlockColor(match.name, match.hex, dateKey);
      const options: preferences.Options = { name: 'collection' };
      const pref = await preferences.getPreferences(context, options);
      await pref.put(KEY_LAST_UNLOCK, match.name);
      await pref.flush();
      return match;
    } catch (err) {
      console.error(`[TodayColor] collection unlock: ${JSON.stringify(err)}`);
      return null;
    }
  }

  /** 最近一次点亮的传统色（用于图鉴页呼吸光标记） */
  static async lastUnlockedName(context: common.Context): Promise<string> {
    try {
      const options: preferences.Options = { name: 'collection' };
      const pref = await preferences.getPreferences(context, options);
      const v = await pref.get(KEY_LAST_UNLOCK, '');
      return typeof v === 'string' ? v : '';
    } catch (err) {
      return '';
    }
  }

  /** 全部传统色 + 解锁表（name → 相遇次数） */
  static async loadCollection(context: common.Context): Promise<CollectionData> {
    const colors = await loadOrientalColors(context);
    const unlocks = await PhotoDao.getInstance().queryColorUnlockCounts();
    const data: CollectionData = { colors: colors, unlocks: unlocks };
    return data;
  }
}
