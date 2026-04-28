import { supabase } from '../lib/supabase.js';
import { config } from '../lib/config.js';

function normalizeProductRow(row) {
  return {
    productId: String(row.product_id ?? '').trim(),
    name: String(row.name ?? '').trim(),
    brand: row.brand ? String(row.brand).trim() : undefined,
    category: row.category ? String(row.category).trim() : undefined,
    packageSize: row.package_size ? String(row.package_size).trim() : undefined,
    unit: String(row.unit ?? '').trim(),
    availableUnits: Array.isArray(row.available_units)
      ? row.available_units.filter(Boolean).map(String)
      : undefined,
    defaultQuantity:
      row.default_quantity === null || row.default_quantity === undefined
        ? undefined
        : Number(row.default_quantity)
  };
}

export async function getProducts() {
  const { data, error } = await supabase
    .from(config.productsTable)
    .select('product_id, name, brand, category, package_size, unit, available_units, default_quantity')
    .order('product_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return (data ?? [])
    .map(normalizeProductRow)
    .filter((product) => product.productId && product.name && product.unit);
}
