import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParmashopSearchHtml } from '../src/services/parmashopSearch.js';

test('parseParmashopSearchHtml extracts discounted in-stock product cards', () => {
  const products = parseParmashopSearchHtml(`
    <div class="row product-layout-row">
      <div class="subcat-item-masonry product-layout product-grid">
        <div class="item">
          <div class="product-card-content">
            <div class="product-card-awards-wrapper">
              <div class="product-card-price-old-old-percent-badge"><span>-46%</span></div>
            </div>
            <a class="product-card-image" style="background-image:url('https://www.parmashop.ro/image/cachewebp/catalog/product.webp')" href="https://www.parmashop.ro/cocktail-pina-colada&search=cola" onclick="addButtonChecker.SelectItem('10298', 'search', 'Search');">
              <span class="stock-label stock-label-2">În stoc</span>
            </a>
            <a class="product-card-name" href="https://www.parmashop.ro/cocktail-pina-colada&search=cola">Cocktail Pina Colada All Shook Up 0.25l</a>
            <a class="product-card-price-wrapper">
              <span class="product-card-price-old-old price-special-type"><span>12,46 lei</span></span>
              <span class="product-card-price">6,79 lei</span>
              <span class="product-card-price-per-unit">Pret/l: 27,16 lei</span>
            </a>
            <a class="product-card-model">ASU4SGR</a>
          </div>
          <div class="product-card-button">
            <div class="btn btn-primary product-card-button-cart" onclick="addButtonChecker.AddToCart('10298', '6', 'search', 'Search');cart.add('10298', '6');">Adaugă în coș</div>
          </div>
        </div>
      </div>
    </div>
  `);

  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Cocktail Pina Colada All Shook Up 0.25l');
  assert.equal(products[0].sku, 'ASU4SGR');
  assert.equal(products[0].product_id, '10298');
  assert.equal(products[0].image_url, 'https://www.parmashop.ro/image/cachewebp/catalog/product.webp');
  assert.equal(products[0].stock_label, 'În stoc');
  assert.equal(products[0].available, true);
  assert.equal(products[0].price, '6,79 lei');
  assert.equal(products[0].old_price, '12,46 lei');
  assert.equal(products[0].price_per_unit, 'Pret/l: 27,16 lei');
  assert.equal(products[0].add_to_cart_enabled, true);
  assert.match(products[0].html, /product-card-content/);
});

test('parseParmashopSearchHtml marks disabled out-of-stock product cards unavailable', () => {
  const products = parseParmashopSearchHtml(`
    <div class="subcat-item-masonry product-layout product-grid">
      <div class="item">
        <div class="product-card-content">
          <a class="product-card-image" style="background-image:url('/image/cachewebp/catalog/empty.webp')" href="/ciocolata&search=cola" onclick="addButtonChecker.SelectItem('10361', 'search', 'Search');">
            <span class="stock-label stock-label-0">Stoc epuizat</span>
          </a>
          <a class="product-card-name" href="/ciocolata&search=cola">Ciocolata cu Caramel Milka 100g</a>
          <a class="product-card-price-wrapper">
            <span class="product-card-price">7,19 lei</span>
            <span class="product-card-price-per-unit">Pret/kg: 71,90 lei</span>
          </a>
          <a class="product-card-model">AQL28</a>
        </div>
        <div class="product-card-button">
          <div class="btn btn-primary product-card-button-cart" disabled>Adaugă în coș</div>
        </div>
      </div>
    </div>
  `);

  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Ciocolata cu Caramel Milka 100g');
  assert.equal(products[0].product_id, '10361');
  assert.equal(products[0].url, 'https://www.parmashop.ro/ciocolata&search=cola');
  assert.equal(products[0].available, false);
  assert.equal(products[0].old_price, null);
  assert.equal(products[0].add_to_cart_enabled, false);
});
