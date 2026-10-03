/**
 * 评测集加载：data/dataset.json 是唯一数据源（由生成器 buildDataset 产出、git 纳入）。
 * 读取即 schema.parse——数据漂移（手改 JSON、生成器与文件不一致）直接报错。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { caseSchema, type Case } from "./schema.js";

const DATA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/dataset.json");

export function loadCasesFrom(path = DATA_PATH): Case[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`评测集应为数组：${path}`);
  }
  return raw.map((item, index) => {
    const parsed = caseSchema.safeParse(item);
    if (!parsed.success) {
      throw new Error(`评测集第 ${index + 1} 项不符合 schema：${parsed.error.message}`);
    }
    return parsed.data;
  });
}

export { caseSchema, type Case } from "./schema.js";
export { expectedModelSchema, type ExpectedModel } from "./schema.js";
