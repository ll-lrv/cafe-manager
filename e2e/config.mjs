import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 테스트할 웹 주소 (pnpm dev 가 떠 있어야 한다) */
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** 설치된 Chrome 경로. playwright-core 는 브라우저를 내려받지 않으므로 이미 설치된 Chrome 을 쓴다. */
export const CHROME_PATH = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** DB 값을 직접 확인할 로컬 Supabase DB 컨테이너 (docker exec ... psql) */
export const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_cafe-manager";

/** 스크린샷 저장 폴더 e2e/shots/<이름>/ (git 에서 제외) */
export function shotsDir(name) {
  const dir = fileURLToPath(new URL(`./shots/${name}/`, import.meta.url));
  mkdirSync(dir, { recursive: true });
  return dir;
}
