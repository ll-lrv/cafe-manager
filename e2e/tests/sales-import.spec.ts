import type { Page } from "@playwright/test";
import { sql } from "../db";
import { expect, MOBILE, test } from "../fixtures";
import { addIngredient, check, createItem, createMenu, hasHorizontalScroll, kstDate, main, recordStock, shot } from "../helpers";

const stockOf = (itemId: string) =>
  Number(sql(`select coalesce((select quantity from item_stock_levels where item_id = '${itemId}'), 0)`));

async function upload(p: Page, name: string, content: string) {
  await p.goto("/sales/import");
  await p.getByLabel("판매 파일").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content, "utf8") });
  await p.getByText(`${name} ·`).waitFor();
}

const toast = (p: Page, text: string) => p.locator("[data-sonner-toast]").filter({ hasText: text }).last();

test("CSV 판매 가져오기", async ({ app }) => {
  const owner = await app.owner({ storeName: `가져오기테스트 ${app.stamp}` });
  const p = owner.page;
  const d1 = kstDate(-2);
  const d2 = kstDate(-1);
  // 토스 포스 "상품 주문" 시트 모양 + 맨 위 제목 줄, 취소 줄, 합계 줄
  const csv = [
    "매출 리포트,,,,,,",
    "주문번호,판매일시,상품명,옵션,수량,상품가격,실판매금액",
    `A1,${d1} 09:10:00,아메리카노,,2,4500,"9,000"`,
    `A1,${d1} 09:10:00,카페 라떼,ICE,1,5000,"4,500"`,
    `A2,${d1} 10:00:00,쿠폰,,1,0,0`,
    `A3,${d2} 11:00:00,카페 라떼,ICE,1,5000,"5,000"`,
    `A4,${d2} 12:00:00,아메리카노,,-1,4500,"-4,500"`,
    "합계,,,,,,",
  ].join("\r\n");

  const beans = await createItem(p, { name: "원두", baseUnit: "g" });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml" });
  await recordStock(p, { itemId: beans, quantity: 1000 });
  await recordStock(p, { itemId: milk, quantity: 1000 });
  await createMenu(p, "아메리카노", "4500");
  await addIngredient(p, beans, 18);
  await createMenu(p, "카페라떼", "5000");
  await addIngredient(p, beans, 18);
  await addIngredient(p, milk, 200);

  await test.step("1. 파일 읽기: 제목 줄 건너뛰고 열 자동 선택", async () => {
    await p.goto("/sales");
    await p.getByRole("link", { name: "CSV 가져오기" }).click();
    await p.waitForURL("**/sales/import");
    await upload(p, "토스매출.csv", csv);
    const selected = async (id: string) => (await p.locator(`#${id} option:checked`).innerText()).trim();
    check("날짜 = 판매일시", (await selected("col-date")) === "판매일시");
    check("메뉴 = 상품명, 옵션 = 옵션", (await selected("col-menu")) === "상품명" && (await selected("col-option")) === "옵션");
    check("금액 = 실판매금액 (상품가격 아님)", (await selected("col-amount")) === "실판매금액");
    check("주문번호", (await selected("col-orderNo")) === "주문번호");
    const text = await main(p);
    check("4줄 읽음, 2줄 안 읽음 (취소·합계)", text.includes("판매 4줄을 읽었습니다. 읽지 않은 줄 2개."), text);
    await p.getByText("읽지 않은 줄 보기").click();
    const issues = await main(p);
    check("취소·합계 줄 안내", issues.includes("7번째 줄: 수량이 0 이하 (취소·반품)") && issues.includes("8번째 줄: 합계 줄"), issues);
  });

  await test.step("2. 메뉴 맞추기", async () => {
    const rowOf = (name: string) => p.locator("main li").filter({ has: p.getByLabel(`${name} 메뉴`) });
    check("같은 이름은 자동", (await rowOf("아메리카노").innerText()).includes("자동으로 맞춤"));
    check("옵션이 붙은 이름은 직접", (await p.getByLabel("카페 라떼 / ICE 메뉴").inputValue()) === "");
    check("못 맞춘 이름이 있으면 가져오기 막힘", await p.getByRole("button", { name: /가져오기$/ }).isDisabled());
    await p.getByLabel("카페 라떼 / ICE 메뉴").selectOption({ label: "카페라떼" });
    await p.getByLabel("쿠폰 메뉴").selectOption({ label: "가져오지 않음" });
    // 아메리카노 2잔 9,000 + 라떼 4,500(할인) + 라떼 5,000
    await expect(p.locator("main")).toContainText("판매 3줄 · 4개 · 18,500원");
    await shot(p, "가져오기 메뉴 맞추기");
  });

  await test.step("3. 가져오기 → 재료 차감, 판매 화면", async () => {
    await p.getByRole("button", { name: "판매 3줄 가져오기" }).click();
    await toast(p, "판매 3건을 가져왔습니다.").waitFor();
    check("원두 1000 − 18×4 = 928g", stockOf(beans) === 928, stockOf(beans));
    check("우유 1000 − 200×2 = 600ml", stockOf(milk) === 600, stockOf(milk));
    await expect(p.locator("main")).toContainText("3건 · 4개 · 18,500원");
    await p.goto(`/sales?date=${d1}`);
    const text = await main(p);
    check("그 날 매출 13,500원, CSV 표시", text.includes("13,500원") && text.includes("CSV"), text);
    check("시각 09:10", text.includes("09:10"), text);
  });

  await test.step("4. 같은 파일 다시: 매칭 기억, 중복 없음", async () => {
    await upload(p, "토스매출.csv", csv);
    check("저장한 매칭으로 자동", (await p.getByLabel("카페 라떼 / ICE 메뉴").locator("option:checked").innerText()) === "카페라떼");
    check("가져오지 않음도 기억", (await p.getByLabel("쿠폰 메뉴").locator("option:checked").innerText()) === "가져오지 않음");
    await p.getByRole("button", { name: "판매 3줄 가져오기" }).click();
    await toast(p, "이 파일의 판매는 모두 이미 가져왔습니다.").waitFor();
    check("재고 그대로", stockOf(beans) === 928, stockOf(beans));
    await expect(p.locator("main li").filter({ hasText: "토스매출.csv" })).toHaveCount(1);
  });

  await test.step("5. 겹치는 기간 파일: 새 줄만", async () => {
    const more = ["일자,메뉴,판매수량", `${d2},아메리카노,3`, `${kstDate(0)},카페라떼,1`, `${kstDate(1)},카페라떼,1`].join("\n");
    await upload(p, "추가.csv", more);
    check("미래 날짜는 빼고", (await main(p)).includes("미래 날짜 1줄은 빼고 가져옵니다."));
    // 금액 열이 없으면 메뉴 가격 × 수량
    await expect(p.locator("main")).toContainText("판매 2줄 · 4개 · 18,500원");
    await p.getByRole("button", { name: "판매 2줄 가져오기" }).click();
    await toast(p, "판매 2건을 가져왔습니다.").waitFor();
    check("원두 928 − 18×4 = 856g", stockOf(beans) === 856, stockOf(beans));
  });

  await test.step("6. 가져오기 취소 → 판매·재료 되돌림", async () => {
    await p.getByRole("button", { name: "토스매출.csv 가져오기 취소" }).click();
    await toast(p, "가져오기를 취소했습니다.").waitFor();
    await expect(p.locator("main li").filter({ hasText: "토스매출.csv" })).toHaveCount(0);
    check("원두 856 + 72 = 928g", stockOf(beans) === 928, stockOf(beans));
    check("우유: 추가.csv 의 라떼 1잔만 남음 → 800ml", stockOf(milk) === 800, stockOf(milk));
  });

  await test.step("7. 직원은 가져올 수 없음", async () => {
    const { page: s } = await app.joinByInvite(p);
    await s.goto("/sales");
    check("가져오기 버튼 없음", (await s.getByRole("link", { name: "CSV 가져오기" }).count()) === 0);
    await s.goto("/sales/import");
    check("주소로 들어와도 차단", (await main(s)).includes("판매 가져오기는 사장과 매니저만 할 수 있습니다."));
  });

  await test.step("8. 모바일", async () => {
    const { page: m } = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    await upload(m, "토스매출.csv", csv);
    check("가로 스크롤 없음", !(await hasHorizontalScroll(m)));
    await shot(m, "가져오기 모바일");
  });
});
