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
