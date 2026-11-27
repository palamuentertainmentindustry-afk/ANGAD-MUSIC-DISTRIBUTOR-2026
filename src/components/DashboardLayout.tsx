import React, { useState } from 'react';
import {
  Disc3,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  Lock,
  LogOut,
  Menu,
  PlusCircle,
  Shield,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ASSETS, COMPANY_INFO } from '../lib/assets.ts';
import type { AppView } from '../types.ts';
import { SafeImage } from './SafeImage.tsx';

interface NavItem {
  view: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ARTIST_NAV: NavItem[] = [
  { view: 'artist-dashboard', label: 'Overview', icon: LayoutDashboard },
  { view: 'create-release', label: 'Create Release', icon: PlusCircle },
  { view: 'my-releases', label: 'My Releases', icon: Disc3 },
  { view: 'payments', label: 'Payments & Royalties', icon: Wallet },
  { view: 'smart-links', label: 'Smart Links', icon: Link2 },
  { view: 'services', label: 'Artist Services', icon: Sparkles },
  { view: 'account-security', label: 'Account & Security', icon: Lock },
  { view: 'support', label: 'Support', icon: LifeBuoy },
];

interface DashboardLayoutProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  title: string;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardLayout({
  currentView,
  onNavigate,
  title,
  actionButton,
  children,
}: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const avatarSrc = isAdmin ? ASSETS.adminAvatar : user?.avatar_url || ASSETS.artistAvatar;

  const handleNav = (view: AppView) => {
    onNavigate(view);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    onNavigate('home');
  };

  const sidebarContent = (
    <div
      className={`flex flex-col h-full border-r ${
        isAdmin
          ? 'bg-[#0C0C0F] border-zinc-800/80'
          : 'bg-[#09090B]/78 backdrop-blur-md border-[#D4AF37]/20'
      }`}
    >
      <div className="px-4 py-4 border-b border-zinc-800/80">
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="flex items-center gap-3 text-left w-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg cursor-pointer"
        >
          <SafeImage
            src={ASSETS.brandEmblem}
            alt="ANGAD MUSIC DISTRIBUTOR logo"
            className="w-14 h-14 rounded-lg object-contain bg-black border border-[#D4AF37]/45 p-0.5 shrink-0 shadow-[0_0_16px_rgba(212,175,55,0.14)]"
          />
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold tracking-tight text-zinc-100 truncate group-hover:text-[#E5C158] transition-colors">
              ANGAD MUSIC
            </div>
            <div className="text-[11px] font-medium text-[#E5C158] truncate">Distributor</div>
            <div className="text-[10px] text-zinc-400 truncate">Palamu Entertainment</div>
          </div>
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Dashboard navigation">
        {isAdmin ? (
          <button
            type="button"
            onClick={() => handleNav('admin-dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-md text-sm font-medium bg-[#D4AF37]/10 text-[#E5C158] border border-[#D4AF37]/25"
          >
            <Shield className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Label Operations</span>
          </button>
        ) : (
          ARTIST_NAV.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => handleNav(item.view)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-md text-sm font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                  active
                    ? 'bg-[#D4AF37]/12 text-[#E5C158] border border-[#D4AF37]/25'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })
        )}
      </nav>

      <div className="p-4 border-t border-zinc-800/80 space-y-3">
        <div className="flex items-center gap-3">
          <SafeImage
            src={avatarSrc}
            fallbackSrc={ASSETS.artistAvatar}
            alt={user?.full_name || 'Account avatar'}
            className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-zinc-100 truncate">
              {user?.stage_name || user?.full_name || 'Artist'}
            </div>
            <div className="text-xs text-zinc-400 truncate">{user?.email}</div>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500">
          {COMPANY_INFO.phone} · {COMPANY_INFO.parentCompany}
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-500">
          <button type="button" onClick={() => handleNav('terms')} className="hover:text-[#E5C158] cursor-pointer">
            Terms
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => handleNav('privacy')} className="hover:text-[#E5C158] cursor-pointer">
            Privacy
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => handleNav('copyright')} className="hover:text-[#E5C158] cursor-pointer">
            Copyright
          </button>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-md text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 hover:text-white border border-zinc-800 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#09090B] text-zinc-100 flex">
      {!isAdmin && (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <img
            src={ASSETS.artistDashboardBg}
            alt=""
            className="w-full h-full object-cover object-[50%_18%] scale-[1.01]"
          />
          <div className="absolute inset-0 bg-[#09090B]/62" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#09090B]/72 via-[#09090B]/48 to-[#09090B]/86" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.12),transparent_60%)]" />
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="relative z-20 hidden lg:block w-[260px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-[270px] max-w-[85vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-4 right-3 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <header
          className={`sticky top-0 z-30 backdrop-blur-md border-b px-4 sm:px-8 h-16 flex items-center justify-between gap-4 ${
            isAdmin
              ? 'bg-[#09090B]/95 border-zinc-800/80'
              : 'bg-[#09090B]/72 border-[#D4AF37]/20'
          }`}
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-300 hover:text-white rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleNav('home')}
              className="lg:hidden shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              aria-label="ANGAD MUSIC DISTRIBUTOR Home"
            >
              <SafeImage
                src={ASSETS.brandEmblem}
                alt="ANGAD MUSIC DISTRIBUTOR logo"
                className="w-10 h-10 rounded-md object-contain bg-black border border-[#D4AF37]/45 p-0.5 shrink-0"
              />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-zinc-500 hidden sm:inline whitespace-nowrap">
                {isAdmin ? 'Admin Console' : 'Artist Studio'}
              </span>
              <span className="text-zinc-600 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display text-sm sm:text-lg font-semibold text-zinc-100 truncate">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {actionButton}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1280px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
