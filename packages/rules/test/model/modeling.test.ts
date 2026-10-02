import { describe, expect, it } from "vitest";
import { ALL_MODEL_RULES, applyRules, extract, modelQuestion, synthesize } from "../../src/model/index.js";
import type { RelationModel, RuleDraft } from "../../src/model/index.js";

/**
 * 端到端 24 题（两族混合）：18 题期望建模成功（模型与人工推导一致）、
 * 6 题期望显式 MODEL_FAILED——作为 MVP「建模成功率 ≥80%」的本地样本代理
 * （18/24 = 75% 仅抽样口径；评测集 150 题、M-3b ≥92% 实测以 Task 9 运行器为准）。
 *
 * 纯函数快照断言：同输入同输出（M-6 规则层一致率 100%）。
 */

type Case = { text: string; rule: string; equation: string };

const MODELED: Case[] = [
  // 和差倍族（12）
  { text: "甲和乙一共80个，甲比乙多10个，求甲和乙", rule: "REL.MODEL.SUMDIFF.SUM", equation: "(x+10)+x=80" },
  { text: "甲和乙一共80个，甲比乙少10个，求甲和乙", rule: "REL.MODEL.SUMDIFF.SUM", equation: "(x+10)+x=80" },
  { text: "苹果和橘子一共30个，苹果比橘子多4个，求苹果和橘子", rule: "REL.MODEL.SUMDIFF.SUM", equation: "(x+4)+x=30" },
  { text: "甲和乙一共100个，乙有30个，求甲", rule: "REL.MODEL.SUMDIFF.SUM", equation: "x+30=100" },
  { text: "乙有20个，甲比乙多10个，求甲", rule: "REL.MODEL.SUMDIFF.DIFF", equation: "x=20+10" },
  { text: "甲有50个，乙比甲少10个，求乙", rule: "REL.MODEL.SUMDIFF.DIFF", equation: "x=50-10" },
  { text: "甲是乙的3倍，甲和乙一共80个，求甲乙", rule: "REL.MODEL.MULTIPLE.TIMES", equation: "3x+x=80" },
  { text: "甲比乙多3倍，甲乙一共80个，求甲乙", rule: "REL.MODEL.MULTIPLE.TIMES", equation: "4x+x=80" },
  { text: "甲是乙的3倍，乙有20个，求甲", rule: "REL.MODEL.MULTIPLE.TIMES", equation: "x=3×20" },
  { text: "甲比乙的3倍少5个，甲乙一共80个，求甲乙", rule: "REL.MODEL.MULTIPLE.TIMES", equation: "(3x-5)+x=80" },
  { text: "甲是乙的3/4，甲乙一共80个，求甲乙", rule: "REL.MODEL.MULTIPLE.RATIO", equation: "(3/4)x+x=80" },
  { text: "甲比乙多1/4，甲乙一共80个，求甲乙", rule: "REL.MODEL.MULTIPLE.RATIO", equation: "(5/4)x+x=80" },
  // 归一归总族（6）
  { text: "每盒5个，8盒一共多少个", rule: "REL.MODEL.TOTAL.TOTAL", equation: "x=5×8" },
  { text: "每小时行40千米，3小时行多少千米", rule: "REL.MODEL.TOTAL.TOTAL", equation: "x=40×3" },
  { text: "3小时行120千米，每小时行多少千米", rule: "REL.MODEL.NORMALIZE.UNIT", equation: "x=120÷3" },
  { text: "3箱重45千克，5箱重多少千克", rule: "REL.MODEL.NORMALIZE.UNIT", equation: "x=(45÷3)×5" },
  { text: "3箱重45千克，每箱15千克，求几箱", rule: "REL.MODEL.NORMALIZE.UNIT", equation: "x=45÷15" },
  { text: "甲是乙的2/5，乙有30个，求甲", rule: "REL.MODEL.MULTIPLE.RATIO", equation: "x=(2/5)×30" },
];

const FAILED: string[] = [
  "甲比乙多10个", // 差句无已知量（一方程两未知）
  "甲是乙的3倍", // 倍数句无和句/已知量
  "求甲", // 无任何关系子句
  "图书馆有科技书80本", // 仅已知量直给，无关系与问句
  "甲和乙一共80个", // 和句无差量/已知量（欠定）
  "小明比小红多3支铅笔，求小明", // 差句无已知量
];

describe("modelQuestion 端到端（24 题样本）", () => {
  it.each(MODELED)("建模成功：$text", ({ text, rule, equation }) => {
    const result = modelQuestion(text);
    if ("code" in result) {
      throw new Error(`期望成功 ${rule}｜${text}，实际 ${result.code}：${result.reason}`);
    }
    expect(result.appliedRules).toEqual([rule]);
    expect(result.equation).toBe(equation);
  });

  it.each(FAILED)("显式 MODEL_FAILED：%s", (text) => {
    const result = modelQuestion(text);
    expect(result).toMatchObject({ code: "MODEL_FAILED" });
    expect("reason" in result && result.reason.length > 0).toBe(true);
  });

  it("样本规模与成功率口径：18/24 成功、6/24 显式失败（100% 有明确归属，无静默错判）", () => {
    expect(MODELED).toHaveLength(18);
    expect(FAILED).toHaveLength(6);
  });
});

describe("规则层接口（Task 6 复用点与反向校验）", () => {
  it("applyRules 直接消费中性结构：与 modelQuestion 结果一致（LLM 结构化后走同一判定）", () => {
    const text = "甲和乙一共80个，甲比乙多10个，求甲和乙";
    expect(applyRules(extract(text))).toEqual(modelQuestion(text));
  });

  it("反向校验：方向写反（more→less）产出互为翻转的关系（不静默错判，可定位）", () => {
    const moreRelation = firstDraft("乙有20个，甲比乙多10个，求甲").relations[0];
    const lessRelation = firstDraft("乙有20个，甲比乙少10个，求甲").relations[0];
    expect(moreRelation).toMatchObject({ subject: "甲", reference: "乙" });
    expect(lessRelation).toMatchObject({ subject: "乙", reference: "甲" });
    expect(moreRelation.subject).toBe(lessRelation.reference);
    expect(moreRelation.reference).toBe(lessRelation.subject);
  });

  it("反向校验：synthesize 拒绝结构非法的草稿（reference 与 target 同一实体，01 §3.1 约束）", () => {
    const result = synthesize({
      ruleId: "REL.MODEL.SUMDIFF.SUM",
      relations: [{ predicate: "diff", subject: "甲", reference: "甲", target: "甲", operator: "-" }],
      entities: [{ name: "甲", role: "unknown" }],
      variable: "甲",
      equation: "x=10",
      targets: ["甲"],
    });
    expect(result).toMatchObject({ code: "MODEL_FAILED" });
  });
});

/** 测试辅助：抽取 → 首个命中规则的草稿 */
function firstDraft(text: string): RuleDraft {
  const extraction = extract(text);
  for (const rule of ALL_MODEL_RULES) {
    const draft = rule.apply(extraction);
    if (draft) {
      return draft;
    }
  }
  throw new Error(`无规则命中：${text}`);
}

/** 模型快照样例：确认 entities/relations/equation 字段齐备（M-6 纯函数） */
describe("RelationModel 结构完整性", () => {
  it("SUMDIFF.SUM 输出含四角色关系、IR 实体与规范方程", () => {
    const result = modelQuestion("甲和乙一共80个，甲比乙多10个，求甲和乙") as RelationModel;
    expect(Object.keys(result).sort()).toEqual(["appliedRules", "entities", "equation", "relations", "target", "targets"]);
    expect(result.target).toEqual({ entityId: "甲", answerForm: "integer" });
  });
});
