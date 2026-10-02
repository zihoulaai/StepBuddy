/**
 * 规则层公共判定工具（中性结构 → 四角色关系的复用件）。
 * 规则本身只做家族句型匹配，不含任何抽取逻辑（两层分离，Task 6 LLM 结构化后
 * 走同一判定层）。
 */

import type { Rational } from "../../rational.js";
import type { ComparisonClause, ExtractedEntity, Extraction } from "../types.js";

/** 唯一命中子句：0 个或多个同类子句均视为歧义/不适用，返回 null */
export function uniqueClause(
  extraction: Extraction,
  match: (clause: ComparisonClause) => boolean,
): ComparisonClause | null {
  const hits = extraction.clauses.filter(match);
  return hits.length === 1 ? hits[0] : null;
}

/** 差句族（和差问题的比较关系；组合句走 MULTIPLE，不算差句） */
export function isDiffClause(clause: ComparisonClause): boolean {
  return (
    clause.relation === "more" ||
    clause.relation === "less" ||
    clause.relation === "more_fraction" ||
    clause.relation === "less_fraction"
  );
}

/**
 * 差句归一化规范方向（contracts 读法约定：subject − reference = target，差恒为正）。
 * 「A比B多N」→ 大者=A；「A比B少N」→ 大者=B（B比A少N 归一为大者在前）。
 */
export function normalizeDiff(clause: ComparisonClause): { bigger: string; smaller: string } {
  return clause.relation === "less" || clause.relation === "less_fraction"
    ? { bigger: clause.referenceName, smaller: clause.subjectName }
    : { bigger: clause.subjectName, smaller: clause.referenceName };
}

/** 两个子句是否描述同一对实体（顺序无关） */
export function samePair(a: ComparisonClause, b: ComparisonClause): boolean {
  return (
    (a.subjectName === b.subjectName && a.referenceName === b.referenceName) ||
    (a.subjectName === b.referenceName && a.referenceName === b.subjectName)
  );
}

/** 已知量实体（规则补入的规范量：总量/差量/倍数/已知份数…） */
export function knownEntity(name: string, value: Rational, unit?: string): ExtractedEntity {
  return { name, role: "known", quantity: { value, unit } };
}

/** 未知量实体（规则补入的规范量：每份量/份数…） */
export function unknownEntity(name: string): ExtractedEntity {
  return { name, role: "unknown" };
}

/** 追加/覆盖实体（同名以新实体为准；保持原顺序stable） */
export function withEntities(
  entities: ExtractedEntity[],
  ...added: ExtractedEntity[]
): ExtractedEntity[] {
  const result = [...entities];
  for (const entity of added) {
    const index = result.findIndex((existing) => existing.name === entity.name);
    if (index >= 0) {
      result[index] = entity;
    } else {
      result.push(entity);
    }
  }
  return result;
}

/** 单位一致性：双方都有单位时必须相同（一方缺省放过） */
export function unitsAgree(a?: string, b?: string): boolean {
  return a === undefined || b === undefined || a === b;
}

/** 系数渲染：整数 → "3"；分数 → "(3/4)"（规范方程字符串用） */
export function coefficientText(value: Rational): string {
  return value.isInteger() ? value.toString() : `(${value})`;
}
