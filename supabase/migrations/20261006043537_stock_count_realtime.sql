-- 여러 사람이 나눠 셀 때 다른 사람이 입력한 수량을 바로 보여주기 위해 실사 줄 변경을 방송한다.
-- (RLS 로 같은 매장 구성원에게만 전달된다)
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_count_lines;
