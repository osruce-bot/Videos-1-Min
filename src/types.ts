export interface Ad {
  id: string;
  userId?: string;
  title: string;
  rawText: string;
  hook: string;
  scenes: string[];
  createdAt: number;
  speechPace: 'fast' | 'normal' | 'slow';
  theme: string;
  used?: boolean;
}

export type SpeechPace = 'fast' | 'normal' | 'slow';

export const THEME_CATEGORIES = [
  "Capacidad de Negociación y Cierre",
  "Costo de Oportunidad",
  "El Efecto- Vendedor Desesperado",
  "Estrategia de Marketing Deficiente",
  "Exposición Digital y Algoritmos",
  "Filtro de Seguridad y Riesgo Personal",
  "Gestión de Contratos y Trámites Notariales",
  "Interoperabilidad con Colegas",
  "Preparación del Inmueble",
  "Problemas Legales y Documentarios",
  "Selección y Calificación del Cliente",
  "Valuación Incorrecta"
] as const;

export type ThemeCategory = typeof THEME_CATEGORIES[number];

export const PACE_WORDS_PER_SECOND = {
  fast: 2.6,   // ~156 WPM (UGC dinámico / tik tok)
  normal: 2.2, // ~132 WPM (Explicativo estándar)
  slow: 1.8    // ~108 WPM (Pausado / Dramático)
};
