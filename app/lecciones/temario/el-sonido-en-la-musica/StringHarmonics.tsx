const ROWS = [
  { label: 'Fundamental',   tag: 'f₁', mode: 1, color: '#378ADD' },
  { label: '1.er armónico', tag: 'f₂', mode: 2, color: '#D4537E' },
  { label: '2.º armónico',  tag: 'f₃', mode: 3, color: '#1D9E75' },
  { label: '3.er armónico', tag: 'f₄', mode: 4, color: '#BA7517' },
  { label: '4.º armónico',  tag: 'f₅', mode: 5, color: '#7F77DD' },
];

const W = 300, H = 72, MID = 36, AMP = 24, PTS = 300;

function solid(mode: number) {
  return Array.from({ length: PTS + 1 }, (_, i) => {
    const t = i / PTS;
    const y = MID - AMP * Math.sin(mode * Math.PI * t);
    return `${i === 0 ? 'M' : 'L'}${(t * W).toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function dashed(mode: number) {
  return Array.from({ length: PTS + 1 }, (_, i) => {
    const t = i / PTS;
    const y = MID + AMP * Math.sin(mode * Math.PI * t);
    return `${i === 0 ? 'M' : 'L'}${(t * W).toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function area(mode: number) {
  const fwd = Array.from({ length: PTS + 1 }, (_, i) => {
    const t = i / PTS;
    const y = MID - AMP * Math.sin(mode * Math.PI * t);
    return `${i === 0 ? 'M' : 'L'}${(t * W).toFixed(2)},${y.toFixed(2)}`;
  });
  const bwd = Array.from({ length: PTS + 1 }, (_, i) => {
    const t = (PTS - i) / PTS;
    const y = MID + AMP * Math.sin(mode * Math.PI * t);
    return `L${(t * W).toFixed(2)},${y.toFixed(2)}`;
  });
  return [...fwd, ...bwd, 'Z'].join(' ');
}

function nodeList(mode: number) {
  return Array.from({ length: mode + 1 }, (_, i) => ({
    cx: (i / mode) * W,
    cy: MID,
  }));
}

export default function StringHarmonics() {
  return (
    <div className="sh">
      {ROWS.map(({ label, tag, mode, color }) => (
        <div key={mode} className="sh-row">
          <div className="sh-label">
            <span className="sh-name" style={{ color }}>{label}</span>
            <span className="sh-tag">{tag}</span>
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="sh-svg"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${label}: ${mode} ${mode === 1 ? 'semiciclo' : 'semiciclos'}`}
          >
            <path d={area(mode)} fill={color} opacity={0.12} />
            <line x1={0} y1={MID} x2={W} y2={MID} stroke="#d4d4d8" strokeWidth={1} />
            <path d={solid(mode)} fill="none" stroke={color} strokeWidth={2} />
            <path d={dashed(mode)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 3" />
            {nodeList(mode).map(({ cx, cy }, i) => (
              <circle key={i} cx={cx} cy={cy} r={4} fill={color} />
            ))}
          </svg>
        </div>
      ))}
      <p className="sh-foot">← longitud de cuerda →</p>
      <style>{`
        .sh { display: grid; gap: 4px; }
        .sh-row { align-items: center; display: flex; }
        .sh-label {
          align-items: flex-start;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          gap: 2px;
          justify-content: center;
          padding-right: 12px;
          width: 110px;
        }
        .sh-name { font-size: 11px; font-weight: 800; line-height: 1.2; }
        .sh-tag { color: #71717a; font-size: 13px; font-weight: 700; }
        .sh-svg { display: block; flex: 1; height: 72px; min-width: 0; }
        .sh-foot { color: #a1a1aa; font-size: 12px; font-weight: 700; margin: 6px 0 0 122px; text-align: center; }
      `}</style>
    </div>
  );
}
