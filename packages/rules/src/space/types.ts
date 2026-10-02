/**
 * 解题空间 DAG 类型与预算分档（Task 4：01 §4.0 解题空间生成、§5 退出码）。
 *
 * 规格依据：
 * - 01 §4.0 完整机制「关系层建模 → 解题空间生成 → 步骤对齐 → 前向溯源」的第二环；
 * - 01 §5 退出码：DAG_NO_PATH / DEPTH_EXCEEDED / COST_EXCEEDED，
 *   部分结果必须明确告知「未覆盖的部分未校验」；
 * - 归档 v2-full-scope PRD §4.3.2：DAG 生成逻辑/剪枝（等价节点合并、深度限制）；
 * - 归档 v2-full-scope specs 07 §2：预算分档「P0 不设固定值、基线压测后确定」——
 *   本文件的数值为占位（D5），结构先落地，Task 9 压测后校准；
 * - spec.md §7.3/§8：节点/深度超预算 → 按需单路径搜索（禁用分配律展开）。
 *
 * DAG 是 rules 层内部结构（D2：输入为 Task 3 的 RelationModel.equation），
 * 不在 docs/specs/01 字段表内，contracts 零改动。
 */

/* ------------------------------------------------------------------ */
/* 预算                                                                 */
/* ------------------------------------------------------------------ */

/** 解题空间预算：节点数与深度双上限（超限走部分结果，01 §5） */
export type SpaceBudget = { maxDepth: number; maxNodes: number };

/** 预算档位标识：与 Task 3 ModelRule.family 同名（REL.MODEL.<FAMILY>.* 第 3 段） */
export type BudgetTierId = "SUMDIFF" | "MULTIPLE" | "TOTAL" | "NORMALIZE";

/**
 * 分档数值（占位，待 Task 9 基线压测校准——归档 07 §2 不写死口径）。
 * 实测 MVP 样例 DAG 约 2–10 节点、深度 ≤7，预算留约 10× 余量。
 */
export const BUDGET_TIERS: Readonly<Record<BudgetTierId, SpaceBudget>> = {
  SUMDIFF: { maxDepth: 12, maxNodes: 160 },
  MULTIPLE: { maxDepth: 12, maxNodes: 160 },
  TOTAL: { maxDepth: 8, maxNodes: 64 },
  NORMALIZE: { maxDepth: 12, maxNodes: 160 },
};

/** 兜底档：无族名匹配时使用（含单路径回退的封顶值，保证终止） */
export const DEFAULT_SPACE_BUDGET: SpaceBudget = { maxDepth: 12, maxNodes: 256 };

/**
 * 按 appliedRules 选预算档：从 `REL.MODEL.<FAMILY>.<VARIANT>` 第 3 段取族名，
 * 无匹配落 DEFAULT。纯函数（M-6）。
 */
export function budgetFor(appliedRules: readonly string[]): SpaceBudget {
  for (const ruleId of appliedRules) {
    const family = ruleId.split(".")[2];
    if (family !== undefined && family in BUDGET_TIERS) {
      return BUDGET_TIERS[family as BudgetTierId];
    }
  }
  return DEFAULT_SPACE_BUDGET;
}

/* ------------------------------------------------------------------ */
/* DAG 结构                                                             */
/* ------------------------------------------------------------------ */

/** 解值：JSON 安全数对（对齐 ModelEntity.value 形状；Rational 仅规则层内部使用） */
export type SolutionValue = { num: number; den: number };

/**
 * DAG 节点：一个方程状态（两侧 canonical 文本 + 展示串）。
 * id 按 BFS 创建序 `n1,n2…`；solution 仅 terminal 节点有值。
 */
export type SolutionNode = {
  id: string;
  left: string;
  right: string;
  text: string;
  depth: number;
  terminal: boolean;
  solution?: SolutionValue;
};

/** DAG 边：rule 为元规则标识（ALG.EQ.*）；保留多入边——收敛节点有多个父 */
export type SolutionEdge = { from: string; to: string; rule: string };

/** 截断标志（01 §5）：DEPTH_EXCEEDED 深度触顶 / COST_EXCEEDED 节点数超预算 */
export type SpaceTruncationFlag = "DEPTH_EXCEEDED" | "COST_EXCEEDED";

/** 截断信息：未覆盖的 frontier 节点（Task 5/7 据此明示「未覆盖部分未校验」） */
export type SpaceTruncation = { flag: SpaceTruncationFlag; uncoveredNodeIds: string[] };

/**
 * 解题空间：ok 时为全量 DAG；partial 时为单路径回退产物（一条 root→解 的完整路径，
 * spec.md §8 按需单路径搜索），此时 flag/uncoveredNodeIds 承载全量展开的截断信息，
 * truncated/truncation 仅描述本 space 自身是否仍被预算截断（罕见兜底）。
 */
export type SolutionSpace = {
  nodes: SolutionNode[];
  edges: SolutionEdge[];
  rootId: string;
  terminalIds: string[];
  budget: SpaceBudget;
  truncated: boolean;
  truncation?: SpaceTruncation;
};

/**
 * 生成结果（01 §5 三态，无静默错判）：
 * - ok：预算内全量生成且存在终态；
 * - partial：预算超限，space 为单路径回退（含解），flag/uncoveredNodeIds 明示未覆盖部分；
 * - no_path：种子方程无法解析或全量展开无终态（恒等/矛盾方程，DAG_NO_PATH）。
 */
export type SolutionSpaceResult =
  | { status: "ok"; space: SolutionSpace }
  | { status: "partial"; space: SolutionSpace; flag: SpaceTruncationFlag; uncoveredNodeIds: string[] }
  | { status: "no_path"; reason: string };
