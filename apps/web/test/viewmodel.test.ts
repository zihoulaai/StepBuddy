import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_LABELS,
  EQUIVALENCE_LABELS,
  ERROR_ROLE_LABELS,
  isModelingFailure,
  recommendedPath,
  stepItems,
  SUBTYPE_LABELS,
  STEP_STATUS_LABELS,
  teachingNotes,
  VERDICT_LABELS,
} from "../src/lib/viewmodel";
import {
  CORRECT_RESULT,
  INCORRECT_RESULT,
  MODEL_FAILED_RESULT,
  UNTRACEABLE_RESULT,
} from "./fixtures";

/**
 * 视图模型纯映射测试（Task 8.2 WEB-VM 系列）。
 * 标签全枚举穷举断言；teaching 开放 record 的运行时防御；7.2 untraceable 标记。
 */

describe("枚举标签映射", () => {
  it("WEB-VM-01 verdict 四值映射", () => {
    expect(VERDICT_LABELS).toEqual({
      correct: "正确",
      incorrect: "有错误",
      partial: "部分判定",
      unknown: "无法判定",
    });
  });

  it("WEB-VM-02 step status 四值映射", () => {
    expect(STEP_STATUS_LABELS).toEqual({
      correct: "正确",
      incorrect: "错误",
      inherited: "继承错误",
      not_judged: "未判定",
    });
  });

  it("WEB-VM-03 error role / classification / subtype / equivalence 映射", () => {
    expect(ERROR_ROLE_LABELS).toEqual({ source: "源头错误", concurrent: "并发错误", inherited: "继承错误" });
    expect(CLASSIFICATION_LABELS).toEqual({ knowledge: "知识性", behavioral: "行为性", normative: "规范性" });
    expect(SUBTYPE_LABELS).toEqual({ slip: "笔误", miscalc: "计算失误" });
    expect(EQUIVALENCE_LABELS).toEqual({ strict: "严格等价", formal: "形式等价", approximate: "近似等价" });
  });
});

describe("建模拟败判定", () => {
  it("WEB-VM-04 MODEL_FAILED → 真", () => {
    expect(isModelingFailure(MODEL_FAILED_RESULT)).toBe(true);
  });

  it("WEB-VM-05 无 fallback → 假", () => {
    expect(isModelingFailure(CORRECT_RESULT)).toBe(false);
  });

  it("WEB-VM-06 ANSWER_ONLY 等常规 fallback → 假", () => {
    const answerOnly = { ...CORRECT_RESULT, verdict: "unknown" as const, fallback: {
      mode: "answer_only",
      exit_code: "ANSWER_ONLY" as const,
      user_message: "学生只写答案未写过程，本题无法进行步骤诊断",
      partial_steps: 0,
    } };
    expect(isModelingFailure(answerOnly)).toBe(false);
  });
});

describe("teaching 开放 record 的运行时防御", () => {
  it("WEB-VM-07 recommendedPath：正常数组按序取文本", () => {
    expect(recommendedPath(CORRECT_RESULT)).toEqual([
      "x+10+x=80",
      "2*x+10=80",
      "2*x=80-10",
      "x=(80-10)/2",
    ]);
  });

  it("WEB-VM-08 recommendedPath：teaching 缺省或形状异常 → []", () => {
    expect(recommendedPath(MODEL_FAILED_RESULT)).toEqual([]);
    const malformed = { ...CORRECT_RESULT, teaching: { recommended_path: "not-array" } };
    expect(recommendedPath(malformed)).toEqual([]);
    const mixed = { ...CORRECT_RESULT, teaching: { recommended_path: [1, "x=2"] } };
    expect(recommendedPath(mixed)).toEqual(["1", "x=2"]);
  });

  it("WEB-VM-09 teachingNotes：读取字符串字段，非字符串忽略", () => {
    expect(teachingNotes(CORRECT_RESULT)).toEqual({
      pathSuggestion: "2*x+10=80",
      note: "回到推荐路径",
    });
    expect(teachingNotes({ ...CORRECT_RESULT, teaching: { note: 42 } })).toEqual({});
  });
});

describe("步骤视图", () => {
  it("WEB-VM-10 stepItems：状态/等价级/代价/错误明细映射", () => {
    const items = stepItems(INCORRECT_RESULT);
    expect(items.map((item) => item.statusLabel)).toEqual(["正确", "错误", "继承错误", "未判定"]);
    const errored = items[1];
    expect(errored.error).toMatchObject({
      roleLabel: "源头错误",
      classificationLabel: "知识性",
      ruleId: "ALG.EQ.MOVE",
      locationSpan: "2*x=80+10",
      locationHint: "移项应改变符号",
      reason: "移项没有变号：80+10 应为 80-10（ALG.EQ.MOVE 规则误用）",
      untraceable: false,
    });
    expect(items[3].cost).toBeUndefined();
  });

  it("WEB-VM-11 stepItems：traceable=false → untraceable 标记，reason 为占位话术", () => {
    const items = stepItems(UNTRACEABLE_RESULT);
    expect(items[0].error?.untraceable).toBe(true);
    expect(items[0].error?.reason).toBe("该错误无法由规则引擎自动追溯，请结合学生作答过程人工核对");
  });
});
