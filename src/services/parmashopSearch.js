import * as cheerio from 'cheerio';

const PARMASHOP_BASE_URL = 'https://www.parmashop.ro';
const SEARCH_TIMEOUT_MS = 15000;

function compactText(value) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, PARMASHOP_BASE_URL).toString();
  } catch {
    return value;
  }
}

function extractBackgroundImage(style) {
  const match = String(style ?? '').match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ? absoluteUrl(match[2]) : null;
}

function extractProductId(html) {
  const selectMatch = html.match(/SelectItem\('([^']+)'/);
  if (selectMatch?.[1]) {
    return selectMatch[1];
  }

  const cartMatch = html.match(/AddToCart\('([^']+)'/);
  return cartMatch?.[1] ?? null;
}

function isDisabled($, card) {
  const button = $(card).find('.product-card-button-cart').first();
  return button.is('[disabled]') || button.attr('disabled') !== undefined;
}

function parseCard($, card) {
  const $card = $(card);
  const html = $.html(card);
  const nameLink = $card.find('.product-card-name').first();
  const imageLink = $card.find('.product-card-image').first();
  const stockLabel = compactText($card.find('.stock-label').first().text()) || null;
  const addToCartEnabled = !isDisabled($, card);

  return {
    name: compactText(nameLink.text()) || null,
    sku: compactText($card.find('.product-card-model').first().text()) || null,
    product_id: extractProductId(html),
    url: absoluteUrl(nameLink.attr('href') ?? imageLink.attr('href')),
    image_url: extractBackgroundImage(imageLink.attr('style')),
    stock_label: stockLabel,
    available: addToCartEnabled && !/epuizat/i.test(stockLabel ?? ''),
    price: compactText($card.find('.product-card-price').first().text()) || null,
    old_price:
      compactText($card.find('.product-card-price-old-old span').first().text()) || null,
    price_per_unit:
      compactText($card.find('.product-card-price-per-unit').first().text()) || null,
    add_to_cart_enabled: addToCartEnabled,
    html
  };
}

export function parseParmashopSearchHtml(html) {
  const $ = cheerio.load(html);

  return $('.product-layout')
    .toArray()
    .map((card) => parseCard($, card))
    .filter((product) => product.name || product.sku || product.product_id);
}

async function fetchSearchHtml(query) {
  const url = new URL('/cautare', PARMASHOP_BASE_URL);
  url.searchParams.set('search', query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Parmashop search returned ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWithHttp(query) {
  const html = await fetchSearchHtml(query);
  const products = parseParmashopSearchHtml(html);

  if (products.length === 0) {
    throw new Error('Parmashop HTTP search returned no product cards');
  }

  return {
    method: 'http',
    products
  };
}

async function searchWithPlaywright(query) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(PARMASHOP_BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: SEARCH_TIMEOUT_MS
    });

    const acceptButton = page.locator('#button-cookie');
    if (await acceptButton.isVisible().catch(() => false)) {
      await acceptButton.click({ force: true }).catch(() => null);
      await page.locator('#modalCookie').waitFor({ state: 'hidden', timeout: 3000 }).catch(
        () => null
      );
    }

    await page.evaluate(() => {
      document.querySelector('#modalCookie')?.remove();
      document.querySelectorAll('.modal-backdrop').forEach((element) => element.remove());
      document.body.classList.remove('modal-open', 'modal-backgdrop-light');
      document.body.style.removeProperty('padding-right');
    });

    const searchUrl = new URL('/cautare', PARMASHOP_BASE_URL);
    searchUrl.searchParams.set('search', query);
    await page.goto(searchUrl.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: SEARCH_TIMEOUT_MS
    });
    await page.waitForSelector('.product-layout, #content', { timeout: SEARCH_TIMEOUT_MS });

    const html = await page.content();
    return {
      method: 'playwright',
      products: parseParmashopSearchHtml(html)
    };
  } finally {
    await browser.close();
  }
}

export async function searchParmashopProducts(query) {
  try {
    return await searchWithHttp(query);
  } catch (httpError) {
    const fallbackResult = await searchWithPlaywright(query);
    return {
      ...fallbackResult,
      http_error: httpError.message
    };
  }
}
