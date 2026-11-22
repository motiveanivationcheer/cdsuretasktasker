import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { SupportSection } from '../components/SupportSection';
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  HelpCircle,
  Zap,
  MessageCircle,
} from 'lucide-react';

export const ChatPage: React.FC = () => {
  const { firebaseUser, userProfile, navigate } = useAuth();

  // If user is not logged in, immediately redirect to Login page
  useEffect(() => {
    if (!firebaseUser) {
      navigate('/login');
    }
  }, [firebaseUser, navigate]);

  const handleBack = () => {
    if (userProfile?.role === 'employer') {
      navigate('/employer-dashboard');
    } else {
      navigate('/earner-dashboard');
    }
  };

  const faqs = [
    {
      q: 'How fast do you reply on Telegram & WhatsApp?',
      a: 'Our customer support team is active 24/7. Most queries are answered within 3 to 10 minutes.',
    },
    {
      q: 'I paid ₦1,500 activation fee, when will my account unlock?',
      a: 'Once you complete your ₦1,500 Paystack activation payment on the Activation page, your account unlocks automatically upon verification. If your verification is delayed, send your Paystack reference directly on WhatsApp or Telegram for instant support.',
    },
    {
      q: 'How do withdrawals work on CDSure Tasks?',
      a: 'Earners and employers can withdraw directly to Opay, PalmPay, or any Nigerian bank account. Withdrawals are processed safely with the 30% platform charge clearly calculated.',
    },
    {
      q: 'Can employers get support with posting jobs?',
      a: 'Yes! If you need help creating custom tasks, verifying worker submissions, or funding your wallet, contact us via Telegram or WhatsApp.',
    },
  ];

  if (!firebaseUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col selection:bg-[#7C3AED] selection:text-white pb-12">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3.5 shadow-xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 flex items-center justify-center transition-all cursor-pointer"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#7C3AED] flex items-center justify-center shadow-xs">
                <Check className="w-4 h-4 text-white stroke-[3]" />
              </div>
              <div>
                <h1 className="text-sm font-black text-[#0f172a] leading-tight">
                  CDSure <span className="text-[#7C3AED]">Support</span>
                </h1>
                <p className="text-[10px] text-slate-400 font-medium">
                  Live Help & Chat Desk
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="text-xs font-bold text-[#7C3AED] hover:underline px-2.5 py-1 rounded-lg hover:bg-purple-50 transition"
          >
            Dashboard
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto w-full px-4 pt-6 space-y-6">
        {/* Hero Banner */}
        <div className="rounded-3xl bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] text-white p-6 sm:p-8 shadow-xl shadow-purple-600/20 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-bold mb-3 border border-white/20 backdrop-blur-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Agents Active 24/7</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
              How can we assist you today?
            </h2>
            <p className="text-xs sm:text-sm text-purple-100 max-w-xl leading-relaxed">
              Connect directly with official CDSure Tasks representatives on Telegram or WhatsApp. We provide instant assistance with activations, task submissions, wallet funding, and withdrawals.
            </p>
          </div>
        </div>

        {/* Primary Support Contact Section (No numbers displayed) */}
        <SupportSection
          title="Chat With Us / Support"
          subtitle="Need help with daily tasks, activation, or wallet withdrawals? We are online to assist you."
          className="border-slate-200 shadow-md"
        />

        {/* Quick Help / Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-[#7C3AED] flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#0f172a]">Instant Responses</h4>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Average reply time is under 5 minutes during peak hours.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#0f172a]">Account Verification</h4>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Fast-track ₦1,500 activation confirmation directly with admins.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#0f172a]">Direct Channels</h4>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Official Telegram Community & WhatsApp Live Support Desk.
              </p>
            </div>
          </div>
        </div>

        {/* Frequently Asked Questions */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-[#7C3AED] flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
            <h3 className="text-base font-extrabold text-[#0f172a]">
              Frequently Asked Questions
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {faqs.map((faq, index) => (
              <div key={index} className="py-3.5 first:pt-0 last:pb-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-800 mb-1">
                  {faq.q}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Back navigation button */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#7C3AED] bg-slate-100 hover:bg-slate-200 px-5 py-2.5 rounded-xl transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </main>
    </div>
  );
};
