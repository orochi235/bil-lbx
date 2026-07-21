import { describe, it, expect } from "vitest";
import { decodeBmp32 } from "../src/index.js";

/** Build a 32bpp BI_RGB BMP from top-down RGBA pixel rows. */
function makeBmp32(
  width: number,
  height: number,
  rgba: number[][],
  { topDown = false }: { topDown?: boolean } = {},
): Uint8Array {
  const stride = width * 4;
  const pixelBytes = stride * Math.abs(height);
  const buf = new Uint8Array(54 + pixelBytes);
  const view = new DataView(buf.buffer);
  buf[0] = 0x42;
  buf[1] = 0x4d; // 'BM'
  view.setUint32(2, buf.length, true);
  view.setUint32(10, 54, true); // pixel data offset
  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, topDown ? -height : height, true);
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 32, true); // bpp
  view.setUint32(30, 0, true); // BI_RGB
  for (let y = 0; y < height; y++) {
    const fileRow = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = rgba[y * width + x]!;
      const o = 54 + fileRow * stride + x * 4;
      buf[o] = b!;
      buf[o + 1] = g!;
      buf[o + 2] = r!;
      buf[o + 3] = a!;
    }
  }
  return buf;
}

describe("decodeBmp32", () => {
  it("decodes a bottom-up 32bpp BMP, honoring the alpha channel", () => {
    // Alpha-only image, like P-touch Editor macOS exports: RGB all black,
    // shape carried entirely by alpha.
    const px = [
      [0, 0, 0, 255],
      [0, 0, 0, 0],
      [0, 0, 0, 128],
      [0, 0, 0, 255],
    ];
    const out = decodeBmp32(makeBmp32(2, 2, px));
    expect(out).not.toBeNull();
    expect(out!.width).toBe(2);
    expect(out!.height).toBe(2);
    expect(Array.from(out!.rgba)).toEqual(px.flat());
  });

  it("decodes a top-down (negative height) BMP in the same row order", () => {
    const px = [
      [10, 20, 30, 255],
      [40, 50, 60, 255],
    ];
    const out = decodeBmp32(makeBmp32(2, 1, px, { topDown: true }));
    expect(Array.from(out!.rgba)).toEqual(px.flat());
  });

  it("treats an all-zero alpha channel as fully opaque", () => {
    const px = [
      [255, 0, 0, 0],
      [0, 255, 0, 0],
    ];
    const out = decodeBmp32(makeBmp32(2, 1, px));
    expect(Array.from(out!.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("returns null for non-32bpp BMPs (platform decoders handle those)", () => {
    const bmp = makeBmp32(1, 1, [[0, 0, 0, 255]]);
    new DataView(bmp.buffer).setUint16(28, 24, true);
    expect(decodeBmp32(bmp)).toBeNull();
  });

  it("returns null for compressed BMPs", () => {
    const bmp = makeBmp32(1, 1, [[0, 0, 0, 255]]);
    new DataView(bmp.buffer).setUint32(30, 3, true); // BI_BITFIELDS
    expect(decodeBmp32(bmp)).toBeNull();
  });

  it("returns null for non-BMP bytes and truncated files", () => {
    expect(decodeBmp32(new Uint8Array([1, 2, 3]))).toBeNull();
    const bmp = makeBmp32(2, 2, [
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]);
    expect(decodeBmp32(bmp.slice(0, 60))).toBeNull();
  });
});
