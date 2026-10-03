import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DiagnoseForm } from "../src/components/DiagnoseForm";

/**
 * 录入表单测试（Task 8.1 WEB-FORM 系列）。
 */

function fill(texts: { question?: string; steps?: string }): void {
  const boxes = screen.getAllByRole("textbox") as HTMLTextAreaElement[];
  fireEvent.change(boxes[0], { target: { value: texts.question ?? "" } });
  fireEvent.change(boxes[1], { target: { value: texts.steps ?? "" } });
}

describe("DiagnoseForm", () => {
  it("WEB-FORM-01 空输入禁用提交", () => {
    render(<DiagnoseForm submitting={false} onSubmit={() => {}} />);
    expect(screen.getByRole("button", { name: "开始诊断" })).toBeDisabled();
  });

  it("WEB-FORM-02 填写两框后提交：题目 trim、步骤原样、source 缺省 manual", () => {
    const onSubmit = vi.fn();
    render(<DiagnoseForm submitting={false} onSubmit={onSubmit} />);
    fill({ question: "  甲和乙一共80个  ", steps: "x+10+x=80\n2*x=80-10" });
    const button = screen.getByRole("button", { name: "开始诊断" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith({
      questionText: "甲和乙一共80个",
      studentStepsText: "x+10+x=80\n2*x=80-10",
      source: "manual",
    });
  });

  it("WEB-FORM-03 photo 单选提交 source=photo；submitting 时禁用提交", () => {
    const onSubmit = vi.fn();
    render(<DiagnoseForm submitting={false} onSubmit={onSubmit} />);
    fill({ question: "题面", steps: "x=1" });
    fireEvent.click(screen.getByRole("radio", { name: "照片识别" }));
    fireEvent.click(screen.getByRole("button", { name: "开始诊断" }));
    expect(onSubmit).toHaveBeenCalledWith({ questionText: "题面", studentStepsText: "x=1", source: "photo" });

    const onSubmit2 = vi.fn();
    render(<DiagnoseForm submitting={true} onSubmit={onSubmit2} />);
    expect(screen.getByRole("button", { name: /诊断中/ })).toBeDisabled();
  });
});
