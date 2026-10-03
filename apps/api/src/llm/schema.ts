/**
 * LLM 结构化产出的 zod 校验（Task 6.1：自然语言 → Extraction）。
 *
 * 规格依据：
 * - rules model/index.ts 头注：LLM 产出同构 Extraction 后走同一 applyRules 判定层（D3）；
 * - contracts/ir.ts L32：四角色必填（缺任一角色视为结构化失败）由 rules synthesize 承担，
 *   本 schema 只校验形状、枚举与数量结构；
 * - 01 §3.3：除数为 0 即无效状态——den 必须为正整数；
 * - 归档 04 §8.2：锁定的确定性要求——不做语义修复（修复即猜测），校验不过即重发/降级。
 */

import { z } from "zod";
import { Rational } from "@stepbuddy/rules";
import type { ExtractedEntity, Extraction } from "@stepbuddy/rules";

/** {num,den} 平面数量：LLM JSON 形状（Rational 为 class 不可序列化，01 §3.3 精确有理数） */
const quantitySchema = z.object({
  num: z.number().int(),
  den: z.number().int().positive(), // 除数为 0 的结构在校验期即拒绝
});

/**
 * 句型枚举镜像 rules ComparisonRelation（16 值）。
 * rules 增删句型时须同步本数组——SCH-04 测试守卫「镜像 ⊇ COMPARISON_RELATIONS」。
 */
export const EXTRACTION_RELATIONS = [
  "more",
  "less",
  "more_fraction",
  "less_fraction",
  "times",
  "times_more",
  "fraction",
  "fraction_more",
  "fraction_less",
  "combo_more",
  "combo_less",
  "sum",
  "per_unit",
  "per_count",
  "per_total",
  "has",
] as const;

export const entitySchema = z.object({
  name: z.string().min(1),
  role: z.enum(["known", "unknown"]),
  quantity: quantitySchema.optional(),
  unit: z.string().optional(),
});

export const clauseSchema = z.object({
  subjectName: z.string().min(1),
  referenceName: z.string().min(1),
  relation: z.enum(EXTRACTION_RELATIONS),
  quantity: quantitySchema.optional(),
  diffQuantity: quantitySchema.optional(),
  unit: z.string().optional(),
  statement: z.string().min(1),
});

/** Extraction 交换格式的 DTO schema；zod 默认 strip 多余键（LLM 多产字段显式忽略，不因此失败） */
export const extractionSchema = z.object({
  entities: z.array(entitySchema),
  clauses: z.array(clauseSchema),
  targets: z.array(z.string()),
});

export type ExtractionDto = z.infer<typeof extractionSchema>;

/** DTO → rules Extraction（{num,den} → Rational；只转换校验合格的结构） */
export function toExtraction(dto: ExtractionDto): Extraction {
  const entities: ExtractedEntity[] = dto.entities.map((entity) => ({
    name: entity.name,
    role: entity.role,
    ...(entity.quantity !== undefined
      ? { quantity: { value: Rational.of(BigInt(entity.quantity.num), BigInt(entity.quantity.den)) } }
      : {}),
    ...(entity.unit !== undefined ? { unit: entity.unit } : {}),
  }));
  return {
    entities,
    clauses: dto.clauses.map((clause) => ({
      subjectName: clause.subjectName,
      referenceName: clause.referenceName,
      relation: clause.relation,
      ...(clause.quantity !== undefined
        ? { quantity: Rational.of(BigInt(clause.quantity.num), BigInt(clause.quantity.den)) }
        : {}),
      ...(clause.diffQuantity !== undefined
        ? { diffQuantity: Rational.of(BigInt(clause.diffQuantity.num), BigInt(clause.diffQuantity.den)) }
        : {}),
      ...(clause.unit !== undefined ? { unit: clause.unit } : {}),
      statement: clause.statement,
    })),
    targets: dto.targets,
  };
}
