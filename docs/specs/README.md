# StepBuddy 规格文档

> **版本**：v1.0（定稿）｜**日期**：2026-10-02

教师作业诊断系统的配套规格，共 4 份。主文档是 `docs/StepBuddy 教师作业诊断系统 PRD.md`，MVP 单独定义在 `docs/StepBuddy 教师作业诊断 MVP.md`。

## 文档清单

| 文件 | 一句话职责 | 前置 |
|---|---|---|
| [01-grading-and-diagnosis.md](./01-grading-and-diagnosis.md) | 批改流程、切题与归属、IR 契约、诊断算法、教师交互 | 无 |
| [02-question-types-and-rules.md](./02-question-types-and-rules.md) | 题型枚举、覆盖矩阵、规则规模、受限模板 | 无 |
| [03-diagnosis-result-and-reports.md](./03-diagnosis-result-and-reports.md) | 结果结构、班级报告、数据模型与合规、接口摘要 | 01 |
| [04-evaluation.md](./04-evaluation.md) | 指标口径、评测集、产能测算、里程碑 | 02、03 |

## 阅读顺序

1. 先读 PRD，了解范围与指标；
2. 工程侧：01 → 02 → 03；
3. 验收与排期：04。

## 单一事实来源

| 概念 | 唯一定义位置 |
|---|---|
| 批改流程、切分与归属准确率、诊断算法、退出码 | 01 |
| 题型枚举、覆盖矩阵、规则规模、覆盖率分母 | 02 |
| 诊断结果结构、班级报告字段、数据可见性、合规条款 | 03 |
| 九项指标定义式、评测集配比、产能测算、检查点 | 04 |
| 产品定位、指标阈值、非功能、里程碑、风险、术语、假设 | PRD |

同一概念不得在多处定义。PRD 与规格冲突时以规格为准并修正 PRD。

## 归档

`docs/archive/PRD-v1-snapshot.md` 是 v1 原文；`docs/archive/v2-full-scope/` 是三端场景版全套（17 份）。两者仅供回溯，不是当前口径。
