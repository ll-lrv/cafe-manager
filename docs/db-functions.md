# DB 함수·트리거 목록 (NestJS 전환 대응표)

Supabase 단계에서는 **여러 행을 함께 써야 하는 작업을 DB 함수(PL/pgSQL)로 묶어 한 트랜잭션으로 처리**한다.
(2026-10-06 결정: 중간에 실패해도 일부만 저장되는 일이 없도록)

NestJS로 옮길 때는 이 문서의 표를 보고 기능 단위로 하나씩 옮긴다.

## 옮기는 순서 (기능 하나당)

1. NestJS 서비스에 같은 처리를 구현한다. **트랜잭션 + 행 잠금**을 그대로 지킨다. (아래 "잠금" 칸)
2. 계산 규칙은 `packages/core` 함수를 쓴다. SQL 안에 같은 규칙이 복제되어 있으니, 옮긴 뒤 core 테스트로 확인한다.
3. 권한은 `packages/core/src/permissions.ts` 의 `can()` 으로 Guard에서 확인한다. (SQL의 `is_store_member` / `is_store_admin` 자리)
4. 오류 메시지는 SQL의 `RAISE EXCEPTION` 문구를 그대로 쓴다. 화면은 이 문장을 그대로 보여준다.
5. `apps/web/src/lib/api/*` 의 해당 함수만 `supabase.rpc(...)` → NestJS API 호출로 바꾼다. 화면 코드는 바꾸지 않는다.
6. 함수가 더 이상 안 쓰이면 마이그레이션으로 `DROP FUNCTION` 한다.

### 공통 규칙 (모든 SECURITY DEFINER 함수)

- `SECURITY DEFINER` 라서 RLS를 우회한다. **권한 확인은 함수 안에서 직접** 한다. 새 함수도 첫머리에서 로그인·매장 구성원·역할을 확인할 것.
- `SET search_path = ''` 로 두고, 테이블은 `public.` 을 붙여 쓴다.
- 실행 권한: 새 함수는 `REVOKE EXECUTE ... FROM PUBLIC, anon` 후 `GRANT ... TO authenticated`.
- 사용자에게 보여줄 오류는 `RAISE EXCEPTION '한국어 문장'` (SQLSTATE `P0001`). `lib/api/errors.ts` 의 `dbErrorMessage` 가 그대로 전달한다.
- 현재 사용자: `auth.uid()` → NestJS에서는 인증된 요청의 사용자 ID.

## 함수

### `record_stock_movement` — 입출고 기록

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261006031804_record_stock_movement.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/stock.ts` `recordMovement()` |
| NestJS 대응 | `StockService.recordMovement()` (예정) |
| 권한 | 매장 구성원 (`stock:move`), `adjust` 는 사장·매니저 (`stock:adjust`) |
| 잠금 | `items` 행 `FOR UPDATE` → 같은 품목의 기록이 동시에 들어와도 로트 잔량 계산이 겹치지 않는다 |
| 쓰는 테이블 | `stock_lots` (들어올 때, 유통기한 품목), `stock_movements` (1행 이상) |
| core 대응 | `toBaseQuantity`, `toBaseUnitCost`, `allocateFifo` |
| 내부 호출 | `stock_outflow` (나가는 기록) |

입력: `p_item_id`, `p_type`(receive/consume/waste/adjust), `p_quantity`(입력 단위. adjust 만 부호 포함), `p_unit_id`, `p_unit_price`(입력 단위 1개당 원), `p_expires_on`, `p_memo`
반환: 기록된 원장 행 수

처리 순서
1. 로그인 확인 → 품목 잠금 → 매장 구성원인지, 보관 품목이 아닌지
2. 종류·권한·수량·단가·유통기한·메모 검증 (`sale` 은 거부: 판매 입력 함수에서 기록)
3. 입력 단위 → 기본 단위 환산 (`round(수량 × factor, 3)`), 사용·폐기는 음수로
4. 단가 → 기본 단위 1개당 원가 (`round(단가 / factor, 4)`)
5. **들어오는 기록**(입고, + 조정): 유통기한 품목이면 로트를 만들고, 원장 1행
6. **나가는 기록**(사용, 폐기, − 조정): `stock_outflow` 로 처리한다. 유통기한 품목이면 잔량 있는 로트를 `유통기한 오름차순(없음은 맨 뒤) → 입고 시각 → id` 순으로 꺼내며 로트마다 원장 1행.
   로트가 모자라거나 유통기한 품목이 아니면 남은 양을 로트 없이 1행. **재고가 마이너스가 되는 것은 허용**한다 (기록이 늦게 들어오는 경우).
7. 원장의 `entered_quantity` 는 행마다 `quantity / factor` (부호 포함)로 저장한다. 로트를 나눠 꺼낸 경우에도 `entered_quantity × factor = quantity` 가 성립한다.

함께 바뀐 RLS: `stock_movements`, `stock_lots` 의 INSERT 정책을 없앴다. **원장과 로트는 DB 함수로만 쓴다.**
(NestJS로 옮긴 뒤에도 원장 INSERT 는 서비스 한 곳에서만 한다)

### `record_sales` — 판매 기록 (여러 메뉴 한 번에)

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261006041140_record_sales.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/sales.ts` `recordSales()` |
| NestJS 대응 | `SalesService.record()` (예정). 나중에 POS/CSV 가져오기도 같은 서비스를 쓴다 |
| 권한 | 매장 구성원 (`sale:record`) |
| 잠금 | 레시피에 든 재료 `items` 행들을 **id 순으로** `FOR UPDATE` → 입출고·다른 판매와 동시에 들어와도 로트 계산이 겹치지 않고 교착을 피한다 |
| 쓰는 테이블 | `sale_records`(메뉴마다 1행), `stock_movements`(재료·로트마다 `sale` 행, `sale_record_id` 연결) |
| core 대응 | `saleDeductions`(사용량 × 판매 수량), `allocateFifo` |
| 내부 호출 | `stock_outflow` |

입력: `p_lines` = `[{"menu_id", "quantity"(1~10000 정수), "amount"(없으면 가격 × 수량)}]` (최대 200줄), `p_sold_at`(기본 지금, 미래 불가)
반환: 기록한 판매 건수

처리 순서
1. 로그인 확인, 줄 수 확인, 판매 시각 확인
2. 모든 메뉴가 있고 **한 매장** 것이며 그 매장 구성원인지
3. 재료 품목 잠금 (id 순)
4. 줄마다: 보관 메뉴·수량·금액 검증 → `sale_records` 1행 → 레시피 재료마다 `stock_outflow(사용량 × 수량, type 'sale', memo '판매: 메뉴 N개', occurred_at = 판매 시각)`
5. 하나라도 실패하면 전체가 취소된다 (트랜잭션)

화면 쪽: 지난 날짜로 입력하면 `p_sold_at` = 그 날 23:59:59 (한국 시간). 오늘이면 지금 시각.

**판매 취소**는 함수가 아니라 `sale_records` 한 행 삭제다(`sales.ts` `cancelSale()`, 사장·매니저 `sale:cancel`, RLS `sale_records_delete`).
FK `ON DELETE CASCADE` 로 연결된 `sale` 원장이 함께 지워진다 — **"원장 행은 삭제하지 않는다" 규칙의 유일한 예외**.
판매에서 파생된 행이라 판매와 함께 없어지는 것이 맞고, 로트 잔량도 자연히 되돌아간다.
NestJS에서는 `SalesService.cancel()` 에서 같은 트랜잭션으로 지우거나, 판매에 취소 상태를 두고 반대 원장을 남기는 방식 중 하나를 고른다.

함께 바뀐 RLS: `sale_records` 의 INSERT 정책을 없앴다. 판매는 함수로만 기록한다.

### `import_sales` — CSV 판매 가져오기

| | |
|---|---|
| 마이그레이션 | 지금 내용은 `supabase/migrations/20261008062523_import_sales_refunds.sql` (처음 `..._sale_import_functions.sql`, 취소한 키 건너뛰기 `..._sale_cancel_keys.sql`, 부호 제약 `..._sale_refunds.sql`) (표는 `..._sale_imports.sql`·`..._cancelled_sale_keys.sql`, 합계 뷰는 `..._sale_import_summaries.sql`) |
| 호출하는 곳 | `apps/web/src/lib/api/sale-imports.ts` `importSaleRows()` ← 화면 `/sales/import` 가 500건씩 나눠 부른다 |
| NestJS 대응 | `SalesService.import()` (예정). `record_sales` 와 같은 차감 로직을 쓴다 |
| 권한 | 사장·매니저 (`sale:import`, 함수 안에서 `is_store_admin`) |
| 잠금 | `record_sales` 와 같음 (재료 `items` id 순 `FOR UPDATE`) |
| 쓰는 테이블 | `sale_records`(`source = 'csv'`, `external_id`, `import_id`), `stock_movements`(`sale`) |
| core 대응 | 파일 읽기·행 키는 `sales-import.ts` (`readSaleRows`), 차감은 `saleDeductions` |
| 내부 호출 | `stock_outflow` |

입력: `p_import_id`(먼저 `sale_imports` 에 한 행을 만든다), `p_rows` = `[{"menu_id", "quantity", "amount"(없으면 가격 × 수량), "sold_at", "external_id"}]` (최대 500건)
반환: 새로 넣은 판매 건수

처리 순서
1. 로그인, 가져오기가 있고 그 매장 사장·매니저인지, 행 수
2. 모든 메뉴가 그 매장 것인지 (보관된 메뉴도 받는다: 지난 판매)
3. 재료 품목 잠금 (id 순)
4. 행마다: 수량(0 아님, 절댓값 ≤ 10000)·금액(수량과 같은 부호 또는 0)·판매 시각(미래 불가)·키(1~300자) 검증 → `cancelled_sale_keys` 에 있는 키(판매 화면에서 하나씩 취소한 판매)는 건너뜀 → `sale_records` INSERT **ON CONFLICT DO NOTHING** (`sale_records_external_key` = 매장·source·external_id) → 새로 들어간 행만 재료 처리
   - 수량 > 0 (판매): 레시피대로 `stock_outflow` 차감
   - 수량 < 0 (**취소·반품**): 판매를 음수로 기록(매출 상계)하고 레시피 재료를 `sale` 원장 **+** 로 되돌린다 (로트 없이, memo "판매 취소(CSV)"). 이론 vs 실제의 판매 차감량도 원장 합계라 자동으로 상계된다
5. 하나라도 실패하면 그 묶음 전체가 취소된다. 앞 묶음은 남지만, 같은 파일을 다시 올리면 키가 같아 남은 것만 들어간다

`external_id` = 파일 내용으로 만든 행 키: `날짜|시각|주문번호|메뉴 이름|수량|금액#같은 내용 몇 번째`. 상태 열이 "취소"인 주문 줄은 화면이 판매 줄(상태를 뺀 같은 키) + 취소 줄(키 끝 `|취소`) 두 행으로 보낸다 → 예전에 "완료"로 가져온 같은 주문은 판매 줄이 건너뛰어지고 취소 줄만 들어가 상계된다. 같은 파일·기간이 겹치는 파일을 다시 올려도 중복되지 않는다. 메뉴 매칭과 상관없는 값이라 매칭을 바꿔도 같다.
판매 시각은 화면이 보낸 매장 시간대 날짜·시각을 서버 액션이 변환한다 (시각이 없으면 그 날 23:59:59, 오늘이면 지금).

**가져오기 취소**는 `sale_imports` 한 행 삭제다 (`cancelSaleImport()`, RLS `sale_imports_delete`). `sale_records.import_id` → 판매 → 원장으로 cascade 된다. 판매 취소와 같은 원장 삭제 예외. 취소한 키는 남기지 않으므로 같은 파일을 다시 올릴 수 있다.
**가져온 판매 하나만 취소**(판매 화면)하면 트리거가 그 키를 `cancelled_sale_keys`(매장·source·external_id, 정책 없음 = 클라이언트 접근 불가)에 남긴다. 기간이 겹치는 파일을 다시 올려도 취소한 판매(예: 환불)가 되살아나지 않는다. 되돌리려면 판매 화면에서 직접 입력한다.
메뉴 이름 매칭은 `menu_aliases`(매장·파일의 이름 → 메뉴, null 이면 가져오지 않음)에 직접 upsert 한다 (한 문장, 사장·매니저, 같은 매장 메뉴만).

### `start_stock_count` — 재고 실사 시작

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261006043120_stock_count_functions.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/counts.ts` `startStockCount()` |
| NestJS 대응 | `StockCountsService.start()` (예정) |
| 권한 | 매장 구성원 (`stock:count`) |
| 쓰는 테이블 | `stock_counts` 1행, `stock_count_lines` (보관 안 된 품목마다, 카테고리를 고르면 그 카테고리만) |

매장당 진행 중인 실사는 하나(부분 유니크 인덱스 `stock_counts_one_in_progress_key` + 함수에서 먼저 확인해 친절한 오류).
줄마다 시작 시점의 장부 재고를 `expected_quantity` 로 남긴다 (화면 표시용. 조정 계산에는 쓰지 않는다).

### `complete_stock_count` — 재고 실사 완료

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261006043120_stock_count_functions.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/counts.ts` `completeStockCount()` |
| NestJS 대응 | `StockCountsService.complete()` (예정) |
| 권한 | 사장·매니저 (`stock:count:complete`) |
| 잠금 | `stock_counts` 행 `FOR UPDATE` (두 번 완료 방지) + 센 품목 `items` 행들을 id 순으로 `FOR UPDATE` |
| 쓰는 테이블 | `stock_count_lines.adjustment`, `stock_movements`(`adjust`, `stock_count_id` 연결), `stock_counts` 상태 |
| core 대응 | `countAdjustments`, `allocateFifo` |
| 내부 호출 | `stock_outflow` (줄이는 조정) |

**조정량 = 센 수량 − 그 품목을 센 시각의 장부 재고** (`occurred_at <= counted_at` 인 원장 합계, 뷰 `stock_count_line_books` 와 같은 계산).
시작 시점이나 완료 시점이 아니라 센 시각과 비교하므로, 세는 도중·센 뒤에 판매·입출고가 있어도 맞는다.
예) 10시에 원두 90g 으로 셈(그때 장부 100g) → 11시에 5g 판매 → 완료: −10g 조정 → 장부 85g.

처리 순서
1. 실사 잠금 → 구성원·사장/매니저·진행 중인지·센 품목이 있는지
2. 센 품목 잠금 (id 순)
3. 센 품목마다 조정량 계산 → `adjustment` 기록 → 줄이면 `stock_outflow`(유통기한 순), 늘리면 로트 없이 `adjust` 1행 (유통기한을 모르므로)
4. 세지 않은 품목은 건너뛴다 (`adjustment` null)
5. 상태 `completed`, 완료 시각·완료한 사람

함께 바뀐 권한 (NestJS에서는 서비스가 같은 규칙을 지킨다)
- `stock_counts`, `stock_count_lines` 의 INSERT/DELETE 는 함수로만. 직접 쓰는 정책·권한을 없앴다
- 구성원은 진행 중인 실사 줄의 **`counted_quantity` 컬럼만** 수정 가능 (`GRANT UPDATE (counted_quantity)`, 정책 `stock_count_lines_update`)
- 센 시각·센 사람(`counted_at`, `counted_by`)은 트리거 `stock_count_lines_set_counted` 가 기록한다. 화면이 보낸 값을 믿지 않는다
- 실사 취소: 사장·매니저가 `status` 를 `in_progress` → `cancelled` 로만 바꿀 수 있다 (`GRANT UPDATE (status)`, 정책 `stock_counts_cancel`). 완료 상태는 함수로만

### `receive_purchase_order` — 발주 입고 처리

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261006044357_purchasing_functions.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/purchasing.ts` `receiveOrder()` |
| NestJS 대응 | `PurchaseOrdersService.receive()` (예정) |
| 권한 | 사장·매니저 (`purchase:manage`) |
| 잠금 | 발주서 행 `FOR UPDATE` + 입고할 품목 `items` 행들을 id 순으로 `FOR UPDATE` |
| 쓰는 테이블 | `stock_lots`(유통기한 품목), `stock_movements`(`receive`, `purchase_order_line_id` 연결, 메모 "발주 입고: 거래처"), `purchase_order_lines.received_quantity`·`unit_price`, `purchase_orders.status` |
| core 대응 | `toBaseQuantity`, `toBaseUnitCost`, `derivePurchaseOrderStatus` |

입력: `p_order_id`, `p_lines` = `[{"line_id", "quantity"(주문 단위, 이번에 들어온 양), "unit_price"(없으면 발주 단가), "expires_on"}]`
반환: 바뀐 상태 (`partially_received` 또는 `received`)

처리 순서
1. 발주서 잠금 → 구성원·사장/매니저 → 상태가 `ordered`/`partially_received` 인지 (작성 중이면 "발주한 뒤에", 끝났으면 "이미 끝난")
2. 입고할 품목 잠금 (id 순)
3. 줄마다(수량 0 은 건너뜀): 보관 품목·유통기한·단가 검증 → 주문 단위 × factor = 기본 단위 → 유통기한 품목이면 로트 → `receive` 원장(원가 = 단가 / factor) → 입고 수량 누적, 단가를 바꿨으면 줄 단가도 갱신
4. 모든 줄의 입고 수량 ≥ 주문 수량이면 `received`, 아니면 `partially_received`. 주문보다 많이 들어와도 기록한다

### `change_purchase_order_status` — 발주 상태 변경

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261006044357_purchasing_functions.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/purchasing.ts` `changeOrderStatus()` |
| NestJS 대응 | `PurchaseOrdersService.place()` / `revert()` / `cancel()` / `close()` |
| 권한 | 사장·매니저 (`purchase:manage`) |
| 잠금 | 발주서 행 `FOR UPDATE` |

허용 전환 (그 밖은 "지금 상태에서는 할 수 없는 작업입니다")
- `draft → ordered` (줄이 하나 이상, `ordered_at` 기록) · `draft → cancelled`
- `ordered → draft` (되돌리기, `ordered_at` 지움) · `ordered → cancelled`
- `partially_received → received` (남은 수량 없이 마감)
- 입고에 따른 `ordered → partially_received → received` 는 `receive_purchase_order` 만 정한다

함께 바뀐 권한 (발주서·줄 편집은 함수가 아닌 일반 API — 한 행씩이거나 한 INSERT 문이라 원자적)
- `purchase_orders`: 사장·매니저가 작성 중으로 만들고(`status = draft` 만), `expected_on`·`memo`·`supplier_id` 만 수정 (컬럼 권한). 상태·발주 시각은 함수로만
- `purchase_order_lines`: **작성 중인 발주서에서만** 넣고·고치고·뺀다. 품목은 같은 매장, 단위는 그 품목의 것(정책 `purchase_order_lines_draft_write`). `received_quantity` 는 함수로만 (컬럼 권한)
- 한 발주서에 같은 품목은 한 줄 (`purchase_order_lines_po_item_key`)
- 부족 품목 담기: `apps/web/src/lib/order-suggestions.ts` + core `suggestOrderQuantity`(부족 기준 × 2 까지, 주문 단위로 올림). 여러 줄을 **한 번의 INSERT** 로 넣는다

### `stock_outflow` — 재고 꺼내기 (내부 전용)

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261006041140_record_sales.sql` |
| 호출하는 곳 | `record_stock_movement`, `record_sales`, `complete_stock_count` (클라이언트 실행 권한 없음) |
| NestJS 대응 | `StockService` 의 private 메서드. `allocateFifo` 결과대로 원장 행을 만든다 |
| 전제 | 호출하는 쪽이 권한 확인과 품목 잠금을 먼저 한다 |

입력: 품목, 종류, 꺼낼 양(기본 단위, 양수), 입력 단위·factor(원장의 entered 값용), 메모, 기록자, 발생 시각, 판매 ID, 실사 ID
유통기한 품목이면 로트를 `유통기한 오름차순(없음은 맨 뒤) → 입고 시각 → id` 순으로 꺼내고, 모자라면 로트 없이 1행. 반환: 원장 행 수

### `create_store` — 매장 만들기

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261003015320_supabase_auth_rls.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/stores.ts` `createStore()` |
| NestJS 대응 | `StoresService.create()` |
| 권한 | 로그인 사용자 |
| 쓰는 테이블 | `stores`, `store_members`(만든 사람을 owner 로) |

### `apply_store_template` — 기본 템플릿 불러오기

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261008031736_apply_store_template.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/templates.ts` `applyCafeTemplate()` (매장 만들기 체크, 대시보드 "기본 템플릿 불러오기") |
| NestJS 대응 | `CatalogService.applyTemplate()` (예정) |
| 권한 | 사장·매니저 (`catalog:manage`) |
| 잠금 | `stores` 행 `FOR UPDATE` → 같은 매장에 동시에 두 번 불러와도 겹치지 않는다 |
| 쓰는 테이블 | `categories`, `items`, `item_units`, `menus`, `recipe_ingredients` |
| core 대응 | `CAFE_TEMPLATE` (`StoreTemplate` 형태, 템플릿 내용은 여기만 고친다) |

입력: `p_store_id`, `p_template`(jsonb: `categories` 이름 배열, `items`, `menus`)
반환: 새로 만든 개수 `{"categories", "items", "menus"}`

처리 순서
1. 로그인 → 사장·매니저인지 → `categories`/`items`/`menus` 가 배열인지 (아니면 "템플릿 형식이 올바르지 않습니다.")
2. 카테고리: 기존 카테고리 뒤 순서로. **같은 이름이 있으면 건너뛴다** (품목·메뉴도 같음, 있는 것은 바꾸지 않는다)
3. 품목: 카테고리는 이름으로 연결, 입고 단위는 첫 번째가 기본 입고 단위
4. 메뉴: **새로 만든 메뉴에만** 레시피를 넣는다. 재료는 같은 이름의 품목(원래 있던 것 포함)을 쓰고, 보관한 품목은 뺀다
5. 그래서 품목을 일부 등록한 매장에서 불러와도, 두 번 불러와도 안전하다 (두 번째는 모두 0)

### `accept_invitation` — 직원 초대 수락

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261003020640_store_invitations_rls.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/members.ts` `acceptInvitation()` |
| NestJS 대응 | `InvitationsService.accept()` |
| 권한 | 로그인 사용자 (초대 토큰 소지) |
| 잠금 | `store_invitations` 행 `FOR UPDATE` → 같은 초대를 두 번 수락하지 못한다 |
| 쓰는 테이블 | `store_members`, `store_invitations`(수락 처리) |

### `get_invitation` — 초대 미리보기 (읽기 전용)

아직 구성원이 아닌 사람이 초대 링크로 매장 이름과 역할을 보기 위한 함수. RLS 때문에 함수로 둔 것이라 트랜잭션 이유는 없다.
NestJS에서는 토큰으로 조회하는 공개 API 하나로 대체한다. (`members.ts` `getInvitation()`)

### `stock_usage_summary` — 기간별 입출고 합계 (읽기 전용, 이론 vs 실제 리포트)

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261008033540_stock_usage_summary.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/reports.ts` `getUsageTotals()` → `/reports` |
| NestJS 대응 | `ReportsService.usageTotals()` (예정). 같은 집계 SQL 을 그대로 쓰면 된다 |
| 권한 | `SECURITY INVOKER` (RLS 그대로). 화면은 `report:view`(사장·매니저)만 |
| core 대응 | `avtLine`, `avtSummary`, `sortAvtLines` (`avt.ts`, 계산은 모두 여기) |

PostgREST 에서 집계(sum·group by)를 쓸 수 없어 함수로 둔 것이고, 트랜잭션 이유는 없다.
입력 `p_from` 이상 `p_to` 미만(`occurred_at`). 품목별로 종류마다 원장 합계(부호 그대로)를 낸다.
실사 조정은 `stock_count_id` 가 있는 adjust, 직접 조정은 없는 adjust. `counted` 는 그 기간에 끝난 실사에서 센 품목인지
(차이가 0 이라 조정 원장이 없어도 true. false 면 실사 차이를 모른다).
실사 구간 리포트는 (앞 실사 완료 시각, 이번 실사 완료 시각] 으로 자른다. 실사 조정 원장이 완료 시각(`now()`)에 기록되기 때문.

### `menu_sales_summary` — 기간별 메뉴 판매 합계 (읽기 전용, 리포트)

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261008135616_menu_profit.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/reports.ts` `getMenuSales()` → `/reports`(매출), `/reports/menus`(메뉴 수익성) |
| NestJS 대응 | `ReportsService.menuSales()` (예정). 같은 집계 SQL 을 그대로 쓰면 된다 |
| 권한 | `SECURITY INVOKER` (RLS 그대로). 화면은 `report:view`(사장·매니저)만 |
| core 대응 | `menuProfitLines` (`menu-profit.ts`, 마진·분류 계산은 모두 여기) |

입력 `p_from` 이상 `p_to` 미만(`sold_at`). 메뉴별 판매량·금액 합계 (취소·반품 음수 판매는 상계, 금액 없는 판매는 0원).
판매를 한 줄씩 읽으면 API 최대 행 수(`max_rows = 1000`)에 걸려 큰 기간의 합계가 틀어지므로 DB 에서 더한다.
같은 마이그레이션에서 `stores.target_cost_rate`(매장 목표 원가율) 컬럼 수정 권한을 준다 (사장만, RLS `stores_update`).

### 권한 확인 함수 — `has_store_role`, `is_store_member`, `is_store_admin`

RLS 정책과 위 함수들이 쓰는 도우미. NestJS에서는 Guard + `can()` 이 대신한다. RLS를 끌 때 함께 지운다.

## 트리거

| 트리거 | 마이그레이션 | 하는 일 | NestJS 전환 시 |
|---|---|---|---|
| `on_auth_user_created` → `handle_new_user()` | `..._supabase_auth_rls.sql` | 가입하면 `profiles` 행 생성 | 가입 API에서 직접 생성 (Supabase Auth를 계속 쓰면 유지) |
| `*_set_updated_at` → `set_updated_at()` | `..._catalog_triggers.sql` | items, suppliers, menus, purchase_orders 수정 시 `updated_at` 갱신 | **유지 권장.** Drizzle `$onUpdate` 만으로는 SQL 직접 수정 시 갱신되지 않는다 |
| `items_prevent_base_unit_change` | `..._catalog_triggers.sql` | 입출고·레시피에 쓰인 품목의 기본 단위 변경 차단 | **유지 권장** (데이터 무결성 규칙). 서비스에서도 같은 확인을 해서 친절한 오류를 먼저 낸다 |
| `stock_count_lines_set_counted` → `set_stock_count_line_counted()` | `..._stock_count_functions.sql` | 센 수량이 바뀌면 센 시각·센 사람 기록 (지우면 둘 다 null) | 서비스에서 같은 값을 직접 기록하거나 트리거 유지 |
| `stores_validate` → `validate_store()` | `..._store_settings.sql` | 매장 이름 앞뒤 공백 제거·1~50자, 시간대가 `pg_timezone_names` 에 있는지 확인 (만들기·수정 모두) | **유지 권장.** 잘못된 시간대가 들어가면 모든 화면의 날짜 계산이 깨진다. 서비스에서도 core `isValidTimeZone` 으로 먼저 확인 |
| `sale_records_broadcast_cancel` → `broadcast_sale_cancelled()` | `..._sale_cancel_broadcast.sql`, 지금 내용은 `..._sale_cancel_keys.sql` | 판매가 지워지면 비공개 Realtime 채널 `store:<매장 id>` 로 `sale_cancelled` 방송. 행 키(`external_id`)가 있으면 `cancelled_sale_keys` 에 남긴다. 가져오기 전체 취소의 cascade(그 `sale_imports` 행이 이미 없음)는 둘 다 건너뜀 | 판매 취소 서비스가 게이트웨이로 직접 알리고 취소한 키를 기록, 트리거·`realtime.messages` 정책을 지운다 |
| `sale_imports_broadcast_cancel` → `broadcast_sale_import_cancelled()` | `..._sale_import_functions.sql` | 가져오기를 지우면 판매마다가 아니라 한 번만 `sale_cancelled` 방송 | 가져오기 취소 서비스가 게이트웨이로 알린다 |

함께 바뀐 권한
- `stores`: 사장이 `name`·`timezone` 만 수정 (컬럼 권한, 정책 `stores_update`). 화면은 `/settings/store` (`store:manage`), API는 `stores.ts` `updateStore()` — 한 행이라 함수 없이 직접 쓴다
- `realtime.messages`: 정책 `store_members_receive_broadcast` — `store:<id>` 채널은 그 매장 구성원만 받는다. 보내기 정책은 없어 브라우저에서는 보낼 수 없다

## Supabase 전용 기능 (DB 함수 외)

| 기능 | 위치 | 하는 일 | NestJS 전환 시 |
|---|---|---|---|
| Realtime 구독 | `apps/web/src/lib/api/realtime.ts` `subscribeStoreChanges()` → `components/realtime-refresh.tsx`, `subscribeStockCount()` → 실사 화면 | `stock_movements`, `items` 변경과 `sale_records` 추가(내 매장, RLS 적용)를 받아 화면을 새로고침. 필터가 걸린 구독에는 삭제 이벤트가 오지 않아, 판매 취소는 DB 트리거가 비공개 채널 `store:<id>` 로 방송한 것을 받는다 | 원장 기록·품목 변경 후 서비스가 이벤트를 내고, WebSocket/SSE 게이트웨이로 매장별 방송. `subscribeStoreChanges` 의 시그니처(매장 ID, 콜백 → 구독 해제 함수)는 그대로 두고 안만 바꾼다 |
| 구독 대상 테이블 | `..._supabase_auth_rls.sql`, `..._record_sales.sql`, `..._stock_count_realtime.sql` 의 `ALTER PUBLICATION supabase_realtime` | stock_movements, items, sale_records, stock_count_lines 방송 | 게이트웨이로 옮기면 publication 에서 뺀다 |
| 가져오기 합계 뷰 | `sale_import_summaries` (`sales.ts`) | 가져오기마다 남은 판매 건수·수량·금액·판매 기간 | 뷰는 그대로 쓴다 |
| 재고 집계 뷰 | `item_stock_levels`, `lot_stock_levels`, `item_latest_costs`, `item_cost_changes` (`inventory.ts`), `stock_count_line_books` (`counts.ts`) | 원장 합계로 현재 재고·로트 잔량, 품목별 최근 입고 단가(메뉴 원가용), 품목별 가장 최근 단가 변동(직전 단가·바뀐 시각, 단가 알림용), 실사 줄의 센 시각 장부 | 뷰는 그대로 쓴다 (PostgreSQL 뷰, `security_invoker`) |

## 앞으로 추가할 함수 (예정)

| 함수 | 하는 일 | core 대응 |
|---|---|---|
| POS 직접 연동 | `import_sales` 와 같은 방식(`source = 'pos'`, 주문 ID 를 `external_id` 로)으로 웹훅·주기 동기화 | `saleDeductions` |

새 함수를 만들면 이 문서에 같은 형식으로 추가한다.
