import React, { useState } from 'react';
import { Position, CandidateInfo } from '../types';
import { Coffee, MapPin, LayoutDashboard, ChevronRight, Check, Sparkles, Lock } from 'lucide-react';
import clsx from 'clsx';

interface WelcomeProps {
  onSelectPosition: (position: Position, candidateInfo: CandidateInfo) => void;
  onOpenDashboard: () => void;
  hasSessions: boolean;
}

export function Welcome({ onSelectPosition, onOpenDashboard, hasSessions }: WelcomeProps) {
  const [step, setStep] = useState<'intro' | 'form'>('intro');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState<Position>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && phone && email && position) {
      onSelectPosition(position, { name, phone, email });
    }
  };

  const isFormValid = name.trim() !== '' && phone.trim() !== '' && email.trim() !== '' && position !== null;

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#4B2C20] font-sans relative overflow-hidden flex flex-col">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-[#E8DFD8]/40 to-transparent -z-10" />
      <div className="absolute -top-48 -right-48 w-96 h-96 bg-[#D4A373]/10 rounded-full blur-3xl -z-10" />
      <div className="absolute top-1/2 -left-24 w-64 h-64 bg-[#4B2C20]/5 rounded-full blur-3xl -z-10" />

      <div className="max-w-4xl mx-auto px-4 py-6 flex-grow w-full flex flex-col">
        {/* Top Header with RRHH Access */}
        <div className="flex justify-between items-center mb-6 w-full">
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-[#4B2C20]" />
            <span className="font-serif font-bold text-sm tracking-wide text-[#4B2C20]">Ellianos Coffee</span>
          </div>
          <button
            onClick={onOpenDashboard}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E8DFD8] text-[#4B2C20] rounded-xl font-bold text-xs uppercase tracking-widest hover:border-[#D4A373] hover:shadow-xs transition-all"
          >
            <Lock className="w-3.5 h-3.5 text-[#D4A373]" />
            <span>Candidate Dashboard (RRHH)</span>
          </button>
        </div>
        
        <div className="flex-grow flex flex-col justify-center w-full">
          {step === 'intro' ? (
            <div className="flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
              
              <div className="relative">
                <div className="absolute inset-0 bg-[#D4A373] blur-xl opacity-30 rounded-full animate-pulse" />
                <div className="relative inline-flex items-center justify-center p-5 bg-white border border-[#E8DFD8] rounded-2xl shadow-xl">
                  <Coffee className="w-16 h-16 text-[#4B2C20]" strokeWidth={1.5} />
                  <div className="absolute -top-3 -right-3 bg-[#4B2C20] text-[#FAF7F2] text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-full flex items-center gap-1 shadow-md">
                    <Sparkles className="w-3 h-3" /> Hiring
                  </div>
                </div>
              </div>

              <div className="space-y-6 max-w-3xl">
                <h1 className="text-5xl md:text-7xl font-serif leading-[0.9] tracking-tight text-[#4B2C20]">
                  Are you ready to join the momentum?
                </h1>
                
                <p className="text-xl md:text-2xl font-serif italic text-[#D4A373] max-w-2xl mx-auto leading-relaxed">
                  We are opening our newest high-speed double drive-thru this October in Lehigh Acres, FL. We don't just serve coffee; <span className="not-italic text-[#4B2C20] font-medium">we serve momentum.</span>
                </p>

                <div className="flex items-center justify-center space-x-2 text-[#4B2C20] bg-white border border-[#E8DFD8] py-2 px-6 rounded-full inline-flex mx-auto shadow-sm">
                  <MapPin className="w-4 h-4 text-[#D4A373]" />
                  <span className="text-xs uppercase tracking-[0.2em] font-bold">Lehigh Acres, FL</span>
                </div>
              </div>
              
              <div className="pt-6">
                <button
                  onClick={() => setStep('form')}
                  className="group relative flex items-center gap-3 bg-[#4B2C20] text-[#FAF7F2] px-12 py-5 rounded-full font-bold text-sm uppercase tracking-widest hover:bg-[#3E2723] transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  Yes, I want to apply <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
              <div className="text-center space-y-4 mb-10">
                <div className="inline-flex items-center justify-center p-3 bg-white border border-[#E8DFD8] rounded-xl shadow-sm mb-2">
                  <Coffee className="w-8 h-8 text-[#4B2C20]" />
                </div>
                <h2 className="text-4xl font-serif tracking-tight text-[#4B2C20]">
                  Candidate Information
                </h2>
              </div>
              
              <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl border border-[#E8DFD8] p-8 md:p-12 mb-8 max-w-3xl mx-auto relative overflow-hidden">
                {/* Subtle top border accent */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#4B2C20] via-[#D4A373] to-[#4B2C20]" />

                <div className="text-center mb-10">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4A373] mb-2 block">Step 1 of 2</span>
                  <p className="text-[#4B2C20]/60 font-light mt-2 text-sm">Please provide your details to begin the AI assessment.</p>
                </div>

                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#4B2C20] ml-1">Full Name</label>
                      <input 
                        type="text" 
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full px-4 py-3 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4A373] focus:border-transparent transition-all text-sm font-light"
                        placeholder="e.g. John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#4B2C20] ml-1">Phone Number</label>
                      <input 
                        type="tel" 
                        required
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="w-full px-4 py-3 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4A373] focus:border-transparent transition-all text-sm font-light"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#4B2C20] ml-1">Email Address</label>
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4A373] focus:border-transparent transition-all text-sm font-light"
                      placeholder="john@example.com"
                    />
                  </div>

                  <div className="space-y-4 pt-6 border-t border-[#E8DFD8]/60">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#4B2C20] ml-1">Select Position</label>
                    <div className="grid md:grid-cols-3 gap-4">
                      {(['Barista', 'Shift Leader', 'Store Manager'] as Position[]).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setPosition(pos)}
                          className={clsx(
                            "flex flex-col items-center justify-center p-4 border-2 rounded-xl transition-all h-24",
                            position === pos 
                              ? "border-[#4B2C20] bg-[#4B2C20] text-[#FAF7F2] shadow-lg scale-[1.02]" 
                              : "border-[#E8DFD8] bg-[#FAF7F2] hover:border-[#D4A373] text-[#4B2C20] hover:bg-white"
                          )}
                        >
                          <span className="font-serif font-medium text-lg">{pos}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-8 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setStep('intro')}
                      className="text-xs uppercase tracking-widest text-[#4B2C20]/60 hover:text-[#4B2C20] font-bold transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={!isFormValid}
                      className="flex items-center gap-2 bg-[#4B2C20] text-[#FAF7F2] px-8 py-4 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#3E2723] disabled:opacity-50 disabled:hover:bg-[#4B2C20] disabled:transform-none transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                      Begin Interview <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer Credit */}
      <div className="w-full text-center py-6 mt-auto">
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-[#4B2C20]/40">
          App by <span className="text-[#D4A373]">GALIA SMART DEV</span>
        </p>
      </div>
    </div>
  );
}
