/**
 * 请求层错误条（Task 8：01 §6 界面四态之「错误」的最小实现）。
 *
 * 区分两类：系统异常（503 依赖不可用 / 网络失败 → 可重试）与
 * 业务输入问题（400 请求不完整或含无法解析的行 → 改输入）。
 * 数据过期态（旧规则库版本结果提示）属完整版，MVP 不实现。
 */
export function ErrorBanner({ status, code }: { status: number; code: string }) {
  const message =
    status === 503 || code === "E-DEPENDENCY-UNAVAILABLE"
      ? "诊断服务暂不可用（LLM 依赖失败），请稍后重试或转人工"
      : status === 400 || code === "E-BAD-REQUEST"
        ? "请求内容不完整或有无法解析的行，请检查输入"
        : status === 0
          ? "网络异常，请确认本地服务已启动后重试"
          : "服务内部错误，请重试；持续失败请转人工";
  return (
    <p className="banner banner-fail" role="alert" data-testid="error-banner">
      {message}
    </p>
  );
}
