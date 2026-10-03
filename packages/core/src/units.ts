import { roundQty } from "./quantity";

export type BaseUnit = "g" | "ml" | "ea";

export interface ItemUnit {
  id: string;
  name: string;
  /** 이 단위 1개 = 기본 단위 factor 만큼 */
  factor: number;
}

/** 입력 단위 수량 → 기본 단위 수량. 예) 원두 2봉(factor 1000) → 2000g */
export function toBaseQuantity(enteredQuantity: number, unit?: Pick<ItemUnit, "factor"> | null): number {
  if (!unit) return roundQty(enteredQuantity);
  if (unit.factor <= 0) throw new Error("단위 환산값(factor)은 0보다 커야 합니다.");
  return roundQty(enteredQuantity * unit.factor);
}

/** 기본 단위 수량 → 특정 단위 수량. 예) 2500g → 2.5봉 */
export function fromBaseQuantity(baseQuantity: number, unit: Pick<ItemUnit, "factor">): number {
  if (unit.factor <= 0) throw new Error("단위 환산값(factor)은 0보다 커야 합니다.");
  return roundQty(baseQuantity / unit.factor);
}

/** 단위 1개 가격 → 기본 단위 1개당 원가. 예) 원두 1봉(1000g) 25,000원 → 25원/g */
export function toBaseUnitCost(pricePerUnit: number, unit?: Pick<ItemUnit, "factor"> | null): number {
  const factor = unit?.factor ?? 1;
  if (factor <= 0) throw new Error("단위 환산값(factor)은 0보다 커야 합니다.");
  return Math.round((pricePerUnit / factor) * 10000) / 10000;
}

const BASE_UNIT_LABEL: Record<BaseUnit, string> = { g: "g", ml: "ml", ea: "개" };

/**
 * 기본 단위 수량을 사람이 읽기 좋게 표시한다.
 * 큰 단위가 있으면 "2봉 + 350g" 처럼 나눠 보여준다.
 */
export function formatQuantity(baseQuantity: number, baseUnit: BaseUnit, largeUnit?: ItemUnit | null): string {
  const label = BASE_UNIT_LABEL[baseUnit];
  const fmt = (n: number) => roundQty(n).toLocaleString("ko-KR");
  if (!largeUnit || largeUnit.factor <= 1 || Math.abs(baseQuantity) < largeUnit.factor) {
    return `${fmt(baseQuantity)}${label}`;
  }
  const sign = baseQuantity < 0 ? "-" : "";
  const abs = Math.abs(baseQuantity);
  const whole = Math.floor(roundQty(abs / largeUnit.factor));
  const rest = roundQty(abs - whole * largeUnit.factor);
  const head = `${sign}${whole.toLocaleString("ko-KR")}${largeUnit.name}`;
  return rest > 0 ? `${head} + ${fmt(rest)}${label}` : head;
}
