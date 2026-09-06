import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const page = fileURLToPath(
  new URL("./interaction-component-relations.prototype.html", import.meta.url),
);

createServer(async (_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(await readFile(page));
}).listen(4319, "127.0.0.1", () => {
  console.log("关系表达原型：http://127.0.0.1:4319");
});
