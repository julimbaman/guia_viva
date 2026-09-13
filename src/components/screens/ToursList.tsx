import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Route, User, Globe, MapPin, Plus } from 'lucide-react';
import { db, auth } from '../../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

interface ToursListProps {
  onBack: () => void;
  onCreateTour: () => void;
  onSelectTour: (tour: any) => void;
}

export function ToursList({ onBack, onCreateTour, onSelectTour }: ToursListProps) {
  const [tours, setTours] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'my_tours'>('all');

  useEffect(() => {
    let mounted = true;
    const fetchTours = async () => {
      setLoading(true);
      try {
        const routesRef = collection(db, 'tour_routes');
        // Fetch depending on filter:
        let q;
        if (filter === 'my_tours' && auth.currentUser) {
          q = query(routesRef, where('creatorId', '==', auth.currentUser.uid));
        } else {
          // All tours (actually just isPublic == true or my_tours or system)
          // Since doing complex OR queries is tricky in Firestore without multiple queries,
          // we can just fetch isPublic = true and then my_tours separately and merge them.
          // Due to index reqs, we might just query by isPublic for 'all', or we just trust the rules for now
          // and fetch anything we can read? Firestore doesn't let you query "anything I can read".
          // We'll fetch where type == 'personalized' and isPublic == true, plus my tours.
          const publicQuery = query(routesRef, where('isPublic', '==', true));
          const publicRes = await getDocs(publicQuery);
          
          let myRes: any = { docs: [] };
          if (auth.currentUser) {
            const myQuery = query(routesRef, where('creatorId', '==', auth.currentUser.uid));
            myRes = await getDocs(myQuery);
          }

          if (!mounted) return;
          
          const allToursMap = new Map();
          publicRes.docs.forEach(d => allToursMap.set(d.id, { id: d.id, ...d.data() }));
          myRes.docs.forEach((d: any) => allToursMap.set(d.id, { id: d.id, ...d.data() }));

          const merged = Array.from(allToursMap.values());
          merged.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
          
          setTours(merged);
          setLoading(false);
          return;
        }

        const snapshot = await getDocs(q);
        if (mounted) {
          const list = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
          list.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
          setTours(list);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchTours();
    return () => { mounted = false; };
  }, [filter]);

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative bg-bg text-text">
      <div className="p-4 flex items-center justify-between border-b border-white/5">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-bold text-lg">Guided Tours</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-4 flex gap-2">
        <button 
          onClick={() => setFilter('all')}
          className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors ${filter === 'all' ? 'bg-primary text-bg' : 'bg-surface border-white/10'}`}
        >
          <Globe className="inline mr-2 w-4 h-4" /> All Tours
        </button>
        {auth.currentUser && (
          <button 
            onClick={() => setFilter('my_tours')}
            className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors ${filter === 'my_tours' ? 'bg-primary text-bg' : 'bg-surface border-white/10'}`}
          >
            <User className="inline mr-2 w-4 h-4" /> My Tours
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <button 
          onClick={onCreateTour}
          className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-white/20 rounded-2xl text-text/60 hover:text-white hover:border-white/40 transition-colors"
        >
          <Plus size={20} /> Create New Tour
        </button>

        {loading ? (
          <div className="flex items-center justify-center p-8 text-text/50">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
          </div>
        ) : tours.length === 0 ? (
          <div className="text-center p-8 bg-surface/50 rounded-2xl text-text/50 border border-white/5">
            <Route className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No tours found.</p>
          </div>
        ) : (
          tours.map(tour => {
            const firstPhotoPoi = tour.pois?.find((p: any) => p.photos?.[0]?.name);
            return (
            <div 
              key={tour.id} 
              onClick={() => onSelectTour(tour)}
              className="bg-surface rounded-2xl border border-white/10 cursor-pointer overflow-hidden hover:border-primary/50 transition-colors flex flex-col gap-2"
            >
              {firstPhotoPoi && (
                <div className="w-full h-32 relative">
                  <img 
                    src={`https://places.googleapis.com/v1/${firstPhotoPoi.photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                    alt="Tour cover"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent"></div>
                </div>
              )}
              <div className={`p-4 ${firstPhotoPoi ? 'pt-0' : ''}`}>
                <h3 className="font-bold text-lg text-white">{tour.title}</h3>
                {tour.description && <p className="text-sm text-text/80">{tour.description}</p>}
                
                <div className="flex items-center gap-4 text-xs text-text/50 mt-2">
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {tour.pois?.length || 0} Places
                  </span>
                  <span className="flex items-center gap-1">
                    {tour.isPublic ? <Globe size={12} /> : <User size={12} />} 
                    {tour.isPublic ? 'Public' : 'Private'}
                  </span>
                </div>
              </div>
            </div>
          )})
        )}
      </div>
    </div>
  );
}
