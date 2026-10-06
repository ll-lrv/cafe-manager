import { chromium } from "playwright-core";
import { BASE, CHROME_PATH, shotsDir } from "./config.mjs";

const SHOTS = shotsDir("auth");
const stamp = Date.now();
const results = [];
const check = (label, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` (${extra})` : ""}`);
};

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
});

async function newUser() {
  const ctx = await browser.newContext({ locale: "ko-KR", viewport: { width: 1100, height: 800 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.push(`PAGE ERROR ${e.message}`));
  page.on("console", (m) => m.type() === "error" && results.push(`CONSOLE ERROR ${m.text().slice(0, 200)}`));
  return { ctx, page };
}

async function signup(page, name, email) {
  await page.getByRole("tab", { name: "회원가입" }).click();
  await page.fill("#signup-name", name);
  await page.fill("#signup-email", email);
  await page.fill("#signup-password", "test1234");
  await page.getByRole("button", { name: "가입하기" }).click();
}

try {
  // 1. 사장 가입 → 매장 없음 → 매장 만들기
  const owner = await newUser();
  await owner.page.goto(BASE);
  check("비로그인 → /login", owner.page.url().includes("/login"));
  await owner.page.waitForLoadState("networkidle");
  await owner.page.screenshot({ path: `${SHOTS}01-login.png` });

  await signup(owner.page, "김사장", `owner${stamp}@test.kr`);
  await owner.page.waitForURL("**/onboarding");
  check("가입 후 매장 없으면 /onboarding", true);
  await owner.page.screenshot({ path: `${SHOTS}02-onboarding.png` });

  await owner.page.fill("#store-name", "테스트 카페 성수점");
  await owner.page.getByRole("button", { name: "매장 만들기" }).click();
  await owner.page.waitForURL("**/dashboard");
  const header = await owner.page.locator("header").innerText();
  check("대시보드 헤더에 매장 이름과 사장 표시", header.includes("테스트 카페 성수점") && header.includes("사장"));
  check("사장에게 직원 관리 메뉴 보임", header.includes("직원 관리"));
  await owner.page.screenshot({ path: `${SHOTS}03-dashboard.png` });

  // 2. 직원 초대 링크 만들기
  await owner.page.getByRole("link", { name: "직원 관리" }).click();
  await owner.page.waitForURL("**/settings/members");
  await owner.page.fill("#invite-email", "알바 이영희");
  await owner.page.getByRole("button", { name: "초대 링크 만들기" }).click();
  const linkInput = owner.page.locator('input[readonly][value*="/invite/"]');
  await linkInput.waitFor();
  const inviteUrl = await linkInput.inputValue();
  check("초대 링크 생성", /\/invite\/[0-9a-f]{32}$/.test(inviteUrl), inviteUrl);
  await owner.page.getByText("대기 중인 초대 1건").waitFor();
  check("대기 중인 초대 목록에 표시", true);
  await owner.page.screenshot({ path: `${SHOTS}04-members-invite.png`, fullPage: true });

  // 3. 직원: 초대 링크 → 가입 → 수락
  const staff = await newUser();
  await staff.page.goto(inviteUrl);
  const inviteText = await staff.page.locator("main").innerText();
  check("비로그인 상태로 초대 미리보기", inviteText.includes("테스트 카페 성수점") && inviteText.includes("직원"));
  await staff.page.screenshot({ path: `${SHOTS}05-invite-preview.png` });

  await staff.page.getByRole("link", { name: /가입하고 수락/ }).click();
  await staff.page.waitForURL("**/login?next=*");
  await signup(staff.page, "이영희", `staff${stamp}@test.kr`);
  await staff.page.waitForURL("**/invite/**");
  check("가입 후 초대 페이지로 복귀", true);
  await staff.page.getByRole("button", { name: "초대 수락하기" }).click();
  await staff.page.waitForURL("**/dashboard");
  const staffHeader = await staff.page.locator("header").innerText();
  check("직원 대시보드: 매장 이름과 직원 표시", staffHeader.includes("테스트 카페 성수점") && staffHeader.includes("직원"));
  check("직원에게 직원 관리 메뉴 숨김", !staffHeader.includes("직원 관리"));
  await staff.page.goto(`${BASE}/settings/members`);
  check("직원이 직원 관리 주소로 직접 접근 시 차단", (await staff.page.locator("main").innerText()).includes("사장만"));

  // 4. 같은 초대 링크 재사용 불가
  const third = await newUser();
  await third.page.goto(inviteUrl);
  check("사용된 초대 링크는 사용 불가", (await third.page.locator("main").innerText()).includes("사용할 수 없는 초대"));

  // 5. 사장: 구성원 목록과 역할 변경
  await owner.page.reload();
  check("구성원 2명", (await owner.page.locator("main").innerText()).includes("구성원 2명"));
  check("초대가 대기 목록에서 사라짐", !(await owner.page.locator("main").innerText()).includes("대기 중인 초대"));
  await owner.page.getByLabel("역할 변경").selectOption("manager");
  await owner.page.getByText("역할을 변경했습니다.").waitFor();
  check("직원 → 매니저 역할 변경", true);
  await staff.page.goto(`${BASE}/dashboard`);
  check("변경된 역할이 직원 화면에 반영", (await staff.page.locator("header").innerText()).includes("매니저"));
  await owner.page.screenshot({ path: `${SHOTS}06-members-list.png`, fullPage: true });

  // 6. 로그아웃
  await staff.page.getByRole("button", { name: "로그아웃" }).click();
  await staff.page.waitForURL("**/login");
  check("로그아웃 후 /login", true);

  // 7. 잘못된 비밀번호
  await staff.page.fill("#login-email", `staff${stamp}@test.kr`);
  await staff.page.fill("#login-password", "wrongpass");
  await staff.page.getByRole("button", { name: "로그인", exact: true }).click();
  await staff.page.getByText("이메일 또는 비밀번호가 올바르지 않습니다.").waitFor();
  check("잘못된 비밀번호 안내 메시지", true);

  // 8. 휴대폰 화면
  const mobile = await browser.newContext({ ...{ viewport: { width: 390, height: 844 } }, storageState: await owner.ctx.storageState() });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/settings/members`);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("휴대폰 너비에서 가로 스크롤 없음", !overflow);
  await mp.screenshot({ path: `${SHOTS}07-mobile-members.png`, fullPage: true });
} catch (e) {
  results.push(`FAIL  예외: ${e.message.split("\n")[0]}`);
} finally {
  console.log(results.join("\n"));
  await browser.close();
}
