import { normalizeText, tokenOverlapScore } from './textUtils.js';
import { normalizeUnit } from './unitNormalizer.js';

export const MOCK_PRODUCT_CATALOG = [
  {
    productId: 'CHEESE-001',
    name: 'Mozzarella Galbani',
    brand: 'Galbani',
    category: 'cheese',
    packageSize: '1kg',
    unit: 'kg',
    availableUnits: ['kg', 'piece'],
    defaultQuantity: 1
  },
  {
    productId: 'CHEESE-002',
    name: 'Mozzarella Granarolo Cub',
    brand: 'Granarolo',
    category: 'cheese',
    packageSize: '2kg',
    unit: 'kg',
    availableUnits: ['kg'],
    defaultQuantity: 2
  },
  {
    productId: 'CHEESE-003',
    name: 'Cascaval Hochland Bloc',
    brand: 'Hochland',
    category: 'cheese',
    packageSize: '3kg',
    unit: 'kg',
    availableUnits: ['kg', 'piece'],
    defaultQuantity: 3
  },
  {
    productId: 'CHEESE-004',
    name: 'Parmesan Grana Padano Ras',
    brand: 'Grana Padano',
    category: 'cheese',
    packageSize: '1kg',
    unit: 'kg',
    availableUnits: ['kg'],
    defaultQuantity: 1
  },
  {
    productId: 'CHEESE-005',
    name: 'Telemea de vaca Delaco',
    brand: 'Delaco',
    category: 'cheese',
    packageSize: '900g',
    unit: 'piece',
    availableUnits: ['piece', 'kg'],
    defaultQuantity: 1
  },
  {
    productId: 'PASTA-001',
    name: 'Paste Barilla Penne',
    brand: 'Barilla',
    category: 'pasta',
    packageSize: '500g',
    unit: 'box',
    availableUnits: ['box'],
    defaultQuantity: 1
  },
  {
    productId: 'PASTA-002',
    name: 'Paste De Cecco Spaghetti',
    brand: 'De Cecco',
    category: 'pasta',
    packageSize: '500g',
    unit: 'box',
    availableUnits: ['box'],
    defaultQuantity: 1
  },
  {
    productId: 'TOMATO-001',
    name: 'Rosii cherry',
    brand: 'Local',
    category: 'tomatoes',
    packageSize: '1kg',
    unit: 'kg',
    availableUnits: ['kg'],
    defaultQuantity: 1
  },
  {
    productId: 'TOMATO-002',
    name: 'Rosii pasate Mutti',
    brand: 'Mutti',
    category: 'tomatoes',
    packageSize: '2.5kg',
    unit: 'can',
    availableUnits: ['can'],
    defaultQuantity: 1
  },
  {
    productId: 'OIL-001',
    name: 'Ulei floarea soarelui Spornic',
    brand: 'Spornic',
    category: 'oil',
    packageSize: '5L',
    unit: 'bottle',
    availableUnits: ['bottle'],
    defaultQuantity: 1
  },
  {
    productId: 'OIL-002',
    name: 'Ulei masline Costa d Oro',
    brand: 'Costa d Oro',
    category: 'oil',
    packageSize: '1L',
    unit: 'bottle',
    availableUnits: ['bottle'],
    defaultQuantity: 1
  },
  {
    productId: 'SAUCE-001',
    name: 'Sos rosii Mutti',
    brand: 'Mutti',
    category: 'sauce',
    packageSize: '2.5kg',
    unit: 'can',
    availableUnits: ['can'],
    defaultQuantity: 1
  },
  {
    productId: 'SAUCE-002',
    name: 'Sos pesto Barilla',
    brand: 'Barilla',
    category: 'sauce',
    packageSize: '500g',
    unit: 'jar',
    availableUnits: ['jar'],
    defaultQuantity: 1
  },
  {
    productId: 'RICE-001',
    name: 'Orez basmati Riso Scotti',
    brand: 'Riso Scotti',
    category: 'rice',
    packageSize: '1kg',
    unit: 'bag',
    availableUnits: ['bag', 'kg'],
    defaultQuantity: 1
  },
  {
    productId: 'RICE-002',
    name: 'Orez arborio risotto Scotti',
    brand: 'Riso Scotti',
    category: 'rice',
    packageSize: '1kg',
    unit: 'bag',
    availableUnits: ['bag', 'kg'],
    defaultQuantity: 1
  },
  {
    productId: 'MEAT-001',
    name: 'Piept de pui dezosat',
    brand: 'Local',
    category: 'meat',
    packageSize: '1kg',
    unit: 'kg',
    availableUnits: ['kg'],
    defaultQuantity: 1
  },
  {
    productId: 'WATER-001',
    name: 'Apa plata Borsec',
    brand: 'Borsec',
    category: 'water',
    packageSize: '6x2L',
    unit: 'case',
    availableUnits: ['case', 'bottle'],
    defaultQuantity: 1
  }
];

const CATEGORY_KEYWORDS = {
  cheese: ['cheese', 'branza', 'mozzarella', 'cascaval', 'parmesan', 'parmezan', 'telemea'],
  pasta: ['pasta', 'paste', 'penne', 'spaghetti', 'fusilli'],
  tomatoes: ['tomato', 'tomatoes', 'rosii', 'rosie'],
  oil: ['oil', 'ulei'],
  sauce: ['sauce', 'sos'],
  rice: ['rice', 'orez'],
  meat: ['meat', 'carne', 'pui', 'vita', 'porc'],
  water: ['water', 'apa'],
  dairy: ['dairy', 'lapte', 'smantana']
};

function textMatchesCategory(text, category) {
  const normalizedText = normalizeText(text);
  return CATEGORY_KEYWORDS[category]?.some((keyword) => normalizedText.includes(keyword)) ?? false;
}

function inferCategories(query) {
  const requestedCategory = normalizeText(query.category);
  if (requestedCategory) {
    return new Set([requestedCategory]);
  }

  const searchText = normalizeText(query.searchText);
  return new Set(
    Object.entries(CATEGORY_KEYWORDS)
      .filter(([category]) => textMatchesCategory(searchText, category))
      .map(([category]) => category)
  );
}

function scoreProduct(product, query, inferredCategories) {
  if (query.productId && normalizeText(product.productId) === normalizeText(query.productId)) {
    return 100;
  }

  let score = 0;
  const searchText = normalizeText(query.searchText);
  const haystack = normalizeText(`${product.name} ${product.brand ?? ''} ${product.category ?? ''}`);
  const productCategory = normalizeText(product.category);

  if (searchText) {
    if (haystack.includes(searchText) || searchText.includes(normalizeText(product.name))) {
      score += 30;
    }

    score += tokenOverlapScore(searchText, haystack) * 20;
  }

  if (query.brand && normalizeText(product.brand) === normalizeText(query.brand)) {
    score += 20;
  }

  if (query.category && productCategory === normalizeText(query.category)) {
    score += 18;
  } else if (inferredCategories.has(productCategory)) {
    score += 16;
  }

  if (query.size && normalizeText(product.packageSize) === normalizeText(query.size)) {
    score += 12;
  }

  const requestedUnit = normalizeUnit(query.unit);
  if (score > 0 && requestedUnit && (product.availableUnits ?? [product.unit]).includes(requestedUnit)) {
    score += 8;
  }

  return score;
}

export function searchProductCatalog(query, productCatalog = MOCK_PRODUCT_CATALOG) {
  const inferredCategories = inferCategories(query);
  const queryHasFilters = Object.values(query).some(Boolean);

  if (!queryHasFilters) {
    return [];
  }

  return productCatalog
    .map((product) => ({
      product,
      score: scoreProduct(product, query, inferredCategories)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.product.productId.localeCompare(right.product.productId))
    .map(({ product }) => product);
}

export async function searchProducts(query) {
  return searchProductCatalog(query);
}
