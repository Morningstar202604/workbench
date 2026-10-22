import { contrastRatio, ensureTextContrast, mix } from "./tokens";

/**
 * 在给定底色上取一个「尽量接近 text 但至少满足 minRatio」的颜色。
 *
 * 主题卡片的副标题用的是每套主题自己的面板色，写死混合比例必然有主题不达标。
 * 但方向必须是「远离底色」：往底色方向混只会让对比度更低，原实现
 * （`mix(text, bg)` 逐步加大比例）在浅色主题上永远命中不了目标，
 * 最后原样返回一个 2.78:1 的灰字。这里改为先朝黑/白两个方向求解，
 * 达标后再从达标的颜色往底色方向淡回一档，保留层次。
 */
export function readableOn(text: string, bg: string, minRatio: number): string {
  if (contrastRatio(text, bg) >= minRatio) return text;
  const base = ensureTextContrast(text, [bg], bg, minRatio);
  if (contrastRatio(base, bg) < minRatio) return base;
  let best = base;
  for (let i = 1; i <= 60; i++) {
    const c = mix(base, bg, i / 100);
    if (contrastRatio(c, bg) >= minRatio) best = c;
    else break;
  }
  return best;
}
