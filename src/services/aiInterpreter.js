import { openai } from '../lib/openai.js';
import { config } from '../lib/config.js';
import {
  ORDER_INTERPRETER_PROMPT,
  ORDER_INTERPRETATION_SCHEMA
} from '../prompts/orderInterpreterPrompt.js';

function serializeKnownProduct(mapping) {
  return {
    source: mapping.source ?? 'supabase',
    normalized_query: mapping.normalized_query,
    source_product_name: mapping.source_product_name,
    parmashop_product_id: mapping.parmashop_product_id,
    parmashop_sku: mapping.parmashop_sku,
    parmashop_name: mapping.parmashop_name,
    parmashop_url: mapping.parmashop_url,
    product_id: mapping.product_id,
    product_code: mapping.product_code,
    product_name: mapping.product_name,
    unit: mapping.unit,
    first_ordered_at: mapping.first_ordered_at,
    last_ordered_at: mapping.last_ordered_at,
    times_ordered: mapping.times_ordered,
    total_quantity: mapping.total_quantity
  };
}

export async function interpretOrderFromMessages({
  senderId,
  existingOrder,
  messages,
  knownProducts,
  recentOrders,
  customerHistory
}) {
  const payload = {
    sender_id: senderId,
    existing_order: existingOrder ?? [],
    known_products: (knownProducts ?? []).map(serializeKnownProduct),
    recent_orders: recentOrders ?? [],
    customer_history: customerHistory ?? null,
    messages: messages.map((message) => ({
      source_message_id: String(message.id),
      channel: message.channel ?? null,
      text: message.message_text ?? '',
      inserted_at: message.inserted_at
    }))
  };

  const completion = await openai.chat.completions.create({
    model: config.openaiModel,
    response_format: {
      type: 'json_schema',
      json_schema: ORDER_INTERPRETATION_SCHEMA
    },
    messages: [
      {
        role: 'system',
        content: ORDER_INTERPRETER_PROMPT
      },
      {
        role: 'user',
        content: JSON.stringify(payload)
      }
    ]
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI did not return structured content');
  }

  return JSON.parse(content);
}
