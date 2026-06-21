/**
 * Minimal XML builder — no dependencies.
 * Produces the exact XML structure Brother P-touch Editor expects.
 */

export interface XmlNode {
  tag: string;
  attrs?: Record<string, string | number | boolean> | undefined;
  children?: (XmlNode | string)[] | undefined;
}

export function el(
  tag: string,
  attrs?: Record<string, string | number | boolean>,
  ...children: (XmlNode | string | undefined | null)[]
): XmlNode {
  return {
    tag,
    attrs: attrs ?? undefined,
    children: children.filter((c): c is XmlNode | string => c != null),
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function serialize(node: XmlNode): string {
  const { tag, attrs, children } = node;

  let attrStr = "";
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      attrStr += ` ${k}="${escapeAttr(String(v))}"`;
    }
  }

  if (!children || children.length === 0) {
    return `<${tag}${attrStr}></${tag}>`;
  }

  const inner = children
    .map((c) => (typeof c === "string" ? escapeXml(c) : serialize(c)))
    .join("");

  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

export function xmlDoc(root: XmlNode): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root)}\n`;
}
