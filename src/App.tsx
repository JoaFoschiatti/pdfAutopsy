import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownWorkspace, defaultColor, type ToolMode } from "./components/MarkdownWorkspace";
import { SelectionPopover } from "./components/SelectionPopover";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { StudyPanel } from "./components/StudyPanel";
import { Toolbar } from "./components/Toolbar";
import { ToolOptionsPopover } from "./components/ToolOptionsPopover";
import {
  deleteDocumentForever,
  getDocument,
  isTrackableNormalizedTerm,
  listDocuments,
  loadAnnotations,
  loadReadingProgress,
  loadTerms,
  markDocumentOpened,
  moveDocumentToTrash,
  normalizeTerm,
  restoreDocument,
  saveAnnotations,
  saveDocument,
  saveDocumentData,
  saveReadingProgress,
  saveTerms,
  setDocumentFavorite,
  upsertDemoMarkdown,
} from "./storage";
import type {
  HighlightColor,
  LibraryView,
  MarkdownDocumentRecord,
  ReadingProgress,
  SelectionDraft,
  StoredDocument,
  StudyAnnotation,
  StudyTab,
  TermNote,
} from "./types";

const CUSTOM_COLORS_KEY = "md-autopsy-custom-colors-v1";
const ACTIVE_COLOR_KEY = "md-autopsy-active-color-v1";
const SIDEBAR_COLLAPSED_KEY = "md-autopsy-sidebar-collapsed-v1";
const STUDY_PANEL_COLLAPSED_KEY = "md-autopsy-study-panel-collapsed-v1";
const THEME_KEY = "md-autopsy-theme-v1";
const DEFAULT_SCALE = 1;
type ThemeMode = "light" | "dark";
type UndoSnapshot = {
  label: string;
  annotations: StudyAnnotation[];
  terms: TermNote[];
};

const MAX_UNDO_STACK = 40;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getResponsiveScale() {
  if (typeof window === "undefined") return DEFAULT_SCALE;

  const width = window.innerWidth;
  if (width < 520) return 0.88;
  if (width < 900) return 0.94;
  if (width > 1700) return 1.06;
  return DEFAULT_SCALE;
}

function readStoredBoolean(key: string, fallback = false) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored === "true";
  } catch {
    return fallback;
  }
}

function readStoredTheme(): ThemeMode {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function getCleanSelectionText() {
  return window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function cloneAnnotations(annotations: StudyAnnotation[]) {
  return annotations.map((annotation) => ({
    ...annotation,
    anchor: { ...annotation.anchor },
  }));
}

function cloneTerms(terms: TermNote[]) {
  return terms.map((term) => ({
    ...term,
    review: term.review ? { ...term.review } : undefined,
  }));
}

async function writeTextToClipboard(text: string) {
  if (!text) return;

  try {
    if (window.mdAutopsy?.writeClipboardText) {
      await window.mdAutopsy.writeClipboardText(text);
      return;
    }
  } catch {
    // Fall through to browser clipboard APIs when the native bridge is unavailable.
  }

  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export default function App() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<MarkdownDocumentRecord | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<StudyAnnotation[]>([]);
  const [terms, setTerms] = useState<TermNote[]>([]);
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sectionCount, setSectionCount] = useState(1);
  const [scale, setScale] = useState(() => getResponsiveScale());
  const [manualScale, setManualScale] = useState(false);
  const [tool, setTool] = useState<ToolMode>("select");
  const [activeColor, setActiveColor] = useState<HighlightColor>(() => {
    try {
      return localStorage.getItem(ACTIVE_COLOR_KEY) || defaultColor;
    } catch {
      return defaultColor;
    }
  });
  const [customColors, setCustomColors] = useState<HighlightColor[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_COLORS_KEY) ?? "[]") as HighlightColor[];
    } catch {
      return [];
    }
  });
  const [toolOptions, setToolOptions] = useState<{
    tool: ToolMode;
    anchor: { x: number; y: number };
  } | null>(null);
  const [selection, setSelection] = useState<SelectionDraft | null>(null);
  const selectionRef = useRef<SelectionDraft | null>(null);
  const lastProgressStateUpdateRef = useRef({ page: 0, timestamp: 0 });
  const annotationsRef = useRef<StudyAnnotation[]>([]);
  const termsRef = useRef<TermNote[]>([]);
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [activeTab, setActiveTab] = useState<StudyTab>("annotations");
  const [query, setQuery] = useState("");
  const [libraryView, setLibraryView] = useState<LibraryView>("all");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => readStoredBoolean(SIDEBAR_COLLAPSED_KEY));
  const [isStudyPanelCollapsed, setIsStudyPanelCollapsed] = useState(() =>
    readStoredBoolean(STUDY_PANEL_COLLAPSED_KEY),
  );
  const [isViewerFullscreen, setIsViewerFullscreen] = useState(false);
  const [isFullscreenStudyVisible, setIsFullscreenStudyVisible] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const applyViewerFullscreenState = useCallback((nextFullscreen: boolean) => {
    setIsViewerFullscreen(nextFullscreen);
    if (!nextFullscreen) setIsFullscreenStudyVisible(false);
  }, []);

  function replaceUndoStack(nextStack: UndoSnapshot[]) {
    undoStackRef.current = nextStack;
    setUndoStack(nextStack);
  }

  function pushUndo(label: string) {
    const snapshot: UndoSnapshot = {
      label,
      annotations: cloneAnnotations(annotationsRef.current),
      terms: cloneTerms(termsRef.current),
    };
    replaceUndoStack([...undoStackRef.current, snapshot].slice(-MAX_UNDO_STACK));
  }

  function clearUndoStack() {
    replaceUndoStack([]);
  }

  function undoLastAction() {
    const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (!snapshot) return;

    const nextStack = undoStackRef.current.slice(0, -1);
    const nextAnnotations = cloneAnnotations(snapshot.annotations);
    const nextTerms = cloneTerms(snapshot.terms);

    annotationsRef.current = nextAnnotations;
    termsRef.current = nextTerms;
    setAnnotations(nextAnnotations);
    setTerms(nextTerms);
    replaceUndoStack(nextStack);
    clearSelection();
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      await upsertDemoMarkdown();
      const stored = await listDocuments({ includeDeleted: true });
      if (!mounted) return;
      setDocuments(stored);
      const firstAvailable = stored.find((document) => !document.deletedAt);
      if (firstAvailable) {
        const record = await getDocument(firstAvailable.id);
        if (record && !record.deletedAt && mounted) openRecord(record);
        return;
      }
      clearActiveDocument();
    }

    bootstrap().catch((error) => console.error(error));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return window.mdAutopsy?.onOpenMarkdownFromMenu(() => {
      void handleNativeOpenMarkdown();
    });
  }, []);

  useEffect(() => {
    const nativeWindow = window.mdAutopsy;
    if (!nativeWindow?.onNativeFullscreenChange) return;

    let disposed = false;

    const currentFullscreen = nativeWindow.getNativeFullscreen?.();
    currentFullscreen
      ?.then((fullscreen) => {
        if (!disposed) applyViewerFullscreenState(fullscreen);
      })
      .catch((error) => console.error("No se pudo leer el estado de pantalla completa", error));

    const unsubscribe = nativeWindow.onNativeFullscreenChange((fullscreen) => {
      applyViewerFullscreenState(fullscreen);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [applyViewerFullscreenState]);

  useEffect(() => {
    if (activeDocument) saveAnnotations(activeDocument.id, annotations);
    annotationsRef.current = annotations;
  }, [activeDocument, annotations]);

  useEffect(() => {
    if (activeDocument) saveTerms(activeDocument.id, terms);
    termsRef.current = terms;
  }, [activeDocument, terms]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(STUDY_PANEL_COLLAPSED_KEY, String(isStudyPanelCollapsed));
  }, [isStudyPanelCollapsed]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(customColors));
  }, [customColors]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_COLOR_KEY, activeColor);
  }, [activeColor]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearSelection();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "c") {
        const text = getCleanSelectionText();
        if (text) {
          event.preventDefault();
          void writeTextToClipboard(text);
        }
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLocaleLowerCase() === "z") {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        undoLastAction();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>(".search-group input");
        input?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function handleResize() {
      if (!manualScale) setScale(getResponsiveScale());
    }

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [manualScale]);

  function openRecord(record: MarkdownDocumentRecord) {
    const progress = loadReadingProgress(record.id);
    setActiveDocument(record);
    setMarkdownContent(record.content);
    const nextAnnotations = loadAnnotations(record.id);
    const nextTerms = loadTerms(record.id);
    annotationsRef.current = nextAnnotations;
    termsRef.current = nextTerms;
    setAnnotations(nextAnnotations);
    setTerms(nextTerms);
    setReadingProgress(progress);
    setCurrentPage(progress?.page ?? 1);
    lastProgressStateUpdateRef.current = { page: progress?.page ?? 1, timestamp: performance.now() };
    setManualScale(false);
    setScale(getResponsiveScale());
    clearSelection();
    setQuery("");
    clearUndoStack();
  }

  function clearActiveDocument() {
    setActiveDocument(null);
    setMarkdownContent(null);
    annotationsRef.current = [];
    termsRef.current = [];
    setAnnotations([]);
    setTerms([]);
    setReadingProgress(null);
    setCurrentPage(1);
    setSectionCount(1);
    clearSelection();
    setQuery("");
    clearUndoStack();
  }

  async function refreshDocuments() {
    const nextDocuments = await listDocuments({ includeDeleted: true });
    setDocuments(nextDocuments);
    return nextDocuments;
  }

  async function handleOpenDocument(id: string) {
    const record = await markDocumentOpened(id);
    if (record && !record.deletedAt) {
      await refreshDocuments();
      openRecord(record);
    }
  }

  async function handleUpload(file: File) {
    const record = await saveDocument(file);
    await refreshDocuments();
    openRecord(record);
  }

  async function openNextAvailableDocument(documentsToSearch: StoredDocument[]) {
    const nextDocument = documentsToSearch.find((document) => !document.deletedAt);
    if (!nextDocument) {
      clearActiveDocument();
      return;
    }

    const record = await getDocument(nextDocument.id);
    if (record && !record.deletedAt) {
      openRecord(record);
      return;
    }

    clearActiveDocument();
  }

  async function handleMoveDocumentToTrash(id: string) {
    await moveDocumentToTrash(id);
    const nextDocuments = await refreshDocuments();
    if (activeDocument?.id === id) {
      await openNextAvailableDocument(nextDocuments.filter((document) => document.id !== id));
    }
  }

  async function handleRestoreDocument(id: string) {
    await restoreDocument(id);
    await refreshDocuments();
  }

  async function handleDeleteDocumentForever(id: string) {
    const confirmed = window.confirm(
      "Borrar este Markdown definitivamente tambien elimina sus anotaciones, conceptos y avance.",
    );
    if (!confirmed) return;

    await deleteDocumentForever(id);
    const nextDocuments = await refreshDocuments();
    if (activeDocument?.id === id) await openNextAvailableDocument(nextDocuments);
  }

  async function handleToggleDocumentFavorite(id: string) {
    const document = documents.find((item) => item.id === id);
    await setDocumentFavorite(id, !document?.favorite);
    await refreshDocuments();
  }

  async function handleNativeOpenMarkdown() {
    const payload = await window.mdAutopsy?.openMarkdownDialog();
    if (!payload) return;

    const record = await saveDocumentData({
      name: payload.name,
      size: payload.size,
      lastModified: payload.lastModified,
      content: payload.content,
    });
    await refreshDocuments();
    openRecord(record);
  }

  function handlePageChange(page: number) {
    if (!Number.isFinite(page)) return;
    setCurrentPage(Math.min(Math.max(1, Math.round(page)), sectionCount || 1));
    clearSelection();
  }

  function storeSelection(nextSelection: SelectionDraft | null) {
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
  }

  function clearSelection() {
    storeSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleToolChange(nextTool: ToolMode) {
    const currentSelection = selectionRef.current;

    setTool(nextTool);
    setToolOptions(null);

    if (!currentSelection) {
      window.getSelection()?.removeAllRanges();
      return;
    }

    if (nextTool === "highlight") {
      createAnnotationFromDraft(currentSelection);
      return;
    }

    window.getSelection()?.removeAllRanges();
  }

  function handleViewerFullscreenChange(nextFullscreen: boolean) {
    applyViewerFullscreenState(nextFullscreen);
    const fullscreenRequest = window.mdAutopsy?.setNativeFullscreen?.(nextFullscreen);
    fullscreenRequest?.catch((error) => console.error("No se pudo cambiar el modo pantalla completa", error));
  }

  function handleStudyPanelCollapsedToggle() {
    if (isViewerFullscreen) {
      setIsFullscreenStudyVisible(false);
      return;
    }

    setIsStudyPanelCollapsed((collapsed) => !collapsed);
  }

  function handleFullscreenStudyToggle() {
    setIsFullscreenStudyVisible((visible) => !visible);
  }

  function createAnnotationFromDraft(draft: SelectionDraft, note?: string) {
    if (!activeDocument) return;
    pushUndo(note ? "Agregar nota" : "Resaltar texto");
    const timestamp = nowIso();
    const annotation: StudyAnnotation = {
      id: createId("annotation"),
      documentId: activeDocument.id,
      page: draft.page,
      text: draft.text,
      type: note ? "note" : "highlight",
      color: activeColor,
      note,
      anchor: draft.textAnchor,
      favorite: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setAnnotations((current) => {
      const nextAnnotations = [annotation, ...current];
      annotationsRef.current = nextAnnotations;
      return nextAnnotations;
    });
    setActiveTab("annotations");
    clearSelection();
  }

  function createAnnotation(note?: string) {
    const currentSelection = selectionRef.current;
    if (!currentSelection) return;
    createAnnotationFromDraft(currentSelection, note);
  }

  function createTerm(termValue: string, definition: string) {
    const currentSelection = selectionRef.current;
    if (!currentSelection || !activeDocument) return;
    const normalized = normalizeTerm(termValue);
    if (!isTrackableNormalizedTerm(normalized)) return;

    pushUndo("Guardar termino");
    const timestamp = nowIso();
    setTerms((current) => {
      const existing = current.find((term) => term.normalized === normalized);
      if (existing) {
        const nextTerms = current.map((term) =>
          term.id === existing.id
            ? {
                ...term,
                term: termValue,
                definition: definition || term.definition,
                color: activeColor,
                updatedAt: timestamp,
            }
            : term,
        );
        termsRef.current = nextTerms;
        return nextTerms;
      }

      const nextTerms = [
        {
          id: createId("term"),
          documentId: activeDocument.id,
          term: termValue,
          normalized,
          definition,
          color: activeColor,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        ...current,
      ];
      termsRef.current = nextTerms;
      return nextTerms;
    });

    setActiveTab("terms");
    clearSelection();
  }

  function deleteAnnotation(id: string) {
    if (!annotationsRef.current.some((annotation) => annotation.id === id)) return;
    pushUndo("Eliminar anotacion");
    setAnnotations((current) => {
      const nextAnnotations = current.filter((annotation) => annotation.id !== id);
      annotationsRef.current = nextAnnotations;
      return nextAnnotations;
    });
  }

  function updateAnnotation(id: string, input: { note: string; color: HighlightColor }) {
    const note = input.note.trim();
    if (!annotationsRef.current.some((annotation) => annotation.id === id)) return;
    pushUndo("Editar anotacion");

    setAnnotations((current) => {
      const nextAnnotations = current.map((annotation) =>
        annotation.id === id
          ? {
              ...annotation,
              type: note ? ("note" as const) : ("highlight" as const),
              note: note || undefined,
              color: input.color,
              updatedAt: nowIso(),
            }
          : annotation,
      );
      annotationsRef.current = nextAnnotations;
      return nextAnnotations;
    });
  }

  function deleteTerm(id: string) {
    if (!termsRef.current.some((term) => term.id === id)) return;
    pushUndo("Eliminar termino");
    setTerms((current) => {
      const nextTerms = current.filter((term) => term.id !== id);
      termsRef.current = nextTerms;
      return nextTerms;
    });
  }

  function updateTerm(id: string, input: { term: string; definition: string; color: HighlightColor }) {
    const termValue = input.term.trim();
    const normalized = normalizeTerm(termValue);

    if (!isTrackableNormalizedTerm(normalized)) {
      return "El termino debe tener al menos 3 caracteres utiles.";
    }

    if (termsRef.current.some((term) => term.id !== id && term.normalized === normalized)) {
      return "Ya existe un concepto con ese termino.";
    }

    pushUndo("Editar termino");
    setTerms((current) => {
      const nextTerms = current.map((term) =>
        term.id === id
          ? {
              ...term,
              term: termValue,
              normalized,
              definition: input.definition.trim(),
              color: input.color,
              updatedAt: nowIso(),
            }
          : term,
      );
      termsRef.current = nextTerms;
      return nextTerms;
    });

    return null;
  }

  function markTermReviewed(id: string, remembered: boolean) {
    if (!termsRef.current.some((term) => term.id === id)) return;
    pushUndo("Repasar termino");
    const timestamp = nowIso();

    setTerms((current) => {
      const nextTerms = current.map((term) => {
        if (term.id !== id) return term;

        const previous = term.review ?? { attempts: 0, correct: 0, streak: 0 };
        const streak = remembered ? previous.streak + 1 : 0;
        const nextReview = new Date();
        const intervalMinutes = remembered ? Math.min(60 * 24 * 14, 60 * 24 * Math.max(1, 2 ** (streak - 1))) : 20;
        nextReview.setMinutes(nextReview.getMinutes() + intervalMinutes);

        return {
          ...term,
          review: {
            attempts: previous.attempts + 1,
            correct: previous.correct + (remembered ? 1 : 0),
            streak,
            lastReviewedAt: timestamp,
            nextReviewAt: nextReview.toISOString(),
          },
          updatedAt: timestamp,
        };
      });
      termsRef.current = nextTerms;
      return nextTerms;
    });
  }

  function toggleFavorite(id: string) {
    if (!annotationsRef.current.some((annotation) => annotation.id === id)) return;
    pushUndo("Marcar favorito");
    setAnnotations((current) => {
      const nextAnnotations = current.map((annotation) =>
        annotation.id === id ? { ...annotation, favorite: !annotation.favorite, updatedAt: nowIso() } : annotation,
      );
      annotationsRef.current = nextAnnotations;
      return nextAnnotations;
    });
  }

  function addCustomColor(color: HighlightColor) {
    setCustomColors((current) => (current.includes(color) ? current : [...current, color]));
  }

  function handleSelectionDraft(draft: SelectionDraft | null) {
    if (!draft) {
      storeSelection(null);
      return;
    }

    if (tool === "highlight") {
      createAnnotationFromDraft(draft);
      window.getSelection()?.removeAllRanges();
      return;
    }

    storeSelection(draft);
  }

  function handleReadingProgress(progress: Omit<ReadingProgress, "documentId" | "updatedAt">) {
    if (!activeDocument) return;
    const stored = saveReadingProgress(activeDocument.id, progress);

    const now = performance.now();
    const lastUpdate = lastProgressStateUpdateRef.current;
    const shouldUpdateState = stored.page !== lastUpdate.page || now - lastUpdate.timestamp > 2400;
    if (!shouldUpdateState) return;

    lastProgressStateUpdateRef.current = { page: stored.page, timestamp: now };
    setReadingProgress(stored);
  }

  return (
    <div
      className={[
        "app-shell",
        isSidebarCollapsed ? "is-sidebar-collapsed" : "",
        isStudyPanelCollapsed ? "is-study-panel-collapsed" : "",
        isViewerFullscreen ? "is-viewer-fullscreen" : "",
        isFullscreenStudyVisible ? "is-fullscreen-study-visible" : "",
        theme === "dark" ? "theme-dark" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={uploadInputRef}
        className="sr-only"
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUpload(file);
          event.currentTarget.value = "";
        }}
      />

      <Sidebar
        documents={documents}
        activeDocumentId={activeDocument?.id}
        annotations={annotations}
        terms={terms}
        readingProgress={readingProgress}
        pages={sectionCount}
        collapsed={isSidebarCollapsed}
        libraryView={libraryView}
        onLibraryViewChange={setLibraryView}
        onOpenDocument={handleOpenDocument}
        onUpload={handleUpload}
        onMoveDocumentToTrash={handleMoveDocumentToTrash}
        onRestoreDocument={handleRestoreDocument}
        onDeleteDocumentForever={handleDeleteDocumentForever}
        onToggleDocumentFavorite={handleToggleDocumentFavorite}
        onToggleCollapsed={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="main-column">
        <Toolbar
          tool={tool}
          onToolChange={handleToolChange}
          onToolOptions={(selectedTool, anchor) => {
            clearSelection();
            setToolOptions({ tool: selectedTool, anchor });
          }}
          page={currentPage}
          pages={sectionCount}
          scale={scale}
          query={query}
          onQueryChange={setQuery}
          onPageChange={handlePageChange}
          onScaleChange={(nextScale) => {
            setManualScale(true);
            setScale(Number(nextScale.toFixed(2)));
          }}
          onResetView={() => {
            setManualScale(false);
            setScale(getResponsiveScale());
          }}
          canUndo={undoStack.length > 0}
          onUndo={undoLastAction}
        />
        <MarkdownWorkspace
          content={markdownContent}
          documentName={activeDocument?.name}
          page={currentPage}
          pages={sectionCount}
          scale={scale}
          readingProgress={readingProgress}
          annotations={annotations}
          terms={terms}
          tool={tool}
          isViewerFullscreen={isViewerFullscreen}
          isFullscreenStudyVisible={isFullscreenStudyVisible}
          onToolChange={handleToolChange}
          onViewerFullscreenChange={handleViewerFullscreenChange}
          onFullscreenStudyToggle={handleFullscreenStudyToggle}
          onSectionsLoaded={(sections) => {
            setSectionCount(sections);
            setCurrentPage((page) => Math.min(page, sections));
          }}
          onPageChange={handlePageChange}
          onReadingProgress={handleReadingProgress}
          onSelection={(draft) => {
            handleSelectionDraft(draft);
          }}
          onUploadClick={() => uploadInputRef.current?.click()}
        />
      </div>

      <StudyPanel
        annotations={annotations}
        terms={terms}
        customColors={customColors}
        activeTab={activeTab}
        query={query}
        currentPage={currentPage}
        collapsed={isViewerFullscreen && isFullscreenStudyVisible ? false : isStudyPanelCollapsed}
        overlayMode={isViewerFullscreen}
        onTabChange={setActiveTab}
        onPageJump={handlePageChange}
        onDeleteAnnotation={deleteAnnotation}
        onDeleteTerm={deleteTerm}
        onUpdateAnnotation={updateAnnotation}
        onUpdateTerm={updateTerm}
        onToggleFavorite={toggleFavorite}
        onReviewTerm={markTermReviewed}
        onToggleCollapsed={handleStudyPanelCollapsedToggle}
      />

      {selection && (
        <SelectionPopover
          selection={selection}
          activeColor={activeColor}
          customColors={customColors}
          initialMode={tool === "note" ? "note" : tool === "term" ? "term" : "quick"}
          onColorChange={setActiveColor}
          onHighlight={createAnnotation}
          onTerm={createTerm}
          onSearch={(text) => {
            setQuery(text);
            setActiveTab("annotations");
          }}
          onClose={clearSelection}
        />
      )}

      {toolOptions && (
        <ToolOptionsPopover
          tool={toolOptions.tool}
          anchor={toolOptions.anchor}
          activeColor={activeColor}
          customColors={customColors}
          onColorChange={setActiveColor}
          onAddColor={addCustomColor}
          onClose={() => setToolOptions(null)}
        />
      )}

      {isSettingsOpen && (
        <SettingsDialog theme={theme} onThemeChange={setTheme} onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}
