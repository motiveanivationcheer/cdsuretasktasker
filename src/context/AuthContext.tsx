import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  auth,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  signInWithPopup,
  onAuthStateChanged,
  type FirebaseUser,
} from '../firebase';
import type { UserProfile } from '../types';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  currentRoute: string;
  navigate: (route: string) => void;
  loginWithEmail: (email: string, pass: string) => Promise<{ success: boolean; role?: 'earner' | 'employer'; error?: string }>;
  registerWithEmail: (email: string, pass: string, fullName: string, role?: 'earner' | 'employer' | string) => Promise<{ success: boolean; role?: 'earner' | 'employer'; error?: string }>;
  loginWithGoogle: (role?: 'earner' | 'employer') => Promise<{ success: boolean; role?: 'earner' | 'employer'; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  updateUserBalance: (delta: number) => Promise<void>;
  switchUserRole: (newRole: 'earner' | 'employer') => Promise<void>;
  requestPresignedUploadUrl: (filename: string, contentType?: string, folder?: string) => Promise<{ success: boolean; uploadUrl?: string; publicUrl?: string; key?: string; error?: string }>;
  uploadToPresignedUrl: (uploadUrl: string, data: Blob | ArrayBuffer, contentType?: string) => Promise<{ success: boolean; error?: string }>;
  depositToWallet: (amount: number, role?: 'employer' | 'earner', reference?: string) => Promise<{ success: boolean; grossAmount?: number; feeAmount?: number; netAmount?: number; balance?: number; error?: string }>;
  withdrawFromWallet: (amount: number, role?: 'employer' | 'earner', bankName?: string, accountNumber?: string, accountName?: string, reference?: string) => Promise<{ success: boolean; grossAmount?: number; feeAmount?: number; netAmount?: number; balance?: number; error?: string; withdrawal?: any }>;
  fetchWalletData: (userId?: string) => Promise<any>;
  fetchPlatformEarnings: () => Promise<any>;
  uploadProof: (
    file: File | Blob,
    metadata?: {
      sender_name?: string;
      sender_number?: string;
      reference?: string;
      amount?: number;
      type?: string;
      role?: string;
    }
  ) => Promise<{ success: boolean; proofId?: string; fileUrl?: string; status?: string; error?: string; message?: string }>;
  submitActivationProof: (data: FormData | {
    user_id?: string;
    userId?: string;
    email?: string;
    role?: 'employer' | 'earner';
    amount?: number;
    proof_image?: string;
    proofImageUrl?: string;
    sender_name?: string;
    senderName?: string;
    sender_number?: string;
    senderNumber?: string;
    reference?: string;
    txRef?: string;
    method?: string;
  }) => Promise<any>;
  fetchActivationStatus: (userId?: string) => Promise<any>;
  confirmActivation: (id: string, userId?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  releaseActivation: (id: string, userId?: string) => Promise<{ success: boolean; message?: string; error?: string; gross_amount?: number; fee_amount?: number; net_amount?: number }>;
  rejectActivation: (id: string, userId?: string, reason?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  initializePaystackPayment: (amount: number, purpose?: 'activation' | 'wallet_funding' | 'deposit' | 'subscription' | 'marketplace_purchase', metadata?: Record<string, any>) => Promise<{ success: boolean; authorization_url?: string; reference?: string; access_code?: string; error?: string }>;
  verifyPaystackPayment: (reference: string) => Promise<{ success: boolean; status?: string; message?: string; error?: string; is_activated?: number; balance?: number; purpose?: string; productId?: string | null; delivered?: boolean; delivery_url?: string | null }>;
  initializeActivationPayment: (email?: string) => Promise<any>;
  verifyActivationPayment: (reference: string) => Promise<any>;

  // Backwards-compatible legacy helpers
  d1User: any;
  activationStatus: any;
  checkStatusDetails: any;
  checkActivationStatus: (u?: string) => Promise<any>;
  submitPayment: (fd: FormData) => Promise<any>;
  adminConfirmPayment: (u: string) => Promise<any>;
  refreshUser: () => Promise<void>;
  fastForward24h: () => Promise<void>;
  tasksAvailableAt: string | null;
  formattedStartTime: string | null;
  tasksLocked24h: boolean;
  referralCodeFromUrl: string;
  completeTaskWithProof: (taskId: string, proofUrl: string) => Promise<any>;
  requestWithdrawal: (amt: number, bank: string, accNum: string, accName: string) => Promise<any>;
  fetchTasks: () => Promise<any>;
  fetchDashboardData: () => Promise<any>;
  verifyCodeOrToken: (code?: string, token?: string) => Promise<any>;
}

// Helper to parse route supporting HashRouter (#/login) and clean subpaths on GitHub Pages
export function getRouteFromLocation(): string {
  if (typeof window === 'undefined') return '/login';

  // 1. Check Hash first (GitHub Pages HashRouter standard: #/login, #/signup, etc.)
  const hash = window.location.hash;
  if (hash && hash !== '#' && hash !== '#/') {
    const cleanHash = hash.replace(/^#\/?/, '/').split('?')[0];
    if (cleanHash) {
      return cleanHash.startsWith('/') ? cleanHash : `/${cleanHash}`;
    }
  }

  // 2. Check Pathname fallback (strip repository subpath e.g. /Cd-sure-task/)
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentRoute, setCurrentRoute] = useState<string>(getRouteFromLocation);
  const [latestPaymentStatus, setLatestPaymentStatus] = useState<string>('not_submitted');

  const navigate = useCallback((route: string) => {
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    // Always keep hash updated for GitHub Pages compatibility
    window.location.hash = cleanRoute;
    try {
      window.history.pushState({}, '', window.location.pathname + window.location.search + '#' + cleanRoute);
    } catch (_e) {
      // Safe fallback
    }
    setCurrentRoute(cleanRoute.split('?')[0]);
  }, []);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentRoute(getRouteFromLocation());
    };
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);

    // Initial check: if no hash is present, set hash so URL is explicit
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      const initial = getRouteFromLocation();
      window.location.hash = initial;
    }

    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // Sync user profile (POST /api/users/sync)
  const syncUserWithD1 = useCallback(
    async (
      id: string,
      name: string,
      email: string,
      preferredRole: string = 'earner'
    ): Promise<UserProfile> => {
      try {
        const res = await fetch('/api/users/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            uid: id,
            name,
            email,
            role: preferredRole,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            const u = data.user;
            const isAct = (u.is_activated === 1 || u.is_activated === true) ? 1 : 0;
            const profile: UserProfile = {
              uid: u.id || u.uid || id,
              name: u.name || u.full_name || name,
              email: u.email || email,
              role: u.role === 'employer' ? 'employer' : 'earner',
              balance: typeof u.balance === 'number' ? u.balance : 0,
              is_verified: true,
              is_activated: isAct,
              activation_paid_at: u.activation_paid_at || undefined,
            };
            setUserProfile(profile);
            return profile;
          }
        }
      } catch (_err) {
        // Local state fallback
      }

      // Safe fallback if server is momentarily unreachable
      const fallback: UserProfile = {
        uid: id,
        name,
        email,
        role: preferredRole === 'employer' ? 'employer' : 'earner',
        balance: 0,
        is_verified: true,
        is_activated: 0,
      };
      setUserProfile(fallback);
      return fallback;
    },
    []
  );

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setFirebaseUser(user);

      if (user) {
        // Sync user profile
        const profile = await syncUserWithD1(
          user.uid,
          user.displayName || 'Member',
          user.email || '',
          'earner'
        );

        const activeRoute = getRouteFromLocation();
        // If at root or login/signup, route to appropriate destination
        if (activeRoute === '/' || activeRoute === '/login' || activeRoute === '/signup') {
          if (profile.role === 'employer') {
            navigate('/employer-dashboard');
          } else {
            navigate(profile.is_activated ? '/earner-dashboard' : '/activate');
          }
        } else if (profile.role === 'earner' && !profile.is_activated && activeRoute.includes('/earner-dashboard')) {
          navigate('/activate');
        } else if (profile.role === 'earner' && profile.is_activated && activeRoute === '/activate') {
          navigate('/earner-dashboard');
        }
      } else {
        setUserProfile(null);
        const activeRoute = getRouteFromLocation();
        if (activeRoute.includes('/employer-dashboard') || activeRoute.includes('/earner-dashboard') || activeRoute.includes('/dashboard') || activeRoute === '/activate') {
          navigate('/login');
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [syncUserWithD1, navigate]);

  // Email / Password Registration
  const registerWithEmail = async (
    email: string,
    pass: string,
    fullName: string,
    role: 'earner' | 'employer' | string = 'earner'
  ): Promise<{ success: boolean; role?: 'earner' | 'employer'; error?: string }> => {
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;
      const normalizedRole: 'earner' | 'employer' = role === 'employer' ? 'employer' : 'earner';

      // Save user profile
      const profile = await syncUserWithD1(user.uid, fullName, email, normalizedRole);


      // Navigate to destination dashboard (Earners must activate first)
      const dest =
        profile.role === 'employer'
          ? '/employer-dashboard'
          : profile.is_activated
          ? '/earner-dashboard'
          : '/activate';
      navigate(dest);

      return { success: true, role: profile.role };
    } catch (err: any) {
      console.error(err);
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

  // Email / Password Login
  const loginWithEmail = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; role?: 'earner' | 'employer'; error?: string }> => {
    setAuthError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;

      const profile = await syncUserWithD1(
        user.uid,
        user.displayName || 'Member',
        user.email || email,
        'earner'
      );

      const dest =
        profile.role === 'employer'
          ? '/employer-dashboard'
          : profile.is_activated
          ? '/earner-dashboard'
          : '/activate';
      navigate(dest);

      return { success: true, role: profile.role };
    } catch (err: any) {
      console.error(err);
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


  // Google Sign-In
  const loginWithGoogle = async (
    role: 'earner' | 'employer' = 'earner'
  ): Promise<{ success: boolean; role?: 'earner' | 'employer'; error?: string }> => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const profile = await syncUserWithD1(
        user.uid,
        user.displayName || 'Member',
        user.email || '',
        role
      );

      const dest =
        profile.role === 'employer'
          ? '/employer-dashboard'
          : profile.is_activated
          ? '/earner-dashboard'
          : '/activate';
      navigate(dest);

      return { success: true, role: profile.role };
    } catch (err: any) {
      console.error(err);
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

  // Reset Password
  const resetPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      await sendPasswordResetEmail(auth, email);
      return {
        success: true,
        message: 'Password reset instructions have been sent to your email address.',
      };
    } catch (err: any) {
      console.error(err);
      let msg = 'Unable to send password reset email. Please try again.';
      if (err?.code === 'auth/user-not-found') {
        msg = 'No user account found with this email address.';
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err?.code === 'auth/network-request-failed') {
        msg = 'Could not connect to CDSure Tasks. Check your internet and try again.';
      }
      return { success: false, message: msg };
    }
  };

  // Logout
  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
      setFirebaseUser(null);
      setUserProfile(null);
      navigate('/login');
    } catch (err: any) {
      console.error('Logout notice:', err);
    }
  };

  // Update balance helper
  const updateUserBalance = async (delta: number) => {
    if (!firebaseUser || !userProfile) return;
    const newBalance = Math.max(0, userProfile.balance + delta);
    setUserProfile({ ...userProfile, balance: newBalance });
    try {
      await fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: firebaseUser.uid,
          balance: newBalance,
        }),
      });
    } catch (_err) {
      // Balance synced in local state
    }
  };

  // Switch role helper
  const switchUserRole = async (newRole: 'earner' | 'employer') => {
    if (!firebaseUser || !userProfile) return;
    const isAct = newRole === 'employer' ? 1 : (userProfile.is_activated ? 1 : 0);
    setUserProfile({ ...userProfile, role: newRole, is_activated: isAct });
    try {
      await fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: firebaseUser.uid,
          name: userProfile.name,
          email: userProfile.email,
          role: newRole,
        }),
      });
    } catch (_err) {
      // Role synced in local state
    }
    const dest = newRole === 'employer' ? '/employer-dashboard' : (isAct ? '/earner-dashboard' : '/activate');
    navigate(dest);
  };

  // Request presigned URL from backend / Cloudflare Worker (Step 1)
  const requestPresignedUploadUrl = async (
    filename: string,
    contentType: string = 'image/jpeg',
    folder: string = 'activation'
  ): Promise<{ success: boolean; uploadUrl?: string; publicUrl?: string; key?: string; error?: string }> => {
    try {
      const res = await fetch('/api/upload/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: firebaseUser?.uid || 'user',
          filename,
          contentType,
          folder,
        }),
      });
      if (!res.ok) throw new Error('Failed to obtain presigned upload link');
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Could not prepare upload' };
    }
  };

  // Upload compressed binary directly to presigned URL (Step 2)
  const uploadToPresignedUrl = async (
    uploadUrl: string,
    data: Blob | ArrayBuffer,
    contentType: string = 'image/jpeg'
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: data,
      });
      if (!res.ok) throw new Error(`Upload failed with HTTP ${res.status}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Direct upload failed' };
    }
  };

  // Direct proof upload (POST /api/upload-proof)
  const uploadProof = async (
    file: File | Blob,
    metadata: {
      sender_name?: string;
      sender_number?: string;
      reference?: string;
      amount?: number;
      type?: string;
      role?: string;
    } = {}
  ): Promise<{ success: boolean; proofId?: string; fileUrl?: string; status?: string; error?: string; message?: string }> => {
    if (!firebaseUser) return { success: false, error: 'Please sign in to upload proof.' };
    try {
      const token = await firebaseUser.getIdToken().catch(() => '');
      const formData = new FormData();
      formData.append('file', file, (file as any).name || 'proof.jpg');
      formData.append('user_id', firebaseUser.uid);
      if (firebaseUser.email) formData.append('email', firebaseUser.email);
      if (metadata.sender_name) formData.append('sender_name', metadata.sender_name);
      if (metadata.sender_number) formData.append('sender_number', metadata.sender_number);
      if (metadata.reference) formData.append('reference', metadata.reference);
      if (metadata.amount) formData.append('amount', String(metadata.amount));
      if (metadata.type) formData.append('type', metadata.type);
      if (metadata.role) formData.append('role', metadata.role);

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/upload-proof', {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.success === false)) {
        return {
          success: false,
          error: data?.error || data?.message || `Upload failed with status ${res.status}. Please try again.`,
        };
      }
      return data || { success: true, message: 'Upload completed' };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Could not connect to server. Please check your connection and try again.',
      };
    }
  };

  // Legacy Proof Submission (POST /api/upload-proof or /api/activation/submit)
  const submitActivationProof = async (
    data: FormData | {
      user_id?: string;
      userId?: string;
      email?: string;
      role?: 'employer' | 'earner';
      amount?: number;
      proof_image?: string;
      proofImageUrl?: string;
      sender_name?: string;
      senderName?: string;
      sender_number?: string;
      senderNumber?: string;
      reference?: string;
      txRef?: string;
      method?: string;
    }
  ) => {
    if (!firebaseUser) return { success: false, error: 'Please sign in to upload proof.' };
    try {
      const token = await firebaseUser.getIdToken().catch(() => '');
      const authHeaders: Record<string, string> = {};
      if (token) authHeaders['Authorization'] = `Bearer ${token}`;

      let res: Response;
      if (data instanceof FormData) {
        if (!data.get('user_id')) {
          data.append('user_id', firebaseUser.uid);
        }
        if (!data.get('email') && firebaseUser.email) {
          data.append('email', firebaseUser.email);
        }
        // Try /api/upload-proof first if it has a file
        if (data.get('file') || data.get('proof')) {
          res = await fetch('/api/upload-proof', {
            method: 'POST',
            headers: authHeaders,
            body: data,
          });
        } else {
          res = await fetch('/api/activation/submit', {
            method: 'POST',
            headers: authHeaders,
            body: data,
          });
        }
      } else {
        const payload = {
          user_id: data.user_id || data.userId || firebaseUser.uid,
          email: data.email || firebaseUser.email || '',
          role: data.role || userProfile?.role || 'earner',
          amount: data.amount || (userProfile?.role === 'employer' ? 5000 : 1500),
          proof_image: data.proof_image || data.proofImageUrl || '',
          sender_name: data.sender_name || data.senderName || '',
          sender_number: data.sender_number || data.senderNumber || '',
          reference: data.reference || data.txRef || '',
          method: data.method || 'Paystack',
        };
        res = await fetch('/api/payment/submit', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const resData = await res.json().catch(() => null);
      if (!res.ok || (resData && resData.success === false)) {
        return {
          success: false,
          error: resData?.error || resData?.message || `Submission failed with status ${res.status}. Please check details and try again.`,
        };
      }
      return resData || { success: true, message: 'Proof submitted successfully.' };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Could not connect to server. Please check your connection and try again.',
      };
    }
  };

  // Fetch Real Activation & Payment Status from /api/payments/status
  const fetchActivationStatus = useCallback(async (targetUserId?: string) => {
    const uid = targetUserId || firebaseUser?.uid;
    if (!uid) return null;
    try {
      const token = await firebaseUser?.getIdToken().catch(() => '');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/payments/status?userId=${encodeURIComponent(uid)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.payment_status) {
          setLatestPaymentStatus(data.payment_status);
        }
        if (data && (data.is_activated || typeof data.balance === 'number')) {
          setUserProfile((prev) => (prev ? {
            ...prev,
            is_activated: data.is_activated ? 1 : prev.is_activated,
            activation_paid_at: data.activation_paid_at || prev.activation_paid_at,
            balance: typeof data.balance === 'number' ? data.balance : prev.balance,
          } : null));
        }
        return data;
      }

      const legacyRes = await fetch(`/api/payment/status?userId=${encodeURIComponent(uid)}`, { headers });
      if (legacyRes.ok) {
        const legacyData = await legacyRes.json();
        if (legacyData?.payment_status) {
          setLatestPaymentStatus(legacyData.payment_status);
        }
        if (legacyData && legacyData.is_activated) {
          setUserProfile((prev) => (prev ? {
            ...prev,
            is_activated: 1,
            activation_paid_at: legacyData.activation_paid_at,
            balance: typeof legacyData.balance === 'number' ? legacyData.balance : prev.balance,
          } : null));
        }
        return legacyData;
      }
    } catch (_err) {
      // Handled silently
    }
    return null;
  }, [firebaseUser]);

  // Admin / Developer Confirm Button
  const confirmActivation = async (id: string, userId?: string) => {
    try {
      const token = await firebaseUser?.getIdToken().catch(() => '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/activations/confirm', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, user_id: userId }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Confirmation failed' };
    }
  };

  // Admin / Developer Release Button (The Main Fix)
  const releaseActivation = async (id: string, userId?: string) => {
    try {
      const token = await firebaseUser?.getIdToken().catch(() => '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/approve-payment', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, user_id: userId }),
      });
      const data = await res.json();
      if (data.success && (!userId || userId === firebaseUser?.uid)) {
        await fetchActivationStatus();
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Release failed' };
    }
  };

  // Admin / Developer Reject Button
  const rejectActivation = async (id: string, userId?: string, reason?: string) => {
    try {
      const token = await firebaseUser?.getIdToken().catch(() => '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/reject-payment', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, user_id: userId, reason }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Rejection failed' };
    }
  };


  // Deposit funds to wallet (Applies 30% CDSure Platform Charge)
  const depositToWallet = async (
    amount: number,
    role: 'employer' | 'earner' = 'earner',
    reference?: string
  ) => {
    if (!firebaseUser) return { success: false, error: 'Please sign in first' };
    try {
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: firebaseUser.uid,
          role,
          amount,
          reference,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUserProfile((prev) =>
          prev
            ? {
                ...prev,
                balance: data.balance,
                total_fees_paid: (prev.total_fees_paid || 0) + (data.feeAmount || 0),
                total_deposited: (prev.total_deposited || 0) + (data.netAmount || 0),
              }
            : null
        );
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Deposit failed' };
    }
  };

  // Withdraw funds from wallet (Applies 30% CDSure Platform Charge)
  const withdrawFromWallet = async (
    amount: number,
    role: 'employer' | 'earner' = 'earner',
    bankName: string = 'Commercial Bank',
    accountNumber: string = '',
    accountName: string = '',
    reference?: string
  ) => {
    if (!firebaseUser) return { success: false, error: 'Please sign in first' };
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: firebaseUser.uid,
          role,
          amount,
          bankName,
          accountNumber,
          accountName,
          reference,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUserProfile((prev) =>
          prev
            ? {
                ...prev,
                balance: data.balance,
                total_fees_paid: (prev.total_fees_paid || 0) + (data.feeAmount || 0),
              }
            : null
        );
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Withdrawal failed' };
    }
  };

  // Fetch full wallet stats including 30% fees paid and transactions
  const fetchWalletData = useCallback(
    async (userId?: string) => {
      const targetId = userId || firebaseUser?.uid;
      if (!targetId) return null;
      try {
        const res = await fetch(`/api/wallet/${targetId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.wallet) {
            setUserProfile((prev) =>
              prev
                ? {
                    ...prev,
                    balance: data.wallet.balance,
                    total_fees_paid: data.wallet.total_fees_paid || 0,
                    total_deposited: data.wallet.total_deposited || 0,
                    total_earned: data.wallet.total_earned || prev.balance,
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
    [firebaseUser]
  );

  // Fetch platform-wide 30% earnings summary for Admin
  const fetchPlatformEarnings = async () => {
    try {
      const res = await fetch('/api/admin/platform-earnings');
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Failed to fetch platform earnings:', err);
    }
    return null;
  };

  // Paystack Initialize (POST /api/payments/initialize)
  const initializePaystackPayment = async (
    amount: number,
    purpose: 'activation' | 'wallet_funding' | 'deposit' | 'subscription' | 'marketplace_purchase' = 'activation',
    metadata: Record<string, any> = {}
  ): Promise<{ success: boolean; authorization_url?: string; reference?: string; access_code?: string; error?: string }> => {
    if (!firebaseUser) return { success: false, error: 'Please sign in first.' };
    try {
      const token = await firebaseUser.getIdToken().catch(() => '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: firebaseUser.uid,
          email: firebaseUser.email || userProfile?.email,
          amount,
          purpose,
          role: userProfile?.role || 'earner',
          ...metadata,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        return { success: false, error: data?.error || 'Failed to initialize payment with Paystack.' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Payment initialization connection failed.' };
    }
  };

  // Paystack Verify (GET /api/payments/verify?reference=...)
  const verifyPaystackPayment = async (
    reference: string
  ): Promise<{ success: boolean; status?: string; message?: string; error?: string; is_activated?: number; balance?: number; purpose?: string; productId?: string | null; delivered?: boolean; delivery_url?: string | null }> => {
    try {
      const token = await firebaseUser?.getIdToken().catch(() => '');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`, { headers });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        if (data?.status) setLatestPaymentStatus(data.status);
        return { success: false, status: data?.status, error: data?.error || 'Payment verification failed.' };
      }

      setLatestPaymentStatus(data.status || 'success');

      // Update userProfile state immediately ONLY from verified server response
      if (data.is_activated) {
        setUserProfile((prev) => (prev ? { ...prev, is_activated: 1, activation_paid_at: data.verified_at || new Date().toISOString() } : null));
      }
      if (typeof data.balance === 'number') {
        setUserProfile((prev) => (prev ? { ...prev, balance: data.balance } : null));
      }

      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Verification connection failed.' };
    }
  };

  const initializeActivationPayment = async (email?: string) => {
    const amt = userProfile?.role === 'employer' ? 5000 : 1500;
    return initializePaystackPayment(amt, 'activation', { email: email || firebaseUser?.email });
  };

  const verifyActivationPayment = async (reference: string) => {
    return verifyPaystackPayment(reference);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        loading,
        authError,
        currentRoute,
        navigate,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        resetPassword,
        logout,
        updateUserBalance,
        switchUserRole,
        requestPresignedUploadUrl,
        uploadToPresignedUrl,
        depositToWallet,
        withdrawFromWallet,
        fetchWalletData,
        fetchPlatformEarnings,
        uploadProof,
        submitActivationProof,
        fetchActivationStatus,
        confirmActivation,
        releaseActivation,
        rejectActivation,
        initializePaystackPayment,
        verifyPaystackPayment,
        initializeActivationPayment,
        verifyActivationPayment,
        d1User: userProfile
          ? {
              uid: userProfile.uid,
              id: userProfile.uid,
              email: userProfile.email,
              full_name: userProfile.name,
              name: userProfile.name,
              role: userProfile.role,
              is_activated: userProfile.is_activated ? 1 : 0,
              balance: userProfile.balance,
              total_earned: userProfile.balance,
              referral_earnings: 0,
              created_at: new Date().toISOString(),
              payment_status: userProfile.is_activated ? 'success' : latestPaymentStatus,
              referral_code: userProfile.uid.substring(0, 8).toUpperCase(),
              referred_by: null,
            }
          : null,
        activationStatus: userProfile?.is_activated
          ? 'active'
          : latestPaymentStatus === 'pending'
          ? 'pending_verification'
          : latestPaymentStatus === 'failed' || latestPaymentStatus === 'abandoned'
          ? latestPaymentStatus
          : 'not_submitted',
        checkStatusDetails: null,
        checkActivationStatus: async (uid?: string) => fetchActivationStatus(uid),
        submitPayment: async (fd: FormData) => submitActivationProof(fd),
        adminConfirmPayment: async (uid: string) => confirmActivation(uid, uid),
        refreshUser: async () => {
          await Promise.all([fetchActivationStatus(), fetchWalletData()]);
        },
        fastForward24h: async () => {},
        tasksAvailableAt: null,
        formattedStartTime: null,
        tasksLocked24h: false,
        referralCodeFromUrl: '',
        completeTaskWithProof: async () => ({ success: true, message: 'Proof submitted' }),
        requestWithdrawal: async (amt: number, bank: string, accNum: string, accName: string) =>
          withdrawFromWallet(amt, userProfile?.role || 'earner', bank, accNum, accName),
        fetchTasks: async () => ({ tasks: [], expiresAt: '', isExpired: false, minutesLeft: 60 }),
        fetchDashboardData: async () => ({ referrals: [], referralCount: 0, withdrawals: [], completedToday: 0 }),
        verifyCodeOrToken: async (code?: string) => (code ? verifyPaystackPayment(code) : { success: false, error: 'Reference required' }),
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
