import { getMessagesForSenderToday } from '../db/messagesRepo.js';
import {
  getOrderForSenderToday,
  insertInterpretationRecord,
  upsertOrderSnapshot
} from '../db/ordersRepo.js';
import { interpretOrderFromMessages } from './aiInterpreter.js';

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

  // Recompute the authoritative order from the full day history on every hit.
  const aiResult = await interpretOrderFromMessages({
    senderId,
    existingOrder,
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

  return {
    sender_id: senderId,
    messages_found: messages.length,
    order_id: orderRecord.id,
    interpretation_id: interpretationRecord.id,
    summary: aiResult.summary,
    order: aiResult.order,
    actions: aiResult.actions
  };
}
