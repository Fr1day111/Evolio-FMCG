import { openai } from '../lib/openai.js';
import { config } from '../lib/config.js';
import {
  ORDER_INTERPRETER_PROMPT,
  ORDER_INTERPRETATION_SCHEMA
} from '../prompts/orderInterpreterPrompt.js';

export async function interpretOrderFromMessages({ senderId, existingOrder, messages }) {
  const payload = {
    sender_id: senderId,
    existing_order: existingOrder ?? [],
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
