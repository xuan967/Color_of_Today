/** 二十四节气（按月近似日期），用于自然回声的诗意锚点 */
const TERM_DAYS: number[][] = [
    [5, 20], [4, 19], [6, 21], [5, 20], [6, 21], [6, 21],
    [7, 23], [8, 23], [8, 23], [8, 23], [7, 22], [7, 22]
];
const TERM_NAMES: string[][] = [
    ['小寒', '大寒'], ['立春', '雨水'], ['惊蛰', '春分'], ['清明', '谷雨'],
    ['立夏', '小满'], ['芒种', '夏至'], ['小暑', '大暑'], ['立秋', '处暑'],
    ['白露', '秋分'], ['寒露', '霜降'], ['立冬', '小雪'], ['大雪', '冬至']
];
/** 返回 “今日立秋” / “时值白露” 这类短语 */
export function solarTermPhrase(date: Date): string {
    const m = date.getMonth();
    const day = date.getDate();
    const days = TERM_DAYS[m];
    const names = TERM_NAMES[m];
    if (day >= days[1] - 1 && day <= days[1] + 1) {
        return `今日${names[1]}`;
    }
    if (day >= days[0] - 1 && day <= days[0] + 1) {
        return `今日${names[0]}`;
    }
    if (day < days[0]) {
        return m === 0 ? '时值冬至' : `时值${TERM_NAMES[m - 1][1]}`;
    }
    if (day < days[1]) {
        return `时值${names[0]}`;
    }
    return `时值${names[1]}`;
}
