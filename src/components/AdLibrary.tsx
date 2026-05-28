import { useState } from 'react';
import { Ad, THEME_CATEGORIES } from '../types';
import { detectTheme } from '../utils';
import { 
  Search, Film, Trash2, Zap, 
  ChevronDown, ChevronRight, Folder, FolderOpen, Check
} from 'lucide-react';

interface AdLibraryProps {
  ads: Ad[];
  onSelectAd: (ad: Ad) => void;
  onDeleteAd: (id: string) => void;
  onToggleUsedAd: (id: string, used: boolean) => void;
  activeId?: string;
}

export default function AdLibrary({ ads, onSelectAd, onDeleteAd, onToggleUsedAd, activeId }: AdLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const filteredAds = ads.filter(ad => {
    const query = searchQuery.toLowerCase();
    return (
      ad.title.toLowerCase().includes(query) ||
      ad.rawText.toLowerCase().includes(query) ||
      ad.hook.toLowerCase().includes(query) ||
      ad.scenes.some(scene => scene.toLowerCase().includes(query))
    );
  }).sort((a, b) => b.createdAt - a.createdAt);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Group ads by theme
  const groupedAds: Record<string, Ad[]> = {};
  
  THEME_CATEGORIES.forEach(cat => {
    groupedAds[cat] = [];
  });
  groupedAds['Otros / Sin Clasificar'] = [];

  filteredAds.forEach(ad => {
    // Si no tiene theme en BD, lo detectamos al vuelo inteligentemente
    const theme = ad.theme || detectTheme(ad.title, ad.rawText) || 'Otros / Sin Clasificar';
    const normalizedTheme = THEME_CATEGORIES.includes(theme as any) ? theme : 'Otros / Sin Clasificar';
    groupedAds[normalizedTheme].push(ad);
  });

  // Filtrar solo las categorías que tienen contenido
  const activeCategories = [
    ...THEME_CATEGORIES,
    'Otros / Sin Clasificar'
  ].filter(cat => groupedAds[cat].length > 0);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat] // true means collapsed
    }));
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Caja de Búsqueda de Anuncios */}
      <div className="p-4 border-b border-slate-100">
        <label htmlFor="library-search-input" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
          Buscar Anuncios
        </label>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="library-search-input"
            type="text"
            placeholder="Buscar por título o contenido..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200/80 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/80 transition-all placeholder:text-slate-400 text-slate-700"
          />
        </div>
      </div>

      {/* Listado de Anuncios en el Sidebar */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[calc(100vh-280px)] md:max-h-none">
        <div className="px-1.5 pt-1 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>Temáticas de la Biblioteca ({filteredAds.length})</span>
          {filteredAds.length > 0 && <span className="text-[9px] text-slate-300 font-mono">Agrupados por tema</span>}
        </div>

        {filteredAds.length === 0 ? (
          <div className="text-center py-8 px-4 border border-dashed border-slate-100 rounded-lg bg-slate-50/30">
            <Film className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-500">Sin anuncios guardados</p>
            <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto">
              {searchQuery ? 'Prueba con otro filtro o término.' : 'Escribe o pega un guion y guárdalo en la biblioteca.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeCategories.map(cat => {
              const categoryAds = groupedAds[cat];
              const isCollapsed = collapsedCategories[cat] === true;

              return (
                <div key={cat} className="space-y-1.5 border border-slate-150 rounded-lg p-1.5 bg-slate-50/20 transition-all">
                  {/* Category Folder Header */}
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between p-2 hover:bg-slate-100/50 rounded-md transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isCollapsed ? (
                        <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <FolderOpen className="w-3.5 h-3.5 text-indigo-550 shrink-0" />
                      )}
                      <span className="text-[11px] font-bold text-slate-700 truncate pr-1">
                        {cat}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-1 shrink-0">
                      <span className="text-[9px] font-extrabold bg-indigo-55 text-indigo-700 px-1.5 py-0.5 rounded-full">
                        {categoryAds.length}
                      </span>
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {/* Category Contents */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2 transition-all">
                      {categoryAds.map(ad => {
                        const numScenes = ad.scenes.length;
                        const isSelected = ad.id === activeId;
                        const paceLabels = {
                          fast: 'Rápido',
                          normal: 'Normal',
                          slow: 'Lento'
                        };

                        return (
                          <div
                            key={ad.id}
                            id={`sidebar-ad-${ad.id}`}
                            onClick={() => onSelectAd(ad)}
                            className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer relative group flex flex-col justify-between ${
                              isSelected
                                ? 'bg-indigo-50/85 border-indigo-250 ring-1 ring-indigo-200 shadow-sm'
                                : ad.used
                                  ? 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-400 hover:bg-emerald-100/40 shadow-sm'
                                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                            } ${ad.used ? 'border-l-4 border-l-emerald-600' : ''}`}
                          >
                            <div className="relative">
                              <div className="flex items-start justify-between gap-1">
                                <h4 className={`font-bold text-[11px] truncate pr-5 leading-tight ${
                                  isSelected ? 'text-indigo-900' : 'text-slate-755 group-hover:text-slate-900'
                                }`}>
                                  {ad.title || 'Anuncio sin título'}
                                </h4>
                                
                                <button
                                  id={`sidebar-delete-${ad.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteAd(ad.id);
                                  }}
                                  className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-colors absolute top-0 right-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  title="Eliminar de la biblioteca"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Metadatos Rápidos */}
                              <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                                {/* Estado: Utilizado Toggle */}
                                 <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleUsedAd(ad.id, !ad.used);
                                  }}
                                  className={`inline-flex items-center gap-1 text-[8.5px] font-extrabold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                                    ad.used 
                                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-800 hover:border-emerald-905 shadow-sm' 
                                      : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-705'
                                  }`}
                                  title={ad.used ? 'Marcar como No Utilizado' : 'Marcar como Utilizado'}
                                >
                                  {ad.used ? (
                                    <>
                                      <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />
                                      <span className="font-bold text-white">Utilizado</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                      <span>Marcar Utilizado</span>
                                    </>
                                  )}
                                </button>

                                <span className={`inline-flex items-center text-[8.5px] font-bold px-1.5 py-0.2 rounded ${
                                  isSelected ? 'bg-indigo-100 text-indigo-850' : 'bg-slate-100 text-slate-655'
                                }`}>
                                  {numScenes} esc
                                </span>
                                <span className={`inline-flex items-center text-[8.5px] font-medium px-1.5 py-0.2 rounded ${
                                  isSelected ? 'bg-indigo-100/50 text-indigo-700' : 'bg-indigo-50/50 text-indigo-600'
                                }`}>
                                  <Zap className="w-2 h-2 mr-0.5" />
                                  {paceLabels[ad.speechPace]}
                                </span>
                                <span className="text-[8px] text-slate-400 ml-auto">
                                  {formatDate(ad.createdAt)}
                                </span>
                              </div>

                              {/* Vista previa del Hook */}
                              <p className="text-[9.5px] text-slate-400 line-clamp-1 mt-1.5 italic bg-slate-50/30 p-1 rounded">
                                &ldquo;{ad.hook || 'Sin gancho detectado'}&rdquo;
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
