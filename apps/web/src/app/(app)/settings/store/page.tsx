import { can } from "@cafe/core";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentStore } from "@/lib/api/stores";
import { StoreForm } from "./store-form";

export const metadata: Metadata = { title: "매장 설정" };

/** 고를 수 있는 시간대 (UTC 차이가 작은 순 → 이름 순). 저장된 값이 목록에 없어도 보이게 넣는다. */
function timeZoneOptions(current: string) {
  const zones = new Set([...Intl.supportedValuesOf("timeZone"), current]);
  const now = new Date();
  return [...zones]
    .map((zone) => {
      const offset =
        new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
          .formatToParts(now)
          .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
      // "GMT+09:00" → 정렬용 분 단위
      const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset);
      const minutes = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
      return { value: zone, label: `${zone} (${offset === "GMT" ? "GMT+00:00" : offset})`, minutes };
    })
    .sort((a, b) => a.minutes - b.minutes || a.value.localeCompare(b.value))
    .map(({ value, label }) => ({ value, label }));
}

export default async function StoreSettingsPage() {
  const store = await requireCurrentStore();
  if (!can(store.role, "store:manage")) {
    return <p className="text-sm text-muted-foreground">매장 설정은 사장만 할 수 있습니다.</p>;
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-bold">매장 설정</h1>
      <Card>
        <CardHeader>
          <CardTitle>매장 정보</CardTitle>
          <CardDescription>시간대를 바꿔도 이미 기록된 시각은 그대로이고, 보여주는 기준만 바뀝니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <StoreForm
            name={store.storeName}
            timeZone={store.timeZone}
            targetCostRate={store.targetCostRate}
            timeZoneOptions={timeZoneOptions(store.timeZone)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
