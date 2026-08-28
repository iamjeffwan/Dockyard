import test from "node:test";
import assert from "node:assert/strict";
import { parseListeningPids } from "../scripts/dev-processes.mjs";

test("识别 IPv4 开发服务器监听进程", () => {
  assert.deepEqual(
    parseListeningPids(
      "  TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    1234\n",
      5173,
    ),
    ["1234"],
  );
});

test("识别 IPv6 开发服务器监听进程", () => {
  assert.deepEqual(
    parseListeningPids(
      "  TCP    [::1]:5173    [::]:0    LISTENING    5678\n",
      5173,
    ),
    ["5678"],
  );
});
