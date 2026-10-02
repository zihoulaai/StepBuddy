import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  constraintSchema,
  diagnosisResultSchema,
  entitySchema,
  errorDetailSchema,
  errorLocationSchema,
  fallbackSchema,
  questionIRSchema,
  sourceErrorSchema,
  stepIRSchema,
  stepResultSchema,
  targetSchema,
  transformItemSchema,
  versionsSchema,
} from "../src/index.js";

/**
 * 「与 01/03 字段逐项 diff 无差异」的机械化守卫。
 * 期望集逐项抄自文档字段表；文档字段有增删时先改这里，测试先红。
 */
const QUESTION_IR_FIELDS = [
  "schema_version",
  "question_type",
  "grade_band",
  "entity",
  "relation",
  "target",
  "constraint",
  "tags",
  "steps",
]; // 01 §3.1 题目结构 + §3.5 示例（steps 内嵌于题目 IR）

const STEP_IR_FIELDS = [
  "index",
  "raw_text",
  "expr_before",
  "expr_after",
  "split_checked",
  "source",
  "answer_only",
]; // 01 §3.2 步骤结构

const RESULT_FIELDS = [
  "schema_version",
  "result_id",
  "versions",
  "verdict",
  "steps",
  "source_error",
  "fallback",
  "teaching",
  "knowledge_points",
]; // 03 §1 诊断结果结构（confidence 见 §1.4 示例，单独断言）

const STEP_RESULT_FIELDS = [
  "index",
  "status",
  "equivalence_level",
  "cost",
  "transforms",
  "error",
]; // 03 §1.1 逐步结果

const ERROR_DETAIL_FIELDS = [
  "role",
  "classification",
  "subtype",
  "rule_id",
  "location",
  "reason",
  "traceable",
]; // 03 §1.2 错误明细

const FALLBACK_FIELDS = ["mode", "exit_code", "user_message", "partial_steps"]; // 03 §1.3 退化标记

const VERSIONS_FIELDS = [
  "ir_schema_version",
  "rule_lib_version",
  "model_version",
  "prompt_template_version",
]; // 03 §1「四项版本」，键名照 §1.4 示例

const SOURCE_ERROR_FIELDS = ["step_index", "classification", "rule_id", "reason"]; // 03 §1.4 示例

const ENTITY_ITEM_FIELDS = ["id", "role", "name", "value", "unit", "dimension"]; // 01 §3.5 示例 + §3.1「单位、量纲」

const TARGET_FIELDS = ["type", "answer_form"]; // 01 §3.1「求解目标与结果形式」，§3.5 示例键名

const CONSTRAINT_FIELDS = [
  "require_simplest_form",
  "require_decimal_places",
  "require_estimation",
]; // 01 §3.1「简便运算、保留小数、最简分数等要求」

const TRANSFORM_FIELDS = ["rule_id", "status", "evidence"]; // 03 §1.4 示例

const LOCATION_FIELDS = ["span", "hint"]; // 03 §1.4 示例

function keys(schema: { shape: z.ZodRawShape }): string[] {
  return Object.keys(schema.shape);
}

function expectSameSet(actual: string[], expected: string[]): void {
  expect([...actual].sort()).toEqual([...expected].sort());
}

describe("schema 字段与文档逐项 diff", () => {
  it("01 §3.1 题目 IR 顶层字段齐全且无多余", () => {
    expectSameSet(keys(questionIRSchema), QUESTION_IR_FIELDS);
  });

  it("01 §3.2 步骤 IR 八字段齐全且无多余", () => {
    expectSameSet(keys(stepIRSchema), STEP_IR_FIELDS);
  });

  it("01 §3.5 示例将 steps 内嵌于题目 IR", () => {
    const steps = questionIRSchema.shape.steps;
    expect(steps).toBeDefined();
    expect(steps!.element).toBe(stepIRSchema);
  });

  it("01 §3.5 示例 entity 形状（entities 数组与元素字段）", () => {
    expectSameSet(keys(entitySchema), ["entities"]);
    expectSameSet(keys(entitySchema.shape.entities.element), ENTITY_ITEM_FIELDS);
  });

  it("01 §3.1 target / constraint 已知键齐全", () => {
    expectSameSet(keys(targetSchema), TARGET_FIELDS);
    expectSameSet(keys(constraintSchema), CONSTRAINT_FIELDS);
  });

  it("03 §1 结果顶层字段齐全（另含 §1.4 示例的 confidence）", () => {
    expectSameSet(keys(diagnosisResultSchema), [...RESULT_FIELDS, "confidence"]);
  });

  it("03 §1.1 逐步结果字段齐全且无多余", () => {
    expectSameSet(keys(stepResultSchema), STEP_RESULT_FIELDS);
  });

  it("03 §1.2 错误明细字段齐全且无多余", () => {
    expectSameSet(keys(errorDetailSchema), ERROR_DETAIL_FIELDS);
  });

  it("03 §1.3 退化标记字段齐全且无多余", () => {
    expectSameSet(keys(fallbackSchema), FALLBACK_FIELDS);
  });

  it("03 §1 四项版本键名齐全", () => {
    expectSameSet(keys(versionsSchema), VERSIONS_FIELDS);
  });

  it("03 §1.4 示例 source_error 字段齐全", () => {
    expectSameSet(keys(sourceErrorSchema), SOURCE_ERROR_FIELDS);
  });

  it("03 §1.4 示例 transforms / location 字段齐全", () => {
    expectSameSet(keys(transformItemSchema), TRANSFORM_FIELDS);
    expectSameSet(keys(errorLocationSchema), LOCATION_FIELDS);
  });
});
