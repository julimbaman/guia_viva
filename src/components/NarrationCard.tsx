import { Volume2, Heart, FastForward, MessageCircleQuestion, Map as MapIcon } from 'lucide-react';
import { NarrationRecord } from '../hooks/useNarration';
import { POIBadge } from './POIBadge';
import { formatDistanceToNow } from 'date-fns';

interface NarrationCardProps {
  key?: string;
  record: NarrationRecord;
  onReplay: (text: string) => void;
  onSave: (placeId: string) => void;
  isUpcoming?: boolean;
}

export function NarrationCard({ record, onReplay, onSave, isUpcoming }: NarrationCardProps) {
  return (
    <div className="bg-surface rounded-2xl p-4 border border-white/5 shadow-lg animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        {isUpcoming && (
          <span className="bg-info/20 text-info text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 uppercase tracking-wider">
            <FastForward size={10} /> Upcoming
          </span>
        )}
        {record.isQuestionAnswer && (
          <span className="bg-warning/20 text-warning text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 uppercase tracking-wider">
            <MessageCircleQuestion size={10} /> Answer
          </span>
        )}
        <span className="text-[10px] text-text/40 font-mono ml-auto">
          {formatDistanceToNow(record.timestamp, { addSuffix: true })}
        </span>
      </div>

      <POIBadge place={record.place} />

      <div className="mt-3 flex items-center gap-4">
        <button 
          onClick={() => onReplay(record.text)}
          className="flex items-center gap-2 text-xs font-bold text-primary hover:text-primary/80 transition-colors bg-primary/10 px-3 py-2 rounded-lg"
        >
          <Volume2 size={14} /> Listen Again
        </button>
        <a 
          href={`https://www.google.com/maps/dir/?api=1&destination=${record.place.location.latitude},${record.place.location.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs font-bold text-info hover:text-info/80 transition-colors bg-info/10 px-3 py-2 rounded-lg"
        >
          <MapIcon size={14} /> Map
        </a>
        <button 
          onClick={() => onSave(record.place.id)}
          className="flex items-center gap-2 text-xs font-bold text-text/60 hover:text-danger transition-colors ml-auto p-2"
        >
          <Heart size={14} />
        </button>
      </div>

      <div className="mt-3 mb-3 rounded-xl overflow-hidden relative h-48 bg-white/5 border border-white/10 flex items-center justify-center">
        {record.place.photos && record.place.photos.length > 0 ? (
          <img 
            src={`/api/places/photo?name=${record.place.photos[0].name}`}
            alt={record.place.displayName?.text}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // Fallback to static map if photo fails
              const target = e.target as HTMLImageElement;
              const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
              if (apiKey && !target.src.includes('staticmap')) {
                target.src = `https://maps.googleapis.com/maps/api/staticmap?center=${record.place.location.latitude},${record.place.location.longitude}&zoom=16&size=600x400&markers=color:red%7C${record.place.location.latitude},${record.place.location.longitude}&key=${apiKey}&style=feature:all|element:labels|visibility:off`;
              } else {
                target.style.display = 'none';
              }
            }}
          />
        ) : (
          <img 
            src={`https://maps.googleapis.com/maps/api/staticmap?center=${record.place.location.latitude},${record.place.location.longitude}&zoom=16&size=600x400&markers=color:red%7C${record.place.location.latitude},${record.place.location.longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&style=feature:all|element:labels|visibility:off`}
            alt={`Map of ${record.place.displayName?.text}`}
            className="w-full h-full object-cover opacity-80"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </div>

      <div className="mt-4 text-sm leading-relaxed text-text/90">
        {record.text}
      </div>
    </div>
  );
}
