import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { deleteTestUsersByEmail, TEST_EMAIL_DOMAIN, TEST_EMAIL_PREFIX } from "./db";

export { expect };

export const MOBILE = { width: 390, height: 844 };

/** 테스트가 일부러 내는 404, Playwright 스크린샷이 넣는 스타일(caret-color) 때문에 생기는 hydration 경고는 오류로 보지 않는다. */
const EXPECTED_CONSOLE = [/status of 404/, /hydrated but some attributes/];

export type User = { ctx: BrowserContext; page: Page; email: string; name: string };

type NewPageOptions = {
  viewport?: { width: number; height: number };
  /** 이 컨텍스트의 로그인 상태로 시작 (같은 사람의 다른 기기) */
  sameLoginAs?: BrowserContext;
};

export type App = {
  /** 이번 시도에서만 쓰는 고유 값 (매장 이름 등) */
  stamp: string;
  /** 테스트 계정 이메일. 테스트가 끝나면 이 계정과 그 매장을 지운다. */
  email(role: string): string;
  /** 새 브라우저(다른 사람·다른 기기). 페이지 오류와 콘솔 오류를 모아 테스트 끝에 확인한다. */
  newPage(options?: NewPageOptions): Promise<{ ctx: BrowserContext; page: Page }>;
  /** 가입하고 매장을 만들어 대시보드까지 간 사장. 기본 템플릿은 template: true 일 때만 넣는다. */
  owner(options: { storeName: string; name?: string; template?: boolean }): Promise<User>;
  /** 사장 화면에서 초대 링크를 만들고, 새 사람이 가입해 수락한다. 대시보드에서 끝난다. */
  joinByInvite(ownerPage: Page, options?: { name?: string; viewport?: NewPageOptions["viewport"] }): Promise<User>;
};

export async function signup(page: Page, name: string, email: string) {
  await page.getByRole("tab", { name: "회원가입" }).click();
  await page.fill("#signup-name", name);
  await page.fill("#signup-email", email);
  await page.fill("#signup-password", "test1234");
  await page.getByRole("button", { name: "가입하기" }).click();
}

/** 직원 관리 화면에서 초대 링크를 만들고 그 주소를 돌려준다. */
export async function createInviteLink(ownerPage: Page) {
  await ownerPage.goto("/settings/members");
  await ownerPage.getByRole("button", { name: "초대 링크 만들기" }).click();
  const linkInput = ownerPage.locator('input[readonly][value*="/invite/"]');
  await linkInput.waitFor();
  return linkInput.inputValue();
}

export const test = base.extend<{ app: App }>({
  app: async ({ browser, baseURL }, use, testInfo) => {
    const stamp = `${Date.now()}${testInfo.workerIndex}${testInfo.retry}`;
    const emails: string[] = [];
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];

    const email = (role: string) => {
      const value = `${TEST_EMAIL_PREFIX}${role}-${stamp}${TEST_EMAIL_DOMAIN}`;
      emails.push(value);
      return value;
    };

    const newPage = async ({ viewport, sameLoginAs }: NewPageOptions = {}) => {
      const ctx = await browser.newContext({
        baseURL,
        locale: "ko-KR",
        viewport: viewport ?? { width: 1100, height: 900 },
        storageState: sameLoginAs ? await sameLoginAs.storageState() : undefined,
      });
      contexts.push(ctx);
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`페이지 오류 [${page.url()}] ${e.message}`));
      page.on("console", (m) => {
        if (m.type() !== "error" || EXPECTED_CONSOLE.some((re) => re.test(m.text()))) return;
        errors.push(`콘솔 오류 [${page.url()}] ${m.text().slice(0, 300)}`);
      });
      page.on("dialog", (d) => d.accept());
      return { ctx, page };
    };

    let ownerCount = 0;
    const owner: App["owner"] = async ({ storeName, name = "김사장", template = false }) => {
      const { ctx, page } = await newPage();
      // 한 테스트에서 사장을 여럿 만들 수 있도록 두 번째부터는 이메일을 다르게
      ownerCount += 1;
      const ownerEmail = email(ownerCount === 1 ? "owner" : `owner${ownerCount}`);
      await page.goto("/login");
      await signup(page, name, ownerEmail);
      await page.waitForURL("**/onboarding");
      await page.fill("#store-name", storeName);
      await page.setChecked("#store-template", template);
      await page.getByRole("button", { name: "매장 만들기" }).click();
      await page.waitForURL("**/dashboard");
      return { ctx, page, email: ownerEmail, name };
    };

    const joinByInvite: App["joinByInvite"] = async (ownerPage, { name = "이직원", viewport } = {}) => {
      const inviteUrl = await createInviteLink(ownerPage);
      const { ctx, page } = await newPage({ viewport });
      const staffEmail = email("staff");
      await page.goto(inviteUrl);
      await page.getByRole("link", { name: /가입하고 수락/ }).click();
      await page.waitForURL("**/login?next=*");
      await signup(page, name, staffEmail);
      await page.waitForURL("**/invite/**");
      await page.getByRole("button", { name: "초대 수락하기" }).click();
      await page.waitForURL("**/dashboard");
      return { ctx, page, email: staffEmail, name };
    };

    try {
      await use({ stamp, email, newPage, owner, joinByInvite });
      expect.soft(errors, "페이지 오류·콘솔 오류 없음").toEqual([]);
    } finally {
      await Promise.all(contexts.map((c) => c.close().catch(() => {})));
      deleteTestUsersByEmail(emails);
    }
  },
});
