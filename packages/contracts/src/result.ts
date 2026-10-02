import { z } from "zod";
import {
  EQUIVALENCE_LEVELS,
  ERROR_CLASSIFICATIONS,
  ERROR_ROLES,
  ERROR_SUBTYPES,
  FALLBACK_EXIT_CODES,
  STEP_STATUSES,
  VERDICTS,
} from "./enums.js";

/** 结果 schema 版本（03 §1 `schema_version` 当前值；版本管理单一出处） */
export const RESULT_SCHEMA_VERSION = "1.0.0";

/** 03 §1「IR schema、规则库、模型、模板四项版本」；键名照 §1.4 示例 */
export const versionsSchema = z.object({
  ir_schema_version: z.string(),
  rule_lib_version: z.string(),
  model_version: z.string(),
  prompt_template_version: z.string(),
});

/** 03 §1.1 transforms：命中的元规则；§1.4 示例 status 仅出现 violated，保持开放 */
export const transformItemSchema = z.object({
  rule_id: z.string(),
  status: z.string(),
  evidence: z.string().optional(),
});

/** 03 §1.2 location：出错片段与提示（§1.4 示例键名 span/hint） */
export const errorLocationSchema = z.object({
  span: z.string(),
  hint: z.string(),
});

/** 03 §1.2 错误明细字段表 */
export const errorDetailSchema = z.object({
  role: z.enum([...ERROR_ROLES]),
  classification: z.enum([...ERROR_CLASSIFICATIONS]),
  subtype: z.enum([...ERROR_SUBTYPES]).optional(),
  rule_id: z.string().optional(),
  location: errorLocationSchema.optional(),
  reason: z.string(),
  // traceable=false 的原因不得出现在错误原因区（03 §1.2），该约束依赖此字段必填
  traceable: z.boolean(),
});

/** 03 §1.1 逐步结果字段表 */
export const stepResultSchema = z.object({
  index: z.number().int().positive(),
  status: z.enum([...STEP_STATUSES]),
  equivalence_level: z.enum([...EQUIVALENCE_LEVELS]).optional(),
  cost: z.number().optional(),
  transforms: z.array(transformItemSchema).optional(),
  error: errorDetailSchema.optional(),
});

/** 03 §1.4 示例形状 */
export const sourceErrorSchema = z.object({
  step_index: z.number().int().positive(),
  classification: z.enum([...ERROR_CLASSIFICATIONS]),
  rule_id: z.string().optional(),
  reason: z.string(),
});

/** 03 §1.3 退化标记字段表；exit_code 枚举来自 01 §5 九类 */
export const fallbackSchema = z.object({
  mode: z.string(),
  exit_code: z.enum([...FALLBACK_EXIT_CODES]),
  user_message: z.string(),
  partial_steps: z.number().int().nonnegative().optional(),
});

/** 03 §1 诊断结果结构字段表 */
export const diagnosisResultSchema = z.object({
  schema_version: z.string(),
  result_id: z.string(),
  versions: versionsSchema,
  verdict: z.enum([...VERDICTS]),
  confidence: z.number().min(0).max(1).optional(), // §1.4 示例字段
  steps: z.array(stepResultSchema),
  source_error: sourceErrorSchema.nullable(), // 正确时为 null
  fallback: fallbackSchema.optional(), // 退化模式时出现
  // §1「正确路径、跳步补全、路径建议」：字段名待规格补充，Task 6/7 落地时收紧形状
  teaching: z.record(z.string(), z.unknown()).optional(),
  // MVP 阶段可为空（03 §1）
  knowledge_points: z.array(z.string()),
});

export type DiagnosisResult = z.infer<typeof diagnosisResultSchema>;
export type StepResult = z.infer<typeof stepResultSchema>;
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type Fallback = z.infer<typeof fallbackSchema>;
export type ResultVersions = z.infer<typeof versionsSchema>;
