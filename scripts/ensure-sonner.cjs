/* eslint-disable */
// Ensures the `sonner` package is present in node_modules. The project aliases
// `sonner-real` -> `node_modules/sonner` (see vite.config.ts). If a partial
// install left `sonner` missing, Vite build fails with ENOENT. This guard
// installs it on demand so `npm run build` / `npx cap sync` don't crash.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, '..', 'node_modules', 'sonner', 'package.json');
if (fs.existsSync(pkgPath)) process.exit(0);

console.warn('[ensure-sonner] `sonner` not found in node_modules, installing without saving...');
try {
  execSync('npm install sonner@^1.7.4 --no-save --no-audit --no-fund', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
} catch (err) {
  console.error('[ensure-sonner] Failed to install sonner:', err.message);
  process.exit(0); // Don't block install; shim fallback will handle it.
}
