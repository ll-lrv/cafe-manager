import type { Page } from "@playwright/test";
import { expect, MOBILE, test } from "../fixtures";
import {
  addCategory,
  addIngredient,
  check,
  createItem,
  createMenu,
  hasHorizontalScroll,
  main,
  recordStock,
  shot,
  submitSales,
} from "../helpers";

/** 유제품만 실사해서 우유를 packs 팩으로 세고 완료한다 (차이가 있어야 한다) */
async function countMilk(p: Page, packs: number) {
  await p.goto("/counts");
  await p.selectOption("#count-category", { label: "유제품만" });
  await p.getByRole("button", { name: "실사 시작" }).click();
  await p.waitForURL(/\/counts\/[0-9a-f-]{36}/);
  await p.getByLabel("우유 팩 수").fill(String(packs));
  const loose = p.getByLabel(/^우유 (낱개|수량) \(/);
  await loose.fill("0");
  await p.locator("li", { has: loose }).getByRole("button", { name: "확인" }).click();
  await p.locator("li", { hasText: "우유" }).getByText("센 수량").waitFor();
  await p.getByRole("button", { name: "실사 완료 · 재고 반영" }).click();
  await p.getByText("1개 품목의 재고를 맞췄습니다.").waitFor();
}

const milkRow = (p: Page) => p.locator("main li").filter({ has: p.getByRole("link", { name: "우유", exact: true }) });

test("이론 vs 실제 리포트", async ({ app }) => {
  const owner = await app.owner({ storeName: `리포트테스트 ${app.stamp}` });
  const p = owner.page;

  await addCategory(p, "유제품");
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", category: "유제품", unit: ["팩", 1000] });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
  await recordStock(p, { itemId: milk, quantity: 10, price: "2,800" }); // 2.8원/ml
  await recordStock(p, { itemId: cup, quantity: 100, price: "100" });
  await createMenu(p, "라떼", "5000");
  await addIngredient(p, milk, 200);
  await addIngredient(p, cup, 1);

  await test.step("1. 실사가 없으면 안내", async () => {
    await p.goto("/reports");
    check("실사 없음 안내", (await main(p)).includes("이 기간에 끝난 실사가 없어"));
  });

  await test.step("2. 실사 → 판매·사용·폐기 → 실사", async () => {
    // 첫 실사: 10팩 → 9팩 (−1,000ml). 이 조정은 다음 실사 구간에 들어가면 안 된다
    await countMilk(p, 9);
    await p.goto("/sales");
    await p.getByLabel("라떼 판매 수량").fill("20"); // 우유 4,000ml, 컵 20개
    await submitSales(p);
    await recordStock(p, { itemId: milk, type: "사용", quantity: 300 });
    await recordStock(p, { itemId: milk, type: "폐기", quantity: 500 });
    // 장부 9,000 − 4,000 − 800 = 4,200 → 3팩으로 셈 (−1,200ml)
    await countMilk(p, 3);
  });

  await test.step("3. 실사 구간 리포트 (기본)", async () => {
    await p.getByRole("link", { name: "리포트", exact: true }).click();
    await p.waitForURL("**/reports");
    const text = await main(p);
    check("실사 구간 칩", /실사 \d+\. \d+\. → \d+\. \d+\. \(유제품\)/.test(text), text);
    check("실사 안내 없음", !text.includes("이 기간에 끝난 실사가 없어"));
    // 이론: 우유 4,000×2.8 = 11,200 + 컵 2,000 = 13,200 / 실제: 우유 6,000×2.8 = 16,800 + 2,000 = 18,800
    check("매출 100,000원", text.includes("100,000원"));
    check("이론 원가 13,200원 · 13.2%", text.includes("13,200원") && text.includes("원가율 13.2%"), text);
    check("실제 원가 18,800원 · 18.8%", text.includes("18,800원") && text.includes("원가율 18.8%"), text);
    check("차이 +5,600원", text.includes("+5,600원"));
    const row = await milkRow(p).innerText();
    check("우유: 이론 4팩 · 실제 6팩 · 차이 +2팩 (+50.0%)", row.includes("이론 4팩 · 실제 6팩 · 차이 +2팩 (+50.0%)"), row);
    check(
      "우유 원인: 사용 300ml · 폐기 500ml · 실사 1팩 + 200ml (첫 실사 −1,000ml 제외)",
      row.includes("레시피 밖 사용 +300ml") && row.includes("폐기 +500ml") && row.includes("실사에서 모자람 1팩 + 200ml"),
      row,
    );
    check("우유 차이 큼 배지", row.includes("차이 큼"));
    const cupRow = await p.locator("main li").filter({ has: p.getByRole("link", { name: "컵", exact: true }) }).innerText();
    check("컵은 이번 실사에서 안 셈 → 실사 안 함", cupRow.includes("실사 안 함") && !row.includes("실사 안 함"), cupRow);
    check("세지 않은 품목 안내", text.includes("이 기간에 세지 않은 품목 1개"));
    check("0원인 원인은 숨김", !text.includes("직접 조정 0원"));
    check("우유가 맨 위 (차이 금액 순)", (await p.locator("main li").first().innerText()).includes("우유"));
    await shot(p, "리포트 실사 구간");
  });

  await test.step("4. 최근 7일: 두 실사가 모두 들어감", async () => {
    await p.getByRole("link", { name: "최근 7일" }).click();
    await expect(p.locator("main")).toContainText("+8,400원"); // (300 + 500 + 1,000 + 1,200) × 2.8
    const row = await milkRow(p).innerText();
    check("우유 실제 7팩 · 차이 +3팩 (+75.0%)", row.includes("실제 7팩 · 차이 +3팩 (+75.0%)"), row);
  });

  await test.step("5. 직원은 볼 수 없음", async () => {
    const { page: s } = await app.joinByInvite(p);
    check("직원 메뉴에 리포트 없음", (await s.locator("header").getByRole("link", { name: "리포트", exact: true }).count()) === 0);
    await s.goto("/reports");
    check("주소로 들어와도 차단", (await main(s)).includes("리포트는 사장과 매니저만 볼 수 있습니다."));
  });

  await test.step("6. 모바일", async () => {
    const { page: m } = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    await m.goto("/reports");
    check("가로 스크롤 없음", !(await hasHorizontalScroll(m)));
    await shot(m, "리포트 모바일");
  });
});
