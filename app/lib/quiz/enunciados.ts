// TODOS los enunciados del quiz, en un solo sitio, organizados por categoría (misma división que
// app/lib/quiz/generators/*.ts) — para poder retocar la redacción de cualquier pregunta sin tener
// que buscarla entre lógica de generación.
//
// IMPORTANTE: a partir de este archivo, el campo "pregunta" de questionBank.json YA NO se usa
// para mostrar texto (queda ahí solo como referencia/documentación del banco original). Para
// cambiar cómo se formula CUALQUIER pregunta, edita AQUÍ, no el JSON.
//
// Todas las entradas son funciones (incluso las que no llevan variables) para que el patrón de
// uso sea siempre el mismo en generators/*.ts: `enunciadosX['id'](...)`. Las que sí llevan
// variables reciben exactamente los valores ya calculados por el generador (números, nombres de
// nota, etc.), nunca objetos internos — así esta lista se puede leer y editar sin entender el
// resto del motor.

// 1 CONCEPTOS BASICOS, 2 NOTACION, 3 TABLATURAS, 4 ACORDES, 5 LET IT BE, 6 FIGURAS, 7 ARPEGIOS,
// 8 PENTATONICA, 8.1 BLUES, 9 ESCALAS, 9.1 ESCALASOL, 9.3 ACORDES SEPTIMA — preguntas de opciones
// fijas (Grupo A), sin generador propio.
interface EnunciadosEstaticas {
  '1.1': () => string;
  '1.3': () => string;
  '1.4': () => string;
  '1.5': () => string;
  '2.2': () => string;
  '2.2.1': () => string;
  '2.3': () => string;
  '2.4': () => string;
  '2.5': () => string;
  '3.1': () => string;
  '5.1': () => string;
  '6.1': () => string;
  '6.2': () => string;
  '7.1': () => string;
  '7.2': () => string;
  '8.1': () => string;
  '8.1.1': () => string;
  '8.1.2': () => string;
  '8.1.4': () => string;
  '8.1.6': () => string;
  '8.2': () => string;
  '8.3': () => string;
  '8.4': () => string;
  '9.1.1': () => string;
  '9.3.1': () => string;
  '9.3.3': () => string;
  '9.3.4': () => string;
  '9.4': () => string;
  '9.5': () => string;
  '9.6': () => string;
  '9.7': () => string;
  '9.8': () => string;
  '9.9': () => string;
}

export const enunciadosEstaticas: EnunciadosEstaticas = {
  '1.1': () => '¿Donde estan los trastes?',
  '1.3': () => '¿Donde colocamos los dedos de la mano derecha?',
  '1.4': () => '¿Donde colocamos los dedos de la mano izquierda?',
  '1.5': () => '¿Con que parte de la guitarra hacemos sonido?',
  '2.2': () => '¿Cuantas notas naturales hay?',
  '2.2.1': () => '¿Cual es la afinacion estandar?',
  '2.3': () => '¿Cual es el traste cero?',
  '2.4': () => '¿Que trastes tienen las mismas notas?',
  '2.5': () => '¿Que cuerdas tienen las mismas notas?',
  '3.1': () => '¿Que significa el 0 en una tablatura?',
  '5.1': () => '¿Que grupo compuso la cancion Let It Be?',
  '6.1': () => '¿Que notas usa el acorde de Sol Mayor?',
  '6.2': () => '¿Cuantas figuras tiene por lo general un acorde?',
  '7.1': () => '¿Que es un arpegio?',
  '7.2': () => '¿Que acordes puedo arpegiar?',
  '8.1': () => '¿Cuantas notas tiene la pentatonica?',
  '8.1.1': () => '¿Cual es la blue note de Sol mayor?',
  '8.1.2': () => '¿Cual es la blue note de Mi menor?',
  '8.1.4': () => '¿Que diferencia hay entre musica clasica y musica moderna?',
  '8.1.6': () => '¿Que estilos son parte de la musica clasica?',
  '8.2': () => '¿Cuantas notas tiene la pentatonica de blues?',
  '8.3': () => '¿Que otra pentatonica tenemos con las notas de la pentatonica de Sol?',
  '8.4': () => '¿Que combinacion de notas usa la pentatonica de Sol mayor y Mi menor?',
  '9.1.1': () => 'Sol Mayor es...',
  '9.3.1': () => '¿Que nota es F# en Sol Mayor?',
  '9.3.3': () => '¿Cuantos acordes tiene la escala de Sol Mayor?',
  '9.3.4': () => '¿Que diferencia hay entre triada y cuatriada?',
  '9.4': () => '¿Que patron de semitonos tiene la escala mayor?',
  '9.5': () => '¿Que patron de semitonos tiene la escala menor?',
  '9.6': () => '¿Como se llama a la escala menor que tiene las mismas notas que una escala mayor?',
  '9.7': () => '(Dificil) ¿# es...?',
  '9.8': () => '(Dificil) ¿Bemol es...?',
  '9.9': () => '¿Que nota es la octava?',
};

// Coincide con app/lib/quiz/generators/arithmetic.ts (1.2, 9.1, 9.2, 9.3).
interface EnunciadosArithmetic {
  '1.2': (fretX: number, fretY: number) => string;
  '9.1': () => string;
  '9.2': (tonos: number) => string;
  '9.3': (semitonos: number) => string;
}

export const enunciadosArithmetic: EnunciadosArithmetic = {
  '1.2': (fretX, fretY) => `¿Qué distancia hay entre los trastes ${fretX} y ${fretY}? (en semitonos)`,
  '9.1': () => '¿Qué distancia hay entre estas dos notas?',
  '9.2': (tonos) => `¿Cuantos semitonos tiene ${tonos} tono${tonos === 1 ? '' : 's'}?`,
  '9.3': (semitonos) => `¿Cuantos tonos son ${semitonos} semitonos?`,
};

// Coincide con app/lib/quiz/generators/notation.ts (2.1, 9.11, 9.11.1).
interface EnunciadosNotation {
  '2.1': (notaMostrada: string, sistemaMostrado: string, sistemaObjetivo: string) => string;
  '9.11': (nota: string) => string;
  '9.11.1': (nota: string) => string;
}

export const enunciadosNotation: EnunciadosNotation = {
  '2.1': (notaMostrada, sistemaMostrado, sistemaObjetivo) => `La nota "${notaMostrada}" (en ${sistemaMostrado}), ¿cómo se llama en ${sistemaObjetivo}?`,
  '9.11': (nota) => `${nota}# va antes de...`,
  '9.11.1': (nota) => `${nota}b va despues de...`,
};

// Coincide con app/lib/quiz/generators/theory.ts (2.2.2, 3.2, 6.3, 8.1.3, 8.1.5, 9.10, 9.1.2).
interface EnunciadosTheory {
  '2.2.2': () => string;
  '3.2': () => string;
  '6.3': () => string;
  '8.1.3': (tonica: string, modo: string) => string;
  '8.1.5': (generoLabel: string) => string;
  '9.1.2': () => string;
  '9.10': () => string;
}

export const enunciadosTheory: EnunciadosTheory = {
  '2.2.2': () => '(Dificil) ¿Que afinacion NO es estandar?',
  '3.2': () => '¿Esta cuerda en una tablatura es aguda, media o grave?',
  '6.3': () => '¿cual es esta nota?',
  '8.1.3': (tonica, modo) => `¿Cual es la blue note de la pentatonica de ${tonica} ${modo}?`,
  '8.1.5': (generoLabel) => `¿En que siglo comienza ${generoLabel} segun la web?`,
  '9.1.2': () => '¿Que representa este dibujo?',
  '9.10': () => '¿Que nota NO esta en las cuerdas al aire en Mi estandar?',
};

// Coincide con app/lib/quiz/generators/chordBankQuestions.ts (4.1, 6.4, 9.2.1).
interface EnunciadosChordBank {
  '4.1': () => string;
  '6.4': () => string;
  '9.2.1': () => string;
}

export const enunciadosChordBank: EnunciadosChordBank = {
  '4.1': () => 'Identificar el acorde del dibujo',
  '6.4': () => '¿Que tablatura corresponde a este acorde?',
  '9.2.1': () => '¿Cómo se llama este acorde?',
};

// Coincide con app/lib/quiz/generators/degreeQuestions.ts (9.3.2, 9.3.5, 9.3.6, 9.3.7).
interface EnunciadosDegree {
  '9.3.2': (escalaLabel: string) => string;
  '9.3.5': (grado: string, escalaLabel: string) => string;
  '9.3.6': (escalaLabel: string) => string;
  '9.3.7': (nombreSeptima: string) => string;
}

export const enunciadosDegree: EnunciadosDegree = {
  '9.3.2': (escalaLabel) => `¿Que nota es esta, dentro de la escala de ${escalaLabel}?`,
  // OJO: a propósito SIN el nombre corto del acorde (ej. "Bm7") entre paréntesis -- esa pista
  // regalaba la respuesta (si sabes qué notas tiene un Bm7 no hace falta saber nada de "grado iii
  // de Sol Mayor"). Era el error real que el usuario señaló, no el alcance de las 4 escalas.
  '9.3.5': (grado, escalaLabel) => `¿Que notas tiene el acorde con septima del grado ${grado} de ${escalaLabel}?`,
  '9.3.6': (escalaLabel) => `Este acorde pertenece a la escala de ${escalaLabel}. ¿Que numero tiene?`,
  // 9.3.7 — complementaria de 9.3.5: aquí se da el acorde por su NOMBRE (símbolo estándar, ej.
  // "GMaj7"), sin decir de qué grado/escala sale -- se prueba el conocimiento de la fórmula del
  // acorde en sí (1-3-5-7), no la derivación desde la escala.
  '9.3.7': (nombreSeptima) => `¿Que notas tiene el acorde con septima ${nombreSeptima}?`,
};

/** Usado por engine.ts para las preguntas de Grupo A (opciones fijas, sin generador propio) —
 * busca por id en enunciadosEstaticas sin que cada punto de uso tenga que castear el tipo. */
export function staticEnunciado(id: string): string {
  const fn = (enunciadosEstaticas as unknown as Record<string, () => string>)[id];
  if (!fn) throw new Error(`No hay enunciado estatico registrado en enunciados.ts para "${id}"`);
  return fn();
}
