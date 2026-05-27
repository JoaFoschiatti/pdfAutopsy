import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Check,
  Eye,
  ExternalLink,
  MessageSquare,
  MoreHorizontal,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { colorToCss } from "../colors";
import type { StudyAnnotation, StudyTab, TermNote } from "../types";

type StudyPanelProps = {
  annotations: StudyAnnotation[];
  terms: TermNote[];
  activeTab: StudyTab;
  query: string;
  currentPage: number;
  collapsed: boolean;
  overlayMode?: boolean;
  onTabChange: (tab: StudyTab) => void;
  onPageJump: (page: number) => void;
  onDeleteAnnotation: (id: string) => void;
  onDeleteTerm: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onReviewTerm: (id: string, remembered: boolean) => void;
  onToggleCollapsed: () => void;
};

const tabs = [
  { id: "annotations", label: "Anotaciones" },
  { id: "terms", label: "Conceptos" },
  { id: "review", label: "Repasos" },
] as const;

export function StudyPanel({
  annotations,
  terms,
  activeTab,
  query,
  currentPage,
  collapsed,
  overlayMode = false,
  onTabChange,
  onPageJump,
  onDeleteAnnotation,
  onDeleteTerm,
  onToggleFavorite,
  onReviewTerm,
  onToggleCollapsed,
}: StudyPanelProps) {
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const visibleAnnotations = annotations.filter((annotation) => {
    if (!normalizedQuery) return true;
    return `${annotation.text} ${annotation.note ?? ""}`.toLocaleLowerCase("es").includes(normalizedQuery);
  });
  const visibleTerms = terms.filter((term) => {
    if (!normalizedQuery) return true;
    return `${term.term} ${term.definition}`.toLocaleLowerCase("es").includes(normalizedQuery);
  });
  const annotationsOnPage = visibleAnnotations.filter((annotation) => annotation.page === currentPage);
  const reviewTerms = useMemo(() => sortTermsForReview(visibleTerms), [visibleTerms]);
  const dueReviewTerms = reviewTerms.filter(isDueForReview);
  const reviewDeck = dueReviewTerms.length ? dueReviewTerms : reviewTerms;
  const activeReviewTerm = reviewDeck[reviewIndex] ?? null;
  const reviewedTerms = visibleTerms.filter((term) => (term.review?.attempts ?? 0) > 0);

  useEffect(() => {
    setReviewIndex(0);
    setIsAnswerVisible(false);
  }, [activeTab, normalizedQuery, terms.length]);

  useEffect(() => {
    if (reviewIndex >= reviewDeck.length) {
      setReviewIndex(Math.max(0, reviewDeck.length - 1));
      setIsAnswerVisible(false);
    }
  }, [reviewDeck.length, reviewIndex]);

  function handleReview(remembered: boolean) {
    if (!activeReviewTerm) return;
    onReviewTerm(activeReviewTerm.id, remembered);
    setIsAnswerVisible(false);
    setReviewIndex((current) => (reviewDeck.length <= 1 ? 0 : (current + 1) % reviewDeck.length));
  }

  if (collapsed) {
    return (
      <aside className="study-panel is-collapsed" aria-label="Panel de estudio colapsado">
        <button className="icon-button panel-toggle" type="button" onClick={onToggleCollapsed} title="Expandir estudio">
          <ChevronLeft size={18} />
        </button>
        <div className="collapsed-panel-label">Estudio</div>
      </aside>
    );
  }

  return (
    <aside className="study-panel" aria-label="Panel de estudio">
      <div className="panel-header">
        <div className="panel-tabs" role="tablist" aria-label="Vistas de estudio">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "is-active" : ""}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          className="icon-button panel-toggle"
          type="button"
          onClick={onToggleCollapsed}
          title={overlayMode ? "Ocultar estudio" : "Colapsar estudio"}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {activeTab === "annotations" && (
        <section className="panel-content">
          <div className="panel-toolbar">
            <button className="filter-button" type="button">Todas ({visibleAnnotations.length})</button>
            <Search size={17} />
            <MoreHorizontal size={18} />
          </div>
          <h3>Pagina {currentPage}</h3>
          <AnnotationList
            annotations={annotationsOnPage}
            emptyLabel="No hay anotaciones en esta pagina."
            onPageJump={onPageJump}
            onDelete={onDeleteAnnotation}
            onToggleFavorite={onToggleFavorite}
          />
          {visibleAnnotations.length > annotationsOnPage.length && (
            <>
              <h3>Todas las anotaciones</h3>
              <AnnotationList
                annotations={visibleAnnotations.filter((annotation) => annotation.page !== currentPage)}
                emptyLabel="No hay mas anotaciones guardadas."
                onPageJump={onPageJump}
                onDelete={onDeleteAnnotation}
                onToggleFavorite={onToggleFavorite}
              />
            </>
          )}
        </section>
      )}

      {activeTab === "terms" && (
        <section className="panel-content">
          <div className="terms-summary">
            <Tag size={18} />
            <div>
              <strong>{visibleTerms.length} conceptos definidos</strong>
              <span>Se remarcan cuando vuelven a aparecer en el PDF.</span>
            </div>
          </div>
          <div className="term-list">
            {visibleTerms.length === 0 && <p className="empty-state">Selecciona una palabra y guardala como termino.</p>}
            {visibleTerms.map((term) => (
              <article className="term-card" key={term.id} style={{ borderLeftColor: colorToCss(term.color) }}>
                <div>
                  <strong>{term.term}</strong>
                  <span>{term.definition || "Sin definicion todavia"}</span>
                  <small>{getReviewStatus(term)}</small>
                </div>
                <button className="icon-button" type="button" onClick={() => onDeleteTerm(term.id)} title="Eliminar termino">
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "review" && (
        <section className="panel-content">
          <div className="review-card">
            <BookOpenCheck size={22} />
            <div>
              <strong>{dueReviewTerms.length || reviewTerms.length} tarjetas</strong>
              <span>{reviewedTerms.length} repasadas</span>
            </div>
          </div>

          {activeReviewTerm ? (
            <article className="flash-card active-flash-card" style={{ borderLeftColor: colorToCss(activeReviewTerm.color) }}>
              <div className="flash-card-meta">
                <small>{reviewIndex + 1} de {reviewDeck.length}</small>
                <span>{getReviewStatus(activeReviewTerm)}</span>
              </div>
              <strong>{activeReviewTerm.term}</strong>
              <p className={isAnswerVisible ? "" : "answer-hidden"}>
                {activeReviewTerm.definition || "Sin definicion guardada."}
              </p>
              <div className="review-actions">
                {!isAnswerVisible ? (
                  <button className="primary-action" type="button" onClick={() => setIsAnswerVisible(true)}>
                    <Eye size={16} />
                    Mostrar respuesta
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => handleReview(false)}>
                      <X size={16} />
                      No lo sabia
                    </button>
                    <button type="button" onClick={() => handleReview(true)}>
                      <Check size={16} />
                      Lo sabia
                    </button>
                  </>
                )}
              </div>
            </article>
          ) : (
            <p className="empty-state">Guarda conceptos para crear repasos.</p>
          )}
        </section>
      )}
    </aside>
  );
}

function getReviewTime(term: TermNote) {
  const nextReviewAt = term.review?.nextReviewAt;
  if (!nextReviewAt) return 0;
  const parsed = Date.parse(nextReviewAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDueForReview(term: TermNote) {
  return getReviewTime(term) <= Date.now();
}

function sortTermsForReview(terms: TermNote[]) {
  return [...terms].sort((a, b) => getReviewTime(a) - getReviewTime(b) || a.term.localeCompare(b.term));
}

function getReviewStatus(term: TermNote) {
  const review = term.review;
  if (!review?.attempts) return "Sin repasar";

  const accuracy = Math.round((review.correct / review.attempts) * 100);
  if (!review.nextReviewAt) return `${accuracy}% aciertos`;

  return `${accuracy}% aciertos · ${formatNextReview(review.nextReviewAt)}`;
}

function formatNextReview(nextReviewAt: string) {
  const diffMinutes = Math.round((Date.parse(nextReviewAt) - Date.now()) / 60000);
  if (diffMinutes <= 0) return "Pendiente";
  if (diffMinutes < 60) return `${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h`;

  return `${Math.round(diffHours / 24)} d`;
}

type AnnotationListProps = {
  annotations: StudyAnnotation[];
  emptyLabel: string;
  onPageJump: (page: number) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
};

function AnnotationList({
  annotations,
  emptyLabel,
  onPageJump,
  onDelete,
  onToggleFavorite,
}: AnnotationListProps) {
  if (annotations.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="annotation-list">
      {annotations.map((annotation) => (
        <article
          className="annotation-card"
          key={annotation.id}
          style={{ borderLeftColor: colorToCss(annotation.color) }}
        >
          <div className="annotation-meta">
            {annotation.type === "note" ? <MessageSquare size={16} /> : <ExternalLink size={16} />}
            <span>{annotation.type === "note" ? "Nota" : "Resaltado"}</span>
            <span>Pagina {annotation.page}</span>
          </div>
          <button className="annotation-text" type="button" onClick={() => onPageJump(annotation.page)}>
            {annotation.note || annotation.text}
          </button>
          {annotation.note && <blockquote>{annotation.text}</blockquote>}
          <div className="card-actions">
            <button
              className={`icon-button ${annotation.favorite ? "is-active" : ""}`}
              type="button"
              onClick={() => onToggleFavorite(annotation.id)}
              title="Marcar favorito"
            >
              <Star size={16} />
            </button>
            <button className="icon-button" type="button" onClick={() => onDelete(annotation.id)} title="Eliminar">
              <Trash2 size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
