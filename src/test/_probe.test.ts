import { describe, it } from 'vitest';
import { normalizeImplicitMult } from '@/components/richtext/unitConvert';
describe('probe', () => {
  it('logs', () => {
    for (const s of [
      '((kg)(m/s))^2',
      '((kg)(m/s))^2 to (kg*m/s)^2',
      '(kg*m/s)^2',
      '((m)(s))^3',
      '2((kg)(m))^2',
    ]) console.log(JSON.stringify(s), '=>', JSON.stringify(normalizeImplicitMult(s)));
  });
});
