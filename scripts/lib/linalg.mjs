// The small dense solvers the modal fit (scripts/lib/modal-fit.mjs) needs, in plain JavaScript. Library only; pure.
// A complex matrix is { n, m, re, im }: n rows, m columns, row-major Float64Arrays. The sizes are tens, not thousands.
//
//   hermitianEig(A)         { values, vectors }  eigenvalues largest first, and the unitary matrix whose columns are the eigenvectors (cyclic Jacobi)
//   complexEigvals(A)       { re, im }           the eigenvalues of a square complex matrix (shifted QR with deflation)
//   complexSolve(A, B)      X with A X = B       (LU, partial pivoting)
//   realSolve(A, b, n)      x with A x = b       A row-major n x n Float64Array (LU, partial pivoting); throws on a singular matrix

const EPS = 1e-14;

export const cmat = (n, m = n) => ({ n, m, re: new Float64Array(n * m), im: new Float64Array(n * m) });

/** The eigen-decomposition of a Hermitian matrix: A = V diag(values) V^H, values sorted down. */
export function hermitianEig(A) {
  const n = A.n;
  const ar = Float64Array.from(A.re), ai = Float64Array.from(A.im);
  const V = cmat(n);
  for (let i = 0; i < n; i++) V.re[i * n + i] = 1;
  const off = () => { let s = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += ar[i * n + j] ** 2 + ai[i * n + j] ** 2; return s; };
  let diag = 0;
  for (let i = 0; i < n; i++) diag += ar[i * n + i] ** 2;
  const stop = EPS * EPS * Math.max(diag + off(), 1e-300);
  for (let sweep = 0; sweep < 40 && off() > stop; sweep++) {
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const xr = ar[p * n + q], xi = ai[p * n + q], r = Math.hypot(xr, xi);
      if (r < 1e-300) continue;
      // the phase makes the 2 x 2 block real symmetric; then the usual real rotation
      const cp = xr / r, sp = xi / r;                       // e^{i phi}
      const alpha = ar[p * n + p], beta = ar[q * n + q];
      const tau = (beta - alpha) / (2 * r);
      const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), s = t * c;
      // G = [[c, s], [-s e^{-i phi}, c e^{-i phi}]] acts on columns p, q: A <- A G, then rows: A <- G^H A
      const g00r = c, g00i = 0, g01r = s, g01i = 0;
      const g10r = -s * cp, g10i = s * sp, g11r = c * cp, g11i = -c * sp;
      for (let k = 0; k < n; k++) {
        for (const [R, I] of [[ar, ai], [V.re, V.im]]) {
          const pr = R[k * n + p], pi = I[k * n + p], qr = R[k * n + q], qi = I[k * n + q];
          R[k * n + p] = pr * g00r - pi * g00i + qr * g10r - qi * g10i;
          I[k * n + p] = pr * g00i + pi * g00r + qr * g10i + qi * g10r;
          R[k * n + q] = pr * g01r - pi * g01i + qr * g11r - qi * g11i;
          I[k * n + q] = pr * g01i + pi * g01r + qr * g11i + qi * g11r;
        }
      }
      for (let k = 0; k < n; k++) {
        const pr = ar[p * n + k], pi = ai[p * n + k], qr = ar[q * n + k], qi = ai[q * n + k];
        // rows of G^H: conj(G00) r_p + conj(G10) r_q, conj(G01) r_p + conj(G11) r_q
        ar[p * n + k] = g00r * pr + g00i * pi + g10r * qr + g10i * qi;
        ai[p * n + k] = g00r * pi - g00i * pr + g10r * qi - g10i * qr;
        ar[q * n + k] = g01r * pr + g01i * pi + g11r * qr + g11i * qi;
        ai[q * n + k] = g01r * pi - g01i * pr + g11r * qi - g11i * qr;
      }
      ar[p * n + q] = ar[q * n + p] = 0; ai[p * n + q] = ai[q * n + p] = 0;
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => ar[b * n + b] - ar[a * n + a]);
  const values = Float64Array.from(order, (i) => ar[i * n + i]);
  const vectors = cmat(n);
  order.forEach((src, dst) => { for (let k = 0; k < n; k++) { vectors.re[k * n + dst] = V.re[k * n + src]; vectors.im[k * n + dst] = V.im[k * n + src]; } });
  return { values, vectors };
}

// complex scalars as [re, im]
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const csqrt = (a) => { const r = Math.hypot(a[0], a[1]), re = Math.sqrt((r + a[0]) / 2), im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); return [re, a[1] < 0 ? -im : im]; };

/** The eigenvalues of a square complex matrix: Wilkinson-shifted QR steps on the leading block, deflating the last row when it is small. */
export function complexEigvals(A) {
  const n = A.n;
  let H = { re: Float64Array.from(A.re), im: Float64Array.from(A.im) };
  const outRe = [], outIm = [];
  let m = n, iter = 0;
  const at = (i, j) => [H.re[i * n + j], H.im[i * n + j]];
  while (m > 0) {
    if (m === 1) { outRe.push(H.re[0]); outIm.push(H.im[0]); break; }
    let rowOff = 0, scale = 0;
    for (let j = 0; j < m - 1; j++) rowOff += H.re[(m - 1) * n + j] ** 2 + H.im[(m - 1) * n + j] ** 2;
    for (let i = 0; i < m; i++) scale += Math.hypot(H.re[i * n + i], H.im[i * n + i]);
    rowOff = Math.sqrt(rowOff);
    if (rowOff <= EPS * Math.max(scale, 1e-300) || iter > 400) {
      outRe.push(H.re[(m - 1) * n + m - 1]); outIm.push(H.im[(m - 1) * n + m - 1]);
      m--; iter = 0;
      continue;
    }
    // Wilkinson shift: the eigenvalue of the trailing 2 x 2 block closer to its last diagonal entry
    const a = at(m - 2, m - 2), b = at(m - 2, m - 1), c = at(m - 1, m - 2), d = at(m - 1, m - 1);
    const hr = (a[0] - d[0]) / 2, hi = (a[1] - d[1]) / 2;
    const bc = [b[0] * c[0] - b[1] * c[1], b[0] * c[1] + b[1] * c[0]];
    const root = csqrt([hr * hr - hi * hi + bc[0], 2 * hr * hi + bc[1]]);
    const mid = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2];
    const l1 = [mid[0] + root[0], mid[1] + root[1]], l2 = [mid[0] - root[0], mid[1] - root[1]];
    let mu = Math.hypot(l1[0] - d[0], l1[1] - d[1]) <= Math.hypot(l2[0] - d[0], l2[1] - d[1]) ? l1 : l2;
    if (iter > 0 && iter % 12 === 0) mu = [mu[0] + rowOff, mu[1]];                  // an exceptional shift when it stalls
    // H - mu I = Q R by modified Gram-Schmidt on the columns of the leading m x m block, then H = R Q + mu I
    const qr = new Float64Array(m * m), qi = new Float64Array(m * m), rr = new Float64Array(m * m), ri = new Float64Array(m * m);
    for (let j = 0; j < m; j++) {
      const vr = new Float64Array(m), vi = new Float64Array(m);
      for (let i = 0; i < m; i++) { vr[i] = H.re[i * n + j] - (i === j ? mu[0] : 0); vi[i] = H.im[i * n + j] - (i === j ? mu[1] : 0); }
      for (let k = 0; k < j; k++) {
        let pr = 0, pi = 0;                                                                // q_k^H v
        for (let i = 0; i < m; i++) { pr += qr[i * m + k] * vr[i] + qi[i * m + k] * vi[i]; pi += qr[i * m + k] * vi[i] - qi[i * m + k] * vr[i]; }
        rr[k * m + j] = pr; ri[k * m + j] = pi;
        for (let i = 0; i < m; i++) { vr[i] -= pr * qr[i * m + k] - pi * qi[i * m + k]; vi[i] -= pr * qi[i * m + k] + pi * qr[i * m + k]; }
      }
      let nv = 0;
      for (let i = 0; i < m; i++) nv += vr[i] * vr[i] + vi[i] * vi[i];
      nv = Math.sqrt(nv);
      if (nv < 1e-300) { for (let i = 0; i < m; i++) { qr[i * m + j] = i === j ? 1 : 0; qi[i * m + j] = 0; } rr[j * m + j] = 0; continue; }
      rr[j * m + j] = nv;
      for (let i = 0; i < m; i++) { qr[i * m + j] = vr[i] / nv; qi[i * m + j] = vi[i] / nv; }
    }
    const next = { re: Float64Array.from(H.re), im: Float64Array.from(H.im) };
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
      let sr = 0, si = 0;
      for (let k = i; k < m; k++) { sr += rr[i * m + k] * qr[k * m + j] - ri[i * m + k] * qi[k * m + j]; si += rr[i * m + k] * qi[k * m + j] + ri[i * m + k] * qr[k * m + j]; }
      next.re[i * n + j] = sr + (i === j ? mu[0] : 0); next.im[i * n + j] = si + (i === j ? mu[1] : 0);
    }
    H = next;
    iter++;
  }
  return { re: Float64Array.from(outRe), im: Float64Array.from(outIm) };
}

/** X with A X = B for a square complex A (n x n) and B (n x k); throws when A is singular. */
export function complexSolve(A, B) {
  const n = A.n, k = B.m;
  const ar = Float64Array.from(A.re), ai = Float64Array.from(A.im), br = Float64Array.from(B.re), bi = Float64Array.from(B.im);
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.hypot(ar[c * n + c], ai[c * n + c]);
    for (let r = c + 1; r < n; r++) { const v = Math.hypot(ar[r * n + c], ai[r * n + c]); if (v > best) { best = v; p = r; } }
    if (best < 1e-300) throw new Error('complexSolve: the matrix is singular');
    if (p !== c) {
      for (let j = 0; j < n; j++) { [ar[c * n + j], ar[p * n + j]] = [ar[p * n + j], ar[c * n + j]]; [ai[c * n + j], ai[p * n + j]] = [ai[p * n + j], ai[c * n + j]]; }
      for (let j = 0; j < k; j++) { [br[c * k + j], br[p * k + j]] = [br[p * k + j], br[c * k + j]]; [bi[c * k + j], bi[p * k + j]] = [bi[p * k + j], bi[c * k + j]]; }
    }
    for (let r = c + 1; r < n; r++) {
      const f = cdiv([ar[r * n + c], ai[r * n + c]], [ar[c * n + c], ai[c * n + c]]);
      for (let j = c; j < n; j++) { ar[r * n + j] -= f[0] * ar[c * n + j] - f[1] * ai[c * n + j]; ai[r * n + j] -= f[0] * ai[c * n + j] + f[1] * ar[c * n + j]; }
      for (let j = 0; j < k; j++) { br[r * k + j] -= f[0] * br[c * k + j] - f[1] * bi[c * k + j]; bi[r * k + j] -= f[0] * bi[c * k + j] + f[1] * br[c * k + j]; }
    }
  }
  const X = cmat(n, k);
  for (let j = 0; j < k; j++) for (let r = n - 1; r >= 0; r--) {
    let sr = br[r * k + j], si = bi[r * k + j];
    for (let c = r + 1; c < n; c++) { sr -= ar[r * n + c] * X.re[c * k + j] - ai[r * n + c] * X.im[c * k + j]; si -= ar[r * n + c] * X.im[c * k + j] + ai[r * n + c] * X.re[c * k + j]; }
    const q = cdiv([sr, si], [ar[r * n + r], ai[r * n + r]]);
    X.re[r * k + j] = q[0]; X.im[r * k + j] = q[1];
  }
  return X;
}

/** x with A x = b for a real n x n A (row-major); throws when A is singular. */
export function realSolve(A, b, n) {
  const a = Float64Array.from(A), x = Float64Array.from(b);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[p * n + c])) p = r;
    if (Math.abs(a[p * n + c]) < 1e-300) throw new Error('realSolve: the matrix is singular');
    if (p !== c) { for (let j = 0; j < n; j++) [a[c * n + j], a[p * n + j]] = [a[p * n + j], a[c * n + j]]; [x[c], x[p]] = [x[p], x[c]]; }
    for (let r = c + 1; r < n; r++) {
      const f = a[r * n + c] / a[c * n + c];
      if (f === 0) continue;
      for (let j = c; j < n; j++) a[r * n + j] -= f * a[c * n + j];
      x[r] -= f * x[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r];
    for (let c = r + 1; c < n; c++) s -= a[r * n + c] * x[c];
    x[r] = s / a[r * n + r];
  }
  return x;
}
