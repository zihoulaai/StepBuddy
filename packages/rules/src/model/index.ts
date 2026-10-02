/**
 * 关系层建模入口（Task 3）：题面文本 → 四角色关系模型 / MODEL_FAILED。
 *
 * 编排（计划 §2.5）：extract（句型抽取）→ 规则按 SUMDIFF→MULTIPLE→TOTAL→NORMALIZE
 * 尝试（组合句的 relation 叠加在规则内部完成）→ synthesize（设元 + 方程 + 结构校验）。
 *
 * 纯函数：同输入同输出（M-6 规则层一致率 100% 由函数性天然保证）。
 * 中间结构 Extraction 即 Task 6 LLM 结构化的交换格式——LLM 产出同样结构后
 * 走同一 applyRules 判定层。
 */

import { extract } from "./extract.js";
import { MULTIPLE_RATIO, MULTIPLE_TIMES } from "./rules/multiple.js";
import { NORMALIZE_UNIT } from "./rules/normalize.js";
import { SUMDIFF_DIFF, SUMDIFF_SUM } from "./rules/sumdiff.js";
import { TOTAL_TOTAL } from "./rules/total.js";
import { synthesize } from "./synthesize.js";
import type { Extraction, ModelResult, ModelRule } from "./types.js";

/** 规则表：编排顺序即尝试顺序（02 §5 每族 2–4 条，MVP 合计 6 条） */
export const ALL_MODEL_RULES: readonly ModelRule[] = [
  SUMDIFF_SUM,
  SUMDIFF_DIFF,
  MULTIPLE_TIMES,
  MULTIPLE_RATIO,
  TOTAL_TOTAL,
  NORMALIZE_UNIT,
];

/** 中性结构 → 关系模型（Task 6 复用点：LLM 产出 Extraction 后走同一判定） */
export function applyRules(extraction: Extraction): ModelResult {
  if (extraction.clauses.length === 0) {
    return { code: "MODEL_FAILED", reason: "未命中任何已知句型（01 §5：关系无法建模，不静默错判）" };
  }
  for (const rule of ALL_MODEL_RULES) {
    const draft = rule.apply(extraction);
    if (draft) {
      return synthesize(draft);
    }
  }
  return {
    code: "MODEL_FAILED",
    reason: "抽取到关系子句但两族规则均不适用（已知量不足或句型超出 MVP 覆盖）",
  };
}

/** 题面文本 → 关系层模型（四角色关系 + 设元 + 规范方程） */
export function modelQuestion(text: string): ModelResult {
  return applyRules(extract(text));
}

export { extract } from "./extract.js";
export { synthesize } from "./synthesize.js";
export {
  COMPARISON_RELATIONS,
  VARIABLE_NAME,
  type ComparisonClause,
  type ComparisonRelation,
  type ExtractedEntity,
  type ExtractedQuantity,
  type Extraction,
  type ModelEntity,
  type ModelRelation,
  type ModelResult,
  type ModelRule,
  type ModelingError,
  type RelationModel,
  type RuleDraft,
} from "./types.js";
export { MULTIPLE_RATIO, MULTIPLE_TIMES } from "./rules/multiple.js";
export { NORMALIZE_UNIT } from "./rules/normalize.js";
export { SUMDIFF_DIFF, SUMDIFF_SUM } from "./rules/sumdiff.js";
export { TOTAL_TOTAL } from "./rules/total.js";
