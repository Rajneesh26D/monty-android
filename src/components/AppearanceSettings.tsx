import { Moon, Sun, Check } from 'lucide-react';
import { setAppearance, themeColors, useAppearance } from '../services/appearance';

export function AppearanceSettings() {
  const appearance = useAppearance();
  return (
    <section className="panel appearance-panel">
      <span className="eyebrow">Make Monty yours</span>
      <h2>Appearance</h2>
      <p className="muted">
        Choose your display and accent color. Your choice stays saved on this device.
      </p>
      <div className="appearance-modes" role="group" aria-label="Display mode">
        {(['dark', 'light'] as const).map((mode) => (
          <button
            key={mode}
            className={appearance.mode === mode ? 'selected' : ''}
            aria-pressed={appearance.mode === mode}
            onClick={() => setAppearance({ ...appearance, mode })}
          >
            {mode === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            <span>{mode === 'dark' ? 'Dark' : 'Light'}</span>
            {appearance.mode === mode && <Check size={16} />}
          </button>
        ))}
      </div>
      <span className="field-label">Accent color</span>
      <div className="theme-options" role="group" aria-label="Accent color">
        {themeColors.map((color) => (
          <button
            key={color}
            data-swatch={color}
            aria-pressed={appearance.color === color}
            className={appearance.color === color ? 'selected' : ''}
            onClick={() => setAppearance({ ...appearance, color })}
          >
            <span className="theme-swatch">
              {appearance.color === color && <Check size={17} />}
            </span>
            <span>{color[0].toUpperCase() + color.slice(1)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
