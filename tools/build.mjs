// Builds cxtools-lite.user.js from the modules in src/.
//
// Tampermonkey runs one plain file, so the modules are joined into a single function scope: import lines and the
// `export` keyword are dropped, and two modules may not declare the same top-level name.
// Run with `npm run build`. The version comes from package.json.

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Module list, dependencies first; main last.
export const ORDER = ['config', 'naming', 'endpoints', 'net', 'api', 'route', 'inspection', 'equipment', 'main'];

const DECL_RE = /^(?:export )?(?:async )?(?:function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * Names declared at the top level of a module (column 0).
 * @param {string} source
 * @returns {string[]}
 */
export function topLevelNames(source) {
  return [...source.matchAll(DECL_RE)].map(m => m[1]);
}

function stripModuleSyntax(source) {
  return source
    .split(/\r?\n/)
    .filter(line => !/^import .*;$/.test(line))
    .map(line => line.replace(/^export (?=(?:async )?(?:function|class|const|let)\b)/, ''))
    .join('\n');
}

/**
 * Joins the modules in `order` under the header from src/header.txt.
 * @param {{srcDir: string, outFile: string|null, order: string[], version: string}} options
 * @returns {Promise<string>} the userscript text (also written to outFile when given)
 */
export async function build({ srcDir, outFile, order, version }) {
  const owner = new Map();
  const modules = [];
  for (const name of order) {
    const source = await readFile(join(srcDir, `${name}.js`), 'utf8');
    for (const id of topLevelNames(source)) {
      if (owner.has(id)) throw new Error(`duplicate top-level name: ${id} (in ${owner.get(id)} and ${name})`);
      owner.set(id, name);
    }
    modules.push(`// ---------------------------------------------------------------- ${name}\n${stripModuleSyntax(source).trimEnd()}\n`);
  }
  const header = (await readFile(join(srcDir, 'header.txt'), 'utf8'))
    .replace(/\r\n/g, '\n')
    .trimEnd()
    .replace('__VERSION__', version);
  const out = `${header}\n\n// Built from src/ by tools/build.mjs. Edit src/ and run npm run build.\n(function () {\n'use strict';\n\n${modules.join('\n')}\n})();\n`
    .replace(/\r\n/g, '\n');
  if (outFile) await writeFile(outFile, out, 'utf8');
  return out;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || '')) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  await build({ srcDir: 'src', outFile: 'cxtools-lite.user.js', order: ORDER, version });
  console.log(`built cxtools-lite.user.js ${version}`);
}
