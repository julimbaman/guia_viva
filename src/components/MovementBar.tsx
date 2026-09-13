import { Navigation, PersonStanding, Footprints, Car } from 'lucide-react';
import { TransportMode } from '../utils/movement';

interface MovementBarProps {
  mode: TransportMode;
  speed: number; // m/s
  heading: number | null;
}

export function MovementBar({ mode, speed, heading }: MovementBarProps) {
  const speedKmh = (speed * 3.6).toFixed(1);
  
  const getModeIcon = () => {
    switch (mode) {
      case 'stationary': return <PersonStanding size={18} />;
      case 'walking': return <Footprints size={18} />;
      case 'running': return <Footprints size={18} className="text-warning" />;
      case 'vehicle': return <Car size={18} />;
    }
  };

  return (
    <div className="flex items-center justify-between bg-surface p-3 rounded-2xl border border-white/5 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-primary">
          {getModeIcon()}
        </div>
        <div>
          <div className="text-sm font-bold capitalize">{mode}</div>
          <div className="text-xs text-text/60 font-mono">{speedKmh} km/h</div>
        </div>
      </div>
      
      {heading !== null && (
        <div className="flex items-center gap-2 text-text/80">
          <Navigation 
            size={16} 
            style={{ transform: `rotate(${heading}deg)` }} 
            className="text-info transition-transform duration-500"
          />
          <span className="font-mono text-xs">{Math.round(heading)}°</span>
        </div>
      )}
    </div>
  );
}
