import { describe, expect, it } from 'vitest';
import { hasPermission, normalizeRole } from '../auth/permissions';

describe('RBAC permissions', () => {
  it('farmer sees field screens but not research or admin screens', () => {
    expect(hasPermission('Farmer', 'predict')).toBe(true);
    expect(hasPermission('Farmer', 'analytics')).toBe(true);
    expect(hasPermission('Farmer', 'eda')).toBe(false);
    expect(hasPermission('Farmer', 'dataset')).toBe(false);
    expect(hasPermission('Farmer', 'models')).toBe(false);
    expect(hasPermission('Farmer', 'users')).toBe(false);
  });

  it('agronomist adds EDA, dataset and model performance', () => {
    expect(hasPermission('Agronomist', 'eda')).toBe(true);
    expect(hasPermission('Agronomist', 'dataset')).toBe(true);
    expect(hasPermission('Agronomist', 'models')).toBe(true);
    expect(hasPermission('Agronomist', 'users')).toBe(false);
  });

  it('admin has everything', () => {
    expect(hasPermission('Admin', 'users')).toBe(true);
    expect(hasPermission('admin', 'models')).toBe(true);
  });

  it('unknown roles fall back to least privilege', () => {
    expect(normalizeRole('superuser')).toBe('Farmer');
    expect(hasPermission(undefined, 'users')).toBe(false);
  });
});
