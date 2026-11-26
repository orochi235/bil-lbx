import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type {
  BackgroundConfig,
  CutConfig,
  LabelConfig,
  LabelObject,
  LbxWarning,
  ParseOptions,
  PaperConfig,
  DatabaseConfig,
  DatabaseField,
  DatabaseMergeFieldStyle,
  Orientation,
} from "./types.js";
import { asArray, attr, boolAttr, numAttr, ptNum, ptNumRequired } from "./parse-attrs.js";
import {
  parseBarcodeObject,
  parseImageObject,
  parseLineObject,
  parseRectObject,
  parseTextObject,
} from "./parse-objects.js";

const SUPPORTED_OBJECTS = new Set([
  "text:text",
  "draw:rect",
  "draw:poly",
  "image:image",
  "barcode:barcode",
]);

/**
 * Parse a .lbx file (ZIP containing label.xml, prop.xml, and optional ObjectN.bmp files)
 * back into a LabelConfig object.
 *
 * Anything the result cannot carry — an image whose BMP is missing, an object
 * kind this library does not model — is reported through `options.onWarning`,
 * or thrown with `options.strict`.
 */
export async function parseLbx(
  data: Uint8Array | ArrayBuffer,
  options: ParseOptions = {}
): Promise<LabelConfig> {
  const warn = (warning: LbxWarning) => {
    if (options.strict) throw new Error(`Lossy .lbx parse: ${warning.message}`);
    options.onWarning?.(warning);
  };

  const zip = await JSZip.loadAsync(data);

  const labelFile = zip.file("label.xml");
  if (!labelFile) {
    throw new Error("Invalid .lbx file: missing label.xml");
  }

  const labelXml = await labelFile.async("string");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Preserve text content correctly
    textNodeName: "#text",
    // Don't parse numbers/booleans in attributes — keep them as strings
    parseAttributeValue: false,
    parseTagValue: false,
    // Decode numeric character references (e.g. &#10; → \n)
    processEntities: true,
    htmlEntities: true,
    trimValues: false,
  });

  const doc = parser.parse(labelXml);
  const ptDoc = doc["pt:document"];
  if (!ptDoc) {
    throw new Error("Invalid label.xml: missing pt:document root");
  }

  const version = attr(ptDoc, "version");
  const sheet = ptDoc["pt:body"]?.["style:sheet"];
  if (!sheet?.["style:paper"]) {
    throw new Error("Invalid label.xml: missing pt:body/style:sheet/style:paper");
  }

  // Parse paper config
  const paper = parsePaper(sheet["style:paper"]);

  // Parse objects, grouped by element name — the shape fast-xml-parser hands
  // back. `objects` below puts them into the order the document states, which
  // is the order they stack in.
  const objectsNode = sheet["pt:objects"];
  const byTag: Record<string, LabelObject[]> = {};

  if (objectsNode) {
    for (const [element, nodes] of Object.entries(objectsNode as Record<string, unknown>)) {
      if (element.startsWith("@_") || element === "#text" || SUPPORTED_OBJECTS.has(element)) continue;
      for (const _ of asArray(nodes)) {
        warn({
          code: "unsupported-object",
          element,
          message: `unsupported object <${element}> dropped`,
        });
      }
    }

    // Parse text objects
    byTag["text:text"] = [];
    for (const node of asArray(objectsNode["text:text"])) {
      byTag["text:text"]!.push(parseTextObject(node));
    }

    // Parse rect objects
    byTag["draw:rect"] = [];
    for (const node of asArray(objectsNode["draw:rect"])) {
      byTag["draw:rect"]!.push(parseRectObject(node));
    }

    // Parse poly/line objects
    byTag["draw:poly"] = [];
    for (const node of asArray(objectsNode["draw:poly"])) {
      byTag["draw:poly"]!.push(parseLineObject(node));
    }

    // Parse image objects
    byTag["image:image"] = [];
    for (const node of asArray(objectsNode["image:image"])) {
      byTag["image:image"]!.push(await parseImageObject(node, zip, warn));
    }

    // Parse barcode objects
    byTag["barcode:barcode"] = [];
    for (const node of asArray(objectsNode["barcode:barcode"])) {
      byTag["barcode:barcode"]!.push(parseBarcodeObject(node));
    }
  }

  const objects = inDocumentOrder(byTag, objectElementOrder(labelXml));

  // Parse database config
  let database: DatabaseConfig | undefined;
  const dbNode = ptDoc["database:database"];
  if (dbNode) {
    database = parseDatabaseConfig(dbNode);
  }

  const config: LabelConfig = {
    paper,
    objects,
  };

  // The printable band. Under autoLength this is the only record of the
  // label's real length (paper.height is a placeholder there).
  const bgNode = sheet["style:backGround"];
  if (bgNode) {
    const background = parseBackground(bgNode);
    if (background) config.background = background;
  }

  // Cut instructions (style:cutLine). Only surfaced when present and
  // non-empty — "regularCut=0pt freeCut=''" is the no-cuts default.
  const cutNode = sheet["style:cutLine"];
  if (cutNode) {
    const cut: CutConfig = {};
    const regularCut = ptNum(attr(cutNode, "regularCut"));
    if (regularCut) cut.regularCut = regularCut;
    const freeCutStr = attr(cutNode, "freeCut");
    if (freeCutStr) {
      const freeCut = freeCutStr
        .trim()
        .split(/\s+/)
        .map((s) => ptNum(s))
        .filter((n): n is number => n !== undefined);
      if (freeCut.length > 0) cut.freeCut = freeCut;
    }
    if (cut.regularCut !== undefined || cut.freeCut !== undefined) {
      config.cut = cut;
    }
  }

  if (database) {
    config.database = database;
  }

  if (version) {
    config.version = version;
  }

  const generator = attr(ptDoc, "generator");
  if (generator) {
    config.generator = generator;
  }

  return config;
}

// --- Object order ---

/**
 * The names of `pt:objects`'s children, in the order the document lists them.
 *
 * Document order is z-order — `pt:objects` lists back to front, so a barcode
 * written after an image draws over it — but fast-xml-parser's default tree
 * groups repeated siblings into one array per element name, and nothing in
 * that shape records how the groups interleaved. So the file is read a second
 * time with `preserveOrder`, purely for the sequence.
 *
 * A second parse rather than a scan of the raw XML: the element names nest
 * (`draw:rect` contains `draw:rectStyle`, `barcode:barcode` contains
 * `barcode:barcodeStyle`) and P-touch nests a whole `pt:objects` inside a
 * group, so a text scan would have to reimplement enough of an XML parser to
 * know which depth it was at. `label.xml` is a few kilobytes — images live in
 * their own zip entries — so the second pass costs nothing worth saving.
 */
function objectElementOrder(labelXml: string): string[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    preserveOrder: true,
    parseTagValue: false,
    trimValues: false,
  });

  // With `preserveOrder` every node is a one-key object and every level is an
  // array, so a child is found by scanning rather than by lookup.
  let level: unknown = parser.parse(labelXml);
  for (const name of ["pt:document", "pt:body", "style:sheet", "pt:objects"]) {
    if (!Array.isArray(level)) return [];
    const found: unknown = level.find(
      (entry) => typeof entry === "object" && entry !== null && name in entry,
    );
    if (found === undefined) return [];
    level = (found as Record<string, unknown>)[name];
  }
  if (!Array.isArray(level)) return [];

  return level.flatMap((entry) =>
    typeof entry === "object" && entry !== null
      ? Object.keys(entry).filter((k) => k !== ":@")
      : [],
  );
}

/**
 * The parsed objects, restacked into the document's own order.
 *
 * Order within one element name already matches the document, so each name's
 * objects are handed out in turn as that name comes up in `order`.
 *
 * Anything `order` does not account for is appended rather than dropped. That
 * matters more than the ordering does: `objectElementOrder` gives up and
 * returns nothing on a document shaped unlike the ones we know, and a label
 * that comes back stacked wrong is a bug, while a label that comes back
 * missing an object is data loss.
 */
function inDocumentOrder(
  byTag: Record<string, LabelObject[]>,
  order: string[],
): LabelObject[] {
  const taken: Record<string, number> = {};
  const objects: LabelObject[] = [];

  for (const tag of order) {
    const bucket = byTag[tag];
    if (!bucket) continue;
    const next = taken[tag] ?? 0;
    if (next >= bucket.length) continue;
    objects.push(bucket[next]!);
    taken[tag] = next + 1;
  }

  for (const [tag, bucket] of Object.entries(byTag)) {
    for (let i = taken[tag] ?? 0; i < bucket.length; i++) objects.push(bucket[i]!);
  }

  return objects;
}

// --- Paper ---

function parsePaper(node: Record<string, unknown>): PaperConfig {
  const paper: PaperConfig = {
    width: ptNumRequired(attr(node, "width")),
  };

  const height = ptNum(attr(node, "height"));
  if (height !== undefined) paper.height = height;

  const marginLeft = ptNum(attr(node, "marginLeft"));
  if (marginLeft !== undefined) paper.marginLeft = marginLeft;

  const marginTop = ptNum(attr(node, "marginTop"));
  if (marginTop !== undefined) paper.marginTop = marginTop;

  const marginRight = ptNum(attr(node, "marginRight"));
  if (marginRight !== undefined) paper.marginRight = marginRight;

  const marginBottom = ptNum(attr(node, "marginBottom"));
  if (marginBottom !== undefined) paper.marginBottom = marginBottom;

  const orientation = attr(node, "orientation") as Orientation | undefined;
  if (orientation) paper.orientation = orientation;

  const autoLength = boolAttr(node, "autoLength");
  if (autoLength !== undefined) paper.autoLength = autoLength;

  const format = numAttr(node, "format");
  if (format !== undefined) paper.format = format;

  const printerID = numAttr(node, "printerID");
  if (printerID !== undefined) paper.printerID = printerID;

  const printerName = attr(node, "printerName");
  if (printerName) paper.printerName = printerName;

  const paperColor = attr(node, "paperColor");
  if (paperColor) paper.paperColor = paperColor;

  const paperInk = attr(node, "paperInk");
  if (paperInk) paper.paperInk = paperInk;

  return paper;
}

function parseBackground(node: Record<string, unknown>): BackgroundConfig | undefined {
  const x = ptNum(attr(node, "x"));
  const y = ptNum(attr(node, "y"));
  const width = ptNum(attr(node, "width"));
  const height = ptNum(attr(node, "height"));
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  return { x, y, width, height };
}

// --- Database ---

function parseDatabaseConfig(node: Record<string, unknown>): DatabaseConfig {
  const dbType = attr(node, "type");
  const databasePath = attr(node, "databasePath") ?? "";
  const mergeTable = attr(node, "mergeTable") ?? "";
  const currentRecord = numAttr(node, "currentRecord");
  const containsFieldName = boolAttr(node, "containsFieldName");

  // Parse merge field styles
  const mergeFieldStyles: DatabaseMergeFieldStyle[] = [];
  const stylesNode = node["database:dbMergeFieldStyles"] as Record<string, unknown> | undefined;
  if (stylesNode) {
    for (const style of asArray(
      stylesNode["database:dbMergeFieldStyle"] as Record<string, unknown> | Record<string, unknown>[]
    )) {
      const name = attr(style, "name") ?? "";
      const fieldName = attr(style, "fieldName") ?? "";
      const joinedField = boolAttr(style, "joinedField");

      const mfs: DatabaseMergeFieldStyle = { name, fieldName };
      if (joinedField) mfs.joinedField = joinedField;
      mergeFieldStyles.push(mfs);
    }
  }

  // Parse fields from dbTables
  const fields: DatabaseField[] = [];
  const tablesNode = node["database:dbTables"] as Record<string, unknown> | undefined;
  if (tablesNode) {
    const tableNodes = asArray(
      tablesNode["database:dbTable"] as Record<string, unknown> | Record<string, unknown>[]
    );
    // Use the first table
    if (tableNodes.length > 0) {
      const table = tableNodes[0]!;
      for (const field of asArray(
        table["database:dbField"] as Record<string, unknown> | Record<string, unknown>[]
      )) {
        const fieldName = attr(field, "fieldName") ?? "";
        const joinedField = boolAttr(field, "joinedField");
        const removeEmptyLine = boolAttr(field, "removeEmptyLine");

        const df: DatabaseField = { fieldName };
        if (joinedField) df.joinedField = joinedField;
        if (removeEmptyLine) df.removeEmptyLine = removeEmptyLine;
        fields.push(df);
      }
    }
  }

  const config: DatabaseConfig = {
    databasePath,
    mergeTable,
    fields,
    mergeFieldStyles,
  };

  if (dbType) config.type = dbType;
  if (currentRecord !== undefined) config.currentRecord = currentRecord;
  if (containsFieldName !== undefined) config.containsFieldName = containsFieldName;

  return config;
}
