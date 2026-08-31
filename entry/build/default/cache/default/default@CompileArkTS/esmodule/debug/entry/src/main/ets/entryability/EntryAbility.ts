import UIAbility from "@ohos:app.ability.UIAbility";
import type AbilityConstant from "@ohos:app.ability.AbilityConstant";
import type Want from "@ohos:app.ability.Want";
import type window from "@ohos:window";
import { DailyColorManager } from "@normalized:N&&&entry/src/main/ets/manager/DailyColorManager&";
import { PhotoDao } from "@normalized:N&&&entry/src/main/ets/model/PhotoDao&";
export default class EntryAbility extends UIAbility {
    /** 启动即预热数据层：今日颜色 + 照片库（失败不阻塞启动，页面有兜底重试） */
    async onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): Promise<void> {
        try {
            await DailyColorManager.getInstance().init(this.context);
            await PhotoDao.getInstance().init(this.context);
        }
        catch (err) {
            console.error(`[TodayColor] data init failed: ${JSON.stringify(err)}`);
        }
    }
    onWindowStageCreate(windowStage: window.WindowStage): void {
        windowStage.loadContent('pages/Index', (err) => {
            if (err.code) {
                console.error(`[TodayColor] loadContent failed: ${JSON.stringify(err)}`);
            }
        });
    }
}
