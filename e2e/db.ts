import { execFileSync } from "node:child_process";

/** DB 값을 직접 확인할 로컬 Supabase DB 컨테이너 (docker exec ... psql) */
const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_cafe-manager";

/** 테스트 계정 이메일은 모두 이 모양이다. 정리할 때 이것으로 테스트 계정만 고른다. */
export const TEST_EMAIL_PREFIX = "e2e-";
export const TEST_EMAIL_DOMAIN = "@test.kr";

/** 로컬 DB에 SQL 실행 (postgres 슈퍼유저). 결과는 첫 열 텍스트. 오류는 "ERROR: ..." 문자열로 돌려준다 (DB가 막는지 확인하는 테스트용) */
export function sql(query: string): string {
  try {
    return execFileSync(
      "docker",
      ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch (e) {
    return `ERROR: ${(e as { stderr?: string }).stderr ?? String(e)}`;
  }
}

/**
 * 조건에 맞는 테스트 계정과 그 계정이 사장인 매장을 모두 지운다.
 * 품목·메뉴·로트를 다른 표가 RESTRICT 로 참조하므로 매장만 지우면 실패한다. 참조하는 쪽부터 차례로 지운다.
 */
export function deleteTestUsers(userWhere: string): void {
  const result = sql(`
    begin;
    create temp table e2e_users on commit drop as select id from auth.users where ${userWhere};
    create temp table e2e_stores on commit drop as
      select distinct store_id as id from public.store_members where role = 'owner' and user_id in (select id from e2e_users);
    delete from public.stock_movements where store_id in (select id from e2e_stores);
    delete from public.stock_lots where store_id in (select id from e2e_stores);
    delete from public.sale_records where store_id in (select id from e2e_stores);
    delete from public.stock_counts where store_id in (select id from e2e_stores);
    delete from public.purchase_orders where store_id in (select id from e2e_stores);
    delete from public.menus where store_id in (select id from e2e_stores);
    delete from public.items where store_id in (select id from e2e_stores);
    delete from public.stores where id in (select id from e2e_stores);
    delete from auth.users where id in (select id from e2e_users);
    commit;
  `);
  if (result.startsWith("ERROR")) throw new Error(`테스트 데이터 정리 실패: ${result}`);
}

/** 이메일 목록으로 지운다 (테스트가 끝날 때) */
export function deleteTestUsersByEmail(emails: string[]): void {
  const safe = emails.filter((e) => e.startsWith(TEST_EMAIL_PREFIX) && e.endsWith(TEST_EMAIL_DOMAIN));
  if (safe.length === 0) return;
  deleteTestUsers(`email in (${safe.map((e) => `'${e.replaceAll("'", "''")}'`).join(", ")})`);
}

/** 테스트 계정 이메일 패턴 (LIKE) */
export const TEST_EMAIL_LIKE = `${TEST_EMAIL_PREFIX}%${TEST_EMAIL_DOMAIN}`;
