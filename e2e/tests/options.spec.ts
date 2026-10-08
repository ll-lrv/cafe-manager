import type { Page } from "@playwright/test";
import { sql } from "../db";
import { expect, MOBILE, test } from "../fixtures";
import {
  addIngredient,
  check,
  createItem,
  createMenu,
  hasHorizontalScroll,
  idFromUrl,
  kstDate,
  main,
  recordStock,
  shot,
} from "../helpers";

async function createOption(p: Page, name: string, price: string) {
  await p.goto("/menus/options/new");
  await p.fill("#option-name", name);
  await p.fill("#option-price", price);
  await p.getByRole("button", { name: "옵션 만들기" }).click();
  await p.waitForURL(/\/menus\/options\/[0-9a-f-]{36}/);
  return idFromUrl(p.url());
}

/** 규칙을 넣고 규칙 목록에 shown 이 나타나기를 기다린다 */
async function addRule(
  p: Page,
  shown: string,
  rule: { kind: "add"; itemId: string; quantity: string } | { kind: "scale"; itemId: string; quantity: string } | { kind: "replace"; fromItemId: string; itemId: string },
) {
  await p.selectOption("#rule-kind", rule.kind);
  if (rule.kind === "replace") await p.selectOption("#rule-from-item", rule.fromItemId);
  await p.selectOption("#rule-item", rule.itemId);
  if (rule.kind !== "replace") await p.fill("#rule-quantity", rule.quantity);
  await p.getByRole("button", { name: "규칙 넣기" }).click();
  await expect(p.locator("main [data-slot=card]").first().locator("ul")).toContainText(shown);
}

async function upload(p: Page, name: string, content: string) {
  await p.goto("/sales/import");
  await p.getByLabel("판매 파일").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content, "utf8") });
  await p.getByText(`${name} ·`).waitFor();
}

/** 품목별 판매 차감 합계 (기본 단위) */
const soldOf = (itemId: string) =>
  Number(sql(`select coalesce(sum(quantity), 0) from stock_movements where item_id = '${itemId}' and type = 'sale'`));

test("메뉴 옵션 차감", async ({ app }) => {
  const owner = await app.owner({ storeName: `옵션테스트 ${app.stamp}` });
  const p = owner.page;

  // 원두 20원/g, 우유 2.5원/ml, 오트밀크 4원/ml, 컵 100원, 큰 컵 150원
  const bean = await createItem(p, { name: "원두", baseUnit: "g", unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });
  const oat = await createItem(p, { name: "오트밀크", baseUnit: "ml", unit: ["팩", 1000] });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
  const bigCup = await createItem(p, { name: "큰 컵", baseUnit: "ea" });
  await recordStock(p, { itemId: bean, quantity: 2, price: "20,000" });
  await recordStock(p, { itemId: milk, quantity: 5, price: "2,500" });
  await recordStock(p, { itemId: oat, quantity: 2, price: "4,000" });
  await recordStock(p, { itemId: cup, quantity: 50, price: "100" });
  await recordStock(p, { itemId: bigCup, quantity: 50, price: "150" });
  // 카페라떼 원가 360 + 500 + 100 = 960원
  await createMenu(p, "카페라떼", "4500");
  await addIngredient(p, bean, 18);
  await addIngredient(p, milk, 200);
  await addIngredient(p, cup, 1);
  await createMenu(p, "아메리카노", "4000");
  await addIngredient(p, bean, 18);
  await addIngredient(p, cup, 1);

  let shotId = "";
  await test.step("1. 옵션 만들기·재료 규칙", async () => {
    await p.goto("/menus");
    await p.getByRole("link", { name: "옵션", exact: true }).click();
    await p.waitForURL("**/menus/options");
    check("빈 목록 안내", (await main(p)).includes("아직 등록한 옵션이 없습니다."));

    shotId = await createOption(p, "샷 추가", "500");
    check("만든 직후 안내", (await main(p)).includes("아래에 재료 규칙을 넣어 주세요."));
    await addRule(p, "원두 +18g", { kind: "add", itemId: bean, quantity: "18" });
    const shotText = await main(p);
    check("규칙: 원두 +18g", shotText.includes("원두 +18g"), shotText);
    // 원두 18g × 20원 = +360원. 아메리카노도 바뀐다
    check("메뉴별 원가: 카페라떼 960원 → 1,320원 (+360원)", shotText.includes("원가 960원 → 1,320원") && shotText.includes("+360원"), shotText);
    check("아메리카노도", shotText.includes("아메리카노"), shotText);

    await createOption(p, "오트밀크 변경", "600");
    await addRule(p, "우유 → 오트밀크", { kind: "replace", fromItemId: milk, itemId: oat });
    const oatText = await main(p);
    check("규칙: 우유 → 오트밀크", oatText.includes("우유 → 오트밀크"), oatText);
    // 우유 500원 → 오트밀크 800원. 우유가 없는 아메리카노는 바뀌지 않는다
    check("카페라떼만 +300원", oatText.includes("원가 960원 → 1,260원") && !oatText.includes("아메리카노"), oatText);

    await createOption(p, "사이즈업", "1,000");
    await p.selectOption("#rule-kind", "scale");
    await p.selectOption("#rule-item", milk);
    await p.fill("#rule-quantity", "1");
    await p.getByRole("button", { name: "규칙 넣기" }).click();
    await expect(p.getByText("1배는 바뀌는 것이 없습니다.")).toBeVisible();
    check("오류 후 입력 유지", (await p.inputValue("#rule-quantity")) === "1");
    await addRule(p, "우유 ×1.5", { kind: "scale", itemId: milk, quantity: "1.5" });
    await addRule(p, "컵 → 큰 컵", { kind: "replace", fromItemId: cup, itemId: bigCup });
    const sizeText = await main(p);
    check("규칙: 우유 ×1.5, 컵 → 큰 컵", sizeText.includes("우유 ×1.5") && sizeText.includes("컵 → 큰 컵"), sizeText);

    await p.goto("/menus/options");
    const list = await main(p);
    check("목록: 금액과 규칙", list.includes("+1,000원") && list.includes("우유 ×1.5 · 컵 → 큰 컵"), list);
    await shot(p, "옵션 목록");
  });

  await test.step("2. 판매 입력에서 옵션 붙이기", async () => {
    await p.goto("/sales");
    await p.getByLabel("카페라떼 판매 수량", { exact: true }).fill("1");
    await p.getByRole("button", { name: "카페라떼 옵션 붙이기" }).click();
    const group = p.getByRole("group", { name: "카페라떼 옵션" });
    await group.getByLabel("사이즈업").check();
    await group.getByLabel("오트밀크 변경").check();
    await group.getByLabel("샷 추가").check();
    await group.getByRole("button", { name: "옵션 붙여 1개 더하기" }).click();
    const line = "카페라떼 + 사이즈업 + 샷 추가 + 오트밀크 변경";
    await p.getByRole("button", { name: `${line} 하나 더하기` }).click();
    check("옵션 줄 수량 2", (await p.getByLabel(`${line} 판매 수량`).inputValue()) === "2");
    // 옵션 줄 1개: 원두 36g, 오트밀크 300ml, 큰 컵 1개 / 금액 4,500 + 500 + 600 + 1,000 = 6,600원
    const preview = await p.locator("main [aria-live=polite]").filter({ hasText: "차감될 재료" }).innerText();
    check(
      "차감 미리보기",
      preview.includes("원두") && preview.includes("−90g") && preview.includes("−600ml") && preview.includes("−200ml"),
      preview,
    );
    await shot(p, "판매 옵션");
    await p.getByRole("button", { name: "판매 기록 · 3개 · 17,700원" }).click();
    await expect(p.getByText("판매 3개를 기록했습니다.")).toBeVisible();
    await expect(p.locator("main")).toContainText("13,200원"); // 판매 목록 갱신 대기
    const text = await main(p);
    check("판매 목록에 옵션 이름", text.includes(line) && text.includes("13,200원"), text);
    check("DB: 원두 −90g", soldOf(bean) === -90);
    check("DB: 우유 −200ml (옵션 없는 1잔만)", soldOf(milk) === -200);
    check("DB: 오트밀크 −600ml", soldOf(oat) === -600);
    check("DB: 컵 −1, 큰 컵 −2", soldOf(cup) === -1 && soldOf(bigCup) === -2);
  });

  await test.step("3. 메뉴 수익성 재료비에 옵션 반영", async () => {
    await p.goto("/reports/menus");
    // 재료비 960 + (720 + 1,200 + 150) × 2 = 5,100원, 매출 17,700원
    const text = await main(p);
    check("재료비 5,100원 · 마진 12,600원", text.includes("5,100원") && text.includes("12,600원"), text);
  });

  await test.step("4. 옵션 보관", async () => {
    await p.goto(`/menus/options/${shotId}`);
    await p.getByRole("button", { name: "보관" }).click();
    await expect(p.locator("main")).toContainText("보관됨");
    await p.goto("/sales");
    await p.getByRole("button", { name: "카페라떼 옵션 붙이기" }).click();
    const group = await p.getByRole("group", { name: "카페라떼 옵션" }).innerText();
    check("보관한 옵션은 판매 입력에서 숨김", !group.includes("샷 추가") && group.includes("사이즈업"), group);
    check("지난 판매에는 이름이 남음", (await main(p)).includes("카페라떼 + 사이즈업 + 샷 추가 + 오트밀크 변경"));
  });

  await test.step("5. 판매 취소: 옵션 재료도 되돌림", async () => {
    await p.getByRole("button", { name: "카페라떼 + 사이즈업 + 샷 추가 + 오트밀크 변경 판매 취소" }).click();
    await expect(p.getByText("판매를 취소했습니다.", { exact: false })).toBeVisible();
    await expect(p.locator("main")).not.toContainText("오트밀크 변경 2개");
    check("DB: 오트밀크·큰 컵 되돌림", soldOf(oat) === 0 && soldOf(bigCup) === 0);
    check("DB: 판매 옵션 함께 지워짐", sql(`select count(*) from sale_record_options where option_id = '${shotId}'`) === "0");
  });

  await test.step("6. 직원: 옵션 보기 전용, 판매에는 붙일 수 있음", async () => {
    const { page: s } = await app.joinByInvite(p);
    await s.goto("/menus/options");
    check("옵션 추가 버튼 없음", (await s.getByRole("link", { name: "옵션 추가" }).count()) === 0);
    await s.getByRole("link", { name: /사이즈업/ }).click();
    await s.waitForURL(/\/menus\/options\/[0-9a-f-]{36}/);
    check("규칙 입력 없음", (await s.locator("#rule-kind").count()) === 0);
    check("정보 칸 비활성", await s.locator("#option-name").isDisabled());
    await s.goto("/menus/options/new");
    check("주소로 들어와도 차단", (await main(s)).includes("옵션 추가는 사장과 매니저만 할 수 있습니다."));

    await s.goto("/sales");
    await s.getByRole("button", { name: "아메리카노 옵션 붙이기" }).click();
    await s.getByRole("group", { name: "아메리카노 옵션" }).getByLabel("사이즈업").check();
    await s.getByRole("button", { name: "옵션 붙여 1개 더하기" }).click();
    await s.getByRole("button", { name: /판매 기록 · 1개 · 5,000원/ }).click();
    await expect(s.getByText("판매 1개를 기록했습니다.")).toBeVisible();
    // 아메리카노에는 우유가 없어 늘리기는 아무것도 안 하고, 컵만 큰 컵으로
    check("DB: 큰 컵 −1, 컵 그대로", soldOf(bigCup) === -1 && soldOf(cup) === -1);
  });

  await test.step("7. 모바일", async () => {
    const { page: m } = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    await m.goto("/sales");
    await m.getByRole("button", { name: "카페라떼 옵션 붙이기" }).click();
    await m.getByRole("group", { name: "카페라떼 옵션" }).getByLabel("오트밀크 변경").check();
    await m.getByRole("button", { name: "옵션 붙여 1개 더하기" }).click();
    check("판매 가로 스크롤 없음", !(await hasHorizontalScroll(m)));
    await shot(m, "판매 옵션 모바일");
    await m.goto("/menus/options");
    await m.getByRole("link", { name: /사이즈업/ }).click();
    await m.waitForURL(/\/menus\/options\/[0-9a-f-]{36}/);
    check("옵션 상세 가로 스크롤 없음", !(await hasHorizontalScroll(m)));
    await shot(m, "옵션 상세 모바일");
  });

  await test.step("8. CSV 옵션 열: 옵션으로·메뉴 이름에 붙임·무시", async () => {
    const before = { bean: soldOf(bean), milk: soldOf(milk), oat: soldOf(oat), cup: soldOf(cup), bigCup: soldOf(bigCup) };
    const d = kstDate(-1);
    const csv = [
      "주문번호,판매일시,상품명,옵션,수량,실판매금액",
      `B1,${d} 10:00:00,카페라떼,"오트밀크 변경(+600원), ICE",2,"12,000"`,
      `B2,${d} 10:05:00,카페라떼,사이즈업,1,"5,500"`,
      `B3,${d} 10:10:00,카페라떼,휘핑,1,"4,500"`,
      `B4,${d} 10:20:00,카페라떼,사이즈업,-1,"-5,500"`,
    ].join("\n");
    await upload(p, "options.csv", csv);
    // 같은 이름의 옵션은 자동, 모르는 낱말은 "메뉴 이름에 붙임" (옵션 기능 전과 같은 동작)
    const value = (word: string) => p.getByLabel(`${word} 옵션`, { exact: true }).locator("option:checked").innerText();
    check("오트밀크 변경 → 옵션 자동", (await value("오트밀크 변경")) === "오트밀크 변경");
    check("사이즈업 → 옵션 자동", (await value("사이즈업")) === "사이즈업");
    check("ICE → 메뉴 이름에 붙임", (await value("ICE")) === "메뉴 이름에 붙임");
    check("휘핑 → 메뉴 이름에 붙임 (기본)", (await value("휘핑")) === "메뉴 이름에 붙임");
    check("휘핑 붙은 메뉴 이름이 메뉴 단계에", (await p.getByLabel("카페라떼 / 휘핑 메뉴").count()) === 1);
    await p.getByLabel("휘핑 옵션", { exact: true }).selectOption({ label: "무시" });
    check("무시하면 메뉴 단계에서 빠짐", (await p.getByLabel("카페라떼 / 휘핑 메뉴").count()) === 0);
    check("카페라떼 는 메뉴 이름으로 자동", (await p.getByLabel("카페라떼 메뉴", { exact: true }).locator("option:checked").innerText()) === "카페라떼");
    await p.getByLabel("카페라떼 / ICE 메뉴").selectOption({ label: "카페라떼" });
    await expect(p.locator("main")).toContainText("옵션 붙은 줄 3");
    await shot(p, "가져오기 옵션 맞추기");
    await p.getByRole("button", { name: "4줄 가져오기" }).click();
    await expect(p.locator("[data-sonner-toast]").filter({ hasText: "4건을 가져왔습니다." }).last()).toBeVisible();

    // B1 오트밀크 2잔: 원두 36·오트밀크 400·컵 2 / B2 사이즈업: 원두 18·우유 300·큰 컵 1 / B3 그대로: 원두 18·우유 200·컵 1 / B4 사이즈업 취소: 되돌림
    const delta = (id: string, key: keyof typeof before) => Math.round((soldOf(id) - before[key]) * 1000) / 1000;
    check("원두 −54g", delta(bean, "bean") === -54, delta(bean, "bean"));
    check("오트밀크 −400ml", delta(oat, "oat") === -400, delta(oat, "oat"));
    check("우유 −200ml (사이즈업 판매·취소 상계)", delta(milk, "milk") === -200, delta(milk, "milk"));
    check("컵 −3, 큰 컵 0", delta(cup, "cup") === -3 && delta(bigCup, "bigCup") === 0);
    check(
      "DB: 판매 옵션 3줄",
      sql(`select count(*) from sale_record_options so join sale_records r on r.id = so.sale_record_id where r.source = 'csv' and r.external_id like '%|B%'`) === "3",
    );

    await p.goto(`/sales?date=${d}`);
    const text = await main(p);
    check("판매 목록에 옵션 이름", text.includes("카페라떼 + 오트밀크 변경") && text.includes("카페라떼 + 사이즈업"), text);

    // 같은 파일 다시: 저장한 낱말 매칭(휘핑 무시)·메뉴 매칭이 자동, 이미 가져온 판매는 건너뜀
    await upload(p, "options.csv", csv);
    check("휘핑 무시 기억", (await value("휘핑")) === "무시");
    check("카페라떼 / ICE 기억", (await p.getByLabel("카페라떼 / ICE 메뉴").locator("option:checked").innerText()) === "카페라떼");
    await p.getByRole("button", { name: "4줄 가져오기" }).click();
    await expect(p.locator("[data-sonner-toast]").filter({ hasText: "모두 이미 가져왔습니다" }).last()).toBeVisible();
  });
});
