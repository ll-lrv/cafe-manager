import { Coffee } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/api/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Coffee className="size-5" />
          </div>
          <CardTitle className="text-lg">카페 매니저</CardTitle>
          <CardDescription>재고부터 발주, 매출까지 한 곳에서</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={safeNextPath(next)} />
        </CardContent>
      </Card>
    </main>
  );
}
