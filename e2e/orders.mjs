import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { BASE, CHROME_PATH, DB_CONTAINER, shotsDir } from "./config.mjs";

const SHOTS = shotsDir("orders");
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
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
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
const stockOf = (itemId) => sql(`select coalesce((select quantity from item_stock_levels where item_id = '${itemId}'), 0)`);

async function createItem(p, { name, baseUnit, trackExpiry = false, minStock, unit, supplier }) {
  await p.goto(`${BASE}/items/new`);
  await p.fill("#item-name", name);
  await p.selectOption("#item-base-unit", baseUnit);
  if (minStock) await p.fill("#item-min-stock", minStock);
  if (trackExpiry) await p.check("#item-track-expiry");
  if (supplier) await p.selectOption("#item-supplier", { label: supplier });
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

try {
  const owner = await newUser();
  const p = owner.page;
  await p.goto(`${BASE}/login`);
  await signup(p, "김사장", `owner${stamp}@test.kr`);
  await p.waitForURL("**/onboarding");
  await p.fill("#store-name", `발주테스트 ${stamp}`);
  await p.getByRole("button", { name: "매장 만들기" }).click();
  await p.waitForURL("**/dashboard");

  // 1. 거래처
  await p.locator("header").getByRole("link", { name: "발주", exact: true }).click();
  await p.waitForURL("**/orders");
  check("진행 중 발주 없음", (await main(p)).includes("진행 중인 발주가 없습니다."));
  await p.getByRole("link", { name: "새 발주" }).click();
  await p.waitForURL("**/orders/new");
  check("거래처 없으면 등록 안내", (await main(p)).includes("먼저 거래처를 등록해 주세요."));
  await p.getByRole("link", { name: "거래처 추가" }).click();
  await p.waitForURL(/\/suppliers\/new\?next=/);
  await p.fill("#supplier-name", "빈스서플");
  await p.fill("#supplier-phone", "010-1234-5678");
  await p.fill("#supplier-email", "잘못된메일");
  await p.getByRole("button", { name: "거래처 만들기" }).click();
  check("이메일 형식 검사 (브라우저) + 입력 유지", (await p.locator("#supplier-email").evaluate((e) => e.validity.typeMismatch)) && (await p.inputValue("#supplier-name")) === "빈스서플");
  await p.fill("#supplier-email", "beans@test.kr");
  await p.fill("#supplier-memo", "화·금 배송");
  await p.getByRole("button", { name: "거래처 만들기" }).click();
  await p.waitForURL(/\/orders\/new\?supplier=/);
  check("발주서 작성 중 만든 거래처로 돌아옴", (await p.locator("#order-supplier option:checked").innerText()) === "빈스서플");
  await p.goto(`${BASE}/suppliers/new`);
  await p.fill("#supplier-name", "우유상회");
  await p.getByRole("button", { name: "거래처 만들기" }).click();
  await p.waitForURL(/\/suppliers\/[0-9a-f-]{36}/);

  // 2. 품목 (기본 거래처 지정)
  const bean = await createItem(p, { name: "원두", baseUnit: "g", trackExpiry: true, minStock: "2000", unit: ["봉", 1000], supplier: "빈스서플" });
  const cup = await createItem(p, { name: "컵", baseUnit: "ea", minStock: "50", unit: ["줄", 50], supplier: "빈스서플" });
  const syrup = await createItem(p, { name: "시럽", baseUnit: "ml", minStock: "0", supplier: "빈스서플" });
  const milk = await createItem(p, { name: "우유", baseUnit: "ml", minStock: "5000", unit: ["팩", 1000], supplier: "우유상회" });
  // 원두는 500g 있음 → 부족 / 시럽은 1000ml 있음 → 충분 (기준 0)
  await p.goto(`${BASE}/stock?item=${bean}`);
  await p.selectOption("#stock-unit", "");
  await p.fill("#stock-quantity", "500");
  await p.fill("#stock-price", "24");
  await p.fill("#stock-expires", kstDate(3));
  await p.getByRole("button", { name: "입고 기록" }).click();
  await p.waitForFunction(() => document.querySelector("#stock-quantity").value === "");
  await p.goto(`${BASE}/stock?item=${syrup}`);
  await p.fill("#stock-quantity", "1000");
  await p.getByRole("button", { name: "입고 기록" }).click();
  await p.waitForFunction(() => document.querySelector("#stock-quantity").value === "");

  await p.goto(`${BASE}/suppliers`);
  const supplierText = await main(p);
  check("거래처 목록: 연락처·메모", supplierText.includes("010-1234-5678 · 화·금 배송") && supplierText.includes("우유상회"));

  // 3. 새 발주 + 부족 품목 바로 담기
  await p.goto(`${BASE}/orders/new`);
  await p.selectOption("#order-supplier", { label: "빈스서플" });
  check("부족 품목 2개 (원두, 컵) 담기 안내", (await main(p)).includes("부족 품목 2개 바로 담기"));
  await p.selectOption("#order-supplier", { label: "우유상회" });
  check("거래처 바꾸면 추천 수 갱신 (우유 1개)", (await main(p)).includes("부족 품목 1개 바로 담기"));
  await p.selectOption("#order-supplier", { label: "빈스서플" });
  await p.fill("#order-expected", kstDate(2));
  await p.fill("#order-memo", "오전 배송 부탁");
  await p.getByRole("button", { name: "발주서 만들기" }).click();
  await p.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  const orderUrl = p.url();
  const orderId = orderUrl.split("/").pop();
  let text = await main(p);
  check("작성 중 + 원두·컵 담김", text.includes("작성 중") && text.includes("품목 2개"));
  check("추천 수량: 원두 4봉(기준 2,000×2 − 500 → 3.5 올림), 컵 2줄", (await p.getByLabel("원두 수량").inputValue()) === "4" && (await p.getByLabel("컵 수량").inputValue()) === "2");
  check("추천 단가: 원두 1봉 24,000원 (최근 입고 24원/g)", (await p.getByLabel("원두 단가").inputValue()) === "24000");
  check("컵은 입고 단가 없음", (await p.getByLabel("컵 단가").inputValue()) === "");

  // 4. 줄 수정·추가·중복·삭제
  await p.getByLabel("원두 수량").fill("3");
  await p.locator("li", { has: p.getByLabel("원두 수량") }).getByRole("button", { name: "저장" }).click();
  await p.waitForFunction(() => document.querySelector("main").innerText.includes("72,000원"));
  check("원두 3봉 × 24,000원 = 72,000원", true);
  await p.getByLabel("컵 단가").fill("5,000");
  await p.locator("li", { has: p.getByLabel("컵 단가") }).getByRole("button", { name: "저장" }).click();
  await p.waitForFunction(() => document.querySelector("main").innerText.includes("품목 2개 · 82,000원"));
  check("합계 82,000원", true);
  check("담을 품목 선택지에서 이미 담긴 원두·컵 제외", !(await p.locator("#line-item option").allInnerTexts()).some((o) => o.startsWith("원두") || o.startsWith("컵")));
  await p.selectOption("#line-item", syrup);
  await p.fill("#line-quantity", "2000");
  await p.fill("#line-price", "15");
  await p.getByRole("button", { name: "담기", exact: true }).click();
  await p.getByText("품목을 담았습니다.").waitFor();
  check("시럽 담기 (기본 단위)", (await main(p)).includes("품목 3개"));
  await p.getByRole("button", { name: "시럽 빼기" }).click();
  await p.getByText("품목을 뺐습니다.").waitFor();
  await p.waitForFunction(() => document.querySelector("main").innerText.includes("품목 2개"), null, { timeout: 5000 }).catch(() => {});
  check("시럽 빼기", (await main(p)).includes("품목 2개"));
  await p.screenshot({ path: `${SHOTS}01-draft.png`, fullPage: true });

  // 5. 발주 → 줄 수정 불가 → 복사 → 되돌리기 → 다시 발주
  await p.getByRole("button", { name: /발주하기 · 82,000원/ }).click();
  await p.getByText("발주했습니다.").waitFor();
  await p.getByLabel("원두 수량").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  text = await main(p);
  check("발주함 상태, 줄 편집 칸 사라짐", text.includes("발주함") && (await p.getByLabel("원두 수량").count()) === 0);
  await p.getByRole("button", { name: "발주 내용 복사" }).click();
  await p.getByText("발주 내용을 복사했습니다.").waitFor();
  const copied = await p.evaluate(() => navigator.clipboard.readText());
  check("복사 내용: 매장·희망일·품목·메모", copied.includes(`[발주테스트 ${stamp}] 발주 요청`) && copied.includes("- 원두 3봉") && copied.includes("- 컵 2줄") && copied.includes("메모: 오전 배송 부탁") && copied.includes("입고 희망일"), copied.replace(/\n/g, " / "));
  await p.getByRole("button", { name: "작성 중으로 되돌리기" }).click();
  await p.getByText("작성 중으로 되돌렸습니다.").waitFor();
  await p.getByLabel("원두 수량").waitFor({ timeout: 5000 }).catch(() => {});
  check("되돌리기 → 다시 편집 가능", (await p.getByLabel("원두 수량").count()) === 1);
  await p.getByRole("button", { name: /발주하기/ }).click();
  await p.getByText("발주했습니다.").waitFor();

  // 6. 대시보드 입고 예정
  await p.goto(`${BASE}/dashboard`);
  text = await main(p);
  check("대시보드 입고 예정 1건", text.includes("입고 예정 1건") && text.includes("빈스서플"));

  // 7. 일부 입고: 원두 2봉 (유통기한 필수)
  await p.goto(orderUrl);
  check("남은 수량 미리 채움 (원두 3, 컵 2)", (await p.getByLabel("원두 이번 입고 수량").inputValue()) === "3" && (await p.getByLabel("컵 이번 입고 수량").inputValue()) === "2");
  await p.getByLabel("원두 이번 입고 수량").fill("2");
  await p.getByLabel("컵 이번 입고 수량").fill("0");
  await p.getByRole("button", { name: /입고 처리 · 1개 품목/ }).click();
  check("유통기한 필수 (브라우저 검사)", await p.getByLabel("원두 유통기한").evaluate((e) => e.validity.valueMissing));
  await p.getByLabel("원두 유통기한").fill(kstDate(30));
  await p.getByRole("button", { name: /입고 처리 · 1개 품목/ }).click();
  await p.getByText("일부 입고를 기록했습니다.").waitFor();
  check("일부 입고 → 원두 2,500g", stockOf(bean) === "2500.000" && (await main(p)).includes("일부 입고"), stockOf(bean));
  check("남은 수량으로 다시 채움 (원두 1, 컵 2)", (await p.getByLabel("원두 이번 입고 수량").inputValue()) === "1" && (await p.getByLabel("컵 이번 입고 수량").inputValue()) === "2");
  await p.screenshot({ path: `${SHOTS}02-partial.png`, fullPage: true });

  // 8. 나머지 입고 (원두 단가 25,000으로)
  await p.getByLabel("원두 단가").fill("25000");
  await p.getByLabel("원두 유통기한").fill(kstDate(40));
  await p.getByRole("button", { name: /입고 처리 · 2개 품목/ }).click();
  await p.getByText("입고를 마쳤습니다.").waitFor({ timeout: 8000 }).catch(async () => {
    results.push(`DEBUG ${(await main(p)).slice(0, 900).split(String.fromCharCode(10)).join(" / ")}`);
    throw new Error("입고 완료 알림 없음");
  });
  check("입고 완료 → 원두 3,500g, 컵 100개", stockOf(bean) === "3500.000" && stockOf(cup) === "100.000", `${stockOf(bean)}, ${stockOf(cup)}`);
  text = await main(p);
  check("완료 화면: 입고 완료, 입고 폼 없음", text.includes("입고 완료") && (await p.getByRole("button", { name: /입고 처리/ }).count()) === 0);
  const lots = sql(`select count(*) from stock_movements m join purchase_order_lines l on l.id = m.purchase_order_line_id where l.purchase_order_id = '${orderId}' and m.lot_id is not null`);
  check("원두 입고 2건 모두 로트 생성", lots === "2", lots);
  const cost = sql(`select unit_cost from item_latest_costs where item_id = '${bean}'`);
  check("최근 원가 = 25원/g (바꾼 단가)", cost === "25.0000", cost);
  await p.goto(`${BASE}/stock?item=${bean}`);
  check("입출고 기록에 '발주 입고: 빈스서플'", (await main(p)).includes("발주 입고: 빈스서플"));

  // 9. 일부 입고 후 마감, 취소
  await p.goto(`${BASE}/orders/new`);
  await p.selectOption("#order-supplier", { label: "우유상회" });
  await p.getByRole("button", { name: "발주서 만들기" }).click();
  await p.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  check("우유 추천 10팩 (기준 5,000×2 − 0)", (await p.getByLabel("우유 수량").inputValue()) === "10");
  await p.getByRole("button", { name: /발주하기/ }).click();
  await p.getByText("발주했습니다.").waitFor();
  await p.getByLabel("우유 이번 입고 수량").fill("6");
  await p.getByRole("button", { name: /입고 처리/ }).click();
  await p.getByText("일부 입고를 기록했습니다.").waitFor();
  await p.getByRole("button", { name: "남은 수량 없이 마감" }).click();
  await p.getByText("남은 수량 없이 마감했습니다.").waitFor();
  // 알림이 화면 갱신보다 조금 먼저 뜰 수 있다.
  await p.locator("main").getByText("입고 완료", { exact: true }).waitFor({ timeout: 5000 }).catch(() => {});
  check("일부 입고 후 마감 → 입고 완료, 우유 6,000ml", (await main(p)).includes("입고 완료") && stockOf(milk) === "6000.000");

  await p.goto(`${BASE}/orders/new`);
  await p.selectOption("#order-supplier", { label: "우유상회" });
  await p.uncheck('input[name="addSuggested"]').catch(() => {});
  await p.getByRole("button", { name: "발주서 만들기" }).click();
  await p.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  await p.getByRole("button", { name: "발주서 취소" }).click();
  await p.getByText("발주서를 취소했습니다.").waitFor();
  await p.locator("main").getByText("취소", { exact: true }).waitFor({ timeout: 5000 }).catch(() => {});
  check("빈 발주서 취소", (await main(p)).includes("취소"));

  await p.goto(`${BASE}/orders`);
  text = await main(p);
  check("발주 목록: 진행 중 0건, 지난 발주 3건", text.includes("진행 중 0건") && (text.match(/입고 완료/g) ?? []).length === 2 && text.includes("취소"));
  await p.screenshot({ path: `${SHOTS}03-list.png`, fullPage: true });

  // 10. 거래처 상세
  await p.goto(`${BASE}/suppliers`);
  await p.getByRole("link", { name: /빈스서플/ }).click();
  await p.waitForURL(/\/suppliers\/[0-9a-f-]{36}/);
  text = await main(p);
  check("거래처 상세: 발주 1건, 주로 주문하는 품목 3개", text.includes("최근 1건") && text.includes("주로 주문하는 품목 3개"));

  // 11. 직원은 발주 메뉴·화면 없음
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
  check("직원: 발주 메뉴 없음", (await s.locator("header").getByRole("link", { name: "발주", exact: true }).count()) === 0);
  await s.goto(orderUrl);
  check("직원: 발주서 주소 차단", (await main(s)).includes("사장과 매니저만"));
  await s.goto(`${BASE}/suppliers`);
  check("직원: 거래처 주소 차단", (await main(s)).includes("사장과 매니저만"));

  // 12. 휴대폰
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await owner.ctx.storageState() });
  const mp = await mobile.newPage();
  for (const path of ["/orders", orderUrl.replace(BASE, ""), "/orders/new", "/suppliers"]) {
    await mp.goto(`${BASE}${path}`);
    check(`휴대폰 가로 스크롤 없음 ${path.slice(0, 12)}`, !(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  }
  await mp.goto(orderUrl);
  await mp.screenshot({ path: `${SHOTS}04-mobile-order.png`, fullPage: true });
} catch (e) {
  results.push(`EXCEPTION ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  console.log(results.join("\n"));
}
