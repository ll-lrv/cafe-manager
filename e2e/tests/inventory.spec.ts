import type { Page } from "@playwright/test";
import { MOBILE, test } from "../fixtures";
import {
  appearsLive,
  check,
  createItem,
  hasHorizontalScroll,
  kstDate,
  main,
  recordStock,
  shot,
  waitForRealtime,
} from "../helpers";

const list = (page: Page) => page.locator("main ul").first().innerText();

test("재고 현황·대시보드·실시간 반영", async ({ app }) => {
  const owner = await app.owner({ storeName: `재고현황 ${app.stamp}` });
  const p = owner.page;
  check("품목 없으면 대시보드에 등록 안내", (await main(p)).includes("품목을 등록해 주세요"));

  const bean = await createItem(p, { name: "원두", baseUnit: "g", trackExpiry: true, minStock: "2000", unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });
  await createItem(p, { name: "컵", baseUnit: "ea", minStock: "100" });

  await recordStock(p, { itemId: bean, quantity: 1, expiresOn: kstDate(2) });
  await recordStock(p, { itemId: bean, quantity: 1, expiresOn: kstDate(-1) });
  await recordStock(p, { itemId: milk, quantity: 3 });

  await test.step("1. 대시보드", async () => {
    await p.goto("/dashboard");
    const dash = await main(p);
    check(
      "대시보드: 부족한 품목 2개 (원두 부족, 컵 없음)",
      dash.includes("부족한 품목 2개") && dash.includes("재고 없음") && dash.includes("부족"),
    );
    check("대시보드: 현재/기준 표시 (2봉 / 2봉)", dash.includes("2봉 / 2봉"));
    check(
      "대시보드: 유통기한 확인 2건 (D-2, 1일 지남)",
      dash.includes("유통기한 확인 2건") && dash.includes("D-2") && dash.includes("1일 지남"),
    );
    check("대시보드: 최근 기록", dash.includes("+3팩 (3,000ml)"));
    check("대시보드: 곧 추가될 기능에서 품목·재고 빠짐", !dash.includes("품목 등록, 입고·사용·폐기 기록"));
    await shot(p, "대시보드");
  });

  await test.step("2. 품목·재고 목록", async () => {
    await p.getByRole("link", { name: "품목·재고", exact: true }).click();
    await p.waitForURL("**/items");
    let text = await list(p);
    check(
      "목록에 현재 재고 (원두 2봉, 우유 3팩, 컵 0개)",
      text.includes("2봉") && text.includes("3팩") && text.includes("0개"),
      text.replace(/\n/g, " / "),
    );
    check("목록에 유통기한 배지 (가장 빠른 = 지남)", text.includes("유통기한 1일 지남"));
    const statusText = await p.getByRole("group", { name: "재고 상태" }).innerText();
    check(
      "상태 칩 개수 (부족·없음 2, 유통기한 1)",
      statusText.includes("부족·없음 2") && statusText.includes("유통기한 확인 1"),
      statusText.replace(/\n/g, " "),
    );
    await p.getByRole("button", { name: /부족·없음/ }).click();
    text = await list(p);
    check("부족·없음 필터 → 원두, 컵", text.includes("원두") && text.includes("컵") && !text.includes("우유"));
    await p.getByRole("button", { name: /유통기한 확인/ }).click();
    text = await list(p);
    check("유통기한 필터 → 원두만", text.includes("원두") && !text.includes("컵"));
    await shot(p, "품목 목록");
    await p.goto("/items?status=low");
    check("주소로 상태 필터 (?status=low)", !(await list(p)).includes("우유"));
  });

  await test.step("3. 품목 상세 로트", async () => {
    await p.goto(`/items/${bean}`);
    const detail = await main(p);
    check(
      "상세: 유통기한별 남은 양",
      detail.includes("유통기한별 남은 양") && detail.includes(kstDate(-1)) && detail.includes(kstDate(2)),
    );
    check("상세: 부족 배지와 부족 기준", detail.includes("부족") && detail.includes("부족 기준 2봉"));
    await shot(p, "품목 상세");
  });

  const staff = await app.joinByInvite(p, { viewport: MOBILE });
  const s = staff.page;

  await test.step("4. 실시간: 사장이 보는 중에 직원이 다른 기기에서 기록", async () => {
    await p.goto("/items");
    await waitForRealtime(p);
    await recordStock(s, { type: "사용", itemId: milk, quantity: 1000 });
    check("실시간: 직원 기록이 사장 목록에 새로고침 없이 반영", await appearsLive(p, "2팩", "main ul"));

    await p.goto("/dashboard");
    await waitForRealtime(p);
    await recordStock(s, { type: "사용", itemId: bean, quantity: 2000 });
    check("실시간: 대시보드 부족 목록 반영", await appearsLive(p, "0g / 2봉"));
  });

  await test.step("5. 입력 중인 폼은 실시간 새로고침에도 유지", async () => {
    await p.goto("/stock");
    await waitForRealtime(p);
    await p.fill("#stock-quantity", "7");
    await recordStock(s, { type: "사용", itemId: milk, quantity: 100 });
    check("실시간 새로고침 반영", await appearsLive(p, "−100ml"));
    check("실시간 새로고침 중에도 입력값 유지", (await p.inputValue("#stock-quantity")) === "7");
  });

  await test.step("6. 휴대폰", async () => {
    for (const path of ["/dashboard", "/items", `/items/${bean}`]) {
      await s.goto(path);
      check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 12)}`, !(await hasHorizontalScroll(s)));
    }
    await s.goto("/dashboard");
    await shot(s, "휴대폰 대시보드");
    await s.goto("/items");
    await shot(s, "휴대폰 품목 목록");
  });
});
