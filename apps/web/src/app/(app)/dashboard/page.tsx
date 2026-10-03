import { ClipboardList, Package, Receipt, Truck } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentStore } from "@/lib/api/stores";
import { requireUser } from "@/lib/api/session";

export const metadata: Metadata = { title: "대시보드" };

const UPCOMING = [
  { icon: Package, title: "품목·재고", description: "품목 등록, 입고·사용·폐기 기록, 부족 알림" },
  { icon: Receipt, title: "메뉴·판매", description: "레시피 등록, 판매 입력 시 재료 자동 차감" },
  { icon: ClipboardList, title: "재고 실사", description: "실제 수량을 세서 장부와 맞추기" },
  { icon: Truck, title: "거래처·발주", description: "발주서 작성, 입고 처리, 유통기한 관리" },
];

export default async function DashboardPage() {
  const [user, store] = await Promise.all([requireUser(), requireCurrentStore()]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-bold">안녕하세요, {user.displayName}님</h1>
        <p className="text-sm text-muted-foreground">{store.storeName}의 오늘 현황입니다.</p>
      </div>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">곧 추가될 기능</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {UPCOMING.map(({ icon: Icon, title, description }) => (
            <Card key={title} size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <CardTitle>{title}</CardTitle>
                  <Badge variant="outline" className="ml-auto">
                    준비 중
                  </Badge>
                </div>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
