import { expect, MOBILE, signup, test } from "../fixtures";
import { check, hasHorizontalScroll, main, shot } from "../helpers";

test("가입·매장 만들기·직원 초대·권한", async ({ app }) => {
  const storeName = `테스트 카페 성수점 ${app.stamp}`;
  const owner = await app.newPage();
  const o = owner.page;
  const staffEmail = app.email("staff");
  let inviteUrl = "";

  await test.step("1. 사장 가입 → 매장 없음 → 매장 만들기", async () => {
    await o.goto("/dashboard");
    await o.waitForURL("**/login**");
    check("비로그인 → /login", o.url().includes("/login"));
    await shot(o, "로그인");
    await signup(o, "김사장", app.email("owner"));
    await o.waitForURL("**/onboarding");
    await o.fill("#store-name", storeName);
    await o.getByRole("button", { name: "매장 만들기" }).click();
    await o.waitForURL("**/dashboard");
    const header = await o.locator("header").innerText();
    check("대시보드 헤더에 매장 이름과 사장 표시", header.includes(storeName) && header.includes("사장"));
    check("사장에게 직원 관리 메뉴 보임", header.includes("직원 관리"));
    await shot(o, "대시보드");
  });

  await test.step("2. 직원 초대 링크 만들기", async () => {
    await o.getByRole("link", { name: "직원 관리" }).click();
    await o.waitForURL("**/settings/members");
    await o.fill("#invite-email", "알바 이영희");
    await o.getByRole("button", { name: "초대 링크 만들기" }).click();
    const linkInput = o.locator('input[readonly][value*="/invite/"]');
    await linkInput.waitFor();
    inviteUrl = await linkInput.inputValue();
    check("초대 링크 생성", /\/invite\/[0-9a-f]{32}$/.test(inviteUrl), inviteUrl);
    check("초대 링크를 만들면 메모 칸 비움", (await o.inputValue("#invite-email")) === "");
    await expect(o.getByText("대기 중인 초대 1건")).toBeVisible();
    await shot(o, "직원 초대");
  });

  const staff = await app.newPage();
  const s = staff.page;

  await test.step("3. 직원: 초대 링크 → 가입 → 수락", async () => {
    await s.goto(inviteUrl);
    const inviteText = await main(s);
    check("비로그인 상태로 초대 미리보기", inviteText.includes(storeName) && inviteText.includes("직원"));
    await shot(s, "초대 미리보기");
    await s.getByRole("link", { name: /가입하고 수락/ }).click();
    await s.waitForURL("**/login?next=*");
    await signup(s, "이영희", staffEmail);
    await s.waitForURL("**/invite/**");
    await s.getByRole("button", { name: "초대 수락하기" }).click();
    await s.waitForURL("**/dashboard");
    const staffHeader = await s.locator("header").innerText();
    check("직원 대시보드: 매장 이름과 직원 표시", staffHeader.includes(storeName) && staffHeader.includes("직원"));
    check("직원에게 직원 관리 메뉴 숨김", !staffHeader.includes("직원 관리"));
    await s.goto("/settings/members");
    check("직원이 직원 관리 주소로 직접 접근 시 차단", (await main(s)).includes("사장만"));
  });

  await test.step("4. 같은 초대 링크 재사용 불가", async () => {
    const third = await app.newPage();
    await third.page.goto(inviteUrl);
    check("사용된 초대 링크는 사용 불가", (await main(third.page)).includes("사용할 수 없는 초대"));
  });

  await test.step("5. 사장: 구성원 목록과 역할 변경", async () => {
    await o.reload();
    check("구성원 2명", (await main(o)).includes("구성원 2명"));
    check("초대가 대기 목록에서 사라짐", !(await main(o)).includes("대기 중인 초대"));
    await o.getByLabel("역할 변경").selectOption("manager");
    await expect(o.getByText("역할을 변경했습니다.")).toBeVisible();
    await s.goto("/dashboard");
    check("변경된 역할이 직원 화면에 반영", (await s.locator("header").innerText()).includes("매니저"));
    await shot(o, "구성원 목록");
  });

  await test.step("6. 로그아웃", async () => {
    await s.getByRole("button", { name: "로그아웃" }).click();
    await s.waitForURL("**/login");
  });

  await test.step("7. 잘못된 비밀번호", async () => {
    await s.fill("#login-email", staffEmail);
    await s.fill("#login-password", "wrongpass");
    await s.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(s.getByText("이메일 또는 비밀번호가 올바르지 않습니다.")).toBeVisible();
    check(
      "로그인 실패 후 입력값 유지",
      (await s.inputValue("#login-email")) === staffEmail && (await s.inputValue("#login-password")) === "wrongpass",
    );
  });

  await test.step("8. 휴대폰 화면", async () => {
    const mobile = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    await mobile.page.goto("/settings/members");
    check("휴대폰 너비에서 가로 스크롤 없음", !(await hasHorizontalScroll(mobile.page)));
    await shot(mobile.page, "휴대폰 직원 관리");
  });
});
