import { can, ROLE_LABEL } from "@cafe/core";
import { Coffee, LogOut } from "lucide-react";
import Link from "next/link";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCurrentStore } from "@/lib/api/stores";
import { requireUser } from "@/lib/api/session";
import { logout } from "../login/actions";
import { NavLinks, type NavItem } from "./nav-links";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [user, store] = await Promise.all([requireUser(), requireCurrentStore()]);

  const nav: NavItem[] = [
    { href: "/dashboard", label: "대시보드" },
    { href: "/sales", label: "판매" },
    { href: "/stock", label: "입출고" },
    { href: "/items", label: "품목·재고" },
    { href: "/menus", label: "메뉴" },
    { href: "/counts", label: "실사" },
  ];
  if (can(store.role, "member:manage")) nav.push({ href: "/settings/members", label: "직원 관리" });

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-medium">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Coffee className="size-4" />
            </span>
            <span className="truncate">{store.storeName}</span>
          </Link>
          <Badge variant="secondary">{ROLE_LABEL[store.role]}</Badge>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.displayName}님</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" aria-label="로그아웃">
                <LogOut />
                <span className="hidden sm:inline">로그아웃</span>
              </Button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-2">
          <NavLinks items={nav} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <RealtimeRefresh storeId={store.storeId} />
    </div>
  );
}
