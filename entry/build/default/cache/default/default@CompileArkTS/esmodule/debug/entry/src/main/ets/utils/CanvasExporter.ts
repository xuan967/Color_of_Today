import image from "@ohos:multimedia.image";
import drawing from "@ohos:graphics.drawing";
import type common2D from "@ohos:graphics.common2D";
import { hexToRgb } from "@normalized:N&&&entry/src/main/ets/utils/ColorUtil&";
/**
 * 岁月色卡长图离屏渲染（@ohos.graphics.drawing）：
 * 在 PixelMap 上创建 CPU Canvas，绘制标题/网格/落款，供 ImagePacker 导出 JPEG。
 */
export interface PaletteDay {
    day: number; // 几号（1-31）
    hex: string; // 当日主色（'' 表示未拍摄）
}
async function createBackground(w: number, h: number): Promise<image.PixelMap> {
    const buf = new ArrayBuffer(w * h * 4);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < w * h; i++) {
        bytes[i * 4] = 26; // B
        bytes[i * 4 + 1] = 24; // G
        bytes[i * 4 + 2] = 24; // R
        bytes[i * 4 + 3] = 255; // A
    }
    const options: image.InitializationOptions = {
        size: { width: w, height: h },
        srcPixelFormat: image.PixelMapFormat.BGRA_8888
    };
    return image.createPixelMap(buf, options);
}
function drawText(canvas: drawing.Canvas, text: string, sizePx: number, x: number, y: number, r: number, g: number, b: number, alpha: number): void {
    const font = new drawing.Font();
    font.setSize(sizePx);
    const blob = drawing.TextBlob.makeFromString(text, font, drawing.TextEncoding.TEXT_ENCODING_UTF8);
    const brush = new drawing.Brush();
    const color: common2D.Color = { alpha: alpha, red: r, green: g, blue: b };
    brush.setColor(color);
    canvas.attachBrush(brush);
    canvas.drawTextBlob(blob, x, y);
}
export async function renderPaletteCard(monthLabel: string, days: PaletteDay[], footer: string): Promise<image.PixelMap> {
    const W = 1080;
    const H = 1500;
    const pm = await createBackground(W, H);
    const canvas = new drawing.Canvas(pm);
    // 标题与月份
    drawText(canvas, '岁月色卡', 56, 72, 110, 245, 245, 245, 255);
    drawText(canvas, monthLabel, 96, 72, 236, 255, 255, 255, 255);
    // 网格：周一为首列
    const cell = 124;
    const gap = 13;
    const cols = 7;
    const gridW = cell * cols + gap * (cols - 1);
    const startX = (W - gridW) / 2;
    const startY = 330;
    // 星期表头
    const weekNames = ['一', '二', '三', '四', '五', '六', '日'];
    for (let c = 0; c < cols; c++) {
        drawText(canvas, weekNames[c], 30, startX + c * (cell + gap) + cell / 2 - 15, startY - 18, 150, 150, 155, 255);
    }
    for (let i = 0; i < days.length; i++) {
        const d = days[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const left = startX + col * (cell + gap);
        const top = startY + row * (cell + gap);
        if (d.hex === '') {
            // 未拍摄：极淡占位
            const brush = new drawing.Brush();
            const color: common2D.Color = { alpha: 255, red: 38, green: 38, blue: 42 };
            brush.setColor(color);
            canvas.attachBrush(brush);
            const rect: common2D.Rect = {
                left: left, top: top, right: left + cell, bottom: top + cell
            };
            canvas.drawRoundRect(new drawing.RoundRect(rect, 24, 24));
            continue;
        }
        const rgb = hexToRgb(d.hex);
        const brush = new drawing.Brush();
        const color: common2D.Color = {
            alpha: 255, red: rgb[0], green: rgb[1], blue: rgb[2]
        };
        brush.setColor(color);
        canvas.attachBrush(brush);
        const rect: common2D.Rect = {
            left: left, top: top, right: left + cell, bottom: top + cell
        };
        canvas.drawRoundRect(new drawing.RoundRect(rect, 24, 24));
        // 日期数字：按块亮度取黑/白
        const lum = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
        const c = lum > 0.55 ? 40 : 252;
        drawText(canvas, `${d.day}`, 34, left + cell / 2 - 20, top + cell / 2 + 12, c, c, c, 235);
    }
    // 落款
    const gridBottom = startY + Math.ceil(days.length / cols) * (cell + gap);
    drawText(canvas, footer, 38, 72, gridBottom + 70, 200, 200, 205, 255);
    drawText(canvas, '今日限定色 · The Color of Today', 28, 72, gridBottom + 126, 120, 120, 126, 255);
    return pm;
}
