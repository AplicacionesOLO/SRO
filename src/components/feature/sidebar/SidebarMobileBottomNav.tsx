import type { MenuItem } from './types';

interface SidebarMobileBottomNavProps {
  mainItems: MenuItem[];
  moreItemsCount: number;
  isMenuOpen: boolean;
  isActive: (path: string) => boolean;
  onNavigate: (path: string) => void;
  onToggleMenu: () => void;
}

export default function SidebarMobileBottomNav({
  mainItems,
  moreItemsCount,
  isMenuOpen,
  isActive,
  onNavigate,
  onToggleMenu,
}: SidebarMobileBottomNavProps) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#060d18] border-t border-white/[0.06] z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {mainItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors cursor-pointer ${
                active ? 'text-teal-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <i className={`${item.icon} text-xl w-6 h-6 flex items-center justify-center`} />
              <span className="text-xs mt-1 truncate max-w-full">{item.label}</span>
            </button>
          );
        })}

        {moreItemsCount > 0 && (
          <button
            onClick={onToggleMenu}
            className={`flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors cursor-pointer ${
              isMenuOpen ? 'text-teal-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <i className={`${isMenuOpen ? 'ri-close-line' : 'ri-more-2-fill'} text-xl w-6 h-6 flex items-center justify-center`} />
            <span className="text-xs mt-1">{isMenuOpen ? 'Cerrar' : 'Más'}</span>
          </button>
        )}
      </div>
    </div>
  );
}