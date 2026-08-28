import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { listeningPids } from "./dev-processes.mjs";

const root = process.cwd();
const electronBin = join(
  root,
  "node_modules",
  "electron",
  "dist",
  "electron.exe",
);

for (const pid of new Set(listeningPids(5173))) {
  spawnSync("taskkill", ["/pid", pid, "/t", "/f"], { stdio: "ignore" });
}

if (process.platform === "win32") {
  const target = electronBin.replaceAll("'", "''");
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `$target='${target}'; Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $target } | Stop-Process -Force`,
    ],
    { stdio: "ignore" },
  );
}

const remaining = [...new Set(listeningPids(5173))];
if (remaining.length > 0) {
  console.error(
    `5173 端口仍被占用（PID: ${remaining.join(", ")}），请先关闭对应进程。`,
  );
  process.exitCode = 1;
} else {
  console.log("Dockyard 开发进程已关闭，5173 端口已释放。");
}
