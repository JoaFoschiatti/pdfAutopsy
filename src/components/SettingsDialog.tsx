import { Moon, Sun, X } from "lucide-react";

type ThemeMode = "light" | "dark";

type SettingsDialogProps = {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onClose: () => void;
};

export function SettingsDialog({ theme, onThemeChange, onClose }: SettingsDialogProps) {
  const isDark = theme === "dark";

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        aria-label="Ajustes"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <div>
            <h2>Ajustes</h2>
            <span>Preferencias de lectura</span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar ajustes">
            <X size={18} />
          </button>
        </div>

        <div className="settings-row-card">
          <div className="settings-row-copy">
            {isDark ? <Moon size={20} /> : <Sun size={20} />}
            <div>
              <strong>Tema oscuro</strong>
              <span>Usa superficies oscuras para leer Markdown con menos brillo.</span>
            </div>
          </div>
          <button
            className={`switch-control ${isDark ? "is-on" : ""}`}
            type="button"
            role="switch"
            aria-checked={isDark}
            onClick={() => onThemeChange(isDark ? "light" : "dark")}
          >
            <span />
          </button>
        </div>
      </section>
    </div>
  );
}
