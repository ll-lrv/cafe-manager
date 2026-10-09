import "server-only";
import { roundQty, type BaseUnit } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ItemUnitInfo {
  id: string;
  name: string;
  /** 이 단위 1개 = 기본 단위 factor 만큼 */
  factor: number;
  isDefaultPurchase: boolean;
}

export interface Item {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  /** 주로 주문하는 거래처 (발주 때 부족 품목 추천에 쓴다) */
  defaultSupplierId: string | null;
  baseUnit: BaseUnit;
  minStock: number;
  trackExpiry: boolean;
  barcode: string | null;
  memo: string | null;
  archivedAt: string | null;
  units: ItemUnitInfo[];
}

export interface ItemInput {
  name: string;
  categoryId: string | null;
  defaultSupplierId: string | null;
  baseUnit: BaseUnit;
  minStock: number;
  trackExpiry: boolean;
  barcode: string | null;
  memo: string | null;
}

export interface ItemUnitInput {
  name: string;
  factor: number;
  isDefaultPurchase: boolean;
}

const ITEM_SELECT =
  "id, name, category_id, default_supplier_id, base_unit, min_stock, track_expiry, barcode, memo, archived_at, category:categories(name), units:item_units(id, name, factor, is_default_purchase)";

type ItemRow = {
  id: string;
  name: string;
  category_id: string | null;
  default_supplier_id: string | null;
  base_unit: BaseUnit;
  min_stock: number;
  track_expiry: boolean;
  barcode: string | null;
  memo: string | null;
  archived_at: string | null;
  category: { name: string } | null;
  units: { id: string; name: string; factor: number; is_default_purchase: boolean }[];
};

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    defaultSupplierId: row.default_supplier_id,
    baseUnit: row.base_unit,
    minStock: row.min_stock,
    trackExpiry: row.track_expiry,
    barcode: row.barcode,
    memo: row.memo,
    archivedAt: row.archived_at,
    units: row.units
      .map((u) => ({ id: u.id, name: u.name, factor: u.factor, isDefaultPurchase: u.is_default_purchase }))
      .sort((a, b) => a.factor - b.factor),
  };
}

/** 이름 등 짧은 문자열 검증. 비어 있으면 오류 */
function requireText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ApiError(`${label}을(를) 입력해 주세요.`);
  if (trimmed.length > max) throw new ApiError(`${label}은(는) ${max}자 이하로 입력해 주세요.`);
  return trimmed;
}

function optionalText(value: string | null, label: string, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > max) throw new ApiError(`${label}은(는) ${max}자 이하로 입력해 주세요.`);
  return trimmed;
}

/** 같은 이름·바코드 중복은 어떤 값이 겹쳤는지 알려 준다. */
function itemErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    if (error.message.includes("items_store_barcode_key")) return "같은 바코드의 품목이 이미 있습니다.";
    if (error.message.includes("items_store_name_key")) return "같은 이름의 품목이 이미 있습니다. (보관된 품목 포함)";
    if (error.message.includes("item_units_item_name_key")) return "같은 이름의 단위가 이미 있습니다.";
    if (error.message.includes("categories_store_name_key")) return "같은 이름의 카테고리가 이미 있습니다.";
  }
  return dbErrorMessage(error);
}

function validateItemInput(input: ItemInput) {
  if (!["g", "ml", "ea"].includes(input.baseUnit)) throw new ApiError("기본 단위를 선택해 주세요.");
  if (!Number.isFinite(input.minStock) || input.minStock < 0) {
    throw new ApiError("부족 알림 기준은 0 이상의 숫자로 입력해 주세요.");
  }
  return {
    name: requireText(input.name, "품목 이름", 50),
    category_id: input.categoryId || null,
    default_supplier_id: input.defaultSupplierId || null,
    base_unit: input.baseUnit,
    min_stock: roundQty(input.minStock),
    track_expiry: input.trackExpiry,
    barcode: optionalText(input.barcode, "바코드", 50),
    memo: optionalText(input.memo, "메모", 500),
  };
}

// ---------------------------------------------------------------- 카테고리

export async function listCategories(storeId: string): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, sort_order")
    .eq("store_id", storeId)
    .order("sort_order")
    .order("name");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sort_order }));
}

export async function createCategory(storeId: string, name: string) {
  const supabase = await createClient();
  // 새 카테고리는 맨 뒤에 붙인다.
  const { data: last } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("store_id", storeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("categories").insert({
    store_id: storeId,
    name: requireText(name, "카테고리 이름", 30),
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) throw new ApiError(itemErrorMessage(error));
}

export async function renameCategory(storeId: string, categoryId: string, name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .update({ name: requireText(name, "카테고리 이름", 30) })
    .eq("store_id", storeId)
    .eq("id", categoryId)
    .select("id");
  if (error) throw new ApiError(itemErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 카테고리입니다.");
}

/** 카테고리를 한 칸 위/아래로 옮긴다. 전체 순서를 0부터 다시 매긴다. */
export async function moveCategory(storeId: string, categoryId: string, direction: "up" | "down") {
  const categories = await listCategories(storeId);
  const index = categories.findIndex((c) => c.id === categoryId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= categories.length) return;
  [categories[index], categories[target]] = [categories[target], categories[index]];

  const supabase = await createClient();
  const changed = categories.flatMap((c, i) => (c.sortOrder === i ? [] : [{ id: c.id, sort_order: i }]));
  for (const c of changed) {
    const { error } = await supabase
      .from("categories")
      .update({ sort_order: c.sort_order })
      .eq("store_id", storeId)
      .eq("id", c.id);
    if (error) throw new ApiError(dbErrorMessage(error));
  }
}

/** 카테고리를 지워도 품목은 남고 '미분류'가 된다. */
export async function deleteCategory(storeId: string, categoryId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("store_id", storeId)
    .eq("id", categoryId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 카테고리입니다.");
}

// ---------------------------------------------------------------- 품목

/** 매장의 품목 전체 (보관된 품목 포함). 카페 규모에서는 화면에서 걸러도 충분하다. */
export async function listItems(storeId: string): Promise<Item[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_SELECT)
    .eq("store_id", storeId)
    .order("name");
  if (error) throw new ApiError(dbErrorMessage(error));
  return (data as ItemRow[]).map(toItem);
}

export async function getItem(storeId: string, itemId: string): Promise<Item | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_SELECT)
    .eq("store_id", storeId)
    .eq("id", itemId)
    .maybeSingle();
  // 잘못된 형식의 ID(uuid 아님)는 없는 품목으로 본다.
  if (error?.code === "22P02") return null;
  if (error) throw new ApiError(dbErrorMessage(error));
  return data ? toItem(data as ItemRow) : null;
}

/** 입출고·레시피·옵션에 쓰였는지. 쓰인 품목은 기본 단위를 바꿀 수 없다. (DB 트리거가 최종 확인) */
export async function isItemInUse(itemId: string): Promise<boolean> {
  const supabase = await createClient();
  const results = await Promise.all([
    supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("item_id", itemId),
    supabase.from("recipe_ingredients").select("item_id", { count: "exact", head: true }).eq("item_id", itemId),
    supabase
      .from("menu_option_rules")
      .select("id", { count: "exact", head: true })
      .or(`item_id.eq.${itemId},from_item_id.eq.${itemId}`),
  ]);
  for (const r of results) if (r.error) throw new ApiError(dbErrorMessage(r.error));
  return results.some((r) => (r.count ?? 0) > 0);
}

export async function createItem(storeId: string, input: ItemInput): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert({ store_id: storeId, ...validateItemInput(input) })
    .select("id")
    .single();
  if (error) throw new ApiError(itemErrorMessage(error));
  return data.id;
}

export async function updateItem(storeId: string, itemId: string, input: ItemInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update(validateItemInput(input))
    .eq("store_id", storeId)
    .eq("id", itemId)
    .select("id");
  if (error) throw new ApiError(itemErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 품목입니다.");
}

/** 품목은 삭제하지 않고 보관한다. 과거 입출고 기록이 품목을 계속 참조하기 때문이다. */
export async function setItemArchived(storeId: string, itemId: string, archived: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("store_id", storeId)
    .eq("id", itemId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 품목입니다.");
}

// ---------------------------------------------------------------- 입고 단위

/** item_units 에는 store_id 가 없으므로 품목이 현재 매장 것인지 먼저 확인한다. */
async function requireStoreItem(storeId: string, itemId: string) {
  const item = await getItem(storeId, itemId);
  if (!item) throw new ApiError("없는 품목입니다.");
  return item;
}

export async function addItemUnit(storeId: string, itemId: string, input: ItemUnitInput) {
  await requireStoreItem(storeId, itemId);
  if (!Number.isFinite(input.factor) || input.factor <= 0) {
    throw new ApiError("환산 수량은 0보다 큰 숫자로 입력해 주세요.");
  }
  const factor = roundQty(input.factor);
  if (factor <= 0) throw new ApiError("환산 수량이 너무 작습니다.");

  const name = requireText(input.name, "단위 이름", 20);

  // 먼저 기본이 아닌 단위로 넣고, 성공한 뒤에 기본으로 바꾼다. (넣기가 실패해도 기존 기본 단위가 그대로 남도록)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_units")
    .insert({ item_id: itemId, name, factor, is_default_purchase: false })
    .select("id")
    .single();
  if (error) throw new ApiError(itemErrorMessage(error));
  if (input.isDefaultPurchase) await switchDefaultPurchaseUnit(itemId, data.id);
}

/** 기본 입고 단위 바꾸기: 기존 기본 해제와 새 단위 지정을 DB 함수 하나(한 트랜잭션)로 */
async function switchDefaultPurchaseUnit(itemId: string, unitId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_default_item_unit", { p_item_id: itemId, p_unit_id: unitId });
  if (error?.code === "22P02") throw new ApiError("권한이 없거나 없는 단위입니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
}

/** 기본 입고 단위는 품목당 하나. 입고 화면에서 처음 선택되는 단위다. */
export async function setDefaultPurchaseUnit(storeId: string, itemId: string, unitId: string) {
  await requireStoreItem(storeId, itemId);
  await switchDefaultPurchaseUnit(itemId, unitId);
}

/** 지난 입출고 기록의 단위 표시는 사라지지만 수량(기본 단위)은 그대로 남는다. 발주서에 쓰인 단위는 지울 수 없다. */
export async function deleteItemUnit(storeId: string, itemId: string, unitId: string) {
  await requireStoreItem(storeId, itemId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_units")
    .delete()
    .eq("item_id", itemId)
    .eq("id", unitId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 단위입니다.");
}
