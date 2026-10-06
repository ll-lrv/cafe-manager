import "server-only";
import { roundQty, toBaseQuantity, type BaseUnit } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";

export interface RecipeLine {
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  /** 메뉴 1개당 사용량 (기본 단위) */
  quantity: number;
  itemArchived: boolean;
}

export interface Menu {
  id: string;
  name: string;
  /** 원(KRW) */
  price: number;
  archivedAt: string | null;
  recipe: RecipeLine[];
}

export interface MenuInput {
  name: string;
  price: number;
}

const MENU_SELECT =
  "id, name, price, archived_at, recipe:recipe_ingredients(item_id, quantity, item:items(name, base_unit, archived_at))";

type MenuRow = {
  id: string;
  name: string;
  price: number;
  archived_at: string | null;
  recipe: {
    item_id: string;
    quantity: number;
    item: { name: string; base_unit: BaseUnit; archived_at: string | null } | null;
  }[];
};

function toMenu(row: MenuRow): Menu {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    archivedAt: row.archived_at,
    recipe: row.recipe
      .map((r) => ({
        itemId: r.item_id,
        itemName: r.item?.name ?? "알 수 없는 품목",
        baseUnit: r.item?.base_unit ?? "ea",
        quantity: r.quantity,
        itemArchived: !!r.item?.archived_at,
      }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName, "ko")),
  };
}

function menuErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("menus_store_name_key")) {
    return "같은 이름의 메뉴가 이미 있습니다. (보관된 메뉴 포함)";
  }
  return dbErrorMessage(error);
}

function validateMenuInput(input: MenuInput) {
  const name = input.name.trim();
  if (!name) throw new ApiError("메뉴 이름을 입력해 주세요.");
  if (name.length > 50) throw new ApiError("메뉴 이름은 50자 이하로 입력해 주세요.");
  if (!Number.isInteger(input.price) || input.price < 0 || input.price > 10_000_000) {
    throw new ApiError("가격은 0 이상의 원 단위 숫자로 입력해 주세요.");
  }
  return { name, price: input.price };
}

// ---------------------------------------------------------------- 메뉴

/** 매장의 메뉴 전체 (보관된 메뉴 포함) */
export async function listMenus(storeId: string): Promise<Menu[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("menus").select(MENU_SELECT).eq("store_id", storeId).order("name");
  if (error) throw new ApiError(dbErrorMessage(error));
  return (data as MenuRow[]).map(toMenu);
}

export async function getMenu(storeId: string, menuId: string): Promise<Menu | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .select(MENU_SELECT)
    .eq("store_id", storeId)
    .eq("id", menuId)
    .maybeSingle();
  // 잘못된 형식의 ID(uuid 아님)는 없는 메뉴로 본다.
  if (error?.code === "22P02") return null;
  if (error) throw new ApiError(dbErrorMessage(error));
  return data ? toMenu(data as MenuRow) : null;
}

export async function createMenu(storeId: string, input: MenuInput): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .insert({ store_id: storeId, ...validateMenuInput(input) })
    .select("id")
    .single();
  if (error) throw new ApiError(menuErrorMessage(error));
  return data.id;
}

export async function updateMenu(storeId: string, menuId: string, input: MenuInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .update(validateMenuInput(input))
    .eq("store_id", storeId)
    .eq("id", menuId)
    .select("id");
  if (error) throw new ApiError(menuErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 메뉴입니다.");
}

/** 메뉴는 삭제하지 않고 보관한다. 지난 판매 기록이 메뉴를 계속 참조하기 때문이다. */
export async function setMenuArchived(storeId: string, menuId: string, archived: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("store_id", storeId)
    .eq("id", menuId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 메뉴입니다.");
}

// ---------------------------------------------------------------- 레시피

/**
 * 레시피 재료를 넣거나 바꾼다. (메뉴·품목 한 쌍에 한 줄)
 * 수량은 입력 단위(unitId, 없으면 기본 단위)로 받아 기본 단위로 저장한다.
 */
export async function setRecipeIngredient(
  storeId: string,
  menuId: string,
  input: { itemId: string; quantity: number; unitId: string | null },
) {
  if (!input.itemId) throw new ApiError("재료 품목을 선택해 주세요.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new ApiError("사용량은 0보다 큰 숫자로 입력해 주세요.");
  }
  if (!(await getMenu(storeId, menuId))) throw new ApiError("없는 메뉴입니다.");

  const supabase = await createClient();
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id, archived_at, units:item_units(id, factor)")
    .eq("store_id", storeId)
    .eq("id", input.itemId)
    .maybeSingle();
  if (itemError?.code !== "22P02" && itemError) throw new ApiError(dbErrorMessage(itemError));
  if (!item) throw new ApiError("없는 품목입니다.");
  if (item.archived_at) throw new ApiError("보관된 품목은 레시피에 넣을 수 없습니다.");
  const unit = input.unitId ? item.units.find((u) => u.id === input.unitId) : null;
  if (input.unitId && !unit) throw new ApiError("단위를 찾을 수 없습니다.");

  const quantity = roundQty(toBaseQuantity(input.quantity, unit));
  if (quantity <= 0) throw new ApiError("사용량이 너무 작습니다.");

  const { error } = await supabase
    .from("recipe_ingredients")
    .upsert({ menu_id: menuId, item_id: item.id, quantity }, { onConflict: "menu_id,item_id" });
  if (error) throw new ApiError(dbErrorMessage(error));
}

export async function removeRecipeIngredient(storeId: string, menuId: string, itemId: string) {
  if (!(await getMenu(storeId, menuId))) throw new ApiError("없는 메뉴입니다.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("menu_id", menuId)
    .eq("item_id", itemId)
    .select("item_id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 재료입니다.");
}

// ---------------------------------------------------------------- 원가

/** 품목별 최근 입고 단가 (기본 단위 1개당 원). 입고 단가를 기록한 적이 없으면 빠진다. */
export async function getLatestCosts(storeId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_latest_costs")
    .select("item_id, unit_cost")
    .eq("store_id", storeId);
  if (error) throw new ApiError(dbErrorMessage(error));
  return Object.fromEntries(
    data.flatMap((r) => (r.item_id && r.unit_cost !== null ? [[r.item_id, r.unit_cost]] : [])),
  );
}
