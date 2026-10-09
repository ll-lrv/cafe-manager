-- 폐기 사유: 입출고 함수가 사유를 받아 원장에 남기고, 폐기 리포트용 합계 함수를 더한다.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. stock_outflow 에 폐기 사유(p_waste_reason)를 추가한다. (나머지 동작은 그대로)
--   인자가 바뀌어 다시 만든다. 기존 호출(판매·실사·가져오기)은 위치 인자라 그대로 동작한다.
------------------------------------------------------------
DROP FUNCTION public.stock_outflow(uuid, public.movement_type, numeric, uuid, numeric, text, uuid, timestamptz, uuid, uuid);--> statement-breakpoint

CREATE FUNCTION public.stock_outflow(
  p_item_id uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_unit_id uuid,
  p_factor numeric,
  p_memo text,
  p_created_by uuid,
  p_occurred_at timestamptz,
  p_sale_record_id uuid DEFAULT NULL,
  p_stock_count_id uuid DEFAULT NULL,
  p_waste_reason public.waste_reason DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.items%ROWTYPE;
  v_lot record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_rows integer := 0;
BEGIN
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id;
  IF p_quantity <= 0 THEN
    RETURN 0;
  END IF;

  IF v_item.track_expiry THEN
    FOR v_lot IN
      SELECT l.id, sum(m.quantity) AS quantity
      FROM public.stock_lots l
      JOIN public.stock_movements m ON m.lot_id = l.id
      WHERE l.item_id = v_item.id
      GROUP BY l.id
      HAVING sum(m.quantity) > 0
      ORDER BY l.expires_on ASC NULLS LAST, l.received_at, l.id
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := least(v_lot.quantity, v_remaining);
      INSERT INTO public.stock_movements
        (store_id, item_id, lot_id, type, quantity, entered_unit_id, entered_quantity, memo, waste_reason,
         sale_record_id, stock_count_id, occurred_at, created_by)
      VALUES
        (v_item.store_id, v_item.id, v_lot.id, p_type, -v_take, p_unit_id, round(-v_take / p_factor, 3), p_memo, p_waste_reason,
         p_sale_record_id, p_stock_count_id, p_occurred_at, p_created_by);
      v_remaining := v_remaining - v_take;
      v_rows := v_rows + 1;
    END LOOP;
  END IF;

  -- 로트가 없거나 모자란 만큼은 로트 없이 차감한다. (재고가 마이너스가 될 수 있다: 기록이 늦은 경우)
  IF v_remaining > 0 THEN
    INSERT INTO public.stock_movements
      (store_id, item_id, type, quantity, entered_unit_id, entered_quantity, memo, waste_reason,
       sale_record_id, stock_count_id, occurred_at, created_by)
    VALUES
      (v_item.store_id, v_item.id, p_type, -v_remaining, p_unit_id, round(-v_remaining / p_factor, 3), p_memo, p_waste_reason,
       p_sale_record_id, p_stock_count_id, p_occurred_at, p_created_by);
    v_rows := v_rows + 1;
  END IF;

  RETURN v_rows;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.stock_outflow(uuid, public.movement_type, numeric, uuid, numeric, text, uuid, timestamptz, uuid, uuid, public.waste_reason)
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 2. record_stock_movement 에 폐기 사유(p_waste_reason)를 추가한다.
--   폐기(waste)는 사유가 꼭 있어야 하고, 다른 종류에는 사유를 받지 않는다. 기타(other)는 메모에 사유를 적어야 한다.
--   인자가 바뀌어 다시 만든다 (같은 이름에 기본값 있는 인자 두 벌이 있으면 호출이 모호해지므로 예전 것은 지운다).
------------------------------------------------------------
DROP FUNCTION public.record_stock_movement(uuid, public.movement_type, numeric, uuid, integer, date, text);--> statement-breakpoint

CREATE FUNCTION public.record_stock_movement(
  p_item_id uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_unit_id uuid DEFAULT NULL,
  p_unit_price integer DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_memo text DEFAULT NULL,
  p_waste_reason public.waste_reason DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.items%ROWTYPE;
  v_factor numeric := 1;
  v_base numeric;
  v_unit_cost numeric;
  v_lot_id uuid;
  v_memo text := nullif(btrim(p_memo), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  -- 같은 품목의 기록을 차례로 처리한다. (동시에 기록해도 로트 잔량 계산이 겹치지 않도록)
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_member(v_item.store_id) THEN
    RAISE EXCEPTION '품목을 찾을 수 없습니다.';
  END IF;
  IF v_item.archived_at IS NOT NULL THEN
    RAISE EXCEPTION '보관된 품목입니다. 다시 사용으로 바꾼 뒤 기록해 주세요.';
  END IF;

  -- 권한과 입력값 확인 (권한 표: packages/core/src/permissions.ts 의 stock:move, stock:adjust)
  IF p_type = 'sale' THEN
    RAISE EXCEPTION '판매 차감은 판매 입력에서 기록합니다.';
  END IF;
  IF p_type = 'adjust' AND NOT public.is_store_admin(v_item.store_id) THEN
    RAISE EXCEPTION '재고 조정은 사장과 매니저만 할 수 있습니다.';
  END IF;
  IF p_quantity IS NULL
    OR (p_type = 'adjust' AND p_quantity = 0)
    OR (p_type <> 'adjust' AND p_quantity <= 0) THEN
    RAISE EXCEPTION '수량을 확인해 주세요.';
  END IF;
  IF p_unit_price IS NOT NULL AND (p_type <> 'receive' OR p_unit_price < 0) THEN
    RAISE EXCEPTION '단가를 확인해 주세요.';
  END IF;
  IF p_type = 'receive' AND v_item.track_expiry AND p_expires_on IS NULL THEN
    RAISE EXCEPTION '유통기한을 입력해 주세요.';
  END IF;
  IF p_type = 'waste' AND p_waste_reason IS NULL THEN
    RAISE EXCEPTION '폐기 사유를 골라 주세요.';
  END IF;
  IF p_type <> 'waste' AND p_waste_reason IS NOT NULL THEN
    RAISE EXCEPTION '폐기 사유는 폐기에만 적습니다.';
  END IF;
  IF p_waste_reason = 'other' AND v_memo IS NULL THEN
    RAISE EXCEPTION '기타 사유를 메모에 적어 주세요.';
  END IF;
  IF length(v_memo) > 500 THEN
    RAISE EXCEPTION '메모는 500자 이하로 입력해 주세요.';
  END IF;

  -- 입력 단위 → 기본 단위
  IF p_unit_id IS NOT NULL THEN
    SELECT factor INTO v_factor FROM public.item_units WHERE id = p_unit_id AND item_id = v_item.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '단위를 찾을 수 없습니다.';
    END IF;
  END IF;
  v_base := round(p_quantity * v_factor, 3);
  IF v_base = 0 THEN
    RAISE EXCEPTION '수량이 너무 작습니다.';
  END IF;
  IF p_type IN ('consume', 'waste') THEN
    v_base := -v_base;
  END IF;
  IF p_unit_price IS NOT NULL THEN
    v_unit_cost := round(p_unit_price::numeric / v_factor, 4);
  END IF;

  -- 들어오는 기록: 유통기한 품목이면 로트를 만든다.
  IF v_base > 0 THEN
    IF v_item.track_expiry THEN
      INSERT INTO public.stock_lots (store_id, item_id, expires_on)
      VALUES (v_item.store_id, v_item.id, p_expires_on)
      RETURNING id INTO v_lot_id;
    END IF;
    INSERT INTO public.stock_movements
      (store_id, item_id, lot_id, type, quantity, entered_unit_id, entered_quantity, unit_cost, memo, created_by)
    VALUES
      (v_item.store_id, v_item.id, v_lot_id, p_type, v_base, p_unit_id, round(v_base / v_factor, 3), v_unit_cost, v_memo, v_uid);
    RETURN 1;
  END IF;

  -- 나가는 기록
  RETURN public.stock_outflow(v_item.id, p_type, -v_base, p_unit_id, v_factor, v_memo, v_uid, now(), NULL, NULL, p_waste_reason);
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.record_stock_movement(uuid, public.movement_type, numeric, uuid, integer, date, text, public.waste_reason)
  FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, public.movement_type, numeric, uuid, integer, date, text, public.waste_reason)
  TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 3. waste_summary (읽기 전용, 폐기 리포트)
--   p_from 이상 p_to 미만(occurred_at)의 폐기를 품목·사유별로 더한다. quantity 는 양수.
--   사유 기능 전에 기록한 폐기는 reason 이 NULL 로 나온다.
--   금액·폐기율 계산은 packages/core 의 waste.ts. SECURITY INVOKER 라 RLS 가 그대로 적용된다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.waste_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  item_id uuid,
  reason public.waste_reason,
  quantity numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT m.item_id, m.waste_reason, -sum(m.quantity)
  FROM public.stock_movements m
  WHERE m.store_id = p_store_id
    AND m.type = 'waste'
    AND m.occurred_at >= p_from
    AND m.occurred_at < p_to
  GROUP BY m.item_id, m.waste_reason
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.waste_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.waste_summary(uuid, timestamptz, timestamptz) TO authenticated;
