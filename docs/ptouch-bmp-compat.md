# P-touch Editor bitmap compatibility (empirical)

Results from loading a matrix of .lbx files with differently-encoded
embedded bitmaps into native P-touch Editor (macOS, 2026-07). Each file
held one 48×48 test image (asymmetric glyph + color patches + alpha
gradient). Generator lives in session scratch; the matrix format list is
reproduced here so it can be regenerated.

| Encoding | Result |
| --- | --- |
| 32bpp BI_RGB, RGB black, artwork in alpha ("alpha-only", what P-touch macOS itself writes) | Renders (control) |
| 32bpp BI_RGB, real RGB + real alpha | **Renders with transparency**; color collapses to grayscale via the label's mono pipeline (rgbconv 30/59/11 luma) |
| 32bpp BI_RGB, RGB on white, alpha all 0 | **Blank.** Alpha is read literally — no "all-zero alpha means opaque" fallback |
| 32bpp BI_RGB, RGB on white, alpha all 255 | Renders as an opaque white-background box (faithful: alpha 255 = fully opaque) |
| 32bpp BI_RGB, negative height (top-down) | **Crashes P-touch Editor** |
| 24bpp | Renders as an opaque white-background box (no alpha channel exists at 24bpp) |
| 1bpp palette | Renders (displayed through its basic dither pass) |
| BITMAPV4HEADER + BI_BITFIELDS RGBA masks | Renders, same as RGB+alpha |
| PNG bytes inside the `ObjectN.bmp` entry | Renders — the entry is content-sniffed, name is cosmetic (macOS version at least) |

## Rules for writers (encodeBmp32 follows all of these)

- Always populate the alpha byte; **never write all-zero alpha** for
  visible content — P-touch treats it as fully transparent.
- Always write bottom-up (positive height); top-down crashes P-touch.
- Fill real RGB alongside alpha: alpha-aware readers get transparency,
  naive readers still see artwork.
- BMP is the only encoding P-touch itself writes; PNG happens to be
  tolerated on macOS but is unverified elsewhere — embed BMP.

## Notes for readers (decodeBmp32)

- decodeBmp32 keeps its all-zero-alpha→opaque fallback deliberately.
  This diverges from P-touch (which shows blank); rendering something
  beats a silent blank for third-party files.
- Top-down files are accepted defensively even though native tooling
  crashes on them.
