import { Highlighter, MessageSquare, Search, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { colorToCss, DEFAULT_COLORS } from "../colors";
import type { HighlightColor, SelectionDraft } from "../types";

type SelectionPopoverProps = {
  selection: SelectionDraft;
  activeColor: HighlightColor;
  customColors: HighlightColor[];
  initialMode?: "quick" | "note" | "term";
  onColorChange: (color: HighlightColor) => void;
  onHighlight: (note?: string) => void;
  onTerm: (term: string, definition: string) => void;
  onSearch: (query: string) => void;
  onClose: () => void;
};

export function SelectionPopover({
  selection,
  activeColor,
  customColors,
  initialMode = "quick",
  onColorChange,
  onHighlight,
  onTerm,
  onSearch,
  onClose,
}: SelectionPopoverProps) {
  const [mode, setMode] = useState<"quick" | "note" | "term">(initialMode);
  const [note, setNote] = useState("");
  const [term, setTerm] = useState(selection.text);
  const [definition, setDefinition] = useState("");
  const firstInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const colors = [...DEFAULT_COLORS, ...customColors.filter((color) => !DEFAULT_COLORS.includes(color))];

  useEffect(() => {
    if (mode !== "quick") {
      requestAnimationFrame(() => firstInputRef.current?.focus());
    }
  }, [mode]);

  const estimatedHeight = mode === "term" ? 282 : mode === "note" ? 236 : 260;
  const preferredTop = mode === "quick" ? selection.anchor.y + 18 : selection.anchor.y - estimatedHeight - 12;
  const style = {
    left: Math.min(window.innerWidth - 330, Math.max(16, selection.anchor.x - 160)),
    top: Math.max(12, Math.min(window.innerHeight - estimatedHeight - 12, Math.max(74, preferredTop))),
  };

  return (
    <div className="selection-popover" style={style} role="dialog" aria-label="Acciones de seleccion">
      <div className="popover-header">
        <strong>{selection.text}</strong>
        <button className="icon-button" type="button" onClick={onClose} title="Cerrar">
          <X size={16} />
        </button>
      </div>

      <div className="color-row" aria-label="Color de resaltado">
        {colors.map((color) => (
          <button
            className={`color-swatch swatch-${color} ${activeColor === color ? "is-active" : ""}`}
            key={color}
            type="button"
            onClick={() => onColorChange(color)}
            style={{ background: colorToCss(color) }}
            title={color}
          />
        ))}
      </div>

      {mode === "quick" && (
        <div className="popover-actions">
          <button type="button" onClick={() => onHighlight()}>
            <Highlighter size={17} />
            Resaltar seleccion
          </button>
          <button type="button" onClick={() => setMode("note")}>
            <MessageSquare size={17} />
            Agregar nota
          </button>
          <button type="button" onClick={() => setMode("term")}>
            <Tag size={17} />
            Guardar termino
          </button>
          <button type="button" onClick={() => onSearch(selection.text)}>
            <Search size={17} />
            Buscar seleccion
          </button>
        </div>
      )}

      {mode === "note" && (
        <form
          className="popover-form"
          onSubmit={(event) => {
            event.preventDefault();
            onHighlight(note.trim());
          }}
        >
          <textarea
            ref={firstInputRef as React.MutableRefObject<HTMLTextAreaElement>}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Escribe una nota para este fragmento"
            rows={4}
          />
          <div className="form-actions">
            {initialMode === "quick" && <button type="button" onClick={() => setMode("quick")}>Volver</button>}
            <button className="primary-action" type="submit">Guardar nota</button>
          </div>
        </form>
      )}

      {mode === "term" && (
        <form
          className="popover-form"
          onSubmit={(event) => {
            event.preventDefault();
            onTerm(term.trim(), definition.trim());
          }}
        >
          <input
            ref={firstInputRef as React.MutableRefObject<HTMLInputElement>}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Termino"
          />
          <textarea
            value={definition}
            onChange={(event) => setDefinition(event.target.value)}
            placeholder="Definicion o pista de estudio"
            rows={4}
          />
          <div className="form-actions">
            {initialMode === "quick" && <button type="button" onClick={() => setMode("quick")}>Volver</button>}
            <button className="primary-action" type="submit">Guardar termino</button>
          </div>
        </form>
      )}
    </div>
  );
}
