import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, ArrowLeft, ArrowRight, Loader2, Sparkles, CheckCircle2, Send, MessageCircle, RefreshCcw, Undo2, Bot, Smile, Mic, MicOff, Heart, ExternalLink, LogIn, UserPlus, Check, Fingerprint, ArrowDown, ThumbsUp, ThumbsDown, Sun, Moon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Answers, ScoringResult, RegistrationData, ChatMessageData, Question } from './types';
import { QUESTIONS, PERSONALITY_TYPES, INTERESTS_LIST, BUBBLE_COLORS } from './constants';
import { getDetailedAnalysis, createPsychologistChat } from './services/geminiService';
import { saveResultToSpreadsheet, loginUser, registerUser, saveChatMessage, getChatHistory, normalizePhoneNumber, performHeartbeat, updateUserProfile, rateMessage } from './services/dataService';

interface ChatMessage extends ChatMessageData {
  links?: { title: string; uri: string }[];
}

type ViewState = 'welcome' | 'auth_choice' | 'login' | 'register' | 'interests' | 'tutorial' | 'quiz' | 'result';
type Theme = 'light' | 'dark';

const STORAGE_KEY_RESULT = 'personality_quiz_result_v16';
const STORAGE_KEY_USER = 'personality_quiz_user_v16';
const STORAGE_KEY_THEME = 'personality_quiz_theme_v1';

// --- Shatter Effect Components ---

interface ShardProps {
  tx: string;
  ty: string;
  rot: string;
  clipPath: string;
  children: React.ReactNode;
}

const Shard: React.FC<ShardProps> = ({ tx, ty, rot, clipPath, children }) => {
  return (
    <div 
      style={{ 
        clipPath, 
        '--tx': tx, 
        '--ty': ty, 
        '--rot': rot,
        animation: 'shatter-shard 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
      } as React.CSSProperties} 
      className="absolute inset-0 overflow-hidden"
    >
      {/* Container for content that ignores the shard's transform to keep image steady before shatter */}
      <div className="absolute inset-0 w-full h-full bg-[var(--color-bg-body)]">
        {children}
      </div>
    </div>
  );
};

const ShatterOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const shards = useMemo(() => {
    const cols = 5;
    const rows = 8;
    const items = [];
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const top = (r / rows) * 100;
        const left = (c / cols) * 100;
        const w = 100 / cols;
        const h = 100 / rows;
        
        // Random explosion params
        // Center of screen is roughly 50, 50.
        // Vector from center.
        const cx = 50;
        const cy = 50;
        const mx = (left + w/2);
        const my = (top + h/2);
        const dx = (mx - cx);
        const dy = (my - cy);
        
        const dist = Math.sqrt(dx*dx + dy*dy);
        const power = 100 + Math.random() * 200;
        
        const tx = (dx / dist) * power + 'px';
        const ty = (dy / dist) * power + 'px';
        const rot = (Math.random() * 360 - 180) + 'deg';
        
        // Triangle 1: Top-Left
        items.push({
          clipPath: `polygon(${left}% ${top}%, ${left + w}% ${top}%, ${left}% ${top + h}%)`,
          tx, ty, rot
        });
        
        // Triangle 2: Bottom-Right
        items.push({
          clipPath: `polygon(${left + w}% ${top}%, ${left + w}% ${top + h}%, ${left}% ${top + h}%)`,
          tx, ty, rot
        });
      }
    }
    return items;
  }, []);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {shards.map((s, i) => (
        <Shard key={i} {...s}>
          {children}
        </Shard>
      ))}
    </div>
  );
};

// --- Reusable Quiz Content Component for Duplication ---

const QuizContent: React.FC<{
  question: Question;
  answers: Answers;
  progressPercent: number;
  isAnimating: boolean;
  isPulsing: boolean;
  isSending: boolean;
  currentStep: number;
  onOptionSelect: (val: number) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
}> = ({ question, answers, progressPercent, isAnimating, isPulsing, isSending, currentStep, onOptionSelect, onPrevStep, onNextStep }) => {
  const currentAnswer = answers[question.id];
  return (
    <div className="flex flex-col justify-between h-screen p-4 items-center font-['Inter',_sans-serif]">
      {/* Header: Progress */}
      <div className="w-full flex items-center mb-5 shrink-0">
         <div className="flex-1 h-[3px] bg-[var(--color-border)] rounded-[2px] overflow-hidden">
             <div className="bg-[var(--color-accent)] h-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
         </div>
         <span className="text-[12px] font-medium text-[var(--color-text-muted)] ml-2 font-['Inter']">{progressPercent}%</span>
      </div>

      {/* Content */}
      <div className={`flex-1 flex flex-col items-center justify-center w-full max-w-[320px] gap-8 ${isAnimating ? 'question-exit' : ''}`}>
          {/* Top Bubble */}
          <div className="bubble-question bubble-arrow-down">
             <p className="bubble-text">{question.optionA}</p>
          </div>

          {/* Scale */}
          <div className="flex items-center gap-[14px]">
             {[1, 2, 3, 4, 5].map((v, i) => {
               const sizes = ['w-[56px] h-[56px]', 'w-[32px] h-[32px]', 'w-[20px] h-[20px]', 'w-[32px] h-[32px]', 'w-[56px] h-[56px]'];
               const isSelected = currentAnswer === v;
               const isFaded = currentAnswer !== undefined && !isSelected;
               const pulsingClass = (isSelected && isPulsing) ? 'pulsing' : '';
               
               return (
                 <button 
                   key={v} 
                   onClick={() => onOptionSelect(v)}
                   disabled={isAnimating || isPulsing}
                   className={`scale-circle ${sizes[i]} ${isSelected ? 'selected' : ''} ${isFaded ? 'faded' : ''} ${pulsingClass}`}
                 />
               );
             })}
          </div>

          {/* Bottom Bubble */}
          <div className="bubble-question bubble-arrow-up">
             <p className="bubble-text">{question.optionB}</p>
          </div>
      </div>

      {/* Navigation Arrows */}
      <div className="flex justify-between items-center w-full max-w-[300px] mb-[16px]">
        <button 
          onClick={onPrevStep}
          disabled={currentStep === 0 || isAnimating || isPulsing}
          className="w-[44px] h-[44px] rounded-full bg-[var(--color-input-bg)] text-[var(--color-accent)] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft size={24} strokeWidth={2.5} />
        </button>

        <button 
          onClick={onNextStep}
          disabled={currentAnswer === undefined || isSending || isAnimating || isPulsing}
          className="w-[44px] h-[44px] rounded-full bg-[var(--color-input-bg)] text-[var(--color-accent)] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSending ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={24} strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
};


const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [view, setView] = useState<ViewState>('welcome');
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [registration, setRegistration] = useState<RegistrationData>({ firstName: '', lastName: '', phone: '', age: '', password: '', interests: [] });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [detailedAnalysis, setDetailedAnalysis] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [authError, setAuthError] = useState('');
  const [resetTimer, setResetTimer] = useState(30);
  const [isFormFocused, setIsFormFocused] = useState(false);
  const [isShattering, setIsShattering] = useState(false);
  
  // State for interests
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const [shuffledBaseInterests] = useState(() => [...INTERESTS_LIST].sort(() => Math.random() - 0.5));
  
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  
  const [floatingDate, setFloatingDate] = useState<string | null>(null);
  const floatingDateTimeout = useRef<number | null>(null);

  const [showScrollDownButton, setShowScrollDownButton] = useState(false);
  const lastScrollTopRef = useRef<number>(0);

  const chatInstance = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) as Theme | null;
    if (savedTheme) {
        setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    performHeartbeat();
    const savedResult = localStorage.getItem(STORAGE_KEY_RESULT);
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);
    if (savedResult && savedUser) {
      try {
        const res = JSON.parse(savedResult);
        if (res) {
          setResult(res);
          const userData = JSON.parse(savedUser);
          setRegistration(userData);
          if (userData.phone) {
            localStorage.setItem('user_phone', normalizePhoneNumber(userData.phone));
          }
          fetchAnalysis(res.type, userData);
          setView('result');
        }
      } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    let interval: number;
    if (view === 'result' && resetTimer > 0) {
      interval = window.setInterval(() => {
        setResetTimer(t => t - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [view, resetTimer]);

  const fetchAnalysis = async (type: string, user: RegistrationData) => {
    const analysis = await getDetailedAnalysis(
      type, 
      PERSONALITY_TYPES[type].name, 
      user.firstName, 
      user.age
    );
    setDetailedAnalysis(analysis);
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isSending]);

  const playSoftClick = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.12);
    } catch (e) { console.warn("Audio failed", e); }
  }, []);

  const isRegistrationValid = 
    registration.firstName.trim().length >= 2 && 
    registration.lastName.trim().length >= 2 && 
    registration.age.trim().length > 0 &&
    parseInt(registration.age) > 0 &&
    parseInt(registration.age) <= 100 &&
    registration.phone.replace(/\D/g, '').length === 11 &&
    (registration.password?.length || 0) >= 6 &&
    registration.password === confirmPassword;

  const calculateResults = useCallback((currentAnswers: Answers) => {
    const getVal = (id: number) => currentAnswers[id] ?? 3;
    const ieValue = 30 - getVal(3) - getVal(7) - getVal(11) + getVal(15) - getVal(19) + getVal(23) + getVal(27) - getVal(31);
    const snValue = 12 + getVal(4) + getVal(8) + getVal(12) + getVal(16) + getVal(20) - getVal(24) - getVal(28) + getVal(32);
    const ftValue = 30 - getVal(2) + getVal(6) + getVal(10) - getVal(14) - getVal(18) + getVal(22) - getVal(26) - getVal(30);
    const jpValue = 18 + getVal(1) + getVal(5) - getVal(9) + getVal(13) - getVal(17) + getVal(21) - getVal(25) + getVal(29);
    const ei = ieValue > 24 ? 'E' : 'I';
    const sn = snValue > 24 ? 'N' : 'S';
    const ft = ftValue > 24 ? 'T' : 'F';
    const jp = jpValue > 24 ? 'P' : 'J';
    return { EI: ieValue, SN: snValue, FT: ftValue, JP: jpValue, type: `${ei}${sn}${ft}${jp}` };
  }, []);

  const handleRegistrationContinue = async () => {
    setIsSending(true);
    setAuthError('');
    const success = await registerUser(registration);
    setIsSending(false);
    
    if (success) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(registration));
      localStorage.setItem('user_phone', normalizePhoneNumber(registration.phone));
      setView('interests');
    } else {
      setAuthError('Ошибка при создании профиля.');
    }
  };

  const finishQuiz = useCallback(async (finalAnswers: Answers) => {
    setIsSending(true);
    setAuthError('');
    const finalResult = calculateResults(finalAnswers);
    
    // Calculate and save locally immediately
    setResult(finalResult);
    localStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(finalResult));
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(registration));
    localStorage.setItem('user_phone', normalizePhoneNumber(registration.phone));
    
    // Async save to cloud
    const saved = await saveResultToSpreadsheet(finalResult, registration);
    
    // Start generating analysis in background
    fetchAnalysis(finalResult.type, registration);
    
    setIsSending(false);
    setResetTimer(30);
    
    if (!saved) {
      setAuthError('Ошибка сохранения результатов.');
    }
    
    return true;
  }, [calculateResults, registration]);

  const handleOptionSelect = (val: number) => {
    if (isAnimating || isPulsing || isShattering) return;
    playSoftClick();
    const updatedAnswers = { ...answers, [QUESTIONS[currentStep].id]: val };
    setAnswers(updatedAnswers);
    
    // Pulse animation logic
    setIsPulsing(true);
    setTimeout(async () => {
        // If last question
        if (currentStep >= QUESTIONS.length - 1) {
            // Show 100% state
            setCurrentStep(QUESTIONS.length);
            setIsPulsing(false);
            
            // Wait to show 100% briefly
            setTimeout(async () => {
                setIsShattering(true);
                
                // Process results while shattering
                await finishQuiz(updatedAnswers);
                
                // Wait for shatter animation to finish (0.8s in CSS)
                setTimeout(() => {
                    setIsShattering(false);
                    setView('result');
                }, 1200);
            }, 600);
            
        } else {
            // Normal transition
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep(s => s + 1);
                setIsAnimating(false);
                setIsPulsing(false);
            }, 300);
        }
    }, 400); 
  };

  const handleNextStep = useCallback(() => {
    if (isAnimating || isSending || isShattering) return;
    const currentAnswer = answers[QUESTIONS[currentStep].id];
    if (currentAnswer === undefined) return;

    if (currentStep < QUESTIONS.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep(s => s + 1);
        setIsAnimating(false);
        setIsPulsing(false);
      }, 300);
    } else {
      handleOptionSelect(currentAnswer); // Reuse logic for consistency if manually clicking arrow on last step
    }
  }, [answers, currentStep, isAnimating, isSending, isShattering]);

  const handlePrevStep = () => {
    if (isAnimating || currentStep === 0 || isShattering) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep(s => s - 1);
      setIsAnimating(false);
      setIsPulsing(false);
    }, 300);
  };

  const handleLogin = async () => {
    if (!loginPhone || !loginPass) { setAuthError('Введите телефон и пароль'); return; }
    setIsSending(true);
    setAuthError('');
    try {
      const data = await loginUser(loginPhone, loginPass);
      if (data && !data.error) {
        setRegistration(data.user);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
        localStorage.setItem('user_phone', normalizePhoneNumber(data.user.phone));
        
        const isRetake = localStorage.getItem('personality_quiz_retake') === 'true';
        localStorage.removeItem('personality_quiz_retake');

        if (data.result && !isRetake) {
          setResult(data.result);
          localStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(data.result));
          fetchAnalysis(data.result.type, data.user);
          setView('result');
        } else {
            if (isRetake) {
                setView('welcome');
            } else {
                setView('interests');
            }
        }

      } else if (data?.error) {
        setAuthError(data.error);
      } else { 
        setAuthError('Ошибка сервера.'); 
      }
    } catch (e) {
      setAuthError('Ошибка сети.');
    } finally {
      setIsSending(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const digits = raw.replace(/\D/g, '');
      
      if (!digits) {
          setRegistration(prev => ({ ...prev, phone: '' }));
          return;
      }
      
      let clean = digits;
      if (clean[0] === '7') clean = '8' + clean.substring(1);
      if (clean[0] !== '8') clean = '8' + clean;
      
      if (clean.length > 11) clean = clean.substring(0, 11);

      let res = clean[0];
      if (clean.length > 1) res += ' ' + clean.substring(1, 4);
      if (clean.length > 4) res += ' ' + clean.substring(4, 7);
      if (clean.length > 7) res += ' ' + clean.substring(7, 9);
      if (clean.length > 9) res += ' ' + clean.substring(9, 11);

      setRegistration(prev => ({ ...prev, phone: res }));
  };

  const resetAll = () => {
    if (resetTimer > 0) return;
    localStorage.clear();
    // Keep the theme setting
    localStorage.setItem(STORAGE_KEY_THEME, theme);
    // Set retake flag
    localStorage.setItem('personality_quiz_retake', 'true');
    
    setView('auth_choice');
    setCurrentStep(0);
    setAnswers({});
    setRegistration({ firstName: '', lastName: '', phone: '', age: '', password: '', interests: [] });
    setConfirmPassword('');
    setResult(null);
    setDetailedAnalysis(null);
    setShowChat(false);
    setChatMessages([]);
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    let finalTranscript = '';
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      finalTranscript = event.results[0][0].transcript;
    };
    recognition.onend = () => {
      setIsListening(false);
      if (finalTranscript.trim()) {
        handleSendMessage(finalTranscript.trim());
      }
    };
    recognition.start();
  };

  const handleInterestInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && interestInput.trim()) {
        e.preventDefault();
        const newInterest = interestInput.trim();
        const cleanNewInterest = newInterest.split('/')[0].trim();
        
        // Add to custom list if not exists
        if (!customInterests.includes(newInterest) && !INTERESTS_LIST.includes(newInterest)) {
            setCustomInterests(prev => [...prev, newInterest]);
        }

        // Select it
        setRegistration(p => {
            const current = p.interests || [];
            if (!current.includes(cleanNewInterest)) {
                const updated = { ...p, interests: [...current, cleanNewInterest] };
                localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updated));
                updateUserProfile(updated); // Sync to DB
                return updated;
            }
            return p;
        });
        
        setInterestInput('');
    }
  };

  useEffect(() => {
    const initChat = async () => {
      const storedPhone = localStorage.getItem('user_phone');
      if (showChat && !chatInstance.current && result && storedPhone) {
        setIsSending(true);
        try {
          const history = await getChatHistory(storedPhone);
          setChatMessages(history);
          chatInstance.current = createPsychologistChat(
            result.type, 
            PERSONALITY_TYPES[result.type].name, 
            registration.firstName, 
            registration.age, 
            registration.interests, 
            history
          );
        } catch (e) {
          console.error("Chat initialization failed", e);
        } finally {
          setIsSending(false);
        }
      }
    };
    initChat();
  }, [showChat, result, registration]);

  const handleSendMessage = async (textOverride?: string) => {
    const storedPhone = localStorage.getItem('user_phone');
    if (!storedPhone) return;
    
    const text = (textOverride || userInput).trim();
    if (!text || isSending) return;
    if (!textOverride) setUserInput('');
    
    const nowObj = new Date();
    const nowTime = nowObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nowIso = nowObj.toISOString();
    
    setChatMessages(prev => [...prev, { role: 'user', text, timestamp: nowTime, createdAt: nowIso }]);
    setIsSending(true);
    try {
      if (!chatInstance.current && result) {
        const history = await getChatHistory(storedPhone);
        setChatMessages(history);
        chatInstance.current = createPsychologistChat(result.type, PERSONALITY_TYPES[result.type].name, registration.firstName, registration.age, registration.interests, history);
      }
      
      const stream = await chatInstance.current.sendMessageStream({ message: text });
      let fullText = "";
      let responseTime = "";
      
      for await (const chunk of stream) {
        fullText += (chunk as any).text;
        // Очищаем текст от возможных тегов модели во время стриминга для UI
        const displaySafeText = fullText.replace(/\[TAG:(like|dislike|neutral)\]/g, '');

        setChatMessages(prev => {
          const last = prev[prev.length - 1];
          if (!responseTime) {
            responseTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          if (last && last.role === 'model') {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'model', text: displaySafeText, timestamp: last.timestamp || responseTime, createdAt: last.createdAt || nowIso };
            return updated;
          } else {
            return [...prev, { role: 'model', text: displaySafeText, timestamp: responseTime, createdAt: nowIso }];
          }
        });
      }
      
      // Окончательная очистка полного текста перед сохранением и финальным обновлением стейта
      const cleanFullText = fullText.replace(/\[TAG:(like|dislike|neutral)\]/g, '').trim();

      // Обновляем состояние чата чистым текстом (на случай, если тег был в самом конце и не успел отрендериться)
      setChatMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
              updated[lastIdx] = { ...updated[lastIdx], text: cleanFullText };
          }
          return updated;
      });
      
      await saveChatMessage(storedPhone, 'user', text);
      // Сохраняем ТОЛЬКО чистый текст. saveChatMessage сама добавит нужный тег.
      await saveChatMessage(storedPhone, 'model', cleanFullText);
    } catch (error: any) {
      console.error("Chat error:", error);
      let errorMsg = "Прости, что-то технически не сработало с моей стороны. Попробуй ещё раз немного позже. Я здесь для тебя! 💚";
      
      const errString = (error?.message || error?.toString() || '').toLowerCase();
      
      if (errString.includes('429') || errString.includes('quota') || errString.includes('exhausted')) {
        errorMsg = "Мне очень жаль! Мой лимит запросов на сегодня исчерпан. Приходи завтра — я буду ждать тебя! 💫";
      } else if (errString.includes('limit') || errString.includes('usage')) {
        errorMsg = "Похоже, я достигла своего дневного лимита помощи. Это не навсегда — давай поговорим завтра! 🌟";
      }
      
      setChatMessages(prev => [...prev, { role: 'model', text: errorMsg, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), createdAt: nowIso }]);
    } finally { setIsSending(false); }
  };

  const handleRateMessage = async (index: number, newRating: 'like' | 'dislike') => {
    const storedPhone = localStorage.getItem('user_phone');
    if (!storedPhone) return;

    // Update local state
    setChatMessages(prev => {
        const updated = [...prev];
        const msg = updated[index];
        // Toggle if same rating clicked, otherwise set new
        const finalRating = msg.rating === newRating ? undefined : newRating;
        updated[index] = { ...msg, rating: finalRating };
        
        // Sync with DB
        // We pass 'null' if rating is removed (finalRating is undefined)
        rateMessage(storedPhone, msg, finalRating || null);
        
        return updated;
    });
  };

  const handleChatScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

    // --- Floating Date Logic ---
    if (floatingDateTimeout.current) {
        clearTimeout(floatingDateTimeout.current);
    }

    const container = e.currentTarget;
    const children = Array.from(container.children) as HTMLElement[];
    // Смещение сверху, чтобы определить, какое сообщение является "текущим верхним". 
    // Заголовок занимает ~48px, возьмем запас.
    const topOffset = container.scrollTop + 60; 

    let foundDateLabel: string | null = null;
    const todayStr = new Date().toDateString();

    for (const child of children) {
        if (child.dataset.createdAt) {
            // Если нижняя граница элемента ниже линии видимости, значит это сообщение сейчас сверху
            if ((child.offsetTop + child.offsetHeight) > topOffset) {
                const d = new Date(child.dataset.createdAt);
                if (d.toDateString() !== todayStr) {
                    foundDateLabel = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
                }
                break;
            }
        }
    }

    setFloatingDate(foundDateLabel);
    floatingDateTimeout.current = window.setTimeout(() => {
        setFloatingDate(null);
    }, 1000);

    // --- Scroll Down Button Logic ---
    // Определяем, находится ли пользователь внизу (с допуском 100px)
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    const isScrollingDown = scrollTop > lastScrollTopRef.current;

    if (isAtBottom) {
        setShowScrollDownButton(false);
    } else if (isScrollingDown) {
        // Показываем кнопку, если скроллим вниз и мы НЕ в самом низу
        setShowScrollDownButton(true);
    }

    lastScrollTopRef.current = scrollTop;
  };

  if (view === 'welcome') {
    return (
      <div className="flex-1 flex flex-col bg-gradient-to-b from-[var(--color-bg-welcome-start)] to-[var(--color-bg-welcome-end)] px-8 py-16 items-center justify-center h-screen overflow-hidden font-['Inter',_sans-serif] relative">
        {/* Theme Toggle Button */}
        <button 
          onClick={toggleTheme}
          className="absolute top-6 right-6 w-10 h-10 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-main)] shadow-sm hover:scale-105 transition-all z-50 active:scale-95"
          aria-label="Toggle Theme"
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>

        <div className="max-w-[440px] w-full flex flex-col items-center gap-6">
          <div className="text-[var(--color-accent)] opacity-80 text-[48px] font-light leading-none">ψ</div>
          <h1 className="text-[var(--color-accent)] text-[18px] font-semibold text-center uppercase tracking-wider leading-none">Узнай свой психотип</h1>
          <p className="text-[var(--color-text-secondary)] text-[15px] leading-[1.7] text-center font-normal">
            Каждый человек уникален в своем способе восприятия мира и принятия решений. Этот тест основан на теории психологических типов Карла Юнга и поможет тебе раскрыть свой психологический профиль — твои природные склонности, способ мышления и то, как ты взаимодействуешь с окружающим миром.
          </p>
          <button 
            onClick={() => registration.phone ? setView('interests') : setView('auth_choice')} 
            className="w-full max-w-[400px] h-[48px] bg-[var(--color-accent)] text-white rounded-[12px] text-[16px] font-semibold active:scale-95 transition-transform shadow-sm mt-2 flex items-center justify-center border-none"
          >
            Начать
          </button>
        </div>

        {/* Developer Footer */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="px-5 py-2 bg-[var(--color-bg-card)]/60 backdrop-blur-sm rounded-full border border-[var(--color-border)] shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:bg-[var(--color-bg-card)]/80 transition-all duration-300">
                <span className="text-[10px] font-semibold text-[var(--color-text-muted)] tracking-[0.08em] uppercase whitespace-nowrap">
                    Разработчик Виктор Грудинин © 2025
                </span>
            </div>
        </div>
      </div>
    );
  }

  if (view === 'auth_choice') {
    return (
      <div className="flex-1 flex flex-col bg-gradient-to-b from-[var(--color-bg-welcome-start)] to-[var(--color-bg-welcome-end)] h-full items-center justify-center p-8 pt-12 pb-8 font-['Inter',_sans-serif]">
        <div className="w-full flex flex-col items-center">
          <button 
            onClick={() => setView('login')} 
            className="w-full max-w-[320px] h-[48px] bg-[var(--color-accent)] text-white rounded-[12px] text-[16px] font-bold flex items-center justify-center shadow-sm active:scale-95 transition-transform mb-4"
          >
            Войти
          </button>
          <button 
            onClick={() => setView('register')} 
            className="w-full max-w-[320px] h-[48px] bg-transparent border-2 border-[var(--color-accent)] text-[var(--color-accent)] rounded-[12px] text-[16px] font-bold flex items-center justify-center active:scale-95 transition-transform"
          >
            Регистрация
          </button>
          <button 
            onClick={() => setView('welcome')} 
            className="text-[var(--color-text-muted)] text-[12px] font-medium mt-6 hover:opacity-80 transition-opacity"
          >
            Назад
          </button>
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] h-full items-center justify-center p-6">
        <div className="max-w-[340px] w-full flex flex-col px-0 py-10">
          <h2 className="text-[28px] font-bold text-[var(--color-text-main)] text-center mb-8">Вход</h2>
          <div className="flex flex-col gap-4">
            <input 
                type="tel" 
                placeholder="Телефон" 
                value={loginPhone} 
                onChange={e => setLoginPhone(e.target.value)} 
                className="w-full bg-[var(--color-input-bg)] text-[var(--color-text-main)] rounded-[10px] px-4 py-[14px] text-[14px] outline-none border border-transparent focus:border-[var(--color-accent)] placeholder-[var(--color-text-muted)] transition-all focus:shadow-sm" 
            />
            <input 
                type="password" 
                placeholder="Пароль" 
                value={loginPass} 
                onChange={e => setLoginPass(e.target.value)} 
                className="w-full bg-[var(--color-input-bg)] text-[var(--color-text-main)] rounded-[10px] px-4 py-[14px] text-[14px] outline-none border border-transparent focus:border-[var(--color-accent)] placeholder-[var(--color-text-muted)] transition-all focus:shadow-sm" 
            />
          </div>
          
          {authError && <p className="text-red-500 text-xs text-center mt-4">{authError}</p>}
          
          <button 
            onClick={handleLogin} 
            disabled={isSending} 
            className="w-full mt-6 py-[14px] bg-[var(--color-accent)] text-white rounded-[10px] text-[16px] font-semibold hover:bg-[var(--color-accent-hover)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isSending ? <Loader2 className="animate-spin mx-auto" size={20}/> : 'Войти'}
          </button>
          
          <button 
            onClick={() => setView('auth_choice')} 
            className="w-full text-center text-[var(--color-text-muted)] text-[14px] mt-4 hover:opacity-80 transition-opacity"
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  if (view === 'register') {
    const isPasswordShort = registration.password && registration.password.length > 0 && registration.password.length < 6;
    const isPasswordMismatch = confirmPassword && confirmPassword.length > 0 && registration.password !== confirmPassword;
    const isAgeInvalid = registration.age.length > 0 && (parseInt(registration.age) > 100 || parseInt(registration.age) <= 0);
    const isPhoneInvalid = registration.phone.length > 0 && registration.phone.replace(/\D/g, '').length !== 11;

    // Use padding adjustment on focus to compensate for border width change (1px to 2px)
    const inputClass = "w-full bg-[var(--color-input-bg)] text-[var(--color-text-main)] border border-[var(--color-border)] rounded-[10px] px-3 py-[10px] text-[13px] outline-none transition-all placeholder-[var(--color-text-muted)] focus:bg-[var(--color-bg-card)] focus:border-[var(--color-accent)] focus:border-2 focus:shadow-[0_0_0_3px_rgba(29,184,153,0.15)] focus:py-[9px] focus:px-[11px]";

    const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFormFocused(true);
        setTimeout(() => {
            e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    };

    const handleInputBlur = () => {
        setIsFormFocused(false);
    };

    return (
      <div 
        className="flex-1 flex flex-col bg-[var(--color-bg-card)] h-[100dvh] items-center relative overflow-y-auto transition-all duration-200"
        style={{ paddingBottom: isFormFocused ? '40vh' : '0px' }}
      >
        <div className="absolute top-4 left-4 z-20">
            <button onClick={() => setView('auth_choice')} className="p-2 -ml-2 text-[var(--color-text-main)] active:opacity-60"><ArrowLeft size={24} /></button>
        </div>
        
        <div className="max-w-[340px] w-full px-3 py-10 flex flex-col my-auto">
            <h2 className="text-[24px] font-bold text-[var(--color-text-main)] text-center mb-6 mt-4">Регистрация</h2>
            
            <div className="flex flex-col gap-2">
                <div className="group">
                  <label className="text-[10px] font-bold text-[var(--color-text-muted)] ml-1 mb-0.5 block transition-colors group-focus-within:text-[var(--color-accent)] uppercase tracking-widest">Имя</label>
                  <input 
                      ref={firstNameRef}
                      type="text" 
                      placeholder="Иван" 
                      value={registration.firstName} 
                      onChange={e => setRegistration(prev => ({ ...prev, firstName: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && lastNameRef.current?.focus()}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      className={inputClass}
                  />
                </div>
                
                <div className="group">
                  <label className="text-[10px] font-bold text-[var(--color-text-muted)] ml-1 mb-0.5 block transition-colors group-focus-within:text-[var(--color-accent)] uppercase tracking-widest">Фамилия</label>
                  <input 
                      ref={lastNameRef}
                      type="text" 
                      placeholder="Иванов" 
                      value={registration.lastName} 
                      onChange={e => setRegistration(prev => ({ ...prev, lastName: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && ageRef.current?.focus()}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      className={inputClass}
                  />
                </div>

                <div className="group">
                  <label className="text-[10px] font-bold text-[var(--color-text-muted)] ml-1 mb-0.5 block transition-colors group-focus-within:text-[var(--color-accent)] uppercase tracking-widest">Возраст</label>
                  <input 
                      ref={ageRef}
                      type="number" 
                      placeholder="25" 
                      value={registration.age} 
                      onChange={e => setRegistration(prev => ({ ...prev, age: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && phoneRef.current?.focus()}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      className={inputClass}
                  />
                  {isAgeInvalid && <p className="text-[#E74C3C] text-[11px] mt-1 ml-1 font-medium">Укажите корректный возраст (до 100 лет)</p>}
                </div>

                <div className="group">
                  <label className="text-[10px] font-bold text-[var(--color-text-muted)] ml-1 mb-0.5 block transition-colors group-focus-within:text-[var(--color-accent)] uppercase tracking-widest">Телефон</label>
                  <input 
                      ref={phoneRef}
                      type="tel" 
                      placeholder="8 9XX XXX XX XX" 
                      value={registration.phone} 
                      onChange={handlePhoneChange}
                      onKeyDown={(e) => e.key === 'Enter' && passwordRef.current?.focus()}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      className={inputClass}
                  />
                  {isPhoneInvalid && <p className="text-[#E74C3C] text-[11px] mt-1 ml-1 font-medium">Введите полный номер телефона</p>}
                </div>

                <div className="group">
                  <label className="text-[10px] font-bold text-[var(--color-text-muted)] ml-1 mb-0.5 block transition-colors group-focus-within:text-[var(--color-accent)] uppercase tracking-widest">Пароль</label>
                  <input 
                      ref={passwordRef}
                      type="password" 
                      placeholder="Не менее 6 символов" 
                      value={registration.password || ''} 
                      onChange={e => setRegistration(prev => ({ ...prev, password: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && confirmRef.current?.focus()}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      className={inputClass}
                  />
                  {isPasswordShort && <p className="text-[#E74C3C] text-[11px] mt-1 ml-1 font-medium">Минимум 6 символов</p>}
                </div>

                <div className="group">
                  <label className="text-[10px] font-bold text-[var(--color-text-muted)] ml-1 mb-0.5 block transition-colors group-focus-within:text-[var(--color-accent)] uppercase tracking-widest">Повторить пароль</label>
                  <input 
                      ref={confirmRef}
                      type="password" 
                      placeholder="Пароли должны совпадать" 
                      value={confirmPassword} 
                      onChange={e => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRegistrationContinue()}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      className={inputClass}
                  />
                  {isPasswordMismatch && <p className="text-[#E74C3C] text-[11px] mt-1 ml-1 font-medium">Пароли не совпадают</p>}
                </div>
            </div>

            {authError && <p className="text-red-500 text-[10px] text-center font-bold px-4 mt-2 leading-tight">{authError}</p>}

            <button 
                onClick={handleRegistrationContinue} 
                disabled={!isRegistrationValid || isSending} 
                className="w-full mt-4 py-[11px] bg-[var(--color-accent)] text-white rounded-[10px] text-[14px] font-semibold hover:bg-[var(--color-accent-hover)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
                {isSending ? <Loader2 className="animate-spin mx-auto" size={18}/> : 'Зарегистрироваться'}
            </button>
        </div>
      </div>
    );
  }

  if (view === 'interests') {
    const allInterests = [...shuffledBaseInterests, ...customInterests];
    
    return (
      <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] h-full overflow-hidden p-3">
        <h2 className="text-[20px] font-semibold text-center mb-4 font-['Inter'] mt-2 text-[var(--color-text-main)]">Ваши интересы</h2>
        
        <div 
            className="flex-1 overflow-y-auto pb-4 content-start px-2 flex flex-wrap justify-center gap-3"
        >
            {allInterests.map((it, idx) => {
              const cleanLabel = it.split('/')[0].trim();
              const isSel = registration.interests?.includes(cleanLabel);
              
              return (
                <button 
                  key={`${it}-${idx}`} 
                  onClick={() => {
                    const current = registration.interests || [];
                    const newInterests = isSel ? current.filter(x => x !== cleanLabel) : [...current, cleanLabel];
                    setRegistration(p => {
                      const updated = {...p, interests: newInterests};
                      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updated));
                      updateUserProfile(updated); // Sync to DB
                      return updated;
                    });
                  }} 
                  style={{
                      animation: isSel ? 'none' : 'vibrate 1.5s ease-in-out infinite',
                      transform: isSel ? 'scale(1.08)' : 'none'
                  }}
                  className={`px-4 py-2 rounded-full text-[14px] font-medium transition-all duration-200 border flex items-center justify-center text-center whitespace-nowrap shadow-sm ${
                    isSel 
                      ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' 
                      : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-muted)]'
                  }`}
                >
                  {cleanLabel}
                </button>
              );
            })}
        </div>
        
        <div className="shrink-0 pt-2">
            <input 
                type="text" 
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={handleInterestInputKeyDown}
                placeholder="Добавить интерес..." 
                className="w-full bg-[var(--color-input-bg)] text-[var(--color-text-main)] rounded-[10px] px-[12px] py-[10px] text-[13px] outline-none border-none placeholder-[var(--color-text-muted)] font-['Inter']"
            />
            
            <button 
              onClick={async () => {
                let currentInterests = [...(registration.interests || [])];
                
                // Если в поле ввода что-то есть, добавляем это в интересы перед переходом
                if (interestInput.trim()) {
                    const newInterest = interestInput.trim();
                    const cleanNewInterest = newInterest.split('/')[0].trim();
                    if (!currentInterests.includes(cleanNewInterest)) {
                        currentInterests.push(cleanNewInterest);
                    }
                    // Добавляем в список кастомных для отображения (если вернется назад)
                    if (!customInterests.includes(newInterest) && !INTERESTS_LIST.includes(newInterest)) {
                        setCustomInterests(prev => [...prev, newInterest]);
                    }
                    setInterestInput('');
                }

                const updatedUser = { ...registration, interests: currentInterests };
                setRegistration(updatedUser);
                localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser));
                
                // Принудительно сохраняем в БД перед переходом
                await updateUserProfile(updatedUser);
                
                setView('tutorial');
              }} 
              className="w-full mt-3 py-[12px] bg-[var(--color-accent)] text-white rounded-[12px] font-semibold shadow-sm active:scale-95 text-[14px] font-['Inter']"
            >
              Перейти к тесту
            </button>
        </div>
      </div>
    );
  }

  if (view === 'tutorial') {
    return (
      <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] h-full items-center justify-center font-['Inter']">
        <div className="w-full max-w-[360px] px-[16px] py-[32px] flex flex-col items-center">
            <h2 className="text-[22px] font-[600] text-[var(--color-text-main)] mb-[20px] text-center">Как проходить тест?</h2>
            <p className="text-[14px] leading-[1.6] text-[var(--color-text-secondary)] mb-[28px] text-center">
              Выбирай вариант на шкале. Чем больше кружок — тем больше согласие с утверждением. Слева — верхнее утверждение, справа — нижнее, в центре — нейтральность. Отвечай честно.
            </p>
            <button 
              onClick={() => setView('quiz')} 
              className="w-full max-w-[320px] py-[14px] px-[20px] bg-[var(--color-accent)] text-white rounded-[12px] text-[16px] font-[600] mt-[28px] shadow-sm active:scale-95 transition-transform"
            >
              Начать
            </button>
        </div>
      </div>
    );
  }
  
  // --- RESULT VIEW ---
  const renderResultView = () => {
    if (!result) return null;
    const personality = PERSONALITY_TYPES[result.type];
    return (
      <div className="flex-1 flex flex-col bg-[var(--color-bg-card)] h-full overflow-hidden relative">
        <div className="flex-1 flex flex-col px-6 overflow-hidden">
          <div className="flex justify-center mt-6 mb-4 shrink-0">
            <div className="w-16 h-16 rounded-full border-2 border-[var(--color-result-check-border)] flex items-center justify-center bg-[var(--color-accent-light)] shadow-sm">
              <Check className="text-[var(--color-accent)]" size={32} strokeWidth={3} />
            </div>
          </div>
          
          <h2 className="result-title text-center mb-3 shrink-0">Ваш результат</h2>
          
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-[20px] p-4 text-center mb-4 shadow-sm shrink-0">
            <div className="text-[42px] font-black leading-tight text-[var(--color-accent)] mb-1">{result.type}</div>
            <div className="text-lg font-bold text-[var(--color-text-main)] mb-2">{personality?.name}</div>
            <p className="text-[var(--color-text-secondary)] px-2 leading-relaxed text-base font-medium">{personality?.description}</p>
          </div>
          
          <div className="bg-[var(--color-bg-card)] rounded-[20px] p-6 mb-40 flex flex-col items-center shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-[var(--color-border)] overflow-hidden">
            <div className="flex flex-col items-center w-full">
              <div className="flex items-center justify-center gap-2 shrink-0 mb-3">
                <Fingerprint size={20} className="text-[var(--color-accent)]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-main)]">РАЗВЕРНУТЫЙ АНАЛИЗ</span>
              </div>
              <div className="w-full">
                {detailedAnalysis ? (
                  <p className="text-[var(--color-text-main)] leading-[1.6] text-lg font-normal text-center whitespace-pre-line">
                    {detailedAnalysis}
                  </p>
                ) : (
                  <div className="flex items-center justify-center gap-3 text-[var(--color-text-muted)] italic text-sm py-4">
                    <Loader2 className="animate-spin" size={16} /> Формируем анализ...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-[var(--color-bg-card)] bg-opacity-90 backdrop-blur-md border-t border-[var(--color-border)] space-y-4">
            <button 
              onClick={() => {
                const storedPhone = localStorage.getItem('user_phone');
                if (storedPhone) setShowChat(true);
              }} 
              className="w-full py-5 bg-[var(--color-accent)] text-white rounded-full font-bold flex items-center justify-center gap-3 text-lg shadow-xl active:scale-95 transition-all"
            >
              <MessageCircle size={22} /> Чат с ИИ консультантом
            </button>
            <button 
              onClick={resetAll} 
              disabled={resetTimer > 0}
              className={`w-full py-4 border-2 rounded-full font-bold flex items-center justify-center gap-3 transition-all ${
                resetTimer > 0 
                ? 'border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-muted)] cursor-not-allowed' 
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-bg-card)] active:bg-[var(--color-input-bg)]'
              }`}
            >
              {resetTimer > 0 ? (
                <>
                  <RefreshCcw size={18} className="animate-spin" />
                  <span>Начать заново ({resetTimer}с)</span>
                </>
              ) : (
                <>
                  <RefreshCcw size={18} />
                  <span>Начать заново</span>
                </>
              )}
            </button>
        </div>

        {showChat && (
          <div className="fixed inset-0 bg-[var(--color-bg-card)] z-50 flex flex-col">
             <div className="h-[44px] px-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-body)] shrink-0">
               <button onClick={()=>setShowChat(false)} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-main)] transition-colors flex items-center justify-center w-8 h-8 -ml-1.5 active:scale-95">
                 <ArrowLeft size={24}/>
               </button>
               <span className="text-[var(--color-accent)] text-[15px] font-semibold">ИИ Консультант</span>
               <div className="w-6"></div>
             </div>
             
             <div 
                className="flex-1 overflow-y-auto p-4 bg-[var(--color-bg-body)] relative"
                onScroll={handleChatScroll}
             >
                <div 
                    className={`fixed top-[56px] left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-opacity duration-300 ${floatingDate ? 'opacity-100' : 'opacity-0'}`}
                >
                    <span className="bg-black/30 backdrop-blur-sm text-white text-[12px] px-3 py-1 rounded-full shadow-sm">
                        {floatingDate}
                    </span>
                </div>

                {chatMessages.length === 0 && !isSending && (
                  <div className="text-center py-10 px-4 text-[var(--color-text-muted)] animate-in fade-in zoom-in duration-500">
                    <div className="bg-[var(--color-accent-light)] w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                      <Smile className="text-[var(--color-accent)]" size={40} />
                    </div>
                    <p className="text-[14px] leading-[1.6] text-[var(--color-text-secondary)] text-center m-[20px_16px]">
                      Привет! 👋 Готова помочь тебе разобраться в себе. Узнаешь о своих способностях, интересах и том, как развивать свой потенциал.
                    </p>
                  </div>
                )}
                {chatMessages.map((m, i) => {
                  return (
                    <div 
                        key={i} 
                        className={`flex flex-col ${m.role==='user'?'items-end':'items-start'} animate-in slide-in-from-bottom-2 duration-300 mb-6`}
                        data-created-at={m.createdAt}
                    >
                        <div className={`p-4 px-5 pb-6 rounded-[22px] max-w-[85%] w-fit break-words whitespace-pre-wrap shadow-sm relative min-w-[100px] ${m.role==='user'?'bg-[var(--color-chat-user)] text-white rounded-tr-none':'bg-[var(--color-chat-model-bg)] text-[var(--color-text-main)] rounded-tl-none border border-[var(--color-border)]'}`}>
                          <ReactMarkdown className="markdown-chat text-[14px] leading-[1.5] tracking-[0.3px]">{m.text.replace(/\[TAG:(like|dislike|neutral)\]/g, '')}</ReactMarkdown>
                          {m.timestamp && (
                            <div className={`text-[10px] absolute bottom-1.5 right-3 ${m.role==='user' ? 'text-white/60' : 'text-[var(--color-text-muted)]'}`}>
                              {m.timestamp}
                            </div>
                          )}
                        </div>
                        {m.role === 'model' && (
                          <div className="flex gap-3 mt-1 px-1 ml-1">
                               <button 
                                  onClick={() => handleRateMessage(i, 'like')}
                                  className="p-1 transition-all duration-200 active:scale-95 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                               >
                                  <ThumbsUp size={16} fill="none" strokeWidth={m.rating === 'like' ? 3 : 1.5} className="transition-all duration-200" />
                               </button>
                               <button 
                                  onClick={() => handleRateMessage(i, 'dislike')}
                                  className="p-1 transition-all duration-200 active:scale-95 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                               >
                                  <ThumbsDown size={16} fill="none" strokeWidth={m.rating === 'dislike' ? 3 : 1.5} className="transition-all duration-200" />
                               </button>
                          </div>
                        )}
                    </div>
                  );
                })}
                
                {isSending && chatMessages[chatMessages.length - 1]?.role !== 'model' && (
                  <div className="flex justify-start mb-6">
                    <div className="bg-[var(--color-chat-model-bg)] p-4 px-6 rounded-[22px] rounded-tl-none shadow-sm border border-[var(--color-border)] flex gap-2 items-center">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span>
                      </div>
                      <span className="text-[12px] text-[var(--color-text-muted)]">Печатает...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
             </div>

             <button
                onClick={() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className={`absolute bottom-[76px] right-4 w-12 h-12 rounded-full bg-black/30 backdrop-blur-md shadow-lg flex items-center justify-center cursor-pointer transition-all duration-300 z-40 hover:bg-black/40 hover:scale-105 ${showScrollDownButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
             >
                <ArrowDown className="text-white" size={24} />
             </button>
             
             <div className="p-2 border-t border-[var(--color-border)] flex items-center gap-2 bg-[var(--color-bg-card)] shrink-0 relative z-50">
               <input 
                 value={userInput} 
                 onKeyPress={e=>e.key==='Enter' && handleSendMessage()} 
                 onChange={e=>setUserInput(e.target.value)} 
                 className="flex-1 bg-[var(--color-input-bg)] text-[16px] px-4 py-2.5 rounded-[20px] outline-none placeholder-[var(--color-text-muted)] text-[var(--color-text-main)] transition-all focus:bg-opacity-80" 
                 placeholder="Сообщение"
               />
               
               {userInput.trim() ? (
                   <button 
                     onClick={() => handleSendMessage()} 
                     disabled={isSending} 
                     className="w-[40px] h-[40px] bg-[var(--color-accent)] rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition-transform shrink-0 animate-in zoom-in duration-200"
                   >
                     {isSending ? <Loader2 className="animate-spin" size={20}/> : <Send size={20} className="ml-0.5"/>}
                   </button>
               ) : (
                   <button 
                     onClick={handleVoiceInput}
                     className={`w-[40px] h-[40px] flex items-center justify-center rounded-full active:scale-95 transition-transform shrink-0 animate-in zoom-in duration-200 ${isListening ? 'bg-red-100 text-red-500' : 'text-[#707579] hover:bg-[var(--color-input-bg)]'}`}
                   >
                     {isListening ? <Mic className="animate-pulse" size={24}/> : <Mic size={24}/>}
                   </button>
               )}
             </div>
          </div>
        )}
      </div>
    );
  };

  // --- RENDER CONDITIONING ---

  if (view === 'result') {
    return renderResultView();
  }
  
  // Special rendering during quiz phase or shattering
  if (view === 'quiz' || (view === 'result' && isShattering)) {
      // Determine what to show in the quiz placeholder
      // If we are at 100% (currentStep === length), we show the LAST question content
      // but with 100% progress bar.
      const displayStep = Math.min(currentStep, QUESTIONS.length - 1);
      const displayProgress = Math.round((currentStep / QUESTIONS.length) * 100);
      const question = QUESTIONS[displayStep];

      const quizContent = (
          <QuizContent 
              question={question} 
              answers={answers} 
              progressPercent={displayProgress} 
              isAnimating={isAnimating} 
              isPulsing={isPulsing}
              isSending={isSending}
              currentStep={displayStep}
              onOptionSelect={handleOptionSelect}
              onPrevStep={handlePrevStep}
              onNextStep={handleNextStep}
          />
      );

      return (
          <div className="relative w-full h-full bg-[var(--color-bg-body)]">
              {/* If shattering, result view is underneath */}
              {isShattering && (
                  <div className="absolute inset-0 z-0">
                      {renderResultView()}
                  </div>
              )}
              
              {/* If shattering, overlay the shards containing the quiz content */}
              {isShattering ? (
                  <ShatterOverlay>
                      {quizContent}
                  </ShatterOverlay>
              ) : (
                  // Normal quiz view
                  quizContent
              )}
          </div>
      );
  }

  // Fallback for unexpected states
  return null;
};

export default App;