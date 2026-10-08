import { describe, expect, it } from "vitest";
import {
  allocateFifo,
  can,
  costChangePercent,
  costRate,
  countAdjustments,
  decodeCsv,
  findHeaderRow,
  guessColumns,
  matchMenus,
  parseCsv,
  parseImportNumber,
  parseSaleDateTime,
  readSaleRows,
  summarizeNames,
  isNotableCostChange,
  menuCostImpacts,
  effectiveTargetRate,
  isOverTarget,
  menuProfitLines,
  applyOptions,
  optionLineName,
  suggestedPrice,
  dateInTimeZone,
  daysUntilExpiry,
  expiryLabel,
  expiryStatus,
  isValidTimeZone,
  derivePurchaseOrderStatus,
  formatQuantity,
  formatUnitCount,
  CAFE_TEMPLATE,
  avtLine,
  avtSummary,
  sortAvtLines,
  oneUnitLabel,
  fromBaseQuantity,
  mergeDeltas,
  orderTotal,
  recipeCost,
  roundQty,
  saleDeductions,
  stockStatus,
  suggestOrderQuantity,
  zonedTimeToUtc,
  toBaseQuantity,
  toBaseUnitCost,
} from "./index";

describe("units", () => {
  const bag = { id: "u1", name: "봉", factor: 1000 };

  it("입력 단위를 기본 단위로 환산한다", () => {
    expect(toBaseQuantity(2, bag)).toBe(2000);
    expect(toBaseQuantity(1.5)).toBe(1.5);
    expect(fromBaseQuantity(2500, bag)).toBe(2.5);
  });

  it("단위 가격을 기본 단위 원가로 환산한다", () => {
    expect(toBaseUnitCost(25000, bag)).toBe(25);
    expect(toBaseUnitCost(100)).toBe(100);
  });

  it("큰 단위를 섞어서 표시한다", () => {
    expect(formatQuantity(2350, "g", bag)).toBe("2봉 + 350g");
    expect(formatQuantity(2000, "g", bag)).toBe("2봉");
    expect(formatQuantity(350, "g", bag)).toBe("350g");
    expect(formatQuantity(12, "ea")).toBe("12개");
  });

  it("숫자로 시작하는 단위 이름은 수량과 나눠 쓴다", () => {
    const pack = { id: "u2", name: "1L 팩", factor: 1000 };
    const bundle = { id: "u3", name: "50개 묶음", factor: 50 };
    expect(formatQuantity(1000, "ml", pack)).toBe("1 × 1L 팩");
    expect(formatQuantity(2500, "ml", pack)).toBe("2 × 1L 팩 + 500ml");
    expect(formatQuantity(135, "ea", bundle)).toBe("2 × 50개 묶음 + 35개");
    expect(formatUnitCount(1.5, "봉")).toBe("1.5봉");
    expect(formatUnitCount(3, "1kg 봉")).toBe("3 × 1kg 봉");
    expect(oneUnitLabel("봉")).toBe("1봉");
    expect(oneUnitLabel("1L 팩")).toBe("1L 팩");
  });

  it("부동소수 오차를 없앤다", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });
});

describe("recipe", () => {
  it("판매 수량만큼 재료를 차감한다", () => {
    const americano = [
      { itemId: "beans", quantity: 18 },
      { itemId: "cup", quantity: 1 },
    ];
    expect(saleDeductions(americano, 3)).toEqual([
      { itemId: "beans", quantity: -54 },
      { itemId: "cup", quantity: -3 },
    ]);
  });

  it("같은 품목은 합치고 0은 뺀다", () => {
    expect(
      mergeDeltas([
        { itemId: "a", quantity: -1 },
        { itemId: "a", quantity: -2 },
        { itemId: "b", quantity: 1 },
        { itemId: "b", quantity: -1 },
      ]),
    ).toEqual([{ itemId: "a", quantity: -3 }]);
  });

  it("판매 수량은 양의 정수여야 한다", () => {
    expect(() => saleDeductions([], 0)).toThrow();
  });
});

describe("fifo", () => {
  const lots = [
    { lotId: "late", expiresOn: "2026-10-20", receivedAt: "2026-10-01", quantity: 1000 },
    { lotId: "none", expiresOn: null, receivedAt: "2026-09-01", quantity: 1000 },
    { lotId: "early", expiresOn: "2026-10-10", receivedAt: "2026-10-02", quantity: 500 },
  ];

  it("유통기한이 빠른 로트부터 꺼낸다", () => {
    expect(allocateFifo(lots, 800)).toEqual({
      allocations: [
        { lotId: "early", quantity: 500 },
        { lotId: "late", quantity: 300 },
      ],
      shortfall: 0,
    });
  });

  it("모자라면 shortfall 을 돌려준다", () => {
    expect(allocateFifo(lots, 3000).shortfall).toBe(500);
  });

  it("유통기한까지 남은 일수를 계산한다", () => {
    expect(daysUntilExpiry("2026-10-05", new Date(2026, 9, 3))).toBe(2);
    expect(daysUntilExpiry("2026-10-01", new Date(2026, 9, 3))).toBe(-2);
  });
});

describe("stock count", () => {
  it("센 시각의 장부 재고와의 차이만 조정하고, 세지 않은 품목은 건너뛴다", () => {
    expect(
      countAdjustments([
        { itemId: "a", countedQuantity: 90, bookQuantity: 100 },
        { itemId: "b", countedQuantity: 50, bookQuantity: 50 },
        { itemId: "c", countedQuantity: null, bookQuantity: 10 },
        { itemId: "d", countedQuantity: 5, bookQuantity: 0 },
        { itemId: "e", countedQuantity: 0.3, bookQuantity: 0.1 },
      ]),
    ).toEqual([
      { itemId: "a", quantity: -10 },
      { itemId: "d", quantity: 5 },
      { itemId: "e", quantity: 0.2 },
    ]);
  });

  it("음수 실사 수량은 거부한다", () => {
    expect(() => countAdjustments([{ itemId: "a", countedQuantity: -1, bookQuantity: 0 }])).toThrow();
  });
});

describe("purchasing", () => {
  it("입고 진행에 따라 상태가 바뀐다", () => {
    const ordered = derivePurchaseOrderStatus("ordered", [
      { quantity: 3, receivedQuantity: 0 },
    ]);
    const partial = derivePurchaseOrderStatus("ordered", [
      { quantity: 3, receivedQuantity: 1 },
      { quantity: 2, receivedQuantity: 0 },
    ]);
    const done = derivePurchaseOrderStatus("partially_received", [
      { quantity: 3, receivedQuantity: 3 },
    ]);
    expect([ordered, partial, done]).toEqual(["ordered", "partially_received", "received"]);
    expect(derivePurchaseOrderStatus("cancelled", [{ quantity: 1, receivedQuantity: 1 }])).toBe(
      "cancelled",
    );
  });

  it("부족 알림 기준의 2배까지 채우는 양을 주문 단위로 올림한다", () => {
    expect(suggestOrderQuantity(500, 2000, 1000)).toBe(4);
    expect(suggestOrderQuantity(-300, 2000, 1000)).toBe(4);
    expect(suggestOrderQuantity(0, 0, 1000)).toBe(1);
    expect(suggestOrderQuantity(45, 50, 1)).toBe(55);
  });

  it("발주 금액은 단가가 있는 줄만 더한다", () => {
    expect(orderTotal([{ quantity: 3, unitPrice: 24000 }, { quantity: 10, unitPrice: null }, { quantity: 0.5, unitPrice: 3000 }])).toBe(73500);
  });
});

describe("permissions", () => {
  it("역할별 권한을 확인한다", () => {
    expect(can("staff", "stock:move")).toBe(true);
    expect(can("staff", "stock:count:complete")).toBe(false);
    expect(can("manager", "purchase:manage")).toBe(true);
    expect(can("manager", "member:manage")).toBe(false);
    expect(can("owner", "store:manage")).toBe(true);
    expect(can(null, "stock:move")).toBe(false);
  });
});

describe("stock-status", () => {
  it("재고 없음·부족·충분을 구분한다", () => {
    expect(stockStatus(0, 0)).toBe("out");
    expect(stockStatus(-100, 500)).toBe("out");
    expect(stockStatus(500, 500)).toBe("low");
    expect(stockStatus(501, 500)).toBe("ok");
    expect(stockStatus(1, 0)).toBe("ok");
  });

  it("유통기한 지남·임박·충분을 구분하고 표시한다", () => {
    expect(expiryStatus(-1)).toBe("expired");
    expect(expiryStatus(0)).toBe("soon");
    expect(expiryStatus(3)).toBe("soon");
    expect(expiryStatus(4)).toBe("ok");
    expect(expiryLabel(-2)).toBe("2일 지남");
    expect(expiryLabel(0)).toBe("오늘까지");
    expect(expiryLabel(5)).toBe("D-5");
  });

  it("시간대 기준 오늘 날짜로 남은 날을 센다", () => {
    // 2026-10-06 23:30 UTC = 한국 10월 7일 08:30
    const now = new Date(Date.UTC(2026, 9, 6, 23, 30));
    expect(dateInTimeZone(now, "Asia/Seoul")).toBe("2026-10-07");
    expect(daysUntilExpiry("2026-10-10", dateInTimeZone(now, "Asia/Seoul"))).toBe(3);
    expect(daysUntilExpiry("2026-10-10", "2026-10-10")).toBe(0);
  });

  it("시간대의 벽시계 시각을 실제 순간으로 바꾼다", () => {
    expect(zonedTimeToUtc("2026-10-07", "00:00:00", "Asia/Seoul").toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(zonedTimeToUtc("2026-10-07", "23:59:59", "Asia/Seoul").toISOString()).toBe("2026-10-07T14:59:59.000Z");
    // 서머타임: 뉴욕은 3월 8일 새벽 2시에 시계를 앞당긴다 (그 전 UTC-5, 그 후 UTC-4)
    expect(zonedTimeToUtc("2026-03-08", "00:00:00", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-08", "23:59:59", "America/New_York").toISOString()).toBe("2026-03-09T03:59:59.000Z");
    expect(zonedTimeToUtc("2026-07-01", "12:00:00", "UTC").toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });

  it("시간대 이름 검사", () => {
    expect(isValidTimeZone("Asia/Seoul")).toBe(true);
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
    expect(isValidTimeZone("Seoul")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("recipe cost", () => {
  const latte = [
    { itemId: "beans", quantity: 18 },
    { itemId: "milk", quantity: 200 },
    { itemId: "cup", quantity: 1 },
  ];

  it("재료 원가를 더해 원 단위로 반올림한다", () => {
    expect(recipeCost(latte, { beans: 25, milk: 2.5, cup: 80 })).toEqual({ cost: 1030, missing: [] });
    expect(recipeCost(latte, { beans: 25.55, milk: 2.5 })).toEqual({ cost: 960, missing: ["cup"] });
  });

  it("원가율을 소수 첫째 자리까지 계산한다", () => {
    expect(costRate(5000, 1030)).toBe(20.6);
    expect(costRate(0, 100)).toBeNull();
  });
});

describe("cost changes", () => {
  it("단가 변화율과 알림 기준", () => {
    expect(costChangePercent(2500, 2700)).toBe(8);
    expect(costChangePercent(2.5, 2.4)).toBe(-4);
    expect(costChangePercent(0, 100)).toBeNull();
    expect(isNotableCostChange(2500, 2700)).toBe(true);
    expect(isNotableCostChange(2500, 2600)).toBe(false); // +4%
    expect(isNotableCostChange(100, 95)).toBe(true); // -5% 는 기준에 걸린다
    expect(isNotableCostChange(0, 100)).toBe(true);
    expect(isNotableCostChange(100, 100)).toBe(false);
  });

  it("그 품목을 쓰는 메뉴의 원가율 변화만, 많이 바뀐 순으로", () => {
    const menus = [
      { id: "americano", name: "아메리카노", price: 4000, recipe: [{ itemId: "beans", quantity: 18 }, { itemId: "cup", quantity: 1 }] },
      { id: "latte", name: "카페라떼", price: 5000, recipe: [{ itemId: "beans", quantity: 18 }, { itemId: "milk", quantity: 200 }, { itemId: "cup", quantity: 1 }] },
      { id: "milk-tea", name: "밀크티", price: 2000, recipe: [{ itemId: "milk", quantity: 200 }] },
      { id: "service", name: "서비스 우유", price: 0, recipe: [{ itemId: "milk", quantity: 100 }] },
    ];
    const costs = { beans: 25, milk: 2.7, cup: 80 };
    expect(menuCostImpacts(menus, "milk", 2.5, costs)).toEqual([
      { menuId: "milk-tea", menuName: "밀크티", costBefore: 500, costAfter: 540, rateBefore: 25, rateAfter: 27 },
      { menuId: "latte", menuName: "카페라떼", costBefore: 1030, costAfter: 1070, rateBefore: 20.6, rateAfter: 21.4 },
      { menuId: "service", menuName: "서비스 우유", costBefore: 250, costAfter: 270, rateBefore: null, rateAfter: null },
    ]);
  });
});

describe("templates", () => {
  const t = CAFE_TEMPLATE;
  it("카페 기본 템플릿의 참조가 모두 맞다", () => {
    const itemNames = new Set(t.items.map((i) => i.name));
    expect(itemNames.size).toBe(t.items.length);
    expect(new Set(t.menus.map((m) => m.name)).size).toBe(t.menus.length);
    for (const item of t.items) {
      expect(t.categories).toContain(item.category);
      expect(item.units.length).toBeGreaterThan(0);
      for (const u of item.units) expect(u.factor).toBeGreaterThan(0);
    }
    for (const menu of t.menus) {
      expect(Number.isInteger(menu.price)).toBe(true);
      expect(new Set(menu.recipe.map((r) => r.item)).size).toBe(menu.recipe.length);
      for (const r of menu.recipe) {
        expect(itemNames).toContain(r.item);
        expect(r.quantity).toBeGreaterThan(0);
      }
    }
  });
});

describe("avt", () => {
  // 우유: 판매 10,000ml, 레시피 밖 사용 300, 폐기 500, 실사에서 1,200 모자람, 직접 조정 +100 (입고 누락 바로잡기)
  const milk = { itemId: "milk", received: 12000, sold: -10000, consumed: -300, wasted: -500, countAdjusted: -1200, manualAdjusted: 100, counted: true };

  it("이론·실제·차이와 원인을 나눈다", () => {
    const l = avtLine(milk, 2.8);
    expect(l.theoretical).toBe(10000);
    expect(l.causes).toEqual({ consumed: 300, wasted: 500, countLoss: 1200, otherAdjust: -100 });
    expect(l.variance).toBe(1900);
    expect(l.actual).toBe(11900);
    expect(l.varianceRate).toBeCloseTo(0.19);
    expect(l.theoreticalCost).toBe(28000);
    expect(l.actualCost).toBe(33320);
    expect(l.varianceCost).toBe(5320);
  });

  it("판매가 없으면 차이율은 없고, 단가가 없으면 금액도 없다", () => {
    const l = avtLine({ itemId: "x", received: 0, sold: 0, consumed: -5, wasted: 0, countAdjusted: 0, manualAdjusted: 0, counted: true }, null);
    expect(l.varianceRate).toBeNull();
    expect(l.varianceCost).toBeNull();
  });

  it("실사에서 남으면 차이가 음수가 된다", () => {
    const l = avtLine({ itemId: "bean", received: 0, sold: -1000, consumed: 0, wasted: 0, countAdjusted: 50, manualAdjusted: 0, counted: true }, 25);
    expect(l.variance).toBe(-50);
    expect(l.varianceCost).toBe(-1250);
  });

  it("합계·원가율·단가 없는 품목 수", () => {
    const lines = [
      avtLine(milk, 2.8),
      avtLine({ itemId: "bean", received: 0, sold: -1000, consumed: 0, wasted: 0, countAdjusted: 50, manualAdjusted: 0, counted: true }, 25),
      avtLine({ itemId: "cup", received: 0, sold: -60, consumed: 0, wasted: 0, countAdjusted: -2, manualAdjusted: 0, counted: true }, null),
    ];
    const s = avtSummary(lines, 300000);
    expect(s.theoreticalCost).toBe(28000 + 25000);
    expect(s.actualCost).toBe(33320 + 23750);
    expect(s.varianceCost).toBe(5320 - 1250);
    expect(s.causeCosts).toEqual({ consumed: 840, wasted: 1400, countLoss: 3360 - 1250, otherAdjust: -280 });
    expect(s.theoreticalCostRate).toBeCloseTo(53000 / 300000);
    expect(s.missingCostCount).toBe(1);
    expect(s.uncountedCount).toBe(0);
    expect(avtSummary([avtLine({ ...milk, counted: false }, 2.8)], 0).uncountedCount).toBe(1);
    expect(sortAvtLines(lines).map((l) => l.itemId)).toEqual(["milk", "bean", "cup"]);
  });
});

describe("sales import", () => {
  it("CSV: 따옴표 안 쉼표·줄바꿈, 탭 구분, 빈 줄", () => {
    expect(parseCsv('상품명,수량,금액\r\n"라떼, 아이스",2,"9,000"\n\n"줄\n바꿈",1,""""')).toEqual([
      ["상품명", "수량", "금액"],
      ["라떼, 아이스", "2", "9,000"],
      ["줄\n바꿈", "1", '"'],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("EUC-KR 파일도 읽는다", () => {
    // "라떼" (EUC-KR: B6F3 B6BC)
    expect(decodeCsv(new Uint8Array([0xb6, 0xf3, 0xb6, 0xbc]))).toBe("라떼");
    expect(decodeCsv(new TextEncoder().encode("﻿라떼"))).toBe("라떼");
  });

  it("열 이름으로 칸을 추측하고 제목 줄을 건너뛴다", () => {
    const table = [
      ["매출 리포트 2026-10-01 ~ 2026-10-07"],
      ["주문번호", "판매일시", "상품명", "옵션", "수량", "상품가격", "실판매금액"],
    ];
    expect(findHeaderRow(table)).toBe(1);
    expect(guessColumns(table[1]!)).toEqual({ orderNo: 0, date: 1, menu: 2, option: 3, quantity: 4, amount: 6 });
    expect(guessColumns(["일자", "메뉴", "판매수량", "판매금액"])).toEqual({ date: 0, menu: 1, quantity: 2, amount: 3 });
  });

  it("날짜·시각 여러 형식", () => {
    expect(parseSaleDateTime("2026-10-07")).toEqual({ date: "2026-10-07", time: null });
    expect(parseSaleDateTime("2026.10.07 13:05")).toEqual({ date: "2026-10-07", time: "13:05:00" });
    expect(parseSaleDateTime("2026/10/07 오후 1:05:09")).toEqual({ date: "2026-10-07", time: "13:05:09" });
    expect(parseSaleDateTime("2026년 10월 7일", "오전 12:30")).toEqual({ date: "2026-10-07", time: "00:30:00" });
    expect(parseSaleDateTime("20261007")).toEqual({ date: "2026-10-07", time: null });
    expect(parseSaleDateTime("2026-02-30")).toBeNull();
    expect(parseSaleDateTime("10/07/2026")).toBeNull();
    expect(parseImportNumber("₩4,500")).toBe(4500);
    expect(parseImportNumber("(1,000)")).toBe(-1000);
    expect(parseImportNumber("")).toBeNull();
  });

  it("행 읽기: 옵션 붙이기, 같은 내용 행 구분, 취소 줄, 합계 줄", () => {
    const table = [
      ["날짜", "상품명", "옵션", "수량", "금액"],
      ["2026-10-07 09:00", "아메리카노", "ICE", "1", "4,500"],
      ["2026-10-07 09:00", "아메리카노", "ICE", "1", "4,500"],
      ["2026-10-07 09:10", "라떼", "", "-1", "-5,000"],
      ["2026-10-07 09:20", "라떼", "", "1", "-5,000"], // 수량은 양수, 금액만 음수인 취소 줄
      ["2026-10-07 09:30", "라떼", "", "0", "0"],
      ["합계", "", "", "1", "4,000"],
      ["어제", "라떼", "", "1", "5,000"],
    ];
    const { rows, issues } = readSaleRows(table, 0, guessColumns(table[0]!));
    expect(rows.map((r) => [r.name, r.quantity, r.amount, r.time, r.key])).toEqual([
      ["아메리카노 / ICE", 1, 4500, "09:00:00", "2026-10-07|09:00:00||아메리카노 / ICE|1|4500#1"],
      ["아메리카노 / ICE", 1, 4500, "09:00:00", "2026-10-07|09:00:00||아메리카노 / ICE|1|4500#2"],
      ["라떼", -1, -5000, "09:10:00", "2026-10-07|09:10:00||라떼|-1|-5000#1"],
      ["라떼", -1, -5000, "09:20:00", "2026-10-07|09:20:00||라떼|-1|-5000#1"],
    ]);
    expect(issues).toEqual([
      { line: 6, reason: "수량이 0" },
      { line: 7, reason: "합계 줄" },
      { line: 8, reason: "날짜를 읽을 수 없음 (어제)" },
    ]);
    expect(summarizeNames(rows)).toEqual([
      { name: "아메리카노 / ICE", rows: 2, quantity: 2, refunds: 0 },
      { name: "라떼", rows: 2, quantity: -2, refunds: 2 },
    ]);
  });

  it("상태가 취소인 주문 줄 → 판매 + 취소 두 줄 (예전에 가져온 판매도 상계)", () => {
    const header = ["주문번호", "결제일시", "상품명", "수량", "실판매금액", "결제상태"];
    const columns = guessColumns(header);
    expect(columns.status).toBe(5);
    const done = readSaleRows([header, ["A1", "2026-10-07 09:00", "라떼", "2", "10,000", "완료"]], 0, columns).rows;
    const cancelled = readSaleRows([header, ["A1", "2026-10-07 09:00", "라떼", "2", "10,000", "결제취소"]], 0, columns).rows;
    expect(cancelled.map((r) => [r.quantity, r.amount, r.key])).toEqual([
      [2, 10000, "2026-10-07|09:00:00|A1|라떼|2|10000#1"],
      [-2, -10000, "2026-10-07|09:00:00|A1|라떼|-2|-10000#1|취소"],
    ]);
    // 어제 "완료"로 가져온 판매와 판매 줄의 키가 같다 → 그 줄은 건너뛰고 취소 줄만 들어간다
    expect(cancelled[0]!.key).toBe(done[0]!.key);
  });

  it("메뉴 매칭: 저장한 매칭 → 같은 이름", () => {
    const menus = [
      { id: "m1", name: "아이스 아메리카노" },
      { id: "m2", name: "카페라떼" },
    ];
    expect(
      matchMenus(["아이스아메리카노", "라떼(L)", "쿠폰", "카페라떼", "옛 메뉴"], menus, {
        "라떼(L)": "m2",
        쿠폰: null,
        "옛 메뉴": "archived",
      }),
    ).toEqual({ 아이스아메리카노: "m1", "라떼(L)": "m2", 쿠폰: null, 카페라떼: "m2", "옛 메뉴": undefined });
  });
});

describe("menu profit", () => {
  it("목표 원가율 → 권장 판매가 (100원 단위로 올림)", () => {
    expect(suggestedPrice(1350, 30)).toBe(4500);
    expect(suggestedPrice(1360, 30)).toBe(4600);
    expect(suggestedPrice(900, 25)).toBe(3600);
    expect(suggestedPrice(0, 30)).toBeNull();
    expect(effectiveTargetRate(null, 30)).toBe(30);
    expect(effectiveTargetRate(25, 30)).toBe(25);
    expect(isOverTarget(30.1, 30)).toBe(true);
    expect(isOverTarget(30, 30)).toBe(false);
    expect(isOverTarget(null, 30)).toBe(false);
  });

  it("메뉴별 마진 순위와 분류 (판매량 × 개당 마진)", () => {
    const menu = (menuId: string) => ({ menuId, costIncomplete: false, noRecipe: false });
    const sale = (menuId: string, quantity: number, amount: number, unitCost: number) => ({ menuId, quantity, amount, cost: unitCost * quantity });
    const { lines, summary } = menuProfitLines(
      ["아메", "라떼", "바닐라", "시즌", "옛메뉴", "취소만"].map(menu),
      [
        sale("바닐라", 10, 55000, 1800),
        sale("아메", 70, 280000, 500),
        sale("아메", 30, 120000, 500), // 같은 메뉴의 다른 옵션 묶음 줄은 합친다
        sale("라떼", 60, 270000, 1500),
        sale("시즌", 5, 15000, 1000),
        sale("옛메뉴", -1, -4000, 500), // 지난 기간 판매의 반품
        sale("취소만", 0, 0, 500), // 판매 + 취소로 0
        sale("없는메뉴", 3, 9000, 0),
      ],
    );
    expect(lines.map((l) => [l.menuId, l.margin, l.unitMargin, l.class])).toEqual([
      ["아메", 350000, 3500, "star"],
      ["라떼", 180000, 3000, "plowhorse"], // 많이 팔리지만 개당 남는 게 평균보다 적다
      ["바닐라", 37000, 3700, "puzzle"],
      ["시즌", 10000, 2000, "dog"],
      ["옛메뉴", -3500, null, null],
    ]);
    expect(lines[1]).toMatchObject({ cost: 90000, costRate: 33.3, averagePrice: 4500 });
    expect(summary).toEqual({
      revenue: 736000,
      cost: 162500,
      margin: 573500,
      quantity: 174,
      costRate: 22.1,
      popularityThreshold: (175 / 4) * 0.7,
      unitMarginThreshold: 3297, // 577,000 ÷ 175 (반품만 있는 메뉴는 기준에서 뺀다)
    });
    // 판매가 있는 메뉴가 하나뿐이면 분류하지 않는다
    expect(menuProfitLines([menu("아메")], [sale("아메", 3, 12000, 500)]).lines[0]!.class).toBeNull();
  });
});

describe("menu options", () => {
  // 원두 18g, 우유 200ml, 컵 1개
  const latte = [
    { itemId: "bean", quantity: 18 },
    { itemId: "milk", quantity: 200 },
    { itemId: "cup", quantity: 1 },
  ];
  const shot = { kind: "add", itemId: "bean", quantity: 18 } as const;
  const oat = { kind: "replace", itemId: "oat", fromItemId: "milk" } as const;
  const sizeUp = [
    { kind: "scale", itemId: "milk", quantity: 1.5 },
    { kind: "replace", itemId: "cupL", fromItemId: "cup" },
  ] as const;

  it("추가·바꾸기·늘리기", () => {
    expect(applyOptions(latte, [shot])).toEqual([
      { itemId: "bean", quantity: 36 },
      { itemId: "cup", quantity: 1 },
      { itemId: "milk", quantity: 200 },
    ]);
    // 사이즈업 + 오트밀크: 늘린 뒤 바꾼다 → 오트밀크 300ml, 큰 컵
    expect(applyOptions(latte, [oat, ...sizeUp])).toEqual([
      { itemId: "bean", quantity: 18 },
      { itemId: "cupL", quantity: 1 },
      { itemId: "oat", quantity: 300 },
    ]);
    // 레시피에 없는 재료를 바꾸거나 늘리는 규칙은 아무것도 하지 않는다 (아메리카노 + 오트밀크)
    const americano = [{ itemId: "bean", quantity: 18 }];
    expect(applyOptions(americano, [oat, sizeUp[0]])).toEqual(americano);
  });

  it("바꾸기는 한 번씩만, 같은 재료를 바꾸는 규칙이 여럿이면 하나만", () => {
    const chain = [
      { kind: "replace", itemId: "b", fromItemId: "a" },
      { kind: "replace", itemId: "c", fromItemId: "b" },
    ] as const;
    const recipe = [
      { itemId: "a", quantity: 1 },
      { itemId: "b", quantity: 2 },
    ];
    expect(applyOptions(recipe, [...chain])).toEqual([
      { itemId: "b", quantity: 1 },
      { itemId: "c", quantity: 2 },
    ]);
    const soy = { kind: "replace", itemId: "soy", fromItemId: "milk" } as const;
    expect(applyOptions(latte, [soy, oat]).map((r) => r.itemId)).toEqual(["bean", "cup", "oat"]);
    expect(optionLineName("카페라떼", ["오트밀크 변경", "샷 추가"])).toBe("카페라떼 + 오트밀크 변경 + 샷 추가");
  });
});
