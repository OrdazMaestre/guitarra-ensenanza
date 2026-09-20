'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SalaMarcador, { SalaMarcadorStyles } from './SalaMarcador';
import SalaPreguntaJugador from './SalaPreguntaJugador';
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

  // El anfitrión es un jugador más: `jugadorId` es su propio id en ESTA sala (distinto de
  // `anfitrionToken`, que solo autoriza los controles de avance). Se pide su nombre DESPUÉS de
  // pulsar "Empezar" y ANTES de que la partida arranque para todos -- por eso `pidiendoNombre`
  // sustituye al botón "Empezar" en vez de abrir un paso aparte.
  const [jugadorId, setJugadorId] = useState<string | null>(null);
  const [pidiendoNombre, setPidiendoNombre] = useState(false);
  const [nombreHost, setNombreHost] = useState('');
  const [empezando, setEmpezando] = useState(false);
  const [errorEmpezar, setErrorEmpezar] = useState<string | null>(null);
  const [respondiendo, setRespondiendo] = useState(false);

  // sessionStorage no existe en el servidor, así que leerlo tiene que esperar a un efecto que solo
  // corre en el cliente (mismo patrón ya usado en QuizRunner.tsx para el mismo tipo de lectura).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setAnfitrionToken(sessionStorage.getItem(anfitrionTokenKey(codigo)));
    setJugadorId(sessionStorage.getItem(jugadorIdKey(codigo)));
  }, [codigo]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { estado } = useSalaEstado({ activo: !!anfitrionToken, anfitrionToken: anfitrionToken ?? undefined, codigo, jugadorId: jugadorId ?? undefined });

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

  // Unirse-como-jugador (si hace falta) + arrancar la partida, en un solo paso: si el anfitrión ya
  // tenía jugadorId (ej. recargó la página justo después de enviar el nombre pero antes de que
  // 'empezar' llegara a confirmarse), no vuelve a darse de alta, solo reintenta el avance.
  async function handleEmpezar(e: React.FormEvent) {
    e.preventDefault();
    const nombreTrim = nombreHost.trim();
    if (empezando) return;
    if (!jugadorId && !nombreTrim) return;
    setEmpezando(true);
    setErrorEmpezar(null);
    let miJugadorId = jugadorId;
    if (!miJugadorId) {
      const res = await fetch('/api/quiz/sala/unirse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, nombre: nombreTrim }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEmpezando(false);
        setErrorEmpezar(data?.error ?? 'No se pudo unir a la sala');
        return;
      }
      miJugadorId = data.jugadorId;
      sessionStorage.setItem(jugadorIdKey(codigo), miJugadorId as string);
      setJugadorId(miJugadorId);
    }
    await avanzar('empezar');
    setEmpezando(false);
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

        <div className="sala-codigo-box">
          <p className="sala-kicker">Tu codigo de sala</p>
          <p className="sala-codigo-grande">{codigo}</p>
        </div>

        <div className="sala-jugadores-box">
          <p className="sala-kicker">Se han unido con tu codigo ({estado.jugadores.length})</p>
          <ul className="sala-jugadores-list">
            {estado.jugadores.map((j) => (
              <li key={j.id}>{j.nombre}</li>
            ))}
          </ul>
        </div>

        {pidiendoNombre ? (
          <form className="quiz-name-form" onSubmit={handleEmpezar}>
            <label className="quiz-name-label" htmlFor="sala-host-nombre-input">Tu nombre (tambien vas a jugar)</label>
            <div className="quiz-name-row">
              <input
                id="sala-host-nombre-input"
                className="quiz-name-input"
                value={nombreHost}
                onChange={(e) => setNombreHost(e.target.value)}
                maxLength={20}
                placeholder="Ej: Kael"
                autoFocus
              />
              <button type="submit" className="quiz-name-submit" disabled={empezando}>
                {empezando ? 'Empezando...' : 'Empezar'}
              </button>
            </div>
            {errorEmpezar ? <p className="quiz-name-error">{errorEmpezar}</p> : null}
          </form>
        ) : (
          <button type="button" className="quiz-multijugador-button" onClick={() => setPidiendoNombre(true)}>
            Empezar
          </button>
        )}
      </div>
    );
  }

  if (estado.estado === 'jugando' && estado.pregunta) {
    return (
      <div className="sala-panel">
        <SalaPreguntaJugador
          indice={estado.indice}
          jugadoresEstado={estado.jugadoresEstado}
          miRespuesta={estado.miRespuesta}
          onAnswer={handleAnswer}
          pregunta={estado.pregunta}
          revelada={estado.revelada}
          totalPreguntas={estado.totalPreguntas}
        />
        <div className="sala-controles">
          {!estado.revelada ? (
            <button type="button" className="quiz-next-button" onClick={() => avanzar('revelar')} disabled={avanzando || !estado.puedeRevelar}>
              Revelar respuesta
            </button>
          ) : (
            <button type="button" className="quiz-next-button" onClick={() => avanzar('siguiente')} disabled={avanzando}>
              {estado.indice + 1 >= estado.totalPreguntas ? 'Ver resultado final' : 'Siguiente pregunta'}
            </button>
          )}
        </div>
        {/* "Revelar" se activa con la PRIMERA de dos condiciones (contestan todos, o pasan 25s) --
            nunca hacen falta las dos a la vez. Si aun asi el anfitrión no lo pulsa, se revela sola
            a los 50s. "Siguiente" no tiene condición propia: se puede pulsar sin esperar nada en
            cuanto se revela, y si no, se avanza sola a los 10s -- ambas son la misma red de
            seguridad para cuando el anfitrión se retrasa o abandona la sala. */}
        {!estado.revelada && !estado.puedeRevelar ? (
          <p className="sala-waiting">
            {estado.respondieron} de {estado.totalJugadores} han contestado -- se activa en cuanto
            contesten todos o pasen 25s (como muy tarde, se revela sola a los 50s).
          </p>
        ) : null}
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
