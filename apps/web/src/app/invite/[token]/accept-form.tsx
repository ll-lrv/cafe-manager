"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-parts";
import { acceptInvitationAction } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="참여하는 중…">
        초대 수락하기
      </SubmitButton>
    </form>
  );
}
