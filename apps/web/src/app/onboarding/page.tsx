import { Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyStores } from "@/lib/api/stores";
import { logout } from "../login/actions";
import { CreateStoreForm } from "./create-store-form";

export const metadata: Metadata = { title: "매장 만들기" };

export default async function OnboardingPage() {
  const stores = await getMyStores();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Store className="size-5" />
          </div>
          <CardTitle className="text-lg">매장 만들기</CardTitle>
          <CardDescription>
            매장을 만들면 사장으로 등록됩니다.
            <br />
            직원이라면 사장님께 받은 초대 링크로 들어와 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <CreateStoreForm />
          <div className="flex justify-center gap-4 text-sm text-muted-foreground">
            {stores.length > 0 && (
              <Link href="/dashboard" className="underline-offset-4 hover:underline">
                내 매장으로 돌아가기
              </Link>
            )}
            <form action={logout}>
              <button type="submit" className="underline-offset-4 hover:underline">
                로그아웃
              </button>
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
