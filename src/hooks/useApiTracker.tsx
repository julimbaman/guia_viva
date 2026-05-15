import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export interface DailyUsage {
  googlePlaces: number;
  openAI: number;
  totalLimit: number;
}

interface TrackerContextType {
  dailyUsage: DailyUsage;
  trackCall: (type: 'googlePlaces' | 'openAI') => Promise<void>;
  reachedDailyLimit: boolean;
}

const TrackerContext = createContext<TrackerContextType | null>(null);

export const ApiTrackerProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ googlePlaces: 0, openAI: 0, totalLimit: 100 });
  const [userId, setUserId] = useState<string | null>(null);

  const getDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUserId(user?.uid || null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const fetchUsage = async () => {
      if (!userId) return;
      const ref = doc(db, 'users', userId, 'api_usage', getDateStr());
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setDailyUsage(prev => ({
            ...prev,
            googlePlaces: data.googlePlaces || 0,
            openAI: data.openAI || 0,
          }));
        } else {
          setDailyUsage(prev => ({ ...prev, googlePlaces: 0, openAI: 0 }));
        }
      } catch (e) {
        console.error("Error fetching usage", e);
        handleFirestoreError(e, OperationType.GET, `users/${userId}/api_usage/${getDateStr()}`);
      }
    };
    
    fetchUsage();
  }, [userId]);

  const trackCall = useCallback(async (type: 'googlePlaces' | 'openAI') => {
    // Optimistic update
    setDailyUsage(prev => ({ ...prev, [type]: prev[type] + 1 }));

    if (!userId) return;
    const ref = doc(db, 'users', userId, 'api_usage', getDateStr());
    try {
      await setDoc(ref, {
        [type]: increment(1),
        lastCallAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("Error saving usage metrics", e);
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}/api_usage/${getDateStr()}`);
    }
  }, [userId]);

  // If combined total of both APIs reaches the limit, or just treating OpenAI as the primary limit?
  // Usually, daily limits apply to combined or individually. Let's say combined (since 100 per day total).
  const reachedDailyLimit = (dailyUsage.googlePlaces + dailyUsage.openAI) >= dailyUsage.totalLimit;

  return (
    <TrackerContext.Provider value={{ dailyUsage, trackCall, reachedDailyLimit }}>
      {children}
    </TrackerContext.Provider>
  );
};

export function useApiTracker() {
  const context = useContext(TrackerContext);
  if (!context) {
    throw new Error('useApiTracker must be used within an ApiTrackerProvider');
  }
  return context;
}
