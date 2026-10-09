-- 실사 뒤에 그 이전 날짜의 판매가 기록되거나 취소돼도 재고가 실사 결과에서 벗어나지 않게 한다.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md
--
-- 왜: 실사는 "센 시각의 장부"와 센 수량의 차이를 조정한다 (complete_stock_count).
--   실사가 끝난 뒤에 센 시각 이전의 판매가 들어오면(지난 날짜 입력, CSV 가져오기) 그 사용분은 이미 센 수량에 들어 있는데
--   재고에서 또 빠진다. 반대로 실사 장부에 들어 있던 판매를 실사 뒤에 취소하면 재고가 그만큼 늘어난다.
-- 어떻게: 판매는 그대로 기록하고(매출·이론 사용량은 맞게), 재고에 주는 영향만 그 실사의 조정 원장으로 상쇄한다.
--   상쇄 원장은 type = 'adjust', stock_count_id = 그 실사, occurred_at = 그 실사 완료 시각이라
--   이론 vs 실제에서는 그 실사 구간의 "실사에서 모자란 양"이 늘어난/줄어든 판매만큼 바뀐다.
--   유통기한 묶음(로트)도 실사 직후 상태를 유지한다:
--     ① 늦게 들어온 판매: 판매 원장을 로트 없이 기록하고, 상쇄도 로트 없이 → 로트는 그대로
--     ② 실사 장부에 있던 판매의 취소: 지워지는 원장과 같은 로트로 상쇄 → 로트는 그대로
--
-- 어느 실사에 붙이나: 그 품목을 센 완료된 실사 중, 센 시각이 판매 시각 이후인 것 가운데 가장 이른 것.
--   ①은 판매가 기록될 때 그 실사가 이미 완료돼 있어야 한다 (진행 중인 실사는 완료할 때의 장부로 계산하므로 그대로 맞는다).
--   ②는 지워지는 원장이 그 실사 완료 전에 기록돼 있었어야 한다 (완료 뒤에 기록된 판매는 ①에서 상쇄했고, 그 상쇄 원장은
--   판매에 연결돼 있어 판매와 함께 지워진다).

------------------------------------------------------------
-- 판매 원장 시각 기준으로 상쇄할 실사 (없으면 NULL)
------------------------------------------------------------
CREATE FUNCTION public.count_covering_movement(p_item_id uuid, p_occurred_at timestamptz)
RETURNS TABLE (stock_count_id uuid, completed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.completed_at
  FROM public.stock_count_lines l
  JOIN public.stock_counts c ON c.id = l.stock_count_id
  WHERE l.item_id = p_item_id
    AND l.counted_quantity IS NOT NULL
    AND l.counted_at >= p_occurred_at
    AND c.status = 'completed'
  ORDER BY l.counted_at, c.id
  LIMIT 1
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.count_covering_movement(uuid, timestamptz) FROM PUBLIC, anon, authenticated;--> statement-breakpoint

------------------------------------------------------------
-- ① 늦게 들어온 판매: 로트 없이 기록 (BEFORE) + 상쇄 원장 (AFTER)
------------------------------------------------------------
CREATE FUNCTION public.backdated_sale_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.count_covering_movement(new.item_id, new.occurred_at)) THEN
    new.lot_id := NULL;
  END IF;
  RETURN new;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.backdated_sale_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count record;
BEGIN
  SELECT * INTO v_count FROM public.count_covering_movement(new.item_id, new.occurred_at);
  IF FOUND THEN
    INSERT INTO public.stock_movements
      (store_id, item_id, type, quantity, entered_quantity, memo, stock_count_id, sale_record_id, occurred_at, created_by)
    VALUES
      (new.store_id, new.item_id, 'adjust', -new.quantity, -new.quantity,
       '실사 보정: 실사 뒤에 기록된 그 이전 판매 (실사 수량에 이미 반영됨)',
       v_count.stock_count_id, new.sale_record_id, v_count.completed_at, new.created_by);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER stock_movements_backdated_sale_before
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW WHEN (new.type = 'sale')
  EXECUTE FUNCTION public.backdated_sale_before_insert();--> statement-breakpoint

CREATE TRIGGER stock_movements_backdated_sale_after
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW WHEN (new.type = 'sale')
  EXECUTE FUNCTION public.backdated_sale_after_insert();--> statement-breakpoint

------------------------------------------------------------
-- ② 실사 장부에 있던 판매의 취소: 같은 로트로 상쇄 원장
--   판매 취소·가져오기 취소의 cascade 로 판매 원장이 지워질 때 실행된다.
--   cascade 는 사용자 권한으로 돌므로 SECURITY DEFINER 로 원장에 쓴다 (원장에는 직접 INSERT 정책이 없다).
--   판매가 취소된 경우만 상쇄한다. 판매가 아직 있으면(원장만 직접 지움) 또는 매장째 지우는 중이면 하지 않는다.
------------------------------------------------------------
CREATE FUNCTION public.counted_sale_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count record;
BEGIN
  IF old.sale_record_id IS NULL
    OR EXISTS (SELECT 1 FROM public.sale_records WHERE id = old.sale_record_id)
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = old.store_id) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_count FROM public.count_covering_movement(old.item_id, old.occurred_at);
  -- 실사 완료 뒤에 기록된 판매는 기록할 때 상쇄했고, 그 상쇄 원장도 함께 지워진다.
  IF FOUND AND old.created_at <= v_count.completed_at THEN
    INSERT INTO public.stock_movements
      (store_id, item_id, lot_id, type, quantity, entered_quantity, memo, stock_count_id, occurred_at, created_by)
    VALUES
      (old.store_id, old.item_id, old.lot_id, 'adjust', old.quantity, old.quantity,
       '실사 보정: 실사 뒤에 취소된 그 이전 판매 (실사 수량에 이미 반영됨)',
       v_count.stock_count_id, v_count.completed_at, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER stock_movements_counted_sale_delete
  AFTER DELETE ON public.stock_movements
  FOR EACH ROW WHEN (old.type = 'sale')
  EXECUTE FUNCTION public.counted_sale_after_delete();--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.backdated_sale_before_insert() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.backdated_sale_after_insert() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.counted_sale_after_delete() FROM PUBLIC, anon, authenticated;
