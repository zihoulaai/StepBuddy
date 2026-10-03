/**
 * 诊断结果 → 界面视图模型的纯映射（Task 8.2 展示层）。
 *
 * 标签口径来源：
 * - verdict/status/role/classification/subtype/equivalence：docs/specs/03 §1–§1.2；
 * - isModelingFailure 的退出码集合：01 §5（建模拟败与无法解析 teacher-facing 提示）。
 *
 * teaching 是 contracts 开放 record（Task 7 D5），静态类型不可信，
 * 读取处一律运行时 shape 防御。
 */

import type { DiagnosisResult, ErrorDetail, StepResult } from "@stepbuddy/contracts";

/** contracts 未单独导出的成员联合，从 ErrorDetail/StepResult 推导（contracts 零改动） */
type ErrorRole = ErrorDetail["role"];
type ErrorClassification = ErrorDetail["classification"];
type ErrorSubtype = NonNullable<ErrorDetail["subtype"]>;
type EquivalenceLevel = NonNullable<StepResult["equivalence_level"]>;

/* ------------------------------------------------------------------ */
/* 枚举 → 中文标签（全枚举穷举，新增枚举值时 TS 编译报错提醒补映射）        */
/* ------------------------------------------------------------------ */

export const VERDICT_LABELS: Record<DiagnosisResult["verdict"], string> = {
  correct: "正确",
  incorrect: "有错误",
  partial: "部分判定",
  unknown: "无法判定",
};

export const STEP_STATUS_LABELS: Record<StepResult["status"], string> = {
  correct: "正确",
  incorrect: "错误",
  inherited: "继承错误",
  not_judged: "未判定",
};

export const ERROR_ROLE_LABELS: Record<ErrorRole, string> = {
  source: "源头错误",
  concurrent: "并发错误",
  inherited: "继承错误",
};

export const CLASSIFICATION_LABELS: Record<ErrorClassification, string> = {
  knowledge: "知识性",
  behavioral: "行为性",
  normative: "规范性",
};

export const SUBTYPE_LABELS: Record<ErrorSubtype, string> = {
  slip: "笔误",
  miscalc: "计算失误",
};

export const EQUIVALENCE_LABELS: Record<EquivalenceLevel, string> = {
  strict: "严格等价",
  formal: "形式等价",
  approximate: "近似等价",
};

/* ------------------------------------------------------------------ */
/* 建模拟败判定（8.2「建模失败显式提示」）                                */
/* ------------------------------------------------------------------ */

/** 关系无法建模/无法解析类的退出码：教师必须看到显式提示，而非空结果 */
const MODELING_FAILURE_CODES = new Set(["MODEL_FAILED", "DAG_NO_PATH", "UNPARSABLE_INPUT"]);

export function isModelingFailure(result: DiagnosisResult): boolean {
  const code = result.fallback?.exit_code;
  return code !== undefined && MODELING_FAILURE_CODES.has(code);
}

/* ------------------------------------------------------------------ */
/* teaching（开放 record 的运行时防御）                                  */
/* ------------------------------------------------------------------ */

/** 正确路径（节点文本序列）；teaching 缺失或形状异常时返回 [] */
export function recommendedPath(result: DiagnosisResult): string[] {
  const raw: unknown = result.teaching?.recommended_path;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => String(item));
}

/** teaching 开放 record 的字符串字段读取（首个 path_suggestion/path_completion/note） */
function teachingText(result: DiagnosisResult, key: string): string | undefined {
  const raw: unknown = result.teaching?.[key];
  return typeof raw === "string" ? raw : undefined;
}

export interface TeachingNotes {
  pathSuggestion?: string;
  pathCompletion?: string;
  note?: string;
}

export function teachingNotes(result: DiagnosisResult): TeachingNotes {
  const pathSuggestion = teachingText(result, "path_suggestion");
  const pathCompletion = teachingText(result, "path_completion");
  const note = teachingText(result, "note");
  return {
    ...(pathSuggestion !== undefined ? { pathSuggestion } : {}),
    ...(pathCompletion !== undefined ? { pathCompletion } : {}),
    ...(note !== undefined ? { note } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* 步骤视图                                                             */
/* ------------------------------------------------------------------ */

export interface StepErrorView {
  roleLabel: string;
  classificationLabel: string;
  subtypeLabel?: string;
  ruleId?: string;
  locationSpan?: string;
  locationHint?: string;
  reason: string;
  /** 03 §1.2：false 时原因已是组装层占位话术，UI 只加「待人工核对」小标不改写文本 */
  untraceable: boolean;
}

export interface StepView {
  index: number;
  statusLabel: string;
  status: StepResult["status"];
  equivalenceLabel?: string;
  cost?: number;
  error?: StepErrorView;
}

export function stepErrorView(error: ErrorDetail): StepErrorView {
  return {
    roleLabel: ERROR_ROLE_LABELS[error.role],
    classificationLabel: CLASSIFICATION_LABELS[error.classification],
    ...(error.subtype !== undefined ? { subtypeLabel: SUBTYPE_LABELS[error.subtype] } : {}),
    ...(error.rule_id !== undefined ? { ruleId: error.rule_id } : {}),
    ...(error.location !== undefined
      ? { locationSpan: error.location.span, locationHint: error.location.hint }
      : {}),
    reason: error.reason,
    untraceable: !error.traceable,
  };
}

export function stepItems(result: DiagnosisResult): StepView[] {
  return result.steps.map((step) => ({
    index: step.index,
    status: step.status,
    statusLabel: STEP_STATUS_LABELS[step.status],
    ...(step.equivalence_level !== undefined
      ? { equivalenceLabel: EQUIVALENCE_LABELS[step.equivalence_level] }
      : {}),
    ...(step.cost !== undefined ? { cost: step.cost } : {}),
    ...(step.error !== undefined ? { error: stepErrorView(step.error) } : {}),
  }));
}
