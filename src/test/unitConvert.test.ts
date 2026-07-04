import { describe, it, expect } from 'vitest';
import { convertExpression, tryUnitShortcut } from '@/components/richtext/unitConvert';

/* ────────────── convertExpression: cheat-sheet coverage ────────────── */
describe('convertExpression – cheat sheet examples', () => {
  const cases: Array<[string, RegExp]> = [
    // Length
    ['5 km to miles', /^5 km = 3\.10686 mi$/],
    ['1 mile in km', /^1 mi = 1\.60934 km$/],
    ['100 cm in m', /^100 cm = 1 m$/],
    ['12 inch to cm', /^12 in = 30\.48 cm$/],
    // Mass
    ['2.5 kg to lb', /^2\.5 kg = 5\.51156 lb$/],
    ['16 oz in g', /^16 oz = 453\.592 g$/],
    // Volume
    ['1 gallon to liters', /^1 gal = 3\.78541 L$/],
    ['500 ml in cup', /^500 mL = 2\.11338 cup$/],
    // Temperature
    ['100 f to c', /^100 °F = 37\.7778 °C$/],
    ['0 c to f', /^0 °C = 32 °F$/],
    ['300 k to c', /^300 K = 26\.85 °C$/],
    // Data
    ['5 gb as mb', /^5 GB = 5000 MB$/],
    ['1024 mib in gib', /^1024 MiB = 1 GiB$/],
    // Time
    ['2 h in min', /^2 h = 120 min$/],
    ['48 hours to days', /^48 h = 2 d$/],
    ['1 wk in h', /^1 wk = 168 h$/],
    // Pressure
    ['1 bar in psi', /^1 bar = 14\.5038 psi$/],
    ['760 mmhg in atm', /^760 mmHg = 1(?:\.0+)? atm$/],
    // Speed
    ['50 mph in kmh', /^50 mph = 80\.4672 km\/h$/],
    ['10 m/s to km/h', /^10 m\/s = 36 km\/h$/],
    ['100 kmh in mph', /^100 km\/h = 62\.1371 mph$/],
    // Area
    ['1 acre in m2', /^1 acre = 4046\.86 m²$/],
    ['1 ha to acre', /^1 ha = 2\.47105 acre$/],
    // Energy
    ['100 kcal in kj', /^100 kcal = 418\.4 kJ$/],
    ['1 kwh to j', /^1 kWh = 3600000 J$/],
    // Fuel economy
    ['25 mpg in l100km', /^25 mpg = 9\.40858 L\/100km$/],
    // Angle
    ['180 deg to rad', /^180 ° = 3\.14159 rad$/],
    // Frequency
    ['1 ghz in mhz', /^1 GHz = 1000 MHz$/],
    // Force
    ['1 kn in lbf', /^1 kN = 224\.809 lbf$/],
  ];
  for (const [input, re] of cases) {
    it(input, () => {
      const r = convertExpression(input);
      expect(r, `no result for "${input}"`).not.toBeNull();
      expect(r!.text).toMatch(re);
    });
  }
});

describe('convertExpression – rejects invalid input', () => {
  it('cross-category returns null', () => {
    expect(convertExpression('5 km to kg')).toBeNull();
  });
  it('unknown unit returns null', () => {
    expect(convertExpression('5 zz to m')).toBeNull();
  });
  it('prose returns null', () => {
    expect(convertExpression('hello world')).toBeNull();
  });
});

/* ────────────── DOM: tryUnitShortcut = trigger ────────────── */
function setup(text: string) {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.contentEditable = 'true';
  const p = document.createElement('p');
  const tn = document.createTextNode(text);
  p.appendChild(tn);
  root.appendChild(p);
  document.body.appendChild(root);
  const range = document.createRange();
  range.setStart(tn, text.length);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return { root, tn };
}

describe('tryUnitShortcut – inline = result insertion', () => {
  const cases: Array<[string, RegExp]> = [
    ['5 km to miles', / = 3\.10686 mi$/],
    ['10 m/s to km/h', / = 36 km\/h$/],
    ['48 hours to days', / = 2 d$/],
    ['100 f to c', / = 37\.7778 °C$/],
    ['5 gb as mb', / = 5000 MB$/],
    ['2 h in min', / = 120 min$/],
    ['1 bar in psi', / = 14\.5038 psi$/],
    ['50 mph in kmh', / = 80\.4672 km\/h$/],
    ['1 acre in m2', / = 4046\.86 m²$/],
    ['100 kcal in kj', / = 418\.4 kJ$/],
    ['25 mpg in l100km', / = 9\.40858 L\/100km$/],
    ['180 deg to rad', / = 3\.14159 rad$/],
  ];
  for (const [input, re] of cases) {
    it(`immediate result for "${input}"`, () => {
      const { root, tn } = setup(input);
      expect(tryUnitShortcut(root)).toBe(true);
      expect(tn.data).toMatch(re);
    });
  }

  it('does not fire on prose', () => {
    const { root, tn } = setup('hello world');
    expect(tryUnitShortcut(root)).toBe(false);
    expect(tn.data).toBe('hello world');
  });

  it('does not fire inside code blocks', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    const tn = document.createTextNode('5 km to miles');
    code.appendChild(tn);
    pre.appendChild(code);
    root.appendChild(pre);
    document.body.appendChild(root);
    const range = document.createRange();
    range.setStart(tn, tn.data.length);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(tryUnitShortcut(root)).toBe(false);
    expect(tn.data).toBe('5 km to miles');
  });
});

/* ────────────── Extra time & velocity coverage ────────────── */
describe('convertExpression – extended time conversions', () => {
  const cases: Array<[string, RegExp]> = [
    ['90 min to h', /^90 min = 1\.5 h$/],
    ['120 min in h', /^120 min = 2 h$/],
    ['1 day to hours', /^1 d = 24 h$/],
    ['1 wk to h', /^1 wk = 168 h$/],
    ['1 yr to d', /^1 yr = 365\.25 d$/],
    ['1 yr to h', /^1 yr = 8766 h$/],
    ['30 min in s', /^30 min = 1800 s$/],
    ['5000 ms to s', /^5000 ms = 5 s$/],
    ['2.5 h to min', /^2\.5 h = 150 min$/],
    ['60 s to min', /^60 s = 1 min$/],
    ['1 h to s', /^1 h = 3600 s$/],
  ];
  for (const [input, re] of cases) {
    it(input, () => {
      const r = convertExpression(input);
      expect(r, `no result for "${input}"`).not.toBeNull();
      expect(r!.text).toMatch(re);
    });
  }
});

describe('convertExpression – extended velocity conversions', () => {
  const cases: Array<[string, RegExp]> = [
    ['10 m/s to km/h', /^10 m\/s = 36 km\/h$/],
    ['100 km/h to mph', /^100 km\/h = 62\.1371 mph$/],
    ['60 mph to km/h', /^60 mph = 96\.5606 km\/h$/],
    ['1000 mph to km/h', /^1000 mph = 1609\.34 km\/h$/],
    ['1 knot to km/h', /^1 knot = 1\.852 km\/h$/],
    ['1 mach to km/h', /^1 mach = 1234\.8 km\/h$/],
    ['1 mach to mph', /^1 mach = 767\.269 mph$/],
  ];
  for (const [input, re] of cases) {
    it(input, () => {
      const r = convertExpression(input);
      expect(r, `no result for "${input}"`).not.toBeNull();
      expect(r!.text).toMatch(re);
    });
  }
});

/* ────────────── Formatting: large numbers & repeating decimals ────────────── */
describe('convertExpression – large-number formatting', () => {
  it('keeps integer form up to 12 digits', () => {
    const r = convertExpression('1000000 km to m');
    expect(r!.text).toBe('1000000 km = 1000000000 m');
  });
  it('switches to exponential for extreme magnitudes (≥1e12)', () => {
    const r = convertExpression('1 ly to km');
    expect(r!.text).toMatch(/^1 ly = 9\.4607e\+12 km$/);
  });
  it('handles very small (< 1e-4) with exponential notation', () => {
    const r = convertExpression('1 pm to m');
    expect(r!.text).toMatch(/^1 pm = 1\.0000e-12 m$/);
  });
});

describe('convertExpression – repeating decimals round cleanly', () => {
  it('100 °F → 37.7778 °C (rounds 37.777…)', () => {
    const r = convertExpression('100 f to c');
    expect(r!.text).toBe('100 °F = 37.7778 °C');
  });
  it('1000 °F → 537.778 °C (fewer decimals as magnitude grows)', () => {
    const r = convertExpression('1000 f to c');
    expect(r!.text).toBe('1000 °F = 537.778 °C');
  });
  it('1 m → 1.09361 yd (rounds 1.0936132…)', () => {
    const r = convertExpression('1 m to yd');
    expect(r!.text).toBe('1 m = 1.09361 yd');
  });
  it('10 kg → 22.0462 lb (rounds 22.04622…)', () => {
    const r = convertExpression('10 kg to lb');
    expect(r!.text).toBe('10 kg = 22.0462 lb');
  });
  it('0.333 m → 33.3 cm (trims fp noise like 33.30000…04)', () => {
    const r = convertExpression('0.333 m to cm');
    expect(r!.text).toBe('0.333 m = 33.3 cm');
  });
  it('preserves special unit symbols (°, km/h, m/s)', () => {
    expect(convertExpression('1 c to f')!.text).toMatch(/°C = 33\.8 °F$/);
    expect(convertExpression('10 m/s to km/h')!.text).toMatch(/m\/s = 36 km\/h$/);
    expect(convertExpression('180 deg to rad')!.text).toMatch(/° = 3\.14159 rad$/);
  });
});

/* ────────────── DOM: extra time & velocity fire immediately on Space ────────────── */
describe('tryUnitShortcut – extended time & velocity render inline', () => {
  const cases: Array<[string, RegExp]> = [
    ['90 min to h', / = 1\.5 h$/],
    ['1 day to hours', / = 24 h$/],
    ['120 min in h', / = 2 h$/],
    ['2.5 h to min', / = 150 min$/],
    ['1 wk to h', / = 168 h$/],
    ['100 km/h to mph', / = 62\.1371 mph$/],
    ['60 mph to km/h', / = 96\.5606 km\/h$/],
    ['1 knot to km/h', / = 1\.852 km\/h$/],
    ['1 mach to km/h', / = 1234\.8 km\/h$/],
  ];
  for (const [input, re] of cases) {
    it(`immediate result for "${input}"`, () => {
      const { root, tn } = setup(input);
      expect(tryUnitShortcut(root)).toBe(true);
      expect(tn.data).toMatch(re);
    });
  }
});

