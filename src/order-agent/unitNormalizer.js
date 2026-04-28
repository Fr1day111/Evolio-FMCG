import { normalizeText } from './textUtils.js';

export const UNIT_ALIASES = new Map([
  ['kg', 'kg'],
  ['kgs', 'kg'],
  ['kilogram', 'kg'],
  ['kilograme', 'kg'],
  ['cutie', 'box'],
  ['cutii', 'box'],
  ['box', 'box'],
  ['bucata', 'piece'],
  ['buc', 'piece'],
  ['bucati', 'piece'],
  ['bucăți', 'piece'],
  ['piece', 'piece'],
  ['sticla', 'bottle'],
  ['sticlă', 'bottle'],
  ['sticle', 'bottle'],
  ['bottle', 'bottle'],
  ['bax', 'case'],
  ['baxuri', 'case'],
  ['case', 'case'],
  ['litru', 'l'],
  ['litri', 'l'],
  ['liter', 'l'],
  ['liters', 'l'],
  ['litre', 'l'],
  ['litres', 'l'],
  ['l', 'l']
]);

export function normalizeUnit(unit) {
  if (!unit) {
    return undefined;
  }

  return UNIT_ALIASES.get(String(unit).toLowerCase()) ?? UNIT_ALIASES.get(normalizeText(unit));
}

export function resolveOrderUnit(requestedUnit, productUnit, fallback = 'piece') {
  return normalizeUnit(requestedUnit) ?? normalizeUnit(productUnit) ?? productUnit ?? fallback;
}
