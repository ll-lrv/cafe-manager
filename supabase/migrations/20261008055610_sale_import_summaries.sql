CREATE VIEW "public"."sale_import_summaries" WITH (security_invoker = true) AS (
    select
      i.id as import_id,
      i.store_id,
      count(s.id)::integer as sale_count,
      coalesce(sum(s.quantity), 0)::integer as quantity,
      coalesce(sum(s.amount), 0)::bigint as amount,
      min(s.sold_at) as first_sold_at,
      max(s.sold_at) as last_sold_at
    from sale_imports i
    left join sale_records s on s.import_id = i.id
    group by i.id
  );