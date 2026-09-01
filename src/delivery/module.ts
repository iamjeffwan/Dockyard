export type DeliveryTarget = "download" | "clipboard";

export type DeliveryCommand =
  | {
      type: "image";
      target: DeliveryTarget;
      artworkId: string;
      artworkName: string;
      componentsText: string;
    }
  | {
      type: "component-list";
      target: DeliveryTarget;
      artworkId: string;
      artworkName: string;
      componentsText: string;
    }
  | {
      type: "complete";
      artworkId: string;
      artworkName: string;
      componentsText: string;
    };

export type DeliveryResult =
  | { ok: true; recordId?: string; record?: unknown; previewDataUrl?: string }
  | { ok: false; error: string };

export type DeliveryPorts = {
  captureImage: () => Promise<string | null>;
  writeClipboard: (value: string) => Promise<void>;
  copyImage: (dataUrl: string) => Promise<void>;
  download: (value: string, fileName: string) => void;
  completeArtwork: (payload: {
    artworkId: string;
    previewDataUrl: string;
    componentsText: string;
    persistOnly?: boolean;
  }) => Promise<{ ok: boolean; recordId?: string; record?: unknown; error?: string }>;
};

export type DeliveryModule = {
  execute: (command: DeliveryCommand) => Promise<DeliveryResult>;
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function createDeliveryModule(ports: DeliveryPorts): DeliveryModule {
  return {
    async execute(command) {
      try {
        if (command.type === "component-list") {
          if (command.target === "clipboard") {
            await ports.writeClipboard(command.componentsText);
          } else {
            ports.download(
              `data:text/plain;charset=utf-8,${encodeURIComponent(command.componentsText)}`,
              `${command.artworkName}-组件清单.txt`,
            );
          }
          return { ok: true };
        }

        const image = await ports.captureImage();
        if (!image) return { ok: false, error: "无法导出当前画布" };

        if (command.type === "image") {
          if (command.target === "clipboard") {
            await ports.copyImage(image);
          } else {
            ports.download(image, `${command.artworkName}.png`);
          }
          return { ok: true };
        }

        const result = await ports.completeArtwork({
          artworkId: command.artworkId,
          previewDataUrl: image,
          componentsText: command.componentsText,
        });
        return result.ok
          ? { ok: true, recordId: result.recordId, record: result.record, previewDataUrl: image }
          : { ok: false, error: result.error || "完成记录生成失败" };
      } catch (error) {
        return {
          ok: false,
          error: errorMessage(
            error,
            command.type === "complete" ? "完成记录生成失败" : "交付操作失败",
          ),
        };
      }
    },
  };
}
