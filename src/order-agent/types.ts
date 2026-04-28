export type MatchConfidence = 'high' | 'medium' | 'low';

export type PreviousOrderProduct = {
  productId: string;
  name: string;
  brand?: string;
  category?: string;
  unit: string;
  packageSize?: string;
  lastOrderedQuantity?: number;
};

export type ProductSearchQuery = {
  searchText?: string;
  productId?: string;
  category?: string;
  brand?: string;
  size?: string;
  unit?: string;
};

export type ProductCategory = {
  category: string;
  keywords: string[];
};

export type ProductSearchResult = {
  productId: string;
  name: string;
  brand?: string;
  category?: string;
  packageSize?: string;
  unit: string;
  availableUnits?: string[];
  defaultQuantity?: number;
};

export type ExtractedRequestedItem = {
  rawText: string;
  productName?: string;
  productId?: string;
  brand?: string;
  quantity?: number;
  unit?: string;
  packageSize?: string;
  category?: string;
};

export type OrderItem = {
  productId: string | null;
  name: string;
  brand?: string;
  quantity: number;
  unit: string;
  packageSize?: string;
  source: 'order_history' | 'product_search';
  confidence: MatchConfidence;
  rawText?: string;
};

export type AmbiguousOrderItem = {
  rawText: string;
  reason: string;
  possibleMatches: ProductSearchResult[];
};

export type OrderOutput = {
  customerId: string;
  source: 'whatsapp';
  originalMessage: string;
  items: OrderItem[];
  ambiguousItems?: AmbiguousOrderItem[];
  notes?: string[];
};
