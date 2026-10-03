/**
 * 诊断请求封装（Task 8.1：web → api 唯一出口）。
 *
 * 契约：POST /v1/diagnose（Task 7，apps/api/src/index.ts）。
 * - 200 → DiagnosisResult（contracts zod schema 收尾的产物，此处 type-only 消费）；
 * - 4xx/5xx → 响应体 { error: string }，抛 DiagnoseApiError（status + code）；
 * - 网络失败/响应体非 JSON → code 兜底 "E-NETWORK"。
 * MVP 单机走 vite dev proxy（同源 /v1），无 CORS、无超时控制。
 */

import type { DiagnosisResult } from "@stepbuddy/contracts";

/** 请求层错误：status 为 HTTP 状态码（网络失败时为 0），code 取响应体 error 字段 */
export class DiagnoseApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`诊断请求失败：HTTP ${status} ${code}`);
    this.name = "DiagnoseApiError";
  }
}

export type DiagnoseRequest = {
  questionText: string;
  studentStepsText: string;
  source: "photo" | "manual";
};

export async function diagnoseSubmission(request: DiagnoseRequest): Promise<DiagnosisResult> {
  let response: Response;
  try {
    response = await fetch("/v1/diagnose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new DiagnoseApiError(0, "E-NETWORK");
  }
  if (response.ok) {
    return (await response.json()) as DiagnosisResult;
  }
  let code = "E-UNKNOWN";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string") {
      code = body.error;
    }
  } catch {
    // 响应体非 JSON：保留兜底 code
  }
  throw new DiagnoseApiError(response.status, code);
}
