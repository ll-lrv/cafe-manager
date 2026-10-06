"use client";

import { ROLE_LABEL, type MemberRole } from "@cafe/core";
import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Field, FormMessage, NativeSelect, SubmitButton, useToastResult } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelInvitationAction,
  changeRoleAction,
  inviteAction,
  removeMemberAction,
} from "./actions";

function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}

export function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(inviteUrl(token));
          setCopied(true);
          toast.success("초대 링크를 복사했습니다.");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      링크 복사
    </Button>
  );
}

export function InviteForm() {
  const [state, action] = useActionState(inviteAction, undefined);

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
        <Field label="역할" htmlFor="invite-role">
          <NativeSelect id="invite-role" name="role" defaultValue="staff">
            <option value="staff">{ROLE_LABEL.staff}</option>
            <option value="manager">{ROLE_LABEL.manager}</option>
          </NativeSelect>
        </Field>
        <Field label="메모 (선택)" htmlFor="invite-email">
          <Input id="invite-email" name="email" placeholder="받는 사람 이메일 또는 이름" maxLength={100} />
        </Field>
        <SubmitButton pendingText="만드는 중…">초대 링크 만들기</SubmitButton>
      </form>
      {state?.error && <FormMessage state={state} />}
      {state?.token && (
        <div className="grid gap-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">초대 링크가 만들어졌습니다. 7일 동안 한 번 사용할 수 있어요.</p>
          <div className="flex gap-2">
            {/* token 은 폼 제출 후에만 생기므로 이 부분은 항상 브라우저에서 그려진다. */}
            <Input readOnly value={inviteUrl(state.token)} className="font-mono text-xs" />
            <CopyLinkButton token={state.token} />
          </div>
        </div>
      )}
    </div>
  );
}

export function CancelInvitationButton({ invitationId }: { invitationId: string }) {
  const [state, action] = useActionState(cancelInvitationAction, undefined);
  useToastResult(state);
  return (
    <form action={action}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton variant="ghost" size="sm" pendingText="취소 중…">
        취소
      </SubmitButton>
    </form>
  );
}

export function MemberControls({ userId, role }: { userId: string; role: MemberRole }) {
  const [roleState, roleAction] = useActionState(changeRoleAction, undefined);
  const [removeState, removeAction] = useActionState(removeMemberAction, undefined);
  useToastResult(roleState);
  useToastResult(removeState);

  return (
    <div className="flex items-center gap-2">
      <form action={roleAction}>
        <input type="hidden" name="userId" value={userId} />
        <NativeSelect
          name="role"
          defaultValue={role}
          aria-label="역할 변경"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="staff">{ROLE_LABEL.staff}</option>
          <option value="manager">{ROLE_LABEL.manager}</option>
        </NativeSelect>
      </form>
      <form
        action={removeAction}
        onSubmit={(e) => {
          if (!confirm("이 구성원을 매장에서 내보낼까요?")) e.preventDefault();
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton variant="destructive" size="sm" pendingText="처리 중…">
          내보내기
        </SubmitButton>
      </form>
    </div>
  );
}
