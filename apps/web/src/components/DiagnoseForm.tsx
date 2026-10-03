import { useState, type FormEvent } from "react";
import type { DiagnoseRequest } from "../lib/api";

/**
 * 诊断录入表单（Task 8.1）。
 *
 * - 题目文本、学生步骤文本均为必填（空串禁用提交）；
 * - 步骤文本一行一个等式（无等号行由 api 判 INVALID_EXPR，web 不预校验——规则单一出处）；
 * - source 缺省 manual；photo 才参与笔误判定（align 层 photo-only 语义）。
 * - submitting 由父组件控制（按钮禁用 + 「诊断中…」）。
 */

export function DiagnoseForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (request: DiagnoseRequest) => void;
}) {
  const [questionText, setQuestionText] = useState("");
  const [studentStepsText, setStudentStepsText] = useState("");
  const [source, setSource] = useState<"photo" | "manual">("manual");

  const canSubmit = questionText.trim() !== "" && studentStepsText.trim() !== "" && !submitting;

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({
      questionText: questionText.trim(),
      studentStepsText,
      source,
    });
  }

  return (
    <form className="diagnose-form" onSubmit={handleSubmit}>
      <label className="field">
        <span className="field-label">题目文本</span>
        <textarea
          value={questionText}
          onChange={(event) => setQuestionText(event.target.value)}
          rows={4}
          placeholder="例：甲和乙一共80个，甲比乙多10个，求甲和乙"
          disabled={submitting}
        />
      </label>
      <label className="field">
        <span className="field-label">学生步骤文本</span>
        <textarea
          value={studentStepsText}
          onChange={(event) => setStudentStepsText(event.target.value)}
          rows={6}
          placeholder={"一行一个等式，例：\nx+10+x=80\n2*x+10=80\n2*x=80-10\nx=(80-10)/2"}
          disabled={submitting}
        />
      </label>
      <fieldset className="source-field" disabled={submitting}>
        <legend>步骤来源</legend>
        <label>
          <input
            type="radio"
            name="source"
            value="manual"
            checked={source === "manual"}
            onChange={() => setSource("manual")}
          />
          手动录入
        </label>
        <label>
          <input
            type="radio"
            name="source"
            value="photo"
            checked={source === "photo"}
            onChange={() => setSource("photo")}
          />
          照片识别
        </label>
        <span className="field-hint">仅照片来源判定笔误</span>
      </fieldset>
      <button type="submit" disabled={!canSubmit}>
        {submitting ? "诊断中…" : "开始诊断"}
      </button>
    </form>
  );
}
