import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { BASE, CHROME_PATH, DB_CONTAINER, shotsDir } from "./config.mjs";

const SHOTS = shotsDir("sales");
const stamp = Date.now();
const results = [];
const check = (label, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` (${extra})` : ""}`);
const sql = (q) =>
  execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-At", "-c", q], { encoding: "utf8" }).trim();
const kstDate = (n) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + n * 86_400_000));

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });

async function newUser(viewport = { width: 1100, height: 900 }) {
  const ctx = await browser.newContext({ locale: "ko-KR", viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.push(`PAGE ERROR ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("hydrated") && results.push(`CONSOLE ERROR [${page.url()}] ${m.text().slice(0, 300)}`));
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

async function createItem(p, { name, baseUnit, trackExpiry = false, unit }) {
  await p.goto(`${BASE}/items/new`);
  await p.fill("#item-name", name);
  await p.selectOption("#item-base-unit", baseUnit);
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
async function receive(p, itemId, quantity, price, expiresOn) {
  await p.goto(`${BASE}/stock?item=${itemId}`);
  await p.fill("#stock-quantity", String(quantity));
  await p.fill("#stock-price", String(price));
  if (expiresOn) await p.fill("#stock-expires", expiresOn);
  await p.getByRole("button", { name: "입고 기록" }).click();
  await p.waitForFunction(() => document.querySelector("#stock-quantity").value === "");
}
async function createMenu(p, name, price) {
  await p.goto(`${BASE}/menus/new`);
  await p.fill("#menu-name", name);
  await p.fill("#menu-price", price);
  await p.getByRole("button", { name: "메뉴 만들기" }).click();
  await p.waitForURL(/\/menus\/[0-9a-f-]{36}/);
  return p.url().split("?")[0].split("/").pop();
}
async function addIngredient(p, itemId, quantity, unitLabel) {
  await p.selectOption("#recipe-item", itemId);
  await p.fill("#recipe-quantity", String(quantity));
  if (unitLabel) await p.selectOption("#recipe-unit", { label: unitLabel });
  await p.getByRole("button", { name: /재료 넣기|사용량 바꾸기/ }).click();
  await p.waitForFunction(() => document.querySelector("#recipe-quantity").value === "");
}
async function submitSales(p) {
  await p.getByRole("button", { name: /판매 기록 ·/ }).click();
  await p.getByRole("button", { name: "판매 수량을 입력해 주세요" }).waitFor();
}
const stockOf = (itemId) => sql(`select quantity from item_stock_levels where item_id = '${itemId}'`);

try {
  const owner = await newUser();
  const p = owner.page;
  await p.goto(`${BASE}/login`);
  await signup(p, "김사장", `owner${stamp}@test.kr`);
  await p.waitForURL("**/onboarding");
  await p.fill("#store-name", `판매테스트 ${stamp}`);
  await p.getByRole("button", { name: "매장 만들기" }).click();
  await p.waitForURL("**/dashboard");

  const bean = await createItem(p, { name: "원두", baseUnit: "g", trackExpiry: true, unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", unit: ["팩", 1000] });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
  await receive(p, bean, 1, "25,000", kstDate(5));
  await receive(p, milk, 2, "2,500");
  await receive(p, cup, 50, "100");

  // 1. 메뉴·레시피
  await p.getByRole("link", { name: "메뉴", exact: true }).click();
  await p.waitForURL("**/menus");
  check("메뉴 없음 안내", (await main(p)).includes("아직 등록한 메뉴가 없습니다."));
  const americano = await createMenu(p, "아메리카노", "4,500");
  check("메뉴 만들기 → 상세 + 안내", (await main(p)).includes("메뉴를 만들었습니다."));
  await addIngredient(p, bean, 18);
  await addIngredient(p, cup, 1);
  let text = await main(p);
  check("원가 550원 · 원가율 12.2%", text.includes("550원") && text.includes("12.2%"), text.match(/원가[\s\S]{0,40}/)?.[0]);
  check("재료별 원가 표시 (원두 ≈ 450원)", text.includes("≈ 450원"));
  await p.getByRole("button", { name: "원두 사용량 수정" }).click();
  check("수정 버튼 → 사용량 채움 + '사용량 바꾸기'", (await p.inputValue("#recipe-quantity")) === "18" && (await p.getByRole("button", { name: "사용량 바꾸기" }).count()) === 1);
  await p.fill("#recipe-quantity", "20");
  await p.getByRole("button", { name: "사용량 바꾸기" }).click();
  await p.getByText("≈ 500원").waitFor();
  check("사용량 변경 → 원두 20g (≈ 500원)", true);
  await addIngredient(p, bean, 18);
  check("다시 18g 으로", (await main(p)).includes("≈ 450원"));
  await p.screenshot({ path: `${SHOTS}01-menu-detail.png`, fullPage: true });

  const latte = await createMenu(p, "라떼", "5000");
  await addIngredient(p, bean, 18);
  await addIngredient(p, milk, 0.2, "팩");
  await addIngredient(p, cup, 1);
  text = await main(p);
  check("단위로 입력 (0.2팩 → 200ml), 원가 1,050원 · 21%", text.includes("200ml") && text.includes("1,050원") && text.includes("21%"));
  await p.getByRole("button", { name: "컵 빼기" }).click();
  await p.waitForFunction(() => !document.querySelector("main").innerText.includes("≈ 100원"));
  await p.getByText("재료를 뺐습니다.").waitFor({ timeout: 5000 });
  check("재료 빼기 + 알림", true);
  await addIngredient(p, cup, 1);

  const cookie = await createMenu(p, "쿠키", "3000");
  await p.goto(`${BASE}/menus/new`);
  await p.fill("#menu-name", "라떼");
  await p.fill("#menu-price", "5500");
  await p.getByRole("button", { name: "메뉴 만들기" }).click();
  await p.getByText("같은 이름의 메뉴가 이미 있습니다.").waitFor();
  check("중복 메뉴 이름 안내 + 입력 유지", (await p.inputValue("#menu-price")) === "5500");

  await p.goto(`${BASE}/menus`);
  text = await main(p);
  check("메뉴 목록: 가격·원가·레시피 없음", text.includes("4,500원") && text.includes("원가 550원 · 12.2%") && text.includes("레시피 없음"));
  await p.screenshot({ path: `${SHOTS}02-menus.png`, fullPage: true });

  // 2. 판매 입력
  await p.getByRole("link", { name: "판매", exact: true }).click();
  await p.waitForURL("**/sales");
  for (let i = 0; i < 3; i++) await p.getByRole("button", { name: "아메리카노 하나 더하기" }).click();
  await p.getByLabel("라떼 판매 수량").fill("2");
  const preview = await p.locator('main [aria-live="polite"]').innerText();
  check("차감 미리보기: 원두 −90g, 우유 −400ml, 컵 −5개", preview.includes("−90g") && preview.includes("−400ml") && preview.includes("−5개"), preview.replace(/\n/g, " / "));
  check("버튼에 합계 5개 · 23,500원", (await p.getByRole("button", { name: /판매 기록 ·/ }).innerText()).includes("5개 · 23,500원"));
  await p.screenshot({ path: `${SHOTS}03-sales-input.png`, fullPage: true });
  await submitSales(p);
  text = await main(p);
  check("오늘 매출 23,500원 · 5개", text.includes("23,500원") && text.includes("5개 판매"));
  check("판매 기록 목록", text.includes("아메리카노") && text.includes("13,500원") && text.includes("10,000원"));
  check("재고 차감: 원두 910, 우유 1600, 컵 45", stockOf(bean) === "910.000" && stockOf(milk) === "1600.000" && stockOf(cup) === "45.000", `${stockOf(bean)}, ${stockOf(milk)}, ${stockOf(cup)}`);
  const lotSale = sql(`select count(*) from stock_movements where item_id = '${bean}' and type = 'sale' and lot_id is not null`);
  check("원두 판매 차감은 로트에서", lotSale === "2", lotSale);
  await p.screenshot({ path: `${SHOTS}04-sales-done.png`, fullPage: true });

  await p.goto(`${BASE}/stock`);
  check("입출고 기록에 판매 차감 표시", (await main(p)).includes("판매: 아메리카노 3개"));

  // 3. 지난 날짜 입력
  await p.goto(`${BASE}/sales`);
  await p.getByRole("link", { name: "전날" }).click();
  await p.waitForURL(`**/sales?date=${kstDate(-1)}`);
  check("전날 화면: 판매 없음 + 마감 시각 안내", (await main(p)).includes("이 날 판매 기록이 없습니다.") && (await main(p)).includes("마감 시각"));
  await p.getByRole("button", { name: "쿠키 하나 더하기" }).click();
  check("레시피 없는 메뉴 안내", (await main(p)).includes("레시피가 없어 재료가 차감되지 않습니다"));
  await submitSales(p);
  check("전날 매출 3,000원", (await main(p)).includes("3,000원"));
  const soldAt = sql(`select to_char(sold_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') from sale_records where menu_id = '${cookie}'`);
  check("전날 마감 시각으로 기록", soldAt === `${kstDate(-1)} 23:59`, soldAt);
  await p.getByRole("link", { name: "오늘" }).click();
  await p.waitForURL("**/sales");
  check("오늘 매출에는 영향 없음", (await main(p)).includes("23,500원"));

  // 4. 판매 취소 (사장)
  await p.getByRole("button", { name: "아메리카노 판매 취소" }).click();
  await p.getByText("판매를 취소했습니다.").waitFor();
  check("취소 → 매출 10,000원, 원두 964g, 컵 48개", (await main(p)).includes("10,000원") && stockOf(bean) === "964.000" && stockOf(cup) === "48.000", `${stockOf(bean)}, ${stockOf(cup)}`);

  // 5. 직원
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

  await s.goto(`${BASE}/menus`);
  check("직원: 메뉴 추가 버튼 없음", (await s.getByRole("link", { name: "메뉴 추가" }).count()) === 0);
  await s.goto(`${BASE}/menus/${latte}`);
  check("직원: 메뉴 상세 보기 전용", (await s.isDisabled("#menu-name")) && (await s.getByRole("button", { name: /재료 넣기|라떼|빼기/ }).count()) === 0);

  // 실시간: 사장이 판매 화면을 보는 중에 직원이 판매 기록
  await p.goto(`${BASE}/sales`);
  await p.waitForTimeout(1500);
  await s.goto(`${BASE}/sales`);
  check("직원: 판매 취소 버튼 없음", (await s.getByRole("button", { name: /판매 취소/ }).count()) === 0);
  await s.getByRole("button", { name: "라떼 하나 더하기" }).click();
  await submitSales(s);
  try {
    await p.waitForFunction(() => document.querySelector("main").innerText.includes("15,000원"), null, { timeout: 8000 });
    check("실시간: 직원 판매가 사장 화면 매출에 반영", true);
  } catch {
    check("실시간: 직원 판매가 사장 화면 매출에 반영", false);
  }
  check("직원 이름 표시", (await main(p)).includes("이직원"));
  await s.screenshot({ path: `${SHOTS}05-mobile-sales.png`, fullPage: true });

  // 6. 대시보드
  await p.goto(`${BASE}/dashboard`);
  text = await main(p);
  check("대시보드 오늘 매출 15,000원 · 3개", text.includes("15,000원") && text.includes("3개 판매"));
  check("곧 추가될 기능에서 메뉴·판매 빠짐", !text.includes("레시피 등록, 판매 입력 시"));

  // 7. 메뉴 보관 → 판매 입력에서 빠짐
  await p.goto(`${BASE}/menus/${cookie}`);
  await p.getByRole("button", { name: "보관" }).click();
  await p.getByRole("button", { name: "다시 판매" }).waitFor();
  await p.goto(`${BASE}/sales`);
  check("보관 메뉴는 판매 입력에서 제외", (await p.getByLabel("쿠키 판매 수량").count()) === 0);

  // 8. 휴대폰
  for (const path of ["/sales", "/menus", `/menus/${americano}`, "/dashboard"]) {
    await s.goto(`${BASE}${path}`);
    check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 12)}`, !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  }
} catch (e) {
  results.push(`EXCEPTION ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
