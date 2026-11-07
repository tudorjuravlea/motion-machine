// scripts/lib/linalg.mjs: the small dense solvers the modal fit needs, in plain JavaScript (no library): a Hermitian
// eigen-decomposition (Jacobi), the eigenvalues of a small complex matrix (shifted QR) and linear solves. The tests
// build matrices with known answers from a seeded generator and check the algebra, not a stored number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complexEigvals, complexSolve, hermitianEig, realSolve } from '../../scripts/lib/linalg.mjs';

const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; }; };
const mat = (n, m) => ({ n, m, re: new Float64Array(n * m), im: new Float64Array(n * m) });

/** A random Hermitian n x n matrix. */
function hermitian(n, r) {
  const A = mat(n, n);
  for (let i = 0; i < n; i++) {
    A.re[i * n + i] = r();
    for (let j = i + 1; j < n; j++) { const a = r(), b = r(); A.re[i * n + j] = a; A.im[i * n + j] = b; A.re[j * n + i] = a; A.im[j * n + i] = -b; }
  }
  return A;
}
/** A V^H-style product helpers on the row-major complex type. */
function mul(A, B, { conjB = false } = {}) {
  const C = mat(A.n, conjB ? B.n : B.m);
  const bm = conjB ? B.n : B.m, inner = A.m;
  for (let i = 0; i < A.n; i++) for (let j = 0; j < bm; j++) {
    let re = 0, im = 0;
    for (let k = 0; k < inner; k++) {
      const ar = A.re[i * A.m + k], ai = A.im[i * A.m + k];
      const br = conjB ? B.re[j * B.m + k] : B.re[k * B.m + j], bi = conjB ? -B.im[j * B.m + k] : B.im[k * B.m + j];
      re += ar * br - ai * bi; im += ar * bi + ai * br;
    }
    C.re[i * bm + j] = re; C.im[i * bm + j] = im;
  }
  return C;
}
const maxAbsDiff = (A, B) => { let d = 0; for (let i = 0; i < A.re.length; i++) d = Math.max(d, Math.hypot(A.re[i] - B.re[i], A.im[i] - B.im[i])); return d; };

test('hermitianEig: A = V diag(values) V^H, V is unitary, the values come largest first', () => {
  const n = 12, A = hermitian(n, rng(7));
  const { values, vectors } = hermitianEig(A);
  for (let i = 1; i < n; i++) assert.ok(values[i - 1] >= values[i], 'sorted down');
  const D = mat(n, n);
  for (let i = 0; i < n; i++) D.re[i * n + i] = values[i];
  const back = mul(mul(vectors, D), vectors, { conjB: true });
  assert.ok(maxAbsDiff(back, A) < 1e-10, `reconstruction off by ${maxAbsDiff(back, A)}`);
  const I = mul(vectors, vectors, { conjB: true });
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) assert.ok(Math.abs(I.re[i * n + j] - (i === j ? 1 : 0)) < 1e-10 && Math.abs(I.im[i * n + j]) < 1e-10);
});

test('hermitianEig of a rank-two matrix has two values and the rest zero', () => {
  const n = 9, r = rng(3), u = [], v = [];
  for (let k = 0; k < 2; k++) { const x = mat(n, 1); for (let i = 0; i < n; i++) { x.re[i] = r(); x.im[i] = r(); } (k ? v : u).push(x); }
  const A = mat(n, n);
  for (const [x, w] of [[u[0], 5], [v[0], 2]]) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    A.re[i * n + j] += w * (x.re[i] * x.re[j] + x.im[i] * x.im[j]); A.im[i * n + j] += w * (x.im[i] * x.re[j] - x.re[i] * x.im[j]);
  }
  const { values } = hermitianEig(A);
  assert.ok(values[1] > 1e-3 && values[2] < 1e-9, JSON.stringify([...values].slice(0, 4)));
});

test('complexEigvals recovers the diagonal of a matrix built to have it', () => {
  const n = 8, r = rng(11);
  const { vectors: Q } = hermitianEig(hermitian(n, r));            // a unitary matrix
  const T = mat(n, n), want = [];
  for (let i = 0; i < n; i++) {
    const lam = [0.9 * r(), 0.9 * r()];
    want.push(lam);
    T.re[i * n + i] = lam[0]; T.im[i * n + i] = lam[1];
    for (let j = i + 1; j < n; j++) { T.re[i * n + j] = r(); T.im[i * n + j] = r(); }
  }
  const A = mul(mul(Q, T), Q, { conjB: true });
  const got = complexEigvals(A);
  assert.equal(got.re.length, n);
  for (const [wr, wi] of want) {
    const d = Math.min(...Array.from(got.re, (g, k) => Math.hypot(g - wr, got.im[k] - wi)));
    assert.ok(d < 1e-8, `eigenvalue ${wr}+${wi}i missing (nearest ${d})`);
  }
});

test('complexEigvals finds the conjugate pair of a rotation-and-decay block', () => {
  const rho = 0.97, th = 0.4, A = mat(2, 2);
  A.re[0] = rho * Math.cos(th); A.re[1] = -rho * Math.sin(th); A.re[2] = rho * Math.sin(th); A.re[3] = rho * Math.cos(th);
  const got = complexEigvals(A);
  const mags = Array.from(got.re, (r, k) => Math.hypot(r, got.im[k]));
  assert.ok(mags.every((m) => Math.abs(m - rho) < 1e-12));
  assert.ok(Math.abs(Math.abs(got.im[0]) - rho * Math.sin(th)) < 1e-12);
});

test('complexSolve and realSolve leave a residual at rounding', () => {
  const n = 6, r = rng(5), A = mat(n, n), X = mat(n, 2);
  for (let i = 0; i < n * n; i++) { A.re[i] = r(); A.im[i] = r(); }
  for (let i = 0; i < n * 2; i++) { X.re[i] = r(); X.im[i] = r(); }
  const B = mul(A, X);
  assert.ok(maxAbsDiff(complexSolve(A, B), X) < 1e-9);
  const R = new Float64Array(n * n), x = new Float64Array(n), b = new Float64Array(n);
  for (let i = 0; i < n * n; i++) R[i] = r();
  for (let i = 0; i < n; i++) x[i] = r();
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) b[i] += R[i * n + j] * x[j];
  const got = realSolve(R, b, n);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(got[i] - x[i]) < 1e-9);
  assert.throws(() => realSolve(new Float64Array(4), new Float64Array(2), 2), /singular/);
});
