import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { BASE, CHROME_PATH, DB_CONTAINER, shotsDir } from "./config.mjs";

const SHOTS = shotsDir("counts");
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
const stockOf = (itemId) => sql(`select quantity from item_stock_levels where item_id = '${itemId}'`);

async function addCategory(p, name) {
  await p.goto(`${BASE}/items/categories`);
  await p.getByLabel("카테고리 이름").fill(name);
  await p.getByRole("button", { name: "추가", exact: true }).click();
  await p.getByLabel(`${name} 이름`).waitFor();
}
async function createItem(p, { name, baseUnit, category, trackExpiry = false, unit }) {
  await p.goto(`${BASE}/items/new`);
  await p.fill("#item-name", name);
  if (category) await p.selectOption("#item-category", { label: category });
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
async function receive(p, itemId, quantity, expiresOn) {
  await p.goto(`${BASE}/stock?item=${itemId}`);
  await p.fill("#stock-quantity", String(quantity));
  if (expiresOn) await p.fill("#stock-expires", expiresOn);
  await p.getByRole("button", { name: "입고 기록" }).click();
  await p.waitForFunction(() => document.querySelector("#stock-quantity").value === "");
}
/** 실사 화면에서 품목 하나를 센다. packs 가 있으면 묶음 칸에도 입력 */
async function count(page, name, { packs, loose, packName }) {
  if (packs !== undefined) await page.getByLabel(`${name} ${packName} 수`).fill(String(packs));
  await page.getByLabel(new RegExp(`^${name} (낱개|수량) \\(`)).fill(String(loose ?? 0));
  const row = page.locator("li", { has: page.getByLabel(new RegExp(`^${name} (낱개|수량) \\(`)) });
  await row.getByRole("button", { name: "확인" }).click();
  await page.locator("li", { hasText: name }).getByText("센 수량").waitFor();
}
const row = (page, name) => page.locator("main li").filter({ has: page.locator(`span.font-medium:text-is("${name}")`) });

try {
  const owner = await newUser();
  const p = owner.page;
  await p.goto(`${BASE}/login`);
  await signup(p, "김사장", `owner${stamp}@test.kr`);
  await p.waitForURL("**/onboarding");
  await p.fill("#store-name", `실사테스트 ${stamp}`);
  await p.getByRole("button", { name: "매장 만들기" }).click();
  await p.waitForURL("**/dashboard");

  await addCategory(p, "원두류");
  await addCategory(p, "유제품");
  const bean = await createItem(p, { name: "원두", baseUnit: "g", category: "원두류", trackExpiry: true, unit: ["봉", 1000] });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", category: "유제품", unit: ["팩", 1000] });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea" });
  await receive(p, bean, 2, kstDate(5));
  await receive(p, milk, 3);
  await receive(p, cup, 100);
  // 센 뒤의 판매를 만들 메뉴
  await p.goto(`${BASE}/menus/new`);
  await p.fill("#menu-name", "아메리카노");
  await p.fill("#menu-price", "4500");
  await p.getByRole("button", { name: "메뉴 만들기" }).click();
  await p.waitForURL(/\/menus\/[0-9a-f-]{36}/);
  for (const [item, q] of [[bean, 18], [cup, 1]]) {
    await p.selectOption("#recipe-item", item);
    await p.fill("#recipe-quantity", String(q));
    await p.getByRole("button", { name: "재료 넣기" }).click();
    await p.waitForFunction(() => document.querySelector("#recipe-quantity").value === "");
  }

  // 1. 실사 시작
  await p.getByRole("link", { name: "실사", exact: true }).click();
  await p.waitForURL("**/counts");
  check("지난 실사 없음 안내", (await main(p)).includes("아직 끝난 실사가 없습니다."));
  await p.fill("#count-memo", "월말 실사");
  await p.getByRole("button", { name: "실사 시작" }).click();
  await p.waitForURL(/\/counts\/[0-9a-f-]{36}/);
  const countUrl = p.url();
  const countId = countUrl.split("/").pop();
  let text = await main(p);
  check("시작 → 0/3개 셈, 장부 표시", text.includes("0/3개 셈") && text.includes("장부 2봉") && text.includes("장부 3팩"));

  // 2. 사장이 원두를 셈: 1봉 + 900g (장부 2,000g → −100g)
  await count(p, "원두", { packs: 1, loose: 900, packName: "봉" });
  text = await row(p, "원두").innerText();
  check("원두 1봉 + 900g, 차이 −100g", text.includes("센 수량 1봉 + 900g") && text.includes("−100g"), text.replace(/\n/g, " / "));
  check("센 사람 표시", text.includes("김사장"));

  // 3. 직원이 같은 실사에서 우유를 셈 → 사장 화면에 실시간 반영
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
  check("대시보드에 진행 중인 실사", (await main(s)).includes("재고 실사 진행 중") && (await main(s)).includes("1/3개 셈"));

  await p.goto(countUrl);
  await p.waitForTimeout(1500);
  await s.goto(countUrl);
  check("직원: 완료 버튼 없음 + 요청 안내", (await s.getByRole("button", { name: /실사 완료/ }).count()) === 0 && (await main(s)).includes("사장이나 매니저에게"));
  await count(s, "우유", { packs: 3, loose: 50, packName: "팩" });
  try {
    await p.waitForFunction(() => document.querySelector("main").innerText.includes("2/3개 셈"), null, { timeout: 8000 });
    check("실시간: 직원이 센 수량이 사장 화면에 반영", true);
  } catch {
    check("실시간: 직원이 센 수량이 사장 화면에 반영", false);
  }
  check("우유 +50ml", (await row(p, "우유").innerText()).includes("+50ml"));

  // 4. 센 뒤에 판매 (원두 −36g, 컵 −2) → 원두 차이는 그대로 −100g
  await s.goto(`${BASE}/sales`);
  await s.getByRole("button", { name: "아메리카노 하나 더하기" }).click();
  await s.getByRole("button", { name: "아메리카노 하나 더하기" }).click();
  await s.getByRole("button", { name: /판매 기록 ·/ }).click();
  await s.getByRole("button", { name: "판매 수량을 입력해 주세요" }).waitFor();
  await p.goto(countUrl);
  text = await row(p, "원두").innerText();
  check("센 뒤 판매가 있어도 차이 −100g 유지 (센 시각 장부 2봉)", text.includes("−100g") && text.includes("장부 2봉 (센 시각 기준)"), text.replace(/\n/g, " / "));

  // 5. 필터
  await p.getByRole("button", { name: /안 센 것/ }).click();
  text = await main(p);
  check("안 센 것 → 컵만", text.includes("컵") && !text.includes("센 수량 1봉"));
  await p.getByRole("button", { name: /차이 있음/ }).click();
  text = await main(p);
  check("차이 있음 → 원두, 우유", text.includes("센 수량 1봉 + 900g") && text.includes("센 수량 3팩 + 50ml") && !text.includes("장부 100개"));
  await p.getByRole("button", { name: /^전체/ }).click();

  // 6. 다시 세기·지우기
  await row(p, "우유").getByRole("button", { name: "다시 세기" }).click();
  await count(p, "우유", { packs: 3, loose: 0, packName: "팩" });
  await row(p, "우유").getByText("일치").waitFor();
  check("다시 세기 → 우유 일치", true);
  await count(p, "컵", { loose: 100 });
  await p.getByRole("button", { name: "컵 센 수량 지우기" }).click();
  await p.getByText("센 수량을 지웠습니다.").waitFor();
  await p.waitForTimeout(1000);
  text = await main(p);
  check("지우기 → 컵 다시 안 셈", text.includes("2/3개 셈"), text.slice(0, 300));
  await p.screenshot({ path: `${SHOTS}01-counting.png`, fullPage: true });

  // 7. 두 번째 실사는 시작할 수 없음
  await p.goto(`${BASE}/counts`);
  check("진행 중이면 새 실사 대신 이어서 세기", (await main(p)).includes("이어서 세기") && !(await main(p)).includes("새 실사"));

  // 8. 완료
  await p.goto(countUrl);
  await p.getByRole("button", { name: "실사 완료 · 재고 반영" }).click();
  await p.getByText("1개 품목의 재고를 맞췄습니다.").waitFor();
  check("완료 알림 (1개 조정)", true);
  check("재고: 원두 1,864g (2,000−36−100), 우유 3,000, 컵 98", stockOf(bean) === "1864.000" && stockOf(milk) === "3000.000" && stockOf(cup) === "98.000", `${stockOf(bean)}, ${stockOf(milk)}, ${stockOf(cup)}`);
  text = await main(p);
  check("결과 화면: 원두 −100g 조정, 우유 일치, 컵 세지 않음", text.includes("결과 · 1개 품목 조정") && text.includes("−100g 조정") && text.includes("일치") && text.includes("세지 않은 품목 1개: 컵"));
  await p.screenshot({ path: `${SHOTS}02-result.png`, fullPage: true });
  await p.goto(`${BASE}/stock?item=${bean}`);
  check("입출고 기록에 실사 조정 표시", (await main(p)).includes("재고 실사"));

  // 9. 취소
  await p.goto(`${BASE}/counts`);
  await p.getByRole("button", { name: "실사 시작" }).click();
  await p.waitForURL(/\/counts\/[0-9a-f-]{36}/);
  await count(p, "컵", { loose: 1 });
  await p.getByRole("button", { name: "실사 취소" }).click();
  await p.getByText("실사를 취소했습니다.").waitFor();
  // 알림이 화면 갱신보다 조금 먼저 뜰 수 있다.
  await p.getByText("취소된 실사").waitFor({ timeout: 5000 }).catch(() => {});
  check("취소 → 재고 그대로 (컵 98)", stockOf(cup) === "98.000" && (await main(p)).includes("취소된 실사"));

  // 10. 카테고리만 실사
  await p.goto(`${BASE}/counts`);
  await p.selectOption("#count-category", { label: "유제품만" });
  await p.getByRole("button", { name: "실사 시작" }).click();
  await p.waitForURL(/\/counts\/[0-9a-f-]{36}/);
  text = await main(p);
  check("유제품만 → 우유 1개", text.includes("유제품 실사") && text.includes("0/1개 셈") && !text.includes("원두"));
  await p.goto(`${BASE}/counts`);
  text = await main(p);
  check("지난 실사 목록: 완료·취소", text.includes("완료") && text.includes("취소") && text.includes("1개 조정"));
  await p.screenshot({ path: `${SHOTS}03-list.png`, fullPage: true });

  // 11. 휴대폰
  for (const path of ["/counts", countUrl.replace(BASE, "")]) {
    await s.goto(`${BASE}${path}`);
    check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 10)}`, !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  }
  await s.goto(`${BASE}/counts`);
  await s.getByRole("link", { name: "이어서 세기" }).click();
  await s.waitForURL(/\/counts\/[0-9a-f-]{36}/);
  await s.screenshot({ path: `${SHOTS}04-mobile-counting.png`, fullPage: true });
} catch (e) {
  results.push(`EXCEPTION ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
