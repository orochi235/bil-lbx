import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type {
  CutConfig,
  LabelConfig,
  LabelObject,
  TextObject,
  ImageObject,
  RectObject,
  LineObject,
  BarcodeObject,
  BarcodeProtocol,
  QrEccLevel,
  PaperConfig,
  PenConfig,
  BrushConfig,
  ObjectPosition,
  DatabaseConfig,
  DatabaseField,
  DatabaseMergeFieldStyle,
  FontConfig,
  TextStyleConfig,
  HorizontalAlignment,
  VerticalAlignment,
  InLineAlignment,
  TextControl,
  TextEffect,
  PenStyle,
  BrushStyle,
  AnchorPoint,
  FlipMode,
  Orientation,
  RectShape,
  ArrowStyle,
  ImageEffect,
  MonoOperation,
  DitherKind,
} from "./types.js";

/**
 * Parse a .lbx file (ZIP containing label.xml, prop.xml, and optional ObjectN.bmp files)
 * back into a LabelConfig object.
 */
export async function parseLbx(
  data: Uint8Array | ArrayBuffer
): Promise<LabelConfig> {
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
  const body = ptDoc["pt:body"];
  const sheet = body["style:sheet"];

  // Parse paper config
  const paper = parsePaper(sheet["style:paper"]);

  // Parse objects
  const objectsNode = sheet["pt:objects"];
  const objects: LabelObject[] = [];

  if (objectsNode) {
    // Parse text objects
    for (const node of asArray(objectsNode["text:text"])) {
      objects.push(parseTextObject(node));
    }

    // Parse rect objects
    for (const node of asArray(objectsNode["draw:rect"])) {
      objects.push(parseRectObject(node));
    }

    // Parse poly/line objects
    for (const node of asArray(objectsNode["draw:poly"])) {
      objects.push(parseLineObject(node));
    }

    // Parse image objects
    for (const node of asArray(objectsNode["image:image"])) {
      objects.push(await parseImageObject(node, zip));
    }

    // Parse barcode objects
    for (const node of asArray(objectsNode["barcode:barcode"])) {
      objects.push(parseBarcodeObject(node));
    }
  }

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

  return config;
}

// --- Helpers ---

function attr(node: Record<string, unknown>, name: string): string | undefined {
  const val = node[`@_${name}`];
  if (val === undefined || val === null) return undefined;
  return String(val);
}

function numAttr(node: Record<string, unknown>, name: string): number | undefined {
  const val = attr(node, name);
  if (val === undefined) return undefined;
  return parseFloat(val);
}

function ptNum(val: string | undefined): number | undefined {
  if (!val) return undefined;
  return parseFloat(val.replace("pt", ""));
}

function ptNumRequired(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace("pt", ""));
}

function boolAttr(node: Record<string, unknown>, name: string): boolean | undefined {
  const val = attr(node, name);
  if (val === undefined) return undefined;
  return val === "true";
}

function ptAttr(node: Record<string, unknown>, name: string): number | undefined {
  const val = attr(node, name);
  if (val === undefined) return undefined;
  return parseFloat(val.replace("pt", ""));
}

/** Ensure a value is always an array (handles single-element case from XML parser) */
function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
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

  return paper;
}

// --- Object position ---

function parsePosition(styleNode: Record<string, unknown>): ObjectPosition {
  const pos: ObjectPosition = {
    x: ptNumRequired(attr(styleNode, "x")),
    y: ptNumRequired(attr(styleNode, "y")),
    width: ptNumRequired(attr(styleNode, "width")),
    height: ptNumRequired(attr(styleNode, "height")),
  };

  const angle = numAttr(styleNode, "angle");
  if (angle !== undefined && angle !== 0) pos.angle = angle;

  const anchor = attr(styleNode, "anchor") as AnchorPoint | undefined;
  if (anchor && anchor !== "TOPLEFT") pos.anchor = anchor;

  const flip = attr(styleNode, "flip") as FlipMode | undefined;
  if (flip && flip !== "NONE") pos.flip = flip;

  return pos;
}

// --- Pen & Brush ---

function parsePen(node: Record<string, unknown>): PenConfig | undefined {
  if (!node) return undefined;
  const style = attr(node, "style") as PenStyle | undefined;
  if (!style || style === "NULL") return undefined;

  const pen: PenConfig = { style };

  const widthX = ptNum(attr(node, "widthX"));
  if (widthX !== undefined) pen.widthX = widthX;

  const widthY = ptNum(attr(node, "widthY"));
  if (widthY !== undefined) pen.widthY = widthY;

  const color = attr(node, "color");
  if (color) pen.color = color;

  return pen;
}

function parseBrush(node: Record<string, unknown>): BrushConfig | undefined {
  if (!node) return undefined;
  const style = attr(node, "style") as BrushStyle | undefined;
  if (!style || style === "NULL") return undefined;

  const brush: BrushConfig = { style };

  const color = attr(node, "color");
  if (color) brush.color = color;

  return brush;
}

// --- Text object ---

function parseTextObject(node: Record<string, unknown>): TextObject {
  const styleNode = node["pt:objectStyle"] as Record<string, unknown>;
  const position = parsePosition(styleNode);

  const penNode = styleNode["pt:pen"] as Record<string, unknown> | undefined;
  const brushNode = styleNode["pt:brush"] as Record<string, unknown> | undefined;
  const expandedNode = styleNode["pt:expanded"] as Record<string, unknown> | undefined;

  // Font info
  const fontInfoNode = node["text:ptFontInfo"] as Record<string, unknown>;
  const logFontNode = fontInfoNode["text:logFont"] as Record<string, unknown>;
  const fontExtNode = fontInfoNode["text:fontExt"] as Record<string, unknown>;

  const font: FontConfig = {
    name: attr(logFontNode, "name") ?? "Arial",
    size: ptNumRequired(attr(fontExtNode, "size")),
  };

  const weight = numAttr(logFontNode, "weight");
  if (weight !== undefined && weight !== 400) font.weight = weight;

  const italic = boolAttr(logFontNode, "italic");
  if (italic) font.italic = italic;

  const charSet = numAttr(logFontNode, "charSet");
  if (charSet !== undefined && charSet !== 0) font.charSet = charSet;

  const pitchAndFamily = numAttr(logFontNode, "pitchAndFamily");
  if (pitchAndFamily !== undefined) font.pitchAndFamily = pitchAndFamily;

  const fontWidth = numAttr(logFontNode, "width");
  if (fontWidth !== undefined && fontWidth !== 0) font.width = fontWidth;

  // Text style
  let textStyle: TextStyleConfig | undefined;
  const effect = attr(fontExtNode, "effect") as TextEffect | undefined;
  const underline = numAttr(fontExtNode, "underline");
  const strikeout = numAttr(fontExtNode, "strikeout");
  const textColor = attr(fontExtNode, "textColor");

  if (
    (effect && effect !== "NOEFFECT") ||
    (underline && underline !== 0) ||
    (strikeout && strikeout !== 0) ||
    (textColor && textColor !== "#000000")
  ) {
    textStyle = {};
    if (effect && effect !== "NOEFFECT") textStyle.effect = effect;
    if (underline && underline !== 0) textStyle.underline = underline;
    if (strikeout && strikeout !== 0) textStyle.strikeout = strikeout;
    if (textColor && textColor !== "#000000") textStyle.color = textColor;
  }

  // Text control
  const controlNode = node["text:textControl"] as Record<string, unknown> | undefined;
  const control = controlNode ? (attr(controlNode, "control") as TextControl | undefined) : undefined;
  const shrink = controlNode ? boolAttr(controlNode, "shrink") : undefined;
  const autoLF = controlNode ? boolAttr(controlNode, "autoLF") : undefined;

  // Alignment
  const alignNode = node["text:textAlign"] as Record<string, unknown> | undefined;
  const horizontalAlignment = alignNode
    ? (attr(alignNode, "horizontalAlignment") as HorizontalAlignment | undefined)
    : undefined;
  const verticalAlignment = alignNode
    ? (attr(alignNode, "verticalAlignment") as VerticalAlignment | undefined)
    : undefined;
  const inLineAlignment = alignNode
    ? (attr(alignNode, "inLineAlignment") as InLineAlignment | undefined)
    : undefined;

  // Text style node (charSpace, lineSpace, vertical)
  const textStyleNode = node["text:textStyle"] as Record<string, unknown> | undefined;
  const vertical = textStyleNode ? boolAttr(textStyleNode, "vertical") : undefined;
  const charSpace = textStyleNode ? numAttr(textStyleNode, "charSpace") : undefined;
  const lineSpace = textStyleNode ? numAttr(textStyleNode, "lineSpace") : undefined;

  // Data
  const data = String(node["pt:data"] ?? "");

  const obj: TextObject = {
    type: "text",
    position,
    font,
    data,
  };

  if (textStyle) obj.textStyle = textStyle;
  if (control) obj.control = control;
  if (horizontalAlignment) obj.horizontalAlignment = horizontalAlignment;
  if (verticalAlignment) obj.verticalAlignment = verticalAlignment;
  if (inLineAlignment) obj.inLineAlignment = inLineAlignment;
  if (lineSpace !== undefined && lineSpace !== 0) obj.lineSpace = lineSpace;
  if (charSpace !== undefined && charSpace !== 0) obj.charSpace = charSpace;
  if (vertical) obj.vertical = vertical;
  if (shrink) obj.shrink = shrink;
  if (autoLF) obj.autoLF = autoLF;

  const pen = penNode ? parsePen(penNode) : undefined;
  if (pen) obj.pen = pen;

  const brush = brushNode ? parseBrush(brushNode) : undefined;
  if (brush) obj.brush = brush;

  if (expandedNode) {
    const objectName = attr(expandedNode, "objectName");
    if (objectName) obj.objectName = objectName;
    const lock = numAttr(expandedNode, "lock");
    if (lock !== undefined && lock !== 0) obj.lock = lock;
  }

  return obj;
}

// --- Rect object ---

function parseRectObject(node: Record<string, unknown>): RectObject {
  const styleNode = node["pt:objectStyle"] as Record<string, unknown>;
  const position = parsePosition(styleNode);

  const penNode = styleNode["pt:pen"] as Record<string, unknown> | undefined;
  const brushNode = styleNode["pt:brush"] as Record<string, unknown> | undefined;
  const expandedNode = styleNode["pt:expanded"] as Record<string, unknown> | undefined;

  const rectStyleNode = node["draw:rectStyle"] as Record<string, unknown> | undefined;

  const obj: RectObject = {
    type: "rect",
    position,
  };

  if (rectStyleNode) {
    const shape = attr(rectStyleNode, "shape") as RectShape | undefined;
    if (shape) obj.shape = shape;

    const roundnessX = ptNum(attr(rectStyleNode, "roundnessX"));
    if (roundnessX !== undefined) obj.roundnessX = roundnessX;

    const roundnessY = ptNum(attr(rectStyleNode, "roundnessY"));
    if (roundnessY !== undefined) obj.roundnessY = roundnessY;
  }

  const pen = penNode ? parsePen(penNode) : undefined;
  if (pen) obj.pen = pen;

  const brush = brushNode ? parseBrush(brushNode) : undefined;
  if (brush) obj.brush = brush;

  if (expandedNode) {
    const objectName = attr(expandedNode, "objectName");
    if (objectName) obj.objectName = objectName;
    const lock = numAttr(expandedNode, "lock");
    if (lock !== undefined && lock !== 0) obj.lock = lock;
  }

  return obj;
}

// --- Line/poly object ---

function parseLineObject(node: Record<string, unknown>): LineObject {
  const styleNode = node["pt:objectStyle"] as Record<string, unknown>;
  const position = parsePosition(styleNode);

  const penNode = styleNode["pt:pen"] as Record<string, unknown> | undefined;
  const brushNode = styleNode["pt:brush"] as Record<string, unknown> | undefined;
  const expandedNode = styleNode["pt:expanded"] as Record<string, unknown> | undefined;

  const polyStyleNode = node["draw:polyStyle"] as Record<string, unknown>;

  // Parse points
  const pointsNode = polyStyleNode["draw:polyLinePoints"] as Record<string, unknown> | undefined;
  const pointsStr = pointsNode ? attr(pointsNode, "points") : undefined;
  const points: Array<{ x: number; y: number }> = [];

  if (pointsStr) {
    const pairs = pointsStr.split(/\s+/);
    for (const pair of pairs) {
      const [xStr, yStr] = pair.split(",");
      if (xStr && yStr) {
        points.push({
          x: parseFloat(xStr.replace("pt", "")),
          y: parseFloat(yStr.replace("pt", "")),
        });
      }
    }
  }

  const obj: LineObject = {
    type: "line",
    position,
    points,
  };

  const arrowBegin = attr(polyStyleNode, "arrowBegin") as ArrowStyle | undefined;
  if (arrowBegin && arrowBegin !== "NONE") obj.arrowBegin = arrowBegin;

  const arrowEnd = attr(polyStyleNode, "arrowEnd") as ArrowStyle | undefined;
  if (arrowEnd && arrowEnd !== "NONE") obj.arrowEnd = arrowEnd;

  const pen = penNode ? parsePen(penNode) : undefined;
  if (pen) obj.pen = pen;

  const brush = brushNode ? parseBrush(brushNode) : undefined;
  if (brush) obj.brush = brush;

  if (expandedNode) {
    const objectName = attr(expandedNode, "objectName");
    if (objectName) obj.objectName = objectName;
    const lock = numAttr(expandedNode, "lock");
    if (lock !== undefined && lock !== 0) obj.lock = lock;
  }

  return obj;
}

// --- Image object ---

async function parseImageObject(
  node: Record<string, unknown>,
  zip: JSZip
): Promise<ImageObject> {
  const styleNode = node["pt:objectStyle"] as Record<string, unknown>;
  const position = parsePosition(styleNode);

  const penNode = styleNode["pt:pen"] as Record<string, unknown> | undefined;
  const brushNode = styleNode["pt:brush"] as Record<string, unknown> | undefined;
  const expandedNode = styleNode["pt:expanded"] as Record<string, unknown> | undefined;

  const imageStyleNode = node["image:imageStyle"] as Record<string, unknown>;

  const fileName = attr(imageStyleNode, "fileName");
  const originalName = attr(imageStyleNode, "originalName");

  // Load image data from the zip
  let imageData: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  if (fileName) {
    const imageFile = zip.file(fileName);
    if (imageFile) {
      const raw = await imageFile.async("uint8array");
      const buf = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buf).set(raw);
      imageData = new Uint8Array(buf);
    }
  }

  const obj: ImageObject = {
    type: "image",
    position,
    imageData,
  };

  if (originalName) obj.originalName = originalName;

  // Effect settings
  const effectNode = imageStyleNode["image:effect"] as Record<string, unknown> | undefined;
  if (effectNode) {
    const effect = attr(effectNode, "effect") as ImageEffect | undefined;
    if (effect && effect !== "NONE") obj.effect = effect;

    const brightness = numAttr(effectNode, "brightness");
    if (brightness !== undefined && brightness !== 50) obj.brightness = brightness;

    const contrast = numAttr(effectNode, "contrast");
    if (contrast !== undefined && contrast !== 50) obj.contrast = contrast;
  }

  // Mono settings
  const monoNode = imageStyleNode["image:mono"] as Record<string, unknown> | undefined;
  if (monoNode) {
    const operationKind = attr(monoNode, "operationKind") as MonoOperation | undefined;
    if (operationKind) obj.monoOperation = operationKind;

    const ditherKind = attr(monoNode, "ditherKind") as DitherKind | undefined;
    if (ditherKind) obj.ditherKind = ditherKind;

    const threshold = numAttr(monoNode, "threshold");
    if (threshold !== undefined && threshold !== 128) obj.threshold = threshold;
  }

  // Transparent settings
  const transparentNode = imageStyleNode["image:transparent"] as Record<string, unknown> | undefined;
  if (transparentNode) {
    const flag = boolAttr(transparentNode, "flag");
    if (flag) {
      const color = attr(transparentNode, "color");
      obj.transparent = color ? { flag, color } : { flag };
    }
  }

  const pen = penNode ? parsePen(penNode) : undefined;
  if (pen) obj.pen = pen;

  const brush = brushNode ? parseBrush(brushNode) : undefined;
  if (brush) obj.brush = brush;

  if (expandedNode) {
    const objectName = attr(expandedNode, "objectName");
    if (objectName) obj.objectName = objectName;
    const lock = numAttr(expandedNode, "lock");
    if (lock !== undefined && lock !== 0) obj.lock = lock;
  }

  return obj;
}

// --- Barcode object ---

function parseBarcodeObject(node: Record<string, unknown>): BarcodeObject {
  const styleNode = node["pt:objectStyle"] as Record<string, unknown>;
  const position = parsePosition(styleNode);

  const penNode = styleNode["pt:pen"] as Record<string, unknown> | undefined;
  const brushNode = styleNode["pt:brush"] as Record<string, unknown> | undefined;
  const expandedNode = styleNode["pt:expanded"] as Record<string, unknown> | undefined;

  const barcodeStyleNode = node["barcode:barcodeStyle"] as Record<string, unknown>;
  const protocol = (attr(barcodeStyleNode, "protocol") ?? "CODE128") as BarcodeProtocol;
  const data = (node["pt:data"] as string) ?? "";

  const obj: BarcodeObject = {
    type: "barcode",
    position,
    protocol,
    data,
  };

  const barWidth = ptAttr(barcodeStyleNode, "barWidth");
  if (barWidth !== undefined) obj.barWidth = barWidth;

  const barRatio = attr(barcodeStyleNode, "barRatio");
  if (barRatio) obj.barRatio = barRatio;

  const humanReadable = boolAttr(barcodeStyleNode, "humanReadable");
  if (humanReadable !== undefined) obj.humanReadable = humanReadable;

  const humanReadableAlignment = attr(barcodeStyleNode, "humanReadableAlignment") as "LEFT" | "CENTER" | "RIGHT" | undefined;
  if (humanReadableAlignment) obj.humanReadableAlignment = humanReadableAlignment;

  const checkDigit = boolAttr(barcodeStyleNode, "checkDigit");
  if (checkDigit !== undefined) obj.checkDigit = checkDigit;

  const zeroFill = boolAttr(barcodeStyleNode, "zeroFill");
  if (zeroFill !== undefined) obj.zeroFill = zeroFill;

  // QR Code specific
  const qrStyleNode = node["barcode:qrcodeStyle"] as Record<string, unknown> | undefined;
  if (qrStyleNode) {
    obj.qrCode = {
      model: numAttr(qrStyleNode, "model") ?? 2,
      eccLevel: (attr(qrStyleNode, "eccLevel") ?? "15%") as QrEccLevel,
      cellSize: ptAttr(qrStyleNode, "cellSize") ?? 2,
      version: attr(qrStyleNode, "version") ?? "auto",
    };
  }

  const pen = penNode ? parsePen(penNode) : undefined;
  if (pen) obj.pen = pen;

  const brush = brushNode ? parseBrush(brushNode) : undefined;
  if (brush) obj.brush = brush;

  if (expandedNode) {
    const objectName = attr(expandedNode, "objectName");
    if (objectName) obj.objectName = objectName;
    const lock = numAttr(expandedNode, "lock");
    if (lock !== undefined && lock !== 0) obj.lock = lock;
  }

  return obj;
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
