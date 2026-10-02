/**
 * TOTAL 族规则（归总）——02 §3.2 G3、02 §5、02 §131。
 *
 * 归总读法（contracts）：share 的 subject = reference × target，即
 * 总量 = 每份量 × 份数。单位「1」选取：每份量（reference）。
 * 验收用例编号：TOTAL-01…，编号与用例见 test/model/total.test.ts。
 */

import type { ModelRule, RuleDraft } from "../types.js";
import { VARIABLE_NAME } from "../types.js";
import { uniqueClause } from "./shared.js";

/**
 * REL.MODEL.TOTAL.TOTAL——每份量 + 份数 → 总量。
 * 每盒5个，8盒一共多少个 → x=5×8。
 */
export const TOTAL_TOTAL: ModelRule = {
  id: "REL.MODEL.TOTAL.TOTAL",
  family: "TOTAL",
  apply(extraction): RuleDraft | null {
    const per = uniqueClause(extraction, (clause) => clause.relation === "per_unit");
    const count = uniqueClause(extraction, (clause) => clause.relation === "per_count");
    if (!per || !count || per.quantity === undefined || count.quantity === undefined) {
      return null;
    }
    // 每份单位与所求总量单位必须一致（「每盒5个，8盒一共多少千克」不可建模）
    if (per.unit !== count.unit) {
      return null;
    }
    if (!extraction.targets.includes("总量")) {
      return null;
    }
    return {
      ruleId: TOTAL_TOTAL.id,
      relations: [
        { predicate: "share", subject: "总量", reference: "每份量", target: "份数", operator: "×" },
      ],
      entities: extraction.entities,
      variable: "总量",
      equation: `${VARIABLE_NAME}=${per.quantity}×${count.quantity}`,
      targets: extraction.targets,
    };
  },
};
