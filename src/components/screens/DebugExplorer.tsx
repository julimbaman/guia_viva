import { X, Copy, Check, Terminal } from 'lucide-react';
import { useState } from 'react';

interface DebugExplorerProps {
  data: any;
  onClose: () => void;
}

export function DebugExplorer({ data, onClose }: DebugExplorerProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-bg/95 backdrop-blur-md z-[10000] flex flex-col pt-16 px-4 pb-4 sm:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg text-primary">
            <Terminal size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Raw API Results</h2>
            <p className="text-xs text-text/40 font-mono">Evaluation Utility</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={copyToClipboard}
            className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 text-sm"
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <button 
            onClick={onClose} 
            className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-black/40 rounded-2xl border border-white/5 p-4 overflow-auto font-mono text-xs leading-relaxed custom-scrollbar">
        {data ? (
          <pre className="text-green-400/90 whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text/30 italic">
            <p>No raw API data captured in this session yet.</p>
            <p className="text-[10px] mt-2">Trigger a nearby search to populate this view.</p>
          </div>
        )}
      </div>
      
      <div className="mt-4 p-4 bg-primary/5 border border-primary/10 rounded-xl">
        <p className="text-xs text-text/60 leading-relaxed">
          <span className="text-primary font-bold">Note:</span> This displays the raw response from the backend integration (Google Places + AI augmentation). Use this to verify why certain landmarks were chosen or missed.
        </p>
      </div>
    </div>
  );
}
