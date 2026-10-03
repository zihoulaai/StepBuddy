/**
 * 结构化编排（Task 6.1/6.2：题面 → Extraction → RelationModel；Task 7：失败按 01 §5
 * 退出码三分支显式返回，编排层据此分流话术/系统异常）。
 *
 * 规格依据：
 * - rules model/index.ts 头注：LLM 产出同构 Extraction 后走同一 applyRules 判定层（D3）；
 * - 归档 04 §8.2：锁定的 prompt 与零温度原样重发（重发是容错不是投票，禁多数表决）；
 * - 归档 13 D-2 / 04 §2.3：重试 3 次仍失败 → 未产出 IR；
 * - 01 §5：失败必须显式（UNPARSABLE_INPUT / MODEL_FAILED / DEPENDENCY_UNAVAILABLE，
 *   Task 7 决策 D1 按字面分流），不静默错判。
 *
 * 无静默错判守卫：本模块不存在「尽力返回一个猜测 IR」的分支——
 * 任何失败只进 failed + 退出码，suggestion 恒为 human_review。
 */

import { applyRules, type Extraction, type RelationModel } from "@stepbuddy/rules";
import { extractionSchema, toExtraction, type ExtractionDto } from "./schema.js";
import { assertWithinBudget, buildStructureMessages } from "./template.js";
import { MODEL_VERSION, type LlmAttempt, type LlmClient, type StructureExitCode } from "./types.js";
import { assertOutbound } from "./whitelist.js";

export type StructureOutcome =
  | { status: "ok"; model: RelationModel; extraction: Extraction; attempts: number }
  | {
      status: "failed";
      /**
       * 01 §5 退出码分流（Task 7 决策 D1）：
       * - UNPARSABLE_INPUT：内容 3 轮未过 schema 校验（「识别三次仍失败」）；
       * - MODEL_FAILED：规则层不适用（应用题专属「该题题意无法解析」）；
       * - DEPENDENCY_UNAVAILABLE：token 预算超 / 传输层失败（系统类，HTTP 503）。
       */
      exitCode: StructureExitCode;
      reason: string;
      /** 传输层失败记录（LLM 不可用/超时/HTTP），内容校验失败轮不含传输错误 */
      attempts: LlmAttempt[];
      suggestion: "human_review";
    };

/** 内容校验轮数上限（归档 13 D-2「重试 3 次」的内容层落地；prompt 与温度不变） */
export const STRUCTURE_CONTENT_ROUNDS = 3;

/** 剥 markdown code fence + JSON.parse + zod safeParse；纯函数，任何一步不过返回 null */
export function parseExtractionContent(raw: string): ExtractionDto | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = (fenced?.[1] ?? raw).trim();
  if (jsonText.length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const result = extractionSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function failed(
  exitCode: StructureExitCode,
  reason: string,
  attempts: readonly LlmAttempt[],
): StructureOutcome {
  return {
    status: "failed",
    exitCode,
    reason,
    attempts: [...attempts],
    suggestion: "human_review",
  };
}

/**
 * 题面文本 → 关系层模型（LLM 结构化 + rules 判定），失败按 01 §5 退出码显式返回。
 */
export async function structureQuestion(
  questionText: string,
  client: LlmClient,
): Promise<StructureOutcome> {
  // C-7 预实现：出站载荷只有题面文本（白名单字段）
  assertOutbound({ questionText });

  const { messages } = buildStructureMessages(questionText);
  try {
    assertWithinBudget("question", messages);
  } catch (error) {
    return failed("DEPENDENCY_UNAVAILABLE", `token 预算超限：${(error as Error).message}`, []);
  }

  const transportAttempts: LlmAttempt[] = [];
  for (let round = 1; round <= STRUCTURE_CONTENT_ROUNDS; round += 1) {
    const result = await client.complete({
      model: MODEL_VERSION,
      messages,
      temperature: 0,
    });
    if (!result.ok) {
      transportAttempts.push(...result.attempts);
      return failed(
        "DEPENDENCY_UNAVAILABLE",
        `LLM 调用失败（第 ${round} 轮）：${result.attempts.map((a) => `${a.code}#${a.attempt}`).join(",")}` +
          "（归档 13 D-2：结构化不可用，系统类失败，不进入规则引擎）",
        result.attempts,
      );
    }
    const dto = parseExtractionContent(result.response.content);
    if (dto === null) {
      // 内容不合格：同 prompt 原样重发（归档 04 §8.2：不做变体、不取多数）
      continue;
    }
    const extraction = toExtraction(dto);

    const modelResult = applyRules(extraction);
    if ("code" in modelResult) {
      return failed("MODEL_FAILED", `规则层建模失败：${modelResult.reason}`, transportAttempts);
    }
    return { status: "ok", model: modelResult, extraction, attempts: round };
  }

  return failed(
    "UNPARSABLE_INPUT",
    `LLM 产出连续 ${STRUCTURE_CONTENT_ROUNDS} 轮未通过schema校验（归档 04 §2.3：重试 3 次仍失败 → 未产出 IR）`,
    transportAttempts,
  );
}
