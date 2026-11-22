import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getPaystackPublicKey } from '../utils/paystackClient';
import confetti from 'canvas-confetti';
import {
  Check,
  CreditCard,
  Briefcase,
  TrendingUp,
  ArrowLeft,
  RefreshCw,
  LogOut,
  AlertCircle,
  ShieldCheck,
  Lock,
} from 'lucide-react';

export const ActivatePage: React.FC = () => {
  const {
    firebaseUser,
    userProfile,
    activationFees,
    fetchActivationFees,
    setRequestedRole,
    initializePaystackPayment,
    verifyPaystackPayment,
    refreshUser,
    navigate,
    logout,
  } = useAuth();

  const [choosingRole, setChoosingRole] = useState<boolean>(!userProfile?.requested_role);
  const [savingRole, setSavingRole] = useState<'earner' | 'employer' | null>(null);
  const [paying, setPaying] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [activeReference, setActiveReference] = useState<string>(userProfile?.activation_reference || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const autoVerifyTriggeredRef = useRef<boolean>(false);

  // Redirect to login immediately if unauthenticated
  useEffect(() => {
    if (!firebaseUser) {
      navigate('/login');
    }
  }, [firebaseUser, navigate]);

  useEffect(() => {
    fetchActivationFees();
  }, [fetchActivationFees]);

  useEffect(() => {
    if (!userProfile?.requested_role) {
      setChoosingRole(true);
    }
    if (userProfile?.activation_reference && !activeReference) {
      setActiveReference(userProfile.activation_reference);
    }
  }, [userProfile?.requested_role, userProfile?.activation_reference, activeReference]);

  // Auto-redirect immediately once payment_status is confirmed paid
  useEffect(() => {
    if (userProfile?.payment_status === 'paid') {
      navigate(userProfile.role === 'employer' ? '/employer-dashboard' : '/earner-dashboard');
    }
  }, [userProfile?.payment_status, userProfile?.role, navigate]);

  const selectedRole: 'earner' | 'employer' =
    userProfile?.requested_role === 'employer' ? 'employer' : 'earner';

  const feeAmount =
    selectedRole === 'employer' ? activationFees.employer_fee : activationFees.earner_fee;
  const bonusAmount =
    selectedRole === 'employer'
      ? activationFees.activation_bonus_employer
      : activationFees.activation_bonus_earner;

  const handleVerifyReference = useCallback(
    async (refToCheck?: string) => {
      if (!firebaseUser) {
        navigate('/login');
        return;
      }
      const ref = String(refToCheck || activeReference || userProfile?.activation_reference || '').trim();
      if (!ref) {
        setErrorMsg('Please click "Pay with Paystack" first to start your activation payment.');
        return;
      }

      setVerifying(true);
      setErrorMsg(null);
      setStatusMsg('Verifying payment with Paystack...');

      try {
        const result = await verifyPaystackPayment(ref);
        if (result.success && (result.status === 'success' || result.payment_status === 'paid')) {
          setStatusMsg('Payment verified! Unlocking your account...');
          try {
            confetti({ particleCount: 95, spread: 75, origin: { y: 0.6 } });
          } catch {}
          // Clean query params (?verify= / ?reference=) from URL
          try {
            window.history.replaceState({}, '', `${window.location.pathname}#${window.location.hash.replace(/^#/, '') || '/activate'}`);
          } catch {}
          const updated = await refreshUser();
          const finalRole = result.role || updated?.role || selectedRole;
          setTimeout(() => {
            navigate(finalRole === 'employer' ? '/employer-dashboard' : '/earner-dashboard');
          }, 900);
        } else {
          setStatusMsg(null);
          setErrorMsg(result.error || 'Payment not verified. Try again.');
        }
      } catch (err: any) {
        setStatusMsg(null);
        setErrorMsg(err?.message || 'Payment not verified. Try again.');
      } finally {
        setVerifying(false);
      }
    },
    [firebaseUser, activeReference, userProfile?.activation_reference, verifyPaystackPayment, refreshUser, selectedRole, navigate]
  );

  // Detect Paystack redirect callback: /activate?verify=CDSURE-xxx (or ?reference= / ?trxref=)
  useEffect(() => {
    if (!firebaseUser || autoVerifyTriggeredRef.current) return;
    if (typeof window === 'undefined') return;

    const searchParams = new URLSearchParams(window.location.search);
    const hashStr = window.location.hash || '';
    const hashParams = new URLSearchParams(hashStr.includes('?') ? hashStr.split('?')[1] : '');

    const callbackRef =
      searchParams.get('verify') ||
      searchParams.get('reference') ||
      searchParams.get('trxref') ||
      hashParams.get('verify') ||
      hashParams.get('reference') ||
      hashParams.get('trxref');

    if (callbackRef && callbackRef.trim()) {
      autoVerifyTriggeredRef.current = true;
      setChoosingRole(false);
      setActiveReference(callbackRef.trim());
      handleVerifyReference(callbackRef.trim());
    }
  }, [firebaseUser, handleVerifyReference]);

  const handleSelectRole = async (role: 'earner' | 'employer') => {
    if (!firebaseUser) {
      navigate('/login');
      return;
    }
    if (savingRole) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setSavingRole(role);
    try {
      await fetchActivationFees();
      const res = await setRequestedRole(role);
      if (!res.success) {
        setErrorMsg(res.error || 'Could not update role selection.');
        return;
      }
      setChoosingRole(false);
    } finally {
      setSavingRole(null);
    }
  };

  const handlePayWithPaystack = async () => {
    if (!firebaseUser) {
      navigate('/login');
      return;
    }
    if (paying || verifying) return;

    const publicKey = getPaystackPublicKey();
    if (!publicKey || !publicKey.startsWith('pk_live_')) {
      setErrorMsg('Live Paystack public key is not configured. Set PUBLIC_PAYSTACK_PUBLIC_KEY in Cloudflare Pages Production variables.');
      return;
    }

    setErrorMsg(null);
    setStatusMsg('Connecting to Paystack checkout...');
    setPaying(true);

    try {
      const latestFees = await fetchActivationFees();
      const authoritativeFee =
        selectedRole === 'employer' ? latestFees.employer_fee : latestFees.earner_fee;
      const amountInKobo = Math.round(authoritativeFee * 100);
      const cleanUid = firebaseUser.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'USER';
      const ref = `CDSURE-${cleanUid}-${Date.now()}`;
      const callbackUrl = `${window.location.origin}/activate?verify=${encodeURIComponent(ref)}`;

      setActiveReference(ref);

      const initRes = await initializePaystackPayment(amountInKobo, 'activation', {
        email: firebaseUser.email || userProfile?.email || '',
        amountNaira: authoritativeFee,
        unit: 'kobo',
        reference: ref,
        callback_url: callbackUrl,
        requested_role: selectedRole,
        role: selectedRole,
      });

      if (initRes?.authorization_url) {
        window.location.href = initRes.authorization_url;
        return;
      }

      setStatusMsg(null);
      setErrorMsg(`Payment init failed: ${JSON.stringify(initRes)}`);
      setPaying(false);
    } catch (err: any) {
      setStatusMsg(null);
      setErrorMsg(`Payment init failed: ${err?.message || 'Unable to reach payment server.'}`);
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 selection:bg-[#7C3AED] selection:text-white">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-[#7C3AED] flex items-center justify-center shadow-md shadow-purple-600/25">
          <Check className="w-6 h-6 text-white stroke-[3]" />
        </div>
        <span className="text-2xl font-black text-[#0f172a] tracking-tight">
          CDSure <span className="text-[#7C3AED]">Tasks</span>
        </span>
      </div>

      {/* ROLE CHOICE STEP */}
      {choosingRole ? (
        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 border border-slate-200 space-y-6">
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-50 border border-purple-200 text-[#7C3AED] text-xs font-bold mb-1">
              <Lock className="w-3.5 h-3.5" />
              <span>Account Activation Required</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">How would you like to use CDSure Tasks?</h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Choose your account role below to proceed to Paystack activation.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 font-medium break-words">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* EARNER CARD */}
            <button
              type="button"
              disabled={savingRole !== null}
              onClick={() => handleSelectRole('earner')}
              className={`text-left p-6 rounded-2xl border-2 transition-all flex flex-col justify-between space-y-4 hover:border-[#7C3AED] hover:bg-purple-50/40 disabled:opacity-60 disabled:cursor-not-allowed ${
                userProfile?.requested_role === 'earner'
                  ? 'border-[#7C3AED] bg-purple-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  {savingRole === 'earner' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7C3AED]">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Earner / Worker
                  </span>
                  <h2 className="text-lg font-black text-slate-900 mt-0.5">I want to EARN</h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Complete paid micro-tasks daily, submit screenshots, and withdraw Naira straight to your bank.
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Activation Fee</span>
                <span className="text-base font-black text-slate-900 tabular-nums">
                  ₦{activationFees.earner_fee.toLocaleString()}
                </span>
              </div>
            </button>

            {/* EMPLOYER CARD */}
            <button
              type="button"
              disabled={savingRole !== null}
              onClick={() => handleSelectRole('employer')}
              className={`text-left p-6 rounded-2xl border-2 transition-all flex flex-col justify-between space-y-4 hover:border-[#7C3AED] hover:bg-purple-50/40 disabled:opacity-60 disabled:cursor-not-allowed ${
                userProfile?.requested_role === 'employer'
                  ? 'border-[#7C3AED] bg-purple-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  {savingRole === 'employer' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7C3AED]">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    Employer
                  </span>
                  <h2 className="text-lg font-black text-slate-900 mt-0.5">I want to HIRE</h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Post tasks, get real engagements and submissions from verified workers, and manage campaigns.
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Activation Fee</span>
                <span className="text-base font-black text-slate-900 tabular-nums">
                  ₦{activationFees.employer_fee.toLocaleString()}
                </span>
              </div>
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="truncate font-mono">{userProfile?.email || firebaseUser?.email}</span>
            <button
              type="button"
              onClick={logout}
              className="font-semibold text-slate-600 hover:text-red-600 flex items-center gap-1.5 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      ) : (
        /* ACTIVATION PAYMENT STEP (PAYSTACK REDIRECT ONLY) */
        <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 border border-slate-200 space-y-5">
          <div className="text-center space-y-1.5">
            <span
              className={`inline-block px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider border ${
                selectedRole === 'employer'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-purple-50 text-[#7C3AED] border-purple-200'
              }`}
            >
              {selectedRole === 'employer' ? 'Employer Account' : 'Earner / Worker Account'}
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight pt-1">Activate Your Account</h1>
            <p className="text-xs sm:text-sm text-slate-500">Pay activation fee to unlock your account.</p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 font-semibold break-words">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Fee Summary Box */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Selected Role</span>
              <span className="text-xs font-extrabold text-slate-900 uppercase">
                {selectedRole === 'employer' ? 'Employer' : 'Earner / Worker'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Account Email</span>
              <span className="text-xs font-mono text-slate-700 truncate max-w-[220px]">
                {userProfile?.email || firebaseUser?.email}
              </span>
            </div>
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">One-Time Activation Fee</span>
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                ₦{feeAmount.toLocaleString()}
              </span>
            </div>
            {bonusAmount > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-700 font-bold">
                <span>Welcome Wallet Bonus</span>
                <span className="tabular-nums">+₦{bonusAmount.toLocaleString()}</span>
              </div>
            )}
            {activeReference && (
              <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-500">
                <span>Reference</span>
                <span className="font-mono font-semibold text-slate-700">{activeReference}</span>
              </div>
            )}
          </div>

          {/* Big Green Paystack Redirect CTA */}
          <button
            type="button"
            disabled={paying || verifying}
            onClick={handlePayWithPaystack}
            className="w-full py-4 px-5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black rounded-2xl text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-60"
          >
            {paying ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Redirecting to Paystack...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                <span>Pay ₦{feeAmount.toLocaleString()} with Paystack</span>
              </>
            )}
          </button>

          {/* Verify & Change Role actions */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              disabled={verifying || paying}
              onClick={() => handleVerifyReference()}
              className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
              <span>{verifying ? 'Verifying...' : 'I have paid, Verify My Payment'}</span>
            </button>

            <button
              type="button"
              disabled={paying || verifying}
              onClick={() => {
                setErrorMsg(null);
                setStatusMsg(null);
                setChoosingRole(true);
              }}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Role</span>
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Instant activation upon Paystack verification</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="font-semibold text-slate-500 hover:text-red-600 flex items-center gap-1 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
