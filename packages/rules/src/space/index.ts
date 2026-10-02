/**
 * 解题空间生成模块（Task 4）再导出。
 *
 * 与 model/index.ts 同款风格：入口 generateSolutionSpace 供 Task 5 对齐层与
 * Task 6 逆向校验消费；方程适配器与变换规则导出供测试与调试。
 */

export { generateSolutionSpace } from "./expand.js";
export {
  equationKey,
  isEquationParseFailure,
  normalizeSides,
  parseEquation,
  renderEquation,
  type EquationParseFailure,
  type EquationSides,
  type ParseEquationResult,
} from "./equation.js";
export {
  EQ_EVAL,
  EQ_ISOLATE,
  EQ_MERGE,
  EQ_MOVE,
  EQ_TRANSFORMS,
  type EquationTransform,
} from "./transforms.js";
export {
  BUDGET_TIERS,
  budgetFor,
  DEFAULT_SPACE_BUDGET,
  type BudgetTierId,
  type SolutionEdge,
  type SolutionNode,
  type SolutionSpace,
  type SolutionSpaceResult,
  type SolutionValue,
  type SpaceBudget,
  type SpaceTruncation,
  type SpaceTruncationFlag,
} from "./types.js";
