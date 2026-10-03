/**
 * 应用题两族模板（Task 9.1：评测集合成，句式全部来自 rules model 已验证句型的参数化）。
 *
 * 规格依据：
 * - 02 §2.2/§3.2：应用题两族 = 和差倍（SUM/DIFF）、归一归总（TIMES/RATIO/TOTAL/NORMALIZE）；
 * - tasks.md 9.1：两族覆盖 + 错误解法 ≥40% + 建模/计算/规范性错误；
 * - 18 题正确样本（packages/rules/test/align/align.test.ts L462-480）：本文件句式的参数化来源，
 *   禁引入无模型支撑的新句式；题面串与 expected_model 结构经 modelQuestion 探针逐一核对
 *   （relation.target = 实体 id，规范量实体名固定为 总量/差量/倍数/每份量/份数/已知总量/已知份数）；
 * - 04 §2 难度 40/45/15：数值「先定核心解再反推题面」，保证整除与可解。
 *
 * 确定性：禁 Math.random/Date.now，全部常量网格 + 索引寻址。
 * 种子题（seeds.ts）与合成题共用本文件 builder：种子传显式参量、合成走数值网格，
 * 保证「题面 ↔ 期望模型」单一来源（合成即标注，不取自系统输出，避免循环标注）。
 */

/** 规则族（与 rules ModelRule.family 对齐） */
export type Family = "sumdiff" | "multiple" | "total" | "normalize";
export type Group = "sumdiff_group" | "normalize_group";
export type Difficulty = "easy" | "medium" | "hard";

/** 题面实体对：a=主语实体、b=参照实体、unit=计量单位 */
export type QuestionPair = { a: string; b: string; unit: string };

export type ExpectedEntity = {
  name: string;
  role: "known" | "unknown";
  value?: { num: number; den: number };
  unit?: string;
};
export type ExpectedRelation = {
  subject: string;
  reference: string;
  predicate: "sum" | "diff" | "times" | "share";
  operator: "+" | "-" | "×" | "÷";
  target: string;
};
export type ExpectedModel = {
  entities: ExpectedEntity[];
  relations: ExpectedRelation[];
  targets: string[];
};

/** 模板实例：渲染后的题面 + 四角色期望（合成即标注，不取自系统输出） */
export type TemplateSpec = {
  family: Family;
  group: Group;
  difficulty: Difficulty;
  questionText: string;
  expectedModel: ExpectedModel;
};

/** 计量箱（盒/箱/袋…）：box=量词、unit=单位、verb=句式中动词（「装」或空串） */
export type CountBox = { box: string; unit: string; verb: string };

type Side = "a" | "b";

const PAIRS: QuestionPair[] = [
  { a: "甲", b: "乙", unit: "个" },
  { a: "苹果", b: "橘子", unit: "个" },
  { a: "篮球", b: "足球", unit: "个" },
  { a: "小猫", b: "小狗", unit: "只" },
  { a: "红笔", b: "蓝笔", unit: "支" },
  { a: "故事书", b: "科技书", unit: "本" },
];

const WEIGHT_BOXES: Array<{ box: string; unit: string }> = [
  { box: "箱", unit: "千克" },
  { box: "袋", unit: "千克" },
  { box: "车", unit: "吨" },
  { box: "筐", unit: "千克" },
];

const COUNT_BOXES: CountBox[] = [
  { box: "盒", unit: "个", verb: "" },
  { box: "层", unit: "本", verb: "" },
  { box: "排", unit: "个", verb: "" },
  { box: "箱", unit: "个", verb: "" },
];

const SPEED_UNIT = "千米";

/* ------------------------------------------------------------------ */
/* 四角色期望构造（与 modelQuestion 探针输出同构的简化：只记 01 §3.1        */
/* 四角色——实体角色/关系三要素/目标；规范量数值按模板参量直接算出）        */
/* ------------------------------------------------------------------ */

/** S1：A和B一共N，A比B多d，求A和B（SUM；种子 L462/463/464；less=true 为「A比B少d」反向） */
function sumBoth(b: number, d: number, pair: QuestionPair, less: boolean): ExpectedModel & { N: number } {
  const N = 2 * b + d;
  const bigger = less ? pair.b : pair.a;
  const smaller = less ? pair.a : pair.b;
  return {
    N,
    entities: [
      { name: pair.a, role: "unknown" },
      { name: pair.b, role: "unknown" },
      { name: "总量", role: "known", value: { num: N, den: 1 }, unit: pair.unit },
      { name: "差量", role: "known", value: { num: d, den: 1 }, unit: pair.unit },
    ],
    relations: [
      { subject: pair.a, reference: pair.b, predicate: "sum", operator: "+", target: "总量" },
      { subject: bigger, reference: smaller, predicate: "diff", operator: "-", target: "差量" },
    ],
    targets: [pair.a, pair.b],
  };
}

/** S2：A和B一共N，known 侧有 v，求另一侧（SUM 已知一侧；种子 L465「甲和乙一共100个，乙有30个，求甲」） */
function sumKnown(known: Side, value: number, total: number, pair: QuestionPair): ExpectedModel & { N: number } {
  const name = (side: Side) => (side === "a" ? pair.a : pair.b);
  const ask: Side = known === "a" ? "b" : "a";
  return {
    N: total,
    entities: [
      { name: name(known), role: "known", value: { num: value, den: 1 }, unit: pair.unit },
      { name: name(ask), role: "unknown" },
      { name: "总量", role: "known", value: { num: total, den: 1 }, unit: pair.unit },
    ],
    relations: [{ subject: pair.a, reference: pair.b, predicate: "sum", operator: "+", target: "总量" }],
    targets: [name(ask)],
  };
}

/**
 * S3/S4：已知一侧 + 差量关系求另一侧（DIFF；种子 L466/467）。
 * bigger=差关系主体（被减数，relations.subject）；textSubject=题面「X比Y…」主语
 * （textSubject===bigger 时句式用「多」，否则用「少」——与关系方向无关，纯文本变体）。
 */
function diffKnown(params: {
  known: Side;
  value: number;
  d: number;
  bigger: Side;
  textSubject: Side;
  pair: QuestionPair;
}): ExpectedModel {
  const { known, value, d, bigger, pair } = params;
  const name = (side: Side) => (side === "a" ? pair.a : pair.b);
  const smaller: Side = bigger === "a" ? "b" : "a";
  const ask: Side = known === "a" ? "b" : "a";
  return {
    entities: [
      { name: name(known), role: "known", value: { num: value, den: 1 }, unit: pair.unit },
      { name: name(ask), role: "unknown" },
      { name: "差量", role: "known", value: { num: d, den: 1 }, unit: pair.unit },
    ],
    relations: [{ subject: name(bigger), reference: name(smaller), predicate: "diff", operator: "-", target: "差量" }],
    targets: [name(ask)],
  };
}

/** M1：A是B的k倍，A和B一共N（TIMES+SUM；种子 L468） */
function timesBoth(b: number, k: number, pair: QuestionPair): ExpectedModel & { N: number } {
  const N = b * (k + 1);
  return {
    N,
    entities: [
      { name: pair.a, role: "unknown" },
      { name: pair.b, role: "unknown" },
      { name: "倍数", role: "known", value: { num: k, den: 1 } },
      { name: "总量", role: "known", value: { num: N, den: 1 }, unit: pair.unit },
    ],
    relations: [
      { subject: pair.a, reference: pair.b, predicate: "times", operator: "×", target: "倍数" },
      { subject: pair.a, reference: pair.b, predicate: "sum", operator: "+", target: "总量" },
    ],
    targets: [pair.a, pair.b],
  };
}

/** M2：A比B多k倍，一共N（times_more：倍数=k+1；种子 L469） */
function timesMoreBoth(b: number, k: number, pair: QuestionPair): ExpectedModel & { N: number } {
  const N = b * (k + 2);
  return {
    N,
    entities: [
      { name: pair.a, role: "unknown" },
      { name: pair.b, role: "unknown" },
      { name: "倍数", role: "known", value: { num: k + 1, den: 1 } },
      { name: "总量", role: "known", value: { num: N, den: 1 }, unit: pair.unit },
    ],
    relations: [
      { subject: pair.a, reference: pair.b, predicate: "times", operator: "×", target: "倍数" },
      { subject: pair.a, reference: pair.b, predicate: "sum", operator: "+", target: "总量" },
    ],
    targets: [pair.a, pair.b],
  };
}

/** M3：A是B的k倍，B有a，求A（TIMES；种子 L470） */
function timesKnownB(b: number, k: number, pair: QuestionPair): ExpectedModel {
  return {
    entities: [
      { name: pair.a, role: "unknown" },
      { name: pair.b, role: "known", value: { num: b, den: 1 }, unit: pair.unit },
      { name: "倍数", role: "known", value: { num: k, den: 1 } },
    ],
    relations: [{ subject: pair.a, reference: pair.b, predicate: "times", operator: "×", target: "倍数" }],
    targets: [pair.a],
  };
}

/** M4：A比B的k倍少d，一共N（times+diff+SUM 叠加；种子 L471；引中介实体「B的k倍」） */
function lessThanMultiple(b: number, k: number, d: number, pair: QuestionPair): ExpectedModel & { N: number } {
  const N = b * (k + 1) - d;
  const mid = `${pair.b}的${k}倍`;
  return {
    N,
    entities: [
      { name: pair.a, role: "unknown" },
      { name: pair.b, role: "unknown" },
      { name: mid, role: "unknown" },
      { name: "倍数", role: "known", value: { num: k, den: 1 } },
      { name: "差量", role: "known", value: { num: d, den: 1 }, unit: pair.unit },
      { name: "总量", role: "known", value: { num: N, den: 1 }, unit: pair.unit },
    ],
    relations: [
      { subject: pair.a, reference: pair.b, predicate: "times", operator: "×", target: "倍数" },
      { subject: mid, reference: pair.a, predicate: "diff", operator: "-", target: "差量" },
      { subject: pair.a, reference: pair.b, predicate: "sum", operator: "+", target: "总量" },
    ],
    targets: [pair.a, pair.b],
  };
}

/** M5：A是B的p/q，一共N（RATIO fraction；种子 L472；b 取 q 倍数保证整除） */
function ratioBoth(b: number, p: number, q: number, pair: QuestionPair): ExpectedModel & { N: number } {
  const N = (b * (p + q)) / q;
  return {
    N,
    entities: [
      { name: pair.a, role: "unknown" },
      { name: pair.b, role: "unknown" },
      { name: "倍数", role: "known", value: { num: p, den: q } },
      { name: "总量", role: "known", value: { num: N, den: 1 }, unit: pair.unit },
    ],
    relations: [
      { subject: pair.a, reference: pair.b, predicate: "times", operator: "×", target: "倍数" },
      { subject: pair.a, reference: pair.b, predicate: "sum", operator: "+", target: "总量" },
    ],
    targets: [pair.a, pair.b],
  };
}

/** M6：A比B多p/q，一共N（fraction_more：倍数=(q+p)/q；种子 L473） */
function ratioMoreBoth(b: number, p: number, q: number, pair: QuestionPair): ExpectedModel & { N: number } {
  const N = (b * (q + p + q)) / q;
  return {
    N,
    entities: [
      { name: pair.a, role: "unknown" },
      { name: pair.b, role: "unknown" },
      { name: "倍数", role: "known", value: { num: q + p, den: q } },
      { name: "总量", role: "known", value: { num: N, den: 1 }, unit: pair.unit },
    ],
    relations: [
      { subject: pair.a, reference: pair.b, predicate: "times", operator: "×", target: "倍数" },
      { subject: pair.a, reference: pair.b, predicate: "sum", operator: "+", target: "总量" },
    ],
    targets: [pair.a, pair.b],
  };
}

/** M7：A是B的p/q，B有a，求A（RATIO；种子 L479；a 取 q 倍数） */
function ratioKnownB(a: number, p: number, q: number, pair: QuestionPair): ExpectedModel {
  return {
    entities: [
      { name: pair.a, role: "unknown" },
      { name: pair.b, role: "known", value: { num: a, den: 1 }, unit: pair.unit },
      { name: "倍数", role: "known", value: { num: p, den: q } },
    ],
    relations: [{ subject: pair.a, reference: pair.b, predicate: "times", operator: "×", target: "倍数" }],
    targets: [pair.a],
  };
}

/** T1/T2：每份量 k、份数 m，求总量（TOTAL；种子 L474/475） */
function totalBoth(k: number, m: number, unit: string): ExpectedModel & { N: number } {
  return {
    N: k * m,
    entities: [
      { name: "每份量", role: "known", value: { num: k, den: 1 }, unit: unit },
      { name: "份数", role: "known", value: { num: m, den: 1 } },
      { name: "总量", role: "unknown" },
    ],
    relations: [{ subject: "总量", reference: "每份量", predicate: "share", operator: "×", target: "份数" }],
    targets: ["总量"],
  };
}

/** N1：t小时行N千米，每小时行多少（NORMALIZE；种子 L476） */
function normalizeUnit(total: number, t: number, unit: string): ExpectedModel {
  return {
    entities: [
      { name: "已知总量", role: "known", value: { num: total, den: 1 }, unit },
      { name: "每份量", role: "unknown" },
      { name: "已知份数", role: "known", value: { num: t, den: 1 } },
    ],
    relations: [
      { subject: "每份量", reference: "已知总量", predicate: "share", operator: "÷", target: "已知份数" },
    ],
    targets: ["每份量"],
  };
}

/** N2：m箱重N千克，n箱重多少（NORMALIZE 归一→归总；种子 L477） */
function normalizeScale(m: number, n: number, p: number, unit: string): ExpectedModel & { N: number } {
  const total = m * p;
  return {
    N: total,
    entities: [
      { name: "已知总量", role: "known", value: { num: total, den: 1 }, unit },
      { name: "已知份数", role: "known", value: { num: m, den: 1 } },
      { name: "每份量", role: "unknown" },
      { name: "份数", role: "known", value: { num: n, den: 1 } },
      { name: "总量", role: "unknown" },
    ],
    relations: [
      { subject: "每份量", reference: "已知总量", predicate: "share", operator: "÷", target: "已知份数" },
      { subject: "总量", reference: "每份量", predicate: "share", operator: "×", target: "份数" },
    ],
    targets: ["总量"],
  };
}

/** N3：m箱重N千克，每箱p千克，求几箱（NORMALIZE；种子 L478，Task 3 修复「求几箱」→ 份数） */
function normalizeCount(m: number, p: number, unit: string): ExpectedModel & { N: number } {
  const total = m * p;
  return {
    N: total,
    entities: [
      { name: "已知总量", role: "known", value: { num: total, den: 1 }, unit },
      { name: "每份量", role: "known", value: { num: p, den: 1 }, unit },
      { name: "已知份数", role: "known", value: { num: m, den: 1 } },
      { name: "份数", role: "unknown" },
    ],
    relations: [
      { subject: "份数", reference: "已知总量", predicate: "share", operator: "÷", target: "每份量" },
    ],
    targets: ["份数"],
  };
}

/* ------------------------------------------------------------------ */
/* 数值网格（先定核心解，再反推题面；难度递增；全部整除预校验）              */
/* 容量约束：同一网格被多个句式配额共享时，grid[难度].length 必须 ≥ 任一配额     */
/* 在该难度下的题数（配额内同难度的 at 连续，取模不重复 → 题面不重样）。        */
/* ------------------------------------------------------------------ */

/** 和差倍 SUM/DIFF：[b, d]（b=乙/基准，d=差量；S1/S2/S3/S4 共享，装配位 0-21 → 全 easy，需 easy ≥6） */
const SUMDIFF_GRID: Record<Difficulty, Array<{ b: number; d: number }>> = {
  easy: [
    { b: 20, d: 10 },
    { b: 30, d: 20 },
    { b: 40, d: 30 },
    { b: 50, d: 10 },
    { b: 35, d: 10 },
    { b: 45, d: 25 },
  ],
  medium: [
    { b: 23, d: 7 },
    { b: 37, d: 13 },
    { b: 46, d: 18 },
    { b: 52, d: 32 },
    { b: 28, d: 9 },
  ],
  hard: [
    { b: 123, d: 35 },
    { b: 205, d: 18 },
    { b: 148, d: 56 },
    { b: 96, d: 44 },
    { b: 167, d: 73 },
  ],
};

/** MULTIPLE TIMES：[b, k]（M1 装配位 22-27 全 easy 需 ≥6；M2 28-31 全 easy 需 ≥4；M3 32-36 → easy4+medium1） */
const TIMES_GRID: Record<Difficulty, Array<{ b: number; k: number }>> = {
  easy: [
    { b: 20, k: 3 },
    { b: 30, k: 2 },
    { b: 20, k: 4 },
    { b: 15, k: 5 },
    { b: 25, k: 3 },
    { b: 40, k: 2 },
  ],
  medium: [
    { b: 18, k: 5 },
    { b: 24, k: 6 },
    { b: 32, k: 4 },
    { b: 12, k: 9 },
  ],
  hard: [
    { b: 105, k: 7 },
    { b: 84, k: 8 },
    { b: 126, k: 6 },
    { b: 56, k: 12 },
  ],
};

/** combo：[b, k, d]（A比B的k倍少d，需 N=(k+1)b-d>0；M4 装配位 37-40 → 全 medium，需 ≥4） */
const COMBO_GRID: Record<Difficulty, Array<{ b: number; k: number; d: number }>> = {
  easy: [
    { b: 20, k: 3, d: 10 },
    { b: 12, k: 4, d: 8 },
    { b: 15, k: 5, d: 25 },
    { b: 10, k: 6, d: 12 },
  ],
  medium: [
    { b: 18, k: 4, d: 12 },
    { b: 22, k: 3, d: 16 },
    { b: 26, k: 5, d: 30 },
    { b: 14, k: 8, d: 20 },
  ],
  hard: [
    { b: 48, k: 6, d: 35 },
    { b: 65, k: 7, d: 48 },
    { b: 32, k: 9, d: 27 },
  ],
};

/** RATIO：[b, p, q]（b 取 q 倍数保整除；M5 装配位 41-43、M6 44 → 全 medium，需 medium ≥3） */
const RATIO_GRID: Record<Difficulty, Array<{ b: number; p: number; q: number }>> = {
  easy: [
    { b: 20, p: 3, q: 4 },
    { b: 32, p: 5, q: 8 },
    { b: 24, p: 7, q: 8 },
    { b: 28, p: 3, q: 7 },
  ],
  medium: [
    { b: 36, p: 4, q: 9 },
    { b: 48, p: 5, q: 6 },
    { b: 52, p: 7, q: 13 },
  ],
  hard: [
    { b: 120, p: 8, q: 15 },
    { b: 96, p: 11, q: 16 },
    { b: 154, p: 13, q: 22 },
  ],
};

/** RATIO 已知 B：[a, p, q]（a 取 q 倍数；M7 装配位 45 → medium，需 medium ≥1） */
const RATIO_KNOWN_GRID: Record<Difficulty, Array<{ a: number; p: number; q: number }>> = {
  easy: [
    { a: 20, p: 3, q: 4 },
    { a: 30, p: 2, q: 5 },
    { a: 16, p: 5, q: 8 },
  ],
  medium: [
    { a: 18, p: 4, q: 9 },
    { a: 24, p: 5, q: 6 },
  ],
  hard: [
    { a: 60, p: 8, q: 15 },
    { a: 32, p: 11, q: 16 },
  ],
};

/** 总量 TOTAL：[每份 k, 份数 m]（T1 装配位 47-54 → 全 medium，需 medium ≥8） */
const TOTAL_GRID: Record<Difficulty, Array<{ k: number; m: number }>> = {
  easy: [
    { k: 5, m: 8 },
    { k: 10, m: 6 },
    { k: 6, m: 9 },
    { k: 8, m: 7 },
  ],
  medium: [
    { k: 12, m: 15 },
    { k: 25, m: 16 },
    { k: 18, m: 24 },
    { k: 20, m: 25 },
    { k: 14, m: 18 },
    { k: 16, m: 20 },
    { k: 22, m: 15 },
    { k: 24, m: 25 },
  ],
  hard: [
    { k: 36, m: 45 },
    { k: 48, m: 32 },
  ],
};

/** 速度题：[每份 v, 份数 t]（T2 装配位 55-61 → 全 medium，需 medium ≥7） */
const SPEED_GRID: Record<Difficulty, Array<{ v: number; t: number }>> = {
  easy: [
    { v: 40, t: 3 },
    { v: 60, t: 4 },
    { v: 50, t: 6 },
    { v: 80, t: 2 },
  ],
  medium: [
    { v: 75, t: 5 },
    { v: 90, t: 7 },
    { v: 65, t: 12 },
    { v: 85, t: 6 },
    { v: 95, t: 8 },
    { v: 72, t: 9 },
    { v: 60, t: 15 },
  ],
  hard: [
    { v: 105, t: 14 },
    { v: 150, t: 9 },
  ],
};

/** 速度归一：[总 N=v*t 反推, 份 t]（N1 装配位 61-72 → 全 medium，需 medium ≥12） */
const SPEED_N_GRID: Record<Difficulty, Array<{ v: number; t: number }>> = {
  easy: [
    { v: 30, t: 3 },
    { v: 25, t: 4 },
    { v: 40, t: 6 },
    { v: 60, t: 2 },
  ],
  medium: [
    { v: 45, t: 5 },
    { v: 70, t: 7 },
    { v: 36, t: 12 },
    { v: 80, t: 9 },
    { v: 54, t: 8 },
    { v: 85, t: 6 },
    { v: 96, t: 8 },
    { v: 63, t: 9 },
    { v: 78, t: 12 },
    { v: 108, t: 10 },
    { v: 90, t: 15 },
    { v: 66, t: 11 },
  ],
  hard: [
    { v: 88, t: 14 },
    { v: 105, t: 9 },
  ],
};

/** 归总/求份数：[每份 p, 已知份 m, 求份 n]（N2 装配位 73-92 → medium 16 + hard 4） */
const BOX_GRID: Record<Difficulty, Array<{ p: number; m: number; n: number }>> = {
  easy: [
    { p: 15, m: 3, n: 5 },
    { p: 10, m: 4, n: 8 },
    { p: 20, m: 5, n: 6 },
    { p: 12, m: 6, n: 7 },
    { p: 18, m: 3, n: 7 },
    { p: 25, m: 4, n: 9 },
    { p: 30, m: 5, n: 6 },
    { p: 16, m: 4, n: 10 },
  ],
  medium: [
    { p: 13, m: 3, n: 7 },
    { p: 25, m: 4, n: 9 },
    { p: 17, m: 6, n: 8 },
    { p: 19, m: 5, n: 11 },
    { p: 22, m: 4, n: 10 },
    { p: 35, m: 6, n: 9 },
    { p: 14, m: 7, n: 8 },
    { p: 28, m: 5, n: 12 },
    { p: 33, m: 3, n: 11 },
    { p: 15, m: 4, n: 6 },
    { p: 18, m: 5, n: 7 },
    { p: 21, m: 4, n: 8 },
    { p: 24, m: 6, n: 9 },
    { p: 27, m: 5, n: 10 },
    { p: 32, m: 7, n: 11 },
    { p: 36, m: 8, n: 12 },
  ],
  hard: [
    { p: 23, m: 7, n: 11 },
    { p: 34, m: 6, n: 13 },
    { p: 45, m: 8, n: 12 },
    { p: 56, m: 9, n: 15 },
  ],
};

/** 求份数：[每份 p, 已知份 m]（N3 装配位 93-101 → 全 hard，需 hard ≥9） */
const COUNT_GRID: Record<Difficulty, Array<{ p: number; m: number }>> = {
  easy: [
    { p: 15, m: 3 },
    { p: 10, m: 4 },
    { p: 20, m: 5 },
    { p: 12, m: 6 },
  ],
  medium: [
    { p: 13, m: 3 },
    { p: 25, m: 4 },
    { p: 17, m: 6 },
    { p: 21, m: 5 },
  ],
  hard: [
    { p: 23, m: 7 },
    { p: 34, m: 6 },
    { p: 56, m: 13 },
    { p: 67, m: 15 },
    { p: 45, m: 18 },
    { p: 78, m: 12 },
    { p: 89, m: 16 },
    { p: 34, m: 21 },
    { p: 95, m: 14 },
  ],
};

/* ------------------------------------------------------------------ */
/* 句式 builder（显式参量；种子与合成共用——「题面 + 期望模型」单一来源）        */
/* ------------------------------------------------------------------ */

export type SumBothSpecParams = { b: number; d: number; pair: QuestionPair; less: boolean; difficulty: Difficulty };
export function sumBothSpec({ b, d, pair, less, difficulty }: SumBothSpecParams): TemplateSpec {
  const spec = sumBoth(b, d, pair, less);
  const direction = less ? `少${d}${pair.unit}` : `多${d}${pair.unit}`;
  return {
    family: "sumdiff",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}和${pair.b}一共${spec.N}${pair.unit}，${pair.a}比${pair.b}${direction}，求${pair.a}和${pair.b}`,
    expectedModel: spec,
  };
}

export type SumKnownSpecParams = { known: Side; value: number; total: number; pair: QuestionPair; difficulty: Difficulty };
export function sumKnownSpec({ known, value, total, pair, difficulty }: SumKnownSpecParams): TemplateSpec {
  const spec = sumKnown(known, value, total, pair);
  const name = (side: Side) => (side === "a" ? pair.a : pair.b);
  const ask: Side = known === "a" ? "b" : "a";
  return {
    family: "sumdiff",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}和${pair.b}一共${total}${pair.unit}，${name(known)}有${value}${pair.unit}，求${name(ask)}`,
    expectedModel: spec,
  };
}

export type DiffKnownSpecParams = {
  known: Side;
  value: number;
  d: number;
  bigger: Side;
  textSubject: Side;
  pair: QuestionPair;
  difficulty: Difficulty;
};
export function diffKnownSpec(params: DiffKnownSpecParams): TemplateSpec {
  const { known, value, d, bigger, textSubject, pair, difficulty } = params;
  const name = (side: Side) => (side === "a" ? pair.a : pair.b);
  const more = textSubject === bigger;
  const other: Side = textSubject === "a" ? "b" : "a";
  const ask: Side = known === "a" ? "b" : "a";
  return {
    family: "sumdiff",
    group: "sumdiff_group",
    difficulty,
    questionText: `${name(known)}有${value}${pair.unit}，${name(textSubject)}比${name(other)}${more ? "多" : "少"}${d}${pair.unit}，求${name(ask)}`,
    expectedModel: diffKnown(params),
  };
}

export type TimesBothSpecParams = { b: number; k: number; pair: QuestionPair; difficulty: Difficulty };
export function timesBothSpec({ b, k, pair, difficulty }: TimesBothSpecParams): TemplateSpec {
  const spec = timesBoth(b, k, pair);
  return {
    family: "multiple",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}是${pair.b}的${k}倍，${pair.a}和${pair.b}一共${spec.N}${pair.unit}，求${pair.a}${pair.b}`,
    expectedModel: spec,
  };
}

export type TimesMoreSpecParams = { b: number; k: number; pair: QuestionPair; difficulty: Difficulty };
export function timesMoreSpec({ b, k, pair, difficulty }: TimesMoreSpecParams): TemplateSpec {
  const spec = timesMoreBoth(b, k, pair);
  return {
    family: "multiple",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}比${pair.b}多${k}倍，${pair.a}和${pair.b}一共${spec.N}${pair.unit}，求${pair.a}${pair.b}`,
    expectedModel: spec,
  };
}

export type TimesKnownSpecParams = { b: number; k: number; pair: QuestionPair; difficulty: Difficulty };
export function timesKnownSpec({ b, k, pair, difficulty }: TimesKnownSpecParams): TemplateSpec {
  return {
    family: "multiple",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}是${pair.b}的${k}倍，${pair.b}有${b}${pair.unit}，求${pair.a}`,
    expectedModel: timesKnownB(b, k, pair),
  };
}

export type ComboSpecParams = { b: number; k: number; d: number; pair: QuestionPair; difficulty: Difficulty };
export function comboSpec({ b, k, d, pair, difficulty }: ComboSpecParams): TemplateSpec {
  const spec = lessThanMultiple(b, k, d, pair);
  return {
    family: "multiple",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}比${pair.b}的${k}倍少${d}${pair.unit}，${pair.a}和${pair.b}一共${spec.N}${pair.unit}，求${pair.a}${pair.b}`,
    expectedModel: spec,
  };
}

export type RatioBothSpecParams = { b: number; p: number; q: number; pair: QuestionPair; difficulty: Difficulty };
export function ratioBothSpec({ b, p, q, pair, difficulty }: RatioBothSpecParams): TemplateSpec {
  const spec = ratioBoth(b, p, q, pair);
  return {
    family: "multiple",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}是${pair.b}的${p}/${q}，${pair.a}和${pair.b}一共${spec.N}${pair.unit}，求${pair.a}${pair.b}`,
    expectedModel: spec,
  };
}

export type RatioMoreSpecParams = { b: number; p: number; q: number; pair: QuestionPair; difficulty: Difficulty };
export function ratioMoreSpec({ b, p, q, pair, difficulty }: RatioMoreSpecParams): TemplateSpec {
  const spec = ratioMoreBoth(b, p, q, pair);
  return {
    family: "multiple",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}比${pair.b}多${p}/${q}，${pair.a}和${pair.b}一共${spec.N}${pair.unit}，求${pair.a}${pair.b}`,
    expectedModel: spec,
  };
}

export type RatioKnownSpecParams = { a: number; p: number; q: number; pair: QuestionPair; difficulty: Difficulty };
export function ratioKnownSpec({ a, p, q, pair, difficulty }: RatioKnownSpecParams): TemplateSpec {
  return {
    family: "multiple",
    group: "sumdiff_group",
    difficulty,
    questionText: `${pair.a}是${pair.b}的${p}/${q}，${pair.b}有${a}${pair.unit}，求${pair.a}`,
    expectedModel: ratioKnownB(a, p, q, pair),
  };
}

export type TotalCountSpecParams = { k: number; m: number; box: CountBox; difficulty: Difficulty };
export function totalCountSpec({ k, m, box, difficulty }: TotalCountSpecParams): TemplateSpec {
  const spec = totalBoth(k, m, box.unit);
  return {
    family: "total",
    group: "normalize_group",
    difficulty,
    questionText: `每${box.box}${box.verb}${k}${box.unit}，${m}${box.box}一共${box.verb}多少${box.unit}`,
    expectedModel: spec,
  };
}

export type TotalSpeedSpecParams = { v: number; t: number; difficulty: Difficulty };
export function totalSpeedSpec({ v, t, difficulty }: TotalSpeedSpecParams): TemplateSpec {
  const spec = totalBoth(v, t, SPEED_UNIT);
  return {
    family: "total",
    group: "normalize_group",
    difficulty,
    questionText: `每小时行${v}${SPEED_UNIT}，${t}小时行多少${SPEED_UNIT}`,
    expectedModel: spec,
  };
}

export type NormalizeUnitSpecParams = { total: number; t: number; difficulty: Difficulty };
export function normalizeUnitSpec({ total, t, difficulty }: NormalizeUnitSpecParams): TemplateSpec {
  return {
    family: "normalize",
    group: "normalize_group",
    difficulty,
    questionText: `${t}小时行${total}${SPEED_UNIT}，每小时行多少${SPEED_UNIT}`,
    expectedModel: normalizeUnit(total, t, SPEED_UNIT),
  };
}

export type NormalizeScaleSpecParams = { m: number; n: number; p: number; box: string; unit: string; difficulty: Difficulty };
export function normalizeScaleSpec({ m, n, p, box, unit, difficulty }: NormalizeScaleSpecParams): TemplateSpec {
  const spec = normalizeScale(m, n, p, unit);
  return {
    family: "normalize",
    group: "normalize_group",
    difficulty,
    questionText: `${m}${box}重${spec.N}${unit}，${n}${box}重多少${unit}`,
    expectedModel: spec,
  };
}

export type NormalizeCountSpecParams = { m: number; p: number; box: string; unit: string; difficulty: Difficulty };
export function normalizeCountSpec({ m, p, box, unit, difficulty }: NormalizeCountSpecParams): TemplateSpec {
  const spec = normalizeCount(m, p, unit);
  return {
    family: "normalize",
    group: "normalize_group",
    difficulty,
    questionText: `${m}${box}重${spec.N}${unit}，每${box}${p}${unit}，求几${box}`,
    expectedModel: spec,
  };
}

/* ------------------------------------------------------------------ */
/* 装配：102 合成题配额 → TemplateSpec                                      */
/* ------------------------------------------------------------------ */

/** 各句式配额（102 合成题；族口径：sumdiff_group=46、normalize_group=56，
 *  与种子 40（28+12）、建模拟败 8（1+7）合计 150 = 两族各 75；
 *  合成题 36/53/13，与种子 23/13/4、建模拟败 1/2/5 合计 60/68/22 ≈ 40/45/15） */
const QUOTAS: Array<{ count: number; build: (at: number, difficulty: Difficulty) => TemplateSpec }> = [
  { count: 6, build: (at, diff) => { const { b, d } = pick(SUMDIFF_GRID, diff, at); return sumBothSpec({ b, d, pair: pairAt(at), less: false, difficulty: diff }); } },
  { count: 6, build: (at, diff) => { const { b, d } = pick(SUMDIFF_GRID, diff, at); return sumBothSpec({ b, d, pair: pairAt(at), less: true, difficulty: diff }); } },
  { count: 4, build: (at, diff) => { const { b, d } = pick(SUMDIFF_GRID, diff, at); return diffKnownSpec({ known: "b", value: b, d, bigger: "a", textSubject: "a", pair: pairAt(at), difficulty: diff }); } },
  { count: 6, build: (at, diff) => { const { b, d } = pick(SUMDIFF_GRID, diff, at); return diffKnownSpec({ known: "a", value: b, d, bigger: "b", textSubject: "a", pair: pairAt(at), difficulty: diff }); } },
  { count: 6, build: (at, diff) => { const { b, k } = pick(TIMES_GRID, diff, at); return timesBothSpec({ b, k, pair: pairAt(at), difficulty: diff }); } },
  { count: 4, build: (at, diff) => { const { b, k } = pick(TIMES_GRID, diff, at); return timesMoreSpec({ b, k, pair: pairAt(at), difficulty: diff }); } },
  { count: 5, build: (at, diff) => { const { b, k } = pick(TIMES_GRID, diff, at); return timesKnownSpec({ b, k, pair: pairAt(at), difficulty: diff }); } },
  { count: 4, build: (at, diff) => { const { b, k, d } = pick(COMBO_GRID, diff, at); return comboSpec({ b, k, d, pair: pairAt(at), difficulty: diff }); } },
  { count: 3, build: (at, diff) => { const { b, p, q } = pick(RATIO_GRID, diff, at); return ratioBothSpec({ b, p, q, pair: pairAt(at), difficulty: diff }); } },
  { count: 1, build: (at, diff) => { const { b, p, q } = pick(RATIO_GRID, diff, at); return ratioMoreSpec({ b, p, q, pair: pairAt(at), difficulty: diff }); } },
  { count: 1, build: (at, diff) => { const { a, p, q } = pick(RATIO_KNOWN_GRID, diff, at); return ratioKnownSpec({ a, p, q, pair: pairAt(at), difficulty: diff }); } },
  { count: 8, build: (at, diff) => { const { k, m } = pick(TOTAL_GRID, diff, at); return totalCountSpec({ k, m, box: COUNT_BOXES[at % COUNT_BOXES.length]!, difficulty: diff }); } },
  { count: 7, build: (at, diff) => { const { v, t } = pick(SPEED_GRID, diff, at); return totalSpeedSpec({ v, t, difficulty: diff }); } },
  { count: 12, build: (at, diff) => { const { v, t } = pick(SPEED_N_GRID, diff, at); return normalizeUnitSpec({ total: v * t, t, difficulty: diff }); } },
  { count: 20, build: (at, diff) => { const { p, m, n } = pick(BOX_GRID, diff, at); const box = WEIGHT_BOXES[at % WEIGHT_BOXES.length]!; return normalizeScaleSpec({ m, n, p, box: box.box, unit: box.unit, difficulty: diff }); } },
  { count: 9, build: (at, diff) => { const { p, m } = pick(COUNT_GRID, diff, at); const box = WEIGHT_BOXES[at % WEIGHT_BOXES.length]!; return normalizeCountSpec({ m, p, box: box.box, unit: box.unit, difficulty: diff }); } },
];

/**
 * 难度分档（全局边界，非配额内比例）：装配位 at ∈ [0,102)，
 * easy = at<36 / medium = at<89 / hard = 其余 → 合成题 36/53/13，
 * 与种子 23/13/4、建模拟败 1/2/5 合计 60/68/22（≈40/45/15，04 §2）。
 * 全局边界保证和差倍族前段（S1-S4/M1/M2）集中在 easy、归一族后段（N2 尾部/N3）
 * 集中在 hard——难度沿装配序单调递增，与网格容量分配一致。
 */
function difficultyFor(at: number): Difficulty {
  if (at < 36) return "easy";
  if (at < 89) return "medium";
  return "hard";
}

function pick<T>(grid: Record<Difficulty, T[]>, difficulty: Difficulty, at: number): T {
  const list = grid[difficulty];
  return list[at % list.length]!;
}

function pairAt(at: number): QuestionPair {
  return PAIRS[at % PAIRS.length]!;
}

/** 按配额生成合成题（TemplateSpec 序列，含 expected_model；超出 total 从尾部截断） */
export function buildTemplateSpecs(total: number): TemplateSpec[] {
  const specs: TemplateSpec[] = [];
  let at = 0;
  for (const quota of QUOTAS) {
    for (let i = 0; i < quota.count; i += 1) {
      specs.push(quota.build(at, difficultyFor(at)));
      at += 1;
    }
  }
  while (specs.length > total) specs.pop();
  return specs;
}
