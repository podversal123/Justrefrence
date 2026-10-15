/**
 * Four equal steps up to a round maximum (0, 50, 100, 150, 200) instead of whatever the data happens
 * to reach, so a chart's y-axis reads in numbers a person would pick. Pure, no I/O.
 */
export function niceTicks(dataMax: number): number[] {
  if (!(dataMax > 0)) return [0, 1];
  const rough = dataMax / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((v) => v >= rough) ?? rough;
  return [0, 1, 2, 3, 4].map((i) => Number((i * step).toFixed(4)));
}
