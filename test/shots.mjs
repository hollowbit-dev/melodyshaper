// Screenshots of the main states, at normal and minimum window size.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test/out');
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melody-shots-'));
const app = await electron.launch({ args: [ROOT], env: { ...process.env, MELODY_TEST: '1', MELODY_HIDDEN: '1', MELODY_USERDATA: tmp } });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (let i = 0; i < 100 && !(await page.evaluate(() => document.documentElement.dataset.ready === '1')); i++) await page.waitForTimeout(100);
  const size = async (width, height) => {
    await app.evaluate(({ BrowserWindow }, s) => { const w = BrowserWindow.getAllWindows()[0]; w.setMinimumSize(800, 500); w.setContentSize(s.width, s.height); }, { width, height });
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
  };
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await size(1320, 840);
  await shot('ui-empty');
  await page.click('[data-track=drums] .name'); await page.click('.chip[data-id=hiphop]');
  await page.click('#play');
  await shot('ui-drums');
  await page.click('[data-track=chords] .name'); await page.click('.chip[data-id=pop]');
  await page.click('#play');
  await page.selectOption('#addSection', 'new:Chorus');
  await page.waitForTimeout(100);
  await shot('ui-chords');
  await page.click('[data-track=bass] .name'); await page.click('.chip[data-id=follow]');
  await page.click('#play');
  await page.evaluate(() => {
    const m = window.__melody, t = m.song.tracks[3];
    t.notes = [[7, 0, 4], [9, 4, 2], [11, 6, 2], [12, 8, 6], [11, 16, 4], [9, 20, 4], [7, 24, 8], [4, 32, 4], [5, 36, 4], [7, 40, 8], [9, 48, 4], [7, 52, 4], [4, 56, 8]].map(([deg, step, len]) => ({ deg, step, len }));
    m.select('melody');
  });
  await page.click('#play');
  await page.waitForTimeout(900);
  await shot('ui-melody');
  await page.click('#play');
  await size(1080, 680);
  await shot('ui-small');
  const overflow = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('header, .settings, #tools, .deck, .track, #fx, #starters')) if (el.scrollWidth > el.clientWidth + 1) bad.push(`${el.id || el.className}: ${el.scrollWidth} > ${el.clientWidth}`);
    return bad;
  });
  console.log('clipped at minimum size:', overflow.length ? overflow : 'none');
  console.log('errors:', errors.length ? errors : 'none');
} finally {
  await app.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
