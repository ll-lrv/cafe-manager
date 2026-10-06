-- 재고 실사: 시작·완료 함수, 센 시각 기록 트리거, 권한 정리.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. stock_outflow 에 실사 연결(p_stock_count_id)을 추가한다. (나머지 동작은 그대로)
--   인자가 바뀌어 다시 만든다. 기존 호출(record_stock_movement, record_sales)은 위치 인자라 그대로 동작한다.
------------------------------------------------------------
DROP FUNCTION public.stock_outflow(uuid, public.movement_type, numeric, uuid, numeric, text, uuid, timestamptz, uuid);--> statement-breakpoint

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
  p_stock_count_id uuid DEFAULT NULL
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
        (store_id, item_id, lot_id, type, quantity, entered_unit_id, entered_quantity, memo,
         sale_record_id, stock_count_id, occurred_at, created_by)
      VALUES
        (v_item.store_id, v_item.id, v_lot.id, p_type, -v_take, p_unit_id, round(-v_take / p_factor, 3), p_memo,
         p_sale_record_id, p_stock_count_id, p_occurred_at, p_created_by);
      v_remaining := v_remaining - v_take;
      v_rows := v_rows + 1;
    END LOOP;
  END IF;

  -- 로트가 없거나 모자란 만큼은 로트 없이 차감한다. (재고가 마이너스가 될 수 있다: 기록이 늦은 경우)
  IF v_remaining > 0 THEN
    INSERT INTO public.stock_movements
      (store_id, item_id, type, quantity, entered_unit_id, entered_quantity, memo,
       sale_record_id, stock_count_id, occurred_at, created_by)
    VALUES
      (v_item.store_id, v_item.id, p_type, -v_remaining, p_unit_id, round(-v_remaining / p_factor, 3), p_memo,
       p_sale_record_id, p_stock_count_id, p_occurred_at, p_created_by);
    v_rows := v_rows + 1;
  END IF;

  RETURN v_rows;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.stock_outflow(uuid, public.movement_type, numeric, uuid, numeric, text, uuid, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 2. 센 시각·센 사람은 DB가 기록한다. (화면이 보낸 값을 믿지 않는다)
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_stock_count_line_counted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF new.counted_quantity IS NULL THEN
    new.counted_at := NULL;
    new.counted_by := NULL;
  ELSIF new.counted_quantity IS DISTINCT FROM old.counted_quantity THEN
    new.counted_at := now();
    new.counted_by := auth.uid();
  END IF;
  RETURN new;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER stock_count_lines_set_counted BEFORE UPDATE OF counted_quantity ON public.stock_count_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_stock_count_line_counted();--> statement-breakpoint

------------------------------------------------------------
-- 3. 권한 정리
--   실사 만들기·줄 만들기·완료는 함수로만. 구성원은 진행 중인 실사의 "센 수량"만 고칠 수 있다.
--   사장·매니저는 진행 중인 실사를 취소(status → cancelled)할 수 있다.
------------------------------------------------------------
DROP POLICY stock_counts_insert ON public.stock_counts;--> statement-breakpoint
DROP POLICY stock_counts_update ON public.stock_counts;--> statement-breakpoint
CREATE POLICY stock_counts_cancel ON public.stock_counts FOR UPDATE TO authenticated
  USING (public.is_store_admin(store_id) AND status = 'in_progress')
  WITH CHECK (public.is_store_admin(store_id) AND status = 'cancelled');--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.stock_counts FROM anon, authenticated;--> statement-breakpoint
GRANT UPDATE (status) ON public.stock_counts TO authenticated;--> statement-breakpoint

DROP POLICY stock_count_lines_write ON public.stock_count_lines;--> statement-breakpoint
CREATE POLICY stock_count_lines_update ON public.stock_count_lines FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stock_counts c
    WHERE c.id = stock_count_id AND c.status = 'in_progress' AND public.is_store_member(c.store_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stock_counts c
    WHERE c.id = stock_count_id AND c.status = 'in_progress' AND public.is_store_member(c.store_id)
  ));--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.stock_count_lines FROM anon, authenticated;--> statement-breakpoint
GRANT UPDATE (counted_quantity) ON public.stock_count_lines TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 4. start_stock_count
--   실사를 시작한다. 보관되지 않은 품목(카테고리를 고르면 그 카테고리만)마다 줄을 만들고
--   시작 시점의 장부 재고를 expected_quantity 로 남긴다. 매장당 진행 중인 실사는 하나.
--   권한: 구성원 (stock:count)   반환: 실사 ID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_stock_count(
  p_store_id uuid,
  p_category_id uuid DEFAULT NULL,
  p_memo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count_id uuid;
  v_memo text := nullif(btrim(p_memo), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT public.is_store_member(p_store_id) THEN
    RAISE EXCEPTION '매장을 찾을 수 없습니다.';
  END IF;
  IF p_category_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND store_id = p_store_id) THEN
    RAISE EXCEPTION '카테고리를 찾을 수 없습니다.';
  END IF;
  IF length(v_memo) > 200 THEN
    RAISE EXCEPTION '메모는 200자 이하로 입력해 주세요.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_counts WHERE store_id = p_store_id AND status = 'in_progress') THEN
    RAISE EXCEPTION '진행 중인 실사가 있습니다. 먼저 완료하거나 취소해 주세요.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.items
    WHERE store_id = p_store_id AND archived_at IS NULL AND (p_category_id IS NULL OR category_id = p_category_id)
  ) THEN
    RAISE EXCEPTION '셀 품목이 없습니다.';
  END IF;

  INSERT INTO public.stock_counts (store_id, category_id, memo, created_by)
  VALUES (p_store_id, p_category_id, v_memo, v_uid)
  RETURNING id INTO v_count_id;

  INSERT INTO public.stock_count_lines (stock_count_id, item_id, expected_quantity)
  SELECT v_count_id, i.id, coalesce(s.quantity, 0)
  FROM public.items i
  LEFT JOIN public.item_stock_levels s ON s.item_id = i.id
  WHERE i.store_id = p_store_id AND i.archived_at IS NULL AND (p_category_id IS NULL OR i.category_id = p_category_id);

  RETURN v_count_id;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.start_stock_count(uuid, uuid, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_stock_count(uuid, uuid, text) TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 5. complete_stock_count
--   센 품목마다 "센 시각의 장부 재고"(stock_count_line_books 와 같은 계산)와 비교해
--   차이만큼 adjust 원장을 만들고(줄이면 유통기한 순, 늘리면 로트 없이) 실사를 완료한다.
--   세지 않은 품목은 그대로 둔다. (packages/core 의 countAdjustments 와 같은 규칙)
--   권한: 사장·매니저 (stock:count:complete)   반환: 조정한 품목 수
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_stock_count(p_stock_count_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count public.stock_counts%ROWTYPE;
  v_line record;
  v_diff numeric;
  v_adjusted integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_stock_count_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_member(v_count.store_id) THEN
    RAISE EXCEPTION '실사를 찾을 수 없습니다.';
  END IF;
  IF NOT public.is_store_admin(v_count.store_id) THEN
    RAISE EXCEPTION '실사 완료는 사장과 매니저만 할 수 있습니다.';
  END IF;
  IF v_count.status <> 'in_progress' THEN
    RAISE EXCEPTION '이미 끝난 실사입니다.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_count_lines WHERE stock_count_id = v_count.id AND counted_quantity IS NOT NULL
  ) THEN
    RAISE EXCEPTION '센 품목이 없습니다. 수량을 하나 이상 입력해 주세요.';
  END IF;

  -- 센 품목을 id 순으로 잠근다. (입출고·판매와 동시에 기록돼도 로트 계산이 겹치지 않고, 교착도 피한다)
  PERFORM 1 FROM public.items
  WHERE id IN (
    SELECT item_id FROM public.stock_count_lines WHERE stock_count_id = v_count.id AND counted_quantity IS NOT NULL
  )
  ORDER BY id
  FOR UPDATE;

  FOR v_line IN
    SELECT l.item_id, l.counted_quantity,
      (SELECT coalesce(sum(m.quantity), 0) FROM public.stock_movements m
       WHERE m.item_id = l.item_id AND m.occurred_at <= l.counted_at) AS book_quantity
    FROM public.stock_count_lines l
    WHERE l.stock_count_id = v_count.id AND l.counted_quantity IS NOT NULL
    ORDER BY l.item_id
  LOOP
    v_diff := round(v_line.counted_quantity - v_line.book_quantity, 3);
    UPDATE public.stock_count_lines SET adjustment = v_diff
    WHERE stock_count_id = v_count.id AND item_id = v_line.item_id;

    IF v_diff < 0 THEN
      PERFORM public.stock_outflow(
        v_line.item_id, 'adjust', -v_diff, NULL, 1, '재고 실사', v_uid, now(), NULL, v_count.id
      );
    ELSIF v_diff > 0 THEN
      INSERT INTO public.stock_movements
        (store_id, item_id, type, quantity, entered_quantity, memo, stock_count_id, created_by)
      VALUES
        (v_count.store_id, v_line.item_id, 'adjust', v_diff, v_diff, '재고 실사', v_count.id, v_uid);
    END IF;
    IF v_diff <> 0 THEN
      v_adjusted := v_adjusted + 1;
    END IF;
  END LOOP;

  UPDATE public.stock_counts
  SET status = 'completed', completed_at = now(), completed_by = v_uid
  WHERE id = v_count.id;

  RETURN v_adjusted;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.complete_stock_count(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.complete_stock_count(uuid) TO authenticated;
