/**
 * 出站内容字段白名单（Task 6.3：C-7 预实现，Task 20.3 线上校验的本地版）。
 *
 * 规格依据：
 * - PRD L218 / 归档 06 §5 C-7：传给模型服务的内容仅限表达式与步骤文本，
 *   不含姓名、学校、班级、照片；
 * - 归档 13 §1.1-1 数据边界：传出哪些字段、禁止哪些字段；
 * - 01 §5 无静默错判：越界即显式拒绝（fail-closed），不静默剔除——
 *   静默剔除会把「忘了过滤」伪装成「已经过滤」。
 */

/** 允许外发的字段全集（最小化；新增字段必须在此显式登记） */
export const OUTBOUND_WHITELIST = [
  "questionText", // 题面文本（结构化输入）
  "expressionText", // 表达式文本（讲解输入；归档 13 D-3）
  "stepTexts", // 步骤文本（讲解输入；同上）
  "verdict", // 判定结论（讲解输入；同上）
  "errorClassification", // 错误分类（讲解输入；同上）
] as const;

export type OutboundField = (typeof OUTBOUND_WHITELIST)[number];

const WHITELIST_SET: ReadonlySet<string> = new Set(OUTBOUND_WHITELIST);

/** 越界外发：fail-closed 显式拒绝 */
export class OutboundWhitelistViolation extends Error {
  constructor(violations: readonly string[]) {
    super(
      `出站载荷含 C-7 白名单外字段：${violations.join("、")}（PRD L218：仅限表达式与步骤文本，` +
        "不含姓名、学校、班级、照片；拒绝外发）",
    );
    this.name = "OutboundWhitelistViolation";
  }
}

/** 显式拒绝：载荷含任何非白名单键即抛，键名进错误信息（线上排查用） */
export function assertOutbound(payload: Record<string, unknown>): void {
  const violations = Object.keys(payload).filter((key) => !WHITELIST_SET.has(key));
  if (violations.length > 0) {
    throw new OutboundWhitelistViolation(violations);
  }
}

/**
 * 组装侧便利：按白名单字段构造载荷。
 * key 不在白名单 → 抛（编译期 OutboundField 约束 + 运行期双保险）。
 */
export function outboundPayload(
  fields: Partial<Record<OutboundField, string | string[]>>,
): Record<string, string | string[]> {
  assertOutbound(fields as Record<string, unknown>);
  return fields as Record<string, string | string[]>;
}
