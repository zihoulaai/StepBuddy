/**
 * 测试夹具（Task 8）：全部经 diagnosisResultSchema.parse 兜底合法，
 * 形状漂移时 parse 直接失败，夹具不会静默失配契约。
 *
 * UNTRACEABLE 复现 api 7.2 守卫的产出形状：reason 已是占位话术。
 */

import { diagnosisResultSchema, type DiagnosisResult } from "@stepbuddy/contracts";

const VERSIONS = {
  ir_schema_version: "1.0.0",
  rule_lib_version: "0.1.0",
  model_version: "locked-20260930",
  prompt_template_version: "tpl-2.1",
};

/** 全对样本：含正确路径（合规模拟 api teaching.recommended_path） */
export const CORRECT_RESULT: DiagnosisResult = diagnosisResultSchema.parse({
  schema_version: "1.0.0",
  result_id: "r-testcorrect01",
  versions: VERSIONS,
  verdict: "correct",
  steps: [
    { index: 1, status: "correct", equivalence_level: "strict", cost: 0 },
    { index: 2, status: "correct", equivalence_level: "formal", cost: 0.1 },
    { index: 3, status: "correct", equivalence_level: "strict", cost: 0.05 },
  ],
  source_error: null,
  teaching: {
    recommended_path: ["x+10+x=80", "2*x+10=80", "2*x=80-10", "x=(80-10)/2"],
    path_suggestion: "2*x+10=80",
    note: "回到推荐路径",
  },
  knowledge_points: [],
});

/** 有错样本：源头错误（移项未变号）+ 继承 + 未判定步 */
export const INCORRECT_RESULT: DiagnosisResult = diagnosisResultSchema.parse({
  schema_version: "1.0.0",
  result_id: "r-testincorr01",
  versions: VERSIONS,
  verdict: "incorrect",
  steps: [
    { index: 1, status: "correct", equivalence_level: "strict", cost: 0 },
    { index: 2, status: "incorrect", cost: 0.8, error: {
        role: "source",
        classification: "knowledge",
        rule_id: "ALG.EQ.MOVE",
        location: { span: "2*x=80+10", hint: "移项应改变符号" },
        reason: "移项没有变号：80+10 应为 80-10（ALG.EQ.MOVE 规则误用）",
        traceable: true } },
    { index: 3, status: "inherited", equivalence_level: "strict", error: {
        role: "inherited",
        classification: "knowledge",
        reason: "继承自第 2 步的移项错误",
        traceable: true } },
    { index: 4, status: "not_judged" },
  ],
  source_error: {
    step_index: 2,
    classification: "knowledge",
    rule_id: "ALG.EQ.MOVE",
    reason: "移项没有变号：80+10 应为 80-10（ALG.EQ.MOVE 规则误用）",
  },
  teaching: { recommended_path: ["x+10+x=80", "2*x+10=80", "2*x=80-10", "x=(80-10)/2"] },
  knowledge_points: [],
});

/** 7.2 UI 守卫样本：traceable=false 的 reason 已是 api 强制占位（噪声原文不得外泄） */
export const UNTRACEABLE_RESULT: DiagnosisResult = diagnosisResultSchema.parse({
  schema_version: "1.0.0",
  result_id: "r-testuntrac01",
  versions: VERSIONS,
  verdict: "incorrect",
  steps: [
    { index: 1, status: "incorrect", cost: 0.5, error: {
        role: "source",
        classification: "normative",
        reason: "该错误无法由规则引擎自动追溯，请结合学生作答过程人工核对",
        traceable: false } },
  ],
  source_error: {
    step_index: 1,
    classification: "normative",
    reason: "该错误无法由规则引擎自动追溯，请结合学生作答过程人工核对",
  },
  knowledge_points: [],
});

/** 建模拟败样本：fallback + 空 steps（assembleFallback 产物形状） */
export const MODEL_FAILED_RESULT: DiagnosisResult = diagnosisResultSchema.parse({
  schema_version: "1.0.0",
  result_id: "r-testmodelfail",
  versions: VERSIONS,
  verdict: "unknown",
  steps: [],
  source_error: null,
  fallback: {
    mode: "model_failed",
    exit_code: "MODEL_FAILED",
    user_message: "该题题意无法解析，建议人工批改",
    partial_steps: 0,
  },
  knowledge_points: [],
});
