/**
 * 판매 파일(POS 매출 내보내기를 CSV 로 저장한 것) 읽기.
 * POS 마다 열 이름과 날짜 형식이 달라 열은 이름으로 추측하고 화면에서 고칠 수 있게 한다.
 * 한 행 = 메뉴 하나의 판매 (날짜[·시각], 메뉴 이름, 수량, 금액).
 */

export type ImportField = "date" | "time" | "menu" | "option" | "quantity" | "amount" | "orderNo" | "status";

export const IMPORT_FIELDS: { field: ImportField; label: string; required: boolean }[] = [
  { field: "date", label: "날짜(·시각)", required: true },
  { field: "time", label: "시각", required: false },
  { field: "menu", label: "메뉴 이름", required: true },
  { field: "option", label: "옵션", required: false },
  { field: "quantity", label: "수량", required: true },
  { field: "amount", label: "금액", required: false },
  { field: "orderNo", label: "주문번호", required: false },
  { field: "status", label: "취소 여부(상태)", required: false },
];

export type ImportColumns = Partial<Record<ImportField, number>>;

/** 한 번에 읽을 수 있는 판매 행 수 */
export const SALE_IMPORT_MAX_ROWS = 20_000;

// ---------------------------------------------------------------- 파일 → 표

/**
 * 파일 내용을 글자로. UTF-8(BOM 포함)이 아니면 국내 POS·엑셀이 흔히 쓰는 EUC-KR(CP949)로 읽는다.
 */
export function decodeCsv(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("euc-kr").decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 첫 줄에 가장 많이 나오는 구분자 (쉼표·탭·세미콜론) */
function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/, 5).join("\n");
  const count = (d: string) => firstLines.split(d).length;
  return [",", "\t", ";"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");
}

/** CSV(RFC 4180: 따옴표 안의 쉼표·줄바꿈, "" 는 따옴표 하나) → 행 목록. 칸은 앞뒤 공백을 지운다. */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

// ---------------------------------------------------------------- 열 추측

const normalizeHeader = (s: string) => s.replace(/[\s_()[\]·./-]/g, "").toLowerCase();

/** 열 이름 후보. 앞에 있는 것일수록 우선 (예: 실판매금액 > 판매금액 > 금액) */
const HEADER_HINTS: Record<ImportField, string[]> = {
  date: ["판매일시", "주문일시", "결제일시", "거래일시", "판매일자", "주문일자", "거래일자", "영업일자", "매출일자", "판매일", "주문일", "거래일", "일자", "날짜", "일시", "date"],
  time: ["판매시각", "주문시각", "결제시각", "판매시간", "주문시간", "결제시간", "시각", "시간", "time"],
  menu: ["상품명", "메뉴명", "품목명", "메뉴이름", "상품이름", "상품", "메뉴", "품목", "item", "menu", "product"],
  option: ["옵션명", "옵션", "option"],
  quantity: ["판매수량", "주문수량", "수량", "개수", "qty", "quantity"],
  amount: ["실판매금액", "실매출액", "실매출", "순매출", "결제금액", "판매금액", "매출금액", "매출액", "판매액", "금액", "amount", "sales"],
  orderNo: ["주문번호", "영수증번호", "거래번호", "결제번호", "주문id", "order"],
  status: ["결제상태", "주문상태", "거래상태", "취소여부", "거래구분", "매출구분", "상태", "status"],
};

function hintRank(header: string, field: ImportField): number {
  const h = normalizeHeader(header);
  if (!h) return -1;
  const hints = HEADER_HINTS[field];
  const exact = hints.findIndex((hint) => h === hint);
  if (exact >= 0) return exact;
  const partial = hints.findIndex((hint) => h.includes(hint));
  return partial >= 0 ? hints.length + partial : -1;
}

/** 열 이름으로 어떤 칸인지 추측한다. 한 열은 한 칸에만 쓴다. 날짜 열이 시각까지 담고 있으면 시각 열은 비운다. */
export function guessColumns(header: string[]): ImportColumns {
  const used = new Set<number>();
  const columns: ImportColumns = {};
  // 이름이 겹치기 쉬운 것부터 (예: "판매수량"·"판매금액"이 "판매일" 보다 먼저 자리를 잡게)
  const order: ImportField[] = ["orderNo", "status", "quantity", "amount", "option", "menu", "time", "date"];
  for (const field of order) {
    let best = -1;
    let bestRank = Infinity;
    header.forEach((h, i) => {
      if (used.has(i)) return;
      const rank = hintRank(h, field);
      if (rank >= 0 && rank < bestRank) {
        best = i;
        bestRank = rank;
      }
    });
    if (best >= 0) {
      columns[field] = best;
      used.add(best);
    }
  }
  return columns;
}

/**
 * 머리글 행 위치. POS 파일은 맨 위에 "매출 리포트 2026-10-01 ~ 10-07" 같은 제목 줄이 있기도 해서,
 * 앞 10줄 중 필수 칸(날짜·메뉴·수량)을 가장 많이 찾은 줄을 머리글로 본다.
 */
export function findHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((row, i) => {
    const c = guessColumns(row);
    const score = (["date", "menu", "quantity"] as const).filter((f) => c[f] !== undefined).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

// ---------------------------------------------------------------- 칸 읽기

const pad = (n: number | string) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "13:05", "13:05:09", "오후 1:05:09", "1:05 PM" → "13:05:09" 형태. 아니면 null */
export function parseSaleTime(cell: string): string | null {
  const m = cell.trim().match(/^(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = Number(m[2]);
  const minute = Number(m[3]);
  const second = Number(m[4] ?? 0);
  const meridiem = (m[1] ?? m[5] ?? "").toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem === "오후" || meridiem === "PM";
    hour = (hour % 12) + (pm ? 12 : 0);
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/**
 * 날짜 칸(시각이 함께 있을 수 있음)과 시각 칸을 읽는다.
 * 예) "2026-10-07", "2026.10.07 13:05", "2026/10/07 오후 1:05:09", "20261007", "2026년 10월 7일"
 */
export function parseSaleDateTime(dateCell: string, timeCell?: string): { date: string; time: string | null } | null {
  const m = dateCell
    .trim()
    .match(/^(\d{4})\s*[-./년]?\s*(\d{1,2})\s*[-./월]?\s*(\d{1,2})\s*일?\.?(?:(?:\s+|T)(.+))?$/);
  if (!m) return null;
  // "20261007" 처럼 붙어 있으면 위 식이 월·일을 한 자리로 자를 수 있어 따로 본다.
  const compact = dateCell.trim().match(/^(\d{4})(\d{2})(\d{2})(?:\s+(.+))?$/);
  const [y, mo, d, rest] = compact ? [compact[1], compact[2], compact[3], compact[4]] : [m[1], m[2], m[3], m[4]];
  const date = validDate(Number(y), Number(mo), Number(d));
  if (!date) return null;
  let time: string | null = null;
  if (rest) {
    time = parseSaleTime(rest);
    if (!time) return null;
  }
  if (timeCell?.trim()) {
    const t = parseSaleTime(timeCell);
    if (!t) return null;
    time = t;
  }
  return { date, time };
}

/** "4,500", "₩4,500", "4500원", "-1" → 숫자. 빈 칸이나 숫자가 아니면 null */
export function parseImportNumber(cell: string): number | null {
  const s = cell.replace(/[\s,₩원]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

// ---------------------------------------------------------------- 행 읽기

export interface SaleImportRow {
  /** 파일에서 몇 번째 줄인지 (1부터, 머리글 포함) */
  line: number;
  /** YYYY-MM-DD (매장 시간대 기준 날짜로 본다) */
  date: string;
  /** HH:MM:SS. 없으면 그 날 마감 시각으로 기록 */
  time: string | null;
  /** 파일의 메뉴 이름 (옵션 열이 있으면 "메뉴 / 옵션") */
  name: string;
  /** 음수 = 취소·반품 (매출과 재료 차감을 되돌린다) */
  quantity: number;
  /** 원. 금액 열이 없으면 null (메뉴 가격 × 수량). 취소 줄은 0 이하 */
  amount: number | null;
  /** 같은 행을 두 번 가져오지 않기 위한 키. 파일 내용으로 만든다 (같은 내용 행은 몇 번째인지 붙임) */
  key: string;
}

export interface SaleImportIssue {
  line: number;
  reason: string;
}

const TOTAL_ROW = /^(합계|총계|소계|총합계|total)$/i;
/** 상태 열에 이 말이 있으면 취소된 주문 */
const REFUND_STATUS = /취소|환불|반품|cancel|refund|return|void/i;

/** 표의 데이터 행을 판매 행으로 읽는다. 읽을 수 없는 행은 issues 로 (줄 번호와 이유) */
export function readSaleRows(
  table: string[][],
  headerIndex: number,
  columns: ImportColumns,
): { rows: SaleImportRow[]; issues: SaleImportIssue[] } {
  const rows: SaleImportRow[] = [];
  const issues: SaleImportIssue[] = [];
  const seen = new Map<string, number>();
  const cell = (r: string[], field: ImportField) => {
    const i = columns[field];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  table.slice(headerIndex + 1).forEach((r, i) => {
    const line = headerIndex + i + 2;
    const menu = cell(r, "menu");
    // 합계 줄: 메뉴·날짜 칸이나 첫 칸에 "합계" (POS 마다 위치가 다르다)
    if ([menu, cell(r, "date"), r[0] ?? ""].some((c) => TOTAL_ROW.test(c.replace(/\s/g, "")))) {
      issues.push({ line, reason: "합계 줄" });
      return;
    }
    if (!menu) {
      issues.push({ line, reason: "메뉴 이름이 없음" });
      return;
    }
    const option = cell(r, "option");
    const name = option ? `${menu} / ${option}` : menu;
    if (name.length > 100) {
      issues.push({ line, reason: "메뉴 이름이 너무 김" });
      return;
    }
    const when = parseSaleDateTime(cell(r, "date"), columns.time === undefined ? undefined : cell(r, "time"));
    if (!when) {
      issues.push({ line, reason: `날짜를 읽을 수 없음 (${cell(r, "date") || "빈 칸"})` });
      return;
    }
    const parsedQuantity = parseImportNumber(cell(r, "quantity"));
    if (parsedQuantity === null || !Number.isInteger(parsedQuantity)) {
      issues.push({ line, reason: `수량을 읽을 수 없음 (${cell(r, "quantity") || "빈 칸"})` });
      return;
    }
    if (parsedQuantity === 0) {
      issues.push({ line, reason: "수량이 0" });
      return;
    }
    if (Math.abs(parsedQuantity) > 10000) {
      issues.push({ line, reason: "수량이 너무 큼" });
      return;
    }
    let parsedAmount: number | null = null;
    if (columns.amount !== undefined) {
      parsedAmount = parseImportNumber(cell(r, "amount"));
      if (parsedAmount === null) {
        issues.push({ line, reason: `금액을 읽을 수 없음 (${cell(r, "amount") || "빈 칸"})` });
        return;
      }
      parsedAmount = Math.round(parsedAmount);
    }

    // 취소·반품. POS 마다 나타내는 방법이 다르다.
    //  1) 따로 있는 취소 줄: 수량이나 금액이 음수 → 취소 줄 하나 (음수 판매)
    //  2) 원래 주문 줄에 상태만 "취소": 판매 줄 + 취소 줄 두 개로 만든다. 판매 줄의 키는 상태를 빼고 만들어
    //     예전에 "완료"로 이미 가져온 같은 주문과 키가 같으므로, 그때는 판매 줄은 건너뛰고 취소 줄만 들어가 상계된다.
    const negative = parsedQuantity < 0 || (parsedAmount !== null && parsedAmount < 0);
    const cancelledStatus = !negative && REFUND_STATUS.test(cell(r, "status"));
    const quantity = Math.abs(parsedQuantity) * (negative ? -1 : 1);
    const amount = parsedAmount === null ? null : Math.abs(parsedAmount) * (negative ? -1 : 1);

    const push = (q: number, a: number | null, keySuffix = "") => {
      const base = [when.date, when.time ?? "", cell(r, "orderNo"), name, q, a ?? ""].join("|");
      const n = (seen.get(base + keySuffix) ?? 0) + 1;
      seen.set(base + keySuffix, n);
      rows.push({ line, date: when.date, time: when.time, name, quantity: q, amount: a, key: `${base}#${n}${keySuffix}` });
    };
    push(quantity, amount);
    if (cancelledStatus) push(-quantity, amount === null ? null : -amount, "|취소");
  });
  return { rows, issues };
}

// ---------------------------------------------------------------- 메뉴 매칭

/** 이름 비교용: 공백·대소문자 무시 */
export const normalizeMenuName = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 파일의 메뉴 이름마다 우리 메뉴를 고른다.
 * 1) 저장해 둔 매칭(aliases, null 은 "가져오지 않음") 2) 이름이 같은 메뉴. 못 찾으면 undefined.
 */
export function matchMenus(
  names: string[],
  menus: { id: string; name: string }[],
  aliases: Record<string, string | null>,
): Record<string, string | null | undefined> {
  const byName = new Map(menus.map((m) => [normalizeMenuName(m.name), m.id]));
  const menuIds = new Set(menus.map((m) => m.id));
  return Object.fromEntries(
    names.map((name) => {
      if (name in aliases) {
        const alias = aliases[name] ?? null;
        // 매칭해 둔 메뉴가 지금 목록에 없으면(보관 등) 다시 고르게 한다.
        if (alias === null || menuIds.has(alias)) return [name, alias];
      }
      return [name, byName.get(normalizeMenuName(name))];
    }),
  );
}

export interface ImportNameSummary {
  name: string;
  rows: number;
  /** 취소를 뺀 수량 */
  quantity: number;
  /** 취소·반품 줄 수 */
  refunds: number;
}

/** 파일의 메뉴 이름별 행 수·수량 (많이 팔린 순) */
export function summarizeNames(rows: SaleImportRow[]): ImportNameSummary[] {
  const map = new Map<string, ImportNameSummary>();
  for (const r of rows) {
    const s = map.get(r.name) ?? { name: r.name, rows: 0, quantity: 0, refunds: 0 };
    s.rows += 1;
    s.quantity += r.quantity;
    if (r.quantity < 0) s.refunds += 1;
    map.set(r.name, s);
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "ko"));
}
