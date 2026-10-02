# 08 诊断结果 Schema

## 本文档解决什么问题

`01-ir-schema.md` 定义了输入侧：题目 IR 与学生步骤 IR。但**输出侧一直没有任何结构定义**——全库检索「诊断结果结构」零命中。后果是三端无从开工：学生端不知道标红哪一步要拿什么字段，家长端不知道报告从哪取数，前端与后端之间没有契约，`06` 的可见性矩阵也无从落地到字段级。

本文档定义诊断结果的唯一契约，以及诊断快照的存储结构（G-20）。

## 前置依赖与文档关系

输入是 [01-ir-schema.md](./01-ir-schema.md) 的 QuestionIR 与 StepIR；逐步判定、错误分类、逆向解释的语义来自 [03-alignment-and-diagnosis.md](./03-alignment-and-diagnosis.md)；退出码来自 `03` §8.1；接口层消费本文档的载荷见 [09-api-contracts.md](./09-api-contracts.md)；掌握度模型消费本文档的 `evidence` 字段（见 [05-mastery-model.md](./05-mastery-model.md) §3）；字段级可见性受 [06-identity-and-data-model.md](./06-identity-and-data-model.md) §3 约束。

---

## 1. 顶层结构

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schema_version` | string | 是 | 结果 schema 版本，见 §6 |
| `result_id` | string | 是 | 全局唯一 |
| `question_id` | string | 是 | 引用 QuestionIR |
| `versions` | object | 是 | 四项版本，见 §2 |
| `verdict` | enum | 是 | `correct` / `incorrect` / `partial` / `unknown` |
| `confidence` | number | 是 | 0 到 1，诊断置信度 |
| `steps` | array | 是 | 逐步结果，见 §3 |
| `source_error` | object | 否 | 源头错误，见 §4；`verdict=correct` 时为 null |
| `fallback` | object | 否 | 退化模式标记，见 §5 |
| `teaching` | object | 否 | 教学输出，见 §4.3 |
| `knowledge_points` | array | 是 | 本题涉及的知识点标识 |
| `evidence` | object | 是 | 供掌握度模型消费，见 §4.4 |
| `score` | object | 否 | P2 启用，见 §4.5 |
| `traceability` | object | 是 | 可追溯性校验结果，见 §4.2 |

`verdict` 四档的判定：

| 取值 | 判定 |
|---|---|
| `correct` | 全部步骤判对 |
| `incorrect` | 存在源头错误 |
| `partial` | 一题多解场景给出部分解；或存在并发次要错误但主体正确 |
| `unknown` | 触发退化模式且无法判定，见 §5 |

---

## 2. 版本四元组

每个结果必须携带四项版本，任一缺失则该结果不可用于争议复核。

| 字段 | 说明 |
|---|---|
| `ir_schema_version` | 对应 `01` §7 的 schema 版本 |
| `rule_lib_version` | 元规则库版本 |
| `model_version` | 结构化与讲解所用模型版本 |
| `prompt_template_version` | 提示词模板版本 |

四项版本与快照一致时为「可复现状态」；不一致时该结果仅供历史查看，不作为质量判定依据。

---

## 3. 逐步结果

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `index` | integer | 是 | 与 StepIR 对齐 |
| `status` | enum | 是 | `correct` / `incorrect` / `inherited` / `not_judged` |
| `equivalence_level` | enum | 否 | `strict` / `formal` / `approximate`，对应 `00` §2.2 的等价等级 |
| `cost` | number | 否 | 该步对齐代价，见 `03` §3.2 |
| `transforms` | array | 否 | 该步命中的元规则，见 `01` §5 |
| `error` | object | 否 | 该步错误明细，见 §4.1 |
| `reverse_explanation` | object | 否 | 跳步的逆向解释，见 `03` §7.2 |
| `variant_advice` | string | 否 | 变形建议，针对合法非推荐路径 |

`status` 四档与 `03` §6.1 的三类错误是一一对应的：

| status | 含义 | 扣分 |
|---|---|---|
| `correct` | 判对 | 否 |
| `incorrect` | 源头错误或并发次要错误，由 `error.role` 区分 | 是（并发次要错误按 30% 权重） |
| `inherited` | 继承错误 | 否 |
| `not_judged` | 未通过不变量检查或触发退化模式，无法判定 | 否，且不计入准确率分母 |

---

## 4. 错误与教学输出

### 4.1 错误明细

| 字段 | 类型 | 说明 |
|---|---|---|
| `role` | enum | `source`（源头错误）/ `concurrent`（并发次要错误）/ `inherited`（继承错误） |
| `classification` | enum | `knowledge` / `behavioral` / `normative`，对应 `00` §2.2 的错误分类 |
| `subtype` | string | 行为性错误下位：`slip`（笔误）/ `miscalc`（计算失误） |
| `rule_id` | string | 规则级定位，指向 `transforms` 条目 |
| `location` | object | 位置级定位，见 §4.1.1 |
| `reason` | string | 面向用户的错误原因 |
| `traceable` | boolean | 该原因是否可追溯到 `transforms` 条目 |

**`traceable` 是硬约束**：值为 `false` 的 `reason` 不得出现在「错误原因」区，只能出现在「教学建议」区（见 `01` §5）。`03` §5.1 规定不存在可解释的元规则集合时，`transforms` 为空，`reason` 只能表述为「无法用已支持规则解释该步」。

#### 4.1.1 位置级定位

| 字段 | 说明 | 示例 |
|---|---|---|
| `span` | 出错表达式片段 | 分配律展开后的第二项 |
| `hint` | 位置提示 | 「漏乘了第二项」 |

### 4.2 可追溯性校验

| 字段 | 说明 |
|---|---|
| `reasons_total` | 输出的错误原因条数 |
| `reasons_traceable` | 可追溯到 `transforms` 的条数 |
| `all_traceable` | 两者是否相等 |

`all_traceable` 为 `false` 时不得对外发布该结果。讲解归因可追溯率（PRD 1.4.1 目标 100%）以此字段统计。

### 4.3 教学输出

| 字段 | 说明 |
|---|---|
| `correct_path` | 正确解题路径的步骤序列 |
| `reverse_explanation` | 跳步的补全路径与关键步（`03` §7.2） |
| `teaching_advice` | 教学建议，含变形建议与超纲标注 |
| `explanation_source` | `model` / `template`，讲解降级时取 `template`（降级开关 G-2） |

### 4.4 掌握度证据

供 [05-mastery-model.md](./05-mastery-model.md) 消费，字段固定三项：知识点标识、判定结论、错误分类。

| 字段 | 说明 |
|---|---|
| `knowledge_points` | 本题知识点标识列表 |
| `verdict` | 与顶层 `verdict` 一致 |
| `error_classification` | 源头错误的分类，无错误时为 null |

**明确排除**：图片、题目文本、辅导对话、答题时长不得进入本对象（`05` §3 已规定证据范围）。

### 4.5 评分（P2 启用）

`score` 结构：`total`、`step_scores[]`、`normative_deduction`。P0 不产出本对象。口径见 `03` §7.3。

---

## 5. 退化模式标记

触发 `03` §8 任一退化模式时，`fallback` 必填：

| 字段 | 说明 |
|---|---|
| `mode` | `answer_only` / `multi_solution` / `invalid_expr` / `geometry_no_parse` / `single_expr` / `unparsable_input` |
| `exit_code` | `DAG_NO_PATH` / `DAG_CYCLE_DETECTED` / `DEPTH_EXCEEDED` / `COST_EXCEEDED` / `ALIGN_FAILED` / `INVALID_EXPR` / `GEOMETRY_NO_PARSE` |
| `user_message` | 用户可见话术 |
| `partial_steps` | 已判定的步骤数，用于续跑 |

`answer_only` 模式下**不产出任何错误分类**（`03` §8.3），`evidence.error_classification` 为 null，且该次诊断不计入归因准确率分母（见 `04` §2.3）。

---

## 6. 诊断快照

快照是争议复核与结果复现的唯一依据（`01` §7 要求、`06` §2 列为实体）。本文档给出其存储结构。

| 字段 | 类型 | 说明 |
|---|---|---|
| `snapshot_id` | string | 唯一 |
| `result_id` | string | 关联结果 |
| `student_id` | string | 归属学生 |
| `input` | object | 原始输入引用：图片存储引用或手输文本 |
| `question_ir` | object | 完整 QuestionIR |
| `step_irs` | array | 完整 StepIR 序列 |
| `versions` | object | §2 的四项版本 |
| `result` | object | 完整诊断结果 |
| `degradation_log` | array | 本次触发的降级开关记录 |
| `created_at` | timestamp | 创建时间 |
| `retention_expires_at` | timestamp | 到期时间，默认 12 个月（`06` §7） |

三条约束：

1. 快照**不向家长与教师开放**（`06` §3），仅学生本人与争议复核流程可见；
2. 快照保留期 12 个月，短于诊断记录的 36 个月——因为快照含完整 IR，属实现数据，保留成本与风险都更高；
3. 用户删除诊断记录时，快照须同步删除（`06` §5 C-6）。

---

## 7. JSON 示例

对应 `01` §8.1 的分数四则题（源头错误在第 1 步）。

```json
{
  "schema_version": "1.0.0",
  "result_id": "r-20261002-000137",
  "question_id": "q-20261002-000137",
  "versions": {
    "ir_schema_version": "1.0.0",
    "rule_lib_version": "0.4.2",
    "model_version": "locked-20260930",
    "prompt_template_version": "tpl-2.1"
  },
  "verdict": "incorrect",
  "confidence": 0.86,
  "steps": [
    {
      "index": 1,
      "status": "incorrect",
      "equivalence_level": null,
      "cost": 0.31,
      "transforms": [
        { "rule_id": "NUM.FRAC.MUL", "status": "violated", "evidence": "只乘了其中一个因数" }
      ],
      "error": {
        "role": "source",
        "classification": "behavioral",
        "subtype": "miscalc",
        "rule_id": "NUM.FRAC.MUL",
        "location": { "span": "1/2 * 2/3", "hint": "第二个因数未参与相乘" },
        "reason": "分数乘法要把两个分数的分子相乘、分母相乘，这一步只处理了其中一个",
        "traceable": true
      }
    },
    {
      "index": 2,
      "status": "inherited",
      "equivalence_level": "strict",
      "cost": 0.12,
      "transforms": [
        { "rule_id": "NUM.FRAC.COMMON", "status": "legal" }
      ]
    }
  ],
  "source_error": {
    "step_index": 1,
    "classification": "behavioral",
    "rule_id": "NUM.FRAC.MUL",
    "reason": "分数乘法要把两个分数的分子相乘、分母相乘，这一步只处理了其中一个"
  },
  "teaching": {
    "correct_path": ["1/2 * 2/3 = 1/3", "3/4 + 1/3 = 9/12 + 4/12 = 13/12"],
    "reverse_explanation": null,
    "teaching_advice": "先算乘法再通分，可以少一次通分",
    "explanation_source": "model"
  },
  "knowledge_points": ["FRAC.MUL", "FRAC.ADD", "NUM.LCM"],
  "evidence": {
    "knowledge_points": ["FRAC.MUL", "FRAC.ADD", "NUM.LCM"],
    "verdict": "incorrect",
    "error_classification": "behavioral"
  },
  "traceability": { "reasons_total": 1, "reasons_traceable": 1, "all_traceable": true }
}
```

---

## 8. 验收清单

- [ ] 顶层字段覆盖判定、步骤、源头错误、教学、证据、可追溯性六组
- [ ] 逐步 `status` 四档与 `03` §6.1 三类错误一一对应
- [ ] `traceable` 约束成文，且明确不可追溯的原因不得进入错误原因区
- [ ] 退化模式标记含 mode、exit_code、user_message、partial_steps
- [ ] 掌握度 `evidence` 固定三项且明确排除项
- [ ] 快照结构含四项版本、保留期、可见性与删除联动
- [ ] 至少一个端到端 JSON 示例，且示例含继承错误步
