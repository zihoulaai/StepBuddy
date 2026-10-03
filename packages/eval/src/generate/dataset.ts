/**
 * 150 题评测集装配（Task 9.1/9.2：40 人工种子 + 102 模板合成 + 8 建模拟败）。
 *
 * 规格依据：
 * - MVP 文档「验证方式」：150 道应用题、两族、错误解法 ≥40%（本题集 90/150=60%）；
 * - 04 §2 配比：难度 40/45/15、错误样本 ≥20%（MVP 加强）、应用题两族 100%；
 * - 01 §5 排除项：除零/无法解析步（6 题）不计 M-1 分母；
 * - 数值反推与句式模板见 templates.ts，注入器见 errors.ts（合成题配额见 INJECTION_PLAN）。
 *
 * 确定性：禁 Math.random/Date.now；产物写 data/dataset.json，dataset.test 断言
 * buildDataset() 与文件 deepEqual（禁止手改 JSON——变更必须走模板/种子）。
 * expected_model 一律由模板 builder 参量直出（含种子；不用系统镜像，避免循环标注）。
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { modelQuestion, generateSolutionSpace, recommendedPathIds } from "@stepbuddy/rules";
import { caseSchema, type Case } from "../cases/schema.js";
import { applyInjection, isApplicable, type InjectionContext, type InjectionId } from "./errors.js";
import { buildTemplateSpecs, type Difficulty, type Family, type Group, type TemplateSpec } from "./templates.js";
import { SEEDS } from "./seeds.js";

/**
 * 合成题注入配额（稀缺优先分配顺序）：
 * 知识性 38（move 16 + direction 22）、行为性 27（miscalc 13 + slip 12 + typo_b3 2）、
 * 规范性 5、排除项 4（div_zero 2 + malformed 2）、无错 28；另建模拟败 8。
 * 与种子侧（知识性 2、行为性 3、规范性 1、排除 2、无错 32）合计：
 * 知识性 40 / 行为性 30 / 规范性 6 / 排除 6 / 建模拟败 8 / 无错 60 = 150 ✓。
 *
 * 适用面约束（试跑校准；harness.test 注入命中守卫固化该结论）：
 * - move 仅适用 S1/S2/M4（首步翻转归建模分支无 rule_id；余下题型推荐路径无非首步可翻符号）
 *   ——合成题 S1 6 + S2 6 + M4 4 = 16，配额填满即全部占位；
 * - direction 适用 24 题（S3 4 + S4 6 + M1 6 + M2 4 + M5 3 + M6 1），配额 22 有余量；
 * - miscalc/slip/typo_b3/normative 需整数解（合成题全部满足；slip 另需易混位）；
 * - div_zero/malformed 全题型适用（1 步路径追加、多步路径换末步）。
 */
const INJECTION_PLAN: Array<[InjectionId, number]> = [
  ["move", 16],
  ["direction", 22],
  ["normative", 5],
  ["miscalc", 13],
  ["slip", 12],
  ["typo_b3", 2],
  ["div_zero", 2],
  ["malformed", 2],
];

/** 建模拟败题（覆盖矩阵外：病句/缺要素/非两族，01 §5 必须显式 MODEL_FAILED 不静默错判）。
 *  8 条句式全部经 modelQuestion 试跑验证返回 MODEL_FAILED（harness.test 守卫）；
 *  族口径 1+7，与 synth 46/56、种子 28/12 合计两族各 75。 */
const MODEL_FAILED_SPECS: Array<{ family: Family; group: Group; difficulty: Difficulty; questionText: string }> = [
  { family: "sumdiff", group: "sumdiff_group", difficulty: "easy", questionText: "甲有铅笔，乙有尺子，求甲和乙" },
  { family: "total", group: "normalize_group", difficulty: "medium", questionText: "每盒装一些，8盒一共多少个" },
  { family: "total", group: "normalize_group", difficulty: "medium", questionText: "每小时行一些千米，5小时行多少千米" },
  { family: "total", group: "normalize_group", difficulty: "hard", questionText: "把一根绳子剪成两段，一段长一些，求每段多长" },
  { family: "normalize", group: "normalize_group", difficulty: "hard", questionText: "一个正方形的边长是多少，面积是多少" },
  { family: "normalize", group: "normalize_group", difficulty: "hard", questionText: "一筐苹果每天吃一些，求几天吃完" },
  { family: "normalize", group: "normalize_group", difficulty: "hard", questionText: "一箱零件每天用一些，求几天用完" },
  { family: "normalize", group: "normalize_group", difficulty: "hard", questionText: "读一本书，每天读一些，求几天读完" },
];

const DATA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/dataset.json");

/** 注入上下文：规则层直链一次算出（modelQuestion → DAG → 推荐路径 + 终节点解 + 单位） */
function specContext(questionText: string, spec: TemplateSpec): InjectionContext {
  const model = modelQuestion(questionText);
  if ("code" in model) {
    throw new Error(`种子/模板题应可建模：${questionText} → ${model.code} ${model.reason}`);
  }
  const result = generateSolutionSpace(model);
  if (result.status === "no_path") {
    throw new Error(`种子/模板题应可展开：${questionText} → ${result.reason}`);
  }
  if (result.status === "partial") {
    throw new Error(`种子/模板题应完整展开：${questionText} → ${result.flag}（未覆盖 ${result.uncoveredNodeIds.length} 节点）`);
  }
  const nodes = new Map(result.space.nodes.map((node) => [node.id, node]));
  const ids = recommendedPathIds(result.space);
  const path = ids.map((id) => {
    const node = nodes.get(id);
    if (node === undefined) throw new Error(`DAG 节点缺失：${id}`);
    return node.text;
  });
  const terminal = nodes.get(ids[ids.length - 1]!);
  const unit = spec.expectedModel.entities.find((entity) => entity.unit !== undefined)?.unit ?? "个";
  return { path, solution: terminal?.solution ?? null, unit };
}

function caseFrom(entry: {
  id: string;
  family: Family;
  group: Group;
  difficulty: Difficulty;
  questionText: string;
  source: "photo" | "manual";
  steps: string[];
  annotation: {
    modeling: "ok" | "model_failed";
    steps: Case["annotation"]["steps"];
    error?: Case["annotation"]["error"];
  };
  expectedModel?: Case["annotation"]["expected_model"];
  excluded?: Case["excluded"];
}): Case {
  return caseSchema.parse({
    id: entry.id,
    family: entry.family,
    group: entry.group,
    difficulty: entry.difficulty,
    question_text: entry.questionText,
    student_steps: entry.steps,
    source: entry.source,
    annotation: {
      modeling: entry.annotation.modeling,
      ...(entry.expectedModel !== undefined ? { expected_model: entry.expectedModel } : {}),
      steps: entry.annotation.steps,
      ...(entry.annotation.error !== undefined ? { error: entry.annotation.error } : {}),
    },
    ...(entry.excluded !== undefined ? { excluded: entry.excluded } : {}),
  });
}

/** 由注入结果与题面元数据组装 Case（步骤标注/错误分类/排除项来自注入器；模型期望来自模板） */
function caseFromInjected(entry: {
  id: string;
  spec: TemplateSpec;
  injected: ReturnType<typeof applyInjection> & object;
}): Case {
  const { id, spec, injected } = entry;
  return caseFrom({
    id,
    family: spec.family,
    group: spec.group,
    difficulty: spec.difficulty,
    questionText: spec.questionText,
    source: injected.source,
    steps: injected.steps,
    annotation: { modeling: "ok", steps: injected.annotation.steps, error: injected.annotation.error },
    expectedModel: spec.expectedModel,
    excluded: injected.excluded,
  });
}

/**
 * 稀缺优先贪心分配：按 INJECTION_PLAN 顺序（move→direction→normative→miscalc→slip→
 * typo_b3→div_zero→malformed）逐配额扫描 spec 序，适用且未分配即占位；
 * 配额填不满直接抛错（适用面不足 = 模板/配额漂移，禁静默降级）；剩余 spec 记无错。
 */
function allocateInjections(contexts: InjectionContext[]): InjectionId[] {
  const assigned: Array<InjectionId | null> = contexts.map(() => null);
  for (const [id, quota] of INJECTION_PLAN) {
    let left = quota;
    for (let i = 0; i < contexts.length && left > 0; i += 1) {
      if (assigned[i] !== null) continue;
      if (!isApplicable(id, contexts[i]!)) continue;
      assigned[i] = id;
      left -= 1;
    }
    if (left > 0) {
      throw new Error(`注入配额无法填满：${id} 差 ${left} 题（适用面不足，需调整配额或模板）`);
    }
  }
  return assigned.map((id) => id ?? "none");
}

/** 102 合成题：spec 上下文 → 注入分配 → Case（eval-041 起） */
function buildSynthetic(startIndex: number): Case[] {
  const specs = buildTemplateSpecs(102);
  const contexts = specs.map((spec) => specContext(spec.questionText, spec));
  const assigned = allocateInjections(contexts);
  return specs.map((spec, i) => {
    const injected = applyInjection(assigned[i]!, contexts[i]!);
    if (injected === null) {
      throw new Error(`分配与适用性不一致：${spec.questionText} → ${assigned[i]}`);
    }
    return caseFromInjected({ id: `eval-${String(startIndex + i).padStart(3, "0")}`, spec, injected });
  });
}

/** 8 道建模拟败题：无步骤、无期望模型，标注 modeling=model_failed（eval 尾段） */
function buildModelFailed(startIndex: number): Case[] {
  return MODEL_FAILED_SPECS.map((failed, i) =>
    caseFrom({
      id: `eval-${String(startIndex + i).padStart(3, "0")}`,
      family: failed.family,
      group: failed.group,
      difficulty: failed.difficulty,
      questionText: failed.questionText,
      source: "manual",
      steps: [],
      annotation: { modeling: "model_failed", steps: [] },
    }),
  );
}

export function buildDataset(): Case[] {
  const seeds = SEEDS.map((seed) => {
    const injected = applyInjection(seed.injection, specContext(seed.spec.questionText, seed.spec));
    if (injected === null) {
      throw new Error(`种子注入不适用：${seed.id} ${seed.injection}`);
    }
    return caseFromInjected({ id: seed.id, spec: seed.spec, injected });
  });
  const synthetic = buildSynthetic(SEEDS.length + 1);
  const modelFailed = buildModelFailed(SEEDS.length + synthetic.length + 1);
  return [...seeds, ...synthetic, ...modelFailed];
}

/** 一次性产出 data/dataset.json（git 纳入；dataset.test 的 deepEqual 守卫禁止手改） */
function main(): void {
  const cases = buildDataset();
  writeFileSync(DATA_PATH, `${JSON.stringify(cases, null, 2)}\n`, "utf8");
  console.log(`已写出 ${cases.length} 题 → ${DATA_PATH}`);
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) main();
