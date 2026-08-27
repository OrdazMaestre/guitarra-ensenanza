'use client';

import { useEffect, useRef, useState } from 'react';
import { MAIKAEL_INTRO_LINE } from '@/app/lib/maikaelPrompt';
import { useMaikaelSessionCount } from '@/app/lib/maikaelSession';

type ChatRole = 'user' | 'model' | 'system';
interface ChatMessage {
  role: ChatRole;
  text: string;
}

const SESSION_LIMIT_TEXT = 'Necesito recargar pilas — recarga la página para seguir hablando conmigo.';
const DAILY_LIMIT_TEXT = 'Me he quedado sin cupo por hoy — vuelve mañana.';
const NETWORK_ERROR_TEXT = 'No he podido responder ahora mismo, prueba otra vez.';

export interface MaikaelChatProps {
  /** Se llama con el texto del alumno justo antes de mandarlo. */
  onUserMessage?: (text: string) => void;
  /** Se llama con la respuesta real de MAIkael en cuanto llega. */
  onReply?: (text: string) => void;
  /**
   * Px reservados a la derecha del panel (offset `right` del contenedor fijo
   * + ancho del propio robot) — sin esto, en móvil el panel podía pedir más
   * ancho del que quedaba libre a la izquierda del robot y se salía por el
   * borde izquierdo de la pantalla (recortado en silencio por el
   * `overflow-x: clip` global, sin barra de scroll visible).
   */
  reservedRightPx?: number;
}

export default function MaikaelChat({ onUserMessage, onReply, reservedRightPx = 0 }: MaikaelChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'model', text: MAIKAEL_INTRO_LINE }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState<'daily' | 'session' | null>(null);
  const session = useMaikaelSessionCount();
  const scrollRef = useRef<HTMLDivElement>(null);

  // El mensaje más nuevo siempre visible abajo — los antiguos "desaparecen
  // por arriba" al hacer scroll, en vez de acumularse tapándose unos a
  // otros (a petición de Ordaz). Se dispara también con `sending` para que
  // el círculo de carga quede a la vista nada más enviar.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending || blocked) return;

    onUserMessage?.(text);
    const history = messages
      .slice(1) // el primer mensaje (índice 0) es el saludo sembrado; el servidor ya lo añade solo
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'model', text: m.text }));

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/maikael/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json().catch(() => null);

      if (data?.blocked === 'daily') {
        setMessages((prev) => [...prev, { role: 'system', text: DAILY_LIMIT_TEXT }]);
        setBlocked('daily');
        return;
      }
      if (data?.blocked === 'personal-data') {
        // No es un bloqueo duro: no cuenta para ningún límite y el alumno
        // puede seguir escribiendo normal justo después (encargo de Ordaz).
        setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
        return;
      }
      if (!res.ok || !data?.reply) {
        setMessages((prev) => [...prev, { role: 'system', text: NETWORK_ERROR_TEXT }]);
        return;
      }

      setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
      onReply?.(data.reply);

      const newCount = session.increment();
      if (newCount >= session.limit) {
        setMessages((prev) => [...prev, { role: 'system', text: SESSION_LIMIT_TEXT }]);
        setBlocked('session');
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'system', text: NETWORK_ERROR_TEXT }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: `min(280px, calc(100vw - 40px), calc(100vw - ${reservedRightPx + 8}px))`,
        // 100dvh, no soportado en algunos navegadores embebidos (visto en el
        // Simple Browser de VS Code: sin límite real, los mensajes se
        // acumulaban y se pisaban unos con otros en vez de hacer scroll).
        // 100vh tiene soporte mucho más universal.
        maxHeight: 'calc(100vh - 6px)',
        overflow: 'hidden',
        background: 'transparent',
        fontFamily: 'inherit',
      }}
    >
      <div
        ref={scrollRef}
        className="maikael-chat-scroll"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          padding: '8px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className="maikael-chat-scroll"
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              // minWidth:0 es necesario: sin él, un hijo flex con contenido
              // sin espacios (una palabra/URL larga) ignora maxWidth y crece
              // hasta su tamaño mínimo intrínseco en vez de activar el
              // overflow-x propio de la burbuja (mismo motivo que
              // .midi-instrument-host en globals.css).
              minWidth: 0,
              maxWidth: '88%',
              // Sin flexShrink:0, el algoritmo de flex ENCOGE cada burbuja en
              // el eje principal (vertical, es una columna) para que todas
              // quepan en el contenedor, en vez de mantener su alto natural
              // y dejar que sea el contenedor el que haga scroll — así se
              // veían los mensajes cortados a una línea y amontonados.
              flexShrink: 0,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: 13,
              lineHeight: 1.35,
              padding: '6px 9px',
              borderRadius: 10,
              background: m.role === 'user' ? '#047857' : m.role === 'system' ? '#fef3c7' : '#fbeed6',
              color: m.role === 'user' ? '#ffffff' : m.role === 'system' ? '#92400e' : '#3a2a12',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            }}
          >
            {m.text}
          </div>
        ))}
        {sending && (
          <div
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: '#92603a',
              padding: '2px 4px',
            }}
          >
            <span className="maikael-spinner" aria-hidden />
            MAIkael está pensando…
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '8px 4px 3px', flex: '0 0 auto' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          disabled={sending || blocked !== null}
          placeholder={blocked ? 'MAIkael no puede seguir ahora' : 'Escribe aquí…'}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            padding: '6px 8px',
            borderRadius: 8,
            border: '1px solid #e0c68f',
            background: blocked ? '#f3f1ea' : '#ffffff',
            color: '#3a2a12',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || blocked !== null || !input.trim()}
          style={{
            fontSize: 13,
            padding: '6px 10px',
            borderRadius: 8,
            border: 'none',
            background: sending || blocked !== null || !input.trim() ? '#d9d2c2' : '#047857',
            color: '#ffffff',
            cursor: sending || blocked !== null || !input.trim() ? 'default' : 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
