import {
  alignPriceAndQuantityToUnit,
  extractUnitFromText,
  getUnitConversionFactor,
  normalizeUnit,
} from './unit.util';

describe('Unit Utilities (Handling kg, grams, pieces, boxes, etc.)', () => {
  describe('normalizeUnit', () => {
    it('normalizes weight units', () => {
      expect(normalizeUnit('kg')).toBe('kg');
      expect(normalizeUnit('KGS')).toBe('kg');
      expect(normalizeUnit('kilograms')).toBe('kg');
      expect(normalizeUnit('g')).toBe('g');
      expect(normalizeUnit('grams')).toBe('g');
      expect(normalizeUnit('lb')).toBe('lb');
      expect(normalizeUnit('pounds')).toBe('lb');
    });

    it('normalizes volume units', () => {
      expect(normalizeUnit('L')).toBe('L');
      expect(normalizeUnit('litres')).toBe('L');
      expect(normalizeUnit('ml')).toBe('ml');
      expect(normalizeUnit('gallon')).toBe('gal');
    });

    it('normalizes count and packaging units', () => {
      expect(normalizeUnit('pcs')).toBe('pcs');
      expect(normalizeUnit('pieces')).toBe('pcs');
      expect(normalizeUnit('each')).toBe('pcs');
      expect(normalizeUnit('ea')).toBe('pcs');
      expect(normalizeUnit('dozen')).toBe('dozen');
      expect(normalizeUnit('box')).toBe('box');
      expect(normalizeUnit('boxes')).toBe('box');
      expect(normalizeUnit('pack')).toBe('pack');
      expect(normalizeUnit('case')).toBe('case');
    });
  });

  describe('extractUnitFromText', () => {
    it('extracts units from parentheses or descriptions', () => {
      expect(extractUnitFromText('Tiger Prawns (kg)')).toBe('kg');
      expect(extractUnitFromText('Fresh Atlantic Salmon (500g)')).toBe('g');
      expect(extractUnitFromText('Napkins - 100 pcs')).toBe('pcs');
      expect(extractUnitFromText('Olive Oil 5L')).toBe('L');
      expect(extractUnitFromText('Wine (box of 6)')).toBe('box');
      expect(extractUnitFromText('Organic Eggs (1 dozen)')).toBe('dozen');
    });

    it('falls back to kg when no unit is specified', () => {
      expect(extractUnitFromText('Generic Product', undefined)).toBe('kg');
    });
  });

  describe('getUnitConversionFactor', () => {
    it('converts grams to kg', () => {
      const factor = getUnitConversionFactor('g', 'kg');
      expect(factor).toBeCloseTo(0.001);
    });

    it('converts kg to grams', () => {
      const factor = getUnitConversionFactor('kg', 'g');
      expect(factor).toBeCloseTo(1000);
    });

    it('converts dozen to pcs', () => {
      const factor = getUnitConversionFactor('dozen', 'pcs');
      expect(factor).toBe(12);
    });

    it('returns null for incompatible units (e.g. kg vs pcs)', () => {
      const factor = getUnitConversionFactor('kg', 'pcs');
      expect(factor).toBeNull();
    });
  });

  describe('alignPriceAndQuantityToUnit', () => {
    it('accurately normalizes price and quantity when invoiced in grams vs agreed in kg', () => {
      // e.g. Agreed is $14.00/kg. Invoiced is 200,000g at $0.016/g.
      const result = alignPriceAndQuantityToUnit({
        invoicePrice: 0.016,
        quantity: 200000,
        invoiceUnit: 'g',
        targetUnit: 'kg',
      });

      expect(result.effectiveUnit).toBe('kg');
      expect(result.normalizedInvoicePrice).toBe(16.0); // $16.00/kg
      expect(result.normalizedQuantity).toBe(200.0); // 200 kg
    });

    it('preserves values when units are already identical', () => {
      const result = alignPriceAndQuantityToUnit({
        invoicePrice: 16.0,
        quantity: 200,
        invoiceUnit: 'kg',
        targetUnit: 'kg',
      });

      expect(result.effectiveUnit).toBe('kg');
      expect(result.normalizedInvoicePrice).toBe(16.0);
      expect(result.normalizedQuantity).toBe(200);
    });

    it('preserves discrete units (e.g. pcs or boxes)', () => {
      const result = alignPriceAndQuantityToUnit({
        invoicePrice: 25.0,
        quantity: 10,
        invoiceUnit: 'box',
        targetUnit: 'box',
      });

      expect(result.effectiveUnit).toBe('box');
      expect(result.normalizedInvoicePrice).toBe(25.0);
      expect(result.normalizedQuantity).toBe(10);
    });
  });
});
