/**
 * LlmClient 端口默认实现（Task 6：OpenAI 兼容最小公共面）。
 *
 * 规格依据：
 * - 归档 13 §1.2：业务层不直接依赖供应商接口；不得硬编码供应商专有字段——
 *   只用 /chat/completions 通用形状（model/messages/temperature），供应商细节全在 env；
 * - 归档 13 D-2 / 04 §2.3：重试 3 次后转手输；
 * - 13 §1.1：可用性目标待选型后确定——超时/重试的具体毫秒注释为联调占位；
 * - 01 §5：失败显式返回（ok:false + attempts 溯源），不抛异常炸服务。
 */

import type { LlmAttempt, LlmClient, LlmErrorCode, LlmRequest, LlmResult } from "./types.js";

export type FetchClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  /** 覆盖 LlmRequest.model 的默认模型（通常由调用方传 MODEL_VERSION，此处仅兜底） */
  model?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  defaultTimeoutMs?: number;
  defaultRetries?: number;
};

/** 联调占位值：选型后按 13 §1.1 确定并回填（不得先于选型写死 SLA） */
const FALLBACK_TIMEOUT_MS = 30_000;
const FALLBACK_RETRIES = 3; // 归档 13 D-2：重试 3 次后转手输
const RETRY_BACKOFF_MS = 200;

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
};

function configError(message: string): LlmResult {
  return { ok: false, attempts: [{ code: "CONFIG", message, attempt: 1 }] };
}

function attempt(code: LlmErrorCode, message: string, n: number): LlmAttempt {
  return { code, message, attempt: n };
}

export function createFetchClient(options: FetchClientOptions = {}): LlmClient {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return {
    async complete(request: LlmRequest): Promise<LlmResult> {
      const baseUrl = options.baseUrl ?? process.env.STEPBUDDY_LLM_BASE_URL;
      const apiKey = options.apiKey ?? process.env.STEPBUDDY_LLM_API_KEY;
      const model = request.model;
      if (baseUrl === undefined || apiKey === undefined || model.length === 0) {
        // 缺配置不是「请求失败」：首调即显式告知，调用方转人工确认路径
        return configError(
          "LLM 配置缺失（STEPBUDDY_LLM_BASE_URL / STEPBUDDY_LLM_API_KEY / model）",
        );
      }

      const timeoutMs = options.defaultTimeoutMs ?? request.timeoutMs ?? FALLBACK_TIMEOUT_MS;
      const retries = options.defaultRetries ?? request.retries ?? FALLBACK_RETRIES;
      const attempts: LlmAttempt[] = [];

      for (let round = 1; round <= retries; round += 1) {
        try {
          const response = await doFetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: request.messages,
              temperature: request.temperature, // 恒 0（类型级保证）
              ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (!response.ok) {
            attempts.push(attempt("HTTP", `HTTP ${response.status} ${response.statusText}`, round));
          } else {
            let payload: ChatCompletionResponse;
            try {
              payload = (await response.json()) as ChatCompletionResponse;
            } catch (error) {
              attempts.push(attempt("BAD_RESPONSE", `响应 JSON 解析失败：${String(error)}`, round));
              continue;
            }
            const content = payload.choices?.[0]?.message?.content;
            const respondedModel = payload.model ?? model;
            if (typeof content !== "string") {
              attempts.push(attempt("BAD_RESPONSE", "响应缺少 choices[0].message.content", round));
              continue;
            }
            if (round > 1) {
              // 重试成功：保留前几轮的失败记录供溯源
              return { ok: true, response: { content, model: respondedModel }, attempts: round };
            }
            return { ok: true, response: { content, model: respondedModel }, attempts: 1 };
          }
        } catch (error) {
          const name = error instanceof Error ? error.name : "";
          const code: LlmErrorCode = name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "NETWORK";
          attempts.push(attempt(code, String(error), round));
        }
        if (round < retries) {
          await sleep(RETRY_BACKOFF_MS * round);
        }
      }

      return { ok: false, attempts };
    },
  };
}
