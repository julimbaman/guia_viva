import { Loader2, MapPinOff, ExternalLink } from 'lucide-react';

interface GPSWaitProps {
  error: string | null;
  onRetry: () => void;
}

export function GPSWait({ error, onRetry }: GPSWaitProps) {
  const isIframe = window !== window.parent;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      {error ? (
        <div className="animate-fade-up flex flex-col items-center">
          <div className="w-16 h-16 bg-danger/20 text-danger rounded-full flex items-center justify-center mb-6">
            <MapPinOff size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">Location Error</h2>
          <p className="text-text/70 mb-8 max-w-xs leading-relaxed">{error}</p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button 
              onClick={onRetry}
              className="bg-primary text-bg font-bold py-3 px-8 rounded-full hover:bg-primary/90 transition-colors w-full"
            >
              Retry
            </button>
            {isIframe && (
              <button 
                onClick={() => window.open(window.location.href, '_blank')}
                className="bg-surface border border-white/10 text-text font-bold py-3 px-8 rounded-full hover:bg-white/5 transition-colors flex items-center justify-center gap-2 w-full"
              >
                <ExternalLink size={18} /> Open in New Tab
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
            <div className="w-16 h-16 bg-surface border-2 border-primary rounded-full flex items-center justify-center relative z-10">
              <Loader2 className="text-primary animate-spin" size={32} />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2">Getting your location...</h2>
          <p className="text-text/70 max-w-xs">Accept the location permission when the browser asks.</p>
        </div>
      )}
    </div>
  );
}
