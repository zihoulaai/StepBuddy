import { describe, expect, it } from "vitest";
import { FALLBACK_EXIT_CODES, RESULT_SCHEMA_VERSION } from "@stepbuddy/contracts";
import { MODEL_VERSION } from "../../src/llm/index.js";
import {
  assembleFallback,
  assembleResult,
  diagnoseSubmission,
  DependencyError,
  EXIT_CODE_MESSAGES,
  FALLBACK_MODE_BY_EXIT_CODE,
  PARTIAL_EXIT_CODES,
  PARTIAL_NOTICE,
  RULE_LIB_VERSION,
  UNTRACEABLE_REASON,
} from "../../src/diagnose/index.js";
import type { DiagnosisOutcome } from "@stepbuddy/rules";
import {
  BEYOND_TERMINAL_STEPS,
  CORRECT_STEPS,
  DIV_ZERO_STEPS,
  fakeClient,
  GOLDEN_DTO,
  KNOWN_ONE_DTO,
  KNOWN_ONE_QUESTION,
  okContent,
  SIGN_FLIP_STEPS,
  STANDARD_QUESTION,
  submission,
  transportFail,
  expectValidResult,
} from "./helpers.js";

/**
 * 单题诊断编排与结果组装测试（Task 7.1/7.2）。
 *
 * 覆盖 DGN-01..13：端到端（正确/错误/空步骤/三类 LLM 失败）、九类退出码话术、
 * 7.2 不可追溯原因守卫、M-6 双跑确定性、形状映射细节。
 */

describe("diagnoseSubmission：单题诊断管线（7.1）", () => {
  it("DGN-01 正确端到端：verdict=correct、steps 全 correct（index 从 1 起）、versions 四项、teaching.recommended_path 非空", async () => {
    const { client } = fakeClient([okContent(GOLDEN_DTO)]);
    const result = await diagnoseSubmission(submission(), { client });

    expect(result.verdict).toBe("correct");
    expect(result.steps.map((step) => step.status)).toEqual(Array(6).fill("correct"));
    expect(result.steps.map((step) => step.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.source_error).toBeNull();
    expect(result.fallback).toBeUndefined();
    expect(result.schema_version).toBe(RESULT_SCHEMA_VERSION);
    expect(result.result_id).toMatch(/^r-[0-9a-f]{12}$/);
    expect(result.versions).toEqual({
      ir_schema_version: "1.0.0",
      rule_lib_version: RULE_LIB_VERSION,
      model_version: MODEL_VERSION,
      prompt_template_version: "tpl-2.1",
    });
    const recommendedPath = result.teaching?.recommended_path;
    expect(Array.isArray(recommendedPath) && recommendedPath.length > 0).toBe(true);
    // 5.3 路径建议并入 teaching（走了合法非推荐路径，path_suggestion 为节点文本序列）
    expect(Array.isArray(result.teaching?.path_suggestion)).toBe(true);
    expect(result.knowledge_points).toEqual([]);
    expectValidResult(result);
  });

  it("DGN-02 M-6 双跑：同 submission 两次调用 deepEqual（result_id 确定性哈希）", async () => {
    const first = await diagnoseSubmission(submission(), { client: fakeClient([okContent(GOLDEN_DTO)]).client });
    const second = await diagnoseSubmission(submission(), { client: fakeClient([okContent(GOLDEN_DTO)]).client });
    expect(first).toEqual(second);
    expect(first.result_id).toBe(second.result_id);
  });

  it("DGN-03 incorrect 端到端（移项未变号）：source_error.step_index=3、error.traceable=true、classification=knowledge", async () => {
    const { client } = fakeClient([okContent(GOLDEN_DTO)]);
    const result = await diagnoseSubmission(
      submission({ studentStepsText: SIGN_FLIP_STEPS.join("\n") }),
      { client },
    );

    expect(result.verdict).toBe("incorrect");
    expect(result.steps.map((step) => step.status)).toEqual(["correct", "correct", "incorrect", "inherited"]);
    expect(result.source_error).toMatchObject({
      step_index: 3,
      classification: "knowledge",
      rule_id: "ALG.EQ.MOVE",
    });
    expect(result.steps[2].error?.traceable).toBe(true);
    expect(result.steps[2].error?.reason).toContain("移项没有变号");
    // 后一步 inherited 计已判定；fallback 不出现（全部步骤有判定）
    expect(result.fallback).toBeUndefined();
    expectValidResult(result);
  });

  it("DGN-04 空步骤 → ANSWER_ONLY + verdict=unknown + 不调 LLM（只写答案未写过程）", async () => {
    const { client, requests } = fakeClient([okContent(GOLDEN_DTO)]);
    const result = await diagnoseSubmission(
      submission({ studentStepsText: "" }),
      { client },
    );

    expect(result.verdict).toBe("unknown");
    expect(result.steps).toEqual([]);
    expect(result.source_error).toBeNull();
    expect(result.fallback).toMatchObject({
      mode: "answer_only",
      exit_code: "ANSWER_ONLY",
      user_message: EXIT_CODE_MESSAGES.ANSWER_ONLY,
      partial_steps: 0,
    });
    expect(result.fallback?.user_message).not.toContain(PARTIAL_NOTICE);
    // 短路在结构化之前：无 LLM 请求
    expect(requests).toHaveLength(0);
    expectValidResult(result);
  });

  it("DGN-05 LLM 内容 3 轮不过 → UNPARSABLE_INPUT fallback（同 prompt 重发 3 次）", async () => {
    const garbage = {
      ok: true as const,
      response: { content: "这不是 JSON，只是自然语言", model: MODEL_VERSION },
      attempts: 1,
    };
    const { client, requests } = fakeClient([garbage]);
    const result = await diagnoseSubmission(submission(), { client });

    expect(result.verdict).toBe("unknown");
    expect(result.fallback).toMatchObject({
      mode: "unparsable_input",
      exit_code: "UNPARSABLE_INPUT",
      user_message: EXIT_CODE_MESSAGES.UNPARSABLE_INPUT,
    });
    expect(result.steps).toEqual([]);
    expect(requests).toHaveLength(3);
    expectValidResult(result);
  });

  it("DGN-06 applyRules 失败（clauses 空数组）→ MODEL_FAILED fallback + 话术", async () => {
    const { client } = fakeClient([okContent({ entities: [], clauses: [], targets: [] })]);
    const result = await diagnoseSubmission(submission(), { client });

    expect(result.verdict).toBe("unknown");
    expect(result.fallback).toMatchObject({
      mode: "model_failed",
      exit_code: "MODEL_FAILED",
      user_message: EXIT_CODE_MESSAGES.MODEL_FAILED,
    });
    expectValidResult(result);
  });

  it("DGN-07 DAG_NO_PATH：端到端构造不可行（MVP 句型种子方程均有解），按计划退化为 assembleFallback 分支单测留痕", () => {
    // 01 §5 DAG_NO_PATH 触发条件为「无法生成解题空间」——applyRules 成功的应用题
    // 种子方程均可展开出终态（恒等/矛盾方程无法由 LLM Extraction 在 MVP 句型下稳定构造），
    // 故端到端不可达；分支行为由 assembleFallback 覆盖（话术表另见 DGN-13）。
    const result = assembleFallback("DAG_NO_PATH", {
      questionText: STANDARD_QUESTION,
      studentStepsText: CORRECT_STEPS.join("\n"),
    });

    expect(result.verdict).toBe("unknown");
    expect(result.steps).toEqual([]);
    expect(result.fallback).toMatchObject({
      mode: "dag_no_path",
      exit_code: "DAG_NO_PATH",
      user_message: EXIT_CODE_MESSAGES.DAG_NO_PATH,
    });
    expect(result.fallback?.user_message).not.toContain(PARTIAL_NOTICE);
    expectValidResult(result);
  });

  it("DGN-08 步骤无等号行 → INVALID_EXPR fallback + step error.reason 指明行号（不调 LLM）", async () => {
    const { client, requests } = fakeClient([okContent(GOLDEN_DTO)]);
    const result = await diagnoseSubmission(
      submission({ studentStepsText: "x+30=100\n这一行没有等号" }),
      { client },
    );

    expect(result.verdict).toBe("unknown");
    expect(result.fallback).toMatchObject({
      mode: "invalid_expr",
      exit_code: "INVALID_EXPR",
      user_message: EXIT_CODE_MESSAGES.INVALID_EXPR,
      partial_steps: 0,
    });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe("not_judged");
    expect(result.steps[0].error?.reason).toContain("第 2 行");
    expect(result.steps[0].error?.traceable).toBe(true);
    expect(requests).toHaveLength(0);
    expectValidResult(result);
  });

  it("DGN-09 除零步骤（x=100÷0）→ INVALID_EXPR fallback + 话术（非部分结果，无尾注）", async () => {
    const { client } = fakeClient([okContent(KNOWN_ONE_DTO)]);
    const result = await diagnoseSubmission(
      submission({
        questionText: KNOWN_ONE_QUESTION,
        studentStepsText: DIV_ZERO_STEPS.join("\n"),
      }),
      { client },
    );

    expect(result.verdict).toBe("partial");
    expect(result.steps.map((step) => step.status)).toEqual(["correct", "not_judged"]);
    expect(result.fallback).toMatchObject({
      mode: "invalid_expr",
      exit_code: "INVALID_EXPR",
      user_message: EXIT_CODE_MESSAGES.INVALID_EXPR,
      partial_steps: 1,
    });
    expect(result.fallback?.user_message).not.toContain(PARTIAL_NOTICE);
    expectValidResult(result);
  });

  it("DGN-10 7.2 守卫：traceable=false 的 reason 原文被占位替换（steps.error 与 source_error 同步），分类信息保留", () => {
    const noisyReason = "噪声原文：内部不可追溯细节";
    const outcome: DiagnosisOutcome = {
      verdict: "incorrect",
      steps: [
        { index: 0, status: "correct", nodeId: "n1", cost: { num: 0, den: 1 }, equivalenceLevel: "strict", skippedTransforms: 0 },
        {
          index: 1,
          status: "incorrect",
          nodeId: "n2",
          cost: { num: 9, den: 100 },
          equivalenceLevel: "formal",
          skippedTransforms: 1,
          transforms: ["ALG.EQ.MOVE"],
          error: {
            role: "source",
            classification: "knowledge",
            ruleId: "ALG.EQ.MOVE",
            location: { span: "2*x=80+10", hint: "移项需变号" },
            reason: noisyReason,
            traceable: false,
          },
        },
        {
          index: 2,
          status: "inherited",
          nodeId: null,
          cost: null,
          equivalenceLevel: null,
          skippedTransforms: 0,
          error: {
            role: "inherited",
            classification: "knowledge",
            reason: "继承自第 2 步的源头错误（不重复扣分）",
            traceable: true,
          },
        },
      ],
      sourceError: { stepIndex: 1, classification: "knowledge", ruleId: "ALG.EQ.MOVE", reason: noisyReason },
      recommendedPath: ["n1", "n2"],
    };

    const result = assembleResult(outcome, {
      questionText: STANDARD_QUESTION,
      studentStepsText: SIGN_FLIP_STEPS.join("\n"),
    });

    // 7.2：不可追溯原因原文不得出现在错误原因区
    expect(result.steps[1].error?.reason).toBe(UNTRACEABLE_REASON);
    expect(result.steps[1].error?.reason).not.toContain(noisyReason);
    expect(result.source_error?.reason).toBe(UNTRACEABLE_REASON);
    // 分类与定位信息仍可见（role/classification/rule_id/location/traceable 保留）
    expect(result.steps[1].error).toMatchObject({
      role: "source",
      classification: "knowledge",
      rule_id: "ALG.EQ.MOVE",
      location: { span: "2*x=80+10", hint: "移项需变号" },
      traceable: false,
    });
    // traceable=true 的原因原文原样保留
    expect(result.steps[2].error?.reason).toContain("继承自第 2 步");
    expect(JSON.stringify(result)).not.toContain(noisyReason);
    expectValidResult(result);
  });

  it("DGN-11 映射细节：cost 数值化、equivalence_level 省略规则、partial_steps=已判定数", async () => {
    const { client } = fakeClient([okContent(KNOWN_ONE_DTO)]);
    const result = await diagnoseSubmission(
      submission({
        questionText: KNOWN_ONE_QUESTION,
        studentStepsText: BEYOND_TERMINAL_STEPS.join("\n"),
      }),
      { client },
    );

    // 判对步 cost={num,den} → number（展示层数值化）
    expect(typeof result.steps[0].cost).toBe("number");
    expect(result.steps[0].cost).toBe(0);
    // not_judged 步无 cost / equivalence_level（rules 侧为 null，组装省略字段）
    expect(result.steps[3].cost).toBeUndefined();
    expect(result.steps[3].equivalence_level).toBeUndefined();
    // partial_steps = 已判定步骤数（3 判 + 1 not_judged）
    expect(result.fallback?.partial_steps).toBe(3);
    expectValidResult(result);
  });

  it("DGN-12 ALIGN_FAILED：终态后多余步骤 → fallback + 已判步骤保留 + verdict=partial + 部分结果尾注", async () => {
    const { client } = fakeClient([okContent(KNOWN_ONE_DTO)]);
    const result = await diagnoseSubmission(
      submission({
        questionText: KNOWN_ONE_QUESTION,
        studentStepsText: BEYOND_TERMINAL_STEPS.join("\n"),
      }),
      { client },
    );

    expect(result.verdict).toBe("partial");
    expect(result.steps.map((step) => step.status)).toEqual(["correct", "correct", "correct", "not_judged"]);
    expect(result.fallback?.exit_code).toBe("ALIGN_FAILED");
    expect(result.fallback?.mode).toBe("align_failed");
    expect(result.fallback?.user_message).toBe(`${EXIT_CODE_MESSAGES.ALIGN_FAILED}${PARTIAL_NOTICE}`);
    expect(result.fallback?.partial_steps).toBe(3);
    expectValidResult(result);
  });

  it("DGN-13 assembleFallback 全九类退出码话术表逐一断言（01 §5 原文；GEOMETRY_NO_PARSE MVP 不产生留痕 D11）", () => {
    const ctx = { questionText: STANDARD_QUESTION, studentStepsText: CORRECT_STEPS.join("\n") };
    const truncatedCases = new Set(["DEPTH_EXCEEDED", "COST_EXCEEDED"]);

    for (const code of FALLBACK_EXIT_CODES) {
      const partialSteps = truncatedCases.has(code) ? 3 : undefined;
      const result = assembleFallback(code, ctx, { partialSteps });
      expect(result.fallback?.exit_code).toBe(code);
      expect(result.fallback?.mode).toBe(FALLBACK_MODE_BY_EXIT_CODE[code]);
      if (PARTIAL_EXIT_CODES.has(code)) {
        expect(result.verdict).toBe("partial");
        expect(result.fallback?.user_message).toBe(
          `${EXIT_CODE_MESSAGES[code].replace("N", "3")}${PARTIAL_NOTICE}`,
        );
      } else {
        expect(result.verdict).toBe("unknown");
        expect(result.fallback?.user_message).toBe(EXIT_CODE_MESSAGES[code]);
      }
      expectValidResult(result);
    }

    // GEOMETRY_NO_PARSE：MVP 无几何题型不产生（D11），话术表枚举保留
    expect(EXIT_CODE_MESSAGES.GEOMETRY_NO_PARSE).toBe("图形部分未识别，相关步骤未校验");
    // 01 §5 原文字面断言（防止话术被无意改写）
    expect(EXIT_CODE_MESSAGES.DEPTH_EXCEEDED).toBe("步骤较多，已按前 N 步诊断");
    expect(EXIT_CODE_MESSAGES.ANSWER_ONLY).toBe("学生只写答案未写过程，本题无法进行步骤诊断");
  });

  it("DGN-13b 传输层失败 → DependencyError（系统类，编排层不产出 fallback 结果）", async () => {
    const { client } = fakeClient([transportFail("NETWORK", "连接被拒")]);
    await expect(diagnoseSubmission(submission(), { client })).rejects.toThrow(DependencyError);
  });
});
