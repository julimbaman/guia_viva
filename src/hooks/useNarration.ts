// src/hooks/useNarration.ts
import { useState, useCallback } from 'react';
import { TTS } from '../utils/tts';
import { Place } from './usePlaces';
import { TransportMode } from '../utils/movement';
import { useApiTracker } from './useApiTracker';

export interface NarrationRecord {
  id: string;
  place: Place;
  text: string;
  timestamp: number;
  isQuestionAnswer?: boolean;
}

export function useNarration() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [narrations, setNarrations] = useState<NarrationRecord[]>([]);
  const { trackCall } = useApiTracker();

  const generateNarration = useCallback(async (
    place: Place,
    context: {
      transportMode: TransportMode;
      speed: number;
      cardinalDirection: string;
      distance: number;
      relativeDirection: string;
      zoneName: string;
      recentHistory: string;
      question?: string;
    }
  ) => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transport_mode: context.transportMode,
          speed: (context.speed * 3.6).toFixed(1), // m/s to km/h
          cardinal_direction: context.cardinalDirection,
          poi_name: place.displayName?.text || 'Unknown Place',
          poi_type: place.types?.[0] || 'place',
          distance: Math.round(context.distance),
          relative_direction: context.relativeDirection,
          editorial_summary: place.editorialSummary?.text || '',
          rating: place.rating || 0,
          num_reviews: place.userRatingCount || 0,
          is_open: place.regularOpeningHours?.openNow ? 'Yes' : 'No',
          time: new Date().toLocaleTimeString(),
          zone_name: context.zoneName,
          recent_history: context.recentHistory,
          max_sentences: context.transportMode === 'vehicle' ? 2 : 3,
          question: context.question
        })
      });
      
      trackCall('openAI');

      if (!response.ok) throw new Error('Narration generation failed');
      
      const resText = await response.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch(e) {
        throw new Error('Invalid JSON from narration endpoint');
      }
      const text = data.narration;

      const newRecord: NarrationRecord = {
        id: Date.now().toString(),
        place,
        text,
        timestamp: Date.now(),
        isQuestionAnswer: !!context.question
      };

      setNarrations(prev => [newRecord, ...prev]);
      
      return text;
    } catch (error) {
      console.error(error);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const playNarration = useCallback((text: string) => {
    setIsSpeaking(true);
    TTS.speak(text, () => setIsSpeaking(false));
  }, []);

  const stopNarration = useCallback(() => {
    TTS.stop();
    setIsSpeaking(false);
  }, []);

  const addNarrationRecord = useCallback((place: Place, text: string, isQuestionAnswer = false) => {
    const newRecord: NarrationRecord = {
      id: Date.now().toString(),
      place,
      text,
      timestamp: Date.now(),
      isQuestionAnswer
    };
    setNarrations(prev => [newRecord, ...prev]);
    return newRecord;
  }, []);

  return { isProcessing, isSpeaking, narrations, generateNarration, addNarrationRecord, playNarration, stopNarration };
}
