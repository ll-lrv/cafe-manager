import { defineConfig } from "@playwright/test";

/** 테스트할 웹 주소. 기본 주소면 떠 있는 `pnpm dev` 를 쓰고, 없으면 띄운다. */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // 시나리오 하나가 가입부터 여러 화면을 길게 돈다.
  timeout: 5 * 60_000,
  expect: { timeout: 8_000 },
  // 시나리오마다 계정·매장을 따로 만들어 서로 겹치지 않는다. 개발 서버(next dev)가 버거우면 E2E_WORKERS 로 줄인다.
  workers: Number(process.env.E2E_WORKERS ?? 3),
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "ko-KR",
    viewport: { width: 1100, height: 900 },
    // 브라우저를 내려받지 않고 설치된 Chrome 을 쓴다. 경로가 다르면 CHROME_PATH 로 지정
    ...(process.env.CHROME_PATH
      ? { launchOptions: { executablePath: process.env.CHROME_PATH } }
      : { channel: "chrome" }),
    // 기본값(제한 없음)이면 누를 수 없는 버튼을 기다리다 시나리오 전체 제한 시간까지 멈춘다.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @cafe/web dev",
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
        // 개발 서버 로그는 화면 이동이 끊길 때 나는 경고가 많아 감춘다. 로그를 보려면 `pnpm dev` 를 따로 띄운다.
        stdout: "ignore",
        stderr: "ignore",
      },
});
