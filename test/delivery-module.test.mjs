import test from "node:test";
import assert from "node:assert/strict";

import { createDeliveryModule } from "../src/delivery/module.ts";

const context = {
  artworkId: "art-1",
  artworkName: "登录页",
  componentsText: "[1] Avatar",
};

function createPorts(overrides = {}) {
  const calls = [];
  return {
    calls,
    captureImage: async () => "data:image/png;base64,image",
    writeClipboard: async (value) => calls.push(["clipboard", value]),
    copyImage: async (value) => calls.push(["image-clipboard", value]),
    download: (value, name) => calls.push(["download", value, name]),
    completeArtwork: async (payload) => {
      calls.push(["complete", payload]);
      return { ok: true, recordId: "record-1" };
    },
    ...overrides,
  };
}

test("图片导出和复制使用同一份合成图片", async () => {
  const ports = createPorts();
  const delivery = createDeliveryModule(ports);

  const download = await delivery.execute({ type: "image", target: "download", ...context });
  const copy = await delivery.execute({ type: "image", target: "clipboard", ...context });

  assert.deepEqual(download, { ok: true });
  assert.deepEqual(copy, { ok: true });
  assert.deepEqual(ports.calls, [
    ["download", "data:image/png;base64,image", "登录页.png"],
    ["image-clipboard", "data:image/png;base64,image"],
  ]);
});

test("组件清单导出和复制使用同一份清单", async () => {
  const ports = createPorts();
  const delivery = createDeliveryModule(ports);

  await delivery.execute({ type: "component-list", target: "download", ...context });
  await delivery.execute({ type: "component-list", target: "clipboard", ...context });

  assert.deepEqual(ports.calls, [
    ["download", "data:text/plain;charset=utf-8,%5B1%5D%20Avatar", "登录页-组件清单.txt"],
    ["clipboard", "[1] Avatar"],
  ]);
});

test("完成记录成功后才返回完成结果", async () => {
  const ports = createPorts();
  const delivery = createDeliveryModule(ports);

  const result = await delivery.execute({ type: "complete", ...context });

  assert.deepEqual(result, {
    ok: true,
    recordId: "record-1",
    record: undefined,
    previewDataUrl: "data:image/png;base64,image",
  });
  assert.equal(ports.calls[0][0], "complete");
  assert.deepEqual(ports.calls[0][1], {
    artworkId: "art-1",
    previewDataUrl: "data:image/png;base64,image",
    componentsText: "[1] Avatar",
  });
});

test("完成快照失败时不调用完成记录接口", async () => {
  const ports = createPorts({ captureImage: async () => null });
  const delivery = createDeliveryModule(ports);

  const result = await delivery.execute({ type: "complete", ...context });

  assert.deepEqual(result, { ok: false, error: "无法导出当前画布" });
  assert.deepEqual(ports.calls, []);
});

test("普通导出失败可以再次重试", async () => {
  let attempt = 0;
  const ports = createPorts({
    captureImage: async () => (++attempt === 1 ? null : "data:image/png;base64,retry"),
  });
  const delivery = createDeliveryModule(ports);

  const first = await delivery.execute({ type: "image", target: "download", ...context });
  const second = await delivery.execute({ type: "image", target: "download", ...context });

  assert.deepEqual(first, { ok: false, error: "无法导出当前画布" });
  assert.deepEqual(second, { ok: true });
  assert.deepEqual(ports.calls, [["download", "data:image/png;base64,retry", "登录页.png"]]);
});
