import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { BASE, CHROME_PATH, DB_CONTAINER, shotsDir } from "./config.mjs";

const SHOTS = shotsDir("stock");
const stamp = Date.now();
const results = [];
const check = (label, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` (${extra})` : ""}`);
const sql = (q) =>
  execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-At", "-c", q], { encoding: "utf8" }).trim();

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });

async function newUser() {
  const ctx = await browser.newContext({ locale: "ko-KR", viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.push(`PAGE ERROR ${e.message}`));
  page.on("console", (m) => m.type() === "error" && results.push(`CONSOLE ERROR [${page.url()}] ${m.text().slice(0, 300)}`));
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}
async function signup(page, name, email) {
  await page.getByRole("tab", { name: "회원가입" }).click();
  await page.fill("#signup-name", name);
  await page.fill("#signup-email", email);
  await page.fill("#signup-password", "test1234");
  await page.getByRole("button", { name: "가입하기" }).click();
}
const main = (page) => page.locator("main").innerText();
const history = (page) => page.locator("main ul").last().innerText();

async function createItem(p, name, baseUnit, trackExpiry, unitName, factor) {
  await p.goto(`${BASE}/items/new`);
  await p.fill("#item-name", name);
  await p.selectOption("#item-base-unit", baseUnit);
  if (trackExpiry) await p.check("#item-track-expiry");
  await p.getByRole("button", { name: "품목 만들기" }).click();
  await p.waitForURL(/\/items\/[0-9a-f-]{36}/);
  const id = p.url().split("?")[0].split("/").pop();
  await p.fill("#unit-name", unitName);
  await p.fill("#unit-factor", String(factor));
  await p.getByRole("button", { name: "단위 추가" }).click();
  await p.getByText("기본 입고 단위", { exact: true }).waitFor();
  return id;
}

/** 기록 버튼을 누르고, 성공하면 수량 칸이 비워지는 것으로 완료를 확인한다. */
async function submit(p, label, message) {
  await p.getByRole("button", { name: `${label} 기록` }).click();
  await p.waitForFunction(() => document.querySelector("#stock-quantity").value === "");
  await p.getByText(message).last().waitFor();
}

try {
  const owner = await newUser();
  const p = owner.page;
  await p.goto(`${BASE}/login`);
  await signup(p, "김사장", `owner${stamp}@test.kr`);
  await p.waitForURL("**/onboarding");
  await p.fill("#store-name", `입출고테스트 ${stamp}`);
  await p.getByRole("button", { name: "매장 만들기" }).click();
  await p.waitForURL("**/dashboard");

  await p.locator("header").getByRole("link", { name: "입출고", exact: true }).click();
  await p.waitForURL("**/stock");
  check("품목 없으면 등록 안내", (await main(p)).includes("먼저 품목을 등록해 주세요."));

  const bean = await createItem(p, "원두", "g", true, "봉", 1000);
  const milk = await createItem(p, "우유", "ml", false, "팩", 1000);

  // 1. 입고 (유통기한 품목)
  await p.goto(`${BASE}/stock`);
  await p.selectOption("#stock-item", bean);
  check("입고는 기본 입고 단위(봉)로 시작", (await p.locator("#stock-unit option:checked").innerText()).startsWith("봉"));
  check("유통기한 품목이면 유통기한 칸 표시", await p.isVisible("#stock-expires"));
  await p.fill("#stock-quantity", "2");
  const preview = await p.locator('main [aria-live="polite"]').innerText();
  check("미리보기: 현재 0g → 2봉 (+2,000g)", preview.includes("0g") && preview.includes("2봉") && preview.includes("+2,000g"), preview);
  await p.fill("#stock-price", "25,000");
  await p.getByRole("button", { name: "입고 기록" }).click();
  check("유통기한 없이 입고 불가 (필수 입력)", (await p.locator("#stock-expires").evaluate((e) => e.validity.valueMissing)));
  await p.fill("#stock-expires", "2026-12-01");
  await submit(p, "입고", "입고를 기록했습니다.");
  check("기록 후 수량 칸 비워짐, 품목 유지", (await p.inputValue("#stock-quantity")) === "" && (await p.inputValue("#stock-item")) === bean);
  let h = await history(p);
  check("기록 목록: +2봉 (2,000g) · 단가 · 유통기한", h.includes("+2봉 (2,000g)") && h.includes("1봉 25,000원") && h.includes("유통기한 2026-12-01"), h.split("\n").slice(0, 4).join(" / "));

  await p.fill("#stock-quantity", "1");
  await p.fill("#stock-expires", "2026-11-01");
  await submit(p, "입고", "입고를 기록했습니다.");

  // 2. 사용 → 유통기한 빠른 로트부터
  await p.getByRole("button", { name: "사용", exact: true }).click();
  check("사용은 기본 단위(g)로 시작", (await p.locator("#stock-unit option:checked").innerText()) === "g");
  check("사용에는 단가·유통기한 칸 없음", !(await p.isVisible("#stock-price")) && !(await p.isVisible("#stock-expires")));
  await p.fill("#stock-quantity", "1,500");
  const preview2 = await p.locator('main [aria-live="polite"]').innerText();
  check("미리보기: 3봉 → 1봉 + 500g", preview2.includes("3봉") && preview2.includes("1봉 + 500g"), preview2);
  await submit(p, "사용", "사용을 기록했습니다.");
  const lots = sql(`select string_agg(l.expires_on || ':' || m.quantity, ',' order by l.expires_on) from stock_movements m join stock_lots l on l.id = m.lot_id where m.item_id = '${bean}' and m.type = 'consume'`);
  check("사용 1,500g → 11월 로트 1,000 + 12월 로트 500", lots === "2026-11-01:-1000.000,2026-12-01:-500.000", lots);
  h = await history(p);
  check("기록 목록에 로트별 차감 표시", h.includes("−1,000g") && h.includes("−500g"));

  // 3. 재고 없는 품목 폐기 → 마이너스 경고
  await p.getByRole("button", { name: "폐기", exact: true }).click();
  await p.selectOption("#stock-item", milk);
  await p.selectOption("#stock-unit", { label: "팩 (1,000ml)" });
  await p.fill("#stock-quantity", "1");
  check("마이너스 재고 경고", (await main(p)).includes("재고가 마이너스가 됩니다."));
  await p.fill("#stock-memo", "쏟음");
  await submit(p, "폐기", "폐기를 기록했습니다.");

  // 4. 조정 (사장)
  await p.getByRole("button", { name: "조정", exact: true }).click();
  await p.getByRole("button", { name: "늘리기 (+)" }).click();
  await p.selectOption("#stock-unit", { label: "팩 (1,000ml)" });
  await p.fill("#stock-quantity", "3");
  await p.getByRole("button", { name: "조정 기록" }).click();
  check("조정은 사유 필수", await p.locator("#stock-memo").evaluate((e) => e.validity.valueMissing));
  await p.fill("#stock-memo", "실제로 3팩 있음");
  await submit(p, "조정", "재고를 조정했습니다.");
  check("우유 재고 = -1000 + 3000", sql(`select quantity from item_stock_levels where item_id = '${milk}'`) === "2000.000");
  await p.screenshot({ path: `${SHOTS}01-stock.png`, fullPage: true });

  // 5. 품목 상세: 현재 재고 + 기록 + 입출고 링크
  await p.goto(`${BASE}/items/${bean}`);
  const detail = await main(p);
  check("품목 상세 현재 재고 1봉 + 500g", detail.includes("1봉 + 500g"));
  check("품목 상세에 기록 목록", detail.includes("−1,000g") && detail.includes("+2봉 (2,000g)"));
  check("기본 단위 잠김 (기록 생김)", await p.isDisabled("#item-base-unit"));
  await p.screenshot({ path: `${SHOTS}02-item-detail.png`, fullPage: true });
  await p.getByRole("link", { name: "입출고 기록" }).click();
  await p.waitForURL(`**/stock?item=${bean}`);
  check("품목에서 들어오면 그 품목 선택", (await p.inputValue("#stock-item")) === bean);
  check("기록 목록이 그 품목만", (await main(p)).includes("원두 기록") && !(await history(p)).includes("우유"));

  // 6. 부족 표시: 최소 재고 5000 으로
  await p.goto(`${BASE}/items/${bean}`);
  await p.fill("#item-min-stock", "5000");
  await p.getByRole("button", { name: "저장", exact: true }).click();
  await p.getByText("저장했습니다.").waitFor();
  check("부족 배지", (await p.locator("main").innerText()).includes("부족"));

  // 7. 직원
  await p.goto(`${BASE}/settings/members`);
  await p.getByRole("button", { name: "초대 링크 만들기" }).click();
  const linkInput = p.locator('input[readonly][value*="/invite/"]');
  await linkInput.waitFor();
  const inviteUrl = await linkInput.inputValue();
  const staff = await newUser();
  const s = staff.page;
  await s.goto(inviteUrl);
  await s.getByRole("link", { name: /가입하고 수락/ }).click();
  await s.waitForURL("**/login?next=*");
  await signup(s, "이직원", `staff${stamp}@test.kr`);
  await s.waitForURL("**/invite/**");
  await s.getByRole("button", { name: "초대 수락하기" }).click();
  await s.waitForURL("**/dashboard");
  await s.locator("header").getByRole("link", { name: "입출고", exact: true }).click();
  await s.waitForURL("**/stock");
  check("직원에게 조정 버튼 없음", (await s.getByRole("button", { name: "조정", exact: true }).count()) === 0);
  await s.getByRole("button", { name: "사용", exact: true }).click();
  await s.selectOption("#stock-item", milk);
  await s.fill("#stock-quantity", "250");
  await submit(s, "사용", "사용을 기록했습니다.");
  check("직원 기록에 이름 표시", (await history(s)).includes("이직원"));
  await s.screenshot({ path: `${SHOTS}03-staff.png`, fullPage: true });

  // 8. 보관 품목은 선택 목록에서 빠짐
  await p.goto(`${BASE}/items/${milk}`);
  await p.getByRole("button", { name: "보관" }).click();
  await p.getByRole("button", { name: "다시 사용" }).waitFor();
  await p.goto(`${BASE}/stock`);
  const options = await p.locator("#stock-item option").allInnerTexts();
  check("보관 품목은 선택 목록에서 제외", !options.includes("우유"), options.join(","));
  check("보관 품목 기록은 목록에 남음", (await history(p)).includes("우유"));

  // 9. 휴대폰
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await staff.ctx.storageState() });
  const mp = await mobile.newPage();
  for (const path of ["/stock", `/stock?item=${bean}`, `/items/${bean}`]) {
    await mp.goto(`${BASE}${path}`);
    check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 12)}`, !(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  }
  await mp.goto(`${BASE}/stock`);
  await mp.screenshot({ path: `${SHOTS}04-mobile.png`, fullPage: true });
} catch (e) {
  results.push(`EXCEPTION ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
