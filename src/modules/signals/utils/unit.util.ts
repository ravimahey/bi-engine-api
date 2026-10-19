/**
 * Standard unit definitions, normalization, and conversion utilities
 * for items, products, invoices, and supplier price increase detection.
 */

export type UnitFamily = 'weight' | 'volume' | 'count' | 'general';

export interface UnitDefinition {
  canonical: string;
  family: UnitFamily;
  multiplierToBase: number; // Factor to multiply by to get the base unit amount
  baseUnit: string;
}

export const CANONICAL_UNITS: Record<string, UnitDefinition> = {
  // --- Weight (Base: kg) ---
  kg: { canonical: 'kg', family: 'weight', multiplierToBase: 1, baseUnit: 'kg' },
  kgs: { canonical: 'kg', family: 'weight', multiplierToBase: 1, baseUnit: 'kg' },
  kilo: { canonical: 'kg', family: 'weight', multiplierToBase: 1, baseUnit: 'kg' },
  kilos: { canonical: 'kg', family: 'weight', multiplierToBase: 1, baseUnit: 'kg' },
  kilogram: { canonical: 'kg', family: 'weight', multiplierToBase: 1, baseUnit: 'kg' },
  kilograms: { canonical: 'kg', family: 'weight', multiplierToBase: 1, baseUnit: 'kg' },
  g: { canonical: 'g', family: 'weight', multiplierToBase: 0.001, baseUnit: 'kg' },
  gm: { canonical: 'g', family: 'weight', multiplierToBase: 0.001, baseUnit: 'kg' },
  gms: { canonical: 'g', family: 'weight', multiplierToBase: 0.001, baseUnit: 'kg' },
  gram: { canonical: 'g', family: 'weight', multiplierToBase: 0.001, baseUnit: 'kg' },
  grams: { canonical: 'g', family: 'weight', multiplierToBase: 0.001, baseUnit: 'kg' },
  mg: { canonical: 'mg', family: 'weight', multiplierToBase: 0.000001, baseUnit: 'kg' },
  milligram: { canonical: 'mg', family: 'weight', multiplierToBase: 0.000001, baseUnit: 'kg' },
  milligrams: { canonical: 'mg', family: 'weight', multiplierToBase: 0.000001, baseUnit: 'kg' },
  lb: { canonical: 'lb', family: 'weight', multiplierToBase: 0.45359237, baseUnit: 'kg' },
  lbs: { canonical: 'lb', family: 'weight', multiplierToBase: 0.45359237, baseUnit: 'kg' },
  pound: { canonical: 'lb', family: 'weight', multiplierToBase: 0.45359237, baseUnit: 'kg' },
  pounds: { canonical: 'lb', family: 'weight', multiplierToBase: 0.45359237, baseUnit: 'kg' },
  oz: { canonical: 'oz', family: 'weight', multiplierToBase: 0.02834952, baseUnit: 'kg' },
  ounce: { canonical: 'oz', family: 'weight', multiplierToBase: 0.02834952, baseUnit: 'kg' },
  ounces: { canonical: 'oz', family: 'weight', multiplierToBase: 0.02834952, baseUnit: 'kg' },

  // --- Volume (Base: L) ---
  l: { canonical: 'L', family: 'volume', multiplierToBase: 1, baseUnit: 'L' },
  ltr: { canonical: 'L', family: 'volume', multiplierToBase: 1, baseUnit: 'L' },
  liter: { canonical: 'L', family: 'volume', multiplierToBase: 1, baseUnit: 'L' },
  liters: { canonical: 'L', family: 'volume', multiplierToBase: 1, baseUnit: 'L' },
  litre: { canonical: 'L', family: 'volume', multiplierToBase: 1, baseUnit: 'L' },
  litres: { canonical: 'L', family: 'volume', multiplierToBase: 1, baseUnit: 'L' },
  ml: { canonical: 'ml', family: 'volume', multiplierToBase: 0.001, baseUnit: 'L' },
  milliliter: { canonical: 'ml', family: 'volume', multiplierToBase: 0.001, baseUnit: 'L' },
  milliliters: { canonical: 'ml', family: 'volume', multiplierToBase: 0.001, baseUnit: 'L' },
  gal: { canonical: 'gal', family: 'volume', multiplierToBase: 3.78541, baseUnit: 'L' },
  gallon: { canonical: 'gal', family: 'volume', multiplierToBase: 3.78541, baseUnit: 'L' },
  gallons: { canonical: 'gal', family: 'volume', multiplierToBase: 3.78541, baseUnit: 'L' },

  // --- Count & Discrete Items (Base: pcs) ---
  pc: { canonical: 'pcs', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  pcs: { canonical: 'pcs', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  piece: { canonical: 'pcs', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  pieces: { canonical: 'pcs', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  ea: { canonical: 'pcs', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  each: { canonical: 'pcs', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  unit: { canonical: 'unit', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  units: { canonical: 'unit', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  item: { canonical: 'unit', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  items: { canonical: 'unit', family: 'count', multiplierToBase: 1, baseUnit: 'pcs' },
  dozen: { canonical: 'dozen', family: 'count', multiplierToBase: 12, baseUnit: 'pcs' },
  doz: { canonical: 'dozen', family: 'count', multiplierToBase: 12, baseUnit: 'pcs' },
  dz: { canonical: 'dozen', family: 'count', multiplierToBase: 12, baseUnit: 'pcs' },

  // --- Packaging / Containers ---
  box: { canonical: 'box', family: 'general', multiplierToBase: 1, baseUnit: 'box' },
  boxes: { canonical: 'box', family: 'general', multiplierToBase: 1, baseUnit: 'box' },
  bx: { canonical: 'box', family: 'general', multiplierToBase: 1, baseUnit: 'box' },
  pack: { canonical: 'pack', family: 'general', multiplierToBase: 1, baseUnit: 'pack' },
  packs: { canonical: 'pack', family: 'general', multiplierToBase: 1, baseUnit: 'pack' },
  pk: { canonical: 'pack', family: 'general', multiplierToBase: 1, baseUnit: 'pack' },
  pkg: { canonical: 'pack', family: 'general', multiplierToBase: 1, baseUnit: 'pack' },
  pkgs: { canonical: 'pack', family: 'general', multiplierToBase: 1, baseUnit: 'pack' },
  case: { canonical: 'case', family: 'general', multiplierToBase: 1, baseUnit: 'case' },
  cases: { canonical: 'case', family: 'general', multiplierToBase: 1, baseUnit: 'case' },
  cs: { canonical: 'case', family: 'general', multiplierToBase: 1, baseUnit: 'case' },
  carton: { canonical: 'carton', family: 'general', multiplierToBase: 1, baseUnit: 'carton' },
  cartons: { canonical: 'carton', family: 'general', multiplierToBase: 1, baseUnit: 'carton' },
  bag: { canonical: 'bag', family: 'general', multiplierToBase: 1, baseUnit: 'bag' },
  bags: { canonical: 'bag', family: 'general', multiplierToBase: 1, baseUnit: 'bag' },
  tray: { canonical: 'tray', family: 'general', multiplierToBase: 1, baseUnit: 'tray' },
  trays: { canonical: 'tray', family: 'general', multiplierToBase: 1, baseUnit: 'tray' },
  bottle: { canonical: 'bottle', family: 'general', multiplierToBase: 1, baseUnit: 'bottle' },
  bottles: { canonical: 'bottle', family: 'general', multiplierToBase: 1, baseUnit: 'bottle' },
  can: { canonical: 'can', family: 'general', multiplierToBase: 1, baseUnit: 'can' },
  cans: { canonical: 'can', family: 'general', multiplierToBase: 1, baseUnit: 'can' },
  roll: { canonical: 'roll', family: 'general', multiplierToBase: 1, baseUnit: 'roll' },
  rolls: { canonical: 'roll', family: 'general', multiplierToBase: 1, baseUnit: 'roll' },
};

/**
 * Normalizes any unit string to its canonical abbreviation (e.g. "kilograms" -> "kg", "pieces" -> "pcs").
 */
export function normalizeUnit(rawUnit?: string | null): string {
  if (!rawUnit) return 'kg';
  const clean = rawUnit.trim().toLowerCase().replace(/[^\w]/g, '');
  const def = CANONICAL_UNITS[clean];
  return def ? def.canonical : rawUnit.trim().toLowerCase();
}

/**
 * Extracts and normalizes the unit of measure from product names or transaction line descriptions.
 * Example inputs: "Tiger Prawns (kg)", "Flour 500g", "Wine 750ml", "Boxes of Gloves", "Paper Cups - 100 pcs"
 */
export function extractUnitFromText(
  ...texts: (string | null | undefined)[]
): string {
  for (const text of texts) {
    if (!text) continue;

    // 1. Check for number + unit: e.g. "500g", "200 kg", "25kg", "100pcs", "2L"
    const numUnitMatch = text.match(
      /\b\d+(?:\.\d+)?\s*(kg|kgs|kilos?|kilograms?|grams?|gms?|g|mg|lbs?|pounds?|oz|ounces?|lit[re]e?s?|ltrs?|l|ml|gal(?:lons?)?|pieces?|pcs?|each|ea|units?|items?|doz(?:en)?|dz|box(?:es)?|bx|packs?|pkgs?|pks?|cases?|cs|bags?|trays?|bottles?|cans?|rolls?)\b/i,
    );
    if (numUnitMatch) {
      return normalizeUnit(numUnitMatch[1]);
    }

    // 2. Check for unit in parentheses, brackets, after slash, or isolated: e.g. "(kg)", "/kg", "[pcs]", "per box"
    const standaloneMatch = text.match(
      /(?:^|[\s(/_[-])(kg|kgs|kilo|kilos|kilograms?|grams?|gms?|g|mg|lbs?|pounds?|oz|ounces?|lit[re]e?s?|ltrs?|l|ml|gal(?:lon)?s?|pieces?|pcs?|each|ea|units?|items?|doz(?:en)?|dz|box(?:es)?|bx|packs?|pkgs?|pks?|cases?|cs|bags?|trays?|bottles?|cans?|rolls?)(?=$|[\s)/_,\-\]])/i,
    );
    if (standaloneMatch) {
      return normalizeUnit(standaloneMatch[1]);
    }
  }

  // Default fallback for bulk items or unspecified lines
  return 'kg';
}

/**
 * Calculates conversion multiplier between two units of the same family.
 * Returns null if units belong to different, incompatible families.
 * Example: from 'g' to 'kg' returns 0.001.
 */
export function getUnitConversionFactor(
  fromUnit: string,
  toUnit: string,
): number | null {
  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);

  if (normFrom === normTo) return 1;

  const defFrom = CANONICAL_UNITS[normFrom.toLowerCase()];
  const defTo = CANONICAL_UNITS[normTo.toLowerCase()];

  if (!defFrom || !defTo) return null;
  if (defFrom.family !== defTo.family) return null;

  // ratio = fromMultiplier / toMultiplier
  return defFrom.multiplierToBase / defTo.multiplierToBase;
}

/**
 * Normalizes price and quantity across compatible units (e.g. converting g to kg).
 */
export function alignPriceAndQuantityToUnit(params: {
  invoicePrice: number;
  quantity: number;
  invoiceUnit: string;
  targetUnit: string;
}): {
  normalizedInvoicePrice: number;
  normalizedQuantity: number;
  effectiveUnit: string;
} {
  const { invoicePrice, quantity, invoiceUnit, targetUnit } = params;
  const factor = getUnitConversionFactor(invoiceUnit, targetUnit);

  if (factor != null && factor > 0 && factor !== 1) {
    // e.g. invoice is in g, target is in kg (factor = 0.001)
    // 200,000 g -> 200 kg; $0.016/g -> $16.00/kg
    return {
      normalizedInvoicePrice: Number((invoicePrice / factor).toFixed(4)),
      normalizedQuantity: Number((quantity * factor).toFixed(4)),
      effectiveUnit: targetUnit,
    };
  }

  return {
    normalizedInvoicePrice: invoicePrice,
    normalizedQuantity: quantity,
    effectiveUnit: invoiceUnit,
  };
}
