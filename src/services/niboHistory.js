import { config } from '../lib/config.js';
import {
  compactText,
  getClientPhone,
  getClientKey,
  getProductKey,
  normalizePhone,
  parseDate,
  toNumber
} from './niboImport.js';
import { normalizeProductQuery } from './productResolution.js';

const DEFAULT_PAGE_SIZE = 1000;
const RECENT_ORDER_DAYS = 3;

async function fetchNiboOrdersByPhone(phone, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!config.niboApiKey) {
    throw new Error('NIBO_API_KEY is required');
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return [];
  }

  const phoneQueries = [normalizedPhone];
  if (normalizedPhone.startsWith('40') && normalizedPhone.length === 11) {
    phoneQueries.push(`0${normalizedPhone.slice(2)}`);
  }

  const ordersById = new Map();
  let offset = 0;

  for (const phoneQuery of phoneQueries) {
    offset = 0;
    while (true) {
      const url = new URL(config.niboApiUrl);
      url.searchParams.set('key', config.niboApiKey);
      url.searchParams.set('email', '');
      url.searchParams.set('phone', phoneQuery);
      url.searchParams.set('name', '');
      url.searchParams.set('cod_erp', '');
      url.searchParams.set('limit', String(pageSize));
      url.searchParams.set('offset', String(offset));

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Nibo API returned ${response.status}`);
      }

      const body = await response.json();
      if (!body.success) {
        throw new Error('Nibo API returned success=false');
      }

      const pageOrders = body.data ?? [];
      for (const order of pageOrders) {
        ordersById.set(compactText(order.order_id), order);
      }

      if (pageOrders.length < pageSize) {
        break;
      }

      offset += pageSize;
    }
  }

  return [...ordersById.values()];
}

function buildUniqueProducts(orders) {
  const productsByCode = new Map();

  for (const order of orders) {
    const orderedAt = parseDate(order.created_at) ?? parseDate(order.updated_at);

    for (const item of order.items ?? []) {
      const productCode = getProductKey(item);
      if (!productCode) {
        continue;
      }

      const existing = productsByCode.get(productCode);
      const quantity = toNumber(item.quantity);
      const productName = compactText(item.product_name) || productCode;

      if (!existing) {
        productsByCode.set(productCode, {
          source: 'nibo',
          normalized_query: normalizeProductQuery(productName),
          product_id: compactText(item.product_id) || null,
          product_code: productCode,
          product_name: productName,
          unit: compactText(item.unit) || null,
          first_ordered_at: orderedAt,
          last_ordered_at: orderedAt,
          times_ordered: 1,
          total_quantity: quantity
        });
        continue;
      }

      existing.first_ordered_at =
        orderedAt && (!existing.first_ordered_at || new Date(orderedAt) < new Date(existing.first_ordered_at))
          ? orderedAt
          : existing.first_ordered_at;
      existing.last_ordered_at =
        orderedAt && (!existing.last_ordered_at || new Date(orderedAt) > new Date(existing.last_ordered_at))
          ? orderedAt
          : existing.last_ordered_at;
      existing.times_ordered += 1;
      existing.total_quantity += quantity;
    }
  }

  return [...productsByCode.values()].sort((a, b) =>
    String(a.product_name).localeCompare(String(b.product_name))
  );
}

function buildRecentOrders(orders) {
  const cutoff = Date.now() - RECENT_ORDER_DAYS * 24 * 60 * 60 * 1000;

  return orders
    .filter((order) => {
      const orderDate = parseDate(order.created_at) ?? parseDate(order.updated_at);
      return orderDate && new Date(orderDate).getTime() >= cutoff;
    })
    .map((order) => ({
      order_id: compactText(order.order_id),
      source_id: compactText(order.source_id) || null,
      status: compactText(order.status) || null,
      created_at: parseDate(order.created_at),
      updated_at: parseDate(order.updated_at),
      items: (order.items ?? []).map((item) => ({
        product_id: compactText(item.product_id) || null,
        product_code: getProductKey(item),
        product_name: compactText(item.product_name) || getProductKey(item),
        quantity: toNumber(item.quantity),
        unit: compactText(item.unit) || null
      }))
    }))
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
}

function serializeClient(order) {
  const client = order.client ?? {};
  const phone = getClientPhone(client);

  return {
    erp_code: getClientKey(order),
    client_id: compactText(order.client_id) || getClientKey(order),
    name: compactText(client.name) || null,
    phone,
    normalized_phone: normalizePhone(phone),
    email: compactText(client.email) || null,
    city: compactText(client.city) || null,
    county: compactText(client.county) || null,
    address: compactText(client.address) || null
  };
}

export async function getNiboHistoryForPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  const orders = await fetchNiboOrdersByPhone(normalizedPhone);
  const client = orders[0] ? serializeClient(orders[0]) : null;

  return {
    source: 'nibo',
    lookup_phone: phone,
    normalized_phone: normalizedPhone,
    client_found: Boolean(client),
    client,
    orders_found: orders.length,
    unique_products: buildUniqueProducts(orders),
    recent_orders: buildRecentOrders(orders)
  };
}
