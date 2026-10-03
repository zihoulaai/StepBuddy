/**
 * LLM 适配层端口与版本常量（Task 6：tasks.md 6.1/6.2）。
 *
 * 规格依据：
 * - 归档 13 §1.2：依赖经适配层接入，业务层不直接依赖供应商接口，不得硬编码供应商专有字段；
 * - 归档 04 §8.2：零温度、锁定模型版本、提示词模板版本化并冻结；
 * - 01 §5：失败必须显式（MODEL_FAILED），无静默错判。
 *
 * 本文件只放类型与常量；协议实现见 client.ts。
 */

/** 模型版本锁定（归档 04 §8.2；env 仅供联调切换，默认值为冻结占位） */
export const MODEL_VERSION = process.env.STEPBUDDY_MODEL_VERSION ?? "locked-mvp-0.1";

/** prompt 模板版本（03 §1.4 示例值 tpl-2.1；改模板内容必须同升版本，TPL-01 守卫） */
export const PROMPT_TEMPLATE_VERSION = "tpl-2.1";

export type LlmRole = "system" | "user";

export type LlmMessage = { role: LlmRole; content: string };

/** temperature 类型级钉死为 0：零温度不可被调用方放宽（tasks.md 6.1） */
export type LlmRequest = {
  model: string;
  messages: LlmMessage[];
  temperature: 0;
  maxTokens?: number;
  /** 单次请求超时（毫秒）；具体数值联调后确定（归档 13 §1.1「当前不得写具体数字」） */
  timeoutMs?: number;
  /** 传输层重试次数（归档 13 D-2：重试 3 次后转手输） */
  retries?: number;
};

export type LlmResponse = { content: string; model: string };

export type LlmErrorCode = "CONFIG" | "TIMEOUT" | "HTTP" | "NETWORK" | "BAD_RESPONSE";

/** 单次失败记录：attempt 从 1 起，便于 reason 溯源（不进入教师可见错误原因区） */
export type LlmAttempt = { code: LlmErrorCode; message: string; attempt: number };

export type LlmResult =
  | { ok: true; response: LlmResponse; attempts: number }
  | { ok: false; attempts: LlmAttempt[] };

/** 适配层端口：业务代码只见本接口（归档 13 §1.2） */
export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResult>;
}

/* ------------------------------------------------------------------ */
/* 讲解输入（出站白名单字段，PRD L218 C-7：仅表达式与步骤文本）            */
/* ------------------------------------------------------------------ */

/** 单步讲解素材：表达式文本 + 判定结论（归档 13 D-3：讲解输入仅结构化后的表达式与判定结论） */
export type StepExplanation = {
  expression: string;
  status: string;
  reason?: string;
};

export type ExplainInput = {
  questionText: string;
  steps: StepExplanation[];
};
