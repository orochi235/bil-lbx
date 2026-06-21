import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { parseLbx } from "../src/index.js";

const SAMPLES_DIR = "/tmp/lbx-samples";

/**
 * Build a .lbx zip from an extracted sample directory.
 */
async function buildLbxFromDir(dirPath: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const files = readdirSync(dirPath);
  for (const file of files) {
    const filePath = join(dirPath, file);
    const data = readFileSync(filePath);
    zip.file(file, data);
  }
  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}

describe("parseLbx", () => {
  describe("Two-line cable label", () => {
    it("parses paper config correctly", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Two-line cable label"));
      const config = await parseLbx(data);

      expect(config.paper.width).toBe(33.6);
      expect(config.paper.height).toBe(144);
      expect(config.paper.marginLeft).toBe(2.8);
      expect(config.paper.marginTop).toBe(11.6);
      expect(config.paper.marginRight).toBe(2.8);
      expect(config.paper.marginBottom).toBe(11.6);
      expect(config.paper.orientation).toBe("landscape");
      expect(config.paper.autoLength).toBe(false);
      expect(config.paper.format).toBe(259);
      expect(config.paper.printerID).toBe(30256);
      expect(config.paper.printerName).toBe("Brother PT-P710BT");
    });

    it("parses text objects", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Two-line cable label"));
      const config = await parseLbx(data);

      // Should have 2 text objects and 1 line object
      const textObjects = config.objects.filter((o) => o.type === "text");
      const lineObjects = config.objects.filter((o) => o.type === "line");
      expect(textObjects.length).toBe(2);
      expect(lineObjects.length).toBe(1);

      // First text object (ordered by XML appearance)
      const text1 = textObjects[0]!;
      expect(text1.data).toBe("LABEL\nMAKER");
      expect(text1.font.name).toBe("Univers LT Std 57 Cn");
      expect(text1.font.size).toBe(10);
      expect(text1.font.weight).toBe(700);
      expect(text1.horizontalAlignment).toBe("RIGHT");
      expect(text1.verticalAlignment).toBe("CENTER");
      expect(text1.control).toBe("FIXEDFRAME");
      expect(text1.shrink).toBe(true);
    });

    it("parses line objects with points and arrow styles", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Two-line cable label"));
      const config = await parseLbx(data);

      const lineObjects = config.objects.filter((o) => o.type === "line");
      expect(lineObjects.length).toBe(1);

      const line = lineObjects[0]!;
      expect(line.points.length).toBe(2);
      expect(line.points[0]!.x).toBeCloseTo(71.5);
      expect(line.points[0]!.y).toBeCloseTo(2.9);
      expect(line.points[1]!.x).toBeCloseTo(71.5);
      expect(line.points[1]!.y).toBeCloseTo(61.1);
      expect(line.arrowBegin).toBe("ROUND");
      expect(line.arrowEnd).toBe("ROUND");
      expect(line.pen?.style).toBe("DASH");
    });

    it("parses version from document", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Two-line cable label"));
      const config = await parseLbx(data);
      expect(config.version).toBe("1.7");
    });

    it("has no database config", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Two-line cable label"));
      const config = await parseLbx(data);
      expect(config.database).toBeUndefined();
    });
  });

  describe("Filament Label 3 (text + rect + database)", () => {
    it("parses rect objects", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Filament Label 3"));
      const config = await parseLbx(data);

      const rects = config.objects.filter((o) => o.type === "rect");
      expect(rects.length).toBe(1);

      const rect = rects[0]!;
      expect(rect.shape).toBe("ROUNDRECTANGLE");
      expect(rect.roundnessX).toBe(7);
      expect(rect.roundnessY).toBe(7);
      expect(rect.pen?.style).toBe("INSIDEFRAME");
      expect(rect.position.x).toBeCloseTo(5.5);
      expect(rect.position.width).toBeCloseTo(35.7);
    });

    it("parses database config", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Filament Label 3"));
      const config = await parseLbx(data);

      expect(config.database).toBeDefined();
      expect(config.database!.type).toBe("FILE");
      expect(config.database!.mergeTable).toBe("3d Printing - Filaments (9).csv");
      expect(config.database!.currentRecord).toBe(131);
      expect(config.database!.containsFieldName).toBe(true);

      // Fields
      expect(config.database!.fields.length).toBeGreaterThan(0);
      expect(config.database!.fields[0]!.fieldName).toBe("ID");

      // Merge field styles
      expect(config.database!.mergeFieldStyles.length).toBe(4);
      expect(config.database!.mergeFieldStyles[0]!.name).toBe("Subtype");
      expect(config.database!.mergeFieldStyles[0]!.fieldName).toBe("Subtype");
    });

    it("parses multiple text objects", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Filament Label 3"));
      const config = await parseLbx(data);

      const texts = config.objects.filter((o) => o.type === "text");
      expect(texts.length).toBe(4);

      // Check one of the text objects has LONGTEXT control
      const longText = texts.find((t) => t.type === "text" && t.control === "LONGTEXT");
      expect(longText).toBeDefined();
    });

    it("parses autoLength=true", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Filament Label 3"));
      const config = await parseLbx(data);
      expect(config.paper.autoLength).toBe(true);
    });
  });

  describe("Lego icon labels - Food (images)", () => {
    it("parses image objects with data", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Lego icon labels - Food"));
      const config = await parseLbx(data);

      const images = config.objects.filter((o) => o.type === "image");
      expect(images.length).toBe(5);

      // All images should have non-empty imageData
      for (const img of images) {
        if (img.type === "image") {
          expect(img.imageData.length).toBeGreaterThan(0);
          expect(img.imageData).toBeInstanceOf(Uint8Array);
        }
      }
    });

    it("parses image originalName", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Lego icon labels - Food"));
      const config = await parseLbx(data);

      const images = config.objects.filter((o) => o.type === "image");
      const firstImage = images[0]!;
      if (firstImage.type === "image") {
        expect(firstImage.originalName).toBe("4342.png");
      }
    });

    it("parses image effect settings", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Lego icon labels - Food"));
      const config = await parseLbx(data);

      const images = config.objects.filter((o) => o.type === "image");
      const img = images[0]!;
      if (img.type === "image") {
        expect(img.effect).toBe("MONO");
        expect(img.monoOperation).toBe("BINARY");
        expect(img.ditherKind).toBe("MESH");
      }
    });

    it("has text objects too", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Lego icon labels - Food"));
      const config = await parseLbx(data);

      const texts = config.objects.filter((o) => o.type === "text");
      expect(texts.length).toBe(5);
    });
  });

  describe("Keyboard switch canister labels (text + lines + database)", () => {
    it("parses all object types", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Keyboard switch canister labels"));
      const config = await parseLbx(data);

      const texts = config.objects.filter((o) => o.type === "text");
      const lines = config.objects.filter((o) => o.type === "line");

      expect(texts.length).toBe(6);
      expect(lines.length).toBe(1);
    });

    it("parses 24mm tape format", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Keyboard switch canister labels"));
      const config = await parseLbx(data);

      expect(config.paper.width).toBe(68);
      expect(config.paper.format).toBe(261);
      expect(config.paper.autoLength).toBe(false);
      expect(config.paper.height).toBe(99.2);
    });

    it("parses database with multiple merge field styles", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Keyboard switch canister labels"));
      const config = await parseLbx(data);

      expect(config.database).toBeDefined();
      expect(config.database!.mergeFieldStyles.length).toBe(5);
      const fieldNames = config.database!.mergeFieldStyles.map((s) => s.name);
      expect(fieldNames).toContain("Mfr.");
      expect(fieldNames).toContain("Model");
      expect(fieldNames).toContain("Type");
    });

    it("parses line with INSIDEFRAME pen and SQUARE arrows", async () => {
      const data = await buildLbxFromDir(join(SAMPLES_DIR, "Keyboard switch canister labels"));
      const config = await parseLbx(data);

      const lines = config.objects.filter((o) => o.type === "line");
      const line = lines[0]!;
      expect(line.pen?.style).toBe("INSIDEFRAME");
      expect(line.arrowBegin).toBe("SQUARE");
      expect(line.arrowEnd).toBe("SQUARE");
    });
  });

  describe("error handling", () => {
    it("throws on invalid zip data", async () => {
      await expect(parseLbx(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    });

    it("throws on zip without label.xml", async () => {
      const zip = new JSZip();
      zip.file("prop.xml", "<prop/>");
      const data = await zip.generateAsync({ type: "uint8array" });
      await expect(parseLbx(data)).rejects.toThrow("missing label.xml");
    });
  });
});
