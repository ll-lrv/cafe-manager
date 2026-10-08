import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href = "/menus", label = "메뉴 목록" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" />
      {label}
    </Link>
  );
}
