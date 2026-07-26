/**
 * Label length: which field of a .lbx actually holds it.
 */
import type { BackgroundConfig, LabelConfig, PaperConfig } from "./types.js";

/**
 * The unprintable leader and trailer P-touch reserves at each end of a label
 * (2mm). Constant across tape widths and independent of the paper margins.
 */
export const TAPE_MARGIN_PT = 5.6;

/**
 * P-touch's auto-length ceiling (1000mm). Under autoLength it parks this in
 * `style:paper`'s height as a placeholder rather than the fitted length.
 */
export const AUTO_LENGTH_MAX_PT = 2834.4;

/**
 * The label length in pt, or undefined if the file doesn't record one.
 *
 * For a fixed-length label that's `paper.height`. Under autoLength it is NOT:
 * P-touch parks its 1000mm auto ceiling (2834.4pt) there as a placeholder and
 * records the fitted length as the extent of the printable band, so reading
 * the height literally yields a 1-meter label.
 */
export function labelLengthPt(config: LabelConfig): number | undefined {
  if (config.paper.autoLength) {
    const bg = config.background;
    return bg ? bg.x + bg.width + TAPE_MARGIN_PT : undefined;
  }
  return config.paper.height;
}

/**
 * The printable band for a label of `length` pt: inset TAPE_MARGIN_PT from each
 * end along the label, and by the paper's side margin across the tape.
 */
export function backgroundFor(paper: PaperConfig, length: number): BackgroundConfig {
  const sideMargin = paper.marginLeft ?? 2.8;
  return {
    x: TAPE_MARGIN_PT,
    y: sideMargin,
    width: Math.max(0, length - TAPE_MARGIN_PT * 2),
    height: Math.max(0, paper.width - sideMargin * 2),
  };
}
