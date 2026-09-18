'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SalaMarcador, { SalaMarcadorStyles } from './SalaMarcador';
import SalaPreguntaAnfitrion from './SalaPreguntaAnfitrion';
import { normalizeRoomCode } from '@/app/lib/quiz/salaCodigo';
import { useSalaEstado } from './useSalaEstado';

function anfitrionTokenKey(codigo: string) {
  return `sala:${codigo}:anfitrionToken`;
}
function jugadorIdKey(codigo: string) {
  return `sala:${codigo}:jugadorId`;
}

export default function SalaAnfitrionScreen({ codigo }: { codigo: string }) {
  const router = useRouter();
  const [anfitrionToken, setAnfitrionToken] = useState<string | null>(null);
  const [avanzando, setAvanzando] = useState(false);

  const [codigoAjeno, setCodigoAjeno] = useState('');
  const [nombreAjeno, setNombreAjeno] = useState('');
  const [uniendose, setUniendose] = useState(false);
  const [errorUnirse, setErrorUnirse] = useState<string | null>(null);

  // sessionStorage no existe en el servidor, así que leerlo tiene que esperar a un efecto que solo
  // corre en el cliente (mismo patrón ya usado en QuizRunner.tsx para el mismo tipo de lectura).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setAnfitrionToken(sessionStorage.getItem(anfitrionTokenKey(codigo)));
  }, [codigo]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { estado } = useSalaEstado({ activo: !!anfitrionToken, anfitrionToken: anfitrionToken ?? undefined, codigo });

  async function avanzar(accion: 'empezar' | 'revelar' | 'siguiente' | 'terminar') {
    if (avanzando || !anfitrionToken) return;
    setAvanzando(true);
    await fetch('/api/quiz/sala/avanzar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, anfitrionToken, accion }),
    });
    setAvanzando(false);
  }

  // Unirse a la sala de OTRA persona: abandona esta (sigue existiendo, expira sola por TTL) y
  // pasa a la sala de espera de la sala ajena -- ahi solo se ve la lista de jugadores, sin codigo
  // propio ni boton de empezar, eso es exclusivo de quien creo esa sala.
  async function handleUnirseOtra(e: React.FormEvent) {
    e.preventDefault();
    const codigoNormalizado = normalizeRoomCode(codigoAjeno);
    const nombreTrim = nombreAjeno.trim();
    if (!codigoNormalizado || !nombreTrim || uniendose) return;
    setUniendose(true);
    setErrorUnirse(null);
    const res = await fetch('/api/quiz/sala/unirse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: codigoNormalizado, nombre: nombreTrim }),
    });
    const data = await res.json().catch(() => null);
    setUniendose(false);
    if (!res.ok) {
      setErrorUnirse(data?.error ?? 'No se pudo unir a esa sala');
      return;
    }
    sessionStorage.setItem(jugadorIdKey(codigoNormalizado), data.jugadorId);
    router.push(`/sala/jugar/${codigoNormalizado}`);
  }

  if (!anfitrionToken) {
    return (
      <p className="quiz-empty">
        Este enlace de sala solo funciona en el navegador que la creó. Si quieres unirte a una
        sala, pide el código a quien la creó.
      </p>
    );
  }

  if (!estado) {
    return <p className="quiz-empty">Conectando con la sala...</p>;
  }

  if (estado.estado === 'lobby') {
    return (
      <div className="sala-panel">
        <p className="sala-kicker">Tu codigo de sala</p>
        <p className="sala-codigo-grande">{codigo}</p>

        <form className="sala-unirse-otra" onSubmit={handleUnirseOtra}>
          <p className="sala-kicker">¿Te vas a unir a la sala de otra persona?</p>
          <div className="quiz-name-row">
            <input
              className="quiz-name-input sala-codigo-input"
              value={codigoAjeno}
              onChange={(e) => setCodigoAjeno(e.target.value)}
              maxLength={5}
              placeholder="Codigo"
            />
            <input
              className="quiz-name-input"
              value={nombreAjeno}
              onChange={(e) => setNombreAjeno(e.target.value)}
              maxLength={20}
              placeholder="Tu nombre"
            />
            <button type="submit" className="quiz-name-submit" disabled={uniendose}>
              Unirse
            </button>
          </div>
          {errorUnirse ? <p className="quiz-name-error">{errorUnirse}</p> : null}
        </form>

        <div className="sala-jugadores-box">
          <p className="sala-kicker">Se han unido con tu codigo ({estado.jugadores.length})</p>
          <ul className="sala-jugadores-list">
            {estado.jugadores.map((j) => (
              <li key={j.id}>{j.nombre}</li>
            ))}
          </ul>
        </div>

        <button type="button" className="quiz-multijugador-button" onClick={() => avanzar('empezar')} disabled={avanzando}>
          Empezar
        </button>
      </div>
    );
  }

  if (estado.estado === 'jugando' && estado.pregunta) {
    return (
      <div className="sala-panel">
        <SalaPreguntaAnfitrion
          indice={estado.indice}
          pregunta={estado.pregunta}
          revelada={estado.revelada}
          respondieron={estado.respondieron}
          totalJugadores={estado.totalJugadores}
          totalPreguntas={estado.totalPreguntas}
        />
        <div className="sala-controles">
          {!estado.revelada ? (
            <button type="button" className="quiz-next-button" onClick={() => avanzar('revelar')} disabled={avanzando}>
              Revelar respuesta
            </button>
          ) : (
            <button type="button" className="quiz-next-button" onClick={() => avanzar('siguiente')} disabled={avanzando}>
              {estado.indice + 1 >= estado.totalPreguntas ? 'Ver resultado final' : 'Siguiente pregunta'}
            </button>
          )}
        </div>
        <SalaMarcador marcador={estado.marcador} totalPreguntas={estado.totalPreguntas} />
        <SalaMarcadorStyles />
      </div>
    );
  }

  return (
    <div className="sala-panel">
      <p className="sala-kicker">Partida terminada</p>
      <SalaMarcador marcador={estado.marcador} totalPreguntas={estado.totalPreguntas} />
      <Link href="/lecciones/temario" className="quiz-back-link">
        Volver a la portada
      </Link>
      <SalaMarcadorStyles />
    </div>
  );
}
