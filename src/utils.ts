import { SpeechPace, PACE_WORDS_PER_SECOND } from './types';

/**
 * Cuenta la cantidad aproximada de palabras en un texto
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calcula la duración estimada en segundos según el ritmo de habla
 */
export function estimateDuration(text: string, pace: SpeechPace): number {
  const words = countWords(text);
  if (words === 0) return 0;
  
  const wps = PACE_WORDS_PER_SECOND[pace] || 2.2;
  const duration = words / wps;
  // Retornar redondeado a 1 decimal
  return Math.round(duration * 10) / 10;
}

/**
 * Detecta inteligentemente el Hook y las Escenas de un texto pegado.
 */
export function detectHookAndScenes(rawText: string): { hook: string; scenes: string[] } {
  const text = rawText.trim();
  if (!text) {
    return { hook: '', scenes: [] };
  }

  // 1. Intentar buscar marcadores explícitos comunes (Ej: Hook:, Gancho:, [Hook], [Gancho])
  // Buscamos cualquier línea que inicie con gancho, hook, introduccion, introducción, intro
  const lines = text.split('\n');
  
  // Analizaremos si tiene un formato estructurado con marcadores
  let detectedHook = '';
  const detectedScenes: string[] = [];

  // Patrones populares para identificar ganchos y escenas
  const hookRegex = /^(hook|gancho|introducci[oó]n|intro|inicio)\b/i;
  const sceneRegex = /^(escena|scene|secuencia|e\d+|v\d+|visual|audio|narrador|e\s*\d+|t\d+)\s*\d*[:.-]?/i;

  let currentBlockType: 'none' | 'hook' | 'scene' = 'none';
  let currentBlockText: string[] = [];

  // Función para guardar el bloque acumulado
  const saveCurrentBlock = () => {
    const blockContent = currentBlockText.join('\n').trim();
    if (blockContent) {
      if (currentBlockType === 'hook') {
        detectedHook = blockContent;
      } else if (currentBlockType === 'scene') {
        detectedScenes.push(blockContent);
      } else {
        // Si no se ha determinado el tipo e.g. al inicio
        if (!detectedHook) {
          detectedHook = blockContent;
        } else {
          detectedScenes.push(blockContent);
        }
      }
    }
    currentBlockText = [];
  };

  let hasExplicitTags = false;
  // Primer pasada: verificar si tiene etiquetas como "Escena 1" o "Hook" en cualquier línea
  for (const line of lines) {
    const trimmed = line.trim();
    if (hookRegex.test(trimmed) || sceneRegex.test(trimmed)) {
      hasExplicitTags = true;
      break;
    }
  }

  if (hasExplicitTags) {
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (hookRegex.test(trimmedLine)) {
        saveCurrentBlock();
        currentBlockType = 'hook';
        // Limpiamos el prefijo (por ejemplo, "Hook: " o "Gancho - ")
        const cleanContent = trimmedLine.replace(/^(hook|gancho|introducci[oó]n|intro|inicio)\s*[:.-]?\s*/i, '');
        if (cleanContent) currentBlockText.push(cleanContent);
      } else if (sceneRegex.test(trimmedLine)) {
        saveCurrentBlock();
        currentBlockType = 'scene';
        // Limpiamos el prefijo (por ejemplo, "Escena 1: ")
        const cleanContent = trimmedLine.replace(/^(escena|scene|secuencia|e\d+|v\d+|visual|audio|narrador|e\s*\d+|t\d+)\s*\d*[:.-]?\s*/i, '');
        if (cleanContent) currentBlockText.push(cleanContent);
      } else {
        // Es continuación del bloque actual
        currentBlockText.push(line);
      }
    }
    saveCurrentBlock();
  }

  // Si no se detectaron etiquetas explícitas o no resultaron en escenas
  if (detectedScenes.length === 0) {
    // Restaurar/limpiar
    detectedHook = '';
    const cleanScenes: string[] = [];

    // Dividimos por saltos de línea dobles que representan párrafos independientes
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean);

    if (paragraphs.length > 0) {
      // El primero siempre es el Hook
      detectedHook = paragraphs[0];
      // El resto son escenas independientes
      for (let i = 1; i < paragraphs.length; i++) {
        cleanScenes.push(paragraphs[i]);
      }
    }

    return {
      hook: detectedHook,
      scenes: cleanScenes
    };
  }

  return {
    hook: detectedHook || (detectedScenes.shift() || ''),
    scenes: detectedScenes
  };
}

/**
 * Detecta inteligentemente de cuál de los 12 temas inmobiliarios trata el anuncio
 */
export function detectTheme(title: string, rawText: string): string {
  const combined = `${title} ${rawText}`.toLowerCase();

  const themesWithKeywords: { theme: string; keywords: string[] }[] = [
    {
      theme: "Preparación del Inmueble",
      keywords: ["preparar", "preparación", "preparacion", "limpieza", "orden", "pintura", "limpiar", "arreglar", "mantenimiento", "foto", "fotografía", "decoración", "decorar", "home staging", "aspecto", "estética", "remodelar", "reparación", "inmueble", "vivienda", "casa", "luz", "iluminación", "pintar", "baño", "cocina"]
    },
    {
      theme: "Valuación Incorrecta",
      keywords: ["precio", "bajar", "subir", "descuento", "mercado", "avaluo", "avalúo", "tasar", "tasación", "tasacion", "valer", "valor", "valoración", "valuación", "caro", "barato", "renta", "costo", "estimación", "sobreprecio", "tasador", "m2", "metro cuadrado"]
    },
    {
      theme: "Problemas Legales y Documentarios",
      keywords: ["papel", "papeles", "título", "propiedad", "registro", "gravamen", "deuda", "herencia", "sucesión", "testamento", "hipoteca", "legal", "abogado", "copia literal", "sunarp", "registro público", "embargo", "documento", "documentarios", "servidumbre", "independizacion"]
    },
    {
      theme: "Gestión de Contratos y Trámites Notariales",
      keywords: ["notaría", "notaria", "notario", "contrato", "firma", "firmar", "minuta", "escritura", "público", "trámite", "tramite", "notarial", "arrendamiento", "compraventa", "promesa", "pago", "banco", "cheque", "cuota", "notarios"]
    },
    {
      theme: "Selección y Calificación del Cliente",
      keywords: ["calificar", "calificación", "calificacion", "filtrar", "comprador", "solvencia", "crédito", "credito", "hipotecario", "banco", "aprobado", "ingresos", "interesado", "perfil", "visitas", "turistas", "calificado", "solvente", "infocorp", "sentinel"]
    },
    {
      theme: "El Efecto- Vendedor Desesperado",
      keywords: ["urgencia", "desesperado", "vender rápido", "vender ya", "necesito", "remate", "bajar de precio", "ansiedad", "desesperación", "presión", "apurado", "oferta", "negociar", "desesperada", "apurada", "apuro", "ahogo"]
    },
    {
      theme: "Costo de Oportunidad",
      keywords: ["tiempo", "demora", "tardar", "meses", "años", "año", "dinero perdido", "oportunidad", "pérdida", "perder", "rentabilidad", "mientras tanto", "costo", "esperar", "espera", "costo de oportunidad", "parado", "vacío"]
    },
    {
      theme: "Filtro de Seguridad y Riesgo Personal",
      keywords: ["seguridad", "riesgo", "peligro", "robo", "delincuente", "desconocido", "visitar", "entrar", "seguro", "proteger", "identidad", "estafa", "riesgo personal", "amenaza", "ladrón", "extorsión", "seguridad personal"]
    },
    {
      theme: "Interoperabilidad con Colegas",
      keywords: ["colega", "agente", "comision", "comisión", "compartir", "corredor", "inmobiliaria", "alianza", "red", "cooperar", "asociar", "asociación", "unión", "bolsa", "colegio", "remax", "century", "mls"]
    },
    {
      theme: "Exposición Digital y Algoritmos",
      keywords: ["digital", "algoritmo", "portal", "redes", "sociales", "facebook", "instagram", "tiktok", "publicidad", "ads", "clics", "vistas", "alcance", "exposición", "internet", "anuncio web", "posicionamiento", "algorítmico"]
    },
    {
      theme: "Capacidad de Negociación y Cierre",
      keywords: ["negociar", "negociación", "cierre", "cerrar", "oferta", "objeción", "objeciones", "regatear", "contraoferta", "aceptar", "trato", "acuerdo", "comprador", "comprar", "venta"]
    },
    {
      theme: "Estrategia de Marketing Deficiente",
      keywords: ["marketing", "publicar", "lanzar", "estrategia", "deficiente", "letrero", "cartel", "folleto", "foto fea", "sin plan", "plataforma", "campaña", "difusión", "anuncio", "volantes", "banner", "publicitario"]
    }
  ];

  let bestTheme = "Estrategia de Marketing Deficiente"; // Fallback por defecto
  let maxMatches = 0;

  for (const item of themesWithKeywords) {
    let matches = 0;
    for (const keyword of item.keywords) {
      if (combined.includes(keyword)) {
        matches++;
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestTheme = item.theme;
    }
  }

  return bestTheme;
}
