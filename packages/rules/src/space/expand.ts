/**
 * 解题空间展开器（Task 4 入口：由 IR 生成解题空间 DAG）。
 *
 * 规格依据：
 * - 01 §4.0 完整机制第二环「关系层建模 → 解题空间生成」；
 * - 01 §5 退出码：DAG_NO_PATH（无法生成）/ DEPTH_EXCEEDED / COST_EXCEEDED（部分结果，
 *   必须明示「未覆盖的部分未校验」）；
 * - 归档 v2-full-scope PRD §4.3.2：BFS 展开、等价节点合并（equationKey 去重）、
 *   深度/节点预算、教学推荐路径（所有合法路径对错判定平等）；
 * - spec.md §8：节点/深度超预算 → 按需单路径搜索（禁用分配律展开）——部分结果
 *   即一条 root→解 的完整单路径。
 *
 * 纯函数（M-6）：同输入同输出；节点 id 按 BFS 创建序 n1,n2…。
 */

import { collectVariables } from "../ast.js";
import { canonicalizeAst } from "../normalize.js";
import { evaluate } from "../evaluate.js";
import type { RelationModel } from "../model/types.js";
import {
  equationKey,
  isEquationParseFailure,
  normalizeSides,
  parseEquation,
  type EquationSides,
} from "./equation.js";
import { EQ_TRANSFORMS } from "./transforms.js";
import {
  budgetFor,
  DEFAULT_SPACE_BUDGET,
  type SolutionEdge,
  type SolutionNode,
  type SolutionSpace,
  type SolutionSpaceResult,
  type SolutionValue,
  type SpaceBudget,
  type SpaceTruncationFlag,
} from "./types.js";

/** 展开模式：full 全量 DAG；single 单路径回退（候选仅取首个适用规则的首个子嗣） */
type ExpansionMode = "full" | "single";

/** 内部节点：携带 AST 两侧（变换的输入），展示串在序列化时落地 */
type InternalNode = { id: string; sides: EquationSides; key: string; depth: number };

type Successor = { sides: EquationSides; rule: string };

type RunOutcome = {
  space: SolutionSpace;
  truncated: boolean;
  uncoveredNodeIds: string[];
};

/** 节点的候选后继：full 模式取全部适用规则的全部后继；single 模式取首条 */
function successorsOf(node: InternalNode, mode: ExpansionMode): Successor[] {
  const collected: Successor[] = [];
  for (const transform of EQ_TRANSFORMS) {
    const candidates = transform.apply(node.sides).map((sides) => ({ sides, rule: transform.id }));
    if (candidates.length === 0) {
      continue;
    }
    if (mode === "single") {
      return [candidates[0]];
    }
    collected.push(...candidates);
  }
  return collected;
}

/** 终态判定：恰一侧为裸变量、另一侧无变量；solution 取常量侧精确值 */
function terminalInfo(sides: EquationSides): { terminal: boolean; solution?: SolutionValue } {
  const leftHasVar = collectVariables(sides.left).size > 0;
  const rightHasVar = collectVariables(sides.right).size > 0;
  if (leftHasVar === rightHasVar) {
    return { terminal: false };
  }
  const variableSide = leftHasVar ? sides.left : sides.right;
  const constantSide = leftHasVar ? sides.right : sides.left;
  if (variableSide.kind !== "var") {
    return { terminal: false };
  }
  const evaluated = evaluate(constantSide);
  if (evaluated.status !== "value") {
    return { terminal: true };
  }
  return {
    terminal: true,
    // MVP 量级内 Number() 对 bigint 无损（解值基数远小于 2^53）
    solution: { num: Number(evaluated.value.num), den: Number(evaluated.value.den) },
  };
}

function serializeNodes(nodes: readonly InternalNode[]): SolutionNode[] {
  return nodes.map((node) => {
    const normalized = normalizeSides(node.sides);
    const left = canonicalizeAst(normalized.left);
    const right = canonicalizeAst(normalized.right);
    const info = terminalInfo(normalized);
    return {
      id: node.id,
      left,
      right,
      text: `${left}=${right}`,
      depth: node.depth,
      terminal: info.terminal,
      ...(info.solution !== undefined ? { solution: info.solution } : {}),
    };
  });
}

/** 单次 BFS 展开（full 或 single 共用内核） */
function runExpansion(seed: EquationSides, budget: SpaceBudget, mode: ExpansionMode): RunOutcome {
  const nodes: InternalNode[] = [{ id: "n1", sides: seed, key: equationKey(seed), depth: 0 }];
  const byKey = new Map<string, InternalNode>([[nodes[0].key, nodes[0]]]);
  const edges: SolutionEdge[] = [];
  const edgeKeys = new Set<string>();
  const queue: InternalNode[] = [nodes[0]];
  const depthCapped: InternalNode[] = [];
  let costStop = false;
  let expanding: InternalNode | undefined;

  while (queue.length > 0 && !costStop) {
    expanding = queue.shift()!;
    if (expanding.depth >= budget.maxDepth) {
      // 深度触顶仍有可展开规则 → 该节点未覆盖（DEPTH_EXCEEDED）
      if (successorsOf(expanding, mode).length > 0) {
        depthCapped.push(expanding);
      }
      continue;
    }
    for (const successor of successorsOf(expanding, mode)) {
      if (equationKey(successor.sides) === expanding.key) {
        continue; // 自环防御（终止性论证保证不发生，见 transforms.ts 头注）
      }
      if (nodes.length >= budget.maxNodes) {
        costStop = true;
        break;
      }
      const key = equationKey(successor.sides);
      const existing = byKey.get(key);
      let child: InternalNode;
      if (existing !== undefined) {
        // 等价节点合并：只补并连边；BFS 首访即最小 depth，不更新
        child = existing;
      } else {
        child = { id: `n${nodes.length + 1}`, sides: successor.sides, key, depth: expanding.depth + 1 };
        nodes.push(child);
        byKey.set(key, child);
        queue.push(child);
      }
      const edgeKey = `${child.id}<-${expanding.id}:${successor.rule}`;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        edges.push({ from: expanding.id, to: child.id, rule: successor.rule });
      }
    }
  }

  const truncated = costStop || depthCapped.length > 0;
  const flag: SpaceTruncationFlag = costStop ? "COST_EXCEEDED" : "DEPTH_EXCEEDED";
  const uncovered = new Set<string>(depthCapped.map((node) => node.id));
  if (costStop && expanding !== undefined) {
    // 被截断时正在展开的节点后继未全部入图，连同未展开的 queue 一并未覆盖
    uncovered.add(expanding.id);
    for (const node of queue) {
      uncovered.add(node.id);
    }
  }
  const serialized = serializeNodes(nodes);
  return {
    truncated,
    uncoveredNodeIds: [...uncovered],
    space: {
      nodes: serialized,
      edges,
      rootId: nodes[0].id,
      terminalIds: serialized.filter((node) => node.terminal).map((node) => node.id),
      budget,
      truncated,
      ...(truncated ? { truncation: { flag, uncoveredNodeIds: [...uncovered] } } : {}),
    },
  };
}

/**
 * 关系层模型 → 解题空间 DAG（Task 4 入口）。
 *
 * 三态（01 §5，无静默错判）：
 * - ok：预算内全量生成且存在终态；
 * - partial：预算超限，space 为单路径回退产物（含解），flag/uncoveredNodeIds
 *   明示全量展开中被截断、未校验的 frontier 节点；
 * - no_path：种子方程无法解析，或全量展开后无终态（恒等/矛盾方程）。
 */
export function generateSolutionSpace(model: RelationModel, options?: { budget?: SpaceBudget }): SolutionSpaceResult {
  const budget = options?.budget ?? budgetFor(model.appliedRules);
  const parsed = parseEquation(model.equation);
  if (isEquationParseFailure(parsed)) {
    return {
      status: "no_path",
      reason: `种子方程无法解析：${parsed.reason}（01 §5 DAG_NO_PATH：解题空间无入口，不静默错判）`,
    };
  }
  const full = runExpansion(parsed, budget, "full");
  if (!full.truncated) {
    if (full.space.terminalIds.length === 0) {
      return {
        status: "no_path",
        reason: "方程无可行变换路径或无解（恒等/矛盾方程），显式报 DAG_NO_PATH（01 §5）",
      };
    }
    return { status: "ok", space: full.space };
  }
  // 超预算 → 按需单路径回退（spec.md §8）：回退按默认预算封顶保证终止，
  // 注入预算只约束全量 DAG 的覆盖范围；截断信息由 flag/uncoveredNodeIds 承载。
  const fallback = runExpansion(parsed, DEFAULT_SPACE_BUDGET, "single");
  return {
    status: "partial",
    space: fallback.space,
    flag: full.space.truncation!.flag,
    uncoveredNodeIds: full.uncoveredNodeIds,
  };
}
