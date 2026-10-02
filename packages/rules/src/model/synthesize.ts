/**
 * 设元与方程合成（计划 §2.4）：规则草稿 → 关系层模型。
 *
 * - 关系 id 统一编号（r1、r2…）；
 * - 实体转 IR entity 形状（value {num,den} 数对、dimension 量纲串，对齐 contracts entityItemSchema）；
 * - 结构校验：设元实体必须未知、方程必含设元变量、目标必在关系图中、reference≠target——
 *   任一不满足显式 MODEL_FAILED（01 §5，不静默错判）。
 *
 * 不解题：方程止于「设元 + 列方程」的单一规范形式；求解与解题空间展开是 Task 4，
 * 步骤级判定是 Task 5。方程是关系层展示结构——01 §3.3 文法无等号产生式，
 * 不作为 DSL 表达式解析（左右两侧可分别 parse）。
 */

import { unitDimension, type Dimension } from "../dimension.js";
import type { ExtractedEntity, ModelEntity, ModelingError, RelationModel, RuleDraft } from "./types.js";
import { VARIABLE_NAME } from "./types.js";

export function synthesize(draft: RuleDraft): RelationModel | ModelingError {
  const variableEntity = draft.entities.find((entity) => entity.name === draft.variable);
  if (!variableEntity) {
    return { code: "MODEL_FAILED", reason: `设元实体「${draft.variable}」不在实体表中` };
  }
  if (variableEntity.role !== "unknown") {
    return {
      code: "MODEL_FAILED",
      reason: `设元实体「${draft.variable}」不是未知量（单位「1」选取失败，01 §4.4 定位关系层）`,
    };
  }
  if (draft.targets.length === 0) {
    return { code: "MODEL_FAILED", reason: "无求解目标（题面未出现「求X」类问句）" };
  }
  const roles = new Set(draft.relations.flatMap((relation) => [relation.subject, relation.reference]));
  for (const target of draft.targets) {
    if (!roles.has(target)) {
      return {
        code: "MODEL_FAILED",
        reason: `目标「${target}」不在任何关系中（求非所建，01 §4.4 定位关系层）`,
      };
    }
  }
  if (!draft.equation.includes(VARIABLE_NAME)) {
    return { code: "MODEL_FAILED", reason: "规范方程未含设元变量（数量关系不足以列方程）" };
  }
  for (const relation of draft.relations) {
    if (relation.reference === relation.target) {
      return {
        code: "MODEL_FAILED",
        reason: `关系 ${relation.predicate} 的 reference 与 target 为同一实体（01 §3.1 约束）`,
      };
    }
  }

  const entities = draft.entities.map(toModelEntity);
  const fractional = entities.some((entity) => entity.value !== undefined && entity.value.den !== 1);
  return {
    entities,
    relations: draft.relations.map((relation, index) => ({ ...relation, id: `r${index + 1}` })),
    target: { entityId: draft.targets[0], answerForm: fractional ? "fraction" : "integer" },
    targets: draft.targets,
    equation: draft.equation,
    appliedRules: [draft.ruleId],
  };
}

/** 抽取实体 → IR entity（id 用实体名；value 为 JSON 安全数对，MVP 量级内 Number 无损） */
function toModelEntity(entity: ExtractedEntity): ModelEntity {
  const model: ModelEntity = { id: entity.name, role: entity.role, name: entity.name };
  if (entity.quantity) {
    model.value = {
      num: Number(entity.quantity.value.num),
      den: Number(entity.quantity.value.den),
    };
    if (entity.quantity.unit) {
      model.unit = entity.quantity.unit;
      model.dimension = dimensionLabel(unitDimension(entity.quantity.unit));
    }
  }
  return model;
}

/** 量纲串：单单位 → 单位名；复合 → 「米/秒」；指数 >1 → 「平方米^2」风格 */
function dimensionLabel(dimension: Dimension): string {
  const numerator: string[] = [];
  const denominator: string[] = [];
  for (const [unit, exponent] of [...dimension.exponents].sort(([a], [b]) => a.localeCompare(b))) {
    const magnitude = exponent < 0n ? -exponent : exponent;
    const label = magnitude === 1n ? unit : `${unit}^${magnitude}`;
    (exponent > 0n ? numerator : denominator).push(label);
  }
  return denominator.length > 0 ? `${numerator.join("×")}/${denominator.join("×")}` : numerator.join("×");
}
