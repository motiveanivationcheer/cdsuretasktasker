import React, { Component, type ReactNode } from 'react';
import { AuthProvider, useAuth, ADMIN_EMAIL } from './context/AuthContext';
import { LoginPage } from './views/LoginPage';
import { SignupPage } from './views/SignupPage';
import { ForgotPasswordPage } from './views/ForgotPasswordPage';
import { ActivatePage } from './views/ActivatePage';
import { EmployerDashboardPage } from './views/EmployerDashboardPage';
import { EarnerDashboardPage } from './views/EarnerDashboardPage';
import { AdminActivationsPage } from './views/AdminActivationsPage';
import { ChatPage } from './views/ChatPage';
import { PaystackCallbackPage } from './views/PaystackCallbackPage';
import { MarketplacePage } from './views/MarketplacePage';
import { Check, AlertTriangle, RefreshCw, ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'Unexpected application error' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('CDSure Tasks Runtime caught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.hash = '/login';
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">CDSure Tasks</h1>
          <p className="text-sm text-slate-600 max-w-md mb-6">
            Something went wrong while rendering the page. Your account data and wallet balances remain safe.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Application
            </button>
            <button
              onClick={() => {
                window.location.hash = '/login';
                this.setState({ hasError: false });
              }}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-all"
            >
              Go to Login
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AdminAccessDenied: React.FC = () => {
  const { firebaseUser, userProfile, isAdmin, navigate, logout } = useAuth();

  if (isAdmin) return null;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-extrabold text-slate-900">Admin Access Restricted</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            {firebaseUser
              ? `Signed in as ${firebaseUser.email || 'user'}. Only the authorized administrator (${ADMIN_EMAIL}) can access this portal.`
              : `Please sign in with the authorized administrator account (${ADMIN_EMAIL}) to continue.`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          {firebaseUser ? (
            <>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    userProfile?.role === 'employer' && userProfile?.employer_approved === 1
                      ? '/employer-dashboard'
                      : '/earner-dashboard'
                  )
                }
                className="flex-1 py-2.5 px-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Dashboard</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Sign Out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-2.5 px-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function AppContent() {
  const { firebaseUser, userProfile, isAdmin, loading, currentRoute } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <div className="w-11 h-11 rounded-2xl bg-[#7C3AED] flex items-center justify-center shadow-md shadow-purple-600/25 mb-3">
          <Check className="w-6 h-6 text-white stroke-[3]" />
        </div>
        <div className="w-5 h-5 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin mb-2.5" />
        <p className="text-sm font-extrabold text-[#0f172a]">CDSure Tasks</p>
        <p className="text-xs text-slate-400 mt-0.5">Loading your account...</p>
      </div>
    );
  }

  const route = (currentRoute || '/login').toLowerCase().replace(/\/$/, '') || '/login';
  const isPaid = userProfile?.payment_status === 'paid' || Number(userProfile?.is_activated) === 1;
  const isEmployer = isPaid && userProfile?.role === 'employer';

  const renderPage = () => {
    if (route === '/verify-payment' || route.startsWith('/verify-payment')) {
      return <PaystackCallbackPage />;
    }

    // Strict Admin Guard: ONLY bunnysusanfabio@gmail.com may render AdminActivationsPage
    if (route === '/admin/activations' || route === '/admin') {
      if (!firebaseUser || !isAdmin) {
        return <AdminAccessDenied />;
      }
      return <AdminActivationsPage />;
    }

    if (route === '/forgot-password') {
      return <ForgotPasswordPage />;
    }

    if (!firebaseUser) {
      if (route === '/signup') return <SignupPage />;
      return <LoginPage />;
    }

    // Admin signed in -> default to Admin Panel unless inspecting dashboards
    if (isAdmin && (route === '/login' || route === '/signup' || route === '/' || route === '')) {
      return <AdminActivationsPage />;
    }

    // MANDATORY ACTIVATION LOCK: Nobody enters Worker OR Employer dashboard until payment_status === 'paid'
    if (!isAdmin && !isPaid) {
      return <ActivatePage />;
    }

    if (route === '/chat' || route === '/chatting' || route === '/support') {
      return <ChatPage />;
    }

    if (route === '/marketplace' || route.startsWith('/marketplace')) {
      return <MarketplacePage />;
    }

    if (route === '/activate') {
      if (!isPaid && !isAdmin) return <ActivatePage />;
      return isEmployer ? <EmployerDashboardPage /> : <EarnerDashboardPage />;
    }

    if (route === '/employer-dashboard') {
      return isEmployer ? <EmployerDashboardPage /> : <EarnerDashboardPage />;
    }

    if (route === '/earner-dashboard') {
      return <EarnerDashboardPage />;
    }

    return isEmployer ? <EmployerDashboardPage /> : <EarnerDashboardPage />;
  };

  return <>{renderPage()}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
