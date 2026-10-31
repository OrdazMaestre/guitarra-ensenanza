// Canciones del PROPIO dispositivo del usuario para el disco del juego y de la tablatura (petición
// del usuario, 2026-10-31). Sin React: un almacén mínimo para useSyncExternalStore, como
// gameInProgress.ts.
//
// Qué se guarda y dónde (decisión del usuario: lo mínimo, y nada en nuestra web):
// - La lista de canciones encontradas: solo en la memoria de la pestaña (nombre + referencia al
//   archivo, nunca su contenido). Se pierde al recargar.
// - El contenido de la canción que se toca: una URL `blob:` en memoria (`createLocalOpener`), que se
//   BORRA (revokeObjectURL) al cambiar de canción. Nada se sube, se descarga ni se copia.
// - Solo en Chrome/Edge de ordenador: la "llave" de la carpeta elegida (FileSystemDirectoryHandle,
//   < 1 KB, no es la ruta en texto) en IndexedDB del propio navegador, para volver a buscar en ella
//   en la siguiente visita. El servidor no guarda nada.
//
// Ninguna web puede escanear el dispositivo sola: el usuario elige una carpeta (o archivos) y aquí
// se busca dentro lo que el juego sabe leer (los importadores de alphaTab 1.8.2; MIDI no).

export const PLAYABLE_EXTENSIONS = ['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.musicxml', '.mxl', '.xml', '.capx'];
export const LOCAL_SONG_ACCEPT = PLAYABLE_EXTENSIONS.join(',');
export const MAX_LOCAL_SONG_BYTES = 5 * 1024 * 1024;
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
  // ¿Ya se ha buscado en una carpeta en ESTA visita? La lista vive solo en memoria: al recargar se
  // pierde aunque la carpeta se recuerde, y entonces hay que ofrecer "Buscar en «carpeta»" bien a
  // la vista (bug real: el usuario veía "Ya me acuerdo de tu carpeta" pero ninguna canción).
  folderScanned: boolean;
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

// ¿Cómo buscar en este dispositivo? Por capacidad, nunca por el nombre del dispositivo: pantalla
// táctil sin ratón (la misma consulta que esconde el botón KEYBOARD) -> elegir archivos; si no,
// carpeta, con la API que la recuerda (Chrome/Edge) o con el <input> de carpeta.
export function localSearchMode(): LocalSearchMode {
  if (typeof window === 'undefined') return 'files';
  if (window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) return 'files';
  if ('showDirectoryPicker' in window) return 'directory-api';
  if ('webkitdirectory' in HTMLInputElement.prototype) return 'directory-input';
  return 'files';
}

let state: LocalSongsState = { songs: [], scanning: false, lastFound: null, rememberedFolder: null, folderScanned: false };
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

const SERVER_STATE: LocalSongsState = { songs: [], scanning: false, lastFound: null, rememberedFolder: null, folderScanned: false };
export function getServerLocalSongs() {
  return SERVER_STATE;
}

const keyOf = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

// Añade a la lista los archivos válidos de `files` (con su ruta relativa). Devuelve cuántos nuevos.
export async function addLocalFiles(files: Array<{ file: File; path: string }>): Promise<number> {
  const known = new Set(state.songs.map((song) => keyOf(song.file)));
  const added: LocalSong[] = [];
  for (const { file, path } of files) {
    if (!isPlayableName(file.name) || file.size > MAX_LOCAL_SONG_BYTES || file.size === 0) continue;
    const key = keyOf(file);
    if (known.has(key)) continue;
    if (extensionOf(file.name) === '.xml' && !looksLikeScoreXml(await file.slice(0, 2048).text())) continue;
    known.add(key);
    added.push({ id: `local:${key}`, title: songTitle(file.name), path, file });
  }
  if (added.length > 0) {
    const songs = withDistinctTitles([...state.songs, ...added]).sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
    setState({ songs });
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

// --- Carpeta recordada (solo Chrome/Edge: la API de carpetas). IndexedDB del propio navegador. ---
const DB_NAME = 'guitarra-canciones-locales';
const STORE = 'carpeta';
const KEY = 'ultima';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
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
  state = { songs: [], scanning: false, lastFound: null, rememberedFolder: null, folderScanned: false };
  rememberedHandle = null;
  autoScanned = false;
}
