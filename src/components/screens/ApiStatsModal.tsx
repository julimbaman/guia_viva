import React, { useEffect, useState } from 'react';
import { X, Network, Cpu, Database, DollarSign } from 'lucide-react';
import { useApiTracker } from '../../hooks/useApiTracker';

interface ApiStatsModalProps {
  onClose: () => void;
}

interface GlobalUsage {
  today: { googlePlacesCalls: number; openAICalls: number; estimatedCostUSD: number };
  dailyBudgetUSD: number;
  remainingUSD: number;
  budgetExceeded: boolean;
}

export function ApiStatsModal({ onClose }: ApiStatsModalProps) {
  const { dailyUsage } = useApiTracker();
  const [globalUsage, setGlobalUsage] = useState<GlobalUsage | null>(null);

  useEffect(() => {
    fetch('/api/usage')
      .then(res => res.ok ? res.json() : null)
      .then(data => data && setGlobalUsage(data))
      .catch(() => {}); // Stats are informational only; a failed fetch shouldn't disrupt the modal.
  }, []);

  const total = dailyUsage.googlePlaces + dailyUsage.openAI;
  const percentage = Math.min((total / dailyUsage.totalLimit) * 100, 100);
  const globalPercentage = globalUsage ? Math.min((globalUsage.today.estimatedCostUSD / globalUsage.dailyBudgetUSD) * 100, 100) : 0;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-fade-up">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" />
            Uso de APIs y Consumo
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="text-center">
            <div className="text-4xl font-black text-primary mb-1">{total} <span className="text-lg text-text/50 font-medium">/ 100</span></div>
            <p className="text-text/60 text-sm">Consultas totales realizadas hoy</p>
          </div>

          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${percentage > 90 ? 'bg-danger' : percentage > 70 ? 'bg-amber-500' : 'bg-primary'}`}
              style={{ width: `${percentage}%` }}
            ></div>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/10">
            <h3 className="text-xs font-bold text-text/50 uppercase tracking-wider mb-2">Desglose de Servicios</h3>
            
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Database size={16} />
                </div>
                <div>
                  <div className="font-bold text-sm">Google Places</div>
                  <div className="text-[10px] text-text/50">Búsquedas del mapa</div>
                </div>
              </div>
              <div className="font-bold font-mono">{dailyUsage.googlePlaces}</div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Cpu size={16} />
                </div>
                <div>
                  <div className="font-bold text-sm">OpenAI (IA)</div>
                  <div className="text-[10px] text-text/50">Narraciones generadas</div>
                </div>
              </div>
              <div className="font-bold font-mono">{dailyUsage.openAI}</div>
            </div>
          </div>

          {globalUsage && (
            <div className="space-y-3 pt-4 border-t border-white/10">
              <h3 className="text-xs font-bold text-text/50 uppercase tracking-wider mb-2">Presupuesto Global de la App (hoy)</h3>
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <DollarSign size={16} />
                  </div>
                  <div>
                    <div className="font-bold text-sm">Gasto estimado</div>
                    <div className="text-[10px] text-text/50">
                      {globalUsage.today.googlePlacesCalls} Places · {globalUsage.today.openAICalls} OpenAI
                    </div>
                  </div>
                </div>
                <div className="font-bold font-mono">
                  ${globalUsage.today.estimatedCostUSD.toFixed(2)} / ${globalUsage.dailyBudgetUSD.toFixed(2)}
                </div>
              </div>
              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${globalPercentage > 90 ? 'bg-danger' : globalPercentage > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                  style={{ width: `${globalPercentage}%` }}
                ></div>
              </div>
              {globalUsage.budgetExceeded && (
                <p className="text-center text-[10px] text-danger font-medium">
                  Presupuesto diario agotado: el backend ya no llama a Places/OpenAI hasta mañana.
                </p>
              )}
            </div>
          )}

          <p className="text-center text-[10px] text-text/40 leading-relaxed mt-4">
             En la versión gratuita tienes un límite de 100 consultas al día para asegurar el servicio para todos. Además, puedes hacer máximo 10 consultas por minuto.
          </p>
        </div>
      </div>
    </div>
  );
}
