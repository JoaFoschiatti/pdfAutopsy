import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  MessageSquare,
  MousePointer2,
  RotateCcw,
  Search,
  Tag,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { MouseEvent } from "react";

type ToolMode = "select" | "highlight" | "note" | "term";

type ToolbarProps = {
  tool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  onToolOptions: (tool: ToolMode, anchor: { x: number; y: number }) => void;
  page: number;
  pages: number;
  scale: number;
  query: string;
  onQueryChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onScaleChange: (scale: number) => void;
  onResetView: () => void;
};

const tools = [
  { id: "select", label: "Seleccionar", icon: MousePointer2 },
  { id: "highlight", label: "Resaltar", icon: Highlighter },
  { id: "note", label: "Nota", icon: MessageSquare },
  { id: "term", label: "Termino", icon: Tag },
] as const;

export function Toolbar({
  tool,
  onToolChange,
  onToolOptions,
  page,
  pages,
  scale,
  query,
  onQueryChange,
  onPageChange,
  onScaleChange,
  onResetView,
}: ToolbarProps) {
  const clampedScale = Math.round(scale * 100);

  return (
    <header className="toolbar" aria-label="Herramientas de estudio">
      <div className="toolbar-group tools-group">
        {tools.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`tool-button ${tool === item.id ? "is-active" : ""}`}
              key={item.id}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                if (tool === item.id) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onToolOptions(item.id, { x: rect.left + rect.width / 2, y: rect.bottom });
                  return;
                }
                onToolChange(item.id);
              }}
              type="button"
              title={item.label}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group search-group">
        <Search size={18} />
        <input
          aria-label="Buscar en anotaciones y conceptos"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar"
        />
      </div>

      <div className="toolbar-group page-group" aria-label="Navegacion de paginas">
        <button
          className="icon-button"
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          title="Pagina anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <span>Pagina</span>
        <input
          className="page-input"
          aria-label="Pagina actual"
          type="number"
          min={1}
          max={pages || 1}
          value={page}
          onChange={(event) => onPageChange(Number(event.target.value))}
        />
        <span className="muted">de {pages || 1}</span>
        <button
          className="icon-button"
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!pages || page >= pages}
          title="Pagina siguiente"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="toolbar-group zoom-group" aria-label="Zoom del documento">
        <button
          className="icon-button"
          type="button"
          onClick={() => onScaleChange(Math.max(0.65, scale - 0.1))}
          title="Alejar"
        >
          <ZoomOut size={18} />
        </button>
        <button className="zoom-readout" type="button" onClick={onResetView}>
          {clampedScale}%
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => onScaleChange(Math.min(1.8, scale + 0.1))}
          title="Acercar"
        >
          <ZoomIn size={18} />
        </button>
        <button className="icon-button" type="button" onClick={onResetView} title="Restablecer vista">
          <RotateCcw size={17} />
        </button>
      </div>
    </header>
  );
}
