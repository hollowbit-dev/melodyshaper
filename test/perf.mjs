// Measures animation smoothness and audio timing while playing, under a 4x CPU slowdown.
// Pass a packaged executable with MELODY_EXE to test the built app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melody-perf-'));
const env = { ...process.env, MELODY_TEST: '1', MELODY_USERDATA: tmp };
const app = await electron.launch(process.env.MELODY_EXE ? { executablePath: process.env.MELODY_EXE, env } : { args: [ROOT], env });
try {
  const page = await app.firstWindow();
  for (let i = 0; i < 100 && !(await page.evaluate(() => document.documentElement.dataset.ready === '1')); i++) await page.waitForTimeout(100);
  await page.click('[data-track=drums]'); await page.click('.chip[data-id=back]');
  await page.click('[data-track=chords]'); await page.click('.chip[data-id=pop]');
  await page.click('[data-track=bass]'); await page.click('.chip[data-id=follow]');
  await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const r = await page.evaluate(() => new Promise((done) => {
    const e = window.__melody.engine, gaps = [];
    let last = performance.now(), late = 0, pumps = 0;
    const pump = e.pump.bind(e);
    e.pump = () => { if (e.playing && e.nextTime < e.ctx.currentTime) late++; pumps++; pump(); };
    const end = last + 8000;
    const frame = (t) => {
      gaps.push(t - last); last = t;
      if (t < end) requestAnimationFrame(frame);
      else { gaps.sort((a, b) => a - b); done({ frames: gaps.length, fps: Math.round(gaps.length / 8), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]), worst: Math.round(gaps.at(-1)), late, pumps, playing: e.playing }); }
    };
    requestAnimationFrame(frame);
  }));
  console.log('4x CPU slowdown:', JSON.stringify(r));
  if (!r.playing || r.late > 0 || r.p95 > 34) process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
