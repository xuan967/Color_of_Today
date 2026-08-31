/**
 * 颜色预设数据模型 —— 【今日限定色】
 *
 * hue             : HSV 色相 (0.0 - 1.0)，已按 hex 精确换算，Step 2 中作为 Fragment Shader 的 uniform 输入
 * threshold       : 色相环容差 (0.0 - 0.5)，shader 内与 hue 距离 diff 比较，越小则“命中”越苛刻
 * saturationBoost : 命中区域的饱和度增益 (1.0 = 不增强)，让保色区域更有胶片感
 * mood            : 一句治愈系文案，展示在取景器顶部颜色名下方
 */
export interface ColorPreset {
    id: number;
    name: string;
    nameEn: string;
    hex: string;
    hue: number;
    threshold: number;
    saturationBoost: number;
    mood: string;
}
/**
 * 20 种预设颜色，hue 尽量铺满整个色相环（红→橙黄→绿→蓝→紫→粉）。
 * 同色系（如薄荷绿/青瓷绿）保留差异：色相接近但饱和度、明度不同，
 * shader 命中的实际画面感受并不重复，反而让相邻两天有“微妙的延续感”。
 */
export const COLOR_PRESETS: ColorPreset[] = [
    { id: 0, name: '朱砂红', nameEn: 'Cinnabar Red', hex: '#E34234', hue: 0.0133, threshold: 0.045, saturationBoost: 1.25, mood: '今天，热烈得理直气壮。' },
    { id: 1, name: '落日橙', nameEn: 'Sunset Orange', hex: '#FF8C42', hue: 0.0653, threshold: 0.050, saturationBoost: 1.20, mood: '把傍晚的温柔，留到白天。' },
    { id: 2, name: '咖啡棕', nameEn: 'Coffee Brown', hex: '#6F4E37', hue: 0.0685, threshold: 0.045, saturationBoost: 1.15, mood: '慢一点，生活是手冲的。' },
    { id: 3, name: '琥珀金', nameEn: 'Amber Gold', hex: '#FFBF00', hue: 0.1248, threshold: 0.040, saturationBoost: 1.20, mood: '时间被封存在光里。' },
    { id: 4, name: '麦田黄', nameEn: 'Wheat Yellow', hex: '#F4D03F', hue: 0.1335, threshold: 0.045, saturationBoost: 1.15, mood: '风一吹，整片田野都在笑。' },
    { id: 5, name: '抹茶绿', nameEn: 'Matcha Green', hex: '#8DB600', hue: 0.2042, threshold: 0.050, saturationBoost: 1.20, mood: '微苦回甘，是今天的味道。' },
    { id: 6, name: '牛油果绿', nameEn: 'Avocado Green', hex: '#568203', hue: 0.2244, threshold: 0.045, saturationBoost: 1.15, mood: '新鲜的、健康的、向上的。' },
    { id: 7, name: '薄荷绿', nameEn: 'Mint Green', hex: '#98FB98', hue: 0.3333, threshold: 0.055, saturationBoost: 1.10, mood: '深呼吸，世界很清爽。' },
    { id: 8, name: '青瓷绿', nameEn: 'Celadon Green', hex: '#ACE1AF', hue: 0.3428, threshold: 0.045, saturationBoost: 1.10, mood: '温润如玉，恰到好处。' },
    { id: 9, name: '祖母绿', nameEn: 'Emerald Green', hex: '#50C878', hue: 0.3889, threshold: 0.050, saturationBoost: 1.25, mood: '珍贵的绿，藏在日常里。' },
    { id: 10, name: '蒂芙尼蓝', nameEn: 'Tiffany Blue', hex: '#81D8D0', hue: 0.4847, threshold: 0.055, saturationBoost: 1.15, mood: '小小的仪式感，今天也值得。' },
    { id: 11, name: '天空蓝', nameEn: 'Sky Blue', hex: '#87CEEB', hue: 0.5483, threshold: 0.050, saturationBoost: 1.15, mood: '抬头，就没有解决不了的事。' },
    { id: 12, name: '雾霾蓝', nameEn: 'Haze Blue', hex: '#7C9CBF', hue: 0.5870, threshold: 0.050, saturationBoost: 1.10, mood: '朦胧一点，也很美。' },
    { id: 13, name: '克莱因蓝', nameEn: 'Klein Blue', hex: '#002FA7', hue: 0.6197, threshold: 0.055, saturationBoost: 1.30, mood: '今日，世界只剩一种纯粹。' },
    { id: 14, name: '薰衣草紫', nameEn: 'Lavender Purple', hex: '#967BB6', hue: 0.7430, threshold: 0.050, saturationBoost: 1.15, mood: '安静，是今天的主题色。' },
    { id: 15, name: '靛青', nameEn: 'Indigo', hex: '#4B0082', hue: 0.7628, threshold: 0.050, saturationBoost: 1.25, mood: '深邃的夜里，藏着想象力。' },
    { id: 16, name: '香芋紫', nameEn: 'Taro Purple', hex: '#C4A1D9', hue: 0.7708, threshold: 0.050, saturationBoost: 1.15, mood: '软软的，像今天的心情。' },
    { id: 17, name: '玫红', nameEn: 'Rose Red', hex: '#E91E8C', hue: 0.9097, threshold: 0.050, saturationBoost: 1.25, mood: '大胆去爱，大胆去拍。' },
    { id: 18, name: '樱花粉', nameEn: 'Sakura Pink', hex: '#FFB7C5', hue: 0.9676, threshold: 0.045, saturationBoost: 1.15, mood: '春天落在你眼里了。' },
    { id: 19, name: '酒红', nameEn: 'Wine Red', hex: '#722F37', hue: 0.9801, threshold: 0.040, saturationBoost: 1.20, mood: '微醺的傍晚，慢慢来。' }
];
