import { roundQty } from "./quantity";
import type { StockDelta } from "./recipe";

export interface CountLine {
  itemId: string;
  /** 실제로 센 수량. null 이면 이번 실사에서 세지 않은 품목 */
  countedQuantity: number | null;
  /** 센 시각의 장부 재고 (기본 단위) */
  bookQuantity: number;
}

/**
 * 실사 완료 시 만들 adjust 기록을 계산한다.
 * 실사 도중에도 입출고·판매가 생기므로, 시작 시점이나 완료 시점이 아니라 "그 품목을 센 시각의 장부 재고"와 비교한다.
 * 예) 10시에 원두 90g 으로 셌고(장부 100g), 11시에 5g 팔린 뒤 완료 → -10g 조정 → 장부 85g (실제와 같음)
 * DB 함수 complete_stock_count 와 같은 규칙이다.
 */
export function countAdjustments(lines: CountLine[]): StockDelta[] {
  const result: StockDelta[] = [];
  for (const line of lines) {
    if (line.countedQuantity === null) continue;
    if (line.countedQuantity < 0) throw new Error("실사 수량은 0 이상이어야 합니다.");
    const diff = roundQty(line.countedQuantity - line.bookQuantity);
    if (diff !== 0) result.push({ itemId: line.itemId, quantity: diff });
  }
  return result;
}
