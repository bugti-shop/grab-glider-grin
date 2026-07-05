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
      { symbol: 'yd³', aliases: ['yd3', 'cubicyard', 'cubicyards', 'yd³'], toBase: 764.554857984 },
      { symbol: 'dm³', aliases: ['dm3', 'cubicdecimeter', 'cubicdecimeters', 'dm³'], toBase: 1 },
      { symbol: 'cl', aliases: ['cl', 'centiliter', 'centiliters', 'centilitre', 'centilitres'], toBase: 0.01 },
      { symbol: 'dl', aliases: ['dl', 'deciliter', 'deciliters', 'decilitre', 'decilitres'], toBase: 0.1 },
      { symbol: 'hl', aliases: ['hl', 'hectoliter', 'hectoliters', 'hectolitre', 'hectolitres'], toBase: 100 },
      { symbol: 'ukgal', aliases: ['gallonuk', 'gallonsuk'], toBase: 4.54609 },
      { symbol: 'ukqt', aliases: ['ukqt', 'ukquart', 'quartuk'], toBase: 1.1365225 },
      { symbol: 'ukpt', aliases: ['ukpt', 'ukpint', 'pintuk'], toBase: 0.5682612 },
      { symbol: 'ukfloz', aliases: ['ukfloz', 'ukfluidounce', 'fluidounceuk'], toBase: 0.0284130625 },
      { symbol: 'cup(200)', aliases: ['cup200', 'cup200ml'], toBase: 0.2 },
      { symbol: 'cup(240)', aliases: ['cup240', 'cup240ml'], toBase: 0.24 },
      { symbol: 'cup(250)', aliases: ['cup250', 'cup250ml', 'metriccup'], toBase: 0.25 },
      { symbol: 'tbsp(15)', aliases: ['tbsp15', 'tbsp15ml', 'metrictbsp'], toBase: 0.015 },
      { symbol: 'tsp(5)', aliases: ['tsp5', 'tsp5ml', 'metrictsp'], toBase: 0.005 },
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
      { symbol: 'm/h', aliases: ['mh', 'metersperhour', 'm/h'], toBase: 1 / 3600 },
      { symbol: 'km/s', aliases: ['kms', 'kilometerspersecond', 'km/s'], toBase: 1000 },
      { symbol: 'km/h', aliases: ['kmh', 'kph', 'km/h', 'kilometersperhour', 'kmph'], toBase: 1 / 3.6 },
      { symbol: 'mph', aliases: ['mph', 'milesperhour', 'mi/h'], toBase: 0.44704 },
      { symbol: 'mi/s', aliases: ['mis', 'milespersecond', 'mi/s'], toBase: 1609.344 },
      { symbol: 'ft/s', aliases: ['fps', 'feetpersecond', 'ft/s'], toBase: 0.3048 },
      { symbol: 'ft/h', aliases: ['fth', 'feetperhour', 'ft/h'], toBase: 0.3048 / 3600 },
      { symbol: 'in/s', aliases: ['ins', 'inchespersecond', 'in/s'], toBase: 0.0254 },
      { symbol: 'in/h', aliases: ['inh', 'inchesperhour', 'in/h'], toBase: 0.0254 / 3600 },
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
      { symbol: 'inHg', aliases: ['inhg', 'inchmercury', 'inchhg'], toBase: 3386.389 },
      { symbol: 'mmH2O', aliases: ['mmh2o', 'mmwater', 'millimeterwater'], toBase: 9.80665 },
      { symbol: 'inH2O', aliases: ['inh2o', 'inchh2o', 'inchwater'], toBase: 249.08891 },
      { symbol: 'dyn/cm²', aliases: ['dyncm2', 'dyne/cm2', 'dynepercm2'], toBase: 0.1 },
      { symbol: 'kN/m²', aliases: ['knm2', 'kn/m2', 'kilonewtonpersquaremeter'], toBase: 1000 },
      { symbol: 'kgf/cm²', aliases: ['kgfcm2', 'kgf/cm2', 'kgfpercm2'], toBase: 98066.5 },
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
      { symbol: 'GJ', aliases: ['gj', 'gigajoule', 'gigajoules'], toBase: 1e9 },
      { symbol: 'Ws', aliases: ['ws', 'wattsecond', 'wattseconds'], toBase: 1 },
      { symbol: 'GWh', aliases: ['gwh', 'gigawatthour', 'gigawatthours'], toBase: 3.6e12 },
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
      { symbol: 'dBm', aliases: ['dbm', 'decibelmilliwatt'], toBase: 0.001 },
      { symbol: 'dBW', aliases: ['dbw', 'decibelwatt'], toBase: 1 },
      { symbol: 'kcal/h', aliases: ['kcalh', 'kcal/h', 'kilocalorieperhour'], toBase: 1.163 },
      { symbol: 'Mcal/h', aliases: ['mcalh', 'mcal/h', 'megacalorieperhour'], toBase: 1163 },
      { symbol: 'Gcal/h', aliases: ['gcalh', 'gcal/h', 'gigacalorieperhour'], toBase: 1.163e6 },
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
      { symbol: 'gf', aliases: ['gf', 'gramforce'], toBase: 0.00980665 },
      { symbol: 'pdl', aliases: ['pdl', 'poundal', 'poundals'], toBase: 0.138254954376 },
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

type FuelKind = 'mpg' | 'mpguk' | 'kpl' | 'l100km' | 'mipl' | 'kmgalus' | 'kmgaluk' | 'gal100mius' | 'gal100miuk';

const FUEL_ALIASES: Record<string, FuelKind> = {
  mpg: 'mpg', mpgus: 'mpg', usmpg: 'mpg', mpgusa: 'mpg', 'mi/gal': 'mpg', 'mile/gal': 'mpg', 'miles/gal': 'mpg',
  'mi/usgal': 'mpg', 'mi/usgallon': 'mpg', 'mile/usgal': 'mpg', 'mile/usgallon': 'mpg', 'miles/usgallon': 'mpg',
  migalus: 'mpg', milepergallon: 'mpg', milespergallon: 'mpg', mileperusgallon: 'mpg', milesperusgallon: 'mpg', milespergallonus: 'mpg',
  mpguk: 'mpguk', ukmpg: 'mpguk', mpgimp: 'mpguk', impmpg: 'mpguk', imperialmpg: 'mpguk', 'mi/ukgal': 'mpguk', 'mi/ukgallon': 'mpguk',
  'mile/ukgallon': 'mpguk', 'miles/ukgallon': 'mpguk', 'mi/impgal': 'mpguk', 'mi/imperialgallon': 'mpguk', 'mile/imperialgallon': 'mpguk',
  'miles/imperialgallon': 'mpguk', migaluk: 'mpguk', mileperukgallon: 'mpguk', milesperukgallon: 'mpguk', mileperimperialgallon: 'mpguk', milesperimperialgallon: 'mpguk', milespergallonuk: 'mpguk',
  kpl: 'kpl', kmpl: 'kpl', 'km/l': 'kpl', kml: 'kpl', kilometerperliter: 'kpl', kilometersperliter: 'kpl',
  l100km: 'l100km', 'l/100km': 'l100km',
  mipl: 'mipl', 'mi/l': 'mipl', milesperliter: 'mipl',
  kmgalus: 'kmgalus', 'km/gal': 'kmgalus', 'km/galus': 'kmgalus', kilometerpergallonus: 'kmgalus',
  kmgaluk: 'kmgaluk', 'km/galuk': 'kmgaluk', kilometerpergallonuk: 'kmgaluk',
  gal100mius: 'gal100mius', 'gal/100mi': 'gal100mius', 'gal/100mius': 'gal100mius',
  gal100miuk: 'gal100miuk', 'gal/100miuk': 'gal100miuk',
};

function normalizeUnitKey(token: string): string {
  return token.toLowerCase().replace(/[\s._-]+/g, '');
}

function normalizeUnitPhrases(input: string): string {
  let s = input;
  const mile = String.raw`(?:mi|mile|miles)`;
  const usGallon = String.raw`(?:u\.?\s*s\.?|us|usa|american)\s*gal(?:lon)?s?`;
  const ukGallon = String.raw`(?:u\.?\s*k\.?|uk|imp|imperial)\s*gal(?:lon)?s?`;
  const gallon = String.raw`gal(?:lon)?s?`;

  // Fuel economy phrases with spaces/punctuation must be compacted before the
  // main parser sees them, otherwise `mile/US gallon` is split as multiple units.
  s = s.replace(new RegExp(`\\b${mile}\\s*(?:/|per)\\s*${ukGallon}\\b`, 'gi'), 'mpguk');
  s = s.replace(new RegExp(`\\b${mile}\\s*(?:/|per)\\s*${usGallon}\\b`, 'gi'), 'mpg');
  s = s.replace(new RegExp(`\\b${mile}\\s*(?:/|per)\\s*${gallon}\\b`, 'gi'), 'mpg');
  s = s.replace(/\b(?:u\.?\s*k\.?|uk|imp|imperial)\s*mpg\b/gi, 'mpguk');
  s = s.replace(/\bmpg\s*(?:u\.?\s*k\.?|uk|imp|imperial)\b/gi, 'mpguk');
  s = s.replace(/\b(?:u\.?\s*s\.?|us|usa|american)\s*mpg\b/gi, 'mpg');
  s = s.replace(/\bmpg\s*(?:u\.?\s*s\.?|us|usa|american)\b/gi, 'mpg');

  // Common spaced volume aliases used with fuel expressions.
  s = s.replace(new RegExp(`\\b${ukGallon}\\b`, 'gi'), 'ukgal');
  s = s.replace(new RegExp(`\\b${usGallon}\\b`, 'gi'), 'gal');
  return s;
}

function convertFuel(v: number, from: string, to: string): number | null {
  const a = FUEL_ALIASES[normalizeUnitKey(from)];
  const b = FUEL_ALIASES[normalizeUnitKey(to)];
  if (!a || !b) return null;
  // Normalize to km/L.
  let kpl: number;
  if (a === 'kpl') kpl = v;
  else if (a === 'mpg') kpl = v * 0.425143707;
  else if (a === 'mpguk') kpl = v * 0.354006189;
  else if (a === 'l100km') kpl = 100 / v;
  else if (a === 'mipl') kpl = v * 1.609344;
  else if (a === 'kmgalus') kpl = v / 3.785411784;
  else if (a === 'kmgaluk') kpl = v / 4.54609;
  else if (a === 'gal100mius') kpl = (100 * 1.609344) / (v * 3.785411784);
  else kpl = (100 * 1.609344) / (v * 4.54609); // gal100miuk
  if (b === 'kpl') return kpl;
  if (b === 'mpg') return kpl / 0.425143707;
  if (b === 'mpguk') return kpl / 0.354006189;
  if (b === 'l100km') return 100 / kpl;
  if (b === 'mipl') return kpl / 1.609344;
  if (b === 'kmgalus') return kpl * 3.785411784;
  if (b === 'kmgaluk') return kpl * 4.54609;
  if (b === 'gal100mius') return (100 * 1.609344) / (kpl * 3.785411784);
  return (100 * 1.609344) / (kpl * 4.54609);
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
  const t = normalizeUnitKey(token);
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
  const normalized = normalizeUnitPhrases(input);
  const reduced = normalized.includes('(') ? reduceParens(normalized) : normalized;
  if (reduced === null) return null;
  const trimmed = reduced.trim();
  const m = /^([+-]?\d+(?:\.\d+)?)\s*([A-Za-z°²³\/][A-Za-z0-9°²³\/]*)\s+(?:in|to|as|->|=)\s+([A-Za-z°²³\/][A-Za-z0-9°²³\/]*)$/i.exec(trimmed);
  if (!m) {
    // Fall through to mixed (mul/div) form so callers get a single entry point.
    return convertMixedExpression(trimmed);
  }

  const value = parseFloat(m[1]);
  const fromRes = resolveUnit(m[2]);
  const toRes = resolveUnit(m[3]);
  if (!fromRes || !toRes) return null;

  let out: number | null = null;
  let toSymbol = '';
  let fromSymbol = m[2];

  if (fromRes === 'temp' && toRes === 'temp') {
    const from = normalizeUnitKey(m[2]);
    const to = normalizeUnitKey(m[3]);
    out = convertTemp(value, from, to);
    toSymbol = to === 'c' ? '°C' : to === 'f' ? '°F' : to === 'r' ? '°R' : 'K';
    fromSymbol = from === 'c' ? '°C' : from === 'f' ? '°F' : from === 'r' ? '°R' : 'K';
  } else if (fromRes === 'fuel' && toRes === 'fuel') {
    const from = normalizeUnitKey(m[2]);
    const to = normalizeUnitKey(m[3]);
    out = convertFuel(value, from, to);
    const label = (k: string): string => {
      const t = FUEL_ALIASES[k];
      switch (t) {
        case 'kpl': return 'km/L';
        case 'mpg': return 'mpg';
        case 'mpguk': return 'mpg (UK)';
        case 'l100km': return 'L/100km';
        case 'mipl': return 'mi/L';
        case 'kmgalus': return 'km/gal (US)';
        case 'kmgaluk': return 'km/gal (UK)';
        case 'gal100mius': return 'gal/100mi (US)';
        case 'gal100miuk': return 'gal/100mi (UK)';
        default: return k;
      }
    };
    toSymbol = label(to);
    fromSymbol = label(from);
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

/* ── Chained conversions & mixed fuel/volume/distance ─────── */

const UNIT_TOK = String.raw`[A-Za-z°²³\/][A-Za-z0-9°²³\/]*`;
const NUM_TOK = String.raw`[+-]?\d+(?:\.\d+)?`;
const CONNECT = String.raw`(?:in|to|as|->|=)`;

/**
 * Chained: "10 km to mi to ft" → each hop appended.
 * Renders as "10 km = 6.21371 mi = 32808.4 ft".
 */
export function convertChainExpression(input: string): { text: string; finalValue: number; finalSymbol: string } | null {
  const trimmed = normalizeUnitPhrases(input).trim();
  const re = new RegExp(`^(${NUM_TOK})\\s*(${UNIT_TOK})((?:\\s+${CONNECT}\\s+${UNIT_TOK}){2,})$`, 'i');
  const m = re.exec(trimmed);
  if (!m) return null;
  const hops = [...m[3].matchAll(new RegExp(`${CONNECT}\\s+(${UNIT_TOK})`, 'gi'))].map(x => x[1]);
  let curValue = parseFloat(m[1]);
  let curUnit = m[2];
  const parts: string[] = [];
  const first = convertExpression(`${curValue} ${curUnit} to ${hops[0]}`);
  if (!first) return null;
  parts.push(`${formatNum(curValue)} ${first.fromSymbol}`);
  parts.push(`${formatNum(first.result)} ${first.toSymbol}`);
  curValue = first.result;
  curUnit = hops[0];
  for (let i = 1; i < hops.length; i++) {
    const step = convertExpression(`${curValue} ${curUnit} to ${hops[i]}`);
    if (!step) return null;
    parts.push(`${formatNum(step.result)} ${step.toSymbol}`);
    curValue = step.result;
    curUnit = hops[i];
  }
  return { text: parts.join(' = '), finalValue: curValue, finalSymbol: parts[parts.length - 1].replace(/^[^ ]+ /, '') };
}

function fuelToKpl(v: number, kind: FuelKind): number {
  switch (kind) {
    case 'kpl': return v;
    case 'mpg': return v * 0.425143707;
    case 'mpguk': return v * 0.354006189;
    case 'l100km': return 100 / v;
    case 'mipl': return v * 1.609344;
    case 'kmgalus': return v / 3.785411784;
    case 'kmgaluk': return v / 4.54609;
    case 'gal100mius': return (100 * 1.609344) / (v * 3.785411784);
    case 'gal100miuk': return (100 * 1.609344) / (v * 4.54609);
  }
}

/**
 * Mixed forms:
 *   "30 mpg * 15 gal to mi"        → distance   (efficiency × volume)
 *   "500 mi / 25 mpg to gal"       → volume     (distance ÷ efficiency)
 *   "100 km * 8 l/100km to l"      → volume     (distance × L/100km)
 */
export function convertMixedExpression(input: string): ConvertResult | null {
  const normalized = normalizeUnitPhrases(input);
  const reduced = normalized.includes('(') ? reduceParens(normalized) : normalized;
  if (reduced === null) return null;
  const trimmed = reduced.trim();
  const mulRe = new RegExp(`^(${NUM_TOK})\\s*(${UNIT_TOK})\\s*[*×x]\\s*(${NUM_TOK})\\s*(${UNIT_TOK})\\s+${CONNECT}\\s+(${UNIT_TOK})$`, 'i');
  const divRe = new RegExp(`^(${NUM_TOK})\\s*(${UNIT_TOK})\\s*\\/\\s*(${NUM_TOK})\\s*(${UNIT_TOK})\\s+${CONNECT}\\s+(${UNIT_TOK})$`, 'i');

  const tryPair = (
    v1: number, u1: string, v2: number, u2: string, target: string, op: '*' | '/',
  ): ConvertResult | null => {
    const r1 = resolveUnit(u1);
    const r2 = resolveUnit(u2);
    const rt = resolveUnit(target);
    if (!r1 || !r2 || !rt) return null;
    const norm1 = normalizeUnitKey(u1);
    const norm2 = normalizeUnitKey(u2);

    // fuel × volume → distance
    if (op === '*' && r1 === 'fuel' && typeof r2 === 'object' && r2.category === 'volume' && typeof rt === 'object' && rt.category === 'length') {
      const kpl = fuelToKpl(v1, FUEL_ALIASES[norm1]);
      const km = kpl * (v2 * r2.toBase); // volume in L
      const result = (km * 1000) / rt.toBase;
      return {
        value: v1, result, fromSymbol: `${formatNum(v1)} × ${formatNum(v2)} ${r2.symbol}`,
        toSymbol: rt.symbol,
        text: `${formatNum(v1)} × ${formatNum(v2)} ${r2.symbol} = ${formatNum(result)} ${rt.symbol}`,
      };
    }
    // volume × fuel → distance (commutative)
    if (op === '*' && typeof r1 === 'object' && r1.category === 'volume' && r2 === 'fuel' && typeof rt === 'object' && rt.category === 'length') {
      return tryPair(v2, u2, v1, u1, target, '*');
    }
    // distance × (L/100km) → volume
    if (op === '*' && typeof r1 === 'object' && r1.category === 'length' && r2 === 'fuel' && typeof rt === 'object' && rt.category === 'volume') {
      const km = (v1 * r1.toBase) / 1000;
      const kpl = fuelToKpl(v2, FUEL_ALIASES[norm2]);
      const litres = km / kpl;
      const result = (litres * 1) / rt.toBase;
      return {
        value: v1, result, fromSymbol: `${formatNum(v1)} ${r1.symbol} × ${formatNum(v2)}`,
        toSymbol: rt.symbol,
        text: `${formatNum(v1)} ${r1.symbol} × ${formatNum(v2)} = ${formatNum(result)} ${rt.symbol}`,
      };
    }
    // distance ÷ efficiency → volume
    if (op === '/' && typeof r1 === 'object' && r1.category === 'length' && r2 === 'fuel' && typeof rt === 'object' && rt.category === 'volume') {
      const km = (v1 * r1.toBase) / 1000;
      const kpl = fuelToKpl(v2, FUEL_ALIASES[norm2]);
      const litres = km / kpl;
      const result = litres / rt.toBase;
      return {
        value: v1, result, fromSymbol: `${formatNum(v1)} ${r1.symbol} ÷ ${formatNum(v2)}`,
        toSymbol: rt.symbol,
        text: `${formatNum(v1)} ${r1.symbol} ÷ ${formatNum(v2)} = ${formatNum(result)} ${rt.symbol}`,
      };
    }
    // volume ÷ time → volumetric flow? skip. Otherwise:
    return null;
  };

  let mm = mulRe.exec(trimmed);
  if (mm) return tryPair(parseFloat(mm[1]), mm[2], parseFloat(mm[3]), mm[4], mm[5], '*');
  mm = divRe.exec(trimmed);
  if (mm) return tryPair(parseFloat(mm[1]), mm[2], parseFloat(mm[3]), mm[4], mm[5], '/');
  return null;
}

/* ── Parentheses & operator precedence ─────────────────────── */

/**
 * Evaluates a bare (no "to X") sub-expression like:
 *   "30 mpg * 15 gal"      → { value: 724.2, unit: 'km' }   (canonical)
 *   "500 mi / 25 mpg"      → { value: 75.71, unit: 'L' }
 *   "42 km"                → { value: 42,    unit: 'km' }
 * Returns null if it doesn't dimensionally reduce to a single unit.
 */
function evalOperand(expr: string): { value: number; unit: string } | null {
  const trimmed = expr.trim();
  const simple = new RegExp(`^(${NUM_TOK})\\s*(${UNIT_TOK})$`).exec(trimmed);
  if (simple) return { value: parseFloat(simple[1]), unit: simple[2] };

  const pair = new RegExp(`^(${NUM_TOK})\\s*(${UNIT_TOK})\\s*([*×x\\/])\\s*(${NUM_TOK})\\s*(${UNIT_TOK})$`, 'i').exec(trimmed);
  if (!pair) return null;
  const v1 = parseFloat(pair[1]), u1 = pair[2], op = pair[3], v2 = parseFloat(pair[4]), u2 = pair[5];
  const r1 = resolveUnit(u1), r2 = resolveUnit(u2);
  if (!r1 || !r2) return null;
  const isMul = op !== '/';
  let target: string | null = null;
  if (isMul) {
    if ((r1 === 'fuel' && typeof r2 === 'object' && r2.category === 'volume') ||
        (r2 === 'fuel' && typeof r1 === 'object' && r1.category === 'volume')) target = 'km';
    else if ((typeof r1 === 'object' && r1.category === 'length' && r2 === 'fuel') ||
             (typeof r2 === 'object' && r2.category === 'length' && r1 === 'fuel')) target = 'L';
  } else {
    if (typeof r1 === 'object' && r1.category === 'length' && r2 === 'fuel') target = 'L';
  }
  if (!target) return null;
  const conv = convertMixedExpression(`${v1} ${u1} ${op} ${v2} ${u2} to ${target}`);
  if (!conv) return null;
  return { value: conv.result, unit: conv.toSymbol };
}

/**
 * Normalize implicit multiplication so users can write "2(kg)", "(30 mpg)(15 gal)",
 * or "3(l/100km)" without an explicit "*". Runs before reduceParens.
 *   • "<num>(<unit>)"     → "<num> <unit>"                (fold single-unit paren)
 *   • ")("                → ")*("                         (paren-paren adjacency)
 *   • "<digit>("          → "<digit>*("                   (number → group)
 *   • ")<digit>"          → ")*<digit>"                   (group → number)
 */
export function normalizeImplicitMult(input: string): string {
  let s = normalizeUnitPhrases(input);
  // Unwrap "(<unit>)^N" → "<unit>^N" so exponents survive paren reduction
  // (e.g. "2(kg)^2 to lb^2" becomes "2 kg^2 to lb^2" instead of dropping "^2").
  const expRe = new RegExp(`\\(\\s*(${UNIT_TOK})\\s*\\)\\s*\\^\\s*(\\d+)`, 'g');
  s = s.replace(expRe, ' $1^$2 ');
  // Fold "<num>(<single-unit>)" into "<num> <unit>" so it becomes an operand
  // that evalOperand can read directly.
  const foldRe = new RegExp(`(${NUM_TOK})\\s*\\(\\s*(${UNIT_TOK})\\s*\\)`, 'g');
  s = s.replace(foldRe, '$1 $2');
  // Unwrap standalone "(<unit>)" (no number inside) so unit-only paren groups
  // like "(m/s)(kg)" reduce cleanly after the ")(" → ")*(" insertion below.
  const unwrapRe = new RegExp(`\\(\\s*(${UNIT_TOK})\\s*\\)`, 'g');
  s = s.replace(unwrapRe, ' $1 ');
  // Insert explicit "*" at paren-adjacency boundaries.
  s = s.replace(/\)\s*\(/g, ')*(');
  s = s.replace(/(\d)\s*\(/g, '$1*(');
  s = s.replace(/\)\s*(\d)/g, ')*$1');
  // Bridge implicit multiplication that surfaces after unwrapping, e.g.
  // "m/s kg" → "m/s*kg", so downstream matchers see explicit operators.
  const unitAdj = new RegExp(`(${UNIT_TOK})\\s+(${UNIT_TOK})`, 'g');
  // Only bridge when neither side looks like a keyword (in/to/as) — evalOperand
  // still needs "num unit" adjacency for its simple form, so we intentionally
  // do NOT rewrite "<num> <unit>" here.
  s = s.replace(unitAdj, (m, a, b) => {
    if (/^(in|to|as)$/i.test(a) || /^(in|to|as)$/i.test(b)) return m;
    return `${a}*${b}`;
  });
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Repeatedly reduces the innermost balanced (...) group by evaluating it via
 * evalOperand and substituting "value unit" back in. Returns the input with all
 * parens resolved, or null if any paren fails to evaluate.
 */
export function reduceParens(input: string): string | null {
  let out = normalizeImplicitMult(input);
  // Guard against pathological input.
  for (let i = 0; i < 16; i++) {
    const open = out.lastIndexOf('(');
    if (open === -1) return out;
    const close = out.indexOf(')', open + 1);
    if (close === -1) return null;
    const inner = out.slice(open + 1, close);
    const evald = evalOperand(inner);
    if (!evald) return null;
    const literal = `${formatNum(evald.value)} ${evald.unit}`;
    out = out.slice(0, open) + literal + out.slice(close + 1);
  }
  return out.includes('(') ? null : out;
}

/* ── Main dispatcher ───────────────────────────────────────── */

/**
 * Detects a convertible expression at end of the current text node and appends
 * " = <converted> <symbol>". Fired on Space keydown. Supports:
 *   • simple: "10 km to mi"
 *   • chained: "10 km to mi to ft"
 *   • mixed:   "30 mpg * 15 gal to mi", "500 mi / 25 mpg to gal"
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

  // Parenthesized form: "(...) to <unit>" — try before other patterns.
  const parenRe = new RegExp(`(?:^|\\s)(\\([^()]+\\)\\s+${CONNECT}\\s+${UNIT_TOK})$`, 'i');
  const parenMatch = parenRe.exec(before);
  if (parenMatch) {
    // Try mixed first (paren usually wraps a mul/div), fall back to simple.
    const mixed = convertMixedExpression(parenMatch[1]);
    if (mixed) return insertInline(textNode, caret, sel, ` = ${formatNum(mixed.result)} ${mixed.toSymbol}`);
    const simple = convertExpression(parenMatch[1]);
    if (simple) return insertInline(textNode, caret, sel, ` = ${formatNum(simple.result)} ${simple.toSymbol}`);
  }

  // Try mixed (fuel/volume/distance) — most specific unparenthesized form.
  const mixedRe = new RegExp(
    `(?:^|[\\s(])((?:${NUM_TOK})\\s*${UNIT_TOK}\\s*[*×x\\/]\\s*(?:${NUM_TOK})\\s*${UNIT_TOK}\\s+${CONNECT}\\s+${UNIT_TOK})$`, 'i',
  );
  const mixMatch = mixedRe.exec(before);
  if (mixMatch) {
    const conv = convertMixedExpression(mixMatch[1]);
    if (conv) return insertInline(textNode, caret, sel, ` = ${formatNum(conv.result)} ${conv.toSymbol}`);
  }

  // Try chained (2+ hops).
  const chainRe = new RegExp(
    `(?:^|[\\s(])((?:${NUM_TOK})\\s*${UNIT_TOK}(?:\\s+${CONNECT}\\s+${UNIT_TOK}){2,})$`, 'i',
  );
  const chainMatch = chainRe.exec(before);
  if (chainMatch) {
    const chain = convertChainExpression(chainMatch[1]);
    if (chain) {
      const rest = chain.text.slice(chain.text.indexOf(' = '));
      return insertInline(textNode, caret, sel, rest);
    }
  }

  // Simple single-hop.
  const simpleRe = new RegExp(
    `(?:^|[\\s(])((?:${NUM_TOK})\\s*${UNIT_TOK}\\s+${CONNECT}\\s+${UNIT_TOK})$`, 'i',
  );
  const m = simpleRe.exec(before);
  if (!m) return false;
  const conv = convertExpression(m[1]);
  if (!conv) return false;
  return insertInline(textNode, caret, sel, ` = ${formatNum(conv.result)} ${conv.toSymbol}`);
}

function insertInline(textNode: Text, caret: number, sel: Selection, insertion: string): boolean {
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

