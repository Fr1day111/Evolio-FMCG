import { supabase } from '../lib/supabase.js';
import { config } from '../lib/config.js';

function businessDateUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function getOrderForSenderToday(senderId) {
  const { data, error } = await supabase
    .from(config.ordersTable)
    .select('*')
    .eq('sender_id', senderId)
    .eq('business_date', businessDateUtc())
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch order: ${error.message}`);
  }

  return data;
}

export async function upsertOrderSnapshot({ senderId, channel, order, summary, sourceMessageIds }) {
  const payload = {
    sender_id: senderId,
    channel,
    business_date: businessDateUtc(),
    order_json: order,
    summary,
    source_message_ids: sourceMessageIds,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(config.ordersTable)
    .upsert(payload, {
      onConflict: 'sender_id,business_date'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert order snapshot: ${error.message}`);
  }

  return data;
}

export async function insertInterpretationRecord({
  senderId,
  channel,
  orderId,
  sourceMessages,
  aiResult
}) {
  const payload = {
    sender_id: senderId,
    channel,
    order_id: orderId,
    source_message_ids: sourceMessages.map((message) => String(message.id)),
    source_messages_json: sourceMessages,
    ai_summary: aiResult.summary,
    ai_actions_json: aiResult.actions,
    resulting_order_json: aiResult.order,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(config.interpretationsTable)
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store interpretation record: ${error.message}`);
  }

  return data;
}
