-- 발주: 권한 정리, 상태 변경 함수, 입고 처리 함수.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. 발주서 (purchase_orders)
--   만들기(작성 중)와 날짜·메모·거래처 수정은 사장·매니저가 직접 한다.
--   상태(status, ordered_at)는 change_purchase_order_status / receive_purchase_order 로만 바뀐다.
------------------------------------------------------------
DROP POLICY purchase_orders_write ON public.purchase_orders;--> statement-breakpoint

CREATE POLICY purchase_orders_insert ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_store_admin(store_id)
    AND status = 'draft'
    AND created_by = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.store_id = purchase_orders.store_id)
  );--> statement-breakpoint
CREATE POLICY purchase_orders_update ON public.purchase_orders FOR UPDATE TO authenticated
  USING (public.is_store_admin(store_id) AND status IN ('draft', 'ordered'))
  WITH CHECK (
    public.is_store_admin(store_id)
    AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.store_id = purchase_orders.store_id)
  );--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON public.purchase_orders FROM anon, authenticated;--> statement-breakpoint
GRANT INSERT (store_id, supplier_id, expected_on, memo, created_by) ON public.purchase_orders TO authenticated;--> statement-breakpoint
GRANT UPDATE (supplier_id, expected_on, memo) ON public.purchase_orders TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 2. 발주 줄 (purchase_order_lines)
--   작성 중인 발주서에서만 넣고·고치고·뺀다. 품목은 같은 매장, 단위는 그 품목의 것.
--   입고 수량(received_quantity)은 receive_purchase_order 로만 바뀐다.
------------------------------------------------------------
DROP POLICY purchase_order_lines_write ON public.purchase_order_lines;--> statement-breakpoint

CREATE POLICY purchase_order_lines_draft_write ON public.purchase_order_lines FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_id AND po.status = 'draft' AND public.is_store_admin(po.store_id)
  ))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po JOIN public.items i ON i.store_id = po.store_id
      WHERE po.id = purchase_order_id AND po.status = 'draft' AND public.is_store_admin(po.store_id) AND i.id = item_id
    )
    AND (item_unit_id IS NULL OR EXISTS (
      SELECT 1 FROM public.item_units u WHERE u.id = item_unit_id AND u.item_id = purchase_order_lines.item_id
    ))
  );--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON public.purchase_order_lines FROM anon, authenticated;--> statement-breakpoint
GRANT INSERT (purchase_order_id, item_id, item_unit_id, quantity, unit_price) ON public.purchase_order_lines TO authenticated;--> statement-breakpoint
GRANT UPDATE (item_unit_id, quantity, unit_price) ON public.purchase_order_lines TO authenticated;--> statement-breakpoint
GRANT DELETE ON public.purchase_order_lines TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 3. change_purchase_order_status
--   사람이 정하는 상태 전환만 허용한다.
--     draft → ordered (줄이 하나 이상, 발주 시각 기록)   draft → cancelled
--     ordered → draft (되돌리기)                          ordered → cancelled
--     partially_received → received (남은 수량 없이 마감)
--   입고에 따른 ordered → partially_received → received 는 receive_purchase_order 가 정한다.
--   권한: 사장·매니저 (purchase:manage)   반환: 바뀐 상태
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_purchase_order_status(
  p_order_id uuid,
  p_status public.purchase_order_status
)
RETURNS public.purchase_order_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  SELECT * INTO v_order FROM public.purchase_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_member(v_order.store_id) THEN
    RAISE EXCEPTION '발주서를 찾을 수 없습니다.';
  END IF;
  IF NOT public.is_store_admin(v_order.store_id) THEN
    RAISE EXCEPTION '발주는 사장과 매니저만 할 수 있습니다.';
  END IF;

  IF (v_order.status, p_status) IN (
    ('draft', 'ordered'), ('draft', 'cancelled'),
    ('ordered', 'draft'), ('ordered', 'cancelled'),
    ('partially_received', 'received')
  ) THEN
    IF p_status = 'ordered'
      AND NOT EXISTS (SELECT 1 FROM public.purchase_order_lines WHERE purchase_order_id = v_order.id) THEN
      RAISE EXCEPTION '발주할 품목을 하나 이상 담아 주세요.';
    END IF;
    UPDATE public.purchase_orders
    SET status = p_status,
        ordered_at = CASE WHEN p_status = 'ordered' THEN now() WHEN p_status = 'draft' THEN NULL ELSE ordered_at END
    WHERE id = v_order.id;
    RETURN p_status;
  END IF;

  RAISE EXCEPTION '지금 상태에서는 할 수 없는 작업입니다.';
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.change_purchase_order_status(uuid, public.purchase_order_status) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_purchase_order_status(uuid, public.purchase_order_status) TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 4. receive_purchase_order
--   발주서의 입고를 처리한다. (일부만 들어와도 된다. 주문보다 많이 들어와도 기록한다)
--   p_lines: [{"line_id": uuid, "quantity": 주문 단위 수량(>0), "unit_price": 원|null, "expires_on": "YYYY-MM-DD"|null}]
--   줄마다: 유통기한 품목이면 로트 생성 → receive 원장(입력 단위·단가·발주 줄 연결) → 입고 수량 누적
--   그 뒤 상태를 다시 계산한다. (packages/core 의 derivePurchaseOrderStatus 와 같은 규칙)
--   권한: 사장·매니저 (purchase:manage)   반환: 바뀐 상태
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order_id uuid, p_lines jsonb)
RETURNS public.purchase_order_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.purchase_orders%ROWTYPE;
  v_input record;
  v_line public.purchase_order_lines%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_factor numeric;
  v_base numeric;
  v_price integer;
  v_lot_id uuid;
  v_status public.purchase_order_status;
  v_supplier_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  SELECT * INTO v_order FROM public.purchase_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_member(v_order.store_id) THEN
    RAISE EXCEPTION '발주서를 찾을 수 없습니다.';
  END IF;
  IF NOT public.is_store_admin(v_order.store_id) THEN
    RAISE EXCEPTION '입고 처리는 사장과 매니저만 할 수 있습니다.';
  END IF;
  IF v_order.status IN ('received', 'cancelled') THEN
    RAISE EXCEPTION '이미 끝난 발주서입니다.';
  END IF;
  IF v_order.status = 'draft' THEN
    RAISE EXCEPTION '발주한 뒤에 입고 처리할 수 있습니다.';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
    OR NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_lines) AS x(quantity numeric) WHERE x.quantity > 0) THEN
    RAISE EXCEPTION '입고 수량을 입력해 주세요.';
  END IF;
  SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = v_order.supplier_id;

  -- 입고할 품목을 id 순으로 잠근다. (입출고·판매·실사와 동시에 기록해도 겹치지 않도록)
  PERFORM 1 FROM public.items
  WHERE id IN (
    SELECT l.item_id FROM public.purchase_order_lines l
    WHERE l.purchase_order_id = v_order.id
      AND l.id IN (SELECT x.line_id FROM jsonb_to_recordset(p_lines) AS x(line_id uuid))
  )
  ORDER BY id
  FOR UPDATE;

  FOR v_input IN
    SELECT * FROM jsonb_to_recordset(p_lines) AS x(line_id uuid, quantity numeric, unit_price integer, expires_on date)
  LOOP
    CONTINUE WHEN v_input.quantity IS NULL OR v_input.quantity = 0;

    SELECT * INTO v_line FROM public.purchase_order_lines
    WHERE id = v_input.line_id AND purchase_order_id = v_order.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '발주서에 없는 품목입니다.';
    END IF;
    SELECT * INTO v_item FROM public.items WHERE id = v_line.item_id;
    IF v_input.quantity < 0 THEN
      RAISE EXCEPTION '입고 수량을 확인해 주세요: %', v_item.name;
    END IF;
    IF v_item.archived_at IS NOT NULL THEN
      RAISE EXCEPTION '보관된 품목입니다: %. 다시 사용으로 바꾼 뒤 입고해 주세요.', v_item.name;
    END IF;
    IF v_item.track_expiry AND v_input.expires_on IS NULL THEN
      RAISE EXCEPTION '유통기한을 입력해 주세요: %', v_item.name;
    END IF;
    v_price := coalesce(v_input.unit_price, v_line.unit_price);
    IF v_price IS NOT NULL AND v_price < 0 THEN
      RAISE EXCEPTION '단가를 확인해 주세요: %', v_item.name;
    END IF;

    -- 주문 단위 → 기본 단위 (단위를 지웠으면 기본 단위로 본다)
    v_factor := coalesce((SELECT factor FROM public.item_units WHERE id = v_line.item_unit_id), 1);
    v_base := round(v_input.quantity * v_factor, 3);
    IF v_base <= 0 THEN
      RAISE EXCEPTION '입고 수량이 너무 작습니다: %', v_item.name;
    END IF;

    v_lot_id := NULL;
    IF v_item.track_expiry THEN
      INSERT INTO public.stock_lots (store_id, item_id, expires_on)
      VALUES (v_item.store_id, v_item.id, v_input.expires_on)
      RETURNING id INTO v_lot_id;
    END IF;

    INSERT INTO public.stock_movements
      (store_id, item_id, lot_id, type, quantity, entered_unit_id, entered_quantity, unit_cost, memo,
       purchase_order_line_id, created_by)
    VALUES
      (v_item.store_id, v_item.id, v_lot_id, 'receive', v_base, v_line.item_unit_id, round(v_input.quantity, 3),
       CASE WHEN v_price IS NULL THEN NULL ELSE round(v_price::numeric / v_factor, 4) END,
       format('발주 입고: %s', v_supplier_name), v_line.id, v_uid);

    UPDATE public.purchase_order_lines
    SET received_quantity = round(received_quantity + v_input.quantity, 3),
        unit_price = coalesce(v_input.unit_price, unit_price)
    WHERE id = v_line.id;
  END LOOP;

  -- 모든 줄이 주문 수량 이상 들어왔으면 완료, 아니면 일부 입고
  v_status := CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.purchase_order_lines WHERE purchase_order_id = v_order.id AND received_quantity < quantity
    ) THEN 'received'::public.purchase_order_status
    ELSE 'partially_received'::public.purchase_order_status
  END;
  UPDATE public.purchase_orders SET status = v_status WHERE id = v_order.id;
  RETURN v_status;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb) TO authenticated;
