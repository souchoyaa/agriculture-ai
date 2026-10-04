// Drives a public/vlm/*.html model page in Chrome (persistent profile keeps the model cache) and prints its log.
// Usage: PROFILE=<dir> npx tsx tests/model-probe.ts <url>
import { chromium } from 'playwright-core';
(async () => {
  const ctx = await chromium.launchPersistentContext(process.env.PROFILE ?? '.cache/chrome-models', {
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: !process.env.HEADED,
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
  try {
    const p = await ctx.newPage();
    await p.goto(process.argv[2]);
    let seen = 0;
    for (let i = 0; i < 900; i++) {
      await p.waitForTimeout(1000);
      const log: string[] = await p.evaluate(() => (window as any).__log || []);
      for (const l of log.slice(seen)) console.log(l); seen = log.length;
      if (await p.evaluate(() => (window as any).__done)) break;
    }
  } finally { await ctx.close(); }
})();
