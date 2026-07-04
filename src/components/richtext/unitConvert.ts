/**
 * Inline unit converter for the rich-text editor.
 *
 * Trigger: fires on Space keydown. Detects patterns like
 *   "10 km in miles"  |  "100 f to c"  |  "5 gb as mb"
 * at the end of the current text node and appends
 *   " = <converted> <symbol>"
 *
 * Categories supported:
 *   length, mass, volume, area, temperature, time, speed,
 *   pressure, energy, power, data (digital storage),
 *   angle, frequency, force, torque, fuel economy,
 *   illuminance, radioactivity.
 *
 * Temperature uses direct conversion (offsets); all others use
 * a shared "toBase" multiplier per category.
 */

/* ── Types ─────────────────────────────────────────────────── */

type Unit = { symbol: string; aliases: string[]; toBase: number };
type Category = { name: string; units: Unit[] };

/* ── Category table ────────────────────────────────────────── */

const CATEGORIES: Category[] = [
  {
    name: 'length',
    units: [
      { symbol: 'm', aliases: ['m', 'meter', 'meters', 'metre', 'metres'], toBase: 1 },
      { symbol: 'km', aliases: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'], toBase: 1000 },
      { symbol: 'dm', aliases: ['dm', 'decimeter', 'decimeters'], toBase: 0.1 },
      { symbol: 'cm', aliases: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'], toBase: 0.01 },
      { symbol: 'mm', aliases: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'], toBase: 0.001 },
      { symbol: 'μm', aliases: ['um', 'micrometer', 'micrometers', 'micron', 'microns', 'μm'], toBase: 1e-6 },
      { symbol: 'nm', aliases: ['nm', 'nanometer', 'nanometers'], toBase: 1e-9 },
      { symbol: 'pm', aliases: ['pm', 'picometer', 'picometers'], toBase: 1e-12 },
      { symbol: 'Å', aliases: ['angstrom', 'angstroms', 'å'], toBase: 1e-10 },
      { symbol: 'mi', aliases: ['mi', 'mile', 'miles'], toBase: 1609.344 },
      { symbol: 'yd', aliases: ['yd', 'yard', 'yards'], toBase: 0.9144 },
      { symbol: 'ft', aliases: ['ft', 'foot', 'feet'], toBase: 0.3048 },
      { symbol: 'in', aliases: ['inch', 'inches'], toBase: 0.0254 },
      { symbol: 'nmi', aliases: ['nmi', 'nauticalmile', 'nauticalmiles'], toBase: 1852 },
      { symbol: 'ly', aliases: ['ly', 'lightyear', 'lightyears'], toBase: 9.4607304725808e15 },
      { symbol: 'AU', aliases: ['au', 'astronomicalunit', 'astronomicalunits'], toBase: 1.495978707e11 },
      { symbol: 'pc', aliases: ['pc', 'parsec', 'parsecs'], toBase: 3.0856775814913673e16 },
      { symbol: 'fathom', aliases: ['fathom', 'fathoms'], toBase: 1.8288 },
      { symbol: 'furlong', aliases: ['furlong', 'furlongs'], toBase: 201.168 },
      { symbol: 'chain', aliases: ['chain', 'chains'], toBase: 20.1168 },
      { symbol: 'league', aliases: ['league', 'leagues'], toBase: 4828.032 },
    ],
  },
  {
    name: 'mass',
    units: [
      { symbol: 'kg', aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'], toBase: 1 },
      { symbol: 'g', aliases: ['g', 'gram', 'grams', 'gramme', 'grammes'], toBase: 0.001 },
      { symbol: 'mg', aliases: ['mg', 'milligram', 'milligrams'], toBase: 1e-6 },
      { symbol: 'μg', aliases: ['ug', 'microgram', 'micrograms', 'μg'], toBase: 1e-9 },
      { symbol: 't', aliases: ['t', 'tonne', 'tonnes', 'metricton', 'metrictons'], toBase: 1000 },
      { symbol: 'lb', aliases: ['lb', 'lbs', 'lbm', 'lbav', 'pound', 'pounds', 'poundmass'], toBase: 0.45359237 },
      { symbol: 'oz', aliases: ['oz', 'ounce', 'ounces'], toBase: 0.028349523125 },
      { symbol: 'st', aliases: ['st', 'stone', 'stones'], toBase: 6.35029318 },
      { symbol: 'shortton', aliases: ['shortton', 'shorttons', 'uston', 'ustons'], toBase: 907.18474 },
      { symbol: 'longton', aliases: ['longton', 'longtons', 'ukton', 'uktons'], toBase: 1016.0469088 },
      { symbol: 'ct', aliases: ['ct', 'carat', 'carats'], toBase: 0.0002 },
      { symbol: 'gr', aliases: ['gr', 'grain', 'grains'], toBase: 0.00006479891 },
      { symbol: 'slug', aliases: ['slug', 'slugs'], toBase: 14.593902937 },
      { symbol: 'amu', aliases: ['amu', 'dalton', 'daltons', 'da'], toBase: 1.66053906660e-27 },
    ],
  },
  {
    name: 'volume',
    units: [
      { symbol: 'L', aliases: ['l', 'liter', 'liters', 'litre', 'litres'], toBase: 1 },
      { symbol: 'mL', aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'cc'], toBase: 0.001 },
      { symbol: 'kL', aliases: ['kl', 'kiloliter', 'kiloliters'], toBase: 1000 },
      { symbol: 'm³', aliases: ['m3', 'cubicmeter', 'cubicmeters', 'm³'], toBase: 1000 },
      { symbol: 'cm³', aliases: ['cm3', 'cubiccentimeter', 'cubiccentimeters', 'cm³'], toBase: 0.001 },
      { symbol: 'gal', aliases: ['gal', 'gallon', 'gallons', 'usgal', 'usgallon'], toBase: 3.785411784 },
      { symbol: 'ukgal', aliases: ['ukgal', 'ukgallon', 'ukgallons', 'impgal'], toBase: 4.54609 },
      { symbol: 'qt', aliases: ['qt', 'quart', 'quarts'], toBase: 0.946352946 },
      { symbol: 'pt', aliases: ['pt', 'pint', 'pints'], toBase: 0.473176473 },
      { symbol: 'cup', aliases: ['cup', 'cups'], toBase: 0.2365882365 },
      { symbol: 'floz', aliases: ['floz', 'fluidounce', 'fluidounces'], toBase: 0.0295735295625 },
      { symbol: 'tbsp', aliases: ['tbsp', 'tablespoon', 'tablespoons'], toBase: 0.01478676478125 },
      { symbol: 'tsp', aliases: ['tsp', 'teaspoon', 'teaspoons'], toBase: 0.00492892159375 },
      { symbol: 'bbl', aliases: ['bbl', 'barrel', 'barrels', 'oilbarrel'], toBase: 158.987294928 },
      { symbol: 'ft³', aliases: ['ft3', 'cubicfoot', 'cubicfeet', 'ft³'], toBase: 28.316846592 },
      { symbol: 'in³', aliases: ['in3', 'cubicinch', 'cubicinches', 'in³'], toBase: 0.016387064 },
    ],
  },
  {
    name: 'area',
    units: [
      { symbol: 'm²', aliases: ['m2', 'sqm', 'squaremeter', 'squaremeters', 'm²'], toBase: 1 },
      { symbol: 'km²', aliases: ['km2', 'sqkm', 'squarekilometer', 'squarekilometers', 'km²'], toBase: 1e6 },
      { symbol: 'cm²', aliases: ['cm2', 'sqcm', 'squarecentimeter', 'cm²'], toBase: 1e-4 },
      { symbol: 'mm²', aliases: ['mm2', 'sqmm', 'squaremillimeter', 'mm²'], toBase: 1e-6 },
      { symbol: 'ha', aliases: ['ha', 'hectare', 'hectares'], toBase: 10000 },
      { symbol: 'acre', aliases: ['acre', 'acres'], toBase: 4046.8564224 },
      { symbol: 'mi²', aliases: ['mi2', 'sqmi', 'squaremile', 'squaremiles', 'mi²'], toBase: 2589988.110336 },
      { symbol: 'yd²', aliases: ['yd2', 'sqyd', 'squareyard', 'squareyards', 'yd²'], toBase: 0.83612736 },
      { symbol: 'ft²', aliases: ['ft2', 'sqft', 'squarefoot', 'squarefeet', 'ft²'], toBase: 0.09290304 },
      { symbol: 'in²', aliases: ['in2', 'sqin', 'squareinch', 'squareinches', 'in²'], toBase: 0.00064516 },
      { symbol: 'a', aliases: ['are', 'ares'], toBase: 100 },
    ],
  },
  {
    name: 'time',
    units: [
      { symbol: 's', aliases: ['s', 'sec', 'secs', 'second', 'seconds'], toBase: 1 },
      { symbol: 'ms', aliases: ['ms', 'millisecond', 'milliseconds'], toBase: 0.001 },
      { symbol: 'μs', aliases: ['us', 'microsecond', 'microseconds', 'μs'], toBase: 1e-6 },
      { symbol: 'ns', aliases: ['ns', 'nanosecond', 'nanoseconds'], toBase: 1e-9 },
      { symbol: 'min', aliases: ['min', 'mins', 'minute', 'minutes'], toBase: 60 },
      { symbol: 'h', aliases: ['h', 'hr', 'hrs', 'hour', 'hours'], toBase: 3600 },
      { symbol: 'd', aliases: ['d', 'day', 'days'], toBase: 86400 },
      { symbol: 'wk', aliases: ['wk', 'week', 'weeks'], toBase: 604800 },
      { symbol: 'mo', aliases: ['mo', 'month', 'months'], toBase: 2629800 }, // avg month
      { symbol: 'yr', aliases: ['yr', 'year', 'years'], toBase: 31557600 }, // Julian year
      { symbol: 'decade', aliases: ['decade', 'decades'], toBase: 315576000 },
      { symbol: 'century', aliases: ['century', 'centuries'], toBase: 3155760000 },
    ],
  },
  {
    name: 'speed',
    units: [
      { symbol: 'm/s', aliases: ['mps', 'meterspersecond', 'm/s'], toBase: 1 },
      { symbol: 'km/h', aliases: ['kmh', 'kph', 'km/h', 'kilometersperhour', 'kmph'], toBase: 1 / 3.6 },
      { symbol: 'mph', aliases: ['mph', 'milesperhour', 'mi/h'], toBase: 0.44704 },
      { symbol: 'ft/s', aliases: ['fps', 'feetpersecond', 'ft/s'], toBase: 0.3048 },
      { symbol: 'knot', aliases: ['knot', 'knots', 'kn', 'kt', 'kts', 'kts.', 'knotsperhour', 'nauticalmileperhour', 'nauticalmilesperhour'], toBase: 0.514444444 },
      { symbol: 'mach', aliases: ['mach'], toBase: 343 },
      { symbol: 'c', aliases: ['lightspeed', 'speedoflight'], toBase: 299792458 },
    ],
  },
  {
    name: 'pressure',
    units: [
      { symbol: 'Pa', aliases: ['pa', 'pascal', 'pascals'], toBase: 1 },
      { symbol: 'kPa', aliases: ['kpa', 'kilopascal', 'kilopascals'], toBase: 1000 },
      { symbol: 'MPa', aliases: ['mpa', 'megapascal', 'megapascals'], toBase: 1e6 },
      { symbol: 'hPa', aliases: ['hpa', 'hectopascal', 'hectopascals'], toBase: 100 },
      { symbol: 'bar', aliases: ['bar', 'bars'], toBase: 100000 },
      { symbol: 'mbar', aliases: ['mbar', 'millibar', 'millibars'], toBase: 100 },
      { symbol: 'atm', aliases: ['atm', 'atmosphere', 'atmospheres'], toBase: 101325 },
      { symbol: 'psi', aliases: ['psi', 'poundpersquareinch'], toBase: 6894.757293168 },
      { symbol: 'torr', aliases: ['torr'], toBase: 133.322387415 },
      { symbol: 'mmHg', aliases: ['mmhg', 'millimetermercury'], toBase: 133.322387415 },
      { symbol: 'inHg', aliases: ['inhg', 'inchmercury'], toBase: 3386.389 },
    ],
  },
  {
    name: 'energy',
    units: [
      { symbol: 'J', aliases: ['j', 'joule', 'joules'], toBase: 1 },
      { symbol: 'kJ', aliases: ['kj', 'kilojoule', 'kilojoules'], toBase: 1000 },
      { symbol: 'MJ', aliases: ['mj', 'megajoule', 'megajoules'], toBase: 1e6 },
      { symbol: 'cal', aliases: ['cal', 'calorie', 'calories'], toBase: 4.184 },
      { symbol: 'kcal', aliases: ['kcal', 'kilocalorie', 'kilocalories', 'foodcal'], toBase: 4184 },
      { symbol: 'Wh', aliases: ['wh', 'watthour', 'watthours'], toBase: 3600 },
      { symbol: 'kWh', aliases: ['kwh', 'kilowatthour', 'kilowatthours'], toBase: 3.6e6 },
      { symbol: 'MWh', aliases: ['mwh', 'megawatthour', 'megawatthours'], toBase: 3.6e9 },
      { symbol: 'eV', aliases: ['ev', 'electronvolt', 'electronvolts'], toBase: 1.602176634e-19 },
      { symbol: 'BTU', aliases: ['btu'], toBase: 1055.05585262 },
      { symbol: 'therm', aliases: ['therm', 'therms'], toBase: 1.05505585262e8 },
      { symbol: 'ftlb', aliases: ['ftlb', 'ftlbf', 'footpound', 'footpounds'], toBase: 1.3558179483 },
    ],
  },
  {
    name: 'power',
    units: [
      { symbol: 'W', aliases: ['w', 'watt', 'watts'], toBase: 1 },
      { symbol: 'kW', aliases: ['kw', 'kilowatt', 'kilowatts'], toBase: 1000 },
      { symbol: 'MW', aliases: ['mw', 'megawatt', 'megawatts'], toBase: 1e6 },
      { symbol: 'GW', aliases: ['gw', 'gigawatt', 'gigawatts'], toBase: 1e9 },
      { symbol: 'mW', aliases: ['milliwatt', 'milliwatts'], toBase: 0.001 },
      { symbol: 'hp', aliases: ['hp', 'horsepower'], toBase: 745.6998715822702 },
      { symbol: 'PS', aliases: ['ps', 'metrichorsepower'], toBase: 735.49875 },
      { symbol: 'BTU/h', aliases: ['btuh', 'btu/h'], toBase: 0.29307107 },
      { symbol: 'ftlb/s', aliases: ['ftlbs', 'ftlb/s'], toBase: 1.3558179483 },
    ],
  },
  {
    name: 'data',
    units: [
      { symbol: 'B', aliases: ['b', 'byte', 'bytes'], toBase: 1 },
      { symbol: 'bit', aliases: ['bit', 'bits'], toBase: 0.125 },
      { symbol: 'KB', aliases: ['kb', 'kilobyte', 'kilobytes'], toBase: 1000 },
      { symbol: 'MB', aliases: ['mb', 'megabyte', 'megabytes'], toBase: 1e6 },
      { symbol: 'GB', aliases: ['gb', 'gigabyte', 'gigabytes'], toBase: 1e9 },
      { symbol: 'TB', aliases: ['tb', 'terabyte', 'terabytes'], toBase: 1e12 },
      { symbol: 'PB', aliases: ['pb', 'petabyte', 'petabytes'], toBase: 1e15 },
      { symbol: 'EB', aliases: ['eb', 'exabyte', 'exabytes'], toBase: 1e18 },
      { symbol: 'KiB', aliases: ['kib', 'kibibyte', 'kibibytes'], toBase: 1024 },
      { symbol: 'MiB', aliases: ['mib', 'mebibyte', 'mebibytes'], toBase: 1024 ** 2 },
      { symbol: 'GiB', aliases: ['gib', 'gibibyte', 'gibibytes'], toBase: 1024 ** 3 },
      { symbol: 'TiB', aliases: ['tib', 'tebibyte', 'tebibytes'], toBase: 1024 ** 4 },
      { symbol: 'PiB', aliases: ['pib', 'pebibyte', 'pebibytes'], toBase: 1024 ** 5 },
      { symbol: 'kbit', aliases: ['kbit', 'kilobit', 'kilobits'], toBase: 125 },
      { symbol: 'Mbit', aliases: ['mbit', 'megabit', 'megabits'], toBase: 125000 },
      { symbol: 'Gbit', aliases: ['gbit', 'gigabit', 'gigabits'], toBase: 1.25e8 },
    ],
  },
  {
    name: 'angle',
    units: [
      { symbol: 'rad', aliases: ['rad', 'radian', 'radians'], toBase: 1 },
      { symbol: '°', aliases: ['deg', 'degree', 'degrees', '°'], toBase: Math.PI / 180 },
      { symbol: 'grad', aliases: ['grad', 'gradian', 'gradians', 'gon'], toBase: Math.PI / 200 },
      { symbol: 'arcmin', aliases: ['arcmin', 'arcminute', 'arcminutes'], toBase: Math.PI / 10800 },
      { symbol: 'arcsec', aliases: ['arcsec', 'arcsecond', 'arcseconds'], toBase: Math.PI / 648000 },
      { symbol: 'turn', aliases: ['turn', 'turns', 'rev', 'revolution', 'revolutions'], toBase: 2 * Math.PI },
    ],
  },
  {
    name: 'frequency',
    units: [
      { symbol: 'Hz', aliases: ['hz', 'hertz'], toBase: 1 },
      { symbol: 'kHz', aliases: ['khz', 'kilohertz'], toBase: 1000 },
      { symbol: 'MHz', aliases: ['mhz', 'megahertz'], toBase: 1e6 },
      { symbol: 'GHz', aliases: ['ghz', 'gigahertz'], toBase: 1e9 },
      { symbol: 'THz', aliases: ['thz', 'terahertz'], toBase: 1e12 },
      { symbol: 'rpm', aliases: ['rpm'], toBase: 1 / 60 },
      { symbol: 'bpm', aliases: ['bpm'], toBase: 1 / 60 },
    ],
  },
  {
    name: 'force',
    units: [
      { symbol: 'N', aliases: ['n', 'newton', 'newtons'], toBase: 1 },
      { symbol: 'kN', aliases: ['kn', 'kilonewton', 'kilonewtons'], toBase: 1000 },
      { symbol: 'MN', aliases: ['meganewton', 'meganewtons'], toBase: 1e6 },
      { symbol: 'dyn', aliases: ['dyn', 'dyne', 'dynes'], toBase: 1e-5 },
      { symbol: 'lbf', aliases: ['lbf', 'poundforce'], toBase: 4.4482216152605 },
      { symbol: 'kgf', aliases: ['kgf', 'kilogramforce'], toBase: 9.80665 },
      { symbol: 'ozf', aliases: ['ozf', 'ounceforce'], toBase: 0.27801385095378125 },
    ],
  },
  {
    name: 'torque',
    units: [
      { symbol: 'Nm', aliases: ['nm', 'newtonmeter', 'newtonmeters'], toBase: 1 },
      { symbol: 'kNm', aliases: ['knm', 'kilonewtonmeter'], toBase: 1000 },
      { symbol: 'lbft', aliases: ['lbft', 'poundfoot', 'poundfeet'], toBase: 1.3558179483 },
      { symbol: 'lbin', aliases: ['lbin', 'poundinch'], toBase: 0.1129848290 },
      { symbol: 'kgm', aliases: ['kgm', 'kilogrammeter'], toBase: 9.80665 },
    ],
  },
  {
    name: 'illuminance',
    units: [
      { symbol: 'lx', aliases: ['lx', 'lux'], toBase: 1 },
      { symbol: 'fc', aliases: ['fc', 'footcandle', 'footcandles'], toBase: 10.76391 },
      { symbol: 'ph', aliases: ['ph', 'phot'], toBase: 10000 },
    ],
  },
  {
    name: 'radioactivity',
    units: [
      { symbol: 'Bq', aliases: ['bq', 'becquerel', 'becquerels'], toBase: 1 },
      { symbol: 'kBq', aliases: ['kbq'], toBase: 1000 },
      { symbol: 'MBq', aliases: ['mbq'], toBase: 1e6 },
      { symbol: 'Ci', aliases: ['ci', 'curie', 'curies'], toBase: 3.7e10 },
      { symbol: 'mCi', aliases: ['mci', 'millicurie'], toBase: 3.7e7 },
    ],
  },
];

/* ── Fuel economy (non-linear across systems) & Temperature: special ── */

const TEMP_ALIASES: Record<string, string> = {
  c: 'c', celsius: 'c', centigrade: 'c', '°c': 'c',
  f: 'f', fahrenheit: 'f', '°f': 'f',
  k: 'k', kelvin: 'k',
  r: 'r', rankine: 'r', '°r': 'r',
};

function convertTemp(v: number, from: string, to: string): number | null {
  const a = TEMP_ALIASES[from];
  const b = TEMP_ALIASES[to];
  if (!a || !b) return null;
  let k: number;
  if (a === 'c') k = v + 273.15;
  else if (a === 'f') k = (v - 32) * 5 / 9 + 273.15;
  else if (a === 'r') k = v * 5 / 9;
  else k = v;
  if (b === 'c') return k - 273.15;
  if (b === 'f') return (k - 273.15) * 9 / 5 + 32;
  if (b === 'r') return k * 9 / 5;
  return k;
}

const FUEL_ALIASES: Record<string, 'mpg' | 'mpguk' | 'kpl' | 'l100km'> = {
  mpg: 'mpg', mpgus: 'mpg',
  mpguk: 'mpguk', mpgimp: 'mpguk',
  kpl: 'kpl', kmpl: 'kpl', 'km/l': 'kpl',
  l100km: 'l100km', 'l/100km': 'l100km',
};

function convertFuel(v: number, from: string, to: string): number | null {
  const a = FUEL_ALIASES[from];
  const b = FUEL_ALIASES[to];
  if (!a || !b) return null;
  // Normalize to km/L.
  let kpl: number;
  if (a === 'kpl') kpl = v;
  else if (a === 'mpg') kpl = v * 0.425143707;
  else if (a === 'mpguk') kpl = v * 0.354006189;
  else kpl = 100 / v; // l100km
  if (b === 'kpl') return kpl;
  if (b === 'mpg') return kpl / 0.425143707;
  if (b === 'mpguk') return kpl / 0.354006189;
  return 100 / kpl;
}

/* ── Alias index ───────────────────────────────────────────── */

type Resolved = { category: string; symbol: string; toBase: number };
const INDEX: Map<string, Resolved> = new Map();
for (const cat of CATEGORIES) {
  for (const u of cat.units) {
    for (const a of u.aliases) INDEX.set(a.toLowerCase(), { category: cat.name, symbol: u.symbol, toBase: u.toBase });
  }
}

function resolveUnit(token: string): Resolved | 'temp' | 'fuel' | null {
  const t = token.toLowerCase().replace(/\s+/g, '');
  if (TEMP_ALIASES[t]) return 'temp';
  if (FUEL_ALIASES[t]) return 'fuel';
  return INDEX.get(t) || null;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e12)) return n.toExponential(4);
  const s = n.toPrecision(6);
  return parseFloat(s).toString();
}

/* ── Main entry ────────────────────────────────────────────── */

export type ConvertResult = {
  value: number;
  result: number;
  fromSymbol: string;
  toSymbol: string;
  /** Formatted "X unit = Y unit" string. */
  text: string;
};

/**
 * Convert a free-form expression like "10 km in miles", "100 f to c",
 * "5 gb as mb". Returns null if the parser can't resolve both sides.
 */
export function convertExpression(input: string): ConvertResult | null {
  const trimmed = input.trim();
  const m = /^(-?\d+(?:\.\d+)?)\s*([A-Za-z°²³\/][A-Za-z0-9°²³\/]*)\s+(?:in|to|as|->|=)\s+([A-Za-z°²³\/][A-Za-z0-9°²³\/]*)$/i.exec(trimmed);
  if (!m) return null;

  const value = parseFloat(m[1]);
  const fromRes = resolveUnit(m[2]);
  const toRes = resolveUnit(m[3]);
  if (!fromRes || !toRes) return null;

  let out: number | null = null;
  let toSymbol = '';
  let fromSymbol = m[2];

  if (fromRes === 'temp' && toRes === 'temp') {
    const from = m[2].toLowerCase().replace(/\s+/g, '');
    const to = m[3].toLowerCase().replace(/\s+/g, '');
    out = convertTemp(value, from, to);
    toSymbol = to === 'c' ? '°C' : to === 'f' ? '°F' : to === 'r' ? '°R' : 'K';
    fromSymbol = from === 'c' ? '°C' : from === 'f' ? '°F' : from === 'r' ? '°R' : 'K';
  } else if (fromRes === 'fuel' && toRes === 'fuel') {
    const from = m[2].toLowerCase().replace(/\s+/g, '');
    const to = m[3].toLowerCase().replace(/\s+/g, '');
    out = convertFuel(value, from, to);
    toSymbol = to === 'kpl' ? 'km/L' : to === 'mpg' ? 'mpg' : to === 'mpguk' ? 'mpg (UK)' : 'L/100km';
    fromSymbol = from === 'kpl' ? 'km/L' : from === 'mpg' ? 'mpg' : from === 'mpguk' ? 'mpg (UK)' : 'L/100km';
  } else if (typeof fromRes === 'object' && typeof toRes === 'object' && fromRes.category === toRes.category) {
    out = (value * fromRes.toBase) / toRes.toBase;
    toSymbol = toRes.symbol;
    fromSymbol = fromRes.symbol;
  } else {
    return null;
  }

  if (out === null || !Number.isFinite(out)) return null;

  return {
    value,
    result: out,
    fromSymbol,
    toSymbol,
    text: `${formatNum(value)} ${fromSymbol} = ${formatNum(out)} ${toSymbol}`,
  };
}

/**
 * Detects "<num> <unit> (in|to|as) <unit>" at end of the current text node
 * and appends " = <converted> <symbol>". Fired on Space keydown.
 */
export function tryUnitShortcut(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const textNode = node as Text;
  const caret = range.startOffset;
  const before = textNode.data.slice(0, caret);

  if (isInsideCodeLikeBlock(textNode, root)) return false;

  const m = /(?:^|[\s(])(-?\d+(?:\.\d+)?\s*[A-Za-z°²³\/][A-Za-z0-9°²³\/]*\s+(?:in|to|as|->|=)\s+[A-Za-z°²³\/][A-Za-z0-9°²³\/]*)$/i.exec(before);
  if (!m) return false;

  const conv = convertExpression(m[1]);
  if (!conv) return false;

  const insertion = ` = ${formatNum(conv.result)} ${conv.toSymbol}`;
  const after = textNode.data.slice(caret);
  textNode.data = textNode.data.slice(0, caret) + insertion + after;
  const nr = document.createRange();
  nr.setStart(textNode, caret + insertion.length);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
  return true;
}

function isInsideCodeLikeBlock(node: Node, root: HTMLElement): boolean {
  let el: Node | null = node.nodeType === 1 ? node : node.parentNode;
  while (el && el !== root) {
    if (el.nodeType === 1) {
      const tag = (el as HTMLElement).tagName;
      if (tag === 'CODE' || tag === 'PRE') return true;
      const cls = (el as HTMLElement).classList;
      if (cls?.contains('rt-codeblock') || cls?.contains('rt-katex')) return true;
    }
    el = el.parentNode;
  }
  return false;
}

