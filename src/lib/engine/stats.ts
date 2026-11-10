/** Small numeric helpers: seeded RNG, normal draws, OLS. */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalSampler(rand: () => number) {
  let spare: number | null = null;
  return (mean = 0, sd = 1) => {
    if (spare !== null) { const s = spare; spare = null; return mean + sd * s; }
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return mean + sd * r * Math.cos(2 * Math.PI * v);
  };
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
export const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Invert a symmetric positive-definite matrix with Gauss-Jordan. Returns null if singular. */
export function invert(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-10) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const p = m[col][col];
    for (let j = 0; j < 2 * n; j++) m[col][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[col][j];
    }
  }
  return m.map((row) => row.slice(n));
}

/** Ordinary least squares. Returns coefficients, their covariance, and residual variance. */
export function ols(X: number[][], y: number[]) {
  const n = X.length, k = X[0].length;
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, row) => s + row[i] * row[j], 0)));
  const xty = Array.from({ length: k }, (_, i) => X.reduce((s, row, r) => s + row[i] * y[r], 0));
  const inv = invert(xtx);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));
  const rss = X.reduce((s, row, r) => s + (y[r] - row.reduce((t, v, j) => t + v * beta[j], 0)) ** 2, 0);
  const dof = Math.max(1, n - k);
  const sigma2 = rss / dof;
  const cov = inv.map((row) => row.map((v) => v * sigma2));
  return { beta, cov, sigma2, dof };
}
