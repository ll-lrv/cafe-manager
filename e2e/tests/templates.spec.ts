import { sql } from "../db";
import { expect, test } from "../fixtures";
import { check, main, recordStock, shot, submitSales } from "../helpers";

const counts = (storeName: string) =>
  sql(`select (select count(*) from items i join stores s on s.id = i.store_id where s.name = '${storeName}')
     || '/' || (select count(*) from menus m join stores s on s.id = m.store_id where s.name = '${storeName}')
     || '/' || (select count(*) from categories c join stores s on s.id = c.store_id where s.name = '${storeName}')`);

test("카페 기본 템플릿", async ({ app }) => {
  const withTemplate = `템플릿테스트 ${app.stamp}`;
  const empty = `빈매장테스트 ${app.stamp}`;

  await test.step("1. 매장 만들 때 템플릿 넣기", async () => {
    const { page: p } = await app.owner({ storeName: withTemplate, template: true });
    check("품목 11·메뉴 10·카테고리 5", counts(withTemplate) === "11/10/5", counts(withTemplate));
    check("대시보드에 템플릿 버튼 없음 (품목 있음)", (await p.getByRole("button", { name: "기본 템플릿 불러오기" }).count()) === 0);

    await p.goto("/items");
    const items = await main(p);
    check("품목 목록: 원두·우유·빨대", ["원두", "우유", "빨대"].every((n) => items.includes(n)), items);
    check("카테고리 필터: 포장재", items.includes("포장재"));
    check("부족 기준 입고 단위 표시: 2 × 1kg 봉", items.includes("부족 기준 2 × 1kg 봉"), items);

    await p.goto("/menus");
    const menus = await main(p);
    check("메뉴: 아이스 바닐라라떼 5,500원", menus.includes("아이스 바닐라라떼") && menus.includes("5,500원"));
    check("레시피: 카페라떼 우유 200ml·원두 18g", /우유 200ml · 원두 18g · 핫컵 1개 · 핫컵 뚜껑 1개/.test(menus), menus);
    await shot(p, "템플릿 메뉴");

    await test.step("판매하면 레시피대로 빨대까지 차감", async () => {
      const straw = sql(`select i.id from items i join stores s on s.id = i.store_id where s.name = '${withTemplate}' and i.name = '빨대'`);
      await recordStock(p, { itemId: straw, quantity: 1, price: "5,000" });
      await p.goto("/sales");
      await p.getByLabel("아이스 아메리카노 판매 수량").fill("3");
      await submitSales(p);
      const left = sql(`select quantity from item_stock_levels where item_id = '${straw}'`);
      check("빨대 500 - 3 = 497", Number(left) === 497, left);
    });
  });

  await test.step("2. 빈 매장에서 대시보드로 불러오기", async () => {
    const { page: p } = await app.owner({ storeName: empty });
    check("템플릿 없이 만든 매장은 비어 있음", counts(empty) === "0/0/0", counts(empty));

    const { page: s } = await app.joinByInvite(p);
    await s.goto("/dashboard");
    check("직원에게는 템플릿 버튼 없음", (await s.getByRole("button", { name: "기본 템플릿 불러오기" }).count()) === 0);

    await p.goto("/dashboard");
    await p.getByRole("button", { name: "기본 템플릿 불러오기" }).click();
    await expect(p.getByText("품목 11개, 메뉴 10개를 불러왔습니다.")).toBeVisible();
    await expect(p.getByRole("button", { name: "기본 템플릿 불러오기" })).toHaveCount(0);
    check("불러온 뒤 품목 11·메뉴 10", counts(empty) === "11/10/5", counts(empty));
    await expect(p.locator("main")).toContainText("부족한 품목");
    await shot(p, "템플릿 불러온 대시보드");
  });
});
