import type { Page } from "@playwright/test";
import { expect, MOBILE, test } from "../fixtures";
import { addIngredient, check, createItem, createMenu, hasHorizontalScroll, main, recordStock, shot, submitSales } from "../helpers";

const overTargetCard = (p: Page) =>
  p.locator("main [data-slot=card]").filter({ has: p.getByText(/^목표 원가율을 넘은 메뉴 \d+개$/) });

const menuRow = (p: Page, name: string) =>
  p.locator("main ol > li").filter({ has: p.getByRole("link", { name, exact: true }) });

async function setMenuTarget(p: Page, menuId: string, value: string) {
  await p.goto(`/menus/${menuId}`);
  await p.fill("#menu-target-cost-rate", value);
  await p.getByRole("button", { name: "저장", exact: true }).click();
}

test("메뉴 수익성·목표 원가율", async ({ app }) => {
  const owner = await app.owner({ storeName: `수익성테스트 ${app.stamp}` });
  const p = owner.page;

  // 원두 20원/g, 우유 2.5원/ml, 컵 100원
  const bean = await createItem(p, { name: "원두", baseUnit: "g", unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
  await recordStock(p, { itemId: bean, quantity: 5, price: "20,000" });
  await recordStock(p, { itemId: milk, quantity: 10, price: "2,500" });
  await recordStock(p, { itemId: cup, quantity: 200, price: "100" });
  // 아메리카노 원가 500 (12.5%), 카페라떼 1,125 (25%), 바닐라라떼 1,000 (16.7%), 시즌에이드 1,100 (36.7%)
  await createMenu(p, "아메리카노", "4000");
  await addIngredient(p, bean, 20);
  await addIngredient(p, cup, 1);
  const latte = await createMenu(p, "카페라떼", "4500");
  await addIngredient(p, bean, 20);
  await addIngredient(p, milk, 250);
  await addIngredient(p, cup, 1);
  const vanilla = await createMenu(p, "바닐라라떼", "6000");
  await addIngredient(p, bean, 20);
  await addIngredient(p, milk, 200);
  await addIngredient(p, cup, 1);
  const ade = await createMenu(p, "시즌에이드", "3000");
  await addIngredient(p, bean, 50);
  await addIngredient(p, cup, 1);

  await p.goto("/sales");
  await p.getByLabel("아메리카노 판매 수량").fill("30");
  await p.getByLabel("카페라떼 판매 수량").fill("20");
  await p.getByLabel("바닐라라떼 판매 수량").fill("3");
  await p.getByLabel("시즌에이드 판매 수량").fill("2");
  await submitSales(p);

  await test.step("1. 목표를 넘은 메뉴: 메뉴 상세·목록·대시보드", async () => {
    await p.goto(`/menus/${ade}`);
    const text = await main(p);
    check("원가율 36.7% · 매장 기본 목표 30%", text.includes("36.7%") && text.includes("목표 30% (매장 기본)"), text);
    check("목표 맞추는 판매가 3,700원 (+700원)", text.includes("3,700원") && text.includes("지금보다 +700원"), text);
    await p.goto(`/menus/${latte}`);
    const latteText = await main(p);
    // 1,125 ÷ 30% = 3,750 → 3,800원
    check("목표 안 메뉴: 3,800원 이상이면 목표 안", latteText.includes("3,800원") && latteText.includes("이 가격 이상이면 목표 안"), latteText);

    await p.goto("/menus");
    const list = await main(p);
    check("목록: 시즌에이드에만 목표 초과 배지", (list.match(/목표 30% 초과/g) ?? []).length === 1, list);

    await p.goto("/dashboard");
    const card = await overTargetCard(p).innerText();
    check("대시보드 1개", card.includes("목표 원가율을 넘은 메뉴 1개"), card);
    check("시즌에이드 3,000원 → 3,700원", card.includes("원가율 36.7% (목표 30%)") && card.includes("3,000원 → 3,700원"), card);
  });

  await test.step("2. 메뉴 수익성 리포트", async () => {
    await p.getByRole("link", { name: "리포트", exact: true }).click();
    await p.waitForURL("**/reports");
    await p.getByRole("link", { name: "메뉴 수익성" }).first().click();
    await p.waitForURL("**/reports/menus");
    const text = await main(p);
    check("기본 기간 최근 30일", (await p.getByRole("link", { name: "최근 30일" }).getAttribute("class"))!.includes("bg-primary"));
    // 매출 120,000 + 90,000 + 18,000 + 6,000 / 재료비 15,000 + 22,500 + 3,000 + 2,200
    check("매출 234,000원 · 55개", text.includes("234,000원") && text.includes("판매 55개"), text);
    check("재료비 42,700원 · 18.2%", text.includes("42,700원") && text.includes("원가율 18.2%"), text);
    check("마진 191,300원", text.includes("191,300원"), text);
    check("개당 평균 마진 3,478원", text.includes("3,478원"), text);

    const order = await p.locator("main ol > li a").allInnerTexts();
    check("마진 순", JSON.stringify(order) === JSON.stringify(["아메리카노", "카페라떼", "바닐라라떼", "시즌에이드"]), order);
    const americano = await menuRow(p, "아메리카노").innerText();
    check("아메리카노: 효자 메뉴, +105,000원 (55%)", americano.includes("효자 메뉴") && americano.includes("+105,000원 (55%)"), americano);
    check("아메리카노: 30개 · 개당 3,500원 · 12.5%", americano.includes("30개 · 매출 120,000원 · 개당 마진 3,500원 · 원가율 12.5%"), americano);
    const latteRow = await menuRow(p, "카페라떼").innerText();
    check("카페라떼: 많이 팔리지만 덜 남음 (개당 3,375원)", latteRow.includes("많이 팔리지만 덜 남음") && latteRow.includes("개당 마진 3,375원"), latteRow);
    check("바닐라라떼: 잘 남지만 덜 팔림", (await menuRow(p, "바닐라라떼").innerText()).includes("잘 남지만 덜 팔림"));
    const adeRow = await menuRow(p, "시즌에이드").innerText();
    check("시즌에이드: 정리 후보, 원가율 36.7% (목표 30%)", adeRow.includes("정리 후보") && adeRow.includes("원가율 36.7% (목표 30%)"), adeRow);
    check("목표를 넘은 메뉴 카드", text.includes("목표 원가율을 넘은 메뉴 1개"), text);
    await shot(p, "메뉴 수익성");

    await p.getByRole("link", { name: "이론 vs 실제" }).click();
    await p.waitForURL("**/reports");
    await expect(p.locator("main")).toContainText("이론 vs 실제 사용량");
    check("이론 vs 실제 매출도 그대로", (await main(p)).includes("234,000원"));
  });

  await test.step("3. 단가가 올라 목표를 넘으면 입고 알림·대시보드", async () => {
    // 우유 2,500 → 4,000원 (+60%): 카페라떼 1,500원 (25% → 33.3%), 바닐라라떼 1,300원 (16.7% → 21.7%)
    await recordStock(p, { itemId: milk, quantity: 1, price: "4,000" });
    const toast = p.locator("[data-sonner-toast]").filter({ hasText: "입고를 기록했습니다." }).last();
    await toast.waitFor();
    const text = await toast.innerText();
    check(
      "알림: 카페라떼 목표 30% 넘음",
      text.includes("우유 단가 +60% (1팩 2,500원 → 4,000원). 카페라떼 원가율 25% → 33.3% (목표 30% 넘음) 외 메뉴 1개"),
      text,
    );
    await p.goto("/dashboard");
    const card = await overTargetCard(p).innerText();
    check("대시보드 2개, 많이 넘은 순", card.includes("목표 원가율을 넘은 메뉴 2개") && card.indexOf("시즌에이드") < card.indexOf("카페라떼"), card);
    check("카페라떼 4,500원 → 5,000원", card.includes("4,500원 → 5,000원"), card);
    const costCard = await p.locator("main [data-slot=card]").filter({ hasText: "입고 단가 변동" }).innerText();
    check("단가 변동 카드에도 목표 넘음", costCard.includes("(목표 30% 넘음)"), costCard);
  });

  await test.step("4. 메뉴별 목표 원가율", async () => {
    await setMenuTarget(p, vanilla, "0");
    await expect(p.getByText("목표 원가율은 1~100 사이의 정수(%)로 입력해 주세요.", { exact: false }).first()).toBeVisible();
    check("오류 후 입력값 유지", (await p.inputValue("#menu-target-cost-rate")) === "0");
    await setMenuTarget(p, vanilla, "20");
    await expect(p.getByText("저장했습니다.").first()).toBeVisible();
    await expect(p.locator("main")).toContainText("목표 20%");
    const text = await main(p);
    // 1,300 ÷ 20% = 6,500원
    check("바닐라라떼: 21.7% > 목표 20% → 6,500원 (+500원)", text.includes("21.7%") && text.includes("6,500원") && text.includes("지금보다 +500원"), text);
    check("매장 기본 표시 없음", !text.includes("(매장 기본)"));
  });

  await test.step("5. 매장 목표 원가율", async () => {
    await p.goto("/settings/store");
    check("기본 30", (await p.inputValue("#store-target-cost-rate")) === "30");
    await p.fill("#store-target-cost-rate", "101");
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await expect(p.getByText("목표 원가율은 1~100 사이의 정수(%)로 입력해 주세요.")).toBeVisible();
    await p.fill("#store-target-cost-rate", "40");
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await expect(p.getByText("매장 정보를 저장했습니다.")).toBeVisible();
    await p.goto("/dashboard");
    const card = await overTargetCard(p).innerText();
    // 시즌에이드 36.7%·카페라떼 33.3% 는 40% 안, 바닐라라떼는 자기 목표 20%
    check("대시보드: 바닐라라떼만", card.includes("목표 원가율을 넘은 메뉴 1개") && card.includes("바닐라라떼") && card.includes("(목표 20%)"), card);
    await p.goto("/menus/new");
    check("새 메뉴: 비우면 매장 기본 40%", (await main(p)).includes("비우면 매장 기본 40%"));
  });

  await test.step("6. 직원은 볼 수 없음", async () => {
    const { page: s } = await app.joinByInvite(p);
    await s.goto("/dashboard");
    check("대시보드 카드 없음", !(await main(s)).includes("목표 원가율을 넘은 메뉴"));
    await s.goto("/reports/menus");
    check("주소로 들어와도 차단", (await main(s)).includes("리포트는 사장과 매니저만 볼 수 있습니다."));
  });

  await test.step("7. 모바일", async () => {
    const { page: m } = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    await m.goto("/reports/menus");
    check("리포트 가로 스크롤 없음", !(await hasHorizontalScroll(m)));
    await shot(m, "메뉴 수익성 모바일");
    await m.goto(`/menus/${vanilla}`);
    check("메뉴 상세 가로 스크롤 없음", !(await hasHorizontalScroll(m)));
    await shot(m, "메뉴 상세 목표 모바일");
  });
});
