import Link from "next/link";
import { type OverTargetMenu, won } from "./menu-cost";

/** 목표 원가율을 넘은 메뉴와 목표를 맞추는 판매가 (메뉴 수익성 리포트, 대시보드) */
export function OverTargetList({ items }: { items: OverTargetMenu[] }) {
  return (
    <ul className="divide-y">
      {items.map(({ menu, rate, target, suggestedPrice }) => (
        <li key={menu.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
          <Link href={`/menus/${menu.id}`} className="font-medium hover:underline">
            {menu.name}
          </Link>
          <span className="tabular-nums text-destructive">
            원가율 {rate}% (목표 {target}%)
          </span>
          {suggestedPrice !== null && (
            <span className="ml-auto shrink-0 tabular-nums">
              {won(menu.price)} → <span className="font-medium">{won(suggestedPrice)}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
