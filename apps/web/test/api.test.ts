import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagnoseApiError, diagnoseSubmission } from "../src/lib/api";
import { CORRECT_RESULT } from "./fixtures";

/**
 * 请求层测试（Task 8：WEB-API 系列）。mock global fetch，不起服务。
 */

function jsonResponse(body: unknown, init: { ok: boolean; status: number }): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("diagnoseSubmission", () => {
  it("WEB-API-01 200 → 返回 DiagnosisResult；请求形状为 POST JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CORRECT_RESULT, { ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await diagnoseSubmission({
      questionText: "甲和乙一共80个，甲比乙多10个，求甲和乙",
      studentStepsText: "x+10+x=80\n2*x=80-10",
      source: "manual",
    });

    expect(result).toEqual(CORRECT_RESULT);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/v1/diagnose");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      questionText: "甲和乙一共80个，甲比乙多10个，求甲和乙",
      studentStepsText: "x+10+x=80\n2*x=80-10",
      source: "manual",
    });
  });

  it("WEB-API-02 503 → DiagnoseApiError 携 status/code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ error: "E-DEPENDENCY-UNAVAILABLE" }, { ok: false, status: 503 }),
    ));
    await expect(diagnoseSubmission({ questionText: "q", studentStepsText: "s", source: "manual" }))
      .rejects.toMatchObject({ name: "DiagnoseApiError", status: 503, code: "E-DEPENDENCY-UNAVAILABLE" });
  });

  it("WEB-API-03 400 → DiagnoseApiError E-BAD-REQUEST", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ error: "E-BAD-REQUEST" }, { ok: false, status: 400 }),
    ));
    const error = await diagnoseSubmission({ questionText: "q", studentStepsText: "s", source: "manual" })
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(DiagnoseApiError);
    expect((error as DiagnoseApiError).code).toBe("E-BAD-REQUEST");
  });

  it("WEB-API-04 网络失败 → code 兜底 E-NETWORK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const error = await diagnoseSubmission({ questionText: "q", studentStepsText: "s", source: "manual" })
      .catch((thrown: unknown) => thrown);
    expect((error as DiagnoseApiError).status).toBe(0);
    expect((error as DiagnoseApiError).code).toBe("E-NETWORK");
  });
});
