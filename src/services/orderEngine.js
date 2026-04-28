import { getMessagesForSenderToday } from '../db/messagesRepo.js';
import {
  getOrderForSenderToday,
  insertInterpretationRecord,
  upsertOrderSnapshot
} from '../db/ordersRepo.js';
import { getProductCategories } from '../db/productCategoriesRepo.js';
import { getProducts } from '../db/productsRepo.js';
import { buildOrderFromWhatsAppMessage } from '../order-agent/orderBuilder.js';
import { MOCK_PRODUCT_CATALOG, searchProductCatalog } from '../order-agent/mockProductSearch.js';

function messageTextForOrderBuilder(messages) {
  return messages
    .map((message) => message.message_text)
    .filter(Boolean)
    .join(', ');
}

function previousOrderProductsFromExistingOrder(existingOrder) {
  return (Array.isArray(existingOrder) ? existingOrder : [])
    .filter((item) => item?.productId && item?.name && item?.unit)
    .map((item) => ({
      productId: item.productId,
      name: item.name,
      brand: item.brand,
      category: item.category,
      unit: item.unit,
      packageSize: item.packageSize,
      lastOrderedQuantity: item.quantity
    }));
}

function buildActionsFromOrderOutput(orderOutput, messages) {
  const sourceMessageId = messages.at(-1)?.id ? String(messages.at(-1).id) : null;
  return [
    {
      type: 'create_order',
      product: null,
      quantity: null,
      unit: null,
      source_message_id: sourceMessageId,
      reason: 'Built structured order with history matching and fallback product search.'
    },
    ...(orderOutput.actions ?? []).map((action) => ({
      type: action.type,
      product: action.product,
      quantity: action.quantity,
      unit: action.unit,
      source_message_id: sourceMessageId,
      reason: action.reason
    }))
  ];
}

function buildSummary(orderOutput) {
  if (orderOutput.items.length === 0) {
    return 'No matching products found.';
  }

  const itemSummary = orderOutput.items
    .map((item) => `${item.quantity} ${item.unit} ${item.name}`)
    .join(', ');

  return `Created structured order with ${itemSummary}.`;
}

async function getProductsWithMockFallback(notes) {
  try {
    const products = await getProducts();
    if (products.length > 0) {
      return products;
    }

    notes.push('No products found in Supabase products table; used mock product catalog.');
    return MOCK_PRODUCT_CATALOG;
  } catch (error) {
    notes.push(`${error.message}; used mock product catalog.`);
    return MOCK_PRODUCT_CATALOG;
  }
}

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
  const productCategories = await getProductCategories();
  const notes = [];
  const products = await getProductsWithMockFallback(notes);
  const channel = messages[messages.length - 1]?.channel ?? null;

  const orderOutput = await buildOrderFromWhatsAppMessage({
    customerId: String(senderId),
    message: messageTextForOrderBuilder(messages),
    previousOrderProducts: previousOrderProductsFromExistingOrder(existingOrder),
    // This endpoint recomputes the full current-day order from today's messages.
    // Do not seed with today's live snapshot, or old parse mistakes get replayed.
    initialOrderItems: [],
    productCategories,
    productCatalog: products,
    productSearch: async (query) => searchProductCatalog(query, products)
  });

  orderOutput.notes = [...(orderOutput.notes ?? []), ...notes];

  const aiResult = {
    summary: buildSummary(orderOutput),
    actions: buildActionsFromOrderOutput(orderOutput, messages),
    order: orderOutput.items,
    ambiguousItems: orderOutput.ambiguousItems ?? [],
    notes: orderOutput.notes ?? []
  };

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

  return {
    sender_id: senderId,
    messages_found: messages.length,
    order_id: orderRecord.id,
    interpretation_id: interpretationRecord.id,
    summary: aiResult.summary,
    order: aiResult.order,
    actions: aiResult.actions,
    ambiguousItems: aiResult.ambiguousItems,
    notes: aiResult.notes,
    product_categories_loaded: productCategories.length,
    products_loaded: products.length
  };
}
