"use server";

import { can, type MemberRole } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import {
  cancelInvitation,
  createInvitation,
  removeMember,
  updateMemberRole,
} from "@/lib/api/members";
import { requireCurrentStore } from "@/lib/api/stores";

const PATH = "/settings/members";

/** 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB에서는 RLS가 최종 방어) */
async function requireMemberManager() {
  const store = await requireCurrentStore();
  if (!can(store.role, "member:manage")) throw new ApiError("직원 관리는 사장만 할 수 있습니다.");
  return store;
}

function readRole(formData: FormData): MemberRole {
  const role = String(formData.get("role") ?? "");
  if (role !== "manager" && role !== "staff") throw new ApiError("역할을 선택해 주세요.");
  return role;
}

export type InviteState = { error?: string; ok?: boolean; message?: string; token?: string } | undefined;

export async function inviteAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  try {
    const store = await requireMemberManager();
    const email = String(formData.get("email") ?? "").trim() || null;
    const token = await createInvitation(store.storeId, readRole(formData), email);
    revalidatePath(PATH);
    return { ok: true, token };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireMemberManager();
    await cancelInvitation(store.storeId, String(formData.get("invitationId")));
    revalidatePath(PATH);
    return { ok: true, message: "초대를 취소했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function changeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireMemberManager();
    await updateMemberRole(store.storeId, String(formData.get("userId")), readRole(formData));
    revalidatePath(PATH);
    return { ok: true, message: "역할을 변경했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireMemberManager();
    await removeMember(store.storeId, String(formData.get("userId")));
    revalidatePath(PATH);
    return { ok: true, message: "구성원을 내보냈습니다." };
  } catch (e) {
    return toActionError(e);
  }
}
