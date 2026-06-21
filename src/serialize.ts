import { el, xmlDoc, type XmlNode } from "./xml.js";
import type {
  LabelConfig,
  LabelObject,
  TextObject,
  ImageObject,
  RectObject,
  LineObject,
  BarcodeObject,
  PenConfig,
  BrushConfig,
  ObjectPosition,
  DatabaseConfig,
} from "./types.js";

const NS = {
  pt: "http://schemas.brother.info/ptouch/2007/lbx/main",
  style: "http://schemas.brother.info/ptouch/2007/lbx/style",
  text: "http://schemas.brother.info/ptouch/2007/lbx/text",
  draw: "http://schemas.brother.info/ptouch/2007/lbx/draw",
  image: "http://schemas.brother.info/ptouch/2007/lbx/image",
  barcode: "http://schemas.brother.info/ptouch/2007/lbx/barcode",
  database: "http://schemas.brother.info/ptouch/2007/lbx/database",
  table: "http://schemas.brother.info/ptouch/2007/lbx/table",
  cable: "http://schemas.brother.info/ptouch/2007/lbx/cable",
} as const;

function p(n: number): string {
  return `${n}pt`;
}

function penNode(pen: PenConfig | undefined): XmlNode {
  const cfg = pen ?? { style: "NULL" as const };
  return el("pt:pen", {
    style: cfg.style,
    widthX: p(cfg.widthX ?? 0.5),
    widthY: p(cfg.widthY ?? 0.5),
    color: cfg.color ?? "#000000",
    printColorNumber: "1",
  });
}

function brushNode(brush: BrushConfig | undefined): XmlNode {
  const cfg = brush ?? { style: "NULL" as const };
  return el("pt:brush", {
    style: cfg.style,
    color: cfg.color ?? "#000000",
    printColorNumber: "1",
    id: "0",
  });
}

function expandedNode(objectName?: string, lock?: number): XmlNode {
  return el("pt:expanded", {
    objectName: objectName ?? "",
    ID: "0",
    lock: lock ?? 0,
    templateMergeTarget: "LABELLIST",
    templateMergeType: "NONE",
    templateMergeID: "0",
    linkStatus: "NONE",
    linkID: "0",
  });
}

function objectStyleNode(pos: ObjectPosition, pen?: PenConfig, brush?: BrushConfig, objectName?: string, lock?: number): XmlNode {
  return el(
    "pt:objectStyle",
    {
      x: p(pos.x),
      y: p(pos.y),
      width: p(pos.width),
      height: p(pos.height),
      backColor: "#FFFFFF",
      backPrintColorNumber: "0",
      ropMode: "COPYPEN",
      angle: pos.angle ?? 0,
      anchor: pos.anchor ?? "TOPLEFT",
      flip: pos.flip ?? "NONE",
    },
    penNode(pen),
    brushNode(brush),
    expandedNode(objectName, lock),
  );
}

function serializeText(obj: TextObject): XmlNode {
  const font = obj.font;
  const style = obj.textStyle ?? {};

  const logFont = el("text:logFont", {
    name: font.name,
    width: font.width ?? 0,
    italic: font.italic ?? false,
    weight: font.weight ?? 400,
    charSet: font.charSet ?? 0,
    pitchAndFamily: font.pitchAndFamily ?? 2,
  });

  const fontExt = el("text:fontExt", {
    effect: style.effect ?? "NOEFFECT",
    underline: style.underline ?? 0,
    strikeout: style.strikeout ?? 0,
    size: p(font.size),
    orgSize: p(28.8),
    textColor: style.color ?? "#000000",
    textPrintColorNumber: "1",
  });

  const ptFontInfo = el("text:ptFontInfo", {}, logFont, fontExt);

  const textControl = el("text:textControl", {
    control: obj.control ?? "AUTOLEN",
    clipFrame: "false",
    aspectNormal: "true",
    shrink: obj.shrink ?? true,
    autoLF: obj.autoLF ?? false,
    avoidImage: "false",
  });

  const textAlign = el("text:textAlign", {
    horizontalAlignment: obj.horizontalAlignment ?? "LEFT",
    verticalAlignment: obj.verticalAlignment ?? "CENTER",
    inLineAlignment: obj.inLineAlignment ?? "BASELINE",
  });

  const textStyle = el("text:textStyle", {
    vertical: obj.vertical ?? false,
    nullBlock: "false",
    charSpace: obj.charSpace ?? 0,
    lineSpace: obj.lineSpace ?? 0,
    orgPoint: p(font.size),
    combinedChars: "false",
  });

  const data = el("pt:data", {}, obj.data);

  // Build stringItem(s) — one per line
  const lines = obj.data.split("\n");
  const stringItems: XmlNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    stringItems.push(
      el("text:stringItem", { charLen: line.length }, el("text:ptFontInfo", {}, logFont, fontExt)),
    );
    // Add newline stringItem between lines
    if (i < lines.length - 1) {
      stringItems.push(
        el("text:stringItem", { charLen: 1 }, el("text:ptFontInfo", {}, logFont, fontExt)),
      );
    }
  }

  return el(
    "text:text",
    {},
    objectStyleNode(obj.position, obj.pen, obj.brush, obj.objectName, obj.lock),
    ptFontInfo,
    textControl,
    textAlign,
    textStyle,
    data,
    ...stringItems,
  );
}

/** Track images and return filename for each */
export interface ImageEntry {
  filename: string;
  data: Uint8Array;
}

function serializeImage(obj: ImageObject, imageIndex: number, images: ImageEntry[]): XmlNode {
  const filename = `Object${imageIndex}.bmp`;
  images.push({ filename, data: obj.imageData });

  const effect = obj.effect ?? "MONO";
  const mono = obj.monoOperation ?? "ERRORDIFFUSION";

  const imageStyle = el(
    "image:imageStyle",
    {
      originalName: obj.originalName ?? filename,
      alignInText: "NONE",
      firstMerge: "true",
      IpName: "",
      fileName: filename,
    },
    el("image:transparent", {
      flag: obj.transparent?.flag ?? false,
      color: obj.transparent?.color ?? "#FFFFFF",
    }),
    el("image:trimming", {
      flag: "false",
      shape: "RECTANGLE",
      trimOrgX: "0pt",
      trimOrgY: "0pt",
      trimOrgWidth: "0pt",
      trimOrgHeight: "0pt",
    }),
    el("image:orgPos", {
      x: p(obj.position.x),
      y: p(obj.position.y),
      width: p(obj.position.width),
      height: p(obj.position.height),
    }),
    el("image:effect", {
      effect,
      brightness: obj.brightness ?? 50,
      contrast: obj.contrast ?? 50,
      photoIndex: "4",
    }),
    el("image:mono", {
      operationKind: mono,
      reverse: "0",
      ditherKind: obj.ditherKind ?? "MESH",
      threshold: obj.threshold ?? 128,
      gamma: "100",
      ditherEdge: "0",
      rgbconvProportionRed: "30",
      rgbconvProportionGreen: "59",
      rgbconvProportionBlue: "11",
      rgbconvProportionReversed: "0",
    }),
  );

  return el(
    "image:image",
    {},
    objectStyleNode(obj.position, obj.pen, obj.brush, obj.objectName, obj.lock ?? 2),
    imageStyle,
  );
}

function serializeRect(obj: RectObject): XmlNode {
  const shape = obj.shape ?? "RECTANGLE";
  const rectStyle = el("draw:rectStyle", {
    shape,
    roundnessX: p(obj.roundnessX ?? 0),
    roundnessY: p(obj.roundnessY ?? 0),
  });

  return el(
    "draw:rect",
    {},
    objectStyleNode(obj.position, obj.pen, obj.brush, obj.objectName, obj.lock ?? 2),
    rectStyle,
  );
}

function serializeLine(obj: LineObject): XmlNode {
  const pointsStr = obj.points.map((pt) => `${p(pt.x)},${p(pt.y)}`).join(" ");

  const polyStyle = el(
    "draw:polyStyle",
    {
      shape: "LINE",
      arrowBegin: obj.arrowBegin ?? "ROUND",
      arrowEnd: obj.arrowEnd ?? "ROUND",
    },
    el("draw:polyOrgPos", {
      x: p(obj.position.x),
      y: p(obj.position.y),
      width: p(obj.position.width),
      height: p(obj.position.height),
    }),
    el("draw:polyLinePoints", { points: pointsStr }),
  );

  return el(
    "draw:poly",
    {},
    objectStyleNode(obj.position, obj.pen, obj.brush, obj.objectName, obj.lock ?? 2),
    polyStyle,
  );
}

function serializeBarcode(obj: BarcodeObject): XmlNode {
  const barcodeStyle = el("barcode:barcodeStyle", {
    protocol: obj.protocol,
    lengths: String(obj.data.length),
    zeroFill: obj.zeroFill ?? false,
    barWidth: p(obj.barWidth ?? 1.2),
    barRatio: obj.barRatio ?? "1:3",
    humanReadable: obj.humanReadable ?? true,
    humanReadableAlignment: obj.humanReadableAlignment ?? "LEFT",
    checkDigit: obj.checkDigit ?? true,
    autoLengths: "false",
    margin: "false",
    sameLengthBar: "false",
    bearerBar: "false",
  });

  const data = el("pt:data", {}, obj.data);

  const children: (XmlNode | string)[] = [
    objectStyleNode(obj.position, obj.pen, obj.brush, obj.objectName, obj.lock),
    barcodeStyle,
    data,
  ];

  // QR Code specific style
  if (obj.protocol === "QRCODE" && obj.qrCode) {
    children.push(el("barcode:qrcodeStyle", {
      model: obj.qrCode.model ?? 2,
      eccLevel: obj.qrCode.eccLevel ?? "15%",
      cellSize: p(obj.qrCode.cellSize ?? 2),
      mbcs: "932",
      removeCharKind: "0",
      removeCharString: "",
      joint: "1",
      jointSpace: "8",
      jointVertically: "false",
      version: obj.qrCode.version ?? "auto",
      changeVersionDrag: "false",
    }));
  }

  return el("barcode:barcode", {}, ...children);
}

function serializeObject(obj: LabelObject, imageIndex: { current: number }, images: ImageEntry[]): XmlNode {
  switch (obj.type) {
    case "text":
      return serializeText(obj);
    case "image": {
      const node = serializeImage(obj, imageIndex.current, images);
      imageIndex.current++;
      return node;
    }
    case "rect":
      return serializeRect(obj);
    case "line":
      return serializeLine(obj);
    case "barcode":
      return serializeBarcode(obj);
  }
}

function serializeDatabase(db: DatabaseConfig): XmlNode {
  const mergeFieldStyles = db.mergeFieldStyles.map((mfs) =>
    el("database:dbMergeFieldStyle", {
      name: mfs.name,
      fieldName: mfs.fieldName,
      joinedField: mfs.joinedField ?? false,
    }),
  );

  const dbFields = db.fields.map((f) =>
    el("database:dbField", {
      fieldName: f.fieldName,
      joinedField: f.joinedField ?? false,
      removeEmptyLine: f.removeEmptyLine ?? false,
    }),
  );

  return el(
    "database:database",
    {
      type: db.type ?? "FILE",
      databasePath: db.databasePath,
      mergeTable: db.mergeTable,
      mergeTableType: "NONE",
      currentRecord: db.currentRecord ?? 0,
      containsFieldName: db.containsFieldName ?? true,
      readonly: "true",
      cellWidths: "0",
    },
    el("database:dbMergeFieldStyles", {}, ...mergeFieldStyles),
    el(
      "database:dbTables",
      {},
      el("database:dbTable", { name: db.mergeTable }, ...dbFields),
    ),
  );
}

export function serializeLabel(config: LabelConfig): { labelXml: string; propXml: string; images: ImageEntry[] } {
  const paper = config.paper;
  const images: ImageEntry[] = [];
  const imageIndex = { current: 0 };

  const objectNodes = config.objects.map((obj) => serializeObject(obj, imageIndex, images));

  const paperNode = el("style:paper", {
    media: "0",
    width: p(paper.width),
    height: p(paper.height ?? 2834.4),
    marginLeft: p(paper.marginLeft ?? 2.8),
    marginTop: p(paper.marginTop ?? 5.6),
    marginRight: p(paper.marginRight ?? 2.8),
    marginBottom: p(paper.marginBottom ?? 5.6),
    orientation: paper.orientation ?? "landscape",
    autoLength: paper.autoLength ?? true,
    monochromeDisplay: "true",
    printColorDisplay: "false",
    printColorsID: "0",
    paperColor: "#FFFFFF",
    paperInk: "#000000",
    split: "1",
    format: paper.format ?? 259,
    backgroundTheme: "0",
    printerID: paper.printerID ?? 30256,
    printerName: paper.printerName ?? "Brother PT-P710BT",
  });

  const cutLine = el("style:cutLine", { regularCut: "0pt", freeCut: "" });

  // Background dimensions are computed from the paper
  const bgWidth = (paper.height ?? 200) - (paper.marginLeft ?? 2.8) * 2;
  const bgHeight = paper.width - (paper.marginTop ?? 5.6) * 2 - (paper.marginLeft ?? 2.8) * 2 + (paper.marginLeft ?? 2.8) * 2;
  const backGround = el("style:backGround", {
    x: p((paper.marginLeft ?? 2.8) * 2),
    y: p(paper.marginLeft ?? 2.8),
    width: p(bgWidth > 0 ? bgWidth : 100),
    height: p(paper.width - (paper.marginLeft ?? 2.8) * 2),
    brushStyle: "NULL",
    brushId: "0",
    userPattern: "NONE",
    userPatternId: "0",
    color: "#000000",
    printColorNumber: "1",
    backColor: "#FFFFFF",
    backPrintColorNumber: "0",
  });

  const objects = el("pt:objects", {}, ...objectNodes);
  const sheet = el("style:sheet", { name: "Sheet 1" }, paperNode, cutLine, backGround, objects);

  const bodyChildren: (XmlNode | string)[] = [sheet];
  const body = el("pt:body", { currentSheet: "Sheet 1", direction: "LTR" }, ...bodyChildren);

  const docChildren: (XmlNode | string)[] = [body];
  if (config.database) {
    docChildren.push(serializeDatabase(config.database));
  }

  const doc = el(
    "pt:document",
    {
      "xmlns:pt": NS.pt,
      "xmlns:style": NS.style,
      "xmlns:text": NS.text,
      "xmlns:draw": NS.draw,
      "xmlns:image": NS.image,
      "xmlns:barcode": NS.barcode,
      "xmlns:database": NS.database,
      "xmlns:table": NS.table,
      "xmlns:cable": NS.cable,
      version: config.version ?? "1.10",
      generator: "brother-lbx",
    },
    ...docChildren,
  );

  const labelXml = xmlDoc(doc);

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const propDoc = el(
    "meta:properties",
    {
      "xmlns:meta": "http://schemas.brother.info/ptouch/2007/lbx/meta",
      "xmlns:dc": "http://purl.org/dc/elements/1.1/",
      "xmlns:dcterms": "http://purl.org/dc/terms/",
    },
    el("meta:appName", {}, "brother-lbx"),
    el("dc:title", {}),
    el("dc:subject", {}),
    el("dc:creator", {}),
    el("meta:keyword", {}),
    el("dc:description", {}),
    el("meta:template", {}),
    el("dcterms:created", {}, now),
    el("dcterms:modified", {}, now),
    el("meta:lastPrinted", {}),
    el("meta:modifiedBy", {}),
    el("meta:revision", {}, "1"),
    el("meta:editTime", {}, "0"),
    el("meta:numPages", {}, "1"),
    el("meta:numWords", {}, "0"),
    el("meta:numChars", {}, "0"),
    el("meta:security", {}, "0"),
  );

  const propXml = xmlDoc(propDoc);

  return { labelXml, propXml, images };
}
