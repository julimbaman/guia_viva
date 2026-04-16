import { useState, useEffect, useRef } from 'react';
import { Settings, Square, Loader2, MapPin, Star, Route, Compass } from 'lucide-react';
import { LocationData } from '../../hooks/useGPS';
import { usePlaces, Place } from '../../hooks/usePlaces';
import { useNarration } from '../../hooks/useNarration';
import { useHistory } from '../../hooks/useHistory';
import { AppConfig, ConfigPanel } from '../ConfigPanel';
import { GPSBar } from '../GPSBar';
import { MovementBar } from '../MovementBar';
import { NarrationCard } from '../NarrationCard';
import { QuestionInput } from '../QuestionInput';
import { NavigationBanner } from '../NavigationBanner';
import { getTransportMode, getSearchRadius, getNarrationInterval } from '../../utils/movement';
import { calculateDistance, getCardinalDirection, getRelativeDirection, projectFuturePosition } from '../../utils/geo';
import { TTS } from '../../utils/tts';

interface ActiveProps {
  location: LocationData;
  zoneName: string;
  config: AppConfig;
  places: Place[];
  suggestions: Place[];
  fetchNearbyPlaces: (lat: number, lng: number, radius: number, types?: string[], currentZone?: string, force?: boolean) => Promise<any[]>;
  fetchGoogleSuggestions: (lat: number, lng: number, radius: number) => Promise<void>;
  onConfigChange: (config: AppConfig) => void;
  onStop: () => void;
}

export function Active({ 
  location, 
  zoneName, 
  config, 
  places, 
  suggestions, 
  fetchNearbyPlaces, 
  fetchGoogleSuggestions, 
  onConfigChange, 
  onStop 
}: ActiveProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [destination, setDestination] = useState<Place | null>(null);
  const { isProcessing, isSpeaking, narrations, generateNarration, addNarrationRecord, playNarration, stopNarration } = useNarration();
  const { addVisit, hasVisitedRecently } = useHistory();
  
  const mode = getTransportMode(location.speed);
  const lastNarrationTime = useRef<number>(0);
  const isGeneratingRef = useRef(false);
  const apiCallTimestamps = useRef<number[]>([]);
  const sessionStartTime = useRef<number>(Date.now());
  const localVisitedRef = useRef<Set<string>>(new Set());

  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const wasSpeaking = useRef(false);

  // Initialize TTS
  useEffect(() => {
    TTS.init();
    return () => TTS.stop();
  }, []);

  // Ensure interval is measured from the end of the previous narration
  useEffect(() => {
    if (wasSpeaking.current && !isSpeaking) {
      lastNarrationTime.current = Date.now();
    }
    wasSpeaking.current = isSpeaking;
  }, [isSpeaking]);

  // Session timeout (120 minutes)
  useEffect(() => {
    const timer = setTimeout(() => {
      alert("La sesión ha expirado después de 120 minutos para conservar recursos.");
      onStop();
    }, 120 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [onStop]);

  const checkRateLimit = () => {
    const now = Date.now();
    // Keep only timestamps from the last 60 seconds
    apiCallTimestamps.current = apiCallTimestamps.current.filter(t => now - t < 60000);
    if (apiCallTimestamps.current.length >= 3) {
      return false; // Rate limit exceeded
    }
    apiCallTimestamps.current.push(now);
    return true;
  };

  const discoverAndNarrate = async (ignoreTimer = false, bypassCache = false) => {
    if (isGeneratingRef.current || isSpeaking) return;

    if (!ignoreTimer) {
      const timeSinceLast = (Date.now() - lastNarrationTime.current) / 1000;
      if (timeSinceLast < config.narrationInterval) return;
    }

    if (!checkRateLimit()) {
      setRateLimitWarning(true);
      setTimeout(() => setRateLimitWarning(false), 3000);
      return;
    }

    isGeneratingRef.current = true;
    try {
      const radius = getSearchRadius(mode);
      const nearbyPlaces = await fetchNearbyPlaces(location.lat, location.lng, radius, config.interests.length > 0 ? config.interests : undefined, zoneName, bypassCache);
      
      if (!nearbyPlaces || nearbyPlaces.length === 0) return;

      // 2. Project future position
      const futurePos = projectFuturePosition(location.lat, location.lng, location.speed, location.heading || 0, config.routeLookahead);

      // 3. Filter and rank
      const rankedPlaces = nearbyPlaces
        .filter(p => !hasVisitedRecently(p.id) && !localVisitedRef.current.has(p.id))
        .map(p => {
          const distCurrent = calculateDistance(location.lat, location.lng, p.location.latitude, p.location.longitude);
          const distFuture = calculateDistance(futurePos.lat, futurePos.lng, p.location.latitude, p.location.longitude);
          const isApproaching = distFuture < distCurrent;
          return { place: p, distCurrent, isApproaching };
        })
        .filter(p => p.distCurrent < radius)
        .sort((a, b) => {
          // Prefer highly rated places that we are approaching
          const scoreA = (a.place.rating || 0) + (a.isApproaching ? 2 : 0) - (a.distCurrent / 100);
          const scoreB = (b.place.rating || 0) + (b.isApproaching ? 2 : 0) - (b.distCurrent / 100);
          return scoreB - scoreA;
        });

      if (rankedPlaces.length > 0) {
        const target = rankedPlaces[0];
        
        // Mark as visited immediately to prevent race conditions
        localVisitedRef.current.add(target.place.id);
        
        const cardinalDirection = getCardinalDirection(location.heading || 0);
        const targetBearing = calculateBearing(location.lat, location.lng, target.place.location.latitude, target.place.location.longitude);
        const relativeDirection = getRelativeDirection(location.heading, targetBearing);

        let text = '';
        
        // Use pregenerated narration if available, otherwise fallback to generating it
        if (target.place.pregeneratedNarration) {
          // Dynamic open/closed logic based on local time
          const currentHour = new Date().getHours();
          const isLateNight = currentHour >= 20 || currentHour < 6;
          let timeContext = '';
          
          if (isLateNight && !target.place.types?.includes('restaurant') && !target.place.types?.includes('cafe') && !target.place.types?.includes('night_club') && !target.place.types?.includes('bar')) {
            timeContext = ' Aunque por la hora ya se encuentra cerrado, vale la pena conocerlo. ';
          }

          // Add relative direction context dynamically
          text = `A ${Math.round(target.distCurrent)} metros ${relativeDirection}, se encuentra ${target.place.displayName?.text}.${timeContext} ${target.place.pregeneratedNarration}`;
          addNarrationRecord(target.place, text);
        } else {
          const recentHistory = narrations.slice(0, 5).map(n => n.place.displayName?.text).join(', ');
          const generated = await generateNarration(target.place, {
            transportMode: mode,
            speed: location.speed,
            cardinalDirection,
            distance: target.distCurrent,
            relativeDirection,
            zoneName,
            recentHistory
          });
          if (generated) text = generated;
        }

        if (text) {
          addVisit({
            poiName: target.place.displayName?.text || '',
            placeId: target.place.id,
            lat: target.place.location.latitude,
            lng: target.place.location.longitude,
            narration: text
          });

          if (config.voiceEnabled) {
            playNarration(text);
          } else {
            // If voice is disabled, just set the time now
            lastNarrationTime.current = Date.now();
          }
        }
      } else {
        // Checked, but nothing new to say. Wait 15 seconds before checking again to avoid rate limits.
        lastNarrationTime.current = Date.now() - (config.narrationInterval * 1000) + 15000;
      }
    } catch (error) {
      console.error("Error in discoverAndNarrate:", error);
    } finally {
      isGeneratingRef.current = false;
    }
  };

  // Main loop for discovering and narrating
  const hasInitialDiscovery = useRef(false);
  useEffect(() => {
    // Fetch suggestions from Google Places API
    fetchGoogleSuggestions(location.lat, location.lng, getSearchRadius(mode));

    if (!hasInitialDiscovery.current) {
      hasInitialDiscovery.current = true;
      discoverAndNarrate(true, false); // Ignore timer for first run, but use cache
    }

    const timerId = setInterval(() => {
      discoverAndNarrate(false, false);
    }, 5000); // Check every 5s
    
    return () => clearInterval(timerId);
  }, [location.lat, location.lng, mode, config.narrationInterval, config.routeLookahead, fetchNearbyPlaces, fetchGoogleSuggestions]);

  // Check if arrived at destination
  useEffect(() => {
    if (destination) {
      const dist = calculateDistance(location.lat, location.lng, destination.location.latitude, destination.location.longitude);
      if (dist < 30) { // 30 meters arrival radius
        if (config.voiceEnabled) playNarration(`You have arrived at ${destination.displayName?.text}.`);
        setDestination(null);
      }
    }
  }, [location, destination, config.voiceEnabled, playNarration]);

  const handleSuggestionClick = async (place: Place) => {
    setDestination(place);
    if (config.voiceEnabled) {
      playNarration(`Navigating to ${place.displayName?.text}. Follow the directions on screen.`);
    }
  };

  const handleQuestion = async (question: string) => {
    if (!places.length) return;
    
    // Find closest place to answer about
    const closest = places.sort((a, b) => {
      const distA = calculateDistance(location.lat, location.lng, a.location.latitude, a.location.longitude);
      const distB = calculateDistance(location.lat, location.lng, b.location.latitude, b.location.longitude);
      return distA - distB;
    })[0];

    const cardinalDirection = getCardinalDirection(location.heading || 0);
    const targetBearing = calculateBearing(location.lat, location.lng, closest.location.latitude, closest.location.longitude);
    const relativeDirection = getRelativeDirection(location.heading, targetBearing);
    const distance = calculateDistance(location.lat, location.lng, closest.location.latitude, closest.location.longitude);

    const text = await generateNarration(closest, {
      transportMode: mode,
      speed: location.speed,
      cardinalDirection,
      distance,
      relativeDirection,
      zoneName,
      recentHistory: '',
      question
    });

    if (text && config.voiceEnabled) {
      playNarration(text);
    }
  };

  return (
    <div className="h-screen flex flex-col max-w-md mx-auto bg-bg relative overflow-hidden">
      {rateLimitWarning && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-full text-sm font-medium z-50 animate-fade-in shadow-lg whitespace-nowrap">
          Límite de consultas (máx 3 por minuto). Espera un momento.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-surface/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg">Guía Viva</h1>
          {isSpeaking ? (
            <div className="flex items-end gap-[2px] h-4">
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
            </div>
          ) : isProcessing ? (
            <Loader2 size={16} className="text-primary animate-spin" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-dot"></div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowConfig(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <Settings size={20} />
          </button>
          <button onClick={onStop} className="p-2 hover:bg-danger/20 text-danger rounded-full transition-colors">
            <Square size={20} fill="currentColor" />
          </button>
        </div>
      </div>

      <GPSBar location={location} zoneName={zoneName} />
      
      <div className="p-4 z-10">
        <MovementBar mode={mode} speed={location.speed} heading={location.heading} />
      </div>

      {destination && (
        <NavigationBanner 
          destination={destination} 
          location={location} 
          onCancel={() => setDestination(null)} 
        />
      )}

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-48 custom-scrollbar">
        {narrations.length === 0 && !isProcessing && (
          <div className="h-full flex flex-col items-center justify-center text-text/40 text-center">
            <div className="w-16 h-16 border-2 border-dashed border-white/10 rounded-full flex items-center justify-center mb-4">
              <MapPin size={24} />
            </div>
            <p>Exploring area...</p>
            <p className="text-xs mt-2">Narration will start when points of interest are found.</p>
          </div>
        )}
        {narrations.map(record => (
          <NarrationCard 
            key={record.id} 
            record={record} 
            onReplay={(text) => playNarration(text)}
            onSave={(id) => console.log('Save', id)}
          />
        ))}
      </div>

      {/* Footer Input */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-bg via-bg to-bg z-20 flex flex-col gap-3">
        
        <button 
          onClick={() => discoverAndNarrate(true, true)}
          disabled={isProcessing || isSpeaking}
          className="w-full bg-primary/20 text-primary hover:bg-primary/30 py-3 rounded-xl flex justify-center items-center gap-2 transition-colors disabled:opacity-50 font-bold shadow-lg border border-primary/30 animate-fade-up"
        >
          <Compass size={18} /> Tell me what's around here
        </button>

        {suggestions.length > 0 && (
          <div className="animate-fade-up">
            <div className="text-[10px] font-bold text-text/60 uppercase mb-2 px-1 flex items-center gap-1">
              <Star size={10} /> Google Places Suggestions
            </div>
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 px-1">
              {suggestions.map(place => (
                <button 
                  key={place.id} 
                  onClick={() => handleSuggestionClick(place)} 
                  disabled={destination?.id === place.id}
                  className={`bg-surface border ${destination?.id === place.id ? 'border-primary' : 'border-white/10 hover:bg-white/5'} rounded-xl p-3 min-w-[140px] max-w-[140px] text-left flex-shrink-0 transition-colors disabled:opacity-50`}
                >
                  <div className="font-bold text-sm truncate">{place.displayName?.text}</div>
                  <div className="text-xs text-text/60 truncate capitalize flex items-center justify-between mt-1">
                    <span>{place.types?.[0]?.replace(/_/g, ' ')}</span>
                    {destination?.id === place.id && <Route size={12} className="text-primary" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <QuestionInput onSubmit={handleQuestion} disabled={isProcessing} />
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

// Helper for bearing since it's used here but defined in geo.ts
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const λ1 = (lon1 * Math.PI) / 180;
  const λ2 = (lon2 * Math.PI) / 180;

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  
  return ((θ * 180) / Math.PI + 360) % 360;
}
