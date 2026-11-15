import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { parseLbx, type LbxWarning } from "../src/index.js";

const STYLE = '<pt:objectStyle x="1pt" y="2pt" width="10pt" height="10pt"/>';

async function lossyLbx(): Promise<Uint8Array> {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<pt:document xmlns:pt="http://schemas.brother.info/ptouch/2007/lbx/main"' +
    ' xmlns:style="http://schemas.brother.info/ptouch/2007/lbx/style"' +
    ' xmlns:draw="http://schemas.brother.info/ptouch/2007/lbx/draw"' +
    ' xmlns:image="http://schemas.brother.info/ptouch/2007/lbx/image"' +
    ' version="1.10">' +
    "<pt:body><style:sheet>" +
    '<style:paper width="68pt" height="100pt"/>' +
    "<pt:objects>" +
    `<draw:rect>${STYLE}</draw:rect>` +
    `<pt:group>${STYLE}</pt:group>` +
    `<image:image>${STYLE}<image:imageStyle fileName="Object0.bmp"/></image:image>` +
    `<draw:rect>${STYLE}</draw:rect>` +
    "</pt:objects>" +
    "</style:sheet></pt:body></pt:document>";
  const zip = new JSZip();
  zip.file("label.xml", xml);
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseLbx warnings", () => {
  it("reports a missing image entry and an unsupported object", async () => {
    const warnings: LbxWarning[] = [];
    const config = await parseLbx(await lossyLbx(), { onWarning: (w) => warnings.push(w) });

    expect(warnings).toEqual([
      expect.objectContaining({ code: "unsupported-object", element: "pt:group" }),
      expect.objectContaining({ code: "missing-image", fileName: "Object0.bmp" }),
    ]);
    expect(config.objects.map((o) => o.type)).toEqual(["rect", "image", "rect"]);
  });

  it("throws on the first warning when strict", async () => {
    await expect(parseLbx(await lossyLbx(), { strict: true })).rejects.toThrow(
      /Lossy .lbx parse: unsupported object <pt:group>/,
    );
  });

  it("reports nothing for a faithful file", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/Two-line cable label.lbx", import.meta.url));
    const warnings: LbxWarning[] = [];
    await parseLbx(readFileSync(fixture), { onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([]);
  });
});

describe("parseLbx on a malformed document", () => {
  it("names the missing sheet rather than throwing a TypeError", async () => {
    const zip = new JSZip();
    zip.file("label.xml", "<pt:document><pt:body></pt:body></pt:document>");
    await expect(parseLbx(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
      "missing pt:body/style:sheet/style:paper",
    );
  });
});
