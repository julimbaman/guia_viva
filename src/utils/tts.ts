// src/utils/tts.ts

export class TTS {
  private static synth = window.speechSynthesis;
  private static voice: SpeechSynthesisVoice | null = null;

  static async init() {
    return new Promise<void>((resolve) => {
      const loadVoices = () => {
        const voices = this.synth.getVoices();
        if (voices.length > 0) {
          // Try to find Colombian Spanish, fallback to any Spanish
          this.voice = voices.find(v => v.lang === 'es-CO') || 
                       voices.find(v => v.lang.startsWith('es-')) || 
                       voices[0];
          resolve();
        }
      };

      if (this.synth.getVoices().length > 0) {
        loadVoices();
      } else {
        this.synth.onvoiceschanged = loadVoices;
      }
    });
  }

  static speak(text: string, onEnd?: () => void) {
    if (this.synth.speaking) {
      this.synth.cancel(); // Cancel current speech to start new one immediately
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utterance.voice = this.voice;
    }
    utterance.lang = 'es-CO';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    if (onEnd) {
      utterance.onend = onEnd;
    }

    this.synth.speak(utterance);
  }

  static stop() {
    this.synth.cancel();
  }

  static isSpeaking() {
    return this.synth.speaking;
  }
}
