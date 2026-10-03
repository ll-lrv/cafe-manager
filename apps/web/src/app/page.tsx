import { redirect } from "next/navigation";

// 로그인 여부는 proxy.ts 가, 매장 유무는 (app) 레이아웃이 확인한다.
export default function Home() {
  redirect("/dashboard");
}
