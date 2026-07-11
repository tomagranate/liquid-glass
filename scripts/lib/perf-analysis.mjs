export function percentile(values, amount) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * amount))
  ];
}

export function summarize(deltas, calibratedInterval) {
  const threshold = Math.max(1.5 * calibratedInterval, calibratedInterval + 8);
  return {
    frames: deltas.length,
    p50: percentile(deltas, 0.5),
    p95: percentile(deltas, 0.95),
    p99: percentile(deltas, 0.99),
    max: Math.max(0, ...deltas),
    achievedFps: deltas.length
      ? 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length)
      : 0,
    over16_7: deltas.filter((value) => value > 16.7).length,
    over33_3: deltas.filter((value) => value > 33.3).length,
    over50: deltas.filter((value) => value > 50).length,
    dropThreshold: threshold,
    dropRatio:
      deltas.filter((value) => value > threshold).length /
      Math.max(1, deltas.length),
  };
}

export function medianRun(runs) {
  return [...runs].sort((a, b) => a.p95 - b.p95)[Math.floor(runs.length / 2)];
}

export function evaluatePair(effect, control, thresholds) {
  const ratio = effect.p95 / Math.max(1, control.p95);
  const failures = [];
  if (effect.frames < thresholds.minFrames)
    failures.push(`frames ${effect.frames} < ${thresholds.minFrames}`);
  if (effect.p95 > thresholds.maxP95 && ratio > thresholds.maxP95Ratio)
    failures.push(
      `paired p95 ${effect.p95.toFixed(2)}ms / ${ratio.toFixed(2)}x`,
    );
  if (
    effect.dropRatio > thresholds.maxDropRatio &&
    effect.dropRatio > control.dropRatio * 1.5 + 0.005
  )
    failures.push(`paired drop ratio ${effect.dropRatio.toFixed(3)}`);
  return { pass: failures.length === 0, ratio, failures };
}
