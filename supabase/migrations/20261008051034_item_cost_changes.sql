CREATE VIEW "public"."item_cost_changes" WITH (security_invoker = true) AS (
    select distinct on (r.item_id)
      r.item_id,
      r.store_id,
      r.previous_unit_cost,
      r.unit_cost,
      r.occurred_at as changed_at
    from (
      select
        m.item_id,
        m.store_id,
        m.unit_cost,
        m.occurred_at,
        m.created_at,
        lag(m.unit_cost) over (partition by m.item_id order by m.occurred_at, m.created_at) as previous_unit_cost
      from stock_movements m
      where m.type = 'receive' and m.unit_cost is not null
    ) r
    where r.previous_unit_cost <> r.unit_cost
    order by r.item_id, r.occurred_at desc, r.created_at desc
  );