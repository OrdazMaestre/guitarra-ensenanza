'use client';

import Link from 'next/link';
import { useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeEs } from '../../lib/maikaelExpression';
import type { SiteSearchEntry } from '../../lib/siteSearchIndex';

// Buscador de páginas de toda la web. Al enfocarlo se abre la lista debajo: vacío = todas las
// páginas; con texto = las que contienen TODAS las palabras escritas en su título o en sus
// palabras clave (sin acentos ni mayúsculas). Siempre en orden alfabético (`entries` ya viene
// ordenado desde el servidor, ver siteSearchIndex.ts).
export default function SiteSearch({ entries }: { entries: SiteSearchEntry[] }) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const words = normalizeEs(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return entries;
    return entries.filter((entry) => words.every((word) => entry.terms.some((term) => term.includes(word))));
  }, [entries, query]);

  function close() {
    setOpen(false);
    setQuery('');
    setActive(0);
  }

  function go(entry: SiteSearchEntry) {
    close();
    inputRef.current?.blur();
    router.push(entry.href);
  }

  // Cerrar al salir del buscador, salvo si el foco va a un enlace de su propia lista (al pulsar
  // uno, el input pierde el foco ANTES del click; si cerrase aquí, el enlace desaparecería).
  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
    close();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (results.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const entry = results[active];
      if (open && entry) {
        e.preventDefault();
        go(entry);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const activeEntry = open ? results[active] : undefined;

  return (
    <div className="site-search" ref={rootRef} onBlur={handleBlur}>
      <svg aria-hidden="true" className="site-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        className="site-search-input"
        placeholder="Buscar lección…"
        aria-label="Buscar una página de la web"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeEntry ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Páginas de la web" className="site-search-list">
          {results.length === 0 ? (
            <li className="site-search-empty" role="presentation">
              No hay ninguna página con esas palabras
            </li>
          ) : (
            results.map((entry, index) => (
              <li key={entry.href} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                <Link
                  href={entry.href}
                  className={`site-search-option${index === active ? ' is-active' : ''}`}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    close();
                    inputRef.current?.blur();
                  }}
                >
                  {entry.title}
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
