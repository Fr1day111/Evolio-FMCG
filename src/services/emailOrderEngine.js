import { getEmailsForSenderToday } from '../db/emailsRepo.js';
import {
  getEmailOrderForSenderToday,
  insertEmailInterpretationRecord,
  upsertEmailOrderSnapshot
} from '../db/ordersRepo.js';
import { interpretOrderFromMessages } from './aiInterpreter.js';

export async function processSenderEmailOrderDay(senderId) {
  if (!senderId) {
    throw new Error('sender_id is required');
  }

  const emails = await getEmailsForSenderToday(senderId);
  if (emails.length === 0) {
    return {
      sender_id: senderId,
      emails_found: 0,
      order: [],
      summary: 'No emails found for sender today.'
    };
  }

  const existingOrderRecord = await getEmailOrderForSenderToday(senderId);
  const existingOrder = existingOrderRecord?.order_json ?? [];
  const channel = 'email';

  const aiResult = await interpretOrderFromMessages({
    senderId,
    existingOrder,
    messages: emails
  });

  const orderRecord = await upsertEmailOrderSnapshot({
    senderId,
    channel,
    order: aiResult.order,
    summary: aiResult.summary,
    sourceMessageIds: emails.map((email) => String(email.id))
  });

  const interpretationRecord = await insertEmailInterpretationRecord({
    senderId,
    channel,
    orderId: orderRecord.id,
    sourceMessages: emails,
    aiResult
  });

  return {
    sender_id: senderId,
    emails_found: emails.length,
    order_id: orderRecord.id,
    interpretation_id: interpretationRecord.id,
    summary: aiResult.summary,
    order: aiResult.order,
    actions: aiResult.actions
  };
}
