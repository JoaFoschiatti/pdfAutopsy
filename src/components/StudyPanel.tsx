import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Check,
  Eye,
  ExternalLink,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { colorToCss, DEFAULT_COLORS } from "../colors";
import type { HighlightColor, StudyAnnotation, StudyTab, TermNote } from "../types";

type AnnotationEditInput = {
  note: string;
  color: HighlightColor;
};

type TermEditInput = {
  term: string;
  definition: string;
  color: HighlightColor;
};

type StudyPanelProps = {
  annotations: StudyAnnotation[];
  terms: TermNote[];
  customColors: HighlightColor[];
  activeTab: StudyTab;
  query: string;
  currentPage: number;
  collapsed: boolean;
  overlayMode?: boolean;
  onTabChange: (tab: StudyTab) => void;
  onPageJump: (page: number) => void;
  onDeleteAnnotation: (id: string) => void;
  onDeleteTerm: (id: string) => void;
  onUpdateAnnotation: (id: string, input: AnnotationEditInput) => void;
  onUpdateTerm: (id: string, input: TermEditInput) => string | null;
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
  customColors,
  activeTab,
  query,
  currentPage,
  collapsed,
  overlayMode = false,
  onTabChange,
  onPageJump,
  onDeleteAnnotation,
  onDeleteTerm,
  onUpdateAnnotation,
  onUpdateTerm,
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
  const annotationsOnSection = visibleAnnotations.filter((annotation) => annotation.page === currentPage);
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
        <div className="panel-titlebar">
          <h2>Estudio</h2>
          <button
            className="icon-button panel-toggle"
            type="button"
            onClick={onToggleCollapsed}
            title={overlayMode ? "Ocultar estudio" : "Colapsar estudio"}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="panel-tabs" role="tablist" aria-label="Vistas de estudio">
          {tabs.map((tab) => {
            const count =
              tab.id === "annotations" ? visibleAnnotations.length : tab.id === "terms" ? visibleTerms.length : reviewDeck.length;

            return (
              <button
                className={activeTab === tab.id ? "is-active" : ""}
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
                <span className="tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "annotations" && (
        <section className="panel-content">
          <div className="panel-toolbar">
            <button className="filter-button" type="button">Todas ({visibleAnnotations.length})</button>
            <Search size={17} />
            <MoreHorizontal size={18} />
          </div>
          <h3>Seccion {currentPage}</h3>
          <AnnotationList
            annotations={annotationsOnSection}
            customColors={customColors}
            emptyLabel="No hay anotaciones en esta seccion."
            onPageJump={onPageJump}
            onDelete={onDeleteAnnotation}
            onUpdate={onUpdateAnnotation}
            onToggleFavorite={onToggleFavorite}
          />
          {visibleAnnotations.length > annotationsOnSection.length && (
            <>
              <h3>Todas las anotaciones</h3>
              <AnnotationList
                annotations={visibleAnnotations.filter((annotation) => annotation.page !== currentPage)}
                customColors={customColors}
                emptyLabel="No hay mas anotaciones guardadas."
                onPageJump={onPageJump}
                onDelete={onDeleteAnnotation}
                onUpdate={onUpdateAnnotation}
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
              <span>Se remarcan cuando vuelven a aparecer en el documento.</span>
            </div>
          </div>
          <div className="term-list">
            {visibleTerms.length === 0 && <p className="empty-state">Selecciona una palabra y guardala como termino.</p>}
            {visibleTerms.map((term) => (
              <EditableTermCard
                customColors={customColors}
                key={term.id}
                term={term}
                onDelete={onDeleteTerm}
                onUpdate={onUpdateTerm}
              />
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
  customColors: HighlightColor[];
  emptyLabel: string;
  onPageJump: (page: number) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, input: AnnotationEditInput) => void;
  onToggleFavorite: (id: string) => void;
};

function AnnotationList({
  annotations,
  customColors,
  emptyLabel,
  onPageJump,
  onDelete,
  onUpdate,
  onToggleFavorite,
}: AnnotationListProps) {
  if (annotations.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="annotation-list">
      {annotations.map((annotation) => (
        <EditableAnnotationCard
          annotation={annotation}
          customColors={customColors}
          key={annotation.id}
          onDelete={onDelete}
          onPageJump={onPageJump}
          onToggleFavorite={onToggleFavorite}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

type EditableAnnotationCardProps = {
  annotation: StudyAnnotation;
  customColors: HighlightColor[];
  onPageJump: (page: number) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, input: AnnotationEditInput) => void;
  onToggleFavorite: (id: string) => void;
};

function EditableAnnotationCard({
  annotation,
  customColors,
  onPageJump,
  onDelete,
  onUpdate,
  onToggleFavorite,
}: EditableAnnotationCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(annotation.note ?? "");
  const [draftColor, setDraftColor] = useState(annotation.color);

  useEffect(() => {
    if (isEditing) return;
    setDraftNote(annotation.note ?? "");
    setDraftColor(annotation.color);
  }, [annotation.color, annotation.note, isEditing]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onUpdate(annotation.id, { note: draftNote, color: draftColor });
    setIsEditing(false);
  }

  function handleCancel() {
    setDraftNote(annotation.note ?? "");
    setDraftColor(annotation.color);
    setIsEditing(false);
  }

  return (
    <article
      className={`annotation-card ${isEditing ? "is-editing" : ""}`}
      style={{ borderLeftColor: colorToCss(isEditing ? draftColor : annotation.color) }}
    >
      <div className="annotation-meta">
        {annotation.type === "note" ? <MessageSquare size={16} /> : <ExternalLink size={16} />}
        <span>{annotation.type === "note" ? "Nota" : "Resaltado"}</span>
        <span>Seccion {annotation.page}</span>
      </div>

      {isEditing ? (
        <form className="card-edit-form" onSubmit={handleSubmit}>
          <textarea
            aria-label="Nota de la anotacion"
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            placeholder="Nota opcional para este fragmento"
            rows={4}
          />
          <ColorPicker customColors={customColors} value={draftColor} onChange={setDraftColor} />
          <div className="form-actions">
            <button type="button" onClick={handleCancel}>Cancelar</button>
            <button className="primary-action" type="submit">Guardar</button>
          </div>
        </form>
      ) : (
        <>
          <button className="annotation-text" type="button" onClick={() => onPageJump(annotation.page)}>
            {annotation.note || annotation.text}
          </button>
          {annotation.note && <blockquote>{annotation.text}</blockquote>}
          <div className="card-actions">
            <button className="icon-button" type="button" onClick={() => setIsEditing(true)} title="Editar anotacion">
              <Pencil size={16} />
            </button>
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
        </>
      )}
    </article>
  );
}

type EditableTermCardProps = {
  term: TermNote;
  customColors: HighlightColor[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, input: TermEditInput) => string | null;
};

function EditableTermCard({ term, customColors, onDelete, onUpdate }: EditableTermCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTerm, setDraftTerm] = useState(term.term);
  const [draftDefinition, setDraftDefinition] = useState(term.definition);
  const [draftColor, setDraftColor] = useState(term.color);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isEditing) return;
    setDraftTerm(term.term);
    setDraftDefinition(term.definition);
    setDraftColor(term.color);
    setError("");
  }, [isEditing, term.color, term.definition, term.term]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = onUpdate(term.id, {
      term: draftTerm,
      definition: draftDefinition,
      color: draftColor,
    });

    if (nextError) {
      setError(nextError);
      return;
    }

    setIsEditing(false);
  }

  function handleCancel() {
    setDraftTerm(term.term);
    setDraftDefinition(term.definition);
    setDraftColor(term.color);
    setError("");
    setIsEditing(false);
  }

  return (
    <article
      className={`term-card ${isEditing ? "is-editing" : ""}`}
      style={{ borderLeftColor: colorToCss(isEditing ? draftColor : term.color) }}
    >
      {isEditing ? (
        <form className="card-edit-form term-edit-form" onSubmit={handleSubmit}>
          <input
            aria-label="Termino"
            value={draftTerm}
            onChange={(event) => {
              setDraftTerm(event.target.value);
              setError("");
            }}
            placeholder="Termino"
          />
          <textarea
            aria-label="Definicion del termino"
            value={draftDefinition}
            onChange={(event) => setDraftDefinition(event.target.value)}
            placeholder="Definicion o pista de estudio"
            rows={4}
          />
          <ColorPicker customColors={customColors} value={draftColor} onChange={setDraftColor} />
          {error && <span className="field-error">{error}</span>}
          <div className="form-actions">
            <button type="button" onClick={handleCancel}>Cancelar</button>
            <button className="primary-action" type="submit">Guardar</button>
          </div>
        </form>
      ) : (
        <>
          <div>
            <strong>{term.term}</strong>
            <span>{term.definition || "Sin definicion todavia"}</span>
            <small>{getReviewStatus(term)}</small>
          </div>
          <div className="term-card-actions">
            <button className="icon-button" type="button" onClick={() => setIsEditing(true)} title="Editar termino">
              <Pencil size={16} />
            </button>
            <button className="icon-button" type="button" onClick={() => onDelete(term.id)} title="Eliminar termino">
              <Trash2 size={16} />
            </button>
          </div>
        </>
      )}
    </article>
  );
}

type ColorPickerProps = {
  value: HighlightColor;
  customColors: HighlightColor[];
  onChange: (color: HighlightColor) => void;
};

function ColorPicker({ value, customColors, onChange }: ColorPickerProps) {
  const colors = Array.from(new Set([...DEFAULT_COLORS, ...customColors, value]));

  return (
    <div className="inline-color-row" aria-label="Color" role="group">
      {colors.map((color) => (
        <button
          className={`color-swatch ${value === color ? "is-active" : ""}`}
          key={color}
          type="button"
          onClick={() => onChange(color)}
          style={{ background: colorToCss(color) }}
          title={color}
          aria-label={`Usar color ${color}`}
        >
          {value === color && <Check size={13} />}
        </button>
      ))}
    </div>
  );
}
