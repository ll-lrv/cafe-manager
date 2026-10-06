"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscribeStoreChanges } from "@/lib/api/realtime";

/** 다른 기기에서 재고·품목이 바뀌면 지금 화면의 서버 데이터를 다시 불러온다. 입력 중인 폼 값은 유지된다. */
export function RealtimeRefresh({ storeId }: { storeId: string }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeStoreChanges(storeId, () => {
      // 한 번의 기록이 여러 행(로트별 차감)일 수 있으므로 잠깐 모았다가 한 번만 새로고침한다.
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [storeId, router]);

  return null;
}
