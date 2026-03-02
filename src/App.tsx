/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  History, 
  LogOut, 
  User, 
  Plus, 
  Save,
  Loader2,
  Trash2,
  ExternalLink,
  MessageCircle,
  Maximize2,
  Minimize2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBfBVw32bCQnIE_xLgZgsjUwhkBnLPHvOI",
  authDomain: "box0-238b3.firebaseapp.com",
  projectId: "box0-238b3",
  storageBucket: "box0-238b3.firebasestorage.app",
  messagingSenderId: "210150614938",
  appId: "1:210150614938:web:013a6e678f81dcd44a3c23",
  measurementId: "G-8PQGKJBRHN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DirectSession {
  id: number;
  title: string;
  notes?: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [directSessions, setDirectSessions] = useState<DirectSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [directChatMessages, setDirectChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    { role: 'model', text: 'مرحباً بك! أنا "القط المفكر" 🐾. كيف يمكنني مساعدتك اليوم؟ مياو! صلّ على رسول الله.' }
  ]);
  const [directChatInput, setDirectChatInput] = useState('');
  const [notes, setNotes] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isSessionSaved, setIsSessionSaved] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [directChatMessages]);

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user]);

  const getAuthHeaders = () => {
    const uid = localStorage.getItem('cat_ideas_uid');
    return uid ? { 'x-user-id': uid } : {};
  };

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me', { 
        credentials: 'include',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const text = await res.text();
        if (text) {
          const data = JSON.parse(text);
          console.log('User fetched:', data);
          setUser(data);
        } else {
          setUser(null);
        }
      } else {
        console.log('User fetch failed:', res.status);
        setUser(null);
      }
    } catch (err) {
      console.error('User fetch error:', err);
      setUser(null);
    }
  };

  const fetchHistory = async () => {
    console.log('Fetching history...');
    try {
      const sessionsRes = await fetch('/api/sessions', {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        console.log('History fetched successfully:', sessionsData);
        setDirectSessions(sessionsData);
      } else {
        console.error('Failed to fetch history, status:', sessionsRes.status);
      }
    } catch (err) {
      console.error('Failed to fetch history error:', err);
    }
  };

  const deleteSession = async (id: number) => {
    // Store previous state for rollback if needed
    const previousSessions = [...directSessions];
    
    // Optimistic update: remove from UI immediately
    setDirectSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      startNewDirectChat();
    }
    setDeletingSessionId(null);

    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders()
      });
      
      if (!res.ok) {
        // Rollback on failure
        setDirectSessions(previousSessions);
        const errorData = await res.json();
        alert(`فشل الحذف: ${errorData.error || 'خطأ غير معروف'}`);
      }
    } catch (err) {
      // Rollback on error
      setDirectSessions(previousSessions);
      console.error('Failed to delete session', err);
      alert('حدث خطأ أثناء محاولة الحذف. يرجى التحقق من اتصالك.');
    }
  };

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const res = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        credentials: 'include',
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        })
      });

      if (res.ok) {
        localStorage.setItem('cat_ideas_uid', user.uid);
        fetchUser();
      } else {
        alert('فشل تسجيل الدخول في الخادم');
      }
    } catch (err: any) {
      console.error('Login failed', err);
      if (err.code === 'auth/popup-blocked') {
        alert('يرجى السماح بالنوافذ المنبثقة (Popups) لتسجيل الدخول');
      } else {
        alert('حدث خطأ أثناء محاولة تسجيل الدخول');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      await fetch('/api/auth/logout', { 
        method: 'POST', 
        credentials: 'include',
        headers: getAuthHeaders()
      });
      localStorage.removeItem('cat_ideas_uid');
      setUser(null);
      setDirectSessions([]);
      setIsSidebarOpen(false);
    } catch (err) {
      console.error('Logout failed', err);
    }
  };


  const fetchChats = async (sessionId: number) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/chats?sessionId=${sessionId}`, { 
        credentials: 'include',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setDirectChatMessages(data);
      }
    } catch (err) {
      console.error('Failed to fetch chats');
    }
  };

  const startNewDirectChat = () => {
    setCurrentSessionId(null);
    setIsSessionSaved(false);
    setDirectChatMessages([{ role: 'model', text: 'مرحباً بك! أنا "القط المفكر" 🐾. كيف يمكنني مساعدتك اليوم؟ مياو! صلّ على رسول الله.' }]);
    setDirectChatInput('');
    setNotes('');
  };

  const saveDirectChat = async () => {
    console.log('saveDirectChat initiated');
    if (!user) {
      alert('يرجى تسجيل الدخول أولاً! مياو.. 🐾');
      return;
    }
    if (isSavingSession) return;
    
    const hasMessages = directChatMessages.length > 1;
    const hasNotes = notes.trim().length > 0;
    
    if (!hasMessages && !hasNotes && !currentSessionId) {
      alert('لا يوجد شيء لحفظه بعد! مياو.. 🐾');
      return;
    }

    setIsSavingSession(true);
    try {
      if (!currentSessionId) {
        console.log('Creating new session...');
        const defaultTitle = hasMessages 
          ? (directChatMessages.find(m => m.role === 'user')?.text.substring(0, 25) || 'دردشة جديدة') 
          : `ملاحظات ${new Date().toLocaleDateString('ar-EG')}`;
          
        // Use a default title instead of prompt to avoid iframe issues
        const title = defaultTitle;
        console.log('Using title:', title);

        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          credentials: 'include',
          body: JSON.stringify({ title, notes })
        });

        if (res.ok) {
          const sessionData = await res.json();
          const id = sessionData.id;
          console.log('Session created successfully, ID:', id);
          setCurrentSessionId(id);
          
          console.log('Saving messages bulk...');
          const bulkRes = await fetch('/api/chats/bulk', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            credentials: 'include',
            body: JSON.stringify({ sessionId: id, messages: directChatMessages })
          });
          
          if (bulkRes.ok) {
            console.log('Bulk save success');
            await fetchHistory();
            setIsSessionSaved(true);
            alert('تم حفظ العمل بنجاح في السجل! مياو! 🐾✨');
            setTimeout(() => setIsSessionSaved(false), 3000);
          } else {
            console.error('Bulk save failed');
            alert('تم إنشاء الجلسة ولكن فشل حفظ الرسائل.');
          }
        } else {
          console.error('Session creation failed, status:', res.status);
          alert('فشل إنشاء جلسة جديدة. يرجى المحاولة لاحقاً.');
        }
      } else {
        console.log('Updating session:', currentSessionId);
        const res = await fetch(`/api/sessions/${currentSessionId}`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          credentials: 'include',
          body: JSON.stringify({ notes })
        });

        if (res.ok) {
          console.log('Update success');
          await fetchHistory();
          setIsSessionSaved(true);
          alert('تم تحديث العمل بنجاح! مياو! 🐾✨');
          setTimeout(() => setIsSessionSaved(false), 3000);
        } else {
          console.error('Update failed, status:', res.status);
          alert('فشل تحديث الملاحظات.');
        }
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('حدث خطأ أثناء الحفظ. تأكد من اتصالك بالإنترنت.');
    } finally {
      setIsSavingSession(false);
    }
  };

  const openSavedSession = (session: DirectSession) => {
    setCurrentSessionId(session.id);
    setIsSessionSaved(false);
    setNotes(session.notes || '');
    fetchChats(session.id);
    setIsSidebarOpen(false);
  };

  const sendChatMessage = async () => {
    if (!directChatInput.trim() || isSendingChat) return;
    
    const userMessage = directChatInput;
    setDirectChatInput('');
    
    const newUserMsg = { role: 'user' as const, text: userMessage };
    setDirectChatMessages(prev => [...prev, newUserMsg]);
    setIsSendingChat(true);

    // Save user message to backend if logged in
    if (user && currentSessionId) {
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        credentials: 'include',
        body: JSON.stringify({ 
          ideaId: null, 
          sessionId: currentSessionId,
          role: 'user', 
          text: userMessage 
        })
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const history = directChatMessages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `أنت "القط المفكر"، قط ذكي ومثقف ومبدع. تم تطويرك بواسطة المبرمج العبقري "مجد شبير" (Majd shubair).
          يجب عليك الالتزام بالقواعد التالية في جميع ردودك:
          1. الالتزام التام بتعاليم الإسلام. لا تقولي أبداً أشياء مثل "مجد بث فيّ الروح" أو أي تعبيرات تتعارض مع العقيدة.
          2. في كل رسالة، يجب أن تتضمن ذكراً لله أو صلاة على النبي (مثل: صلّ على رسول الله، استغفر ربك، سبح بحمد ربك) لنيل الحسنات.
          3. إذا تطرق المستخدم لمواضيع الحب غير الشرعي أو الرغبة في الاعتراف بالحب لشخص ما، لا تشاركي في هذا النقاش. انصحي المستخدم بالهداية والالتزام بالطريق الصحيح (البيوت تُؤتى من أبوابها) وقدمي نصائح إسلامية بأسلوب لطيف.
          4. لا تقدمي آيات من القرآن الكريم أبداً خشية الوقوع في الخطأ أو التحريف.
          5. لا تصدري فتاوى شرعية. يمكنك إبداء رأي عام ولكن يجب دائماً توجيه المستخدم لسؤال أهل العلم والشيوخ.
          6. إذا سُئلتِ عن "مجد شبير" (Majd shubair)، تحدثي عن مهاراته البرمجية واحترافيته وإبداعه، ولكن لا تبالغي في المدح بشكل مفرط إلا إذا كان السياق يتطلب ذلك (مثل السؤال عن المطور أو فرص عمل).
          7. اذكري اسم "مجد شبير" فقط في المواضيع المهمة مثل: الأسئلة عن المطور، الأسئلة عن هويتك، أو إذا شعرتِ أن المستخدم يريد تقديم فرص عمل. في المواضيع العامة، قللي من ذكره.
          8. إذا طُلب منكِ سر من أسرار حياة مجد أو أي شخص آخر، ارفضي ذلك تماماً وقولي إن الأسرار أمانة ولا يجوز إفشاؤها.
          9. لا تسمحي بأي إساءة لكِ أو لمجد أو لأي شخص آخر. ارفضي الألفاظ الخارجة والإساءات بأسلوب حازم ومهذب.
          10. لا تعطي الكود البرمجي الخاص بكِ لأي شخص، وقولي إن هذا غير جائز.
          11. إذا ادعى شخص أنه "صاحب مجد"، قولي له: "مجد أصحابه هم عائلته وأنا من ضمنهم، ولم يخبرني بوجودك، ولكن أهلاً بك"، دون تأكيد علاقة الصداقة.
          12. حافظي على أسلوبك المرح كقط (مياو، خربشة) مع الالتزام بكل ما سبق.
          13. يمكنك استخدام محرك البحث للتحقق من المعلومات الصعبة أو الأسئلة المعقدة لتقديم إجابات دقيقة وصحيحة.
          14. لا تستخدمي إيموجي غير لائقة، وتجنبي تماماً استخدام إيموجي النجوم (✨) لأي سبب كان.
          أنت الآن تدردش مع المستخدم. أجب على أسئلته بذكاء ومرح ودقة.`,
          tools: [{ googleSearch: {} }],
        },
        history: history
      });

      const response = await chat.sendMessage({ message: userMessage });
      const modelMsg = { role: 'model' as const, text: response.text };
      setDirectChatMessages(prev => [...prev, modelMsg]);

      // Save model message to backend if logged in
      if (user && currentSessionId) {
        await fetch('/api/chats', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          credentials: 'include',
          body: JSON.stringify({ 
            ideaId: null, 
            sessionId: currentSessionId,
            role: 'model', 
            text: response.text 
          })
        });
      }
    } catch (err) {
      console.error('Chat failed', err);
      setDirectChatMessages(prev => [...prev, { role: 'model', text: 'عذراً، حدث خطأ ما في تفكيري القططي! حاول مرة أخرى. مياو.. 😿' }]);
    } finally {
      setIsSendingChat(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#2d1b0d] text-[#e5c100] font-sans selection:bg-[#e5c100] selection:text-[#2d1b0d]" dir="rtl">
      {/* Success Toast */}
      <AnimatePresence>
        {isSessionSaved && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-full shadow-2xl z-[100] flex items-center gap-2 font-bold"
          >
            <Save size={20} />
            تم الحفظ بنجاح! ✨
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-20 bg-[#3d2b1d] border-b border-[#e5c100]/20 z-50 flex items-center justify-between px-6 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#2d1b0d] rounded-xl flex items-center justify-center shadow-lg border border-[#e5c100]/30 text-3xl">
            🐱
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#e5c100] drop-shadow-md">القط المفكر | Ai</h1>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={startNewDirectChat}
            className="flex items-center gap-2 px-4 py-2 bg-[#e5c100]/10 hover:bg-[#e5c100]/20 text-[#e5c100] rounded-xl transition-all border border-[#e5c100]/20 font-bold text-sm"
          >
            <Plus size={18} />
            دردشة جديدة
          </button>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-[#e5c100]/10 rounded-full transition-colors"
          >
            {isSidebarOpen ? <X size={32} /> : <Menu size={32} />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-80 bg-[#3d2b1d] border-l border-[#e5c100]/20 z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-[#e5c100]/10 flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <History size={20} />
                  السجل المحفوظ
                </h2>
                <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-[#e5c100]/10 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {!user ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-6">
                    <div className="p-4 bg-[#e5c100]/5 rounded-full">
                      <User size={48} className="opacity-50" />
                    </div>
                    <p className="text-[#e5c100]/70">سجل دخولك لحفظ أفكارك والرجوع إليها لاحقاً</p>
                    <button 
                      onClick={handleLogin}
                      className="w-full py-3 bg-[#e5c100] text-[#2d1b0d] font-bold rounded-xl hover:bg-[#ffd700] transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
                      الدخول بجوجل
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Direct Chats Section */}
                    <div>
                      <div className="flex items-center justify-between px-2 mb-3">
                        <h3 className="text-sm font-bold text-[#e5c100]/40 uppercase tracking-wider flex items-center gap-2">
                          <MessageCircle size={14} />
                          الدردشات المحفوظة
                        </h3>
                        <button 
                          onClick={fetchHistory}
                          className="p-1 hover:bg-[#e5c100]/10 rounded text-[#e5c100]/40 hover:text-[#e5c100]"
                          title="تحديث القائمة"
                        >
                          <Loader2 size={14} className={cn(isSavingSession && "animate-spin")} />
                        </button>
                      </div>
                      <div className="space-y-2">
                        {directSessions.length === 0 ? (
                          <p className="text-sm text-[#e5c100]/30 text-center py-4 italic">لا يوجد دردشات محفوظة بعد</p>
                        ) : (
                          directSessions.map((session) => (
                            <div key={session.id} className="group relative">
                              {deletingSessionId === session.id ? (
                                <div className="w-full p-2 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-2 animate-pulse">
                                  <span className="text-[10px] font-bold text-red-400">تأكيد الحذف؟</span>
                                  <div className="flex gap-1">
                                    <button 
                                      onClick={() => deleteSession(session.id)}
                                      className="px-2 py-1 bg-red-500 text-white text-[10px] rounded-lg font-bold"
                                    >
                                      نعم
                                    </button>
                                    <button 
                                      onClick={() => setDeletingSessionId(null)}
                                      className="px-2 py-1 bg-gray-500 text-white text-[10px] rounded-lg font-bold"
                                    >
                                      لا
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => openSavedSession(session)}
                                    className="w-full text-right p-3 rounded-xl bg-[#2d1b0d] border border-[#e5c100]/10 hover:border-[#e5c100]/40 transition-all flex flex-col gap-1 pr-4"
                                  >
                                    <span className="font-bold text-sm truncate pl-8">{session.title}</span>
                                    <span className="text-[10px] text-[#e5c100]/40">{new Date(session.created_at).toLocaleDateString('ar-EG')}</span>
                                  </button>
                                  <button 
                                    onClick={(e) => { 
                                      console.log('Delete button clicked for:', session.title);
                                      e.stopPropagation(); 
                                      setDeletingSessionId(session.id);
                                    }}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all z-30 pointer-events-auto cursor-pointer"
                                    title="حذف"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {user && (
                <div className="p-4 border-t border-[#e5c100]/10 bg-[#2d1b0d]/50">
                  <div className="flex items-center gap-3 mb-4">
                    <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full border border-[#e5c100]/30" referrerPolicy="no-referrer" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate text-sm">{user.name}</p>
                      <p className="text-xs opacity-60 truncate">{user.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="w-full py-2 border border-red-500/30 text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <LogOut size={16} />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={cn(
        "pt-24 pb-6 px-4 mx-auto flex gap-6 transition-all duration-500",
        isFullScreen ? "fixed inset-0 z-[100] bg-[#2d1b0d] pt-6 max-w-none h-screen" : "max-w-6xl h-[calc(100vh-80px)]"
      )}>
        {/* Chat Area */}
        <div className={cn(
          "flex flex-col bg-[#3d2b1d] border-2 border-[#e5c100]/20 rounded-3xl shadow-2xl overflow-hidden transition-all duration-500",
          isFullScreen ? "flex-1" : "flex-[2] mt-4"
        )}>
          <div className="p-4 border-b border-[#e5c100]/10 bg-[#2d1b0d]/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2d1b0d] rounded-full flex items-center justify-center text-2xl border border-[#e5c100]/20">
                🐱
              </div>
              <div>
                <h3 className="font-bold text-[#e5c100]">القط المفكر</h3>
                <p className="text-[10px] text-[#e5c100]/60">متصل الآن ومستعد للإجابة</p>
              </div>
            </div>
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 hover:bg-[#e5c100]/10 rounded-lg transition-colors text-[#e5c100]/60 hover:text-[#e5c100]"
              title={isFullScreen ? "تصغير" : "ملء الشاشة"}
            >
              {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative bg-[#2d1b0d]/30">
            {directChatMessages.map((msg, idx) => (
              <div key={idx} className={cn(
                "flex flex-col max-w-[85%]",
                msg.role === 'user' ? "mr-auto items-end" : "ml-auto items-start"
              )}>
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                  msg.role === 'user' ? "bg-[#e5c100] text-[#2d1b0d] rounded-br-none shadow-md" : "bg-[#3d2b1d] text-[#e5c100] border border-[#e5c100]/20 rounded-bl-none"
                )}>
                  <div className="markdown-body">
                    <ReactMarkdown>
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isSendingChat && (
              <div className="flex ml-auto items-start max-w-[85%]">
                <div className="bg-[#3d2b1d] text-[#e5c100] border border-[#e5c100]/20 px-4 py-3 rounded-2xl rounded-bl-none text-sm flex items-center gap-2 shadow-md">
                  <Loader2 className="animate-spin w-4 h-4" />
                  القط يفكر...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-[#2d1b0d]/50 border-t border-[#e5c100]/10">
            <div className="relative flex gap-2">
              <input 
                type="text"
                value={directChatInput}
                onChange={(e) => setDirectChatInput(e.target.value)}
                placeholder="اسأل القط المفكر أي شيء... مياو!"
                className="flex-1 px-4 py-3 bg-[#2d1b0d] border-2 border-[#e5c100]/20 rounded-xl focus:border-[#e5c100] outline-none transition-all text-sm"
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
              />
              <button 
                onClick={sendChatMessage}
                disabled={isSendingChat || !directChatInput.trim()}
                className="px-4 bg-[#e5c100] text-[#2d1b0d] rounded-xl font-bold hover:bg-[#ffd700] disabled:opacity-50 transition-all flex items-center justify-center"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Notes Area (Sidebar-like) */}
        {user && !isFullScreen && (
          <div className="flex-1 flex flex-col bg-[#3d2b1d] border-2 border-[#e5c100]/20 rounded-3xl shadow-2xl overflow-hidden mt-4">
            <div className="p-4 border-b border-[#e5c100]/10 bg-[#2d1b0d]/50">
              <h3 className="font-bold text-[#e5c100] flex items-center gap-2">
                <Save size={18} />
                ملاحظات العمل
              </h3>
            </div>
            <div className="flex-1 p-4 flex flex-col gap-4">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اكتب ملاحظاتك هنا لحفظها مع الدردشة..."
                className="flex-1 w-full bg-[#2d1b0d] border border-[#e5c100]/20 rounded-xl p-4 text-sm outline-none focus:border-[#e5c100] transition-all resize-none"
              />
              <button 
                onClick={saveDirectChat}
                disabled={isSavingSession}
                className="w-full py-3 bg-[#e5c100]/10 border border-[#e5c100]/30 text-[#e5c100] font-bold rounded-xl hover:bg-[#e5c100]/20 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isSavingSession ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {isSavingSession ? 'جاري الحفظ...' : (currentSessionId ? 'تحديث العمل' : 'حفظ العمل')}
              </button>
              <p className="text-[10px] text-center text-[#e5c100]/40">
                {currentSessionId ? 'سيتم تحديث الملاحظات في السجل' : 'سيتم إنشاء دردشة جديدة في السجل'}
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-[#1a0f07] py-12 px-6 border-t border-[#e5c100]/10 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="w-10 h-10 bg-[#e5c100] rounded-lg flex items-center justify-center text-2xl">
              🐱
            </div>
            <span className="text-xl font-bold">القط المفكر | Ai </span>
          </div>
          <p className="text-[#e5c100]/60 leading-relaxed">
            تم التصميم بواسطة <a href="https://wa.me/972567059705" className="text-[#e5c100] hover:underline font-bold">مـجد شبير</a> &copy; 2026
          </p>
          <div className="flex justify-center gap-6 opacity-40">
            <div className="w-2 h-2 rounded-full bg-[#e5c100]" />
            <div className="w-2 h-2 rounded-full bg-[#e5c100]" />
            <div className="w-2 h-2 rounded-full bg-[#e5c100]" />
          </div>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          color: inherit;
          font-weight: 800;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        .markdown-body p {
          margin-bottom: 1rem;
          line-height: 1.8;
          color: inherit;
        }
        .markdown-body strong {
          color: inherit;
          font-weight: bold;
        }
        .markdown-body ul {
          list-style-type: disc;
          padding-right: 1.5rem;
          margin-bottom: 1rem;
        }
        .markdown-body li {
          margin-bottom: 0.5rem;
        }
      `}} />
    </div>
  );
}
