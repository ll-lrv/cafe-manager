import { can, ROLE_LABEL } from "@cafe/core";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMembers, listPendingInvitations } from "@/lib/api/members";
import { requireCurrentStore } from "@/lib/api/stores";
import { requireUser } from "@/lib/api/session";
import { CancelInvitationButton, CopyLinkButton, InviteForm, MemberControls } from "./member-forms";

export const metadata: Metadata = { title: "직원 관리" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });

export default async function MembersPage() {
  const [user, store] = await Promise.all([requireUser(), requireCurrentStore()]);

  if (!can(store.role, "member:manage")) {
    return <p className="text-sm text-muted-foreground">직원 관리는 사장만 할 수 있습니다.</p>;
  }

  const [members, invitations] = await Promise.all([
    listMembers(store.storeId),
    listPendingInvitations(store.storeId),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-bold">직원 관리</h1>
        <p className="text-sm text-muted-foreground">
          매니저는 품목·메뉴·발주를 관리할 수 있고, 직원은 입출고·판매·실사 입력을 할 수 있습니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>직원 초대</CardTitle>
          <CardDescription>링크를 만들어 카카오톡이나 문자로 보내 주세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>대기 중인 초대 {invitations.length}건</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <Badge variant="secondary">{ROLE_LABEL[inv.role]}</Badge>
                  <span className="min-w-0 truncate text-sm">{inv.email ?? "메모 없음"}</span>
                  <span className="text-xs text-muted-foreground">
                    {dateFormat.format(new Date(inv.expiresAt))}까지
                  </span>
                  <div className="ml-auto flex gap-1">
                    <CopyLinkButton token={inv.token} />
                    <CancelInvitationButton invitationId={inv.id} />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>구성원 {members.length}명</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="text-sm font-medium">
                  {m.displayName}
                  {m.userId === user.id && <span className="ml-1 text-muted-foreground">(나)</span>}
                </span>
                <span className="text-xs text-muted-foreground">{dateFormat.format(new Date(m.joinedAt))} 참여</span>
                <div className="ml-auto">
                  {m.role === "owner" ? (
                    <Badge>{ROLE_LABEL.owner}</Badge>
                  ) : (
                    <MemberControls userId={m.userId} role={m.role} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
