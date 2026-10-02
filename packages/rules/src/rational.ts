/**
 * 精确有理数（BigInt 实现）。
 *
 * 对应 docs/specs/01 §3.3 硬约束：数值以精确有理数表示，等价判定不经过浮点中间态。
 * 本类所有运算均在 bigint 上进行，无任何浮点路径；
 * toString / toNumber 仅供展示与调试，不得用于等价判定。
 * 除数为 0 时抛 InvalidRationalError，对应「除数为 0 的表达式进入无效状态」。
 */
export class InvalidRationalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRationalError";
  }
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export class Rational {
  private constructor(
    private readonly numerator: bigint,
    private readonly denominator: bigint,
  ) {}

  /**
   * 工厂：自动约分、符号统一在分子、分母归正。
   * 分母为 0 抛 InvalidRationalError（01 §3.3）。
   */
  static of(numerator: bigint, denominator: bigint): Rational {
    if (denominator === 0n) {
      throw new InvalidRationalError("除数为 0 的表达式进入无效状态，不参与等价判定（01 §3.3）");
    }
    let n = numerator;
    let d = denominator;
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcdBigInt(n, d);
    if (g > 1n) {
      n /= g;
      d /= g;
    }
    return new Rational(n, d);
  }

  static fromInteger(value: bigint): Rational {
    return new Rational(value, 1n);
  }

  get num(): bigint {
    return this.numerator;
  }

  get den(): bigint {
    return this.denominator;
  }

  add(other: Rational): Rational {
    return Rational.of(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  sub(other: Rational): Rational {
    return this.add(other.neg());
  }

  mul(other: Rational): Rational {
    return Rational.of(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  div(other: Rational): Rational {
    if (other.numerator === 0n) {
      throw new InvalidRationalError("除数为 0 的表达式进入无效状态，不参与等价判定（01 §3.3）");
    }
    return Rational.of(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  neg(): Rational {
    return new Rational(-this.numerator, this.denominator);
  }

  abs(): Rational {
    return Rational.of(absBigInt(this.numerator), this.denominator);
  }

  pow(exp: bigint): Rational {
    if (exp < 0n) {
      return Rational.fromInteger(1n).div(this.pow(-exp));
    }
    return Rational.of(this.numerator ** exp, this.denominator ** exp);
  }

  /** -1 / 0 / 1，等价判定请用本方法或 equals，勿用 toNumber */
  compare(other: Rational): -1 | 0 | 1 {
    const lhs = this.numerator * other.denominator;
    const rhs = other.numerator * this.denominator;
    return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
  }

  equals(other: Rational): boolean {
    return this.compare(other) === 0;
  }

  isInteger(): boolean {
    return this.denominator === 1n;
  }

  /** 仅供展示/调试 */
  toString(): string {
    return this.denominator === 1n ? this.numerator.toString() : `${this.numerator}/${this.denominator}`;
  }

  /** 仅供展示/调试，勿用于等价判定 */
  toNumber(): number {
    return Number(this.numerator) / Number(this.denominator);
  }
}
