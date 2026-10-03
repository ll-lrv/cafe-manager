# cafe-manager

카페 운영 관리 앱. 재고관리 MVP → 매출(POS) 연동 → 분석 순으로 확장한다.
Supabase로 MVP를 만들고, 이후 NestJS + PostgreSQL로 점진 전환할 계획이다.

## 구조
- `apps/web` — Next.js (App Router). 나중에 `apps/mobile`(Expo), `apps/api`(NestJS) 추가 예정
- `packages/db` — Drizzle 스키마. **스키마 변경은 반드시 여기서** 하고 `pnpm db:generate --name <이름>` 으로 마이그레이션 생성
- `packages/core` — 순수 TS 비즈니스 로직(단위 환산, 레시피 차감, FIFO, 실사, 권한). DB/프레임워크 의존 금지
- `supabase/migrations` — drizzle-kit 생성 SQL + Supabase 전용 SQL(RLS, 트리거)

## 규칙
- 재고는 `stock_movements` 원장 합계로 계산한다. 원장 행은 수정/삭제하지 않고 `adjust` 로 바로잡는다
- 수량은 품목의 기본 단위(g/ml/ea) 기준. 입고 단위는 `item_units.factor` 로 환산
- 금액은 원(KRW) 정수
- 권한 표는 `packages/core/src/permissions.ts` 와 RLS 마이그레이션을 함께 맞춘다
- 화면 컴포넌트에서 supabase 클라이언트를 직접 호출하지 말고 `apps/web/src/lib/api/*` 를 거친다 (NestJS 전환 대비)

## 명령어
- `pnpm dev` / `pnpm test` / `pnpm typecheck` / `pnpm lint`
- `npx supabase start` (Docker 필요) → `pnpm db:reset` 으로 로컬 DB에 마이그레이션 적용

@AGENTS.md
