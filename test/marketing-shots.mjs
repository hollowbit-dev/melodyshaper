// Website and README screenshots at 2x, saved as WebP for hollowbit.dev and PNG for the repo.
import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEST = `${process.env.HOME}/Desktop/Hollowbit/assets/img`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melody-marketing-'));
fs.mkdirSync('screenshots', { recursive: true });
fs.mkdirSync('test/out', { recursive: true });
const app = await electron.launch({ args: ['--force-device-scale-factor=2', '.'], env: { ...process.env, MELODY_TEST: '1', MELODY_USERDATA: tmp } });
try {
  const w = await app.firstWindow();
  for (let i = 0; i < 100 && !(await w.evaluate(() => document.documentElement.dataset.ready === '1')); i++) await w.waitForTimeout(100);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 814));
  await w.waitForTimeout(400);
  const shot = async (name) => {
    await w.evaluate(() => { window.__melody.engine.stop(); document.getElementById('toast').classList.remove('show'); document.getElementById('play').classList.remove('on'); });
    await w.mouse.move(640, 30); await w.waitForTimeout(350);
    const png = `test/out/${name}.png`;
    await w.screenshot({ path: png });
    execFileSync('cwebp', ['-q', '86', '-quiet', png, '-o', `${DEST}/${name}.webp`]);
    fs.copyFileSync(png, `screenshots/${name}.png`);
    console.log('saved', name);
  };
  await w.click('[data-track=drums] .name'); await w.click('.chip[data-id=back]');
  await w.evaluate(() => {
    const m = window.__melody, s = m.song;
    s.name = 'First idea';
    document.getElementById('songName').value = s.name;
    s.tracks[3].notes = [[7, 0, 4], [9, 4, 2], [8, 6, 2], [7, 8, 8], [8, 16, 4], [6, 20, 4], [4, 24, 8], [5, 32, 4], [7, 36, 2], [9, 38, 2], [9, 40, 8], [7, 48, 4], [6, 52, 4], [7, 56, 8]].map(([deg, step, len]) => ({ deg, step, len }));
    m.showChords();
  });
  await w.locator('.fit').first().click();
  await shot('melodyshaper-chords');
  await w.click('[data-track=bass] .name'); await w.click('.chip[data-id=follow]');
  await w.click('[data-track=melody] .name');
  await shot('melodyshaper-app');
  await w.selectOption('#addSection', 'new:Chorus');
  await w.selectOption('#addSection', 'repeat:s1');
  await w.selectOption('#ending', 'fade');
  await w.click('[data-track=chords] .name');
  await shot('melodyshaper-song');
} finally {
  await app.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
