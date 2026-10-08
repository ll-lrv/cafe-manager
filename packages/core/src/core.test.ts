import { describe, expect, it } from "vitest";
import {
  allocateFifo,
  can,
  costRate,
  countAdjustments,
  dateInTimeZone,
  daysUntilExpiry,
  expiryLabel,
  expiryStatus,
  isValidTimeZone,
  derivePurchaseOrderStatus,
  formatQuantity,
  formatUnitCount,
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
