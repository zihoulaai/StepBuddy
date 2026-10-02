# 01 IR Schema 与表达式 DSL 规范

## 本文档解决什么问题

v1 PRD 反复出现「IR」「标准 IR」「三层 IR 结构」，却没有任何字段定义。实现方各自造了一套数据结构；「三层 IR」是三个 schema 还是一个 schema 的三层，说不清；「变换规则标签」由谁填也没写——填错就等于让模型直接给答案归因。

本文档给出中间表示的唯一契约：三层各带字段表，表达式有文法，示例三份，规则标签的归属写死为引擎推导。

## 前置依赖与文档关系

术语以 [00-glossary-and-traceability.md](./00-glossary-and-traceability.md) §2 为准。本文档是 [03-alignment-and-diagnosis.md](./03-alignment-and-diagnosis.md) 的输入契约：诊断算法消费本文档定义的表达式节点与步骤结构。知识点标注字段由 [05-mastery-model.md](./05-mastery-model.md) 消费。

---

## 1. 范围与职责边界

**本文档定义**：题目 IR、学生步骤 IR、表达式 DSL、结构化环节的输出契约与不变量、schema 版本策略。

**本文档不定义**：诊断判定算法（在 03）、题型覆盖范围（在 02）、指标口径（在 04）。

**IR 在系统中的位置**：

```
自然语言输入 ──结构化环节──> QuestionIR ──规则引擎──> 解题空间 DAG
自然语言步骤 ──结构化环节──> StepIR[]    ──诊断算法──> 诊断结论
```

IR 是**唯一**的组件间数据交换格式。任何组件不得绕过 IR 直接传递自造结构。

---

## 2. 三层结构

三层是同一个 schema 的三个分组，不是三套 schema。每层职责互斥。

| 层级 | 回答什么问题 | 诊断作用 |
|---|---|---|
| 实体层 | 题目里有哪些量，它们的值、单位、量纲是什么 | 漏看条件、抄错数、单位错误 |
| 关系层 | 量之间是什么关系，公式怎么调用 | 题意理解错误、公式记错、列式错误 |
| 表达式层 | 每一步的具体算式是什么，由哪条变换而来 | 计算错误、规则误用 |

### 2.1 顶层结构

| 字段 | 类型 | 必填 | 约束 | 示例 |
|---|---|---|---|---|
| `schema_version` | string | 是 | 语义化版本，见 §7 | `"1.0.0"` |
| `question_id` | string | 是 | 系统生成，全局唯一 | `"q-20261002-000137"` |
| `question_type` | enum | 是 | 取值见 §2.2 | `"fraction_arith"` |
| `grade_band` | enum | 是 | `G1`…`G6` | `"G5"` |
| `textbook_version` | enum | 否 | 未识别时留空，不影响诊断 | `"人教版"` |
| `entity` | object | 是 | 见 §2.3 | 见 §8.1 |
| `relation` | array | 否 | 见 §2.4；纯计算题可为空 | 见 §8.3 |
| `target` | object | 是 | 见 §2.5 | 见 §8.1 |
| `constraint` | object | 否 | 见 §2.6 | 见 §8.2 |
| `steps` | array | 否 | 步骤 IR 序列，见 §3；只写答案不写过程时可为空 | 见 §8.1 |
| `tags` | object | 否 | 见 §2.7 | 见 §8.2 |

`relation` 可为空而诊断仍可进行，这正是「纯计算题」与「应用题」在数据结构上的唯一差别。

### 2.2 question_type 枚举

枚举值与覆盖矩阵中的题型行一一对应，新增取值必须先在 [02-coverage-matrix.md](./02-coverage-matrix.md) 登记。

`int_arith`（整数四则）、`decimal_arith`（小数四则）、`fraction_arith`（分数四则）、`simplify_calc`（简便运算）、`equation`（解方程）、`column_calc`（列式计算）、`word_problem`（应用题）、`geometry_calc`（几何计算）、`percent_ratio`（百分数与比）、`new_operator`（受限符号 DSL 模板，见 02 §5）。

`geometry_calc` 与其他类型的关键差异：实体层必须携带图形解析产物，缺该产物时该题直接进入退化模式，不进入规则引擎。

### 2.3 实体层字段

| 字段 | 类型 | 必填 | 约束 | 示例 |
|---|---|---|---|---|
| `entities` | array | 是 | 可为空数组，不可缺字段 | — |
| `entities[].id` | string | 是 | 同一 IR 内唯一，引用式命名 | `"n1"` |
| `entities[].role` | enum | 是 | `known` / `unknown` / `intermediate` / `constant` | `"known"` |
| `entities[].name` | string | 是 | 原文名称，不做翻译 | `"宽"` |
| `entities[].value` | object | `role≠unknown` 时必填 | 见 §2.3.1 | — |
| `entities[].unit` | string | 否 | 缺失时不得推断，标 `unit_unknown` | `"厘米"` |
| `entities[].dimension` | enum | 否 | `length` / `area` / `volume` / `mass` / `time` / `number` / `angle` / `money` / `count` | `"length"` |

#### 2.3.1 量的表示

数值一律用精确有理数表示，`num` 与 `den` 互质且 `den > 0`。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `num` | integer | 是 | 分子 | `3` |
| `den` | integer | 是 | 分母，必须为正 | `4` |
| `exact` | boolean | 是 | `false` 表示题目要求保留小数/估算，此时候选值仅为近似 | `true` |

**硬约束**：等价判定不得以小数近似参与。只有当 `exact` 为 `false` 时才允许进入近似等价等级（见 03 §4.3）。`1/2` 不得存成 `0.5` 后参与严格数值等价判定。

### 2.4 关系层字段

每条关系必须把四个角色填全，缺任一角色视为结构化失败（这是 v1 评审 M-7 所说的「LLM 强制输出语义角色」的落地产物）。

| 字段 | 类型 | 必填 | 约束 | 示例 |
|---|---|---|---|---|
| `id` | string | 是 | 唯一 | `"r1"` |
| `predicate` | enum | 是 | `sum` / `diff` / `times` / `ratio` / `share` / `formula` | `"diff"` |
| `subject` | string | 是 | 引用实体 id，被描述的量 | `"n1"` |
| `reference` | string | 是 | 引用实体 id，比较基准，「甲比乙多」中基准是乙 | `"n2"` |
| `target` | string | 是 | 引用实体 id，被比较的量 | `"n1"` |
| `operator` | string | 是 | 关系符号，如 `+` `-` `×` `÷` | `"-"` |
| `formula_id` | string | `predicate=formula` 时必填 | 引用几何/数量公式，见 §2.4.1 | `"GEO.PERIM.RECT"` |
| `confusable_terms` | array | 否 | 本关系涉及的口径歧义短语，供反向校验使用 | `["增加到","增加了"]` |

`reference` 与 `target` 不可填同一个实体；`predicate=diff` 时二者必须有值，否则该关系退化为无基准比较，需要人工确认。

#### 2.4.1 公式标识命名

格式 `DOMAIN.FAMILY.VARIANT`，例如 `GEO.PERIM.RECT`、`GEO.AREA.RECT`、`NUM.FRAC.ADD`。

`DOMAIN` 取值：`NUM`（数与运算）、`GEO`（图形与量）、`REL`（数量关系）、`ALG`（简易方程）。1-6 年级范围外的内容不建标识——这是 v1 评审 P0-3 要求删除初中代数内容后的直接结果，`ALG` 仅承载解方程所需的等价变形，不含合并同类项与系数化为 1。

### 2.5 目标字段

| 字段 | 类型 | 必填 | 约束 | 示例 |
|---|---|---|---|---|
| `type` | enum | 是 | `value` / `set` / `proof` | `"value"` |
| `unit` | string | 否 | 与实体层单位一致 | `"个"` |
| `answer_form` | enum | 否 | `fraction` / `decimal` / `mixed` / `integer` | `"fraction"` |

`type=set` 表示一题多解（如解方程多根），此时诊断走多解校验路径（见 03 §8.2）。

### 2.6 约束字段

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `require_simplest_form` | boolean | 否 | 要求最简分数 | `true` |
| `require_simplify_calc` | boolean | 否 | 要求简便运算 | `false` |
| `require_equation_solution` | boolean | 否 | 要求写出解方程过程 | `true` |
| `require_unit` | boolean | 否 | 结果必须带单位 | `true` |
| `preserve_precision` | integer | 否 | 要求保留小数位数 | `2` |

`require_simplify_calc` 为 `true` 时，非最简路径不再视为合法非推荐路径，而是触发变形建议（见 00 §2.1）。

### 2.7 标签字段

| 字段 | 类型 | 必填 | 填写方 | 示例 |
|---|---|---|---|---|
| `knowledge_points` | array | 是 | 规则引擎 | `["FRAC.ADD", "NUM.LCM"]` |
| `textbook_requirement` | string | 否 | 规则引擎 | `"分数加减法必须先通分"` |
| `grade_constraint` | string | 否 | 规则引擎 | `"分子 16 需约分" |

**禁止项**：`knowledge_points` 与 `textbook_requirement` 只能由规则引擎写入。结构化环节若产出同名字段，一律丢弃（原因见 §4）。

---

## 3. 步骤 IR

### 3.1 字段表

| 字段 | 类型 | 必填 | 约束 | 示例 |
|---|---|---|---|---|
| `index` | integer | 是 | 从 1 连续递增，不可跳号 | `2` |
| `raw_text` | string | 是 | 学生原始书写文本，保留涂改痕迹标记 | `"3/4 + 2/3 = 9/12 + 8/12"` |
| `expr_before` | string | 否 | 本步变换前的表达式，DSL 文本 | `"3/4 + 1/2 * 2/3"` |
| `expr_after` | string | 是 | 本步变换后的表达式，DSL 文本 | `"3/4 + 2/3"` |
| `refs` | array | 是 | 本步引用的实体 id 集合 | `["n1"]` |
| `transforms` | array | 否 | 本步包含的变换候选，引擎写入 | 见 §4 |
| `split_confidence` | number | 是 | 0 到 1，结构化环节自评 | `0.82` |
| `split_checked` | boolean | 是 | 不变量检查是否通过，见 §6 | `false` |
| `source` | enum | 是 | `ocr` / `manual` / `workbook_import` | `"ocr"` |
| `ocr_corrections` | array | 否 | 自动修正记录，含原值、候选值、择一依据 | 见 §3.2 |
| `answer_only` | boolean | 是 | 是否为「只写答案未写过程」的退化输入 | `false` |

`expr_after` 缺失即本步无法参与规则校验，诊断退化为「仅结构判定」，不得给出等价性结论。

### 3.2 OCR 修正记录

结构化环节不得按置信度直接改数值，必须走候选集 + 重算校验（v1 评审 M-8 的修复口径）。

| 字段 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `field` | string | 被修正的字段路径 | `"steps[1].expr_after"` |
| `raw` | string | 识别原值 | `"1/2 x 2/3"` |
| `candidates` | array | 候选值列表 | `["1/2 * 2/3", "1/2 ÷ 3/2"]` |
| `chosen` | string | 择一结果 | `"1/2 * 2/3"` |
| `basis` | enum | `downstream_consistency`（后续链路自洽）/ `user_confirmed` / `no_evidence` | `"downstream_consistency"` |
| `confidence` | number | 0 到 1 | `0.6` |

`basis=no_evidence` 时该步必须标红并要求用户确认，系统不得替用户决定。低于置信阈值但 `basis=downstream_consistency` 的修正，标注为「OCR 修正」并在结果页展示原值与修正值。

**与笔误判定的先后顺序**：本节与 [03-alignment-and-diagnosis.md](./03-alignment-and-diagnosis.md) §5.3 的笔误判定都以「后续链路自洽」为判据，两者同时成立时**先判 OCR 修正、后判笔误**。原因归属不同：本节的差异来自输入端（系统看错了），笔误的差异来自学生端（学生写错了）。判定顺序详见 `03` §5.3。

---

## 4. 表达式 DSL 文法

### 4.1 文法定义（EBNF）

```ebnf
Expr        ::= Term (('+' | '-') Term)*
Term        ::= Factor (('×' | '÷' | '*' | '/') Factor)*
Factor      := Unary ('^' Unary)?
Unary       ::= ('-' | '+')? Postfix
Postfix     := Primary Unit?
Primary     ::= Number | Fraction | Percent | '(' Expr ')' | Ident
Number      ::= Digit+ ('.' Digit+)?
Fraction    ::= Digit+ '/' Digit+
Percent     ::= Number '%'
Unit        ::= UnitName UnitPow?
UnitPow     ::= '²' | '³' | '^' Digit+
UnitName    ::= Letter (Letter | Digit)*
Ident       ::= Letter (Letter | Digit | '_')*
Digit       ::= '0'…'9'
Letter      ::= 'A'…'Z' | 'a'…'z'
```

### 4.2 语义约束

| 约束 | 内容 |
|---|---|
| 优先级 | 按 `Expr` → `Term` → `Factor` → `Unary` → `Postfix` 逐级降低；同级从左到右结合 |
| 精确性 | 参与判定的数值必须先转精确有理数，转换在 `Exact` 语义域内完成，不经过浮点中间态 |
| 除法 | 除数为 0 时表达式进入 `invalid` 状态，不参与等价判定（见 03 §8.4） |
| 单位 | 单位参与等价判定：`5厘米/厘米` 与 `5` 不等价（量纲不同）；`5 cm` 与 `5 厘米` 等价（同一量纲的书写差异） |
| 百分数 | `25%` 在判定时等价于 `0.25`，但展示保留原形；`25% + 25% = 50%` 成立 |
| 隐式乘法 | 语法中**不允许**隐式乘法。`1/2 2/3` 不是合法表达式，结构化环节必须判为拆分异常而非补一个乘号 |
| 变量 | `Ident` 只用于解方程与列式计算；纯数值表达式不应出现 `Ident`，出现即触发结构化复核 |

### 4.3 规范化输出要求

所有 `expr_before` / `expr_after` 在写入 IR 前必须经过规范化，规范化规则见 [03-alignment-and-diagnosis.md](./03-alignment-and-diagnosis.md) §4.3。IR 只存规范形，不存原始书写形态（原始形态保留在 `raw_text`）。

---

## 5. provenance：规则标签的唯一归属

这是 v1 评审 M-4 的修复点。v1 的「变换规则标签」字段没有规定填写方，若由结构化环节填写，等于让大模型直接输出「这步用了乘法分配律」，而归因结论会跟着它走——这违背了「规则为核」原则。

| 规则 | 内容 |
|---|---|
| 写入方 | 只有规则引擎可以写 `transforms` 与 `knowledge_points` |
| 推导方式 | 引擎对步骤前后表达式做逆向推导，取「使该变换成立」的最小元规则集合 |
| 最小性 | 若存在多条可解释该步的元规则，只保留能覆盖全部变化的最小集合，避免用超纲规则解释简单步骤 |
| 模型标签 | 结构化环节若产出规则标签，字段名改为 `llm_hints`，权重恒为 0，不参与归因、不参与掌握度计算，仅可用于调试与提示词优化 |
| 字段命名说明 | 展示名用「模型标签」（遵守 `00` §2.0 术语规定），存储字段名保留 `llm_hints`，用于标识该值来自模型而非规则引擎，便于调试时区分来源 |
| 归因文案 | 面向用户的归因理由必须能追溯到某条 `transforms` 条目；追溯不到的内容只能出现在「教学建议」区，不得出现在「错误原因」区 |

`transforms` 条目结构：

| 字段 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `rule_id` | string | 元规则标识 | `"NUM.FRAC.ADD"` |
| `status` | enum | `legal` / `beyond_grade`（超纲） / `violated`（违反） | `"violated"` |
| `evidence` | string | 引擎判定依据摘要 | `"通分前分母不同，违反分数加减同分母要求"` |

---

## 6. 原子步与不变量检查

结构化环节由大模型执行拆分，而步骤是诊断定位的基准。拆分结果的可靠性必须用机械化检查兜住，不能靠信任模型。

### 6.1 不变量清单

| 编号 | 不变量 | 违反含义 | 处置 |
|---|---|---|---|
| INV-1 | 一步一变换 | 一个步骤含两次以上独立变换 | 触发二次拆分，仍失败则标 `split_checked=false` 并按多变换处理 |
| INV-2 | 量守恒 | 步骤前后出现的实体集合无合理继承关系 | 触发复核，可能为漏抄条件 |
| INV-3 | 单位一致 | 同一实体的单位在步骤间变化 | 触发复核，标为疑似单位错误候选 |
| INV-4 | 变量集合单调 | 解方程中未知量数减少但无等式变形 | 触发复核，可能丢失移项 |

### 6.2 纠正回流

结构化产物一律视为**可纠正数据**。用户修改步骤后，被影响的诊断结论自动重算，原始拆分结果保留在 `diagnostic_snapshot` 中供对比。

回流用途仅限：优化结构化提示词、发现新错误模式候选。**不用于**未经授权的模型训练（见 [06-identity-and-data-model.md](./06-identity-and-data-model.md) §5）。

---

## 7. schema 版本策略

| 变更类型 | 版本变化 | 兼容要求 |
|---|---|---|
| 新增可选字段 | 次版本号（1.0.0 → 1.1.0） | 旧数据可不补，新读取方须容忍缺失 |
| 新增必填字段或改字段语义 | 主版本号（1.x → 2.0.0） | 必须提供升级器；升级失败时降级为「仅结构判定」 |
| 删除字段 | 主版本号 | 同步更新本文档与全部引用方 |

每个诊断快照记录 `schema_version`、元规则库版本、模型版本、提示词模板版本四项，四者任一不一致时，快照仅供复现参考，不作为质量判定依据。

快照的完整存储结构见 [08-diagnosis-result-schema.md](./08-diagnosis-result-schema.md) §6，含保留期（12 个月）、可见性（不向家长与教师开放）与删除联动规则。IR schema 的兼容窗口与破坏性变更处理见 [13-resilience-and-maintainability.md](./13-resilience-and-maintainability.md) §3.2。

---

## 8. 端到端示例

三份示例分别对应分数四则（含通分）、解方程（含错误移项）、应用题（关系层四角色齐全）。示例中的诊断结论仅作示意，判定规则见 03。

### 8.1 分数四则混合：源头错误在计算步骤

```json
{
  "schema_version": "1.0.0",
  "question_id": "q-20261002-000137",
  "question_type": "fraction_arith",
  "grade_band": "G5",
  "textbook_version": "人教版",
  "entity": {
    "entities": [
      { "id": "n1", "role": "known", "name": "被乘数", "value": { "num": 1, "den": 2, "exact": true } },
      { "id": "n2", "role": "known", "name": "除数", "value": { "num": 2, "den": 3, "exact": true } },
      { "id": "n3", "role": "constant", "name": "被加项", "value": { "num": 3, "den": 4, "exact": true } }
    ]
  },
  "target": { "type": "value", "answer_form": "fraction" },
  "constraint": { "require_simplest_form": true },
  "steps": [
    {
      "index": 1,
      "raw_text": "1/2 x 2/3 = 2/3",
      "expr_before": "1/2 * 2/3",
      "expr_after": "2/3",
      "refs": ["n1", "n2"],
      "split_confidence": 0.91,
      "split_checked": true,
      "source": "ocr",
      "answer_only": false
    },
    {
      "index": 2,
      "raw_text": "3/4 + 2/3 = 9/12 + 8/12 = 17/12",
      "expr_before": "3/4 + 2/3",
      "expr_after": "17/12",
      "refs": ["n3"],
      "split_confidence": 0.78,
      "split_checked": false,
      "source": "ocr",
      "answer_only": false
    }
  ],
  "tags": {
    "knowledge_points": ["FRAC.MUL", "FRAC.ADD", "NUM.LCM"]
  }
}
```

第 1 步把 `1/2 * 2/3` 算成 `2/3`（只乘了其中一个数），属行为性错误中的计算失误，是本题的源头错误；第 2 步的通分与加法在自身层面正确，属继承错误。`split_checked=false` 说明第 2 步含两次变换且已触发二次拆分失败，诊断时按多变换步骤处理。

### 8.2 解方程：形式等价错误

```json
{
  "schema_version": "1.0.0",
  "question_id": "q-20261002-000204",
  "question_type": "equation",
  "grade_band": "G4",
  "entity": {
    "entities": [
      { "id": "x", "role": "unknown", "name": "x" },
      { "id": "c1", "role": "constant", "name": "3", "value": { "num": 3, "den": 1, "exact": true } },
      { "id": "c2", "role": "constant", "name": "12", "value": { "num": 12, "den": 1, "exact": true } },
      { "id": "c3", "role": "constant", "name": "27", "value": { "num": 27, "den": 1, "exact": true } }
    ]
  },
  "target": { "type": "value" },
  "constraint": { "require_equation_solution": true },
  "steps": [
    {
      "index": 1,
      "raw_text": "3x + 12 = 27",
      "expr_before": "3x + 12",
      "expr_after": "3x + 12 = 27",
      "refs": ["x", "c1", "c2", "c3"],
      "split_confidence": 0.95,
      "split_checked": true,
      "source": "manual",
      "answer_only": false
    },
    {
      "index": 2,
      "raw_text": "3x = 27 + 12 = 39",
      "expr_before": "3x + 12 = 27",
      "expr_after": "3x = 39",
      "refs": ["x", "c1", "c2", "c3"],
      "split_confidence": 0.72,
      "split_checked": false,
      "source": "manual",
      "answer_only": false
    },
    {
      "index": 3,
      "raw_text": "x = 39 / 3 = 13",
      "expr_before": "3x = 39",
      "expr_after": "13",
      "refs": ["x", "c1"],
      "split_confidence": 0.88,
      "split_checked": true,
      "source": "manual",
      "answer_only": false
    }
  ],
  "tags": {
    "knowledge_points": ["ALG.EQ.SOLVE", "NUM.DIV.EXACT"]
  }
}
```

第 2 步把减法做成加法，属形式等价错误，规则级定位指向等式性质（等量减等量得差相等）；第 3 步的除法与结果在自身层面正确，属继承错误。此例说明诊断必须区分「形式错误」与「数值错误」，前者指向规则知识，后者指向运算执行。

### 8.3 应用题：关系层建模错误

```json
{
  "schema_version": "1.0.0",
  "question_id": "q-20261002-000311",
  "question_type": "word_problem",
  "grade_band": "G4",
  "entity": {
    "entities": [
      { "id": "a", "role": "unknown", "name": "甲" },
      { "id": "b", "role": "unknown", "name": "乙" },
      { "id": "total", "role": "known", "name": "总数", "value": { "num": 80, "den": 1, "exact": true }, "unit": "个" },
      { "id": "diff", "role": "known", "name": "相差", "value": { "num": 10, "den": 1, "exact": true }, "unit": "个" }
    ]
  },
  "relation": [
    {
      "id": "r1",
      "predicate": "sum",
      "subject": "a",
      "reference": "b",
      "target": "total",
      "operator": "+",
      "confusable_terms": ["一共", "共"]
    },
    {
      "id": "r2",
      "predicate": "diff",
      "subject": "a",
      "reference": "b",
      "target": "diff",
      "operator": "-"
    }
  ],
  "target": { "type": "value", "unit": "个" },
  "constraint": { "require_unit": true },
  "steps": [
    {
      "index": 1,
      "raw_text": "设甲 x 个，乙 x + 10 个",
      "expr_before": "x",
      "expr_after": "x + 10",
      "refs": ["a", "b", "diff"],
      "split_confidence": 0.7,
      "split_checked": false,
      "source": "manual",
      "answer_only": false
    },
    {
      "index": 2,
      "raw_text": "x + (x + 10) = 80",
      "expr_before": "x + (x + 10)",
      "expr_after": "80",
      "refs": ["a", "b", "total"],
      "split_confidence": 0.85,
      "split_checked": true,
      "source": "manual",
      "answer_only": false
    }
  ],
  "tags": {
    "knowledge_points": ["REL.SUM", "REL.DIFF", "ALG.EQ.SOLVE"]
  }
}
```

正确建模应为 `x + (x - 10) = 80`（甲比乙多，乙比甲少）。学生的表达把「多」的方向写反，源头错误在关系层第 1 步，属知识性错误，定位依据是 `r2` 的 `subject`/`reference` 方向与 `predicate` 组合，而非计算过程。这类错误若只做表达式等价校验不会被发现，必须由关系层校验参与判定。

---

## 9. 验收清单

- [ ] §2 全部字段有类型、必填、约束、示例四要素
- [ ] DSL 文法可无歧义解析，`1/2 2/3` 被判为非法
- [ ] `transforms` 与 `knowledge_points` 的写入方在字段表中唯一
- [ ] 三份示例可被 schema 校验通过，且均含错误的诊断触发点
- [ ] §6 四类不变量全部有编号与处置方式
- [ ] 版本策略覆盖三类变更
