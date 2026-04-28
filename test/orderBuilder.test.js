import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOrderFromWhatsAppMessage } from '../src/order-agent/orderBuilder.js';

const previousOrderProducts = [
  {
    productId: 'TOMATO-001',
    name: 'Rosii cherry',
    brand: 'Local',
    category: 'vegetables',
    unit: 'kg',
    lastOrderedQuantity: 5
  },
  {
    productId: 'PASTA-001',
    name: 'Paste Barilla Penne',
    brand: 'Barilla',
    category: 'pasta',
    packageSize: '500g',
    unit: 'box',
    lastOrderedQuantity: 10
  }
];

async function build(message, history = previousOrderProducts) {
  return buildOrderFromWhatsAppMessage({
    customerId: 'CUSTOMER-001',
    message,
    previousOrderProducts: history
  });
}

test('uses product from previous order history when confidently matched', async () => {
  const order = await build('Vreau 5 kg rosii cherry');

  assert.equal(order.items.length, 1);
  assert.deepEqual(order.items[0], {
    productId: 'TOMATO-001',
    name: 'Rosii cherry',
    brand: 'Local',
    quantity: 5,
    unit: 'kg',
    packageSize: undefined,
    source: 'order_history',
    confidence: 'high',
    rawText: '5 kg rosii cherry'
  });
  assert.deepEqual(order.ambiguousItems, []);
});

test('falls back to product search for a product missing from history', async () => {
  const order = await build('Vreau 3 kg mozzarella');

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].productId, 'CHEESE-001');
  assert.equal(order.items[0].source, 'product_search');
  assert.equal(order.items[0].confidence, 'medium');
  assert.equal(order.items[0].quantity, 3);
  assert.equal(order.items[0].unit, 'kg');
  assert.deepEqual(order.ambiguousItems, []);
});

test('builds mixed order from history and fallback product search', async () => {
  const message = 'Salut, vreau 5 kg rosii cherry, 3 kg mozzarella si 10 cutii penne Barilla.';
  const order = await build(message);

  assert.deepEqual(
    order.items.map((item) => ({
      productId: item.productId,
      source: item.source,
      quantity: item.quantity,
      unit: item.unit,
      rawText: item.rawText
    })),
    [
      {
        productId: 'TOMATO-001',
        source: 'order_history',
        quantity: 5,
        unit: 'kg',
        rawText: '5 kg rosii cherry'
      },
      {
        productId: 'CHEESE-001',
        source: 'product_search',
        quantity: 3,
        unit: 'kg',
        rawText: '3 kg mozzarella'
      },
      {
        productId: 'PASTA-001',
        source: 'order_history',
        quantity: 10,
        unit: 'box',
        rawText: '10 cutii penne Barilla'
      }
    ]
  );
  assert.equal(order.customerId, 'CUSTOMER-001');
  assert.equal(order.source, 'whatsapp');
  assert.equal(order.originalMessage, message);
  assert.deepEqual(order.ambiguousItems, []);
  assert.deepEqual(order.notes, []);
});

test('searches by product ID when the ID is not in history', async () => {
  const order = await build('Vreau 2 buc CHEESE-003');

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].productId, 'CHEESE-003');
  assert.equal(order.items[0].name, 'Cascaval Hochland Bloc');
  assert.equal(order.items[0].source, 'product_search');
  assert.equal(order.items[0].confidence, 'high');
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.items[0].unit, 'piece');
});

test('handles generic cheese category with a deterministic medium confidence result', async () => {
  const order = await build('Vreau 2 kg branza');

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].productId, 'CHEESE-001');
  assert.equal(order.items[0].source, 'product_search');
  assert.equal(order.items[0].confidence, 'medium');
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.items[0].unit, 'kg');
  assert.deepEqual(order.ambiguousItems, []);
});

test('adds unknown products to ambiguousItems', async () => {
  const order = await build('Vreau 2 kg produs-inexistent');

  assert.deepEqual(order.items, [
    {
      productId: null,
      name: 'produs-inexistent',
      brand: undefined,
      quantity: 2,
      unit: 'kg',
      packageSize: undefined,
      source: 'product_search',
      confidence: 'low',
      rawText: '2 kg produs-inexistent'
    }
  ]);
  assert.equal(order.ambiguousItems.length, 1);
  assert.deepEqual(order.ambiguousItems[0], {
    rawText: '2 kg produs-inexistent',
    reason: 'No matching product found in order history or product search.',
    possibleMatches: []
  });
});

test('uses Supabase product category hints when building fallback search queries', async () => {
  const order = await buildOrderFromWhatsAppMessage({
    customerId: 'CUSTOMER-001',
    message: 'Vreau 2 condiment',
    previousOrderProducts,
    productCategories: [
      {
        category: 'sauce',
        keywords: ['condiment']
      }
    ]
  });

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].productId, 'SAUCE-001');
  assert.equal(order.items[0].source, 'product_search');
  assert.equal(order.items[0].confidence, 'medium');
  assert.equal(order.items[0].quantity, 2);
});

test('splits compact WhatsApp messages with repeated quantity-unit patterns', async () => {
  const order = await buildOrderFromWhatsAppMessage({
    customerId: 'CUSTOMER-001',
    message: '3kgs Tomatoes 5l oil 5kg rice',
    previousOrderProducts: [],
    productCategories: [
      { category: 'tomatoes', keywords: ['tomato', 'tomatoes'] },
      { category: 'oil', keywords: ['oil'] },
      { category: 'rice', keywords: ['rice'] }
    ]
  });

  assert.deepEqual(
    order.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unit: item.unit,
      rawText: item.rawText
    })),
    [
      {
        productId: 'TOMATO-001',
        quantity: 3,
        unit: 'kg',
        rawText: '3kgs Tomatoes'
      },
      {
        productId: 'OIL-001',
        quantity: 5,
        unit: 'l',
        rawText: '5l oil'
      },
      {
        productId: 'RICE-001',
        quantity: 5,
        unit: 'kg',
        rawText: '5kg rice'
      }
    ]
  );
});

test('removes items from the recorded order instead of adding drop/remove commands', async () => {
  const order = await buildOrderFromWhatsAppMessage({
    customerId: 'CUSTOMER-001',
    message: 'Drop rice, Remove oil',
    previousOrderProducts: [
      {
        productId: 'RICE-001',
        name: 'Orez basmati Riso Scotti',
        brand: 'Riso Scotti',
        category: 'rice',
        unit: 'kg',
        packageSize: '1kg',
        lastOrderedQuantity: 5
      },
      {
        productId: 'OIL-001',
        name: 'Ulei floarea soarelui Spornic',
        brand: 'Spornic',
        category: 'oil',
        unit: 'bottle',
        packageSize: '5L',
        lastOrderedQuantity: 5
      }
    ],
    initialOrderItems: [
      {
        productId: 'RICE-001',
        name: 'Orez basmati Riso Scotti',
        brand: 'Riso Scotti',
        quantity: 5,
        unit: 'kg',
        packageSize: '1kg',
        source: 'product_search',
        confidence: 'medium'
      },
      {
        productId: 'OIL-001',
        name: 'Ulei floarea soarelui Spornic',
        brand: 'Spornic',
        quantity: 5,
        unit: 'l',
        packageSize: '5L',
        source: 'product_search',
        confidence: 'medium'
      }
    ],
    productCategories: [
      { category: 'rice', keywords: ['rice'] },
      { category: 'oil', keywords: ['oil'] }
    ]
  });

  assert.deepEqual(order.items, []);
  assert.deepEqual(
    order.actions.map((action) => ({
      type: action.type,
      product: action.product,
      rawText: action.rawText
    })),
    [
      {
        type: 'remove_item',
        product: 'Orez basmati Riso Scotti',
        rawText: 'Drop rice'
      },
      {
        type: 'remove_item',
        product: 'Ulei floarea soarelui Spornic',
        rawText: 'Remove oil'
      }
    ]
  );
});

test('updates quantity for an item already in the recorded order', async () => {
  const order = await buildOrderFromWhatsAppMessage({
    customerId: 'CUSTOMER-001',
    message: 'Update rice 2kg',
    previousOrderProducts: [
      {
        productId: 'RICE-001',
        name: 'Orez basmati Riso Scotti',
        brand: 'Riso Scotti',
        category: 'rice',
        unit: 'kg',
        packageSize: '1kg',
        lastOrderedQuantity: 5
      }
    ],
    initialOrderItems: [
      {
        productId: 'RICE-001',
        name: 'Orez basmati Riso Scotti',
        brand: 'Riso Scotti',
        quantity: 5,
        unit: 'kg',
        packageSize: '1kg',
        source: 'product_search',
        confidence: 'medium'
      }
    ],
    productCategories: [{ category: 'rice', keywords: ['rice'] }]
  });

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].productId, 'RICE-001');
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.items[0].unit, 'kg');
  assert.equal(order.actions[0].type, 'update_quantity');
});

test('recomputes a full day order and removes dropped items from the final result', async () => {
  const order = await buildOrderFromWhatsAppMessage({
    customerId: 'CUSTOMER-001',
    message: '3kgs Tomatoes 5l oil 5kg rice, 4kgs apple, Drop rice, Remove oil',
    previousOrderProducts: [],
    initialOrderItems: [],
    productCategories: [
      { category: 'tomatoes', keywords: ['tomato', 'tomatoes'] },
      { category: 'oil', keywords: ['oil'] },
      { category: 'rice', keywords: ['rice'] }
    ]
  });

  assert.deepEqual(
    order.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit
    })),
    [
      {
        productId: 'TOMATO-001',
        name: 'Rosii cherry',
        quantity: 3,
        unit: 'kg'
      },
      {
        productId: null,
        name: 'apple',
        quantity: 4,
        unit: 'kg'
      }
    ]
  );
  assert.deepEqual(
    order.actions.map((action) => action.type),
    ['add_item', 'add_item', 'add_item', 'add_item', 'remove_item', 'remove_item']
  );
});

test('merges repeated unmatched add items by normalized name and unit', async () => {
  const order = await buildOrderFromWhatsAppMessage({
    customerId: 'CUSTOMER-001',
    message: '4kgs apple, Add 2kgs of apple',
    previousOrderProducts: [],
    initialOrderItems: []
  });

  assert.deepEqual(order.items, [
    {
      productId: null,
      name: 'apple',
      brand: undefined,
      quantity: 6,
      unit: 'kg',
      packageSize: undefined,
      source: 'product_search',
      confidence: 'low',
      rawText: 'Add 2kgs apple'
    }
  ]);
  assert.deepEqual(
    order.ambiguousItems.map((item) => item.rawText),
    ['4kgs apple', 'Add 2kgs apple']
  );
});
