// Types for tests/helpers/guitarTone.js (injected with page.addInitScript).
type GuitarToneMode = 'raw' | 'clean' | 'overdrive';
type SpeakerModel = 'headphones' | 'laptop' | 'phone';

interface GuitarToneHelpers {
  SR: number;
  lufs(x: Float32Array, sr: number, opts?: { model?: SpeakerModel; from?: number; to?: number }): number;
  maxMomentary(x: Float32Array, sr: number, opts?: { model?: SpeakerModel }): number;
  rmsDb(x: Float32Array, sr: number, from?: number, to?: number): number;
  peak(x: Float32Array): number;
  bandShareDb(x: Float32Array, sr: number, lo?: number, hi?: number): number;
  kWeighting(sr: number): { shelf: number[]; rlb: number[] };
  guitarSampleTrim(file: string, midi: number): number;
  overdriveRegisterTrim(midi: number): number;
  createCleanToneChain(ctx: BaseAudioContext, destination: AudioNode): { input: GainNode };
  createOverdriveChain(ctx: BaseAudioContext, destination: AudioNode): { input: GainNode; output: GainNode };
  renderNotes(midis: number[], tone: GuitarToneMode, opts?: { volume?: number; duration?: number }): Promise<Float32Array>;
}

interface Window {
  __guitarTone: GuitarToneHelpers;
}
