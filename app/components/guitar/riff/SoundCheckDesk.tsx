'use client';
// MESA DE PRUEBA DE SONIDO (usuario, 2026-11-19; valores en app/lib/soundCheck.ts): se abre desde Pistas con el
// botón de mesa de una pista y, sin partida, reproduce la canción. Tres canales del instrumento -- Normal (al
// tocarlo o acertarlo), Fondo (en la banda) y Fallo (tu instrumento sin acertar) -- cada uno con la EQ y el
// fader del canal de la mesa de mezclas de la web (Knob.tsx) y un botón Solo que silencia los otros dos (al abrir
// la mesa, Solo en Normal). La batería, por piezas. Se recuerda en el dispositivo; Exportar/Importar en JSON.
import { useRef, useState, useSyncExternalStore } from 'react';
import Knob from '../../mixingConsole/Knob';
import { eqDbToRatio, eqRatioToDb } from '../../../lib/mixingConsole/audioEngine';
import {
  DRUM_MIX_TARGETS,
  exportMix,
  getMixSettings,
  importMix,
  MIX_CONTEXT_LABELS,
  MIX_CONTEXTS,
  MIX_EQ_MAX_DB,
  MIX_EQ_MIN_DB,
  MIX_TARGET_LABELS,
  MIX_VOLUME_MAX,
  resetMix,
  setMixEq,
  setMixVolume,
  subscribeMix,
  type EqBand,
  type MixContext,
  type MixTarget,
} from '../../../lib/soundCheck';
import type { useRiffController } from './useRiffController';

type Riff = ReturnType<typeof useRiffController>;

const formatEq = (v: number) => (v <= MIX_EQ_MIN_DB ? '-∞' : `${v > 0 ? '+' : ''}${v.toFixed(0)}dB`);
const CONTEXT_HINT: Record<MixContext, string> = {
  normal: 'Al tocarlo o acertarlo',
  fondo: 'Cuando suena en la banda',
  fallo: 'Tu instrumento sin acertar',
};

function SoundCheckChannel({ target, context, solo, onSolo }: { target: MixTarget; context: MixContext; solo: boolean; onSolo: () => void }) {
  const settings = useSyncExternalStore(subscribeMix, getMixSettings, getMixSettings);
  const channel = settings[target][context];
  const label = `${MIX_TARGET_LABELS[target]} ${MIX_CONTEXT_LABELS[context]}`;
  const bands: Array<[EqBand, string, string]> = [['high', 'High', 'Agudos'], ['mid', 'Mid', 'Medios'], ['low', 'Low', 'Graves']];
  return (
    <div className="sound-check-channel" data-context={context} data-solo={solo}>
      <span className="sound-check-name" title={CONTEXT_HINT[context]}>{MIX_CONTEXT_LABELS[context]}</span>
      <div className="sound-check-eq">
        {bands.map(([band, short, long]) => (
          <Knob
            ariaLabel={`${long} de ${label}`}
            defaultValue={0}
            formatValue={formatEq}
            key={band}
            label={short}
            max={MIX_EQ_MAX_DB}
            min={MIX_EQ_MIN_DB}
            onChange={(value) => setMixEq(target, context, band, value)}
            ratioToValue={eqRatioToDb}
            value={channel.eq[band]}
            valueToRatio={eqDbToRatio}
          />
        ))}
      </div>
      <div className="sound-check-row">
        <button aria-label={`Solo ${label}`} aria-pressed={solo} className="sound-check-solo" onClick={onSolo} title="Solo" type="button">
          S
        </button>
        <span className="sound-check-volume">{Math.round(channel.volume * 100)} %</span>
      </div>
      <input
        aria-label={`Volumen de ${label}`}
        aria-orientation="vertical"
        className="sound-check-fader"
        max={MIX_VOLUME_MAX}
        min={0}
        onChange={(e) => setMixVolume(target, context, Number(e.target.value))}
        onDoubleClick={() => setMixVolume(target, context, 1)}
        step={0.01}
        title="Doble clic: 100 %"
        type="range"
        value={channel.volume}
      />
    </div>
  );
}

export function SoundCheckDesk({ riff }: { riff: Riff }) {
  const check = riff.soundCheck;
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!check) return null;
  const drums = check.piece !== null;
  const target = check.piece ?? check.target;
  // Lo que se exporta, restablece e importa: el instrumento entero (la batería, sus 5 piezas).
  const targets: MixTarget[] = drums ? DRUM_MIX_TARGETS : [check.target];
  const name = drums ? 'Batería' : MIX_TARGET_LABELS[check.target];
  const playing = riff.soundCheckStatus === 'countin' || riff.soundCheckStatus === 'playing';

  function exportFile() {
    const blob = new Blob([exportMix(targets)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mesa-sonido-${drums ? 'bateria' : check!.target}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const applied = importMix(await file.text());
    setNotice(applied.length ? `Aplicado: ${applied.map((t) => MIX_TARGET_LABELS[t]).join(', ')}.` : 'Ese archivo no es una configuración de la mesa.');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="sound-check-desk" data-target={target} data-status={riff.soundCheckStatus}>
      <div className="sound-check-head">
        <strong className="sound-check-title">Mesa · {name}</strong>
        <button aria-label={playing ? 'Parar la canción' : 'Reproducir la canción'} className="sound-check-btn" onClick={playing ? riff.stopSoundCheck : riff.playSoundCheck} type="button">
          {playing ? '■' : '▶'}
        </button>
        <button className="sound-check-btn" onClick={exportFile} type="button">Exportar</button>
        <button className="sound-check-btn" onClick={() => fileRef.current?.click()} type="button">Importar</button>
        <input accept=".json,application/json" data-testid="sound-check-import" hidden onChange={(e) => void importFile(e.target.files?.[0])} ref={fileRef} type="file" />
        <button className="sound-check-btn" onClick={() => resetMix(targets)} type="button">Restablecer</button>
        <button aria-label="Cerrar la mesa" className="sound-check-btn" onClick={riff.closeSoundCheck} type="button">✕</button>
      </div>
      {drums && (
        <div aria-label="Pieza de la batería" className="sound-check-pieces" role="group">
          {DRUM_MIX_TARGETS.map((piece) => (
            <button aria-pressed={piece === check.piece} className="sound-check-btn" key={piece} onClick={() => riff.setSoundCheckPiece(piece)} type="button">
              {MIX_TARGET_LABELS[piece]}
            </button>
          ))}
        </div>
      )}
      <div className="sound-check-channels">
        {MIX_CONTEXTS.map((context) => (
          <SoundCheckChannel
            context={context}
            key={context}
            onSolo={() => riff.setSoundCheckSolo(check.solo === context ? null : context)}
            solo={check.solo === context}
            target={target}
          />
        ))}
      </div>
      {notice && <p className="sound-check-notice">{notice}</p>}
      <style>{`
        .sound-check-desk {
          --mc-border-panel: #3f3f46;
          --mc-bg-box: #18181b;
          --mc-bg-control: #27272a;
          --mc-border-control: #52525b;
          --mc-text-primary: #e4e4e7;
          --mc-text-secondary: #a1a1aa;
          --mc-knob-from: #52525b;
          --mc-knob-to: #18181b;
          background: #09090b;
          border: 1px solid #3f3f46;
          border-radius: 12px;
          color: #e4e4e7;
          display: grid;
          gap: 6px;
          max-width: 100%;
          min-width: 0;
          padding: 8px;
        }
        .sound-check-head, .sound-check-pieces {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
        }
        .sound-check-title {
          font-size: 13px;
          margin-right: 4px;
        }
        .sound-check-btn {
          background: #27272a;
          border: 1px solid #52525b;
          border-radius: 6px;
          color: #e4e4e7;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          padding: 4px 9px;
        }
        .sound-check-btn[aria-pressed='true'] {
          background: #34d399;
          border-color: #34d399;
          color: #09090b;
        }
        .sound-check-channels {
          display: flex;
          gap: 6px;
          justify-content: safe center;
          max-width: 100%;
          overflow-x: auto;
        }
        .sound-check-channel {
          align-items: center;
          background: var(--mc-bg-box);
          border: 1px solid var(--mc-border-panel);
          border-radius: 8px;
          display: flex;
          flex: 1 1 0;
          flex-direction: column;
          gap: 4px;
          max-width: 124px;
          min-width: 92px;
          padding: 6px 4px;
        }
        .sound-check-channel[data-solo='true'] {
          border-color: #34d399;
        }
        .sound-check-name {
          font-size: 13px;
          font-weight: 800;
        }
        .sound-check-eq {
          display: flex;
          justify-content: space-between;
          width: 100%;
        }
        .sound-check-solo {
          background: var(--mc-bg-control);
          border: 1px solid var(--mc-border-control);
          border-radius: 4px;
          color: var(--mc-text-primary);
          cursor: pointer;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 12px;
        }
        .sound-check-solo[aria-pressed='true'] {
          background: #6ee7b7;
          border-color: #6ee7b7;
          color: #09090b;
        }
        .sound-check-row {
          align-items: center;
          display: flex;
          gap: 6px;
        }
        .sound-check-volume {
          color: var(--mc-text-secondary);
          font-size: 11px;
          font-weight: 700;
        }
        .sound-check-fader {
          accent-color: #34d399;
          cursor: pointer;
          direction: rtl;
          height: 80px;
          width: 6px;
          writing-mode: vertical-lr;
        }
        .sound-check-notice {
          font-size: 12px;
          margin: 0;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
