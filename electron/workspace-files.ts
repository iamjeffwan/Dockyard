import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";

export function resolveInsideWorkspace(root: string, relativePath: string) {
  if (!relativePath || isAbsolute(relativePath))
    throw new Error(`工作区资源路径必须是相对路径：${relativePath || "<empty>"}`);
  const base = resolve(root);
  const target = resolve(base, relativePath);
  const normalizedBase = `${base.toLocaleLowerCase()}${sep}`;
  const normalizedTarget = target.toLocaleLowerCase();
  if (normalizedTarget !== base.toLocaleLowerCase() && !normalizedTarget.startsWith(normalizedBase))
    throw new Error(`工作区资源路径越界：${relativePath}`);
  return target;
}

export function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function atomicWriteJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  renameSync(temporaryPath, path);
}
