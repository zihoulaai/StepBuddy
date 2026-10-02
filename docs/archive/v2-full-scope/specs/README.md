# StepBuddy 规格体系（docs/specs）

## 本文档解决什么问题

`docs/StepBuddy 智能诊断系统 PRD.md` 是主编排文档，回答「为什么做、做什么、承诺什么」。它不承担字段定义、算法口径、验收判定这类细节——那些内容一旦写进 PRD，会立刻出现重复定义与版本漂移。

本目录承载 14 份规格文档，回答「怎么定义、怎么判定、怎么验收、怎么交付」。v1 评审里的三个根因——术语冲突（M-1）、IR 无定义（M-2）、指标不可测（P0-5）——都靠这套文档的单一事实来源机制解决。

## 文档清单

| 文件 | 一句话职责 | 解决的评审问题 | 前置依赖 |
|---|---|---|---|
| [00-glossary-and-traceability.md](./00-glossary-and-traceability.md) | 统一术语 + 全部评审问题落地追踪（P0/M/O/D/G 五类） | M-1 及全量闭环 | 无 |
| [01-ir-schema.md](./01-ir-schema.md) | 中间表示与表达式 DSL 的唯一契约（输入侧） | M-2、M-3、M-4、G-34、G-36 | 00 |
| [02-coverage-matrix.md](./02-coverage-matrix.md) | 题型 × 规则覆盖矩阵，覆盖率指标的唯一分母 | P0-3、P0-4、O-1、O-6、G-19、G-39 | 00、01 |
| [03-alignment-and-diagnosis.md](./03-alignment-and-diagnosis.md) | 步骤对齐与错误定位算法 | P0-1、P0-2、M-5、M-6、M-7、O-3、O-4、G-34 | 00、01 |
| [04-eval-set-and-annotation.md](./04-eval-set-and-annotation.md) | 指标口径、评测集、标注规范 | P0-5、M-11、O-2、O-9、G-14、G-15、G-23~G-25 | 00、02、03 |
| [05-mastery-model.md](./05-mastery-model.md) | 知识点掌握度计算模型 | P0-8、G-21、G-22 | 00、01、06 |
| [06-identity-and-data-model.md](./06-identity-and-data-model.md) | 账号、权限、数据与合规 | P0-7、G-3、G-18、G-26 | 00 |
| [07-performance-and-cost.md](./07-performance-and-cost.md) | 时延口径、成本预算、降级开关 | P0-6、G-15 | 00、03、04 |
| [08-diagnosis-result-schema.md](./08-diagnosis-result-schema.md) | 诊断结果与诊断快照的唯一契约（输出侧） | G-1、G-20、G-36 | 01、03 |
| [09-api-contracts.md](./09-api-contracts.md) | 十个逻辑接口契约与统一错误码 | G-1、G-33 | 08 |
| [10-assumptions-and-limits.md](./10-assumptions-and-limits.md) | 前提假设、限制条件、产能测算、工程顺序 | G-2、G-3、G-5、G-16、G-17、G-40、G-41 | 00 |
| [11-interaction-flows.md](./11-interaction-flows.md) | 主流程、异常分支、界面五态、反馈与触达 | G-4、G-6~G-8、G-26~G-31 | 08、09 |
| [12-release-and-rollback.md](./12-release-and-rollback.md) | 版本规则、灰度、回滚、变更门禁 | G-10、G-37、G-38 | 04、08 |
| [13-resilience-and-maintainability.md](./13-resilience-and-maintainability.md) | 外部依赖、灾备、可维护性、安全、审计 | G-9、G-11~G-13、G-18 | 06、07 |

## 推荐阅读顺序

1. **新人入场**：00 → PRD v2.0 → 按职责选读。
2. **算法与工程**：00 → 01 → 03 → 08 → 02 → 04 → 07。
3. **产品与交互**：00 → 10 → 08 → 09 → 11。
4. **发布与运维**：00 → 12 → 13 → 07。
5. **评审与验收**：00（追踪矩阵）→ 04 → 02。

## 单一事实来源（SSOT）归属表

同一概念只允许在一份文档中定义，其余位置一律引用。

| 概念 | 唯一定义位置 |
|---|---|
| 步骤级判定准确率、归因准确率、结构化准确率、覆盖率 | [04-eval-set-and-annotation.md](./04-eval-set-and-annotation.md) §2 |
| 评测集构成、标注单元、口径标签、回归基线 | [04-eval-set-and-annotation.md](./04-eval-set-and-annotation.md) §3–§5 |
| IR 字段、表达式 DSL 文法、provenance、原子步不变量 | [01-ir-schema.md](./01-ir-schema.md) §2–§6 |
| 步骤对齐代价函数、源头错误判定、容差、笔误、跳步解释 | [03-alignment-and-diagnosis.md](./03-alignment-and-diagnosis.md) §3–§8 |
| 题型清单、规则完备度、就绪状态、阶段承诺 | [02-coverage-matrix.md](./02-coverage-matrix.md) §2–§3 |
| 受限符号 DSL 模板范围 | [02-coverage-matrix.md](./02-coverage-matrix.md) §5 |
| 掌握等级、证据累积、衰减规则 | [05-mastery-model.md](./05-mastery-model.md) §3–§4 |
| 角色、数据可见性、留存与删除、训练用途开关 | [06-identity-and-data-model.md](./06-identity-and-data-model.md) §2–§6 |
| 分层时延口径、成本预算、降级开关矩阵 | [07-performance-and-cost.md](./07-performance-and-cost.md) §2–§5 |
| 诊断结果结构、诊断快照结构 | [08-diagnosis-result-schema.md](./08-diagnosis-result-schema.md) §1、§6 |
| 接口载荷与统一错误码 | [09-api-contracts.md](./09-api-contracts.md) §2、§7 |
| 前提假设、限制条件、产能测算、工程顺序 | [10-assumptions-and-limits.md](./10-assumptions-and-limits.md) §1、§2、§5、§4 |
| 交互流程、界面五态、触达与反馈闭环 | [11-interaction-flows.md](./11-interaction-flows.md) §1、§3、§6–§7 |
| 版本规则、灰度、回滚、变更门禁 | [12-release-and-rollback.md](./12-release-and-rollback.md) §1、§3–§5 |
| 外部依赖契约、灾备目标、审计日志规格 | [13-resilience-and-maintainability.md](./13-resilience-and-maintainability.md) §1、§2、§5 |
| 全部术语的定义 | [00-glossary-and-traceability.md](./00-glossary-and-traceability.md) §2 |
| 产品定位、目标、范围、里程碑、风险 | PRD v2.0 |

PRD 中出现上述概念时，一律写成 `详见 docs/specs/xx-name.md §章节号`，不重复定义。

## 编号约定

`README.md` 是入口页，规范正文从 `01` 起编号；`00` 具有「公共前置」的编号语义（术语与追踪矩阵必须先读）。因此 `00` 之后直接接 `01`，不存在缺号。

`01`–`07` 覆盖诊断能力与评测口径，`08`–`13` 覆盖输出契约、接口、假设、交互、发布与运维。`13` 是当前最后一份，无缺号。

问题编号：P0 / M / O 来自第一轮评审，D 为删减与迁移，G 为第二轮识别的可交付性缺口（`00` §4.5）。全部编号在 `00` §4 集中追踪。

## 编写与变更约定

1. **术语唯一**：全文使用 00 术语表中的原词。禁止另造同义词（`源错误`、`根因错误` 一律并入 `源头错误`）。
2. **指标三件套**：任何数值指标必须同时给出定义式、口径标签、定义文档引用。缺任一项视为未完成。
3. **删除即迁移**：从 PRD 移出的内容若仍有价值，标注「移至 P2」并写明前置依赖，不静默删除。
4. **无教研资源的诚实降级**：任何涉及专家审核、专家标注的表述一律写为「待教研复核」，不得表述为已完成。
5. **选型中立**：规格文档禁止出现具体语言、框架、库、服务商名称。需要举例时用「例如」并标注为待选型示例。
6. **变更回填**：任何对 PRD 或规格的修改，必须回填 [00 的追踪矩阵](./00-glossary-and-traceability.md) §4 对应行的状态与落地章节。
7. **表格优先**：能用表格表达的字段、口径、映射，不写成段落。
