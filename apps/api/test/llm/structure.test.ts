import { describe, expect, it } from "vitest";
import {
  MODEL_VERSION,
  parseExtractionContent,
  structureQuestion,
  type LlmClient,
  type LlmErrorCode,
  type LlmRequest,
  type LlmResult,
} from "../../src/llm/index.js";

/** 按序回放预置结果；末项重复返回（模拟持续失败）。记录全部请求供锁定断言。 */
function fakeClient(results: LlmResult[]): { client: LlmClient; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  let cursor = 0;
  const client: LlmClient = {
    async complete(request: LlmRequest): Promise<LlmResult> {
      requests.push(request);
      const result = results[Math.min(cursor, results.length - 1)];
      cursor += 1;
      return JSON.parse(JSON.stringify(result)) as LlmResult;
    },
  };
  return { client, requests };
}

const okContent = (dto: unknown): LlmResult => ({
  ok: true,
  response: { content: JSON.stringify(dto), model: MODEL_VERSION },
  attempts: 1,
});

const transportFail = (code: LlmErrorCode, message: string): LlmResult => ({
  ok: false,
  attempts: [{ code, message, attempt: 1 }],
});

/** MODELED 标准题 golden Extraction（甲比乙多10 + 和80） */
const GOLDEN_DTO = {
  entities: [
    { name: "甲", role: "unknown" },
    { name: "乙", role: "unknown" },
  ],
  clauses: [
    {
      subjectName: "甲",
      referenceName: "乙",
      relation: "more",
      quantity: { num: 10, den: 1 },
      unit: "个",
      statement: "甲比乙多10个",
    },
    {
      subjectName: "甲",
      referenceName: "乙",
      relation: "sum",
      quantity: { num: 80, den: 1 },
      unit: "个",
      statement: "甲和乙一共80个",
    },
  ],
  targets: ["甲", "乙"],
};

const QUESTION = "甲和乙一共80个，甲比乙多10个，求甲和乙";

describe("structure：结构化编排与降级（6.1/6.2）", () => {
  it("STR-01 合法 LLM 产出 → ok；请求锁定（model=MODEL_VERSION、temperature=0、载荷白名单）", async () => {
    const { client, requests } = fakeClient([okContent(GOLDEN_DTO)]);
    const outcome = await structureQuestion(QUESTION, client);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    // 链路完整性：LLM Extraction 复用同一 applyRules 判定层（D3）
    expect(outcome.model.appliedRules.length).toBeGreaterThan(0);
    expect(outcome.model.entities.length).toBeGreaterThan(0);
    expect(outcome.extraction.targets).toEqual(["甲", "乙"]);
    // 零温度 + 模型版本锁定（tasks.md 6.1）
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe(MODEL_VERSION);
    expect(requests[0].temperature).toBe(0);
    expect(requests[0].messages[1]).toEqual({ role: "user", content: QUESTION });
  });

  it("STR-02 内容连续 3 轮不合格 → UNPARSABLE_INPUT（同 prompt 重发，不做变体）", async () => {
    const garbage: LlmResult = {
      ok: true,
      response: { content: "这不是 JSON，只是自然语言", model: MODEL_VERSION },
      attempts: 1,
    };
    const { client, requests } = fakeClient([garbage]);
    const outcome = await structureQuestion(QUESTION, client);
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.exitCode).toBe("UNPARSABLE_INPUT");
    expect(outcome.suggestion).toBe("human_review");
    expect(outcome.reason).toContain("3 轮");
    // 3 轮 = 3 次同 prompt 请求（prompt 与温度不变——归档 04 §8.2）
    expect(requests).toHaveLength(3);
    expect(new Set(requests.map((r) => JSON.stringify(r.messages))).size).toBe(1);
  });

  it("STR-03 传输层失败（TIMEOUT）→ DEPENDENCY_UNAVAILABLE 且不重发 prompt（client 内部已重试）", async () => {
    const { client, requests } = fakeClient([transportFail("TIMEOUT", "请求超时")]);
    const outcome = await structureQuestion(QUESTION, client);
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.exitCode).toBe("DEPENDENCY_UNAVAILABLE");
    expect(outcome.reason).toContain("TIMEOUT");
    expect(outcome.attempts.map((a) => a.code)).toEqual(["TIMEOUT"]);
    expect(requests).toHaveLength(1);
  });

  it("STR-04 规则层不命中（clauses 空数组）→ MODEL_FAILED，reason 标注规则层来源", async () => {
    const { client } = fakeClient([okContent({ entities: [], clauses: [], targets: [] })]);
    const outcome = await structureQuestion(QUESTION, client);
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.exitCode).toBe("MODEL_FAILED");
    expect(outcome.reason).toContain("规则层");
  });

  it("STR-05 无静默错判守卫：三类失败输入全部走降级，无一返回 ok", async () => {
    const cases: Array<{ result: LlmResult; exitCode: string }> = [
      { result: { ok: true, response: { content: "垃圾文本", model: MODEL_VERSION }, attempts: 1 }, exitCode: "UNPARSABLE_INPUT" },
      { result: transportFail("CONFIG", "缺 API key"), exitCode: "DEPENDENCY_UNAVAILABLE" },
      { result: okContent({ entities: [], clauses: [], targets: [] }), exitCode: "MODEL_FAILED" }, // 合法但规则层不命中
    ];
    for (const { result, exitCode } of cases) {
      const { client } = fakeClient([result]);
      const outcome = await structureQuestion(QUESTION, client);
      expect(outcome.status).toBe("failed");
      if (outcome.status === "failed") {
        expect(outcome.exitCode).toBe(exitCode);
        expect(outcome.suggestion).toBe("human_review");
      }
    }
  });

  it("STR-07 退出码三分支映射（01 §5 字面，Task 7 决策 D1）：内容/规则/系统各归其位", async () => {
    // 内容 3 轮不过 → UNPARSABLE_INPUT（识别三次仍失败）
    const garbage = await structureQuestion(
      QUESTION,
      fakeClient([{ ok: true, response: { content: "自然语言", model: MODEL_VERSION }, attempts: 1 }]).client,
    );
    expect(garbage.status === "failed" && garbage.exitCode).toBe("UNPARSABLE_INPUT");
    // 规则层不适用 → MODEL_FAILED（应用题专属）
    const ruleFailed = await structureQuestion(
      QUESTION,
      fakeClient([okContent({ entities: [], clauses: [], targets: [] })]).client,
    );
    expect(ruleFailed.status === "failed" && ruleFailed.exitCode).toBe("MODEL_FAILED");
    // 传输/预算失败 → DEPENDENCY_UNAVAILABLE（系统类，编排层转 HTTP 503）
    const transportFailed = await structureQuestion(
      QUESTION,
      fakeClient([transportFail("NETWORK", "连接被拒")]).client,
    );
    expect(transportFailed.status === "failed" && transportFailed.exitCode).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("STR-06 code fence JSON 可解析；第 1 轮垃圾第 2 轮合法 → 同 prompt 重发容错成功", async () => {
    const fenced: LlmResult = {
      ok: true,
      response: {
        content: `好的，结构如下：\n\`\`\`json\n${JSON.stringify(GOLDEN_DTO)}\n\`\`\``,
        model: MODEL_VERSION,
      },
      attempts: 2,
    };
    const garbage: LlmResult = {
      ok: true,
      response: { content: "半截 JSON {\"entities\":", model: MODEL_VERSION },
      attempts: 1,
    };
    const { client, requests } = fakeClient([garbage, fenced]);
    const outcome = await structureQuestion(QUESTION, client);
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.attempts).toBe(2);
    }
    expect(requests).toHaveLength(2);
    // 纯函数解析：code fence / 裸 JSON / 非法文本三态
    expect(parseExtractionContent('```json\n{"a":1}\n```')).toBeNull(); // a=1 缺 schema 键
    expect(parseExtractionContent('{"entities":[],"clauses":[],"targets":[]}')).not.toBeNull();
    expect(parseExtractionContent("")).toBeNull();
  });
});
