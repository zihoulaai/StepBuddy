import { z } from "zod";
import { GRADE_BANDS, QUESTION_TYPES, STEP_SOURCES } from "./enums.js";

/** IR schema 版本（01 §3.1 `schema_version` 当前值；版本管理单一出处） */
export const IR_SCHEMA_VERSION = "1.0.0";

/** 01 §3.5 示例中的数值表示 { num, den } */
const rationalValueSchema = z.object({
  num: z.number().int(),
  den: z.number().int().positive(),
});

/** 01 §3.1「已知量、未知量、单位、量纲」；形状照 01 §3.5 示例 */
const entityItemSchema = z.object({
  id: z.string(),
  role: z.enum(["known", "unknown"]),
  name: z.string(),
  value: rationalValueSchema.optional(),
  unit: z.string().optional(),
  dimension: z.string().optional(),
});

export const entitySchema = z.object({
  entities: z.array(entityItemSchema),
});

/**
 * 01 §3.1 relation 元素结构（题型建模规则族定义，Task 3 落地）。
 * 形状兼容归档 v2-full-scope 01-ir-schema §2.4 的参考形状（归档仅供回溯、非当前口径），
 * 谓词取 MVP 应用题两族所需最小集，ratio/formula 待完整版扩展。
 *
 * 四角色必填（缺任一角色视为结构化失败，Task 6 LLM 产出同样校验）：
 * subject=主体（被描述/被比较的量）、reference=基准量（「比」的被比者，单位「1」所在）、
 * target=比较量（关系指向的结果量：差量/总量/倍数/份数）、operator=运算关系。
 * 读法约定（机械化、无歧义）：
 * - sum：subject + reference = target（和）
 * - diff：subject - reference = target（差；建模时按多/少归一为规范方向）
 * - times：subject = reference × target（倍数；单位「1」= reference）
 * - share：subject = reference × target（归总）或 subject = reference ÷ target（归一）
 */
export const relationItemSchema = z
  .object({
    id: z.string(),
    predicate: z.enum(["sum", "diff", "times", "share"]),
    subject: z.string(),
    reference: z.string(),
    target: z.string(),
    operator: z.enum(["+", "-", "×", "÷"]),
    confusable_terms: z.array(z.string()).optional(),
  })
  .refine((relation) => relation.reference !== relation.target, {
    message: "reference 与 target 不可为同一实体（01 §3.1 relation 约束）",
  });

export type Relation = z.infer<typeof relationItemSchema>;

/** 01 §3.1「求解目标与结果形式」；§3.5 示例值 type="value"、answer_form="fraction" */
export const targetSchema = z.object({
  type: z.string(),
  answer_form: z.string(),
});

/**
 * 01 §3.1「简便运算、保留小数、最简分数等要求」。
 * 已知键来自 §3.1 表述与 §3.3 容差定义；「等」保持开放（passthrough）。
 */
export const constraintSchema = z
  .object({
    require_simplest_form: z.boolean().optional(),
    require_decimal_places: z.number().int().optional(),
    require_estimation: z.boolean().optional(),
  })
  .passthrough();

/** 01 §3.1：知识点与规则标签，只能由规则引擎写入 */
export const tagsSchema = z.record(z.string(), z.unknown());

/** 01 §3.2 步骤结构字段表，八字段逐项严格定义 */
export const stepIRSchema = z.object({
  index: z.number().int().positive(),
  raw_text: z.string(),
  expr_before: z.string(),
  expr_after: z.string(),
  split_checked: z.boolean(),
  source: z.enum([...STEP_SOURCES]),
  answer_only: z.boolean(),
});

/**
 * 01 §3.1 题目结构字段表。
 * relation 纯计算题可为空（§3.1），示例即省略，故 optional；
 * 元素结构 relationItemSchema 由 Task 3 建模规则族定义（见上）。
 * tags 由规则引擎写入，存在前可缺省（§3.5 示例即省略）。
 */
export const questionIRSchema = z.object({
  schema_version: z.string(),
  question_type: z.enum([...QUESTION_TYPES]),
  grade_band: z.enum([...GRADE_BANDS]),
  entity: entitySchema,
  relation: z.array(relationItemSchema).optional(),
  target: targetSchema,
  constraint: constraintSchema,
  tags: tagsSchema.optional(),
  // 01 §3.5 示例将步骤数组内嵌于题目 IR
  steps: z.array(stepIRSchema),
});

export type StepIR = z.infer<typeof stepIRSchema>;
export type QuestionIR = z.infer<typeof questionIRSchema>;
