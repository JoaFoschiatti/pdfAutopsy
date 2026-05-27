import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { colorToCss, DEFAULT_COLORS, normalizeHexColor } from "../colors";
import type { HighlightColor } from "../types";
import type { ToolMode } from "./PdfWorkspace";

type ToolOptionsPopoverProps = {
  tool: ToolMode;
  anchor: { x: number; y: number };
  activeColor: HighlightColor;
  customColors: HighlightColor[];
  onColorChange: (color: HighlightColor) => void;
  onAddColor: (color: HighlightColor) => void;
  onClose: () => void;
};

const toolLabels: Record<ToolMode, string> = {
  select: "Seleccionar",
  highlight: "Resaltar",
  note: "Nota",
  term: "Termino",
};

export function ToolOptionsPopover({
  tool,
  anchor,
  activeColor,
  customColors,
  onColorChange,
  onAddColor,
  onClose,
}: ToolOptionsPopoverProps) {
  const [hex, setHex] = useState(() => (activeColor.startsWith("#") ? activeColor : colorToCss(activeColor)));
  const [error, setError] = useState("");
  const colors = Array.from(new Set([...DEFAULT_COLORS, ...customColors]));
  const hasColorControls = tool !== "select";
  const normalizedHex = normalizeHexColor(hex);

  const style = {
    left: Math.min(window.innerWidth - 300, Math.max(12, anchor.x - 150)),
    top: Math.min(window.innerHeight - 260, Math.max(64, anchor.y + 8)),
  };

  function addHexColor() {
    if (!normalizedHex) {
      setError("Hex invalido");
      return;
    }
    setError("");
    setHex(normalizedHex);
    onAddColor(normalizedHex);
    onColorChange(normalizedHex);
  }

  return (
    <div className="tool-options-popover" style={style} role="dialog" aria-label={`Opciones de ${toolLabels[tool]}`}>
      <div className="popover-header">
        <strong>{toolLabels[tool]}</strong>
        <button className="icon-button" type="button" onClick={onClose} title="Cerrar">
          <X size={16} />
        </button>
      </div>

      {hasColorControls ? (
        <>
          <div className="color-row" aria-label="Color activo">
            {colors.map((color) => (
              <button
                className={`color-swatch ${activeColor === color ? "is-active" : ""}`}
                key={color}
                type="button"
                onClick={() => onColorChange(color)}
                style={{ background: colorToCss(color) }}
                title={color}
              >
                {activeColor === color && <Check size={13} />}
              </button>
            ))}
          </div>
          <form
            className="hex-color-row"
            onSubmit={(event) => {
              event.preventDefault();
              addHexColor();
            }}
          >
            <input
              aria-label="Color hexadecimal"
              value={hex}
              inputMode="text"
              maxLength={7}
              onChange={(event) => {
                setHex(event.target.value);
                setError("");
              }}
              placeholder="#ffd451"
            />
            <button className="icon-button" type="submit" disabled={!normalizedHex} title="Agregar color">
              <Plus size={16} />
            </button>
          </form>
          {error && <span className="field-error">{error}</span>}
        </>
      ) : (
        <div className="select-mode-note">Seleccionar no modifica el PDF.</div>
      )}
    </div>
  );
}
