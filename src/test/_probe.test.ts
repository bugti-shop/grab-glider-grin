import { describe, it } from 'vitest';
import { normalizeImplicitMult } from '@/components/richtext/unitConvert';
describe('probe', () => {
  it('logs', () => {
    for (const s of [
      '2(kg)^-2(m/s)^(1/2) to N^?',
      '2(kg)^-2(m/s)^2',
      '2(kg)^2(m/s)^2(A)^3 to N^2 * A^3',
      '(kg)^-2(m/s)^-1',
      '(kg)^(1/2)(m/s)^(3/2)',
      '3(kg)^2(m)^3(s)^-1',
    ]) console.log(JSON.stringify(s), '=>', JSON.stringify(normalizeImplicitMult(s)));
  });
});
