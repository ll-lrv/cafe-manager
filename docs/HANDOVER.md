# 인수인계 문서 — cafe-manager

작성일: 2026-10-06 · 최종 갱신: 2026-10-08 · 기준 커밋: `c1021d1` (main)

이 문서 하나로 프로젝트를 이어받을 수 있게 정리했다. 세부 기록은 아래 문서에 있다.

| 문서 | 내용 |
|---|---|
| `docs/PROGRESS.md` | 단계별 작업 기록(무엇을 왜 어떻게), 다시 시작하는 방법 |
| `docs/db-functions.md` | DB 함수·트리거·권한 규칙과 **NestJS 전환 대응표** |
| `e2e/README.md` | 브라우저 E2E 실행·구조·새 테스트 쓰는 법 |
| `CLAUDE.md` | 저장소 규칙과 명령어 (AI 도우미도 이 규칙을 따른다) |

---

## 1. 한눈에 보기

카페 운영 관리 앱. **재고관리 MVP는 끝났고, 유료화를 위한 기능(카페 기본 템플릿, 이론 vs 실제 리포트, 단가 알림, CSV 판매 가져오기, 메뉴 수익성·목표 원가율, 메뉴 옵션 차감)을 붙이는 중이다.** 배포는 아직 안 했다.

| 항목 | 상태 |
|---|---|
| 기능 | 로그인·매장·직원 초대 → 품목 → 입출고 → 재고 현황(실시간) → 메뉴·레시피 → 판매(재료 자동 차감) → 재고 실사 → 거래처·발주 → 매장 설정(이름·시간대) → **카페 기본 템플릿 → 이론 vs 실제 리포트(AvT) → 입고 단가 변동 알림 → CSV 판매 가져오기(취소·반품 반영) → 메뉴 수익성 순위·목표 원가율(권장 판매가, 목표 넘음 알림) → 메뉴 옵션 차감(판매 입력)** |
| 저장소 | https://github.com/ll-lrv/cafe-manager (**공개**) |
| CI | GitHub Actions — push·PR 마다 타입·lint·단위 테스트 + 브라우저 E2E. 최근 실행(`c9fc151`) 결과는 §10 "완료된 것" 참고 |
| 테스트 | core 단위 42개, 브라우저 E2E 14개 시나리오 (로컬 전체 통과, 2026-10-08) |
| 배포 | **아직 없음.** 로컬 Supabase(Docker)에서만 동작. 후보: Supabase 클라우드(서울) + Vercel (§10) |
| 로컬 DB | 2026-10-07 에 비운 뒤 **데모 계정 하나**를 만들어 둠: `demo-owner@cafe.kr` / `test1234` ("데모 카페", 품목 3·메뉴 2·판매 65잔). 실사 기록은 없다 |
| 다음 | CSV 옵션 열 연결(옵션 2단계) → 소진 예상일·추천 발주 → 폐기 사유. 배포·시범 매장은 이보다 먼저 하기를 권장 (사용자 결정, §10) |

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
- 로컬 DB가 비어 있으면 `npx supabase start` 때 마이그레이션 17개가 모두 적용된다.
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
- 작업 방식(2026-10-08~): 기능마다 브랜치(`fix/...`, `feat/...`)에서 커밋 → `main` 에 fast-forward merge → push → 브랜치 삭제 → CI 결과 확인. 커밋·push 는 사용자가 요청할 때만 한다
- AI 세션 두 개를 동시에 돌릴 때는 **세션마다 작업 폴더(git worktree)를 따로** 쓴다. 2026-10-08 에 두 세션이 같은 폴더에서 CSV 가져오기를 동시에 고쳐 `import_sales` 가 서로 덮어써졌다 (한쪽이 합쳐서 해결)
- `.github/workflows/` 를 바꿔 push 하려면 GitHub 토큰에 `workflow` 권한이 필요하다 (`gh auth refresh -h github.com -s workflow`, 이 PC는 설정됨)

---

## 4. 구조

```
apps/web                Next.js 16 (App Router)
  src/app/(app)/...     로그인 후 화면 (공통 레이아웃: 메뉴·실시간 새로고침)
  src/app/login, onboarding, invite/[token]
  src/lib/api/*         데이터 접근 (server-only). NestJS 전환 시 여기만 바꾼다 (templates.ts 기본 템플릿, reports.ts 리포트 집계 포함)
  src/lib/api/realtime.ts  브라우저용 실시간 구독 (예외적으로 클라이언트에서 사용)
  src/lib/inventory.ts, order-suggestions.ts  화면용 계산 (매장 시간대의 오늘·하루 범위, 재고 상태, 발주 추천)
  src/components/form-parts.tsx  폼 공용 부품 (§8)
  src/proxy.ts          (Next 16 의 middleware) 로그인 여부만 확인
packages/core           순수 TS 비즈니스 로직 + 단위 테스트 (DB·프레임워크 의존 금지)
packages/db             Drizzle 스키마 (스키마 변경은 반드시 여기서)
supabase/migrations     drizzle-kit 생성 SQL + 함수·RLS·트리거 SQL (30개)
e2e/                    브라우저 E2E (@playwright/test + 설치된 Chrome), tests/*.spec.ts 14개
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
단위 환산(`toBaseQuantity`, `formatQuantity`, `formatUnitCount`, `oneUnitLabel`), 레시피 차감(`saleDeductions`), 원가(`recipeCost`, `costRate`), FIFO(`allocateFifo`), 실사 조정(`countAdjustments`), 발주(`derivePurchaseOrderStatus`, `suggestOrderQuantity`, `orderTotal`), 재고·유통기한 상태(`stockStatus`, `expiryStatus`), 시간대(`dateInTimeZone`, `zonedTimeToUtc`, `isValidTimeZone`), 권한(`can`), 기본 템플릿 데이터(`CAFE_TEMPLATE`), 이론 vs 실제(`avtLine`, `avtSummary`, `sortAvtLines`), 단가 변동(`costChangePercent`, `isNotableCostChange`, `menuCostImpacts`, 기준 `COST_ALERT_PERCENT`·`COST_ALERT_DAYS`), 판매 파일 읽기(`decodeCsv`, `parseCsv`, `findHeaderRow`, `guessColumns`, `parseSaleDateTime`, `readSaleRows`, `matchMenus`), 메뉴 수익성(`suggestedPrice`, `effectiveTargetRate`, `isOverTarget`, `menuProfitLines`), 메뉴 옵션(`applyOptions`, `optionLineName`). 테스트 42개.
DB 함수 안에 같은 규칙이 SQL로 복제되어 있다. NestJS로 옮기면 core 함수를 쓰고 SQL은 지운다.

---

## 5. 화면과 기능

| 경로 | 기능 | 사용 |
|---|---|---|
| `/login`, `/onboarding`, `/invite/[token]` | 로그인·가입, 매장 만들기(카페 기본 템플릿 체크, 기본 켜짐), 초대 수락 | 누구나 |
| `/dashboard` | 오늘 매출, 부족 품목, 유통기한 확인, 진행 중 실사, 입고 단가 변동, 목표 원가율을 넘은 메뉴, 입고 예정, 최근 기록. 품목이 없으면 "기본 템플릿 불러오기" | 구성원 (단가 변동·목표 넘은 메뉴·입고 예정·템플릿은 사장·매니저) |
| `/sales` | 메뉴별 판매 일괄 입력(± 버튼, 메뉴마다 옵션 묶음 줄 추가), 차감될 재료 미리보기, 날짜 이동(지난 날은 23:59로 기록), 매출 합계, 판매 취소 (가져온 판매는 "CSV" 표시) | 입력: 구성원 / 취소: 사장·매니저 |
| `/sales/import` | CSV 판매 가져오기: 파일(UTF-8·EUC-KR) → 열 맞추기(자동 추측) → 메뉴 맞추기(저장해 두고 다음에 자동) → 가져오기(500건씩), 가져오기 기록·취소 | 사장·매니저 |
| `/stock` | 입고·사용·폐기·조정, 재고 미리보기, 단가·유통기한, 최근 기록 | 구성원 / 조정: 사장·매니저 |
| `/items`, `/items/[id]`, `/items/new`, `/items/categories` | 품목·재고 목록(상태 필터), 상세(로트별 남은 양, 기록, 입고 단가와 최근 변동), 입고 단위, 기본 거래처, 카테고리 | 보기: 구성원 (입고 단가는 사장·매니저) / 관리: 사장·매니저 |
| `/menus/options`, `/menus/options/[id]`, `/menus/options/new` | 메뉴 옵션(샷 추가·오트밀크 변경·사이즈업): 추가 금액, 재료 규칙(추가·바꾸기·늘리기), 메뉴별 원가 변화, 보관 | 보기: 구성원 / 관리: 사장·매니저 |
| `/menus`, `/menus/[id]`, `/menus/new` | 메뉴 가격, 레시피, 원가·원가율, 목표 원가율(비우면 매장 기본)과 목표 맞추는 판매가, 목록 "목표 초과" 배지 | 보기: 구성원 / 관리: 사장·매니저 |
| `/counts`, `/counts/[id]` | 재고 실사 (전체/카테고리, 묶음+낱개 입력, 여럿이 나눠 세기, 완료·취소, 결과) | 세기: 구성원 / 완료·취소: 사장·매니저 |
| `/orders`, `/orders/[id]`, `/orders/new` | 발주서 (부족 품목 추천, 발주 내용 복사, 일부 입고, 마감) | 사장·매니저 |
| `/suppliers`, `/suppliers/[id]`, `/suppliers/new` | 거래처 | 사장·매니저 |
| `/reports` | 이론 vs 실제 사용량(AvT): 매출·이론/실제 원가와 원가율·차이 금액, 품목별 차이(원인별), 기간(실사 구간·7일·30일·이번 달·직접) | 사장·매니저 |
| `/reports/menus` | 메뉴 수익성(탭): 매출·재료비·마진, 메뉴별 마진 순위와 분류(효자/많이 팔리지만 덜 남음/잘 남지만 덜 팔림/정리 후보), 목표 원가율을 넘은 메뉴와 목표 맞추는 판매가. 기간(7일·30일(기본)·이번 달·직접) | 사장·매니저 |
| `/settings/members` | 직원 초대(링크), 역할 변경, 내보내기 | 사장 |
| `/settings/store` | 매장 이름, 시간대, 목표 원가율(기본 30%) | 사장 |

### 꼭 알아야 할 동작
- **재고 마이너스 허용**: 기록이 늦게 들어오는 현실 때문. 화면에서 경고만 한다.
- **유통기한(로트)**: `track_expiry` 품목은 입고 때 로트를 만들고, 나갈 때 기한이 빠른 로트부터 꺼낸다. 로트가 모자라면 나머지는 로트 없이 차감한다.
- **실사 조정 기준 = 품목을 센 시각의 장부**: 세는 도중·센 뒤의 판매가 있어도 정확하다. (시작·완료 시점 비교가 아님)
- **메뉴 원가** = 레시피 사용량 × 재료의 최근 입고 단가(`item_latest_costs` 뷰). 단가를 넣지 않은 입고는 원가에 쓰이지 않는다.
- **발주 추천 수량** = 부족 알림 기준 × 2 까지 채우는 양, 기본 입고 단위로 올림.
- **매장 시간대**: "오늘"·하루의 경계·화면의 날짜와 시각은 `stores.timezone`(기본 Asia/Seoul)을 따른다. 지난 날짜 판매는 그 시간대의 23:59 로 기록. 시간대를 바꿔도 이미 기록된 시각은 그대로이고 보여주는 기준만 바뀐다. 페이지에서는 `requireCurrentStore()` 의 `timeZone` 을 쓴다.
- **실시간 반영**: 다른 기기의 입출고·품목 변경·판매·판매 취소·실사 입력이 새로고침 없이 반영된다. 입력 중인 폼 값은 유지된다.
- **삭제 대신 보관**: 품목·메뉴·거래처는 보관(archived_at)만 한다.
- **수량 표시**: 단위 이름이 숫자로 시작하면("1L 팩") 수량과 나눠 "2 × 1L 팩"으로 보여준다. 숫자와 단위 이름을 붙여 쓸 땐 `formatQuantity`·`formatUnitCount`·`oneUnitLabel` 을 쓴다 (수량과 단위 이름을 문자열로 직접 붙이지 않는다).
- **기본 템플릿**: 내용은 `packages/core/src/templates.ts` 한 곳. 같은 이름이 있으면 건너뛰므로 두 번 불러도 안전. 새로 만든 메뉴에만 레시피를 넣는다. 매장 만들 때 템플릿 적용이 실패해도 매장은 만들어지고(서버 로그만 남김) 대시보드에서 다시 불러올 수 있다.
- **이론 vs 실제(AvT)**: 이론 = 판매로 차감된 양. 실제 = 이론 + 레시피 밖 사용(consume) + 폐기 + 실사에서 모자란 양 + 직접 조정. 금액은 최근 입고 단가 기준. 실사 구간은 (앞 실사 완료, 이번 실사 완료] 로 자른다(실사 조정 원장이 완료 시각에 기록되므로). 그 기간에 세지 않은 품목은 "실사 안 함" — 차이 0 이 "맞았다"는 뜻이 아니다.
- **CSV 판매 가져오기**: 한 줄 = 메뉴 하나의 판매(날짜[·시각], 메뉴 이름[+옵션], 수량, [금액], [주문번호]). 파일은 브라우저에서 읽고(core `sales-import.ts`), 서버 액션이 매장 시간대로 판매 시각을 만든다(시각이 없으면 그 날 23:59:59, 오늘이면 지금). 행 키 = 파일 내용(날짜·시각·주문번호·이름·수량·금액 + 같은 내용 몇 번째)이라 같은 파일·겹치는 기간을 다시 올려도 중복되지 않는다. **취소·반품**: 수량이나 금액이 음수인 줄은 음수 판매로 기록해 매출을 빼고 재료를 되돌린다(로트 없이, 판매 목록에 "취소" 표시). 상태 열(결제상태 등)이 "취소/환불/반품"인 주문 줄은 판매 + 취소 두 줄로 들어가 0이 되고, 예전에 "완료"로 가져온 같은 주문도 상계된다. 합계 줄, 수량 0, 미래 날짜는 가져오지 않는다. 가져오기를 취소하면 그때 들어온 판매·재료 차감이 cascade 로 지워진다(같은 파일을 다시 올릴 수 있음). 가져온 판매를 판매 화면에서 **하나만 취소**하면 다른 기기에 실시간 반영되고, 그 행 키가 `cancelled_sale_keys` 에 남아 겹치는 파일을 다시 올려도 되살아나지 않는다. 토스 포스는 매출 엑셀(비밀번호 걸린 xlsx)의 "상품 주문" 시트를 CSV 로 저장해서 올린다 (열 이름은 2026-10-08 토스플레이스 안내 글 기준, 실제 파일로는 아직 확인 못 함).
- **입고 단가 변동 알림**: 품목의 "가장 최근 단가 변동" = 직전 입고와 단가가 달라진 마지막 입고(`item_cost_changes` 뷰). 직전보다 5% 이상(`COST_ALERT_PERCENT`) 바뀌면 ① 입고 직후 알림(입출고·발주 입고, 알림 아래 안내로 12초) ② 대시보드 카드(최근 14일, `COST_ALERT_DAYS`) ③ 품목 상세(기준 미만도 표시)에 그 품목을 쓰는 메뉴의 원가율 변화를 보여준다. 다른 재료는 지금 단가로 계산한다. 원가 정보라 `report:view`(사장·매니저)에게만 보인다. 입고 직후 알림은 입고 전·후 `item_latest_costs` 를 비교한다 (`lib/cost-notice.ts`).
- **메뉴 옵션**: 옵션(`menu_options`)은 매장 단위라 어느 메뉴에나 붙는다. 재료 규칙(`menu_option_rules`) 세 가지 — 추가(원두 +18g), 바꾸기(우유 → 오트밀크, 같은 양), 늘리기(우유 ×1.5). 적용 순서는 늘리기 → 바꾸기 → 추가이고, 메뉴에 없는 재료를 바꾸거나 늘리는 규칙은 그 메뉴에 아무것도 하지 않는다(아메리카노 + 오트밀크 변경 = 그대로). 사이즈업의 큰 컵은 "컵 → 큰 컵" 바꾸기로. 판매 1건 = 메뉴 + 옵션 묶음(`sale_record_options`), 금액 = (메뉴 가격 + 옵션 금액) × 수량. 계산은 core `applyOptions` 와 DB `sale_ingredients` 가 같다. 메뉴 수익성 재료비도 옵션을 반영한다. 옵션은 지우지 않고 보관(판매 입력에서 숨김, 지난 판매에는 이름이 남음). **CSV 가져오기는 아직 옵션을 차감하지 않는다** (옵션 열은 메뉴 이름에 붙어 메뉴 매칭에만 쓰인다, 2단계 예정)
- **목표 원가율·메뉴 수익성**: 목표 원가율은 매장 기본(`stores.target_cost_rate`, 기본 30%, 매장 설정) + 메뉴별(`menus.target_cost_rate`, 비우면 매장 기본). 원가율(소수 1자리로 반올림한 값)이 목표보다 크면 "목표 초과". **목표 맞추는 판매가** = 원가 ÷ 목표를 100원 단위로 올림 (`suggestedPrice`). 목표를 넘으면 메뉴 목록 배지·메뉴 상세·대시보드 카드·메뉴 수익성 리포트에 나오고, 입고 단가 변동 알림의 메뉴 원가율 옆에 "(목표 30% 넘음)"이 붙는다(이번 변동으로 새로 넘은 메뉴가 먼저). **메뉴 수익성 리포트**는 기간 동안 실제 판매 금액(CSV 할인·반품 반영) − 판매량 × 지금 원가로 마진을 내고, 판매량(메뉴 평균의 70% 이상)과 개당 마진(전체 평균 이상)으로 네 가지로 나눈다(메뉴 엔지니어링). 판매가 있는 메뉴가 2개 미만이면 나누지 않는다. 합계는 DB 함수 `menu_sales_summary` 로 더한다(API 최대 1,000행 제한 때문, AvT 매출도 이것으로 바꿈).

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
| `sale:import` CSV 판매 가져오기·취소, 메뉴 이름 매칭 | ✓ | ✓ | |
| `catalog:manage` 품목·카테고리·메뉴·레시피·옵션 | ✓ | ✓ | |
| `supplier:manage` 거래처 | ✓ | ✓ | |
| `purchase:manage` 발주·입고 처리 | ✓ | ✓ | |
| `report:view` 리포트 (`/reports`) | ✓ | ✓ | |
| `member:manage` 직원 관리 | ✓ | | |
| `store:manage` 매장 정보 (이름·시간대) | ✓ | | |

권한 확인은 3중이다: 화면(버튼 숨김) → 서버 액션(`can`) → DB(RLS·컬럼 권한·함수). DB가 최종 방어다.

---

## 7. DB

### 마이그레이션 (적용 순서, 30개 — CI 가 매번 빈 DB에 처음부터 적용)
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
| `20261008031736_apply_store_template` | 기본 템플릿 불러오기 함수 |
| `20261008033540_stock_usage_summary` | 기간별 품목 원장 합계 (읽기 전용, 리포트용) |
| `20261008051034_item_cost_changes` | 품목별 가장 최근 입고 단가 변동 뷰 (단가 알림용) |
| `20261008055302_sale_imports` | 가져오기 기록 `sale_imports`, 메뉴 이름 매칭 `menu_aliases`, `sale_records.import_id` |
| `20261008055315_sale_import_functions` | 위 두 표의 RLS, `import_sales` 함수, 가져오기 취소 방송 |
| `20261008055610_sale_import_summaries` | 가져오기별 남은 판매 합계 뷰 |
| `20261008061943/45_cancelled_sale_keys`, `_sale_cancel_keys` | 하나씩 취소한 가져온 판매의 행 키 표, 취소 방송 트리거가 가져온 판매도 방송·키 기록(가져오기 전체 취소의 cascade 는 제외) |
| `20261008062519_sale_refunds`, `062523_import_sales_refunds` | 음수 판매(취소·반품) 허용, `import_sales` 재작성(반품 줄, 취소한 키 건너뜀) |
| `20261008142544_menu_options`, `142641_menu_option_functions`, `143350_menu_option_rules_check` | 메뉴 옵션·재료 규칙·판매에 붙은 옵션 표와 RLS, `sale_ingredients`, `record_sales` 옵션, `menu_sales_summary` 옵션 묶음별, 옵션 규칙에 쓰인 품목의 기본 단위 잠금 |
| `20261008135614_target_cost_rate`, `135616_menu_profit` | 매장·메뉴 목표 원가율 컬럼(1~100), 사장의 `stores.target_cost_rate` 수정 권한, 기간별 메뉴 판매 합계 `menu_sales_summary` |

### DB 함수·트리거 (상세는 `docs/db-functions.md`)
| 이름 | 하는 일 |
|---|---|
| `record_stock_movement` | 입고·사용·폐기·조정 (단위·단가 환산, 로트, 유통기한 순 차감) |
| `record_sales` | 여러 메뉴(+옵션 묶음) 판매 + 레시피·옵션대로 재료 차감 |
| `sale_ingredients` (내부 전용) | 메뉴 1개 + 옵션 묶음의 재료 (core `applyOptions` 와 같은 계산) |
| `start_stock_count` / `complete_stock_count` | 실사 시작(줄 스냅샷) / 센 시각 기준 조정 |
| `receive_purchase_order` / `change_purchase_order_status` | 발주 입고 / 허용된 상태 전환 |
| `stock_outflow` (내부 전용) | 유통기한 순 차감 공용 로직 |
| `create_store`, `accept_invitation`, `get_invitation` | 매장 만들기, 초대 |
| `apply_store_template` | 카테고리·품목·입고 단위·메뉴·레시피를 한 트랜잭션으로 (같은 이름은 건너뜀, 사장·매니저) |
| `import_sales` | CSV 판매 묶음(최대 500건) 기록 + 재료 차감. 같은 행 키(`external_id`)는 건너뜀, 사장·매니저 |
| `stock_usage_summary` (읽기 전용, SECURITY INVOKER) | 기간별 품목 원장 합계 + 그 기간에 센 품목인지. 집계만 하고 계산은 core `avt.ts` |
| `menu_sales_summary` (읽기 전용, SECURITY INVOKER) | 기간별 메뉴·옵션 묶음 판매량·금액 합계 (반품 상계). 계산은 core `menu-profit.ts` |
| 트리거 `validate_store` | 매장 이름(공백 제거, 1~50자)·시간대(`pg_timezone_names`) 검사 |
| 트리거 `broadcast_sale_cancelled` | 판매가 지워지면 `realtime.send` 로 매장 채널에 `sale_cancelled` 방송, 행 키가 있으면 `cancelled_sale_keys` 에 기록 (가져오기 전체 취소의 cascade 는 건너뛰고 `broadcast_sale_import_cancelled` 가 한 번만 방송) |

### 지켜야 할 DB 규칙
- 원장(`stock_movements`)·로트·판매·실사 줄 생성·발주 상태와 입고 수량은 **함수로만** 쓴다. 직접 쓰는 정책·컬럼 권한이 없다.
- 한 행만 바꾸는 수정은 테이블에 직접 쓰되, 바꿀 수 있는 칸을 **컬럼 권한**으로 제한한다 (예: `stores` 는 `name`·`timezone`·`target_cost_rate` 만, `purchase_orders` 는 `supplier_id`·`expected_on`·`memo` 만).
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
| `useToastResult(state)` | 결과를 알림으로. 액션 결과에 `notice` 가 있으면 알림 아래 안내로 더 오래(12초) 보여준다 (예: 입고 단가 변동) |
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
- `app.owner()` 는 기본으로 **템플릿 없이** 매장을 만든다 (기존 테스트가 "원두" 같은 품목을 직접 만들어 이름이 겹치므로). 템플릿이 필요하면 `template: true`. 한 테스트에서 사장을 여럿 만들 수 있다 (두 번째부터 이메일이 다름).
- 메뉴 유무는 화면 글자가 아니라 링크 role 로 확인한다 (매장 이름 "리포트테스트"에 "리포트"가 들어 있어 헤더 글자 검사가 틀렸던 적이 있다).
- 알림(토스트)은 화면 갱신보다 조금 먼저 뜬다. 알림 직후 화면을 읽지 말고 `expect(locator).toContainText()` 처럼 바뀐 내용을 기다린다. 같은 문구의 알림이 연달아 뜨는 곳(발주 → 되돌리기 → 다시 발주)은 알림 대신 화면 상태로 확인한다.
- 다른 기기 반영은 화면을 연 뒤 `waitForRealtime()` 으로 구독 연결을 기다리고 `appearsLive()` / `disappearsLive()` 로 확인한다.
- 새 기능의 실시간·권한 확인은 "기능을 끄면 테스트가 실패하는지"까지 확인해 두면 좋다 (판매 취소 방송은 트리거를 끄고 실패를 확인했다).

### Windows 환경
- `pnpm db:types` 출력은 포맷되지 않은 TS 다 (정상).
- 스크립트로 파일을 고칠 때 CRLF 가 섞이지 않게 주의 (저장소는 LF).
- 의존성을 바꿔 `pnpm install` 한 뒤에는 **개발 서버를 다시 띄운다.** 설치 경로가 바뀌면(예: `@playwright/test` 는 Next 의 선택 peer) 떠 있던 서버가 옛 경로와 섞여 404 화면에서 모듈 오류를 낸다. 필요하면 `apps/web/.next` 도 지운다.
- 백그라운드로 띄운 `pnpm dev` 를 멈춰도 Next 프로세스가 남아 3000 포트를 잡고 있을 수 있다. 포트를 쓰는 프로세스를 확인하고 끈다.
- 오래 떠 있던 개발 서버가 새 파일을 추가한 뒤 모든 페이지에서 500 + "Jest worker encountered 2 child process exceptions" 를 낸 적이 있다 (2026-10-08). 코드 문제가 아니라 서버를 다시 띄우면 된다. E2E 는 떠 있는 서버를 그대로 쓰므로 이런 실패가 나면 먼저 서버를 다시 띄운다.
- 전날부터 떠 있던 개발 서버로 E2E 를 돌리면 모든 시나리오가 "Failed to execute 'measure' on 'Performance': 'Home' cannot have a negative time stamp" 페이지 오류로 실패한 적이 있다 (2026-10-08, React 개발 모드 성능 측정). 서버를 다시 띄우니 통과했다. 같은 오류가 보이면 먼저 서버를 다시 띄운다.

---

## 9. 테스트 현황

| 종류 | 상태 |
|---|---|
| core 단위 테스트 (vitest) | 42개, `pnpm test` |
| 타입·lint | `pnpm typecheck`(web·core·db·e2e), `pnpm lint`(web: Next 규칙, core·db: `typescript-eslint` 권장) 통과 |
| DB 함수·정책 | 단계마다 SQL로 실제 사용자 권한(`set role authenticated` + JWT claims)으로 검증 후 롤백 |
| 브라우저 E2E | `e2e/tests/` 14개 시나리오 — 가입·초대, 품목, 입출고, 재고 현황, 판매, CSV 판매 가져오기, 실사, 발주, 매장 설정, 기본 템플릿, 이론 vs 실제 리포트, 입고 단가 변동, 메뉴 수익성·목표 원가율, 메뉴 옵션. 로컬 약 3~6분(3개 병렬), CI 약 5분 |
| CI | GitHub Actions 두 잡(`타입·lint·단위 테스트`, `브라우저 E2E`). 실패하면 실행 화면 Artifacts 의 `playwright-report` 를 받아 본다 |

E2E 는 `@playwright/test` 다. 시나리오 하나가 테스트 하나이고 단계(`test.step`)로 나뉘며, 확인 항목은 `expect.soft` 라 하나가 실패해도 끝까지 돈다. 실패하면 한 번 재시도한다(재시도에서 통과하면 `flaky`).
테스트는 `e2e-...@test.kr` 계정과 매장을 만들고 끝나면 지운다. 강제 종료로 남은 것은 다음 실행 때(1시간 넘은 것) 지운다.
E2E 중 `caret-color: transparent` hydration 경고는 Playwright 스크린샷이 넣는 스타일 때문이다. 앱 문제가 아니다.

---

## 10. 앞으로 해야 할 일 (권장 순서)

### 제품 방향 (2026-10-08 사용자와 논의)
- **수익화 판단**: 가능하지만 "재고 기록 앱"으로는 돈을 받기 어렵다. 돈이 되는 가치는 **원가율·로스(이론 vs 실제)를 보여주는 것**. 걸림돌은 ① 판매 수동 입력(매일 안 하면 숫자가 틀어짐 → POS·CSV 연동이 유료화의 전제), ② 처음 세팅 부담(→ 기본 템플릿으로 일부 해결).
- **경쟁사** (공식 가격 페이지, 2026-10-08 확인): MarketMan Starter $249·Growth $299/월, WISK 단일 매장 $249/월(음료 또는 음식) + 도입비 $750. 둘 다 POS 60여 개 연동, AvT·단가 알림·추천 발주·청구서 OCR·매장 간 이동이 핵심. 국내 개인 카페에는 1/10 수준 가격이 현실적 → **셀프 세팅 + 국내 연동(POS·카카오)** 으로 차별화.
- **타깃 후보**: 개인 카페(무료·저가) + 2~10개 매장 소규모 체인(매장 비교·통합 발주로 높은 요금).
- **검증 제안**: 기능을 더 만들기 전에 아는 카페 2~3곳에서 2주 시범 사용 (판매 입력을 매일 하는지, 원가율을 보고 가격을 바꾸는지 확인). 시범 사용에는 배포(5)가 필요하다.
- 사용자와 합의한 순서: ① AvT 리포트(완료) → ② 입고 단가 변동 알림(완료) → ③ CSV 판매 업로드(완료) → ④ 메뉴 수익성 순위(완료).
- 2026-10-08 경쟁사 2차 조사로 꼭 필요한 기능 3개를 더함 (§10-0): ⑤ 메뉴 옵션 차감 ⑥ 목표 원가율·권장 판매가(④와 함께) ⑦ 소진 예상일·판매량 기반 추천 발주. 배포·시범 매장(5)은 이 기능들보다 먼저 하기를 권장 (사용자 결정). 고르지 않은 아이디어는 §10-9

### 0) 경쟁사 2차 조사에서 고른 꼭 필요한 기능 (2026-10-08)
조사 대상: MarketMan, WISK, xtraCHEF(Toast), Restaurant365, Apicbase, 페이히어, 토스플레이스, 국내 원가 앱(키친코스트 등), 식자재 앱(마켓봄·식봄·오더히어로).
- [ ] **메뉴 옵션 차감** (샷 추가·사이즈업·오트밀크 변경·시럽 추가) — 1단계(옵션·재료 규칙·판매 입력·원가) 완료 (2026-10-08), **2단계 CSV 옵션 열 연결이 다음 작업**
  - 2단계 계획: 옵션 열을 메뉴 이름에 붙이지 않고 따로 읽어 쉼표 등으로 나눈 옵션 이름마다 옵션 매칭(`option_aliases`: 파일의 옵션 이름 → 옵션 또는 "무시", 예: ICE/HOT), `import_sales` 가 `sale_ingredients` 로 차감
  - 남은 것(필요하면): 기본 템플릿에 옵션(샷 추가 등), 메뉴별로 붙일 수 있는 옵션 제한, 메뉴 상세에 옵션별 원가
  - 왜: 카페 판매의 상당수에 옵션이 붙는다. 옵션이 빠지면 이론 사용량이 틀리고 그 차이가 AvT 에서 로스로 보여 리포트 신뢰가 떨어진다. CSV 가져오기의 `menu_aliases` 는 "아메리카노 + 샷추가" 를 아메리카노에 묶을 뿐 샷 원두는 차감하지 않는다
  - 어떻게: 메뉴별 옵션과 옵션 레시피(재료 추가 또는 대체: 우유 → 오트밀크), 판매 입력에서 옵션 선택, CSV 의 옵션 열(토스 "옵션") 연결, 원가·원가율에 반영. 스키마 변경 필요
  - 참고: xtraCHEF (POS modifier 를 레시피에 연결)
- [x] **목표 원가율 → 권장 판매가, 마진 하락 알림** — 완료 (2026-10-08, 메뉴 수익성 순위와 함께)
  - 매장 기본 + 메뉴별 목표 원가율, "목표 맞추는 판매가", 단가 변동으로 목표를 넘으면 입고 알림·대시보드에서 경고. 동작은 §5
  - 참고: WISK (메뉴 마진이 기준 아래로 떨어지면 알림), 키친코스트 (목표 원가율 → 판매가)
- [ ] **소진 예상일 + 판매량 기반 추천 발주** (§10-6 에서 옮김)
  - 최근 일평균 사용량(원장의 sale·consume)으로 "원두 4일 뒤 소진"을 대시보드·품목 목록에. 발주 추천을 "부족 기준 × 2" → 일평균 사용량 × (입고 소요일 + 여유일)로. 거래처에 입고 소요일 칸 추가
  - CSV 가져오기로 판매 데이터가 쌓이면 의미가 생긴다. 매일 앱을 여는 이유가 되는 기능
  - 참고: 페이히어 (출고 데이터로 3·7·14일 뒤 품절 위험 예측), MarketMan (사용량 기반 추천 발주)

### 1) 입고 단가 변동 알림 — 완료 (2026-10-08)
- [x] 입고 직후 알림, 대시보드 카드, 품목 상세. 동작은 §5 "꼭 알아야 할 동작"
- [ ] 남은 것(필요하면): 품목별 단가 추이 그래프, 알림 기준을 매장 설정으로, 알림 발송(§10-6)

### 2) CSV 판매 업로드 (매출 연동 1단계) — 완료 (2026-10-08)
- [x] `/sales/import`: CSV → 열·메뉴 맞추기 → `import_sales` (`source = 'csv'`, 행 키로 중복 방지), 가져오기 취소. 메뉴 매칭은 `menus.external_id` 대신 `menu_aliases`(한 메뉴에 여러 POS 이름: 사이즈·옵션)
- [ ] **실제 POS 파일로 확인** (시범 매장에서 받기): 토스 포스 "상품 주문" 시트, 다른 POS(포스페이·OKPOS 등) 열 이름. 맞지 않으면 core `HEADER_HINTS` 에 추가
- [ ] 엑셀(xlsx) 바로 올리기 (지금은 CSV 로 저장해야 함. 토스 파일은 비밀번호가 걸려 있다)
- [x] 취소·반품 줄 처리 (음수 판매 + 재료 되돌림, 상태 열 "취소" 주문 상계)
- [ ] 되돌린 재료는 유통기한 로트 없이 들어간다. 만든 뒤 버린 음료면 실제로는 폐기라 이론 vs 실제에 "기록 안 된 손실"로 보인다 (의도한 동작)
- [ ] 이후 POS 직접 연동(웹훅 또는 주기 동기화, `source = 'pos'`)

### 3) 메뉴 수익성 순위 — 완료 (2026-10-08)
- [x] 메뉴별 판매량 × 개당 마진으로 "많이 벌어주는 메뉴 / 많이 팔리지만 남는 게 적은 메뉴". `/reports/menus` 탭 (`report:view`)
- [ ] 남은 것(필요하면): 기간 비교(지난달 대비 마진 변화), 카테고리별 합계, CSV 내보내기. 판매가 몇 주 쌓인 시범 매장 반응을 보고 정한다

### 4) 폐기 사유·폐기율
- [ ] 폐기 메모를 사유 선택지(유통기한·제조 실수·파손 등)로 바꾸고, 리포트에 폐기율

### 5) 배포 — 시범 매장 전에 필요 (사용자 결정 필요)
후보: **Supabase 클라우드(서울 리전) + Vercel**. Supabase·Vercel 계정 로그인은 사용자가 직접 해야 한다.
- [ ] 정할 것: 환경 개수(운영만 / 운영+스테이징), 요금 등급, 주소(기본 `*.vercel.app` / 도메인)
- [ ] Supabase 프로젝트 생성(서울) → `supabase link` → `supabase db push` (마이그레이션 27개)
- [ ] 인증 설정: 가입 확인 메일 켜기(코드는 대비됨: 세션 없이 오면 확인 메일 안내), 사이트 주소·리디렉트 주소, 운영 SMTP
- [ ] Vercel 프로젝트: GitHub 연결, 루트 `apps/web`, 환경 변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), 함수 리전 서울
- [ ] 배포 주소에서 가입~판매 직접 확인. 운영 DB에 E2E 를 돌리지 않는다 (테스트 계정이 생김) — 필요하면 스테이징에서
- [ ] 마이그레이션 반영 방식 정하기 (처음엔 수동 `supabase db push` 권장)
- 확인 필요: Supabase 무료 프로젝트는 일정 기간 미사용 시 일시 정지, Vercel 무료(Hobby)는 비상업용 조건. 결정 전에 공식 요금표 확인

### 6) 경쟁사 분석에서 나온 다음 후보 (우선순위 순)
- 판매량 기반 추천 발주 → §10-0 "소진 예상일 + 판매량 기반 추천 발주" 로 옮김
- [ ] **거래명세서 사진 → 입고 자동 입력** (AI 판독). 유료 요금제 차별점 후보
- [ ] **부족·유통기한 알림 발송** (카카오 알림톡 또는 웹 푸시). 지금은 대시보드에서만 보인다
- [ ] **매장 간 재고 이동 + 여러 매장 통합 대시보드** (소규모 체인용, 높은 요금제 근거)
- [ ] **직접 만드는 재료** (콜드브루 원액·수제청: "제조" 기록으로 원재료 차감 + 준비 재료 입고). 스키마 변경 필요
- [ ] **실사 속도**: 휴대폰 카메라 바코드 스캔 (품목에 바코드 칸은 이미 있음). 오프라인은 Expo 단계에서
- [ ] **레시피북**: 메뉴에 제조 순서·알레르기 (직원 교육용)
- [ ] **템플릿 확장**: 업종별(베이커리 카페·디저트 카페), 메뉴 엑셀 가져오기

### 7) NestJS 전환
- [ ] `apps/api` 추가, Drizzle 스키마(`packages/db`) 재사용. 배포는 상시 서버(Render·Fly.io·Railway 등)
- [ ] `docs/db-functions.md` 의 대응표대로 기능 하나씩: 서비스 구현(트랜잭션·같은 행 잠금, core 함수 사용) → `lib/api/*` 해당 함수만 API 호출로 교체 → DB 함수 제거
- [ ] 권한은 Guard + `can()`. Realtime 은 WebSocket/SSE 게이트웨이로 (`subscribeStoreChanges` 시그니처 유지, 판매 취소 방송 트리거도 서비스 이벤트로)

### 8) Expo 앱
- [ ] 직원이 휴대폰으로 하는 화면부터: 판매 입력, 입출고, 실사. `packages/core` 재사용. 배포는 EAS

### 9) 보류한 아이디어 (2026-10-08 경쟁사 2차 조사)
만들기 전에 사용자와 다시 정한다. 각 항목의 "다시 볼 때"를 확인한다.

**나중에 해도 되는 것** — 시범 매장 반응을 보고 정한다
- [ ] **보관 위치별 실사 순서** (냉장고·창고·바): 품목에 보관 위치를 두고 실사 화면을 위치 순으로. 지금은 카테고리별 실사로 대신한다. 다시 볼 때: 시범 매장이 실사에 시간이 오래 걸린다고 할 때. 참고: MarketMan·WISK (보관 위치별 count sheet)
- [ ] **프렙(오늘 만들 양) 제안**: 요일별 판매량으로 오늘 콜드브루·디저트 준비량 제안. 다시 볼 때: "직접 만드는 재료"(§10-6)가 생기고 판매 데이터가 몇 주 쌓인 뒤. 참고: Restaurant365 Smart Prep, Apicbase
- [ ] **정기 발주·요일별 기준 재고** (주말엔 우유 기준을 높게): 다시 볼 때: 소진 예상일(§10-0)을 만든 뒤에도 부족하면. 요일별 판매를 반영하면 상당 부분 필요 없어진다. 참고: xtraCHEF (par 기준 주문서, recurring orders)

**지금은 안 해도 되는 것** — 핵심(재고·원가)에서 멀거나 개인 카페에는 과함
- [ ] **월 매입 예산·거래처별 미지급**: 월 매입 합계, 남은 예산(declining budget), 미지급금. 다시 볼 때: 소규모 체인 요금제를 만들 때. 참고: xtraCHEF, 마켓봄 프로
- [ ] **오픈·마감 체크리스트, 위생(HACCP) 기록** (냉장고 온도 등): 다시 볼 때: Expo 직원 앱에서 매일 여는 이유가 필요할 때. 참고: Apicbase

**조사 메모**
- 이번 검색에서 국내 POS(토스플레이스·페이히어)의 재고는 **판매 상품 개수 단위**로만 확인됐다. 레시피 기반 원재료 차감은 공식 자료에서 찾지 못했다 (업체에 직접 확인한 것은 아님). 페이히어는 프랜차이즈 자재 발주·품절 예측(도소매)이 있다
- 국내 원가 앱(키친코스트·원가 계산기)은 원가 계산기 수준이라 재고 차감·발주가 없다. 식자재 앱(마켓봄·식봄·오더히어로)은 주문·유통사 비교 중심
- MarketMan 후기에서 나온 약점은 단위 환산·모바일 앱·동기화. 우리가 이미 강한 부분(단위 환산, 실시간 반영)이다
- 출처: [MarketMan](https://marketman.com/), [WISK](https://wisk.ai/features/restaurant-bar-inventory-management-software), [xtraCHEF with Toast](https://support.toasttab.com/en/article/Using-xtraCHEF-with-Toast), [Restaurant365 inventory](https://restaurant365.com/inventory), [토스 포스 재고 관리](https://tossplace.com/story/stock-management), [페이히어 재고 관리](https://help-center.payhere.in/549f843e-2050-4e57-803c-110e1b88d1ec), [페이히어 AI 업데이트 기사](https://m.news.nate.com/view/20240430n03016), [키친코스트](https://apps.apple.com/kr/app/kitchencost/id6756592070)

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
| 10-08 | `f0db5f8` | 수량 표시 수정: "1L 팩" 같은 단위가 수량과 붙어 "11L 팩"으로 읽히던 문제 → "1 × 1L 팩" |
| 10-08 | `1255a6f` | 카페 기본 템플릿 (품목 11·메뉴 10·레시피), `apply_store_template`, 매장 만들기 체크·대시보드 버튼 |
| 10-08 | `89794a1` | 이론 vs 실제 리포트(AvT) `/reports`, `stock_usage_summary`, core `avt.ts` |
| 10-08 | `7a3f83c` | 입고 단가 변동 알림: `item_cost_changes` 뷰, core `cost-changes.ts`, 입고 직후 알림·대시보드 카드·품목 상세 |
| 10-08 | `acc6c58` | CSV 판매 가져오기 `/sales/import`: `import_sales`, `sale_imports`·`menu_aliases`, core `sales-import.ts` |
| 10-08 | `3223b3b` | 경쟁사 2차 조사 결과를 로드맵에 반영 (§10-0 꼭 필요한 기능 3개, §10-9 보류한 아이디어) |
| 10-08 | `c9fc151` | CSV 취소·반품 줄 = 음수 판매(재료 되돌림), 가져온 판매 개별 취소의 실시간 반영·재가져오기 방지(`cancelled_sale_keys`) |
| 10-08 | `c1021d1` | 메뉴 수익성 리포트 `/reports/menus`, 매장·메뉴 목표 원가율과 목표 맞추는 판매가, 목표 넘음 알림(입고·대시보드), `menu_sales_summary`(리포트 매출 1,000행 제한 해결) |

---

## 11. 알려진 제한·주의

- **배포 없음** (로컬 전용, §10)
- **리포트 금액은 최근 입고 단가 기준**: 기간 중 단가가 바뀌었으면 실제 지출과 조금 다를 수 있다 (메뉴 원가율과 같은 기준). 품목별 차이 금액과 원인별 합계는 각각 반올림해서 1원 정도 안 맞을 수 있다
- **메뉴 수익성의 재료비는 "지금" 레시피·단가 기준**: 기간 중 레시피나 단가가 바뀌었으면 그때의 실제 재료비와 다르다. 분류(효자 등)는 판매가 있는 메뉴끼리의 상대 비교라, 메뉴가 2~3개뿐이면 평균과 거의 같은 메뉴도 한쪽으로 나뉜다
- **CSV 로 가져온 판매는 옵션 재료를 차감하지 않는다** (옵션 2단계 전까지). 샷 추가가 많은 매장은 이론 vs 실제에서 원두가 "기록 안 된 사용"으로 보인다
- 판매 화면·대시보드의 하루 매출은 아직 판매 기록을 한 줄씩 읽어 더한다 (API 최대 1,000행). 하루 1,000건을 넘는 매장이 생기면 `menu_sales_summary` 로 바꾼다
- **리포트의 정확도는 판매 입력과 실사에 달렸다**: 판매를 빠뜨리면 이론이 줄어 차이가 커 보이고, 실사를 안 하면 기록 안 된 손실이 안 보인다 (화면에 안내함)
- 기본 템플릿 메뉴의 양·가격은 예시값이다. 단가는 입고해야 생기므로 불러온 직후 원가는 0원
- E2E `orders` 가 병렬 실행 중 가끔 재시도에서 통과했다 (2026-10-08 세 번). 원인은 모두 입고 완료 직후 화면을 너무 일찍 읽은 것 → 입고 폼이 사라지기와 "입고 완료" 글자를 기다리게 고침. 또 나오면 trace 확인
- **CSV 가져오기 크기**: 한 파일 2만 줄까지, 500건씩 나눠 보낸다. 판매마다 원장이 생겨 Realtime 이벤트가 많이 나간다(화면은 0.3초 모아 한 번 새로고침). 큰 매장 한 달치는 기간을 나눠 올리는 것을 권한다
- **단가 변동은 "직전 입고"와 비교한다**: 큰 변동 뒤에 단가가 조금(5% 미만) 또 바뀌면 가장 최근 변동이 작은 쪽이 되어 대시보드에서 빠진다. 같은 단가로 다시 입고하는 것은 변동으로 치지 않는다
- 한 트랜잭션 안에서 입고를 두 번 하면 "최근 입고 단가"가 같은 시각이라 어느 쪽인지 정해지지 않는다 (실제 사용에서는 기록마다 시각이 달라 문제없음)
- 실사로 늘어난 양은 유통기한 정보 없이 기록된다 (품목 상세에 "유통기한 기록 없음"으로 표시). 입출고 화면의 "조정 → 늘리기"는 유통기한을 넣을 수 있다
- 삭제·상태 변경 버튼(`ActionButton`)의 알림이 화면 갱신보다 아주 조금 먼저 뜬다. 사용에는 문제없다 (E2E 는 바뀐 내용을 기다린다, §8)
- **Supabase CLI 버전**: `npx supabase` 는 그때그때 최신 CLI 를 받는다. 2026-10-07 에 받은 새 버전은 `pnpm db:types` 결과에 모든 테이블 `ComputedFields: never` 를 더한다 (스키마 변화 없음). 2026-10-08 커밋(`1255a6f`)부터 이 줄들이 타입 파일에 포함돼 있다. CLI 를 devDependency 로 고정할지는 아직 정하지 않음
- **CI 러너**: GitHub 안내에 따르면 2026-10-19 부터 `ubuntu-latest` 가 Ubuntu 26 으로 바뀐다. 이후 CI(특히 E2E 의 Chrome·Docker)가 깨지면 `runs-on: ubuntu-24.04` 로 고정해 되돌린다
