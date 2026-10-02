import { createServer } from "node:http";

/**
 * 后端骨架（Task 1）：仅提供健康检查。
 * 诊断入口 submit_question / diagnose（技术规格 §4.1）在 Task 7 落地，
 * 届时接入 @stepbuddy/contracts 与 @stepbuddy/rules。
 */
const port = Number(process.env.PORT ?? 3000);

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}).listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
