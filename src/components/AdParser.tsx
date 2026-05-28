import { useState, useEffect } from 'react';
import { Ad, SpeechPace, PACE_WORDS_PER_SECOND, THEME_CATEGORIES } from '../types';
import { countWords, estimateDuration, detectHookAndScenes, detectTheme } from '../utils';
import { 
  Plus, Trash2, Scissors, Save, AlertTriangle, Sparkles, 
  HelpCircle, Volume2, Check, RotateCcw, Copy, FolderOpen,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdParserProps {
  selectedAd: Ad | null;
  onSaveAd: (ad: Omit<Ad, 'id' | 'createdAt'> & { id?: string }) => void;
  onClearSelection: () => void;
  ads?: Ad[];
}

export default function AdParser({ selectedAd, onSaveAd, onClearSelection, ads = [] }: AdParserProps) {
  // Estados para el anuncio actual
  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [hook, setHook] = useState('');
  const [scenes, setScenes] = useState<string[]>([]);
  const [speechPace, setSpeechPace] = useState<SpeechPace>('normal');
  const [theme, setTheme] = useState<string>('Estrategia de Marketing Deficiente');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Estados para la integración con IA
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Estados para la integración con URL Web
  const [webUrl, setWebUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState(false);

  // Estado para registrar individualmente qué partes (hook o escena) ya fueron copiadas/usadas
  const [copiedParts, setCopiedParts] = useState<Record<string, boolean>>({});

  // Función auxiliar robusta para copiar al portapapeles (incluso dentro de iFrames cruzados o restringidos)
  const copyToClipboardRobust = (text: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
          .then(() => resolve(true))
          .catch((err) => {
            console.warn("navigator.clipboard falló, reintentando con fallback de textarea...", err);
            resolve(fallbackCopyToClipboard(text));
          });
      } else {
        resolve(fallbackCopyToClipboard(text));
      }
    });
  };

  const fallbackCopyToClipboard = (text: string): boolean => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      // Posicionar fuera de la pantalla
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.width = "2em";
      textArea.style.height = "2em";
      textArea.style.padding = "0";
      textArea.style.border = "none";
      textArea.style.outline = "none";
      textArea.style.boxShadow = "none";
      textArea.style.background = "transparent";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error("El fallback de copia al portapapeles falló de forma crítica:", err);
      return false;
    }
  };

  // Copiar parte individual al portapapeles y marcarla como copiada automáticamente
  const handleCopyPart = (key: string, text: string) => {
    if (!text.trim()) return;
    copyToClipboardRobust(text).then(() => {
      // Siempre marcamos como copiado para brindar el feedback visual amado por el usuario
      setCopiedParts((prev) => ({ ...prev, [key]: true }));
    });
  };

  // Alternar manualmente la marca de una escena (sin copiar necesariamente)
  const handleToggleMarkPart = (key: string) => {
    setCopiedParts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Función para redactar guion con IA a través de Gemini en el backend
  const handleAiRedact = async () => {
    if (!rawText.trim()) {
      setGenerationError("Por favor, ingresa una idea base completa en el cuadro de texto para que la IA la redacte.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idea: rawText,
          speechPace,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Ocurrió un error al intentar redactar por IA.");
      }

      const data = await response.json();

      if (!data.hook || !Array.isArray(data.scenes)) {
        throw new Error("El formato devuelto por la IA no tiene el esquema de escenas esperado.");
      }

      // Actualizar los estados del editor
      setTitle(data.title || "Guion Redactado por IA");
      setHook(data.hook);
      setScenes(data.scenes);
      if (data.theme) {
        setTheme(data.theme);
      } else {
        setTheme(detectTheme(data.title || '', data.hook + " " + data.scenes.join(" ")));
      }
      setCopiedParts({}); // Resetear partes al generar nueva IA

      // Sincronizar el campo de texto completo con la estructura generada
      const syncText = `Hook: ${data.hook}\n\n` + data.scenes.map((s: string, idx: number) => `Escena ${idx + 1}: ${s}`).join("\n");
      setRawText(syncText);

    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "No se pudo conectar con el servicio de IA. Verifica tu API Key.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Función para extraer información relevante desde un link web y cargarla como contexto borrador
  const handleScrapeUrl = async () => {
    if (!webUrl.trim() || !webUrl.startsWith('http')) {
      setScrapeError("Por favor, ingresa una URL válida que comience con http:// o https://");
      return;
    }

    setIsScraping(true);
    setScrapeError(null);
    setScrapeSuccess(false);

    try {
      const response = await fetch("/api/scrape-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: webUrl.trim(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Ocurrió un error al extraer el contenido del link.");
      }

      const data = await response.json();

      if (!data.text || !data.text.trim()) {
        throw new Error("No se pudo extraer ningún texto legible e inteligible de ese enlace.");
      }

      setRawText(data.text);
      handleAutoDetect(data.text);
      setScrapeSuccess(true);
      
      // Intentar computar un título amigable a partir del nombre del dominio
      try {
        const parsedUrl = new URL(webUrl.trim());
        let computedTitle = parsedUrl.hostname.replace("www.", "");
        const lastPart = parsedUrl.pathname.split("/").filter(Boolean).pop();
        if (lastPart) {
          computedTitle += " - " + decodeURIComponent(lastPart).replace(/[-_]+/g, " ");
        }
        setTitle(`Guion desde ${computedTitle}`);
      } catch {
        setTitle("Guion importado desde Link");
      }
      
      setTimeout(() => setScrapeSuccess(false), 5000);
    } catch (err: any) {
      console.error(err);
      setScrapeError(err.message || "Error al intentar extraer la información.");
    } finally {
      setIsScraping(false);
    }
  };

  // Cargar anuncio seleccionado de la biblioteca
  useEffect(() => {
    if (selectedAd) {
      setTitle(selectedAd.title);
      setRawText(selectedAd.rawText);
      setHook(selectedAd.hook);
      setScenes(selectedAd.scenes);
      setSpeechPace(selectedAd.speechPace);
      setTheme(selectedAd.theme || detectTheme(selectedAd.title, selectedAd.rawText) || 'Estrategia de Marketing Deficiente');
    } else {
      // Limpiar para crear nuevo anuncio
      setTitle('');
      setRawText('');
      setHook('');
      setScenes([]);
      setSpeechPace('normal');
      setTheme('Estrategia de Marketing Deficiente');
    }
    setCopiedParts({}); // Resetear marcas de copia al cambiar de anuncio
  }, [selectedAd]);

  // Ejecutar el detector automático sobre el texto pegado
  const handleAutoDetect = (text: string) => {
    setRawText(text);
    const result = detectHookAndScenes(text);
    setHook(result.hook);
    setScenes(result.scenes);
    
    // Auto-detectar la temática también al vuelo en base a la idea
    const detected = detectTheme(title, text);
    setTheme(detected);
  };

  // Pegar un ejemplo preestablecido para guiar al usuario
  const loadExampleScript = () => {
    const example = `Hook: ¿Quieres duplicar las ventas de tu negocio este mes sin gastar de más? Quédate porque te revelo el secreto en 10 segundos.

Escena 1: Muestra tu pantalla con reportes de ventas subiendo de forma exponencial con un fondo verde.
Escena 2: Muestra el producto premium siendo empacado con mucho cuidado y cariño por un experto de soporte.
Escena 3: Captura de pantalla con las opiniones de clientes reales calificando el producto con un puntaje de 5 estrellas.
Escena 4: Añade un llamado a la acción directo como "Haz clic en el enlace de abajo para conseguir el tuyo hoy mismo con envío gratis".`;
    
    setTitle('Guion UGC de Ejemplo');
    handleAutoDetect(example);
  };

  // Modificar el Hook directamente
  const handleHookChange = (val: string) => {
    setHook(val);
  };

  // Modificar una escena específica
  const handleSceneChange = (index: number, val: string) => {
    const updated = [...scenes];
    updated[index] = val;
    setScenes(updated);
  };

  // Añadir escena vacía abajo
  const handleAddScene = (index: number) => {
    const updated = [...scenes];
    updated.splice(index + 1, 0, '');
    setScenes(updated);
  };

  // Eliminar una escena
  const handleDeleteScene = (index: number) => {
    const updated = scenes.filter((_, idx) => idx !== index);
    setScenes(updated);
  };

  // Dividir escena por el centro o signos de puntuación de forma inteligente
  const handleSplitScene = (index: number) => {
    const text = scenes[index];
    if (!text.trim()) return;

    // Intentar dividir por signos de puntuación (. ! ?) para no cortar a mitad de frase
    const sentences = text.split(/([.!?]+)/).filter(Boolean);
    
    if (sentences.length >= 2) {
      // Re-agrupar signos de puntuación con su respectiva frase anterior
      const grouped: string[] = [];
      for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i] || '';
        const punctuation = sentences[i + 1] || '';
        grouped.push((sentence + punctuation).trim());
      }

      if (grouped.length >= 2) {
        const midPoint = Math.ceil(grouped.length / 2);
        const firstPart = grouped.slice(0, midPoint).join(' ');
        const secondPart = grouped.slice(midPoint).join(' ');
        
        const updated = [...scenes];
        updated[index] = firstPart;
        updated.splice(index + 1, 0, secondPart);
        setScenes(updated);
        return;
      }
    }

    // fallback si no tiene oraciones claras: dividir por palabras
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 3) {
      const half = Math.ceil(words.length / 2);
      const firstPart = words.slice(0, half).join(' ');
      const secondPart = words.slice(half).join(' ');

      const updated = [...scenes];
      updated[index] = firstPart;
      updated.splice(index + 1, 0, secondPart);
      setScenes(updated);
    }
  };

  // Guardar el anuncio actual
  const handleSave = () => {
    const finalTitle = title.trim() || `Anuncio - ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    onSaveAd({
      id: selectedAd?.id, 
      title: finalTitle,
      rawText,
      hook,
      scenes,
      speechPace,
      theme
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Copiar el script completo estructurado en formato texto al portapapeles
  const handleCopyFullScript = () => {
    let fullScript = `TÍTULO: ${title || 'Sin Título'}\n\n`;
    fullScript += `🪝 GANCHO (HOOK):\n${hook}\n\n`;
    scenes.forEach((scene, idx) => {
      fullScript += `🎬 ESCENA ${idx + 1}:\n${scene}\n\n`;
    });
    
    copyToClipboardRobust(fullScript).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);
    });
  };

  const hookDuration = estimateDuration(hook, speechPace);
  const totalScenesCount = scenes.length;
  const accumulatedDuration = hookDuration + scenes.reduce((acc, s) => acc + estimateDuration(s, speechPace), 0);

  return (
    <div className="space-y-6">
      
      {/* Panel Superior: Entrada de Guion */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-sm font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Entrada Inteligente de Guiones
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Pega tu texto libremente. Separaremos instantáneamente el gancho primario y sus respectivas escenas.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2.5 self-start sm:self-auto items-center">
            {/* Botón de Registrar / Guardar en Biblioteca */}
            <button
              id="btn-save-ad-db-top"
              onClick={handleSave}
              disabled={!rawText.trim() && !hook.trim() && scenes.length === 0}
              className={`px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                (!rawText.trim() && !hook.trim() && scenes.length === 0)
                  ? "bg-slate-50 text-slate-350 border-slate-200/40 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer hover:shadow-indigo-600/10 border-indigo-750 hover:shadow-md active:scale-95"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              {selectedAd ? 'Guardar Cambios' : 'Registrar en Biblioteca'}
            </button>

            {saveSuccess && (
              <span className="text-emerald-700 font-bold text-[11px] animate-pulse flex items-center gap-1 bg-emerald-50 px-2.5 py-1.5 rounded-md border border-emerald-100">
                <Check className="w-3.5 h-3.5" /> ¡Sincronizado!
              </span>
            )}

            {selectedAd && (
              <button
                id="btn-cancel-edit-top"
                onClick={onClearSelection}
                className="px-3.5 py-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-650 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                Cancelar Edición
              </button>
            )}

            {(rawText || hook || scenes.length > 0 || webUrl) && (
              <button
                id="btn-reset-script"
                onClick={() => {
                  onClearSelection();
                  setTitle('');
                  setRawText('');
                  setHook('');
                  setScenes([]);
                  setTheme('Estrategia de Marketing Deficiente');
                  setWebUrl('');
                  setScrapeError(null);
                  setScrapeSuccess(false);
                }}
                className="px-3.5 py-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-550 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpiar Todo
              </button>
            )}
          </div>
        </div>

        {/* Formulario de Título y Configurador de locución */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div>
            <label htmlFor="ad-title" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Título del Anuncio
            </label>
            <input
              id="ad-title"
              type="text"
              placeholder="Ej: Análisis de Sobreprecio..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-205 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 rounded-lg text-xs focus:outline-none transition-all font-semibold text-slate-800"
            />
          </div>
          <div>
            <label htmlFor="ad-theme-select" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
              Temática del Anuncio
            </label>
            <select
              id="ad-theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-205 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 rounded-lg text-xs focus:outline-none transition-all font-semibold text-slate-700 cursor-pointer"
            >
              {THEME_CATEGORIES.map(cat => {
                const isCatUsed = ads.some(ad => ad.theme === cat && ad.used && ad.id !== selectedAd?.id);
                return (
                  <option key={cat} value={cat}>
                    {cat} {isCatUsed ? '⚠️ (Utilizado)' : ''}
                  </option>
                );
              })}
            </select>
            {ads.some(ad => ad.theme === theme && ad.used && ad.id !== selectedAd?.id) && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 font-bold flex items-start gap-1.5 animate-fade-in leading-relaxed">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                <span>
                  <strong>¡Duplicado Detectado!</strong> Ya existe un guion con esta temática clasificado como <strong className="text-amber-900 underline">Utilizado</strong> en tu biblioteca. Considera redactar sobre otra temática para evitar contenidos repetidos.
                </span>
              </div>
            )}
          </div>
          <div>
            <label htmlFor="speech-pace-select" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5" />
              Ritmo de Locución
            </label>
            <select
              id="speech-pace-select"
              value={speechPace}
              onChange={(e) => setSpeechPace(e.target.value as SpeechPace)}
              className="w-full px-3 py-2.5 bg-slate-50/50 border border-slate-205 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 rounded-lg text-xs focus:outline-none transition-all font-semibold text-slate-700 cursor-pointer"
            >
              <option value="fast">Rápido (TikTok / Alta Energía)</option>
              <option value="normal">Por Defecto (Explicativo UGC)</option>
              <option value="slow">Pausado (Dramático / VSL)</option>
            </select>
          </div>
        </div>

        {/* Entrada de URL de página web para extraer contexto */}
        <div className="mb-4 bg-slate-50 border border-slate-200/80 rounded-xl p-4.5 space-y-3 shadow-inner/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <label htmlFor="ad-web-url" className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-indigo-500 animate-[spin_8s_linear_infinite]" />
              Extraer Información desde un Link Web
            </label>
            <span className="text-[10px] text-slate-400 font-medium font-sans">Extrae texto relevante como base de nuestro guion</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                id="ad-web-url"
                type="text"
                placeholder="Pega aquí el enlace de la landing page, producto o artículo (ej: https://ejemplo.com/landing)"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-205 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 rounded-lg text-xs focus:outline-none transition-all font-semibold text-slate-700 shadow-sm"
              />
              {webUrl && (
                <button
                  type="button"
                  onClick={() => setWebUrl('')}
                  className="absolute right-3.5 top-2.5 text-xs text-slate-400 hover:text-slate-650 font-bold transition-colors cursor-pointer"
                  title="Limpiar"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              id="btn-import-url"
              type="button"
              onClick={handleScrapeUrl}
              disabled={isScraping || !webUrl.trim()}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 shrink-0 shadow-sm leading-none cursor-pointer ${
                isScraping
                  ? "bg-slate-55 text-slate-400 border-slate-100 cursor-not-allowed"
                  : !webUrl.trim()
                  ? "bg-slate-100 text-slate-400 border-slate-200/60 hover:bg-slate-50/50"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 hover:shadow-md hover:shadow-indigo-600/10 active:scale-95"
              }`}
            >
              {isScraping ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>Traer Información</span>
                </>
              )}
            </button>
          </div>
          {scrapeError && (
            <p className="text-[10.5px] text-rose-600 font-bold bg-rose-50 border border-rose-100/60 p-2 rounded-lg">{scrapeError}</p>
          )}
          {scrapeSuccess && (
            <p className="text-[10.5px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 p-2 rounded-lg">✓ ¡Enlace procesado con éxito! Hemos extraído y cargado la información fundamental abajo. Puedes ver el borrador o presionar el botón "Escribir Guion Completo" para optimizarlo mediante la IA.</p>
          )}
        </div>

        {/* Textarea de Pegado Principal */}
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="ad-raw-textarea" className="block text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              Idea base, borrador u boceto del anuncio
            </label>
            <span className="text-[10px] text-slate-400 italic font-medium">Auto-separa por párrafos, o redacta por IA</span>
          </div>
          <textarea
            id="ad-raw-textarea"
            placeholder="Escribe o pega aquí la idea del Gancho (Hook) y de las escenas correspondientes...&#15;&#10;Ej: Vendemos un sérum orgánico antiarrugas. Gancho: que compare el precio de clínicas vs natural. Escena 1: mostrar textura suave. Escena 2: aplicación rápida de 10 segundos. Escena 3: garantía de devolución e invitación a comprar."
            value={rawText}
            onChange={(e) => handleAutoDetect(e.target.value)}
            className="w-full h-40 p-5 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/80 text-sm leading-relaxed text-slate-705 resize-y placeholder:text-slate-400"
          />
          {rawText && (
            <div className="absolute right-3.5 bottom-3 text-[10px] font-mono text-slate-400 pointer-events-none bg-slate-100 border border-slate-200/50 px-2 py-0.5 rounded">
              {rawText.length} caracteres
            </div>
          )}
        </div>

        {/* Botón de Redacción por IA */}
        <div className="mt-4">
          <button
            id="btn-ai-redact"
            onClick={handleAiRedact}
            disabled={isGenerating || !rawText.trim()}
            className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border shadow-sm ${
              isGenerating
                ? "bg-indigo-50 text-indigo-400 cursor-not-allowed border-indigo-100/80"
                : !rawText.trim()
                ? "bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200/40"
                : "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer hover:shadow-indigo-600/10 border-indigo-700 hover:shadow-md hover:scale-[1.005] active:scale-[0.995]"
            }`}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 h-3.5 w-3.5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="font-semibold text-indigo-700 animate-pulse">Redactando y optimizando guion sin tomas visuales... (máx 10s)</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                <span>Escribir Guion Completo con IA (Optimizando 10 Segundos, Sin Directrices Técnicas de Toma)</span>
              </>
            )}
          </button>

          {generationError && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-100/80 rounded-lg text-xs text-rose-700 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Error de Redacción:</span> {generationError}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resultados y Desglose Modular */}
      {(hook || scenes.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Lado Izquierdo: Desglose del Gancho y Escenas */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Estructura Detallada Detectada
              </h3>
              <div className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded">
                Límite Promedio Recomendado: 10 Segundos
              </div>
            </div>

            {/* SECCIÓN DEL GANCHO (HOOK) */}
            <div className={`rounded-xl border p-5 space-y-3 shadow-sm relative transition-all duration-300 ${
              copiedParts["hook"]
                ? 'border-emerald-300 bg-emerald-50/25 ring-2 ring-emerald-500/10'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`flex items-center justify-center w-7 h-7 rounded-md font-bold text-xs shadow-sm ${
                    copiedParts["hook"]
                      ? 'bg-emerald-500 text-white shadow-emerald-500/15'
                      : 'bg-amber-500 text-white shadow-amber-500/10'
                  }`}>
                    🪝
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-850 text-xs uppercase tracking-wider">Gancho Primario (Hook)</h4>
                      {copiedParts["hook"] && (
                        <span className="inline-flex items-center text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-sans uppercase animate-fade-in">
                          ✓ Copiado & Listo
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">Atrapa la atención en los primeros segundos</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-slate-405 font-mono">
                    {countWords(hook)} palabras
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                    hookDuration > 10 
                      ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                      : 'bg-green-50 text-green-600 border border-green-100'
                  }`}>
                    {hookDuration}s {hookDuration > 10 ? '🚨 Exceso' : '✓ OK'}
                  </span>
                </div>
              </div>

              <textarea
                id="hook-textarea"
                value={hook}
                onChange={(e) => handleHookChange(e.target.value)}
                placeholder="Escribe el texto del gancho aquí..."
                className={`w-full px-3 py-2.5 rounded-lg text-xs focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-400 transition-all text-slate-705 leading-relaxed font-sans focus:outline-none border ${
                  copiedParts["hook"] ? 'bg-white/90 border-emerald-250/80' : 'bg-slate-50/50 border-slate-200'
                }`}
                rows={2}
              />

              {/* Controles de Copia y Marcado Individual para el Hook */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100/80">
                <span className="text-[9px] font-mono text-slate-400">Canal: Voz en Off (UGC)</span>
                
                <div className="flex items-center gap-2">
                  <button
                    id="btn-mark-hook-toggle"
                    type="button"
                    onClick={() => handleToggleMarkPart("hook")}
                    className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                      copiedParts["hook"]
                        ? 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {copiedParts["hook"] ? "Desmarcar" : "Marcar copiado"}
                  </button>

                  <button
                    id="btn-copy-hook-individual"
                    type="button"
                    onClick={() => handleCopyPart("hook", hook)}
                    className={`px-3 py-1 text-[10.5px] font-extrabold rounded-lg flex items-center gap-1 transition-all shadow-sm cursor-pointer border ${
                      copiedParts["hook"]
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-indigo-600 text-white border-indigo-705 hover:bg-indigo-700 hover:shadow-indigo-500/5'
                    }`}
                  >
                    {copiedParts["hook"] ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>¡Hook Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Hook</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Advertencia interactiva del límite de 10s en el Hook */}
              {hookDuration > 10 && (
                <div className="flex items-start gap-2 text-[11px] bg-rose-500/[0.03] border border-rose-500/15 rounded-lg p-3 text-rose-700">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">El gancho supera los 10 segundos recomendados ({hookDuration}s).</span> Intenta recortar unas <span className="underline font-bold">{Math.ceil((hookDuration - 10) * PACE_WORDS_PER_SECOND[speechPace])} palabras</span> para mantener un alto volumen de retención visual.
                  </div>
                </div>
              )}
            </div>

            {/* LISTA COMPLETA DE ESCENAS */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between px-1">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Escenas Secuenciales del Guion
                </div>
                <button
                  id="btn-add-scene-top"
                  onClick={() => handleAddScene(-1)}
                  className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir al inicio
                </button>
              </div>

              <AnimatePresence initial={false}>
                {scenes.map((scene, index) => {
                  const duration = estimateDuration(scene, speechPace);
                  const isLong = duration > 10;
                  const isCopied = !!copiedParts[`scene-${index}`];

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className={`rounded-xl border shadow-sm p-4 space-y-3 relative group transition-all duration-300 ${
                        isCopied
                          ? 'border-emerald-300 bg-emerald-50/25 ring-2 ring-emerald-500/10'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      {/* Cabecera de escena */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center justify-center w-6 h-6 rounded font-bold text-xs border ${
                            isCopied
                              ? 'bg-emerald-550 border-emerald-300 text-white'
                              : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>
                            {index + 1}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">Escena {index + 1}</span>
                            {isCopied && (
                              <span className="inline-flex items-center text-[8.5px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-sans uppercase animate-fade-in">
                                ✓ Copiada
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Tiempos de escena */}
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-[10px] text-slate-400 font-sans">
                            {countWords(scene)} palabras
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            isLong 
                              ? 'bg-rose-50 text-rose-500 border border-rose-100' 
                              : 'bg-slate-100 text-slate-600 border border-slate-150'
                          }`}>
                            {duration}s {isLong ? '⚠️ Demasiado largo (>10s)' : '✓'}
                          </span>
                        </div>
                      </div>

                      {/* Textarea */}
                      <textarea
                        id={`scene-textarea-${index}`}
                        value={scene}
                        onChange={(e) => handleSceneChange(index, e.target.value)}
                        placeholder={`Describe lo que ocurre en la escena ${index + 1}...`}
                        className={`w-full px-3 py-2 border rounded-lg text-xs focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-400 transition-all text-slate-705 leading-relaxed font-sans focus:outline-none ${
                          isCopied ? 'bg-white/95 border-emerald-250' : 'bg-slate-50/50 border-slate-200'
                        }`}
                        rows={2}
                      />

                      {/* Alerta de exceso de palabras */}
                      {isLong && (
                        <div className="flex items-start gap-2 text-[11px] bg-rose-500/[0.03] border border-rose-500/10 rounded-lg p-2.5 text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Supera los 10 segundos ({duration}s)</span>. Idealmente recorta unas <span className="font-bold underline">{Math.ceil((duration - 10) * PACE_WORDS_PER_SECOND[speechPace])} palabras</span> o presiona <span className="font-bold text-indigo-600">"Dividir Escena"</span> para formar dos tomas.
                          </div>
                        </div>
                      )}

                      {/* Botonera interna */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100/90 gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {scene.trim().length > 10 && (
                            <button
                              id={`btn-split-scene-${index}`}
                              onClick={() => handleSplitScene(index)}
                              className="px-2 py-1 text-[10.5px] font-bold text-indigo-650 hover:bg-indigo-50/60 rounded flex items-center gap-1 transition-colors cursor-pointer"
                              title="Dividir en 2 de forma automática por puntos o mitad de texto"
                            >
                              <Scissors className="w-3 h-3" /> Dividir Escena
                            </button>
                          )}
                          <button
                            id={`btn-add-scene-${index}`}
                            onClick={() => handleAddScene(index)}
                            className="px-2 py-1 text-[10.5px] font-bold text-slate-500 hover:bg-slate-100 rounded flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Insertar Escena
                          </button>
                        </div>

                        {/* Controles de Copia Directa e Individual de Escena */}
                        <div className="flex items-center gap-2">
                          <button
                            id={`btn-mark-scene-toggle-${index}`}
                            type="button"
                            onClick={() => handleToggleMarkPart(`scene-${index}`)}
                            className={`px-2 py-1 text-[9.5px] font-bold rounded border transition-colors cursor-pointer ${
                              isCopied
                                ? 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                                : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white hover:bg-slate-50'
                            }`}
                          >
                            {isCopied ? "Desmarcar" : "Marcar copiado"}
                          </button>

                          <button
                            id={`btn-copy-scene-${index}`}
                            type="button"
                            onClick={() => handleCopyPart(`scene-${index}`, scene)}
                            className={`px-3 py-1 text-[10.5px] font-bold rounded-lg flex items-center gap-1 transition-all shadow-sm cursor-pointer border ${
                              isCopied
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-100'
                                : 'bg-slate-700 text-white border-slate-750 hover:bg-slate-800'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600 animate-pulse" />
                                <span>¡Copiada!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar Escena</span>
                              </>
                            )}
                          </button>

                          <button
                            id={`btn-delete-scene-${index}`}
                            onClick={() => handleDeleteScene(index)}
                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50/50 rounded transition-colors cursor-pointer"
                            title="Eliminar escena"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Agregar al Final */}
            <div className="flex justify-center pt-2">
              <button
                id="btn-add-scene-bottom"
                onClick={() => handleAddScene(scenes.length - 1)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-2 border border-slate-200 transition-all cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4 text-slate-400" />
                Añadir Escena al Final de la Lista
              </button>
            </div>
          </div>

          {/* Lado Derecho: Análisis Consolidado y Guardado */}
          <div className="space-y-6">
            
            {/* 1. Caja de Métricas "Clean Minimalism" */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                Estadísticas del Análisis
              </h3>
              
              <div className="grid grid-cols-2 gap-3 mb-1">
                <div className="bg-slate-50/60 p-4 rounded-lg border border-slate-100 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Escenas Totales</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">{totalScenesCount}</p>
                </div>
                <div className="bg-slate-50/60 p-4 rounded-lg border border-slate-100 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Duración Total</p>
                  <p className="text-3xl font-black text-indigo-600 mt-1">
                    {Math.round(accumulatedDuration * 10) / 10}s
                  </p>
                </div>
              </div>

              {/* Barra de progreso de estandarización */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Tiempo estimado:</span>
                  <span className={`font-bold ${accumulatedDuration > 60 ? 'text-rose-600' : 'text-slate-700'}`}>
                    {Math.round(accumulatedDuration)} seg (máx 60s total)
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      scenes.some(s => estimateDuration(s, speechPace) > 10) || accumulatedDuration > 60 ? 'bg-rose-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${Math.min(100, (accumulatedDuration / 60) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  * Basado en el límite estricto de {speechPace === 'fast' ? 'ritmo rápido' : speechPace === 'normal' ? 'ritmo normal' : 'ritmo lento'} de lectura.
                </p>
              </div>

              {/* Alerta si el guion total supera los 60 segundos */}
              {accumulatedDuration > 60 && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-[11px] text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <span className="font-bold">¡Guion largo! Supera el límite de 1 minuto ({Math.round(accumulatedDuration)}s).</span> Intenta recortar palabras o remover alguna escena para no perder retención.
                  </div>
                </div>
              )}

              {/* Cumplimiento general de 10s */}
              <div className="pt-3 border-t border-slate-100 text-[11px] space-y-1.5 text-slate-600">
                <div className="font-bold text-slate-700 tracking-wider text-[10px] uppercase mb-1">Chequeo de Tiempo (10s):</div>
                <div className="flex items-center justify-between">
                  <span>Gancho principal</span>
                  <span className={hookDuration > 10 ? 'text-rose-600 font-bold' : 'text-green-600 font-bold'}>
                    {hookDuration}s {hookDuration > 10 ? '🚨 Exceso' : '✓ OK'}
                  </span>
                </div>
                {scenes.map((s, idx) => {
                  const sDur = estimateDuration(s, speechPace);
                  return (
                    <div key={idx} className="flex items-center justify-between">
                      <span>Escena {idx + 1}</span>
                      <span className={sDur > 10 ? 'text-rose-600 font-bold' : 'text-green-600 font-bold'}>
                        {sDur}s {sDur > 10 ? '🚨 Exceso' : '✓ OK'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Copiar Portapapeles */}
              <button
                id="btn-copy-unf"
                onClick={handleCopyFullScript}
                className="w-full mt-2 py-2 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm bg-white"
              >
                {copiedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-500 animate-bounce" /> ¡Guion Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-400" /> Copiar Guion Estructurado
                  </>
                )}
              </button>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
