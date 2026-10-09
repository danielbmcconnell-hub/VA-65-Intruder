#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../tools/dev-server.cjs');

const args = process.argv.slice(2);
const option = (name, fallback) => args.find(arg => arg.startsWith('--' + name + '='))?.split('=').slice(1).join('=') || fallback;
const requestedTarget = option('url', process.env.INTRUDER_TEST_URL || '');
const suite = option('suite', 'all');
const evidenceDir = path.resolve(option('evidence', path.join(__dirname, '..', 'test-results')));

async function main() {
  const modules = { renderer: './renderer-browser.cjs', missions: './mission-browser.cjs', progression: './progression-browser.cjs', ground: './ground-browser.cjs', photos: './pow-photos-browser.cjs', prison: './pow-prison-browser.cjs', river: './pow-river-browser.cjs', captivity: './pow-captivity-browser.cjs', controls: './pow-controls-browser.cjs', awareness: './pow-ground-awareness-browser.cjs', m21: './pow-m21-browser.cjs', 'm21-recapture': './pow-m21-recapture-browser.cjs' };
  const suites = suite === 'all' ? ['renderer', 'missions', 'progression', 'ground', 'photos', 'prison', 'river', 'captivity', 'controls', 'awareness', 'm21', 'm21-recapture'] : suite === 'regressions' ? ['renderer', 'ground'] : suite === 'pow' ? ['photos', 'prison', 'river', 'captivity', 'controls', 'awareness'] : [suite];
  if (suites.some(name => !modules[name])) throw new Error('Unknown browser suite: ' + suite);
  let server, browser;
  let target = requestedTarget;
  try {
    if (!target) {
      server = createServer();
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      target = 'http://127.0.0.1:' + server.address().port + '/';
    }
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    await fs.mkdir(evidenceDir, { recursive: true });
    for (const name of suites) {
      console.log('RUN ' + name + ' ' + target);
      let report;
      try { report = await require(modules[name])(browser, target, evidenceDir); }
      catch (error) {
        await fs.writeFile(path.join(evidenceDir, name + '.json'), JSON.stringify({ suite: name, target, recordedAt: new Date().toISOString(), passed: false, error: error.stack || String(error) }, null, 2) + '\n');
        throw error;
      }
      report.target = target; report.recordedAt = new Date().toISOString();
      await fs.writeFile(path.join(evidenceDir, name + '.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
