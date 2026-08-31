import image from '@ohos.multimedia.image';

/**
 * 照片主色调提取（纯本地、纯 ArkTS）：
 * Image Kit 按目标边长缩图解码 → 采样池 → K-Means 聚类 → 主色。
 * 48px 缩图 + 上千采样在 ArkTS 下毫秒级完成，无需 NAPI。
 */

export interface ExtractedColor {
  hex: string;
  weight: number; // 簇占比 0-1
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (x: number): string => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** 解码小图并把像素摊平为 [r,g,b,r,g,b,...] 采样池 */
async function decodeSamples(localPath: string, side: number, maxSamples: number): Promise<number[]> {
  const source = image.createImageSource(localPath);
  if (source === undefined) {
    return [];
  }
  const options: image.DecodingOptions = {
    desiredSize: { width: side, height: side }
  };
  const pm = await source.createPixelMap(options);
  const info = await pm.getImageInfo();
  const w = info.size.width;
  const h = info.size.height;
  if (w <= 0 || h <= 0) {
    await pm.release();
    await source.release();
    return [];
  }
  const buf = new ArrayBuffer(w * h * 4);
  await pm.readPixelsToBuffer(buf);
  const bytes = new Uint8Array(buf);
  await pm.release();
  await source.release();

  const total = w * h;
  const stride = Math.max(1, Math.floor(total / maxSamples));
  const out: number[] = [];
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    // PixelMap 默认 BGRA_8888；RGBA_8888 时通道对调
    let r: number;
    let g: number;
    let b: number;
    if (info.pixelFormat === image.PixelMapFormat.RGBA_8888) {
      r = bytes[o];
      g = bytes[o + 1];
      b = bytes[o + 2];
    } else {
      r = bytes[o + 2];
      g = bytes[o + 1];
      b = bytes[o];
    }
    out.push(r, g, b);
  }
  return out;
}

function saturationOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= 0 ? 0 : (max - min) / max;
}

/** K-Means：返回按簇占比降序的主色列表 */
function kmeans(samples: number[], k: number, iterations: number): ExtractedColor[] {
  const n = Math.floor(samples.length / 3);
  if (n === 0) {
    return [];
  }
  const centers = new Array<number>(k * 3).fill(0);
  for (let c = 0; c < k; c++) {
    const idx = Math.floor(((c + 0.5) * n) / k) * 3;
    centers[c * 3] = samples[idx];
    centers[c * 3 + 1] = samples[idx + 1];
    centers[c * 3 + 2] = samples[idx + 2];
  }
  const assign = new Array<number>(n).fill(0);
  const sums = new Array<number>(k * 3).fill(0);
  const counts = new Array<number>(k).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const r = samples[i * 3];
      const g = samples[i * 3 + 1];
      const b = samples[i * 3 + 2];
      let best = 0;
      let bestDist = Number.MAX_VALUE;
      for (let c = 0; c < k; c++) {
        const dr = r - centers[c * 3];
        const dg = g - centers[c * 3 + 1];
        const db = b - centers[c * 3 + 2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      assign[i] = best;
      sums[best * 3] += r;
      sums[best * 3 + 1] += g;
      sums[best * 3 + 2] += b;
      counts[best]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centers[c * 3] = sums[c * 3] / counts[c];
        centers[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
        centers[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
      } else {
        // 空簇：重新播种到某个样本
        const idx = Math.floor(((c + 0.5) * n) / k) * 3;
        centers[c * 3] = samples[idx];
        centers[c * 3 + 1] = samples[idx + 1];
        centers[c * 3 + 2] = samples[idx + 2];
      }
    }
  }

  const result: ExtractedColor[] = [];
  for (let c = 0; c < k; c++) {
    if (counts[c] <= 0) {
      continue;
    }
    result.push({
      hex: rgbToHex(centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]),
      weight: counts[c] / n
    });
  }
  result.sort((a: ExtractedColor, b: ExtractedColor) => b.weight - a.weight);
  return result;
}

/** 单张照片的主色与次要色（k=4） */
export async function extractPhotoDominants(localPath: string): Promise<ExtractedColor[]> {
  const samples = await decodeSamples(localPath, 48, 1200);
  return kmeans(samples, 4, 8);
}

/**
 * 一天的代表色：把当天照片的采样池合并后再聚类（照片数量越多代表越稳），
 * 最大簇过灰时优先取“占比可观且更饱和”的簇，保证色卡的艺术表现力。
 */
export async function extractDayColor(localPaths: string[]): Promise<string | null> {
  const pool: number[] = [];
  const perPhoto = 600;
  const maxPhotos = 8;
  for (let i = 0; i < localPaths.length && i < maxPhotos; i++) {
    const s = await decodeSamples(localPaths[i], 40, perPhoto);
    for (let j = 0; j < s.length && j < perPhoto * 3; j++) {
      pool.push(s[j]);
    }
  }
  if (pool.length < 12) {
    return null;
  }
  const clusters = kmeans(pool, 4, 8);
  if (clusters.length === 0) {
    return null;
  }
  let best = clusters[0];
  const mainRgb = parseInt(best.hex.substring(1, 3), 16);
  const mainSat = saturationOf(
    parseInt(best.hex.substring(1, 3), 16),
    parseInt(best.hex.substring(3, 5), 16),
    parseInt(best.hex.substring(5, 7), 16));
  if (mainSat < 0.10) {
    for (let i = 1; i < clusters.length; i++) {
      const c = clusters[i];
      if (c.weight < best.weight * 0.55) {
        continue;
      }
      const sat = saturationOf(
        parseInt(c.hex.substring(1, 3), 16),
        parseInt(c.hex.substring(3, 5), 16),
        parseInt(c.hex.substring(5, 7), 16));
      if (sat >= 0.18) {
        best = c;
        break;
      }
    }
  }
  void mainRgb;
  return best.hex;
}
