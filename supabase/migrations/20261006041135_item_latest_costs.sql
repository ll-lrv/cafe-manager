CREATE VIEW "public"."item_latest_costs" WITH (security_invoker = true) AS (
    select distinct on (m.item_id)
      m.item_id,
      m.store_id,
      m.unit_cost,
      m.occurred_at as received_at
    from stock_movements m
    where m.type = 'receive' and m.unit_cost is not null
    order by m.item_id, m.occurred_at desc, m.created_at desc
  );