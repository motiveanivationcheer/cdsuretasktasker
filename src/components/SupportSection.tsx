import React from 'react';
import { MessageSquare } from 'lucide-react';

interface SupportSectionProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

export const SupportSection: React.FC<SupportSectionProps> = ({
  title = 'Chat With Us / Support',
  subtitle = 'Need help with daily tasks, activation, or wallet withdrawals? We are online to assist you.',
  className = '',
}) => {
  // Background link targets (Phone number is hidden from UI)
  const telegramLink = 'https://t.me/+ak03mtltqgM2ZjA8';
  const whatsappLink =
    'https://wa.me/2349075387835?text=Hello%20CDSure%2C%20I%20need%20help.%20My%20Telegram%3A%20https%3A%2F%2Ft.me%2F%2Bak03mtltqgM2ZjA8';

  return (
    <section
      aria-label="Support Contact Section"
      className={`w-full rounded-3xl bg-white border border-slate-200/90 shadow-sm p-4 sm:p-5 transition-all ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-xl bg-purple-50 text-[#7C3AED]">
              <MessageSquare className="w-4 h-4 stroke-[2.5]" />
            </span>
            <h3 className="text-sm sm:text-base font-black text-[#0f172a] tracking-tight">
              {title}
            </h3>
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 leading-relaxed max-w-md">
              {subtitle}
            </p>
          )}
        </div>

        {/* Small Green Badge: Online */}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Online</span>
        </span>
      </div>

      {/* 2 Big Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        {/* 1. TELEGRAM BUTTON */}
        <a
          href={telegramLink}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:flex-1 py-3 px-4 bg-[#229ED9] hover:bg-[#1E88C7] active:scale-[0.99] text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-[#229ED9]/25 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
        >
          {/* Telegram Plane SVG */}
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 fill-current shrink-0"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
          </svg>
          <span>Chat on Telegram</span>
        </a>

        {/* 2. WHATSAPP BUTTON */}
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:flex-1 py-3 px-4 bg-[#25D366] hover:bg-[#20BA5A] active:scale-[0.99] text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-[#25D366]/25 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
        >
          {/* WhatsApp SVG */}
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 fill-current shrink-0"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.05 6.63C8.89 6.63 8.63 6.69 8.41 6.93C8.19 7.17 7.57 7.75 7.57 8.93C7.57 10.11 8.43 11.25 8.55 11.41C8.67 11.57 10.25 13.98 12.67 15.03C13.25 15.28 13.7 15.43 14.05 15.54C14.64 15.73 15.17 15.7 15.6 15.64C16.08 15.57 17.07 15.04 17.28 14.45C17.49 13.86 17.49 13.36 17.43 13.25C17.37 13.14 17.21 13.08 16.97 12.96C16.73 12.84 15.55 12.26 15.33 12.18C15.11 12.1 14.95 12.06 14.79 12.3C14.63 12.54 14.17 13.08 14.03 13.24C13.89 13.4 13.75 13.42 13.51 13.3C13.27 13.18 12.5 12.93 11.58 12.11C10.87 11.48 10.39 10.7 10.25 10.46C10.11 10.22 10.23 10.09 10.35 9.97C10.46 9.86 10.6 9.68 10.72 9.54C10.84 9.4 10.88 9.3 10.96 9.14C11.04 8.98 11 8.84 10.94 8.72C10.88 8.6 10.42 7.47 10.23 7C10.04 6.55 9.85 6.61 9.71 6.6C9.58 6.6 9.42 6.6 9.26 6.6L9.05 6.63Z" />
          </svg>
          <span>Chat on WhatsApp</span>
        </a>
      </div>

      {/* Required caption */}
      <p className="text-xs text-center text-slate-500 font-medium mt-3">
        Tap to chat, we reply fast
      </p>
    </section>
  );
};
