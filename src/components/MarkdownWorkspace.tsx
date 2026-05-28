import {
  FileUp,
  Highlighter,
  Maximize2,
  MessageSquare,
  Minimize2,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Tag,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { colorToRgba } from "../colors";
import { isTrackableTerm, normalizeTerm } from "../storage";
import type { HighlightColor, ReadingProgress, SelectionDraft, StudyAnnotation, TermNote } from "../types";

export type ToolMode = "select" | "highlight" | "note" | "term";

type MarkdownWorkspaceProps = {
  content: string | null;
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
  onSectionsLoaded: (sections: number) => void;
  onPageChange: (page: number) => void;
  onReadingProgress: (progress: Omit<ReadingProgress, "documentId" | "updatedAt">) => void;
  onSelection: (selection: SelectionDraft | null) => void;
  onUploadClick: () => void;
};

type MarkdownBlock = {
  id: string;
  markdown: string;
  section: number;
};

type TextNodeSpan = {
  node: Text;
  start: number;
  end: number;
};

type StudyRange = {
  id: string;
  start: number;
  end: number;
  color: HighlightColor;
  className: "annotation-mark" | "term-mark";
  title: string;
};

type Point = {
  x: number;
  y: number;
};

type SectionAnchor = {
  section: number;
  top: number;
};

const FULLSCREEN_REVEAL_DIAMETER = 320;
const FULLSCREEN_REVEAL_RADIUS = FULLSCREEN_REVEAL_DIAMETER / 2;
const MIN_PROGRESS_SCROLL_DELTA = 320;
const MIN_PROGRESS_INTERVAL_MS = 1400;

const fullscreenTools = [
  { id: "select", label: "Seleccionar", icon: MousePointer2 },
  { id: "highlight", label: "Resaltar", icon: Highlighter },
  { id: "note", label: "Nota", icon: MessageSquare },
  { id: "term", label: "Termino", icon: Tag },
] as const;

const markdownComponents: Components = {
  a({ children, href, ...props }) {
    return (
      <a href={href} rel="noreferrer" target="_blank" {...props}>
        {children}
      </a>
    );
  },
  table({ children, ...props }) {
    return (
      <div className="markdown-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  },
};

const RenderedMarkdownDocument = memo(function RenderedMarkdownDocument({
  blocks,
  scale,
}: {
  blocks: MarkdownBlock[];
  scale: number;
}) {
  return (
    <article className="markdown-document" style={{ "--markdown-scale": scale } as React.CSSProperties}>
      {blocks.map((block) => (
        <section
          className="markdown-block"
          data-md-block-id={block.id}
          data-md-section={block.section}
          key={block.id}
        >
          <ReactMarkdown
            components={markdownComponents}
            rehypePlugins={[rehypeKatex]}
            remarkPlugins={[remarkGfm, remarkMath]}
            skipHtml
          >
            {block.markdown}
          </ReactMarkdown>
        </section>
      ))}
    </article>
  );
});

function roundRatio(value: number) {
  return Number(value.toFixed(5));
}

function buildMarkdownBlocks(content: string): MarkdownBlock[] {
  const normalizedContent = content.replace(/\r\n?/g, "\n").trim();
  if (!normalizedContent) return [];

  const rawBlocks: string[] = [];
  const buffer: string[] = [];
  let inFence = false;

  function flush() {
    const markdown = buffer.join("\n").trimEnd();
    buffer.length = 0;
    if (markdown.trim()) rawBlocks.push(markdown);
  }

  normalizedContent.split("\n").forEach((line) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

    if (!inFence && line.trim() === "") {
      flush();
      return;
    }

    buffer.push(line);
  });

  flush();

  let currentSection = 0;
  return rawBlocks.map((markdown, index) => {
    if (/^\s{0,3}#{1,6}\s+\S/.test(markdown)) {
      currentSection += 1;
    } else if (currentSection === 0) {
      currentSection = 1;
    }

    return {
      id: `block-${index + 1}`,
      markdown,
      section: currentSection,
    };
  });
}

function shouldIgnoreTextNode(node: Text) {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest("script, style, .katex"));
}

function collectTextNodes(root: HTMLElement): TextNodeSpan[] {
  const spans: TextNodeSpan[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text) || shouldIgnoreTextNode(node)) return NodeFilter.FILTER_REJECT;
      return node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const length = textNode.textContent?.length ?? 0;
    spans.push({ node: textNode, start: offset, end: offset + length });
    offset += length;
    node = walker.nextNode();
  }

  return spans;
}

function getBlockText(root: HTMLElement) {
  return collectTextNodes(root)
    .map((span) => span.node.textContent ?? "")
    .join("");
}

function unwrapStudyMarks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".study-mark").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

function findTextPosition(spans: TextNodeSpan[], offset: number) {
  const clampedOffset = Math.max(0, offset);
  const span = spans.find((item) => clampedOffset >= item.start && clampedOffset <= item.end) ?? spans[spans.length - 1];
  if (!span) return null;
  return {
    node: span.node,
    offset: Math.min(span.node.textContent?.length ?? 0, Math.max(0, clampedOffset - span.start)),
  };
}

function applyStudyRange(block: HTMLElement, range: StudyRange) {
  if (range.end <= range.start) return;

  const spans = collectTextNodes(block);
  const start = findTextPosition(spans, range.start);
  const end = findTextPosition(spans, range.end);
  if (!start || !end) return;

  const domRange = document.createRange();
  domRange.setStart(start.node, start.offset);
  domRange.setEnd(end.node, end.offset);
  if (domRange.collapsed) return;

  const mark = document.createElement("span");
  mark.className = `study-mark ${range.className}`;
  mark.dataset.studyMarkId = range.id;
  mark.title = range.title;
  mark.style.backgroundColor = colorToRgba(range.color, range.className === "term-mark" ? 0.72 : 0.3);
  if (range.className === "term-mark") {
    mark.style.setProperty("--concept-underline", colorToRgba(range.color, 0.95));
  }

  mark.append(domRange.extractContents());
  domRange.insertNode(mark);
}

function rangesOverlap(a: Pick<StudyRange, "start" | "end">, b: Pick<StudyRange, "start" | "end">) {
  return a.start < b.end && a.end > b.start;
}

function subtractBlockedRanges(range: StudyRange, blockers: StudyRange[]): StudyRange[] {
  let segments = [{ start: range.start, end: range.end }];

  blockers.forEach((blocker) => {
    segments = segments.flatMap((segment) => {
      if (segment.start >= blocker.end || segment.end <= blocker.start) return [segment];
      const nextSegments = [];
      if (segment.start < blocker.start) nextSegments.push({ start: segment.start, end: blocker.start });
      if (segment.end > blocker.end) nextSegments.push({ start: blocker.end, end: segment.end });
      return nextSegments;
    });
  });

  return segments
    .filter((segment) => segment.end > segment.start)
    .map((segment, index) => ({
      ...range,
      id: `${range.id}-${index}`,
      start: segment.start,
      end: segment.end,
    }));
}

function normalizeForSearch(value: string) {
  let normalized = "";
  const map: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const withoutAccent = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

    if (/[\p{L}\p{N}]/u.test(withoutAccent)) {
      normalized += withoutAccent;
      map.push(index);
      continue;
    }

    if (/[\s-]/u.test(char)) {
      normalized += " ";
      map.push(index);
    }
  }

  return { normalized, map };
}

function normalizeTermForSearch(value: string) {
  return normalizeTerm(value).replace(/-/g, " ");
}

function isWordChar(value: string | undefined) {
  return Boolean(value && /[\p{L}\p{N}]/u.test(value));
}

function findTermRanges(blockText: string, terms: TermNote[]) {
  const searchable = normalizeForSearch(blockText);
  const candidates: StudyRange[] = [];

  terms
    .filter((term) => isTrackableTerm(term.term))
    .forEach((term) => {
      const needle = normalizeTermForSearch(term.term);
      if (!needle) return;

      let index = searchable.normalized.indexOf(needle);
      let occurrence = 0;
      while (index >= 0) {
        const endIndex = index + needle.length;
        const before = searchable.normalized[index - 1];
        const after = searchable.normalized[endIndex];

        if (!isWordChar(before) && !isWordChar(after)) {
          const start = searchable.map[index];
          const end = (searchable.map[endIndex - 1] ?? start) + 1;
          if (Number.isFinite(start) && end > start) {
            candidates.push({
              id: `${term.id}-${occurrence}`,
              start,
              end,
              color: term.color,
              className: "term-mark",
              title: term.definition ? `${term.term}: ${term.definition}` : term.term,
            });
          }
        }

        occurrence += 1;
        index = searchable.normalized.indexOf(needle, Math.max(endIndex, index + 1));
      }
    });

  const accepted: StudyRange[] = [];
  candidates
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    .forEach((candidate) => {
      if (!accepted.some((range) => rangesOverlap(range, candidate))) accepted.push(candidate);
    });

  return accepted;
}

function resolveAnnotationRange(annotation: StudyAnnotation, blockText: string) {
  const start = annotation.anchor.start;
  const end = annotation.anchor.end;
  const expectedQuote = annotation.anchor.quote;

  if (start >= 0 && end > start && blockText.slice(start, end) === expectedQuote) {
    return { start, end };
  }

  const fallbackQuote = expectedQuote || annotation.text;
  const fallbackIndex = blockText.indexOf(fallbackQuote);
  if (fallbackIndex >= 0) return { start: fallbackIndex, end: fallbackIndex + fallbackQuote.length };

  return null;
}

function applyStudyMarks(root: HTMLElement, annotations: StudyAnnotation[], terms: TermNote[]) {
  const blocks = root.querySelectorAll<HTMLElement>("[data-md-block-id]");

  blocks.forEach((block) => {
    unwrapStudyMarks(block);
    const blockId = block.dataset.mdBlockId;
    if (!blockId) return;

    const blockText = getBlockText(block);
    if (!blockText) return;

    const termRanges = findTermRanges(blockText, terms);
    const annotationRanges = annotations
      .filter((annotation) => annotation.anchor.blockId === blockId)
      .flatMap((annotation) => {
        const resolvedRange = resolveAnnotationRange(annotation, blockText);
        if (!resolvedRange) return [];

        const range: StudyRange = {
          id: annotation.id,
          start: resolvedRange.start,
          end: resolvedRange.end,
          color: annotation.color,
          className: "annotation-mark",
          title: annotation.note ?? annotation.text,
        };

        return subtractBlockedRanges(range, termRanges);
      });

    [...annotationRanges, ...termRanges]
      .filter((range) => range.end > range.start)
      .sort((a, b) => b.start - a.start || a.end - b.end)
      .forEach((range) => applyStudyRange(block, range));
  });
}

function blockFromNode(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-md-block-id]") ?? null;
}

function blockOffsetFromRangeBoundary(block: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(block);
  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }

  return range.toString().length;
}

export function MarkdownWorkspace({
  content,
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
  onSectionsLoaded,
  onPageChange,
  onReadingProgress,
  onSelection,
  onUploadClick,
}: MarkdownWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const sectionAnchorsRef = useRef<SectionAnchor[]>([]);
  const scrollRafRef = useRef<number | null>(null);
  const pageChangeCameFromScroll = useRef(false);
  const restoredDocumentRef = useRef<string | null>(null);
  const lastProgressEmitRef = useRef({ page: 0, scrollTop: -1, timestamp: 0 });
  const fullscreenControlsTimerRef = useRef<number | null>(null);
  const fullscreenControlsVisibleRef = useRef(false);
  const fullscreenRevealAnchorRef = useRef<Point | null>(null);
  const lastFullscreenPointerRef = useRef<Point | null>(null);
  const lastFullscreenRevealRef = useRef(0);
  const selectionStartBlockRef = useRef<HTMLElement | null>(null);
  const selectionFinalizeTimerRef = useRef<number | null>(null);
  const [showFullscreenControls, setShowFullscreenControls] = useState(false);

  const blocks = useMemo(() => buildMarkdownBlocks(content ?? ""), [content]);
  const sectionCount = useMemo(() => Math.max(1, ...blocks.map((block) => block.section)), [blocks]);

  useEffect(() => {
    onSectionsLoaded(sectionCount);
  }, [sectionCount]);

  const updateSectionAnchors = useCallback(() => {
    const documentElement = workspaceRef.current?.querySelector<HTMLElement>(".markdown-document");
    if (!documentElement) {
      sectionAnchorsRef.current = [];
      return;
    }

    const seen = new Set<number>();
    sectionAnchorsRef.current = Array.from(documentElement.querySelectorAll<HTMLElement>("[data-md-section]"))
      .map((element) => ({
        element,
        section: Number(element.dataset.mdSection),
      }))
      .filter((item) => Number.isFinite(item.section))
      .filter((item) => {
        if (seen.has(item.section)) return false;
        seen.add(item.section);
        return true;
      })
      .map((item) => ({
        section: item.section,
        top: documentElement.offsetTop + item.element.offsetTop,
      }));
  }, []);

  useLayoutEffect(() => {
    const documentElement = workspaceRef.current?.querySelector<HTMLElement>(".markdown-document");
    if (!documentElement) return;
    applyStudyMarks(documentElement, annotations, terms);
    updateSectionAnchors();
  }, [annotations, terms, blocks, scale, updateSectionAnchors]);

  useEffect(() => {
    fullscreenControlsVisibleRef.current = showFullscreenControls;
  }, [showFullscreenControls]);

  useEffect(() => {
    return () => {
      if (fullscreenControlsTimerRef.current) window.clearTimeout(fullscreenControlsTimerRef.current);
      if (selectionFinalizeTimerRef.current) window.clearTimeout(selectionFinalizeTimerRef.current);
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!content) {
      restoredDocumentRef.current = null;
      onViewerFullscreenChange(false);
      setShowFullscreenControls(false);
      fullscreenRevealAnchorRef.current = null;
      lastFullscreenPointerRef.current = null;
    }
  }, [content, onViewerFullscreenChange]);

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

    let timeout = 0;
    function restore() {
      const region = scrollRegionRef.current;
      if (!region || restoredDocumentRef.current === progress.documentId) return;

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

    timeout = window.setTimeout(restore, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [onPageChange, page, readingProgress]);

  useEffect(() => {
    if (pageChangeCameFromScroll.current) {
      pageChangeCameFromScroll.current = false;
      return;
    }

    const sectionElement = workspaceRef.current?.querySelector<HTMLElement>(`[data-md-section="${page}"]`);
    sectionElement?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [page]);

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

  function targetIsViewerControl(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, input, textarea, select, [role='toolbar']"));
  }

  function clearSelectionFinalizeTimer() {
    if (!selectionFinalizeTimerRef.current) return;
    window.clearTimeout(selectionFinalizeTimerRef.current);
    selectionFinalizeTimerRef.current = null;
  }

  function rejectCurrentSelection() {
    onSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function finalizeTextSelection(startBlock: HTMLElement) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      rejectCurrentSelection();
      return;
    }

    const range = selection.getRangeAt(0);
    const endBlock = blockFromNode(range.endContainer);
    if (!endBlock || endBlock !== startBlock) {
      rejectCurrentSelection();
      return;
    }

    const start = blockOffsetFromRangeBoundary(startBlock, range.startContainer, range.startOffset);
    const end = blockOffsetFromRangeBoundary(startBlock, range.endContainer, range.endOffset);
    if (start === null || end === null || end <= start) {
      rejectCurrentSelection();
      return;
    }

    const exactText = getBlockText(startBlock).slice(start, end);
    const cleanedText = exactText.replace(/\s+/g, " ").trim();
    if (cleanedText.length < 2) {
      rejectCurrentSelection();
      return;
    }

    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 2 && rect.height > 2);
    const anchorRect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    const blockText = getBlockText(startBlock);
    const blockId = startBlock.dataset.mdBlockId;
    const section = Number(startBlock.dataset.mdSection || 1);

    if (!blockId || !anchorRect) {
      rejectCurrentSelection();
      return;
    }

    onSelection({
      text: cleanedText,
      page: section,
      textAnchor: {
        blockId,
        start,
        end,
        quote: exactText,
        prefix: blockText.slice(Math.max(0, start - 36), start),
        suffix: blockText.slice(end, end + 36),
      },
      anchor: {
        x: anchorRect.left + anchorRect.width / 2,
        y: anchorRect.bottom,
      },
    });
  }

  function scheduleTextSelectionFinalization(startBlock: HTMLElement) {
    clearSelectionFinalizeTimer();
    selectionFinalizeTimerRef.current = window.setTimeout(() => {
      selectionFinalizeTimerRef.current = null;
      finalizeTextSelection(startBlock);
    }, 32);
  }

  function processScroll() {
    const region = scrollRegionRef.current;
    if (!region) return;

    const anchors = sectionAnchorsRef.current;
    if (anchors.length === 0) updateSectionAnchors();

    const targetY = region.scrollTop + region.clientHeight * 0.28;
    let nearestSection = page;
    let nearestDistance = Number.POSITIVE_INFINITY;

    sectionAnchorsRef.current.forEach((anchor) => {
      const distance = Math.abs(anchor.top - targetY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSection = anchor.section;
      }
    });

    if (nearestSection !== page) {
      pageChangeCameFromScroll.current = true;
      onPageChange(nearestSection);
    }

    const maxScroll = Math.max(0, region.scrollHeight - region.clientHeight);
    const now = performance.now();
    const lastProgress = lastProgressEmitRef.current;
    const shouldEmit =
      nearestSection !== lastProgress.page ||
      Math.abs(region.scrollTop - lastProgress.scrollTop) > MIN_PROGRESS_SCROLL_DELTA ||
      now - lastProgress.timestamp > MIN_PROGRESS_INTERVAL_MS;

    if (shouldEmit) {
      lastProgressEmitRef.current = {
        page: nearestSection,
        scrollTop: region.scrollTop,
        timestamp: now,
      };
      onReadingProgress({
        page: nearestSection,
        scrollTop: Math.round(region.scrollTop),
        scrollRatio: maxScroll ? roundRatio(region.scrollTop / maxScroll) : 0,
      });
    }
  }

  function handleScroll() {
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      processScroll();
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    clearSelectionFinalizeTimer();
    selectionStartBlockRef.current = blockFromNode(event.target as Node);

    if (!selectionStartBlockRef.current) {
      if (targetIsViewerControl(event.target)) return;
      rejectCurrentSelection();
      return;
    }

    onSelection(null);

    const pointerId = event.pointerId;
    const cleanup = () => {
      window.removeEventListener("pointerup", finishSelection, true);
      window.removeEventListener("pointercancel", cancelSelection, true);
    };
    const finishSelection = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      const startBlock = selectionStartBlockRef.current;
      selectionStartBlockRef.current = null;
      if (startBlock) scheduleTextSelectionFinalization(startBlock);
    };
    const cancelSelection = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      selectionStartBlockRef.current = null;
      rejectCurrentSelection();
    };

    window.addEventListener("pointerup", finishSelection, true);
    window.addEventListener("pointercancel", cancelSelection, true);
  }

  const workspaceClassName = [
    "workspace",
    isViewerFullscreen ? "is-viewer-fullscreen" : "",
    isViewerFullscreen && showFullscreenControls ? "is-controls-visible" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!content) {
    return (
      <main className="workspace empty-workspace">
        <div className="empty-document">
          <FileUp size={38} />
          <h1>Abre un Markdown para empezar a estudiar</h1>
          <p>Guarda documentos, resalta texto, agrega notas y convierte terminos en conceptos reutilizables.</p>
          <button className="primary-action" type="button" onClick={onUploadClick}>
            Cargar Markdown
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className={workspaceClassName}
      ref={workspaceRef}
      onPointerDown={handlePointerDown}
      onMouseMove={handleFullscreenMouseMove}
      onContextMenu={handleFullscreenContextMenu}
    >
      <div className="document-titlebar">
        <span>{documentName}</span>
        <small>Markdown GFM con formulas LaTeX</small>
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

      <div className="markdown-scroll-region" ref={scrollRegionRef} onScroll={handleScroll}>
        <RenderedMarkdownDocument blocks={blocks} scale={scale} />
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

export const defaultColor: HighlightColor = "yellow";
