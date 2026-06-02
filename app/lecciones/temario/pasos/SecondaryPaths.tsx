'use client';

import { useEffect, useState } from 'react';

type PathName = 'figuras' | 'harmony' | 'sevenths';

type PathShape = {
  d: string;
  name: PathName;
};

const pathNames: PathName[] = ['figuras', 'harmony', 'sevenths'];

function centerY(rect: DOMRect, container: DOMRect) {
  return rect.top - container.top + rect.height / 2;
}

function leftX(rect: DOMRect, container: DOMRect) {
  return rect.left - container.left;
}

function buildPath(source: DOMRect, target: DOMRect, container: DOMRect, laneOffset: number) {
  const sourceX = leftX(source, container);
  const targetX = leftX(target, container);
  const sourceY = centerY(source, container);
  const targetY = centerY(target, container);
  const laneX = Math.max(8, sourceX - laneOffset);
  const targetLeadX = targetX - 10;

  return `M ${sourceX} ${sourceY} H ${laneX} V ${targetY} H ${targetLeadX}`;
}

export default function SecondaryPaths() {
  const [paths, setPaths] = useState<PathShape[]>([]);

  useEffect(() => {
    const updatePaths = () => {
      const container = document.querySelector<HTMLElement>('[data-learning-map]');
      const source = document.querySelector<HTMLElement>('[data-secondary-source="acordes"]');

      if (!container || !source) {
        setPaths([]);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const nextPaths = pathNames.flatMap((name, index) => {
        const target = document.querySelector<HTMLElement>(`[data-secondary-target="${name}"]`);

        if (!target) {
          return [];
        }

        return [{
          d: buildPath(sourceRect, target.getBoundingClientRect(), containerRect, 72 + index * 20),
          name,
        }];
      });

      setPaths(nextPaths);
    };

    updatePaths();

    const observer = new ResizeObserver(updatePaths);
    const observed = Array.from(document.querySelectorAll<HTMLElement>('[data-learning-map], [data-secondary-source], [data-secondary-target]'));
    observed.forEach((element) => observer.observe(element));
    window.addEventListener('resize', updatePaths);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePaths);
    };
  }, []);

  return (
    <svg className="secondary-path-overlay" aria-hidden="true">
      <defs>
        <marker id="secondary-path-arrow" markerHeight="8" markerWidth="9" orient="auto" refX="8" refY="4">
          <path d="M 0 0 L 8 4 L 0 8 Z" />
        </marker>
      </defs>
      {paths.map((path) => (
        <path className={`secondary-path secondary-path-${path.name}`} d={path.d} key={path.name} markerEnd="url(#secondary-path-arrow)" />
      ))}
    </svg>
  );
}
