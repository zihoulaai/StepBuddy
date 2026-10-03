import { describe, expect, it } from "vitest";
import { modelQuestion, type ModelingError, type RelationModel } from "../../src/model/index.js";
import type { SolutionNode, SolutionSpace } from "../../src/space/index.js";
import { generateSolutionSpace } from "../../src/space/index.js";
import { MAX_HOPS, diagnoseSolution, recommendedPathIds } from "../../src/align/align.js";
import { sameMultiset } from "../../src/align/classify.js";
import { classifyTypoPatterns } from "../../src/align/typo.js";
import type { StepJudgment, StudentEquationStep, Tolerance } from "../../src/align/types.js";

/**
 * 前向对齐、溯源与错误分类测试（Task 5.2/5.3/5.4：01 §4.1–§4.6/§5；
 * 归档 v2-full-scope 03 §2.2 对齐、§2.3 多路径、§5.1–5.3、§6.1 三类错误）。
 *
 * 覆盖 ALN-01…18 与 E2E（Task 3 的 18 题正确样本 + 6 条错误解法样本）。
 * 已知边界（D4）：不同设法按规格字面判建模错误，见 ALN-18 与注释。
 */

/* ------------------------------------------------------------------ */
/* 测试辅助                                                             */
/* ------------------------------------------------------------------ */

function problem(text: string): { model: RelationModel; space: SolutionSpace } {
  const model = modelQuestion(text);
  if ("code" in model) {
    throw new Error(`测试题目应可建模：${text} → ${(model as ModelingError).reason}`);
  }
  const result = generateSolutionSpace(model);
  if (result.status !== "ok") {
    throw new Error(`测试题目应可生成 DAG：${text} → ${result.status}`);
  }
  return { model, space: result.space };
}

function nodeByText(space: SolutionSpace, text: string): SolutionNode {
  const node = space.nodes.find((candidate) => candidate.text === text);
  if (node === undefined) {
    throw new Error(`DAG 中无节点文本：${text}`);
  }
  return node;
}

/**
 * 人工正确学生解（E2E 用）：从 root 起沿首条边（transform 声明序）走到无后继，
 * 取节点文本序列。终止于终态节点（含解值）。
 */
function studentPathTexts(space: SolutionSpace): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of space.edges) {
    const list = adjacency.get(edge.from);
    if (list === undefined) {
      adjacency.set(edge.from, [edge.to]);
    } else {
      list.push(edge.to);
    }
  }
  const nodesById = new Map(space.nodes.map((node) => [node.id, node]));
  const texts: string[] = [];
  let current = space.rootId;
  for (;;) {
    const node = nodesById.get(current);
    if (node === undefined) {
      throw new Error(`DAG 节点不存在：${current}`);
    }
    texts.push(node.text);
    const next = adjacency.get(current)?.[0];
    if (next === undefined) {
      return texts;
    }
    current = next;
  }
}

function manualSteps(equations: string[]): StudentEquationStep[] {
  return equations.map((equation) => ({ equation, source: "manual" as const }));
}

function photoSteps(equations: string[]): StudentEquationStep[] {
  return equations.map((equation) => ({ equation, source: "photo" as const }));
}

/** 标准题：甲和乙一共80个，甲比乙多10个 → (x+10)+x=80，解 x=35 */
const STANDARD = problem("甲和乙一共80个，甲比乙多10个，求甲和乙");

/* ------------------------------------------------------------------ */
/* ALN 主用例                                                          */
/* ------------------------------------------------------------------ */

describe("前向对齐主流程", () => {
  it("ALN-01 全对推荐路径：逐步 correct/cost 0，终态解 x=35", () => {
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(studentPathTexts(STANDARD.space)),
    });
    expect(outcome.verdict).toBe("correct");
    expect(outcome.steps.every((step) => step.status === "correct")).toBe(true);
    expect(outcome.steps.every((step) => step.cost?.num === 0 && step.cost?.den === 1)).toBe(true);
    expect(outcome.sourceError).toBeNull();
    const last = outcome.steps[outcome.steps.length - 1];
    const terminal = STANDARD.space.nodes.find((node) => node.id === last.nodeId);
    expect(terminal?.solution).toEqual({ num: 35, den: 1 });
  });

  it("ALN-02 合法非推荐路径判对 + 路径建议（MOVE 先行路径，5.3 / 归档 03 §2.3）", () => {
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["x+10+x=80", "x+x=80-10", "2*x=80-10", "2*x=70", "x=70/2", "x=35"]),
    });
    expect(outcome.verdict).toBe("correct");
    expect(outcome.steps.every((step) => step.status === "correct")).toBe(true);
    // 第 1 步锚定 root；第 2 步走 MOVE 侧节点（非推荐路径），只此一次给推荐路径节点文本
    expect(outcome.steps[0].nodeId).toBe(STANDARD.space.rootId);
    expect(outcome.steps[0].pathSuggestion).toBeUndefined();
    const second = outcome.steps[1];
    expect(second.nodeId).toBe(nodeByText(STANDARD.space, "x+x=80-10").id);
    const recommendedTexts = recommendedPathIds(STANDARD.space).map(
      (id) => STANDARD.space.nodes.find((node) => node.id === id)?.text,
    );
    expect(second.pathSuggestion).toEqual(recommendedTexts);
    expect(second.pathSuggestion).toContain("2*x+10=80");
    // 回到收敛节点之后不再重复给建议
    expect(outcome.steps.slice(2).every((step) => step.pathSuggestion === undefined)).toBe(true);
  });

  it("ALN-03 跳步只检测：skip 计数 + pathCompletion 补全数据（cap=4 见 cost 单测 CST-04）", () => {
    const twoSkips = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["x+10+x=80", "2*x=80-10", "x=35"]),
    });
    expect(twoSkips.verdict).toBe("correct");
    expect(twoSkips.steps[1].skippedTransforms).toBe(1);
    expect(twoSkips.steps[1].cost).toEqual({ num: 1, den: 20 });
    expect(twoSkips.steps[1].pathCompletion).toEqual([
      STANDARD.space.rootId,
      nodeByText(STANDARD.space, "2*x+10=80").id,
      nodeByText(STANDARD.space, "2*x=80-10").id,
    ]);
    // x=35 与近距终态 x=(80-10)/2 同值 → strict 命中，无跳步
    expect(twoSkips.steps[2].skippedTransforms).toBe(0);

    // 一步直达解值：x=35 严格等于 n7 的值（strict 短路），hops=3 → skip=2，band=correct
    const deep = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["x+10+x=80", "x=35"]),
    });
    expect(deep.verdict).toBe("correct");
    expect(deep.steps[1].skippedTransforms).toBe(2);
    expect(deep.steps[1].cost).toEqual({ num: 1, den: 10 });
    expect(deep.steps[1].pathCompletion).toHaveLength(4);
    // D_skip 封顶 0.20（skip=4）需 hops=5 的终态，MVP 应用题 DAG 深度 ≤4 不可达，
    // 封顶行为由 cost.test.ts CST-04 单测封殓
    expect(MAX_HOPS).toBe(5);
  });

  it("ALN-04 移项未变号 → source 唯一 + 知识性 + ruleId=MOVE + 后续 inherited", () => {
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["x+10+x=80", "2*x+10=80", "2*x=80+10", "x=45"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.steps.map((step) => step.status)).toEqual(["correct", "correct", "incorrect", "inherited"]);
    const error = outcome.steps[2].error!;
    expect(error.role).toBe("source");
    expect(error.classification).toBe("knowledge");
    expect(error.ruleId).toBe("ALG.EQ.MOVE");
    expect(error.reason).toContain("移项没有变号");
    expect(error.traceable).toBe(true);
    // 后续步骤从学生错误链合法推导（2x=80+10 → x=90/2 → x=45）→ 继承，不重复扣分
    expect(outcome.steps[3].error?.role).toBe("inherited");
    expect(outcome.steps[3].error?.reason).toContain("继承自第 3 步");
    expect(outcome.sourceError).toMatchObject({
      stepIndex: 2,
      classification: "knowledge",
      ruleId: "ALG.EQ.MOVE",
    });
  });

  it("ALN-05 并发次要错误：与源头错误无因果 → concurrent（归档 03 §6.1）", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({
      space,
      model,
      steps: photoSteps(["x+30=100", "x=80+30", "x=110/2", "x=55"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.steps[0].status).toBe("correct");
    expect(outcome.steps[1].status).toBe("incorrect");
    expect(outcome.steps[1].error?.role).toBe("source");
    // x=110/2 从学生链 x=80+30 不可推导 → 并发次要错误
    expect(outcome.steps[2].error?.role).toBe("concurrent");
    // x=55 从 x=110/2 合法推导 → 继承
    expect(outcome.steps[3].error?.role).toBe("inherited");
  });

  it("ALN-06 自我纠正：源头错误后重联正确路径判 correct（源头错误仍记录）", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({
      space,
      model,
      // x=80+30 为源头错误；x=100-30 回到 DAG 正确节点（self-correct），x=70 为终态
      steps: photoSteps(["x+30=100", "x=80+30", "x=100-30", "x=70"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.steps[1].status).toBe("incorrect");
    expect(outcome.steps[2].status).toBe("correct");
    expect(outcome.steps[2].note).toContain("自我纠正");
    expect(outcome.steps[3].status).toBe("correct");
    expect(outcome.sourceError?.stepIndex).toBe(1);
  });

  it("ALN-07 计算失误：manual 来源不判笔误 → 行为性 miscalc", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({
      space,
      model,
      steps: manualSteps(["x+30=100", "x=100-30", "x=60"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    const error = outcome.steps[2].error!;
    expect(error.classification).toBe("behavioral");
    expect(error.subtype).toBe("miscalc");
    expect(error.reason).toContain("计算结果不正确");
    expect(outcome.sourceError?.classification).toBe("behavioral");
  });

  it("ALN-08 笔误正例：photo + 易混对(6/5) + edit=1 + B-3 自洽 → slip 仅提示", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({
      space,
      model,
      steps: photoSteps(["x+30=100", "x=100-30", "x=60"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    const error = outcome.steps[2].error!;
    expect(error.classification).toBe("behavioral");
    expect(error.subtype).toBe("slip");
    expect(error.reason).toBe("笔误（仅提示，不扣分）");
    expect(outcome.steps[2].status).toBe("incorrect");
  });

  it("ALN-09 笔误反例一：B-3 不成立（后续步骤无法对齐）→ 保持 miscalc", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({
      space,
      model,
      steps: photoSteps(["x+30=100", "x=100-30", "x=60", "x=60+10"]),
    });
    const error = outcome.steps[2].error!;
    expect(error.subtype).toBe("miscalc");
    expect(error.reason).not.toContain("笔误");
  });

  it("ALN-09 笔误反例二：edit=2（x=65 对 x=50）→ B-2 不成立，保持 miscalc", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({
      space,
      model,
      steps: photoSteps(["x+30=100", "x=100-30", "x=65"]),
    });
    const error = outcome.steps[2].error!;
    expect(error.subtype).toBe("miscalc");
  });

  it("ALN-10 同类笔误两次升级知识性（01 §4.5 附加条；同签名 slip ≥2 原地升级，subtype 留痕）", () => {
    // 已知边界：MVP 状态机单题至多产生 1 个 slip（B-3 要求「替换标准值后后续全部可对齐」，
    // 两个均成立的同类 slip 在一条链上互斥），故升级路径以 classifyTypoPatterns 单测封殓。
    const makeStep = (index: number, location: { span: string; hint: string }): StepJudgment => ({
      index,
      status: "incorrect",
      nodeId: "n1",
      cost: { num: 0, den: 1 },
      equivalenceLevel: "formal",
      skippedTransforms: 0,
      error: {
        role: "source",
        classification: "behavioral",
        subtype: "slip",
        ruleId: "ALG.EQ.MOVE",
        location,
        reason: "笔误（仅提示，不扣分）",
        traceable: true,
      },
    });
    const sameSignature = [makeStep(0, { span: "2*x=80+10", hint: "2*x=80-10" }), makeStep(1, { span: "2*x=80+10", hint: "2*x=80-10" })];
    expect(classifyTypoPatterns(sameSignature)).toEqual([0, 1]);
    expect(sameSignature.every((step) => step.error?.classification === "knowledge")).toBe(true);
    expect(sameSignature.every((step) => step.error?.subtype === "slip")).toBe(true);

    const distinct = [makeStep(0, { span: "2*x=80+10", hint: "2*x=80-10" }), makeStep(1, { span: "x=60", hint: "x=50" })];
    expect(classifyTypoPatterns(distinct)).toEqual([]);
    expect(distinct.every((step) => step.error?.classification === "behavioral")).toBe(true);
  });

  it("ALN-11 建模错误：第 1 步列式方向写反 → 知识性 + 关系层定位 diff", () => {
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["(x-10)+x=80"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    const error = outcome.steps[0].error!;
    expect(error.classification).toBe("knowledge");
    expect(error.relationLocation).toEqual({
      predicate: "diff",
      subject: "甲",
      reference: "乙",
      expected: "+10",
      actual: "-10",
    });
    expect(error.reason).toContain("列式与题意不符");
    expect(error.traceable).toBe(true);
    expect(outcome.sourceError).toMatchObject({ stepIndex: 0, classification: "knowledge" });
  });

  it("ALN-12 ALIGN_FAILED：终态后多余步骤 → not_judged + partial（不直接判错）", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({
      space,
      model,
      steps: photoSteps(["x+30=100", "x=100-30", "x=70", "x=70"]),
    });
    expect(outcome.verdict).toBe("partial");
    expect(outcome.steps[3].status).toBe("not_judged");
    expect(outcome.steps[3].note).toContain("ALIGN_FAILED");
    expect(outcome.fallback).toEqual({ exitCode: "ALIGN_FAILED", stepIndex: 3 });
  });

  it("ALN-13 INVALID_EXPR：除零步骤不参与判定 → not_judged + partial", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({
      space,
      model,
      steps: manualSteps(["x+30=100", "x=100÷0"]),
    });
    expect(outcome.verdict).toBe("partial");
    expect(outcome.steps[1].status).toBe("not_judged");
    expect(outcome.steps[1].note).toContain("INVALID_EXPR");
    expect(outcome.fallback).toEqual({ exitCode: "INVALID_EXPR", stepIndex: 1 });
  });

  it("ALN-14 可疑区间 B-3 上下文裁决：成立判对（留提示）/ 不成立判错", () => {
    const tolerance: Tolerance = { decimalPlaces: 1 };
    const holds = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      tolerance,
      steps: manualSteps(["x+10+x=80", "2*x+10=80", "2*x=80-9.97", "x=70/2", "x=35"]),
    });
    expect(holds.verdict).toBe("correct");
    expect(holds.steps[2].status).toBe("correct");
    expect(holds.steps[2].equivalenceLevel).toBe("approximate");
    expect(holds.steps[2].note).toContain("上下文裁决");

    const fails = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      tolerance,
      steps: manualSteps(["x+10+x=80", "2*x+10=80", "2*x=80-9.97", "x=70.06/2"]),
    });
    expect(fails.verdict).toBe("incorrect");
    expect(fails.steps[2].status).toBe("incorrect");
    expect(fails.steps[2].error?.classification).toBe("behavioral");
    expect(fails.steps[2].error?.subtype).toBe("miscalc");
    expect(fails.sourceError?.stepIndex).toBe(2);
  });

  it("ALN-15 跨侧反写判对：80=2*x+10 与 2*x+10=80 同分判 correct（strict crossed）", () => {
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["x+10+x=80", "80=2*x+10", "80-10=2*x", "70=2*x", "70/2=x", "35=x"]),
    });
    expect(outcome.verdict).toBe("correct");
    expect(outcome.steps.every((step) => step.status === "correct")).toBe(true);
    expect(outcome.steps[1].equivalenceLevel).toBe("strict");
    // 前 3 步沿推荐路径；70=2*x 起走 EVAL 侧（非 BFS 最短），首个偏离步给一次建议
    expect(outcome.steps.slice(0, 3).every((step) => step.pathSuggestion === undefined)).toBe(true);
    expect(outcome.steps[3].pathSuggestion).toBeDefined();
    expect(outcome.steps.slice(4).every((step) => step.pathSuggestion === undefined)).toBe(true);
  });

  it("ALN-16 M-6 纯函数：同输入两次诊断 deepEqual（规则层一致率 100% 本地守卫）", () => {
    const input = {
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["x+10+x=80", "2*x+10=80", "2*x=80+10", "x=45"]),
    };
    expect(diagnoseSolution(input)).toEqual(diagnoseSolution(input));
  });

  it("ALN-17 空 steps → partial + ANSWER_ONLY（Task 7 直接判最终答案）", () => {
    const outcome = diagnoseSolution({ space: STANDARD.space, model: STANDARD.model, steps: [] });
    expect(outcome.verdict).toBe("partial");
    expect(outcome.steps).toEqual([]);
    expect(outcome.sourceError).toBeNull();
    expect(outcome.fallback).toEqual({ exitCode: "ANSWER_ONLY", stepIndex: null });
    expect(outcome.recommendedPath).toEqual(recommendedPathIds(STANDARD.space));
  });

  it("ALN-18 已知边界（D4）：不同设法按规格字面判建模错误（x+(x-10)=80）", () => {
    // 学生设未知量的对象与规范模型相反：机械判定只能按「列式须与规范方程等价」的字面口径
    // 判建模错误；机械豁免不 sound（该式解 35 恰为规范模型的乙值）。留痕待 Task 6 设元
    // 结构化 / Task 9 评测集标注验证误判率。
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["x+(x-10)=80"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.steps[0].status).toBe("incorrect");
    const error = outcome.steps[0].error;
    expect(error?.classification).toBe("knowledge");
    expect(error?.relationLocation?.predicate).toBe("diff");
  });

  it("ALN-20 翻转+内容不同（-11 vs +10）仍定位关系层（termDiff 两种形态同形处理）", () => {
    // 学生第 1 步把 +10 写成 -11：符号翻转且数值不同——期望项/学生项恒取
    // lacking/extra，仍能定位 diff 关系（勿退回「只有纯翻转才分支」的死代码结构）
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["(x-11)+x=80"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    const error = outcome.steps[0].error;
    expect(error?.classification).toBe("knowledge");
    expect(error?.relationLocation).toEqual({
      predicate: "diff",
      subject: "甲",
      reference: "乙",
      expected: "+10",
      actual: "-11",
    });
    expect(error?.traceable).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 多重集相等（classify.sameMultiset 回归守卫）                            */
/* ------------------------------------------------------------------ */

describe("sameMultiset：键序无关 + 重复元素计数", () => {
  it("ALN-19 顺序不同/含重复的多重集判等；缺项、多出、长度不等判不等", () => {
    // 键序无关（逐索引比较的历史 bug：["+x","-10"] vs ["-10","+x"] 曾返回 false）
    expect(sameMultiset(["+x", "-10"], ["-10", "+x"])).toBe(true);
    // 重复元素按计数比较，而非按位置
    expect(sameMultiset(["+x", "+x", "-10"], ["-10", "+x", "+x"])).toBe(true);
    expect(sameMultiset(["+x", "+x"], ["+x", "-x"])).toBe(false);
    expect(sameMultiset(["+x"], ["+x", "+x"])).toBe(false);
    expect(sameMultiset([], [])).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* E2E：Task 3 的 18 题正确样本（verdict=correct）                          */
/* ------------------------------------------------------------------ */

const MODELED: Array<{ text: string; rule: string; equation: string }> = [
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
  { text: "每盒5个，8盒一共多少个", rule: "REL.MODEL.TOTAL.TOTAL", equation: "x=5×8" },
  { text: "每小时行40千米，3小时行多少千米", rule: "REL.MODEL.TOTAL.TOTAL", equation: "x=40×3" },
  { text: "3小时行120千米，每小时行多少千米", rule: "REL.MODEL.NORMALIZE.UNIT", equation: "x=120÷3" },
  { text: "3箱重45千克，5箱重多少千克", rule: "REL.MODEL.NORMALIZE.UNIT", equation: "x=(45÷3)×5" },
  { text: "3箱重45千克，每箱15千克，求几箱", rule: "REL.MODEL.NORMALIZE.UNIT", equation: "x=45÷15" },
  { text: "甲是乙的2/5，乙有30个，求甲", rule: "REL.MODEL.MULTIPLE.RATIO", equation: "x=(2/5)×30" },
];

describe("E2E：18 题正确样本沿 DAG 合法路径逐步判对", () => {
  it.each(MODELED)("正确解法：$text", ({ text }) => {
    const { model, space } = problem(text);
    const outcome = diagnoseSolution({ space, model, steps: photoSteps(studentPathTexts(space)) });
    expect(outcome.verdict).toBe("correct");
    expect(outcome.steps.length).toBeGreaterThan(0);
    expect(outcome.steps.every((step) => step.status === "correct")).toBe(true);
    // 末步落在终态且解值齐备（M-1 的本地同构代理）
    const last = outcome.steps[outcome.steps.length - 1];
    const terminal = space.nodes.find((node) => node.id === last.nodeId);
    expect(terminal?.terminal).toBe(true);
    expect(terminal?.solution).toBeDefined();
  });

  it("E2E 样本规模与解值抽查：18 题；三题终态解值与人工推导一致", () => {
    expect(MODELED).toHaveLength(18);
    const expected: Array<[string, { num: number; den: number }]> = [
      ["甲和乙一共80个，甲比乙多10个，求甲和乙", { num: 35, den: 1 }],
      ["甲和乙一共100个，乙有30个，求甲", { num: 70, den: 1 }],
      ["每小时行40千米，3小时行多少千米", { num: 120, den: 1 }],
    ];
    for (const [text, solution] of expected) {
      const { model, space } = problem(text);
      const outcome = diagnoseSolution({ space, model, steps: photoSteps(studentPathTexts(space)) });
      const last = outcome.steps[outcome.steps.length - 1];
      const terminal = space.nodes.find((node) => node.id === last.nodeId);
      expect(terminal?.solution).toEqual(solution);
    }
  });
});

/* ------------------------------------------------------------------ */
/* E2E：6 条错误解法样本（sourceError 与分类）                             */
/* ------------------------------------------------------------------ */

describe("E2E：6 条错误解法样本（M-1/M-2 本地同构代理）", () => {
  it("错误样本 1：列式方向写反 → 建模错误 + diff 关系定位", () => {
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["(x-10)+x=80"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.steps[0].error?.relationLocation?.predicate).toBe("diff");
    expect(outcome.sourceError?.classification).toBe("knowledge");
  });

  it("错误样本 2：移项未变号 → 知识性 + ALG.EQ.MOVE + 后续 inherited", () => {
    const outcome = diagnoseSolution({
      space: STANDARD.space,
      model: STANDARD.model,
      steps: photoSteps(["x+10+x=80", "2*x+10=80", "2*x=80+10", "x=45"]),
    });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.sourceError).toMatchObject({ stepIndex: 2, classification: "knowledge", ruleId: "ALG.EQ.MOVE" });
    expect(outcome.steps[3].status).toBe("inherited");
  });

  it("错误样本 3：计算错（manual）→ 行为性 miscalc", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({ space, model, steps: manualSteps(["x+30=100", "x=100-30", "x=60"]) });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.sourceError).toMatchObject({ stepIndex: 2, classification: "behavioral" });
    expect(outcome.steps[2].error?.subtype).toBe("miscalc");
  });

  it("错误样本 4：笔误（photo）→ 行为性 slip 仅提示", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({ space, model, steps: photoSteps(["x+30=100", "x=100-30", "x=60"]) });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.steps[2].error?.subtype).toBe("slip");
    expect(outcome.sourceError?.classification).toBe("behavioral");
  });

  it("错误样本 5：可疑值 B-3 不成立（photo）→ 保持行为性 miscalc", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({ space, model, steps: photoSteps(["x+30=100", "x=100-30", "x=60", "x=60+10"]) });
    expect(outcome.verdict).toBe("incorrect");
    expect(outcome.steps[2].error?.subtype).toBe("miscalc");
  });

  it("错误样本 6：除零步骤 → not_judged + INVALID_EXPR + partial", () => {
    const { model, space } = problem("甲和乙一共100个，乙有30个，求甲");
    const outcome = diagnoseSolution({ space, model, steps: manualSteps(["x+30=100", "x=100÷0"]) });
    expect(outcome.verdict).toBe("partial");
    expect(outcome.fallback).toEqual({ exitCode: "INVALID_EXPR", stepIndex: 1 });
  });
});
