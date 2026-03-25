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
  sourceMessagesTable: process.env.SOURCE_MESSAGES_TABLE ?? 'customer_messages',
  ordersTable: process.env.ORDERS_TABLE ?? 'live_orders',
  interpretationsTable:
    process.env.ORDER_INTERPRETATIONS_TABLE ?? 'order_message_interpretations'
};
