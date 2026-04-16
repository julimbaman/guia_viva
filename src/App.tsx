import { useState, useEffect } from 'react';
import { useGPS } from './hooks/useGPS';
import { usePlaces } from './hooks/usePlaces';
import { AppConfig } from './components/ConfigPanel';
import { GPSWait } from './components/screens/GPSWait';
import { Home } from './components/screens/Home';
import { Countdown } from './components/screens/Countdown';
import { Active } from './components/screens/Active';
import { auth, signInWithGoogle } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

type AppState = 'waiting' | 'home' | 'countdown' | 'active';

const DEFAULT_CONFIG: AppConfig = {
  interests: ['History', 'Culture', 'Architecture'],
  voiceEnabled: true,
  narrationInterval: 30,
  routeLookahead: 30,
};

const APP_VERSION = "v1.1.0";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [appState, setAppState] = useState<AppState>('waiting');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const { location, error, isWaiting, retry } = useGPS();
  const { 
    places, 
    suggestions, 
    zoneName, 
    isLoading: isPlacesLoading,
    fetchNearbyPlaces, 
    reverseGeocode, 
    fetchGoogleSuggestions 
  } = usePlaces();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (location && appState === 'waiting') {
      setAppState('home');
    }
  }, [location, appState]);

  useEffect(() => {
    if (location) {
      reverseGeocode(location.lat, location.lng);
    }
  }, [location, reverseGeocode]);

  const renderScreen = () => {
    if (authLoading) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-bg text-text">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p>Loading...</p>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-bg text-text p-6">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-6">
            <span className="text-4xl">🗺️</span>
          </div>
          <h1 className="text-3xl font-bold mb-2 text-center">Guía Viva</h1>
          <p className="text-text/60 text-center mb-8">Your personal AI tour guide.</p>
          <button 
            onClick={signInWithGoogle}
            className="bg-white text-black font-bold py-3 px-6 rounded-full flex items-center gap-3 hover:bg-gray-200 transition-colors"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      );
    }

    if (isWaiting || !location) {
      return <GPSWait error={error} onRetry={retry} />;
    }

    switch (appState) {
      case 'home':
        return (
          <Home 
            location={location} 
            zoneName={zoneName} 
            config={config} 
            onConfigChange={setConfig} 
            onStart={() => setAppState('countdown')} 
          />
        );
      case 'countdown':
        return (
          <Countdown 
            location={location} 
            zoneName={zoneName} 
            fetchNearbyPlaces={fetchNearbyPlaces}
            fetchGoogleSuggestions={fetchGoogleSuggestions}
            onComplete={() => setAppState('active')} 
          />
        );
      case 'active':
        return (
          <Active 
            location={location} 
            zoneName={zoneName} 
            config={config} 
            places={places}
            suggestions={suggestions}
            fetchNearbyPlaces={fetchNearbyPlaces}
            fetchGoogleSuggestions={fetchGoogleSuggestions}
            onConfigChange={setConfig} 
            onStop={() => setAppState('home')} 
          />
        );
      default:
        return <GPSWait error="Invalid state" onRetry={() => setAppState('waiting')} />;
    }
  };

  return (
    <>
      {renderScreen()}
      <div className="fixed bottom-1 right-2 text-[10px] text-white/30 z-[9999] pointer-events-none font-mono">
        {APP_VERSION}
      </div>
    </>
  );
}
