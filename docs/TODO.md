# TODO

## Bound what parseLbx will allocate

`parseLbx` (`src/parse.ts`) loads the whole ZIP with JSZip, reads `label.xml`
to a string, and extracts every image entry `parseImageObject`
(`src/parse-objects.ts`) names, with no limit a caller can set. A small archive
that declares huge entries, or a label with thousands of objects, is all
allocated before anything checks it, which matters for a browser editor that
imports files people hand it. Wanted: options for entry count, expanded bytes,
object count, and image dimensions, checked before the buffers are made, plus
an `AbortSignal` for browser imports. Needs a choice of defaults that every
real label fits under. (filed 2026-11-15 from automated review)

## Typed parse errors and validated numbers

Parse failures throw plain `Error`s with a message only, and the object parsers
(`src/parse-objects.ts`) dereference required nodes such as `pt:objectStyle`,
`text:ptFontInfo`, and `image:imageStyle` directly, so a malformed object
surfaces as a `TypeError` with no hint which object it was. Numeric attributes
go through `parseFloat` (`src/parse-attrs.ts`) and a garbled one becomes `NaN`
in the LabelConfig, which `buildLbx` then writes back out. Wanted: an exported
error class carrying the element path and object index, finite and range
checks shared with `src/serialize.ts`, and round-trip fixtures from real
P-touch Editor files beside the generated ones. A public error type is an API
addition, so it ships in a minor release. (filed 2026-11-15 from automated review)
