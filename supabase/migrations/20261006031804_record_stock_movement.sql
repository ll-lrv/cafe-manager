-- 입출고 기록 함수. 로트 생성·FIFO 배분·원장 기록을 한 트랜잭션으로 처리한다.
-- 여러 행을 함께 쓰는 작업은 DB 함수로 묶는다. NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. record_stock_movement
--   입고(receive)·사용(consume)·폐기(waste)·조정(adjust)을 기록한다. 판매(sale)는 판매 입력에서 따로 기록한다.
--   p_quantity 는 입력 단위(p_unit_id, 없으면 기본 단위) 기준.
--     receive/consume/waste: 양수로 받고 부호는 여기서 붙인다. adjust: 부호 포함(+ 늘림, - 줄임)
--   p_unit_price 는 입고 단가(입력 단위 1개당, 원). 원장에는 기본 단위 1개당 원가로 저장한다.
--   유통기한 품목: 들어오면 로트를 만들고, 나가면 기한이 빠른 로트부터 꺼낸다.
--     로트 잔량이 모자라면 나머지는 로트 없이 차감한다. (packages/core 의 allocateFifo 와 같은 규칙)
--   반환: 기록된 원장 행 수 (로트를 나눠 꺼내면 여러 행)
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_item_id uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_unit_id uuid DEFAULT NULL,
  p_unit_price integer DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_memo text DEFAULT NULL
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
  v_lot record;
  v_remaining numeric;
  v_take numeric;
  v_rows integer := 0;
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

  -- 나가는 기록: 유통기한 품목이면 기한이 빠른 로트부터 (기한 없음은 맨 뒤, 같으면 먼저 입고된 순)
  v_remaining := -v_base;
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
        (store_id, item_id, lot_id, type, quantity, entered_unit_id, entered_quantity, memo, created_by)
      VALUES
        (v_item.store_id, v_item.id, v_lot.id, p_type, -v_take, p_unit_id, round(-v_take / v_factor, 3), v_memo, v_uid);
      v_remaining := v_remaining - v_take;
      v_rows := v_rows + 1;
    END LOOP;
  END IF;

  -- 로트가 없거나 모자란 만큼은 로트 없이 차감한다. (재고가 마이너스가 될 수 있다: 기록이 늦은 경우)
  IF v_remaining > 0 THEN
    INSERT INTO public.stock_movements
      (store_id, item_id, type, quantity, entered_unit_id, entered_quantity, memo, created_by)
    VALUES
      (v_item.store_id, v_item.id, p_type, -v_remaining, p_unit_id, round(-v_remaining / v_factor, 3), v_memo, v_uid);
    v_rows := v_rows + 1;
  END IF;

  RETURN v_rows;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.record_stock_movement(uuid, public.movement_type, numeric, uuid, integer, date, text)
  FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, public.movement_type, numeric, uuid, integer, date, text)
  TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 2. 원장과 로트는 함수로만 쓴다.
--   직접 INSERT 를 허용하면 로트 배분을 건너뛴 기록이 생길 수 있으므로 정책을 없앤다.
--   (판매 차감, 실사 조정도 각각 DB 함수로 기록할 예정)
------------------------------------------------------------
DROP POLICY stock_movements_insert ON public.stock_movements;--> statement-breakpoint
DROP POLICY stock_lots_insert ON public.stock_lots;
