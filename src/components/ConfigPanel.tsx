import { useState } from 'react';
import { Settings, Volume2, VolumeX, X, Terminal, ExternalLink } from 'lucide-react';

export interface AppConfig {
  interests: string[];
  voiceEnabled: boolean;
  narrationInterval: number; // seconds
  routeLookahead: number; // seconds
}

interface ConfigPanelProps {
  config: AppConfig;
  onChange: (newConfig: AppConfig) => void;
  onClose: () => void;
  onOpenDebug: () => void;
}

const AVAILABLE_INTERESTS = ['History', 'Architecture', 'Food', 'Art', 'Nature', 'Culture'];

export function ConfigPanel({ config, onChange, onClose, onOpenDebug }: ConfigPanelProps) {
  const toggleInterest = (interest: string) => {
    const newInterests = config.interests.includes(interest)
      ? config.interests.filter(i => i !== interest)
      : [...config.interests, interest];
    onChange({ ...config, interests: newInterests });
  };

  return (
    <div className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-3xl p-6 border border-white/10 shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings size={20} /> Settings
          </h2>
          <button onClick={onClose} className="p-2 bg-white/5 rounded-full hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-text/60 uppercase tracking-wider mb-3">Interests</h3>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_INTERESTS.map(interest => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    config.interests.includes(interest)
                      ? 'bg-primary text-bg'
                      : 'bg-white/5 text-text hover:bg-white/10'
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-text/60 uppercase tracking-wider mb-3">Voice</h3>
            <button
              onClick={() => onChange({ ...config, voiceEnabled: !config.voiceEnabled })}
              className="flex items-center justify-between w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <span className="font-medium">Enable Voice Narration</span>
              {config.voiceEnabled ? <Volume2 className="text-primary" /> : <VolumeX className="text-text/40" />}
            </button>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <h3 className="text-sm font-bold text-text/60 uppercase tracking-wider">Tiempo mínimo entre narraciones</h3>
              <span className="text-sm font-mono">{config.narrationInterval}s</span>
            </div>
            <input 
              type="range" 
              min="15" 
              max="60" 
              step="5"
              value={config.narrationInterval}
              onChange={(e) => onChange({ ...config, narrationInterval: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <h3 className="text-sm font-bold text-text/60 uppercase tracking-wider">Anticipación de ruta</h3>
              <span className="text-sm font-mono">{config.routeLookahead}s</span>
            </div>
            <input 
              type="range" 
              min="15" 
              max="90" 
              step="5"
              value={config.routeLookahead}
              onChange={(e) => onChange({ ...config, routeLookahead: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          <div className="pt-4 border-t border-white/5">
            <button
              onClick={onOpenDebug}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Terminal size={18} />
                <div className="text-left">
                  <p className="font-bold text-sm">Raw Results Explorer</p>
                  <p className="text-[10px] opacity-70">Evaluate AI selection logic</p>
                </div>
              </div>
              <ExternalLink size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
