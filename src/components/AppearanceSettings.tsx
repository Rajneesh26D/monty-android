import { Check } from 'lucide-react';
import { darkOnlyThemes, setAppearance, themeColors, useAppearance } from '../services/appearance';

export function AppearanceSettings() {
  const appearance = useAppearance();
  return (
    <section className="panel appearance-panel">
      <h2>Appearance</h2>
      {(['dark', 'light'] as const).map((mode) => (
        <div className="theme-group" key={mode}>
          <h3>{mode === 'dark' ? 'Dark themes' : 'Light themes'}</h3>
          <div className="theme-options" role="group" aria-label={mode + ' themes'}>
            {themeColors
              .filter((color) => mode === 'dark' || !darkOnlyThemes.includes(color))
              .map((color) => {
                const name =
                  color === 'amoled'
                    ? 'AMOLED'
                    : color === 'youtube'
                      ? 'YouTube'
                      : color[0].toUpperCase() + color.slice(1);
                const selected = appearance.color === color && appearance.mode === mode;
                return (
                  <button
                    key={color}
                    data-swatch={color}
                    data-swatch-mode={mode}
                    aria-label={name + ' ' + mode}
                    aria-pressed={selected}
                    className={selected ? 'selected' : ''}
                    onClick={() => setAppearance({ color, mode })}
                  >
                    <span className="theme-swatch">{selected && <Check size={17} />}</span>
                    <span>{name}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}
