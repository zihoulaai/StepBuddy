import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diagnosisResultSchema, RESULT_SCHEMA_VERSION } from "../src/result.js";

// 原文照抄 docs/specs/03 §1.4 示例，作为校验基准
const example = JSON.parse(
  readFileSync(new URL("../examples/result-example.json", import.meta.url), "utf8"),
);

describe("diagnosisResultSchema", () => {
  it("校验 03 §1.4 示例 JSON 通过", () => {
    expect(diagnosisResultSchema.safeParse(example).success).toBe(true);
  });

  it("反例：verdict 非法取值", () => {
    expect(diagnosisResultSchema.safeParse({ ...example, verdict: "wrong" }).success).toBe(false);
  });

  it("反例：versions 缺 model_version（四项版本缺一不可复核，03 §1）", () => {
    const { model_version: _modelVersion, ...rest } = example.versions;
    expect(diagnosisResultSchema.safeParse({ ...example, versions: rest }).success).toBe(false);
  });

  it("反例：error.traceable 缺失（03 §1.2 归因可追溯率依赖该字段）", () => {
    const { traceable: _traceable, ...restError } = example.steps[0].error;
    const steps = [{ ...example.steps[0], error: restError }];
    expect(diagnosisResultSchema.safeParse({ ...example, steps }).success).toBe(false);
  });

  it("反例：fallback.exit_code 不在 01 §5 退出码九类内", () => {
    const fallback = {
      mode: "answer_only",
      exit_code: "E-UNKNOWN",
      user_message: "x",
      partial_steps: 1,
    };
    expect(diagnosisResultSchema.safeParse({ ...example, fallback }).success).toBe(false);
  });

  it("反例：step.status 非法取值", () => {
    const steps = [{ ...example.steps[0], status: "skipped" }];
    expect(diagnosisResultSchema.safeParse({ ...example, steps }).success).toBe(false);
  });

  it("source_error 为 null 时通过（03 §1：正确时为 null）", () => {
    expect(diagnosisResultSchema.safeParse({ ...example, source_error: null }).success).toBe(true);
  });

  it("knowledge_points 允许空数组（03 §1：MVP 阶段可为空）", () => {
    expect(diagnosisResultSchema.safeParse({ ...example, knowledge_points: [] }).success).toBe(true);
  });

  it("RESULT_SCHEMA_VERSION 与示例 schema_version 一致（1.0.0）", () => {
    expect(RESULT_SCHEMA_VERSION).toBe(example.schema_version);
  });
});
