"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
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
  "aria-label": ariaLabel,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  /** useFormAction 처럼 form action 을 쓰지 않는 폼은 직접 넘긴다. */
  pending?: boolean;
  pendingText?: React.ReactNode;
  "aria-label"?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button
      type="submit"
      disabled={pending}
      className={className}
      variant={variant}
      size={size}
      aria-label={ariaLabel}
    >
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

/** 서버 액션 결과를 토스트로 보여준다. */
export function useToastResult(state: ActionState) {
  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.message) toast.success(state.message);
  }, [state]);
}

/**
 * 서버 액션을 쓰는 폼. `<form action>` 으로 넘기면 React가 제출 후 결과와 상관없이 입력칸을 비우므로,
 * 직접 제출해서 오류가 나도 입력값이 남게 한다. resetOnSuccess 면 성공했을 때만 초기값으로 되돌린다.
 */
export function useFormAction(
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>,
  { resetOnSuccess = false }: { resetOnSuccess?: boolean } = {},
) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return { state, pending, formProps: { ref: formRef, onSubmit } };
}
