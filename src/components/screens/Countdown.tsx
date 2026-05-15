import { useState, useEffect, useRef } from 'react';
import { LocationData } from '../../hooks/useGPS';

import { AppConfig } from '../ConfigPanel';

interface CountdownProps {
  location: LocationData;
  zoneName: string;
  config: AppConfig;
  fetchNearbyPlaces: (lat: number, lng: number, radius: number, types?: string[], currentZone?: string, force?: boolean) => Promise<any[]>;
  fetchGoogleSuggestions: (lat: number, lng: number, radius: number, types?: string[]) => Promise<void>;
  onComplete: () => void;
}

interface DiagnosticResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  details: string;
}

export function Countdown({ location, zoneName, config, fetchNearbyPlaces, fetchGoogleSuggestions, onComplete }: CountdownProps) {
  const [count, setCount] = useState(10);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([
    { name: 'GPS Location', status: 'pending', details: 'Checking...' },
    { name: 'Geocoding (Zone)', status: 'pending', details: 'Checking...' },
    { name: 'Google Places (Suggestions)', status: 'pending', details: 'Checking...' },
    { name: 'Google Places + OpenAI (Nearby POIs)', status: 'pending', details: 'Checking...' }
  ]);

  useEffect(() => {
    if (count <= 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, onComplete]);

  const hasRunDiagnostics = useRef(false);

  // Typewriter effect logic
  const PHRASES = [
    "Despertando a tu guía turístico personal...",
    "Descubriendo los secretos de tu entorno...",
    "Escribiendo historias únicas con IA...",
    "¡Prepárate para una experiencia inolvidable!"
  ];
  const [displayedText, setDisplayedText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (count > 7) setPhraseIndex(0);
    else if (count > 4) setPhraseIndex(1);
    else if (count > 1) setPhraseIndex(2);
    else setPhraseIndex(3);
  }, [count]);

  useEffect(() => {
    setDisplayedText('');
    let i = 0;
    const phrase = PHRASES[phraseIndex];
    const timer = setInterval(() => {
      if (i < phrase.length) {
        setDisplayedText(phrase.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 40);
    return () => clearInterval(timer);
  }, [phraseIndex]);

  useEffect(() => {
    const runDiagnostics = async () => {
      if (hasRunDiagnostics.current) return;
      hasRunDiagnostics.current = true;
      
      // 1. GPS
      setDiagnostics(prev => prev.map(d => d.name === 'GPS Location' ? {
        name: 'GPS Location',
        status: location.lat !== 0 ? 'success' : 'error',
        details: location.lat !== 0 ? `Lat: ${location.lat.toFixed(4)}, Lng: ${location.lng.toFixed(4)}` : 'No GPS signal'
      } : d));

      // 2. Geocoding
      try {
        const geoRes = await fetch(`/api/geocode?lat=${location.lat}&lng=${location.lng}`);
        const text = await geoRes.text();
        let geoData: any = { error: 'Invalid JSON' };
        try { geoData = JSON.parse(text); } catch(e) {}
        setDiagnostics(prev => prev.map(d => d.name === 'Geocoding (Zone)' ? {
          name: 'Geocoding (Zone)',
          status: geoRes.ok ? 'success' : 'error',
          details: geoRes.ok ? `Zone: ${geoData.zoneName}` : `Error: ${geoData.error || 'Unknown'}`
        } : d));
      } catch (e: any) {
        setDiagnostics(prev => prev.map(d => d.name === 'Geocoding (Zone)' ? { name: 'Geocoding (Zone)', status: 'error', details: e.message } : d));
      }

      // 3. Google Places (using hook function for caching)
      try {
        await fetchGoogleSuggestions(location.lat, location.lng, 500, config.interests.length > 0 ? config.interests : undefined);
        setDiagnostics(prev => prev.map(d => d.name === 'Google Places (Suggestions)' ? {
          name: 'Google Places (Suggestions)',
          status: 'success',
          details: 'Suggestions loaded and cached'
        } : d));
      } catch (e: any) {
        setDiagnostics(prev => prev.map(d => d.name === 'Google Places (Suggestions)' ? { name: 'Google Places (Suggestions)', status: 'error', details: e.message } : d));
      }

      // 4. OpenAI POIs (using hook function for caching and Firebase saving)
      try {
        const places = await fetchNearbyPlaces(location.lat, location.lng, 500, config.interests.length > 0 ? config.interests : undefined, zoneName, true);
        setDiagnostics(prev => prev.map(d => d.name === 'Google Places + OpenAI (Nearby POIs)' ? {
          name: 'Google Places + OpenAI (Nearby POIs)',
          status: places.length > 0 ? 'success' : 'error',
          details: places.length > 0 ? `Found ${places.length} places (Cached in Firebase)` : 'No places found'
        } : d));
      } catch (e: any) {
        setDiagnostics(prev => prev.map(d => d.name === 'Google Places + OpenAI (Nearby POIs)' ? { name: 'Google Places + OpenAI (Nearby POIs)', status: 'error', details: e.message } : d));
      }
    };

    if (location.lat !== 0) {
      runDiagnostics();
    }
  }, [location.lat, location.lng, zoneName, config.interests, fetchNearbyPlaces, fetchGoogleSuggestions]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <div className="text-text/60 mb-4">
        <div className="text-xl font-medium text-info mb-2">{zoneName}</div>
        <div className="font-mono text-sm">
          {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
        </div>
      </div>

      <div className="relative w-32 h-32 flex items-center justify-center mb-6">
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle 
            cx="64" cy="64" r="60" 
            fill="none" 
            stroke="rgba(255,255,255,0.1)" 
            strokeWidth="4" 
          />
          <circle 
            cx="64" cy="64" r="60" 
            fill="none" 
            stroke="#22d3a7" 
            strokeWidth="4" 
            strokeDasharray={2 * Math.PI * 60}
            strokeDashoffset={2 * Math.PI * 60 * (1 - count / 10)}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="text-5xl font-mono font-bold text-primary animate-pulse">{count}</div>
      </div>

      {/* Typewriter Text */}
      <div className="h-16 flex items-center justify-center mb-6 px-4">
        <p className="text-primary font-medium text-lg leading-tight">
          {displayedText}
          <span className="animate-pulse">|</span>
        </p>
      </div>

      {/* Diagnostics Panel */}
      <div className="w-full bg-surface/50 border border-white/10 rounded-xl p-4 mb-6 text-left">
        <h3 className="text-sm font-bold mb-3 text-text/80 uppercase tracking-wider">System Diagnostics</h3>
        <div className="space-y-3">
          {diagnostics.map((diag, i) => (
            <div key={i} className="flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{diag.name}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  diag.status === 'pending' ? 'bg-white/10 text-white/60' :
                  diag.status === 'success' ? 'bg-primary/20 text-primary' :
                  'bg-danger/20 text-danger'
                }`}>
                  {diag.status.toUpperCase()}
                </span>
              </div>
              <span className="text-xs text-text/60 mt-1 truncate">{diag.details}</span>
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={onComplete}
        className="text-text/60 hover:text-text font-medium py-3 px-8 rounded-full border border-white/10 hover:bg-white/5 transition-colors"
      >
        Skip
      </button>
    </div>
  );
}
