import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import JSZip from "jszip";
import { buildLbx, TAPE, type LabelConfig } from "../src/index.js";

describe("roundtrip comparison", () => {
  it("generates XML structurally similar to a real Device label LBX", async () => {
    // Recreate the "Device label" which is a simple single-text auto-length 12mm label
    const config: LabelConfig = {
      paper: {
        width: TAPE["12mm"].width,
        format: TAPE["12mm"].format,
        autoLength: true,
        printerName: "Brother PT-P710BT",
        printerID: 30256,
      },
      objects: [
        {
          type: "text",
          position: { x: 14.1, y: 3.3, width: 33.2, height: 25.8 },
          font: { name: "Univers LT Std 57 Cn", size: 21.2, weight: 700 },
          data: "HS6",
          control: "AUTOLEN",
          horizontalAlignment: "CENTER",
          verticalAlignment: "TOP",
          shrink: true,
        },
      ],
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);
    const labelXml = await zip.file("label.xml")!.async("string");

    // Verify key structural elements match the real file
    expect(labelXml).toContain('xmlns:pt="http://schemas.brother.info/ptouch/2007/lbx/main"');
    expect(labelXml).toContain('width="33.6pt"');
    expect(labelXml).toContain('autoLength="true"');
    expect(labelXml).toContain('printerID="30256"');
    expect(labelXml).toContain('name="Univers LT Std 57 Cn"');
    expect(labelXml).toContain('weight="700"');
    expect(labelXml).toContain('size="21.2pt"');
    expect(labelXml).toContain('control="AUTOLEN"');
    expect(labelXml).toContain(">HS6<");
  });

  it("generates structure matching the filament label (with database)", async () => {
    const config: LabelConfig = {
      paper: {
        width: TAPE["12mm"].width,
        format: TAPE["12mm"].format,
        autoLength: true,
        printerName: "Brother PT-P710BT",
      },
      objects: [
        {
          type: "rect",
          position: { x: 5.5, y: 2.5, width: 35.7, height: 28 },
          shape: "ROUNDRECTANGLE",
          roundnessX: 7,
          roundnessY: 7,
          pen: { style: "INSIDEFRAME", widthX: 0.8, widthY: 0.8 },
        },
        {
          type: "text",
          position: { x: 44.5, y: 3.8, width: 60.5, height: 15 },
          font: { name: "Helvetica Neue Condensed Bold", size: 12, weight: 900 },
          data: "Polymaker",
          control: "LONGTEXT",
          horizontalAlignment: "LEFT",
          verticalAlignment: "TOP",
          autoLF: true,
        },
        {
          type: "text",
          position: { x: 11, y: 10.8, width: 24.5, height: 18.7 },
          font: { name: "Helvetica Neue Condensed Bold", size: 15.8, weight: 700 },
          data: "PLA",
          control: "AUTOLEN",
          horizontalAlignment: "CENTER",
          verticalAlignment: "TOP",
        },
        {
          type: "text",
          position: { x: 44.5, y: 18.8, width: 35.9, height: 9.5 },
          font: { name: "Helvetica Neue Condensed Bold", size: 8, weight: 700 },
          data: "Lime Green",
          control: "AUTOLEN",
          horizontalAlignment: "LEFT",
          verticalAlignment: "TOP",
        },
      ],
      database: {
        databasePath: "/Users/test/Downloads/filaments.csv",
        mergeTable: "filaments.csv",
        currentRecord: 131,
        containsFieldName: true,
        fields: [
          { fieldName: "ID" },
          { fieldName: "Type" },
          { fieldName: "Mfr." },
          { fieldName: "Color" },
        ],
        mergeFieldStyles: [
          { name: "Type", fieldName: "Type" },
          { name: "Mfr.", fieldName: "Mfr." },
          { name: "Color", fieldName: "Color" },
        ],
      },
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);
    const labelXml = await zip.file("label.xml")!.async("string");

    expect(labelXml).toContain("draw:rect");
    expect(labelXml).toContain('shape="ROUNDRECTANGLE"');
    expect(labelXml).toContain('control="LONGTEXT"');
    expect(labelXml).toContain("Polymaker");
    expect(labelXml).toContain("PLA");
    expect(labelXml).toContain("Lime Green");
    expect(labelXml).toContain("database:database");
    expect(labelXml).toContain('currentRecord="131"');
    expect(labelXml).toContain('fieldName="Mfr."');
  });
});
