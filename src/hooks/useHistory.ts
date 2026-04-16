// src/hooks/useHistory.ts
import { useState, useEffect, useCallback } from 'react';

export interface VisitRecord {
  id?: string;
  poiName: string;
  placeId: string;
  lat: number;
  lng: number;
  narration: string;
  timestamp: number; // Use number for local timestamp
}

export function useHistory() {
  const [visitedPlaces, setVisitedPlaces] = useState<VisitRecord[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [interests, setInterests] = useState<string[]>(['History', 'Culture', 'Architecture']);
  const [userId, setUserId] = useState<string | null>('guest-user');

  // Load from localStorage on mount
  useEffect(() => {
    const savedVisits = localStorage.getItem('guia_viva_visits');
    if (savedVisits) {
      try {
        setVisitedPlaces(JSON.parse(savedVisits));
      } catch (e) {
        console.error("Failed to parse saved visits", e);
      }
    }

    const savedInterests = localStorage.getItem('guia_viva_interests');
    if (savedInterests) {
      try {
        setInterests(JSON.parse(savedInterests));
      } catch (e) {
        console.error("Failed to parse saved interests", e);
      }
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem('guia_viva_visits', JSON.stringify(visitedPlaces));
  }, [visitedPlaces]);

  useEffect(() => {
    localStorage.setItem('guia_viva_interests', JSON.stringify(interests));
  }, [interests]);

  const addVisit = useCallback(async (visit: Omit<VisitRecord, 'timestamp' | 'id'>) => {
    const newVisit: VisitRecord = {
      ...visit,
      id: Date.now().toString(),
      timestamp: Date.now()
    };
    setVisitedPlaces(prev => [newVisit, ...prev]);
  }, []);

  const saveInterests = useCallback(async (newInterests: string[]) => {
    setInterests(newInterests);
  }, []);

  const hasVisitedRecently = useCallback((placeId: string) => {
    const now = Date.now();
    const recentVisit = visitedPlaces.find(v => 
      v.placeId === placeId && 
      (now - v.timestamp) < 20 * 60 * 1000 // 20 minutes
    );
    return !!recentVisit;
  }, [visitedPlaces]);

  return { visitedPlaces, favorites, interests, addVisit, saveInterests, hasVisitedRecently, userId };
}
