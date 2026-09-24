'use client';

import Knob from './Knob';
import { EQ_MAX_DB, EQ_MIN_DB, eqDbToRatio, eqRatioToDb } from '../../lib/mixingConsole/audioEngine';
import type { ChannelState, EQBand, InstrumentDef } from '../../lib/mixingConsole/audioEngine';

function formatEQ(v: number): string {
  if (v <= EQ_MIN_DB) return '-∞';
  return `${v > 0 ? '+' : ''}${v.toFixed(0)}dB`;
}

interface ChannelStripProps {
  instrument: InstrumentDef;
  channel: ChannelState;
  isSolo: boolean;
  onVolume: (value: number) => void;
  onPan: (value: number) => void;
  onEQ: (band: EQBand, value: number) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
}

// Recuadro vertical de un instrumento: EQ (high, mid, low) -> pan -> mute/solo -> volumen
// (vertical), en ese orden de arriba a abajo, tal y como lo pidió el usuario.
export default function ChannelStrip({
  instrument,
  channel,
  isSolo,
  onVolume,
  onPan,
  onEQ,
  onToggleMute,
  onToggleSolo,
}: ChannelStripProps) {
  return (
    <div
      style={{
        background: 'var(--mc-bg-box)',
        border: '1px solid var(--mc-border-panel)',
        borderRadius: '8px',
        display: 'flex',
        flex: '0 0 auto',
        flexDirection: 'column',
        gap: 10,
        padding: '10px 10px 14px',
        width: 128,
      }}
    >
      <span
        style={{
          color: 'var(--mc-text-primary)',
          fontSize: 13,
          fontWeight: 800,
          textAlign: 'center',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
        title={instrument.label}
      >
        {instrument.label}
      </span>

      <div style={{ alignItems: 'flex-start', display: 'flex', justifyContent: 'space-between' }}>
        <Knob
          ariaLabel={`Agudos de ${instrument.label}`}
          label="High"
          value={channel.eq.high}
          min={EQ_MIN_DB}
          max={EQ_MAX_DB}
          defaultValue={0}
          formatValue={formatEQ}
          valueToRatio={eqDbToRatio}
          ratioToValue={eqRatioToDb}
          onChange={v => onEQ('high', v)}
        />
        <Knob
          ariaLabel={`Medios de ${instrument.label}`}
          label="Mid"
          value={channel.eq.mid}
          min={EQ_MIN_DB}
          max={EQ_MAX_DB}
          defaultValue={0}
          formatValue={formatEQ}
          valueToRatio={eqDbToRatio}
          ratioToValue={eqRatioToDb}
          onChange={v => onEQ('mid', v)}
        />
        <Knob
          ariaLabel={`Graves de ${instrument.label}`}
          label="Low"
          value={channel.eq.low}
          min={EQ_MIN_DB}
          max={EQ_MAX_DB}
          defaultValue={0}
          formatValue={formatEQ}
          valueToRatio={eqDbToRatio}
          ratioToValue={eqRatioToDb}
          onChange={v => onEQ('low', v)}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Knob
          ariaLabel={`Panorama de ${instrument.label}`}
          label="Pan"
          value={channel.pan}
          min={-1}
          max={1}
          defaultValue={0}
          formatValue={v => (Math.abs(v) < 0.05 ? 'C' : v < 0 ? `${Math.round(-v * 100)}L` : `${Math.round(v * 100)}R`)}
          onChange={onPan}
          accentColor="#60a5fa"
        />
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        <button
          type="button"
          aria-pressed={channel.muted}
          aria-label={`Silenciar ${instrument.label}`}
          title="Mute"
          onClick={onToggleMute}
          style={{
            background: channel.muted ? '#f87171' : 'var(--mc-bg-control)',
            border: `1px solid ${channel.muted ? '#f87171' : 'var(--mc-border-control)'}`,
            borderRadius: '4px',
            color: channel.muted ? '#09090b' : 'var(--mc-text-primary)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 800,
            padding: '4px 10px',
          }}
        >
          M
        </button>
        <button
          type="button"
          aria-pressed={isSolo}
          aria-label={`Solo ${instrument.label}`}
          title="Solo"
          onClick={onToggleSolo}
          style={{
            background: isSolo ? '#6ee7b7' : 'var(--mc-bg-control)',
            border: `1px solid ${isSolo ? '#6ee7b7' : 'var(--mc-border-control)'}`,
            borderRadius: '4px',
            color: isSolo ? '#09090b' : 'var(--mc-text-primary)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 800,
            padding: '4px 10px',
          }}
        >
          S
        </button>
      </div>

      <div style={{ alignItems: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: 'var(--mc-text-secondary)', fontSize: 10, fontWeight: 700 }}>{Math.round(channel.volume * 100)}</span>
        <input
          type="range"
          aria-label={`Volumen de ${instrument.label}`}
          aria-orientation="vertical"
          min={0}
          max={1}
          step={0.01}
          value={channel.volume}
          onChange={e => onVolume(Number(e.target.value))}
          style={{
            accentColor: '#34d399',
            cursor: 'pointer',
            direction: 'rtl',
            height: 96,
            width: 8,
            writingMode: 'vertical-lr',
          }}
        />
      </div>
    </div>
  );
}
