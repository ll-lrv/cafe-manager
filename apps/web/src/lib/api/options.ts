import "server-only";
import { roundQty, toBaseQuantity, type BaseUnit, type OptionRule } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";

export type OptionRuleKind = OptionRule["kind"];

export interface OptionRuleView {
  id: string;
  kind: OptionRuleKind;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  /** 바꾸기: 원래 재료 */
  fromItemId: string | null;
  fromItemName: string | null;
  /** 추가: 기본 단위 양, 늘리기: 배수, 바꾸기: null */
  quantity: number | null;
}

export interface MenuOption {
  id: string;
  name: string;
  /** 추가 금액, 원 */
  price: number;
  archivedAt: string | null;
  rules: OptionRuleView[];
}

export interface OptionInput {
  name: string;
  price: number;
}

const OPTION_SELECT =
  "id, name, price, archived_at, rules:menu_option_rules(id, kind, item_id, from_item_id, quantity, created_at, item:items!menu_option_rules_item_id_items_id_fk(name, base_unit), from:items!menu_option_rules_from_item_id_items_id_fk(name))";

type OptionRow = {
  id: string;
  name: string;
  price: number;
  archived_at: string | null;
  rules: {
    id: string;
    kind: OptionRuleKind;
    item_id: string;
    from_item_id: string | null;
    quantity: number | null;
    created_at: string;
    item: { name: string; base_unit: BaseUnit } | null;
    from: { name: string } | null;
  }[];
};

const KIND_ORDER: Record<OptionRuleKind, number> = { scale: 0, replace: 1, add: 2 };

function toOption(row: OptionRow): MenuOption {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    archivedAt: row.archived_at,
    rules: [...row.rules]
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.created_at.localeCompare(b.created_at))
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        itemId: r.item_id,
        itemName: r.item?.name ?? "알 수 없는 품목",
        baseUnit: r.item?.base_unit ?? "ea",
        fromItemId: r.from_item_id,
        fromItemName: r.from?.name ?? null,
        quantity: r.quantity,
      })),
  };
}

/** 화면의 옵션 규칙 → core 계산용 */
export function toOptionRules(option: Pick<MenuOption, "rules">): OptionRule[] {
  return option.rules.map((r): OptionRule =>
    r.kind === "replace"
      ? { kind: "replace", itemId: r.itemId, fromItemId: r.fromItemId! }
      : { kind: r.kind, itemId: r.itemId, quantity: r.quantity! },
  );
}

function optionErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("menu_options_store_name_key")) {
    return "같은 이름의 옵션이 이미 있습니다. (보관된 옵션 포함)";
  }
  return dbErrorMessage(error);
}

function validateOptionInput(input: OptionInput) {
  const name = input.name.trim();
  if (!name) throw new ApiError("옵션 이름을 입력해 주세요.");
  if (name.length > 50) throw new ApiError("옵션 이름은 50자 이하로 입력해 주세요.");
  if (!Number.isInteger(input.price) || input.price < 0 || input.price > 1_000_000) {
    throw new ApiError("추가 금액은 0 이상의 원 단위 숫자로 입력해 주세요.");
  }
  return { name, price: input.price };
}

/** 매장의 옵션 전체 (보관 포함), 이름 순 */
export async function listOptions(storeId: string): Promise<MenuOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("menu_options").select(OPTION_SELECT).eq("store_id", storeId).order("name");
  if (error) throw new ApiError(dbErrorMessage(error));
  return (data as unknown as OptionRow[]).map(toOption);
}

export async function getOption(storeId: string, optionId: string): Promise<MenuOption | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_options")
    .select(OPTION_SELECT)
    .eq("store_id", storeId)
    .eq("id", optionId)
    .maybeSingle();
  if (error?.code === "22P02") return null;
  if (error) throw new ApiError(dbErrorMessage(error));
  return data ? toOption(data as unknown as OptionRow) : null;
}

export async function createOption(storeId: string, input: OptionInput): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_options")
    .insert({ store_id: storeId, ...validateOptionInput(input) })
    .select("id")
    .single();
  if (error) throw new ApiError(optionErrorMessage(error));
  return data.id;
}

export async function updateOption(storeId: string, optionId: string, input: OptionInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_options")
    .update(validateOptionInput(input))
    .eq("store_id", storeId)
    .eq("id", optionId)
    .select("id");
  if (error) throw new ApiError(optionErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 옵션입니다.");
}

/** 옵션은 지우지 않고 보관한다. 지난 판매가 옵션을 계속 참조하기 때문이다. */
export async function setOptionArchived(storeId: string, optionId: string, archived: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_options")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("store_id", storeId)
    .eq("id", optionId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 옵션입니다.");
}

export interface OptionRuleInput {
  kind: OptionRuleKind;
  itemId: string;
  /** 바꾸기: 원래 재료 */
  fromItemId: string | null;
  /** 추가: 양(unitId 단위), 늘리기: 배수 */
  quantity: number | null;
  /** 추가 양의 단위 (없으면 기본 단위) */
  unitId: string | null;
}

/** 옵션에 재료 규칙을 더한다. 추가 양은 입력 단위로 받아 기본 단위로 저장한다 */
export async function addOptionRule(storeId: string, optionId: string, input: OptionRuleInput) {
  const option = await getOption(storeId, optionId);
  if (!option) throw new ApiError("없는 옵션입니다.");
  if (!input.itemId) throw new ApiError("재료 품목을 선택해 주세요.");

  const supabase = await createClient();
  const { data: items, error: itemError } = await supabase
    .from("items")
    .select("id, archived_at, units:item_units(id, factor)")
    .eq("store_id", storeId)
    .in("id", [input.itemId, ...(input.fromItemId ? [input.fromItemId] : [])]);
  if (itemError?.code !== "22P02" && itemError) throw new ApiError(dbErrorMessage(itemError));
  const item = items?.find((i) => i.id === input.itemId);
  if (!item) throw new ApiError("없는 품목입니다.");
  if (item.archived_at) throw new ApiError("보관된 품목은 옵션에 넣을 수 없습니다.");

  let row: { kind: OptionRuleKind; item_id: string; from_item_id: string | null; quantity: number | null };
  if (input.kind === "replace") {
    if (!input.fromItemId || !items?.some((i) => i.id === input.fromItemId)) throw new ApiError("바꿀 원래 재료를 선택해 주세요.");
    if (input.fromItemId === input.itemId) throw new ApiError("원래 재료와 바꿀 재료가 같습니다.");
    if (option.rules.some((r) => r.kind === "replace" && r.fromItemId === input.fromItemId)) {
      throw new ApiError("이 옵션에 같은 재료를 바꾸는 규칙이 이미 있습니다.");
    }
    row = { kind: "replace", item_id: item.id, from_item_id: input.fromItemId, quantity: null };
  } else if (input.kind === "scale") {
    if (input.quantity === null || !Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 100) {
      throw new ApiError("몇 배로 늘릴지 0보다 큰 숫자로 입력해 주세요. (예: 1.5)");
    }
    if (input.quantity === 1) throw new ApiError("1배는 바뀌는 것이 없습니다.");
    if (option.rules.some((r) => r.kind === "scale" && r.itemId === input.itemId)) {
      throw new ApiError("이 옵션에 같은 재료를 늘리는 규칙이 이미 있습니다.");
    }
    row = { kind: "scale", item_id: item.id, from_item_id: null, quantity: roundQty(input.quantity) };
  } else {
    if (input.quantity === null || !Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new ApiError("추가할 양을 0보다 큰 숫자로 입력해 주세요.");
    }
    const unit = input.unitId ? item.units.find((u) => u.id === input.unitId) : null;
    if (input.unitId && !unit) throw new ApiError("단위를 찾을 수 없습니다.");
    const quantity = roundQty(toBaseQuantity(input.quantity, unit));
    if (quantity <= 0) throw new ApiError("추가할 양이 너무 작습니다.");
    if (option.rules.some((r) => r.kind === "add" && r.itemId === input.itemId)) {
      throw new ApiError("이 옵션에 같은 재료를 추가하는 규칙이 이미 있습니다. 지우고 다시 넣어 주세요.");
    }
    row = { kind: "add", item_id: item.id, from_item_id: null, quantity };
  }

  const { error } = await supabase.from("menu_option_rules").insert({ option_id: option.id, ...row });
  if (error) throw new ApiError(dbErrorMessage(error));
}

export async function removeOptionRule(storeId: string, optionId: string, ruleId: string) {
  if (!(await getOption(storeId, optionId))) throw new ApiError("없는 옵션입니다.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_option_rules")
    .delete()
    .eq("option_id", optionId)
    .eq("id", ruleId)
    .select("id");
  if (error?.code === "22P02") throw new ApiError("없는 규칙입니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 규칙입니다.");
}
