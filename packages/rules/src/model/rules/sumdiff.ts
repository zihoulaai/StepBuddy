/**
 * SUMDIFF 族规则（和差问题）——02 §3.2 G1、02 §5（每族 2–4 条）、02 §131 标识格式。
 *
 * 方向判定全部写法（02 §3.2 缺失项「基准量与比较量方向的判定」的机械化覆盖）：
 * - A比B多N / A比B少N / B比A多N / B比A少N / 分数差量（多p/q单位）；
 * - 「B比A少N」归一为大者在前（subject=大），差恒为正，见 normalizeDiff。
 * 验收用例编号：SUM-01…（SUMDIFF.SUM）、DIFF-01…（SUMDIFF.DIFF），
 * 编号与用例见 test/model/sumdiff.test.ts。
 */

import type { ModelRule, RuleDraft } from "../types.js";
import { VARIABLE_NAME } from "../types.js";
import {
  isDiffClause,
  knownEntity,
  normalizeDiff,
  samePair,
  unitsAgree,
  uniqueClause,
  withEntities,
} from "./shared.js";

/**
 * REL.MODEL.SUMDIFF.SUM——和句 + 差句/已知量。
 * 分支 A（和 + 差）：甲和乙一共80个，甲比乙多10个 → (x+10)+x=80；
 * 分支 B（和 + 已知量直给）：甲和乙一共80个，乙有20个 → x+20=80。
 */
export const SUMDIFF_SUM: ModelRule = {
  id: "REL.MODEL.SUMDIFF.SUM",
  family: "SUMDIFF",
  apply(extraction): RuleDraft | null {
    const sum = uniqueClause(extraction, (clause) => clause.relation === "sum");
    if (!sum || sum.quantity === undefined) {
      return null;
    }
    const total = sum.quantity;

    // 分支 A：和句 + 差句（同一对实体，单位一致）
    const diff = uniqueClause(extraction, isDiffClause);
    if (diff) {
      if (
        diff.quantity === undefined ||
        !samePair(sum, diff) ||
        !unitsAgree(sum.unit, diff.unit)
      ) {
        return null;
      }
      const { bigger, smaller } = normalizeDiff(diff);
      return {
        ruleId: SUMDIFF_SUM.id,
        relations: [
          {
            predicate: "sum",
            subject: sum.subjectName,
            reference: sum.referenceName,
            target: "总量",
            operator: "+",
          },
          {
            predicate: "diff",
            subject: bigger,
            reference: smaller,
            target: "差量",
            operator: "-",
            confusable_terms: [diff.statement],
          },
        ],
        entities: withEntities(
          extraction.entities,
          knownEntity("总量", total, sum.unit),
          knownEntity("差量", diff.quantity, diff.unit),
        ),
        variable: smaller,
        equation: `(${VARIABLE_NAME}+${diff.quantity})+${VARIABLE_NAME}=${total}`,
        targets: extraction.targets,
      };
    }

    // 分支 B：和句 + has 给对中某一个的值 → x+K=N
    const has = uniqueClause(extraction, (clause) => clause.relation === "has");
    if (
      has &&
      has.quantity !== undefined &&
      (has.subjectName === sum.subjectName || has.subjectName === sum.referenceName) &&
      unitsAgree(sum.unit, has.unit)
    ) {
      const knownName = has.subjectName;
      const unknownName = knownName === sum.subjectName ? sum.referenceName : sum.subjectName;
      return {
        ruleId: SUMDIFF_SUM.id,
        relations: [
          {
            predicate: "sum",
            subject: sum.subjectName,
            reference: sum.referenceName,
            target: "总量",
            operator: "+",
          },
        ],
        entities: withEntities(extraction.entities, knownEntity("总量", total, sum.unit)),
        variable: unknownName,
        equation: `${VARIABLE_NAME}+${has.quantity}=${total}`,
        targets: extraction.targets,
      };
    }
    return null;
  },
};

/**
 * REL.MODEL.SUMDIFF.DIFF——差句 + 已知量（无和句）。
 * 乙有20个，甲比乙多10个，求甲 → x=20+10。
 * 方程按**原句方向**（more → subject=reference+M；less → subject=reference−M）列，
 * 关系按归一化规范方向（大者在前）存，两者由 confusable_terms 锚定原句（Task 5 定位用）。
 */
export const SUMDIFF_DIFF: ModelRule = {
  id: "REL.MODEL.SUMDIFF.DIFF",
  family: "SUMDIFF",
  apply(extraction): RuleDraft | null {
    const diff = uniqueClause(extraction, isDiffClause);
    const has = uniqueClause(extraction, (clause) => clause.relation === "has");
    if (!diff || !has || diff.quantity === undefined || has.quantity === undefined) {
      return null;
    }
    if (has.subjectName !== diff.subjectName && has.subjectName !== diff.referenceName) {
      return null;
    }
    if (!unitsAgree(diff.unit, has.unit)) {
      return null;
    }
    const { bigger, smaller } = normalizeDiff(diff);
    const unknownName = has.subjectName === diff.subjectName ? diff.referenceName : diff.subjectName;
    // 未知量在原句中的角色决定 ±：more 且未知=subject → +；less 且未知=reference → +
    const plus = diff.relation === "more" || diff.relation === "more_fraction";
    const unknownIsSubject = unknownName === diff.subjectName;
    const sign = plus === unknownIsSubject ? "+" : "-";
    return {
      ruleId: SUMDIFF_DIFF.id,
      relations: [
        {
          predicate: "diff",
          subject: bigger,
          reference: smaller,
          target: "差量",
          operator: "-",
          confusable_terms: [diff.statement],
        },
      ],
      entities: withEntities(
        extraction.entities,
        knownEntity("差量", diff.quantity, diff.unit),
      ),
      variable: unknownName,
      equation: `${VARIABLE_NAME}=${has.quantity}${sign}${diff.quantity}`,
      targets: extraction.targets,
    };
  },
};
