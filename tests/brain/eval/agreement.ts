/** Agreement between the LLM judge and human labels. Pure. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Cohen's kappa with quadratic weights for ordinal scores 1..k (k=3); unweighted when k=2. */
export function weightedKappa(a: number[], b: number[], k = 3): number | null {
  const n = a.length;
  if (!n || n !== b.length) return null;
  const O = Array.from({ length: k }, () => Array(k).fill(0) as number[]);
  for (let i = 0; i < n; i++) O[a[i] - 1][b[i] - 1]++;
  const ra = O.map((r) => r.reduce((x, y) => x + y, 0));
  const cb = O[0].map((_, j) => O.reduce((x, r) => x + r[j], 0));
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) {
      const w = k === 2 ? (i === j ? 0 : 1) : ((i - j) * (i - j)) / ((k - 1) * (k - 1));
      num += w * O[i][j];
      den += (w * ra[i] * cb[j]) / n;
    }
  return den === 0 ? (num === 0 ? 1 : null) : Math.round((1 - num / den) * 100) / 100;
}
