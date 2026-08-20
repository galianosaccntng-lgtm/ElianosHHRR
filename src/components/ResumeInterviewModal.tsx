import React from 'react';
import { Position, InterviewSession } from '../types';
import { Coffee, ArrowRight, Sparkles, RefreshCw, X } from 'lucide-react';
import clsx from 'clsx';

interface ResumeInterviewModalProps {
  session: InterviewSession;
  selectedPosition: Position;
  candidateName: string;
  onContinue: (session: InterviewSession) => void;
  onStartNew: () => void;
  onClose: () => void;
}

export function ResumeInterviewModal({
  session,
  selectedPosition,
  candidateName,
  onContinue,
  onStartNew,
  onClose,
}: ResumeInterviewModalProps) {
  const originalPosition = session.position || 'Barista';
  const isDifferentPosition = selectedPosition && selectedPosition !== originalPosition;
  
  const savedAnswersCount = (session.messages || []).filter(
    (m) => m.role === 'user' && m.parts?.[0]?.text && !m.parts[0].text.startsWith('Hello! I am applying')
  ).length;

  const formattedDate = session.date 
    ? new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'a previous session';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-[#FAF7F2] border border-[#E8DFD8] rounded-3xl shadow-2xl max-w-lg w-full p-6 md:p-8 relative text-[#4B2C20] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Accent top gradient bar */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#4B2C20] via-[#D4A373] to-[#4B2C20]" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-[#4B2C20]/40 hover:text-[#4B2C20] hover:bg-[#E8DFD8]/40 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-white border border-[#E8DFD8] rounded-2xl shadow-xs text-[#4B2C20]">
            <Coffee className="w-7 h-7 text-[#4B2C20]" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4A373] block">
              Unfinished Session Found
            </span>
            <h3 className="font-serif text-2xl md:text-3xl text-[#4B2C20] font-medium leading-tight">
              Welcome back, {candidateName || 'there'}!
            </h3>
          </div>
        </div>

        {/* Description Body */}
        <div className="space-y-4 my-6 text-[#4B2C20]/80 text-sm leading-relaxed font-light">
          <p>
            We found an unfinished interview for the <strong className="font-semibold text-[#4B2C20]">{originalPosition}</strong> position from <span className="font-medium text-[#4B2C20]">{formattedDate}</span> with <strong className="font-semibold text-[#4B2C20]">{savedAnswersCount} {savedAnswersCount === 1 ? 'answer' : 'answers'}</strong> saved.
          </p>
          <p>
            Would you like to pick up where you left off, or start a fresh interview?
          </p>

          {isDifferentPosition && (
            <div className="bg-[#E8DFD8]/40 border border-[#D4A373]/40 rounded-xl p-3 text-xs text-[#4B2C20]">
              <span className="font-bold text-[#4B2C20]">Note:</span> Continuing will resume your original application for the <strong>{originalPosition}</strong> position (you selected <em>{selectedPosition}</em> just now).
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
          <button
            onClick={() => onContinue(session)}
            className="flex-1 flex items-center justify-center gap-2 bg-[#4B2C20] text-[#FAF7F2] px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#3E2723] transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
          >
            <span>Continue my interview</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          
          <button
            onClick={onStartNew}
            className="flex items-center justify-center gap-1.5 bg-white border border-[#E8DFD8] text-[#4B2C20] px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:border-[#D4A373] hover:bg-[#FAF7F2] transition-all shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D4A373]" />
            <span>Start a new interview</span>
          </button>
        </div>
      </div>
    </div>
  );
}
