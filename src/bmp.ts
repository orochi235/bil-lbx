/**
 * Decoder for the 32-bit Windows BMPs embedded in .lbx files.
 *
 * P-touch Editor transcodes every imported image to a 32bpp BI_RGB BMP, and
 * (at least on macOS) often emits pixels whose RGB is all black with the
 * artwork carried entirely in the alpha byte. That byte is "reserved" in the
 * BI_RGB format, so browser BMP decoders ignore it and render a solid black
 * rectangle. Consumers that draw `ImageObject.imageData` should decode it
 * with this function instead of handing the bytes to the platform decoder.
 */

export interface DecodedBmp {
  width: number;
  height: number;
  /** Row-major top-down RGBA, ready for `ImageData`. */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * Decode a 32bpp uncompressed (BI_RGB) BMP, honoring the alpha channel.
 * A fully zero alpha channel is treated as opaque (the encoder left the
 * reserved byte blank). Returns null for any other BMP flavor — platform
 * decoders handle those correctly.
 */
/**
 * Encode top-down RGBA pixels as a 32bpp uncompressed (BI_RGB) BMP with
 * real RGB *and* the alpha channel populated — the counterpart to
 * `decodeBmp32`, and the encoding to use when writing images into a .lbx
 * (the format embeds no other raster encoding). Alpha-aware readers
 * (P-touch Editor, `decodeBmp32`) get transparency; naive readers that
 * skip the reserved byte still see the RGB artwork instead of a black box.
 */
export function encodeBmp32(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
    throw new Error(`encodeBmp32: rgba length ${rgba.length} != ${width}x${height}x4`);
  }
  const stride = width * 4;
  const out = new Uint8Array(54 + stride * height);
  const view = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d; // 'BM'
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true); // pixel data offset
  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive: bottom-up
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 32, true);
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, stride * height, true);
  view.setInt32(38, 2835, true); // 72 dpi
  view.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    const dstRow = 54 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = dstRow + x * 4;
      out[d] = rgba[s + 2]!; // B
      out[d + 1] = rgba[s + 1]!; // G
      out[d + 2] = rgba[s]!; // R
      out[d + 3] = rgba[s + 3]!; // A
    }
  }
  return out;
}

export function decodeBmp32(bytes: Uint8Array): DecodedBmp | null {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const dataOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  if (headerSize < 40) return null; // BITMAPCOREHEADER has no 32bpp mode
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bpp = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (bpp !== 32 || compression !== 0 /* BI_RGB */) return null;

  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  if (width <= 0 || height === 0) return null;
  const stride = width * 4; // 32bpp rows are naturally 4-byte aligned
  if (dataOffset + stride * height > bytes.length) return null;

  const rgba = new Uint8ClampedArray(width * height * 4);
  let allAlphaZero = true;
  for (let y = 0; y < height; y++) {
    const srcRow = dataOffset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = (y * width + x) * 4;
      rgba[d] = bytes[s + 2]!; // R
      rgba[d + 1] = bytes[s + 1]!; // G
      rgba[d + 2] = bytes[s]!; // B
      const a = bytes[s + 3]!;
      rgba[d + 3] = a;
      if (a !== 0) allAlphaZero = false;
    }
  }

  if (allAlphaZero) {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  }

  return { width, height, rgba };
}
