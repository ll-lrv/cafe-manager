# cafe-manager

카페 운영 관리 앱. 재고관리 MVP → 매출(POS) 연동 → 분석 순으로 확장한다.
Supabase로 MVP를 만들고, 이후 NestJS + PostgreSQL로 점진 전환할 계획이다.
처음 이어받는다면 `docs/HANDOVER.md`(인수인계 문서)부터 읽는다.
진행 상황, 다시 시작하는 방법, 다음 할 일은 `docs/PROGRESS.md` 에 있다. 작업을 마치면 이 파일을 갱신한다.

## 구조
- `apps/web` — Next.js (App Router). 나중에 `apps/mobile`(Expo), `apps/api`(NestJS) 추가 예정
- `packages/db` — Drizzle 스키마. **스키마 변경은 반드시 여기서** 하고 `pnpm db:generate --name <이름>` 으로 마이그레이션 생성
- `packages/core` — 순수 TS 비즈니스 로직(단위 환산, 레시피 차감, FIFO, 실사, 권한). DB/프레임워크 의존 금지
- `supabase/migrations` — drizzle-kit 생성 SQL + Supabase 전용 SQL(RLS, 트리거)
- `e2e` — 브라우저 E2E (`@playwright/test`), `.github/workflows/ci.yml` — CI

## 규칙
- 재고는 `stock_movements` 원장 합계로 계산한다. 원장 행은 수정/삭제하지 않고 `adjust` 로 바로잡는다 (예외: 판매 취소·CSV 가져오기 취소 시 그 판매의 `sale` 원장은 cascade 로 함께 삭제). 실사 뒤에 그 이전 시각의 판매가 기록·취소되면 DB 트리거가 그 실사의 조정으로 상쇄한다 (`docs/db-functions.md` 트리거 표)
- 여러 행을 함께 쓰는 작업(입출고, 판매 차감, 판매 가져오기, 실사 완료, 발주 입고)은 DB 함수로 묶어 한 트랜잭션으로 처리한다. 원장·로트는 함수로만 쓴다(직접 INSERT 정책 없음). 함수를 만들거나 바꾸면 `docs/db-functions.md`(NestJS 전환 대응표)를 함께 갱신한다
- 수량은 품목의 기본 단위(g/ml/ea) 기준. 입고 단위는 `item_units.factor` 로 환산
- 금액은 원(KRW) 정수
- 권한 표는 `packages/core/src/permissions.ts` 와 RLS 마이그레이션을 함께 맞춘다
- 화면 컴포넌트에서 supabase 클라이언트를 직접 호출하지 말고 `apps/web/src/lib/api/*` 를 거친다 (NestJS 전환 대비)
- 날짜·시각은 매장 시간대(`store.timeZone`) 기준으로 계산·표시한다. `"Asia/Seoul"` 을 코드에 박지 않는다

## 명령어
- `pnpm dev` / `pnpm test` / `pnpm typecheck` / `pnpm lint`
- `pnpm e2e` — 브라우저 E2E 전체 (`@playwright/test`, 로컬 Supabase 필요, `e2e/README.md`). 화면을 바꾸면 관련 시나리오를 돌린다 (`pnpm e2e sales`). 테스트 계정은 `app.email()` 로만 만든다 (끝나면 지워진다)
- GitHub(https://github.com/ll-lrv/cafe-manager, 공개)에 push 하면 CI 가 타입·lint·단위 테스트와 E2E 를 돌린다
- `npx supabase start` (Docker 필요) / `pnpm db:reset` 은 로컬 DB를 비우고 마이그레이션을 처음부터 다시 적용
- 스키마 변경 후: `pnpm db:generate --name <이름>` → `npx supabase migration up` → `pnpm db:types`
- RLS·함수 등 Supabase 전용 SQL: `packages/db` 에서 `npx drizzle-kit generate --custom --name <이름>` 로 빈 파일을 만들어 작성

## 로컬 Supabase 포트
이 PC에 다른 Supabase 프로젝트(`cafe-manager_simple`)가 기본 포트(543xx)를 쓰고 있어 553xx 를 사용한다.
API 55321 · DB 55322 · Studio http://127.0.0.1:55323 · 메일(Mailpit) 55324

## 웹 앱 메모 (Next.js 16)
- middleware 는 `src/proxy.ts` (Next 16에서 이름 변경). 로그인 여부만 빠르게 확인하고, 권한은 페이지와 RLS가 확인
- shadcn/ui 는 Base UI 기반(base-nova). Radix의 asChild 대신 render prop, 링크 버튼은 `buttonVariants` 를 Link에 적용
- `PageProps<"/경로">`, `LayoutProps<"/경로">` 는 Next가 생성하는 전역 타입 (`next typegen`)

@AGENTS.md
