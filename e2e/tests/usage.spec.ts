import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { addIngredient, check, createItem, createMenu, kstDate, main, recordStock, shot } from "../helpers";

const toast = (p: Page, text: string) => p.locator("[data-sonner-toast]").filter({ hasText: text }).last();
const card = (p: Page) => p.locator("[data-slot=card]").filter({ hasText: "곧 떨어질 품목" });

test("소진 예상일·사용량 기반 발주 추천", async ({ app }) => {
  const owner = await app.owner({ storeName: `소진테스트 ${app.stamp}` });
  const p = owner.page;
  let bean = "";

  await test.step("1. 거래처: 입고까지 걸리는 날·버틸 날", async () => {
    await p.goto("/suppliers/new");
    await p.fill("#supplier-name", "빈스서플");
    check("기본값 1일·7일", (await p.inputValue("#supplier-lead-days")) === "1" && (await p.inputValue("#supplier-cover-days")) === "7");
    await p.fill("#supplier-lead-days", "2");
    await p.getByRole("button", { name: "거래처 만들기" }).click();
    await p.waitForURL(/\/suppliers\/[0-9a-f-]{36}/);
    check("저장된 값", (await p.inputValue("#supplier-lead-days")) === "2" && (await p.inputValue("#supplier-cover-days")) === "7");
  });

  await test.step("2. 지난 15일 판매 가져오기 (하루 아메리카노 10잔)", async () => {
    bean = await createItem(p, { name: "원두", baseUnit: "g", minStock: "1000", unit: ["봉", 1000], supplier: "빈스서플" });
    const cup = await createItem(p, { name: "컵", baseUnit: "ea", supplier: "빈스서플" });
    await recordStock(p, { itemId: bean, quantity: "4.3", price: "24000" }); // 기본 입고 단위(봉) → 4,300g
    await recordStock(p, { itemId: cup, quantity: 200 });
    await createMenu(p, "아메리카노", "4500");
    await addIngredient(p, bean, 20);
    await addIngredient(p, cup, 1);
    // 20일 전 하루 + 최근 14일. 20일 전 기록이 있어 평균은 14일 전체로 낸다.
    const days = [-20, ...Array.from({ length: 14 }, (_, i) => -(i + 1))];
    const csv = ["일자,메뉴,판매수량", ...days.map((d) => `${kstDate(d)},아메리카노,10`)].join("\n");
    await p.goto("/sales/import");
    await p.getByLabel("판매 파일").setInputFiles({ name: "지난판매.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await p.getByRole("button", { name: "15줄 가져오기" }).click();
    await toast(p, "15건을 가져왔습니다.").waitFor();
    // 원두 4,300 − 20 × 150 = 1,300g (부족 기준 1,000g 보다 많음), 컵 200 − 150 = 50개
  });

  await test.step("3. 품목 목록·상세: 소진 예상", async () => {
    await p.goto("/items");
    const beanRow = await p.locator("main li").filter({ hasText: "원두" }).innerText();
    check("원두: 하루 200g → 1,300g 은 약 6일", beanRow.includes("약 6일 뒤 소진"), beanRow);
    const cupRow = await p.locator("main li").filter({ hasText: "컵" }).innerText();
    check("컵: 하루 10개 → 50개는 약 5일", cupRow.includes("약 5일 뒤 소진"), cupRow);
    await p.getByRole("button", { name: "7일 안에 소진 2" }).click();
    await expect(p.locator("main li")).toHaveCount(2);

    await p.goto(`/items/${bean}`);
    const detail = await main(p);
    check("하루 평균·기간", detail.includes("하루 평균 200g 사용 (최근 14일)"), detail);
    // 1,300 ≤ 1,000 + 200 × 2(입고까지)
    check("입고까지 버티지 못하면 발주할 때", detail.includes("지금 발주할 때 (입고까지 2일)"), detail);
  });

  await test.step("4. 대시보드: 곧 떨어질 품목", async () => {
    await p.goto("/dashboard");
    const c = card(p);
    await expect(c).toContainText("곧 떨어질 품목 2개");
    const rows = c.locator("li");
    check("빨리 떨어지는 순: 컵 → 원두", (await rows.first().innerText()).includes("컵"));
    check("원두만 발주할 때 (컵은 50 > 10 × 2)", (await rows.filter({ hasText: "원두" }).innerText()).includes("발주할 때") &&
      !(await rows.filter({ hasText: "컵" }).innerText()).includes("발주할 때"));
    await shot(p, "대시보드 곧 떨어질 품목");
  });

  await test.step("5. 발주 추천: 사용량 기준 수량", async () => {
    await card(p).getByRole("link", { name: "발주하기" }).click();
    await p.waitForURL("**/orders/new");
    check("추천 품목 1개 (원두)", (await main(p)).includes("추천 품목 1개 바로 담기"));
    await p.getByRole("button", { name: "발주서 만들기" }).click();
    await p.waitForURL(/\/orders\/[0-9a-f-]{36}/);
    // 1,000 + 200 × (2 + 7) − 1,300 = 1,500g → 2봉
    check("원두 2봉", (await p.getByLabel("원두 수량").inputValue()) === "2", await p.getByLabel("원두 수량").inputValue());
    const orderUrl = p.url();

    // 입고 5일·버틸 날 14일로 바꾸면 컵도 입고까지 버티지 못한다 (50 ≤ 10 × 5)
    await p.goto("/suppliers");
    await p.getByRole("link", { name: /빈스서플/ }).click();
    await p.fill("#supplier-lead-days", "5");
    await p.fill("#supplier-cover-days", "14");
    await p.getByRole("button", { name: "저장" }).click();
    await toast(p, "저장했습니다.").waitFor();
    await p.goto(orderUrl);
    await p.getByRole("button", { name: "추천 품목 1개 담기" }).click();
    await toast(p, "추천 품목 1개를 담았습니다.").waitFor();
    // 10 × (5 + 14) − 50 = 140개
    await expect(p.getByLabel("컵 수량")).toHaveValue("140");
  });

  await test.step("6. 발주해 둔 양은 추천에서 뺀다", async () => {
    await p.getByRole("button", { name: /발주하기/ }).click();
    await p.getByText("발주했습니다.").waitFor();
    // 원두 1,300 + 입고 예정 2,000 > 1,000 + 200 × 5, 컵 50 + 140 > 10 × 5
    await p.goto("/orders/new");
    check("담을 추천 품목 없음", (await main(p)).includes("담을 추천 품목 없음"), await main(p));
    await p.goto(`/items/${bean}`);
    const detail = await main(p);
    check("품목 상세: 입고 예정, 발주할 때 아님", detail.includes("입고 예정 2봉") && !detail.includes("지금 발주할 때"), detail);
    await p.goto("/dashboard");
    const beanRow = await card(p).locator("li").filter({ hasText: "원두" }).innerText();
    check("대시보드: 입고 예정 표시, 발주할 때 없음", beanRow.includes("입고 예정 2봉") && !beanRow.includes("발주할 때"), beanRow);
    check("발주하기 링크 없음", (await card(p).getByRole("link", { name: "발주하기" }).count()) === 0);
  });
});
