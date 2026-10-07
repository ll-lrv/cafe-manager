-- 매장 정보(이름·시간대) 수정.
-- 한 행만 바꾸므로 테이블에 직접 쓴다. RLS(stores_update: 사장만)는 이미 있고, 여기서는 바꿀 수 있는 칸과 값을 막는다.

------------------------------------------------------------
-- 1. 바꿀 수 있는 칸은 이름·시간대만 (id, created_at 은 못 바꾼다)
------------------------------------------------------------
REVOKE UPDATE ON public.stores FROM anon, authenticated;--> statement-breakpoint
GRANT UPDATE (name, timezone) ON public.stores TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 2. 값 검사
--   시간대는 화면에서 "오늘"과 하루의 경계를 정하는 데 쓰여, 잘못된 이름이 들어가면 모든 화면이 깨진다.
--   이름은 앞뒤 공백을 지우고 1~50자.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_store()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  new.name := btrim(new.name);
  IF new.name = '' THEN
    RAISE EXCEPTION '매장 이름을 입력해 주세요.';
  END IF;
  IF char_length(new.name) > 50 THEN
    RAISE EXCEPTION '매장 이름은 50자 이하로 입력해 주세요.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = new.timezone) THEN
    RAISE EXCEPTION '지원하지 않는 시간대입니다.';
  END IF;
  RETURN new;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER stores_validate BEFORE INSERT OR UPDATE OF name, timezone ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.validate_store();
