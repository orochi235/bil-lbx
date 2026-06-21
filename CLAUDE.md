# brother-lbx

TypeScript library for generating and parsing Brother P-touch `.lbx` label files.

## Architecture

An `.lbx` file is a ZIP archive containing:
- `label.xml` — layout, objects, fonts (Brother proprietary XML schema)
- `prop.xml` — metadata (app version, timestamps)
- `ObjectN.bmp` — embedded images (optional)

## Key modules

- `src/types.ts` — all types, tape definitions, config interfaces
- `src/xml.ts` — minimal zero-dep XML builder
- `src/serialize.ts` — converts `LabelConfig` → XML + image list
- `src/parse.ts` — reads .lbx back into `LabelConfig`
- `src/build.ts` — packs into ZIP via jszip

## Supported object types

- Text (multi-line, per-run formatting, multiple fonts/weights)
- Images (BMP, with mono conversion settings)
- Rectangles (including rounded)
- Lines/polylines
- Database/CSV mail merge configuration

## Commands

- `npm test` — run vitest
- `npm run build` — compile TypeScript to dist/

## Design decisions

- Browser-compatible: uses `Uint8Array` not `Buffer` for image data
- ZIP uses STORE compression (jszip 3.x dropped DEFLATE without pako)
- XML is serialized without formatting (matches Brother's single-line output)
- All dimensions are in points (1pt = 1/72 inch)
