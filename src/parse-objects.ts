import type JSZip from "jszip";
import type {
  TextObject,
  ImageObject,
  LbxWarning,
  RectObject,
  LineObject,
  BarcodeObject,
  BarcodeProtocol,
  QrEccLevel,
  PenConfig,
  BrushConfig,
  ObjectPosition,
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
  RectShape,
  RopMode,
  ArrowStyle,
  ImageEffect,
  MonoOperation,
  DitherKind,
} from "./types.js";
import { attr, boolAttr, numAttr, ptAttr, ptNum, ptNumRequired } from "./parse-attrs.js";

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

  const ropMode = attr(styleNode, "ropMode") as RopMode | undefined;
  if (ropMode && ropMode !== "COPYPEN") pos.ropMode = ropMode;

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

  const id = numAttr(node, "id");
  if (id !== undefined && id !== 0) brush.id = id;

  return brush;
}

// --- Text object ---

export function parseTextObject(node: Record<string, unknown>): TextObject {
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

export function parseRectObject(node: Record<string, unknown>): RectObject {
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

export function parseLineObject(node: Record<string, unknown>): LineObject {
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

export async function parseImageObject(
  node: Record<string, unknown>,
  zip: JSZip,
  warn: (warning: LbxWarning) => void
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
  const imageFile = fileName ? zip.file(fileName) : null;
  if (imageFile) {
    const raw = await imageFile.async("uint8array");
    const buf = new ArrayBuffer(raw.byteLength);
    new Uint8Array(buf).set(raw);
    imageData = new Uint8Array(buf);
  } else {
    warn({
      code: "missing-image",
      ...(fileName ? { fileName } : {}),
      message: fileName
        ? `image entry ${fileName} is missing from the archive`
        : "image object names no file",
    });
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

export function parseBarcodeObject(node: Record<string, unknown>): BarcodeObject {
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

  // DataMatrix specific
  const dmStyleNode = node["barcode:datamatrixStyle"] as Record<string, unknown> | undefined;
  if (dmStyleNode) {
    obj.dataMatrix = {
      model: (attr(dmStyleNode, "model") ?? "square") as "square" | "rectangle",
      cellSize: ptAttr(dmStyleNode, "cellSize") ?? 2,
      macro: attr(dmStyleNode, "macro") ?? "none",
      fnc01: boolAttr(dmStyleNode, "fnc01") ?? false,
      joint: numAttr(dmStyleNode, "joint") ?? 1,
    };
  }

  // PDF417 specific
  const pdfStyleNode = node["barcode:pdf417Style"] as Record<string, unknown> | undefined;
  if (pdfStyleNode) {
    obj.pdf417 = {
      model: attr(pdfStyleNode, "model") ?? "standard",
      width: ptAttr(pdfStyleNode, "width") ?? 0.8,
      aspect: numAttr(pdfStyleNode, "aspect") ?? 3,
      row: attr(pdfStyleNode, "row") ?? "auto",
      column: attr(pdfStyleNode, "column") ?? "auto",
      eccLevel: attr(pdfStyleNode, "eccLevel") ?? "auto",
      joint: numAttr(pdfStyleNode, "joint") ?? 1,
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
