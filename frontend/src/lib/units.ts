export type YieldUnit = 'kg/ha' | 't/ha';

export const YIELD_UNITS: readonly YieldUnit[] = ['kg/ha', 't/ha'];

/** Converts a yield stored in kg/ha (the API's unit) into the display unit. */
export function convertYield(kgPerHa: number, unit: YieldUnit): number {
  return unit === 't/ha' ? kgPerHa / 1000 : kgPerHa;
}

export function isYieldUnit(value: unknown): value is YieldUnit {
  return value === 'kg/ha' || value === 't/ha';
}
