/** Least-squares fit with Pearson r and R². */
export function regression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { slope, intercept: my - slope * mx, r, r2: r * r };
}
