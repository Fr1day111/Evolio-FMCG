import { includesNormalized, normalizeText, tokenOverlapScore } from './textUtils.js';
import { normalizeUnit } from './unitNormalizer.js';

const GENERIC_CATEGORIES = new Map([
  ['cheese', 'cheese'],
  ['branza', 'cheese'],
  ['mozzarella', 'cheese'],
  ['cascaval', 'cheese'],
  ['parmesan', 'cheese'],
  ['parmezan', 'cheese'],
  ['pasta', 'pasta'],
  ['paste', 'pasta'],
  ['rice', 'rice'],
  ['orez', 'rice'],
  ['meat', 'meat'],
  ['carne', 'meat'],
  ['sauce', 'sauce'],
  ['sos', 'sauce'],
  ['oil', 'oil'],
  ['ulei', 'oil'],
  ['tomato', 'tomatoes'],
  ['tomatoes', 'tomatoes'],
  ['rosii', 'tomatoes']
]);

function historyCandidateScore(requestedItem, product) {
  const requestedName = requestedItem.productName ?? requestedItem.rawText;
  const normalizedRequestedName = normalizeText(requestedName);
  const normalizedProductName = normalizeText(product.name);

  if (requestedItem.productId && normalizeText(requestedItem.productId) === normalizeText(product.productId)) {
    return 100;
  }

  let score = 0;

  if (normalizedRequestedName && normalizedRequestedName === normalizedProductName) {
    score += 70;
  } else if (
    includesNormalized(product.name, requestedName) ||
    includesNormalized(requestedName, product.name)
  ) {
    score += 55;
  } else {
    score += tokenOverlapScore(requestedName, product.name) * 50;
  }

  if (requestedItem.brand && normalizeText(requestedItem.brand) === normalizeText(product.brand)) {
    score += 30;
  }

  if (requestedItem.category && normalizeText(requestedItem.category) === normalizeText(product.category)) {
    score += 18;
  }

  return score;
}

function confidenceFromHistoryScore(score, candidates) {
  if (score >= 85) {
    return 'high';
  }

  if (score >= 55 && candidates.length === 1) {
    return 'high';
  }

  if (score >= 35 && candidates.length <= 2) {
    return 'medium';
  }

  return 'low';
}

export function inferCategory(text, productCategories = []) {
  const normalizedText = normalizeText(text);

  for (const categoryDefinition of productCategories) {
    const category = normalizeText(categoryDefinition.category);
    const keywords = [categoryDefinition.category, ...(categoryDefinition.keywords ?? [])];
    if (keywords.some((keyword) => normalizedText.includes(normalizeText(keyword)))) {
      return category;
    }
  }

  for (const [keyword, category] of GENERIC_CATEGORIES.entries()) {
    if (normalizedText.includes(keyword)) {
      return category;
    }
  }

  return undefined;
}

export function isGenericCategoryRequest(requestedItem) {
  const name = normalizeText(requestedItem.productName ?? requestedItem.rawText);
  return Boolean(requestedItem.category) && [...GENERIC_CATEGORIES.keys()].some((keyword) => name === keyword);
}

export function matchFromHistory(requestedItem, previousProducts) {
  const scored = previousProducts
    .map((product) => ({
      product,
      score: historyCandidateScore(requestedItem, product)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.product.productId.localeCompare(right.product.productId));

  if (scored.length === 0) {
    return { confidence: 'low' };
  }

  const [best, second] = scored;
  const possibleMatches = scored.map(({ product }) => product);

  if (second && best.score - second.score < 10) {
    return {
      confidence: 'low',
      possibleMatches
    };
  }

  return {
    match: best.product,
    confidence: confidenceFromHistoryScore(best.score, scored),
    possibleMatches: possibleMatches.length > 1 ? possibleMatches : undefined
  };
}

function searchCandidateScore(requestedItem, product) {
  const requestedName = requestedItem.productName ?? requestedItem.rawText;

  if (requestedItem.productId && normalizeText(requestedItem.productId) === normalizeText(product.productId)) {
    return 100;
  }

  let score = tokenOverlapScore(requestedName, `${product.name} ${product.brand ?? ''}`) * 45;

  if (includesNormalized(product.name, requestedName) || includesNormalized(requestedName, product.name)) {
    score += 30;
  }

  if (requestedItem.brand && normalizeText(requestedItem.brand) === normalizeText(product.brand)) {
    score += 28;
  }

  if (requestedItem.packageSize && normalizeText(requestedItem.packageSize) === normalizeText(product.packageSize)) {
    score += 16;
  }

  const requestedUnit = normalizeUnit(requestedItem.unit);
  if (requestedUnit && (product.availableUnits ?? [product.unit]).includes(requestedUnit)) {
    score += 8;
  }

  if (requestedItem.category && normalizeText(requestedItem.category) === normalizeText(product.category)) {
    score += 18;
  }

  return score;
}

function confidenceFromSearchScore(score, candidates) {
  if (score >= 90) {
    return 'high';
  }

  if (score >= 45) {
    return candidates.length > 1 ? 'medium' : 'high';
  }

  if (score >= 18) {
    return 'medium';
  }

  return 'low';
}

export function selectBestSearchResult(requestedItem, results) {
  if (results.length === 0) {
    return { confidence: 'low' };
  }

  const scored = results
    .map((product) => ({
      product,
      score: searchCandidateScore(requestedItem, product)
    }))
    .sort((left, right) => right.score - left.score || left.product.productId.localeCompare(right.product.productId));

  const [best, second] = scored;
  const possibleMatches = scored.map(({ product }) => product);

  if (!requestedItem.category && second && best.score < 45 && Math.abs(best.score - second.score) < 5) {
    return {
      confidence: 'low',
      possibleMatches
    };
  }

  return {
    match: best.product,
    confidence: confidenceFromSearchScore(best.score, scored),
    possibleMatches: possibleMatches.length > 1 ? possibleMatches : undefined
  };
}
