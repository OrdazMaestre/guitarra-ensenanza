import { test, expect } from '@playwright/test';

// The metronome volume is now independent of the instrument's own volume,
// defaulting to 50% (= the click's historical loudness) and reaching 2x that
// at 100%. The "kick" click type (used for accented eighth/sixteenth beats)
// layers 3 simultaneous sounds whose peaks sum to ~0.58 at the old default —
// doubling that naively would reach ~1.16, clipping. This renders the exact
// DSP graph from app/lib/guitarAudioEngine.ts's playMetronomeClick (including
// its metronome-only limiter) offline and checks: (a) at the old default
// (volume=1.0, i.e. metroVolume=0.5) the peak is unchanged from before the
// limiter existed — it must stay silent/transparent at this level — and
// (b) at the new maximum (volume=2.0, i.e. metroVolume=1.0) nothing clips.
test('metronome click stays clipping-free at 2x, and unchanged at the old default', async ({ page }) => {
  await page.addInitScript({ path: 'tests/helpers/guitarTone.js' });
  await page.goto('/lecciones/temario/notacion-musical');

  const result = await page.evaluate(async () => {
    const SR = 44100;
    const DURATION = 0.2;

    function renderClick(volume: number, type: 'snare' | 'kick' | 'cymbal', kickGain = 1.8) {
      const ctx = new OfflineAudioContext(1, Math.floor(SR * DURATION), SR);
      const scheduledAt = 0;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 6;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      limiter.connect(ctx.destination);

      const sr = ctx.sampleRate;

      if (type === 'snare') {
        const noiseLen = Math.floor(sr * 0.045);
        const noiseBuf = ctx.createBuffer(1, noiseLen, sr);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen) ** 2.4;
        const ns = ctx.createBufferSource(); ns.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1850; bp.Q.value = 0.75;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420; hp.Q.value = 0.7;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, scheduledAt);
        ng.gain.linearRampToValueAtTime(volume * 0.18, scheduledAt + 0.002);
        ng.gain.linearRampToValueAtTime(0.0001, scheduledAt + 0.045);
        ns.connect(bp); bp.connect(hp); hp.connect(ng); ng.connect(limiter);
        ns.start(scheduledAt);

        const bodyLen = Math.floor(sr * 0.055);
        const bodyBuf = ctx.createBuffer(1, bodyLen, sr);
        const bd = bodyBuf.getChannelData(0);
        for (let i = 0; i < bodyLen; i++) bd[i] = (Math.random() * 2 - 1) * (1 - i / bodyLen) ** 2.8;
        const bs = ctx.createBufferSource(); bs.buffer = bodyBuf;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.6;
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.0001, scheduledAt);
        bg.gain.linearRampToValueAtTime(volume * 0.075, scheduledAt + 0.003);
        bg.gain.linearRampToValueAtTime(0.0001, scheduledAt + 0.055);
        bs.connect(lp); lp.connect(bg); bg.connect(limiter);
        bs.start(scheduledAt);
      } else if (type === 'kick') {
        const clkLen = Math.floor(sr * 0.008);
        const clkBuf = ctx.createBuffer(1, clkLen, sr);
        const clkd = clkBuf.getChannelData(0);
        for (let i = 0; i < clkLen; i++) clkd[i] = (Math.random() * 2 - 1) * (1 - i / clkLen) ** 1.5;
        const clkSrc = ctx.createBufferSource(); clkSrc.buffer = clkBuf;
        const clkBp = ctx.createBiquadFilter(); clkBp.type = 'bandpass'; clkBp.frequency.value = 1200; clkBp.Q.value = 1.5;
        const clkG = ctx.createGain();
        clkG.gain.setValueAtTime(volume * kickGain * 0.28, scheduledAt);
        clkG.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.008);
        clkSrc.connect(clkBp); clkBp.connect(clkG); clkG.connect(limiter);
        clkSrc.start(scheduledAt);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, scheduledAt);
        osc.frequency.exponentialRampToValueAtTime(80, scheduledAt + 0.06);
        const ohp = ctx.createBiquadFilter(); ohp.type = 'highpass'; ohp.frequency.value = 60; ohp.Q.value = 0.5;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, scheduledAt);
        og.gain.linearRampToValueAtTime(volume * kickGain * 0.20, scheduledAt + 0.003);
        og.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.08);
        osc.connect(ohp); ohp.connect(og); og.connect(limiter);
        osc.start(scheduledAt); osc.stop(scheduledAt + 0.09);

        const bodyLen = Math.floor(sr * 0.035);
        const bodyBuf = ctx.createBuffer(1, bodyLen, sr);
        const bd = bodyBuf.getChannelData(0);
        for (let i = 0; i < bodyLen; i++) bd[i] = (Math.random() * 2 - 1) * (1 - i / bodyLen) ** 2.5;
        const bs = ctx.createBufferSource(); bs.buffer = bodyBuf;
        const bbp = ctx.createBiquadFilter(); bbp.type = 'bandpass'; bbp.frequency.value = 280; bbp.Q.value = 0.9;
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.0001, scheduledAt);
        bg.gain.linearRampToValueAtTime(volume * kickGain * 0.10, scheduledAt + 0.002);
        bg.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.035);
        bs.connect(bbp); bbp.connect(bg); bg.connect(limiter);
        bs.start(scheduledAt);
      } else {
        const cymLen = Math.floor(sr * 0.03);
        const cymBuf = ctx.createBuffer(1, cymLen, sr);
        const cd = cymBuf.getChannelData(0);
        for (let i = 0; i < cymLen; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / cymLen) ** 2.0;
        const cs = ctx.createBufferSource(); cs.buffer = cymBuf;
        const chp = ctx.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 5000; chp.Q.value = 0.5;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.0001, scheduledAt);
        cg.gain.linearRampToValueAtTime(volume * 0.12, scheduledAt + 0.001);
        cg.gain.linearRampToValueAtTime(0.0001, scheduledAt + 0.03);
        cs.connect(chp); chp.connect(cg); cg.connect(limiter);
        cs.start(scheduledAt);
      }

      return ctx.startRendering();
    }

    function peakAbs(data: Float32Array) {
      let p = 0;
      for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
      return p;
    }

    const types: ('snare' | 'kick' | 'cymbal')[] = ['snare', 'kick', 'cymbal'];
    const peaksAtOldDefault: Record<string, number> = {};
    const peaksAtNewMax: Record<string, number> = {};
    for (const type of types) {
      peaksAtOldDefault[type] = peakAbs((await renderClick(1.0, type)).getChannelData(0));
      peaksAtNewMax[type] = peakAbs((await renderClick(2.0, type)).getChannelData(0));
    }
    // Bombo +80 % (KICK_BASE_GAIN 1.8, usuario 2026-11-17): cuánto sube DE VERDAD tras el limitador, en LUFS
    // (cascos, portátil, móvil), a los volúmenes reales de cada sitio: metrónomo por defecto (1) y al máximo (2),
    // bombo original del juego (0,8 × 0,8 × 1,4 = 0,896), doble pedal de la automática (0,6) y tablatura (1,04).
    const tone = (window as unknown as { __guitarTone: { lufs: (x: Float32Array, sr: number, o?: { model?: string }) => number } }).__guitarTone;
    const kickGain: Record<string, Record<string, number>> = {};
    const kickPeak: Record<string, number> = {};
    for (const [name, volume] of [['metronomo', 1], ['metronomo max', 2], ['juego', 0.896], ['doble pedal', 0.6], ['tab', 1.04]] as const) {
      // El mismo ruido antes y después (semilla fija), si no la diferencia mide el azar del ruido.
      const seeded = () => { let x = 12345; Math.random = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); };
      seeded();
      const before = (await renderClick(volume, 'kick', 1)).getChannelData(0);
      seeded();
      const after = (await renderClick(volume, 'kick', 1.8)).getChannelData(0);
      kickPeak[name] = peakAbs(after);
      kickGain[name] = {};
      for (const model of ['headphones', 'laptop', 'phone']) kickGain[name][model] = tone.lufs(after, SR, { model }) - tone.lufs(before, SR, { model });
    }
    return { peaksAtOldDefault, peaksAtNewMax, kickGain, kickPeak };
  });
  console.log('Bombo +80 %: subida real (LU) y pico', JSON.stringify(result.kickGain), JSON.stringify(result.kickPeak));
  // +80 % = +5,1 dB sin limitador; con él, al menos +3,5 LU en todos los sitios y escuchas, y nunca clip.
  for (const name of Object.keys(result.kickGain)) {
    for (const model of ['headphones', 'laptop', 'phone']) expect(result.kickGain[name][model], `${name} ${model}`).toBeGreaterThan(3.5);
    expect(result.kickPeak[name], name).toBeLessThan(0.95);
  }

  // Old default (metroVolume=0.5 → volume=1.0): limiter threshold (-3dB ≈
  // 0.708) sits above snare's and cymbal's historical peak, so it must stay
  // completely transparent for them (snare ~0.255, cymbal ~0.12). The kick is
  // +80 % since 2026-11-17 (KICK_BASE_GAIN, user request), ~1.04 unlimited, so
  // the limiter now works on its first millisecond: it must not clip.
  for (const type of ['snare', 'cymbal']) {
    expect(result.peaksAtOldDefault[type]).toBeLessThan(0.7);
  }
  expect(result.peaksAtOldDefault.kick).toBeLessThan(0.95);

  // New maximum (metroVolume=1.0 → volume=2.0): nothing may clip, with a
  // safety margin under full scale.
  for (const type of ['snare', 'kick', 'cymbal']) {
    expect(result.peaksAtNewMax[type]).toBeLessThan(0.95);
  }
});
