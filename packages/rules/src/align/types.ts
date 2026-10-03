/**
 * 前向对齐、溯源与错误分类（Task 5.1–5.4）的输入/输出类型。
 *
 * 规格依据：
 * - 01 §4.1 前向溯源五步（锚定/前推/代价/空候选处置/继承标记）；
 * - 01 §4.2 代价函数与四档阈值；§4.3 容差量化；§4.4 错误分类与规则级定位；
 * - §4.5 笔误三条件；§4.6 跳步；§5 退出码（ALIGN_FAILED/INVALID_EXPR）；
 * - 归档 v2-full-scope 03 §2.2 对齐算法、§2.3 多路径判定、§3.2 代价五分量、
 *   §5.1 provenance 逆向推导、§6.1 三类错误；
 * - docs/specs/03 §1.1 逐步结果字段、§1.2 错误明细（本类型与其同构，
 *   组装为契约 StepResult/ErrorDetail 在 Task 7；rules 层不依赖 contracts）。
 *
 * 决策索引：D3（学生步骤=方程状态序列）、D15（cost 输出 {num,den}）、
 * D16（verdict 规则）、D10（not_judged + 退出码）。
 */

import type { RelationModel } from "../model/types.js";
import type { SolutionSpace, SolutionValue } from "../space/types.js";

/** 学生单步：方程状态（Task 7 从 StepIR.raw_text 提取后传入；非方程步骤由编排层过滤） */
export type StudentEquationStep = {
  equation: string; // 如 "x + (x + 10) = 80"、"2x+10=80"（容忍 Task 4 parseEquation 的隐式乘法）
  source: "photo" | "manual"; // 01 §3.2；笔误判定仅 photo 可判（归档 03 §5.3 仅 OCR/照片来源）
};

export type AlignmentInput = {
  space: SolutionSpace; // Task 4 输出（no_path 由 Task 7 转 DAG_NO_PATH，不进对齐）
  model: RelationModel; // Task 3：第 1 步锚定 + 建模错误关系层定位
  steps: StudentEquationStep[];
  /** 容差量化（01 §4.3；Task 7 从 IR constraint 传入，缺省不启用 approximate 等级） */
  tolerance?: Tolerance;
};

/** 容差量化（01 §4.3）：decimalPlaces=N → |Δ| ≤ 0.5×10⁻ᴺ；estimation → |Δ| ≤ 0.5 */
export type Tolerance = { decimalPlaces?: number; estimation?: boolean };

export type StepStatus = "correct" | "incorrect" | "inherited" | "not_judged";
export type ErrorRole = "source" | "concurrent" | "inherited";
export type ErrorClassification = "knowledge" | "behavioral" | "normative";
export type ErrorSubtype = "slip" | "miscalc";

/** 单步判定（03 §1.1 字段同构；cost 用 {num,den} JSON 安全形状，同 SolutionValue） */
export type StepJudgment = {
  index: number; // 0 起，与输入 steps 对齐
  status: StepStatus;
  nodeId: string | null; // 判对=命中节点；判错=应到而未到的期望节点；继承/未判为 null
  cost: SolutionValue | null; // 对齐代价（Rational 换算）；not_judged 为 null
  equivalenceLevel: "strict" | "formal" | "approximate" | null;
  skippedTransforms: number; // 01 §4.6 跳步数（hops−1）
  transforms?: string[]; // 03 §1.1：判对=实际沿边规则；判错=应走而未走（violated）
  error?: StepError;
  pathSuggestion?: string[]; // 5.3：走了非推荐合法路径时给推荐路径节点文本
  pathCompletion?: string[]; // 跳步补全路径节点 id（供 Task 7 生成逆向解释文案）
  note?: string; // 判对时的确定性提示（如 B-3 上下文裁决说明）
};

export type StepError = {
  role: ErrorRole; // 03 §1.2：source 扣分主体 / concurrent 次要 / inherited 不重复扣分
  classification: ErrorClassification;
  subtype?: ErrorSubtype; // 03 §1.2
  ruleId?: string; // 规则级定位（ALG.EQ.*）
  relationLocation?: {
    // 建模错误的关系层定位（01 §4.4：主体、基准、运算与题意不符）
    predicate: string;
    subject: string;
    reference: string;
    expected: string; // 期望项（带符号 canonical 文本，如 "+10"）
    actual: string; // 学生实际项（如 "-10"；漏项记 "（漏写）"）
  };
  location?: { span: string; hint: string }; // 03 §1.2 location
  reason: string; // 面向教师的确定性模板文案
  traceable: boolean; // false 的原因 Task 7 不得放入错误原因区（03 §1.2）
};

export type DiagnosisOutcome = {
  verdict: "correct" | "incorrect" | "partial";
  steps: StepJudgment[];
  sourceError: {
    stepIndex: number;
    classification: ErrorClassification;
    ruleId?: string;
    reason: string;
  } | null;
  fallback?: { exitCode: "ALIGN_FAILED" | "INVALID_EXPR" | "ANSWER_ONLY"; stepIndex: number | null };
  recommendedPath: string[]; // 推荐路径节点 id 序列（DAG 内最短 root→terminal）
};
