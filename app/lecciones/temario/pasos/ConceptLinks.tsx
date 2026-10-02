'use client';

import { useEffect, useState } from 'react';

// Flechas "secundarias" del árbol de /lecciones/temario/pasos: unen el tema
// Acordes con las páginas que lo amplían (Figuras de acordes y los dos apartados
// de acordes de Escalas). Mide el DOM y dibuja un <svg> encima, con trazos de
// esquinas redondeadas y dos carriles:
//   - izquierdo, por fuera del tronco, hacia Figuras de acordes (otro tema principal);
//   - derecho, por fuera de la columna de apartados, hacia los dos apartados de Escalas
//     (entran por su borde derecho, así nunca atraviesan tarjetas).

type TargetName = 'figuras' | 'harmony' | 'sevenths';

type Point = [number, number];

type LinkShape = {
  d: string;
  name: TargetName;
  start: Point;
};

const CORNER_RADIUS = 16;

// Polilínea ortogonal con cada esquina sustituida por una curva suave.
function roundedPath(points: Point[], radius = CORNER_RADIUS) {
  if (points.length < 2) {
    return '';
  }

  let d = `M ${points[0][0]} ${points[0][1]}`;

  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const inLength = Math.hypot(cx - px, cy - py);
    const outLength = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLength / 2, outLength / 2);

    if (r <= 0) {
      continue;
    }

    const beforeX = cx - ((cx - px) / inLength) * r;
    const beforeY = cy - ((cy - py) / inLength) * r;
    const afterX = cx + ((nx - cx) / outLength) * r;
    const afterY = cy + ((ny - cy) / outLength) * r;

    d += ` L ${beforeX} ${beforeY} Q ${cx} ${cy} ${afterX} ${afterY}`;
  }

  const [lx, ly] = points[points.length - 1];
  return `${d} L ${lx} ${ly}`;
}

export default function ConceptLinks() {
  const [links, setLinks] = useState<LinkShape[]>([]);

  useEffect(() => {
    const update = () => {
      const container = document.querySelector<HTMLElement>('[data-pasos-map]');
      const source = document.querySelector<HTMLElement>('[data-pasos-source]');

      if (!container || !source) {
        setLinks([]);
        return;
      }

      const box = container.getBoundingClientRect();
      const src = source.getBoundingClientRect();
      const width = box.width;
      const isNarrow = width < 640;
      const next: LinkShape[] = [];

      const figuras = document.querySelector<HTMLElement>('[data-pasos-target="figuras"]');

      if (figuras) {
        const tgt = figuras.getBoundingClientRect();
        const startX = src.left - box.left;
        const startY = src.bottom - box.top - 22;
        const endX = tgt.left - box.left - 3;
        const endY = tgt.bottom - box.top - 22;
        // El carril va por fuera del tronco, sin rozar sus puntos.
        const dot = source.closest('li')?.querySelector<HTMLElement>('.cn-dot');
        const trunkX = dot ? dot.getBoundingClientRect().left - box.left + dot.offsetWidth / 2 : startX - 60;
        const laneX = Math.max(5, trunkX - (isNarrow ? 22 : 30));
        const start: Point = [startX, startY];

        next.push({
          d: roundedPath([start, [laneX, startY], [laneX, endY], [endX, endY]]),
          name: 'figuras',
          start,
        });
      }

      // harmony va por el carril interior y sevenths por el exterior: como harmony
      // termina más arriba, sus trazos nunca se cruzan.
      // Los carriles derechos van justo por fuera de la columna de apartados
      // (que ya no llega hasta el borde del mapa en pantallas anchas).
      const rightTargets = Array.from(
        document.querySelectorAll<HTMLElement>('[data-pasos-target="harmony"], [data-pasos-target="sevenths"]')
      );
      const columnRight = Math.max(0, ...rightTargets.map((element) => element.getBoundingClientRect().right - box.left));

      (['harmony', 'sevenths'] as const).forEach((name, index) => {
        const target = document.querySelector<HTMLElement>(`[data-pasos-target="${name}"]`);

        if (!target) {
          return;
        }

        const tgt = target.getBoundingClientRect();
        const startX = src.right - box.left;
        const startY = src.top - box.top + 42;
        const laneX = Math.min(width - 4, columnRight + (isNarrow ? 10 : 20) + index * (isNarrow ? 12 : 16));
        const endX = tgt.right - box.left + 3;
        const endY = tgt.top - box.top + tgt.height / 2;
        const start: Point = [startX, startY];

        next.push({
          d: roundedPath([start, [laneX, startY], [laneX, endY], [endX, endY]]),
          name,
          start,
        });
      });

      setLinks(next);
    };

    update();

    const observer = new ResizeObserver(update);
    document
      .querySelectorAll<HTMLElement>('[data-pasos-map], [data-pasos-source], [data-pasos-target]')
      .forEach((element) => observer.observe(element));
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <svg className="cn-links" aria-hidden="true">
      <defs>
        <marker
          id="cn-link-arrow"
          markerHeight="12"
          markerUnits="userSpaceOnUse"
          markerWidth="12"
          orient="auto"
          refX="9"
          refY="6"
        >
          <path d="M 2 1.5 L 9.5 6 L 2 10.5" />
        </marker>
      </defs>
      {links.map((link) => (
        <g key={link.name} className={`cn-link cn-link-${link.name}`}>
          <path d={link.d} markerEnd="url(#cn-link-arrow)" />
          <circle cx={link.start[0]} cy={link.start[1]} r="4.5" />
        </g>
      ))}
    </svg>
  );
}
