import { expect, test, type Page } from "@playwright/test";

/** 확인 항목 하나. 실패해도 시나리오는 끝까지 진행하고, 실패한 항목을 모두 모아 보여준다. */
export function check(label: string, ok: boolean, detail?: unknown) {
  expect.soft(ok, detail === undefined ? label : `${label} (${String(detail)})`).toBe(true);
}

/** 화면 본문 텍스트 */
export const main = (page: Page) => page.locator("main").innerText();

/** 그 시간대 기준 오늘 + n일 (YYYY-MM-DD) */
export const zonedDate = (timeZone: string, n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(Date.now() + n * 86_400_000));

/** 한국(매장 기본 시간대) 기준 오늘 + n일 (YYYY-MM-DD) */
export const kstDate = (n: number) => zonedDate("Asia/Seoul", n);

/** 주소 끝의 ID (`/items/<id>?created=1` → `<id>`) */
export function idFromUrl(url: string): string {
  const id = new URL(url).pathname.split("/").pop();
  if (!id) throw new Error(`주소에 ID가 없습니다: ${url}`);
  return id;
}

/** 가로 스크롤이 생기는지 (휴대폰 화면 확인용) */
export const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

/** 사람이 볼 스크린샷을 HTML 리포트에 붙인다. */
export async function shot(page: Page, name: string) {
  await test.info().attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

/** 실시간 구독이 연결될 때까지 기다린다. 화면을 연 직후 다른 기기에서 기록하는 테스트에서 쓴다. */
export const waitForRealtime = (page: Page) => page.waitForTimeout(1500);

/** 다른 기기에서 바꾼 내용이 새로고침 없이 화면에 나타나는지 (실시간 반영 확인) */
export const appearsLive = (page: Page, text: string, selector = "main") => waitLive(page, text, selector, true);

/** 다른 기기에서 바꾼 내용 때문에 새로고침 없이 화면에서 사라지는지 (예: 판매 취소) */
export const disappearsLive = (page: Page, text: string, selector = "main") => waitLive(page, text, selector, false);

async function waitLive(page: Page, text: string, selector: string, present: boolean) {
  try {
    await page.waitForFunction(
      ([sel, t, want]) => ((document.querySelector(sel) as HTMLElement | null)?.innerText.includes(t) ?? false) === want,
      [selector, text, present] as const,
      { timeout: 8000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function addCategory(p: Page, name: string) {
  await p.goto("/items/categories");
  await p.getByLabel("카테고리 이름").fill(name);
  await p.getByRole("button", { name: "추가", exact: true }).click();
  await p.getByLabel(`${name} 이름`).waitFor();
}

export async function createItem(
  p: Page,
  options: {
    name: string;
    baseUnit: "g" | "ml" | "ea";
    category?: string;
    trackExpiry?: boolean;
    minStock?: string;
    supplier?: string;
    /** 입고 단위 [이름, 기본 단위 환산 수량]. 첫 단위라 기본 입고 단위가 된다. */
    unit?: [string, number];
  },
) {
  await p.goto("/items/new");
  await p.fill("#item-name", options.name);
  if (options.category) await p.selectOption("#item-category", { label: options.category });
  await p.selectOption("#item-base-unit", options.baseUnit);
  if (options.minStock) await p.fill("#item-min-stock", options.minStock);
  if (options.trackExpiry) await p.check("#item-track-expiry");
  if (options.supplier) await p.selectOption("#item-supplier", { label: options.supplier });
  await p.getByRole("button", { name: "품목 만들기" }).click();
  await p.waitForURL(/\/items\/[0-9a-f-]{36}/);
  const id = idFromUrl(p.url());
  if (options.unit) {
    await p.fill("#unit-name", options.unit[0]);
    await p.fill("#unit-factor", String(options.unit[1]));
    await p.getByRole("button", { name: "단위 추가" }).click();
    await p.getByText("기본 입고 단위", { exact: true }).waitFor();
  }
  return id;
}

/** 입출고 화면에서 기록한다. 성공하면 수량 칸이 비워지는 것으로 완료를 확인한다. */
export async function recordStock(
  p: Page,
  options: {
    itemId: string;
    type?: "입고" | "사용" | "폐기";
    quantity: number | string;
    price?: string;
    expiresOn?: string;
    /** 폐기 사유 (폐기일 때, 기본 "유통기한 지남") */
    wasteReason?: string;
  },
) {
  const type = options.type ?? "입고";
  await p.goto(`/stock?item=${options.itemId}`);
  await p.getByRole("button", { name: type, exact: true }).click();
  await p.fill("#stock-quantity", String(options.quantity));
  if (options.price) await p.fill("#stock-price", options.price);
  if (options.expiresOn) await p.fill("#stock-expires", options.expiresOn);
  if (type === "폐기") await p.selectOption("#stock-waste-reason", { label: options.wasteReason ?? "유통기한 지남" });
  await p.getByRole("button", { name: `${type} 기록` }).click();
  await p.waitForFunction(() => (document.querySelector("#stock-quantity") as HTMLInputElement).value === "");
}

export async function createMenu(p: Page, name: string, price: string) {
  await p.goto("/menus/new");
  await p.fill("#menu-name", name);
  await p.fill("#menu-price", price);
  await p.getByRole("button", { name: "메뉴 만들기" }).click();
  await p.waitForURL(/\/menus\/[0-9a-f-]{36}/);
  return idFromUrl(p.url());
}

/** 메뉴 상세에서 레시피 재료를 넣는다 (이미 있으면 사용량을 바꾼다). */
export async function addIngredient(p: Page, itemId: string, quantity: number, unitLabel?: string) {
  await p.selectOption("#recipe-item", itemId);
  await p.fill("#recipe-quantity", String(quantity));
  if (unitLabel) await p.selectOption("#recipe-unit", { label: unitLabel });
  await p.getByRole("button", { name: /재료 넣기|사용량 바꾸기/ }).click();
  await p.waitForFunction(() => (document.querySelector("#recipe-quantity") as HTMLInputElement).value === "");
}

/** 판매 화면에서 입력한 수량을 기록한다. 기록 후 버튼이 빈 상태 문구로 바뀌는 것으로 완료를 확인한다. */
export async function submitSales(p: Page) {
  await p.getByRole("button", { name: /판매 기록 ·/ }).click();
  await p.getByRole("button", { name: "판매 수량을 입력해 주세요" }).waitFor();
}
