import { describe, expect, it } from 'vitest';
import { formatExposure } from '@/lib/exposure';

describe('formatExposure', () => {
  it('keeps hours from one hour up', () => {
    expect(formatExposure(11.250707)).toBe('11.3 h');
    expect(formatExposure(1)).toBe('1.0 h');
  });
  it('shows short stacks in minutes instead of 0.0 h', () => {
    expect(formatExposure(0.04900275618959988)).toBe('2.9 min');
    expect(formatExposure(0.5833333333333334)).toBe('35 min');
    expect(formatExposure(0)).toBe('0.0 min');
  });
});
