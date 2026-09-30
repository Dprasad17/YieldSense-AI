import { describe, expect, it } from 'vitest';
import { contextQuery } from './queries';

describe('contextQuery', () => {
  it('maps Farm · Region · Crop · Year to API query params', () => {
    expect(contextQuery({ farm: '3', region: 'India', crop: 'Rice', year: '2010' })).toEqual({
      farm_id: 3,
      region: 'India',
      crop: 'Rice',
      year_from: 2010,
      year_to: 2010,
    });
  });

  it('drops empty values', () => {
    expect(contextQuery({ farm: '', region: '', crop: '', year: '' })).toEqual({
      farm_id: undefined,
      region: undefined,
      crop: undefined,
      year_from: undefined,
      year_to: undefined,
    });
  });
});
