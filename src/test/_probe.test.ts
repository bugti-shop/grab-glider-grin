import { describe, it } from 'vitest';
import { normalizeImplicitMult } from '@/components/richtext/unitConvert';
describe('probe', () => {
  it('logs', () => {
    for (const s of [
      '2(kg)^2( m/s )^2 to N^2',
      '2(kg)^2(m/s)^2',
      '(kg)^2(m/s)^2',
      '(kg)^2 (m/s)^2',
      '3(m)^2(s)^-1',
    ]) console.log(JSON.stringify(s), '=>', JSON.stringify(normalizeImplicitMult(s)));
  });
});
