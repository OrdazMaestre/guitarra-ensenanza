import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listPlayableTracks } from '../app/lib/riff/chart';
import { buildGameMixChain, GAME_MIX, type GameMixParams } from '../app/lib/gameMix';

// Bus de mezcla de la partida (app/lib/gameMix.ts, usuario 2026-11-15): la barra Vol a la salida con
// compresor + limitador + techo. Se renderiza la cadena REAL (su código fuente) en un OfflineAudioContext.

type Signal = 'sine-30' | 'sine-low' | 'hot-bursts' | 'mix';
interface Stats { peak: number; rms: number; over: number }

async function render(page: Page, params: GameMixParams, signal: Signal, volume: number): Promise<Stats> {
  return page.evaluate(async ({ src, params, signal, volume }) => {
    const build = new Function(`return (${src})`)() as (c: BaseAudioContext, d: AudioNode, p: unknown) => { input: GainNode };
    const rate = 48000;
    const seconds = 4;
    const ctx = new OfflineAudioContext(1, rate * seconds, rate);
    const buffer = ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      if (signal === 'sine-30') data[i] = 10 ** (-30 / 20) * Math.sin(2 * Math.PI * 1000 * t);
      else if (signal === 'sine-low') data[i] = 10 ** (-20 / 20) * Math.sin(2 * Math.PI * 220 * t);
      else if (signal === 'hot-bursts') {
        // Golpes de +6 dBFS (ruido con caída rápida) cada 250 ms: lo peor para un limitador.
        const phase = (t % 0.25) / 0.25;
        data[i] = 2 * rnd() * Math.exp(-phase * 12);
      } else {
        // "Mezcla": bajo + acordes + bombo, con picos de ~0,8 (como la partida a volumen normal).
        const beat = t % 0.25;
        const kick = 0.45 * Math.exp(-beat * 30) * Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-beat * 40)) * t);
        const bass = 0.18 * Math.sign(Math.sin(2 * Math.PI * 55 * t));
        const gtr = 0.12 * (Math.sin(2 * Math.PI * 330 * t) + Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 495 * t));
        data[i] = kick + bass + gtr;
      }
    }
    const src2 = ctx.createBufferSource();
    src2.buffer = buffer;
    const chain = build(ctx, ctx.destination, params);
    chain.input.gain.value = volume;
    src2.connect(chain.input);
    src2.start();
    const out = (await ctx.startRendering()).getChannelData(0);
    // Se ignora el primer medio segundo (el compresor se asienta).
    let peak = 0;
    let sum = 0;
    let over = 0;
    const from = rate / 2;
    for (let i = from; i < out.length; i++) {
      const v = Math.abs(out[i]);
      peak = Math.max(peak, v);
      sum += out[i] * out[i];
      if (v > 0.97) over++;
    }
    return { peak, rms: Math.sqrt(sum / (out.length - from)), over };
  }, { src: buildGameMixChain.toString(), params, signal, volume });
}

const db = (x: number) => 20 * Math.log10(x);
const bypass = { threshold: 0, knee: 0, ratio: 1, attack: 0.003, release: 0.25 };

test('medida: makeup automático de cada etapa (para GAME_MIX.compTrim / limitTrim)', async ({ page }) => {
  await page.goto('about:blank');
  const ref = await render(page, { ...GAME_MIX, comp: bypass, limit: bypass, compTrim: 1, limitTrim: 1 }, 'sine-30', 1);
  const comp = await render(page, { ...GAME_MIX, limit: bypass, compTrim: 1, limitTrim: 1 }, 'sine-30', 1);
  const limit = await render(page, { ...GAME_MIX, comp: bypass, compTrim: 1, limitTrim: 1 }, 'sine-30', 1);
  console.log(`makeup: compresor ${db(comp.rms / ref.rms).toFixed(3)} dB, limitador ${db(limit.rms / ref.rms).toFixed(3)} dB`);
});

test('transparente por debajo del umbral; los golpes calientes nunca pasan del techo', async ({ page }) => {
  await page.goto('about:blank');
  const flat = { ...GAME_MIX, comp: bypass, limit: bypass, compTrim: 1, limitTrim: 1, clipKnee: 3.9, ceiling: 3.95 };
  // Seno a -30 dBFS: el bus no cambia nada (makeup anulado).
  const ref = await render(page, flat, 'sine-30', 1);
  const quiet = await render(page, GAME_MIX, 'sine-30', 1);
  console.log(`-30 dBFS: ${db(quiet.rms / ref.rms).toFixed(2)} dB`);
  expect(Math.abs(db(quiet.rms / ref.rms))).toBeLessThan(0.3);
  // Golpes de +6 dBFS a volumen 2 (+12 dBFS): ninguna muestra por encima de 0,97.
  for (const volume of [1, 2]) {
    const hot = await render(page, GAME_MIX, 'hot-bursts', volume);
    console.log(`golpes +6 dBFS × ${volume}: pico ${hot.peak.toFixed(3)}, muestras > 0,97: ${hot.over}`);
    expect(hot.peak).toBeLessThanOrEqual(GAME_MIX.ceiling + 0.001);
    expect(hot.over).toBe(0);
  }
});

test('una mezcla tipo partida: a volumen normal casi igual; al 200 % más fuerte, sin pasar del techo', async ({ page }) => {
  await page.goto('about:blank');
  const flat = { ...GAME_MIX, comp: bypass, limit: bypass, compTrim: 1, limitTrim: 1, clipKnee: 3.9, ceiling: 3.95 };
  const raw1 = await render(page, flat, 'mix', 1);
  const raw2 = await render(page, flat, 'mix', 2);
  const out: Record<number, Stats> = {};
  for (const volume of [0, 0.5, 1, 1.5, 2]) out[volume] = await render(page, GAME_MIX, 'mix', volume);
  console.log(`mezcla sin bus: ×1 pico ${raw1.peak.toFixed(3)}, ×2 pico ${raw2.peak.toFixed(3)}`);
  for (const volume of [0.5, 1, 1.5, 2]) console.log(`mezcla con bus ×${volume}: pico ${out[volume].peak.toFixed(3)}, RMS ${db(out[volume].rms).toFixed(2)} dBFS (${db(out[volume].rms / raw1.rms).toFixed(2)} dB sobre ×1 sin bus)`);
  expect(out[0].peak).toBeLessThan(1e-4);
  // A volumen normal, la sonoridad casi no cambia (≤ 1,5 dB menos).
  expect(db(out[1].rms / raw1.rms)).toBeGreaterThan(-1.5);
  // Más volumen = más sonoridad, siempre, y nada pasa del techo.
  expect(out[1.5].rms).toBeGreaterThan(out[1].rms);
  expect(out[2].rms).toBeGreaterThan(out[1.5].rms);
  expect(db(out[2].rms / out[1].rms)).toBeGreaterThan(3);
  for (const volume of [1, 1.5, 2]) expect(out[volume].peak).toBeLessThanOrEqual(GAME_MIX.ceiling + 0.001);
});

// ---- Canciones reales en la partida: pico y sonoridad delante de `destination`. ----
// El tramo más denso de cada canción (10 compases con más notas de todas las pistas, incluida la batería),
// a volumen normal y al 200 %. Las canciones del usuario no están en el repositorio: se saltan si faltan.
const COVERS = 'C:/Users/Enrique/Desktop/Mis cosas/Música/Tabs/Covers/';
const SONGS = [
  { file: `${COVERS}Vektor - Fast Paced Society (ver 2 by QordisAlmighty).gp`, name: 'Vektor - Fast Paced Society' },
  { file: 'public/tabs/prueba-master-of-puppets.gp', name: 'Master of Puppets' },
  { file: `${COVERS}Nile - User Maat Re.gp5`, name: 'Nile - User Maat Re' },
  { file: `${COVERS}Death - Lack Of Comprehension (ver 2).gp`, name: 'Death - Lack Of Comprehension' },
];

function densestBars(file: string): [number, number] {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(file)), new at.Settings());
  const chart = buildChart(at, score, listPlayableTracks(score)[0].index);
  const count = new Map<number, number>();
  const add = (t: number) => {
    const bar = chart.bars.find((b) => t >= b.t && t < b.end);
    if (bar) count.set(bar.number, (count.get(bar.number) ?? 0) + 1);
  };
  for (const n of chart.notes) add(n.t);
  for (const n of chart.band ?? []) add(n.t);
  for (const d of chart.drums ?? []) add(d.t);
  const last = Math.max(...chart.bars.map((b) => b.number));
  let best = 1;
  let bestSum = -1;
  for (let from = 1; from + 9 <= last; from++) {
    let sum = 0;
    for (let b = from; b < from + 10; b++) sum += count.get(b) ?? 0;
    if (sum > bestSum) { bestSum = sum; best = from; }
  }
  return [best, best + 9];
}

function meter() {
  const w = window as unknown as { __peak: number; __sum: number; __n: number; __over: number; __analysers: AnalyserNode[] };
  Object.assign(w, { __peak: 0, __sum: 0, __n: 0, __over: 0, __analysers: [] });
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  const meters = new WeakMap<BaseAudioContext, AnalyserNode>();
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    const target = args[0];
    if (target instanceof AudioDestinationNode) {
      let analyser = meters.get(this.context);
      if (!analyser) {
        analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        connect.call(analyser, target);
        meters.set(this.context, analyser);
        w.__analysers.push(analyser);
      }
      return connect.call(this, analyser);
    }
    return connect.apply(this, args);
  } as typeof AudioNode.prototype.connect;
  const buf = new Float32Array(2048);
  const tick = () => {
    for (const analyser of w.__analysers) {
      analyser.getFloatTimeDomainData(buf);
      for (const v of buf) {
        const a = Math.abs(v);
        w.__peak = Math.max(w.__peak, a);
        w.__sum += v * v;
        w.__n++;
        if (a > 0.97) w.__over++;
      }
    }
    setTimeout(tick, 15);
  };
  tick();
}

for (const song of SONGS) {
  test(`canción real: ${song.name} — al 200 % más fuerte que al 100 %, sin pasar del techo`, async ({ page }) => {
    test.skip(!fs.existsSync(song.file), 'archivo del usuario no disponible');
    test.setTimeout(180000);
    const [from, to] = densestBars(song.file);
    await page.addInitScript(meter);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/lecciones/temario/sala-de-pruebas');
    await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
    const jugar = page.locator('.test-room-fretboard .riff-open-toggle');
    await expect(async () => {
      if ((await jugar.getAttribute('aria-pressed')) !== 'true') await jugar.click();
      await expect(page.locator('.riff-panel')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByTestId('local-song-files').setInputFiles([{ name: 'medida.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync(song.file) }]);
    await page.locator('.riff-dd-menu').getByRole('button', { name: 'medida', exact: true }).click();
    await expect(page.locator('.riff-dd-toggle', { hasText: 'Canción' })).toHaveAttribute('aria-label', 'Canción: medida', { timeout: 30000 });
    await page.locator('.riff-dd-toggle', { hasText: 'Práctica con loop' }).click();
    await page.getByLabel('Desde el compás').fill(String(from));
    await page.getByLabel('Hasta el compás').fill(String(to));
    await page.keyboard.press('Escape');
    const slider = page.getByRole('slider', { name: 'Volumen de la partida' });
    const stage = page.locator('.test-room-fretboard .riff-stage');
    const measure = async (value: string) => {
      await slider.fill(value);
      await page.locator('.riff-action-start').click();
      await expect(stage).toHaveAttribute('data-status', 'playing', { timeout: 30000 });
      await page.evaluate(() => Object.assign(window, { __peak: 0, __sum: 0, __n: 0, __over: 0 }));
      await page.waitForTimeout(5000);
      const r = await page.evaluate(() => {
        const w = window as unknown as { __peak: number; __sum: number; __n: number; __over: number };
        return { peak: w.__peak, rms: Math.sqrt(w.__sum / Math.max(1, w.__n)), over: w.__over };
      });
      if ((await stage.getAttribute('data-status')) === 'playing') {
        await page.keyboard.press('Space');
        await expect(stage).toHaveAttribute('data-status', 'paused');
      }
      await page.waitForTimeout(400);
      return r;
    };
    const normal = await measure('1');
    const double = await measure('2');
    console.log(`${song.name} (c${from}-${to}): 100 % pico ${normal.peak.toFixed(3)} RMS ${db(normal.rms).toFixed(2)} dBFS >0,97 ${normal.over} | 200 % pico ${double.peak.toFixed(3)} RMS ${db(double.rms).toFixed(2)} dBFS >0,97 ${double.over} | +${db(double.rms / normal.rms).toFixed(2)} dB`);
    expect(normal.peak).toBeLessThanOrEqual(GAME_MIX.ceiling + 0.002);
    expect(double.peak).toBeLessThanOrEqual(GAME_MIX.ceiling + 0.002);
    expect(db(double.rms / normal.rms)).toBeGreaterThan(2);
  });
}
