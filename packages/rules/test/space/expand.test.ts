import { describe, expect, it } from "vitest";
import { modelQuestion, type RelationModel } from "../../src/model/index.js";
import { budgetFor, generateSolutionSpace, type SolutionValue } from "../../src/space/index.js";

/**
 * 解题空间 DAG 展开测试（Task 4 DAG/BUD/NP/M 系列）。
 *
 * DAG-01/02 断全貌（节点文本、边、收敛多父、终态解值）；DAG-05 用 Task 3 端到端
 * 样本逐题验证「预算内题全部生成」且解值与人工一致——等价性由解值真正把关
 * （变换若破坏解集，终态解值必错）；BUD 系列验证 01 §5 部分结果口径。
 */

/** 手搓关系模型（方程 + appliedRules；DAG 是 rules 层内部结构，其余字段不参与展开） */
function model(equation: string, appliedRules: string[] = ["REL.MODEL.SUMDIFF.SUM"]): RelationModel {
  return {
    entities: [],
    relations: [],
    target: { entityId: "甲", answerForm: "integer" },
    targets: [],
    equation,
    appliedRules,
  };
}

/** 终态解值清单（创建序） */
function terminalSolutions(nodes: Array<{ terminal: boolean; solution?: SolutionValue }>): SolutionValue[] {
  return nodes.filter((node) => node.terminal).map((node) => node.solution!);
}

describe("DAG-01 (x+10)+x=80 全量展开（9 节点 13 边，2*x=70 三父收敛）", () => {
  const result = generateSolutionSpace(model("(x+10)+x=80"));

  it("预算内全量生成（ok，无截断）", () => {
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.space.truncated).toBe(false);
    expect(result.space.truncation).toBeUndefined();
    expect(result.space.rootId).toBe("n1");
    expect(result.space.budget).toEqual({ maxDepth: 12, maxNodes: 160 });
  });

  it("节点集合按 BFS 创建序（深度标注收敛结构）", () => {
    if (result.status !== "ok") {
      return;
    }
    expect(result.space.nodes.map((node) => node.text)).toEqual([
      "x+10+x=80",
      "2*x+10=80",
      "x+x=80-10",
      "2*x=80-10",
      "x+x=70",
      "2*x=70",
      "x=(80-10)/2",
      "x=70/2",
      "x=35",
    ]);
    expect(result.space.nodes.map((node) => node.depth)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("边集合（含 MERGE/EVAL 双路径汇入 2*x=70）", () => {
    if (result.status !== "ok") {
      return;
    }
    expect(result.space.edges).toEqual([
      { from: "n1", to: "n2", rule: "ALG.EQ.MERGE" },
      { from: "n1", to: "n3", rule: "ALG.EQ.MOVE" },
      { from: "n2", to: "n4", rule: "ALG.EQ.MOVE" },
      { from: "n3", to: "n4", rule: "ALG.EQ.MERGE" },
      { from: "n3", to: "n5", rule: "ALG.EQ.MERGE" },
      { from: "n3", to: "n5", rule: "ALG.EQ.EVAL" },
      { from: "n4", to: "n6", rule: "ALG.EQ.MERGE" },
      { from: "n4", to: "n6", rule: "ALG.EQ.EVAL" },
      { from: "n4", to: "n7", rule: "ALG.EQ.ISOLATE" },
      { from: "n5", to: "n6", rule: "ALG.EQ.MERGE" },
      { from: "n6", to: "n8", rule: "ALG.EQ.ISOLATE" },
      { from: "n7", to: "n9", rule: "ALG.EQ.EVAL" },
      { from: "n8", to: "n9", rule: "ALG.EQ.EVAL" },
    ]);
  });

  it("收敛节点 2*x=70 三父（MERGE/EVAL/MERGE）；终态三节点同解 35", () => {
    if (result.status !== "ok") {
      return;
    }
    expect(result.space.edges.filter((edge) => edge.to === "n6").map((edge) => edge.from)).toEqual(["n4", "n4", "n5"]);
    expect(result.space.terminalIds).toEqual(["n7", "n8", "n9"]);
    expect(terminalSolutions(result.space.nodes)).toEqual([
      { num: 35, den: 1 },
      { num: 35, den: 1 },
      { num: 35, den: 1 },
    ]);
  });
});

describe("DAG-02 x+10=80+5（EVAL/MOVE 两种次序双路径收敛 x=75）", () => {
  const result = generateSolutionSpace(model("x+10=80+5"));

  it("节点与边（5 节点 8 边）", () => {
    if (result.status !== "ok") {
      throw new Error("期望 ok");
    }
    expect(result.space.nodes.map((node) => node.text)).toEqual(["x+10=80+5", "x+10=85", "x=80+5-10", "x=85-10", "x=75"]);
    expect(result.space.edges).toEqual([
      { from: "n1", to: "n2", rule: "ALG.EQ.MERGE" },
      { from: "n1", to: "n3", rule: "ALG.EQ.MOVE" },
      { from: "n1", to: "n2", rule: "ALG.EQ.EVAL" },
      { from: "n2", to: "n4", rule: "ALG.EQ.MOVE" },
      { from: "n3", to: "n5", rule: "ALG.EQ.MERGE" },
      { from: "n3", to: "n5", rule: "ALG.EQ.EVAL" },
      { from: "n4", to: "n5", rule: "ALG.EQ.MERGE" },
      { from: "n4", to: "n5", rule: "ALG.EQ.EVAL" },
    ]);
    expect(result.space.terminalIds).toEqual(["n3", "n4", "n5"]);
    expect(terminalSolutions(result.space.nodes)).toEqual([
      { num: 75, den: 1 },
      { num: 75, den: 1 },
      { num: 75, den: 1 },
    ]);
  });
});

describe("DAG-03/04 直算链（终态仍参与 EVAL 展开，D6）", () => {
  it("DAG-03 x=3×20 → x=60（两终态同解）", () => {
    const result = generateSolutionSpace(model("x=3×20", ["REL.MODEL.TOTAL.TOTAL"]));
    if (result.status !== "ok") {
      throw new Error("期望 ok");
    }
    expect(result.space.nodes.map((node) => node.text)).toEqual(["x=3*20", "x=60"]);
    expect(result.space.edges).toEqual([{ from: "n1", to: "n2", rule: "ALG.EQ.EVAL" }]);
    expect(result.space.terminalIds).toEqual(["n1", "n2"]);
    expect(result.space.budget).toEqual({ maxDepth: 8, maxNodes: 64 });
    expect(terminalSolutions(result.space.nodes)).toEqual([{ num: 60, den: 1 }, { num: 60, den: 1 }]);
  });

  it("DAG-04 x=(45÷3)×5 → x=75", () => {
    const result = generateSolutionSpace(model("x=(45÷3)×5", ["REL.MODEL.NORMALIZE.UNIT"]));
    if (result.status !== "ok") {
      throw new Error("期望 ok");
    }
    expect(result.space.nodes.map((node) => node.text)).toEqual(["x=45/3*5", "x=75"]);
    expect(terminalSolutions(result.space.nodes)).toEqual([{ num: 75, den: 1 }, { num: 75, den: 1 }]);
  });
});

describe("DAG-05 Task 3 端到端 18 题样本：预算内全部生成且解值与人工一致", () => {
  const SAMPLES: Array<{ text: string; solution: SolutionValue }> = [
    { text: "甲和乙一共80个，甲比乙多10个，求甲和乙", solution: { num: 35, den: 1 } },
    { text: "甲和乙一共80个，甲比乙少10个，求甲和乙", solution: { num: 35, den: 1 } },
    { text: "苹果和橘子一共30个，苹果比橘子多4个，求苹果和橘子", solution: { num: 13, den: 1 } },
    { text: "甲和乙一共100个，乙有30个，求甲", solution: { num: 70, den: 1 } },
    { text: "乙有20个，甲比乙多10个，求甲", solution: { num: 30, den: 1 } },
    { text: "甲有50个，乙比甲少10个，求乙", solution: { num: 40, den: 1 } },
    { text: "甲是乙的3倍，甲和乙一共80个，求甲乙", solution: { num: 20, den: 1 } },
    { text: "甲比乙多3倍，甲乙一共80个，求甲乙", solution: { num: 16, den: 1 } },
    { text: "甲是乙的3倍，乙有20个，求甲", solution: { num: 60, den: 1 } },
    { text: "甲比乙的3倍少5个，甲乙一共80个，求甲乙", solution: { num: 85, den: 4 } },
    { text: "甲是乙的3/4，甲乙一共80个，求甲乙", solution: { num: 320, den: 7 } },
    { text: "甲比乙多1/4，甲乙一共80个，求甲乙", solution: { num: 320, den: 9 } },
    { text: "每盒5个，8盒一共多少个", solution: { num: 40, den: 1 } },
    { text: "每小时行40千米，3小时行多少千米", solution: { num: 120, den: 1 } },
    { text: "3小时行120千米，每小时行多少千米", solution: { num: 40, den: 1 } },
    { text: "3箱重45千克，5箱重多少千克", solution: { num: 75, den: 1 } },
    { text: "3箱重45千克，每箱15千克，求几箱", solution: { num: 3, den: 1 } },
    { text: "甲是乙的2/5，乙有30个，求甲", solution: { num: 12, den: 1 } },
  ];

  it.each(SAMPLES)("全部生成且解值正确：$text", ({ text, solution }) => {
    const modeled = modelQuestion(text);
    if ("code" in modeled) {
      throw new Error(`Task 3 应建模成功：${modeled.reason}`);
    }
    const result = generateSolutionSpace(modeled);
    if (result.status !== "ok") {
      throw new Error(`期望 ok，实际 ${result.status}：${"reason" in result ? result.reason : result.flag}`);
    }
    expect(result.space.terminalIds.length).toBeGreaterThan(0);
    // 每个终态的解值都应等于人工解（变换保解集的端到端验证）
    for (const node of result.space.nodes.filter((item) => item.terminal)) {
      expect(node.solution).toEqual(solution);
    }
  });

  it("样本规模 18 题（tasks.md Task 4 验证口径：预算内题全部生成）", () => {
    expect(SAMPLES).toHaveLength(18);
  });
});

describe("NP-01 无路径：恒等/矛盾方程显式 DAG_NO_PATH", () => {
  it("x=x+10 → no_path（不静默错判）", () => {
    const result = generateSolutionSpace(model("x=x+10"));
    expect(result.status).toBe("no_path");
    if (result.status === "no_path") {
      expect(result.reason).toContain("DAG_NO_PATH");
    }
  });

  it("种子方程不可解析 → no_path（显式，不抛异常穿层）", () => {
    const result = generateSolutionSpace(model("x+10"));
    expect(result).toMatchObject({ status: "no_path" });
  });
});

describe("BUD-01/02 超预算 → 部分结果（01 §5）", () => {
  it("BUD-01 节点数超限：partial + COST_EXCEEDED + 未覆盖 frontier + 单路径回退含解", () => {
    const result = generateSolutionSpace(model("(x+10)+x=80"), { budget: { maxDepth: 12, maxNodes: 3 } });
    if (result.status !== "partial") {
      throw new Error(`期望 partial，实际 ${result.status}`);
    }
    expect(result.flag).toBe("COST_EXCEEDED");
    expect(result.uncoveredNodeIds).toEqual(["n2", "n3"]);
    const solutions = terminalSolutions(result.space.nodes);
    expect(solutions.length).toBeGreaterThan(0);
    // Set 按引用去重对对象无效，故逐项断言同值
    for (const solution of solutions) {
      expect(solution).toEqual({ num: 35, den: 1 });
    }
    const last = result.space.nodes[result.space.nodes.length - 1];
    expect(last.text).toBe("x=35");
    expect(last.terminal).toBe(true);
  });

  it("BUD-02 深度超限：partial + DEPTH_EXCEEDED + 未覆盖 frontier + 单路径回退含解", () => {
    const result = generateSolutionSpace(model("(x+10)+x=80"), { budget: { maxDepth: 1, maxNodes: 256 } });
    if (result.status !== "partial") {
      throw new Error(`期望 partial，实际 ${result.status}`);
    }
    expect(result.flag).toBe("DEPTH_EXCEEDED");
    expect(result.uncoveredNodeIds).toEqual(["n2", "n3"]);
    expect(terminalSolutions(result.space.nodes)).toContainEqual({ num: 35, den: 1 });
  });
});

describe("M-06 纯函数：同输入同输出", () => {
  it("两次生成 deepEqual", () => {
    const input = model("(x+10)+x=80");
    expect(generateSolutionSpace(input)).toEqual(generateSolutionSpace(input));
  });
});

describe("budgetFor 分档（占位值，Task 9 压测校准）", () => {
  it("按 REL.MODEL.<FAMILY>.* 第 3 段选档，无匹配落 DEFAULT", () => {
    expect(budgetFor(["REL.MODEL.SUMDIFF.SUM"])).toEqual({ maxDepth: 12, maxNodes: 160 });
    expect(budgetFor(["REL.MODEL.MULTIPLE.TIMES"])).toEqual({ maxDepth: 12, maxNodes: 160 });
    expect(budgetFor(["REL.MODEL.TOTAL.TOTAL"])).toEqual({ maxDepth: 8, maxNodes: 64 });
    expect(budgetFor(["REL.MODEL.NORMALIZE.UNIT"])).toEqual({ maxDepth: 12, maxNodes: 160 });
    expect(budgetFor([])).toEqual({ maxDepth: 12, maxNodes: 256 });
    expect(budgetFor(["UNKNOWN.RULE.X"])).toEqual({ maxDepth: 12, maxNodes: 256 });
  });
});
