import assert from "node:assert/strict";

const port = process.env.DOCKYARD_DEBUG_PORT || "9233";
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const bar = pages.find((item) => item.url.includes("view=bar"));
assert.ok(bar, "没有找到 Dockyard 工具条页面");

const socket = new WebSocket(bar.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("CDP 执行超时")), 3000);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timeout);
    socket.close();
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result.result.value);
  });
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression: `(() => {
        const button = [...document.querySelectorAll("button")]
          .find((node) => node.textContent?.includes("选择项目"));
        return {
          tag: button?.tagName || null,
          disabled: button?.disabled || false,
          hasProjectSelect: Boolean(document.querySelector("select.bar-project")),
        };
      })()`,
      returnByValue: true,
    },
  }));
});

assert.deepEqual(result, {
  tag: "BUTTON",
  disabled: false,
  hasProjectSelect: false,
});
console.log("无项目时选择项目按钮验证通过。");
