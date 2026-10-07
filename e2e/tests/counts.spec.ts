import type { Page } from "@playwright/test";
import { sql } from "../db";
import { expect, MOBILE, test } from "../fixtures";
import {
  addCategory,
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

/** 실사 화면에서 품목 하나를 센다. packs 가 있으면 묶음 칸에도 입력 */
async function count(page: Page, name: string, { packs, loose, packName }: { packs?: number; loose?: number; packName?: string }) {
  if (packs !== undefined) await page.getByLabel(`${name} ${packName} 수`).fill(String(packs));
  const looseInput = page.getByLabel(new RegExp(`^${name} (낱개|수량) \\(`));
  await looseInput.fill(String(loose ?? 0));
  await page.locator("li", { has: looseInput }).getByRole("button", { name: "확인" }).click();
  await page.locator("li", { hasText: name }).getByText("센 수량").waitFor();
}
const row = (page: Page, name: string) =>
  page.locator("main li").filter({ has: page.locator(`span.font-medium:text-is("${name}")`) });

test("재고 실사", async ({ app }) => {
  const owner = await app.owner({ storeName: `실사테스트 ${app.stamp}` });
  const p = owner.page;

  await addCategory(p, "원두류");
  await addCategory(p, "유제품");
  const bean = await createItem(p, { name: "원두", baseUnit: "g", category: "원두류", trackExpiry: true, unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", category: "유제품", unit: ["팩", 1000] });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
  await recordStock(p, { itemId: bean, quantity: 2, expiresOn: kstDate(5) });
  await recordStock(p, { itemId: milk, quantity: 3 });
  await recordStock(p, { itemId: cup, quantity: 100 });
  // 센 뒤의 판매를 만들 메뉴
  await createMenu(p, "아메리카노", "4500");
  await addIngredient(p, bean, 18);
  await addIngredient(p, cup, 1);

  let countUrl = "";

  await test.step("1. 실사 시작", async () => {
    await p.getByRole("link", { name: "실사", exact: true }).click();
    await p.waitForURL("**/counts");
    check("지난 실사 없음 안내", (await main(p)).includes("아직 끝난 실사가 없습니다."));
    await p.fill("#count-memo", "월말 실사");
    await p.getByRole("button", { name: "실사 시작" }).click();
    await p.waitForURL(/\/counts\/[0-9a-f-]{36}/);
    countUrl = new URL(p.url()).pathname;
    const text = await main(p);
    check("시작 → 0/3개 셈, 장부 표시", text.includes("0/3개 셈") && text.includes("장부 2봉") && text.includes("장부 3팩"));
  });

  await test.step("2. 사장이 원두를 셈: 1봉 + 900g (장부 2,000g → −100g)", async () => {
    await count(p, "원두", { packs: 1, loose: 900, packName: "봉" });
    const text = await row(p, "원두").innerText();
    check(
      "원두 1봉 + 900g, 차이 −100g",
      text.includes("센 수량 1봉 + 900g") && text.includes("−100g"),
      text.replace(/\n/g, " / "),
    );
    check("센 사람 표시", text.includes("김사장"));
  });

  const staff = await app.joinByInvite(p, { viewport: MOBILE });
  const s = staff.page;

  await test.step("3. 직원이 같은 실사에서 우유를 셈 → 사장 화면에 실시간 반영", async () => {
    check("대시보드에 진행 중인 실사", (await main(s)).includes("재고 실사 진행 중") && (await main(s)).includes("1/3개 셈"));
    await p.goto(countUrl);
    await waitForRealtime(p);
    await s.goto(countUrl);
    check(
      "직원: 완료 버튼 없음 + 요청 안내",
      (await s.getByRole("button", { name: /실사 완료/ }).count()) === 0 && (await main(s)).includes("사장이나 매니저에게"),
    );
    await count(s, "우유", { packs: 3, loose: 50, packName: "팩" });
    check("실시간: 직원이 센 수량이 사장 화면에 반영", await appearsLive(p, "2/3개 셈"));
    check("우유 +50ml", (await row(p, "우유").innerText()).includes("+50ml"));
  });

  await test.step("4. 센 뒤에 판매 (원두 −36g, 컵 −2) → 원두 차이는 그대로 −100g", async () => {
    await s.goto("/sales");
    await s.getByRole("button", { name: "아메리카노 하나 더하기" }).click();
    await s.getByRole("button", { name: "아메리카노 하나 더하기" }).click();
    await submitSales(s);
    await p.goto(countUrl);
    const text = await row(p, "원두").innerText();
    check(
      "센 뒤 판매가 있어도 차이 −100g 유지 (센 시각 장부 2봉)",
      text.includes("−100g") && text.includes("장부 2봉 (센 시각 기준)"),
      text.replace(/\n/g, " / "),
    );
  });

  await test.step("5. 필터", async () => {
    await p.getByRole("button", { name: /안 센 것/ }).click();
    let text = await main(p);
    check("안 센 것 → 컵만", text.includes("컵") && !text.includes("센 수량 1봉"));
    await p.getByRole("button", { name: /차이 있음/ }).click();
    text = await main(p);
    check(
      "차이 있음 → 원두, 우유",
      text.includes("센 수량 1봉 + 900g") && text.includes("센 수량 3팩 + 50ml") && !text.includes("장부 100개"),
    );
    await p.getByRole("button", { name: /^전체/ }).click();
  });

  await test.step("6. 다시 세기·지우기", async () => {
    await row(p, "우유").getByRole("button", { name: "다시 세기" }).click();
    await count(p, "우유", { packs: 3, loose: 0, packName: "팩" });
    await row(p, "우유").getByText("일치").waitFor();
    await count(p, "컵", { loose: 100 });
    await p.getByRole("button", { name: "컵 센 수량 지우기" }).click();
    await p.getByText("센 수량을 지웠습니다.").waitFor();
    check("지우기 → 컵 다시 안 셈", await appearsLive(p, "2/3개 셈"));
    await shot(p, "실사 세는 중");
  });

  await test.step("7. 두 번째 실사는 시작할 수 없음", async () => {
    await p.goto("/counts");
    const text = await main(p);
    check("진행 중이면 새 실사 대신 이어서 세기", text.includes("이어서 세기") && !text.includes("새 실사"));
  });

  await test.step("8. 완료", async () => {
    await p.goto(countUrl);
    await p.getByRole("button", { name: "실사 완료 · 재고 반영" }).click();
    await p.getByText("1개 품목의 재고를 맞췄습니다.").waitFor();
    // 알림이 화면 갱신보다 조금 먼저 뜰 수 있다.
    await expect(p.locator("main")).toContainText("결과 · 1개 품목 조정");
    check(
      "재고: 원두 1,864g (2,000−36−100), 우유 3,000, 컵 98",
      stockOf(bean) === "1864.000" && stockOf(milk) === "3000.000" && stockOf(cup) === "98.000",
      `${stockOf(bean)}, ${stockOf(milk)}, ${stockOf(cup)}`,
    );
    const text = await main(p);
    check(
      "결과 화면: 원두 −100g 조정, 우유 일치, 컵 세지 않음",
      text.includes("결과 · 1개 품목 조정") &&
        text.includes("−100g 조정") &&
        text.includes("일치") &&
        text.includes("세지 않은 품목 1개: 컵"),
    );
    await shot(p, "실사 결과");
    await p.goto(`/stock?item=${bean}`);
    check("입출고 기록에 실사 조정 표시", (await main(p)).includes("재고 실사"));
  });

  await test.step("9. 취소", async () => {
    await p.goto("/counts");
    await p.getByRole("button", { name: "실사 시작" }).click();
    await p.waitForURL(/\/counts\/[0-9a-f-]{36}/);
    await count(p, "컵", { loose: 1 });
    await p.getByRole("button", { name: "실사 취소" }).click();
    await p.getByText("실사를 취소했습니다.").waitFor();
    // 알림이 화면 갱신보다 조금 먼저 뜰 수 있다.
    await p.getByText("취소된 실사").waitFor({ timeout: 5000 }).catch(() => {});
    check("취소 → 재고 그대로 (컵 98)", stockOf(cup) === "98.000" && (await main(p)).includes("취소된 실사"));
  });

  await test.step("10. 카테고리만 실사", async () => {
    await p.goto("/counts");
    await p.selectOption("#count-category", { label: "유제품만" });
    await p.getByRole("button", { name: "실사 시작" }).click();
    await p.waitForURL(/\/counts\/[0-9a-f-]{36}/);
    let text = await main(p);
    check("유제품만 → 우유 1개", text.includes("유제품 실사") && text.includes("0/1개 셈") && !text.includes("원두"));
    await p.goto("/counts");
    text = await main(p);
    check("지난 실사 목록: 완료·취소", text.includes("완료") && text.includes("취소") && text.includes("1개 조정"));
    await shot(p, "실사 목록");
  });

  await test.step("11. 휴대폰", async () => {
    for (const path of ["/counts", countUrl]) {
      await s.goto(path);
      check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 10)}`, !(await hasHorizontalScroll(s)));
    }
    await s.goto("/counts");
    await s.getByRole("link", { name: "이어서 세기" }).click();
    await s.waitForURL(/\/counts\/[0-9a-f-]{36}/);
    await shot(s, "휴대폰 실사");
  });
});
