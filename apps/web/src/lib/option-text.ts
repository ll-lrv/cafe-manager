import { formatQuantity } from "@cafe/core";
import type { OptionRuleView } from "@/lib/api/options";

export const RULE_KIND_LABEL = { scale: "늘리기", replace: "바꾸기", add: "추가" } as const;

/** 규칙 한 줄. 예) "우유 ×1.5", "우유 → 오트밀크", "원두 +18g" */
export function ruleText(r: Pick<OptionRuleView, "kind" | "itemName" | "fromItemName" | "quantity" | "baseUnit">): string {
  if (r.kind === "scale") return `${r.itemName} ×${r.quantity}`;
  if (r.kind === "replace") return `${r.fromItemName ?? "알 수 없는 품목"} → ${r.itemName}`;
  return `${r.itemName} +${formatQuantity(r.quantity ?? 0, r.baseUnit)}`;
}

/** 옵션 추가 금액. 예) "+500원", "추가 금액 없음" */
export const optionPriceText = (price: number) => (price > 0 ? `+${price.toLocaleString("ko-KR")}원` : "추가 금액 없음");
