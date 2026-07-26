import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLbx, buildLbx, labelLengthPt, TAPE_MARGIN_PT, TAPE } from "../src/index.js";
import type { LabelConfig } from "../src/index.js";

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures", import.meta.url));

function loadFixture(name: string): Uint8Array {
  return readFileSync(join(FIXTURES_DIR, `${name}.lbx`));
}

describe("style:backGround", () => {
  it("parses the printable band", async () => {
    const config = await parseLbx(loadFixture("Two-line cable label"));

    // The band is always inset 5.6pt (2mm) from each end of the tape,
    // regardless of this file's 11.6pt paper margins.
    expect(config.background).toEqual({ x: 5.6, y: 2.8, width: 132.8, height: 28 });
  });

  it("records the fitted extent on an auto-length label", async () => {
    const config = await parseLbx(loadFixture("Filament Label 3"));

    expect(config.paper.autoLength).toBe(true);
    expect(config.background?.x).toBe(5.6);
    expect(config.background!.x + config.background!.width).toBeCloseTo(105, 6);
  });
});

describe("labelLengthPt", () => {
  it("reads the paper height for a fixed-length label", async () => {
    const config = await parseLbx(loadFixture("Two-line cable label"));
    expect(labelLengthPt(config)).toBe(144);
  });

  it("derives the length from the band for an auto-length label", async () => {
    // paper height is P-touch's 1000mm auto placeholder — meaningless here.
    const config = await parseLbx(loadFixture("Lego icon labels - Food"));
    expect(config.paper.height).toBe(2834.4);
    expect(labelLengthPt(config)).toBeCloseTo(157.1 + TAPE_MARGIN_PT, 6);
  });

  it("is undefined when an auto-length label records no band", async () => {
    const config = await parseLbx(loadFixture("Lego icon labels - Food"));
    delete config.background;
    expect(labelLengthPt(config)).toBeUndefined();
  });

  it("is undefined when a fixed-length label records no height", () => {
    const config: LabelConfig = { paper: { width: 33.6, autoLength: false }, objects: [] };
    expect(labelLengthPt(config)).toBeUndefined();
  });
});

describe("serialized background band", () => {
  function label(height: number, marginLeft: number): LabelConfig {
    return {
      paper: { width: TAPE["24mm"].width, height, marginLeft, marginTop: 5.6, autoLength: false },
      objects: [],
    };
  }

  it("insets the band 5.6pt from each end, independent of the paper margins", async () => {
    const config = await parseLbx(await buildLbx(label(99.2, 8.4)));

    expect(config.background).toEqual({ x: 5.6, y: 8.4, width: 99.2 - 11.2, height: 68 - 16.8 });
  });

  it("round-trips a parsed band unchanged", async () => {
    const original = await parseLbx(loadFixture("Lego icon labels - Food"));
    const reparsed = await parseLbx(await buildLbx(original));

    expect(reparsed.background).toEqual(original.background);
    expect(labelLengthPt(reparsed)).toBe(labelLengthPt(original));
  });
});
