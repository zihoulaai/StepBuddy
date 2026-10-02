/**
 * NORMALIZE 族规则（归一/归总）——02 §3.2 G4、02 §5、02 §131。
 *
 * 读法（contracts）：share 的 subject = reference ÷ target（归一）或 × target（归总）。
 * 单位「1」选取（02 §3.2 缺失项）：每份量——先由「已知总量 ÷ 已知份数」归一，
 * 再按所求方向组合。三个方向互斥，按题面问句判别：
 * - 求总量：已知总量 + 已知份数 + 所求份数 → x=(T÷C1)×C2；
 * - 求每份：已知总量 + 已知份数 → x=T÷C1；
 * - 求份数：已知总量 + 每份量 → x=T÷每份量。
 * 验收用例编号：NORM-01…，编号与用例见 test/model/normalize.test.ts。
 */

import type { ModelRule, RuleDraft } from "../types.js";
import { VARIABLE_NAME } from "../types.js";
import { knownEntity, unknownEntity, unitsAgree, uniqueClause, withEntities } from "./shared.js";

/**
 * REL.MODEL.NORMALIZE.UNIT——由「总量-份数」对推导其余量。
 */
export const NORMALIZE_UNIT: ModelRule = {
  id: "REL.MODEL.NORMALIZE.UNIT",
  family: "NORMALIZE",
  apply(extraction): RuleDraft | null {
    const total = uniqueClause(extraction, (clause) => clause.relation === "per_total");
    if (!total || total.quantity === undefined || total.diffQuantity === undefined) {
      return null;
    }
    const totalValue = total.quantity; // 已知总量
    const knownCount = total.diffQuantity; // 已知份数
    const base = withEntities(extraction.entities, knownEntity("已知份数", knownCount));

    // 方向一：求总量（先归一得每份量，再按所求份数归总）
    const count = uniqueClause(extraction, (clause) => clause.relation === "per_count");
    if (count) {
      if (
        count.quantity === undefined ||
        !extraction.targets.includes("总量") ||
        !unitsAgree(total.unit, count.unit)
      ) {
        return null;
      }
      return {
        ruleId: NORMALIZE_UNIT.id,
        relations: [
          { predicate: "share", subject: "每份量", reference: "已知总量", target: "已知份数", operator: "÷" },
          { predicate: "share", subject: "总量", reference: "每份量", target: "份数", operator: "×" },
        ],
        entities: withEntities(base, unknownEntity("每份量")),
        variable: "总量",
        equation: `${VARIABLE_NAME}=(${totalValue}÷${knownCount})×${count.quantity}`,
        targets: extraction.targets,
      };
    }

    // 方向二：求份数（份数 = 已知总量 ÷ 每份量）
    const per = uniqueClause(extraction, (clause) => clause.relation === "per_unit");
    if (per) {
      if (
        per.quantity === undefined ||
        !extraction.targets.includes("份数") ||
        !unitsAgree(total.unit, per.unit)
      ) {
        return null;
      }
      return {
        ruleId: NORMALIZE_UNIT.id,
        relations: [
          { predicate: "share", subject: "份数", reference: "已知总量", target: "每份量", operator: "÷" },
        ],
        entities: base,
        variable: "份数",
        equation: `${VARIABLE_NAME}=${totalValue}÷${per.quantity}`,
        targets: extraction.targets,
      };
    }

    // 方向三：求每份（每份量 = 已知总量 ÷ 已知份数）
    if (!extraction.targets.includes("每份量")) {
      return null;
    }
    return {
      ruleId: NORMALIZE_UNIT.id,
      relations: [
        { predicate: "share", subject: "每份量", reference: "已知总量", target: "已知份数", operator: "÷" },
      ],
      entities: base,
      variable: "每份量",
      equation: `${VARIABLE_NAME}=${totalValue}÷${knownCount}`,
      targets: extraction.targets,
    };
  },
};
