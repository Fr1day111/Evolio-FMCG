import {
  getProductMappingsForSender,
  upsertProductMapping
} from '../db/productMappingsRepo.js';
import { searchParmashopProducts } from './parmashopSearch.js';

export function normalizeProductQuery(productName) {
  return String(productName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function serializeMapping(mapping) {
  return {
    id: mapping.id,
    sender_id: mapping.sender_id,
    source_product_name: mapping.source_product_name,
    normalized_query: mapping.normalized_query,
    parmashop_product_id: mapping.parmashop_product_id,
    parmashop_sku: mapping.parmashop_sku,
    parmashop_name: mapping.parmashop_name,
    parmashop_url: mapping.parmashop_url,
    created_at: mapping.created_at,
    updated_at: mapping.updated_at
  };
}

export async function resolveOrderProducts({ senderId, order, knownProducts }) {
  const items = (order ?? [])
    .map((item) => ({
      orderItem: item,
      query:
        normalizeProductQuery(item.known_product_match?.normalized_query) ||
        normalizeProductQuery(item.product),
      proposedMatch: {
        matched: Boolean(item.known_product_match?.matched),
        normalized_query: normalizeProductQuery(
          item.known_product_match?.normalized_query
        ),
        confidence:
          typeof item.known_product_match?.confidence === 'number'
            ? item.known_product_match.confidence
            : null,
        reason: item.known_product_match?.reason ?? null
      }
    }))
    .filter((item) => item.query);

  if (items.length === 0) {
    return {
      known_items: [],
      new_items: []
    };
  }

  const proposedKnownQueries = items
    .filter((item) => item.proposedMatch.matched)
    .map((item) => item.proposedMatch.normalized_query)
    .filter(Boolean);
  const exactQueries = items.map((item) => item.query);
  const availableMappings =
    knownProducts ?? (await getProductMappingsForSender(senderId, [
      ...proposedKnownQueries,
      ...exactQueries
    ]));
  const missingQueries = [...new Set([...proposedKnownQueries, ...exactQueries])].filter(
    (query) => !availableMappings.some((mapping) => mapping.normalized_query === query)
  );
  const fetchedMissingMappings = await getProductMappingsForSender(senderId, missingQueries);
  const mappings = [...availableMappings, ...fetchedMissingMappings];
  const mappingsByQuery = new Map(
    mappings.map((mapping) => [mapping.normalized_query, mapping])
  );

  const knownItems = [];
  const newItemInputs = [];

  for (const item of items) {
    const proposedMapping = item.proposedMatch.matched
      ? mappingsByQuery.get(item.proposedMatch.normalized_query)
      : null;
    const mapping = proposedMapping ?? mappingsByQuery.get(item.query);
    if (mapping) {
      knownItems.push({
        order_item: item.orderItem,
        ai_match: item.proposedMatch,
        mapping: serializeMapping(mapping)
      });
    } else {
      newItemInputs.push(item);
    }
  }

  const newItems = await Promise.all(
    newItemInputs.map(async (item) => {
      try {
        const searchResult = await searchParmashopProducts(item.query);

        return {
          order_item: item.orderItem,
          search_query: item.query,
          search_method: searchResult.method,
          ...(searchResult.http_error ? { http_error: searchResult.http_error } : {}),
          candidates: searchResult.products
        };
      } catch (error) {
        return {
          order_item: item.orderItem,
          search_query: item.query,
          search_method: null,
          search_error: error.message,
          candidates: []
        };
      }
    })
  );

  return {
    known_items: knownItems,
    new_items: newItems
  };
}

export async function saveProductMapping(input) {
  const senderId = String(input.sender_id ?? '').trim();
  const sourceProductName = String(input.source_product_name ?? '').trim();
  const normalizedQuery =
    normalizeProductQuery(input.normalized_query) ||
    normalizeProductQuery(sourceProductName);
  const parmashopProductId = String(input.parmashop_product_id ?? '').trim();
  const parmashopSku = String(input.parmashop_sku ?? '').trim();
  const parmashopName = String(input.parmashop_name ?? '').trim();
  const parmashopUrl = String(input.parmashop_url ?? '').trim();

  if (!senderId) {
    throw new Error('sender_id is required');
  }
  if (!sourceProductName) {
    throw new Error('source_product_name is required');
  }
  if (!normalizedQuery) {
    throw new Error('normalized_query is required');
  }
  if (!parmashopProductId) {
    throw new Error('parmashop_product_id is required');
  }
  if (!parmashopName) {
    throw new Error('parmashop_name is required');
  }
  if (!parmashopUrl) {
    throw new Error('parmashop_url is required');
  }

  return upsertProductMapping({
    senderId,
    sourceProductName,
    normalizedQuery,
    parmashopProductId,
    parmashopSku: parmashopSku || null,
    parmashopName,
    parmashopUrl
  });
}
