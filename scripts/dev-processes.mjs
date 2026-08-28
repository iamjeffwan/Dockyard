import { spawnSync } from "node:child_process";

export function parseListeningPids(output, port) {
  const pattern = new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)\\s*$`, "i");
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.match(pattern)?.[1])
    .filter(Boolean);
}

export function listeningPids(port) {
  if (process.platform !== "win32") return [];
  return ["tcp", "tcpv6"].reduce((pids, protocol) => {
    const result = spawnSync("netstat", ["-ano", "-p", protocol], {
      encoding: "utf8",
    });
    pids.push(...parseListeningPids(result.stdout, port));
    return pids;
  }, []);
}
