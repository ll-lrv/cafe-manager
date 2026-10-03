import { roundQty } from "./quantity";

export interface LotBalance {
  lotId: string;
  /** YYYY-MM-DD, 없으면 null */
  expiresOn: string | null;
  receivedAt: string | Date;
  /** 남은 수량 (기본 단위, 양수) */
  quantity: number;
}

export interface LotAllocation {
  lotId: string;
  /** 이 로트에서 꺼낼 수량 (양수) */
  quantity: number;
}

/**
 * 유통기한이 빠른 로트부터 필요한 수량을 배분한다. (유통기한 없음은 맨 뒤, 같으면 먼저 입고된 순)
 * 로트 잔량이 모자라면 shortfall 로 남은 수량을 돌려준다. 호출하는 쪽에서 로트 없는 차감으로 기록하면 된다.
 */
export function allocateFifo(
  lots: LotBalance[],
  needed: number,
): { allocations: LotAllocation[]; shortfall: number } {
  if (needed <= 0) throw new Error("배분할 수량은 0보다 커야 합니다.");

  const sorted = lots
    .filter((l) => l.quantity > 0)
    .sort((a, b) => {
      if (a.expiresOn !== b.expiresOn) {
        if (a.expiresOn === null) return 1;
        if (b.expiresOn === null) return -1;
        return a.expiresOn < b.expiresOn ? -1 : 1;
      }
      return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
    });

  const allocations: LotAllocation[] = [];
  let remaining = roundQty(needed);
  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = roundQty(Math.min(lot.quantity, remaining));
    allocations.push({ lotId: lot.lotId, quantity: take });
    remaining = roundQty(remaining - take);
  }
  return { allocations, shortfall: remaining };
}

/** 오늘 기준 며칠 남았는지. 지났으면 음수 */
export function daysUntilExpiry(expiresOn: string, today: Date = new Date()): number {
  const [y, m, d] = expiresOn.split("-").map(Number) as [number, number, number];
  const expiry = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiry - base) / 86_400_000);
}
