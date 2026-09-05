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

  private async configureImmersiveWindow(windowStage: window.WindowStage): Promise<void> {
    try {
      const mainWindow = windowStage.getMainWindowSync();
      await mainWindow.setWindowLayoutFullScreen(true);
      console.info('[TodayColor][Window] immersive layout enabled');
      await mainWindow.setWindowSystemBarProperties({
        statusBarColor: '#00000000',
        navigationBarColor: '#00000000',
        statusBarContentColor: '#FFFFFFFF',
        navigationBarContentColor: '#FFFFFFFF'
      });
      console.info('[TodayColor][Window] transparent system bars applied');
    } catch (err) {
      console.error(`[TodayColor][Window] immersive setup failed: ${JSON.stringify(err)}`);
    }
  }

  private loadIndexPage(windowStage: window.WindowStage): void {
    console.info('[TodayColor][Ability] loading pages/Index');
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        console.error(`[TodayColor][Ability] loadContent failed: ${JSON.stringify(err)}`);
      } else {
        console.info('[TodayColor][Ability] pages/Index loaded');
      }
    });
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    console.info('[TodayColor][Ability] window stage created, configuring immersive layout');
    this.configureImmersiveWindow(windowStage).then(() => {
      this.loadIndexPage(windowStage);
    });
  }
}
