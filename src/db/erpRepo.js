import { supabase } from '../lib/supabase.js';

const UPSERT_CHUNK_SIZE = 500;

async function upsertMany(tableName, rows, onConflict) {
  if (!rows.length) {
    return [];
  }

  const results = [];
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);
    const { data, error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict })
      .select();

    if (error) {
      throw new Error(`Failed to upsert ${tableName}: ${error.message}`);
    }

    results.push(...(data ?? []));
  }

  return results;
}

export async function upsertErpClients(clients) {
  return upsertMany('erp_clients', clients, 'erp_code');
}

export async function upsertErpOrders(orders) {
  return upsertMany('erp_orders', orders, 'order_id');
}

export async function upsertErpOrderItems(items) {
  return upsertMany('erp_order_items', items, 'order_id,product_code');
}

export async function upsertErpClientProducts(products) {
  return upsertMany('erp_client_products', products, 'erp_code,product_code');
}
