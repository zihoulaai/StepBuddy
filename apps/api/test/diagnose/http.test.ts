import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diagnosisResultSchema, RESULT_SCHEMA_VERSION } from "@stepbuddy/contracts";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApiServer } from "../../src/index.js";
import {
  CORRECT_STEPS,
  fakeClient,
  GOLDEN_DTO,
  okContent,
  STANDARD_QUESTION,
  transportFail,
} from "./helpers.js";

/**
 * HTTP 路由测试（Task 7.1：POST /v1/diagnose 薄壳）。
 *
 * 起 ephemeral port 真 server；clientProvider 注入 fake client（D11 结构性结论的
 * createClientFromEnv 抽点），全程不触网。全部判定逻辑由 orchestrate 单测覆盖。
 */

describe("POST /v1/diagnose（7.1 本地 HTTP 路由）", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createApiServer({ clientProvider: () => fakeClient([okContent(GOLDEN_DTO)]).client });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("DGN-14 合法请求 → 200 + 输出过 schema.parse；缺字段 → 400 E-BAD-REQUEST；/health 保留", async () => {
    const response = await fetch(`${baseUrl}/v1/diagnose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionText: STANDARD_QUESTION,
        studentStepsText: CORRECT_STEPS.join("\n"),
      }),
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as unknown;
    const parsed = diagnosisResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schema_version).toBe(RESULT_SCHEMA_VERSION);
      expect(parsed.data.verdict).toBe("correct");
    }

    const bad = await fetch(`${baseUrl}/v1/diagnose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionText: STANDARD_QUESTION }), // 缺 studentStepsText
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "E-BAD-REQUEST" });

    const malformed = await fetch(`${baseUrl}/v1/diagnose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "不是 JSON",
    });
    expect(malformed.status).toBe(400);

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
  });

  it("DGN-15 传输层失败 → 503 { error: \"E-DEPENDENCY-UNAVAILABLE\" }（spec §4.3 不重试转人工）", async () => {
    const failingServer = createApiServer({
      clientProvider: () => fakeClient([transportFail("NETWORK", "连接被拒")]).client,
    });
    await new Promise<void>((resolve) => failingServer.listen(0, "127.0.0.1", resolve));
    try {
      const url = `http://127.0.0.1:${(failingServer.address() as AddressInfo).port}/v1/diagnose`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionText: STANDARD_QUESTION,
          studentStepsText: CORRECT_STEPS.join("\n"),
        }),
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "E-DEPENDENCY-UNAVAILABLE" });
    } finally {
      failingServer.close();
    }
  });
});
