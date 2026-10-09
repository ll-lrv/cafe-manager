import { sql } from "../db";
import { expect, MOBILE, test } from "../fixtures";
import { check, createItem, hasHorizontalScroll, main, recordStock, shot } from "../helpers";

test("폐기 사유·폐기율", async ({ app }) => {
  const owner = await app.owner({ storeName: `폐기테스트 ${app.stamp}` });
  const p = owner.page;
  let milk = "";

  await test.step("1. 입고·사용·사유별 폐기", async () => {
    milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });
    const bean = await createItem(p, { name: "원두", baseUnit: "g" });
    const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
    await recordStock(p, { itemId: milk, quantity: 5, price: "3000" }); // 5팩, 3원/ml
    await recordStock(p, { itemId: bean, quantity: 1000, price: "25" });
    await recordStock(p, { itemId: cup, quantity: 100 }); // 단가 없음
    await recordStock(p, { itemId: milk, type: "사용", quantity: 2800 });
    await recordStock(p, { itemId: milk, type: "폐기", quantity: 1000, wasteReason: "유통기한 지남" });
    await recordStock(p, { itemId: milk, type: "폐기", quantity: 200, wasteReason: "제조 실수" });
    await recordStock(p, { itemId: bean, type: "폐기", quantity: 100, wasteReason: "쏟음·파손" });
    await recordStock(p, { itemId: cup, type: "폐기", quantity: 5, wasteReason: "쏟음·파손" });
    check(
      "원장에 사유",
      sql(`select string_agg(waste_reason::text, ',' order by quantity) from stock_movements where item_id = '${milk}' and type = 'waste'`) ===
        "expired,mistake",
    );
    await p.goto(`/items/${milk}`);
    const history = await main(p);
    check("품목 기록에 사유", history.includes("유통기한 지남") && history.includes("제조 실수"), history);
  });

  await test.step("2. 폐기 리포트", async () => {
    await p.goto("/reports");
    await p.getByRole("link", { name: "폐기", exact: true }).click();
    await p.waitForURL("**/reports/waste");
    const text = await main(p);
    // 폐기: 우유 1,200 × 3 = 3,600 + 원두 100 × 25 = 2,500 = 6,100원
    // 나간 재료: 우유 (2,800 + 1,200) × 3 = 12,000 + 원두 2,500 = 14,500원 → 42.1%
    check("폐기 금액 6,100원", text.includes("6,100원"), text);
    check("폐기율 42.1% (나간 재료 14,500원 중)", text.includes("42.1%") && text.includes("나간 재료 14,500원 중"), text);
    check("매출 없으면 매출 대비 —", text.includes("매출 0원"), text);
    const reasons = await p.getByRole("list", { name: "사유별 폐기" }).locator("li").allInnerTexts();
    check(
      "사유별 금액 순: 유통기한 3,000 → 쏟음·파손 2,500 → 제조 실수 600",
      reasons.length === 3 &&
        reasons[0]!.includes("유통기한 지남") && reasons[0]!.includes("3,000원") &&
        reasons[1]!.includes("쏟음·파손") && reasons[1]!.includes("2,500원") &&
        reasons[2]!.includes("제조 실수") && reasons[2]!.includes("600원"),
      reasons,
    );
    const items = await p.getByRole("list", { name: "품목별 폐기" }).locator("li").allInnerTexts();
    check("품목별: 우유 1팩 + 200ml 3,600원, 사유 나눔", items[0]!.includes("우유") && items[0]!.includes("1팩 + 200ml") &&
      items[0]!.includes("3,600원") && items[0]!.includes("유통기한 지남 1팩 · 제조 실수 200ml"), items);
    check("단가 없는 컵은 맨 뒤", items[2]!.includes("컵") && items[2]!.includes("단가 없음"), items);
    check("단가 없는 품목 안내", text.includes("입고 단가가 없는 품목(컵)은 금액에서 빠집니다."), text);
    await shot(p, "폐기 리포트");
  });

  await test.step("3. 직원: 사유 골라 폐기, 리포트는 차단", async () => {
    const { page: s } = await app.joinByInvite(p);
    await s.goto(`/stock?item=${milk}`);
    await s.getByRole("button", { name: "폐기", exact: true }).click();
    await s.fill("#stock-quantity", "100");
    await s.selectOption("#stock-waste-reason", { label: "상함·품질 이상" });
    await s.getByRole("button", { name: "폐기 기록" }).click();
    await expect(s.locator("main ul").last()).toContainText("상함·품질 이상");
    await s.goto("/reports/waste");
    check("주소로 들어와도 차단", (await main(s)).includes("리포트는 사장과 매니저만 볼 수 있습니다."));
  });

  await test.step("4. 모바일", async () => {
    const { page: m } = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    await m.goto("/reports/waste");
    await expect(m.locator("main")).toContainText("상함·품질 이상");
    check("리포트 가로 스크롤 없음", !(await hasHorizontalScroll(m)));
    await shot(m, "폐기 리포트 모바일");
  });
});
