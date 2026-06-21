import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { buildLbx, parseLbx, TAPE, type LabelConfig } from "../src/index.js";

describe("round-trip: build → parse", () => {
  it("round-trips a simple text label", async () => {
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
          position: { x: 14, y: 3, width: 33, height: 26 },
          font: { name: "Helvetica", size: 12, weight: 700 },
          data: "Hello",
          horizontalAlignment: "CENTER",
          verticalAlignment: "TOP",
        },
      ],
    };

    const lbx = await buildLbx(config);
    const parsed = await parseLbx(lbx);

    expect(parsed.paper.width).toBe(config.paper.width);
    expect(parsed.paper.autoLength).toBe(true);
    expect(parsed.objects).toHaveLength(1);

    const obj = parsed.objects[0]!;
    expect(obj.type).toBe("text");
    if (obj.type === "text") {
      expect(obj.data).toBe("Hello");
      expect(obj.font.name).toBe("Helvetica");
      expect(obj.font.size).toBe(12);
      expect(obj.font.weight).toBe(700);
      expect(obj.position.x).toBe(14);
      expect(obj.position.y).toBe(3);
      expect(obj.horizontalAlignment).toBe("CENTER");
      expect(obj.verticalAlignment).toBe("TOP");
    }
  });

  it("round-trips a rect with rounded corners", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["12mm"].width, format: TAPE["12mm"].format },
      objects: [
        {
          type: "rect",
          position: { x: 5, y: 2, width: 36, height: 28 },
          shape: "ROUNDRECTANGLE",
          roundnessX: 7,
          roundnessY: 7,
          pen: { style: "INSIDEFRAME", widthX: 0.8, widthY: 0.8, color: "#000000" },
        },
      ],
    };

    const lbx = await buildLbx(config);
    const parsed = await parseLbx(lbx);

    expect(parsed.objects).toHaveLength(1);
    const obj = parsed.objects[0]!;
    expect(obj.type).toBe("rect");
    if (obj.type === "rect") {
      expect(obj.shape).toBe("ROUNDRECTANGLE");
      expect(obj.roundnessX).toBe(7);
      expect(obj.pen?.style).toBe("INSIDEFRAME");
      expect(obj.pen?.widthX).toBe(0.8);
    }
  });

  it("round-trips an image", async () => {
    const fakeImage = new Uint8Array([66, 77, 1, 2, 3, 4, 5]);
    const config: LabelConfig = {
      paper: { width: TAPE["24mm"].width, format: TAPE["24mm"].format },
      objects: [
        {
          type: "image",
          position: { x: 10, y: 8, width: 50, height: 40 },
          imageData: fakeImage,
          originalName: "test.png",
        },
      ],
    };

    const lbx = await buildLbx(config);
    const parsed = await parseLbx(lbx);

    expect(parsed.objects).toHaveLength(1);
    const obj = parsed.objects[0]!;
    expect(obj.type).toBe("image");
    if (obj.type === "image") {
      expect(obj.originalName).toBe("test.png");
      expect(obj.imageData).toBeInstanceOf(Uint8Array);
      expect(Array.from(obj.imageData)).toEqual([66, 77, 1, 2, 3, 4, 5]);
    }
  });

  it("round-trips multi-line text", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["12mm"].width, format: TAPE["12mm"].format },
      objects: [
        {
          type: "text",
          position: { x: 10, y: 0, width: 60, height: 30 },
          font: { name: "Arial", size: 10, weight: 400 },
          data: "Line 1\nLine 2",
          control: "FIXEDFRAME",
        },
      ],
    };

    const lbx = await buildLbx(config);
    const parsed = await parseLbx(lbx);

    const obj = parsed.objects[0]!;
    expect(obj.type).toBe("text");
    if (obj.type === "text") {
      expect(obj.data).toBe("Line 1\nLine 2");
      expect(obj.control).toBe("FIXEDFRAME");
    }
  });

  it("round-trips a QR code barcode", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["24mm"].width, format: TAPE["24mm"].format },
      objects: [
        {
          type: "barcode",
          position: { x: 10, y: 10, width: 50, height: 50 },
          protocol: "QRCODE",
          data: "https://example.com",
          barWidth: 1.2,
          humanReadable: false,
          checkDigit: true,
          qrCode: { eccLevel: "15%", cellSize: 2, model: 2 },
        },
      ],
    };

    const lbx = await buildLbx(config);
    const parsed = await parseLbx(lbx);

    expect(parsed.objects).toHaveLength(1);
    const obj = parsed.objects[0]!;
    expect(obj.type).toBe("barcode");
    if (obj.type === "barcode") {
      expect(obj.protocol).toBe("QRCODE");
      expect(obj.data).toBe("https://example.com");
      expect(obj.barWidth).toBe(1.2);
      expect(obj.humanReadable).toBe(false);
      expect(obj.qrCode).toBeDefined();
      expect(obj.qrCode!.eccLevel).toBe("15%");
      expect(obj.qrCode!.cellSize).toBe(2);
    }
  });

  it("round-trips a CODE128 barcode", async () => {
    const config: LabelConfig = {
      paper: { width: TAPE["12mm"].width, format: TAPE["12mm"].format },
      objects: [
        {
          type: "barcode",
          position: { x: 5, y: 3, width: 80, height: 25 },
          protocol: "CODE128",
          data: "ABC-12345",
          humanReadable: true,
          humanReadableAlignment: "CENTER",
        },
      ],
    };

    const lbx = await buildLbx(config);
    const parsed = await parseLbx(lbx);

    const obj = parsed.objects[0]!;
    expect(obj.type).toBe("barcode");
    if (obj.type === "barcode") {
      expect(obj.protocol).toBe("CODE128");
      expect(obj.data).toBe("ABC-12345");
      expect(obj.humanReadable).toBe(true);
      expect(obj.humanReadableAlignment).toBe("CENTER");
      expect(obj.qrCode).toBeUndefined();
    }
  });
});

describe("parse real .lbx files", () => {
  it("parses the Device label", async () => {
    const data = await readFile(
      "/tmp/lbx-samples/Device label/label.xml",
      "utf-8",
    ).catch(() => null);
    // Only run if sample files are available
    if (!data) return;

    const lbxFile = await readFile(
      "/Users/mike/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Device label.lbx",
    );
    const parsed = await parseLbx(lbxFile);

    expect(parsed.paper.width).toBeCloseTo(33.6, 1);
    expect(parsed.paper.autoLength).toBe(true);
    expect(parsed.objects.length).toBeGreaterThan(0);
    expect(parsed.objects[0]!.type).toBe("text");
    if (parsed.objects[0]!.type === "text") {
      expect(parsed.objects[0]!.data).toBe("HS6");
    }
  });

  it("parses the Filament Label 3 with database", async () => {
    const lbxFile = await readFile(
      "/Users/mike/Library/Mobile Documents/com~apple~CloudDocs/3d printing/Filament Label 3.lbx",
    ).catch(() => null);
    if (!lbxFile) return;

    const parsed = await parseLbx(lbxFile);

    expect(parsed.paper.autoLength).toBe(true);
    // Should have text + rect objects
    const types = parsed.objects.map((o) => o.type);
    expect(types).toContain("text");
    expect(types).toContain("rect");
    // Should have database config
    expect(parsed.database).toBeDefined();
    expect(parsed.database?.mergeFieldStyles.length).toBeGreaterThan(0);
  });

  it("parses the Lego icon labels with images", async () => {
    const lbxFile = await readFile(
      "/Users/mike/Library/Mobile Documents/com~apple~CloudDocs/Documents/Lego icon labels - Food.lbx",
    ).catch(() => null);
    if (!lbxFile) return;

    const parsed = await parseLbx(lbxFile);

    const images = parsed.objects.filter((o) => o.type === "image");
    expect(images.length).toBeGreaterThan(0);
    if (images[0]!.type === "image") {
      expect(images[0]!.imageData.length).toBeGreaterThan(0);
    }
  });
});
