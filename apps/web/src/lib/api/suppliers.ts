import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  memo: string | null;
  archivedAt: string | null;
}

export interface SupplierInput {
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  memo: string | null;
}

const SUPPLIER_SELECT = "id, name, contact_name, phone, email, memo, archived_at";

type SupplierRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  memo: string | null;
  archived_at: string | null;
};

function toSupplier(r: SupplierRow): Supplier {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    memo: r.memo,
    archivedAt: r.archived_at,
  };
}

function optional(value: string | null, label: string, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > max) throw new ApiError(`${label}은(는) ${max}자 이하로 입력해 주세요.`);
  return trimmed;
}

function validate(input: SupplierInput) {
  const name = input.name.trim();
  if (!name) throw new ApiError("거래처 이름을 입력해 주세요.");
  if (name.length > 50) throw new ApiError("거래처 이름은 50자 이하로 입력해 주세요.");
  const email = optional(input.email, "이메일", 100);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("이메일 형식이 올바르지 않습니다.");
  return {
    name,
    contact_name: optional(input.contactName, "담당자", 30),
    phone: optional(input.phone, "전화번호", 30),
    email,
    memo: optional(input.memo, "메모", 500),
  };
}

/** 매장의 거래처 전체 (보관 포함), 이름 순 */
export async function listSuppliers(storeId: string): Promise<Supplier[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").select(SUPPLIER_SELECT).eq("store_id", storeId).order("name");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.map(toSupplier);
}

export async function getSupplier(storeId: string, supplierId: string): Promise<Supplier | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(SUPPLIER_SELECT)
    .eq("store_id", storeId)
    .eq("id", supplierId)
    .maybeSingle();
  if (error?.code === "22P02") return null;
  if (error) throw new ApiError(dbErrorMessage(error));
  return data ? toSupplier(data) : null;
}

export async function createSupplier(storeId: string, input: SupplierInput): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ store_id: storeId, ...validate(input) })
    .select("id")
    .single();
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.id;
}

export async function updateSupplier(storeId: string, supplierId: string, input: SupplierInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update(validate(input))
    .eq("store_id", storeId)
    .eq("id", supplierId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 거래처입니다.");
}

/** 거래처는 삭제하지 않고 보관한다. 지난 발주서가 계속 참조하기 때문이다. */
export async function setSupplierArchived(storeId: string, supplierId: string, archived: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("store_id", storeId)
    .eq("id", supplierId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 거래처입니다.");
}
