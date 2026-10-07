import { sql } from "../db";
import { expect, MOBILE, test } from "../fixtures";
import { check, createMenu, hasHorizontalScroll, main, shot, submitSales, zonedDate } from "../helpers";

// 한국보다 19시간 늦어 "오늘"이 한국과 거의 항상 다르다.
const HONOLULU = "Pacific/Honolulu";

test("매장 설정 (이름·시간대)", async ({ app }) => {
  const owner = await app.owner({ storeName: `설정테스트 ${app.stamp}` });
  const p = owner.page;
  const newName = `호놀룰루점 ${app.stamp}`;
  let storeId = "";

  await test.step("1. 매장 설정 화면", async () => {
    await p.locator("header").getByRole("link", { name: "매장 설정" }).click();
    await p.waitForURL("**/settings/store");
    check("저장된 이름 표시", (await p.inputValue("#store-name")) === `설정테스트 ${app.stamp}`);
    check("기본 시간대 Asia/Seoul", (await p.inputValue("#store-timezone")) === "Asia/Seoul");
    storeId = sql(`select id from stores where name = '설정테스트 ${app.stamp}'`);
  });

  await test.step("2. 공백 이름 거부 + 입력값 유지", async () => {
    await p.fill("#store-name", "   ");
    await p.selectOption("#store-timezone", HONOLULU);
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await expect(p.getByText("매장 이름을 입력해 주세요.")).toBeVisible();
    check("오류 후 시간대 선택 유지", (await p.inputValue("#store-timezone")) === HONOLULU);
  });

  await test.step("3. 이름·시간대 저장", async () => {
    await p.fill("#store-name", `  ${newName}  `);
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await expect(p.getByText("매장 정보를 저장했습니다.")).toBeVisible();
    await expect(p.locator("header")).toContainText(newName);
    check(
      "DB: 이름(앞뒤 공백 제거)·시간대 저장",
      sql(`select name || '|' || timezone from stores where id = '${storeId}'`) === `${newName}|${HONOLULU}`,
    );
    await p.reload();
    check("다시 열어도 저장된 값", (await p.inputValue("#store-name")) === newName && (await p.inputValue("#store-timezone")) === HONOLULU);
    await shot(p, "매장 설정");
  });

  await test.step("4. 판매 화면의 '오늘'과 지난 날짜 마감 시각이 매장 시간대를 따른다", async () => {
    const menuId = await createMenu(p, "쿠키", "3000");
    const yesterday = zonedDate(HONOLULU, -1);
    await p.goto("/sales");
    check(
      "전날 링크 = 호놀룰루 기준 어제",
      (await p.getByRole("link", { name: "전날" }).getAttribute("href"))?.endsWith(`date=${yesterday}`) ?? false,
      await p.getByRole("link", { name: "전날" }).getAttribute("href"),
    );
    await p.getByRole("link", { name: "전날" }).click();
    await p.waitForURL(`**/sales?date=${yesterday}`);
    await p.getByRole("button", { name: "쿠키 하나 더하기" }).click();
    await submitSales(p);
    const soldAt = sql(
      `select to_char(sold_at at time zone '${HONOLULU}', 'YYYY-MM-DD HH24:MI') from sale_records where menu_id = '${menuId}'`,
    );
    check("호놀룰루 기준 그 날 23:59 로 기록", soldAt === `${yesterday} 23:59`, soldAt);
    check("그 날 매출에 포함", (await main(p)).includes("3,000원"));
  });

  await test.step("5. DB가 잘못된 시간대·직접 수정을 막는다", async () => {
    check("트리거: 없는 시간대 거부", sql(`update stores set timezone = 'Seoul' where id = '${storeId}'`).includes("지원하지 않는 시간대"));
  });

  await test.step("6. 직원은 매장 설정 없음", async () => {
    const { page: s } = await app.joinByInvite(p);
    check("직원: 매장 설정 메뉴 없음", (await s.locator("header").getByRole("link", { name: "매장 설정" }).count()) === 0);
    await s.goto("/settings/store");
    check("직원: 주소로 들어와도 차단", (await main(s)).includes("사장만"));
  });

  await test.step("7. 휴대폰", async () => {
    const { page: mp } = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    await mp.goto("/settings/store");
    check("휴대폰 가로 스크롤 없음", !(await hasHorizontalScroll(mp)));
    await shot(mp, "휴대폰 매장 설정");
  });
});
