import { sql } from "../db";
import { expect, MOBILE, test } from "../fixtures";
import {
  addIngredient,
  appearsLive,
  check,
  createItem,
  createMenu,
  hasHorizontalScroll,
  kstDate,
  main,
  recordStock,
  shot,
  submitSales,
  waitForRealtime,
} from "../helpers";

const stockOf = (itemId: string) => sql(`select quantity from item_stock_levels where item_id = '${itemId}'`);

test("메뉴·레시피·판매 입력", async ({ app }) => {
  const owner = await app.owner({ storeName: `판매테스트 ${app.stamp}` });
  const p = owner.page;

  const bean = await createItem(p, { name: "원두", baseUnit: "g", trackExpiry: true, unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
  await recordStock(p, { itemId: bean, quantity: 1, price: "25,000", expiresOn: kstDate(5) });
  await recordStock(p, { itemId: milk, quantity: 2, price: "2,500" });
  await recordStock(p, { itemId: cup, quantity: 50, price: "100" });

  let americano = "";
  let latte = "";
  let cookie = "";

  await test.step("1. 메뉴·레시피", async () => {
    await p.getByRole("link", { name: "메뉴", exact: true }).click();
    await p.waitForURL("**/menus");
    check("메뉴 없음 안내", (await main(p)).includes("아직 등록한 메뉴가 없습니다."));
    americano = await createMenu(p, "아메리카노", "4,500");
    check("메뉴 만들기 → 상세 + 안내", (await main(p)).includes("메뉴를 만들었습니다."));
    await addIngredient(p, bean, 18);
    await addIngredient(p, cup, 1);
    let text = await main(p);
    check("원가 550원 · 원가율 12.2%", text.includes("550원") && text.includes("12.2%"), text.match(/원가[\s\S]{0,40}/)?.[0]);
    check("재료별 원가 표시 (원두 ≈ 450원)", text.includes("≈ 450원"));
    await p.getByRole("button", { name: "원두 사용량 수정" }).click();
    check(
      "수정 버튼 → 사용량 채움 + '사용량 바꾸기'",
      (await p.inputValue("#recipe-quantity")) === "18" &&
        (await p.getByRole("button", { name: "사용량 바꾸기" }).count()) === 1,
    );
    await p.fill("#recipe-quantity", "20");
    await p.getByRole("button", { name: "사용량 바꾸기" }).click();
    await expect(p.getByText("≈ 500원"), "사용량 변경 → 원두 20g (≈ 500원)").toBeVisible();
    await addIngredient(p, bean, 18);
    check("다시 18g 으로", (await main(p)).includes("≈ 450원"));
    await shot(p, "메뉴 상세");

    latte = await createMenu(p, "라떼", "5000");
    await addIngredient(p, bean, 18);
    await addIngredient(p, milk, 0.2, "팩");
    await addIngredient(p, cup, 1);
    text = await main(p);
    check(
      "단위로 입력 (0.2팩 → 200ml), 원가 1,050원 · 21%",
      text.includes("200ml") && text.includes("1,050원") && text.includes("21%"),
    );
    await p.getByRole("button", { name: "컵 빼기" }).click();
    await p.waitForFunction(() => !document.querySelector("main")!.innerText.includes("≈ 100원"));
    await expect(p.getByText("재료를 뺐습니다.")).toBeVisible();
    await addIngredient(p, cup, 1);

    cookie = await createMenu(p, "쿠키", "3000");
    await p.goto("/menus/new");
    await p.fill("#menu-name", "라떼");
    await p.fill("#menu-price", "5500");
    await p.getByRole("button", { name: "메뉴 만들기" }).click();
    await p.getByText("같은 이름의 메뉴가 이미 있습니다.").waitFor();
    check("중복 메뉴 이름 안내 + 입력 유지", (await p.inputValue("#menu-price")) === "5500");

    await p.goto("/menus");
    text = await main(p);
    check(
      "메뉴 목록: 가격·원가·레시피 없음",
      text.includes("4,500원") && text.includes("원가 550원 · 12.2%") && text.includes("레시피 없음"),
    );
    await shot(p, "메뉴 목록");
  });

  await test.step("2. 판매 입력", async () => {
    await p.getByRole("link", { name: "판매", exact: true }).click();
    await p.waitForURL("**/sales");
    for (let i = 0; i < 3; i++) await p.getByRole("button", { name: "아메리카노 하나 더하기" }).click();
    await p.getByLabel("라떼 판매 수량").fill("2");
    const preview = await p.locator('main [aria-live="polite"]').innerText();
    check(
      "차감 미리보기: 원두 −90g, 우유 −400ml, 컵 −5개",
      preview.includes("−90g") && preview.includes("−400ml") && preview.includes("−5개"),
      preview.replace(/\n/g, " / "),
    );
    check(
      "버튼에 합계 5개 · 23,500원",
      (await p.getByRole("button", { name: /판매 기록 ·/ }).innerText()).includes("5개 · 23,500원"),
    );
    await shot(p, "판매 입력");
    await submitSales(p);
    const text = await main(p);
    check("오늘 매출 23,500원 · 5개", text.includes("23,500원") && text.includes("5개 판매"));
    check("판매 기록 목록", text.includes("아메리카노") && text.includes("13,500원") && text.includes("10,000원"));
    check(
      "재고 차감: 원두 910, 우유 1600, 컵 45",
      stockOf(bean) === "910.000" && stockOf(milk) === "1600.000" && stockOf(cup) === "45.000",
      `${stockOf(bean)}, ${stockOf(milk)}, ${stockOf(cup)}`,
    );
    const lotSale = sql(
      `select count(*) from stock_movements where item_id = '${bean}' and type = 'sale' and lot_id is not null`,
    );
    check("원두 판매 차감은 로트에서", lotSale === "2", lotSale);
    await shot(p, "판매 기록 후");

    await p.goto("/stock");
    check("입출고 기록에 판매 차감 표시", (await main(p)).includes("판매: 아메리카노 3개"));
  });

  await test.step("3. 지난 날짜 입력", async () => {
    await p.goto("/sales");
    await p.getByRole("link", { name: "전날" }).click();
    await p.waitForURL(`**/sales?date=${kstDate(-1)}`);
    const text = await main(p);
    check("전날 화면: 판매 없음 + 마감 시각 안내", text.includes("이 날 판매 기록이 없습니다.") && text.includes("마감 시각"));
    await p.getByRole("button", { name: "쿠키 하나 더하기" }).click();
    check("레시피 없는 메뉴 안내", (await main(p)).includes("레시피가 없어 재료가 차감되지 않습니다"));
    await submitSales(p);
    check("전날 매출 3,000원", (await main(p)).includes("3,000원"));
    const soldAt = sql(
      `select to_char(sold_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') from sale_records where menu_id = '${cookie}'`,
    );
    check("전날 마감 시각으로 기록", soldAt === `${kstDate(-1)} 23:59`, soldAt);
    await p.getByRole("link", { name: "오늘" }).click();
    await p.waitForURL("**/sales");
    check("오늘 매출에는 영향 없음", (await main(p)).includes("23,500원"));
  });

  await test.step("4. 판매 취소 (사장)", async () => {
    await p.getByRole("button", { name: "아메리카노 판매 취소" }).click();
    await p.getByText("판매를 취소했습니다.").waitFor();
    // 알림이 화면 갱신보다 조금 먼저 뜰 수 있다.
    await expect(p.locator("main")).not.toContainText("23,500원");
    check(
      "취소 → 매출 10,000원, 원두 964g, 컵 48개",
      (await main(p)).includes("10,000원") && stockOf(bean) === "964.000" && stockOf(cup) === "48.000",
      `${stockOf(bean)}, ${stockOf(cup)}`,
    );
  });

  const staff = await app.joinByInvite(p, { viewport: MOBILE });
  const s = staff.page;

  await test.step("5. 직원 권한과 실시간 매출", async () => {
    await s.goto("/menus");
    check("직원: 메뉴 추가 버튼 없음", (await s.getByRole("link", { name: "메뉴 추가" }).count()) === 0);
    await s.goto(`/menus/${latte}`);
    check(
      "직원: 메뉴 상세 보기 전용",
      (await s.isDisabled("#menu-name")) && (await s.getByRole("button", { name: /재료 넣기|라떼|빼기/ }).count()) === 0,
    );

    // 사장이 판매 화면을 보는 중에 직원이 판매 기록
    await p.goto("/sales");
    await waitForRealtime(p);
    await s.goto("/sales");
    check("직원: 판매 취소 버튼 없음", (await s.getByRole("button", { name: /판매 취소/ }).count()) === 0);
    await s.getByRole("button", { name: "라떼 하나 더하기" }).click();
    await submitSales(s);
    check("실시간: 직원 판매가 사장 화면 매출에 반영", await appearsLive(p, "15,000원"));
    check("직원 이름 표시", (await main(p)).includes("이직원"));
    await shot(s, "휴대폰 판매");
  });

  await test.step("6. 대시보드", async () => {
    await p.goto("/dashboard");
    const text = await main(p);
    check("대시보드 오늘 매출 15,000원 · 3개", text.includes("15,000원") && text.includes("3개 판매"));
    check("곧 추가될 기능에서 메뉴·판매 빠짐", !text.includes("레시피 등록, 판매 입력 시"));
  });

  await test.step("7. 메뉴 보관 → 판매 입력에서 빠짐", async () => {
    await p.goto(`/menus/${cookie}`);
    await p.getByRole("button", { name: "보관" }).click();
    await p.getByRole("button", { name: "다시 판매" }).waitFor();
    await p.goto("/sales");
    check("보관 메뉴는 판매 입력에서 제외", (await p.getByLabel("쿠키 판매 수량").count()) === 0);
  });

  await test.step("8. 휴대폰", async () => {
    for (const path of ["/sales", "/menus", `/menus/${americano}`, "/dashboard"]) {
      await s.goto(path);
      check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 12)}`, !(await hasHorizontalScroll(s)));
    }
  });
});
