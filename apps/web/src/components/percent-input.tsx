import { Input } from "@/components/ui/input";

/** % 가 붙은 숫자 입력칸 (원가율 등) */
export function PercentInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Input inputMode="numeric" autoComplete="off" {...props} className="pr-8" />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}
