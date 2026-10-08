import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { impactText, percentText, priceChangeText, type CostAlert } from "@/lib/cost-alerts";

/** "10월 3일" (매장 시간대) */
const dayFormat = (timeZone: string) => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone });

/** 단가 변동 배지. 오르면 빨강, 내리면 회색 */
export function CostChangeBadge({ percent }: { percent: number | null }) {
  const up = percent === null || percent > 0;
  return (
    <Badge variant={up ? "destructive" : "secondary"}>
      {up ? <TrendingUp /> : <TrendingDown />}
      {percentText(percent)}
    </Badge>
  );
}

/** 메뉴 원가율 변화. 예) "카페라떼 원가율 20.6% → 21.4%" */
export function CostImpactList({ alert, limit }: { alert: CostAlert; limit?: number }) {
  if (alert.impacts.length === 0) {
    return <p className="text-xs text-muted-foreground">이 품목을 쓰는 메뉴가 없습니다.</p>;
  }
  const shown = limit ? alert.impacts.slice(0, limit) : alert.impacts;
  const rest = alert.impacts.length - shown.length;
  return (
    <ul className="grid gap-0.5 text-xs text-muted-foreground">
      {shown.map((i) => (
        <li key={i.menuId} className="flex flex-wrap gap-x-1.5">
          <Link href={`/menus/${i.menuId}`} className="font-medium text-foreground hover:underline">
            {i.menuName}
          </Link>
          <span className="tabular-nums">{impactText(i)}</span>
        </li>
      ))}
      {rest > 0 && <li>외 메뉴 {rest}개</li>}
    </ul>
  );
}

/** 단가 변동 목록 (대시보드) */
export function CostAlertList({ alerts, timeZone }: { alerts: CostAlert[]; timeZone: string }) {
  return (
    <ul className="divide-y">
      {alerts.map((a) => (
        <li key={a.itemId} className="grid gap-1.5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link href={`/items/${a.itemId}`} className="font-medium hover:underline">
              {a.itemName}
            </Link>
            <CostChangeBadge percent={a.percent} />
            <span className="tabular-nums text-muted-foreground">
              {priceChangeText(a)}
            </span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {dayFormat(timeZone).format(new Date(a.changedAt))}
            </span>
          </div>
          <CostImpactList alert={a} limit={3} />
        </li>
      ))}
    </ul>
  );
}
