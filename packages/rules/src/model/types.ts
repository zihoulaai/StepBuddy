/**
 * 关系层建模模块（Task 3：应用题两族 REL.MODEL 规则）。
 *
 * 规格依据：
 * - 01 §3.1 relation「数量关系」元素结构（本目录 types 与 contracts relationItemSchema 对齐）；
 * - 01 §4.0 完整机制「关系层四角色建模 → 解题空间生成 → 步骤对齐 → 前向溯源」的本层只做第一步；
 * - 01 §4.4 建模错误定位在关系层（主体、基准量、比较量、运算关系）；
 * - 01 §5 退出码 MODEL_FAILED（关系无法建模，不静默错判）；
 * - 02 §3.2 和差倍/归一归总两族、§5 规则规模 4–8 条、§129 每条规则附验收用例编号、
 *   §131 标识格式 DOMAIN.FAMILY.VARIANT；
 * - 关系形状参考归档 v2-full-scope 01-ir-schema §2.4（归档仅供回溯、非当前口径）。
 *
 * 两层分离（任务内已确认决策）：extract 只做无语义句型抽取，rules 只做判定，
 * 中间的 Extraction/Relation 即 Task 6 LLM 结构化后的交换格式。
 */

import type { Rational } from "../rational.js";

/** 抽取出的数量：精确有理数（禁浮点）+ 单位 */
export type ExtractedQuantity = { value: Rational; unit?: string };

export type ExtractedEntity = {
  name: string;
  role: "known" | "unknown";
  quantity?: ExtractedQuantity;
};

/**
 * 句型关系取值——方向判定的机械化枚举，每个值对应唯一读法：
 *
 * | 值 | 句型 | 读法（subject 与 reference 的比较） |
 * |---|---|---|
 * | more | A比B多N | A = B + N |
 * | less | A比B少N | A = B − N |
 * | more_fraction | A比B多p/q单位 | A = B + p/q（分数差量，带单位与 more 同族） |
 * | less_fraction | A比B少p/q单位 | A = B − p/q |
 * | times | A是B的n倍 | A = B × n |
 * | times_more | A比B多n倍 | A = B × (n+1) |
 * | fraction | A是B的p/q | A = B × p/q |
 * | fraction_more | A比B多p/q | A = B × (1+p/q) |
 * | fraction_less | A比B少p/q | A = B × (1−p/q) |
 * | combo_more | A比B的n倍多M | A = B × n + M（叠加 times + diff 两条关系） |
 * | combo_less | A比B的n倍少M | A = B × n − M（叠加 times + diff 两条关系） |
 * | sum | A和B一共N | A + B = N |
 * | per_unit | 每X N单位 | 每份量 = N |
 * | per_count | N个X + 一共多少 | 份数 = N，目标为总量 |
 * | per_total | N个X共M单位 / N小时行M | 总量 = M，份数 = N |
 * | has | A有N单位 | A = N（已知量） |
 *
 * 计划初稿枚举为 more/less/times/fraction_times/sum/per 六值；落地时按
 * 「方向性判断全部写法」（02 §3.2 缺失项）细分——多n倍、多p/q、少p/q、
 * 组合句、分数差量与 per 三分支各有独立读法，缺一则方向矩阵无法机械化覆盖。
 */
export type ComparisonRelation =
  | "more"
  | "less"
  | "more_fraction"
  | "less_fraction"
  | "times"
  | "times_more"
  | "fraction"
  | "fraction_more"
  | "fraction_less"
  | "combo_more"
  | "combo_less"
  | "sum"
  | "per_unit"
  | "per_count"
  | "per_total"
  | "has";

export type ComparisonClause = {
  /** 主体名（被描述/被比较的量，如「甲」） */
  subjectName: string;
  /** 基准名（「比」的被比者、单位「1」所在，如「乙」） */
  referenceName: string;
  relation: ComparisonRelation;
  /** 主数量：差量/倍数/每份量/总量（视 relation） */
  quantity?: Rational;
  /** combo 的差量（A比B的n倍多M 的 M）；per_total 的份数 */
  diffQuantity?: Rational;
  /** 数量单位（如「个」「千克」） */
  unit?: string;
  /** 原句（confusable_terms 与 Task 5 溯源用） */
  statement: string;
};

export type Extraction = {
  entities: ExtractedEntity[];
  clauses: ComparisonClause[];
  /** 「求X」「X是多少」显式目标名 */
  targets: string[];
};

/** 方向判定用：比较类关系（subject 与 reference 可直接比较的） */
export const COMPARISON_RELATIONS: ReadonlySet<ComparisonRelation> = new Set([
  "more",
  "less",
  "more_fraction",
  "less_fraction",
  "times",
  "times_more",
  "fraction",
  "fraction_more",
  "fraction_less",
  "combo_more",
  "combo_less",
]);

/* ------------------------------------------------------------------ */
/* 关系层模型输出（规则 → 设元 → 方程 的装配结构）                      */
/* ------------------------------------------------------------------ */

/**
 * 四角色关系——与 @stepbuddy/contracts `relationItemSchema` 同构镜像。
 * rules 包保持零外部依赖（不依赖 contracts 的构建顺序），故本地声明；
 * 字段增改必须同步 `packages/contracts/src/ir.ts` 及其字段守卫测试。
 * 读法约定（与契约注释一致，机械化无歧义）：
 * - sum：subject + reference = target
 * - diff：subject − reference = target（按多/少归一为规范方向：大者在前）
 * - times：subject = reference × target（单位「1」= reference）
 * - share：subject = reference × target（归总）或 subject = reference ÷ target（归一）
 */
export type ModelRelation = {
  id: string;
  predicate: "sum" | "diff" | "times" | "share";
  subject: string;
  reference: string;
  target: string;
  operator: "+" | "-" | "×" | "÷";
  /** 原句歧义短语（如「比…少」「多n倍」），供 Task 5 定位方向写反（01 §4.4） */
  confusable_terms?: string[];
};

/** IR entity 形状（对齐 contracts entityItemSchema；id 直接用实体名） */
export type ModelEntity = {
  id: string;
  role: "known" | "unknown";
  name: string;
  value?: { num: number; den: number };
  unit?: string;
  dimension?: string;
};

/** 设元变量名：两族题均可折叠为单变量（未知量经关系互相表示） */
export const VARIABLE_NAME = "x";

/** 规则草稿：规则命中的中间结构，synthesize 装配为 RelationModel */
export type RuleDraft = {
  /** 规则标识（02 §131 DOMAIN.FAMILY.VARIANT） */
  ruleId: string;
  /** 四角色关系（id 由 synthesize 统一编号） */
  relations: Array<Omit<ModelRelation, "id">>;
  /** 全部实体（文本实体 + 规范量实体，如「总量」「差量」） */
  entities: ExtractedEntity[];
  /** 设元：单位「1」/未知主体所在实体名 */
  variable: string;
  /** 规范方程（单条、未解；渲染时变量名替换为 VARIABLE_NAME） */
  equation: string;
  /** 求解目标实体名（「求甲和乙」→ 两个） */
  targets: string[];
};

/**
 * 规则统一形状（计划 §2.3）。matches 与 apply 合并：返回 null 即不适用，
 * 编排层尝试下一条；全部不命中由 modelQuestion 报 MODEL_FAILED（01 §5）。
 */
export type ModelRule = {
  id: string;
  family: "SUMDIFF" | "MULTIPLE" | "TOTAL" | "NORMALIZE";
  apply: (extraction: Extraction) => RuleDraft | null;
};

/** 关系层模型：四角色关系 + 设元 + 规范方程（Task 4 解题空间与 Task 5 溯源的输入） */
export type RelationModel = {
  entities: ModelEntity[];
  relations: ModelRelation[];
  /** 主目标（多目标时取第一个；完整列表见 targets） */
  target: { entityId: string; answerForm: "integer" | "fraction" };
  targets: string[];
  equation: string;
  appliedRules: string[];
};

/** 建模失败（01 §5 退出码）：关系无法建模，显式报错，不静默错判 */
export type ModelingError = { code: "MODEL_FAILED"; reason: string };

export type ModelResult = RelationModel | ModelingError;
