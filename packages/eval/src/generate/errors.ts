/**
 * 错误注入器（Task 9.1：错误解法 ≥40%，含建模/计算/规范性错误）。
 *
 * 规格依据：
 * - MVP 文档「验证方式」：错误解法含建模错误、计算错误、规范性错误；错误解法 ≥40%；
 * - 03 §1.2/01 §4.4：知识性/行为性/规范性三类 + 规则级定位（ALG.EQ.MOVE）；
 * - 01 §4.5 笔误三条件：photo + 易混对 + edit=1 + B-3 自洽（与 manual 计算错区分）；
 * - 01 §5 排除项：INVALID_EXPR（除零/无法解析的步骤）不计 M-1 分母；
 * - 形态对齐 packages/rules/test/align/align.test.ts E2E 1–6 条错误样本，
 *   并全部经 diagnoseSolution 试跑校准（harness 注入命中守卫固化该结论）。
 *
 * 注入对象 = 规则引擎推荐路径生成的正确步骤链（ctx.path）；注入结果自带标注
 * （合成即标注）。全部形态为 append/truncate 的纯文本改写，不依赖随机源。
 */

export type InjectionId = "none" | "direction" | "move" | "miscalc" | "slip" | "normative" | "div_zero" | "malformed" | "typo_b3";

export type AnnotationStep = {
  index: number;
  status: "correct" | "incorrect" | "inherited" | "not_judged";
};
export type AnnotationError = {
  step_index: number;
  classification: "knowledge" | "behavioral" | "normative";
  subtype?: "slip" | "miscalc";
  rule_id?: string;
};

/** 注入上下文：推荐路径（方程展示串）+ 终节点解 + 题面单位（dataset.ts 由 rules 直链一次算出） */
export type InjectionContext = {
  path: string[];
  solution: { num: number; den: number } | null;
  unit: string;
};

export type InjectionResult = {
  steps: string[];
  source: "photo" | "manual";
  /** 排除项（04 §1：该题步不计 M-1 分母，单独披露；提到 Case 顶层） */
  excluded?: "invalid_expr";
  annotation: {
    steps: AnnotationStep[];
    error?: AnnotationError;
  };
};

/** 易混数字对（镜像 rules CONFUSABLE_DIGIT_PAIRS：0-6/0-8/6-8/1-7/3-8/5-6） */
const CONFUSABLE: ReadonlyArray<readonly [string, string]> = [
  ["0", "6"],
  ["0", "8"],
  ["6", "8"],
  ["1", "7"],
  ["3", "8"],
  ["5", "6"],
];

/** 步内首个 depth-0 带符号位（加减常数或变元项；括号内/乘除系数/等号左侧领头位不计） */
function findFlipTarget(step: string): number | null {
  let depth = 0;
  let sideStart = 0;
  for (let i = 0; i < step.length; i += 1) {
    const ch = step[i]!;
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "=") sideStart = i + 1;
    else if (depth === 0 && (ch === "+" || ch === "-") && i > sideStart) return i;
  }
  return null;
}

function flipAt(step: string, at: number): string {
  return `${step.slice(0, at)}${step[at] === "+" ? "-" : "+"}${step.slice(at + 1)}`;
}

/** 移项目标步：首个（索引 ≥1）含 depth-0 带符号位的步（首步翻转归建模分支，无 rule_id） */
function moveIndex(path: string[]): number | null {
  for (let i = 1; i < path.length; i += 1) {
    if (findFlipTarget(path[i]!) !== null) return i;
  }
  return null;
}

/** 终态整数解（den=1 才有；分数解题不注入末步改写类错误） */
function integerSolution(solution: InjectionContext["solution"]): number | null {
  if (solution === null || solution.den !== 1) return null;
  return solution.num;
}

/**
 * 易混淆替换值：枚举全部单数字候选，取相对偏差最小者（≤50% 才判 slip——B-2 口径，
 * 与 typo.ts checkB2 同款：易混对 + edit=1 + 相对偏差 ≤50%）。
 */
function slipValue(value: string): string | null {
  const candidates: Array<{ text: string; deviation: number }> = [];
  const consider = (text: string): void => {
    candidates.push({ text, deviation: Math.abs(Number(text) - Number(value)) / Number(value) });
  };
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    for (const [x, y] of CONFUSABLE) {
      if (char === x) consider(value.slice(0, i) + y + value.slice(i + 1));
      if (char === y) consider(value.slice(0, i) + x + value.slice(i + 1));
    }
  }
  let best: { text: string; deviation: number } | null = null;
  for (const candidate of candidates) {
    if (best === null || candidate.deviation < best.deviation) best = candidate;
  }
  if (best === null || best.deviation > 0.5) return null;
  return best.text;
}

/** 逐步标注（0 基 wrong/notJudged → 1 基 AnnotationStep） */
function annotate(count: number, wrong: readonly number[], notJudged: readonly number[]): AnnotationStep[] {
  const steps: AnnotationStep[] = [];
  for (let i = 0; i < count; i += 1) {
    const status: AnnotationStep["status"] = notJudged.includes(i) ? "not_judged" : wrong.includes(i) ? "incorrect" : "correct";
    steps.push({ index: i + 1, status });
  }
  return steps;
}

/** 该注入是否适用于给定题面上下文（配额分配与试跑校准用；不适用返回 null 由调用方换型） */
export function isApplicable(injection: InjectionId, ctx: InjectionContext): boolean {
  const v = integerSolution(ctx.solution);
  switch (injection) {
    case "none":
      return true;
    case "direction":
      return findFlipTarget(ctx.path[0] ?? "") !== null;
    case "move":
      return moveIndex(ctx.path) !== null;
    case "miscalc":
    case "typo_b3":
    case "normative":
      return v !== null;
    case "slip":
      return v !== null && slipValue(String(v)) !== null;
    case "div_zero":
    case "malformed":
      return ctx.path.length >= 1;
  }
}

/**
 * 注入错误，返回（改写后的学生步骤 + source + 排除项 + 标注）。
 * 不适用时返回 null（配额分配据此换型，禁静默降级）。
 */
export function applyInjection(injection: InjectionId, ctx: InjectionContext): InjectionResult | null {
  if (!isApplicable(injection, ctx)) return null;
  const { path } = ctx;
  const v = integerSolution(ctx.solution);
  switch (injection) {
    case "none":
      return { steps: [...path], source: "photo", annotation: { steps: annotate(path.length, [], []) } };

    case "direction": {
      // 列式方向写反：首步翻首个 depth-0 符号后只留该步（系统定位建模列式 → 知识性，无 rule_id；E2E-1）
      const at = findFlipTarget(path[0]!)!;
      const steps = [flipAt(path[0]!, at)];
      return {
        steps,
        source: "photo",
        annotation: { steps: annotate(1, [0], []), error: { step_index: 1, classification: "knowledge" } },
      };
    }

    case "move": {
      // 移项未变号：非首步翻 depth-0 符号后截断（ALG.EQ.MOVE 知识性；E2E-2）
      const i = moveIndex(path)!;
      const steps = [...path.slice(0, i), flipAt(path[i]!, findFlipTarget(path[i]!)!)];
      return {
        steps,
        source: "photo",
        annotation: {
          steps: annotate(steps.length, [i], []),
          error: { step_index: i + 1, classification: "knowledge", rule_id: "ALG.EQ.MOVE" },
        },
      };
    }

    case "miscalc": {
      // 计算错：链尾追加错值一步（manual → 行为性 miscalc；E2E-3）
      const steps = [...path, `x=${v! - 1}`];
      return {
        steps,
        source: "manual",
        annotation: {
          steps: annotate(steps.length, [steps.length - 1], []),
          error: { step_index: steps.length, classification: "behavioral", subtype: "miscalc" },
        },
      };
    }

    case "slip": {
      // 笔误：photo + 易混数字替换（edit=1 → 行为性 slip；E2E-4）
      const steps = [...path, `x=${slipValue(String(v!))!}`];
      return {
        steps,
        source: "photo",
        annotation: {
          steps: annotate(steps.length, [steps.length - 1], []),
          error: { step_index: steps.length, classification: "behavioral", subtype: "slip" },
        },
      };
    }

    case "typo_b3": {
      // 笔误复核反例：错值后再接一步错误推导（B-3 不成立 → 保持行为性 miscalc；E2E-5）
      const wrong = v! - 1;
      const steps = [...path, `x=${wrong}`, `x=${wrong}+10`];
      const i = steps.length - 2;
      return {
        steps,
        source: "photo",
        annotation: {
          steps: annotate(steps.length, [i, i + 1], []),
          error: { step_index: i + 1, classification: "behavioral", subtype: "miscalc" },
        },
      };
    }

    case "normative": {
      // 规范性：链尾追加带单位的已求值答案步（DAG 已求值节点存在 → unitMismatch → normative）
      const steps = [...path, `x=${v!}${ctx.unit}`];
      return {
        steps,
        source: "photo",
        annotation: {
          steps: annotate(steps.length, [steps.length - 1], []),
          error: { step_index: steps.length, classification: "normative" },
        },
      };
    }

    case "div_zero": {
      // 除零步：path≥2 换末步 / path=1 追加（INVALID_EXPR → not_judged，排除项；E2E-6）
      const bad = v !== null ? `x=${v}÷0` : "x=100÷0";
      const steps = path.length >= 2 ? [...path.slice(0, -1), bad] : [...path, bad];
      return {
        steps,
        source: "manual",
        excluded: "invalid_expr",
        annotation: { steps: annotate(steps.length, [], [steps.length - 1]) },
      };
    }

    case "malformed": {
      // 畸形行：无等号行（解析失败 → INVALID_EXPR，排除项）
      const bad = "所以结果直接写出来";
      const steps = path.length >= 2 ? [...path.slice(0, -1), bad] : [...path, bad];
      return {
        steps,
        source: "manual",
        excluded: "invalid_expr",
        annotation: { steps: annotate(steps.length, [], [steps.length - 1]) },
      };
    }
  }
}
