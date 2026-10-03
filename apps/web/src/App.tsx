import { useState } from "react";
import type { DiagnosisResult } from "@stepbuddy/contracts";
import { diagnoseSubmission, DiagnoseApiError, type DiagnoseRequest } from "./lib/api";
import { DiagnoseForm } from "./components/DiagnoseForm";
import { ResultPanel } from "./components/ResultPanel";
import { ErrorBanner } from "./components/ErrorBanner";

/**
 * 小算星单题诊断工作台（Task 8 页面编排）。
 *
 * 状态机：idle（空态引导）/ submitting（加载）/ result | error。
 * 录入-查看闭环同屏完成：表单提交 → POST /v1/diagnose → 结果面板。
 * 数据过期态（01 §6，旧规则库版本比对）属完整版，MVP 不实现。
 */
export function App() {
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ status: number; code: string } | null>(null);

  async function handleSubmit(request: DiagnoseRequest): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const diagnosis = await diagnoseSubmission(request);
      setResult(diagnosis);
    } catch (thrown) {
      if (thrown instanceof DiagnoseApiError) {
        setError({ status: thrown.status, code: thrown.code });
      } else {
        setError({ status: 0, code: "E-UNKNOWN" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="workbench">
      <h1>小算星 · 单题诊断</h1>
      <DiagnoseForm submitting={submitting} onSubmit={handleSubmit} />
      <section className="result-area">
        {error !== null && <ErrorBanner status={error.status} code={error.code} />}
        {result !== null ? (
          <ResultPanel result={result} />
        ) : (
          !submitting &&
          error === null && <p className="empty-hint">录入题目与学生步骤，开始单题诊断</p>
        )}
      </section>
    </main>
  );
}
