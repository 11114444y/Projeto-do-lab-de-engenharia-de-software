import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Tailwind v4 plugin is enabled in the Vite build', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /from ['"]@tailwindcss\/vite['"]/);
  assert.match(config, /plugins:\s*\[react\(\),\s*tailwindcss\(\)\]/);
});

test('Page metadata is valid and does not contain Figma placeholders', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<title>Trabalhador Brasileiro/);
  assert.doesNotMatch(html, /<!--\s*figma:/);
});
