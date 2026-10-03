import type { StepView } from "../lib/viewmodel";

/**
 * 单步判定卡片（Task 8.2：错误步骤 + 错误分类与原因）。
 *
 * - 状态徽标四态（correct/incorrect/inherited/not_judged）；
 * - error 明细：role · classification · subtype · rule_id · location · reason；
 * - traceable=false 时加「待人工核对」小标（原因文本已被 api 7.2 守卫占位替换，不改写）；
 * - transforms 不渲染（Task 7 未映射，已知边界）。
 */
export function StepCard({ step }: { step: StepView }) {
  return (
    <li className={`step-card status-${step.status}`}>
      <div className="step-head">
        <span className="step-index">第 {step.index} 步</span>
        <span className={`badge badge-${step.status}`}>{step.statusLabel}</span>
        {step.equivalenceLabel !== undefined && (
          <span className="step-meta">{step.equivalenceLabel}</span>
        )}
        {step.cost !== undefined && <span className="step-meta">代价 {step.cost}</span>}
      </div>
      {step.error !== undefined && (
        <div className="step-error">
          <p className="error-classification">
            {step.error.roleLabel} · {step.error.classificationLabel}
            {step.error.subtypeLabel !== undefined && ` · ${step.error.subtypeLabel}`}
            {step.error.ruleId !== undefined && `（${step.error.ruleId}）`}
          </p>
          {step.error.locationSpan !== undefined && (
            <p className="error-location">
              出错片段：<code>{step.error.locationSpan}</code>
              {step.error.locationHint !== undefined && ` —— ${step.error.locationHint}`}
            </p>
          )}
          <p className="error-reason">
            {step.error.reason}
            {step.error.untraceable && <span className="untraceable-tag">待人工核对</span>}
          </p>
        </div>
      )}
    </li>
  );
}
