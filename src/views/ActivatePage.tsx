import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import confetti from 'canvas-confetti';
import {
  Lock,
  CheckCircle2,
  Clock,
  XCircle,
  Check,
  RefreshCw,
  ArrowRight,
  Briefcase,
  LogOut,
  AlertCircle,
  ShieldCheck,
  CreditCard,
  Zap,
  ExternalLink,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';

export const ActivatePage: React.FC = () => {
  const {
    firebaseUser,
    userProfile,
    initializePaystackPayment,
    verifyPaystackPayment,
    fetchActivationStatus,
    navigate,
    logout,
    switchUserRole,
  } = useAuth();

  const userRole = userProfile?.role || 'earner';
  const userEmail = firebaseUser?.email || userProfile?.email || '';

  // Status state
  const [paymentStatus, setPaymentStatus] = useState<string>('not_submitted');
  const [statusDetails, setStatusDetails] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);

  // Paystack checkout state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [verifyingRef, setVerifyingRef] = useState<boolean>(false);
  const [manualReference, setManualReference] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showManualVerify, setShowManualVerify] = useState<boolean>(false);

  // Amount calculation
  const amountToPay = userRole === 'employer' ? 5000 : 1500;
  const fee30 = Math.round(amountToPay * 0.30 * 100) / 100;
  const net70 = Math.round((amountToPay - fee30) * 100) / 100;

  // Load activation & payment status
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setErrorMsg(null);
    try {
      const data = await fetchActivationStatus();
      if (data) {
        setStatusDetails(data);
        if (data.is_activated) {
          setPaymentStatus('success');
        } else if (data.payment_status) {
          setPaymentStatus(data.payment_status);
        }
      }
    } catch (err: any) {
      console.warn('Could not load status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, [fetchActivationStatus]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Trigger celebration when active
  useEffect(() => {
    if (paymentStatus === 'success' || userProfile?.is_activated) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (_e) {}
    }
  }, [paymentStatus, userProfile?.is_activated]);

  // 1. Paystack Direct Checkout Trigger
  const handlePaystackCheckout = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!firebaseUser) {
      setErrorMsg('You must be signed in to initialize payment.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await initializePaystackPayment(
        amountToPay,
        'activation',
        {
          role: userRole,
          email: userEmail,
        }
      );

      if (result.success && result.authorization_url) {
        setSuccessMsg('Redirecting to Paystack Secure Checkout...');
        // Redirect user directly to Paystack official hosted checkout
        window.location.href = result.authorization_url;
      } else {
        setErrorMsg(result.error || 'Failed to initialize Paystack checkout. Please try again.');
        setSubmitting(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error connecting to Paystack payment server.');
      setSubmitting(false);
    }
  };

  // 2. Manual Reference Verification Check
  const handleVerifyReference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualReference.trim()) {
      setErrorMsg('Please enter your Paystack transaction reference.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setVerifyingRef(true);

    try {
      const result = await verifyPaystackPayment(manualReference.trim());
      if (result.success && result.status === 'success') {
        setPaymentStatus('success');
        setSuccessMsg('Payment verified! Your account is now active.');
        await loadStatus();
      } else {
        setErrorMsg(result.error || 'Payment could not be verified. Please check the reference code.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification connection failed.');
    } finally {
      setVerifyingRef(false);
    }
  };

  const navigateToDashboard = () => {
    if (userRole === 'employer') {
      navigate('/employer-dashboard');
    } else {
      navigate('/earner-dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 selection:bg-[#7C3AED] selection:text-white">
      {/* Brand Header */}
      <div className="flex flex-col items-center mb-6 text-center">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-10 h-10 rounded-2xl bg-[#7C3AED] flex items-center justify-center shadow-md shadow-purple-600/25">
            <Check className="w-6 h-6 text-white stroke-[3]" />
          </div>
          <span className="text-2xl font-black text-[#0f172a] tracking-tight">
            CDSure <span className="text-[#7C3AED]">Tasks</span>
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium">
          {userRole === 'employer' ? 'Employer Verification & Escrow Portal' : 'Earner Activation Portal'}
        </p>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/70 border border-slate-100 relative">
        {/* Top Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-50 text-[#7C3AED] border border-purple-100 mb-3 shadow-inner">
            <Lock className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0f172a] tracking-tight">
            {userRole === 'employer' ? 'Activate Employer Account' : 'Activate Your Account'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {userRole === 'employer'
              ? 'Fund your escrow account via Paystack to unlock task creation and worker payouts.'
              : 'Pay ₦1,500 one-time lifetime fee with Paystack to unlock daily micro-tasks and instant cash earnings.'}
          </p>
        </div>

        {/* Global Feedback Banners */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="leading-relaxed font-semibold">{successMsg}</span>
          </div>
        )}

        {/* =========================================================================
            STATE 1: ACCOUNT ACTIVATED (SUCCESS)
        ========================================================================== */}
        {(paymentStatus === 'success' || userProfile?.is_activated === 1) && (
          <div className="mb-6 p-6 rounded-2xl bg-emerald-50/90 border border-emerald-200 space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>
            <div>
              <span className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 rounded-full">
                Active & Verified
              </span>
              <h2 className="text-xl font-black text-emerald-950 mt-2">
                Account Successfully Activated
              </h2>
              <p className="text-xs text-emerald-800 mt-1 max-w-sm mx-auto">
                Your payment was verified through Paystack infrastructure. You now have unrestricted access.
              </p>
            </div>

            <button
              type="button"
              onClick={navigateToDashboard}
              className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-[0.99]"
            >
              <span>Go to {userRole === 'employer' ? 'Employer' : 'Earner'} Dashboard</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
          </div>
        )}

        {/* =========================================================================
            STATE 2: UNPAID / NOT ACTIVATED - PAYSTACK CHECKOUT CARD
        ========================================================================== */}
        {paymentStatus !== 'success' && !userProfile?.is_activated && (
          <div className="space-y-5">
            {/* Paystack Payment Summary Box */}
            <div className="border border-purple-200 bg-gradient-to-br from-purple-50/60 to-white rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#00C3F7]/10 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-[#00C3F7]" />
                  </div>
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Paystack Checkout
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Instant Activation
                </span>
              </div>

              {/* Price details */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Fee Category:</span>
                  <span className="font-semibold text-slate-900">
                    {userRole === 'employer' ? 'Employer Escrow Deposit' : 'One-Time Earner Activation'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Payer Email:</span>
                  <span className="font-mono text-slate-800">{userEmail}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-purple-100">
                  <span className="font-bold text-slate-700 text-sm">Total to Pay:</span>
                  <span className="text-2xl font-black text-[#7C3AED]">
                    ₦{amountToPay.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Supported Payment Channels */}
              <div className="pt-2 border-t border-purple-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Supported Paystack Channels:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                  <div className="bg-white border border-slate-200 rounded-lg p-2 text-center font-medium shadow-2xs">
                    💳 Debit Cards
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-2 text-center font-medium shadow-2xs">
                    🏦 Bank Transfer
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-2 text-center font-medium shadow-2xs">
                    📱 USSD Code
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-2 text-center font-medium shadow-2xs">
                    ⚡ Apple Pay / QR
                  </div>
                </div>
              </div>

              {/* Action Button: Pay with Paystack */}
              <button
                type="button"
                onClick={handlePaystackCheckout}
                disabled={submitting}
                className="w-full py-4 px-6 bg-[#00C3F7] hover:bg-[#00B4E3] active:scale-[0.99] text-white font-black rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg shadow-[#00C3F7]/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Connecting to Paystack...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                    <span>Pay ₦{amountToPay.toLocaleString()} with Paystack</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>

              <p className="text-[11px] text-center text-slate-500 font-medium">
                🔒 Secured by Paystack official 256-bit PCI-DSS payment gateway.
              </p>
            </div>

            {/* Toggle: Already have a Paystack reference? */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowManualVerify(!showManualVerify)}
                className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-[#7C3AED] transition"
              >
                <span>Already transferred via Paystack? Verify Reference</span>
                <ChevronRight className={`w-4 h-4 transition-transform ${showManualVerify ? 'rotate-90' : ''}`} />
              </button>

              {showManualVerify && (
                <form onSubmit={handleVerifyReference} className="mt-3.5 space-y-2.5 pt-3 border-t border-slate-200">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    If you completed checkout on Paystack and were not automatically redirected, enter your transaction reference below to verify instantly:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. cds_act_1741829381_x7y8z"
                      value={manualReference}
                      onChange={(e) => setManualReference(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#7C3AED]"
                    />
                    <button
                      type="submit"
                      disabled={verifyingRef}
                      className="py-2 px-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      {verifyingRef ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Verify</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Role Switch & Logout Footer */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <button
            type="button"
            onClick={() => switchUserRole(userRole === 'employer' ? 'earner' : 'employer')}
            className="flex items-center gap-1.5 hover:text-[#7C3AED] font-semibold transition"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Switch to {userRole === 'employer' ? 'Earner' : 'Employer'}</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 hover:text-red-600 font-semibold transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
