import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import confetti from 'canvas-confetti';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Download,
} from 'lucide-react';

export const PaystackCallbackPage: React.FC = () => {
  const { verifyPaystackPayment, navigate, userProfile } = useAuth();
  const [verifying, setVerifying] = useState<boolean>(true);
  const [success, setSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string>('');
  const [verifiedData, setVerifiedData] = useState<{
    purpose?: string;
    productId?: string | null;
    delivered?: boolean;
    delivery_url?: string | null;
    status?: string;
  } | null>(null);

  useEffect(() => {
    const handleVerify = async () => {
      // Extract reference from window.location search or hash
      const hashStr = window.location.hash || '';
      const searchStr = window.location.search || '';
      const params = new URLSearchParams(hashStr.includes('?') ? hashStr.split('?')[1] : searchStr);

      const reference = params.get('reference') || params.get('trxref') || '';
      setRefCode(reference);

      if (!reference) {
        setVerifying(false);
        setErrorMessage('No payment reference found in URL callback.');
        return;
      }

      try {
        const result = await verifyPaystackPayment(reference);
        if (result.success && result.status === 'success') {
          setSuccess(true);
          setVerifiedData({
            purpose: result.purpose,
            productId: result.productId,
            delivered: result.delivered,
            delivery_url: result.delivery_url,
            status: result.status,
          });
          try {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
            });
          } catch (_e) {}
        } else {
          setVerifiedData({ status: result.status });
          setErrorMessage(result.error || 'Payment verification could not be completed.');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Error communicating with Paystack verification server.');
      } finally {
        setVerifying(false);
      }
    };

    handleVerify();
  }, [verifyPaystackPayment]);

  const handleContinue = () => {
    if (verifiedData?.delivered || verifiedData?.productId || verifiedData?.purpose === 'marketplace_purchase' || verifiedData?.purpose === 'subscription') {
      navigate('/marketplace');
      return;
    }
    if (userProfile?.role === 'employer') {
      navigate('/employer-dashboard');
    } else {
      navigate('/earner-dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 selection:bg-[#7C3AED] selection:text-white">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/70 border border-slate-100 text-center">
        {verifying && (
          <div className="space-y-4 py-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-50 text-[#7C3AED] flex items-center justify-center animate-spin">
              <RefreshCw className="w-8 h-8 stroke-[2.5]" />
            </div>
            <h2 className="text-xl font-black text-[#0f172a]">Verifying Paystack Payment</h2>
            <p className="text-xs text-slate-500">
              Connecting directly to Paystack servers to verify your transaction reference...
            </p>
            {refCode && (
              <p className="text-[11px] font-mono text-purple-600 bg-purple-50 p-2 rounded-xl">
                Ref: {refCode}
              </p>
            )}
          </div>
        )}

        {!verifying && success && (
          <div className="space-y-4 py-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
            </div>
            <h2 className="text-2xl font-black text-[#0f172a]">
              {verifiedData?.delivered ? 'Purchase Verified & Unlocked!' : 'Payment Confirmed!'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              {verifiedData?.delivered
                ? 'Your payment was verified server-side with Paystack and your digital package is ready in the Marketplace.'
                : 'Your transaction has been verified with Paystack. Your account is now updated and active.'}
            </p>

            <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-2xl flex items-center gap-2 text-left">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-[11px] text-emerald-800 font-medium leading-relaxed">
                Verified via Paystack API. Reference: <span className="font-mono font-bold">{refCode}</span>
              </span>
            </div>

            <button
              onClick={handleContinue}
              className="w-full py-3.5 px-6 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all active:scale-[0.99]"
            >
              {verifiedData?.delivered ? (
                <>
                  <Download className="w-4 h-4" />
                  <span>Open My Marketplace Downloads</span>
                </>
              ) : (
                <>
                  <span>Continue to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {!verifying && !success && (
          <div className="space-y-4 py-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <XCircle className="w-9 h-9 stroke-[2.5]" />
            </div>
            <h2 className="text-xl font-black text-[#0f172a]">
              {verifiedData?.status === 'abandoned'
                ? 'Payment Cancelled'
                : verifiedData?.status === 'failed'
                ? 'Payment Failed'
                : 'Verification Incomplete'}
            </h2>
            <p className="text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-100 leading-relaxed">
              {errorMessage || 'Unable to confirm payment status. Digital delivery remains locked.'}
            </p>
            {refCode && (
              <p className="text-[10px] font-mono text-slate-400">
                Reference: {refCode}
              </p>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => navigate('/marketplace')}
                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Marketplace</span>
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 px-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Check</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
