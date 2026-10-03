/**
 * 前向对齐状态机（Task 5.2/5.3：01 §4.1 前向溯源五步、归档 03 §2.2/§2.3/§5.2/§6.1）。
 *
 * 算法（归档 03 §2.2，候选 = 从上一步节点出发 hops∈[1,H] 可达的**全部**节点按代价
 * 排序取最小——**不做等价预过滤**，落实 §2.3 关键约束「不得先选定推荐路径再逐步比对」）：
 * 1. 起点锚定：第 1 步列式候选 = 从 root 出发 hops∈[0,H]（hops=0 即与规范方程直接比对）；
 * 2. 逐前推 + 代价计算：同分取 hops 小、再取 id 小（确定性，M-6）；
 * 3. 空候选处置：not_judged + ALIGN_FAILED（不直接判错，01 §5）；
 * 4. 继承标记：源头错误后双轨——从 lastGood 可达且判对 → correct（自我纠正）；
 *    从学生上一步实际方程经 ≤H 步元规则推导可达 → inherited；皆非 → concurrent。
 *
 * suspect 区间 (0.25,0.40] 与笔误复核共用 B-3 上下文裁决（归档 03 §5.2）：
 * 把该步替换为期望节点方程后对剩余步骤重跑对齐，全部 correct/inherited → 成立。
 *
 * 纯函数（M-6）：无 Date/random/全局态；同输入同输出。
 */

import { evaluate } from "../evaluate.js";
import type { RelationModel } from "../model/types.js";
import { parse } from "../parse.js";
import type { EquationSides } from "../space/equation.js";
import { equationKey, isEquationParseFailure, parseEquation } from "../space/equation.js";
import { EQ_TRANSFORMS } from "../space/transforms.js";
import type { SolutionEdge, SolutionNode, SolutionSpace } from "../space/types.js";
import { classifyError } from "./classify.js";
import { costBand, stepCost, toSolutionValue, type StepCostResult } from "./cost.js";
import { checkB1, checkB2, classifyTypoPatterns } from "./typo.js";
import type {
  AlignmentInput,
  DiagnosisOutcome,
  StepError,
  StepJudgment,
  StudentEquationStep,
  Tolerance,
} from "./types.js";

/** 最大跳步数 H（D6：D_skip 封顶 0.20 对应 4 次跳过，留 1 裕量） */
export const MAX_HOPS = 5;

/* ------------------------------------------------------------------ */
/* DAG 索引与可达性                                                     */
/* ------------------------------------------------------------------ */

type SpaceIndex = {
  space: SolutionSpace;
  adjacency: Map<string, SolutionEdge[]>; // 按边出现序（确定性）
  nodesById: Map<string, SolutionNode>;
  sidesCache: Map<string, EquationSides>; // nodeId → canonical 文本 parse 重建（D9）
};

function indexSpace(space: SolutionSpace): SpaceIndex {
  const adjacency = new Map<string, SolutionEdge[]>();
  for (const edge of space.edges) {
    const list = adjacency.get(edge.from);
    if (list === undefined) {
      adjacency.set(edge.from, [edge]);
    } else {
      list.push(edge);
    }
  }
  const nodesById = new Map(space.nodes.map((node) => [node.id, node]));
  return { space, adjacency, nodesById, sidesCache: new Map() };
}

/** node 两侧 AST：canonical 文本经 parse 重建（分式折叠不影响取值，结构以重建为准——D9） */
function sidesOfNode(index: SpaceIndex, nodeId: string): EquationSides {
  const cached = index.sidesCache.get(nodeId);
  if (cached !== undefined) {
    return cached;
  }
  const node = index.nodesById.get(nodeId);
  if (node === undefined) {
    throw new Error(`DAG 节点不存在：${nodeId}`);
  }
  const sides: EquationSides = { left: parse(node.left), right: parse(node.right) };
  index.sidesCache.set(nodeId, sides);
  return sides;
}

type Candidate = {
  nodeId: string;
  hops: number;
  path: string[]; // 从 fromId（含）到 nodeId（含）的节点序列（补全数据）
  rules: string[]; // 沿 path 的边规则序列
};

/** BFS 可达候选（hops ∈ [minHops, maxHops]；首访即最小 hops，确定性按边出现序） */
function reachableCandidates(
  adjacency: Map<string, SolutionEdge[]>,
  fromId: string,
  minHops: number,
  maxHops: number,
): Candidate[] {
  const out: Candidate[] = [];
  if (minHops === 0) {
    out.push({ nodeId: fromId, hops: 0, path: [], rules: [] });
  }
  const via = new Map<string, { from: string; rule: string }>();
  const visited = new Set<string>([fromId]);
  let frontier = [fromId];
  for (let depth = 1; depth <= maxHops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const edge of adjacency.get(current) ?? []) {
        if (visited.has(edge.to)) {
          continue;
        }
        visited.add(edge.to);
        via.set(edge.to, { from: current, rule: edge.rule });
        next.push(edge.to);
        if (depth >= minHops) {
          out.push({
            nodeId: edge.to,
            hops: depth,
            path: pathOf(via, fromId, edge.to),
            rules: rulesOf(via, fromId, edge.to),
          });
        }
      }
    }
    frontier = next;
  }
  return out;
}

function pathOf(via: Map<string, { from: string; rule: string }>, fromId: string, nodeId: string): string[] {
  const path: string[] = [nodeId];
  let cursor = nodeId;
  while (cursor !== fromId) {
    const parent = via.get(cursor);
    if (parent === undefined) {
      break;
    }
    path.unshift(parent.from);
    cursor = parent.from;
  }
  return path;
}

function rulesOf(via: Map<string, { from: string; rule: string }>, fromId: string, nodeId: string): string[] {
  const rules: string[] = [];
  let cursor = nodeId;
  while (cursor !== fromId) {
    const parent = via.get(cursor);
    if (parent === undefined) {
      break;
    }
    rules.unshift(parent.rule);
    cursor = parent.from;
  }
  return rules;
}

/**
 * 推荐路径（D17）：DAG 中 root→terminal 最短路径（边数最少；并列取节点 id
 * 字典序）。推荐顺序本身无规格定义，取机械定义并在头注声明。
 */
export function recommendedPathIds(space: SolutionSpace): string[] {
  const index = indexSpace(space);
  const { adjacency } = index;
  const dist = new Map<string, number>([[space.rootId, 0]]);
  const via = new Map<string, { from: string; rule: string }>();
  const queue = [space.rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of adjacency.get(current) ?? []) {
      if (dist.has(edge.to)) {
        continue;
      }
      dist.set(edge.to, (dist.get(current) ?? 0) + 1);
      via.set(edge.to, { from: current, rule: edge.rule });
      queue.push(edge.to);
    }
  }
  const terminals = space.terminalIds
    .filter((id) => dist.has(id))
    .sort((a, b) => (dist.get(a)! - dist.get(b)!) || (a < b ? -1 : a > b ? 1 : 0));
  const target = terminals[0];
  if (target === undefined) {
    return [space.rootId];
  }
  return pathOf(via, space.rootId, target);
}

/* ------------------------------------------------------------------ */
/* 学生链推导（inherited 判据）                                          */
/* ------------------------------------------------------------------ */

/** 从 from 出发经 ≤H 步 EQ_TRANSFORMS 是否到达 to（equationKey 结构判定） */
function derivable(from: EquationSides, to: EquationSides, maxHops: number): boolean {
  const targetKey = equationKey(to);
  const startKey = equationKey(from);
  if (startKey === targetKey) {
    return true;
  }
  const seen = new Set<string>([startKey]);
  let frontier: EquationSides[] = [from];
  for (let depth = 1; depth <= maxHops && frontier.length > 0; depth++) {
    const next: EquationSides[] = [];
    for (const sides of frontier) {
      for (const transform of EQ_TRANSFORMS) {
        for (const successor of transform.apply(sides)) {
          const key = equationKey(successor);
          if (key === targetKey) {
            return true;
          }
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          next.push(successor);
        }
      }
    }
    frontier = next;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 对齐主循环                                                           */
/* ------------------------------------------------------------------ */

type RunMode = "main" | "adjudication";

type AlignRun = {
  steps: StepJudgment[];
  sourceError: StepError | null;
  sourceErrorStep: number | null;
  fallback: { exitCode: "ALIGN_FAILED" | "INVALID_EXPR"; stepIndex: number } | undefined;
};

type Scored = { candidate: Candidate; result: StepCostResult };

function compareScored(a: Scored, b: Scored): number {
  const byCost = a.result.cost.compare(b.result.cost);
  if (byCost !== 0) {
    return byCost;
  }
  if (a.candidate.hops !== b.candidate.hops) {
    return a.candidate.hops - b.candidate.hops; // 同分取 hops 小
  }
  return a.candidate.nodeId < b.candidate.nodeId ? -1 : a.candidate.nodeId > b.candidate.nodeId ? 1 : 0; // 再取 id 小
}

function notJudged(index: number, exitCode: "ALIGN_FAILED" | "INVALID_EXPR"): StepJudgment {
  const reason =
    exitCode === "INVALID_EXPR"
      ? "方程无法解析或含无效运算（除零），不参与判定（01 §5 INVALID_EXPR）"
      : "无更多可达候选节点（终态后多余步骤等），标出该步提示人工核对（01 §5 ALIGN_FAILED）";
  return {
    index,
    status: "not_judged",
    nodeId: null,
    cost: null,
    equivalenceLevel: null,
    skippedTransforms: 0,
    note: `${exitCode}：${reason}`,
  };
}

function alignSteps(
  index: SpaceIndex,
  model: RelationModel,
  steps: readonly StudentEquationStep[],
  startNodeId: string,
  mode: RunMode,
  tolerance: Tolerance | undefined,
  firstStepIsColumnSetup: boolean,
): AlignRun {
  const judgments: StepJudgment[] = [];
  const recommended = recommendedPathIds(index.space);
  let lastGood = startNodeId;
  let sourceError: StepError | null = null;
  let sourceErrorStep: number | null = null;
  let fallback: AlignRun["fallback"];
  let prevStudentSides: EquationSides | null = null; // 学生链模式：上一步实际方程
  let offTrack = false; // 学生当前是否偏离正确路径（inherited 判据）
  let suggestionGiven = false; // 5.3 路径建议只提示一次（首个偏离推荐路径的判对步）

  /** 判对入列（含「只给一次」的路径建议） */
  const pushCorrect = (stepIndex: number, scoredBest: Scored, note: string | undefined): void => {
    const judgment = correctJudgment(stepIndex, scoredBest, index, recommended, note, !suggestionGiven);
    if (judgment.pathSuggestion !== undefined) {
      suggestionGiven = true;
    }
    judgments.push(judgment);
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const parsed = parseEquation(step.equation);
    if (isEquationParseFailure(parsed)) {
      judgments.push(notJudged(i, "INVALID_EXPR"));
      fallback ??= { exitCode: "INVALID_EXPR", stepIndex: i };
      continue;
    }
    const invalidSide = [parsed.left, parsed.right].find((side) => evaluate(side).status === "invalid");
    if (invalidSide !== undefined) {
      // 除零等无效状态不参与等价判定（01 §3.3），显式 not_judged，不猜
      judgments.push(notJudged(i, "INVALID_EXPR"));
      fallback ??= { exitCode: "INVALID_EXPR", stepIndex: i };
      continue;
    }

    const minHops = firstStepIsColumnSetup && i === 0 ? 0 : 1;
    const candidates = reachableCandidates(index.adjacency, lastGood, minHops, MAX_HOPS);
    if (candidates.length === 0) {
      judgments.push(notJudged(i, "ALIGN_FAILED"));
      fallback ??= { exitCode: "ALIGN_FAILED", stepIndex: i };
      continue;
    }

    const scored = candidates
      .map((candidate) => ({ candidate, result: stepCost(parsed, sidesOfNode(index, candidate.nodeId), { skipped: candidate.hops - 1, tolerance }) }))
      .sort(compareScored);
    const best = scored[0];
    const band = costBand(best.result.cost);
    const inStudentChain = sourceError !== null || offTrack;

    if (!inStudentChain) {
      if (band === "correct" || band === "correct_with_suggestion") {
        pushCorrect(i, best, undefined);
        lastGood = best.candidate.nodeId;
        prevStudentSides = parsed;
        offTrack = false;
        continue;
      }
      if (band === "suspect" && mode === "main" && b3Holds(index, model, steps, i, best.candidate.nodeId, tolerance)) {
        // B-3 上下文裁决成立：判对并留提示（归档 03 §5.2）
        pushCorrect(i, best, "可疑变体经上下文裁决判对（替换为标准值后，后续步骤全部可对齐）");
        lastGood = best.candidate.nodeId;
        prevStudentSides = parsed;
        continue;
      }
      // 源头错误分支（band=error，或 suspect 的 B-3 不成立）
      const error = classifyError({
        student: parsed,
        expected: sidesOfNode(index, best.candidate.nodeId),
        expectedNodeId: best.candidate.nodeId,
        violatedRules: best.candidate.rules,
        isModelingStep: firstStepIsColumnSetup && i === 0,
        model,
        source: step.source,
        role: "source",
      });
      applyTypoReview(index, model, steps, i, best, parsed, error, tolerance, mode);
      sourceError = error;
      sourceErrorStep = i;
      judgments.push(incorrectJudgment(i, best, error));
      prevStudentSides = parsed;
      offTrack = true;
      continue;
    }

    // 学生链模式（源头错误/not_judged 之后的步骤）
    if (band === "correct" || band === "correct_with_suggestion") {
      // 自我纠正：重联正确路径（源头错误仍记录，verdict 不变）
      pushCorrect(i, best, "从错误步骤自我纠正，重联正确路径");
      lastGood = best.candidate.nodeId;
      prevStudentSides = parsed;
      offTrack = false;
      continue;
    }
    if (offTrack && prevStudentSides !== null && derivable(prevStudentSides, parsed, MAX_HOPS)) {
      // 继承错误：从学生上一步实际方程合法推导可达——源头错误的后果，不重复扣分
      const inherited: StepError = {
        role: "inherited",
        classification: sourceError?.classification ?? "knowledge",
        ...(sourceError?.subtype !== undefined ? { subtype: sourceError.subtype } : {}),
        ...(sourceError?.ruleId !== undefined ? { ruleId: sourceError.ruleId } : {}),
        ...(sourceError?.relationLocation !== undefined ? { relationLocation: sourceError.relationLocation } : {}),
        reason: `继承自第 ${(sourceErrorStep ?? i) + 1} 步的源头错误（不重复扣分，归档 03 §6.1）`,
        traceable: sourceError?.traceable ?? true,
      };
      judgments.push({
        index: i,
        status: "inherited",
        nodeId: null,
        cost: null,
        equivalenceLevel: null,
        skippedTransforms: 0,
        error: inherited,
      });
      prevStudentSides = parsed;
      offTrack = true;
      continue;
    }
    // 并发次要错误：与源头错误无因果的独立错误（归档 03 §6.1）
    const error = classifyError({
      student: parsed,
      expected: sidesOfNode(index, best.candidate.nodeId),
      expectedNodeId: best.candidate.nodeId,
      violatedRules: best.candidate.rules,
      isModelingStep: false,
      source: step.source,
      role: "concurrent",
    });
    judgments.push(incorrectJudgment(i, best, error));
    prevStudentSides = parsed;
    offTrack = true;
  }

  return { steps: judgments, sourceError, sourceErrorStep, fallback };
}

/** 判对判定（含 5.3 路径建议与跳步补全数据；suggest=false 时本轮不给建议——只提示一次） */
function correctJudgment(
  index: number,
  best: Scored,
  spaceIndex: SpaceIndex,
  recommended: readonly string[],
  note: string | undefined,
  suggest: boolean,
): StepJudgment {
  const judgment: StepJudgment = {
    index,
    status: "correct",
    nodeId: best.candidate.nodeId,
    cost: toSolutionValue(best.result.cost),
    equivalenceLevel: best.result.level === "none" ? null : best.result.level,
    skippedTransforms: Math.max(0, best.candidate.hops - 1),
    transforms: best.candidate.rules,
    ...(best.candidate.hops > 1 ? { pathCompletion: best.candidate.path } : {}),
  };
  if (suggest && !recommended.includes(best.candidate.nodeId)) {
    // 5.3：走了合法但非推荐路径 → 给推荐路径节点文本（D17 机械定义，全题只提示一次）
    judgment.pathSuggestion = recommended.map((id) => spaceIndex.nodesById.get(id)?.text ?? id);
  }
  if (note !== undefined) {
    judgment.note = note;
  }
  return judgment;
}

function incorrectJudgment(index: number, best: Scored, error: StepError): StepJudgment {
  return {
    index,
    status: "incorrect",
    nodeId: best.candidate.nodeId,
    cost: toSolutionValue(best.result.cost),
    equivalenceLevel: best.result.level === "none" ? null : best.result.level,
    skippedTransforms: Math.max(0, best.candidate.hops - 1),
    transforms: best.candidate.rules, // 03 §1.1：应走而未走（violated，归档 03 §5.1）
    error,
  };
}

/** B-3 上下文裁决（suspect 区间与笔误复核共用）：替换为期望节点后剩余步骤全部可对齐 */
function b3Holds(
  index: SpaceIndex,
  model: RelationModel,
  steps: readonly StudentEquationStep[],
  position: number,
  nodeId: string,
  tolerance: Tolerance | undefined,
): boolean {
  const remaining = steps.slice(position + 1);
  if (remaining.length === 0) {
    return true;
  }
  const sub = alignSteps(index, model, remaining, nodeId, "adjudication", tolerance, false);
  return sub.steps.every((step) => step.status === "correct" || step.status === "inherited");
}

/**
 * 笔误复核（D13：计算失误命中后）：checkB1 ∧ checkB2 ∧ B-3 ∧ source=photo
 * → 改判 slip，reason「笔误（仅提示，不扣分）」；adjudication 模式跳过（防递归）。
 */
function applyTypoReview(
  index: SpaceIndex,
  model: RelationModel,
  steps: readonly StudentEquationStep[],
  position: number,
  best: Scored,
  student: EquationSides,
  error: StepError,
  tolerance: Tolerance | undefined,
  mode: RunMode,
): void {
  const step = steps[position];
  if (mode !== "main" || error.subtype !== "miscalc" || step.source !== "photo") {
    return;
  }
  const expected = sidesOfNode(index, best.candidate.nodeId);
  if (!checkB1(student, expected) || !checkB2(student, expected)) {
    return;
  }
  if (!b3Holds(index, model, steps, position, best.candidate.nodeId, tolerance)) {
    return;
  }
  error.classification = "behavioral";
  error.subtype = "slip";
  error.reason = "笔误（仅提示，不扣分）";
}

/* ------------------------------------------------------------------ */
/* 顶层入口                                                             */
/* ------------------------------------------------------------------ */

/**
 * 诊断入口：学生方程状态序列 → 逐步判定 + 源头错误 + verdict（Task 5.2/5.3/5.4）。
 *
 * verdict 规则（D16）：任一步 incorrect → incorrect；无 incorrect 但有 not_judged
 * → partial；否则 correct。空 steps → partial + ANSWER_ONLY（Task 7 直接判最终答案）。
 */
export function diagnoseSolution(input: AlignmentInput): DiagnosisOutcome {
  const { space, steps } = input;
  const recommended = recommendedPathIds(space);
  if (steps.length === 0) {
    return {
      verdict: "partial",
      steps: [],
      sourceError: null,
      fallback: { exitCode: "ANSWER_ONLY", stepIndex: null },
      recommendedPath: recommended,
    };
  }
  const index = indexSpace(space);
  const run = alignSteps(index, input.model, steps, space.rootId, "main", input.tolerance, true);
  classifyTypoPatterns(run.steps); // 同类笔误 ≥2 升级知识性（01 §4.5）

  const hasIncorrect = run.steps.some((step) => step.status === "incorrect");
  const hasNotJudged = run.steps.some((step) => step.status === "not_judged");
  const verdict: DiagnosisOutcome["verdict"] = hasIncorrect ? "incorrect" : hasNotJudged ? "partial" : "correct";

  const sourceStep = run.sourceErrorStep !== null ? run.steps[run.sourceErrorStep] : undefined;
  const sourceError =
    sourceStep?.error !== undefined && run.sourceErrorStep !== null
      ? {
          stepIndex: run.sourceErrorStep,
          classification: sourceStep.error.classification,
          ...(sourceStep.error.ruleId !== undefined ? { ruleId: sourceStep.error.ruleId } : {}),
          reason: sourceStep.error.reason,
        }
      : null;

  return {
    verdict,
    steps: run.steps,
    sourceError,
    ...(run.fallback !== undefined ? { fallback: run.fallback } : {}),
    recommendedPath: recommended,
  };
}
