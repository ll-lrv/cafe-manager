import { formatQuantity, roundQty } from "@cafe/core";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Movement, MovementType } from "@/lib/api/stock";

const TYPE_BADGE: Record<MovementType, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  receive: { label: "입고", variant: "default" },
  consume: { label: "사용", variant: "secondary" },
  sale: { label: "판매", variant: "secondary" },
  waste: { label: "폐기", variant: "destructive" },
  adjust: { label: "조정", variant: "outline" },
};

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

/** "+2봉 (2,000g)" 또는 "−500g" */
function quantityText(m: Movement) {
  const sign = m.quantity > 0 ? "+" : "−";
  const base = formatQuantity(Math.abs(m.quantity), m.baseUnit);
  if (m.enteredUnitName && m.enteredQuantity !== null) {
    const entered = Math.abs(m.enteredQuantity).toLocaleString("ko-KR");
    return `${sign}${entered}${m.enteredUnitName} (${base})`;
  }
  return `${sign}${base}`;
}

/** 입고 단가를 입력한 단위 기준으로 되돌린다. 예) 25원/g × 1000 → 1봉 25,000원 */
function priceText(m: Movement) {
  if (m.unitCost === null) return null;
  if (m.enteredUnitName && m.enteredQuantity) {
    const factor = m.quantity / m.enteredQuantity;
    return `1${m.enteredUnitName} ${Math.round(m.unitCost * factor).toLocaleString("ko-KR")}원`;
  }
  return `단가 ${roundQty(m.unitCost).toLocaleString("ko-KR")}원`;
}

export function MovementList({ movements, showItem = true }: { movements: Movement[]; showItem?: boolean }) {
  if (movements.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">아직 기록이 없습니다.</p>;
  }
  return (
    <ul className="divide-y">
      {movements.map((m) => {
        const badge = TYPE_BADGE[m.type];
        const details = [
          dateFormat.format(new Date(m.occurredAt)),
          m.createdByName,
          m.expiresOn && `유통기한 ${m.expiresOn}`,
          priceText(m),
        ].filter(Boolean);
        return (
          <li key={m.id} className="grid gap-1 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              {showItem && (
                <Link href={`/items/${m.itemId}`} className="font-medium hover:underline">
                  {m.itemName}
                </Link>
              )}
              <span className={m.quantity > 0 ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                {quantityText(m)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{details.join(" · ")}</p>
            {m.memo && <p className="text-xs">{m.memo}</p>}
          </li>
        );
      })}
    </ul>
  );
}
