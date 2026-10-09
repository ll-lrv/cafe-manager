import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ResolvedPeriods } from "./periods";

const TABS = [
  { href: "/reports", label: "이론 vs 실제" },
  { href: "/reports/menus", label: "메뉴 수익성" },
  { href: "/reports/waste", label: "폐기" },
] as const;

/** 리포트 종류 탭 */
export function ReportTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav className="flex gap-1 border-b" aria-label="리포트 종류">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
            t.href === active
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** 기간 고르기: 미리 정한 기간 + 직접 날짜 */
export function PeriodPicker({ periods, basePath }: { periods: ResolvedPeriods; basePath: string }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {periods.choices.map((p) => (
          <Link
            key={p.key}
            href={p.href}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              p.key === periods.period.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap items-center gap-2 text-sm" action={basePath}>
        <Input type="date" name="from" defaultValue={periods.custom.from} max={periods.today} aria-label="시작일" className="w-auto" />
        <span>~</span>
        <Input type="date" name="to" defaultValue={periods.custom.to} max={periods.today} aria-label="종료일" className="w-auto" />
        <Button type="submit" variant="outline" size="sm">
          보기
        </Button>
      </form>
    </div>
  );
}

export function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "bad" }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-xl font-bold tabular-nums", tone === "bad" && "text-destructive")}>{value}</CardTitle>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardHeader>
    </Card>
  );
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
export const signedWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("ko-KR")}원`;
