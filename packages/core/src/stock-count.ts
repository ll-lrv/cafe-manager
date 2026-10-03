import { roundQty } from "./quantity";
import type { StockDelta } from "./recipe";

export interface CountLine {
  itemId: string;
  /** 실제로 센 수량. null 이면 이번 실사에서 세지 않은 품목 */
  countedQuantity: number | null;
}

/**
 * 실사 완료 시 만들 adjust 기록을 계산한다.
 * 실사 도중에도 입출고가 생길 수 있으므로, 시작 시점 스냅샷이 아니라 "완료 시점의 장부 재고"와 비교한다.
 */
export function countAdjustments(
  lines: CountLine[],
  currentStock: ReadonlyMap<string, number>,
): StockDelta[] {
  const result: StockDelta[] = [];
  for (const line of lines) {
    if (line.countedQuantity === null) continue;
    if (line.countedQuantity < 0) throw new Error("실사 수량은 0 이상이어야 합니다.");
    const diff = roundQty(line.countedQuantity - (currentStock.get(line.itemId) ?? 0));
    if (diff !== 0) result.push({ itemId: line.itemId, quantity: diff });
  }
  return result;
}
