/**
 * MULTIPLE 族规则（倍数问题）——02 §3.2 G2、02 §5、02 §131。
 *
 * 单位「1」恒为被比者（reference）：「甲是乙的3倍」的单位「1」是乙（02 §3.2 缺失项）。
 * 方向判定全部写法：
 * - 是n倍：A = B × n；是p/q：A = B × p/q；
 * - 比…多n倍：A = B × (n+1)（与「是n倍」区分，confusable_terms 记原句）；
 * - 比…多p/q：A = B × (1+p/q)；比…少p/q：A = B × (1−p/q)；
 * - 比…的n倍多/少M：叠加 times + diff 两条关系（diff 的比较对象是派生量「B的n倍」）。
 * 验收用例编号：TIMES-01…（MULTIPLE.TIMES）、RATIO-01…（MULTIPLE.RATIO），
 * 编号与用例见 test/model/multiple.test.ts。
 */

import { Rational } from "../../rational.js";
import type { ComparisonClause, Extraction, ModelRule, RuleDraft } from "../types.js";
import { VARIABLE_NAME } from "../types.js";
import {
  coefficientText,
  knownEntity,
  samePair,
  unknownEntity,
  unitsAgree,
  uniqueClause,
  withEntities,
} from "./shared.js";

const TIMES_MATCH = (clause: ComparisonClause): boolean =>
  clause.relation === "times" || clause.relation === "times_more" || clause.relation === "combo_more" || clause.relation === "combo_less";

const RATIO_MATCH = (clause: ComparisonClause): boolean =>
  clause.relation === "fraction" || clause.relation === "fraction_more" || clause.relation === "fraction_less";

/** 倍数系数（Rational 精确值，禁浮点） */
function coefficientOf(clause: ComparisonClause): Rational | null {
  const quantity = clause.quantity;
  if (quantity === undefined) {
    return null;
  }
  switch (clause.relation) {
    case "times":
    case "fraction":
      return quantity;
    case "times_more":
    case "fraction_more":
      return quantity.add(Rational.fromInteger(1n));
    case "fraction_less":
      return Rational.fromInteger(1n).sub(quantity);
    case "combo_more":
    case "combo_less":
      return quantity; // 组合句的倍数系数就是 n（差量单独成 diff 关系）
    default:
      return null;
  }
}

/** combo_* 是否多 M（true）/ 少 M（false） */
function comboIsMore(clause: ComparisonClause): boolean {
  return clause.relation === "combo_more";
}

/** 两族共用的判定主体：句型子句 × （和句 | 已知量）→ 设元 + 方程 */
function applyMultiple(
  extraction: Extraction,
  ruleId: string,
  match: (clause: ComparisonClause) => boolean,
): RuleDraft | null {
  const clause = uniqueClause(extraction, match);
  if (!clause || clause.quantity === undefined) {
    return null;
  }
  const coefficient = coefficientOf(clause);
  if (!coefficient) {
    return null;
  }
  const subject = clause.subjectName; // 主体（被描述/被比较的量）
  const reference = clause.referenceName; // 基准量：单位「1」所在

  // 方向易混写法记原句（「是n倍」无歧义不记）
  const confusable =
    clause.relation === "times_more" ||
    clause.relation === "fraction_more" ||
    clause.relation === "fraction_less" ||
    clause.relation === "combo_more" ||
    clause.relation === "combo_less"
      ? [clause.statement]
      : undefined;

  const relations: RuleDraft["relations"] = [
    { predicate: "times", subject, reference, target: "倍数", operator: "×", confusable_terms: confusable },
  ];
  const entities = [knownEntity("倍数", coefficient)];

  // 组合句：A 比 B的n倍多/少M → 叠加 diff（多M：A−B的n倍=M；少M：B的n倍−A=M）
  const isCombo = clause.relation === "combo_more" || clause.relation === "combo_less";
  if (isCombo) {
    const difference = clause.diffQuantity;
    if (difference === undefined) {
      return null;
    }
    const derived = `${reference}的${clause.quantity}倍`;
    relations.push({
      predicate: "diff",
      subject: comboIsMore(clause) ? subject : derived,
      reference: comboIsMore(clause) ? derived : subject,
      target: "差量",
      operator: "-",
      confusable_terms: [clause.statement],
    });
    entities.push(knownEntity("差量", difference, clause.unit), unknownEntity(derived));
  }

  const coefficientTerm = coefficientText(coefficient);

  // 分支一：和句（单位「1」未知 → 设 B 为 x）：coef·x(+x)=N，combo 再 ± M
  const sum = uniqueClause(extraction, (other) => other.relation === "sum");
  if (sum) {
    if (sum.quantity === undefined || !samePair(clause, sum) || !unitsAgree(sum.unit, clause.unit)) {
      return null;
    }
    const comparison = isCombo
      ? `(${coefficientTerm}${VARIABLE_NAME}${comboIsMore(clause) ? "+" : "-"}${clause.diffQuantity})`
      : `${coefficientTerm}${VARIABLE_NAME}`;
    relations.push({
      predicate: "sum",
      subject: sum.subjectName,
      reference: sum.referenceName,
      target: "总量",
      operator: "+",
    });
    return {
      ruleId,
      relations,
      entities: withEntities(
        extraction.entities,
        ...entities,
        knownEntity("总量", sum.quantity, sum.unit),
      ),
      variable: reference,
      equation: `${comparison}+${VARIABLE_NAME}=${sum.quantity}`,
      targets: extraction.targets,
    };
  }

  // 分支二：已知量直给一方。单位「1」已知 → 设主体为 x；主体已知 → 设 B 为 x
  const has = uniqueClause(extraction, (other) => other.relation === "has");
  if (has && has.quantity !== undefined && (has.subjectName === subject || has.subjectName === reference)) {
    if (!unitsAgree(clause.unit, has.unit)) {
      return null;
    }
    const knownValue = has.quantity;
    const knownIsReference = has.subjectName === reference;
    const variable = knownIsReference ? subject : reference;
    let equation: string;
    if (knownIsReference) {
      // A = coef×K（combo：A = coef×K ± M）
      equation = isCombo
        ? `${VARIABLE_NAME}=${coefficientTerm}×${knownValue}${comboIsMore(clause) ? "+" : "-"}${clause.diffQuantity}`
        : `${VARIABLE_NAME}=${coefficientTerm}×${knownValue}`;
    } else {
      // B = A÷coef（combo：B = (A ∓ M)÷coef）
      equation = isCombo
        ? `${VARIABLE_NAME}=(${knownValue}${comboIsMore(clause) ? "-" : "+"}${clause.diffQuantity})÷${coefficientTerm}`
        : `${VARIABLE_NAME}=${knownValue}÷${coefficientTerm}`;
    }
    return {
      ruleId,
      relations,
      entities: withEntities(extraction.entities, ...entities),
      variable,
      equation,
      targets: extraction.targets,
    };
  }
  return null;
}

/** REL.MODEL.MULTIPLE.TIMES——整数倍（是n倍 / 比…多n倍 / 比…的n倍多/少M） */
export const MULTIPLE_TIMES: ModelRule = {
  id: "REL.MODEL.MULTIPLE.TIMES",
  family: "MULTIPLE",
  apply: (extraction) => applyMultiple(extraction, MULTIPLE_TIMES.id, TIMES_MATCH),
};

/** REL.MODEL.MULTIPLE.RATIO——分数倍（是p/q / 比…多p/q / 比…少p/q；系数走 Rational，无浮点） */
export const MULTIPLE_RATIO: ModelRule = {
  id: "REL.MODEL.MULTIPLE.RATIO",
  family: "MULTIPLE",
  apply: (extraction) => applyMultiple(extraction, MULTIPLE_RATIO.id, RATIO_MATCH),
};
