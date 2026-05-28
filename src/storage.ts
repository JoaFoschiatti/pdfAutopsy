import type { MarkdownDocumentRecord, ReadingProgress, StoredDocument, StudyAnnotation, TermNote } from "./types";

const DB_NAME = "md-autopsy-db";
const DB_VERSION = 1;
const DOCUMENT_STORE = "documents";

const ANNOTATIONS_KEY = "md-autopsy-annotations-v1";
const TERMS_KEY = "md-autopsy-terms-v1";
const READING_PROGRESS_KEY = "md-autopsy-reading-progress-v1";

type ListDocumentsOptions = {
  includeDeleted?: boolean;
  deletedOnly?: boolean;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function putDocumentRecord(record: MarkdownDocumentRecord) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_STORE, "readwrite");
    const store = transaction.objectStore(DOCUMENT_STORE);
    const request = store.put(record);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function deleteLocalStorageEntry<T>(key: string, documentId: string) {
  const all = readLocalStorage<Record<string, T>>(key, {});
  delete all[documentId];
  writeLocalStorage(key, all);
}

export async function listDocuments(options: ListDocumentsOptions = {}): Promise<StoredDocument[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_STORE, "readonly");
    const store = transaction.objectStore(DOCUMENT_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const docs = (request.result as MarkdownDocumentRecord[])
        .map(({ content: _content, ...metadata }) => metadata)
        .filter((doc) => {
          if (options.deletedOnly) return Boolean(doc.deletedAt);
          if (options.includeDeleted) return true;
          return !doc.deletedAt;
        })
        .sort((a, b) => {
          if (options.deletedOnly) {
            return Date.parse(b.deletedAt ?? "") - Date.parse(a.deletedAt ?? "");
          }
          return Date.parse(b.lastOpenedAt ?? b.addedAt) - Date.parse(a.lastOpenedAt ?? a.addedAt);
        });
      resolve(docs);
    };
  });
}

export async function getDocument(id: string): Promise<MarkdownDocumentRecord | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_STORE, "readonly");
    const store = transaction.objectStore(DOCUMENT_STORE);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as MarkdownDocumentRecord | undefined);
  });
}

export async function saveDocument(file: File): Promise<MarkdownDocumentRecord> {
  const id = `${file.name}-${file.size}-${file.lastModified}`;
  const content = await file.text();
  const record: MarkdownDocumentRecord = {
    id,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    addedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    content,
  };

  await putDocumentRecord(record);

  return record;
}

export async function upsertDemoMarkdown(): Promise<MarkdownDocumentRecord> {
  const existing = await getDocument("demo-md-autopsy");
  if (existing) return existing;

  const response = await fetch(`${import.meta.env.BASE_URL}demo-estudio.md`);
  const content = await response.text();
  const record: MarkdownDocumentRecord = {
    id: "demo-md-autopsy",
    name: "Guia de estudio forense.md",
    size: new Blob([content]).size,
    lastModified: Date.now(),
    addedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    content,
  };

  await putDocumentRecord(record);

  return record;
}

export function loadAnnotations(documentId: string): StudyAnnotation[] {
  const all = readLocalStorage<Record<string, StudyAnnotation[]>>(ANNOTATIONS_KEY, {});
  return all[documentId] ?? [];
}

export function saveAnnotations(documentId: string, annotations: StudyAnnotation[]) {
  const all = readLocalStorage<Record<string, StudyAnnotation[]>>(ANNOTATIONS_KEY, {});
  all[documentId] = annotations;
  writeLocalStorage(ANNOTATIONS_KEY, all);
}

export function loadTerms(documentId: string): TermNote[] {
  const all = readLocalStorage<Record<string, TermNote[]>>(TERMS_KEY, {});
  return all[documentId] ?? [];
}

export function saveTerms(documentId: string, terms: TermNote[]) {
  const all = readLocalStorage<Record<string, TermNote[]>>(TERMS_KEY, {});
  all[documentId] = terms;
  writeLocalStorage(TERMS_KEY, all);
}

export function loadReadingProgress(documentId: string): ReadingProgress | null {
  const all = readLocalStorage<Record<string, ReadingProgress>>(READING_PROGRESS_KEY, {});
  return all[documentId] ?? null;
}

export function saveReadingProgress(documentId: string, progress: Omit<ReadingProgress, "documentId" | "updatedAt">) {
  const all = readLocalStorage<Record<string, ReadingProgress>>(READING_PROGRESS_KEY, {});
  all[documentId] = {
    ...progress,
    documentId,
    updatedAt: new Date().toISOString(),
  };
  writeLocalStorage(READING_PROGRESS_KEY, all);
  return all[documentId];
}

export async function markDocumentOpened(id: string) {
  const record = await getDocument(id);
  if (!record) return null;
  const nextRecord = { ...record, lastOpenedAt: new Date().toISOString() };
  delete nextRecord.deletedAt;
  await putDocumentRecord(nextRecord);
  return nextRecord;
}

export async function setDocumentFavorite(id: string, favorite: boolean) {
  const record = await getDocument(id);
  if (!record) return null;
  const nextRecord = { ...record, favorite };
  await putDocumentRecord(nextRecord);
  return nextRecord;
}

export async function moveDocumentToTrash(id: string) {
  const record = await getDocument(id);
  if (!record) return null;
  const nextRecord = { ...record, deletedAt: new Date().toISOString() };
  await putDocumentRecord(nextRecord);
  return nextRecord;
}

export async function restoreDocument(id: string) {
  const record = await getDocument(id);
  if (!record) return null;
  const nextRecord = { ...record };
  delete nextRecord.deletedAt;
  await putDocumentRecord(nextRecord);
  return nextRecord;
}

export async function deleteDocumentForever(id: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_STORE, "readwrite");
    const store = transaction.objectStore(DOCUMENT_STORE);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  deleteLocalStorageEntry<StudyAnnotation[]>(ANNOTATIONS_KEY, id);
  deleteLocalStorageEntry<TermNote[]>(TERMS_KEY, id);
  deleteLocalStorageEntry<ReadingProgress>(READING_PROGRESS_KEY, id);
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export async function saveDocumentData(input: {
  id?: string;
  name: string;
  size: number;
  lastModified: number;
  content: string;
}): Promise<MarkdownDocumentRecord> {
  const id = input.id ?? `${input.name}-${input.size}-${input.lastModified}`;
  const record: MarkdownDocumentRecord = {
    id,
    name: input.name,
    size: input.size,
    lastModified: input.lastModified,
    addedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    content: input.content,
  };

  await putDocumentRecord(record);

  return record;
}

export function normalizeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

const COMMON_STUDY_STOPWORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "es",
  "la",
  "las",
  "lo",
  "los",
  "o",
  "para",
  "por",
  "que",
  "se",
  "un",
  "una",
  "y",
]);

export function isTrackableNormalizedTerm(normalized: string) {
  return normalized.length >= 3 && !COMMON_STUDY_STOPWORDS.has(normalized);
}

export function isTrackableTerm(value: string) {
  return isTrackableNormalizedTerm(normalizeTerm(value));
}
