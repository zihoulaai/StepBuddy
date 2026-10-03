/**
 * 评测集 Case schema（Task 9.1/9.2：MVP 验证方式「150 道应用题 + 三项人工标注」）。
 *
 * 规格依据：
 * - MVP 文档「验证方式」表：标注 = 建模结果 / 逐步对错 / 错误分类；
 * - 04 §2：应用题两族、难度 40/45/15、错误样本 ≥20%（MVP 加强 ≥40%）；
 * - 04 §1 排除项清单：只写答案、表达式无效（文本链路只涉及这两项）不计 M-1 分母；
 * - 01 §4.4：M-3b「四角色」= 实体角色 + 四角色关系（subject/reference/relation/target），
 *   以 rules 的 RelationModel 为对拍基准（entities/relations/targets）。
 *
 * 数据是 JSON 资产：schema 用 zod 固化形状，生成器产出即过 parse（dataset.test 守卫）。
 */

import { z } from "zod";

/** 规则族（与 rules ModelRule.family 对齐；两族口径：sumdiff/multiple 归和差倍，total/normalize 归归一归总） */
export const caseFamilySchema = z.enum(["sumdiff", "multiple", "total", "normalize"]);
export const caseGroupSchema = z.enum(["sumdiff_group", "normalize_group"]);

/** M-3b 期望模型：四角色（实体角色 + 关系 + 目标），rules RelationModel 的可序列化镜像 */
export const expectedModelSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string().min(1),
      role: z.enum(["known", "unknown"]),
      value: z.object({ num: z.number(), den: z.number().int().positive() }).optional(),
      unit: z.string().optional(),
    }),
  ),
  relations: z.array(
    z.object({
      subject: z.string().min(1),
      reference: z.string().min(1),
      predicate: z.enum(["sum", "diff", "times", "share"]),
      operator: z.enum(["+", "-", "×", "÷"]),
      target: z.string().min(1),
    }),
  ),
  targets: z.array(z.string().min(1)),
});

export const caseSchema = z.object({
  id: z.string().regex(/^(eval|seed)-\d{3}$/),
  family: caseFamilySchema,
  group: caseGroupSchema,
  difficulty: z.enum(["easy", "medium", "hard"]),
  question_text: z.string().min(1),
  /** 学生步骤：一行一步（对齐 rules StudentEquationStep.equation；无等号行 = 非法步骤） */
  student_steps: z.array(z.string()),
  source: z.enum(["photo", "manual"]),
  annotation: z.object({
    /** 标注①建模结果：ok=应可建模（M-3b/M-1 有效题）；model_failed=应建模失败（不静默错判） */
    modeling: z.enum(["ok", "model_failed"]),
    expected_model: expectedModelSchema.optional(),
    /** 标注②逐步对错：1 起 index，与 student_steps 一一对应（M-1 对拍） */
    steps: z.array(
      z.object({
        index: z.number().int().positive(),
        status: z.enum(["correct", "incorrect", "inherited", "not_judged"]),
      }),
    ),
    /** 标注③错误分类：源头错误的分类与规则定位（M-2 对拍；无错解题不出现） */
    error: z
      .object({
        step_index: z.number().int().positive(),
        classification: z.enum(["knowledge", "behavioral", "normative"]),
        subtype: z.enum(["slip", "miscalc"]).optional(),
        rule_id: z.string().optional(),
      })
      .optional(),
  }),
  /** 排除项（04 §1）：不计 M-1 分母，单独披露计数 */
  excluded: z.enum(["answer_only", "invalid_expr"]).optional(),
});

export type Case = z.infer<typeof caseSchema>;
export type ExpectedModel = z.infer<typeof expectedModelSchema>;
