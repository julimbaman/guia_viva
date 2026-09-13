import { MapPin } from 'lucide-react';
import { LocationData } from '../hooks/useGPS';

interface GPSBarProps {
  location: LocationData;
  zoneName: string;
}

export function GPSBar({ location, zoneName }: GPSBarProps) {
  return (
    <div className="bg-surface/80 backdrop-blur-md border-b border-white/5 p-3 flex items-center justify-between text-xs font-mono">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse-dot"></div>
        <span className="text-primary font-bold">LIVE</span>
      </div>
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-1 text-text/80">
          <MapPin size={12} />
          <span className="truncate max-w-[150px]">{zoneName}</span>
        </div>
        <div className="text-text/50">
          {location.lat.toFixed(5)}, {location.lng.toFixed(5)} (±{Math.round(location.accuracy)}m)
        </div>
      </div>
    </div>
  );
}
