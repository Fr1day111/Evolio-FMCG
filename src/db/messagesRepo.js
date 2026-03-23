import { supabase } from '../lib/supabase.js';
import { config } from '../lib/config.js';

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function endOfTodayUtc() {
  const start = startOfTodayUtc();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

function parseJsonValue(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return null;
}

function inferChannel(messagePayload) {
  if (!messagePayload || typeof messagePayload !== 'object') {
    return 'whatsapp';
  }

  return messagePayload.messaging_product ?? 'whatsapp';
}

function extractMessageText(messagePayload) {
  if (!messagePayload || typeof messagePayload !== 'object') {
    return '';
  }

  if (typeof messagePayload.text?.body === 'string') {
    return messagePayload.text.body;
  }

  if (typeof messagePayload.button?.text === 'string') {
    return messagePayload.button.text;
  }

  if (typeof messagePayload.interactive?.button_reply?.title === 'string') {
    return messagePayload.interactive.button_reply.title;
  }

  if (typeof messagePayload.interactive?.list_reply?.title === 'string') {
    return messagePayload.interactive.list_reply.title;
  }

  return '';
}

function normalizeMessageRow(row) {
  const rawPayload = parseJsonValue(row.message);
  const senderDetail = parseJsonValue(row.sender_detail);

  return {
    id: row.id,
    sender_id: String(row.sender_id),
    channel: inferChannel(rawPayload),
    message_text: extractMessageText(rawPayload),
    inserted_at: row.created_at,
    raw_payload: rawPayload,
    sender_detail: senderDetail
  };
}

export async function getMessagesForSenderToday(senderId) {
  const start = startOfTodayUtc().toISOString();
  const end = endOfTodayUtc().toISOString();

  const { data, error } = await supabase
    .from(config.sourceMessagesTable)
    .select('id, sender_id, sender_detail, message, created_at')
    .eq('sender_id', senderId)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch daily messages: ${error.message}`);
  }

  return (data ?? []).map(normalizeMessageRow);
}
