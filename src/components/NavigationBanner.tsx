import { Navigation, MapPin } from 'lucide-react';
import { Place } from '../hooks/usePlaces';
import { calculateDistance, getRelativeDirection } from '../utils/geo';
import { LocationData } from '../hooks/useGPS';

interface NavigationBannerProps {
  destination: Place;
  location: LocationData;
  onCancel: () => void;
}

export function NavigationBanner({ destination, location, onCancel }: NavigationBannerProps) {
  const distance = calculateDistance(
    location.lat, 
    location.lng, 
    destination.location.latitude, 
    destination.location.longitude
  );

  // Calculate bearing
  const φ1 = (location.lat * Math.PI) / 180;
  const φ2 = (destination.location.latitude * Math.PI) / 180;
  const λ1 = (location.lng * Math.PI) / 180;
  const λ2 = (destination.location.longitude * Math.PI) / 180;

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  const bearing = ((θ * 180) / Math.PI + 360) % 360;

  const relativeDirection = getRelativeDirection(location.heading || 0, bearing);

  return (
    <div className="bg-primary/20 border border-primary/30 rounded-xl p-3 mx-4 mb-2 flex items-center justify-between animate-fade-down">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
          <Navigation size={20} className={relativeDirection === 'Straight ahead' ? '' : relativeDirection.includes('left') ? '-rotate-45' : relativeDirection.includes('right') ? 'rotate-45' : 'rotate-180'} />
        </div>
        <div>
          <div className="text-xs text-primary font-bold uppercase tracking-wider">Navigating to</div>
          <div className="font-bold text-sm truncate max-w-[150px]">{destination.displayName?.text}</div>
          <div className="text-xs text-text/80 flex items-center gap-1">
            <span>{Math.round(distance)}m</span>
            <span>•</span>
            <span>{relativeDirection}</span>
          </div>
        </div>
      </div>
      <button 
        onClick={onCancel}
        className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
