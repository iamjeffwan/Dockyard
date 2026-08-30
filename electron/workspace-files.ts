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

export function validateWorkspaceDocuments(
  design: unknown,
  metadata?: unknown,
  expectedId?: string,
) {
  const designRecord = design as { id?: unknown; version?: unknown } | null;
  if (!designRecord || typeof designRecord.id !== "string" || ![2, 3].includes(Number(designRecord.version)))
    throw new Error("design.json 不是有效的 Dockyard 工作区文件");
  const metadataRecord = metadata as { id?: unknown; version?: unknown } | null;
  if (metadata !== undefined) {
    if (
      !metadataRecord ||
      metadataRecord.version !== 1 ||
      metadataRecord.id !== designRecord.id
    )
      throw new Error("workspace.json 与 design.json 的工作区标识不一致");
  }
  if (expectedId && designRecord.id !== expectedId)
    throw new Error("所选目录不是原来的项目工作区");
  return designRecord.id;
}
