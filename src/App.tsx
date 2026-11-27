import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AccountSecurityPage } from './pages/AccountSecurityPage.tsx';
import { AdminAuthPage } from './pages/AdminAuthPage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { ArtistAuthPage } from './pages/ArtistAuthPage.tsx';
import { ArtistDashboardPage } from './pages/ArtistDashboardPage.tsx';
import { ArtistServicesPage } from './pages/ArtistServicesPage.tsx';
import { CreateReleasePage } from './pages/CreateReleasePage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LegalPage } from './pages/LegalPage.tsx';
import { MyReleasesPage } from './pages/MyReleasesPage.tsx';
import { PaymentsRoyaltiesPage } from './pages/PaymentsRoyaltiesPage.tsx';
import { PublicSmartLinkPage } from './pages/PublicSmartLinkPage.tsx';
import { SmartLinksPage } from './pages/SmartLinksPage.tsx';
import { SupportPage } from './pages/SupportPage.tsx';
import type { AppView } from './types.ts';

function parseLocation(): { view: AppView; smartLinkSlug?: string } {
  const path = window.location.pathname;
  if (path.startsWith('/s/')) {
    const slug = path.slice(3).split('/')[0];
    if (slug) return { view: 'public-smart-link', smartLinkSlug: slug };
  }
  if (path === '/admin/login' || path === '/admin') {
    return { view: 'admin-auth' };
  }
  if (path === '/artist/login' || path === '/artist/signup') {
    return { view: 'artist-auth' };
  }
  if (path === '/support') {
    return { view: 'support' };
  }
  if (path === '/terms') {
    return { view: 'terms' };
  }
  if (path === '/privacy') {
    return { view: 'privacy' };
  }
  if (path === '/copyright') {
    return { view: 'copyright' };
  }
  return { view: 'home' };
}

function AppRouter() {
  const { user } = useAuth();
  const initial = parseLocation();
  const [view, setView] = useState<AppView>(initial.view);
  const [authMode, setAuthMode] = useState<'login' | 'register'>(
    window.location.pathname === '/artist/signup' ? 'register' : 'login'
  );
  const [smartLinkSlug, setSmartLinkSlug] = useState<string>(initial.smartLinkSlug || '');

  const navigate = useCallback(
    (nextView: AppView, opts?: { authMode?: 'login' | 'register'; smartLinkSlug?: string }) => {
      if (opts?.authMode) {
        setAuthMode(opts.authMode);
      }
      if (opts?.smartLinkSlug) {
        setSmartLinkSlug(opts.smartLinkSlug);
      }
      setView(nextView);

      let nextPath = '/';
      if (nextView === 'public-smart-link' && (opts?.smartLinkSlug || smartLinkSlug)) {
        nextPath = `/s/${opts?.smartLinkSlug || smartLinkSlug}`;
      } else if (nextView === 'admin-auth') {
        nextPath = '/admin/login';
      } else if (nextView === 'artist-auth') {
        nextPath = opts?.authMode === 'register' ? '/artist/signup' : '/artist/login';
      } else if (nextView === 'support') {
        nextPath = '/support';
      } else if (nextView !== 'home') {
        nextPath = `/${nextView}`;
      }

      if (window.location.pathname !== nextPath) {
        window.history.pushState({ view: nextView }, '', nextPath);
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [smartLinkSlug]
  );

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseLocation();
      setView(parsed.view);
      if (parsed.smartLinkSlug) setSmartLinkSlug(parsed.smartLinkSlug);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (view === 'public-smart-link' && smartLinkSlug) {
    return <PublicSmartLinkPage slug={smartLinkSlug} onNavigate={navigate} />;
  }

  if (view === 'admin-auth') {
    if (user?.role === 'admin') {
      return <AdminDashboardPage onNavigate={navigate} />;
    }
    return <AdminAuthPage onNavigate={navigate} />;
  }

  if (view === 'admin-dashboard') {
    if (user?.role !== 'admin') {
      return <AdminAuthPage onNavigate={navigate} />;
    }
    return <AdminDashboardPage onNavigate={navigate} />;
  }

  if (view === 'artist-auth') {
    if (user?.role === 'artist') {
      return <ArtistDashboardPage onNavigate={navigate} />;
    }
    return <ArtistAuthPage initialMode={authMode} onNavigate={navigate} />;
  }

  if (
    view === 'artist-dashboard' ||
    view === 'create-release' ||
    view === 'my-releases' ||
    view === 'payments' ||
    view === 'smart-links' ||
    view === 'services' ||
    view === 'account-security'
  ) {
    if (user?.role !== 'artist') {
      return <ArtistAuthPage initialMode="login" onNavigate={navigate} />;
    }
    if (view === 'create-release') return <CreateReleasePage onNavigate={navigate} />;
    if (view === 'my-releases') return <MyReleasesPage onNavigate={navigate} />;
    if (view === 'payments') return <PaymentsRoyaltiesPage onNavigate={navigate} />;
    if (view === 'smart-links') return <SmartLinksPage onNavigate={navigate} />;
    if (view === 'services') return <ArtistServicesPage onNavigate={navigate} />;
    if (view === 'account-security') return <AccountSecurityPage onNavigate={navigate} />;
    return <ArtistDashboardPage onNavigate={navigate} />;
  }

  if (view === 'support') {
    return <SupportPage onNavigate={navigate} />;
  }

  if (view === 'terms' || view === 'privacy' || view === 'copyright') {
    return <LegalPage section={view} onNavigate={navigate} />;
  }

  return <HomePage onNavigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
