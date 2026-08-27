const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

const PROTOTYPE_URL = process.env.DOCKYARD_OVERLAY_URL || "http://127.0.0.1:6011/";
const ALLOWED_STORY_ORIGIN = "https://master--5ccbc373887ca40020446347.chromatic.com";
const STORY_INDEX_URL = `${ALLOWED_STORY_ORIGIN}/index.json`;

function findStoryFrame(webContents, requestedUrl) {
  const requested = new URL(requestedUrl);
  if (requested.origin !== ALLOWED_STORY_ORIGIN) {
    throw new Error("远程 Storybook 地址不在实验允许列表中");
  }

  return webContents.mainFrame.framesInSubtree.find((frame) => {
    try {
      const current = new URL(frame.url);
      return (
        current.origin === requested.origin &&
        current.pathname === requested.pathname &&
        current.searchParams.get("id") === requested.searchParams.get("id")
      );
    } catch {
      return false;
    }
  });
}

async function measureStoryFrame(webContents, requestedUrl) {
  const frame = findStoryFrame(webContents, requestedUrl);
  if (!frame) throw new Error("没有找到远程 Storybook 页面帧");

  const result = await frame.executeJavaScript(`(async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
    const findTarget = () => {
      const root = document.querySelector('#storybook-root') || document.body;
      const visible = [...root.querySelectorAll('*')].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      const viewportArea = innerWidth * innerHeight;
      const candidates = visible.filter((element) => {
        const rect = element.getBoundingClientRect();
        const tag = element.tagName.toLowerCase();
        return !['script', 'style', 'link'].includes(tag) && rect.width * rect.height < viewportArea * 0.9;
      });
      return candidates.find((element) =>
        ['button', 'input', 'select', 'textarea', 'a'].includes(element.tagName.toLowerCase())
      ) || candidates[0] || null;
    };
    let target = findTarget();
    for (let attempt = 0; !target && attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      target = findTarget();
    }
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return {
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
      tag: target.tagName.toLowerCase(),
      className: typeof target.className === 'string' ? target.className : '',
      boxShadow: style.boxShadow,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      frameUrl: location.href
    };
  })()`);

  if (!result || result.width <= 0 || result.height <= 0) {
    throw new Error("远程页面没有返回有效组件边界");
  }
  return result;
}

app.whenReady().then(() => {
  ipcMain.handle("prototype:load-story-index", async () => {
    const response = await fetch(STORY_INDEX_URL);
    if (!response.ok) throw new Error(`远程索引请求失败: ${response.status}`);
    return response.json();
  });
  ipcMain.handle("prototype:measure-story-frame", (event, requestedUrl) =>
    measureStoryFrame(event.sender, requestedUrl),
  );

  const window = new BrowserWindow({
    width: 980,
    height: 760,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setMenuBarVisibility(false);
  window.loadURL(PROTOTYPE_URL);
});

app.on("window-all-closed", () => app.quit());
