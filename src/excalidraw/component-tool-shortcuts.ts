export type ExcalidrawShortcutInput = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  editable?: boolean;
};

export type NativeExcalidrawTool =
  | "selection"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "hand"
  | "frame"
  | "laser";

const nativeToolByShortcut: Record<string, NativeExcalidrawTool> = {
  "0": "eraser",
  "1": "selection",
  "2": "rectangle",
  "3": "diamond",
  "4": "ellipse",
  "5": "arrow",
  "6": "line",
  "7": "freedraw",
  "8": "text",
  "9": "image",
  a: "arrow",
  d: "diamond",
  e: "eraser",
  f: "frame",
  h: "hand",
  k: "laser",
  l: "line",
  o: "ellipse",
  p: "freedraw",
  r: "rectangle",
  t: "text",
  v: "selection",
};

export function nativeExcalidrawToolForShortcut(input: ExcalidrawShortcutInput) {
  if (input.altKey || input.ctrlKey || input.metaKey || input.editable) return null;
  return nativeToolByShortcut[input.key.toLowerCase()] || null;
}
