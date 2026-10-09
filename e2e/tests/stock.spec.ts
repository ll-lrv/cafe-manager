import type { Page } from "@playwright/test";
import { sql } from "../db";
import { expect, MOBILE, test } from "../fixtures";
import { check, createItem, hasHorizontalScroll, main, shot } from "../helpers";

const history = (page: Page) => page.locator("main ul").last().innerText();

/** 기록 버튼을 누르고, 성공하면 수량 칸이 비워지는 것으로 완료를 확인한다. */
async function submit(p: Page, label: string, message: string) {
  await p.getByRole("button", { name: `${label} 기록` }).click();
  await p.waitForFunction(() => (document.querySelector("#stock-quantity") as HTMLInputElement).value === "");
  await p.getByText(message).last().waitFor();
}

test("입출고 기록", async ({ app }) => {
  const owner = await app.owner({ storeName: `입출고테스트 ${app.stamp}` });
  const p = owner.page;

  await p.locator("header").getByRole("link", { name: "입출고", exact: true }).click();
  await p.waitForURL("**/stock");
  check("품목 없으면 등록 안내", (await main(p)).includes("먼저 품목을 등록해 주세요."));

  const bean = await createItem(p, { name: "원두", baseUnit: "g", trackExpiry: true, unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });

  await test.step("1. 입고 (유통기한 품목)", async () => {
    await p.goto("/stock");
    await p.selectOption("#stock-item", bean);
    check("입고는 기본 입고 단위(봉)로 시작", (await p.locator("#stock-unit option:checked").innerText()).startsWith("봉"));
    check("유통기한 품목이면 유통기한 칸 표시", await p.isVisible("#stock-expires"));
    await p.fill("#stock-quantity", "2");
    const preview = await p.locator('main [aria-live="polite"]').innerText();
    check("미리보기: 현재 0g → 2봉 (+2,000g)", preview.includes("0g") && preview.includes("2봉") && preview.includes("+2,000g"), preview);
    await p.fill("#stock-price", "25,000");
    await p.getByRole("button", { name: "입고 기록" }).click();
    check(
      "유통기한 없이 입고 불가 (필수 입력)",
      await p.locator("#stock-expires").evaluate((e) => (e as HTMLInputElement).validity.valueMissing),
    );
    await p.fill("#stock-expires", "2026-12-01");
    await submit(p, "입고", "입고를 기록했습니다.");
    check(
      "기록 후 수량 칸 비워짐, 품목 유지",
      (await p.inputValue("#stock-quantity")) === "" && (await p.inputValue("#stock-item")) === bean,
    );
    const h = await history(p);
    check(
      "기록 목록: +2봉 (2,000g) · 단가 · 유통기한",
      h.includes("+2봉 (2,000g)") && h.includes("1봉 25,000원") && h.includes("유통기한 2026-12-01"),
      h.split("\n").slice(0, 4).join(" / "),
    );

    await p.fill("#stock-quantity", "1");
    await p.fill("#stock-expires", "2026-11-01");
    await submit(p, "입고", "입고를 기록했습니다.");
  });

  await test.step("2. 사용 → 유통기한 빠른 로트부터", async () => {
    await p.getByRole("button", { name: "사용", exact: true }).click();
    check("사용은 기본 단위(g)로 시작", (await p.locator("#stock-unit option:checked").innerText()) === "g");
    check("사용에는 단가·유통기한 칸 없음", !(await p.isVisible("#stock-price")) && !(await p.isVisible("#stock-expires")));
    await p.fill("#stock-quantity", "1,500");
    const preview = await p.locator('main [aria-live="polite"]').innerText();
    check("미리보기: 3봉 → 1봉 + 500g", preview.includes("3봉") && preview.includes("1봉 + 500g"), preview);
    await submit(p, "사용", "사용을 기록했습니다.");
    const lots = sql(
      `select string_agg(l.expires_on || ':' || m.quantity, ',' order by l.expires_on) from stock_movements m join stock_lots l on l.id = m.lot_id where m.item_id = '${bean}' and m.type = 'consume'`,
    );
    check("사용 1,500g → 11월 로트 1,000 + 12월 로트 500", lots === "2026-11-01:-1000.000,2026-12-01:-500.000", lots);
    const h = await history(p);
    check("기록 목록에 로트별 차감 표시", h.includes("−1,000g") && h.includes("−500g"));
  });

  await test.step("3. 재고 없는 품목 폐기 → 마이너스 경고", async () => {
    await p.getByRole("button", { name: "폐기", exact: true }).click();
    await p.selectOption("#stock-item", milk);
    await p.selectOption("#stock-unit", { label: "팩 (1,000ml)" });
    await p.fill("#stock-quantity", "1");
    check("마이너스 재고 경고", (await main(p)).includes("재고가 마이너스가 됩니다."));
    await p.getByRole("button", { name: "폐기 기록" }).click();
    check("폐기는 사유 필수", await p.locator("#stock-waste-reason").evaluate((e) => (e as HTMLSelectElement).validity.valueMissing));
    await p.selectOption("#stock-waste-reason", { label: "기타" });
    await p.getByRole("button", { name: "폐기 기록" }).click();
    check("기타는 메모 필수", await p.locator("#stock-memo").evaluate((e) => (e as HTMLInputElement).validity.valueMissing));
    await p.selectOption("#stock-waste-reason", { label: "쏟음·파손" });
    await p.fill("#stock-memo", "배달 중 쏟음");
    await submit(p, "폐기", "폐기를 기록했습니다.");
    await expect(p.locator("main ul").last()).toContainText("쏟음·파손");
  });

  await test.step("4. 조정 (사장)", async () => {
    await p.getByRole("button", { name: "조정", exact: true }).click();
    await p.getByRole("button", { name: "늘리기 (+)" }).click();
    await p.selectOption("#stock-unit", { label: "팩 (1,000ml)" });
    await p.fill("#stock-quantity", "3");
    await p.getByRole("button", { name: "조정 기록" }).click();
    check("조정은 사유 필수", await p.locator("#stock-memo").evaluate((e) => (e as HTMLInputElement).validity.valueMissing));
    await p.fill("#stock-memo", "실제로 3팩 있음");
    await submit(p, "조정", "재고를 조정했습니다.");
    check("우유 재고 = -1000 + 3000", sql(`select quantity from item_stock_levels where item_id = '${milk}'`) === "2000.000");
    await shot(p, "입출고");
  });

  await test.step("5. 품목 상세: 현재 재고 + 기록 + 입출고 링크", async () => {
    await p.goto(`/items/${bean}`);
    const detail = await main(p);
    check("품목 상세 현재 재고 1봉 + 500g", detail.includes("1봉 + 500g"));
    check("품목 상세에 기록 목록", detail.includes("−1,000g") && detail.includes("+2봉 (2,000g)"));
    check("기본 단위 잠김 (기록 생김)", await p.isDisabled("#item-base-unit"));
    await shot(p, "품목 상세");
    await p.getByRole("link", { name: "입출고 기록" }).click();
    await p.waitForURL(`**/stock?item=${bean}`);
    check("품목에서 들어오면 그 품목 선택", (await p.inputValue("#stock-item")) === bean);
    check("기록 목록이 그 품목만", (await main(p)).includes("원두 기록") && !(await history(p)).includes("우유"));
  });

  await test.step("6. 부족 표시: 최소 재고 5000 으로", async () => {
    await p.goto(`/items/${bean}`);
    await p.fill("#item-min-stock", "5000");
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await p.getByText("저장했습니다.").waitFor();
    check("부족 배지", (await main(p)).includes("부족"));
  });

  const staff = await app.joinByInvite(p);
  const s = staff.page;

  await test.step("7. 직원", async () => {
    await s.locator("header").getByRole("link", { name: "입출고", exact: true }).click();
    await s.waitForURL("**/stock");
    check("직원에게 조정 버튼 없음", (await s.getByRole("button", { name: "조정", exact: true }).count()) === 0);
    await s.getByRole("button", { name: "사용", exact: true }).click();
    await s.selectOption("#stock-item", milk);
    await s.fill("#stock-quantity", "250");
    await submit(s, "사용", "사용을 기록했습니다.");
    check("직원 기록에 이름 표시", (await history(s)).includes("이직원"));
    await shot(s, "직원 입출고");
  });

  await test.step("8. 보관 품목은 선택 목록에서 빠짐", async () => {
    await p.goto(`/items/${milk}`);
    await p.getByRole("button", { name: "보관" }).click();
    await p.getByRole("button", { name: "다시 사용" }).waitFor();
    await p.goto("/stock");
    const options = await p.locator("#stock-item option").allInnerTexts();
    check("보관 품목은 선택 목록에서 제외", !options.includes("우유"), options.join(","));
    check("보관 품목 기록은 목록에 남음", (await history(p)).includes("우유"));
  });

  await test.step("9. 휴대폰", async () => {
    const { page: mp } = await app.newPage({ viewport: MOBILE, sameLoginAs: staff.ctx });
    for (const path of ["/stock", `/stock?item=${bean}`, `/items/${bean}`]) {
      await mp.goto(path);
      check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 12)}`, !(await hasHorizontalScroll(mp)));
    }
    await mp.goto("/stock");
    await shot(mp, "휴대폰 입출고");
  });
});
