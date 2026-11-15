export function attr(node: Record<string, unknown>, name: string): string | undefined {
  const val = node[`@_${name}`];
  if (val === undefined || val === null) return undefined;
  return String(val);
}

export function numAttr(node: Record<string, unknown>, name: string): number | undefined {
  const val = attr(node, name);
  if (val === undefined) return undefined;
  return parseFloat(val);
}

export function ptNum(val: string | undefined): number | undefined {
  if (!val) return undefined;
  return parseFloat(val.replace("pt", ""));
}

export function ptNumRequired(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace("pt", ""));
}

export function boolAttr(node: Record<string, unknown>, name: string): boolean | undefined {
  const val = attr(node, name);
  if (val === undefined) return undefined;
  return val === "true";
}

export function ptAttr(node: Record<string, unknown>, name: string): number | undefined {
  const val = attr(node, name);
  if (val === undefined) return undefined;
  return parseFloat(val.replace("pt", ""));
}

/** Ensure a value is always an array (handles single-element case from XML parser) */
export function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}
