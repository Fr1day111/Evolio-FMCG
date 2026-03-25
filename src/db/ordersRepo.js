import { supabase } from '../lib/supabase.js';
import { config } from '../lib/config.js';

function businessDateUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function getOrderForSenderTodayFromTable(senderId, tableName) {
  const { data, error } = await supabase
    .from(tableName)
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

async function upsertOrderSnapshotToTable({
  senderId,
  channel,
  order,
  summary,
  sourceMessageIds,
  tableName
}) {
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
    .from(tableName)
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

async function insertInterpretationRecordToTable({
  senderId,
  channel,
  orderId,
  sourceMessages,
  aiResult,
  tableName
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
    .from(tableName)
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store interpretation record: ${error.message}`);
  }

  return data;
}

export async function getOrderForSenderToday(senderId) {
  return getOrderForSenderTodayFromTable(senderId, config.ordersTable);
}

export async function getEmailOrderForSenderToday(senderId) {
  return getOrderForSenderTodayFromTable(senderId, config.emailOrdersTable);
}

export async function upsertOrderSnapshot(params) {
  return upsertOrderSnapshotToTable({
    ...params,
    tableName: config.ordersTable
  });
}

export async function upsertEmailOrderSnapshot(params) {
  return upsertOrderSnapshotToTable({
    ...params,
    tableName: config.emailOrdersTable
  });
}

export async function insertInterpretationRecord(params) {
  return insertInterpretationRecordToTable({
    ...params,
    tableName: config.interpretationsTable
  });
}

export async function insertEmailInterpretationRecord(params) {
  return insertInterpretationRecordToTable({
    ...params,
    tableName: config.emailInterpretationsTable
  });
}
