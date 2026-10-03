/** DB의 numeric(14,3)과 맞추기 위해 소수점 3자리로 반올림한다. (0.1 + 0.2 같은 오차 제거) */
export function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function sumQty(values: number[]): number {
  return roundQty(values.reduce((acc, v) => acc + v, 0));
}
