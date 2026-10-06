import { describe, expect, it } from "vitest";
import {
  allocateFifo,
  can,
  countAdjustments,
  dateInTimeZone,
  daysUntilExpiry,
  expiryLabel,
  expiryStatus,
  derivePurchaseOrderStatus,
  formatQuantity,
  fromBaseQuantity,
  mergeDeltas,
  roundQty,
  saleDeductions,
  stockStatus,
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
  it("완료 시점 장부 재고와의 차이만 조정한다", () => {
    const current = new Map([
      ["a", 100],
      ["b", 50],
      ["c", 10],
    ]);
    expect(
      countAdjustments(
        [
          { itemId: "a", countedQuantity: 90 },
          { itemId: "b", countedQuantity: 50 },
          { itemId: "c", countedQuantity: null },
          { itemId: "d", countedQuantity: 5 },
        ],
        current,
      ),
    ).toEqual([
      { itemId: "a", quantity: -10 },
      { itemId: "d", quantity: 5 },
    ]);
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
});
