-- 품목 관리용 DB 트리거.
-- NestJS로 옮겨도 DB에 남는 규칙이라 그대로 재사용한다.

------------------------------------------------------------
-- 1. updated_at 자동 갱신
--   Drizzle 의 $onUpdate 는 ORM 으로 수정할 때만 동작한다.
--   Supabase 클라이언트로 수정해도 갱신되도록 DB에서 처리한다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER items_set_updated_at BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER menus_set_updated_at BEFORE UPDATE ON public.menus
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER purchase_orders_set_updated_at BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

------------------------------------------------------------
-- 2. 기본 단위 변경 제한
--   입출고·레시피 수량은 기본 단위로 저장되므로, 기록이 생긴 뒤에 g → ml 처럼 바꾸면
--   기존 수량의 뜻이 달라진다. 기록이 없을 때만 바꿀 수 있다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_item_base_unit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.base_unit IS DISTINCT FROM old.base_unit AND (
    EXISTS (SELECT 1 FROM public.stock_movements WHERE item_id = old.id)
    OR EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE item_id = old.id)
  ) THEN
    RAISE EXCEPTION '입출고나 레시피에 쓰인 품목은 기본 단위를 바꿀 수 없습니다.';
  END IF;
  RETURN new;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER items_prevent_base_unit_change BEFORE UPDATE OF base_unit ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_item_base_unit_change();
