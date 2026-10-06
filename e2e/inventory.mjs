import { chromium } from "playwright-core";
import { BASE, CHROME_PATH, shotsDir } from "./config.mjs";

const SHOTS = shotsDir("inventory");
const stamp = Date.now();
const results = [];
const check = (label, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` (${extra})` : ""}`);

/** 한국 기준 오늘 + n일 (YYYY-MM-DD) */
const kstDate = (n) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + n * 86_400_000));

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });

async function newUser(viewport = { width: 1100, height: 900 }) {
  const ctx = await browser.newContext({ locale: "ko-KR", viewport });
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
const list = (page) => page.locator("main ul").first().innerText();

async function createItem(p, { name, baseUnit, trackExpiry = false, minStock = "", unit }) {
  await p.goto(`${BASE}/items/new`);
  await p.fill("#item-name", name);
  await p.selectOption("#item-base-unit", baseUnit);
  if (minStock) await p.fill("#item-min-stock", minStock);
  if (trackExpiry) await p.check("#item-track-expiry");
  await p.getByRole("button", { name: "품목 만들기" }).click();
  await p.waitForURL(/\/items\/[0-9a-f-]{36}/);
  const id = p.url().split("?")[0].split("/").pop();
  if (unit) {
    await p.fill("#unit-name", unit[0]);
    await p.fill("#unit-factor", String(unit[1]));
    await p.getByRole("button", { name: "단위 추가" }).click();
    await p.getByText("기본 입고 단위", { exact: true }).waitFor();
  }
  return id;
}

async function record(p, { type, itemId, quantity, expiresOn }) {
  await p.goto(`${BASE}/stock?item=${itemId}`);
  await p.getByRole("button", { name: type, exact: true }).click();
  await p.fill("#stock-quantity", String(quantity));
  if (expiresOn) await p.fill("#stock-expires", expiresOn);
  await p.getByRole("button", { name: `${type} 기록` }).click();
  await p.waitForFunction(() => document.querySelector("#stock-quantity").value === "");
}

try {
  const owner = await newUser();
  const p = owner.page;
  await p.goto(`${BASE}/login`);
  await signup(p, "김사장", `owner${stamp}@test.kr`);
  await p.waitForURL("**/onboarding");
  await p.fill("#store-name", `재고현황 ${stamp}`);
  await p.getByRole("button", { name: "매장 만들기" }).click();
  await p.waitForURL("**/dashboard");
  check("품목 없으면 대시보드에 등록 안내", (await main(p)).includes("품목을 등록해 주세요"));

  const bean = await createItem(p, { name: "원두", baseUnit: "g", trackExpiry: true, minStock: "2000", unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });
  await createItem(p, { name: "컵", baseUnit: "ea", minStock: "100" });

  await record(p, { type: "입고", itemId: bean, quantity: 1, expiresOn: kstDate(2) });
  await record(p, { type: "입고", itemId: bean, quantity: 1, expiresOn: kstDate(-1) });
  await record(p, { type: "입고", itemId: milk, quantity: 3 });

  // 1. 대시보드
  await p.goto(`${BASE}/dashboard`);
  const dash = await main(p);
  check("대시보드: 부족한 품목 2개 (원두 부족, 컵 없음)", dash.includes("부족한 품목 2개") && dash.includes("재고 없음") && dash.includes("부족"));
  check("대시보드: 현재/기준 표시 (2봉 / 2봉)", dash.includes("2봉 / 2봉"));
  check("대시보드: 유통기한 확인 2건 (D-2, 1일 지남)", dash.includes("유통기한 확인 2건") && dash.includes("D-2") && dash.includes("1일 지남"));
  check("대시보드: 최근 기록", dash.includes("+3팩 (3,000ml)"));
  check("대시보드: 곧 추가될 기능에서 품목·재고 빠짐", !dash.includes("품목 등록, 입고·사용·폐기 기록"));
  await p.screenshot({ path: `${SHOTS}01-dashboard.png`, fullPage: true });

  // 2. 품목·재고 목록
  await p.getByRole("link", { name: "품목·재고", exact: true }).click();
  await p.waitForURL("**/items");
  let text = await list(p);
  check("목록에 현재 재고 (원두 2봉, 우유 3팩, 컵 0개)", text.includes("2봉") && text.includes("3팩") && text.includes("0개"), text.replace(/\n/g, " / "));
  check("목록에 유통기한 배지 (가장 빠른 = 지남)", text.includes("유통기한 1일 지남"));
  const statusText = await p.getByRole("group", { name: "재고 상태" }).innerText();
  check("상태 칩 개수 (부족·없음 2, 유통기한 1)", statusText.includes("부족·없음 2") && statusText.includes("유통기한 확인 1"), statusText.replace(/\n/g, " "));
  await p.getByRole("button", { name: /부족·없음/ }).click();
  text = await list(p);
  check("부족·없음 필터 → 원두, 컵", text.includes("원두") && text.includes("컵") && !text.includes("우유"));
  await p.getByRole("button", { name: /유통기한 확인/ }).click();
  text = await list(p);
  check("유통기한 필터 → 원두만", text.includes("원두") && !text.includes("컵"));
  await p.screenshot({ path: `${SHOTS}02-items.png`, fullPage: true });
  await p.goto(`${BASE}/items?status=low`);
  check("주소로 상태 필터 (?status=low)", !(await list(p)).includes("우유"));

  // 3. 품목 상세 로트
  await p.goto(`${BASE}/items/${bean}`);
  const detail = await main(p);
  check("상세: 유통기한별 남은 양", detail.includes("유통기한별 남은 양") && detail.includes(kstDate(-1)) && detail.includes(kstDate(2)));
  check("상세: 부족 배지와 부족 기준", detail.includes("부족") && detail.includes("부족 기준 2봉"));
  await p.screenshot({ path: `${SHOTS}03-detail.png`, fullPage: true });

  // 4. 실시간: 사장이 목록을 보는 중에 직원이 다른 기기에서 사용 기록
  await p.goto(`${BASE}/settings/members`);
  await p.getByRole("button", { name: "초대 링크 만들기" }).click();
  const linkInput = p.locator('input[readonly][value*="/invite/"]');
  await linkInput.waitFor();
  const inviteUrl = await linkInput.inputValue();
  const staff = await newUser({ width: 390, height: 844 });
  const s = staff.page;
  await s.goto(inviteUrl);
  await s.getByRole("link", { name: /가입하고 수락/ }).click();
  await s.waitForURL("**/login?next=*");
  await signup(s, "이직원", `staff${stamp}@test.kr`);
  await s.waitForURL("**/invite/**");
  await s.getByRole("button", { name: "초대 수락하기" }).click();
  await s.waitForURL("**/dashboard");

  await p.goto(`${BASE}/items`);
  await p.waitForTimeout(1500); // 구독 연결 대기
  await record(s, { type: "사용", itemId: milk, quantity: 1000 });
  const t0 = Date.now();
  try {
    await p.waitForFunction(() => document.querySelector("main ul").innerText.includes("2팩"), null, { timeout: 8000 });
    check("실시간: 직원 기록이 사장 목록에 새로고침 없이 반영", true, `${Date.now() - t0}ms`);
  } catch {
    check("실시간: 직원 기록이 사장 목록에 새로고침 없이 반영", false);
  }

  await p.goto(`${BASE}/dashboard`);
  await p.waitForTimeout(1500);
  await record(s, { type: "사용", itemId: bean, quantity: 2000 });
  try {
    await p.waitForFunction(() => document.querySelector("main").innerText.includes("0g / 2봉"), null, { timeout: 8000 });
    check("실시간: 대시보드 부족 목록 반영", true);
  } catch {
    check("실시간: 대시보드 부족 목록 반영", false);
  }

  // 5. 입력 중인 폼은 실시간 새로고침에도 유지
  await p.goto(`${BASE}/stock`);
  await p.waitForTimeout(1500);
  await p.fill("#stock-quantity", "7");
  await record(s, { type: "사용", itemId: milk, quantity: 100 });
  await p.waitForFunction(() => document.querySelector("main").innerText.includes("−100ml"), null, { timeout: 8000 });
  check("실시간 새로고침 중에도 입력값 유지", (await p.inputValue("#stock-quantity")) === "7");

  // 6. 휴대폰
  for (const path of ["/dashboard", "/items", `/items/${bean}`]) {
    await s.goto(`${BASE}${path}`);
    check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 12)}`, !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  }
  await s.goto(`${BASE}/dashboard`);
  await s.screenshot({ path: `${SHOTS}04-mobile-dashboard.png`, fullPage: true });
  await s.goto(`${BASE}/items`);
  await s.screenshot({ path: `${SHOTS}05-mobile-items.png`, fullPage: true });
} catch (e) {
  results.push(`EXCEPTION ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
