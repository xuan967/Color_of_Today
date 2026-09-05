import UIAbility from '@ohos.app.ability.UIAbility';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import Want from '@ohos.app.ability.Want';
import window from '@ohos.window';
import { DailyColorManager } from '../manager/DailyColorManager';
import { PhotoDao } from '../model/PhotoDao';

export default class EntryAbility extends UIAbility {
  /** 启动即预热数据层：今日颜色 + 照片库（失败不阻塞启动，页面有兜底重试） */
  async onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): Promise<void> {
    console.info('[TodayColor][Ability] onCreate begin');
    try {
      await DailyColorManager.getInstance().init(this.context);
      await PhotoDao.getInstance().init(this.context);
      console.info('[TodayColor][Ability] data warm-up completed');
    } catch (err) {
      console.error(`[TodayColor][Ability] data warm-up failed: ${JSON.stringify(err)}`);
    }
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    console.info('[TodayColor][Ability] window stage created, loading pages/Index');
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        console.error(`[TodayColor][Ability] loadContent failed: ${JSON.stringify(err)}`);
      } else {
        console.info('[TodayColor][Ability] pages/Index loaded');
      }
    });
  }
}
