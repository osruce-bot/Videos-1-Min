import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Habilitar análisis de JSON en peticiones post
app.use(express.json());

// Endpoint de la API para generar/redactar guion con Gemini
app.post("/api/generate-script", async (req, res) => {
  try {
    const { idea, speechPace } = req.body;

    if (!idea || typeof idea !== "string" || !idea.trim()) {
      res.status(400).json({ error: "La idea base del anuncio es obligatoria." });
      return;
    }

    // Inicializar el cliente SDK de GoogleGenAI (vía server-side)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ 
        error: "Falta la variable de entorno GEMINI_API_KEY. Por favor configúrala para habilitar el redactor con IA." 
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const pacingInstructions = speechPace === "fast" 
      ? "ritmo rápido (aprox. 22-25 palabras por toma de 10 segundos)" 
      : speechPace === "slow" 
        ? "ritmo lento (aprox. 12-15 palabras por toma de 10 segundos)"
        : "ritmo explicativo normal (aprox. 17-20 palabras por toma de 10 segundos)";

    const promptText = `
A continuación tienes la idea inicial, boceto o borrador para un anuncio proporcionada por el usuario:
---
${idea}
---

Tu tarea como redactor experto de anuncios persuasivos (UGC & VSL de alto impacto) es redactar, expandir, pulir y estructurar detalladamente el guion de este anuncio basándote en la idea entregada.

REGLAS CRÍTICAS DE REDACCIÓN QUE DEBES CUMPLIR ESTRICTAMENTE:
1. El guion de anuncio debe estructurarse obligatoriamente en un único gancho inicial (Hook) y una lista ordenada de escenas consecutivas correspondientes a la trama del anuncio.
2. SÉ FLEXIBLE CON LA CANTIDAD DE ESCENAS: Analiza la idea entregada por el usuario y genera la cantidad óptima de escenas que sean necesarias para aprovecharla al máximo (puedes reducir, consolidar o crear más escenas según corresponda), vigilando que la duración de cada elemento sea perfecta.
3. CADA ELEMENTO DEL GUION (tanto el gancho como cada una de las escenas resultantes por separado) debe estar diseñado para durar UN MÁXIMO ESTRICTO DE 10 SEGUNDOS al leerse en voz alta. Adapta la longitud de palabras al siguiente ritmo seleccionado: ${pacingInstructions}.
4. EL GUION TOTAL COMPLETO (el Hook + todas las escenas combinadas) NO DEBE DURAR MÁS DE 1 MINUTO (60 SEGUNDOS) en total. Limita la cantidad de escenas (por ejemplo, entre 4 a 6 escenas como máximo) de modo que la sumatoria total del tiempo estimado de locución nunca exceda los 60 segundos.
5. NO INCLUYAS PREFIJOS DE ETIQUETA dentro del texto de los campos. Por ejemplo, NO incluyas textos como "Hook: ", "Gancho: ", "Escena 1: ", "Escena: ", "Parte 2: " o similares al inicio del texto. El texto de cada campo en el JSON debe ser directamente el diálogo o locución directo de voz en off.
6. NO DEBES INDICAR EL TIPO DE TOMA, MOVIMIENTOS DE CÁMARA, INDICACIONES TÉCNICAS NI INSTRUCCIONES VISUALES BAJO NINGÚN CONCEPTO.
   - Prohibido totalmente incluir textos como: "Primer plano", "Toma de...", "Movimiento de cámara", "Plano medio", "Toma aérea de...", "Tipo de toma", "Se ve a la persona...", "Video de...", "Visual:...", "Camara:...", "Fondo:...", "[Muestra...]", "(Muestra...)", etc.
   - El texto devuelto para cada elemento debe ser ÚNICAMENTE la voz en off, narración directa o el diálogo hablado exacto de lo que se dirá en ese segmento de la toma de 10 segundos.
7. CLASIFICACIÓN POR TEMA: Debes analizar a cuál de las siguientes 12 problemáticas inmobiliarias corresponde mejor el guion y retornarlo textualmente en el campo "theme":
   - Capacidad de Negociación y Cierre
   - Costo de Oportunidad
   - El Efecto- Vendedor Desesperado
   - Estrategia de Marketing Deficiente
   - Exposición Digital y Algoritmos
   - Filtro de Seguridad y Riesgo Personal
   - Gestión de Contratos y Trámites Notariales
   - Interoperabilidad con Colegas
   - Preparación del Inmueble
   - Problemas Legales y Documentarios
   - Selección y Calificación del Cliente
   - Valuación Incorrecta

Devuelve tu respuesta estructurada obligatoriamente en formato JSON utilizando exactamente el siguiente esquema:
`;

    // Solicitar el contenido con una estrategia de fallback robusta para evitar congestiones 503
    let response;
    const modelChain = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"];
    let lastError = null;

    for (const modelName of modelChain) {
      try {
        console.log(`Intentando generar guion con el modelo: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: promptText,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "Un título corto, atractivo y optimizado para la campaña"
                },
                hook: {
                  type: Type.STRING,
                  description: "El texto directo de voz en off para el gancho persuasivo inicial (máximo 10 segundos)"
                },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING
                  },
                  description: "Lista de diálogos o narraciones en off para cada escena secuencial (cada una de máximo 10 segundos, sin descripciones técnicas ni nombres de tomas visuales)"
                },
                theme: {
                  type: Type.STRING,
                  enum: [
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
                  ],
                  description: "El tema o problemática inmobiliaria del guion"
                }
              },
              required: ["title", "hook", "scenes", "theme"]
            }
          }
        });

        if (response && response.text) {
          console.log(`¡Éxito obtenido usando el modelo ${modelName}!`);
          break; // Salir del ciclo si se generó el texto exitosamente
        }
      } catch (err: any) {
        console.warn(`El modelo ${modelName} falló o está congestionado:`, err.message || err);
        lastError = err;
      }
    }

    if (!response || !response.text) {
      throw new Error(
        lastError?.message || 
        "No se pudo obtener una respuesta de los modelos de IA (todos están experimentando alta demanda actualmente)."
      );
    }

    const responseText = response.text;

    let cleanedText = responseText.trim();
    // Eliminar bloques de código markdown si la respuesta viene envuelta en ```json ... ```
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "");
    }

    const scriptData = JSON.parse(cleanedText.trim());
    res.json(scriptData);

  } catch (error: any) {
    console.error("Error al redactar guion con Gemini:", error);
    res.status(500).json({ 
      error: error.message || "Ocurrió un error inesperado al procesar la redacción del guion por IA." 
    });
  }
});

// Endpoint de la API para extraer el texto de un Link Web (landing page, blog, etc.)
app.post("/api/scrape-url", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      res.status(400).json({ error: "La URL proporcionada no es válida. Debe comenzar con http:// o https://" });
      return;
    }

    console.log(`Scraping URL: ${url}`);
    
    // Fetch con User-Agent realista para evadir bloqueos simples
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Limpieza de HTML rápida y ligera
    let text = html;
    
    // Eliminar contenido innecesario (head, javascript, estilos CSS, SVGs, iframes, etc.)
    text = text.replace(/<head>[\s\S]*?<\/head>/gi, "");
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");
    text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
    
    // Colocar saltos de línea para preservar párrafos de bloques principales
    text = text.replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|option)>/gi, "\n");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    
    // Eliminar todas las etiquetas HTML restantes
    text = text.replace(/<[^>]+>/g, " ");
    
    // Decodificar entidades HTML comunes
    text = text
      .replace(/&nbsp;/ig, " ")
      .replace(/&amp;/ig, "&")
      .replace(/&lt;/ig, "<")
      .replace(/&gt;/ig, ">")
      .replace(/&quot;/ig, '"')
      .replace(/&#39;/ig, "'")
      .replace(/&oacute;/ig, "ó")
      .replace(/&iacute;/ig, "í")
      .replace(/&aacute;/ig, "á")
      .replace(/&eacute;/ig, "é")
      .replace(/&uacute;/ig, "ú")
      .replace(/&ntilde;/ig, "ñ")
      .replace(/&Oacute;/ig, "Ó")
      .replace(/&Iacute;/ig, "Í")
      .replace(/&Aacute;/ig, "Á")
      .replace(/&Eacute;/ig, "É")
      .replace(/&Uacute;/ig, "Ú")
      .replace(/&Ntilde;/ig, "Ñ")
      .replace(/&uuml;/ig, "ü")
      .replace(/&Uuml;/ig, "Ü");

    // Formatear saltos de línea y remover renglones vacíos y espacios excesivos
    const lines = text.split("\n")
      .map(line => line.replace(/\s+/g, " ").trim())
      .filter(line => line.length > 5); // excluir líneas extremadamente cortas o vacías
      
    const cleanedText = lines.join("\n");
    
    // Reducir tamaño máximo para evitar enviar cantidades gigantescas de tokens a Gemini
    const truncatedText = cleanedText.length > 12000
      ? cleanedText.substring(0, 12000) + "\n\n[...Texto adicional omitido por longitud...]"
      : cleanedText;

    if (!truncatedText.trim()) {
      throw new Error("No se pudo extraer texto legible de la URL provista.");
    }

    res.json({ text: truncatedText });
  } catch (error: any) {
    console.error("Error al extraer contenido de URL:", error);
    res.status(500).json({ 
      error: error.message || "No se pudo extraer la información del link brindado. Verifica que sea público y permita peticiones HTTP." 
    });
  }
});

// Configuración de la carga de archivos estáticos y Vite middleware según el entorno
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev server mounted on Express.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static files for production mode.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully running on http://localhost:${PORT}`);
  });
}

startServer();
