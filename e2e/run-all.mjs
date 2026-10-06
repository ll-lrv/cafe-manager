// 모든 E2E 시나리오를 차례로 돌리고 결과를 모아 보여준다.
// 실패(FAIL)·예외·페이지 오류가 하나라도 있으면 종료 코드 1.
// 사용: node run-all.mjs [시나리오 이름...]   예) node run-all.mjs sales orders
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ALL = ["auth", "items", "stock", "inventory", "sales", "counts", "orders"];
const selected = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ALL;
const here = fileURLToPath(new URL(".", import.meta.url));

/** 테스트가 일부러 내는 오류와 Playwright 스크린샷 때문에 생기는 경고는 문제로 보지 않는다. */
const EXPECTED_CONSOLE = [/status of 404/, /hydrated but some attributes/];

let failed = false;
for (const name of selected) {
  if (!ALL.includes(name)) {
    console.error(`알 수 없는 시나리오: ${name} (가능: ${ALL.join(", ")})`);
    process.exit(2);
  }
  const started = Date.now();
  const run = spawnSync(process.execPath, [`${name}.mjs`], { cwd: here, encoding: "utf8", timeout: 10 * 60_000 });
  const lines = `${run.stdout ?? ""}${run.stderr ?? ""}`.split("\n");
  const pass = lines.filter((l) => l.startsWith("PASS")).length;
  const problems = lines.filter(
    (l) =>
      l.startsWith("FAIL") ||
      l.startsWith("EXCEPTION") ||
      l.startsWith("PAGE ERROR") ||
      (l.startsWith("CONSOLE ERROR") && !EXPECTED_CONSOLE.some((re) => re.test(l))),
  );
  const crashed = run.status !== 0 || run.error;
  const ok = problems.length === 0 && !crashed && pass > 0;
  if (!ok) failed = true;
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`${ok ? "✔" : "✖"} ${name.padEnd(10)} 통과 ${String(pass).padStart(3)}  문제 ${problems.length}  (${seconds}초)`);
  for (const p of problems) console.log(`    ${p.slice(0, 300)}`);
  if (crashed) console.log(`    실행 실패: ${run.error?.message ?? `종료 코드 ${run.status}`}\n${(run.stderr ?? "").slice(0, 1000)}`);
}
process.exit(failed ? 1 : 0);
