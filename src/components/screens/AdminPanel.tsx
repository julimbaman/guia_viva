import { useEffect, useState, type FormEvent } from 'react';
import {
  X, ShieldCheck, MapPinPlus, Loader2, CheckCircle2, XCircle, RefreshCw,
  Gauge, Users, MapPin, DollarSign
} from 'lucide-react';
import { auth } from '../../firebase';

interface AdminPanelProps {
  onClose: () => void;
}

type Tab = 'resumen' | 'sitios' | 'usuarios';

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

interface UsageSummary {
  today: { googlePlacesCalls: number; openAICalls: number; estimatedCostUSD: number };
  dailyBudgetUSD: number;
  remainingUSD: number;
  budgetExceeded: boolean;
  history: { date: string; googlePlacesCalls: number; openAICalls: number; estimatedCostUSD: number }[];
}

interface UserSummary {
  uid: string;
  email: string | null;
  displayName: string | null;
  onboardingComplete: boolean;
  createdAt: string | null;
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

const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: 'resumen', label: 'Resumen', icon: Gauge },
  { id: 'sitios', label: 'Sitios', icon: MapPin },
  { id: 'usuarios', label: 'Usuarios', icon: Users }
];

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('resumen');

  return (
    <div className="fixed inset-0 bg-bg/95 backdrop-blur-md z-[10000] flex flex-col pt-16 px-4 pb-4 sm:p-8 animate-fade-in overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-4 max-w-lg w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg text-primary">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Panel de Administración</h2>
            <p className="text-xs text-text/40">Guía Viva · /admin</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="max-w-lg w-full mx-auto flex gap-2 mb-6 bg-surface border border-white/10 rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-primary text-bg' : 'text-text/60 hover:text-text'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="max-w-lg w-full mx-auto">
        {tab === 'resumen' && <ResumenTab />}
        {tab === 'sitios' && <SitiosTab />}
        {tab === 'usuarios' && <UsuariosTab />}
      </div>
    </div>
  );
}

function ResumenTab() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/usage');
      if (res.ok) setUsage(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }
  if (!usage) {
    return <p className="text-sm text-text/50 text-center p-8">No se pudo cargar el consumo.</p>;
  }

  const percentage = Math.min((usage.today.estimatedCostUSD / usage.dailyBudgetUSD) * 100, 100);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <DollarSign size={16} className="text-amber-400" /> Gasto estimado hoy
          </div>
          <button onClick={load} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="text-3xl font-black">
          ${usage.today.estimatedCostUSD.toFixed(2)} <span className="text-base text-text/50 font-medium">/ ${usage.dailyBudgetUSD.toFixed(2)}</span>
        </div>
        <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${percentage > 90 ? 'bg-danger' : percentage > 70 ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {usage.budgetExceeded && (
          <p className="text-xs text-danger font-medium">Presupuesto agotado: el backend no llama a Places/OpenAI hasta mañana (UTC).</p>
        )}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-xs text-text/50">Google Places</div>
            <div className="text-xl font-bold">{usage.today.googlePlacesCalls}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-xs text-text/50">OpenAI</div>
            <div className="text-xl font-bold">{usage.today.openAICalls}</div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-white/10 rounded-2xl p-4">
        <h3 className="text-sm font-bold mb-3">Histórico (últimos días)</h3>
        {usage.history.length === 0 ? (
          <p className="text-xs text-text/40">Sin datos históricos todavía.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
            {usage.history.map(day => (
              <div key={day.date} className="flex items-center justify-between text-sm bg-white/5 rounded-lg px-3 py-2">
                <span className="text-text/60 font-mono text-xs">{day.date}</span>
                <span className="text-text/50 text-xs">{day.googlePlacesCalls} Places · {day.openAICalls} IA</span>
                <span className="font-bold">${day.estimatedCostUSD.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SitiosTab() {
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

  useEffect(() => { loadSites(); }, []);

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
    <div className="space-y-6">
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
  );
}

function UsuariosTab() {
  const [total, setTotal] = useState<number | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo cargar la lista de usuarios');
        return;
      }
      setTotal(data.totalUsers);
      setUsers(data.recentUsers || []);
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-white/10 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-text/50">Usuarios inscritos</div>
          <div className="text-3xl font-black">{isLoading ? '—' : total}</div>
        </div>
        <button onClick={load} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-3 text-sm flex items-center gap-2">
          <XCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      <div className="bg-surface border border-white/10 rounded-2xl p-4">
        <h3 className="text-sm font-bold mb-3">Últimos registrados</h3>
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
        ) : users.length === 0 ? (
          <p className="text-xs text-text/40">Sin usuarios todavía.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
            {users.map(u => (
              <div key={u.uid} className="flex items-center justify-between bg-white/5 rounded-xl p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.displayName || u.email || u.uid}</div>
                  <div className="text-[10px] text-text/50 truncate">{u.email}</div>
                </div>
                <div className="text-right flex-shrink-0 pl-2">
                  <div className={`text-[10px] font-bold ${u.onboardingComplete ? 'text-primary' : 'text-amber-400'}`}>
                    {u.onboardingComplete ? 'Activo' : 'Onboarding'}
                  </div>
                  {u.createdAt && (
                    <div className="text-[10px] text-text/40">{new Date(u.createdAt).toLocaleDateString()}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
