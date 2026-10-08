import "server-only";
import { listItems } from "@/lib/api/catalog";
import { getLatestCosts, listMenus } from "@/lib/api/menus";
import { buildCostAlerts, costAlertNotice } from "@/lib/cost-alerts";

/**
 * 입고 직후 단가 변동 알림. 입고 전에 받아 둔 단가(before, getLatestCosts)와 입고 뒤 단가를 비교해
 * 알림 기준 이상 바뀐 품목이 있으면 메뉴 원가율 변화 문구를 만든다.
 * 입고는 이미 끝났으므로 여기서 생긴 오류는 알림만 건너뛴다.
 */
export async function costNoticeAfterReceive(
  storeId: string,
  itemIds: string[],
  before: Record<string, number>,
): Promise<string | undefined> {
  try {
    const after = await getLatestCosts(storeId, { itemIds });
    const changes = itemIds.flatMap((itemId) => {
      const previous = before[itemId];
      const current = after[itemId];
      return previous !== undefined && current !== undefined && previous !== current
        ? [{ itemId, previousUnitCost: previous, unitCost: current, changedAt: new Date().toISOString() }]
        : [];
    });
    if (changes.length === 0) return undefined;
    const [items, menus, costs] = await Promise.all([listItems(storeId), listMenus(storeId), getLatestCosts(storeId)]);
    return costAlertNotice(buildCostAlerts(changes, items, menus, costs));
  } catch (e) {
    console.error(e);
    return undefined;
  }
}
