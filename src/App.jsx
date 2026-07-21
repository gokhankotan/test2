import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Users, Shield, Play, BarChart3, LogIn, Lock, FileJson, Printer } from 'lucide-react';

import Lobby from './components/Lobby';
import Participant from './components/Participant';
import AdminDashboard from './components/AdminDashboard';
import LiveScreen from './components/LiveScreen';
import ReportView from './components/ReportView';

export default function App() {
  const [role, setRole] = useState('lobby'); // lobby, participant, admin, livescreen, report
  const [sessionState, setSessionState] = useState({
    question: '',
    status: 'active',
    statements: [],
    analysis: null,
    participantsCount: 0
  });

  const [participant, setParticipant] = useState(null);
  const [activeSessionCode, setActiveSessionCode] = useState('DEFAULT');
  const [isModerator, setIsModerator] = useState(false);
  const [moderationQueue, setModerationQueue] = useState([]);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAdminAuthModal, setShowAdminAuthModal] = useState(false);

  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('session-state', (state) => {
      setSessionState(prev => ({
        ...prev,
        question: state.question,
        status: state.status,
        statements: state.statements,
        analysis: state.analysis,
        participantsCount: state.participantsCount
      }));
    });

    socket.on('stats-update', ({ participantsCount }) => {
      setSessionState(prev => ({ ...prev, participantsCount }));
    });

    socket.on('question-updated', (question) => {
      setSessionState(prev => ({ ...prev, question }));
    });

    socket.on('new-statement', (statement) => {
      setSessionState(prev => ({
        ...prev,
        statements: [...prev.statements, statement]
      }));
    });

    socket.on('analysis-update', (analysis) => {
      setSessionState(prev => ({ ...prev, analysis }));
    });

    socket.on('moderation-queue', (queue) => {
      setModerationQueue(queue);
    });

    socket.on('opinion_moderated', ({ id, status }) => {
      if (status === 'REJECTED') {
        setSessionState(prev => ({
          ...prev,
          statements: prev.statements.filter(st => st.id !== id)
        }));
      }
    });

    socket.on('session-reset', (state) => {
      setSessionState({
        question: state.question,
        status: state.status,
        statements: state.statements,
        analysis: state.analysis,
        participantsCount: state.participantsCount
      });
      setParticipant(null);
      setIsModerator(false);
      localStorage.removeItem('muzakere_participant');
      setRole('lobby');
    });

    socket.on('session-settings-updated', ({ visibility }) => {
      // Görünürlük güncellemesi geldiyse kullanıcıya bildir
      console.log('Masa erişim ayarları güncellendi:', visibility);
    });

    // LocalStorage: Daha önceden oturum açılmış mı?
    const savedParticipant = localStorage.getItem('muzakere_participant');
    if (savedParticipant) {
      try {
        const parsed = JSON.parse(savedParticipant);
        setParticipant(parsed);
        setActiveSessionCode(parsed.sessionCode || 'DEFAULT');

        // Moderatör kontrolü
        const modToken = localStorage.getItem(`moderator_token_${parsed.sessionCode || 'DEFAULT'}`);
        if (modToken) {
          setIsModerator(true);
          socket.emit('admin-join', { sessionCode: parsed.sessionCode || 'DEFAULT' });
        }

        socket.emit('join-session', { sessionCode: parsed.sessionCode || 'DEFAULT' });
        setRole('participant');
      } catch {
        localStorage.removeItem('muzakere_participant');
      }
    }

    return () => {
      socket.disconnect();
    };
  }, []);

  // Katılımcı olarak masaya oturma
  const handleJoinSession = ({ sessionCode, nickname, justification, isModerator: isModFlag, token }) => {
    const code = (sessionCode || 'DEFAULT').toUpperCase();

    socketRef.current.emit('join-session', { sessionCode: code });
    socketRef.current.emit('register-participant', { sessionCode: code, nickname, justification }, (res) => {
      if (res.success) {
        const newPart = {
          id: res.participantId,
          nickname: res.nickname,
          sessionCode: code,
          votes: {}
        };
        setParticipant(newPart);
        setActiveSessionCode(code);
        localStorage.setItem('muzakere_participant', JSON.stringify(newPart));

        if (isModFlag) {
          setIsModerator(true);
          socketRef.current.emit('admin-join', { sessionCode: code });
        }

        setRole('participant');
      }
    });
  };

  // Görüş gönderme (Socket üzerinden)
  const handleSubmitStatement = (text, callback) => {
    if (!participant) return;
    socketRef.current.emit('submit-statement', {
      sessionCode: activeSessionCode,
      participantId: participant.id,
      text
    }, callback);
  };

  // Görüş oylama
  const handleVote = (statementId, voteValue) => {
    if (!participant) return;

    const updatedVotes = { ...participant.votes, [statementId]: voteValue };
    const updatedPart = { ...participant, votes: updatedVotes };
    setParticipant(updatedPart);
    localStorage.setItem('muzakere_participant', JSON.stringify(updatedPart));

    socketRef.current.emit('submit-vote', {
      sessionCode: activeSessionCode,
      participantId: participant.id,
      statementId,
      voteValue
    }, (res) => {
      if (res && !res.success) {
        console.error('Oy gönderilemedi:', res.message);
      }
    });
  };

  // Masadan kalkma
  const handleLogoutParticipant = () => {
    localStorage.removeItem('muzakere_participant');
    setParticipant(null);
    setIsModerator(false);
    setActiveSessionCode('DEFAULT');
    setRole('lobby');
  };

  // Moderatör: görüş onaylama (Socket)
  const handleApproveStatement = (statementId) => {
    socketRef.current.emit('admin-approve-statement', { sessionCode: activeSessionCode, statementId });
  };

  // Moderatör: görüş reddetme (Socket)
  const handleRejectStatement = (statementId) => {
    socketRef.current.emit('admin-reject-statement', { sessionCode: activeSessionCode, statementId });
  };

  // --- ADMIN KONTROLLERİ ---
  const handleAdminLoginSubmit = (e) => {
    e.preventDefault();
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@muzakere.local', password: adminPassword })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        localStorage.setItem('admin_token', data.token);
        setIsAdminAuthenticated(true);
        setShowAdminAuthModal(false);
        setRole('admin');
        socketRef.current.emit('admin-join', { sessionCode: activeSessionCode });
      } else {
        alert('Hatalı Şifre!');
      }
    })
    .catch(() => alert('Sunucu bağlantı hatası'));
  };

  const handleUpdateQuestion = (newQuestion) => {
    socketRef.current.emit('admin-update-question', { sessionCode: activeSessionCode, newQuestion });
  };

  const handleAdminApproveStatement = (statementId) => {
    socketRef.current.emit('admin-approve-statement', { sessionCode: activeSessionCode, statementId });
  };

  const handleAdminRejectStatement = (statementId) => {
    socketRef.current.emit('admin-reject-statement', { sessionCode: activeSessionCode, statementId });
  };

  const handleRunSimulation = (count, callback) => {
    socketRef.current.emit('admin-run-simulation', { sessionCode: activeSessionCode, count }, callback);
  };

  const handleResetSession = (callback) => {
    socketRef.current.emit('admin-reset-session', { sessionCode: activeSessionCode }, callback);
  };

  const handleOpenAdminPanel = () => {
    if (isAdminAuthenticated) {
      setRole('admin');
      socketRef.current.emit('admin-join', { sessionCode: activeSessionCode });
    } else {
      setShowAdminAuthModal(true);
    }
  };

  // JSON Rapor İndirme
  const handleDownloadReport = async () => {
    try {
      const res = await fetch(`/api/sessions/${activeSessionCode}/report`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `muzakere_rapor_${activeSessionCode}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Rapor indirme hatası: ' + err.message);
    }
  };

  return (
    <div className="app-container">
      {/* Üst Menü / Navbar */}
      <header className="app-header no-print">
        <div className="brand" onClick={() => setRole(participant ? 'participant' : 'lobby')} style={{ cursor: 'pointer' }}>
          <span className="brand-icon">⚖️</span>
          <div>
            <div className="brand-title">Müzakere Masası</div>
            <div className="brand-subtitle">
              {activeSessionCode !== 'DEFAULT' ? `Kod: ${activeSessionCode}` : 'Habermas Kamu Alanı'}
            </div>
          </div>
        </div>

        <nav className="nav-links">
          <button 
            onClick={() => setRole(participant ? 'participant' : 'lobby')} 
            className={`nav-btn ${['lobby', 'participant'].includes(role) ? 'active' : ''}`}
          >
            <Users size={16} /> Müzakere Masası
          </button>
          
          <button 
            onClick={() => setRole('livescreen')} 
            className={`nav-btn ${role === 'livescreen' ? 'active' : ''}`}
          >
            <Play size={16} /> Canlı Ekran
          </button>

          {/* Rapor Butonları (Admin veya Moderatör için) */}
          {(isAdminAuthenticated || isModerator) && (
            <>
              <button 
                onClick={() => setRole('report')} 
                className={`nav-btn ${role === 'report' ? 'active' : ''}`}
              >
                <BarChart3 size={16} /> Bulgular & Rapor
              </button>
              <button 
                onClick={handleDownloadReport}
                className="nav-btn"
                title="JSON Raporu İndir"
              >
                <FileJson size={16} /> JSON Rapor
              </button>
              <button 
                onClick={() => window.print()}
                className="nav-btn"
                title="Yazdır"
              >
                <Printer size={16} /> Yazdır
              </button>
            </>
          )}

          <button 
            onClick={handleOpenAdminPanel} 
            className={`nav-btn ${role === 'admin' ? 'active' : ''}`}
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
          >
            <Shield size={16} /> Yönetici Paneli
          </button>
        </nav>
      </header>

      {/* Ana İçerik Alanı */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {role === 'lobby' && (
          <Lobby 
            question={sessionState.question} 
            participantsCount={sessionState.participantsCount}
            onJoin={handleJoinSession} 
          />
        )}

        {role === 'participant' && participant && (
          <Participant 
            participant={participant}
            statements={sessionState.statements}
            analysis={sessionState.analysis}
            onSubmitStatement={handleSubmitStatement}
            onVote={handleVote}
            onLogout={handleLogoutParticipant}
            isModerator={isModerator}
            sessionCode={activeSessionCode}
            moderationQueue={moderationQueue}
            onApproveStatement={handleApproveStatement}
            onRejectStatement={handleRejectStatement}
          />
        )}

        {role === 'admin' && isAdminAuthenticated && (
          <AdminDashboard 
            question={sessionState.question}
            moderationQueue={moderationQueue}
            stats={{
              participantsCount: sessionState.participantsCount,
              statementsCount: sessionState.statements.length
            }}
            onUpdateQuestion={handleUpdateQuestion}
            onApproveStatement={handleAdminApproveStatement}
            onRejectStatement={handleAdminRejectStatement}
            onRunSimulation={handleRunSimulation}
            onResetSession={handleResetSession}
            onOpenLiveScreen={() => setRole('livescreen')}
            onOpenReport={() => setRole('report')}
          />
        )}

        {role === 'livescreen' && (
          <LiveScreen 
            question={sessionState.question}
            analysis={sessionState.analysis}
            stats={{
              participantsCount: sessionState.participantsCount,
              statementsCount: sessionState.statements.length
            }}
          />
        )}

        {role === 'report' && (
          <ReportView 
            sessionCode={activeSessionCode}
            onBack={() => setRole(isAdminAuthenticated ? 'admin' : 'participant')}
          />
        )}
      </main>

      {/* Admin Giriş Modalı */}
      {showAdminAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 2, 10, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <Lock size={36} style={{ color: 'var(--color-primary)', marginBottom: '0.75rem' }} />
              <h2>Yönetici Kimlik Doğrulama</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Yönetici paneline erişmek için şifrenizi girin.
              </p>
            </div>

            <form onSubmit={handleAdminLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Yönetici Şifresi</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Şifreyi giriniz..." 
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAdminAuthModal(false)} 
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  İptal
                </button>
                <button type="submit" className="btn" style={{ flex: 1 }}>
                  Giriş Yap
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
