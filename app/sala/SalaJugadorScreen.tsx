'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import SalaMarcador, { SalaMarcadorStyles } from './SalaMarcador';
import SalaPreguntaJugador from './SalaPreguntaJugador';
import { useSalaEstado } from './useSalaEstado';

function jugadorIdKey(codigo: string) {
  return `sala:${codigo}:jugadorId`;
}

export default function SalaJugadorScreen({ codigo }: { codigo: string }) {
  const [jugadorId, setJugadorId] = useState<string | null>(null);
  const [cargandoStorage, setCargandoStorage] = useState(true);
  const [nombre, setNombre] = useState('');
  const [uniendose, setUniendose] = useState(false);
  const [errorUnirse, setErrorUnirse] = useState<string | null>(null);
  const [respondiendo, setRespondiendo] = useState(false);

  // sessionStorage no existe en el servidor, así que leerlo tiene que esperar a un efecto que solo
  // corre en el cliente (mismo patrón ya usado en QuizRunner.tsx para el mismo tipo de lectura).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setJugadorId(sessionStorage.getItem(jugadorIdKey(codigo)));
    setCargandoStorage(false);
  }, [codigo]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { error, estado } = useSalaEstado({ activo: !!jugadorId, codigo, jugadorId: jugadorId ?? undefined });

  // Si el servidor dice que ese jugadorId no pertenece a la sala (sessionStorage viejo de otra
  // sala, o la sala expiro), se limpia y se vuelve a pedir nombre -- entra como jugador nuevo.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (error && jugadorId) {
      sessionStorage.removeItem(jugadorIdKey(codigo));
      setJugadorId(null);
    }
  }, [error, jugadorId, codigo]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleUnirse(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nombre.trim();
    if (!trimmed || uniendose) return;
    setUniendose(true);
    setErrorUnirse(null);
    const res = await fetch('/api/quiz/sala/unirse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, nombre: trimmed }),
    });
    const data = await res.json().catch(() => null);
    setUniendose(false);
    if (!res.ok) {
      setErrorUnirse(data?.error ?? 'No se pudo unir a la sala');
      return;
    }
    sessionStorage.setItem(jugadorIdKey(codigo), data.jugadorId);
    setJugadorId(data.jugadorId);
  }

  async function handleAnswer(opcionIndex: number) {
    if (respondiendo || !estado || !jugadorId) return;
    setRespondiendo(true);
    await fetch('/api/quiz/sala/responder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, jugadorId, indice: estado.indice, opcionIndex }),
    });
    setRespondiendo(false);
  }

  if (cargandoStorage) return null;

  if (!jugadorId) {
    return (
      <section className="sala-panel">
        <p className="sala-kicker">Unirse a la sala {codigo}</p>
        <form className="quiz-name-form" onSubmit={handleUnirse}>
          <label className="quiz-name-label" htmlFor="sala-nombre-input">Tu nombre</label>
          <div className="quiz-name-row">
            <input
              id="sala-nombre-input"
              className="quiz-name-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={20}
              placeholder="Ej: Kael"
            />
            <button type="submit" className="quiz-name-submit" disabled={uniendose}>
              Unirse
            </button>
          </div>
          {errorUnirse ? <p className="quiz-name-error">{errorUnirse}</p> : null}
        </form>
      </section>
    );
  }

  if (!estado) {
    return <p className="quiz-empty">Conectando con la sala...</p>;
  }

  if (estado.estado === 'lobby') {
    return (
      <section className="sala-panel">
        <p className="sala-kicker">Sala de espera</p>
        <p className="sala-waiting">Esperando a que el anfitrion empiece la partida...</p>
        <ul className="sala-jugadores-list">
          {estado.jugadores.map((j) => (
            <li key={j.id}>{j.nombre}</li>
          ))}
        </ul>
      </section>
    );
  }

  if (estado.estado === 'jugando' && estado.pregunta) {
    return (
      <SalaPreguntaJugador
        indice={estado.indice}
        miRespuesta={estado.miRespuesta}
        onAnswer={handleAnswer}
        pregunta={estado.pregunta}
        revelada={estado.revelada}
        totalPreguntas={estado.totalPreguntas}
      />
    );
  }

  return (
    <section className="sala-panel">
      <p className="sala-kicker">Partida terminada</p>
      <SalaMarcador marcador={estado.marcador} totalPreguntas={estado.totalPreguntas} />
      <Link href="/lecciones/temario" className="quiz-back-link">
        Volver a la portada
      </Link>
      <SalaMarcadorStyles />
    </section>
  );
}
