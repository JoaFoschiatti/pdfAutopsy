import {
  FileUp,
  Highlighter,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Tag,
} from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { colorToRgba } from "../colors";
import { isTrackableTerm, normalizeTerm } from "../storage";
import type { HighlightColor, ReadingProgress, SelectionDraft, StudyAnnotation, TermNote } from "../types";

export type ToolMode = "select" | "highlight" | "note" | "term";

type PdfWorkspaceProps = {
  pdfData: ArrayBuffer | null;
  documentName?: string;
  page: number;
  pages: number;
  scale: number;
  readingProgress: ReadingProgress | null;
  annotations: StudyAnnotation[];
  terms: TermNote[];
  tool: ToolMode;
  isViewerFullscreen: boolean;
  isFullscreenStudyVisible: boolean;
  onToolChange: (tool: ToolMode) => void;
  onViewerFullscreenChange: (isFullscreen: boolean) => void;
  onFullscreenStudyToggle: () => void;
  onPagesLoaded: (pages: number) => void;
  onPageChange: (page: number) => void;
  onReadingProgress: (progress: Omit<ReadingProgress, "documentId" | "updatedAt">) => void;
  onSelection: (selection: SelectionDraft | null) => void;
  onUploadClick: () => void;
};

type TermHitRect = {
  id: string;
  page: number;
  normalized: string;
  color: HighlightColor;
  title: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type MatchedRange = {
  start: number;
  end: number;
};

type Point = {
  x: number;
  y: number;
};

const FULLSCREEN_REVEAL_DIAMETER = 320;
const FULLSCREEN_REVEAL_RADIUS = FULLSCREEN_REVEAL_DIAMETER / 2;

const fullscreenTools = [
  { id: "select", label: "Seleccionar", icon: MousePointer2 },
  { id: "highlight", label: "Resaltar", icon: Highlighter },
  { id: "note", label: "Nota", icon: MessageSquare },
  { id: "term", label: "Termino", icon: Tag },
] as const;

function roundRatio(value: number) {
  return Number(value.toFixed(5));
}

function overlapsRange(ranges: MatchedRange[], start: number, end: number) {
  return ranges.some((range) => start < range.end && end > range.start);
}

export function PdfWorkspace({
  pdfData,
  documentName,
  page,
  pages,
  scale,
  readingProgress,
  annotations,
  terms,
  tool,
  isViewerFullscreen,
  isFullscreenStudyVisible,
  onToolChange,
  onViewerFullscreenChange,
  onFullscreenStudyToggle,
  onPagesLoaded,
  onPageChange,
  onReadingProgress,
  onSelection,
  onUploadClick,
}: PdfWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const lastTermHitsRef = useRef("");
  const pageChangeCameFromScroll = useRef(false);
  const restoredDocumentRef = useRef<string | null>(null);
  const lastProgressEmitRef = useRef({ page: 0, scrollTop: -1, timestamp: 0 });
  const fullscreenControlsTimerRef = useRef<number | null>(null);
  const fullscreenControlsVisibleRef = useRef(false);
  const fullscreenRevealAnchorRef = useRef<Point | null>(null);
  const lastFullscreenPointerRef = useRef<Point | null>(null);
  const lastFullscreenRevealRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [termHitRects, setTermHitRects] = useState<TermHitRect[]>([]);
  const [showFullscreenControls, setShowFullscreenControls] = useState(false);

  const file = useMemo(() => {
    if (!pdfData) return null;
    return { data: new Uint8Array(pdfData.slice(0)) };
  }, [pdfData]);

  const pageNumbers = useMemo(() => Array.from({ length: pages }, (_item, index) => index + 1), [pages]);

  const computeTermHitRects = useCallback(() => {
    const container = workspaceRef.current;
    if (!container) return;

    const trackableTerms = terms.filter((term) => isTrackableTerm(term.term));
    if (trackableTerms.length === 0) {
      if (lastTermHitsRef.current !== "[]") {
        lastTermHitsRef.current = "[]";
        setTermHitRects([]);
      }
      return;
    }

    const nextHits: TermHitRect[] = [];
    const pageElements = container.querySelectorAll<HTMLElement>("[data-study-page]");

    pageElements.forEach((pageElement) => {
      const pageNumber = Number(pageElement.dataset.pageNumber);
      const pageRect = pageElement.getBoundingClientRect();
      const spans = pageElement.querySelectorAll<HTMLSpanElement>(".react-pdf__Page__textContent span");

      spans.forEach((span, spanIndex) => {
        const rawText = span.textContent ?? "";
        const normalizedText = normalizeTerm(rawText);
        if (!normalizedText) return;

        const matchedRanges: MatchedRange[] = [];
        trackableTerms.forEach((term, termIndex) => {
          let startIndex = normalizedText.indexOf(term.normalized);
          let occurrenceIndex = 0;
          while (startIndex >= 0) {
            const endIndex = startIndex + term.normalized.length;
            if (overlapsRange(matchedRanges, startIndex, endIndex)) {
              startIndex = normalizedText.indexOf(term.normalized, endIndex);
              occurrenceIndex += 1;
              continue;
            }

            matchedRanges.push({ start: startIndex, end: endIndex });
            const spanRect = span.getBoundingClientRect();
            const rawLength = Math.max(rawText.length, normalizedText.length, 1);
            const left = spanRect.left + (startIndex / rawLength) * spanRect.width;
            const width = Math.max(8, (term.normalized.length / rawLength) * spanRect.width);

            nextHits.push({
              id: `${term.id}-${pageNumber}-${spanIndex}-${termIndex}-${occurrenceIndex}`,
              page: pageNumber,
              normalized: term.normalized,
              color: term.color,
              title: term.definition ? `${term.term}: ${term.definition}` : term.term,
              left: roundRatio((left - pageRect.left) / pageRect.width),
              top: roundRatio((spanRect.top - pageRect.top) / pageRect.height),
              width: roundRatio(width / pageRect.width),
              height: roundRatio(spanRect.height / pageRect.height),
            });

            startIndex = normalizedText.indexOf(term.normalized, endIndex);
            occurrenceIndex += 1;
          }
        });
      });
    });

    const serialized = JSON.stringify(nextHits);
    if (serialized !== lastTermHitsRef.current) {
      lastTermHitsRef.current = serialized;
      setTermHitRects(nextHits);
    }
  }, [terms]);

  useEffect(() => {
    const timeout = window.setTimeout(computeTermHitRects, 120);
    return () => window.clearTimeout(timeout);
  }, [computeTermHitRects, pages, scale]);

  useEffect(() => {
    fullscreenControlsVisibleRef.current = showFullscreenControls;
  }, [showFullscreenControls]);

  useEffect(() => {
    return () => {
      if (fullscreenControlsTimerRef.current) window.clearTimeout(fullscreenControlsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pdfData) {
      lastTermHitsRef.current = "";
      setTermHitRects([]);
      restoredDocumentRef.current = null;
      onViewerFullscreenChange(false);
      setShowFullscreenControls(false);
      fullscreenRevealAnchorRef.current = null;
      lastFullscreenPointerRef.current = null;
    }
  }, [onViewerFullscreenChange, pdfData]);

  useEffect(() => {
    if (!isViewerFullscreen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (fullscreenControlsTimerRef.current) window.clearTimeout(fullscreenControlsTimerRef.current);
      fullscreenControlsVisibleRef.current = false;
      fullscreenRevealAnchorRef.current = lastFullscreenPointerRef.current;
      setShowFullscreenControls(false);
      onViewerFullscreenChange(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isViewerFullscreen, onViewerFullscreenChange]);

  useEffect(() => {
    if (!readingProgress?.documentId) return;
    const progress = readingProgress;
    if (restoredDocumentRef.current === progress.documentId) return;
    if (pages < 1) return;

    let timeout = 0;
    function restore(attempt = 0) {
      const region = scrollRegionRef.current;
      const hasRenderedPage = Boolean(workspaceRef.current?.querySelector(".react-pdf__Page"));
      if (!region || restoredDocumentRef.current === progress.documentId) return;

      if (!hasRenderedPage && attempt < 24) {
        timeout = window.setTimeout(() => restore(attempt + 1), 80);
        return;
      }

      const maxScroll = Math.max(0, region.scrollHeight - region.clientHeight);
      const scrollTop = Number.isFinite(progress.scrollRatio)
        ? Math.round(maxScroll * progress.scrollRatio)
        : progress.scrollTop;

      region.scrollTop = Math.min(maxScroll, Math.max(0, scrollTop));
      restoredDocumentRef.current = progress.documentId;

      if (progress.page !== page) {
        pageChangeCameFromScroll.current = true;
        onPageChange(progress.page);
      }
    }

    timeout = window.setTimeout(() => restore(), 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [onPageChange, page, pages, readingProgress]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    function handleNativeDoubleClick(event: MouseEvent) {
      openWordAtPoint(event.clientX, event.clientY);
    }

    workspace.addEventListener("dblclick", handleNativeDoubleClick);
    return () => workspace.removeEventListener("dblclick", handleNativeDoubleClick);
  }, [pages, scale]);

  useEffect(() => {
    if (pageChangeCameFromScroll.current) {
      pageChangeCameFromScroll.current = false;
      return;
    }

    const pageElement = pageRefs.current.get(page);
    pageElement?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [page]);

  function setPageRef(pageNumber: number, element: HTMLElement | null) {
    if (element) {
      pageRefs.current.set(pageNumber, element);
      return;
    }
    pageRefs.current.delete(pageNumber);
  }

  function pointFromMouseEvent(event: ReactMouseEvent<HTMLElement>): Point {
    return { x: event.clientX, y: event.clientY };
  }

  function setFullscreenPointer(point: Point) {
    lastFullscreenPointerRef.current = point;
    if (!fullscreenRevealAnchorRef.current) fullscreenRevealAnchorRef.current = point;
  }

  function hasMovedPastFullscreenRevealThreshold(point: Point) {
    const anchor = fullscreenRevealAnchorRef.current;
    if (!anchor) {
      fullscreenRevealAnchorRef.current = point;
      return false;
    }

    const distanceX = point.x - anchor.x;
    const distanceY = point.y - anchor.y;
    return distanceX * distanceX + distanceY * distanceY >= FULLSCREEN_REVEAL_RADIUS * FULLSCREEN_REVEAL_RADIUS;
  }

  function showFullscreenControlsTemporarily(delay = 1800) {
    if (!fullscreenControlsVisibleRef.current) {
      fullscreenControlsVisibleRef.current = true;
      setShowFullscreenControls(true);
    }

    if (fullscreenControlsTimerRef.current) window.clearTimeout(fullscreenControlsTimerRef.current);
    fullscreenControlsTimerRef.current = window.setTimeout(() => {
      fullscreenControlsVisibleRef.current = false;
      fullscreenRevealAnchorRef.current = lastFullscreenPointerRef.current;
      setShowFullscreenControls(false);
    }, delay);
  }

  function hideFullscreenControls(anchorPoint = lastFullscreenPointerRef.current) {
    if (fullscreenControlsTimerRef.current) window.clearTimeout(fullscreenControlsTimerRef.current);
    fullscreenControlsVisibleRef.current = false;
    fullscreenRevealAnchorRef.current = anchorPoint;
    setShowFullscreenControls(false);
  }

  function enterViewerFullscreen(anchorPoint?: Point) {
    if (anchorPoint) lastFullscreenPointerRef.current = anchorPoint;
    hideFullscreenControls(anchorPoint ?? null);
    onViewerFullscreenChange(true);
  }

  function exitViewerFullscreen() {
    hideFullscreenControls();
    onViewerFullscreenChange(false);
  }

  function toggleViewerFullscreen(event: ReactMouseEvent<HTMLButtonElement>) {
    if (isViewerFullscreen) {
      exitViewerFullscreen();
      return;
    }

    enterViewerFullscreen(pointFromMouseEvent(event));
  }

  function handleFullscreenMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isViewerFullscreen) return;

    const point = pointFromMouseEvent(event);
    setFullscreenPointer(point);
    const now = performance.now();
    if (fullscreenControlsVisibleRef.current) {
      if (now - lastFullscreenRevealRef.current < 180) return;
      lastFullscreenRevealRef.current = now;
      showFullscreenControlsTemporarily();
      return;
    }

    if (!hasMovedPastFullscreenRevealThreshold(point)) return;
    lastFullscreenRevealRef.current = now;
    showFullscreenControlsTemporarily();
  }

  function handleFullscreenContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isViewerFullscreen) return;
    event.preventDefault();
    setFullscreenPointer(pointFromMouseEvent(event));
    showFullscreenControlsTemporarily(3200);
  }

  function findPageForRects(rects: DOMRect[]): HTMLElement | null {
    const pageElements = Array.from(workspaceRef.current?.querySelectorAll<HTMLElement>("[data-study-page]") ?? []);
    let best: HTMLElement | null = null;
    let bestArea = 0;

    pageElements.forEach((pageElement) => {
      const pageRect = pageElement.getBoundingClientRect();
      const area = rects.reduce((sum, rect) => {
        const left = Math.max(rect.left, pageRect.left);
        const right = Math.min(rect.right, pageRect.right);
        const top = Math.max(rect.top, pageRect.top);
        const bottom = Math.min(rect.bottom, pageRect.bottom);
        return sum + Math.max(0, right - left) * Math.max(0, bottom - top);
      }, 0);

      if (area > bestArea) {
        bestArea = area;
        best = pageElement;
      }
    });

    return best;
  }

  function handleScroll() {
    const region = scrollRegionRef.current;
    if (!region) return;

    const regionRect = region.getBoundingClientRect();
    const targetY = regionRect.top + regionRect.height * 0.32;
    let nearestPage = page;
    let nearestDistance = Number.POSITIVE_INFINITY;

    pageRefs.current.forEach((pageElement, pageNumber) => {
      const rect = pageElement.getBoundingClientRect();
      const distance = Math.abs(rect.top - targetY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPage = pageNumber;
      }
    });

    if (nearestPage !== page) {
      pageChangeCameFromScroll.current = true;
      onPageChange(nearestPage);
    }

    const maxScroll = Math.max(0, region.scrollHeight - region.clientHeight);
    const now = performance.now();
    const lastProgress = lastProgressEmitRef.current;
    const shouldEmit =
      nearestPage !== lastProgress.page ||
      Math.abs(region.scrollTop - lastProgress.scrollTop) > 28 ||
      now - lastProgress.timestamp > 800;

    if (shouldEmit) {
      lastProgressEmitRef.current = {
        page: nearestPage,
        scrollTop: region.scrollTop,
        timestamp: now,
      };
      onReadingProgress({
        page: nearestPage,
        scrollTop: Math.round(region.scrollTop),
        scrollRatio: maxScroll ? Number((region.scrollTop / maxScroll).toFixed(5)) : 0,
      });
    }
  }

  function handleMouseUp() {
    window.setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (text.length < 2) return;

      const range = selection.getRangeAt(0);
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 2 && rect.height > 2);
      const pageElement = findPageForRects(rects);
      if (!pageElement || rects.length === 0) return;

      const pageRect = pageElement.getBoundingClientRect();
      const pageNumber = Number(pageElement.dataset.pageNumber);
      const highlightRects = rects
        .map((rect) => {
          const left = Math.max(rect.left, pageRect.left);
          const right = Math.min(rect.right, pageRect.right);
          const top = Math.max(rect.top, pageRect.top);
          const bottom = Math.min(rect.bottom, pageRect.bottom);
          if (right <= left || bottom <= top) return null;
          return {
            left: (left - pageRect.left) / pageRect.width,
            top: (top - pageRect.top) / pageRect.height,
            width: (right - left) / pageRect.width,
            height: (bottom - top) / pageRect.height,
          };
        })
        .filter(Boolean) as SelectionDraft["rects"];

      if (highlightRects.length === 0) return;

      const anchorRect = rects[rects.length - 1];
      onSelection({
        text,
        page: pageNumber,
        rects: highlightRects,
        anchor: {
          x: anchorRect.left + anchorRect.width / 2,
          y: anchorRect.bottom,
        },
      });
    }, 0);
  }

  function openWordAtPoint(clientX: number, clientY: number) {
    const pageElement = Array.from(
      workspaceRef.current?.querySelectorAll<HTMLElement>("[data-study-page]") ?? [],
    ).find((element) => {
      const rect = element.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });

    if (!pageElement) return;

    const spans = Array.from(pageElement.querySelectorAll<HTMLSpanElement>(".react-pdf__Page__textContent span"));
    const targetSpan = spans.find((span) => {
      const rect = span.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top - 2 &&
        clientY <= rect.bottom + 2 &&
        (span.textContent ?? "").trim().length > 0
      );
    });

    if (!targetSpan) return;

    const text = targetSpan.textContent ?? "";
    const rect = targetSpan.getBoundingClientRect();
    const ratio = Math.min(0.99, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    const roughIndex = Math.floor(text.length * ratio);
    const isWord = (char: string) => /[\p{L}\p{N}-]/u.test(char);
    let start = roughIndex;
    let end = roughIndex;

    while (start > 0 && isWord(text[start - 1])) start -= 1;
    while (end < text.length && isWord(text[end])) end += 1;

    const word = text.slice(start, end).trim();
    if (!isTrackableTerm(word)) return;

    const pageRect = pageElement.getBoundingClientRect();
    const pageNumber = Number(pageElement.dataset.pageNumber);
    const wordLeft = rect.left + (start / text.length) * rect.width;
    const wordWidth = Math.max(10, ((end - start) / text.length) * rect.width);

    onSelection({
      text: word,
      page: pageNumber,
      rects: [
        {
          left: (wordLeft - pageRect.left) / pageRect.width,
          top: (rect.top - pageRect.top) / pageRect.height,
          width: wordWidth / pageRect.width,
          height: rect.height / pageRect.height,
        },
      ],
      anchor: {
        x: wordLeft + wordWidth / 2,
        y: rect.bottom,
      },
    });
  }

  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    openWordAtPoint(event.clientX, event.clientY);
  }

  if (!file) {
    return (
      <main className="workspace empty-workspace">
        <div className="empty-document">
          <FileUp size={38} />
          <h1>Abre un PDF para empezar a estudiar</h1>
          <p>Guarda documentos, resalta texto, agrega notas y convierte palabras en conceptos reutilizables.</p>
          <button className="primary-action" type="button" onClick={onUploadClick}>Cargar PDF</button>
        </div>
      </main>
    );
  }

  const workspaceClassName = [
    "workspace",
    isViewerFullscreen ? "is-viewer-fullscreen" : "",
    isViewerFullscreen && showFullscreenControls ? "is-controls-visible" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main
      className={workspaceClassName}
      ref={workspaceRef}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleFullscreenMouseMove}
      onContextMenu={handleFullscreenContextMenu}
    >
      <div className="document-titlebar">
        <span>{documentName}</span>
        <small>Lectura continua vertical</small>
      </div>

      {isViewerFullscreen && (
        <div
          className={`fullscreen-tool-strip ${showFullscreenControls ? "is-visible" : ""}`}
          onMouseMove={(event) => {
            setFullscreenPointer(pointFromMouseEvent(event));
            showFullscreenControlsTemporarily();
          }}
          onMouseDown={(event) => event.preventDefault()}
          role="toolbar"
          aria-label="Herramientas en pantalla completa"
        >
          {fullscreenTools.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`fullscreen-tool-button ${tool === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onToolChange(item.id);
                  showFullscreenControlsTemporarily(1400);
                }}
                type="button"
                title={item.label}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <span className="fullscreen-tool-divider" aria-hidden="true" />
          <button
            className={`fullscreen-tool-button fullscreen-study-button ${isFullscreenStudyVisible ? "is-active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onFullscreenStudyToggle();
              showFullscreenControlsTemporarily(1600);
            }}
            type="button"
            title={isFullscreenStudyVisible ? "Alternar estudio en pantalla completa" : "Abrir estudio en pantalla completa"}
            aria-label={
              isFullscreenStudyVisible ? "Alternar estudio en pantalla completa" : "Abrir estudio en pantalla completa"
            }
          >
            {isFullscreenStudyVisible ? (
              <PanelRightClose size={18} strokeWidth={1.8} />
            ) : (
              <PanelRightOpen size={18} strokeWidth={1.8} />
            )}
            <span>Estudio</span>
          </button>
        </div>
      )}

      <div className="pdf-scroll-region" ref={scrollRegionRef} onScroll={handleScroll}>
        <Document
          file={file}
          loading={<LoadingDocument />}
          onLoadSuccess={(pdf: { numPages: number }) => {
            onPagesLoaded(pdf.numPages);
            onPageChange(Math.min(page, pdf.numPages));
            setIsLoading(false);
          }}
          onLoadError={(error) => {
            console.error(error);
            setIsLoading(false);
          }}
          onLoadStart={() => setIsLoading(true)}
        >
          {isLoading && <LoadingDocument />}
          <div className="pdf-pages-stack">
            {pageNumbers.map((pageNumber) => (
              <div
                className="pdf-page-shell"
                data-page-number={pageNumber}
                data-study-page
                key={pageNumber}
                ref={(element) => setPageRef(pageNumber, element)}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderAnnotationLayer
                  renderTextLayer
                  loading={<LoadingDocument />}
                  onRenderTextLayerSuccess={() => window.setTimeout(computeTermHitRects, 0)}
                />
                <HighlightLayer
                  annotations={annotations.filter((annotation) => annotation.page === pageNumber)}
                  conceptHits={termHitRects.filter((hit) => hit.page === pageNumber)}
                />
                <TermHitLayer hits={termHitRects.filter((hit) => hit.page === pageNumber)} />
              </div>
            ))}
          </div>
        </Document>
      </div>

      <button
        className="viewer-fullscreen-toggle"
        type="button"
        onClick={toggleViewerFullscreen}
        title={isViewerFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        aria-label={isViewerFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      >
        {isViewerFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
      </button>
    </main>
  );
}

function LoadingDocument() {
  return (
    <div className="loading-document">
      <Loader2 size={22} />
      <span>Cargando PDF</span>
    </div>
  );
}

function rectsOverlap(
  first: { left: number; top: number; width: number; height: number },
  second: { left: number; top: number; width: number; height: number },
) {
  return (
    first.left < second.left + second.width &&
    first.left + first.width > second.left &&
    first.top < second.top + second.height &&
    first.top + first.height > second.top
  );
}

function isCoveredByConcept(annotation: StudyAnnotation, rect: StudyAnnotation["rects"][number], conceptHits: TermHitRect[]) {
  const normalizedText = normalizeTerm(annotation.text);
  if (!normalizedText) return false;

  return conceptHits.some((hit) => hit.normalized === normalizedText && rectsOverlap(rect, hit));
}

function HighlightLayer({
  annotations,
  conceptHits,
}: {
  annotations: StudyAnnotation[];
  conceptHits: TermHitRect[];
}) {
  return (
    <div className="highlight-layer" aria-hidden="true">
      {annotations.flatMap((annotation) =>
        annotation.rects
          .filter((rect) => !isCoveredByConcept(annotation, rect, conceptHits))
          .map((rect, index) => (
            <span
              className={`highlight-rect ${annotation.type === "note" ? "has-note" : ""}`}
              key={`${annotation.id}-${index}`}
              style={{
                left: `${rect.left * 100}%`,
                top: `${rect.top * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
                background: colorToRgba(annotation.color, annotation.type === "note" ? 0.24 : 0.3),
              }}
              title={annotation.note ?? annotation.text}
            />
          )),
      )}
    </div>
  );
}

function TermHitLayer({ hits }: { hits: TermHitRect[] }) {
  return (
    <div className="term-hit-layer" aria-hidden="true">
      {hits.map((hit) => (
        <span
          className="term-hit-rect"
          data-concept={hit.normalized}
          key={hit.id}
          style={{
            left: `${hit.left * 100}%`,
            top: `${hit.top * 100}%`,
            width: `${hit.width * 100}%`,
            height: `${hit.height * 100}%`,
            background: colorToRgba(hit.color, 0.38),
            ["--concept-underline" as string]: colorToRgba(hit.color, 0.72),
          }}
          title={hit.title}
        />
      ))}
    </div>
  );
}

export const defaultColor: HighlightColor = "yellow";
