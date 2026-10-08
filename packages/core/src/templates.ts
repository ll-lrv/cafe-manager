import type { BaseUnit } from "./units";

/**
 * 새 매장을 빠르게 시작하도록 미리 만들어 둔 품목·메뉴·레시피.
 * 수량·가격은 흔한 개인 카페 기준의 예시이고, 불러온 뒤 매장에 맞게 고쳐 쓴다.
 * DB 함수 apply_store_template 이 이 형태(JSON)를 받아 한 번에 저장한다.
 */
export interface StoreTemplate {
  categories: string[];
  items: TemplateItem[];
  menus: TemplateMenu[];
}

export interface TemplateItem {
  name: string;
  /** categories 중 하나 */
  category: string;
  baseUnit: BaseUnit;
  /** 부족 알림 기준 (기본 단위) */
  minStock: number;
  trackExpiry: boolean;
  /** 입고 단위. 첫 번째가 기본 입고 단위 */
  units: { name: string; factor: number }[];
}

export interface TemplateMenu {
  name: string;
  /** 원(KRW) */
  price: number;
  /** 메뉴 1개당 재료 사용량 (기본 단위). item 은 items 의 이름 */
  recipe: { item: string; quantity: number }[];
}

const hot = [
  { item: "핫컵", quantity: 1 },
  { item: "핫컵 뚜껑", quantity: 1 },
];
const ice = [
  { item: "아이스컵", quantity: 1 },
  { item: "아이스컵 뚜껑", quantity: 1 },
  { item: "빨대", quantity: 1 },
];
const shot = { item: "원두", quantity: 18 };

export const CAFE_TEMPLATE: StoreTemplate = {
  categories: ["원두·커피", "유제품", "시럽·소스", "파우더", "포장재"],
  items: [
    { name: "원두", category: "원두·커피", baseUnit: "g", minStock: 2000, trackExpiry: false, units: [{ name: "1kg 봉", factor: 1000 }] },
    { name: "우유", category: "유제품", baseUnit: "ml", minStock: 5000, trackExpiry: true, units: [{ name: "1L 팩", factor: 1000 }] },
    { name: "바닐라 시럽", category: "시럽·소스", baseUnit: "ml", minStock: 300, trackExpiry: false, units: [{ name: "1L 병", factor: 1000 }] },
    { name: "카라멜 소스", category: "시럽·소스", baseUnit: "ml", minStock: 300, trackExpiry: false, units: [{ name: "1L 병", factor: 1000 }] },
    { name: "초코 소스", category: "시럽·소스", baseUnit: "ml", minStock: 300, trackExpiry: false, units: [{ name: "1L 병", factor: 1000 }] },
    { name: "녹차 파우더", category: "파우더", baseUnit: "g", minStock: 200, trackExpiry: false, units: [{ name: "500g 봉", factor: 500 }] },
    { name: "핫컵", category: "포장재", baseUnit: "ea", minStock: 100, trackExpiry: false, units: [{ name: "50개 묶음", factor: 50 }] },
    { name: "핫컵 뚜껑", category: "포장재", baseUnit: "ea", minStock: 100, trackExpiry: false, units: [{ name: "100개 묶음", factor: 100 }] },
    { name: "아이스컵", category: "포장재", baseUnit: "ea", minStock: 100, trackExpiry: false, units: [{ name: "100개 묶음", factor: 100 }] },
    { name: "아이스컵 뚜껑", category: "포장재", baseUnit: "ea", minStock: 100, trackExpiry: false, units: [{ name: "100개 묶음", factor: 100 }] },
    { name: "빨대", category: "포장재", baseUnit: "ea", minStock: 200, trackExpiry: false, units: [{ name: "500개 묶음", factor: 500 }] },
  ],
  menus: [
    { name: "아메리카노", price: 4500, recipe: [shot, ...hot] },
    { name: "아이스 아메리카노", price: 4500, recipe: [shot, ...ice] },
    { name: "카페라떼", price: 5000, recipe: [shot, { item: "우유", quantity: 200 }, ...hot] },
    { name: "아이스 카페라떼", price: 5000, recipe: [shot, { item: "우유", quantity: 180 }, ...ice] },
    { name: "바닐라라떼", price: 5500, recipe: [shot, { item: "우유", quantity: 200 }, { item: "바닐라 시럽", quantity: 20 }, ...hot] },
    { name: "아이스 바닐라라떼", price: 5500, recipe: [shot, { item: "우유", quantity: 180 }, { item: "바닐라 시럽", quantity: 20 }, ...ice] },
    { name: "카라멜 마키아또", price: 5800, recipe: [shot, { item: "우유", quantity: 200 }, { item: "바닐라 시럽", quantity: 10 }, { item: "카라멜 소스", quantity: 15 }, ...hot] },
    { name: "카페모카", price: 5500, recipe: [shot, { item: "우유", quantity: 180 }, { item: "초코 소스", quantity: 30 }, ...hot] },
    { name: "녹차라떼", price: 5500, recipe: [{ item: "녹차 파우더", quantity: 20 }, { item: "우유", quantity: 250 }, ...hot] },
    { name: "초코라떼", price: 5000, recipe: [{ item: "초코 소스", quantity: 40 }, { item: "우유", quantity: 250 }, ...hot] },
  ],
};
