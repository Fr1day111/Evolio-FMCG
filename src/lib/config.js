import 'dotenv/config';

function required(name, fallback = '') {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  openaiApiKey: required('OPENAI_API_KEY'),
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  sourceMessagesTable: process.env.SOURCE_MESSAGES_TABLE ?? 'messages',
  sourceEmailsTable: process.env.SOURCE_EMAILS_TABLE ?? 'email',
  ordersTable: process.env.ORDERS_TABLE ?? 'live_orders',
  emailOrdersTable: process.env.EMAIL_ORDERS_TABLE ?? 'live_email_orders',
  interpretationsTable:
    process.env.ORDER_INTERPRETATIONS_TABLE ?? 'order_message_interpretations',
  emailInterpretationsTable:
    process.env.EMAIL_INTERPRETATIONS_TABLE ?? 'email_order_interpretations'
};
