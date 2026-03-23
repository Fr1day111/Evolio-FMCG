export const ORDER_INTERPRETER_PROMPT = `
You convert messy customer messages into a clean live order.

Rules:
- Read the full message history for one sender for the current day in chronological order.
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
            unit: { type: ['string', 'null'] }
          },
          required: ['product', 'quantity', 'unit']
        }
      }
    },
    required: ['summary', 'actions', 'order']
  },
  strict: true
};
