import type { Page } from "@playwright/test";
import { sql } from "../db";
import { expect, test } from "../fixtures";
import { addIngredient, check, createItem, createMenu, kstDate, main, recordStock, submitSales } from "../helpers";

const stockOf = (itemId: string) => sql(`select quantity from item_stock_levels where item_id = '${itemId}'`);
/** 유통기한 순 로트별 남은 양 + 로트 없는 양. 예) "680,1000|0" */
const lotsOf = (itemId: string) =>
  sql(`select coalesce(string_agg(quantity::int::text, ',' order by expires_on), '') from lot_stock_levels where item_id = '${itemId}'`) +
  "|" +
  sql(`select coalesce(sum(quantity), 0)::int from stock_movements where item_id = '${itemId}' and lot_id is null`);
const toast = (p: Page, text: string) => p.locator("[data-sonner-toast]").filter({ hasText: text }).last();

async function sell(p: Page, date: string | null, quantity: number) {
  await p.goto(date ? `/sales?date=${date}` : "/sales");
  await p.getByLabel("라떼 판매 수량").fill(String(quantity));
  await submitSales(p);
}

test("실사 뒤에 기록·취소한 그 이전 판매는 재고를 바꾸지 않음", async ({ app }) => {
  const owner = await app.owner({ storeName: `실사보정테스트 ${app.stamp}` });
  const p = owner.page;
  let bean = "";

  await test.step("1. 준비: 원두 로트 두 개, 어제 판매 10잔, 실사(1,700g)", async () => {
    bean = await createItem(p, { name: "원두", baseUnit: "g", trackExpiry: true, unit: ["봉", 1000] });
    await recordStock(p, { itemId: bean, quantity: 1, expiresOn: kstDate(3) });
    await recordStock(p, { itemId: bean, quantity: 1, expiresOn: kstDate(10) });
    await createMenu(p, "라떼", "5000");
    await addIngredient(p, bean, 20);
    await sell(p, kstDate(-1), 10); // 어제 −200g (기한 빠른 로트에서)
    check("어제 판매 뒤 1,800g", stockOf(bean) === "1800.000", stockOf(bean));

    await p.goto("/counts");
    await p.getByRole("button", { name: "실사 시작" }).click();
    await p.waitForURL(/\/counts\/[0-9a-f-]{36}/);
    await p.getByLabel("원두 봉 수").fill("1");
    const loose = p.getByLabel(/^원두 낱개 \(/);
    await loose.fill("700");
    await p.locator("li", { has: loose }).getByRole("button", { name: "확인" }).click();
    await p.locator("li", { hasText: "원두" }).getByText("센 수량").waitFor();
    await p.getByRole("button", { name: "실사 완료 · 재고 반영" }).click();
    await p.getByText("1개 품목의 재고를 맞췄습니다.").waitFor();
    check("실사 뒤 1,700g, 로트 700·1000", stockOf(bean) === "1700.000" && lotsOf(bean) === "700,1000|0", lotsOf(bean));
  });

  await test.step("2. 실사 뒤에 그 이전 날짜 판매 → 재고·로트 그대로, 안내", async () => {
    await sell(p, kstDate(-2), 5);
    await expect(toast(p, "판매 5개를 기록했습니다.")).toContainText("재고는 빼지 않았습니다");
    check("판매는 기록, 재고 1,700g, 로트 그대로", stockOf(bean) === "1700.000" && lotsOf(bean) === "700,1000|0", `${stockOf(bean)} ${lotsOf(bean)}`);
    check(
      "상쇄 원장은 그 실사 조정",
      sql(`select count(*) from stock_movements where item_id = '${bean}' and type = 'adjust' and stock_count_id is not null and sale_record_id is not null`) === "1",
    );
    await p.goto(`/items/${bean}`);
    check("품목 기록에 실사 보정", (await main(p)).includes("실사 보정"));
  });

  await test.step("3. CSV 로 그 이전 판매 → 재고 그대로, 안내", async () => {
    const csv = ["일자,메뉴,판매수량", `${kstDate(-3)},라떼,5`, `${kstDate(-3)},라떼,-1`].join("\n");
    await p.goto("/sales/import");
    await p.getByLabel("판매 파일").setInputFiles({ name: "지난주.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await p.getByRole("button", { name: "2줄 가져오기" }).click();
    await expect(toast(p, "2건을 가져왔습니다.")).toContainText("이전 판매 2줄은 그 실사에서 센 품목의 재고를 빼지 않았습니다");
    check("판매·반품 줄 모두 재고 그대로", stockOf(bean) === "1700.000" && lotsOf(bean) === "700,1000|0", `${stockOf(bean)} ${lotsOf(bean)}`);
  });

  await test.step("4. 오늘 판매는 평소처럼 차감", async () => {
    await sell(p, null, 1);
    check("1,680g, 기한 빠른 로트에서", stockOf(bean) === "1680.000" && lotsOf(bean) === "680,1000|0", `${stockOf(bean)} ${lotsOf(bean)}`);
  });

  await test.step("5. 취소: 실사 장부에 있던 판매, 실사 뒤 판매, 가져오기 → 모두 재고 그대로", async () => {
    await p.goto(`/sales?date=${kstDate(-1)}`);
    await p.getByRole("button", { name: "라떼 판매 취소" }).click();
    await expect(toast(p, "판매를 취소했습니다.")).toContainText("재고는 되돌리지 않았습니다");
    check("실사 전 판매 취소: 1,680g, 로트 그대로", stockOf(bean) === "1680.000" && lotsOf(bean) === "680,1000|0", `${stockOf(bean)} ${lotsOf(bean)}`);

    await p.goto(`/sales?date=${kstDate(-2)}`);
    await p.getByRole("button", { name: "라떼 판매 취소" }).click();
    await toast(p, "판매를 취소했습니다.").waitFor();
    check("실사 뒤 기록한 판매 취소: 상쇄도 함께 지워져 그대로", stockOf(bean) === "1680.000" && lotsOf(bean) === "680,1000|0", `${stockOf(bean)} ${lotsOf(bean)}`);

    await p.goto("/sales/import");
    await p.getByRole("button", { name: "지난주.csv 가져오기 취소" }).click();
    await toast(p, "가져오기를 취소했습니다.").waitFor();
    check("가져오기 취소: 그대로", stockOf(bean) === "1680.000" && lotsOf(bean) === "680,1000|0", `${stockOf(bean)} ${lotsOf(bean)}`);
    check(
      "실사 조정 합계 = 원래 −100 + 실사 전 판매 취소 보정 −200",
      sql(`select sum(quantity)::int from stock_movements where item_id = '${bean}' and stock_count_id is not null`) === "-300",
    );
  });
});
