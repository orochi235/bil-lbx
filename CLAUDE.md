# bil-lbx

TypeScript library for generating and parsing Brother P-touch `.lbx` label files.
Published publicly on npm as `bil-lbx`. Every consumer — lbx-editor included —
installs the published package, so nothing sees an API change until it ships:
a version bump and `npm publish` are how changes reach anyone.

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
- `src/bmp.ts` — `decodeBmp32`/`encodeBmp32`: RGBA codec for the embedded
  32bpp BMPs (P-touch Editor macOS carries artwork in the alpha byte, which
  platform BMP decoders discard as reserved — consumers must decode via
  this; writers embed via `encodeBmp32`, which fills RGB *and* alpha).
  Empirical P-touch compat rules — never all-zero alpha, never top-down
  (it crashes P-touch Editor) — in `docs/ptouch-bmp-compat.md`.

## Supported object types

- Text (multi-line, per-run formatting, multiple fonts/weights)
- Images (BMP, with mono conversion settings)
- Rectangles (including rounded)
- Lines/polylines
- Database/CSV mail merge configuration

## Commands

- `npm test` — run vitest
- `npm run build` — compile TypeScript to dist/

## Releasing

Every release gets a `vX.Y.Z` git tag. `npm version` does that for us, so
never bump the version by hand:

```sh
npm version patch      # or minor / major -- commits, tags vX.Y.Z, and the
                       # postversion hook pushes commit + tag
npm publish            # prepublishOnly builds and tests first; needs an OTP
```

npm serves the registry listing (description, README) from the *latest
published version*, so copy edits only reach the npm page via a release.

Tags v0.1.0 and v0.2.0 were applied retroactively; everything from v0.2.1 on
is tagged by the flow above.

## Design decisions

- Browser-compatible: uses `Uint8Array` not `Buffer` for image data
- ZIP uses STORE compression (jszip 3.x dropped DEFLATE without pako)
- XML is serialized without formatting (matches Brother's single-line output)
- All dimensions are in points (1pt = 1/72 inch)
- Embedded images are **always 32-bit Windows BMP** — the `.lbx` format embeds no other raster encoding. P-touch Editor rasterizes/transcodes every source format (SVG, PSD, PNG, …) to BMP at import; `originalName` keeps the source filename only as metadata. So `ImageObject.imageData` is an opaque BMP `Uint8Array` by design, not an artificial limit. (Verified against 11 real .lbx files: every image `fileName` is a bare `ObjectN.bmp` zip entry — images are always stored as files inside the .lbx archive, never referenced by external path.)
