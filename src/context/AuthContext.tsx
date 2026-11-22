import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  auth,
  firestoreDb,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  signInWithPopup,
  onAuthStateChanged,
  doc,
  setDoc,
  type FirebaseUser,
} from '../firebase';
import type { UserProfile, ActivationFeeSettings } from '../types';

export const ADMIN_EMAIL = 'bunnysusanfabio@gmail.com';

export function isUserAdminEmail(email?: string | null): boolean {
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

const DEFAULT_FEES: ActivationFeeSettings = {
  earner_fee: 2000,
  employer_fee: 5000,
  activation_bonus_earner: 0,
  activation_bonus_employer: 0,
};

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  activationFees: ActivationFeeSettings;
  isAdmin: boolean;
  loading: boolean;
  authError: string | null;
  currentRoute: string;
  navigate: (route: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  fetchActivationFees: () => Promise<ActivationFeeSettings>;
  loginWithEmail: (email: string, pass: string) => Promise<{ success: boolean; role?: string; error?: string }>;
  registerWithEmail: (
    email: string,
    pass: string,
    fullName: string,
    role?: string,
    phone?: string
  ) => Promise<{ success: boolean; role?: string; error?: string }>;
  loginWithGoogle: (role?: string) => Promise<{ success: boolean; role?: string; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<UserProfile | null>;
  setRequestedRole: (role: 'earner' | 'employer') => Promise<{ success: boolean; user?: UserProfile; error?: string }>;
  switchUserRole: (newRole: 'earner' | 'employer') => Promise<{ success: boolean; message?: string }>;
  saveAvatarUrl: (avatarUrl: string) => Promise<{ success: boolean; error?: string }>;
  submitDeposit: (amount: number, proofUrl: string, paymentMethod?: string) => Promise<{ success: boolean; deposit?: any; error?: string }>;
  submitWithdrawal: (
    amount: number,
    bankName: string,
    accountNumber: string,
    accountName: string
  ) => Promise<{ success: boolean; withdrawal?: any; error?: string }>;
  fetchWalletData: (userId?: string) => Promise<any>;
  initializePaystackPayment: (
    amount: number,
    purpose?: 'activation' | 'wallet_funding' | 'deposit' | 'subscription' | 'marketplace_purchase',
    metadata?: Record<string, any>
  ) => Promise<{ success: boolean; authorization_url?: string; reference?: string; access_code?: string; amount?: number; error?: string }>;
  verifyPaystackPayment: (
    reference: string
  ) => Promise<{
    success: boolean;
    status?: string;
    message?: string;
    error?: string;
    is_activated?: number;
    balance?: number;
    purpose?: string;
    role?: string;
    payment_status?: string;
    productId?: string | null;
    delivered?: boolean;
    delivery_url?: string | null;
  }>;
  fetchActivationStatus: (userId?: string) => Promise<any>;
  fetchPlatformEarnings: () => Promise<any>;
  d1User: any;
  activationStatus: string;
}

export function getRouteFromLocation(): string {
  if (typeof window === 'undefined') return '/login';
  const hash = window.location.hash;
  if (hash && hash !== '#' && hash !== '#/') {
    const cleanHash = hash.replace(/^#\/?/, '/').split('?')[0];
    if (cleanHash) {
      return cleanHash.startsWith('/') ? cleanHash : `/${cleanHash}`;
    }
  }
  const rawPath = window.location.pathname;
  const strippedPath = rawPath
    .replace(/^\/Cd-sure-task\/?/i, '/')
    .replace(/\/+/g, '/')
    .split('?')[0];
  if (!strippedPath || strippedPath === '/') {
    return '/login';
  }
  return strippedPath.startsWith('/') ? strippedPath : `/${strippedPath}`;
}

function mapDbUserToProfile(u: any, fallbackId: string, fallbackName: string, fallbackEmail: string): UserProfile {
  const isPaid = u?.payment_status === 'paid' || Number(u?.is_activated) === 1;
  const requestedRole: 'earner' | 'employer' | '' =
    u?.requested_role === 'employer' ? 'employer' : u?.requested_role === 'earner' ? 'earner' : '';
  const role: 'pending' | 'earner' | 'employer' = isPaid
    ? u?.role === 'employer'
      ? 'employer'
      : 'earner'
    : 'pending';
  const employerApproved = isPaid && (role === 'employer' || Number(u?.employer_approved) === 1) ? 1 : 0;

  return {
    uid: u?.id || u?.uid || fallbackId,
    name: u?.name || fallbackName || 'Member',
    email: u?.email || fallbackEmail || '',
    phone: u?.phone || '',
    role,
    requested_role: requestedRole,
    payment_status: isPaid ? 'paid' : 'unpaid',
    status: isPaid ? 'active' : 'pending',
    activation_reference: u?.activation_reference || null,
    activation_amount: Number(u?.activation_amount || 0),
    employer_approved: employerApproved,
    employer_approved_at: u?.employer_approved_at || null,
    employer_status: employerApproved === 1 ? 'approved' : 'none',
    employer_rejection_reason: u?.employer_rejection_reason || null,
    activation_proof_url: u?.activation_proof_url || null,
    avatar_url: u?.avatar_url || null,
    balance: Number(u?.balance || 0),
    total_deposited: Number(u?.total_deposited || 0),
    total_withdrawn: Number(u?.total_withdrawn || 0),
    total_earned: Number(u?.total_earned || 0),
    total_fees_paid: Number(u?.total_fees_paid || 0),
    is_verified: true,
    is_activated: isPaid ? 1 : 0,
    activation_paid_at: u?.activation_paid_at || undefined,
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activationFees, setActivationFees] = useState<ActivationFeeSettings>(DEFAULT_FEES);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentRoute, setCurrentRoute] = useState<string>(getRouteFromLocation);

  const isAdmin = isUserAdminEmail(firebaseUser?.email || userProfile?.email);

  const navigate = useCallback((route: string) => {
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    window.location.hash = cleanRoute;
    try {
      window.history.pushState({}, '', window.location.pathname + window.location.search + '#' + cleanRoute);
    } catch {}
    setCurrentRoute(cleanRoute.split('?')[0]);
  }, []);

  const fetchActivationFees = useCallback(async (): Promise<ActivationFeeSettings> => {
    try {
      const res = await fetch('/api/settings/activation-fees');
      if (res.ok) {
        const data = await res.json();
        const next: ActivationFeeSettings = {
          earner_fee: Math.max(100, Number(data?.earner_fee) || 2000),
          employer_fee: Math.max(100, Number(data?.employer_fee) || 5000),
          activation_bonus_earner: Math.max(0, Number(data?.activation_bonus_earner) || 0),
          activation_bonus_employer: Math.max(0, Number(data?.activation_bonus_employer) || 0),
        };
        setActivationFees(next);
        return next;
      }
    } catch {}
    return DEFAULT_FEES;
  }, []);

  useEffect(() => {
    fetchActivationFees();
  }, [fetchActivationFees]);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentRoute(getRouteFromLocation());
    };
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);

    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      const initial = getRouteFromLocation();
      window.location.hash = initial;
    }

    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const getAuthHeaders = useCallback(async (forceRefresh: boolean = false): Promise<Record<string, string>> => {
    const user = auth.currentUser || firebaseUser;
    if (!user) return {};
    try {
      const token = await user.getIdToken(forceRefresh);
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, [firebaseUser]);

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      const makeRequest = async (forceRefresh: boolean) => {
        const authHeaders = await getAuthHeaders(forceRefresh);
        const mergedHeaders = new Headers(init.headers || {});
        if (authHeaders.Authorization) {
          mergedHeaders.set('Authorization', authHeaders.Authorization);
        }
        return fetch(url, { ...init, headers: mergedHeaders });
      };

      const res = await makeRequest(false);
      if (res.status === 401 && (auth.currentUser || firebaseUser)) {
        return makeRequest(true);
      }
      return res;
    },
    [getAuthHeaders, firebaseUser]
  );

  const syncUserWithDb = useCallback(
    async (
      user: FirebaseUser,
      options?: { name?: string; phone?: string; role?: string; requested_role?: string; explicitSwitch?: boolean }
    ): Promise<UserProfile> => {
      const token = await user.getIdToken().catch(() => '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const res = await fetch('/api/users/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: user.uid,
            uid: user.uid,
            name: options?.name || user.displayName || 'Member',
            email: user.email || '',
            phone: options?.phone || '',
            ...(options?.role ? { role: options.role } : {}),
            ...(options?.requested_role ? { requested_role: options.requested_role } : {}),
            ...(options?.explicitSwitch ? { explicitSwitch: true } : {}),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            const profile = mapDbUserToProfile(data.user, user.uid, options?.name || user.displayName || 'Member', user.email || '');
            setUserProfile(profile);
            return profile;
          }
        }
      } catch (err) {
        console.warn('User sync failed:', err);
      }

      const fallback = mapDbUserToProfile(null, user.uid, options?.name || user.displayName || 'Member', user.email || '');
      setUserProfile(fallback);
      return fallback;
    },
    []
  );

  const routeAfterAuth = useCallback(
    (email: string | null | undefined, profile: UserProfile, current?: string) => {
      const activeRoute = (current ?? getRouteFromLocation()).toLowerCase();
      if (activeRoute.startsWith('/verify-payment')) return;
      if (
        typeof window !== 'undefined' &&
        (window.location.search.includes('verify=') ||
          window.location.search.includes('reference=') ||
          window.location.search.includes('trxref='))
      ) {
        return;
      }

      if (isUserAdminEmail(email)) {
        if (activeRoute === '/' || activeRoute === '/login' || activeRoute === '/signup' || activeRoute === '/activate') {
          navigate('/admin');
        }
        return;
      }

      // STRICT ACTIVATION GUARD: unpaid users NEVER enter Worker or Employer dashboard
      if (profile.payment_status !== 'paid') {
        navigate('/activate');
        return;
      }

      if (
        activeRoute === '/' ||
        activeRoute === '/login' ||
        activeRoute === '/signup' ||
        activeRoute === '/activate'
      ) {
        navigate(profile.role === 'employer' ? '/employer-dashboard' : '/earner-dashboard');
      } else if (activeRoute === '/employer-dashboard' && profile.role !== 'employer') {
        navigate('/earner-dashboard');
      }
    },
    [navigate]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setFirebaseUser(user);

      if (user) {
        await fetchActivationFees();
        const profile = await syncUserWithDb(user);
        routeAfterAuth(user.email, profile);
      } else {
        setUserProfile(null);
        const activeRoute = getRouteFromLocation();
        if (
          activeRoute.includes('/employer-dashboard') ||
          activeRoute.includes('/earner-dashboard') ||
          activeRoute.includes('/dashboard') ||
          activeRoute === '/activate'
        ) {
          navigate('/login');
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [syncUserWithDb, fetchActivationFees, routeAfterAuth, navigate]);

  const registerWithEmail = async (
    email: string,
    pass: string,
    fullName: string,
    role: string = '',
    phone: string = ''
  ): Promise<{ success: boolean; role?: string; error?: string }> => {
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;
      const chosenReq = role === 'employer' ? 'employer' : role === 'earner' ? 'earner' : '';

      const profile = await syncUserWithDb(user, {
        name: fullName,
        phone,
        ...(chosenReq ? { requested_role: chosenReq } : {}),
      });

      routeAfterAuth(user.email, profile, '/signup');
      return { success: true, role: profile.role };
    } catch (err: any) {
      let friendlyMessage = 'Could not create account. Please try again.';
      if (err?.code === 'auth/email-already-in-use') {
        friendlyMessage = 'This email address is already registered. Please sign in instead.';
      } else if (err?.code === 'auth/weak-password') {
        friendlyMessage = 'Password must be at least 6 characters.';
      } else if (err?.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      } else if (err?.code === 'auth/network-request-failed') {
        friendlyMessage = 'Could not connect to CDSure Tasks. Check your internet and try again.';
      }
      setAuthError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    }
  };

  const loginWithEmail = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; role?: string; error?: string }> => {
    setAuthError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;
      const profile = await syncUserWithDb(user);
      routeAfterAuth(user.email, profile, '/login');
      return { success: true, role: profile.role };
    } catch (err: any) {
      let friendlyMessage = 'Invalid email or password. Please try again.';
      if (
        err?.code === 'auth/user-not-found' ||
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/invalid-credential'
      ) {
        friendlyMessage = 'Invalid email or password. Please check and try again.';
      } else if (err?.code === 'auth/too-many-requests') {
        friendlyMessage = 'Too many attempts. Please try again in a moment.';
      } else if (err?.code === 'auth/network-request-failed') {
        friendlyMessage = 'Could not connect to CDSure Tasks. Check your internet and try again.';
      }
      setAuthError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    }
  };

  const loginWithGoogle = async (
    role: string = ''
  ): Promise<{ success: boolean; role?: string; error?: string }> => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const chosenReq = role === 'employer' ? 'employer' : role === 'earner' ? 'earner' : '';
      const profile = await syncUserWithDb(user, chosenReq ? { requested_role: chosenReq } : undefined);
      routeAfterAuth(user.email, profile, '/login');
      return { success: true, role: profile.role };
    } catch (err: any) {
      let friendlyMessage = 'Could not sign in with Google. Please try again.';
      if (err?.code === 'auth/popup-closed-by-user') {
        friendlyMessage = 'Sign-in was cancelled before completion.';
      } else if (err?.code === 'auth/popup-blocked') {
        friendlyMessage = 'Popup was blocked by your browser. Please allow popups and try again.';
      } else if (err?.code === 'auth/network-request-failed') {
        friendlyMessage = 'Could not connect to CDSure Tasks. Check your internet and try again.';
      }
      setAuthError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true, message: 'Password reset instructions have been sent to your email address.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Unable to send password reset email.' };
    }
  };

  const logout = async (): Promise<void> => {
    await signOut(auth).catch(() => {});
    setFirebaseUser(null);
    setUserProfile(null);
    navigate('/login');
  };

  const fetchWalletData = useCallback(
    async (userId?: string) => {
      const targetId = userId || firebaseUser?.uid;
      if (!targetId) return null;
      try {
        const res = await authFetch(`/api/wallet/${encodeURIComponent(targetId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.wallet) {
            setUserProfile((prev) =>
              prev
                ? {
                    ...prev,
                    balance: Number(data.wallet.balance || 0),
                    total_deposited: Number(data.wallet.total_deposited || 0),
                    total_withdrawn: Number(data.wallet.total_withdrawn || 0),
                    total_earned: Number(data.wallet.total_earned || 0),
                    total_fees_paid: Number(data.wallet.total_fees_paid || 0),
                  }
                : null
            );
          }
          return data;
        }
      } catch (err) {
        console.warn('Failed to fetch wallet:', err);
      }
      return null;
    },
    [firebaseUser, authFetch]
  );

  const refreshUser = useCallback(async (): Promise<UserProfile | null> => {
    if (!firebaseUser) return null;
    await fetchActivationFees();
    const prof = await syncUserWithDb(firebaseUser);
    await fetchWalletData(firebaseUser.uid);
    return prof;
  }, [firebaseUser, fetchActivationFees, syncUserWithDb, fetchWalletData]);

  const setRequestedRole = async (
    role: 'earner' | 'employer'
  ): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
    const activeUser = auth.currentUser || firebaseUser;
    if (!activeUser) {
      navigate('/login');
      return { success: false, error: 'Please sign in first.' };
    }

    const sendRequest = async (forceRefresh: boolean) => {
      const token = await activeUser.getIdToken(forceRefresh);
      const res = await fetch('/api/users/requested-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requested_role: role }),
      });
      const rawText = await res.text();
      console.log('[setRequestedRole response]', res.status, rawText);
      return { res, rawText };
    };

    try {
      let { res, rawText } = await sendRequest(false);
      if (res.status === 401) {
        ({ res, rawText } = await sendRequest(true));
      }

      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      if (!res.ok || !data?.success) {
        return {
          success: false,
          error: data?.error || `Role update failed (HTTP ${res.status}): ${rawText.slice(0, 180) || 'No server response'}`,
        };
      }

      try {
        await setDoc(
          doc(firestoreDb, 'users', activeUser.uid),
          {
            uid: activeUser.uid,
            email: activeUser.email || '',
            requested_role: role,
            updated_at: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (fsErr) {
        console.warn('[setRequestedRole] Firestore sync warning:', fsErr);
      }

      const mapped = mapDbUserToProfile(
        data.user,
        activeUser.uid,
        userProfile?.name || activeUser.displayName || 'Member',
        activeUser.email || ''
      );
      setUserProfile(mapped);
      return { success: true, user: mapped };
    } catch (err: any) {
      console.error('[setRequestedRole] exception:', err);
      return { success: false, error: err?.message || 'Network error while saving role selection.' };
    }
  };

  const switchUserRole = async (newRole: 'earner' | 'employer'): Promise<{ success: boolean; message?: string }> => {
    if (!firebaseUser || !userProfile) {
      return { success: false, message: 'Please sign in first.' };
    }
    if (userProfile.payment_status !== 'paid') {
      navigate('/activate');
      return { success: false, message: 'Please complete account activation payment first.' };
    }
    const updated = await syncUserWithDb(firebaseUser, { role: newRole, explicitSwitch: true });
    if (updated.role === 'employer' && newRole === 'employer') {
      navigate('/employer-dashboard');
      return { success: true };
    }
    if (newRole === 'earner') {
      navigate('/earner-dashboard');
      return { success: true };
    }
    return {
      success: false,
      message: 'Pay Employer activation fee or switch from Admin panel to access Employer tools.',
    };
  };

  const saveAvatarUrl = async (avatarUrl: string) => {
    try {
      const res = await authFetch('/api/users/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return { success: false, error: data?.error || 'Could not save profile photo.' };
      }
      setUserProfile((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : null));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save profile photo.' };
    }
  };

  const submitDeposit = async (amount: number, proofUrl: string, paymentMethod: string = 'bank_transfer') => {
    try {
      const res = await authFetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, proof_url: proofUrl, payment_method: paymentMethod }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return { success: false, error: data?.error || 'Deposit submission failed.' };
      }
      await fetchWalletData();
      return { success: true, deposit: data.deposit };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Deposit submission failed.' };
    }
  };

  const submitWithdrawal = async (
    amount: number,
    bankName: string,
    accountNumber: string,
    accountName: string
  ) => {
    try {
      const res = await authFetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return { success: false, error: data?.error || 'Withdrawal request failed.' };
      }
      await fetchWalletData();
      return { success: true, withdrawal: data.withdrawal };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Withdrawal request failed.' };
    }
  };

  const initializePaystackPayment = async (
    amount: number,
    purpose: 'activation' | 'wallet_funding' | 'deposit' | 'subscription' | 'marketplace_purchase' = 'activation',
    metadata: Record<string, any> = {}
  ) => {
    const activeUser = auth.currentUser || firebaseUser;
    if (!activeUser) {
      navigate('/login');
      return { success: false, error: 'Please sign in first.' };
    }
    try {
      const payloadBody = JSON.stringify({
        userId: activeUser.uid,
        email: activeUser.email || userProfile?.email,
        amount,
        purpose,
        requested_role: metadata.requested_role || userProfile?.requested_role || 'earner',
        role: metadata.requested_role || userProfile?.requested_role || 'earner',
        ...metadata,
      });

      let lastStatus = 0;
      let lastRaw = '';
      let data: any = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await authFetch('/api/payments/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: payloadBody,
        });
        lastStatus = res.status;
        lastRaw = await res.text();
        console.log('[initializePaystackPayment response]', attempt + 1, res.status, lastRaw);
        try {
          data = lastRaw ? JSON.parse(lastRaw) : null;
        } catch {
          data = null;
        }
        const isBootInterstitial =
          !data &&
          (/starting server/i.test(lastRaw) ||
            (lastRaw.trim().startsWith('<') && res.status === 200));
        if (isBootInterstitial && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (res.ok && data?.success) {
          return data;
        }
        break;
      }

      if (!data && lastRaw.trim().startsWith('<')) {
        return {
          success: false,
          error: /starting server/i.test(lastRaw)
            ? 'Payment server is still waking up. Please wait 3 seconds and tap Pay again.'
            : `Backend API returned HTML instead of JSON (HTTP ${lastStatus}). Ensure Cloudflare Pages deploys Astro with output: "server" and dist/_worker.js.`,
        };
      }

      return {
        success: false,
        error: data?.error || `Payment init failed (HTTP ${lastStatus}): ${lastRaw.slice(0, 180)}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Payment connection failed.' };
    }
  };

  const verifyPaystackPayment = async (reference: string) => {
    try {
      const res = await authFetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`);
      const rawText = await res.text();
      console.log('[verifyPaystackPayment response]', res.status, rawText);
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }
      if (!res.ok || !data?.success) {
        return {
          success: false,
          status: data?.status,
          error: data?.error || `Verification failed (HTTP ${res.status}): ${rawText.slice(0, 180)}`,
        };
      }

      const activeUser = auth.currentUser || firebaseUser;
      if (activeUser && data.payment_status === 'paid') {
        try {
          await setDoc(
            doc(firestoreDb, 'users', activeUser.uid),
            {
              uid: activeUser.uid,
              email: activeUser.email || '',
              activated: true,
              is_activated: 1,
              payment_status: 'paid',
              status: 'active',
              role: data.role || userProfile?.requested_role || 'earner',
              activation_reference: reference,
              activation_paid_at: data.verified_at || new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (fsErr) {
          console.warn('[verifyPaystackPayment] Firestore user update warning:', fsErr);
        }
      }

      await refreshUser();
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Payment not verified. Try again.' };
    }
  };

  const fetchActivationStatus = useCallback(
    async (targetUserId?: string) => {
      const uid = targetUserId || firebaseUser?.uid;
      if (!uid) return null;
      try {
        const res = await authFetch(`/api/payments/status?userId=${encodeURIComponent(uid)}`);
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },
    [firebaseUser, authFetch]
  );

  const fetchPlatformEarnings = async () => {
    try {
      const res = await authFetch('/api/admin/platform-earnings');
      if (res.ok) return await res.json();
    } catch {}
    return null;
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        activationFees,
        isAdmin,
        loading,
        authError,
        currentRoute,
        navigate,
        getAuthHeaders,
        authFetch,
        fetchActivationFees,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        resetPassword,
        logout,
        refreshUser,
        setRequestedRole,
        switchUserRole,
        saveAvatarUrl,
        submitDeposit,
        submitWithdrawal,
        fetchWalletData,
        initializePaystackPayment,
        verifyPaystackPayment,
        fetchActivationStatus,
        fetchPlatformEarnings,
        d1User: userProfile,
        activationStatus: userProfile?.payment_status === 'paid' ? 'active' : 'pending',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
