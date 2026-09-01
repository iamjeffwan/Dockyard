import type { SceneData, SourceAsset } from "../types";

const uid = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export function createImageElement(data: {
  x: number;
  y: number;
  width: number;
  height: number;
  fileId: string;
  customData?: Record<string, unknown>;
  locked?: boolean;
}) {
  const timestamp = Date.now();
  return {
    id: uid("image"),
    type: "image",
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: timestamp,
    link: null,
    locked: Boolean(data.locked),
    fileId: data.fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
    customData: data.customData,
  };
}

export const emptyScene = (): SceneData => ({
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});

export function readImage(file: File): Promise<SourceAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onerror = () => reject(new Error("图片无法读取"));
      image.onload = async () => {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(dataUrl),
        );
        const hash = `sha256-${Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
        resolve({
          name: file.name || "图稿.png",
          dataUrl,
          width: image.width,
          height: image.height,
          hash,
          path: `assets/source/${hash}.png`,
        });
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function ensureSourceScene(
  scene: SceneData,
  source: SourceAsset | null,
): SceneData {
  const files = Object.fromEntries(
    Object.entries(scene.files || {}).filter(
      ([, file]) => file && typeof (file as any).dataURL === "string",
    ),
  );
  if (
    !source ||
    scene.elements.some((item) => item.customData?.dockyardType === "source")
  )
    return { ...scene, files };
  const element = createImageElement({
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
    fileId: source.hash,
    locked: true,
    customData: { dockyardType: "source", assetHash: source.hash },
  });
  return {
    ...scene,
    elements: [element, ...scene.elements],
    files: {
      ...files,
      [source.hash]: {
        id: source.hash,
        mimeType: "image/png",
        dataURL: source.dataUrl,
        created: Date.now(),
      },
    },
  };
}
