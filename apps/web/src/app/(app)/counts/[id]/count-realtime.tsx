"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscribeStockCount } from "@/lib/api/realtime";

/** 여러 사람이 나눠 셀 때, 다른 사람이 입력한 수량을 바로 보여준다. */
export function StockCountRealtime({ countId }: { countId: string }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeStockCount(countId, () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [countId, router]);
  return null;
}
