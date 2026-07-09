import { For } from "solid-js";
import { t3 } from "lib";
import type { BackgroundDetailType, TranslatableString } from "lib";
import { PresetCard } from "./PresetCard.tsx";

type OverlayPickerProps = {
  value: BackgroundDetailType | undefined;
  onChange: (id: BackgroundDetailType) => void;
};

type OverlayOption = {
  id: BackgroundDetailType;
  name: TranslatableString;
};

const OVERLAY_OPTIONS: OverlayOption[] = [
  { id: "none", name: { en: "None", fr: "Aucun", pt: "Nenhum" } },
  { id: "pattern-dots", name: { en: "Dots", fr: "Points", pt: "Pontos" } },
  { id: "pattern-circles", name: { en: "Circles", fr: "Cercles", pt: "Círculos" } },
  { id: "pattern-ovals", name: { en: "Ovals", fr: "Ovales", pt: "Ovais" } },
  { id: "pattern-lines", name: { en: "Lines", fr: "Lignes", pt: "Linhas" } },
  { id: "pattern-grid", name: { en: "Grid", fr: "Grille", pt: "Grelha" } },
  { id: "pattern-chevrons", name: { en: "Chevrons", fr: "Chevrons", pt: "Zigue-zague" } },
  { id: "pattern-waves", name: { en: "Waves", fr: "Vagues", pt: "Ondas" } },
  { id: "pattern-noise", name: { en: "Noise", fr: "Bruit", pt: "Ruído" } },
  { id: "dots", name: { en: "Dots", fr: "Points", pt: "Pontos" } },
  { id: "rivers", name: { en: "Maze", fr: "Labyrinthe", pt: "Labirinto" } },
  { id: "waves", name: { en: "Waves", fr: "Vagues", pt: "Ondas" } },
  { id: "world", name: { en: "World", fr: "Monde", pt: "Mundo" } },
];

const BG_COLOR = "#4a5568";

function OverlayThumbnail(p: { overlayId: BackgroundDetailType }) {
  if (p.overlayId === "none") {
    return <div class="h-full w-full" style={{ background: BG_COLOR }} />;
  }

  if (p.overlayId === "pattern-dots") {
    return (
      <div class="h-full w-full relative" style={{ background: BG_COLOR }}>
        <svg class="absolute inset-0 w-full h-full opacity-20">
          <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.5" fill="white" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
      </div>
    );
  }

  if (p.overlayId === "pattern-circles") {
    return (
      <div class="h-full w-full relative" style={{ background: BG_COLOR }}>
        <svg class="absolute inset-0 w-full h-full opacity-20">
          <pattern id="circles" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="6" fill="none" stroke="white" stroke-width="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#circles)" />
        </svg>
      </div>
    );
  }

  if (p.overlayId === "pattern-ovals") {
    return (
      <div class="h-full w-full relative" style={{ background: BG_COLOR }}>
        <svg class="absolute inset-0 w-full h-full opacity-20">
          <pattern id="ovals" width="20" height="12" patternUnits="userSpaceOnUse">
            <ellipse cx="10" cy="6" rx="8" ry="4" fill="none" stroke="white" stroke-width="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#ovals)" />
        </svg>
      </div>
    );
  }

  if (p.overlayId === "pattern-lines") {
    return (
      <div class="h-full w-full relative" style={{ background: BG_COLOR }}>
        <svg class="absolute inset-0 w-full h-full opacity-20">
          <pattern id="lines" width="8" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="8" x2="8" y2="0" stroke="white" stroke-width="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#lines)" />
        </svg>
      </div>
    );
  }

  if (p.overlayId === "pattern-grid") {
    return (
      <div class="h-full w-full relative" style={{ background: BG_COLOR }}>
        <svg class="absolute inset-0 w-full h-full opacity-20">
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" stroke-width="0.5" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
    );
  }

  if (p.overlayId === "pattern-chevrons") {
    return (
      <div class="h-full w-full relative" style={{ background: BG_COLOR }}>
        <svg class="absolute inset-0 w-full h-full opacity-20">
          <pattern id="chevrons" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 0 6 L 6 0 L 12 6" fill="none" stroke="white" stroke-width="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#chevrons)" />
        </svg>
      </div>
    );
  }

  if (p.overlayId === "pattern-waves") {
    return (
      <div class="h-full w-full relative" style={{ background: BG_COLOR }}>
        <svg class="absolute inset-0 w-full h-full opacity-20">
          <pattern id="waves" width="20" height="10" patternUnits="userSpaceOnUse">
            <path d="M 0 5 Q 5 0 10 5 T 20 5" fill="none" stroke="white" stroke-width="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#waves)" />
        </svg>
      </div>
    );
  }

  if (p.overlayId === "pattern-noise") {
    return (
      <div class="h-full w-full relative" style={{ background: BG_COLOR }}>
        <div class="absolute inset-0 opacity-30" style={{
          "background-image": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }} />
      </div>
    );
  }

  return (
    <div class="h-full w-full flex items-center justify-center text-white/60 text-xs" style={{ background: BG_COLOR }}>
      img
    </div>
  );
}

export function OverlayPicker(p: OverlayPickerProps) {
  return (
    <div>
      <div class="ui-label">
        {t3({ en: "Background detail", fr: "Détail d'arrière-plan", pt: "Detalhe de fundo" })}
      </div>
      <div class="flex flex-wrap gap-3">
        <For each={OVERLAY_OPTIONS}>
          {(option) => (
            <PresetCard
              name={t3(option.name)}
              selected={(p.value ?? "none") === option.id}
              onClick={() => p.onChange(option.id)}
            >
              <OverlayThumbnail overlayId={option.id} />
            </PresetCard>
          )}
        </For>
      </div>
    </div>
  );
}
