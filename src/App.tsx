import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { SelectionPopover } from "./components/SelectionPopover";
import { SettingsDialog } from "./components/SettingsDialog";
import { StudyPanel } from "./components/StudyPanel";
import { ToolOptionsPopover } from "./components/ToolOptionsPopover";
import { defaultColor, PdfWorkspace, type ToolMode } from "./components/PdfWorkspace";
import { Toolbar } from "./components/Toolbar";
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
  upsertDemoDocument,
} from "./storage";
import type {
  HighlightColor,
  LibraryView,
  PdfDocumentRecord,
  ReadingProgress,
  SelectionDraft,
  StoredDocument,
  StudyAnnotation,
  StudyTab,
  TermNote,
} from "./types";

const CUSTOM_COLORS_KEY = "estudio-pdf-custom-colors-v1";
const ACTIVE_COLOR_KEY = "estudio-pdf-active-color-v1";
const SIDEBAR_COLLAPSED_KEY = "estudio-pdf-sidebar-collapsed-v1";
const STUDY_PANEL_COLLAPSED_KEY = "estudio-pdf-study-panel-collapsed-v1";
const THEME_KEY = "pdf-autopsy-theme-v1";
const DEFAULT_SCALE = 1.5;
type ThemeMode = "light" | "dark";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getResponsiveScale() {
  return DEFAULT_SCALE;
}

function readStoredBoolean(key: string, fallback = false) {
  try {
    return localStorage.getItem(key) === "true" || fallback;
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

export default function App() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<PdfDocumentRecord | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [annotations, setAnnotations] = useState<StudyAnnotation[]>([]);
  const [terms, setTerms] = useState<TermNote[]>([]);
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
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

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      await upsertDemoDocument();
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
    return window.estudioPdf?.onOpenPdfFromMenu(() => {
      void handleNativeOpenPdf();
    });
  }, []);

  useEffect(() => {
    if (activeDocument) saveAnnotations(activeDocument.id, annotations);
  }, [activeDocument, annotations]);

  useEffect(() => {
    if (activeDocument) saveTerms(activeDocument.id, terms);
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
        setSelection(null);
        window.getSelection()?.removeAllRanges();
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

  function openRecord(record: PdfDocumentRecord) {
    const progress = loadReadingProgress(record.id);
    setActiveDocument(record);
    setPdfData(record.data);
    setAnnotations(loadAnnotations(record.id));
    setTerms(loadTerms(record.id));
    setReadingProgress(progress);
    setCurrentPage(progress?.page ?? 1);
    setManualScale(false);
    setScale(getResponsiveScale());
    setSelection(null);
    setQuery("");
  }

  function clearActiveDocument() {
    setActiveDocument(null);
    setPdfData(null);
    setAnnotations([]);
    setTerms([]);
    setReadingProgress(null);
    setCurrentPage(1);
    setNumPages(1);
    setSelection(null);
    setQuery("");
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
    const confirmed = window.confirm("Borrar este PDF definitivamente tambien elimina sus anotaciones, conceptos y avance.");
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

  async function handleNativeOpenPdf() {
    const payload = await window.estudioPdf?.openPdfDialog();
    if (!payload) return;

    const record = await saveDocumentData({
      name: payload.name,
      size: payload.size,
      lastModified: payload.lastModified,
      data: payload.data,
    });
    await refreshDocuments();
    openRecord(record);
  }

  function handlePageChange(page: number) {
    if (!Number.isFinite(page)) return;
    setCurrentPage(Math.min(Math.max(1, Math.round(page)), numPages || 1));
    setSelection(null);
  }

  function clearSelection() {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleToolChange(nextTool: ToolMode) {
    setTool(nextTool);
    setToolOptions(null);
    clearSelection();
  }

  function handleViewerFullscreenChange(nextFullscreen: boolean) {
    setIsViewerFullscreen(nextFullscreen);
    if (!nextFullscreen) setIsFullscreenStudyVisible(false);
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
    const timestamp = nowIso();
    const annotation: StudyAnnotation = {
      id: createId("annotation"),
      documentId: activeDocument.id,
      page: draft.page,
      text: draft.text,
      type: note ? "note" : "highlight",
      color: activeColor,
      note,
      rects: draft.rects,
      favorite: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setAnnotations((current) => [annotation, ...current]);
    setActiveTab("annotations");
    clearSelection();
  }

  function createAnnotation(note?: string) {
    if (!selection) return;
    createAnnotationFromDraft(selection, note);
  }

  function createTerm(termValue: string, definition: string) {
    if (!selection || !activeDocument) return;
    const normalized = normalizeTerm(termValue);
    if (!isTrackableNormalizedTerm(normalized)) return;

    const timestamp = nowIso();
    setTerms((current) => {
      const existing = current.find((term) => term.normalized === normalized);
      if (existing) {
        return current.map((term) =>
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
      }

      return [
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
    });

    setActiveTab("terms");
    clearSelection();
  }

  function deleteAnnotation(id: string) {
    setAnnotations((current) => current.filter((annotation) => annotation.id !== id));
  }

  function deleteTerm(id: string) {
    setTerms((current) => current.filter((term) => term.id !== id));
  }

  function markTermReviewed(id: string, remembered: boolean) {
    const timestamp = nowIso();

    setTerms((current) =>
      current.map((term) => {
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
      }),
    );
  }

  function toggleFavorite(id: string) {
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === id ? { ...annotation, favorite: !annotation.favorite, updatedAt: nowIso() } : annotation,
      ),
    );
  }

  function addCustomColor(color: HighlightColor) {
    setCustomColors((current) => (current.includes(color) ? current : [...current, color]));
  }

  function handleSelectionDraft(draft: SelectionDraft | null) {
    if (!draft) return;

    if (tool === "highlight") {
      createAnnotationFromDraft(draft);
      window.getSelection()?.removeAllRanges();
      return;
    }

    setSelection(draft);
  }

  function handleReadingProgress(progress: Omit<ReadingProgress, "documentId" | "updatedAt">) {
    if (!activeDocument) return;
    const stored = saveReadingProgress(activeDocument.id, progress);
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
        accept="application/pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleUpload(file);
          event.currentTarget.value = "";
        }}
      />

      <Sidebar
        documents={documents}
        activeDocumentId={activeDocument?.id}
        annotations={annotations}
        terms={terms}
        readingProgress={readingProgress}
        pages={numPages}
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
          pages={numPages}
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
        />
        <PdfWorkspace
          pdfData={pdfData}
          documentName={activeDocument?.name}
          page={currentPage}
          pages={numPages}
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
          onPagesLoaded={(pages) => {
            setNumPages(pages);
            setCurrentPage((page) => Math.min(page, pages));
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
        activeTab={activeTab}
        query={query}
        currentPage={currentPage}
        collapsed={isViewerFullscreen && isFullscreenStudyVisible ? false : isStudyPanelCollapsed}
        overlayMode={isViewerFullscreen}
        onTabChange={setActiveTab}
        onPageJump={handlePageChange}
        onDeleteAnnotation={deleteAnnotation}
        onDeleteTerm={deleteTerm}
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
