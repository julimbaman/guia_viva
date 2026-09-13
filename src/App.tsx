import { useState, useEffect } from 'react';
import { useGPS } from './hooks/useGPS';
import { usePlaces } from './hooks/usePlaces';
import { AppConfig, ConfigPanel } from './components/ConfigPanel';
import { GPSWait } from './components/screens/GPSWait';
import { Home } from './components/screens/Home';
import { Countdown } from './components/screens/Countdown';
import { Active } from './components/screens/Active';
import { TourPlanner } from './components/screens/TourPlanner';
import { Login } from './components/screens/Login';
import { BottomNavigation } from './components/BottomNavigation';
import { Onboarding } from './components/screens/Onboarding';
import { ToursList } from './components/screens/ToursList';
import { ActiveTour } from './components/screens/ActiveTour';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { checkAdminStatus } from './hooks/useAdminStatus';
import { ApiTrackerProvider } from './hooks/useApiTracker';
import { Loader2, BarChart2, ShieldCheck } from 'lucide-react';
import { ApiStatsModal } from './components/screens/ApiStatsModal';
import { DebugExplorer } from './components/screens/DebugExplorer';
import { AdminPanel } from './components/screens/AdminPanel';
import { formatBuildLabel } from './buildInfo';

type AppState = 'waiting' | 'home' | 'countdown' | 'active' | 'tour_planner' | 'tours_list' | 'active_tour';

const DEFAULT_CONFIG: AppConfig = {
  interests: ['History', 'Culture', 'Architecture'],
  voiceEnabled: true,
  narrationInterval: 30,
  routeLookahead: 30,
};

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [appState, setAppState] = useState<AppState>('waiting');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedTour, setSelectedTour] = useState<any>(null);
  const { location, error, isWaiting, retry } = useGPS();
  const {
    places,
    suggestions,
    zoneName,
    isLoading: isPlacesLoading,
    rawResults,
    fetchNearbyPlaces,
    reverseGeocode,
    fetchGoogleSuggestions,
    searchPlacesText,
    globalBudgetExceeded
  } = usePlaces();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (!userDoc.exists() || !userDoc.data()?.onboardingComplete) {
            setNeedsOnboarding(true);
          } else {
            setNeedsOnboarding(false);
          }
        } catch (e) {
          console.error(e);
          setNeedsOnboarding(true);
        }

        // Admin status is optional and non-critical to the main flow, so a
        // denied/failed check just means "not admin" rather than blocking login.
        setIsAdmin(await checkAdminStatus(currentUser));
      } else {
        setNeedsOnboarding(false);
        setIsAdmin(false);
      }
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

  // Gives the admin panel a real, bookmarkable URL (/admin) even though the
  // rest of the app is a single in-memory state machine with no router.
  useEffect(() => {
    if (!authLoading && isAdmin && window.location.pathname === '/admin') {
      setShowAdmin(true);
    }
  }, [authLoading, isAdmin]);

  const openAdmin = () => {
    window.history.pushState(null, '', '/admin');
    setShowAdmin(true);
  };

  const closeAdmin = () => {
    window.history.pushState(null, '', '/');
    setShowAdmin(false);
  };

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
      return <Login />;
    }

    if (needsOnboarding) {
      return <Onboarding onComplete={() => setNeedsOnboarding(false)} />;
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
            onTourList={() => setAppState('tours_list')}
            onTourPlanner={() => setAppState('tour_planner')}
            onSettings={() => setShowConfig(true)}
          />
        );
      case 'countdown':
        return (
          <Countdown 
            location={location} 
            zoneName={zoneName} 
            config={config}
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
            globalBudgetExceeded={globalBudgetExceeded}
            onConfigChange={setConfig}
            onStop={() => setAppState('home')}
            onOpenDebug={() => setShowDebug(true)}
          />
        );
      case 'tour_planner':
        return (
          <TourPlanner 
            location={location}
            zoneName={zoneName}
            config={config}
            fetchNearbyPlaces={fetchNearbyPlaces}
            searchPlacesText={searchPlacesText}
            onBack={() => setAppState('home')}
          />
        );
      case 'tours_list':
        return (
          <ToursList
            onBack={() => setAppState('home')}
            onCreateTour={() => setAppState('tour_planner')}
            onSelectTour={(tour) => {
              setSelectedTour(tour);
              setAppState('active_tour');
            }}
          />
        );
      case 'active_tour':
        return (
          <ActiveTour
            tour={selectedTour}
            location={location}
            onStop={() => {
              setSelectedTour(null);
              setAppState('home');
            }}
          />
        );
      default:
        return <GPSWait error="Invalid state" onRetry={() => setAppState('waiting')} />;
    }
  };

  return (
    <>
      <div className={user && !needsOnboarding && !authLoading && ['home', 'tour_planner', 'tours_list'].includes(appState) ? "pb-20" : ""}>
        {renderScreen()}
      </div>
      {user && !needsOnboarding && !authLoading && ['home', 'tour_planner', 'tours_list'].includes(appState) && (
        <BottomNavigation 
          currentTab={appState} 
          onTabChange={(tab) => {
            if (tab === 'settings') {
              setShowConfig(true);
            } else {
              setAppState(tab as AppState);
            }
          }} 
        />
      )}
      {showConfig && (
        <ConfigPanel 
          config={config} 
          onChange={setConfig} 
          onClose={() => setShowConfig(false)} 
          onOpenDebug={() => {
            setShowConfig(false);
            setShowDebug(true);
          }}
        />
      )}
      {showDebug && (
        <DebugExplorer 
          data={rawResults} 
          onClose={() => setShowDebug(false)} 
        />
      )}
      {user && (
        <button
          onClick={() => setShowStats(true)}
          className="fixed top-4 left-4 z-[9900] bg-surface/80 backdrop-blur-md p-2 rounded-full border border-white/10 text-text/80 hover:text-white"
        >
          <BarChart2 className="w-5 h-5" />
        </button>
      )}
      {isAdmin && (
        <button
          onClick={openAdmin}
          className="fixed top-4 left-16 z-[9900] bg-surface/80 backdrop-blur-md p-2 rounded-full border border-white/10 text-primary hover:text-white"
          title="Panel de administración"
        >
          <ShieldCheck className="w-5 h-5" />
        </button>
      )}
      {showStats && <ApiStatsModal onClose={() => setShowStats(false)} />}
      {showAdmin && <AdminPanel onClose={closeAdmin} />}
      <div
        className="fixed bottom-1 right-2 text-[10px] text-white/50 z-[9999] pointer-events-none font-mono bg-black/40 px-1.5 py-0.5 rounded"
        title="Commit · fecha de build — úsalo para confirmar qué versión del código está corriendo"
      >
        {formatBuildLabel()}
      </div>
    </>
  );
}

export default function App() {
  return (
    <ApiTrackerProvider>
      <AppContent />
    </ApiTrackerProvider>
  );
}
