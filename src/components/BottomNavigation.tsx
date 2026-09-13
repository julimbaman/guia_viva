import { Route, Map as MapIcon, Home, Settings } from 'lucide-react';

interface BottomNavigationProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNavigation({ currentTab, onTabChange }: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface/90 border-t border-white/5 px-8 pt-3 pb-safe-bottom flex justify-between items-center z-[5000] backdrop-blur-md text-white/40 pb-4">
      <button 
        onClick={() => onTabChange('home')}
        className={`flex flex-col items-center gap-1 transition-colors ${currentTab === 'home' ? 'text-primary' : 'hover:text-white'}`}
      >
        <Home size={22} className={currentTab === 'home' ? 'drop-shadow-[0_0_8px_rgba(34,211,167,0.8)]' : ''} />
        <span className="text-[10px] font-medium">Home</span>
      </button>

      <button 
        onClick={() => onTabChange('tours_list')}
        className={`flex flex-col items-center gap-1 transition-colors ${currentTab === 'tours_list' ? 'text-primary' : 'hover:text-white'}`}
      >
        <MapIcon size={22} className={currentTab === 'tours_list' ? 'drop-shadow-[0_0_8px_rgba(34,211,167,0.8)]' : ''} />
        <span className="text-[10px] font-medium">Tours</span>
      </button>

      <button 
        onClick={() => onTabChange('tour_planner')}
        className={`flex flex-col items-center gap-1 transition-colors ${currentTab === 'tour_planner' ? 'text-primary' : 'hover:text-white'}`}
      >
        <Route size={22} className={currentTab === 'tour_planner' ? 'drop-shadow-[0_0_8px_rgba(34,211,167,0.8)]' : ''} />
        <span className="text-[10px] font-medium">Create</span>
      </button>

      <button 
        onClick={() => onTabChange('settings')}
        className={`flex flex-col items-center gap-1 transition-colors ${currentTab === 'settings' ? 'text-primary' : 'hover:text-white'}`}
      >
        <Settings size={22} className={currentTab === 'settings' ? 'drop-shadow-[0_0_8px_rgba(34,211,167,0.8)]' : ''} />
        <span className="text-[10px] font-medium">Settings</span>
      </button>

    </div>
  );
}
