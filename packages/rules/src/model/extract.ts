/**
 * 轻量中文句型抽取（无语义，只认两族验收用例所需句型；宁缺毋滥）。
 *
 * 覆盖句型见 types.ts ComparisonRelation 读法表。未命中任何模式的子句不
 * 出现在 clauses 中，由 model 编排层判 MODEL_FAILED——对应 01 §5「关系无法
 * 建模」显式退出，不猜关系。实体名过不了 validName 校验的子句同样跳过。
 *
 * 数量一律走 numberToRational（与 DSL 同一实现，小数/分数禁浮点的单一出处）。
 */

import { numberToRational } from "../parse.js";
import type {
  ComparisonClause,
  ComparisonRelation,
  ExtractedEntity,
  ExtractedQuantity,
  Extraction,
} from "./types.js";

const NUM = String.raw`\d+(?:\.\d+)?(?:\/\d+)?`;
const INT_NUM = String.raw`\d+(?:\.\d+)?`;
const UNIT = String.raw`[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u2103]+`;
/** 惰性单位（per 族用）：防止贪婪吞掉后续动词/「一共」首字（「8盒一共」≠「盒一」） */
const UNIT_LAZY = String.raw`[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u2103]+?`;

/** 句法关键字：出现即不是实体名（防「一共有80个」被切成实体「一」） */
const NAME_STOPWORDS = /[共每求比是多少的一倍和与及有又为行重走运装几]/;

/** 实体/容器名校验：短中文串且不含句法关键字 */
function validName(name: string): boolean {
  if (!/^[\u3400-\u9FFF]{1,6}$/.test(name)) {
    return false;
  }
  return !NAME_STOPWORDS.test(name);
}

type ClauseMatch = Omit<ComparisonClause, "statement" | "relation">;

/**
 * 句型模式表：按序首个命中者胜（倍数/分数须先于差句，「多3倍」不能被差句吃掉）。
 * build 返回 null = 句型命中但结构不合法（如「图书馆一共有200本」实体名不成对）→ 不当子句。
 */
const CLAUSE_PATTERNS: Array<{
  relation: ComparisonRelation;
  regex: RegExp;
  build: (m: RegExpMatchArray) => ClauseMatch | null;
}> = [
  // A比B的n倍多M / A比B的n倍少M（combo：times 与 diff 叠加，方向由多/少给）
  {
    relation: "combo_more",
    regex: new RegExp(`^(.+?)比(.+?)的(${INT_NUM})倍多(${INT_NUM})(${UNIT})?$`),
    build: (m) => ({
      subjectName: m[1],
      referenceName: m[2],
      quantity: numberToRational(m[3]),
      diffQuantity: numberToRational(m[4]),
      unit: m[5],
    }),
  },
  {
    relation: "combo_less",
    regex: new RegExp(`^(.+?)比(.+?)的(${INT_NUM})倍少(${INT_NUM})(${UNIT})?$`),
    build: (m) => ({
      subjectName: m[1],
      referenceName: m[2],
      quantity: numberToRational(m[3]),
      diffQuantity: numberToRational(m[4]),
      unit: m[5],
    }),
  },
  // A比B多n倍（多n倍 = (n+1) 倍，与「是n倍」区分，02 §3.2 方向判定）
  {
    relation: "times_more",
    regex: new RegExp(`^(.+?)比(.+?)多(${INT_NUM})倍$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(m[3]) }),
  },
  // A比B多p/q / A比B少p/q（分数倍增减，单位「1」= B）
  {
    relation: "fraction_more",
    regex: new RegExp(`^(.+?)比(.+?)多(\\d+)/(\\d+)$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(`${m[3]}/${m[4]}`) }),
  },
  {
    relation: "fraction_less",
    regex: new RegExp(`^(.+?)比(.+?)少(\\d+)/(\\d+)$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(`${m[3]}/${m[4]}`) }),
  },
  // A比B多p/q单位（分数差量，带单位；须先于无单位的 fraction_more，「多1/4个」≠「多1/4」）
  {
    relation: "more_fraction",
    regex: new RegExp(`^(.+?)比(.+?)多(\\d+)/(\\d+)(${UNIT})$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(`${m[3]}/${m[4]}`), unit: m[5] }),
  },
  {
    relation: "less_fraction",
    regex: new RegExp(`^(.+?)比(.+?)少(\\d+)/(\\d+)(${UNIT})$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(`${m[3]}/${m[4]}`), unit: m[5] }),
  },
  // A比B多N / A比B少N（差句）
  {
    relation: "more",
    regex: new RegExp(`^(.+?)比(.+?)多(${INT_NUM})(${UNIT})?$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(m[3]), unit: m[4] }),
  },
  {
    relation: "less",
    regex: new RegExp(`^(.+?)比(.+?)少(${INT_NUM})(${UNIT})?$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(m[3]), unit: m[4] }),
  },
  // A是B的n倍 / A是B的p/q
  {
    relation: "times",
    regex: new RegExp(`^(.+?)是(.+?)的(${INT_NUM})倍$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(m[3]) }),
  },
  {
    relation: "fraction",
    regex: new RegExp(`^(.+?)是(.+?)的(\\d+)/(\\d+)$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(`${m[3]}/${m[4]}`) }),
  },
  // A和B一共N（分隔符必选；「苹果和橘子」不会被懒匹配切成「苹」+「果橘子」）
  {
    relation: "sum",
    regex: new RegExp(`^(.+?)[和、与及](.+?)(?:一共|共有|总共|共)(${NUM})(${UNIT})?$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[2], quantity: numberToRational(m[3]), unit: m[4] }),
  },
  // 甲乙共N / 甲、乙共N（无连接词时按题面约定切单字名：「甲乙」→甲、乙）
  {
    relation: "sum",
    regex: new RegExp(`^(.+?)(?:一共|共有|总共|共)(${NUM})(${UNIT})?$`),
    build: (m) => {
      const names = m[1].split("");
      if (names.length < 2 || !names.every(validName)) {
        return null; // 「图书馆一共有200本」等不成对实体名 → 不抽取
      }
      return { subjectName: names[0], referenceName: names[1], quantity: numberToRational(m[2]), unit: m[3] };
    },
  },
  // 每盒5个 / 每小时行40千米（每份量，动词可选）
  {
    relation: "per_unit",
    regex: new RegExp(`^每(${UNIT_LAZY})(?:重|有|行|走|运|装)?(${NUM})(${UNIT})$`),
    build: (m) => ({ subjectName: "每份量", referenceName: m[1], quantity: numberToRational(m[2]), unit: m[3] }),
  },
  // 3箱重45千克 / 3小时行120千米（已知总量 + 份数）
  {
    relation: "per_total",
    regex: new RegExp(`^(${INT_NUM})(${UNIT})(?:重|有|行|走|运|装)(${NUM})(${UNIT})$`),
    build: (m) => ({
      subjectName: "已知总量",
      referenceName: `每${m[2]}`,
      quantity: numberToRational(m[3]),
      diffQuantity: numberToRational(m[1]),
      unit: m[4],
    }),
  },
  // 8盒一共多少个（份数 + 总量未知目标）
  {
    relation: "per_count",
    regex: new RegExp(`^(${INT_NUM})(${UNIT_LAZY})(?:一共|共有|总共|共)(?:多少|几)(${UNIT})?$`),
    build: (m) => ({ subjectName: "份数", referenceName: m[2], quantity: numberToRational(m[1]), unit: m[3] }),
  },
  // 5箱重多少千克（份数 + 总量未知目标）
  {
    relation: "per_count",
    regex: new RegExp(`^(${INT_NUM})(${UNIT_LAZY})(?:重|有|行|走)(?:多少|几)(${UNIT})?$`),
    build: (m) => ({ subjectName: "份数", referenceName: m[2], quantity: numberToRational(m[1]), unit: m[3] }),
  },
  // A有N单位（已知量直给）
  {
    relation: "has",
    regex: new RegExp(`^(.+?)有(${NUM})(${UNIT})?$`),
    build: (m) => ({ subjectName: m[1], referenceName: m[1], quantity: numberToRational(m[2]), unit: m[3] }),
  },
];

/** 每X重多少 / 一共多少：目标为通用名，由规则层解析 */
const PER_UNIT_TARGET = new RegExp(`^每(${UNIT})?(?:重|有|行|走)?(?:多少|几)(${UNIT})?$`);

const WITH_QUANTITY: ReadonlySet<ComparisonRelation> = new Set(["has", "per_unit", "per_total", "per_count"]);

/** 规范名（每份量/已知总量/份数）不过文本校验；文本名（比较句/和句/有句）才校验 */
const CANONICAL_NAMES: ReadonlySet<ComparisonRelation> = new Set(["per_unit", "per_total", "per_count"]);

/** 题面文本 → 中性抽取结构 */
export function extract(text: string): Extraction {
  const entities = new Map<string, ExtractedEntity>();
  const clauses: ComparisonClause[] = [];
  const targets: string[] = [];

  const addTarget = (name: string): void => {
    if (!targets.includes(name)) {
      targets.push(name);
    }
    if (!entities.has(name)) {
      entities.set(name, { name, role: "unknown" });
    }
  };

  for (const statement of splitStatements(text)) {
    // 目标句：求X / 设X为x / X是多少
    const askAll = /^求(.+)$/.exec(statement);
    if (askAll) {
      if (askAll[1].startsWith("几")) {
        addTarget("份数"); // 「求几箱」所求为份数（规范名），不可按实体名处理
        continue;
      }
      for (const part of splitNames(askAll[1])) {
        // 「求甲乙」无连接词：按已出场实体贪心分解（「求苹果」不可分解 → 原样）
        for (const name of splitKnownNames(part, entities)) {
          addTarget(name);
        }
      }
      continue;
    }
    const assume = /^设(.+?)为(.+)$/.exec(statement);
    if (assume) {
      addTarget(assume[1]);
      continue;
    }
    const askOne = new RegExp(`^(.+?)是多少$`).exec(statement);
    if (askOne) {
      addTarget(askOne[1]);
      continue;
    }
    if (PER_UNIT_TARGET.test(statement)) {
      addTarget("每份量");
      continue;
    }
    // 求几箱 / 能装几盒 → 所求为份数（规范名）
    if (/^(?:求|能|可以)/.test(statement) && statement.includes("几")) {
      addTarget("份数");
      continue;
    }

    // 比较/汇总/份数句（按序首个命中）
    for (const pattern of CLAUSE_PATTERNS) {
      const m = pattern.regex.exec(statement);
      if (!m) {
        continue;
      }
      const built = pattern.build(m);
      if (!built) {
        break; // 句型命中但结构不合法（实体名不成对）→ 不当子句
      }
      // per_* 的实体名（每份量/已知总量/份数/总量）为规范名，不过文本校验；
      // 容器名（盒/箱/每箱）是单位性名词，不建实体
      const canonical = CANONICAL_NAMES.has(pattern.relation);
      if (!canonical) {
        if (!validName(built.subjectName)) {
          break; // 句型命中但实体名不合法（如「一共有80个」）→ 不当子句
        }
        if (built.subjectName !== built.referenceName && !validName(built.referenceName)) {
          break;
        }
      }
      clauses.push({ ...built, relation: pattern.relation, statement });
      // 数量只挂到 has/per_* 的主实体；比较句/和句的 quantity 是差量/倍数/总量，
      // 由规则层消费（「甲比乙多10个」的 10 不是甲的数量）
      const withQuantity = WITH_QUANTITY.has(pattern.relation);
      const subjectQuantity =
        withQuantity && built.quantity !== undefined
          ? // per_count 的 unit 是总量单位（目标用），份数本身不带单位
            { value: built.quantity, unit: pattern.relation === "per_count" ? undefined : built.unit }
          : undefined;
      upsert(entities, built.subjectName, subjectQuantity, withQuantity);
      if (!canonical && built.referenceName !== built.subjectName && validName(built.referenceName)) {
        upsert(entities, built.referenceName, undefined, false);
      }
      if (pattern.relation === "per_count") {
        addTarget("总量"); // 「8盒一共多少个」「5箱重多少千克」所求即总量
      }
      break;
    }
  }

  return { entities: [...entities.values()], clauses, targets };
}

function upsert(
  entities: Map<string, ExtractedEntity>,
  name: string,
  quantity: ExtractedQuantity | undefined,
  known: boolean,
): void {
  const existing = entities.get(name);
  if (!existing) {
    entities.set(name, { name, role: known ? "known" : "unknown", quantity });
    return;
  }
  if (quantity !== undefined && existing.quantity === undefined) {
    existing.quantity = quantity;
    existing.role = "known";
  }
  // 不降级：已有数量的 known 实体不被 unknown upsert 覆盖
}

/** 分句：中文标点 + 空白（不含「、」——「甲、乙共80」依赖顿号连接） */
function splitStatements(text: string): string[] {
  return text
    .split(/[，。；！？!?,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** 「求甲乙」「求甲和乙」「求甲、乙」→ 名称列表 */
function splitNames(text: string): string[] {
  return text
    .split(/[和、与及]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * 无连接词的目标名按已出场实体贪心分解：「甲乙」+ 实体表[甲,乙] → [甲,乙]。
 * 无法分解（如「苹果」不在实体表）→ 原样返回一个名字，由上层决定成败。
 */
function splitKnownNames(name: string, entities: Map<string, ExtractedEntity>): string[] {
  const known = [...entities.keys()].sort((a, b) => b.length - a.length);
  const parts: string[] = [];
  let rest = name;
  while (rest.length > 0) {
    const hit = known.find((candidate) => rest.startsWith(candidate));
    if (!hit) {
      return [name];
    }
    parts.push(hit);
    rest = rest.slice(hit.length);
  }
  return parts;
}
