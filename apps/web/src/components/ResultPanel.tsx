import type { DiagnosisResult } from "@stepbuddy/contracts";
import { StepCard } from "./StepCard";
import {
  isModelingFailure,
  recommendedPath,
  stepItems,
  teachingNotes,
  VERDICT_LABELS,
} from "../lib/viewmodel";

/**
 * 诊断结果面板（Task 8.2）。
 *
 * 展示契约 03 §1：verdict / fallback / source_error / steps / teaching / versions。
 * - 建模拟败（MODEL_FAILED/DAG_NO_PATH/UNPARSABLE_INPUT）走醒目提示条；
 * - 其余 fallback（含部分结果尾注，api 已合成 user_message）走中性提示条；
 * - 正确路径、路径建议/补全/note 取自 teaching（api 只保留首个）；
 * - 复核信息默认可见（03 §1：四项版本缺一不可复核，评测人员需要看见）。
 * - transforms / confidence / knowledge_points 不渲染（Task 7 已知边界与 MVP 边界）。
 */
export function ResultPanel({ result }: { result: DiagnosisResult }) {
  const modelingFailure = isModelingFailure(result);
  const path = recommendedPath(result);
  const steps = stepItems(result);
  const notes = teachingNotes(result);

  return (
    <section className="result-panel">
      <div className="result-head">
        <span className={`verdict verdict-${result.verdict}`} data-testid="verdict">
          {VERDICT_LABELS[result.verdict]}
        </span>
        <span className="result-id" data-testid="result-id">
          结果编号 {result.result_id}
        </span>
      </div>

      {result.fallback !== undefined && (
        <p
          className={modelingFailure ? "banner banner-fail" : "banner banner-info"}
          role="alert"
          data-testid={modelingFailure ? "modeling-failure" : "fallback-notice"}
        >
          {result.fallback.user_message}
        </p>
      )}

      {result.source_error !== null && (
        <div className="source-error" data-testid="source-error">
          <p>
            源头错误：第 {result.source_error.step_index} 步
            {result.source_error.rule_id !== undefined && `（${result.source_error.rule_id}）`}
          </p>
          <p>{result.source_error.reason}</p>
        </div>
      )}

      {steps.length > 0 && (
        <>
          <h2>逐步判定</h2>
          <ul className="step-list">
            {steps.map((step) => (
              <StepCard key={step.index} step={step} />
            ))}
          </ul>
        </>
      )}

      {path.length > 0 && (
        <>
          <h2>正确路径</h2>
          <ol className="recommended-path" data-testid="recommended-path">
            {path.map((node) => (
              <li key={node}>
                <code>{node}</code>
              </li>
            ))}
          </ol>
        </>
      )}

      {(notes.pathSuggestion !== undefined ||
        notes.pathCompletion !== undefined ||
        notes.note !== undefined) && (
        <div className="teaching-notes">
          {notes.pathSuggestion !== undefined && <p>路径建议：{notes.pathSuggestion}</p>}
          {notes.pathCompletion !== undefined && <p>跳步补全：{notes.pathCompletion}</p>}
          {notes.note !== undefined && <p>提示：{notes.note}</p>}
        </div>
      )}

      <div className="replay-info" data-testid="replay-info">
        <h2>复核信息</h2>
        <dl>
          <dt>结果 schema 版本</dt>
          <dd>{result.schema_version}</dd>
          <dt>IR schema 版本</dt>
          <dd>{result.versions.ir_schema_version}</dd>
          <dt>规则库版本</dt>
          <dd>{result.versions.rule_lib_version}</dd>
          <dt>模型版本</dt>
          <dd>{result.versions.model_version}</dd>
          <dt>提示词模板版本</dt>
          <dd>{result.versions.prompt_template_version}</dd>
        </dl>
      </div>
    </section>
  );
}
