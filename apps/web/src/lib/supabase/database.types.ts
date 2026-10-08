
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "cancelled_sale_keys": {
                  Row: {
                    "created_at": string,"external_id": string,"source": Database["public"]['Enums']["sale_source"],"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"external_id": string,"source": Database["public"]['Enums']["sale_source"],"store_id": string
                  }
                  Update: {
                    "created_at"?: string,"external_id"?: string,"source"?: Database["public"]['Enums']["sale_source"],"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cancelled_sale_keys_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"sort_order": number,"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"sort_order"?: number,"store_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"item_units": {
                  Row: {
                    "created_at": string,"factor": number,"id": string,"is_default_purchase": boolean,"item_id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"factor": number,"id"?: string,"is_default_purchase"?: boolean,"item_id": string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"factor"?: number,"id"?: string,"is_default_purchase"?: boolean,"item_id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_units_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "item_units_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "archived_at": string | null,"barcode": string | null,"base_unit": Database["public"]['Enums']["base_unit"],"category_id": string | null,"created_at": string,"default_supplier_id": string | null,"id": string,"memo": string | null,"min_stock": number,"name": string,"store_id": string,"track_expiry": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"barcode"?: string | null,"base_unit": Database["public"]['Enums']["base_unit"],"category_id"?: string | null,"created_at"?: string,"default_supplier_id"?: string | null,"id"?: string,"memo"?: string | null,"min_stock"?: number,"name": string,"store_id": string,"track_expiry"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"barcode"?: string | null,"base_unit"?: Database["public"]['Enums']["base_unit"],"category_id"?: string | null,"created_at"?: string,"default_supplier_id"?: string | null,"id"?: string,"memo"?: string | null,"min_stock"?: number,"name"?: string,"store_id"?: string,"track_expiry"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_category_id_categories_id_fk"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_default_supplier_id_suppliers_id_fk"
      columns: ["default_supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_aliases": {
                  Row: {
                    "created_at": string,"id": string,"menu_id": string | null,"source_name": string,"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"menu_id"?: string | null,"source_name": string,"store_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"menu_id"?: string | null,"source_name"?: string,"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_aliases_menu_id_menus_id_fk"
      columns: ["menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_aliases_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_option_rules": {
                  Row: {
                    "created_at": string,"from_item_id": string | null,"id": string,"item_id": string,"kind": Database["public"]['Enums']["option_rule_kind"],"option_id": string,"quantity": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"from_item_id"?: string | null,"id"?: string,"item_id": string,"kind": Database["public"]['Enums']["option_rule_kind"],"option_id": string,"quantity"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"from_item_id"?: string | null,"id"?: string,"item_id"?: string,"kind"?: Database["public"]['Enums']["option_rule_kind"],"option_id"?: string,"quantity"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_option_rules_from_item_id_items_id_fk"
      columns: ["from_item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "menu_option_rules_from_item_id_items_id_fk"
      columns: ["from_item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_option_rules_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "menu_option_rules_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_option_rules_option_id_menu_options_id_fk"
      columns: ["option_id"]
isOneToOne: false
      referencedRelation: "menu_options"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_options": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"name": string,"price": number,"store_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name": string,"price"?: number,"store_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"price"?: number,"store_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_options_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"menus": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"external_id": string | null,"id": string,"is_active": boolean,"name": string,"price": number,"store_id": string,"target_cost_rate": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"external_id"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"price"?: number,"store_id": string,"target_cost_rate"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"external_id"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"price"?: number,"store_id"?: string,"target_cost_rate"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menus_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"purchase_order_lines": {
                  Row: {
                    "id": string,"item_id": string,"item_unit_id": string | null,"purchase_order_id": string,"quantity": number,"received_quantity": number,"unit_price": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"item_id": string,"item_unit_id"?: string | null,"purchase_order_id": string,"quantity": number,"received_quantity"?: number,"unit_price"?: number | null
                  }
                  Update: {
                    "id"?: string,"item_id"?: string,"item_unit_id"?: string | null,"purchase_order_id"?: string,"quantity"?: number,"received_quantity"?: number,"unit_price"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_order_lines_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "purchase_order_lines_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_lines_item_unit_id_item_units_id_fk"
      columns: ["item_unit_id"]
isOneToOne: false
      referencedRelation: "item_units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_lines_purchase_order_id_purchase_orders_id_fk"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_orders": {
                  Row: {
                    "created_at": string,"created_by": string | null,"expected_on": string | null,"id": string,"memo": string | null,"ordered_at": string | null,"status": Database["public"]['Enums']["purchase_order_status"],"store_id": string,"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"expected_on"?: string | null,"id"?: string,"memo"?: string | null,"ordered_at"?: string | null,"status"?: Database["public"]['Enums']["purchase_order_status"],"store_id": string,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"expected_on"?: string | null,"id"?: string,"memo"?: string | null,"ordered_at"?: string | null,"status"?: Database["public"]['Enums']["purchase_order_status"],"store_id"?: string,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_orders_created_by_profiles_id_fk"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_supplier_id_suppliers_id_fk"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "item_id": string,"menu_id": string,"quantity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "item_id": string,"menu_id": string,"quantity": number
                  }
                  Update: {
                    "item_id"?: string,"menu_id"?: string,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "recipe_ingredients_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_ingredients_menu_id_menus_id_fk"
      columns: ["menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_imports": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_name": string,"id": string,"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_name": string,"id"?: string,"store_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string,"id"?: string,"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_imports_created_by_profiles_id_fk"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_imports_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_record_options": {
                  Row: {
                    "option_id": string,"sale_record_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "option_id": string,"sale_record_id": string
                  }
                  Update: {
                    "option_id"?: string,"sale_record_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_record_options_option_id_menu_options_id_fk"
      columns: ["option_id"]
isOneToOne: false
      referencedRelation: "menu_options"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_record_options_sale_record_id_sale_records_id_fk"
      columns: ["sale_record_id"]
isOneToOne: false
      referencedRelation: "sale_records"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_records": {
                  Row: {
                    "amount": number | null,"created_at": string,"created_by": string | null,"external_id": string | null,"id": string,"import_id": string | null,"menu_id": string,"quantity": number,"sold_at": string,"source": Database["public"]['Enums']["sale_source"],"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"created_by"?: string | null,"external_id"?: string | null,"id"?: string,"import_id"?: string | null,"menu_id": string,"quantity": number,"sold_at"?: string,"source"?: Database["public"]['Enums']["sale_source"],"store_id": string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"created_by"?: string | null,"external_id"?: string | null,"id"?: string,"import_id"?: string | null,"menu_id"?: string,"quantity"?: number,"sold_at"?: string,"source"?: Database["public"]['Enums']["sale_source"],"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_records_created_by_profiles_id_fk"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_records_import_id_sale_imports_id_fk"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "sale_import_summaries"
      referencedColumns: ["import_id"]
    },{
      foreignKeyName: "sale_records_import_id_sale_imports_id_fk"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "sale_imports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_records_menu_id_menus_id_fk"
      columns: ["menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_records_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_count_lines": {
                  Row: {
                    "adjustment": number | null,"counted_at": string | null,"counted_by": string | null,"counted_quantity": number | null,"expected_quantity": number,"item_id": string,"stock_count_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustment"?: number | null,"counted_at"?: string | null,"counted_by"?: string | null,"counted_quantity"?: number | null,"expected_quantity": number,"item_id": string,"stock_count_id": string
                  }
                  Update: {
                    "adjustment"?: number | null,"counted_at"?: string | null,"counted_by"?: string | null,"counted_quantity"?: number | null,"expected_quantity"?: number,"item_id"?: string,"stock_count_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_count_lines_counted_by_profiles_id_fk"
      columns: ["counted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_count_lines_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_count_lines_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_count_lines_stock_count_id_stock_counts_id_fk"
      columns: ["stock_count_id"]
isOneToOne: false
      referencedRelation: "stock_counts"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_counts": {
                  Row: {
                    "category_id": string | null,"completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"id": string,"memo": string | null,"started_at": string,"status": Database["public"]['Enums']["stock_count_status"],"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"memo"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["stock_count_status"],"store_id": string
                  }
                  Update: {
                    "category_id"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"memo"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["stock_count_status"],"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_counts_category_id_categories_id_fk"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_counts_completed_by_profiles_id_fk"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_counts_created_by_profiles_id_fk"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_counts_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_lots": {
                  Row: {
                    "created_at": string,"expires_on": string | null,"id": string,"item_id": string,"received_at": string,"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_on"?: string | null,"id"?: string,"item_id": string,"received_at"?: string,"store_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_on"?: string | null,"id"?: string,"item_id"?: string,"received_at"?: string,"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_lots_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_lots_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_lots_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "created_at": string,"created_by": string | null,"entered_quantity": number | null,"entered_unit_id": string | null,"id": string,"item_id": string,"lot_id": string | null,"memo": string | null,"occurred_at": string,"purchase_order_line_id": string | null,"quantity": number,"sale_record_id": string | null,"stock_count_id": string | null,"store_id": string,"type": Database["public"]['Enums']["movement_type"],"unit_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"entered_quantity"?: number | null,"entered_unit_id"?: string | null,"id"?: string,"item_id": string,"lot_id"?: string | null,"memo"?: string | null,"occurred_at"?: string,"purchase_order_line_id"?: string | null,"quantity": number,"sale_record_id"?: string | null,"stock_count_id"?: string | null,"store_id": string,"type": Database["public"]['Enums']["movement_type"],"unit_cost"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"entered_quantity"?: number | null,"entered_unit_id"?: string | null,"id"?: string,"item_id"?: string,"lot_id"?: string | null,"memo"?: string | null,"occurred_at"?: string,"purchase_order_line_id"?: string | null,"quantity"?: number,"sale_record_id"?: string | null,"stock_count_id"?: string | null,"store_id"?: string,"type"?: Database["public"]['Enums']["movement_type"],"unit_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_created_by_profiles_id_fk"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_entered_unit_id_item_units_id_fk"
      columns: ["entered_unit_id"]
isOneToOne: false
      referencedRelation: "item_units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_movements_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_lot_id_stock_lots_id_fk"
      columns: ["lot_id"]
isOneToOne: false
      referencedRelation: "lot_stock_levels"
      referencedColumns: ["lot_id"]
    },{
      foreignKeyName: "stock_movements_lot_id_stock_lots_id_fk"
      columns: ["lot_id"]
isOneToOne: false
      referencedRelation: "stock_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_purchase_order_line_id_purchase_order_lines_id_"
      columns: ["purchase_order_line_id"]
isOneToOne: false
      referencedRelation: "purchase_order_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_sale_record_id_sale_records_id_fk"
      columns: ["sale_record_id"]
isOneToOne: false
      referencedRelation: "sale_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_stock_count_id_stock_counts_id_fk"
      columns: ["stock_count_id"]
isOneToOne: false
      referencedRelation: "stock_counts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"store_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"created_by": string | null,"email": string | null,"expires_at": string,"id": string,"role": Database["public"]['Enums']["member_role"],"store_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"expires_at"?: string,"id"?: string,"role": Database["public"]['Enums']["member_role"],"store_id": string,"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"expires_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["member_role"],"store_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "store_invitations_accepted_by_profiles_id_fk"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "store_invitations_created_by_profiles_id_fk"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "store_invitations_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"store_members": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["member_role"],"store_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role": Database["public"]['Enums']["member_role"],"store_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"store_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "store_members_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "store_members_user_id_profiles_id_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stores": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"target_cost_rate": number,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"target_cost_rate"?: number,"timezone"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"target_cost_rate"?: number,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"suppliers": {
                  Row: {
                    "archived_at": string | null,"contact_name": string | null,"created_at": string,"email": string | null,"id": string,"memo": string | null,"name": string,"phone": string | null,"store_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"contact_name"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"memo"?: string | null,"name": string,"phone"?: string | null,"store_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"contact_name"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"memo"?: string | null,"name"?: string,"phone"?: string | null,"store_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "item_cost_changes": {
                  Row: {
                    "changed_at": string | null,"item_id": string | null,"previous_unit_cost": number | null,"store_id": string | null,"unit_cost": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_movements_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"item_latest_costs": {
                  Row: {
                    "item_id": string | null,"received_at": string | null,"store_id": string | null,"unit_cost": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_movements_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"item_stock_levels": {
                  Row: {
                    "is_low": boolean | null,"item_id": string | null,"quantity": number | null,"store_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "items_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"lot_stock_levels": {
                  Row: {
                    "expires_on": string | null,"item_id": string | null,"lot_id": string | null,"quantity": number | null,"store_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "stock_lots_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_lots_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_lots_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_import_summaries": {
                  Row: {
                    "amount": number | null,"first_sold_at": string | null,"import_id": string | null,"last_sold_at": string | null,"quantity": number | null,"sale_count": number | null,"store_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "sale_imports_store_id_stores_id_fk"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_count_line_books": {
                  Row: {
                    "book_quantity": number | null,"item_id": string | null,"stock_count_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "stock_count_lines_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_count_lines_item_id_items_id_fk"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_count_lines_stock_count_id_stock_counts_id_fk"
      columns: ["stock_count_id"]
isOneToOne: false
      referencedRelation: "stock_counts"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"apply_store_template":
{ Args: { "p_store_id": string,"p_template": Json }; Returns: Json
                           },
"change_purchase_order_status":
{ Args: { "p_order_id": string,"p_status": Database["public"]['Enums']["purchase_order_status"] }; Returns: Database["public"]['Enums']["purchase_order_status"]
                           },
"complete_stock_count":
{ Args: { "p_stock_count_id": string }; Returns: number
                           },
"create_store":
{ Args: { "p_name": string }; Returns: string
                           },
"get_invitation":
{ Args: { "p_token": string }; Returns: {
              "expires_at": string,"is_valid": boolean,"role": Database["public"]['Enums']["member_role"],"store_name": string
            }[]
                           },
"has_store_role":
{ Args: { "p_roles": (Database["public"]['Enums']["member_role"])[],"p_store_id": string }; Returns: boolean
                           },
"import_sales":
{ Args: { "p_import_id": string,"p_rows": Json }; Returns: number
                           },
"is_store_admin":
{ Args: { "p_store_id": string }; Returns: boolean
                           },
"is_store_member":
{ Args: { "p_store_id": string }; Returns: boolean
                           },
"menu_sales_summary":
{ Args: { "p_from": string,"p_store_id": string,"p_to": string }; Returns: {
              "amount": number,"menu_id": string,"option_ids": (string)[],"quantity": number
            }[]
                           },
"receive_purchase_order":
{ Args: { "p_lines": Json,"p_order_id": string }; Returns: Database["public"]['Enums']["purchase_order_status"]
                           },
"record_sales":
{ Args: { "p_lines": Json,"p_sold_at"?: string }; Returns: number
                           },
"record_stock_movement":
{ Args: { "p_expires_on"?: string,"p_item_id": string,"p_memo"?: string,"p_quantity": number,"p_type": Database["public"]['Enums']["movement_type"],"p_unit_id"?: string,"p_unit_price"?: number }; Returns: number
                           },
"sale_ingredients":
{ Args: { "p_menu_id": string,"p_option_ids": (string)[] }; Returns: {
              "item_id": string,"quantity": number
            }[]
                           },
"start_stock_count":
{ Args: { "p_category_id"?: string,"p_memo"?: string,"p_store_id": string }; Returns: string
                           },
"stock_outflow":
{ Args: { "p_created_by": string,"p_factor": number,"p_item_id": string,"p_memo": string,"p_occurred_at": string,"p_quantity": number,"p_sale_record_id"?: string,"p_stock_count_id"?: string,"p_type": Database["public"]['Enums']["movement_type"],"p_unit_id": string }; Returns: number
                           },
"stock_usage_summary":
{ Args: { "p_from": string,"p_store_id": string,"p_to": string }; Returns: {
              "consumed": number,"count_adjusted": number,"counted": boolean,"item_id": string,"manual_adjusted": number,"received": number,"sold": number,"wasted": number
            }[]
                           }
          }
          Enums: {
            "base_unit": "g"|"ml"|"ea","member_role": "owner"|"manager"|"staff","movement_type": "receive"|"consume"|"sale"|"waste"|"adjust","option_rule_kind": "scale"|"replace"|"add","purchase_order_status": "draft"|"ordered"|"partially_received"|"received"|"cancelled","sale_source": "manual"|"csv"|"pos","stock_count_status": "in_progress"|"completed"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "base_unit": ["g", "ml", "ea"],"member_role": ["owner", "manager", "staff"],"movement_type": ["receive", "consume", "sale", "waste", "adjust"],"option_rule_kind": ["scale", "replace", "add"],"purchase_order_status": ["draft", "ordered", "partially_received", "received", "cancelled"],"sale_source": ["manual", "csv", "pos"],"stock_count_status": ["in_progress", "completed", "cancelled"]
          }
        }
} as const
