import { getMessagesForSenderToday } from '../db/messagesRepo.js';
import {
  getOrderForSenderToday,
  insertInterpretationRecord,
  upsertOrderSnapshot
} from '../db/ordersRepo.js';
import { getAllProductMappingsForSender } from '../db/productMappingsRepo.js';
import { interpretOrderFromMessages } from './aiInterpreter.js';
import { getNiboHistoryForPhone } from './niboHistory.js';
import { resolveOrderProducts } from './productResolution.js';

export async function processSenderOrderDay(senderId) {
  if (!senderId) {
    throw new Error('sender_id is required');
  }

  const messages = await getMessagesForSenderToday(senderId);
  if (messages.length === 0) {
    return {
      sender_id: senderId,
      messages_found: 0,
      order: [],
      summary: 'No messages found for sender today.'
    };
  }

  const existingOrderRecord = await getOrderForSenderToday(senderId);
  const existingOrder = existingOrderRecord?.order_json ?? [];
  const channel = messages[messages.length - 1]?.channel ?? null;

  // Legacy Supabase-confirmed product history is intentionally kept available,
  // but the active WhatsApp flow now uses live Nibo history by phone.
  const legacyKnownProducts = await getAllProductMappingsForSender(senderId);
  const niboHistory = await getNiboHistoryForPhone(senderId);
  const knownProducts = niboHistory.unique_products;

  // Recompute the authoritative order from the full day history on every hit.
  const aiResult = await interpretOrderFromMessages({
    senderId,
    existingOrder,
    knownProducts,
    recentOrders: niboHistory.recent_orders,
    customerHistory: {
      source: niboHistory.source,
      client_found: niboHistory.client_found,
      client: niboHistory.client,
      orders_found: niboHistory.orders_found,
      unique_products_count: niboHistory.unique_products.length,
      recent_orders_count: niboHistory.recent_orders.length
    },
    messages
  });

  const orderRecord = await upsertOrderSnapshot({
    senderId,
    channel,
    order: aiResult.order,
    summary: aiResult.summary,
    sourceMessageIds: messages.map((message) => String(message.id))
  });

  const interpretationRecord = await insertInterpretationRecord({
    senderId,
    channel,
    orderId: orderRecord.id,
    sourceMessages: messages,
    aiResult
  });
  const productResolution = await resolveOrderProducts({
    senderId,
    order: aiResult.order,
    knownProducts,
    useSupabaseFallback: false
  });

  return {
    sender_id: senderId,
    messages_found: messages.length,
    customer_history: {
      source: niboHistory.source,
      client_found: niboHistory.client_found,
      client: niboHistory.client,
      orders_found: niboHistory.orders_found,
      unique_products_count: niboHistory.unique_products.length,
      recent_orders_count: niboHistory.recent_orders.length,
      legacy_supabase_products_available: legacyKnownProducts.length
    },
    order_id: orderRecord.id,
    interpretation_id: interpretationRecord.id,
    summary: aiResult.summary,
    order: aiResult.order,
    actions: aiResult.actions,
    product_resolution: productResolution
  };
}
