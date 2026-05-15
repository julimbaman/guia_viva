import { useState, useEffect, useRef } from 'react';
import { Square, MapPin, Route, Navigation, CheckCircle2 } from 'lucide-react';
import { LocationData } from '../../hooks/useGPS';
import { useNarration } from '../../hooks/useNarration';
import { calculateDistance, getCardinalDirection, getRelativeDirection } from '../../utils/geo';
import { NavigationBanner } from '../NavigationBanner';
import { NarrationCard } from '../NarrationCard';
import { TTS } from '../../utils/tts';
import { GPSBar } from '../GPSBar';
import { auth, db } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface ActiveTourProps {
  tour: any;
  location: LocationData;
  onStop: () => void;
}

export function ActiveTour({ tour, location, onStop }: ActiveTourProps) {
  const [poiIndex, setPoiIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const { isProcessing, isSpeaking, narrations, addNarrationRecord, playNarration } = useNarration();

  const currentPoi = tour?.pois[poiIndex];
  const hasNarratedRef = useRef<Set<number>>(new Set());
  // True while we're waiting for TTS to finish before advancing to the next POI
  const pendingAdvanceRef = useRef(false);

  useEffect(() => {
    TTS.init();
    return () => TTS.stop();
  }, []);

  // Advance to the next POI once TTS finishes speaking
  useEffect(() => {
    if (!isSpeaking && pendingAdvanceRef.current) {
      pendingAdvanceRef.current = false;
      // Brief pause after narration ends before moving on
      const t = setTimeout(() => {
        if (poiIndex + 1 < tour.pois.length) {
          setPoiIndex(prev => prev + 1);
        } else {
          setCompleted(true);
          playNarration("¡Has completado el recorrido. Felicitaciones!");
          // Save tour completion to Firestore
          const user = auth.currentUser;
          if (user) {
            addDoc(collection(db, 'users', user.uid, 'visited_pois'), {
              poiName: tour.title,
              placeId: tour.id || `tour_${Date.now()}`,
              lat: location.lat,
              lng: location.lng,
              narration: `Completed tour: ${tour.title}`,
              timestamp: serverTimestamp(),
            }).catch(() => {});
          }
        }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [isSpeaking, poiIndex, tour, location, playNarration]);

  useEffect(() => {
    if (!currentPoi || completed) return;

    const dist = calculateDistance(
      location.lat,
      location.lng,
      currentPoi.location.latitude,
      currentPoi.location.longitude
    );

    if (dist < 30 && !hasNarratedRef.current.has(poiIndex)) {
      hasNarratedRef.current.add(poiIndex);

      let text = `Has llegado a ${currentPoi.displayName?.text || 'tu destino'}. `;
      if (currentPoi.pregeneratedNarration) {
        text += currentPoi.pregeneratedNarration;
      } else if (currentPoi.editorialSummary?.text) {
        text += currentPoi.editorialSummary.text;
      }

      addNarrationRecord(currentPoi, text);
      playNarration(text);
      // Signal the isSpeaking effect to advance once TTS finishes
      pendingAdvanceRef.current = true;
    }
  }, [location, currentPoi, completed, poiIndex, tour.pois.length, addNarrationRecord, playNarration]);

  if (!tour) return null;

  const currentMapUrl = currentPoi ? `https://maps.googleapis.com/maps/api/staticmap?center=${currentPoi.location.latitude},${currentPoi.location.longitude}&zoom=16&size=600x400&markers=color:red%7C${currentPoi.location.latitude},${currentPoi.location.longitude}&markers=color:blue%7Clabel:U%7C${location.lat},${location.lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&style=visibility:on` : null;

  return (
    <div className="h-screen flex flex-col max-w-md mx-auto bg-bg relative overflow-hidden">
      <div className="flex items-center justify-between p-4 bg-surface/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg truncate">{tour.title}</h1>
          {completed && <CheckCircle2 className="text-primary" size={18} />}
        </div>
        <button onClick={onStop} className="p-2 hover:bg-danger/20 text-danger rounded-full transition-colors">
          <Square size={20} fill="currentColor" />
        </button>
      </div>

      <GPSBar location={location} zoneName="Active Tour" />

      {currentPoi && !completed && (
        <>
          <NavigationBanner 
            destination={currentPoi} 
            location={location} 
            onCancel={() => {}} // disable cancel for tour? Or maybe skip?
          />
          {currentMapUrl && (
            <div className="px-4 mb-4 animate-fade-in">
              <div className="bg-surface border border-white/10 rounded-2xl overflow-hidden aspect-video relative">
                <img src={currentMapUrl} alt="Map" className="w-full h-full object-cover" />
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-xs font-bold text-white flex items-center gap-1">
                  <MapPin size={12} className="text-primary"/> Next: {currentPoi.displayName?.text}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {completed && (
        <div className="bg-primary/20 text-primary p-4 text-center font-bold">
          Tour Completed!
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 custom-scrollbar">
        <div className="bg-surface border border-white/10 rounded-2xl p-4">
          <h3 className="font-bold mb-2 flex items-center gap-2"><Route size={16}/> Itinerary</h3>
          <div className="space-y-3 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
            {tour.pois.map((poi: any, index: number) => {
              const isActive = index === poiIndex && !completed;
              const isPast = index < poiIndex || completed;
              return (
                <div key={poi.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${isActive ? 'bg-primary border-bg shadow-[0_0_0_2px_rgba(34,211,167,1)]' : isPast ? 'bg-primary/50 border-bg text-bg' : 'bg-surface border-white/20'} text-[10px] font-bold z-10 text-white`}>
                    {isPast ? <CheckCircle2 size={12} /> : (index + 1)}
                  </div>
                  <div className={`flex w-[calc(100%-2.5rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-xl border ${isActive ? 'border-primary bg-primary/10' : isPast ? 'border-white/5 opacity-50' : 'border-white/10 bg-surface'}`}>
                    {poi.photos?.[0]?.name && (
                      <img 
                        src={`https://places.googleapis.com/v1/${poi.photos[0].name}/media?maxHeightPx=100&maxWidthPx=100&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover mr-3 flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 truncate">
                      <div className="font-bold text-sm truncate">{poi.displayName?.text || poi.id}</div>
                      {poi.formattedAddress && (
                        <div className="text-xs text-text/60 truncate">{poi.formattedAddress}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {narrations.map(record => (
          <NarrationCard 
            key={record.id} 
            record={record} 
            onReplay={(text) => playNarration(text)}
            onSave={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
