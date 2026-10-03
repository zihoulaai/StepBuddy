import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultPanel } from "../src/components/ResultPanel";
import { CORRECT_RESULT, INCORRECT_RESULT, MODEL_FAILED_RESULT, UNTRACEABLE_RESULT } from "./fixtures";

/**
 * 结果面板测试（Task 8.2 WEB-RES 系列）。
 * 含 7.2 UI 守卫：traceable=false 的占位话术出现、噪声原文不得出现。
 */

describe("ResultPanel", () => {
  it("WEB-RES-01 全对样本：verdict 徽标 + 正确路径四步 + 复核信息默认可见", () => {
    render(<ResultPanel result={CORRECT_RESULT} />);
    expect(screen.getByTestId("verdict")).toHaveTextContent("正确");
    const path = screen.getByTestId("recommended-path");
    expect(path.querySelectorAll("li")).toHaveLength(4);
    expect(path).toHaveTextContent("x=(80-10)/2");
    // 复核信息：result_id + 四项版本
    expect(screen.getByTestId("result-id")).toHaveTextContent("r-testcorrect01");
    const replay = screen.getByTestId("replay-info");
    expect(replay).toHaveTextContent("1.0.0");
    expect(replay).toHaveTextContent("0.1.0");
    expect(replay).toHaveTextContent("locked-20260930");
    expect(replay).toHaveTextContent("tpl-2.1");
    // teaching 首个 note/path_suggestion
    expect(screen.getByText(/路径建议/)).toBeInTheDocument();
    expect(screen.queryByTestId("modeling-failure")).toBeNull();
  });

  it("WEB-RES-02 有错样本：source_error 卡片 + 四张步骤卡 + 错误明细字段", () => {
    render(<ResultPanel result={INCORRECT_RESULT} />);
    expect(screen.getByTestId("verdict")).toHaveTextContent("有错误");
    const sourceError = screen.getByTestId("source-error");
    expect(sourceError).toHaveTextContent("源头错误：第 2 步");
    expect(sourceError).toHaveTextContent("ALG.EQ.MOVE");
    const cards = screen.getAllByRole("listitem");
    // 4 步骤卡 + 4 正确路径项 = 8 个 listitem
    expect(cards).toHaveLength(8);
    expect(screen.getByText("源头错误 · 知识性（ALG.EQ.MOVE）")).toBeInTheDocument();
    expect(screen.getByText(/出错片段/)).toHaveTextContent("2*x=80+10");
    // reason 出现两处：source_error 卡片 + 步骤卡 error.reason（预期行为）
    expect(screen.getAllByText(/移项没有变号/)).toHaveLength(2);
  });

  it("WEB-RES-03 建模拟败：醒目提示条渲染 user_message，空 steps 不渲染步骤区", () => {
    render(<ResultPanel result={MODEL_FAILED_RESULT} />);
    const banner = screen.getByTestId("modeling-failure");
    expect(banner).toHaveTextContent("该题题意无法解析，建议人工批改");
    expect(screen.queryByRole("heading", { name: "逐步判定" })).toBeNull();
    expect(screen.getByTestId("verdict")).toHaveTextContent("无法判定");
  });

  it("WEB-RES-04 7.2 UI 守卫：traceable=false 显示占位话术 + 待人工核对小标，噪声原文不外泄", () => {
    const NOISE = "内部规则链 #ALG.EQ.MOVE.substep 推导细节不应外泄";
    render(<ResultPanel result={UNTRACEABLE_RESULT} />);
    expect(screen.queryByText(new RegExp(NOISE))).toBeNull();
    // 占位话术出现两处：source_error 卡片 + 步骤卡 error.reason（7.2 守卫的预期行为）
    expect(screen.getAllByText("该错误无法由规则引擎自动追溯，请结合学生作答过程人工核对")).toHaveLength(2);
    expect(screen.getByText("待人工核对")).toBeInTheDocument();
  });
});
