/**
 * LLM 适配层桶出（Task 6：tasks.md 6.1 结构化 / 6.2 降级 / 6.3 白名单）。
 *
 * 上游规格：tasks.md Task 6；docs/specs/01 §4.0/§5；PRD L203-218（C-7、token 上限）；
 * 归档 v2-full-scope 13 §1（依赖契约与降级）、04 §8.2（确定性锁定）。
 *
 * 依赖方向：types ← template/whitelist ← schema ← structure/explain；client 只见端口类型。
 * contracts/rules 零改动：MODEL_FAILED 已在 FALLBACK_EXIT_CODES，versions schema 已就绪。
 */

export {
  MODEL_VERSION,
  PROMPT_TEMPLATE_VERSION,
  type ExplainInput,
  type LlmAttempt,
  type LlmClient,
  type LlmErrorCode,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmResult,
  type LlmRole,
  type StepExplanation,
} from "./types.js";

export {
  assertWithinBudget,
  buildExplainMessages,
  buildStructureMessages,
  estimateMessagesTokens,
  estimateTokens,
  TOKEN_BUDGET,
  TokenBudgetExceeded,
  type BudgetKind,
} from "./template.js";

export {
  assertOutbound,
  OUTBOUND_WHITELIST,
  OutboundWhitelistViolation,
  outboundPayload,
  type OutboundField,
} from "./whitelist.js";

export {
  clauseSchema,
  entitySchema,
  EXTRACTION_RELATIONS,
  extractionSchema,
  toExtraction,
  type ExtractionDto,
} from "./schema.js";

export { createFetchClient, type FetchClientOptions } from "./client.js";

export {
  parseExtractionContent,
  STRUCTURE_CONTENT_ROUNDS,
  structureQuestion,
  type StructureOutcome,
} from "./structure.js";

export {
  EXPLAIN_FALLBACK_NOTICE,
  explainQuestion,
  renderTemplateExplanation,
  type ExplainOutcome,
} from "./explain.js";
