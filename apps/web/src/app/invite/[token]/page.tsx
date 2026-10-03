import { ROLE_LABEL } from "@cafe/core";
import { MailOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvitation } from "@/lib/api/members";
import { getCurrentUser } from "@/lib/api/session";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "매장 초대" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([getInvitation(token), getCurrentUser()]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MailOpen className="size-5" />
          </div>
          {invitation?.isValid ? (
            <>
              <CardTitle className="text-lg">{invitation.storeName}</CardTitle>
              <CardDescription>
                <strong className="text-foreground">{ROLE_LABEL[invitation.role]}</strong>(으)로 초대받았습니다.
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-lg">사용할 수 없는 초대입니다</CardTitle>
              <CardDescription>
                {invitation ? "이미 사용되었거나 만료된 초대입니다." : "초대 링크를 다시 확인해 주세요."}
                <br />
                사장님께 새 초대 링크를 요청해 주세요.
              </CardDescription>
            </>
          )}
        </CardHeader>
        {invitation?.isValid && (
          <CardContent className="grid gap-3">
            {user ? (
              <>
                <p className="text-center text-sm text-muted-foreground">{user.displayName}님 계정으로 참여합니다.</p>
                <AcceptForm token={token} />
              </>
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                className={buttonVariants({ className: "w-full" })}
              >
                로그인 또는 가입하고 수락하기
              </Link>
            )}
          </CardContent>
        )}
      </Card>
    </main>
  );
}
