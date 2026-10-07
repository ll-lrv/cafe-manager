# 인수인계 문서 — cafe-manager

작성일: 2026-10-06 · 기준 커밋: `c36d899` (main)

이 문서 하나로 프로젝트를 이어받을 수 있게 정리했다. 세부 기록은 아래 문서에 있다.

| 문서 | 내용 |
|---|---|
| `docs/PROGRESS.md` | 단계별 작업 기록, 다시 시작하는 방법, 다음 할 일 |
| `docs/db-functions.md` | DB 함수·트리거·권한 규칙과 **NestJS 전환 대응표** |
| `CLAUDE.md` | 저장소 규칙과 명령어 (AI 도우미도 이 규칙을 따른다) |

---

## 1. 한눈에 보기

카페 운영 관리 앱. **재고관리 MVP는 완료**됐다.

- 완료: 로그인·매장·직원 초대 → 품목 → 입출고 → 재고 현황(실시간) → 메뉴·레시피 → 판매(재료 자동 차감) → 재고 실사 → 거래처·발주
- 다음 단계: MVP 다듬기 → 매출(CSV/POS) 연동 → 분석 → NestJS 전환 → Expo 앱 (§10)
- 배포: **아직 없음**. 로컬 Supabase(Docker)에서만 동작한다. 원격 git 저장소도 아직 없다.

---

## 2. 확정된 결정 (바꾸려면 사용자와 상의)

| 결정 | 이유 |
|---|---|
| Supabase로 MVP → 이후 **NestJS + PostgreSQL로 기능 단위 점진 전환** | 빨리 만들고, 나중에 서버 로직을 직접 소유 |
| 웹(Next.js) 먼저, 앱은 나중에 **Expo** (Flutter 아님) | TS 코드·`packages/core` 를 앱에서도 재사용 |
| 단일 매장이지만 모든 테이블에 `store_id` | 다매장 확장 대비 |
| 권한 3단계: 사장(owner)·매니저(manager)·직원(staff) | §6 권한 표 |
| 재고 = `stock_movements` **원장 합계**. 원장은 수정·삭제하지 않고 `adjust` 로 바로잡는다 | 감사 추적, 계산 일관성. 예외: 판매 취소 시 그 판매의 차감 원장은 함께 삭제 |
| **여러 행을 함께 쓰는 작업은 DB 함수(트랜잭션)** 로 묶는다 (2026-10-06) | 중간 실패로 일부만 저장되는 일 방지. 옮길 때 보는 대응표는 `docs/db-functions.md` |
| 수량은 품목의 기본 단위(g/ml/개), 금액은 원(KRW) 정수 | 단위 환산·반올림 오류 방지 |
| 화면은 `apps/web/src/lib/api/*` 만 거친다 (supabase 직접 호출 금지) | NestJS로 바꿀 때 이 폴더만 고치면 되도록 |

---

## 3. 개발 환경 시작하기

### 필요한 것
- Node.js 24, pnpm 12 (`packageManager: pnpm@12.8.1`), Docker Desktop, Chrome(브라우저 테스트용)
- Windows 기준으로 개발했다.

### 처음 받았을 때
```
pnpm install
cp apps/web/.env.example apps/web/.env.local
npx supabase start -x imgproxy,edge-runtime,logflare,vector,supavisor
npx supabase status        # Publishable key 를 .env.local 의 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 에
pnpm dev                   # http://localhost:3000
```
- 로컬 DB가 비어 있으면 `npx supabase start` 때 마이그레이션 15개가 모두 적용된다.
- DB 보기: Supabase Studio http://127.0.0.1:55323 · 메일함(Mailpit) http://127.0.0.1:55324

### 이어서 작업할 때
1. Docker Desktop 실행 (`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`)
2. `npx supabase start -x imgproxy,edge-runtime,logflare,vector,supavisor` (데이터는 남아 있음)
3. `pnpm dev`

### 포트 주의
이 PC에는 다른 Supabase 프로젝트(`cafe-manager_simple`)와 `cafe-postgres` 컨테이너가 있어 기본 포트(543xx)를 쓰지 않고 **553xx** 를 쓴다. API 55321 · DB 55322 · Studio 55323 · Mailpit 55324. 다른 프로젝트 컨테이너는 건드리지 않는다.

### 자주 쓰는 명령
| 명령 | 하는 일 |
|---|---|
| `pnpm dev` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | 개발 서버 / 타입 검사 / lint / core 단위 테스트 |
| `pnpm e2e` / `pnpm e2e sales` | 브라우저 E2E 전체 / 하나 (Supabase 가 떠 있어야 함. 개발 서버는 없으면 띄움, `e2e/README.md`) |
| `pnpm db:generate --name <이름>` | `packages/db` 스키마 변경 → 마이그레이션 SQL 생성 |
| `cd packages/db && npx drizzle-kit generate --custom --name <이름>` | 함수·RLS 등 Supabase 전용 SQL 용 빈 마이그레이션 |
| `npx supabase migration up` | 새 마이그레이션 적용 |
| `pnpm db:types` | DB 타입(`apps/web/src/lib/supabase/database.types.ts`) 다시 생성 |
| `pnpm db:reset` | 로컬 DB를 비우고 마이그레이션 처음부터 (**테스트 계정 모두 삭제**) |

---

## 4. 구조

```
apps/web                Next.js 16 (App Router)
  src/app/(app)/...     로그인 후 화면 (공통 레이아웃: 메뉴·실시간 새로고침)
  src/app/login, onboarding, invite/[token]
  src/lib/api/*         데이터 접근 (server-only). NestJS 전환 시 여기만 바꾼다
  src/lib/api/realtime.ts  브라우저용 실시간 구독 (예외적으로 클라이언트에서 사용)
  src/lib/inventory.ts, order-suggestions.ts  화면용 계산 (매장 시간대, 재고 상태, 발주 추천)
  src/components/form-parts.tsx  폼 공용 부품 (§8)
  src/proxy.ts          (Next 16 의 middleware) 로그인 여부만 확인
packages/core           순수 TS 비즈니스 로직 + 단위 테스트 (DB·프레임워크 의존 금지)
packages/db             Drizzle 스키마 (스키마 변경은 반드시 여기서)
supabase/migrations     drizzle-kit 생성 SQL + 함수·RLS·트리거 SQL
e2e/                    브라우저 E2E 시나리오 7개 (@playwright/test + 설치된 Chrome)
docs/                   이 문서, PROGRESS, db-functions
```

### 요청 흐름
```
화면(서버 컴포넌트) ──읽기──▶ lib/api/* ──▶ Supabase (RLS 적용)
폼(클라이언트) ──서버 액션(app/.../actions.ts)──▶ 권한 확인(core can) ──▶ lib/api/*
                                                     ├─ 한 행 쓰기: 테이블에 직접 (RLS·컬럼 권한이 최종 방어)
                                                     └─ 여러 행 쓰기: DB 함수(rpc) — 트랜잭션·행 잠금
변경 ──Supabase Realtime──▶ 다른 기기 화면 router.refresh()
```

### packages/core 주요 함수
단위 환산(`toBaseQuantity`, `formatQuantity`), 레시피 차감(`saleDeductions`), 원가(`recipeCost`, `costRate`), FIFO(`allocateFifo`), 실사 조정(`countAdjustments`), 발주(`derivePurchaseOrderStatus`, `suggestOrderQuantity`, `orderTotal`), 재고·유통기한 상태(`stockStatus`, `expiryStatus`), 권한(`can`). 테스트 21개.
DB 함수 안에 같은 규칙이 SQL로 복제되어 있다. NestJS로 옮기면 core 함수를 쓰고 SQL은 지운다.

---

## 5. 화면과 기능

| 경로 | 기능 | 사용 |
|---|---|---|
| `/login`, `/onboarding`, `/invite/[token]` | 로그인·가입, 매장 만들기, 초대 수락 | 누구나 |
| `/dashboard` | 오늘 매출, 부족 품목, 유통기한 확인, 진행 중 실사, 입고 예정, 최근 기록 | 구성원 (입고 예정은 사장·매니저) |
| `/sales` | 메뉴별 판매 일괄 입력(± 버튼), 차감될 재료 미리보기, 날짜 이동(지난 날은 23:59로 기록), 매출 합계, 판매 취소 | 입력: 구성원 / 취소: 사장·매니저 |
| `/stock` | 입고·사용·폐기·조정, 재고 미리보기, 단가·유통기한, 최근 기록 | 구성원 / 조정: 사장·매니저 |
| `/items`, `/items/[id]`, `/items/new`, `/items/categories` | 품목·재고 목록(상태 필터), 상세(로트별 남은 양, 기록), 입고 단위, 기본 거래처, 카테고리 | 보기: 구성원 / 관리: 사장·매니저 |
| `/menus`, `/menus/[id]`, `/menus/new` | 메뉴 가격, 레시피, 원가·원가율 | 보기: 구성원 / 관리: 사장·매니저 |
| `/counts`, `/counts/[id]` | 재고 실사 (전체/카테고리, 묶음+낱개 입력, 여럿이 나눠 세기, 완료·취소, 결과) | 세기: 구성원 / 완료·취소: 사장·매니저 |
| `/orders`, `/orders/[id]`, `/orders/new` | 발주서 (부족 품목 추천, 발주 내용 복사, 일부 입고, 마감) | 사장·매니저 |
| `/suppliers`, `/suppliers/[id]`, `/suppliers/new` | 거래처 | 사장·매니저 |
| `/settings/members` | 직원 초대(링크), 역할 변경, 내보내기 | 사장 |
| `/settings/store` | 매장 이름, 시간대 | 사장 |

### 꼭 알아야 할 동작
- **재고 마이너스 허용**: 기록이 늦게 들어오는 현실 때문. 화면에서 경고만 한다.
- **유통기한(로트)**: `track_expiry` 품목은 입고 때 로트를 만들고, 나갈 때 기한이 빠른 로트부터 꺼낸다. 로트가 모자라면 나머지는 로트 없이 차감한다.
- **실사 조정 기준 = 품목을 센 시각의 장부**: 세는 도중·센 뒤의 판매가 있어도 정확하다. (시작·완료 시점 비교가 아님)
- **메뉴 원가** = 레시피 사용량 × 재료의 최근 입고 단가(`item_latest_costs` 뷰). 단가를 넣지 않은 입고는 원가에 쓰이지 않는다.
- **발주 추천 수량** = 부족 알림 기준 × 2 까지 채우는 양, 기본 입고 단위로 올림.
- **"오늘"·하루의 경계·화면의 날짜와 시각** 은 매장 시간대(`stores.timezone`, 기본 Asia/Seoul, 매장 설정에서 변경)를 따른다. 지난 날짜 판매는 그 시간대의 23:59 로 기록 (`lib/inventory.ts`, core `zonedTimeToUtc`). 시간대를 바꿔도 이미 기록된 시각은 그대로다.
- **삭제 대신 보관**: 품목·메뉴·거래처는 보관(archived_at)만 한다.

---

## 6. 권한 표

`packages/core/src/permissions.ts` 와 DB(RLS·함수 안 확인)를 **항상 함께** 맞춘다.

| 권한 | 사장 | 매니저 | 직원 |
|---|:-:|:-:|:-:|
| `stock:move` 입고·사용·폐기 | ✓ | ✓ | ✓ |
| `stock:adjust` 재고 조정 | ✓ | ✓ | |
| `stock:count` 실사 시작·세기 | ✓ | ✓ | ✓ |
| `stock:count:complete` 실사 완료·취소 | ✓ | ✓ | |
| `sale:record` 판매 입력 | ✓ | ✓ | ✓ |
| `sale:cancel` 판매 취소 | ✓ | ✓ | |
| `catalog:manage` 품목·카테고리·메뉴·레시피 | ✓ | ✓ | |
| `supplier:manage` 거래처 | ✓ | ✓ | |
| `purchase:manage` 발주·입고 처리 | ✓ | ✓ | |
| `report:view` 리포트 (아직 화면 없음) | ✓ | ✓ | |
| `member:manage` 직원 관리 | ✓ | | |
| `store:manage` 매장 정보 (이름·시간대) | ✓ | | |

권한 확인은 3중이다: 화면(버튼 숨김) → 서버 액션(`can`) → DB(RLS·컬럼 권한·함수). DB가 최종 방어다.

---

## 7. DB

### 마이그레이션 (적용 순서)
| 파일 | 내용 |
|---|---|
| `20261003015300_init` | 전체 스키마 (Drizzle) |
| `20261003015320_supabase_auth_rls` | 인증 연동, `create_store`, 권한 함수, RLS, Realtime |
| `20261003020639/40_store_invitations(_rls)` | 초대 테이블·함수, 사장 행 보호 |
| `20261006025618_catalog_triggers` | `updated_at` 자동 갱신, 기본 단위 변경 차단 |
| `20261006031804_record_stock_movement` | 입출고 함수, 원장·로트 직접 INSERT 금지 |
| `20261006041135_item_latest_costs` | 최근 입고 단가 뷰 |
| `20261006041140_record_sales` | 판매 함수, 공용 `stock_outflow`, 판매 직접 INSERT 금지 |
| `20261006043104/20/37_stock_count_*` | 실사 컬럼·뷰, 실사 함수·트리거·컬럼 권한, Realtime |
| `20261006044355/57_purchas*` | 발주 줄 중복 금지, 발주 함수·컬럼 권한 |
| `20261007100209_store_settings` | 매장 이름·시간대만 수정(컬럼 권한), 값 검사 트리거 |
| `20261007100554_sale_cancel_broadcast` | 판매 취소를 매장 전용 비공개 Realtime 채널로 방송, 구성원만 수신 |

### DB 함수 (상세는 `docs/db-functions.md`)
| 함수 | 하는 일 |
|---|---|
| `record_stock_movement` | 입고·사용·폐기·조정 (단위·단가 환산, 로트, 유통기한 순 차감) |
| `record_sales` | 여러 메뉴 판매 + 레시피대로 재료 차감 |
| `start_stock_count` / `complete_stock_count` | 실사 시작(줄 스냅샷) / 센 시각 기준 조정 |
| `receive_purchase_order` / `change_purchase_order_status` | 발주 입고 / 허용된 상태 전환 |
| `stock_outflow` (내부 전용) | 유통기한 순 차감 공용 로직 |
| `create_store`, `accept_invitation`, `get_invitation` | 매장 만들기, 초대 |

### 지켜야 할 DB 규칙
- 원장(`stock_movements`)·로트·판매·실사 줄 생성·발주 상태와 입고 수량은 **함수로만** 쓴다. 직접 쓰는 정책·컬럼 권한이 없다.
- 새 SECURITY DEFINER 함수는 함수 안에서 로그인·매장 구성원·역할을 직접 확인하고, `SET search_path = ''`, `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated` 를 지킨다.
- 사용자에게 보여줄 오류는 `RAISE EXCEPTION '한국어 문장'`. 화면이 그대로 보여준다.
- 동시성: 품목 행을 **id 순으로** `FOR UPDATE` 잠근 뒤 로트를 계산한다 (교착 방지).
- 함수를 만들거나 바꾸면 `docs/db-functions.md` 를 함께 갱신한다.
- 이미 적용된 마이그레이션은 고치지 말고 새 마이그레이션을 만든다. (예외 기록: `20261006044357_purchasing_functions` 는 로컬 적용 후 오류 문구 하나를 고치고 함수를 다시 적용했다. 2026-10-07 `db:reset` 으로 15개 전체를 처음부터 적용해 문제없음을 확인했다.)

---

## 8. 코드 작성 시 알아둘 것

### Next.js 16·UI
- middleware 이름이 `src/proxy.ts`. `params`·`searchParams` 는 Promise. `PageProps<"/경로">` 는 Next가 만드는 전역 타입. 코드 작성 전 `apps/web/node_modules/next/dist/docs/` 확인.
- page 파일은 default export 외에 다른 값을 export 하지 않는다 (공용 값은 별도 파일, 예: `counts/status.ts`).
- shadcn/ui 는 **Base UI** 기반(base-nova). Radix 의 `asChild` 대신 render prop. 링크 버튼은 `buttonVariants()` 를 `Link` 에 적용.
- Base UI `Input` 은 `defaultValue` 가 나중에 바뀌면 경고한다 → 저장된 값이 바뀔 때 `key` 로 다시 그린다 (예: 품목 폼의 `fieldset key`). 폼 전체에 key 를 주면 액션 결과(알림)가 사라지니 안쪽만.

### 폼 공용 부품 (`components/form-parts.tsx`) — 새 폼은 이것을 쓴다
| 부품 | 언제 |
|---|---|
| `useFormAction(action, { resetOnSuccess, toastResult })` | 일반 폼. `<form action>` 은 React 19가 제출 후 결과와 상관없이 입력칸을 비우므로, 오류가 나도 입력값이 남게 직접 제출한다 |
| `toastResult: true` | 성공하면 폼이 화면에서 사라지는 곳 (예: 발주 입고 완료) |
| `ActionButton` | 누르면 그 줄이 사라지는 삭제·취소 버튼. `useActionState` 로 하면 줄과 함께 결과가 사라져 알림이 안 뜬다 |
| `useToastResult(state)` | 결과를 알림으로 |
| `SubmitButton`, `Field`, `NativeSelect`, `FormMessage` | 기본 부품 (모바일 안정성 때문에 select 는 네이티브) |

입력칸이 있는 폼은 모두 `useFormAction` 을 쓴다. (초대 수락·역할 변경처럼 입력칸이 없거나 select 하나뿐인 폼은 `useActionState` 그대로)
결과에 추가 필드가 있으면 액션의 반환 타입이 그대로 `state` 타입이 된다 (예: 직원 초대의 `token`).

### Supabase 클라이언트
- **Realtime 은 구독 전에 `supabase.realtime.setAuth(access_token)` 필요.** 브라우저 클라이언트가 쿠키 세션 토큰을 실시간 연결에 자동으로 넣지 않아, 안 넣으면 익명으로 구독되어 RLS 에 막히고 이벤트가 오지 않는다 (`lib/api/realtime.ts` 의 `subscribe`).
- 필터가 걸린 Realtime 구독에는 DELETE 이벤트가 오지 않는다. 삭제를 알려야 하면 DB 트리거에서 `realtime.send` 로 비공개 채널 `store:<id>` 에 방송한다 (예: 판매 취소). 받는 쪽은 `subscribe(..., { private: true })`, 수신 권한은 `realtime.messages` 정책
- RLS 에 막힌 update/delete 는 오류 없이 0행 → `.select()` 로 행 수를 확인해 한국어 오류를 낸다.
- uuid 형식이 아닌 ID 는 `22P02` 오류 → 404/"없는 ~" 로 처리한다.
- 같은 테이블을 두 번 참조하면 embed 에 외래키 이름 힌트 필요 (예: `profiles!stock_counts_created_by_profiles_id_fk`).

### Windows 환경
- `pnpm db:types` 출력은 포맷되지 않은 TS 다 (정상).
- 스크립트로 파일을 고칠 때 CRLF 가 섞이지 않게 주의 (저장소는 LF).

---

## 9. 테스트 현황

| 종류 | 상태 |
|---|---|
| core 단위 테스트 (vitest) | 21개, `pnpm test` |
| 타입·lint | `pnpm typecheck`, `pnpm lint` 통과 (lint: `apps/web` 은 Next 규칙, `core`·`db` 는 `typescript-eslint` 권장 규칙) |
| DB 함수 | 단계마다 SQL로 실제 사용자 권한(`set role authenticated` + JWT claims)으로 검증 후 롤백 |
| 브라우저 E2E | `e2e/tests/` 7개 시나리오 통과 (가입·초대, 품목, 입출고, 재고 현황, 판매, 실사, 발주). `pnpm e2e` |

브라우저 E2E는 `@playwright/test` 다. 시나리오 하나가 테스트 하나이고 단계(`test.step`)로 나뉘며, 확인 항목은 `expect.soft` 라 하나가 실패해도 끝까지 돈다.
공통 준비(가입·매장 만들기·초대·품목/메뉴 만들기)는 `e2e/fixtures.ts`·`helpers.ts`. 3개씩 병렬, 실패하면 한 번 재시도, HTML 리포트와 실패 시 trace.
실행 방법·시나리오 설명·새 테스트 쓰는 법은 `e2e/README.md`.
테스트는 `e2e-...@test.kr` 계정과 매장을 만들고 끝나면 지운다 (강제 종료로 남은 것은 다음 실행 때, 바로 지우려면 `pnpm --filter @cafe/e2e e2e:cleanup`). CI에는 아직 연결하지 않았다 (원격 저장소를 정할 때 함께).
E2E 중 `caret-color: transparent` hydration 경고가 보이면 Playwright 스크린샷이 넣는 스타일 때문이다. 앱 문제가 아니다.

---

## 10. 앞으로 해야 할 일 (권장 순서)

### 1) MVP 다듬기 — 먼저 하길 권장
- [x] E2E 스크립트를 저장소 `e2e/` 로 옮김 (`pnpm e2e`, 216개 항목)
- [x] E2E 를 `@playwright/test` 로 정식 전환: 공통 fixture, 리포트·재시도·병렬, 실행 후 테스트 데이터 정리
- [ ] E2E 를 CI 에서 돌리기 (원격 저장소·배포 환경을 정할 때. CI 에서 Supabase 를 띄우는 설정 필요)
- [x] 로그인·매장 만들기·직원 초대 폼을 `useFormAction` 으로 (오류 시 입력값 유지)
- [x] `@cafe/core`, `@cafe/db` 에 lint 스크립트
- [x] `pnpm db:reset` 으로 마이그레이션 15개를 처음부터 적용해 확인 (2026-10-07, 이후 E2E 8개 통과)
- [x] 매장 시간대를 매장 설정으로, 매장 정보 화면(`/settings/store`)
- [x] 판매 취소가 다른 기기에 바로 반영되게 (DB 트리거 → 매장 전용 비공개 채널 방송)
- [ ] 원격 git 저장소 연결, 배포 환경(Supabase 클라우드 + Vercel 등) 결정

### 2) 매출 연동
- [ ] CSV 업로드: 파일 → 메뉴 매칭(`menus.external_id`) → `record_sales` 를 `source = 'csv'`, `external_id` 로 호출 (`sale_records_external_key` 로 중복 방지). 함수에 source·external_id 인자 추가 필요
- [ ] 이후 POS 연동 (웹훅 또는 주기 동기화). 메뉴 매칭 화면

### 3) 분석 (`report:view`)
- [ ] 기간별 매출·원가·마진, 메뉴별 원가율 추이, 재료 소모량, 폐기율, 실사 차이 추이
- [ ] 원장에 이미 필요한 데이터가 있다 (`type`, `unit_cost`, `sale_record_id`, `stock_count_id`, `occurred_at`)

### 4) NestJS 전환
- [ ] `apps/api` 추가, Drizzle 스키마(`packages/db`) 재사용
- [ ] `docs/db-functions.md` 의 대응표대로 기능 하나씩: 서비스 구현(트랜잭션·같은 행 잠금, core 함수 사용) → `lib/api/*` 해당 함수만 API 호출로 교체 → DB 함수 제거
- [ ] 권한은 Guard + `can()`. Realtime 은 WebSocket/SSE 게이트웨이로 (`subscribeStoreChanges` 시그니처 유지)

### 5) Expo 앱
- [ ] 직원이 휴대폰으로 하는 화면부터: 판매 입력, 입출고, 실사. `packages/core` 재사용

---

## 11. 알려진 제한

- 배포·원격 저장소 없음 (로컬 전용)
- 브라우저 E2E는 CI 미연결 (§9)
- 한 트랜잭션 안에서 입고를 두 번 하면 "최근 입고 단가"가 같은 시각이라 어느 쪽인지 정해지지 않는다 (실제 사용에서는 기록마다 시각이 달라 문제없음)
- 실사로 늘어난 양은 유통기한 정보 없이 기록된다 (품목 상세에 "유통기한 기록 없음"으로 표시). 입출고 화면의 "조정 → 늘리기"는 유통기한을 넣을 수 있다
- 리포트 화면 없음
- 삭제·상태 변경 버튼(`ActionButton`)의 알림이 화면 갱신보다 아주 조금 먼저 뜬다. 사용에는 문제없지만, E2E 에서 알림 직후 화면을 읽으면 실패할 수 있어 결과 문구가 나타날 때까지 기다린다
