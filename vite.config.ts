import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin, ResolvedConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stage 12 (12.1–12.3 / C21): Injects the complete production asset manifest
 * and deterministic content hash into dist/sw.js at build time so all core
 * routes, editors, temporal engine, backup tools, and Wishlist/exact-price
 * bundles are precached atomically.
 */
function planuiPwaBuildPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'planui-pwa-build-manifest',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    closeBundle() {
      const distDir = path.resolve(config.root, config.build.outDir);
      const swPath = path.join(distDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;

      const collectFiles = (dir: string, prefix = ''): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const results: string[] = [];
        for (const entry of entries) {
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            results.push(...collectFiles(path.join(dir, entry.name), rel));
          } else if (
            entry.isFile() &&
            rel !== 'sw.js' &&
            /\.(html|js|css|webmanifest|svg|png|ico|woff2?)$/i.test(rel)
          ) {
            results.push(rel);
          }
        }
        return results.sort();
      };

      const base = config.base;
      const files = collectFiles(distDir);
      const precacheUrls = [base, ...files.map(file => `${base}${file}`)];
      const hash = crypto.createHash('sha256');
      hash.update(base);
      hash.update(fs.readFileSync(swPath));
      for (const file of files) {
        hash.update(file);
        hash.update(fs.readFileSync(path.join(distDir, file)));
      }
      const versionHash = `v1-${hash.digest('hex').slice(0, 12)}`;

      let swSource = fs.readFileSync(swPath, 'utf8');
      swSource = swSource.replace(
        "'__PLANUI_CACHE_VERSION__'",
        JSON.stringify(versionHash)
      );
      swSource = swSource.replace(
        "['__PLANUI_PRECACHE_MANIFEST__']",
        JSON.stringify(precacheUrls, null, 2)
      );
      fs.writeFileSync(swPath, swSource, 'utf8');
    },
  };
}

export default defineConfig(({ command, isPreview }) => {
  return {
    base: command === 'build' || isPreview ? '/planui/' : '/',
    plugins: [react(), tailwindcss(), planuiPwaBuildPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
