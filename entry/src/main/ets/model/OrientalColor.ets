import util from '@ohos.util';
import common from '@ohos.app.ability.common';

/** 东方传统色（图鉴条目） */
export interface OrientalColor {
  name: string;
  hex: string;
  hue: number;        // 0-1，Fragment Shader 同源
  threshold: number;  // 色相容差
  poem: string;       // 诗句
  mood: string;       // 意境文案
}

interface OrientalColorFile {
  version: number;
  colors: OrientalColor[];
}

export interface CollectionData {
  colors: OrientalColor[];
  unlocks: Map<string, number>;
}

let cache: OrientalColor[] | null = null;

/** 从 rawfile/oriental_colors.json 加载（进程内缓存） */
export async function loadOrientalColors(context: common.Context): Promise<OrientalColor[]> {
  if (cache !== null) {
    return cache;
  }
  const content = await context.resourceManager.getRawFileContent('oriental_colors.json');
  const text = util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(content.buffer));
  const file = JSON.parse(text) as OrientalColorFile;
  cache = file.colors;
  return cache;
}

/** 色相环环形距离 */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/** 在容差内找与给定色相最贴近的传统色（无命中返回 null） */
export function matchOrientalColor(colors: OrientalColor[], hue: number): OrientalColor | null {
  let best: OrientalColor | null = null;
  let bestDist = 1;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const d = hueDistance(hue, c.hue);
    if (d <= c.threshold && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
