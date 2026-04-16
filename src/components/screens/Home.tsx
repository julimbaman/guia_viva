import { useState } from 'react';
import { Play, Settings, LogIn, History, MapPin } from 'lucide-react';
import { LocationData } from '../../hooks/useGPS';
import { AppConfig, ConfigPanel } from '../ConfigPanel';
import { signInWithGoogle } from '../../firebase';
import { useHistory } from '../../hooks/useHistory';

interface HomeProps {
  location: LocationData;
  zoneName: string;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onStart: () => void;
}

export function Home({ location, zoneName, config, onConfigChange, onStart }: HomeProps) {
  const [showConfig, setShowConfig] = useState(false);
  const { userId, visitedPlaces } = useHistory();

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-md mx-auto relative">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <h1 className="text-5xl font-bold mb-2 tracking-tight">Guía Viva</h1>
        <p className="text-text/60 mb-12">Your intelligent real-time tour guide</p>

        <div className="bg-surface/50 border border-white/10 rounded-3xl p-6 w-full mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse-dot"></div>
            <span className="text-primary font-bold tracking-widest text-sm">GPS ACTIVE</span>
          </div>
          
          <div className="flex items-center justify-center gap-2 text-lg font-medium mb-2">
            <MapPin size={18} className="text-info" />
            <span>{zoneName}</span>
          </div>
          
          <div className="text-text/40 font-mono text-xs">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            <br />
            Accuracy: ±{Math.round(location.accuracy)}m
          </div>
        </div>

        <button 
          onClick={onStart}
          className="w-full bg-primary text-bg font-bold text-xl py-5 rounded-full flex items-center justify-center gap-3 hover:bg-primary/90 transition-transform active:scale-95 shadow-[0_0_40px_rgba(34,211,167,0.3)] mb-6"
        >
          <Play fill="currentColor" /> Start Guide
        </button>

        <div className="flex gap-4 w-full">
          <button 
            onClick={() => setShowConfig(true)}
            className="flex-1 bg-surface border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-2 font-medium hover:bg-white/5 transition-colors"
          >
            <Settings size={18} /> Settings
          </button>
          
          {userId ? (
            <button className="flex-1 bg-surface border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-2 font-medium hover:bg-white/5 transition-colors">
              <History size={18} /> History ({visitedPlaces.length})
            </button>
          ) : (
            <button 
              onClick={handleSignIn}
              className="flex-1 bg-surface border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-2 font-medium hover:bg-white/5 transition-colors"
            >
              <LogIn size={18} /> Sign In
            </button>
          )}
        </div>
      </div>

      {showConfig && (
        <ConfigPanel 
          config={config} 
          onChange={onConfigChange} 
          onClose={() => setShowConfig(false)} 
        />
      )}
    </div>
  );
}
