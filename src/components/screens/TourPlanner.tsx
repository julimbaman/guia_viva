import { useState, useEffect } from 'react';
import { ArrowLeft, Save, MapPin, Loader2, Plus, Minus, Search } from 'lucide-react';
import { LocationData } from '../../hooks/useGPS';
import { Place } from '../../hooks/usePlaces';
import { db, auth } from '../../firebase';
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { AppConfig } from '../ConfigPanel';

interface TourPlannerProps {
  location: LocationData;
  zoneName: string;
  config: AppConfig;
  fetchNearbyPlaces: (lat: number, lng: number, radius: number, types?: string[], currentZone?: string, force?: boolean) => Promise<any[]>;
  searchPlacesText: (query: string, lat?: number, lng?: number) => Promise<any[]>;
  onBack: () => void;
}

export function TourPlanner({ location, zoneName, config, fetchNearbyPlaces, searchPlacesText, onBack }: TourPlannerProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<Place[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Place[] | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadPlaces = async () => {
      setIsLoadingPlaces(true);
      try {
        const types = config.interests.length > 0 ? config.interests : undefined;
        const data = await fetchNearbyPlaces(location.lat, location.lng, 1000, types, zoneName, false);
        if (mounted) {
          setPlaces(data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setIsLoadingPlaces(false);
      }
    };
    loadPlaces();
    return () => { mounted = false; };
  }, [location.lat, location.lng, zoneName, config.interests, fetchNearbyPlaces]);

  const togglePlace = (place: Place) => {
    if (selectedPlaces.find(p => p.id === place.id)) {
      setSelectedPlaces(selectedPlaces.filter(p => p.id !== place.id));
    } else {
      if (selectedPlaces.length < 50) {
        setSelectedPlaces([...selectedPlaces, place]);
      }
    }
  };

  const handleSearch = async (e: any) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchPlacesText(searchQuery, location.lat, location.lng);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const currentDisplayPlaces = searchResults || places;

  // Option 2: local filter as they type and only fetch when enter is pressed:
  // We can let them search API with enter, but if no search results and searchQuery exists, filter locally.
  const filteredPlaces = searchQuery && !searchResults 
    ? places.filter(p => p.displayName?.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : currentDisplayPlaces;

  // Clear search if query becomes empty
  useEffect(() => {
    if (!searchQuery.trim()) setSearchResults(null);
  }, [searchQuery]);

  const handleSave = async () => {
    if (!title.trim() || selectedPlaces.length === 0) return;
    if (!auth.currentUser) return;

    setIsSaving(true);
    const routeRef = doc(collection(db, 'tour_routes'));
    const docId = routeRef.id;

    try {
      const routeData: any = {
        title: title.trim(),
        creatorId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        pois: selectedPlaces.map(p => {
          const obj: any = { 
            id: p.id,
            displayName: p.displayName || { text: p.id },
            location: p.location || { latitude: 0, longitude: 0 }
          };
          if (p.types !== undefined) obj.types = p.types;
          if (p.rating !== undefined) obj.rating = p.rating;
          if (p.userRatingCount !== undefined) obj.userRatingCount = p.userRatingCount;
          if (p.formattedAddress !== undefined) obj.formattedAddress = p.formattedAddress;
          if (p.editorialSummary !== undefined) obj.editorialSummary = p.editorialSummary;
          if (p.pregeneratedNarration !== undefined) obj.pregeneratedNarration = p.pregeneratedNarration;
          if (p.photos !== undefined) obj.photos = p.photos;
          if (p.regularOpeningHours !== undefined) obj.regularOpeningHours = p.regularOpeningHours;
          return obj;
        }),
        isPublic: isPublic,
        type: 'personalized'
      };
      if (description.trim()) {
        routeData.description = description.trim();
      }
      
      await setDoc(routeRef, routeData);
      alert('Tour Route saved successfully!');
      onBack();
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.CREATE, `tour_routes/${docId}`);
      alert('Failed to save Tour Route');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-bg max-w-md mx-auto">
      <div className="flex items-center justify-between p-4 bg-surface/80 backdrop-blur-md z-10 border-b border-white/10">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-lg">Create Tour Route</h1>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text/60 mb-1">Route Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-surface border border-white/20 rounded-xl px-4 py-3 text-text outline-none focus:border-primary transition-colors"
              placeholder="e.g. Historic Downtown Walk"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text/60 mb-1">Description (Optional)</label>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-surface border border-white/20 rounded-xl px-4 py-3 text-text outline-none focus:border-primary transition-colors resize-none h-24 custom-scrollbar"
              placeholder="A brief description of this route..."
            />
          </div>
          <div className="flex justify-between items-center bg-surface border border-white/10 rounded-xl p-4">
            <div>
              <div className="font-bold">Public Route</div>
              <div className="text-sm text-text/60">Allow others to see and take this route</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={isPublic} onChange={() => setIsPublic(!isPublic)} />
              <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Select Points of Interest</h2>
            <span className="text-sm text-primary font-bold">{selectedPlaces.length}/50</span>
          </div>

          <form onSubmit={handleSearch} className="mb-4 relative">
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search e.g. Eiffel Tower Paris..."
              className="w-full bg-surface border border-white/20 rounded-xl py-3 pl-10 pr-4 text-text outline-none focus:border-primary transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" size={18} />
            <button 
              type="submit"
              disabled={isSearching}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary/20 text-primary px-3 py-1 rounded-lg text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              {isSearching ? <Loader2 size={16} className="animate-spin" /> : 'Find'}
            </button>
          </form>
          
          {isLoadingPlaces && !searchResults && !isSearching ? (
            <div className="flex flex-col items-center justify-center p-8 text-text/50">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p>Finding nearby places...</p>
            </div>
          ) : filteredPlaces.length === 0 ? (
            <div className="text-center p-8 bg-surface/50 border border-white/10 rounded-xl text-text/50">
              <MapPin className="mx-auto w-8 h-8 mb-2 opacity-50" />
              <p>{searchQuery ? 'No places found matching your search. Try pressing Find to search online.' : 'No places found nearby. Try moving to a different location.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPlaces.map(place => {
                const isSelected = selectedPlaces.some(p => p.id === place.id);
                return (
                  <button 
                    key={place.id}
                    onClick={() => togglePlace(place)}
                    className={`w-full text-left p-4 rounded-xl border flex items-center justify-between transition-colors ${
                      isSelected 
                        ? 'bg-primary/20 border-primary shadow-[0_0_15px_rgba(34,211,167,0.15)]' 
                        : 'bg-surface border-white/10 hover:border-white/30'
                    }`}
                  >
                    {place.photos?.[0]?.name && (
                      <img 
                        src={`https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=100&maxWidthPx=100&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover mr-3 flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 pr-4 truncate">
                      <h3 className="font-bold text-sm truncate">{place.displayName?.text}</h3>
                      {place.formattedAddress && (
                        <p className="text-xs text-text/80 truncate mt-0.5">{place.formattedAddress}</p>
                      )}
                      <p className="text-[10px] text-text/50 uppercase tracking-wider mt-1 line-clamp-1">{place.types?.[0]?.replace(/_/g, ' ')}</p>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-primary text-bg' : 'bg-white/10 text-white'}`}>
                      {isSelected ? <Minus size={16} /> : <Plus size={16} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-surface/80 border-t border-white/10 backdrop-blur-md">
        <button
          onClick={handleSave}
          disabled={!title.trim() || selectedPlaces.length === 0 || isSaving}
          className="w-full bg-primary text-bg font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          {isSaving ? 'Saving Route...' : 'Save Tour Route'}
        </button>
      </div>
    </div>
  );
}
