import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const electronBin = join(
  root,
  "node_modules",
  "electron",
  "dist",
  "electron.exe",
);

function listeningPids(port) {
  if (process.platform !== "win32") return [];
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
  });
  const pattern = new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)\\s*$`, "i");
  return [
    ...new Set(
      String(result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.match(pattern)?.[1])
        .filter(Boolean),
    ),
  ];
}

for (const pid of listeningPids(5173)) {
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

console.log("Dockyard 开发进程已关闭，5173 端口已释放。");
