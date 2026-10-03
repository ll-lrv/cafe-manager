import "server-only";
import type { MemberRole } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";
import { requireUser } from "./session";

export interface Member {
  userId: string;
  displayName: string;
  role: MemberRole;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  token: string;
  role: MemberRole;
  email: string | null;
  expiresAt: string;
}

export interface InvitationPreview {
  storeName: string;
  role: MemberRole;
  expiresAt: string;
  isValid: boolean;
}

const INVITABLE_ROLES: MemberRole[] = ["manager", "staff"];

export async function listMembers(storeId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_members")
    .select("user_id, role, created_at, profile:profiles(display_name)")
    .eq("store_id", storeId)
    .order("created_at");
  if (error) throw new ApiError(dbErrorMessage(error));

  return data.map((m) => ({
    userId: m.user_id,
    displayName: m.profile?.display_name ?? "알 수 없음",
    role: m.role,
    joinedAt: m.created_at,
  }));
}

export async function updateMemberRole(storeId: string, userId: string, role: MemberRole) {
  if (!INVITABLE_ROLES.includes(role)) throw new ApiError("변경할 수 없는 역할입니다.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_members")
    .update({ role })
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw new ApiError(dbErrorMessage(error));
  // RLS에 막히면 오류 없이 0행이 바뀐다.
  if (data.length === 0) throw new ApiError("권한이 없거나 변경할 수 없는 구성원입니다.");
}

export async function removeMember(storeId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_members")
    .delete()
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 내보낼 수 없는 구성원입니다.");
}

/** 아직 수락되지 않았고 만료되지 않은 초대 */
export async function listPendingInvitations(storeId: string): Promise<Invitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_invitations")
    .select("id, token, role, email, expires_at")
    .eq("store_id", storeId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(dbErrorMessage(error));

  return data.map((i) => ({
    id: i.id,
    token: i.token,
    role: i.role,
    email: i.email,
    expiresAt: i.expires_at,
  }));
}

export async function createInvitation(
  storeId: string,
  role: MemberRole,
  email: string | null,
): Promise<string> {
  if (!INVITABLE_ROLES.includes(role)) throw new ApiError("매니저 또는 직원만 초대할 수 있습니다.");
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_invitations")
    .insert({ store_id: storeId, role, email: email?.trim() || null, created_by: user.id })
    .select("token")
    .single();
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.token;
}

export async function cancelInvitation(storeId: string, invitationId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("store_invitations")
    .delete()
    .eq("store_id", storeId)
    .eq("id", invitationId);
  if (error) throw new ApiError(dbErrorMessage(error));
}

export async function getInvitation(token: string): Promise<InvitationPreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invitation", { p_token: token });
  if (error) throw new ApiError(dbErrorMessage(error));
  const row = data[0];
  if (!row) return null;
  return {
    storeName: row.store_name,
    role: row.role,
    expiresAt: row.expires_at,
    isValid: row.is_valid,
  };
}

/** 초대를 수락하고 매장 ID를 돌려준다. */
export async function acceptInvitation(token: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}
