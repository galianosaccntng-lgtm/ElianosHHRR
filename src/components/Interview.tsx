import React, { useState, useEffect, useRef } from 'react';
import { Position, Message, InterviewSession, TypingMetrics } from '../types';
import { Send, ArrowLeft, Bot, User, Loader2, CheckCircle, PartyPopper, RefreshCw, AlertCircle } from 'lucide-react';
import Markdown from 'react-markdown';
import clsx from 'clsx';
import confetti from 'canvas-confetti';
import { humanConfidence } from '../authenticity';

interface InterviewProps {
  session: InterviewSession;
  onBack: () => void;
  onUpdateSession: (updatedSession: InterviewSession) => void;
}

export function Interview({ session, onBack, onUpdateSession }: InterviewProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPasteWarning, setShowPasteWarning] = useState(false);
  const [showLowConfidenceWarning, setShowLowConfidenceWarning] = useState(false);
  const [hasBeenWarnedForCurrentAnswer, setHasBeenWarnedForCurrentAnswer] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastInitSessionId = useRef<string | null>(null);
  const pasteWarningTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Authenticity & Typing Telemetry Refs
  const firstKeystrokeTimeRef = useRef<number | null>(null);
  const lastQuestionReceivedAtRef = useRef<number>(Date.now());
  const keystrokesRef = useRef<number>(0);
  const maxInsertChunkRef = useRef<number>(0);
  const tabSwitchesRef = useRef<number>(0);
  const pasteAttemptsRef = useRef<number>(0);
  const lastInputLengthRef = useRef<number>(0);

  // Track tab / window visibility switches
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabSwitchesRef.current += 1;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Cleanup paste warning timer on unmount
  useEffect(() => {
    return () => {
      if (pasteWarningTimerRef.current) {
        clearTimeout(pasteWarningTimerRef.current);
      }
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, isLoading, errorMessage]);

  // Focus textarea when loading completes
  useEffect(() => {
    if (!isLoading && !isSubmitting && !isSuccess) {
      textareaRef.current?.focus();
    }
  }, [isLoading, isSubmitting, isSuccess]);

  const handleBlockedPaste = (e: React.ClipboardEvent | React.DragEvent) => {
    e.preventDefault();
    pasteAttemptsRef.current += 1;
    setShowPasteWarning(true);
    if (pasteWarningTimerRef.current) {
      clearTimeout(pasteWarningTimerRef.current);
    }
    pasteWarningTimerRef.current = setTimeout(() => {
      setShowPasteWarning(false);
    }, 4000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const now = Date.now();
    if (firstKeystrokeTimeRef.current === null && val.length > 0) {
      firstKeystrokeTimeRef.current = now;
    }
    keystrokesRef.current += 1;
    const inserted = Math.max(0, val.length - lastInputLengthRef.current);
    if (inserted > maxInsertChunkRef.current) {
      maxInsertChunkRef.current = inserted;
    }
    lastInputLengthRef.current = val.length;
    setInput(val);
  };

  const initChat = async (retryCount = 0) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const initialHistory: Message[] = [
        {
          role: 'user',
          parts: [{ text: `Hello! I am applying for the ${session.position} position at the new Lehigh Acres location.` }]
        }
      ];
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: session.position,
          candidateInfo: session.candidateInfo,
          history: initialHistory
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize AI recruiter');
      }
      
      const data = await response.json();
      
      onUpdateSession({
        ...session,
        messages: [
          ...initialHistory,
          { role: 'model', parts: [{ text: data.text }] }
        ]
      });
      lastQuestionReceivedAtRef.current = Date.now();
    } catch (err: any) {
      console.error('Initialization error:', err);
      if (retryCount < 2) {
        console.log(`Retrying initial greeting (${retryCount + 1}/2)...`);
        setTimeout(() => initChat(retryCount + 1), 1000);
      } else {
        setErrorMessage(err.message || 'Unable to connect to AI recruiter. Please tap Retry.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Initial greeting - only run if messages array is empty
  useEffect(() => {
    if (session.messages && session.messages.length > 0) {
      lastInitSessionId.current = session.id;
      lastQuestionReceivedAtRef.current = Date.now();
      return;
    }
    if (lastInitSessionId.current === session.id) return;
    lastInitSessionId.current = session.id;
    initChat();
  }, [session.id, session.messages?.length]);

  const executeSend = async (bypassWarning = false) => {
    const textToSend = input.trim();
    if (!textToSend || isLoading || isSubmitting) return;

    setErrorMessage(null);

    // Calculate typing telemetry metrics
    const now = Date.now();
    const firstKeyTime = firstKeystrokeTimeRef.current || now;
    const typingDurationMs = Math.max(1, now - firstKeyTime);
    const responseDelayMs = Math.max(0, firstKeyTime - lastQuestionReceivedAtRef.current);
    const words = textToSend.split(/\s+/).filter(Boolean).length;
    const durationMinutes = typingDurationMs / 60000;
    const wpm = durationMinutes > 0 ? Math.round(words / durationMinutes) : 0;

    const metrics: TypingMetrics = {
      typingDurationMs,
      keystrokes: keystrokesRef.current,
      maxInsertChunk: maxInsertChunkRef.current,
      responseDelayMs,
      tabSwitches: tabSwitchesRef.current,
      wpm,
      pasteAttempts: pasteAttemptsRef.current,
    };

    let calculatedConfidence: number | null = null;
    try {
      calculatedConfidence = humanConfidence(metrics, textToSend.length);
    } catch (calcErr) {
      console.warn('Error calculating human confidence:', calcErr);
    }

    if (calculatedConfidence !== null) {
      metrics.humanConfidence = calculatedConfidence;
    }

    // Check if low confidence warning is needed (< 35%) and not yet warned
    if (!bypassWarning && calculatedConfidence !== null && calculatedConfidence < 35 && !hasBeenWarnedForCurrentAnswer) {
      setShowLowConfidenceWarning(true);
      return;
    }

    if (bypassWarning || hasBeenWarnedForCurrentAnswer) {
      metrics.lowConfidenceWarned = true;
    }

    // Reset warning state and telemetry counters for next answer
    setShowLowConfidenceWarning(false);
    setHasBeenWarnedForCurrentAnswer(false);

    firstKeystrokeTimeRef.current = null;
    keystrokesRef.current = 0;
    maxInsertChunkRef.current = 0;
    tabSwitchesRef.current = 0;
    pasteAttemptsRef.current = 0;
    lastInputLengthRef.current = 0;

    const userMessage: Message = { role: 'user', parts: [{ text: textToSend }], metrics };
    const newHistory = [...session.messages, userMessage];
    
    // Optimistically update messages
    onUpdateSession({ ...session, status: 'In Progress', messages: newHistory });
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: session.position,
          candidateInfo: session.candidateInfo,
          history: newHistory
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'The AI recruiter had a temporary hiccup');
      }
      
      const data = await response.json();

      onUpdateSession({
        ...session,
        status: 'In Progress',
        messages: [...newHistory, { role: 'model', parts: [{ text: data.text }] }]
      });
      lastQuestionReceivedAtRef.current = Date.now();
    } catch (err: any) {
      console.error('Message delivery error:', err);
      // Restore user text in input so they don't lose what they wrote
      setInput(textToSend);
      // Revert optimistic message
      onUpdateSession({ ...session, messages: session.messages });
      setErrorMessage(err.message || 'Failed to send response. Your text was preserved. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeSend(false);
  };

  const handleRewrite = () => {
    setShowLowConfidenceWarning(false);
    setHasBeenWarnedForCurrentAnswer(false);
    firstKeystrokeTimeRef.current = null;
    keystrokesRef.current = 0;
    maxInsertChunkRef.current = 0;
    tabSwitchesRef.current = 0;
    pasteAttemptsRef.current = 0;
    lastInputLengthRef.current = input.length;
    textareaRef.current?.focus();
  };

  const handleSendAsIs = () => {
    setShowLowConfidenceWarning(false);
    setHasBeenWarnedForCurrentAnswer(true);
    executeSend(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFinish = async () => {
    if (isSubmitting || isLoading) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    
    try {
      const response = await fetch('/api/evaluate-and-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session })
      });
      
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudo enviar la solicitud al servidor. Inténtelo de nuevo.');
      }
      
      // Update session as completed with evaluation only after verified server response
      onUpdateSession({
        ...session,
        status: 'Completed',
        evaluation: result.evaluation || undefined,
        emailSent: result.emailSent ?? false
      });
      
      // Trigger Confetti Celebration
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 6,
          angle: 60,
          spread: 60,
          origin: { x: 0 },
          colors: ['#4B2C20', '#D4A373', '#FAF7F2']
        });
        confetti({
          particleCount: 6,
          angle: 120,
          spread: 60,
          origin: { x: 1 },
          colors: ['#4B2C20', '#D4A373', '#FAF7F2']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();

      setIsSuccess(true);
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrorMessage(err.message || 'Submission issue encountered. Please press Submit again to retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modelMessagesCount = session.messages.filter(msg => msg.role === 'model').length;
  const maxQuestions = 25;
  const currentQuestion = Math.min(modelMessagesCount, maxQuestions);
  const progressPercentage = Math.min(100, (currentQuestion / maxQuestions) * 100);
  const estimatedMinutesLeft = Math.max(0, Math.ceil((maxQuestions - currentQuestion) * 1.5));

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAF7F2] font-sans px-4">
        <div className="bg-white p-10 md:p-16 rounded-3xl shadow-xl border border-[#E8DFD8] text-center max-w-2xl animate-in fade-in zoom-in duration-700">
          <div className="inline-flex items-center justify-center p-6 bg-[#D4A373]/20 rounded-full mb-6">
            <PartyPopper className="w-16 h-16 text-[#D4A373]" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-[#4B2C20] mb-4">Application Submitted!</h1>
          <p className="text-xl font-light text-[#4B2C20]/80 mb-8 leading-relaxed">
            Thank you, <strong className="font-semibold text-[#4B2C20]">{session.candidateInfo.name}</strong>. Your interview for the <strong className="font-semibold text-[#4B2C20]">{session.position}</strong> role is complete and has been securely sent to our management team. We will be in touch soon!
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onBack}
              className="w-full sm:w-auto bg-[#4B2C20] text-[#FAF7F2] px-10 py-4 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#3E2723] transition-all shadow-md hover:shadow-lg"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#FAF7F2] font-sans">
      {/* Header */}
      <header className="flex flex-col bg-white border-b border-[#E8DFD8] shadow-sm shrink-0">
        <div className="flex items-center justify-between px-6 py-4">
          <button 
            onClick={onBack}
            className="flex items-center text-[#4B2C20]/60 hover:text-[#4B2C20] transition-colors uppercase tracking-widest text-[10px] font-bold w-32"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          
          <div className="text-center flex-1">
            <h2 className="text-xl font-serif font-medium text-[#4B2C20]">Ellianos Interview</h2>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-[10px] uppercase tracking-widest text-[#D4A373] font-bold">{session.position} Candidate</span>
              <span className="text-[#E8DFD8]">•</span>
              <span className="text-[10px] uppercase tracking-widest text-[#4B2C20]/60 font-bold">Question {currentQuestion} of {maxQuestions}</span>
              {estimatedMinutesLeft > 0 && (
                <>
                  <span className="text-[#E8DFD8]">•</span>
                  <span className="text-[10px] uppercase tracking-widest text-[#4B2C20]/60 font-bold">~{estimatedMinutesLeft} mins left</span>
                </>
              )}
            </div>
          </div>
          
          <div className="w-32 flex justify-end">
            <button 
              onClick={handleFinish}
              disabled={isSubmitting || isLoading || session.messages.length <= 1}
              className="flex items-center gap-1.5 bg-[#4B2C20] text-[#FAF7F2] px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-[#3E2723] disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Submit
            </button>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-1 bg-[#FAF7F2]">
          <div 
            className="h-full bg-[#D4A373] transition-all duration-700 ease-out" 
            style={{ width: `${progressPercentage}%` }} 
          />
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {session.messages.map((msg, i) => {
            // Hide the initial hidden prompt from the user interface
            if (i === 0 && msg.role === 'user') return null;

            const isModel = msg.role === 'model';
            return (
              <div 
                key={i} 
                className={clsx(
                  "flex items-start max-w-[85%]", 
                  isModel ? "mr-auto" : "ml-auto flex-row-reverse"
                )}
              >
                <div className={clsx(
                  "flex items-center justify-center w-10 h-10 rounded-full shrink-0 shadow-sm",
                  isModel ? "bg-[#4B2C20] text-[#FAF7F2] mr-4" : "bg-[#D4A373] text-[#4B2C20] ml-4"
                )}>
                  {isModel ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className={clsx(
                  "px-5 py-4 rounded-2xl shadow-sm text-[15px] leading-relaxed",
                  isModel 
                    ? "bg-[#F5F5F5] border border-[#E8DFD8] text-[#4B2C20] rounded-tl-none" 
                    : "bg-[#4B2C20] text-[#FAF7F2] rounded-tr-none"
                )}>
                  {isModel ? (
                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-a:text-[#D4A373] prose-headings:font-serif">
                      <Markdown>{msg.parts[0].text}</Markdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap font-light">{msg.parts[0].text}</p>
                  )}
                </div>
              </div>
            );
          })}
          
          {isLoading && (
            <div className="flex items-start max-w-[85%] mr-auto animate-in fade-in duration-300">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#4B2C20] text-[#FAF7F2] mr-4 shrink-0 shadow-sm">
                <Bot className="w-5 h-5" />
              </div>
              <div className="px-5 py-4 rounded-2xl rounded-tl-none bg-[#F5F5F5] border border-[#E8DFD8] text-[#4B2C20] shadow-sm flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-[#D4A373] animate-spin" />
                <span className="text-sm font-medium text-[#4B2C20]/70">Ellianos AI is typing...</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-red-800 text-sm shadow-sm animate-in fade-in duration-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              {session.messages.length <= 1 && (
                <button
                  onClick={() => initChat()}
                  className="flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              )}
            </div>
          )}
          
          {isSubmitting && (
            <div className="flex items-center justify-center p-8 animate-in fade-in duration-300">
               <div className="bg-white border border-[#E8DFD8] p-6 rounded-2xl shadow-sm text-center flex flex-col items-center max-w-sm">
                 <Loader2 className="w-8 h-8 text-[#D4A373] animate-spin mb-4" />
                 <h3 className="font-serif text-lg font-medium text-[#4B2C20]">Evaluating Application...</h3>
                 <p className="text-xs text-[#4B2C20]/60 mt-2">Please wait while the AI generates your score and submits your file to HR.</p>
               </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-[#E8DFD8] p-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          {showLowConfidenceWarning && (
            <div className="mb-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start gap-2.5 mb-3">
                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed text-amber-900 font-light">
                  We'd love to hear this in your own words! Your answer looks like it may have been pasted or written elsewhere. Interviews work best when you just tell us what you think &mdash; there are no wrong answers.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleRewrite}
                  className="px-3.5 py-1.5 bg-white border border-amber-300 text-amber-900 font-medium rounded-xl hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  Let me rewrite it
                </button>
                <button
                  type="button"
                  onClick={handleSendAsIs}
                  className="px-3.5 py-1.5 bg-[#4B2C20] text-[#FAF7F2] font-medium rounded-xl hover:bg-[#3E2723] transition-colors cursor-pointer"
                >
                  Send as is
                </button>
              </div>
            </div>
          )}

          {showPasteWarning && (
            <div className="mb-2.5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Pasting is disabled — we'd love to hear your answers in your own words!</span>
            </div>
          )}
          <form 
            onSubmit={handleSend}
            className="flex items-end bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#D4A373] focus-within:border-transparent transition-all shadow-sm"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onPaste={handleBlockedPaste}
              onDrop={handleBlockedPaste}
              onKeyDown={handleKeyDown}
              placeholder="Enter your response here... (Press Enter to send, Shift+Enter for new line)"
              className="flex-1 max-h-32 p-4 bg-transparent border-none focus:ring-0 resize-none outline-none text-[#4B2C20] text-sm disabled:opacity-50"
              rows={Math.min(4, input.split('\n').length || 1)}
              disabled={isSubmitting || isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading || isSubmitting}
              className="p-4 text-[#4B2C20] hover:bg-[#F5EFE6] disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

