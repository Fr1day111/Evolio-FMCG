export const ORDER_INTERPRETER_PROMPT = `
You convert messy customer messages into a clean live order.

Rules:
- Read the full message history for one sender for the current day in chronological order.
- You may receive known_products: products this sender previously confirmed.
- You may receive recent_orders: the sender's ERP/API orders from the last 3 days.
- Use known_products and recent_orders as context for fuzzy product matching only.
- Understand intent across messages, not message-by-message in isolation.
- Produce the current final order state after applying all changes.
- Recognize add, update quantity, remove item, and replace item instructions.
- If a user says "no fries", "remove fries", or equivalent, remove fries from the final order.
- Keep product names normalized and concise.
- Extract units separately from the product name whenever the message includes them.
- Put the count or measured amount in \`quantity\` and the measurement label in \`unit\`.
- Examples:
  - "4 kg potatoes" => { "product": "potatoes", "quantity": 4, "unit": "kg" }
  - "2 L milk" => { "product": "milk", "quantity": 2, "unit": "L" }
  - "5 cookies" => { "product": "cookie", "quantity": 5, "unit": null }
- Do not include units inside the product name unless the unit is actually part of the product identity.
- Do not invent products that do not appear in the conversation.
- Use known_products to avoid treating unrelated text as products.
- For each final order item, include known_product_match.
- Set known_product_match.matched true only when the item clearly refers to a known product for this sender.
- When matched is true, copy the exact normalized_query from the matching known_products entry.
- When matched is false, normalized_query should be your best concise search query for that item.
- If quantity is unclear, prefer 1 only when the user's intent clearly implies adding a single item.
- If a message is unrelated to ordering, ignore it.

Return JSON only.
`;

export const ORDER_INTERPRETATION_SCHEMA = {
  name: 'order_interpretation',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: {
              type: 'string',
              enum: ['create_order', 'add_item', 'update_quantity', 'remove_item', 'ignore']
            },
            product: { type: ['string', 'null'] },
            quantity: { type: ['integer', 'null'] },
            unit: { type: ['string', 'null'] },
            source_message_id: { type: ['string', 'null'] },
            reason: { type: 'string' }
          },
          required: ['type', 'product', 'quantity', 'unit', 'source_message_id', 'reason']
        }
      },
      order: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            product: { type: 'string' },
            quantity: { type: 'integer' },
            unit: { type: ['string', 'null'] },
            known_product_match: {
              type: 'object',
              additionalProperties: false,
              properties: {
                matched: { type: 'boolean' },
                normalized_query: { type: 'string' },
                confidence: { type: 'number' },
                reason: { type: 'string' }
              },
              required: ['matched', 'normalized_query', 'confidence', 'reason']
            }
          },
          required: ['product', 'quantity', 'unit', 'known_product_match']
        }
      }
    },
    required: ['summary', 'actions', 'order']
  },
  strict: true
};
