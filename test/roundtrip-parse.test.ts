import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import JSZip from "jszip";
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

describe("round-trip: cut instructions", () => {
  const base: LabelConfig = {
    paper: { width: TAPE["12mm"].width, format: TAPE["12mm"].format, height: 300, autoLength: false },
    objects: [],
  };

  it("round-trips freeCut positions", async () => {
    const lbx = await buildLbx({ ...base, cut: { freeCut: [100, 200] } });
    const parsed = await parseLbx(lbx);
    expect(parsed.cut).toEqual({ freeCut: [100, 200] });
  });

  it("round-trips a regularCut interval", async () => {
    const lbx = await buildLbx({ ...base, cut: { regularCut: 72 } });
    const parsed = await parseLbx(lbx);
    expect(parsed.cut).toEqual({ regularCut: 72 });
  });

  it("omits cut entirely for the no-cuts default", async () => {
    const lbx = await buildLbx(base);
    const parsed = await parseLbx(lbx);
    expect(parsed.cut).toBeUndefined();
  });
});

/**
 * Document order *is* z-order: `pt:objects` lists back to front, so a barcode
 * written after an image draws over it. The parser used to walk the tree one
 * element name at a time — every text, then every rect, then every line, image
 * and barcode — which returned the right objects in an order the file never
 * stated. A consumer that draws them in the order it is handed them, as
 * lbx-editor does, then stacks a label wrong and writes the wrong stack back
 * out on export.
 */
describe("round-trip: object order", () => {
  const paper = { width: TAPE["24mm"].width, format: TAPE["24mm"].format, height: 200, autoLength: false };

  /** One of each type, interleaved so no per-type grouping can reproduce it. */
  const interleaved: LabelConfig = {
    paper,
    objects: [
      { type: "rect", position: { x: 0, y: 0, width: 10, height: 10 } },
      { type: "text", position: { x: 10, y: 0, width: 10, height: 10 }, font: { name: "Arial", size: 6 }, data: "a" },
      { type: "barcode", position: { x: 20, y: 0, width: 10, height: 10 }, protocol: "CODE128", data: "A" },
      { type: "line", position: { x: 30, y: 0, width: 10, height: 0 }, points: [{ x: 30, y: 0 }, { x: 40, y: 0 }] },
      { type: "text", position: { x: 40, y: 0, width: 10, height: 10 }, font: { name: "Arial", size: 6 }, data: "b" },
      { type: "rect", position: { x: 50, y: 0, width: 10, height: 10 } },
    ],
  };

  it("returns objects in the order the document lists them", async () => {
    const parsed = await parseLbx(await buildLbx(interleaved));
    expect(parsed.objects.map((o) => o.type)).toEqual([
      "rect", "text", "barcode", "line", "text", "rect",
    ]);
  });

  it("keeps each object's own identity through the reordering", async () => {
    const parsed = await parseLbx(await buildLbx(interleaved));
    expect(parsed.objects.map((o) => o.position.x)).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("loses no object when the document interleaves types", async () => {
    const parsed = await parseLbx(await buildLbx(interleaved));
    expect(parsed.objects).toHaveLength(interleaved.objects.length);
  });

  /**
   * The stronger case: files P-touch wrote, where the interleaving is its own
   * and not a shape we invented to fail against. `Filament Label 3` is the one
   * worth naming — its rectangle is the first object in the document, a
   * background under the text, and the old parser handed it back last, which is
   * to say on top of everything it was drawn beneath.
   */
  const ptouchFixtures: Array<[string, string[]]> = [
    ["Filament Label 3.lbx", ["rect", "text", "text", "text", "text"]],
    ["Two-line cable label.lbx", ["text", "line", "text"]],
    [
      "Keyboard switch canister labels.lbx",
      ["text", "text", "text", "text", "text", "line", "text"],
    ],
  ];

  for (const [name, expected] of ptouchFixtures) {
    it(`preserves the order P-touch wrote in ${name}`, async () => {
      const parsed = await parseLbx(
        await readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))),
      );
      expect(parsed.objects.map((o) => o.type)).toEqual(expected);
    });
  }

  it("orders around an object type this library does not model", async () => {
    // P-touch writes object kinds bil-lbx has no parser for — tables, groups,
    // cable-label symbols. Those show up in the element order and in no bucket,
    // so the ordering has to step over a name it cannot place instead of
    // falling out of step with the objects it can.
    const lbx = await buildLbx(interleaved);
    const zip = await JSZip.loadAsync(lbx);
    const xml = await zip.file("label.xml")!.async("string");
    const withTable = xml.replace(
      "<barcode:barcode>",
      "<table:table><pt:data>x</pt:data></table:table><barcode:barcode>",
    );
    expect(withTable).not.toBe(xml);
    zip.file("label.xml", withTable);

    const parsed = await parseLbx(await zip.generateAsync({ type: "uint8array" }));
    expect(parsed.objects.map((o) => o.position.x)).toEqual([0, 10, 20, 30, 40, 50]);
  });
});
