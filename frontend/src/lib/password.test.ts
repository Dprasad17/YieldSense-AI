import { describe, expect, it } from 'vitest';
import { passwordStrength } from './password';

describe('passwordStrength', () => {
  it('scores length and variety', () => {
    expect(passwordStrength('abc').score).toBe(0);
    expect(passwordStrength('abcdefgh').label).toBe('Weak');
    expect(passwordStrength('Abcdefgh1!').score).toBe(3);
    expect(passwordStrength('Abcdefghijk1!').label).toBe('Strong');
  });
});
