import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모노레포 내부 패키지는 빌드 없이 TS 소스를 그대로 가져온다.
  transpilePackages: ["@cafe/core", "@cafe/db"],
};

export default nextConfig;
