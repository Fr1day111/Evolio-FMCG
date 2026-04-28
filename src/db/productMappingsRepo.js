import { supabase } from '../lib/supabase.js';
import { config } from '../lib/config.js';

const MAPPING_SELECT =
  'id, sender_id, source_product_name, normalized_query, parmashop_product_id, parmashop_sku, parmashop_name, parmashop_url, created_at, updated_at';

export async function getAllProductMappingsForSender(senderId) {
  if (!senderId) {
    return [];
  }

  const { data, error } = await supabase
    .from(config.productMappingsTable)
    .select(MAPPING_SELECT)
    .eq('sender_id', senderId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch product mappings: ${error.message}`);
  }

  return data ?? [];
}

export async function getProductMappingsForSender(senderId, normalizedQueries) {
  const queries = [...new Set((normalizedQueries ?? []).filter(Boolean))];
  if (!senderId || queries.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from(config.productMappingsTable)
    .select(MAPPING_SELECT)
    .eq('sender_id', senderId)
    .in('normalized_query', queries);

  if (error) {
    throw new Error(`Failed to fetch product mappings: ${error.message}`);
  }

  return data ?? [];
}

export async function upsertProductMapping({
  senderId,
  sourceProductName,
  normalizedQuery,
  parmashopProductId,
  parmashopSku,
  parmashopName,
  parmashopUrl
}) {
  const payload = {
    sender_id: senderId,
    source_product_name: sourceProductName,
    normalized_query: normalizedQuery,
    parmashop_product_id: parmashopProductId,
    parmashop_sku: parmashopSku,
    parmashop_name: parmashopName,
    parmashop_url: parmashopUrl,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(config.productMappingsTable)
    .upsert(payload, {
      onConflict: 'sender_id,normalized_query'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert product mapping: ${error.message}`);
  }

  return data;
}
