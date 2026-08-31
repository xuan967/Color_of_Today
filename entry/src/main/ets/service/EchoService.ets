import common from '@ohos.app.ability.common';
import sensor from '@ohos.sensor';
import { solarTermPhrase } from '../utils/SolarTerm';
import { PhotoDao } from '../model/PhotoDao';

export interface EchoResult {
  text: string;    // 展示文案
  number: number;  // 文案中需要滚动展示的数字（0 表示无）
}

let ambientLux: number = -1;   // -1 表示传感器不可用
let sensorTried: boolean = false;

/** 订阅环境光（可选能力：失败静默降级，不需要任何权限） */
function ensureLightSensor(): void {
  if (sensorTried) {
    return;
  }
  sensorTried = true;
  try {
    sensor.on(sensor.SensorId.AMBIENT_LIGHT, (data: sensor.LightResponse) => {
      ambientLux = data.intensity;
    });
  } catch {
    ambientLux = -1;
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 自然回声：时段 × 节气 × 光照 */
function naturalEcho(colorName: string): EchoResult {
  const now = new Date();
  const hour = now.getHours();
  const term = solarTermPhrase(now);
  const c = colorName;

  // 节气优先（最具“时间在场感”）
  if (term.startsWith('今日')) {
    return { text: `${term}，${c}正当时。`, number: 0 };
  }

  // 光照微调（传感器可用时）
  const lightReady = ambientLux >= 0;
  if (lightReady && hour >= 17 && hour < 20 && ambientLux < 30) {
    return { text: `光线渐暗，${c}会替你亮着。`, number: 0 };
  }
  if (lightReady && hour >= 9 && hour < 16 && ambientLux > 900) {
    return { text: `阳光很盛，${c}压得住场。`, number: 0 };
  }

  // 时段模板
  let line: string;
  if (hour >= 23 || hour < 5) {
    line = pick(['夜深了，{c}在替你守夜。', '万籁俱寂，{c}还未睡。']);
  } else if (hour < 7) {
    line = pick(['天光渐亮，{c}最温柔。', '清晨第一眼，留给{c}。']);
  } else if (hour < 11) {
    line = pick(['晨光正好，去捕捉{c}吧。', '上午的光，{c}最诚实。']);
  } else if (hour < 13) {
    line = '正午的光很盛，{c}藏在影子里。';
  } else if (hour < 17) {
    line = pick(['午后漫长，{c}陪你虚度。', '阳光斜了一点，{c}更软了。']);
  } else if (hour < 19) {
    line = pick(['日落时分，宜捕捉{c}。', '黄昏把{c}调得更浓了。']);
  } else {
    line = pick(['华灯初上，{c}比白天亮。', '晚风起了，{c}也温柔。']);
  }
  return { text: line.replace('{c}', c), number: 0 };
}

/**
 * 时空回声：自然回声 + 自我回声，单机、零后端。
 * 每次进入取景页调用一次；自我回声与自然回声按次轮换。
 */
export class EchoService {
  static async build(context: common.Context, activeColorName: string): Promise<EchoResult> {
    ensureLightSensor();
    const dao = PhotoDao.getInstance();
    const today = new Date();
    const useSelf = today.getMinutes() % 2 === 1;

    if (useSelf) {
      // 去年的今天
      const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      const lastYearKey = DailyColorKey(lastYear);
      const lastYearCount = await dao.countPhotosOn(lastYearKey);
      if (lastYearCount > 0) {
        const lastName = await dao.firstColorNameOn(lastYearKey);
        const shown = lastName !== null && lastName !== '' ? lastName : '一抹颜色';
        return {
          text: `去年的今天，你也定格过${shown}。`,
          number: 0
        };
      }
      // 今年遇见当前色的次数（≥2 才值得说）
      const yearCount = await dao.countPhotosByColorNameYear(
        activeColorName, `${today.getFullYear()}`);
      if (yearCount >= 2) {
        return {
          text: `这是你今年第 {n} 次遇见${activeColorName}。`,
          number: yearCount
        };
      }
      // 记录天数
      const days = await dao.countDistinctDays();
      if (days >= 2) {
        return {
          text: `这是你用颜色记录生活的第 {n} 天。`,
          number: days
        };
      }
      // 总瞬间
      const total = await dao.countAll();
      if (total > 0) {
        return {
          text: `已经陪你收集了 {n} 个瞬间。`,
          number: total
        };
      }
    }

    return naturalEcho(activeColorName);
  }
}

function DailyColorKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}${m}${day}`;
}
