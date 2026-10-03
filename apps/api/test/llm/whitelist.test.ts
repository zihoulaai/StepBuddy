import { describe, expect, it } from "vitest";
import {
  assertOutbound,
  OUTBOUND_WHITELIST,
  OutboundWhitelistViolation,
  outboundPayload,
} from "../../src/llm/index.js";

describe("whitelist：C-7 出站白名单（PRD L218，fail-closed）", () => {
  it("WLT-01 白名单载荷全部放行", () => {
    const payload = {
      questionText: "甲和乙一共80个",
      stepTexts: ["x+10+x=80", "2*x+10=80"],
      expressionText: "2*x+10=80",
      verdict: "incorrect",
      errorClassification: "knowledge",
    };
    expect(() => assertOutbound(payload)).not.toThrow();
    expect(OUTBOUND_WHITELIST).toContain("questionText");
  });

  it("WLT-02 四类禁词（姓名/学校/班级/照片）逐个触发显式拒绝，键名进错误信息", () => {
    for (const key of ["studentName", "school", "className", "photo"]) {
      expect(() => assertOutbound({ questionText: "题面", [key]: "x" })).toThrow(
        OutboundWhitelistViolation,
      );
      try {
        assertOutbound({ questionText: "题面", [key]: "x" });
      } catch (error) {
        expect((error as Error).message).toContain(key);
      }
    }
  });

  it("WLT-03 outboundPayload 越界键抛（不静默剔除：剔除会把漏过滤伪装成已过滤）", () => {
    expect(() => outboundPayload({ questionText: "题面" })).not.toThrow();
    // @ts-expect-error 越界键编译期即不容许；运行期双保险
    expect(() => outboundPayload({ studentName: "张三" })).toThrow(OutboundWhitelistViolation);
  });
});
