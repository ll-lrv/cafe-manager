import { roundQty } from "./quantity";
import type { RecipeIngredient } from "./recipe";

/**
 * 메뉴 옵션 (샷 추가, 오트밀크 변경, 사이즈업 등)이 레시피를 바꾸는 규칙. 판매 1개당, 기본 단위.
 * - scale: 레시피에 itemId 가 있으면 quantity 배 (사이즈업: 우유 ×1.3)
 * - replace: 레시피의 fromItemId 를 같은 양의 itemId 로 (오트밀크 변경: 우유 → 오트밀크)
 * - add: itemId 를 quantity 만큼 더 (샷 추가: 원두 +18g)
 * DB 함수 sale_ingredients 와 같은 계산이다. 바꾸면 둘 다 바꾼다.
 */
export type OptionRule =
  | { kind: "scale"; itemId: string; quantity: number }
  | { kind: "replace"; itemId: string; fromItemId: string }
  | { kind: "add"; itemId: string; quantity: number };

/**
 * 옵션을 붙인 메뉴 1개의 재료. 적용 순서: 늘리기 → 바꾸기 → 추가.
 * - 늘리기는 곱한다 (두 옵션이 같은 재료를 늘리면 둘 다)
 * - 바꾸기는 늘린 뒤의 양을 기준으로 한 번씩만 옮긴다 (A→B, B→C 가 함께 있어도 A 가 C 로 가지 않는다).
 *   같은 재료를 바꾸는 규칙이 여럿이면 itemId 가 작은 쪽 하나만 (예: 오트밀크·두유를 함께 고른 경우)
 * - 0 이하가 된 재료는 뺀다. 결과는 itemId 순
 */
export function applyOptions(recipe: RecipeIngredient[], rules: OptionRule[]): RecipeIngredient[] {
  const map = new Map<string, number>();
  for (const r of recipe) map.set(r.itemId, (map.get(r.itemId) ?? 0) + r.quantity);

  for (const r of rules) {
    if (r.kind === "scale" && map.has(r.itemId)) map.set(r.itemId, map.get(r.itemId)! * r.quantity);
  }

  const snapshot = new Map(map);
  const replaces = rules
    .filter((r): r is Extract<OptionRule, { kind: "replace" }> => r.kind === "replace")
    .sort((a, b) => cmp(a.fromItemId, b.fromItemId) || cmp(a.itemId, b.itemId));
  const done = new Set<string>();
  for (const r of replaces) {
    if (done.has(r.fromItemId) || !snapshot.has(r.fromItemId)) continue;
    done.add(r.fromItemId);
    const moved = snapshot.get(r.fromItemId)!;
    map.set(r.fromItemId, map.get(r.fromItemId)! - moved);
    map.set(r.itemId, (map.get(r.itemId) ?? 0) + moved);
  }

  for (const r of rules) {
    if (r.kind === "add") map.set(r.itemId, (map.get(r.itemId) ?? 0) + r.quantity);
  }

  return [...map]
    .map(([itemId, q]) => ({ itemId, quantity: roundQty(q) }))
    .filter((r) => r.quantity > 0)
    .sort((a, b) => cmp(a.itemId, b.itemId));
}

/** DB(Postgres uuid 정렬)와 같은 순서가 되도록 문자열 코드값으로 비교한다 */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 옵션이 붙은 판매 줄의 이름. 예) "카페라떼 + 오트밀크 변경 + 샷 추가" */
export function optionLineName(menuName: string, optionNames: string[]): string {
  return [menuName, ...optionNames].join(" + ");
}
