import { useEffect, useState, type FormEvent } from 'react';
import { X, ShieldCheck, MapPinPlus, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { auth } from '../../firebase';

interface AdminPanelProps {
  onClose: () => void;
}

interface PopulateResult {
  mode: string;
  radius: number;
  gridId?: string;
  placesFound?: number;
  placeNames?: string[];
  error?: string;
  skipped?: boolean;
  reason?: string;
}

interface SiteSummary {
  gridId: string;
  label?: string;
  transportMode: string;
  placesCount: number;
  updatedAt: string | null;
}

async function authedFetch(url: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [cityCode, setCityCode] = useState('Bogota');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ address: string; results: PopulateResult[] } | null>(null);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(true);

  const loadSites = async () => {
    setIsLoadingSites(true);
    try {
      const res = await authedFetch('/api/admin/sites');
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSites(false);
    }
  };

  useEffect(() => {
    loadSites();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setLastResult(null);

    try {
      const res = await authedFetch('/api/admin/populate-site', {
        method: 'POST',
        body: JSON.stringify({ address: address.trim(), label: label.trim() || undefined, cityCode: cityCode.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to populate site');
        return;
      }
      setLastResult({ address: data.address, results: data.results });
      loadSites();
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-bg/95 backdrop-blur-md z-[10000] flex flex-col pt-16 px-4 pb-4 sm:p-8 animate-fade-in overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-6 max-w-lg w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg text-primary">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Panel de Administración</h2>
            <p className="text-xs text-text/40">Poblar sitios de interés en la base de datos</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="max-w-lg w-full mx-auto space-y-6">
        <form onSubmit={handleSubmit} className="bg-surface border border-white/10 rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-text/60 mb-1">Dirección o lugar</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Ej: Calle 85 #19A-25, Bogotá"
              className="w-full bg-bg border border-white/20 rounded-xl px-4 py-3 text-text outline-none focus:border-primary transition-colors"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text/60 mb-1">Etiqueta (opcional)</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Ej: Oficina Woobsing"
                className="w-full bg-bg border border-white/20 rounded-xl px-3 py-2 text-sm text-text outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text/60 mb-1">Ciudad</label>
              <input
                type="text"
                value={cityCode}
                onChange={e => setCityCode(e.target.value)}
                className="w-full bg-bg border border-white/20 rounded-xl px-3 py-2 text-sm text-text outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !address.trim()}
            className="w-full bg-primary text-bg font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <MapPinPlus size={18} />}
            {isSubmitting ? 'Consultando Google Places + IA...' : 'Poblar zona'}
          </button>
          <p className="text-[10px] text-text/40 leading-relaxed">
            Busca restaurantes, museos, parques y sitios de interés cerca de la dirección para las dos zonas que la app
            realmente consulta (a pie y en vehículo) y los guarda en <code>poi_grids</code>. Respeta el mismo
            presupuesto diario del backend.
          </p>
        </form>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-3 text-sm flex items-center gap-2">
            <XCircle size={16} className="flex-shrink-0" /> {error}
          </div>
        )}

        {lastResult && (
          <div className="bg-surface border border-white/10 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold">Resultado: {lastResult.address}</h3>
            {lastResult.results.map((r, i) => (
              <div key={i} className="bg-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="capitalize flex items-center gap-2">
                    {r.error ? <XCircle size={14} className="text-danger" /> : <CheckCircle2 size={14} className="text-primary" />}
                    {r.mode} ({r.radius}m)
                  </span>
                  <span className="text-text/50 text-xs">{r.placesFound ?? 0} sitios</span>
                </div>
                {r.error && <p className="text-xs text-danger mt-1">{r.error}</p>}
                {r.skipped && <p className="text-xs text-amber-400 mt-1">{r.reason}</p>}
                {r.placeNames && r.placeNames.length > 0 && (
                  <p className="text-xs text-text/60 mt-2">{r.placeNames.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-surface border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold">Sitios ya poblados</h3>
            <button onClick={loadSites} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
              <RefreshCw size={14} className={isLoadingSites ? 'animate-spin' : ''} />
            </button>
          </div>
          {isLoadingSites ? (
            <p className="text-xs text-text/40">Cargando...</p>
          ) : sites.length === 0 ? (
            <p className="text-xs text-text/40">Todavía no hay sitios poblados por el admin.</p>
          ) : (
            <div className="space-y-2">
              {sites.map(site => (
                <div key={site.gridId} className="flex items-center justify-between bg-white/5 rounded-xl p-3 text-sm">
                  <div>
                    <div className="font-medium">{site.label || site.gridId}</div>
                    <div className="text-[10px] text-text/50 font-mono">{site.gridId}</div>
                  </div>
                  <div className="text-xs text-text/50 capitalize">{site.transportMode} · {site.placesCount}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
