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

입력: `p_item_id`, `p_type`(receive/consume/waste/adjust), `p_quantity`(입력 단위. adjust 만 부호 포함), `p_unit_id`, `p_unit_price`(입력 단위 1개당 원), `p_expires_on`, `p_memo`
반환: 기록된 원장 행 수

처리 순서
1. 로그인 확인 → 품목 잠금 → 매장 구성원인지, 보관 품목이 아닌지
2. 종류·권한·수량·단가·유통기한·메모 검증 (`sale` 은 거부: 판매 입력 함수에서 기록)
3. 입력 단위 → 기본 단위 환산 (`round(수량 × factor, 3)`), 사용·폐기는 음수로
4. 단가 → 기본 단위 1개당 원가 (`round(단가 / factor, 4)`)
5. **들어오는 기록**(입고, + 조정): 유통기한 품목이면 로트를 만들고, 원장 1행
6. **나가는 기록**(사용, 폐기, − 조정): 유통기한 품목이면 잔량 있는 로트를 `유통기한 오름차순(없음은 맨 뒤) → 입고 시각 → id` 순으로 꺼내며 로트마다 원장 1행.
   로트가 모자라거나 유통기한 품목이 아니면 남은 양을 로트 없이 1행. **재고가 마이너스가 되는 것은 허용**한다 (기록이 늦게 들어오는 경우).
7. 원장의 `entered_quantity` 는 행마다 `quantity / factor` (부호 포함)로 저장한다. 로트를 나눠 꺼낸 경우에도 `entered_quantity × factor = quantity` 가 성립한다.

함께 바뀐 RLS: `stock_movements`, `stock_lots` 의 INSERT 정책을 없앴다. **원장과 로트는 DB 함수로만 쓴다.**
(NestJS로 옮긴 뒤에도 원장 INSERT 는 서비스 한 곳에서만 한다)

### `create_store` — 매장 만들기

| | |
|---|---|
| 마이그레이션 | `supabase/migrations/20261003015320_supabase_auth_rls.sql` |
| 호출하는 곳 | `apps/web/src/lib/api/stores.ts` `createStore()` |
| NestJS 대응 | `StoresService.create()` |
| 권한 | 로그인 사용자 |
| 쓰는 테이블 | `stores`, `store_members`(만든 사람을 owner 로) |

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

### 권한 확인 함수 — `has_store_role`, `is_store_member`, `is_store_admin`

RLS 정책과 위 함수들이 쓰는 도우미. NestJS에서는 Guard + `can()` 이 대신한다. RLS를 끌 때 함께 지운다.

## 트리거

| 트리거 | 마이그레이션 | 하는 일 | NestJS 전환 시 |
|---|---|---|---|
| `on_auth_user_created` → `handle_new_user()` | `..._supabase_auth_rls.sql` | 가입하면 `profiles` 행 생성 | 가입 API에서 직접 생성 (Supabase Auth를 계속 쓰면 유지) |
| `*_set_updated_at` → `set_updated_at()` | `..._catalog_triggers.sql` | items, suppliers, menus, purchase_orders 수정 시 `updated_at` 갱신 | **유지 권장.** Drizzle `$onUpdate` 만으로는 SQL 직접 수정 시 갱신되지 않는다 |
| `items_prevent_base_unit_change` | `..._catalog_triggers.sql` | 입출고·레시피에 쓰인 품목의 기본 단위 변경 차단 | **유지 권장** (데이터 무결성 규칙). 서비스에서도 같은 확인을 해서 친절한 오류를 먼저 낸다 |

## Supabase 전용 기능 (DB 함수 외)

| 기능 | 위치 | 하는 일 | NestJS 전환 시 |
|---|---|---|---|
| Realtime 구독 | `apps/web/src/lib/api/realtime.ts` `subscribeStoreChanges()` → `components/realtime-refresh.tsx` | `stock_movements`, `items` 변경(내 매장, RLS 적용)을 받아 화면을 새로고침 | 원장 기록·품목 변경 후 서비스가 이벤트를 내고, WebSocket/SSE 게이트웨이로 매장별 방송. `subscribeStoreChanges` 의 시그니처(매장 ID, 콜백 → 구독 해제 함수)는 그대로 두고 안만 바꾼다 |
| 구독 대상 테이블 | `..._supabase_auth_rls.sql` 끝의 `ALTER PUBLICATION supabase_realtime` | 위 두 테이블만 방송 | 게이트웨이로 옮기면 publication 에서 뺀다 |
| 재고 집계 뷰 | `item_stock_levels`, `lot_stock_levels` (Drizzle 스키마 `inventory.ts`) | 원장 합계로 현재 재고·로트 잔량 계산 | 뷰는 그대로 쓴다 (PostgreSQL 뷰, `security_invoker`) |

## 앞으로 추가할 함수 (예정)

| 함수 | 하는 일 | core 대응 |
|---|---|---|
| 판매 기록 | `sale_records` + 레시피대로 재료 차감(`sale` 원장, 유통기한 순) | `recipe.ts`, `allocateFifo` |
| 판매 취소 | `sale_records` 삭제 → 연결된 `sale` 원장도 함께 삭제(cascade) | |
| 실사 완료 | 실사 수량과 장부 차이만큼 `adjust` 원장 + 상태 `completed` | `stock-count.ts` |
| 발주 입고 처리 | 발주 줄의 입고 수량 갱신 + `receive` 원장 + 발주 상태 갱신 | `purchasing.ts` |

새 함수를 만들면 이 문서에 같은 형식으로 추가한다.
