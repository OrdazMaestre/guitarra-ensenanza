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
  await page.goto('/lecciones/temario/notacion-musical');

  const result = await page.evaluate(async () => {
    const SR = 44100;
    const DURATION = 0.2;

    function renderClick(volume: number, type: 'snare' | 'kick' | 'cymbal') {
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
        clkG.gain.setValueAtTime(volume * 0.28, scheduledAt);
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
        og.gain.linearRampToValueAtTime(volume * 0.20, scheduledAt + 0.003);
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
        bg.gain.linearRampToValueAtTime(volume * 0.10, scheduledAt + 0.002);
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
    return { peaksAtOldDefault, peaksAtNewMax };
  });

  // Old default (metroVolume=0.5 → volume=1.0): limiter threshold (-3dB ≈
  // 0.708) sits above every click type's historical peak, so it must stay
  // completely transparent — peaks should match the original unlimited
  // values (snare ~0.255, kick ~0.58, cymbal ~0.12), comfortably under 0.7.
  for (const type of ['snare', 'kick', 'cymbal']) {
    expect(result.peaksAtOldDefault[type]).toBeLessThan(0.7);
  }

  // New maximum (metroVolume=1.0 → volume=2.0): nothing may clip, with a
  // safety margin under full scale.
  for (const type of ['snare', 'kick', 'cymbal']) {
    expect(result.peaksAtNewMax[type]).toBeLessThan(0.95);
  }
});
