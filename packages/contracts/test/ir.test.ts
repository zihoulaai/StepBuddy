import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IR_SCHEMA_VERSION, questionIRSchema } from "../src/ir.js";

// 原文照抄 docs/specs/01 §3.5 示例，作为校验基准
const example = JSON.parse(
  readFileSync(new URL("../examples/ir-example.json", import.meta.url), "utf8"),
);

describe("questionIRSchema", () => {
  it("校验 01 §3.5 示例 JSON 通过", () => {
    expect(questionIRSchema.safeParse(example).success).toBe(true);
  });

  it("反例：question_type 不在 02 §1 题型枚举内", () => {
    expect(questionIRSchema.safeParse({ ...example, question_type: "algebra_ii" }).success).toBe(
      false,
    );
  });

  it("反例：grade_band 非法", () => {
    expect(questionIRSchema.safeParse({ ...example, grade_band: "G7" }).success).toBe(false);
  });

  it("反例：split_checked 非 boolean（违反 01 §3.2 类型）", () => {
    const steps = [{ ...example.steps[0], split_checked: "true" }];
    expect(questionIRSchema.safeParse({ ...example, steps }).success).toBe(false);
  });

  it("反例：source 不在 photo/manual 枚举内", () => {
    const steps = [{ ...example.steps[0], source: "scan" }];
    expect(questionIRSchema.safeParse({ ...example, steps }).success).toBe(false);
  });

  it("反例：relation 非数组（01 §3.1 类型为 array）", () => {
    expect(questionIRSchema.safeParse({ ...example, relation: "x>y" }).success).toBe(false);
  });

  it("relation 元素四角色齐全通过（Task 3 建模规则族结构）", () => {
    const relation = [
      { id: "r1", predicate: "diff", subject: "a", reference: "b", target: "d", operator: "-" },
      {
        id: "r2",
        predicate: "times",
        subject: "a",
        reference: "b",
        target: "m",
        operator: "×",
        confusable_terms: ["比…多3倍"],
      },
    ];
    expect(questionIRSchema.safeParse({ ...example, relation }).success).toBe(true);
  });

  it("反例：relation 元素缺 reference（四角色不全）", () => {
    const relation = [{ id: "r1", predicate: "diff", subject: "a", target: "d", operator: "-" }];
    expect(questionIRSchema.safeParse({ ...example, relation }).success).toBe(false);
  });

  it("反例：relation 元素 predicate 越界（MVP 取值 sum/diff/times/share）", () => {
    const relation = [
      { id: "r1", predicate: "formula", subject: "a", reference: "b", target: "d", operator: "-" },
    ];
    expect(questionIRSchema.safeParse({ ...example, relation }).success).toBe(false);
  });

  it("反例：relation 元素为开放 record（元素形状不允许透传任意键）", () => {
    const relation = [{ foo: "bar" }];
    expect(questionIRSchema.safeParse({ ...example, relation }).success).toBe(false);
  });

  it("反例：relation 元素 reference 与 target 同一实体", () => {
    const relation = [
      { id: "r1", predicate: "diff", subject: "a", reference: "b", target: "b", operator: "-" },
    ];
    expect(questionIRSchema.safeParse({ ...example, relation }).success).toBe(false);
  });

  it("IR_SCHEMA_VERSION 与示例 schema_version 一致（1.0.0）", () => {
    expect(IR_SCHEMA_VERSION).toBe(example.schema_version);
  });
});
