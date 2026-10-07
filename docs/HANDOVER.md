# 인수인계 문서 — cafe-manager

작성일: 2026-10-06 · 최종 갱신: 2026-10-07 · 기준 커밋: `b4dcb74` (main)

이 문서 하나로 프로젝트를 이어받을 수 있게 정리했다. 세부 기록은 아래 문서에 있다.

| 문서 | 내용 |
|---|---|
| `docs/PROGRESS.md` | 단계별 작업 기록(무엇을 왜 어떻게), 다시 시작하는 방법 |
| `docs/db-functions.md` | DB 함수·트리거·권한 규칙과 **NestJS 전환 대응표** |
| `e2e/README.md` | 브라우저 E2E 실행·구조·새 테스트 쓰는 법 |
| `CLAUDE.md` | 저장소 규칙과 명령어 (AI 도우미도 이 규칙을 따른다) |

---

## 1. 한눈에 보기

카페 운영 관리 앱. **재고관리 MVP와 MVP 다듬기는 끝났고, 배포만 남았다.**

| 항목 | 상태 |
|---|---|
| 기능 | 로그인·매장·직원 초대 → 품목 → 입출고 → 재고 현황(실시간) → 메뉴·레시피 → 판매(재료 자동 차감) → 재고 실사 → 거래처·발주 → 매장 설정(이름·시간대) |
| 저장소 | https://github.com/ll-lrv/cafe-manager (**공개**) |
| CI | GitHub Actions — push·PR 마다 타입·lint·단위 테스트 + 브라우저 E2E. 최근 실행 모두 통과 |
| 테스트 | core 단위 23개, 브라우저 E2E 8개 시나리오 (로컬·CI 모두 통과) |
| 배포 | **아직 없음.** 로컬 Supabase(Docker)에서만 동작. 후보: Supabase 클라우드(서울) + Vercel (§10) |
| 로컬 DB | 2026-10-07 `db:reset` 으로 비움 → **계정·매장 없음.** 쓰려면 새로 가입한다 |
| 다음 | 배포 → 매출(CSV/POS) 연동 → 분석 → NestJS 전환 → Expo 앱 (§10) |

---

## 2. 확정된 결정 (바꾸려면 사용자와 상의)

| 결정 | 이유 |
|---|---|
| Supabase로 MVP → 이후 **NestJS + PostgreSQL로 기능 단위 점진 전환** | 빨리 만들고, 나중에 서버 로직을 직접 소유 |
| 웹(Next.js) 먼저, 앱은 나중에 **Expo** (Flutter 아님) | TS 코드·`packages/core` 를 앱에서도 재사용 |
| 단일 매장이지만 모든 테이블에 `store_id` | 다매장 확장 대비 |
| 권한 3단계: 사장(owner)·매니저(manager)·직원(staff) | §6 권한 표 |
| 재고 = `stock_movements` **원장 합계**. 원장은 수정·삭제하지 않고 `adjust` 로 바로잡는다 | 감사 추적, 계산 일관성. 예외: 판매 취소 시 그 판매의 차감 원장은 함께 삭제 |
| **여러 행을 함께 쓰는 작업은 DB 함수(트랜잭션)** 로 묶는다 | 중간 실패로 일부만 저장되는 일 방지. 옮길 때 보는 대응표는 `docs/db-functions.md` |
| 수량은 품목의 기본 단위(g/ml/개), 금액은 원(KRW) 정수 | 단위 환산·반올림 오류 방지 |
| 화면은 `apps/web/src/lib/api/*` 만 거친다 (supabase 직접 호출 금지) | NestJS로 바꿀 때 이 폴더만 고치면 되도록 |
| 날짜·시각은 **매장 시간대**(`stores.timezone`) 기준 | 해외 매장·서머타임 대비. 서버 시간대와 무관 |
| E2E 테스트 데이터는 **실행 후 지운다** (전용 DB 없이) | 로컬 DB에 테스트 계정이 쌓이지 않게 |
| 저장소는 GitHub **공개**, 커밋 이메일은 GitHub **noreply** | 개인 이메일 비공개 |

---

## 3. 개발 환경

### 필요한 것
- Node.js 24, pnpm 12 (`packageManager: pnpm@12.8.1`), Docker Desktop, Chrome(브라우저 테스트용)
- Windows 기준으로 개발했다. GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe` (Git Bash PATH 에는 없음)

### 처음 받았을 때
```
git clone https://github.com/ll-lrv/cafe-manager.git
cd cafe-manager
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
| `pnpm dev` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | 개발 서버 / 타입 검사(web·core·db·e2e) / lint(web·core·db) / core 단위 테스트 |
| `pnpm e2e` / `pnpm e2e sales orders` | 브라우저 E2E 전체 / 골라서 (Supabase 가 떠 있어야 함. 개발 서버는 없으면 띄움) |
| `pnpm --filter @cafe/e2e e2e:report` | 마지막 E2E 의 HTML 리포트 |
| `pnpm --filter @cafe/e2e e2e:cleanup` | 남은 테스트 계정(`e2e-...@test.kr`)과 그 매장 바로 지우기 |
| `pnpm db:generate --name <이름>` | `packages/db` 스키마 변경 → 마이그레이션 SQL 생성 |
| `cd packages/db && npx drizzle-kit generate --custom --name <이름>` | 함수·RLS·트리거 등 Supabase 전용 SQL 용 빈 마이그레이션 |
| `npx supabase migration up` | 새 마이그레이션 적용 |
| `pnpm db:types` | DB 타입(`apps/web/src/lib/supabase/database.types.ts`) 다시 생성 (§11 CLI 버전 주의) |
| `pnpm db:reset` | 로컬 DB를 비우고 마이그레이션 처음부터 (**모든 계정·데이터 삭제**) |

### Git·GitHub
- `main` 에 push 하면 CI 가 돈다. 결과: 저장소 Actions 탭 또는 `gh run list -R ll-lrv/cafe-manager`
- 이 저장소의 `user.email` 은 `88585381+ll-lrv@users.noreply.github.com` 로 설정돼 있다 (로컬 git 설정). 다른 PC에서 받으면 같은 주소로 설정한다
- 예전 저장소는 `ll-lrv/cafe-manager_v1` (이름이 `cafe-manager` 에서 바뀐 것). `C:\project\cafe-manager_v1` 폴더의 origin 은 `.../cafe-manager_v1.git` 로 바꿔 두었다
- `.github/workflows/` 를 바꿔 push 하려면 GitHub 토큰에 `workflow` 권한이 필요하다 (`gh auth refresh -h github.com -s workflow`, 이 PC는 설정됨)

---

## 4. 구조

```
apps/web                Next.js 16 (App Router)
  src/app/(app)/...     로그인 후 화면 (공통 레이아웃: 메뉴·실시간 새로고침)
  src/app/login, onboarding, invite/[token]
  src/lib/api/*         데이터 접근 (server-only). NestJS 전환 시 여기만 바꾼다
  src/lib/api/realtime.ts  브라우저용 실시간 구독 (예외적으로 클라이언트에서 사용)
  src/lib/inventory.ts, order-suggestions.ts  화면용 계산 (매장 시간대의 오늘·하루 범위, 재고 상태, 발주 추천)
  src/components/form-parts.tsx  폼 공용 부품 (§8)
  src/proxy.ts          (Next 16 의 middleware) 로그인 여부만 확인
packages/core           순수 TS 비즈니스 로직 + 단위 테스트 (DB·프레임워크 의존 금지)
packages/db             Drizzle 스키마 (스키마 변경은 반드시 여기서)
supabase/migrations     drizzle-kit 생성 SQL + 함수·RLS·트리거 SQL (15개)
e2e/                    브라우저 E2E (@playwright/test + 설치된 Chrome), tests/*.spec.ts 8개
.github/workflows/ci.yml  CI (타입·lint·단위 테스트, Supabase + E2E)
docs/                   이 문서, PROGRESS, db-functions
```

### 요청 흐름
```
화면(서버 컴포넌트) ──읽기──▶ lib/api/* ──▶ Supabase (RLS 적용)
폼(클라이언트) ──서버 액션(app/.../actions.ts)──▶ 권한 확인(core can) ──▶ lib/api/*
                                                     ├─ 한 행 쓰기: 테이블에 직접 (RLS·컬럼 권한이 최종 방어)
                                                     └─ 여러 행 쓰기: DB 함수(rpc) — 트랜잭션·행 잠금
변경 ──Supabase Realtime──▶ 다른 기기 화면 router.refresh()
  · 추가·수정: postgres_changes (store_id 필터, RLS)
  · 판매 취소(삭제): DB 트리거 → 비공개 채널 store:<id> 방송 (구성원만 수신)
```

### packages/core 주요 함수
단위 환산(`toBaseQuantity`, `formatQuantity`), 레시피 차감(`saleDeductions`), 원가(`recipeCost`, `costRate`), FIFO(`allocateFifo`), 실사 조정(`countAdjustments`), 발주(`derivePurchaseOrderStatus`, `suggestOrderQuantity`, `orderTotal`), 재고·유통기한 상태(`stockStatus`, `expiryStatus`), 시간대(`dateInTimeZone`, `zonedTimeToUtc`, `isValidTimeZone`), 권한(`can`). 테스트 23개.
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
- **매장 시간대**: "오늘"·하루의 경계·화면의 날짜와 시각은 `stores.timezone`(기본 Asia/Seoul)을 따른다. 지난 날짜 판매는 그 시간대의 23:59 로 기록. 시간대를 바꿔도 이미 기록된 시각은 그대로이고 보여주는 기준만 바뀐다. 페이지에서는 `requireCurrentStore()` 의 `timeZone` 을 쓴다.
- **실시간 반영**: 다른 기기의 입출고·품목 변경·판매·판매 취소·실사 입력이 새로고침 없이 반영된다. 입력 중인 폼 값은 유지된다.
- **삭제 대신 보관**: 품목·메뉴·거래처는 보관(archived_at)만 한다.

---

## 6. 권한 표

`packages/core/src/permissions.ts` 와 DB(RLS·컬럼 권한·함수 안 확인)를 **항상 함께** 맞춘다.

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

### 마이그레이션 (적용 순서, 15개 — 2026-10-07 빈 DB에 처음부터 적용 확인, CI 도 매번 처음부터 적용)
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
| `20261007100209_store_settings` | 매장 이름·시간대만 수정(컬럼 권한), 값 검사 트리거 `validate_store` |
| `20261007100554_sale_cancel_broadcast` | 판매 취소를 비공개 Realtime 채널 `store:<id>` 로 방송, 구성원만 수신 (`realtime.messages` 정책) |

### DB 함수·트리거 (상세는 `docs/db-functions.md`)
| 이름 | 하는 일 |
|---|---|
| `record_stock_movement` | 입고·사용·폐기·조정 (단위·단가 환산, 로트, 유통기한 순 차감) |
| `record_sales` | 여러 메뉴 판매 + 레시피대로 재료 차감 |
| `start_stock_count` / `complete_stock_count` | 실사 시작(줄 스냅샷) / 센 시각 기준 조정 |
| `receive_purchase_order` / `change_purchase_order_status` | 발주 입고 / 허용된 상태 전환 |
| `stock_outflow` (내부 전용) | 유통기한 순 차감 공용 로직 |
| `create_store`, `accept_invitation`, `get_invitation` | 매장 만들기, 초대 |
| 트리거 `validate_store` | 매장 이름(공백 제거, 1~50자)·시간대(`pg_timezone_names`) 검사 |
| 트리거 `broadcast_sale_cancelled` | 판매가 지워지면 `realtime.send` 로 매장 채널에 `sale_cancelled` 방송 |

### 지켜야 할 DB 규칙
- 원장(`stock_movements`)·로트·판매·실사 줄 생성·발주 상태와 입고 수량은 **함수로만** 쓴다. 직접 쓰는 정책·컬럼 권한이 없다.
- 한 행만 바꾸는 수정은 테이블에 직접 쓰되, 바꿀 수 있는 칸을 **컬럼 권한**으로 제한한다 (예: `stores` 는 `name`·`timezone` 만, `purchase_orders` 는 `supplier_id`·`expected_on`·`memo` 만).
- 새 SECURITY DEFINER 함수는 함수 안에서 로그인·매장 구성원·역할을 직접 확인하고, `SET search_path = ''`, `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated` 를 지킨다.
- 사용자에게 보여줄 오류는 `RAISE EXCEPTION '한국어 문장'`. 화면이 그대로 보여준다.
- 동시성: 품목 행을 **id 순으로** `FOR UPDATE` 잠근 뒤 로트를 계산한다 (교착 방지).
- 함수·트리거를 만들거나 바꾸면 `docs/db-functions.md` 를 함께 갱신한다.
- 이미 적용된 마이그레이션은 고치지 말고 새 마이그레이션을 만든다.
- 새 표를 추가하면 E2E 정리 순서(`e2e/db.ts` 의 `deleteTestUsers`)도 확인한다. 품목·메뉴·로트를 RESTRICT 로 참조하는 표는 매장보다 먼저 지워야 한다.

---

## 8. 코드 작성 시 알아둘 것

### Next.js 16·UI
- middleware 이름이 `src/proxy.ts`. `params`·`searchParams` 는 Promise. `PageProps<"/경로">` 는 Next가 만드는 전역 타입. 코드 작성 전 `apps/web/node_modules/next/dist/docs/` 확인.
- page 파일은 default export 외에 다른 값을 export 하지 않는다 (공용 값은 별도 파일, 예: `counts/status.ts`).
- shadcn/ui 는 **Base UI** 기반(base-nova). Radix 의 `asChild` 대신 render prop. 링크 버튼은 `buttonVariants()` 를 `Link` 에 적용.
- Base UI `Input` 은 `defaultValue` 가 나중에 바뀌면 경고한다 → 저장된 값이 바뀔 때 `key` 로 다시 그린다 (예: 품목·매장 설정 폼의 `fieldset key`). 폼 전체에 key 를 주면 액션 결과(알림)가 사라지니 안쪽만.
- 날짜·시각 표시: `Intl.DateTimeFormat` 에 `timeZone: "Asia/Seoul"` 을 박지 말고 매장 시간대를 넘긴다 (예: `dateFormat(store.timeZone)`, 목록 컴포넌트는 `timeZone` prop).

### 폼 공용 부품 (`components/form-parts.tsx`) — 새 폼은 이것을 쓴다
| 부품 | 언제 |
|---|---|
| `useFormAction(action, { resetOnSuccess, toastResult })` | 입력칸이 있는 모든 폼. `<form action>` 은 React 19가 제출 후 결과와 상관없이 입력칸을 비우므로, 오류가 나도 입력값이 남게 직접 제출한다. 결과에 추가 필드가 있으면 그 타입이 그대로 `state` 가 된다 (예: 직원 초대의 `token`) |
| `toastResult: true` | 성공하면 폼이 화면에서 사라지는 곳 (예: 발주 입고 완료) |
| `ActionButton` | 누르면 그 줄이 사라지는 삭제·취소 버튼. `useActionState` 로 하면 줄과 함께 결과가 사라져 알림이 안 뜬다 |
| `useToastResult(state)` | 결과를 알림으로 |
| `SubmitButton`, `Field`, `NativeSelect`, `FormMessage` | 기본 부품 (모바일 안정성 때문에 select 는 네이티브) |

입력칸이 없거나 select 하나뿐인 폼(초대 수락, 역할 변경)만 `useActionState` 를 그대로 쓴다.

### Supabase 클라이언트
- **Realtime 은 구독 전에 `supabase.realtime.setAuth(access_token)` 필요.** 브라우저 클라이언트가 쿠키 세션 토큰을 실시간 연결에 자동으로 넣지 않아, 안 넣으면 익명으로 구독되어 RLS 에 막히고 이벤트가 오지 않는다 (`lib/api/realtime.ts` 의 `subscribe`).
- 필터가 걸린 Realtime 구독에는 DELETE 이벤트가 오지 않는다 (필터 없는 DELETE 구독은 RLS 도 안 걸려 다른 매장 것까지 온다). 삭제를 알려야 하면 DB 트리거에서 `realtime.send` 로 비공개 채널 `store:<id>` 에 방송하고, 받는 쪽은 `subscribe(..., { private: true })` (예: 판매 취소).
- RLS 에 막힌 update/delete 는 오류 없이 0행 → `.select()` 로 행 수를 확인해 한국어 오류를 낸다.
- uuid 형식이 아닌 ID 는 `22P02` 오류 → 404/"없는 ~" 로 처리한다.
- 같은 테이블을 두 번 참조하면 embed 에 외래키 이름 힌트 필요 (예: `profiles!stock_counts_created_by_profiles_id_fk`).

### 브라우저 E2E (`e2e/README.md` 에 자세히)
- `import { test, expect } from "../fixtures"` 로 시작하고 `app.owner()` 로 매장을 만든다. 계정은 `app.email()` 로만 만든다 (그래야 테스트 끝에 지워진다).
- 알림(토스트)은 화면 갱신보다 조금 먼저 뜬다. 알림 직후 화면을 읽지 말고 `expect(locator).toContainText()` 처럼 바뀐 내용을 기다린다. 같은 문구의 알림이 연달아 뜨는 곳(발주 → 되돌리기 → 다시 발주)은 알림 대신 화면 상태로 확인한다.
- 다른 기기 반영은 화면을 연 뒤 `waitForRealtime()` 으로 구독 연결을 기다리고 `appearsLive()` / `disappearsLive()` 로 확인한다.
- 새 기능의 실시간·권한 확인은 "기능을 끄면 테스트가 실패하는지"까지 확인해 두면 좋다 (판매 취소 방송은 트리거를 끄고 실패를 확인했다).

### Windows 환경
- `pnpm db:types` 출력은 포맷되지 않은 TS 다 (정상).
- 스크립트로 파일을 고칠 때 CRLF 가 섞이지 않게 주의 (저장소는 LF).
- 의존성을 바꿔 `pnpm install` 한 뒤에는 **개발 서버를 다시 띄운다.** 설치 경로가 바뀌면(예: `@playwright/test` 는 Next 의 선택 peer) 떠 있던 서버가 옛 경로와 섞여 404 화면에서 모듈 오류를 낸다. 필요하면 `apps/web/.next` 도 지운다.
- 백그라운드로 띄운 `pnpm dev` 를 멈춰도 Next 프로세스가 남아 3000 포트를 잡고 있을 수 있다. 포트를 쓰는 프로세스를 확인하고 끈다.

---

## 9. 테스트 현황

| 종류 | 상태 |
|---|---|
| core 단위 테스트 (vitest) | 23개, `pnpm test` |
| 타입·lint | `pnpm typecheck`(web·core·db·e2e), `pnpm lint`(web: Next 규칙, core·db: `typescript-eslint` 권장) 통과 |
| DB 함수·정책 | 단계마다 SQL로 실제 사용자 권한(`set role authenticated` + JWT claims)으로 검증 후 롤백 |
| 브라우저 E2E | `e2e/tests/` 8개 시나리오 — 가입·초대, 품목, 입출고, 재고 현황, 판매, 실사, 발주, 매장 설정. 로컬 약 3분(3개 병렬), CI 약 5분 |
| CI | GitHub Actions 두 잡(`타입·lint·단위 테스트`, `브라우저 E2E`). 실패하면 실행 화면 Artifacts 의 `playwright-report` 를 받아 본다 |

E2E 는 `@playwright/test` 다. 시나리오 하나가 테스트 하나이고 단계(`test.step`)로 나뉘며, 확인 항목은 `expect.soft` 라 하나가 실패해도 끝까지 돈다. 실패하면 한 번 재시도한다(재시도에서 통과하면 `flaky`).
테스트는 `e2e-...@test.kr` 계정과 매장을 만들고 끝나면 지운다. 강제 종료로 남은 것은 다음 실행 때(1시간 넘은 것) 지운다.
E2E 중 `caret-color: transparent` hydration 경고는 Playwright 스크린샷이 넣는 스타일 때문이다. 앱 문제가 아니다.

---

## 10. 앞으로 해야 할 일 (권장 순서)

### 1) 배포 — 다음 작업
후보: **Supabase 클라우드(서울 리전) + Vercel**. 사용자가 방향을 정하면 진행한다. Supabase·Vercel 계정 로그인은 사용자가 직접 해야 한다.
- [ ] 정할 것: 환경 개수(운영만 / 운영+스테이징), 요금 등급, 주소(기본 `*.vercel.app` / 도메인)
- [ ] Supabase 프로젝트 생성(서울) → `supabase link` → `supabase db push` (마이그레이션 15개)
- [ ] 인증 설정: 가입 확인 메일 켜기(코드는 대비됨: 세션 없이 오면 확인 메일 안내), 사이트 주소·리디렉트 주소, 운영 SMTP
- [ ] Vercel 프로젝트: GitHub 연결, 루트 `apps/web`, 환경 변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), 함수 리전 서울
- [ ] 배포 주소에서 가입~판매 직접 확인. 운영 DB에 E2E 를 돌리지 않는다 (테스트 계정이 생김) — 필요하면 스테이징에서
- [ ] 마이그레이션 반영 방식 정하기 (처음엔 수동 `supabase db push` 권장)
- 확인 필요: Supabase 무료 프로젝트는 일정 기간 미사용 시 일시 정지, Vercel 무료(Hobby)는 비상업용 조건. 결정 전에 공식 요금표 확인

### 2) 매출 연동
- [ ] CSV 업로드: 파일 → 메뉴 매칭(`menus.external_id`) → `record_sales` 를 `source = 'csv'`, `external_id` 로 호출 (`sale_records_external_key` 로 중복 방지). 함수에 source·external_id 인자 추가 필요
- [ ] 이후 POS 연동 (웹훅 또는 주기 동기화). 메뉴 매칭 화면

### 3) 분석 (`report:view`)
- [ ] 기간별 매출·원가·마진, 메뉴별 원가율 추이, 재료 소모량, 폐기율, 실사 차이 추이
- [ ] 원장에 이미 필요한 데이터가 있다 (`type`, `unit_cost`, `sale_record_id`, `stock_count_id`, `occurred_at`). 기간 경계는 매장 시간대(`storeDayRange`)로

### 4) NestJS 전환
- [ ] `apps/api` 추가, Drizzle 스키마(`packages/db`) 재사용. 배포는 상시 서버(Render·Fly.io·Railway 등)
- [ ] `docs/db-functions.md` 의 대응표대로 기능 하나씩: 서비스 구현(트랜잭션·같은 행 잠금, core 함수 사용) → `lib/api/*` 해당 함수만 API 호출로 교체 → DB 함수 제거
- [ ] 권한은 Guard + `can()`. Realtime 은 WebSocket/SSE 게이트웨이로 (`subscribeStoreChanges` 시그니처 유지, 판매 취소 방송 트리거도 서비스 이벤트로)

### 5) Expo 앱
- [ ] 직원이 휴대폰으로 하는 화면부터: 판매 입력, 입출고, 실사. `packages/core` 재사용. 배포는 EAS

### 완료된 것 (자세한 기록은 `docs/PROGRESS.md`)
| 날짜 | 커밋 | 내용 |
|---|---|---|
| 10-03 ~ 10-06 | `bb4f517` ~ `051fa9c` | 재고관리 MVP: 모노레포·스키마 → 로그인·초대 → 품목 → 입출고 → 재고 현황 → 메뉴·판매 → 실사 → 발주 |
| 10-06 | `99e5559`, `471eeff` | 인수인계 문서, E2E 스크립트를 저장소로 |
| 10-07 | `3cd7f5f` | 로그인·매장 만들기·직원 초대 폼 `useFormAction` 전환(오류 시 입력값 유지), core·db lint |
| 10-07 | `7927e2f` | E2E 를 `@playwright/test` 로 전환 (공통 fixture, 병렬·재시도·리포트, 실행 후 데이터 정리) |
| 10-07 | `261f6a7` | 매장 설정(이름·시간대), 매장 시간대 기준 날짜 계산, 판매 취소 실시간 반영 |
| 10-07 | — | 로컬 `db:reset` 으로 마이그레이션 15개 처음부터 적용 확인 (로컬 데이터 전부 삭제) |
| 10-07 | `38e95f3`, `b4dcb74` | GitHub 공개 저장소, CI(Actions, Node 24 버전) — 첫 실행부터 통과 |

---

## 11. 알려진 제한·주의

- **배포 없음** (로컬 전용, §10)
- 리포트 화면 없음 (`report:view` 권한만 있음)
- 한 트랜잭션 안에서 입고를 두 번 하면 "최근 입고 단가"가 같은 시각이라 어느 쪽인지 정해지지 않는다 (실제 사용에서는 기록마다 시각이 달라 문제없음)
- 실사로 늘어난 양은 유통기한 정보 없이 기록된다 (품목 상세에 "유통기한 기록 없음"으로 표시). 입출고 화면의 "조정 → 늘리기"는 유통기한을 넣을 수 있다
- 삭제·상태 변경 버튼(`ActionButton`)의 알림이 화면 갱신보다 아주 조금 먼저 뜬다. 사용에는 문제없다 (E2E 는 바뀐 내용을 기다린다, §8)
- **Supabase CLI 버전**: `npx supabase` 는 그때그때 최신 CLI 를 받는다. 2026-10-07 에 받은 새 버전은 `pnpm db:types` 결과에 모든 테이블 `ComputedFields: never` 를 더한다 (스키마 변화 없음). 타입 파일 diff 가 이것뿐이면 커밋하지 않았다. CLI 를 devDependency 로 고정할지는 아직 정하지 않음
- **CI 러너**: GitHub 안내에 따르면 2026-10-19 부터 `ubuntu-latest` 가 Ubuntu 26 으로 바뀐다. 이후 CI(특히 E2E 의 Chrome·Docker)가 깨지면 `runs-on: ubuntu-24.04` 로 고정해 되돌린다
