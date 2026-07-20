# bil-lbx

TypeScript library for generating and parsing Brother P-touch `.lbx` label files — the format used by [P-touch Editor](https://www.brother.com/ptouch).

> **bil** = brother-in-law: related to Brother, but not affiliated with them.
>
> Or at least, that's what my in-laws say about me.

Works in the browser and Node (no `Buffer`, no filesystem APIs — image data is `Uint8Array`).

## What's in an .lbx file

An `.lbx` is a ZIP archive:

| Entry | Contents |
|---|---|
| `label.xml` | Layout, objects, fonts (Brother's proprietary XML schema) |
| `prop.xml` | Metadata (app version, timestamps) |
| `ObjectN.bmp` | Embedded images, one per image object (optional) |

This library round-trips that archive to and from a plain-data `LabelConfig` object.

## Install

```sh
npm install bil-lbx
```

## Usage

### Build a label

```ts
import { buildLbx, TAPE, type LabelConfig } from "bil-lbx";

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

const bytes: Uint8Array = await buildLbx(config);
// write to disk, or feed to a Blob for download — it's a complete .lbx file
```

### Parse a label

```ts
import { parseLbx } from "bil-lbx";

const config = await parseLbx(bytes); // Uint8Array | ArrayBuffer
console.log(config.paper.width, config.objects.length);
```

### Lower level

`serializeLabel(config)` returns the raw `{ labelXml, propXml, images }` without zipping, if you need to inspect or post-process the XML.

## Supported object types

- **Text** — multi-line, per-run formatting, multiple fonts/weights, alignment, effects
- **Image** — embedded BMP with mono-conversion settings (dither, threshold, brightness/contrast)
- **Rect** — including rounded rectangles
- **Line** — lines, polylines, polygons, arrowheads
- **Barcode** — CODE39/128, EAN, UPC, QR, DataMatrix, PDF417, and more
- **Database** — CSV mail-merge configuration

## Units and tape sizes

All dimensions are in points (1pt = 1/72"). Helpers: `pt()`, `ptVal()`, `mmToPt()`.

The `TAPE` constant maps standard tape widths to their point width and Brother format code:

| Tape | width (pt) | format |
|---|---|---|
| 3.5mm | 10 | 257 |
| 6mm | 17 | 258 |
| 9mm | 25.5 | 264 |
| 12mm | 33.6 | 259 |
| 18mm | 51 | 260 |
| 24mm | 68 | 261 |
| 36mm | 102 | 262 |

## Format notes

- Embedded images are **always 32-bit Windows BMP** — the `.lbx` format stores no other raster encoding. P-touch Editor rasterizes every source format (PNG, SVG, …) to BMP at import; `ImageObject.originalName` preserves the source filename as metadata only.
- The ZIP uses STORE (no compression), and XML is serialized unformatted on a single line, matching Brother's own output.

## Development

```sh
npm test        # vitest
npm run build   # compile to dist/
```

The parser suite runs against real `.lbx` samples in `/tmp/lbx-samples` (not committed to the repo) and skips itself when that directory is absent; see `test/parse.test.ts`.

## License

MIT
