/** All dimensions in the LBX format are expressed in points (1pt = 1/72 inch) */
export type Pt = `${number}pt`;

export function pt(n: number): Pt {
  return `${n}pt` as Pt;
}

export function ptVal(p: Pt): number {
  return parseFloat(p);
}

/** Convert millimeters to points */
export function mmToPt(mm: number): number {
  return mm * (72 / 25.4);
}

export interface Color {
  hex: string; // e.g. "#000000"
}

export type PenStyle = "NULL" | "SOLID" | "DASH" | "DOT" | "DASHDOT" | "DASHDOTDOT" | "INSIDEFRAME";
export type BrushStyle = "NULL" | "SOLID" | "HATCHED";
export type FlipMode = "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH";
export type AnchorPoint = "TOPLEFT" | "TOPCENTER" | "TOPRIGHT" | "MIDDLELEFT" | "MIDDLECENTER" | "MIDDLERIGHT" | "BOTTOMLEFT" | "BOTTOMCENTER" | "BOTTOMRIGHT";

export type HorizontalAlignment = "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY";
export type VerticalAlignment = "TOP" | "CENTER" | "BOTTOM";
export type InLineAlignment = "BASELINE" | "TOP" | "CENTER" | "BOTTOM";

export type TextControl = "FREE" | "AUTOLEN" | "FIXEDFRAME" | "LONGTEXT";
export type TextEffect = "NOEFFECT" | "OUTLINE" | "SHADOW" | "ENGRAVE" | "EMBOSS";

export type ImageEffect = "MONO" | "NONE";
export type MonoOperation = "BINARY" | "ERRORDIFFUSION";
export type DitherKind = "MESH" | "SPIRAL" | "BRICK";

export type ArrowStyle = "ROUND" | "SQUARE" | "ARROW" | "NONE";
export type RectShape = "RECTANGLE" | "ROUNDRECTANGLE";
export type PolyShape = "LINE" | "POLYLINE" | "POLYGON";

export type Orientation = "landscape" | "portrait";

export interface PaperConfig {
  /** Tape width in pt (e.g. 33.6 for 12mm, 68 for 24mm) */
  width: number;
  /** Label length in pt — ignored if autoLength is true */
  height?: number;
  marginLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  orientation?: Orientation;
  autoLength?: boolean;
  /** Brother format code (259 = 12mm, 261 = 24mm, etc.) */
  format?: number;
  printerID?: number;
  printerName?: string;
}

export interface FontConfig {
  name: string;
  size: number;
  weight?: number;
  italic?: boolean;
  charSet?: number;
  pitchAndFamily?: number;
  width?: number;
}

export interface TextStyleConfig {
  effect?: TextEffect;
  underline?: number;
  strikeout?: number;
  color?: string;
}

export interface ObjectPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  anchor?: AnchorPoint;
  flip?: FlipMode;
}

export interface PenConfig {
  style: PenStyle;
  widthX?: number;
  widthY?: number;
  color?: string;
}

export interface BrushConfig {
  style: BrushStyle;
  color?: string;
}

// --- Object definitions ---

export interface TextObject {
  type: "text";
  position: ObjectPosition;
  font: FontConfig;
  textStyle?: TextStyleConfig;
  control?: TextControl;
  horizontalAlignment?: HorizontalAlignment;
  verticalAlignment?: VerticalAlignment;
  inLineAlignment?: InLineAlignment;
  lineSpace?: number;
  charSpace?: number;
  vertical?: boolean;
  shrink?: boolean;
  autoLF?: boolean;
  data: string;
  pen?: PenConfig;
  brush?: BrushConfig;
  objectName?: string;
  lock?: number;
}

export interface ImageObject {
  type: "image";
  position: ObjectPosition;
  /** The image data as a Buffer (will be written as BMP) */
  imageData: Buffer;
  originalName?: string;
  effect?: ImageEffect;
  monoOperation?: MonoOperation;
  ditherKind?: DitherKind;
  threshold?: number;
  brightness?: number;
  contrast?: number;
  transparent?: { flag: boolean; color?: string };
  pen?: PenConfig;
  brush?: BrushConfig;
  objectName?: string;
  lock?: number;
}

export interface RectObject {
  type: "rect";
  position: ObjectPosition;
  shape?: RectShape;
  roundnessX?: number;
  roundnessY?: number;
  pen?: PenConfig;
  brush?: BrushConfig;
  objectName?: string;
  lock?: number;
}

export interface LineObject {
  type: "line";
  position: ObjectPosition;
  points: Array<{ x: number; y: number }>;
  arrowBegin?: ArrowStyle;
  arrowEnd?: ArrowStyle;
  pen?: PenConfig;
  brush?: BrushConfig;
  objectName?: string;
  lock?: number;
}

export type LabelObject = TextObject | ImageObject | RectObject | LineObject;

// --- Database / mail merge ---

export interface DatabaseField {
  fieldName: string;
  joinedField?: boolean;
  removeEmptyLine?: boolean;
}

export interface DatabaseMergeFieldStyle {
  name: string;
  fieldName: string;
  joinedField?: boolean;
}

export interface DatabaseConfig {
  type?: string;
  databasePath: string;
  mergeTable: string;
  currentRecord?: number;
  containsFieldName?: boolean;
  fields: DatabaseField[];
  mergeFieldStyles: DatabaseMergeFieldStyle[];
}

// --- Top-level label ---

export interface LabelConfig {
  paper: PaperConfig;
  objects: LabelObject[];
  database?: DatabaseConfig;
  /** Document version (default "1.10") */
  version?: string;
}

/** Standard tape widths */
export const TAPE = {
  "3.5mm": { width: 10, format: 257 },
  "6mm": { width: 17, format: 258 },
  "9mm": { width: 25.5, format: 264 },
  "12mm": { width: 33.6, format: 259 },
  "18mm": { width: 51, format: 260 },
  "24mm": { width: 68, format: 261 },
  "36mm": { width: 102, format: 262 },
} as const;
