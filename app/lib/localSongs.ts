// Canciones del PROPIO dispositivo del usuario para el disco del juego y de la tablatura (petición
// del usuario, 2026-10-31). Sin React: un almacén mínimo para useSyncExternalStore, como
// gameInProgress.ts.
//
// Qué se guarda y dónde (nada sale del dispositivo, el servidor no guarda nada):
// - Una COPIA de cada canción encontrada, en IndexedDB del propio navegador (decisión del usuario,
//   2026-11-05: en móvil había que elegirlas en cada visita). Vuelven solas al abrir la web, hasta
//   `MAX_SAVED_BYTES`; "Borrar canciones guardadas" las quita. Los archivos originales no se tocan.
// - La canción que se toca: una URL `blob:` en memoria (`createLocalOpener`), que se BORRA
//   (revokeObjectURL) al cambiar de canción.
// - Solo en Chrome/Edge de ordenador: la "llave" de la carpeta elegida (FileSystemDirectoryHandle,
//   < 1 KB, no es la ruta en texto), para encontrar canciones nuevas en ella.
//
// Ninguna web puede escanear el dispositivo sola: el usuario elige una carpeta (o archivos) y aquí
// se busca dentro lo que el juego sabe leer (los importadores de alphaTab 1.8.2; MIDI no).

export const PLAYABLE_EXTENSIONS = ['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.musicxml', '.mxl', '.xml', '.capx'];
export const LOCAL_SONG_ACCEPT = PLAYABLE_EXTENSIONS.join(',');
export const MAX_LOCAL_SONG_BYTES = 5 * 1024 * 1024;
// Carita y batería o guitarra tachadas ya medidas (songDifficulty.ts).
export const SONG_TRAITS_STORAGE_KEY = 'riff-rasgos-canciones-v1';
// Nombres de archivo de las canciones que el usuario BORRÓ de la lista (usuario, 2026-11-13): si una
// búsqueda las vuelve a encontrar, se pregunta antes de añadirlas otra vez.
export const DELETED_SONGS_STORAGE_KEY = 'riff-canciones-borradas-v1';
// Tope de todas las copias guardadas juntas.
export const MAX_SAVED_BYTES = 200 * 1024 * 1024;
// Límites del recorrido de una carpeta (una carpeta enorme no debe colgar la página).
const MAX_DEPTH = 8;
const MAX_ENTRIES = 20000;

export interface LocalSong {
  id: string;
  title: string;
  // Ruta relativa dentro de lo elegido (para distinguir dos archivos con el mismo nombre).
  path: string;
  file: File;
}

export type LocalSearchMode = 'files' | 'directory-api' | 'directory-input';

export interface LocalSongsState {
  songs: LocalSong[];
  scanning: boolean;
  // Resultado de la última búsqueda (cuántas se añadieron), null si aún no se ha buscado.
  lastFound: number | null;
  // Carpeta recordada (Chrome/Edge): su nombre.
  rememberedFolder: string | null;
  // ¿Ya se ha buscado en una carpeta en ESTA visita? Si no hay canciones guardadas (el navegador
  // pudo borrarlas) hay que ofrecer "Buscar en «carpeta»" bien a la vista.
  folderScanned: boolean;
  // Alguna canción no cupo en lo guardado: sirve en esta visita, pero se olvidará.
  savedFull: boolean;
  // La última búsqueda encontró canciones que el usuario había borrado: sus títulos, a la espera de
  // la pregunta "¿Volver a añadirlas?" (`answerDeletedFound`). null si no hay pregunta.
  deletedFound: string[] | null;
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

export function isPlayableName(name: string): boolean {
  return PLAYABLE_EXTENSIONS.includes(extensionOf(name));
}

// Un .xml solo vale si es una partitura MusicXML (hay muchísimos .xml que no lo son).
export function looksLikeScoreXml(head: string): boolean {
  return /<score-(partwise|timewise)\b/.test(head);
}

// Nombre para la lista: sin extensión y sin las coletillas de versión de las webs de tablaturas
// ("(ver 3 by DeathMetal616)", "(ver 2)"), que solo alargan. El nombre completo va en `title`.
export function songTitle(name: string) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.replace(/\s*\(ver\.?\s*\d+[^)]*\)/gi, '').trim() || base;
}

// Dos archivos con el mismo nombre (p. ej. el .gp y el .gp5 de una canción): se distinguen con su
// tipo entre paréntesis.
function withDistinctTitles(songs: LocalSong[]): LocalSong[] {
  const count = new Map<string, number>();
  for (const song of songs) count.set(songTitle(song.file.name), (count.get(songTitle(song.file.name)) ?? 0) + 1);
  return songs.map((song) => {
    const base = songTitle(song.file.name);
    const title = (count.get(base) ?? 0) > 1 ? `${base} (${extensionOf(song.file.name).slice(1)})` : base;
    return title === song.title ? song : { ...song, title };
  });
}

// Pantalla táctil sin ratón (móvil, tableta): la misma consulta que esconde el botón KEYBOARD.
export function isTouchOnly(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
}

// ¿Cómo buscar en este dispositivo? Por capacidad, nunca por el nombre del dispositivo: pantalla
// táctil sin ratón (la misma consulta que esconde el botón KEYBOARD) -> elegir archivos; si no,
// carpeta, con la API que la recuerda (Chrome/Edge) o con el <input> de carpeta.
export function localSearchMode(): LocalSearchMode {
  if (typeof window === 'undefined' || isTouchOnly()) return 'files';
  if ('showDirectoryPicker' in window) return 'directory-api';
  if ('webkitdirectory' in HTMLInputElement.prototype) return 'directory-input';
  return 'files';
}

const emptyState = (): LocalSongsState => ({ songs: [], scanning: false, lastFound: null, rememberedFolder: null, folderScanned: false, savedFull: false, deletedFound: null });
let state = emptyState();
const listeners = new Set<() => void>();

function setState(patch: Partial<LocalSongsState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeLocalSongs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocalSongs() {
  return state;
}

const SERVER_STATE = emptyState();
export function getServerLocalSongs() {
  return SERVER_STATE;
}

const keyOf = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

function withSongs(added: LocalSong[]) {
  return withDistinctTitles([...state.songs, ...added]).sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
}

// Canciones borradas por el usuario (por nombre de archivo): en el navegador, en `localStorage`; sin
// él (Node, modo privado), solo en memoria.
let deletedNames: Set<string> | null = null;
function deletedSet(): Set<string> {
  if (deletedNames) return deletedNames;
  deletedNames = new Set();
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(DELETED_SONGS_STORAGE_KEY) : null;
    if (stored) deletedNames = new Set(JSON.parse(stored) as string[]);
  } catch {
    // Datos rotos o sin almacenamiento: empieza vacía.
  }
  return deletedNames;
}
function saveDeleted() {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(DELETED_SONGS_STORAGE_KEY, JSON.stringify([...deletedSet()]));
  } catch {
    // Sin sitio: vale para esta visita.
  }
}
// Las borradas que encontró la última búsqueda, a la espera de la respuesta.
let pendingRestore: Array<{ file: File; path: string }> = [];

// Añade a la lista los archivos válidos de `files` (con su ruta relativa). Devuelve cuántos nuevos.
// Las que el usuario había borrado no entran: se guardan para UNA pregunta por búsqueda.
export async function addLocalFiles(files: Array<{ file: File; path: string }>): Promise<number> {
  await restoreSavedSongs();
  const known = new Set(state.songs.map((song) => keyOf(song.file)));
  const added: LocalSong[] = [];
  const deleted = deletedSet();
  const found: Array<{ file: File; path: string }> = [];
  for (const { file, path } of files) {
    if (!isPlayableName(file.name) || file.size > MAX_LOCAL_SONG_BYTES || file.size === 0) continue;
    const key = keyOf(file);
    if (known.has(key)) continue;
    if (extensionOf(file.name) === '.xml' && !looksLikeScoreXml(await file.slice(0, 2048).text())) continue;
    known.add(key);
    if (deleted.has(file.name)) {
      found.push({ file, path });
      continue;
    }
    added.push({ id: `local:${key}`, title: songTitle(file.name), path, file });
  }
  if (found.length > 0) {
    pendingRestore = found;
    setState({ deletedFound: found.map(({ file }) => songTitle(file.name)) });
  }
  if (added.length > 0) {
    setState({ songs: withSongs(added) });
    await saveSongs(added);
  }
  return added.length;
}

// Lo que da un <input type="file"> (con o sin `webkitdirectory`).
export async function addLocalFileList(list: FileList | File[]) {
  setState({ scanning: true });
  try {
    const files = Array.from(list).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
    setState({ lastFound: await addLocalFiles(files) });
  } finally {
    setState({ scanning: false });
  }
}

// Forma mínima de los "handles" de la File System Access API (aún no están todos en lib.dom).
export interface DirectoryHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirectoryHandleLike | FileHandleLike>;
  queryPermission?(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'read' }): Promise<PermissionState>;
}
export interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

// Recorre la carpeta (subcarpetas incluidas) y añade lo que se puede tocar.
export async function scanLocalDirectory(root: DirectoryHandleLike): Promise<number> {
  setState({ scanning: true });
  try {
    const found: Array<{ file: File; path: string }> = [];
    let entries = 0;
    const walk = async (dir: DirectoryHandleLike, prefix: string, depth: number) => {
      for await (const entry of dir.values()) {
        if (++entries > MAX_ENTRIES) return;
        if (entry.kind === 'directory') {
          if (depth < MAX_DEPTH) await walk(entry, `${prefix}${entry.name}/`, depth + 1);
        } else if (isPlayableName(entry.name)) {
          found.push({ file: await entry.getFile(), path: `${prefix}${entry.name}` });
        }
      }
    };
    await walk(root, `${root.name}/`, 0);
    const added = await addLocalFiles(found);
    setState({ lastFound: added, folderScanned: true });
    return added;
  } finally {
    setState({ scanning: false });
  }
}

// --- IndexedDB del propio navegador: la carpeta recordada y las copias de las canciones. ---
const DB_NAME = 'guitarra-canciones-locales';
const STORE = 'carpeta';
const SONGS_STORE = 'canciones';
const KEY = 'ultima';

interface SavedSong {
  key: string;
  path: string;
  file: File;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(SONGS_STORE)) db.createObjectStore(SONGS_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFolder(handle: DirectoryHandleLike) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadFolder(): Promise<DirectoryHandleLike | null> {
  const db = await openDb();
  const handle = await new Promise<DirectoryHandleLike | null>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as DirectoryHandleLike | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

function writeTo(db: IDBDatabase, stores: string[], write: (tx: IDBTransaction) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    write(tx);
  });
}

let savedBytes = 0;
let restoring: Promise<void> | null = null;

// Guarda una copia real de los bytes: un archivo elegido en el móvil puede dejar de poder leerse
// cuando acaba la visita. Lo que no cabe se queda solo para esta visita.
async function saveSongs(songs: LocalSong[]) {
  if (typeof indexedDB === 'undefined') return;
  // Pide al navegador que no borre estos datos cuando le falte espacio. Puede decir que no.
  void navigator.storage?.persist?.().catch(() => {});
  let full = false;
  try {
    const db = await openDb();
    for (const { file, path } of songs) {
      if (savedBytes + file.size > MAX_SAVED_BYTES) {
        full = true;
        continue;
      }
      try {
        const copy = new File([await file.arrayBuffer()], file.name, { lastModified: file.lastModified, type: file.type });
        const saved: SavedSong = { key: keyOf(file), path, file: copy };
        await writeTo(db, [SONGS_STORE], (tx) => tx.objectStore(SONGS_STORE).put(saved));
        savedBytes += file.size;
      } catch {
        full = true;
      }
    }
    db.close();
  } catch {
    full = true;
  }
  if (full) setState({ savedFull: true });
}

// Devuelve a la lista las canciones guardadas, una vez por visita.
export function restoreSavedSongs(): Promise<void> {
  restoring ??= (async () => {
    if (typeof indexedDB === 'undefined') return;
    try {
      const db = await openDb();
      const saved = await new Promise<SavedSong[]>((resolve, reject) => {
        const request = db.transaction(SONGS_STORE, 'readonly').objectStore(SONGS_STORE).getAll();
        request.onsuccess = () => resolve(request.result as SavedSong[]);
        request.onerror = () => reject(request.error);
      });
      db.close();
      savedBytes = saved.reduce((sum, song) => sum + song.file.size, 0);
      if (saved.length > 0) setState({ songs: withSongs(saved.map(({ key, path, file }) => ({ id: `local:${key}`, title: songTitle(file.name), path, file }))) });
    } catch {
      // Sin IndexedDB (modo privado...): se eligen a mano, como antes.
    }
  })();
  return restoring;
}

// Quita una canción del dispositivo de la lista y su copia guardada, y recuerda que se borró. El
// archivo original del usuario no se toca. (La carita medida la olvida songDifficulty.ts.)
export async function removeLocalSong(id: string) {
  const song = state.songs.find((entry) => entry.id === id);
  if (!song) return;
  setState({ songs: state.songs.filter((entry) => entry.id !== id) });
  deletedSet().add(song.file.name);
  saveDeleted();
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await writeTo(db, [SONGS_STORE], (tx) => tx.objectStore(SONGS_STORE).delete(keyOf(song.file)));
    db.close();
    savedBytes = Math.max(0, savedBytes - song.file.size);
  } catch {
    // Si no se pudo borrar la copia, al menos ya no está en la lista de esta visita.
  }
}

// Respuesta a "Ya borraste: … ¿Volver a añadirlas?". Sí: entran y dejan de contar como borradas.
// No: siguen fuera, también en las próximas búsquedas.
export async function answerDeletedFound(restore: boolean) {
  const files = pendingRestore;
  pendingRestore = [];
  setState({ deletedFound: null });
  if (!restore || files.length === 0) return;
  for (const { file } of files) deletedSet().delete(file.name);
  saveDeleted();
  const added = await addLocalFiles(files);
  setState({ lastFound: (state.lastFound ?? 0) + added });
}

// Olvida las copias y la carpeta. Los archivos originales del usuario no se tocan.
export async function clearSavedSongs() {
  if (typeof indexedDB !== 'undefined') {
    const db = await openDb();
    await writeTo(db, [SONGS_STORE, STORE], (tx) => {
      tx.objectStore(SONGS_STORE).clear();
      tx.objectStore(STORE).clear();
    });
    db.close();
  }
  try {
    window.localStorage.removeItem(SONG_TRAITS_STORAGE_KEY);
    window.localStorage.removeItem(DELETED_SONGS_STORAGE_KEY);
  } catch {
    // Sin almacenamiento: no había nada.
  }
  savedBytes = 0;
  rememberedHandle = null;
  deletedNames = new Set();
  pendingRestore = [];
  setState(emptyState());
}

let rememberedHandle: DirectoryHandleLike | null = null;
let autoScanned = false;

// Al abrir el menú del disco: si hay carpeta recordada y el navegador ya da permiso, busca sola
// (una vez por visita); si pide permiso, solo deja preparado "Buscar otra vez en «carpeta»".
export async function rescanRememberedFolder() {
  if (autoScanned || typeof indexedDB === 'undefined' || localSearchMode() !== 'directory-api') return;
  autoScanned = true;
  try {
    rememberedHandle = await loadFolder();
    if (!rememberedHandle) return;
    setState({ rememberedFolder: rememberedHandle.name });
    if ((await rememberedHandle.queryPermission?.({ mode: 'read' })) === 'granted') await scanLocalDirectory(rememberedHandle);
  } catch {
    // Sin IndexedDB o la carpeta ya no existe: se busca a mano, como siempre.
  }
}

// "Buscar otra vez en «carpeta»" (tiene que ser un clic: el navegador pregunta "¿Permitir?").
export async function searchRememberedFolder() {
  if (!rememberedHandle) return;
  const permission = await rememberedHandle.requestPermission?.({ mode: 'read' });
  if (permission === 'granted') await scanLocalDirectory(rememberedHandle);
}

// Elegir carpeta con la API (Chrome/Edge). Cancelar el diálogo no es un error.
export async function pickLocalFolder() {
  const picker = (window as unknown as { showDirectoryPicker?: (options?: object) => Promise<DirectoryHandleLike> }).showDirectoryPicker;
  if (!picker) return;
  let handle: DirectoryHandleLike;
  try {
    handle = await picker({ id: 'canciones', mode: 'read' });
  } catch {
    return;
  }
  rememberedHandle = handle;
  setState({ rememberedFolder: handle.name });
  void saveFolder(handle).catch(() => {});
  await scanLocalDirectory(handle);
}

// Abre canciones locales de una en una: cada consumidor (juego, tablatura) tiene el suyo. Primero
// comprueba la nueva con una URL temporal (`check`); si vale, BORRA la anterior de la memoria
// (revokeObjectURL + `onRelease`, que quita la caché de loadScore) y se queda con la nueva. Si no
// vale, la descarta y la que sonaba sigue intacta.
export function createLocalOpener(onRelease?: (url: string) => void) {
  let current: string | null = null;
  const drop = (url: string) => {
    URL.revokeObjectURL(url);
    onRelease?.(url);
  };
  return {
    async open(song: LocalSong, check: (url: string) => Promise<boolean>): Promise<string | null> {
      const candidate = URL.createObjectURL(song.file);
      if (!(await check(candidate))) {
        drop(candidate);
        return null;
      }
      if (current) drop(current);
      current = candidate;
      return candidate;
    },
    // Al volver a una canción de la web (o al desmontar): borra la local que hubiera.
    release() {
      if (current) drop(current);
      current = null;
    },
  };
}

// Solo para tests: vuelve al estado inicial.
export function resetLocalSongsForTests() {
  state = emptyState();
  deletedNames = null;
  pendingRestore = [];
  rememberedHandle = null;
  autoScanned = false;
  savedBytes = 0;
  restoring = null;
}
