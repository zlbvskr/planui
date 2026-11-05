import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') continue;
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results.sort();
}

const ALL_FILES = collectSourceFiles(SRC_ROOT).map((abs) => ({
  abs,
  rel: 'src/' + relative(SRC_ROOT, abs).replace(/\\/g, '/'),
  content: readFileSync(abs, 'utf8'),
}));

const UI_FILES = ALL_FILES.filter(
  (f) =>
    f.rel.startsWith('src/views/') ||
    f.rel.startsWith('src/components/') ||
    f.rel.startsWith('src/ui/') ||
    f.rel.startsWith('src/i18n/') ||
    f.rel === 'src/App.tsx',
);

describe('Stage 7 source guards and product invariants', () => {
  it('renders date strings only through src/lib/format.ts in UI modules', () => {
    const violations: string[] = [];
    for (const f of UI_FILES) {
      if (/\b(?:Intl\.DateTimeFormat|toLocaleDateString|toLocaleTimeString|toLocaleString|formatUkrainianDateHeading)\b/.test(f.content)) {
        violations.push(`${f.rel}: uses direct date formatting instead of src/lib/format.ts`);
      }
      const lines = f.content.split('\n');
      lines.forEach((line, idx) => {
        if (
          /(?<!\$)\{[^{}]*\.(?:localDate|startLocalDate|endLocalDate|endLocalDateExclusive|targetDate|plannedDate|periodStartLocalDate|periodEndLocalDate|effectiveFromLocalDate|originStartLocalDate|originEndLocalDate|startDate|endDate)\s*\}/.test(
            line,
          ) &&
          !/(?:value|date|min|max|key|id|data-|onClick|onSelect|format)/.test(line)
        ) {
          violations.push(`${f.rel}:${idx + 1}: raw date property rendered outside formatter: ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(violations, []);
  });

  it('forbids "Europe/Kyiv" and rendered timezone identifiers in UI modules outside Settings', () => {
    const allowed = new Set([
      'src/views/BasicSettingsView.tsx',
      'src/storage/db.ts',
      'src/storage/repositories.ts',
    ]);
    const violations = ALL_FILES.filter(
      (f) => !allowed.has(f.rel) && f.content.includes('Europe/Kyiv'),
    ).map((f) => f.rel);
    for (const f of UI_FILES) {
      if (f.rel === 'src/views/BasicSettingsView.tsx') continue;
      if (/(?:Часовий пояс|Пояс запису|Пояс:|у поясі)\s*[:$]?\s*\{/.test(f.content)) {
        violations.push(`${f.rel}: renders timezone outside Settings`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('forbids "uppercase", "<select", native date/time/checkbox inputs outside src/ui overlays, "▶"/"▼", and "(0)" counters', () => {
    const violations: string[] = [];
    for (const f of ALL_FILES) {
      if (/\buppercase\b/.test(f.content)) {
        violations.push(`${f.rel}: contains "uppercase"`);
      }
      if (f.rel !== 'src/ui/contract.tsx' && /<select\b/.test(f.content)) {
        violations.push(`${f.rel}: contains "<select" outside src/ui/contract.tsx`);
      }
      if (
        f.rel !== 'src/ui/contract.tsx' &&
        /type\s*=\s*["'](?:date|time|checkbox)["']/.test(f.content)
      ) {
        violations.push(`${f.rel}: contains native date/time/checkbox input outside src/ui/contract.tsx`);
      }
      if (/[▶▼]/.test(f.content)) {
        violations.push(`${f.rel}: contains text triangle ▶ or ▼`);
      }
      const withoutComments = f.content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const match of withoutComments.matchAll(/[а-яіїєґА-ЯІЇЄҐA-Za-z0-9]\s*\(0\)\s*(?=["'`<])/g)) {
        violations.push(`${f.rel}: contains "(0)" counter in ${match[0].trim()}`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('restricts hard-coded hex colors to CSS token definitions in src/index.css', () => {
    const violations: string[] = [];
    for (const f of ALL_FILES) {
      if (f.rel === 'src/index.css') {
        const outsideTokenBlocks = f.content
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/:root\s*\{[^}]*\}/g, '')
          .replace(/\.dark\s*\{[^}]*\}/g, '');
        const strayHex = outsideTokenBlocks.match(/#[0-9a-fA-F]{3,8}\b/g);
        if (strayHex) {
          violations.push(`src/index.css: hex colors outside :root/.dark token blocks: ${strayHex.join(', ')}`);
        }
        continue;
      }
      const hexMatches = f.content.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hexMatches) {
        violations.push(`${f.rel}: hard-coded hex colors: ${hexMatches.join(', ')}`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('forbids duplicated Card/Section/Pill component variants outside src/ui', () => {
    const violations: string[] = [];
    for (const f of ALL_FILES) {
      if (f.rel.startsWith('src/ui/') || f.rel.startsWith('src/components/ui/')) continue;
      for (const match of f.content.matchAll(
        /\b(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*(?:Card|Section|Pill))\b/g,
      )) {
        violations.push(`${f.rel}: defines ${match[1]} outside src/ui`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('enforces product invariants on user-facing strings (no streaks, debt, overdue, ratings, overall scores, unoccupied time, or minute totals outside InfoSheet negations)', () => {
    const violations: string[] = [];
    const forbidden = /(?:сері[яїюєю]|streak|борг|прострочен|рейтинг|загальн\S+\s+бал|незайнято|усього\s+хв|разом\s+хв|сумарно\s+хв)/i;
    for (const f of UI_FILES) {
      const withoutInfoSheets = f.content.replace(/<InfoSheet\b[\s\S]*?<\/InfoSheet>/g, '');
      const lines = withoutInfoSheets.split('\n');
      lines.forEach((line, idx) => {
        if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;
        if (forbidden.test(line)) {
          violations.push(`${f.rel}:${idx + 1}: ${line.trim()}`);
        }
      });
      for (const infoMatch of f.content.matchAll(/<InfoSheet\b[\s\S]*?<\/InfoSheet>/g)) {
        const block = infoMatch[0];
        if (forbidden.test(block) && !/(?:не\s+створюють\s+боргу|загального\s+балу\s+немає|немає|не\s+)/i.test(block)) {
          violations.push(`${f.rel}: InfoSheet mentions forbidden term without negation: ${block}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });
});
