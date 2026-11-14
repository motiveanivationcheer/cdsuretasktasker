import React, { Component, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import { Check, AlertTriangle, RefreshCw } from 'lucide-react';

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
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">CDSure Tasks</h1>
          <p className="text-sm text-slate-600 max-w-md mb-6">
            Something went wrong while rendering the page. Don't worry, your account and balances are secure.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Reload CDSure Tasks
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

function AppContent() {
  const { firebaseUser, userProfile, loading, currentRoute } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-[#7C3AED] flex items-center justify-center shadow-lg shadow-purple-600/30 mb-4 animate-bounce">
          <Check className="w-6 h-6 text-white stroke-[3]" />
        </div>
        <div className="w-6 h-6 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-extrabold text-[#0f172a]">CDSure Tasks</p>
        <p className="text-xs text-slate-400 mt-0.5">Connecting to CDSure Tasks...</p>
      </div>
    );
  }

  // Normalize route string (remove trailing slash and lowercase)
  const route = (currentRoute || '/login').toLowerCase().replace(/\/$/, '') || '/login';

  // Routing with strict Auth Guard and Earner Activation Rule
  const renderPage = () => {
    // Paystack Callback / Verification Route
    if (route === '/verify-payment' || route.startsWith('/verify-payment')) {
      return <PaystackCallbackPage />;
    }

    // Admin Activations Portal
    if (route === '/admin/activations' || route === '/admin') {
      return <AdminActivationsPage />;
    }

    // Chat / Support Route (ONLY for logged-in users; visitors redirect to Login)
    if (route === '/chat' || route === '/chatting' || route === '/support') {
      if (!firebaseUser) {
        return <LoginPage />;
      }
      return <ChatPage />;
    }

    // 1. Forgot Password Route
    if (route === '/forgot-password') {
      return <ForgotPasswordPage />;
    }

    // 2. Signup Route
    if (route === '/signup') {
      if (firebaseUser) {
        if (!userProfile?.is_activated) {
          return <ActivatePage />;
        }
        return userProfile?.role === 'employer' ? <EmployerDashboardPage /> : <EarnerDashboardPage />;
      }
      return <SignupPage />;
    }

    // 3. Login Route
    if (route === '/login' || route === '' || route === '/') {
      if (firebaseUser) {
        if (!userProfile?.is_activated) {
          return <ActivatePage />;
        }
        return userProfile?.role === 'employer' ? <EmployerDashboardPage /> : <EarnerDashboardPage />;
      }
      return <LoginPage />;
    }

    // 4. Must be authenticated for remaining protected routes
    if (!firebaseUser) {
      return <LoginPage />;
    }

    // Premium Marketplace Route (Authenticated Users)
    if (route === '/marketplace' || route.startsWith('/marketplace')) {
      return <MarketplacePage />;
    }

    // 5. Activation Route or Unactivated User Lock (BOTH Employer & Earner)
    if (route === '/activate' || !userProfile?.is_activated) {
      if (userProfile?.is_activated) {
        return userProfile.role === 'employer' ? <EmployerDashboardPage /> : <EarnerDashboardPage />;
      }
      return <ActivatePage />;
    }

    // 6. Employer Dashboard (Activated)
    if (route === '/employer-dashboard' || userProfile?.role === 'employer') {
      return <EmployerDashboardPage />;
    }

    // 7. Earner Dashboard (Activated)
    return <EarnerDashboardPage />;
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
