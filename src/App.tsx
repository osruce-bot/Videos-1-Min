import { useState, useEffect, ChangeEvent } from 'react';
import { Ad } from './types';
import AdParser from './components/AdParser';
import AdLibrary from './components/AdLibrary';
import { useFirebase } from './context/FirebaseContext';
import { Film, CheckCircle2, Database, FileText, Cloud, RefreshCw, LogIn, LogOut } from 'lucide-react';

export default function App() {
  const {
    user,
    loading: cloudLoading,
    ads: cloudAds,
    isCloudSyncActive,
    signInWithGoogle,
    logout,
    saveAd,
    deleteAd,
    syncLocalToCloud,
  } = useFirebase();

  const [localAds, setLocalAds] = useState<Ad[]>([]);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [showFaq, setShowFaq] = useState(true);
  const [importedStatus, setImportedStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'library'>('editor');
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Inicializar cargando desde localStorage para uso offline
  useEffect(() => {
    try {
      const stored = localStorage.getItem('adscene_detector_ads');
      if (stored) {
        setLocalAds(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error al cargar datos desde LocalStorage', e);
    }
  }, []);

  // Mostrar opción de sincronización si el usuario inicia sesión y tiene anuncios guardados localmente
  useEffect(() => {
    if (user && localAds.length > 0) {
      setShowSyncBanner(true);
    } else {
      setShowSyncBanner(false);
    }
  }, [user, localAds]);

  // Selección de base de datos activa
  const ads = user ? cloudAds : localAds;

  // Generación de ID compatible y seguro
  const generateId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'ad_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
  };

  // Acción para sincronizar anuncios locales a la nube
  const handleSincronizarLocales = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await syncLocalToCloud(localAds);
      // Tras cargar, limpiar memoria local de forma segura
      setLocalAds([]);
      localStorage.removeItem('adscene_detector_ads');
      setShowSyncBanner(false);
      setImportedStatus(`¡Éxito! Se han migrado tus ${localAds.length} anuncios locales a la Base de Datos en la nube.`);
      setTimeout(() => setImportedStatus(null), 5000);
    } catch (error) {
      console.error(error);
      alert('Error al migrar los guiones del navegador a Firestore.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Guardar o Actualizar un Anuncio
  const handleSaveAd = async (adData: Omit<Ad, 'id' | 'createdAt'> & { id?: string }) => {
    if (user) {
      try {
        await saveAd(adData);
        setSelectedAd(null);
      } catch (err) {
        console.error('Error al guardar en la nube:', err);
        alert('Mala conexión o error de permisos de base de datos.');
      }
    } else {
      let updated: Ad[];
      if (adData.id) {
        // Actualización de registro existente
        updated = localAds.map(ad => 
          ad.id === adData.id 
            ? { ...ad, ...adData, createdAt: Date.now() } as Ad
            : ad
        );
      } else {
        // Creación de registro nuevo
        const newAd: Ad = {
          id: generateId(),
          title: adData.title,
          rawText: adData.rawText,
          hook: adData.hook,
          scenes: adData.scenes,
          speechPace: adData.speechPace,
          createdAt: Date.now(),
          theme: adData.theme || 'Estrategia de Marketing Deficiente'
        };
        updated = [newAd, ...localAds];
      }

      setLocalAds(updated);
      localStorage.setItem('adscene_detector_ads', JSON.stringify(updated));
      setSelectedAd(null); // Limpiar el estado o salir del modo edición
    }
  };

  // Eliminar un Anuncio de la biblioteca
  const handleDeleteAd = async (id: string) => {
    if (user) {
      try {
        await deleteAd(id);
        if (selectedAd?.id === id) {
          setSelectedAd(null);
        }
      } catch (err) {
        console.error('Error al borrar de Firestore:', err);
        alert('Fallo de red o límites de permisos.');
      }
    } else {
      const updated = localAds.filter(ad => ad.id !== id);
      setLocalAds(updated);
      localStorage.setItem('adscene_detector_ads', JSON.stringify(updated));
      if (selectedAd?.id === id) {
        setSelectedAd(null);
      }
    }
  };

  // Marcar/Desmarcar un Anuncio como utilizado en biblioteca
  const handleToggleUsedAd = async (id: string, used: boolean) => {
    if (user) {
      const adToUpdate = ads.find(a => a.id === id);
      if (adToUpdate) {
        try {
          await saveAd({
            ...adToUpdate,
            used
          });
        } catch (err) {
          console.error('Error al actualizar estado en Firestore:', err);
        }
      }
    } else {
      const updated = localAds.map(ad => 
        ad.id === id ? { ...ad, used } : ad
      );
      setLocalAds(updated);
      localStorage.setItem('adscene_detector_ads', JSON.stringify(updated));
    }
  };

  // Seleccionar anuncio para editar o recargar
  const handleSelectAd = (ad: Ad) => {
    setSelectedAd(ad);
    setActiveTab('editor'); // Volver al editor al seleccionar un anuncio
    // Hacer scroll suave hacia arriba para que el usuario empiece de inmediato en el editor
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Exportar respaldo de datos como JSON
  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ads, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `respaldo_anuncios_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Importar respaldo de datos desde JSON
  const handleImportData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (Array.isArray(parsed)) {
          // Validar campos elementales de cada anuncio
          const validated: Ad[] = parsed.filter(item => 
            item && typeof item === 'object' && 'hook' in item && 'scenes' in item
          ).map(item => ({
            id: item.id || generateId(),
            title: item.title || 'Anuncio Importado',
            rawText: item.rawText || '',
            hook: item.hook || '',
            scenes: Array.isArray(item.scenes) ? item.scenes : [],
            speechPace: item.speechPace || 'normal',
            createdAt: item.createdAt || Date.now(),
            theme: item.theme || 'Estrategia de Marketing Deficiente'
          }));

          if (user) {
            // Importar directamente a Firestore si el usuario está conectado
            for (const item of validated) {
              await saveAd({
                title: item.title,
                rawText: item.rawText,
                hook: item.hook,
                scenes: item.scenes,
                speechPace: item.speechPace,
                id: item.id,
                theme: item.theme
              });
            }
            setImportedStatus(`¡Éxito! Se importaron ${validated.length} guiones a tu base de datos Firestore.`);
          } else {
            const merged = [...validated, ...localAds].reduce((acc: Ad[], current) => {
              // Evitar duplicados por id
              if (!acc.some(item => item.id === current.id)) {
                acc.push(current);
              }
              return acc;
            }, []);

            setLocalAds(merged);
            localStorage.setItem('adscene_detector_ads', JSON.stringify(merged));
            setImportedStatus(`¡Exitoso! Se importaron ${validated.length} anuncios.`);
          }
          
          setActiveTab('library');
          setTimeout(() => setImportedStatus(null), 4000);
        } else {
          alert('El archivo cargado no contiene un formato de anuncios válido.');
        }
      } catch (err) {
        console.error(err);
        alert('Ocurrió un error al leer el archivo JSON. Verifica que sea un respaldo válido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-55 flex flex-col font-sans text-slate-805 antialiased selection:bg-indigo-600 selection:text-white">
      
      {/* NAVBAR principal superior */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm/5">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-650 shadow-md shadow-indigo-650/15 text-white transform hover:rotate-3 transition-transform shrink-0">
              <Film className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-none">
                  ScriptAnalyzer
                </h1>
                <span className={`text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded-md leading-none tracking-wide ${
                  user ? 'bg-indigo-100 text-indigo-800 border border-indigo-200/40' : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {user ? 'Cloud DB' : 'Local DB'}
                </span>
              </div>
              <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mt-1 leading-none">UGC & VSL Tool</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {cloudLoading ? (
              <span className="text-xs text-slate-400 animate-pulse font-medium">Cargando base de datos...</span>
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end leading-none">
                  <span className="text-xs font-black text-slate-900">{user.displayName}</span>
                  <span className="text-[10px] text-indigo-600 font-bold mt-0.5">{user.email}</span>
                </div>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-colors hover:shadow-sm cursor-pointer"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-600/10 hover:shadow-md text-white border border-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Guardar en Nube (Google)</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ÁREA DE TRABAJO PRINCIPAL */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Sub-Header con Pestañas de Navegación */}
        <div className="bg-white border-b border-slate-205 shadow-sm/5 sticky top-[64px] z-15">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3.5 gap-3">
              {/* Tabs control */}
              <div className="inline-flex p-1 bg-slate-100 border border-slate-200/60 rounded-xl max-w-max">
                <button
                  onClick={() => setActiveTab('editor')}
                  className={`px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'editor'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Escribir y Redactar (Entrada)</span>
                </button>
                <button
                  onClick={() => setActiveTab('library')}
                  className={`px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 relative ${
                    activeTab === 'library'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <Film className="w-4 h-4" />
                  <span>Biblioteca Gardada ({ads.length})</span>
                </button>
              </div>

              {/* Indicación de modo activo */}
              <div className="flex items-center gap-2">
                {selectedAd ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200/80 text-xs font-semibold rounded-lg shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse animate-duration-1000" />
                    Editando: <strong className="font-extrabold truncate max-w-[120px]">{selectedAd.title}</strong>
                  </span>
                ) : user ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold rounded-lg shadow-sm/5 animate-fade-in">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    Nube Activa (Sincronizado)
                  </span>
                ) : (
                  <span className="text-[10.5px] text-slate-400 font-mono hidden sm:inline">
                    Dispositivo listo — offline persistente
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Panel principal de procesamiento */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
          
          {/* Banner de Sincronización de local a la nube */}
          {showSyncBanner && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4 sm:p-5 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-none">
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5 animate-bounce" />
                <div>
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">¡Anuncios guardados offline detectados!</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Tienes <strong className="text-indigo-700">{localAds.length} guiones</strong> en el navegador. ¿Deseas subirlos y sincronizarlos con tu cuenta Google para asegurar que no se borren con el historial?
                  </p>
                </div>
              </div>
              <button
                id="btn-trigger-sync"
                disabled={isSyncing}
                onClick={handleSincronizarLocales}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all shrink-0 shadow flex items-center gap-1.5 cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Migrando...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sincronizar con la Nube</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Banner de Feedback de Importación */}
          {importedStatus && (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-4 text-xs sm:text-sm flex items-center gap-3 shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-semibold">{importedStatus}</span>
            </div>
          )}

          {/* VISTA 1: EDITOR (Entrada) */}
          {activeTab === 'editor' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-5 sm:p-6 lg:p-8">
              <AdParser
                selectedAd={selectedAd}
                onSaveAd={handleSaveAd}
                onClearSelection={() => setSelectedAd(null)}
                ads={ads}
              />
            </div>
          )}

          {/* VISTA 2: BIBLIOTECA (Organizada inteligentemente por Tema - Ancho Completo) */}
          {activeTab === 'library' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 lg:p-8">
              <AdLibrary
                ads={ads}
                onSelectAd={handleSelectAd}
                onDeleteAd={handleDeleteAd}
                onToggleUsedAd={handleToggleUsedAd}
                activeId={selectedAd?.id}
              />
            </div>
          )}

        </div>

        {/* Footer Minimalista */}
        <footer className="px-6 py-5 bg-white border-t border-slate-205 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-[11px] text-slate-400 max-w-full mx-auto w-full">
          <p>© {new Date().getFullYear()} ScriptAnalyzer — Diseñado con una estética de alta precisión ultra-limpia.</p>
          <p className="font-mono text-[10px]">
            {user 
              ? "Sincronizado de forma segura en Google Cloud Firestore." 
              : "Guardando localmente en tu navegador de forma segura e instantánea."}
          </p>
        </footer>
      </main>

    </div>
  );
}
