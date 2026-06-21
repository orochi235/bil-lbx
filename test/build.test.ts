import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildLbx, TAPE, type LabelConfig } from "../src/index.js";

describe("buildLbx", () => {
  it("produces a valid zip with label.xml and prop.xml", async () => {
    const config: LabelConfig = {
      paper: {
        width: TAPE["12mm"].width,
        format: TAPE["12mm"].format,
        autoLength: true,
      },
      objects: [
        {
          type: "text",
          position: { x: 14, y: 3, width: 33, height: 26 },
          font: { name: "Helvetica", size: 12, weight: 700 },
          data: "Hello",
        },
      ],
    };

    const buf = await buildLbx(config);

    // It should be a valid ZIP
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("label.xml")).not.toBeNull();
    expect(zip.file("prop.xml")).not.toBeNull();

    const labelXml = await zip.file("label.xml")!.async("string");
    expect(labelXml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(labelXml).toContain("http://schemas.brother.info/ptouch/2007/lbx/main");
    expect(labelXml).toContain("text:text");
    expect(labelXml).toContain("Hello");
  });

  it("produces correct paper attributes for 12mm tape", async () => {
    const config: LabelConfig = {
      paper: {
        width: TAPE["12mm"].width,
        format: TAPE["12mm"].format,
        autoLength: true,
        printerName: "Brother PT-P710BT",
      },
      objects: [
        {
          type: "text",
          position: { x: 10, y: 3, width: 30, height: 25 },
          font: { name: "Arial", size: 10 },
          data: "Test",
        },
      ],
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);
    const labelXml = await zip.file("label.xml")!.async("string");

    expect(labelXml).toContain('width="33.6pt"');
    expect(labelXml).toContain('format="259"');
    expect(labelXml).toContain('autoLength="true"');
    expect(labelXml).toContain('printerName="Brother PT-P710BT"');
  });

  it("handles multi-line text", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["12mm"].width, format: TAPE["12mm"].format },
      objects: [
        {
          type: "text",
          position: { x: 10, y: 0, width: 60, height: 30 },
          font: { name: "Univers LT Std 57 Cn", size: 10, weight: 700 },
          data: "LABEL\nMAKER",
          horizontalAlignment: "RIGHT",
          verticalAlignment: "CENTER",
          control: "FIXEDFRAME",
        },
      ],
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);
    const labelXml = await zip.file("label.xml")!.async("string");

    expect(labelXml).toContain("LABEL&#10;MAKER");
    expect(labelXml).toContain('control="FIXEDFRAME"');
    expect(labelXml).toContain('horizontalAlignment="RIGHT"');
    // Should have stringItems for each line + newline
    expect(labelXml).toContain('charLen="5"');
    expect(labelXml).toContain('charLen="1"');
  });

  it("includes images as ObjectN.bmp in the zip", async () => {
    const fakeImage = new TextEncoder().encode("BM fake bitmap data");

    const config: LabelConfig = {
      paper: { width: TAPE["24mm"].width, format: TAPE["24mm"].format },
      objects: [
        {
          type: "image",
          position: { x: 5, y: 8, width: 50, height: 40 },
          imageData: fakeImage,
          originalName: "test.png",
        },
      ],
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);

    expect(zip.file("Object0.bmp")).not.toBeNull();
    const imgData = await zip.file("Object0.bmp")!.async("uint8array");
    expect(new TextDecoder().decode(imgData)).toBe("BM fake bitmap data");

    const labelXml = await zip.file("label.xml")!.async("string");
    expect(labelXml).toContain('fileName="Object0.bmp"');
    expect(labelXml).toContain('originalName="test.png"');
    expect(labelXml).toContain("image:mono");
  });

  it("serializes rectangles with rounded corners", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["12mm"].width, format: TAPE["12mm"].format },
      objects: [
        {
          type: "rect",
          position: { x: 5, y: 2, width: 36, height: 28 },
          shape: "ROUNDRECTANGLE",
          roundnessX: 7,
          roundnessY: 7,
          pen: { style: "INSIDEFRAME", widthX: 0.8, widthY: 0.8 },
        },
      ],
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);
    const labelXml = await zip.file("label.xml")!.async("string");

    expect(labelXml).toContain("draw:rect");
    expect(labelXml).toContain('shape="ROUNDRECTANGLE"');
    expect(labelXml).toContain('roundnessX="7pt"');
    expect(labelXml).toContain('style="INSIDEFRAME"');
  });

  it("serializes lines/polylines", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["24mm"].width, format: TAPE["24mm"].format },
      objects: [
        {
          type: "line",
          position: { x: -10, y: 43, width: 109, height: 1 },
          points: [
            { x: -9.7, y: 43.6 },
            { x: 98.6, y: 43.9 },
          ],
          arrowBegin: "SQUARE",
          arrowEnd: "SQUARE",
          pen: { style: "INSIDEFRAME", widthX: 0.5, widthY: 0.5 },
        },
      ],
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);
    const labelXml = await zip.file("label.xml")!.async("string");

    expect(labelXml).toContain("draw:poly");
    expect(labelXml).toContain('shape="LINE"');
    expect(labelXml).toContain('arrowBegin="SQUARE"');
    expect(labelXml).toContain("draw:polyLinePoints");
  });

  it("includes database configuration when provided", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["12mm"].width, format: TAPE["12mm"].format },
      objects: [
        {
          type: "text",
          position: { x: 10, y: 3, width: 30, height: 15 },
          font: { name: "Arial", size: 12 },
          data: "Polymaker",
        },
      ],
      database: {
        databasePath: "/path/to/data.csv",
        mergeTable: "data.csv",
        currentRecord: 1,
        fields: [
          { fieldName: "Name" },
          { fieldName: "Color" },
        ],
        mergeFieldStyles: [
          { name: "Name", fieldName: "Name" },
          { name: "Color", fieldName: "Color" },
        ],
      },
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);
    const labelXml = await zip.file("label.xml")!.async("string");

    expect(labelXml).toContain("database:database");
    expect(labelXml).toContain('databasePath="/path/to/data.csv"');
    expect(labelXml).toContain('fieldName="Color"');
    expect(labelXml).toContain("database:dbMergeFieldStyle");
  });

  it("prop.xml has correct metadata structure", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["12mm"].width, format: TAPE["12mm"].format },
      objects: [],
    };

    const buf = await buildLbx(config);
    const zip = await JSZip.loadAsync(buf);
    const propXml = await zip.file("prop.xml")!.async("string");

    expect(propXml).toContain("meta:properties");
    expect(propXml).toContain("meta:appName");
    expect(propXml).toContain("brother-lbx");
    expect(propXml).toContain("dcterms:created");
    expect(propXml).toContain("meta:revision");
  });
});
