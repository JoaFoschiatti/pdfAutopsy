import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  Library,
  Plus,
  RotateCcw,
  Settings,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import type { LibraryView, ReadingProgress, StoredDocument, StudyAnnotation, TermNote } from "../types";
import { formatBytes } from "../storage";

type SidebarProps = {
  documents: StoredDocument[];
  activeDocumentId?: string;
  annotations: StudyAnnotation[];
  terms: TermNote[];
  readingProgress: ReadingProgress | null;
  pages: number;
  collapsed: boolean;
  libraryView: LibraryView;
  onLibraryViewChange: (view: LibraryView) => void;
  onOpenDocument: (id: string) => void;
  onUpload: (file: File) => void;
  onMoveDocumentToTrash: (id: string) => void;
  onRestoreDocument: (id: string) => void;
  onDeleteDocumentForever: (id: string) => void;
  onToggleDocumentFavorite: (id: string) => void;
  onToggleCollapsed: () => void;
  onOpenSettings: () => void;
};

export function Sidebar({
  documents,
  activeDocumentId,
  annotations,
  terms,
  readingProgress,
  pages,
  collapsed,
  libraryView,
  onLibraryViewChange,
  onOpenDocument,
  onUpload,
  onMoveDocumentToTrash,
  onRestoreDocument,
  onDeleteDocumentForever,
  onToggleDocumentFavorite,
  onToggleCollapsed,
  onOpenSettings,
}: SidebarProps) {
  const activeDocuments = documents.filter((document) => !document.deletedAt);
  const deletedDocuments = documents.filter((document) => document.deletedAt);
  const favoriteDocuments = activeDocuments.filter((document) => document.favorite);
  const recentDocuments = [...activeDocuments]
    .sort((a, b) => Date.parse(b.lastOpenedAt ?? b.addedAt) - Date.parse(a.lastOpenedAt ?? a.addedAt))
    .slice(0, 8);
  const visibleDocuments = getVisibleDocuments({
    documents: activeDocuments,
    favorites: favoriteDocuments,
    recent: recentDocuments,
    trash: deletedDocuments,
    view: libraryView,
  });
  const currentPage = readingProgress?.page ?? 1;
  const progress = pages
    ? Math.min(100, Math.max(0, Math.round((readingProgress?.scrollRatio ?? (currentPage - 1) / pages) * 100)))
    : 0;
  const folderLabel = {
    all: "Documentos guardados",
    recent: "Recientes",
    favorites: "Favoritos",
    trash: "Papelera",
  }[libraryView];

  if (collapsed) {
    return (
      <aside className="sidebar is-collapsed" aria-label="Biblioteca colapsada">
        <button className="icon-button panel-toggle" type="button" onClick={onToggleCollapsed} title="Expandir biblioteca">
          <ChevronRight size={18} />
        </button>
        <div className="brand-mark collapsed-brand" title="mdAutopsy">
          <BookOpen size={19} />
        </div>
        <label className="icon-button file-trigger collapsed-upload" title="Agregar Markdown">
          <Plus size={17} />
          <input
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </aside>
    );
  }

  return (
    <aside className="sidebar" aria-label="Biblioteca">
      <div className="brand">
        <div className="brand-mark">
          <BookOpen size={20} />
        </div>
        <span>mdAutopsy</span>
        <button className="icon-button panel-toggle" type="button" onClick={onToggleCollapsed} title="Colapsar biblioteca">
          <ChevronLeft size={18} />
        </button>
      </div>

      <section className="sidebar-section">
        <div className="section-heading">
          <h2>Biblioteca</h2>
          <label className="icon-button file-trigger" title="Agregar Markdown">
            <Plus size={17} />
            <input
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <nav className="nav-list">
          <button
            className={`nav-row ${libraryView === "all" ? "is-active" : ""}`}
            type="button"
            onClick={() => onLibraryViewChange("all")}
          >
            <Library size={18} />
            Todos los documentos
            <b>{activeDocuments.length}</b>
          </button>
          <button
            className={`nav-row ${libraryView === "recent" ? "is-active" : ""}`}
            type="button"
            onClick={() => onLibraryViewChange("recent")}
          >
            <Clock3 size={18} />
            Recientes
            <b>{recentDocuments.length}</b>
          </button>
          <button
            className={`nav-row ${libraryView === "favorites" ? "is-active" : ""}`}
            type="button"
            onClick={() => onLibraryViewChange("favorites")}
          >
            <Star size={18} />
            Favoritos
            <b>{favoriteDocuments.length}</b>
          </button>
          <button
            className={`nav-row ${libraryView === "trash" ? "is-active" : ""}`}
            type="button"
            onClick={() => onLibraryViewChange("trash")}
          >
            <Trash2 size={18} />
            Papelera
            <b>{deletedDocuments.length}</b>
          </button>
        </nav>
      </section>

      <section className="sidebar-section documents-section">
        <div className="section-heading">
          <h2>Estudio</h2>
          <Upload size={17} />
        </div>
        <div className="folder-title">
          <Folder size={16} />
          {folderLabel}
        </div>
        <div className="document-list">
          {visibleDocuments.length === 0 && <p className="empty-state compact-empty">No hay documentos en esta vista.</p>}
          {visibleDocuments.map((doc) => (
            <DocumentItem
              active={doc.id === activeDocumentId}
              document={doc}
              key={doc.id}
              onDeleteForever={onDeleteDocumentForever}
              onMoveToTrash={onMoveDocumentToTrash}
              onOpen={onOpenDocument}
              onRestore={onRestoreDocument}
              onToggleFavorite={onToggleDocumentFavorite}
            />
          ))}
        </div>
      </section>

      <section className="progress-card">
        <div className="progress-title">Progreso de estudio</div>
        <div className="progress-content">
          <div className="progress-ring" style={{ "--progress": `${progress}%` } as React.CSSProperties}>
            <span>{progress}%</span>
          </div>
          <dl>
            <div>
              <dt>Avance</dt>
              <dd>{progress}%</dd>
            </div>
            <div>
              <dt>Seccion actual</dt>
              <dd>{Math.min(currentPage, pages || 1)} de {pages || 1}</dd>
            </div>
            <div>
              <dt>Anotaciones</dt>
              <dd>{annotations.length}</dd>
            </div>
            <div>
              <dt>Terminos</dt>
              <dd>{terms.length}</dd>
            </div>
          </dl>
        </div>
      </section>

      <button className="settings-row" type="button" onClick={onOpenSettings}>
        <Settings size={18} />
        Ajustes
      </button>
    </aside>
  );
}

function getVisibleDocuments(input: {
  documents: StoredDocument[];
  favorites: StoredDocument[];
  recent: StoredDocument[];
  trash: StoredDocument[];
  view: LibraryView;
}) {
  if (input.view === "recent") return input.recent;
  if (input.view === "favorites") return input.favorites;
  if (input.view === "trash") return input.trash;
  return input.documents;
}

type DocumentItemProps = {
  active: boolean;
  document: StoredDocument;
  onOpen: (id: string) => void;
  onMoveToTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onToggleFavorite: (id: string) => void;
};

function DocumentItem({
  active,
  document,
  onOpen,
  onMoveToTrash,
  onRestore,
  onDeleteForever,
  onToggleFavorite,
}: DocumentItemProps) {
  const isDeleted = Boolean(document.deletedAt);

  return (
    <article className={`document-item ${active ? "is-active" : ""} ${isDeleted ? "is-deleted" : ""}`}>
      <button
        className="document-row"
        disabled={isDeleted}
        type="button"
        onClick={() => onOpen(document.id)}
        title={isDeleted ? "Restaura el Markdown para abrirlo" : document.name}
      >
        <FileText size={16} />
        <span>{document.name}</span>
        <small>{formatBytes(document.size)}</small>
      </button>
      <div className="document-actions">
        {isDeleted ? (
          <>
            <button className="icon-button" type="button" onClick={() => onRestore(document.id)} title="Restaurar Markdown">
              <RotateCcw size={15} />
            </button>
            <button
              className="icon-button danger-action"
              type="button"
              onClick={() => onDeleteForever(document.id)}
              title="Borrar definitivamente"
            >
              <Trash2 size={15} />
            </button>
          </>
        ) : (
          <>
            <button
              className={`icon-button ${document.favorite ? "is-active" : ""}`}
              type="button"
              onClick={() => onToggleFavorite(document.id)}
              title={document.favorite ? "Quitar Markdown favorito" : "Marcar Markdown favorito"}
            >
              <Star size={15} />
            </button>
            <button
              className="icon-button danger-action"
              type="button"
              onClick={() => onMoveToTrash(document.id)}
              title="Mover a papelera"
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}
