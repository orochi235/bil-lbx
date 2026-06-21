import JSZip from "jszip";
import { serializeLabel } from "./serialize.js";
import type { LabelConfig } from "./types.js";

/**
 * Build a .lbx file (as a Uint8Array) from a label configuration.
 */
export async function buildLbx(config: LabelConfig): Promise<Uint8Array> {
  const { labelXml, propXml, images } = serializeLabel(config);

  const zip = new JSZip();
  zip.file("label.xml", labelXml);
  zip.file("prop.xml", propXml);

  for (const img of images) {
    zip.file(img.filename, img.data);
  }

  const buf = await zip.generateAsync({
    type: "uint8array",
    compression: "STORE",
  });

  return buf;
}
