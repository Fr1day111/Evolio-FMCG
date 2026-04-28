import { supabase } from '../lib/supabase.js';
import { config } from '../lib/config.js';

function normalizeCategoryRow(row) {
  return {
    category: String(row.category ?? '').trim(),
    keywords: Array.isArray(row.keywords) ? row.keywords.filter(Boolean).map(String) : []
  };
}

export async function getProductCategories() {
  const { data, error } = await supabase
    .from(config.productCategoriesTable)
    .select('category, keywords')
    .order('category', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch product categories: ${error.message}`);
  }

  return (data ?? [])
    .map(normalizeCategoryRow)
    .filter((row) => row.category);
}
