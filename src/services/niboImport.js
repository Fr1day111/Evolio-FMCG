import { config } from '../lib/config.js';
import {
  upsertErpClientProducts,
  upsertErpClients,
  upsertErpOrderItems,
  upsertErpOrders
} from '../db/erpRepo.js';

export function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    return `40${digits.slice(1)}`;
  }

  return digits;
}

export function getClientPhone(client) {
  const directPhone = compactText(client?.phone);
  if (directPhone) {
    return directPhone;
  }

  const contact = (client?.contacts ?? []).find((entry) =>
    compactText(entry?.phone ?? entry?.telefon ?? entry?.mobile ?? entry?.tel)
  );

  return contact
    ? compactText(contact.phone ?? contact.telefon ?? contact.mobile ?? contact.tel)
    : null;
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getClientKey(order) {
  const client = order.client ?? {};
  return compactText(order.client_id) || compactText(client.erp_code);
}

export function getProductKey(item) {
  return compactText(item.product_code) || compactText(item.product_id) || compactText(item.product_name);
}

function serializeClient(order) {
  const client = order.client ?? {};
  const erpCode = getClientKey(order);
  const phone = getClientPhone(client);

  return {
    erp_code: erpCode,
    client_id: compactText(order.client_id) || erpCode,
    company_id: client.company_id ?? null,
    erp_partner_id: compactText(client.erp_partner_id) || null,
    name: compactText(client.name) || null,
    cui: compactText(client.cui) || null,
    phone,
    normalized_phone: normalizePhone(phone),
    email: compactText(client.email) || null,
    contact_person: compactText(client.contact_person) || null,
    address: compactText(client.address) || null,
    city: compactText(client.city) || null,
    county: compactText(client.county) || null,
    raw_client_json: client,
    last_seen_at: parseDate(order.updated_at) ?? parseDate(order.created_at),
    updated_at: new Date().toISOString()
  };
}

function serializeOrder(order) {
  const erpCode = getClientKey(order);

  return {
    order_id: compactText(order.order_id),
    source_id: compactText(order.source_id) || null,
    erp_code: erpCode,
    client_id: compactText(order.client_id) || erpCode,
    status: compactText(order.status) || null,
    order_created_at: parseDate(order.created_at),
    order_updated_at: parseDate(order.updated_at),
    raw_order_json: order,
    updated_at: new Date().toISOString()
  };
}

function serializeOrderItems(order) {
  const erpCode = getClientKey(order);
  const orderId = compactText(order.order_id);

  return (order.items ?? [])
    .map((item) => {
      const productCode = getProductKey(item);
      if (!orderId || !erpCode || !productCode) {
        return null;
      }

      return {
        order_id: orderId,
        erp_code: erpCode,
        product_id: compactText(item.product_id) || null,
        product_code: productCode,
        product_name: compactText(item.product_name) || productCode,
        quantity: toNumber(item.quantity),
        unit: compactText(item.unit) || null,
        raw_item_json: item,
        updated_at: new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function mergeClient(existing, next) {
  return {
    ...existing,
    ...next,
    phone: next.phone ?? existing.phone,
    normalized_phone: next.normalized_phone ?? existing.normalized_phone,
    email: next.email ?? existing.email,
    name: next.name ?? existing.name,
    last_seen_at:
      !existing.last_seen_at || new Date(next.last_seen_at ?? 0) > new Date(existing.last_seen_at)
        ? next.last_seen_at
        : existing.last_seen_at
  };
}

function aggregateClientProduct(existing, order, item) {
  const orderedAt = parseDate(order.created_at) ?? parseDate(order.updated_at);
  const quantity = toNumber(item.quantity);

  if (!existing) {
    return {
      erp_code: getClientKey(order),
      product_id: compactText(item.product_id) || null,
      product_code: getProductKey(item),
      product_name: compactText(item.product_name) || getProductKey(item),
      unit: compactText(item.unit) || null,
      first_ordered_at: orderedAt,
      last_ordered_at: orderedAt,
      times_ordered: 1,
      total_quantity: quantity,
      raw_product_json: item,
      updated_at: new Date().toISOString()
    };
  }

  return {
    ...existing,
    product_id: existing.product_id ?? (compactText(item.product_id) || null),
    product_name: existing.product_name || compactText(item.product_name) || getProductKey(item),
    unit: existing.unit ?? (compactText(item.unit) || null),
    first_ordered_at:
      orderedAt && (!existing.first_ordered_at || new Date(orderedAt) < new Date(existing.first_ordered_at))
        ? orderedAt
        : existing.first_ordered_at,
    last_ordered_at:
      orderedAt && (!existing.last_ordered_at || new Date(orderedAt) > new Date(existing.last_ordered_at))
        ? orderedAt
        : existing.last_ordered_at,
    times_ordered: existing.times_ordered + 1,
    total_quantity: existing.total_quantity + quantity,
    updated_at: new Date().toISOString()
  };
}

async function fetchNiboPage({ limit, offset }) {
  if (!config.niboApiKey) {
    throw new Error('NIBO_API_KEY is required');
  }

  const url = new URL(config.niboApiUrl);
  url.searchParams.set('key', config.niboApiKey);
  url.searchParams.set('email', '');
  url.searchParams.set('phone', '');
  url.searchParams.set('name', '');
  url.searchParams.set('cod_erp', '');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Nibo API returned ${response.status}`);
  }

  const body = await response.json();
  if (!body.success) {
    throw new Error('Nibo API returned success=false');
  }

  return body;
}

export async function importNiboOrders({ pageSize = 1000, maxPages = null, offset = 0 } = {}) {
  const clientsByErpCode = new Map();
  const ordersByOrderId = new Map();
  const orderItemsByKey = new Map();
  const clientProductsByKey = new Map();
  let totalFetched = 0;
  let currentOffset = offset;
  let pagesFetched = 0;

  while (true) {
    const page = await fetchNiboPage({ limit: pageSize, offset: currentOffset });
    const orders = page.data ?? [];
    totalFetched += orders.length;
    pagesFetched += 1;

    for (const order of orders) {
      const erpCode = getClientKey(order);
      const orderId = compactText(order.order_id);
      if (!erpCode || !orderId) {
        continue;
      }

      const clientRow = serializeClient(order);
      clientsByErpCode.set(
        erpCode,
        clientsByErpCode.has(erpCode)
          ? mergeClient(clientsByErpCode.get(erpCode), clientRow)
          : clientRow
      );
      ordersByOrderId.set(orderId, serializeOrder(order));

      for (const itemRow of serializeOrderItems(order)) {
        orderItemsByKey.set(`${itemRow.order_id}:${itemRow.product_code}`, itemRow);
      }

      for (const item of order.items ?? []) {
        const productCode = getProductKey(item);
        if (!productCode) {
          continue;
        }

        const key = `${erpCode}:${productCode}`;
        clientProductsByKey.set(
          key,
          aggregateClientProduct(clientProductsByKey.get(key), order, item)
        );
      }
    }

    if (orders.length < pageSize || (maxPages && pagesFetched >= maxPages)) {
      break;
    }

    currentOffset += pageSize;
  }

  const clients = [...clientsByErpCode.values()];
  const orders = [...ordersByOrderId.values()];
  const orderItems = [...orderItemsByKey.values()];
  const clientProducts = [...clientProductsByKey.values()];

  await upsertErpClients(clients);
  await upsertErpOrders(orders);
  await upsertErpOrderItems(orderItems);
  await upsertErpClientProducts(clientProducts);

  return {
    pages_fetched: pagesFetched,
    orders_fetched: totalFetched,
    clients_upserted: clients.length,
    orders_upserted: orders.length,
    order_items_upserted: orderItems.length,
    client_products_upserted: clientProducts.length
  };
}
