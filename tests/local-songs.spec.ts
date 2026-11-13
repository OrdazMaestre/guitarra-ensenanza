import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  addLocalFiles,
  createLocalOpener,
  getLocalSongs,
  isPlayableName,
  looksLikeScoreXml,
  resetLocalSongsForTests,
  scanLocalDirectory,
  type DirectoryHandleLike,
  type FileHandleLike,
} from '../app/lib/localSongs';

// Canciones del propio dispositivo (app/lib/localSongs.ts): qué archivos valen, búsqueda en una
// carpeta (con sus subcarpetas) y que al abrir otra canción la anterior se BORRA de la memoria.

const gp = () => new File([fs.readFileSync('public/tabs/black-gilmur.gp')], 'black-gilmur.gp', { lastModified: 1 });

test.beforeEach(() => resetLocalSongsForTests());

test('qué archivos se pueden tocar', () => {
  for (const name of ['a.gp', 'b.GP5', 'c.gp3', 'd.gp4', 'e.gpx', 'f.musicxml', 'g.mxl', 'h.xml', 'i.capx']) expect(isPlayableName(name), name).toBe(true);
  for (const name of ['a.mid', 'b.midi', 'c.txt', 'd.pdf', 'gp', 'e.gp.bak']) expect(isPlayableName(name), name).toBe(false);
  expect(looksLikeScoreXml('<?xml version="1.0"?><!DOCTYPE score-partwise><score-partwise version="4.0">')).toBe(true);
  expect(looksLikeScoreXml('<?xml version="1.0"?><configuration><appSettings/>')).toBe(false);
});

test('añadir archivos: solo los válidos, sin repetidos, ordenados', async () => {
  const xmlScore = new File(['<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>'], 'zeta.xml');
  const xmlOther = new File(['<?xml version="1.0"?><configuration/>'], 'config.xml');
  const text = new File(['hola'], 'notas.txt');
  const added = await addLocalFiles([gp(), xmlScore, xmlOther, text].map((file) => ({ file, path: file.name })));
  expect(added).toBe(2);
  // El mismo archivo otra vez (mismo nombre, tamaño y fecha) no se repite.
  expect(await addLocalFiles([{ file: gp(), path: 'otra/black-gilmur.gp' }])).toBe(0);
  expect(getLocalSongs().songs.map((song) => song.title)).toEqual(['black-gilmur', 'zeta']);
});

test('nombres cortos: sin "(ver N by …)", y el tipo entre paréntesis si dos se llaman igual', async () => {
  const files = ['Death - Misanthrope (ver 2 by idark).gp', 'Dismember - Override.gp', 'Dismember - Override.gp5'].map((name, k) => new File(['x'.repeat(k + 1)], name));
  await addLocalFiles(files.map((file) => ({ file, path: file.name })));
  expect(getLocalSongs().songs.map((song) => song.title)).toEqual(['Death - Misanthrope', 'Dismember - Override (gp)', 'Dismember - Override (gp5)']);
});

test('buscar en una carpeta: entra en las subcarpetas y se queda con lo que se puede tocar', async () => {
  const file = (name: string, content = 'x'): FileHandleLike => ({ kind: 'file', name, getFile: async () => new File([content], name, { lastModified: 2 }) });
  const dir = (name: string, entries: Array<DirectoryHandleLike | FileHandleLike>): DirectoryHandleLike => ({
    kind: 'directory',
    name,
    async *values() {
      yield* entries;
    },
  });
  const root = dir('Canciones', [
    file('uno.gp'),
    file('foto.jpg'),
    dir('rock', [file('dos.gp5', 'yy'), file('letra.txt'), dir('viejas', [file('tres.mxl', 'zzz')])]),
  ]);
  expect(await scanLocalDirectory(root)).toBe(3);
  const { songs, lastFound, scanning } = getLocalSongs();
  expect(songs.map((song) => song.path)).toEqual(['Canciones/rock/dos.gp5', 'Canciones/rock/viejas/tres.mxl', 'Canciones/uno.gp']);
  expect(lastFound).toBe(3);
  expect(scanning).toBe(false);
});

test('abrir otra canción BORRA la anterior de la memoria; una que no vale no toca la actual', async () => {
  await addLocalFiles([gp(), new File(['roto'], 'roto.gp')].map((file) => ({ file, path: file.name })));
  const [good, broken] = getLocalSongs().songs;
  const revoked: string[] = [];
  const forgotten: string[] = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
    original(url);
  };
  try {
    const opener = createLocalOpener((url) => forgotten.push(url));
    const first = await opener.open(good, async () => true);
    expect(first).toMatch(/^blob:/);
    // Una que no se puede tocar: se descarta ella, la actual sigue.
    expect(await opener.open(broken, async () => false)).toBeNull();
    expect(revoked).not.toContain(first);
    // Otra que sí: la anterior se borra (memoria y caché de loadScore).
    const second = await opener.open(good, async () => true);
    expect(revoked).toContain(first);
    expect(forgotten).toContain(first);
    opener.release();
    expect(revoked).toContain(second);
  } finally {
    URL.revokeObjectURL = original;
  }
});

// Borrar canciones del dispositivo (usuario, 2026-11-13): sale de la lista, se recuerda por nombre y, si una
// búsqueda la vuelve a encontrar, no entra sin preguntar: UNA pregunta por búsqueda.
test('borrar una canción: sale de la lista y, si se vuelve a encontrar, se pregunta', async () => {
  const { removeLocalSong, answerDeletedFound } = await import('../app/lib/localSongs');
  await addLocalFiles([{ file: gp(), path: 'black-gilmur.gp' }]);
  const id = getLocalSongs().songs[0].id;
  await removeLocalSong(id);
  expect(getLocalSongs().songs).toHaveLength(0);
  // Otra copia del mismo archivo (otra fecha, como al volver a descargarlo): no entra, se pregunta.
  const again = () => new File([fs.readFileSync('public/tabs/black-gilmur.gp')], 'black-gilmur.gp', { lastModified: 2 });
  expect(await addLocalFiles([{ file: again(), path: 'black-gilmur.gp' }])).toBe(0);
  expect(getLocalSongs().deletedFound).toEqual(['black-gilmur']);
  // "No": sigue fuera, también en la próxima búsqueda.
  await answerDeletedFound(false);
  expect(getLocalSongs().deletedFound).toBeNull();
  expect(getLocalSongs().songs).toHaveLength(0);
  expect(await addLocalFiles([{ file: again(), path: 'black-gilmur.gp' }])).toBe(0);
  expect(getLocalSongs().deletedFound).toEqual(['black-gilmur']);
  // "Sí": entra y deja de contar como borrada.
  await answerDeletedFound(true);
  expect(getLocalSongs().songs.map((song) => song.title)).toEqual(['black-gilmur']);
  expect(getLocalSongs().deletedFound).toBeNull();
});
