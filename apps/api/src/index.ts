import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import {
  DependencyError,
  diagnoseSubmission,
  type DiagnoseSubmission,
} from "./diagnose/index.js";
import { createClientFromEnv, type LlmClient } from "./llm/index.js";

/**
 * 本地 HTTP 服务（Task 1 骨架 → Task 7 诊断入口，技术规格 §4.1）。
 *
 * - GET /health：健康检查（Task 1 保留）；
 * - POST /v1/diagnose：单题诊断薄壳——全部逻辑在 diagnose/orchestrate.ts 纯函数内
 *   （可单测、M-6 双跑）；client 经 createClientFromEnv 抽点构造（测试可注入替换）。
 *
 * 路由只做四件事：JSON body 解析 → 缺字段 400 → diagnoseSubmission → 200 结果 JSON；
 * DependencyError（LLM 传输/预算失败，01 §5 DEPENDENCY_UNAVAILABLE）→ 503。
 */

const port = Number(process.env.PORT ?? 3000);

type DiagnoseBody = Partial<Record<keyof DiagnoseSubmission, unknown>>;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text.length === 0 ? null : (JSON.parse(text) as unknown);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** POST /v1/diagnose 处理：缺字段 400；系统类失败 503；其余 200 诊断结果 JSON */
async function handleDiagnose(body: unknown, client: LlmClient): Promise<{ status: number; body: unknown }> {
  const submission = (body ?? {}) as DiagnoseBody;
  if (typeof submission.questionText !== "string" || typeof submission.studentStepsText !== "string") {
    return { status: 400, body: { error: "E-BAD-REQUEST" } };
  }
  const source: "photo" | "manual" = submission.source === "photo" ? "photo" : "manual";
  try {
    const result = await diagnoseSubmission(
      {
        questionText: submission.questionText,
        studentStepsText: submission.studentStepsText,
        source,
      },
      { client },
    );
    return { status: 200, body: result };
  } catch (error) {
    if (error instanceof DependencyError) {
      // spec §4.3：不重试转人工；LLM 不可用不与题目对错混淆
      return { status: 503, body: { error: "E-DEPENDENCY-UNAVAILABLE" } };
    }
    throw error;
  }
}

/** 路由工厂：clientProvider 可注入（测试用 fake client，不触网） */
export function createApiServer(
  deps: { clientProvider?: () => LlmClient } = {},
): Server {
  const clientProvider = deps.clientProvider ?? createClientFromEnv;
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { status: "ok" });
      return;
    }
    if (req.method === "POST" && req.url === "/v1/diagnose") {
      void (async () => {
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch {
          json(res, 400, { error: "E-BAD-REQUEST" });
          return;
        }
        try {
          const outcome = await handleDiagnose(body, clientProvider());
          json(res, outcome.status, outcome.body);
        } catch {
          json(res, 500, { error: "E-INTERNAL" });
        }
      })();
      return;
    }
    json(res, 404, { error: "not found" });
  });
}

/** 直接运行本文件时监听（测试 import 不启动监听，避免占用端口） */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  createApiServer().listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });
}
