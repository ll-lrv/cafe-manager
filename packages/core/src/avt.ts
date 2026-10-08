import { roundQty } from "./quantity";

/**
 * 이론 vs 실제 사용량 (Actual vs Theoretical).
 * 이론 = 판매 수량 × 레시피 (판매로 차감된 양)
 * 실제 = 기간 동안 실제로 줄어든 양 = 이론 + 레시피 밖 사용 + 폐기 + 실사에서 모자란 양 + 기타 조정
 * 차이 = 실제 − 이론. 양수면 레시피보다 더 쓰였다(과다 사용, 기록 누락, 폐기, 분실 등).
 */

/** 기간 동안 품목별 원장 합계 (기본 단위, 원장 부호 그대로). 입고 +, 판매·사용·폐기 −, 조정 ± */
export interface UsageTotals {
  itemId: string;
  received: number;
  sold: number;
  consumed: number;
  wasted: number;
  /** 실사 완료로 생긴 조정 */
  countAdjusted: number;
  /** 실사가 아닌 직접 조정 */
  manualAdjusted: number;
  /** 이 기간에 끝난 실사에서 센 품목인지. false 면 실사 차이를 알 수 없다 */
  counted: boolean;
}

export interface AvtLine {
  itemId: string;
  /** 이론 사용량 (판매) */
  theoretical: number;
  /** 실제 사용량 */
  actual: number;
  /** 실제 − 이론 */
  variance: number;
  /** 차이 ÷ 이론. 이론이 0 이면 null */
  varianceRate: number | null;
  /** 차이의 원인 (모두 "더 쓰인 양" 기준, 음수면 반대 방향) */
  causes: { consumed: number; wasted: number; countLoss: number; otherAdjust: number };
  received: number;
  counted: boolean;
  /** 기본 단위 1개당 원가. 입고 단가가 없으면 null */
  unitCost: number | null;
  /** 원(KRW). 단가가 없으면 null */
  theoreticalCost: number | null;
  actualCost: number | null;
  varianceCost: number | null;
}

export function avtLine(t: UsageTotals, unitCost: number | null): AvtLine {
  const theoretical = roundQty(-t.sold);
  const causes = {
    consumed: roundQty(-t.consumed),
    wasted: roundQty(-t.wasted),
    countLoss: roundQty(-t.countAdjusted),
    otherAdjust: roundQty(-t.manualAdjusted),
  };
  const variance = roundQty(causes.consumed + causes.wasted + causes.countLoss + causes.otherAdjust);
  const actual = roundQty(theoretical + variance);
  const won = (q: number) => (unitCost === null ? null : Math.round(q * unitCost));
  return {
    itemId: t.itemId,
    theoretical,
    actual,
    variance,
    varianceRate: theoretical > 0 ? variance / theoretical : null,
    causes,
    received: roundQty(t.received),
    counted: t.counted,
    unitCost,
    theoreticalCost: won(theoretical),
    actualCost: won(actual),
    varianceCost: won(variance),
  };
}

export interface AvtSummary {
  /** 원(KRW). 단가가 있는 품목만 더한다 */
  theoreticalCost: number;
  actualCost: number;
  varianceCost: number;
  /** 차이 금액의 원인별 합계 */
  causeCosts: { consumed: number; wasted: number; countLoss: number; otherAdjust: number };
  /** 원가율 (매출이 0 이면 null) */
  theoreticalCostRate: number | null;
  actualCostRate: number | null;
  /** 입고 단가가 없어 금액에서 빠진 품목 수 */
  missingCostCount: number;
  /** 이 기간에 세지 않아 실사 차이를 모르는 품목 수 */
  uncountedCount: number;
}

export function avtSummary(lines: AvtLine[], revenue: number): AvtSummary {
  const priced = lines.filter((l) => l.unitCost !== null);
  const sum = (f: (l: AvtLine) => number) => priced.reduce((s, l) => s + f(l), 0);
  const cost = (f: (l: AvtLine) => number) => sum((l) => Math.round(f(l) * l.unitCost!));
  const theoreticalCost = sum((l) => l.theoreticalCost!);
  const actualCost = sum((l) => l.actualCost!);
  return {
    theoreticalCost,
    actualCost,
    varianceCost: sum((l) => l.varianceCost!),
    causeCosts: {
      consumed: cost((l) => l.causes.consumed),
      wasted: cost((l) => l.causes.wasted),
      countLoss: cost((l) => l.causes.countLoss),
      otherAdjust: cost((l) => l.causes.otherAdjust),
    },
    theoreticalCostRate: revenue > 0 ? theoreticalCost / revenue : null,
    actualCostRate: revenue > 0 ? actualCost / revenue : null,
    missingCostCount: lines.filter((l) => l.unitCost === null && (l.theoretical !== 0 || l.variance !== 0)).length,
    uncountedCount: lines.filter((l) => !l.counted).length,
  };
}

/** 차이 금액이 큰 순 (금액을 모르면 차이율 순으로 뒤에) */
export function sortAvtLines(lines: AvtLine[]): AvtLine[] {
  return [...lines].sort((a, b) => {
    if (a.varianceCost !== null && b.varianceCost !== null) return b.varianceCost - a.varianceCost;
    if (a.varianceCost !== null) return -1;
    if (b.varianceCost !== null) return 1;
    return (b.varianceRate ?? 0) - (a.varianceRate ?? 0);
  });
}
