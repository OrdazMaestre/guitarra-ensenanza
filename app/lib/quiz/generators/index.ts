import { generateFretDistance, generateFretDistanceTones, generateNeckNoteDistance, generateTonesToSemitones, generateSemitonesToTones } from './arithmetic';
import { generateIdentifyChord, generateChordTablatureMatch, generateNameFourChords } from './chordBankQuestions';
import { generateNoteDegree, generateSeventhChordNotes, generateSeventhChordByName, generateChordDegreeNumber } from './degreeQuestions';
import { generateNoteNotationSwap, generateSharpPrecedes, generateFlatFollows } from './notation';
import {
  generateStringRegister,
  generateFretNote,
  generateBlueNoteFormula,
  generateGenreCentury,
  generateNoteNotOpenString,
  generateDiagramKind,
} from './theory';
import type { QuestionGenerator } from '../types';

// Grupo C del plan (app/lib/quiz/questionBank.json): preguntas con `correcta: null` que solo
// necesitan aritmética/mapeos ligeros (musicNotes.ts + tablas pequeñas). Grupo B (chordBankQuestions.ts,
// degreeQuestions.ts): necesitan el banco de acordes y/o las tablas de grados de escalas (Fase 0).
export const GENERATORS: Record<string, QuestionGenerator> = {
  '1.2': generateFretDistance,
  '1.6': generateFretDistanceTones,
  '2.1': generateNoteNotationSwap,
  '3.2': generateStringRegister,
  '4.1': generateIdentifyChord,
  '6.3': generateFretNote,
  '6.4': generateChordTablatureMatch,
  '8.1.3': generateBlueNoteFormula,
  '8.1.5': generateGenreCentury,
  '9.1': generateNeckNoteDistance,
  '9.1.2': generateDiagramKind,
  '9.2': generateTonesToSemitones,
  '9.2.1': generateNameFourChords,
  '9.3': generateSemitonesToTones,
  '9.3.2': generateNoteDegree,
  '9.3.5': generateSeventhChordNotes,
  '9.3.6': generateChordDegreeNumber,
  '9.3.7': generateSeventhChordByName,
  '9.10': generateNoteNotOpenString,
  '9.11': generateSharpPrecedes,
  '9.11.1': generateFlatFollows,
};
