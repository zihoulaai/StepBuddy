import { describe, expect, it } from "vitest";
import { COMPARISON_RELATIONS, Rational } from "@stepbuddy/rules";
import {
  EXTRACTION_RELATIONS,
  extractionSchema,
  toExtraction,
} from "../../src/llm/index.js";

/** MODELED 标准题「甲和乙一共80个，甲比乙多10个，求甲和乙」的 golden Extraction */
const VALID_DTO = {
  entities: [
    { name: "甲", role: "unknown" },
    { name: "乙", role: "unknown" },
    { name: "总量", role: "known", quantity: { num: 80, den: 1 }, unit: "个" },
  ],
  clauses: [
    {
      subjectName: "甲",
      referenceName: "乙",
      relation: "more",
      quantity: { num: 10, den: 1 },
      unit: "个",
      statement: "甲比乙多10个",
    },
    {
      subjectName: "甲",
      referenceName: "乙",
      relation: "sum",
      quantity: { num: 80, den: 1 },
      unit: "个",
      statement: "甲和乙一共80个",
    },
  ],
  targets: ["甲", "乙"],
};

describe("schema：LLM 产出的 zod 校验与 Rational 转换", () => {
  it("SCH-01 合法 DTO 通过校验并转出精确 Rational（含分数 1/2）", () => {
    const result = extractionSchema.safeParse(VALID_DTO);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const extraction = toExtraction(result.data);
    expect(extraction.targets).toEqual(["甲", "乙"]);
    expect(extraction.clauses).toHaveLength(2);
    const more = extraction.clauses[0];
    expect(more.relation).toBe("more");
    // clause.quantity 直接是 Rational（types.ts L79）
    expect(more.quantity!.equals(Rational.of(10n, 1n))).toBe(true);
    // entity.quantity 是 {value, unit?} 包装（types.ts L20）
    const total = extraction.entities[2];
    expect(total.quantity!.value.equals(Rational.of(80n, 1n))).toBe(true);

    // 分数：{num:1,den:2} → 精确 1/2（不走浮点）
    const fractional = extractionSchema.safeParse({
      entities: [],
      clauses: [
        {
          subjectName: "甲",
          referenceName: "乙",
          relation: "fraction",
          quantity: { num: 1, den: 2 },
          statement: "甲是乙的1/2",
        },
      ],
      targets: [],
    });
    expect(fractional.success).toBe(true);
    if (fractional.success) {
      // clause.quantity 直接是 Rational
      expect(toExtraction(fractional.data).clauses[0].quantity!.equals(Rational.of(1n, 2n))).toBe(true);
    }
  });

  it("SCH-02 缺 clauses / entities 非数组 → 校验失败（不进规则层）", () => {
    expect(extractionSchema.safeParse({ entities: [], targets: [] }).success).toBe(false);
    expect(extractionSchema.safeParse({ ...VALID_DTO, entities: "甲" }).success).toBe(false);
  });

  it("SCH-03 relation 非法值 → 校验失败（枚举封闭，禁 LLM 自造句型）", () => {
    const bad = {
      ...VALID_DTO,
      clauses: [{ ...VALID_DTO.clauses[0], relation: "many_times_plus" }],
    };
    expect(extractionSchema.safeParse(bad).success).toBe(false);
  });

  it("SCH-04 句型镜像与 rules ComparisonRelation 一致（rules 增删句型须同步 schema.ts）", () => {
    // rules 只导出比较类子集（11 值）；镜像 = 子集 + sum/per 三分支/has，须完全包含子集
    for (const relation of COMPARISON_RELATIONS) {
      expect(EXTRACTION_RELATIONS).toContain(relation);
    }
    expect(EXTRACTION_RELATIONS).toContain("has");
    expect(EXTRACTION_RELATIONS).toContain("sum");
  });

  it("SCH-05 多余键 strip（LLM 多产字段显式忽略）；den=0 拒绝（01 §3.3 除零无效）", () => {
    const extra = { ...VALID_DTO, remark: "LLM 多产的解释字段" };
    const result = extractionSchema.safeParse(extra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("remark" in result.data).toBe(false);
    }
    const zero = {
      entities: [],
      clauses: [{ ...VALID_DTO.clauses[0], quantity: { num: 5, den: 0 } }],
      targets: [],
    };
    expect(extractionSchema.safeParse(zero).success).toBe(false);
  });
});
