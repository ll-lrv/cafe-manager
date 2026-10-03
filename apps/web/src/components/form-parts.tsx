"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

/** 폼 제출 중에는 비활성화되고 문구가 바뀌는 버튼 */
export function SubmitButton({
  children,
  pendingText = "처리 중…",
  className,
  variant,
  size,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.error && !state?.message) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={cn("text-sm", state.error ? "text-destructive" : "text-muted-foreground")}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 네이티브 select. 폼 제출과 모바일 키보드에서 가장 안정적이다. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
