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

function normalizeEmailRow(row) {
  const subject = typeof row.subject === 'string' ? row.subject.trim() : '';
  const body = typeof row.body === 'string' ? row.body.trim() : '';
  const subjectLine = subject ? `Subject: ${subject}` : '';
  const bodyLine = body ? `Body: ${body}` : '';

  return {
    id: row.id,
    sender_id: String(row.sender),
    channel: 'email',
    message_text: [subjectLine, bodyLine].filter(Boolean).join('\n'),
    inserted_at: row.created_at,
    raw_payload: {
      subject: row.subject ?? null,
      body: row.body ?? null,
      receiver: row.receiver ?? null
    },
    sender_detail: null
  };
}

export async function getEmailsForSenderToday(senderId) {
  const start = startOfTodayUtc().toISOString();
  const end = endOfTodayUtc().toISOString();

  const { data, error } = await supabase
    .from(config.sourceEmailsTable)
    .select('id, sender, subject, body, receiver, created_at')
    .eq('sender', senderId)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch daily emails: ${error.message}`);
  }

  return (data ?? []).map(normalizeEmailRow);
}
