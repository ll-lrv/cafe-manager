import { sql } from "../db";
import { expect, MOBILE, test } from "../fixtures";
import { check, hasHorizontalScroll, idFromUrl, main, shot } from "../helpers";

test("품목·카테고리·입고 단위", async ({ app }) => {
  const owner = await app.owner({ storeName: `품목테스트 ${app.stamp}` });
  const p = owner.page;
  let itemUrl = "";
  let itemId = "";

  await test.step("1. 품목 메뉴", async () => {
    await p.getByRole("link", { name: "품목·재고", exact: true }).click();
    await p.waitForURL("**/items");
    check("빈 품목 목록 안내", (await main(p)).includes("아직 등록한 품목이 없습니다."));
  });

  await test.step("2. 카테고리", async () => {
    await p.getByRole("link", { name: "카테고리" }).click();
    await p.waitForURL("**/items/categories");
    for (const name of ["원두", "유제품", "소모품"]) {
      await p.getByLabel("카테고리 이름").fill(name);
      await p.getByRole("button", { name: "추가", exact: true }).click();
      await p.getByLabel(`${name} 이름`).waitFor();
    }
    check("카테고리 3개 추가", (await main(p)).includes("카테고리 3개"));
    check("추가 후 입력칸 비워짐", (await p.getByLabel("카테고리 이름").inputValue()) === "");
    await p.getByLabel("카테고리 이름").fill("원두");
    await p.getByRole("button", { name: "추가", exact: true }).click();
    await p.getByText("같은 이름의 카테고리가 이미 있습니다.").first().waitFor();

    await p.getByRole("button", { name: "소모품 위로" }).click();
    await p.waitForFunction(() => {
      const inputs = [...document.querySelectorAll<HTMLInputElement>('main li input[name="name"]')].map((i) => i.value);
      return inputs.join(",") === "원두,소모품,유제품";
    });
    check("첫 카테고리에는 위로 버튼 없음", (await p.getByRole("button", { name: "원두 위로" }).count()) === 0);

    await p.getByLabel("유제품 이름").fill("유제품·우유");
    await p.getByLabel("유제품 이름").press("Enter");
    await p.getByLabel("유제품·우유 이름").waitFor();
    await shot(p, "카테고리");
  });

  await test.step("3. 품목 추가", async () => {
    await p.goto("/items/new");
    await p.fill("#item-name", "원두(하우스)");
    await p.selectOption("#item-category", { label: "원두" });
    await p.selectOption("#item-base-unit", "g");
    await p.fill("#item-min-stock", "2,000");
    await shot(p, "새 품목");
    await p.getByRole("button", { name: "품목 만들기" }).click();
    await p.waitForURL(/\/items\/[0-9a-f-]{36}\?created=1/);
    itemUrl = p.url().split("?")[0]!;
    itemId = idFromUrl(itemUrl);
    check("품목 만들기 → 상세 화면 + 안내", (await main(p)).includes("품목을 만들었습니다."));
    check("쉼표 숫자(2,000) 저장", (await p.inputValue("#item-min-stock")) === "2000");
  });

  await test.step("4. 입고 단위", async () => {
    check("첫 단위는 기본 입고 단위 체크됨", await p.isChecked("#unit-default"));
    await p.fill("#unit-name", "봉");
    await p.fill("#unit-factor", "1000");
    await p.getByRole("button", { name: "단위 추가" }).click();
    await p.getByText("기본 입고 단위", { exact: true }).waitFor();
    check("봉 추가 + 기본 입고 단위 표시", (await main(p)).includes("= 1,000g"));
    check("단위 추가 후 입력칸 비워짐", (await p.inputValue("#unit-name")) === "");
    check("두 번째 단위는 기본 체크 해제", !(await p.isChecked("#unit-default")));

    await p.fill("#unit-name", "박스");
    await p.fill("#unit-factor", "5000");
    await p.getByRole("button", { name: "단위 추가" }).click();
    await p.getByText("= 5,000g").waitFor();

    await p.fill("#unit-name", "봉");
    await p.fill("#unit-factor", "500");
    await p.getByRole("button", { name: "단위 추가" }).click();
    await p.getByText("같은 이름의 단위가 이미 있습니다.").first().waitFor();
    check("단위 오류 후 입력값 유지", (await p.inputValue("#unit-factor")) === "500");

    await p.fill("#unit-name", "잘못");
    await p.fill("#unit-factor", "0");
    await p.getByRole("button", { name: "단위 추가" }).click();
    await p.getByText("환산 수량은 0보다 큰 숫자로 입력해 주세요.").first().waitFor();

    await p.getByRole("button", { name: "기본으로" }).click();
    await p.waitForFunction(() => {
      const li = [...document.querySelectorAll("main li")].find((l) => l.textContent?.includes("1박스"));
      return li?.textContent?.includes("기본 입고 단위");
    });
    const defaults = sql(`select string_agg(name, ',') from item_units where item_id = '${itemId}' and is_default_purchase`);
    check("기본 입고 단위를 박스로 변경 (DB에 하나만)", defaults === "박스", defaults);

    await p.getByRole("button", { name: "박스 단위 삭제" }).click();
    await p.waitForFunction(() => ![...document.querySelectorAll("main li")].some((l) => l.textContent?.includes("1박스")));
    await expect(p.getByText("단위를 삭제했습니다.")).toBeVisible();
    await shot(p, "품목 상세");
  });

  await test.step("5. 품목 수정", async () => {
    const before = sql(`select updated_at from items where id = '${itemId}'`);
    await p.fill("#item-min-stock", "3000");
    await p.check("#item-track-expiry");
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await p.getByText("저장했습니다.").waitFor();
    await p.reload();
    check(
      "수정 내용 유지 (부족 기준 3000, 유통기한)",
      (await p.inputValue("#item-min-stock")) === "3000" && (await p.isChecked("#item-track-expiry")),
    );
    const after = sql(`select updated_at from items where id = '${itemId}'`);
    check("updated_at 트리거로 갱신", before !== after, `${before} → ${after}`);
  });

  await test.step("6. 다른 품목 + 중복 이름", async () => {
    const others: [string, string, string][] = [
      ["우유", "유제품·우유", "ml"],
      ["테이크아웃 컵(16oz)", "소모품", "ea"],
      ["바닐라 시럽", "", "ml"],
    ];
    for (const [name, cat, unit] of others) {
      await p.goto("/items/new");
      await p.fill("#item-name", name);
      if (cat) await p.selectOption("#item-category", { label: cat });
      await p.selectOption("#item-base-unit", unit);
      await p.getByRole("button", { name: "품목 만들기" }).click();
      await p.waitForURL(/\/items\/[0-9a-f-]{36}/);
    }
    await p.goto("/items/new");
    await p.fill("#item-name", "우유");
    await p.getByRole("button", { name: "품목 만들기" }).click();
    await p.getByText("같은 이름의 품목이 이미 있습니다.").waitFor();
    check("중복 품목 이름 안내 (화면 유지)", p.url().endsWith("/items/new"));
    check("오류 후에도 입력값 유지", (await p.inputValue("#item-name")) === "우유");
  });

  await test.step("7. 목록 검색·필터", async () => {
    await p.goto("/items");
    const listText = await main(p);
    check("목록에 4개 품목", ["원두(하우스)", "우유", "테이크아웃 컵(16oz)", "바닐라 시럽"].every((n) => listText.includes(n)));
    check("목록에 단위와 부족 기준 표시", listText.includes("부족 기준 3,000g"));
    await p.getByLabel("품목 검색").fill("컵");
    const searched = await p.locator("main ul").innerText();
    check("검색: '컵' → 컵만", searched.includes("테이크아웃 컵") && !searched.includes("우유"));
    await p.getByLabel("품목 검색").fill("");
    await p.getByRole("button", { name: "미분류" }).click();
    const uncategorized = await p.locator("main ul").innerText();
    check("미분류 필터 → 시럽만", uncategorized.includes("바닐라 시럽") && !uncategorized.includes("우유"));
    await p.getByRole("button", { name: "유제품·우유" }).click();
    check("카테고리 필터 → 우유만", (await p.locator("main ul").innerText()).includes("우유"));
    await p.getByRole("button", { name: "전체" }).click();
    await shot(p, "품목 목록");
  });

  await test.step("8. 기본 단위 잠금 (입출고 기록이 생긴 품목)", async () => {
    const ownerId = sql(`select id from auth.users where email = '${owner.email}'`);
    const storeId = sql(`select store_id from items where id = '${itemId}'`);
    sql(
      `insert into stock_movements (store_id, item_id, type, quantity, created_by) values ('${storeId}', '${itemId}', 'receive', 1000, '${ownerId}')`,
    );
    await p.goto(itemUrl);
    check("입출고 기록 있으면 기본 단위 선택 잠김", await p.isDisabled("#item-base-unit"));
    check("잠김 안내 문구", (await main(p)).includes("입출고·레시피에 쓰여서 바꿀 수 없습니다."));
    await p.fill("#item-min-stock", "2500");
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await p.getByText("저장했습니다.").waitFor();
    check(
      "잠긴 상태에서도 다른 항목 저장 가능",
      sql(`select base_unit || '/' || min_stock from items where id = '${itemId}'`) === "g/2500.000",
    );
    const triggerResult = sql(`update items set base_unit = 'ml' where id = '${itemId}'`);
    check("DB 트리거가 기본 단위 변경 차단", triggerResult.includes("기본 단위를 바꿀 수 없습니다"));
  });

  await test.step("9. 보관", async () => {
    await p.getByRole("button", { name: "보관" }).click();
    await p.getByText("보관됨").first().waitFor();
    await p.goto("/items");
    check("보관 품목은 목록에서 숨김", !(await p.locator("main ul").innerText()).includes("원두(하우스)"));
    await p.getByText(/보관된 품목도 보기/).click();
    check("보관 품목 보기 토글", (await p.locator("main ul").innerText()).includes("원두(하우스)"));
    await p.goto(itemUrl);
    await p.getByRole("button", { name: "다시 사용" }).click();
    await p.getByRole("button", { name: "보관" }).waitFor();
    check("다시 사용", sql(`select archived_at is null from items where id = '${itemId}'`) === "t");
  });

  await test.step("10. 카테고리 삭제 → 미분류", async () => {
    await p.goto("/items/categories");
    check("카테고리별 품목 수 표시", (await main(p)).includes("품목 1개"));
    await p.getByRole("button", { name: "소모품 삭제" }).click();
    await p.waitForFunction(
      () => ![...document.querySelectorAll<HTMLInputElement>('main li input[name="name"]')].some((i) => i.value === "소모품"),
    );
    await p.goto("/items");
    await p.getByRole("button", { name: "미분류" }).click();
    check("카테고리 삭제 후 컵은 미분류", (await p.locator("main ul").innerText()).includes("테이크아웃 컵"));
  });

  await test.step("11. 직원 권한: 보기만", async () => {
    const { page: s } = await app.joinByInvite(p);
    await s.getByRole("link", { name: "품목·재고", exact: true }).click();
    await s.waitForURL("**/items");
    const staffList = await main(s);
    check("직원도 품목 목록 조회", staffList.includes("원두(하우스)"));
    check(
      "직원에게 품목 추가·카테고리 버튼 숨김",
      !staffList.includes("품목 추가") && (await s.getByRole("link", { name: "카테고리" }).count()) === 0,
    );
    await s.goto(itemUrl);
    check("직원 상세: 입력칸 비활성", await s.isDisabled("#item-name"));
    check("직원 상세: 저장·단위추가·보관 버튼 없음", (await s.getByRole("button", { name: /저장|단위 추가|보관/ }).count()) === 0);
    await shot(s, "직원 품목 상세");
    await s.goto("/items/new");
    check("직원 /items/new 직접 접근 차단", (await main(s)).includes("사장과 매니저만"));
    await s.goto("/items/categories");
    check("직원 카테고리 화면 직접 접근 차단", (await main(s)).includes("사장과 매니저만"));
  });

  await test.step("12. 없는 품목", async () => {
    const nf = await p.goto("/items/00000000-0000-0000-0000-000000000000");
    check("없는 품목 → 404", nf?.status() === 404);
    const bad = await p.goto("/items/not-a-uuid");
    check("잘못된 ID → 404", bad?.status() === 404);
  });

  await test.step("13. 휴대폰 화면", async () => {
    const { page: mp } = await app.newPage({ viewport: MOBILE, sameLoginAs: owner.ctx });
    const itemPath = new URL(itemUrl).pathname;
    for (const [path, label] of [["/items", "/items"], [itemPath, "/items/[id]"], ["/items/categories", "/items/categories"], ["/items/new", "/items/new"]] as const) {
      await mp.goto(path);
      check(`휴대폰 너비 가로 스크롤 없음 ${label}`, !(await hasHorizontalScroll(mp)));
    }
    await mp.goto("/items");
    await shot(mp, "휴대폰 품목 목록");
    await mp.goto(itemPath);
    await shot(mp, "휴대폰 품목 상세");
  });
});
