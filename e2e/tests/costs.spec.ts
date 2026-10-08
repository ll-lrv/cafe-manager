import type { Page } from "@playwright/test";
import { expect, MOBILE, test } from "../fixtures";
import { addIngredient, check, createItem, createMenu, hasHorizontalScroll, main, recordStock, shot } from "../helpers";

/** 입고 뒤 뜬 알림 (제목 text 가 들어간 것) */
async function toastText(p: Page, text: string) {
  const toast = p.locator("[data-sonner-toast]").filter({ hasText: text }).last();
  await toast.waitFor();
  return toast.innerText();
}

const dashboardCard = (p: Page) =>
  p.locator("main [data-slot=card]").filter({ has: p.getByText(/^입고 단가 변동 \d+건$/) });

test("입고 단가 변동 알림", async ({ app }) => {
  const owner = await app.owner({ storeName: `단가테스트 ${app.stamp}` });
  const p = owner.page;

  const milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
  await recordStock(p, { itemId: milk, quantity: 10, price: "2,500" });
  await recordStock(p, { itemId: cup, quantity: 100, price: "100" });
  await createMenu(p, "카페라떼", "5000");
  await addIngredient(p, milk, 200);
  await addIngredient(p, cup, 1);
  await createMenu(p, "밀크티", "5000");
  await addIngredient(p, milk, 300);
  await createMenu(p, "아메리카노", "5000");
  await addIngredient(p, cup, 1);

  await test.step("1. 알림 기준(5%) 미만이면 알리지 않음", async () => {
    await recordStock(p, { itemId: milk, quantity: 1, price: "2,600" }); // +4%
    const text = await toastText(p, "입고를 기록했습니다.");
    check("단가 안내 없음", !text.includes("단가"), text);
    await p.goto("/dashboard");
    check("대시보드 카드 없음", !(await main(p)).includes("입고 단가 변동"));
  });

  await test.step("2. 단가가 오르면 입고 직후 메뉴 원가율 변화를 알림", async () => {
    await recordStock(p, { itemId: milk, quantity: 1, price: "2,808" }); // +8%
    const text = await toastText(p, "입고를 기록했습니다.");
    // 밀크티 우유 300ml: 780 → 842원 (15.6% → 16.8%), 카페라떼 200ml + 컵: 620 → 662원 (12.4% → 13.2%)
    check(
      "알림: 우유 +8%, 팩 가격, 가장 많이 바뀐 밀크티 + 나머지 개수",
      text.includes("우유 단가 +8% (1팩 2,600원 → 2,808원). 밀크티 원가율 15.6% → 16.8% 외 메뉴 1개"),
      text,
    );
    await shot(p, "입고 직후 단가 알림");
  });

  await test.step("3. 단가가 내려도 알림", async () => {
    await recordStock(p, { itemId: cup, quantity: 10, price: "90" }); // −10%
    const text = await toastText(p, "입고를 기록했습니다.");
    // 아메리카노 100 → 90원 (2% → 1.8%), 카페라떼 662 → 652원 (13.2% → 13%): 같은 폭이면 이름 순
    check(
      "알림: 컵 −10%, 아메리카노 원가율",
      text.includes("컵 단가 −10% (1개 100원 → 90원). 아메리카노 원가율 2% → 1.8% 외 메뉴 1개"),
      text,
    );
  });

  await test.step("4. 대시보드 카드", async () => {
    await p.goto("/dashboard");
    const card = dashboardCard(p);
    await card.waitFor();
    const text = await card.innerText();
    check("2건", text.includes("입고 단가 변동 2건"), text);
    check("우유: +8% · 팩 가격", text.includes("+8%") && text.includes("1팩 2,600원 → 2,808원"), text);
    // 다른 재료는 지금 단가로 계산한다: 카페라떼는 컵이 90원이 된 뒤라 610 → 652원 (12.2% → 13%)
    check(
      "우유를 쓰는 메뉴 원가율",
      text.includes("밀크티") && text.includes("원가율 15.6% → 16.8%") && text.includes("원가율 12.2% → 13%"),
      text,
    );
    check("컵: −10%", text.includes("−10%") && text.includes("1개 100원 → 90원"), text);
    await shot(p, "대시보드 단가 변동");
  });

  await test.step("5. 품목 상세", async () => {
    await p.goto(`/items/${milk}`);
    const text = await main(p);
    check("지금 단가 1팩 2,808원", text.includes("입고 단가 (최근 입고 기준)") && text.includes("1팩 2,808원"), text);
    check("직전 단가에서 +8%", text.includes("2,600원에서") && text.includes("+8%"), text);
    check("바뀐 메뉴 원가 (밀크티, 카페라떼)", text.includes("이 변동으로 바뀐 메뉴 원가") && text.includes("카페라떼"), text);
  });

  await test.step("6. 발주 입고에서도 알림", async () => {
    await p.goto("/suppliers/new");
    await p.fill("#supplier-name", "우유상회");
    await p.getByRole("button", { name: "거래처 만들기" }).click();
    await p.waitForURL(/\/suppliers\/[0-9a-f-]{36}/);
    await p.goto("/orders/new");
    await p.selectOption("#order-supplier", { label: "우유상회" });
    await p.getByRole("button", { name: "발주서 만들기" }).click();
    await p.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
    await p.selectOption("#line-item", milk);
    await p.fill("#line-quantity", "5");
    await p.fill("#line-price", "3,100");
    await p.getByRole("button", { name: "담기", exact: true }).click();
    await p.getByText("품목을 담았습니다.").waitFor();
    await p.getByRole("button", { name: /발주하기/ }).click();
    await p.getByText("발주했습니다.").waitFor();
    await p.getByRole("button", { name: /입고 처리 · 1개 품목/ }).click();
    const text = await toastText(p, "입고를 마쳤습니다.");
    check("알림: 우유 +10.4%", text.includes("우유 단가 +10.4% (1팩 2,808원 → 3,100원)"), text);
  });

  await test.step("7. 직원에게는 원가를 보여주지 않음", async () => {
    const { page: s } = await app.joinByInvite(p);
    await recordStock(s, { itemId: cup, quantity: 10, price: "120" }); // +33%
    const toast = await toastText(s, "입고를 기록했습니다.");
    check("직원 입고 알림에 단가 안내 없음", !toast.includes("단가"), toast);
    await s.goto("/dashboard");
    check("직원 대시보드에 카드 없음", !(await main(s)).includes("입고 단가 변동"));
    await s.goto(`/items/${milk}`);
    check("직원 품목 상세에 입고 단가 없음", !(await main(s)).includes("입고 단가 (최근 입고 기준)"));
    // 직원이 기록한 변동도 사장 대시보드에는 나온다
    await p.goto("/dashboard");
    await expect(dashboardCard(p)).toContainText("1개 90원 → 120원");
  });

  await test.step("8. 모바일", async () => {
    const { page: m } = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    await m.goto("/dashboard");
    await dashboardCard(m).waitFor();
    check("가로 스크롤 없음", !(await hasHorizontalScroll(m)));
    await shot(m, "대시보드 단가 변동 모바일");
  });
});
