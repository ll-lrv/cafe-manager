import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackLink() {
  return (
    <Link href="/menus" className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" />
      메뉴 목록
    </Link>
  );
}
