import { searchProducts } from './mockProductSearch.js';
import {
  inferCategory,
  isGenericCategoryRequest,
  matchFromHistory,
  selectBestSearchResult
} from './productMatcher.js';
import { normalizeText } from './textUtils.js';
import { normalizeUnit, resolveOrderUnit, UNIT_ALIASES } from './unitNormalizer.js';

const FILLER_WORDS = new Set([
  'salut',
  'buna',
  'vreau',
  'as',
  'dori',
  'te',
  'rog',
  'si',
  'and',
  'un',
  'o',
  'of',
  'din',
  'de',
  'please'
]);
const ADD_WORDS = new Set(['add', 'adauga', 'adaugă', 'plus']);
const REMOVE_WORDS = new Set(['drop', 'remove', 'delete', 'sterge', 'șterge', 'scoate', 'anuleaza', 'anulează']);
const UPDATE_WORDS = new Set(['update', 'change', 'modify', 'set', 'make', 'schimba', 'schimbă', 'modifica', 'modifică']);
const PRODUCT_ID_PATTERN = /\b[A-Z]+-\d+\b/i;
const PACKAGE_SIZE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml)\b/i;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUnitPattern() {
  return [...UNIT_ALIASES.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
}

const UNIT_PATTERN = buildUnitPattern();

function trimPunctuation(value) {
  return value
    .replace(/^[\s,.;:!?]+/, '')
    .replace(/[\s,.;:!?]+$/, '')
    .trim();
}

function stripFillerWords(value) {
  return value
    .split(/\s+/)
    .filter((word) => !FILLER_WORDS.has(word.toLowerCase()))
    .join(' ')
    .trim();
}

function stripProductCommandWords(value) {
  return stripFillerWords(value)
    .split(/\s+/)
    .filter((word) => {
      const normalizedWord = word.toLowerCase();
      return (
        !ADD_WORDS.has(normalizedWord) &&
        !REMOVE_WORDS.has(normalizedWord) &&
        !UPDATE_WORDS.has(normalizedWord)
      );
    })
    .join(' ')
    .trim();
}

function detectIntent(rawText) {
  const words = rawText.toLowerCase().split(/\s+/);
  if (words.some((word) => REMOVE_WORDS.has(word))) {
    return 'remove';
  }

  if (words.some((word) => UPDATE_WORDS.has(word))) {
    return 'update';
  }

  return 'add';
}

function splitMessageIntoItemTexts(message) {
  const cleaned = message
    .replace(/\s+/g, ' ')
    .replace(/\b(?:și|si|and)\b/gi, ',')
    .trim();

  return cleaned
    .split(',')
    .flatMap((part) => splitTextByQuantityUnit(part))
    .map((part) => trimPunctuation(stripFillerWords(part)))
    .filter(Boolean);
}

function splitTextByQuantityUnit(text) {
  const quantityUnitPattern = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_PATTERN})\\b`, 'gi');
  const matches = [...text.matchAll(quantityUnitPattern)];

  if (matches.length <= 1) {
    return [text];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? text.length;
    return text.slice(start, end);
  });
}

function detectBrand(productName, knownProducts) {
  const brands = knownProducts
    .map((product) => product.brand)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return brands.find((brand) => productName.toLowerCase().includes(brand.toLowerCase()));
}

function extractRequestedItem(rawText, knownProducts, productCategories) {
  const productId = rawText.match(PRODUCT_ID_PATTERN)?.[0]?.toUpperCase();
  const quantityMatch = rawText.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(?:(${UNIT_PATTERN})\\b)?`, 'i'));
  const quantity = quantityMatch ? Number(quantityMatch[1].replace(',', '.')) : undefined;
  const unit = normalizeUnit(quantityMatch?.[2]);

  let productName = rawText;
  if (quantityMatch) {
    productName = productName.replace(quantityMatch[0], ' ');
  }
  productName = stripProductCommandWords(trimPunctuation(productName.replace(PRODUCT_ID_PATTERN, '')));
  const packageSize = productName.match(PACKAGE_SIZE_PATTERN)?.[0]?.replace(/\s+/g, '');

  if (!productName && productId) {
    productName = productId;
  }

  const category = inferCategory(productName || rawText, productCategories);
  const brand = detectBrand(productName, knownProducts);

  return {
    rawText,
    intent: detectIntent(rawText),
    productName,
    productId,
    brand,
    quantity,
    unit,
    packageSize,
    category
  };
}

export function extractRequestedItems(message, previousProducts = [], productCategories = [], productCatalog = []) {
  const knownProducts = [...previousProducts, ...productCatalog];
  return splitMessageIntoItemTexts(message).map((rawText) =>
    extractRequestedItem(rawText, knownProducts, productCategories)
  );
}

function quantityForOrder(requestedItem, product) {
  return requestedItem.quantity ?? product.defaultQuantity ?? product.lastOrderedQuantity ?? 1;
}

function searchQueryFromItem(requestedItem) {
  return {
    searchText: requestedItem.productName,
    productId: requestedItem.productId,
    category: requestedItem.category,
    brand: requestedItem.brand,
    size: requestedItem.packageSize,
    unit: requestedItem.unit
  };
}

function orderItemFromHistory(requestedItem, product, confidence) {
  return {
    productId: product.productId,
    name: product.name,
    brand: product.brand,
    quantity: quantityForOrder(requestedItem, product),
    unit: resolveOrderUnit(requestedItem.unit, product.unit),
    packageSize: product.packageSize,
    source: 'order_history',
    confidence,
    rawText: requestedItem.rawText
  };
}

function orderItemFromSearch(requestedItem, product, confidence) {
  return {
    productId: product.productId,
    name: product.name,
    brand: product.brand,
    quantity: quantityForOrder(requestedItem, product),
    unit: resolveOrderUnit(requestedItem.unit, product.unit),
    packageSize: product.packageSize,
    source: 'product_search',
    confidence,
    rawText: requestedItem.rawText
  };
}

function orderItemFromUnmatched(requestedItem) {
  return {
    productId: null,
    name: requestedItem.productName || requestedItem.rawText,
    brand: requestedItem.brand,
    quantity: requestedItem.quantity ?? 1,
    unit: resolveOrderUnit(requestedItem.unit, undefined),
    packageSize: requestedItem.packageSize,
    source: 'product_search',
    confidence: 'low',
    rawText: requestedItem.rawText
  };
}

function cloneOrderItem(item) {
  return {
    productId: item.productId ?? null,
    name: item.name,
    brand: item.brand,
    category: item.category,
    quantity: item.quantity ?? 1,
    unit: item.unit ?? 'piece',
    packageSize: item.packageSize,
    source: item.source ?? 'order_history',
    confidence: item.confidence ?? 'high',
    rawText: item.rawText
  };
}

function previousProductFromOrderItem(item) {
  return {
    productId: item.productId,
    name: item.name,
    brand: item.brand,
    category: item.category,
    unit: item.unit,
    packageSize: item.packageSize,
    lastOrderedQuantity: item.quantity
  };
}

function findExistingOrderItemIndex(requestedItem, items) {
  const matchableItems = items
    .filter((item) => item.productId)
    .map(previousProductFromOrderItem);
  const historyMatch = matchFromHistory(requestedItem, matchableItems);

  if (historyMatch.match && historyMatch.confidence !== 'low') {
    return items.findIndex((item) => item.productId === historyMatch.match.productId);
  }

  if (requestedItem.category) {
    const categoryMatches = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => normalizeText(item.category) === normalizeText(requestedItem.category));

    if (categoryMatches.length === 1) {
      return categoryMatches[0].index;
    }
  }

  return -1;
}

function findOrderItemIndex(items, nextItem) {
  const existingIndex = nextItem.productId
    ? items.findIndex((item) => item.productId === nextItem.productId)
    : items.findIndex(
        (item) =>
          !item.productId &&
          normalizeText(item.name) === normalizeText(nextItem.name) &&
          normalizeText(item.unit) === normalizeText(nextItem.unit)
      );

  return existingIndex;
}

function applyOrderItem(items, nextItem, intent) {
  const existingIndex = findOrderItemIndex(items, nextItem);

  if (existingIndex >= 0) {
    if (intent === 'add') {
      items[existingIndex] = {
        ...items[existingIndex],
        quantity: (items[existingIndex].quantity ?? 0) + (nextItem.quantity ?? 0),
        rawText: nextItem.rawText
      };
      return;
    }

    items[existingIndex] = nextItem;
    return;
  }

  items.push(nextItem);
}

export async function buildOrderFromWhatsAppMessage({
  customerId,
  message,
  previousOrderProducts,
  initialOrderItems = [],
  productCategories = [],
  productCatalog = [],
  productSearch = searchProducts
}) {
  const items = initialOrderItems.map(cloneOrderItem);
  const ambiguousItems = [];
  const notes = [];
  const actions = [];
  const requestedItems = extractRequestedItems(
    message,
    previousOrderProducts,
    productCategories,
    productCatalog
  );

  for (const requestedItem of requestedItems) {
    if (requestedItem.intent === 'remove') {
      let existingIndex = findExistingOrderItemIndex(requestedItem, items);

      if (existingIndex < 0) {
        const searchResults = await productSearch(searchQueryFromItem(requestedItem));
        const searchSelection = selectBestSearchResult(requestedItem, searchResults);
        if (searchSelection.match) {
          existingIndex = items.findIndex((item) => item.productId === searchSelection.match.productId);
        }
      }

      if (existingIndex >= 0) {
        const removedItem = items[existingIndex];
        items.splice(existingIndex, 1);
        actions.push({
          type: 'remove_item',
          product: removedItem.name,
          quantity: removedItem.quantity,
          unit: removedItem.unit,
          rawText: requestedItem.rawText,
          reason: `Removed ${removedItem.name} from the recorded order.`
        });
        notes.push(`Removed ${requestedItem.productName || requestedItem.rawText} from order.`);
        continue;
      }

      ambiguousItems.push({
        rawText: requestedItem.rawText,
        reason: 'Could not remove item because it was not found in the current order.',
        possibleMatches: []
      });
      continue;
    }

    const historyMatch = matchFromHistory(requestedItem, previousOrderProducts);
    const shouldUseHistory =
      historyMatch.match &&
      historyMatch.confidence === 'high' &&
      !isGenericCategoryRequest(requestedItem);

    if (shouldUseHistory) {
      const item = orderItemFromHistory(requestedItem, historyMatch.match, historyMatch.confidence);
      applyOrderItem(
        items,
        item,
        requestedItem.intent
      );
      actions.push({
        type: requestedItem.intent === 'update' ? 'update_quantity' : 'add_item',
        product: item.name,
        quantity: item.quantity,
        unit: item.unit,
        rawText: requestedItem.rawText,
        reason: `Matched ${requestedItem.rawText} from ${item.source} with ${item.confidence} confidence.`
      });
      continue;
    }

    const searchResults = await productSearch(searchQueryFromItem(requestedItem));
    const searchSelection = selectBestSearchResult(requestedItem, searchResults);

    if (searchSelection.match && searchSelection.confidence !== 'low') {
      const item = orderItemFromSearch(requestedItem, searchSelection.match, searchSelection.confidence);
      applyOrderItem(
        items,
        item,
        requestedItem.intent
      );
      actions.push({
        type: requestedItem.intent === 'update' ? 'update_quantity' : 'add_item',
        product: item.name,
        quantity: item.quantity,
        unit: item.unit,
        rawText: requestedItem.rawText,
        reason: `Matched ${requestedItem.rawText} from ${item.source} with ${item.confidence} confidence.`
      });
      continue;
    }

    if (historyMatch.match && historyMatch.confidence === 'medium') {
      const item = orderItemFromHistory(requestedItem, historyMatch.match, historyMatch.confidence);
      applyOrderItem(
        items,
        item,
        requestedItem.intent
      );
      actions.push({
        type: requestedItem.intent === 'update' ? 'update_quantity' : 'add_item',
        product: item.name,
        quantity: item.quantity,
        unit: item.unit,
        rawText: requestedItem.rawText,
        reason: `Matched ${requestedItem.rawText} from ${item.source} with ${item.confidence} confidence.`
      });
      continue;
    }

    const unmatchedItem = orderItemFromUnmatched(requestedItem);
    applyOrderItem(items, unmatchedItem, requestedItem.intent);
    actions.push({
      type: 'add_item',
      product: unmatchedItem.name,
      quantity: unmatchedItem.quantity,
      unit: unmatchedItem.unit,
      rawText: requestedItem.rawText,
      reason: 'Added unmatched item with low confidence for manual review.'
    });
    ambiguousItems.push({
      rawText: requestedItem.rawText,
      reason: 'No matching product found in order history or product search.',
      possibleMatches: searchSelection.possibleMatches ?? []
    });
  }

  return {
    customerId,
    source: 'whatsapp',
    originalMessage: message,
    items,
    ambiguousItems,
    notes,
    actions
  };
}
