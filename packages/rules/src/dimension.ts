/**
 * 单位量纲模型（docs/specs/01 §3.3「单位参与判定」）。
 *
 * Dimension = 单位指数表 + bare 标记：
 * - bare=true：表达式从未出现单位符号（纯数）；
 * - `5厘米/厘米` 约分后指数表为空，但 bare=false——这正是「与 `5` 不等价」
 *   的机械依据（§3.3 约束第 4 条、§4.3 判例）。
 */

export type Dimension = {
  /** 单位名 → 指数（乘加除减，抵消后为 0 的项删除） */
  readonly exponents: Map<string, bigint>;
  /** 表达式是否从未出现单位符号 */
  readonly bare: boolean;
};

/** 纯数量纲（无单位） */
export const BARE: Dimension = { exponents: new Map(), bare: true };

/** 单单位量纲，如 unitDimension("厘米") */
export function unitDimension(unit: string): Dimension {
  return { exponents: new Map([[unit, 1n]]), bare: false };
}

/** 相乘：指数相加；任一操作数带单位则结果非 bare */
export function multiplyDimensions(a: Dimension, b: Dimension): Dimension {
  const exponents = new Map(a.exponents);
  for (const [unit, exp] of b.exponents) {
    const sum = (exponents.get(unit) ?? 0n) + exp;
    if (sum === 0n) {
      exponents.delete(unit);
    } else {
      exponents.set(unit, sum);
    }
  }
  return { exponents, bare: a.bare && b.bare };
}

/** 相乘：指数相减；任一操作数带单位则结果非 bare */
export function divideDimensions(a: Dimension, b: Dimension): Dimension {
  const exponents = new Map(a.exponents);
  for (const [unit, exp] of b.exponents) {
    const diff = (exponents.get(unit) ?? 0n) - exp;
    if (diff === 0n) {
      exponents.delete(unit);
    } else {
      exponents.set(unit, diff);
    }
  }
  return { exponents, bare: a.bare && b.bare };
}

/** 幂运算：指数同乘；非 bare 即使幂为 0 仍保持非 bare（与单位抵消同等保守处理） */
export function dimensionPow(base: Dimension, exponent: bigint): Dimension {
  if (base.bare) {
    return { exponents: new Map(), bare: true };
  }
  const exponents = new Map<string, bigint>();
  for (const [unit, exp] of base.exponents) {
    const scaled = exp * exponent;
    if (scaled !== 0n) {
      exponents.set(unit, scaled);
    }
  }
  return { exponents, bare: false };
}

/** 量纲相等：bare 标记与指数表全部相同 */
export function dimensionEquals(a: Dimension, b: Dimension): boolean {
  if (a.bare !== b.bare) {
    return false;
  }
  if (a.exponents.size !== b.exponents.size) {
    return false;
  }
  for (const [unit, exp] of a.exponents) {
    if (b.exponents.get(unit) !== exp) {
      return false;
    }
  }
  return true;
}

/** 仅指数表相等（允许 bare 差异）——§3.4「量守恒」按量纲守恒落地 */
export function dimensionExponentsEqual(a: Dimension, b: Dimension): boolean {
  if (a.exponents.size !== b.exponents.size) {
    return false;
  }
  for (const [unit, exp] of a.exponents) {
    if (b.exponents.get(unit) !== exp) {
      return false;
    }
  }
  return true;
}
