import { Star, Clock, MapPin } from 'lucide-react';
import { Place } from '../hooks/usePlaces';

interface POIBadgeProps {
  place: Place;
  distance?: number;
}

export function POIBadge({ place, distance }: POIBadgeProps) {
  const photoUrl = place.photos?.[0]?.name 
    ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
    : null;

  return (
    <div className="flex gap-4">
      {photoUrl ? (
        <img 
          src={photoUrl} 
          alt={place.displayName?.text} 
          className="w-20 h-20 rounded-xl object-cover bg-white/5"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-20 h-20 rounded-xl bg-white/5 flex items-center justify-center text-text/30">
          <MapPin size={24} />
        </div>
      )}
      
      <div className="flex-1 flex flex-col justify-center">
        <h3 className="font-bold text-lg leading-tight mb-1">{place.displayName?.text}</h3>
        <div className="flex items-center gap-3 text-xs text-text/60">
          {place.rating > 0 && (
            <div className="flex items-center gap-1 text-warning">
              <Star size={12} fill="currentColor" />
              <span>{place.rating} ({place.userRatingCount})</span>
            </div>
          )}
          {distance !== undefined && (
            <div className="font-mono">{Math.round(distance)}m</div>
          )}
          {place.regularOpeningHours && (
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <span className={place.regularOpeningHours.openNow ? 'text-primary' : 'text-danger'}>
                {place.regularOpeningHours.openNow ? 'Open' : 'Closed'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
