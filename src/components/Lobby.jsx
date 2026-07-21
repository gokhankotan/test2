import React, { useState } from 'react';
import { HelpCircle, User, MessageSquareCode, Award, Lock, ShieldAlert, PlusCircle, LogIn } from 'lucide-react';

export default function Lobby({ question, onJoin, participantsCount }) {
  const [activeTab, setActiveTab] = useState('join'); // 'join' veya 'create'
  const [nickname, setNickname] = useState('');
  const [justification, setJustification] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [sessionPassword, setSessionPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Oturum oluşturma state'leri
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [newVisibility, setNewVisibility] = useState('PUBLIC');
  const [newPassword, setNewPassword] = useState('');
  const [creatorNickname, setCreatorNickname] = useState('');

  // Giriş Yapma İşlemi
  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) return setError('Lütfen bir rumuz girin.');
    if (!sessionCode.trim()) return setError('Lütfen oturum kodunu girin.');
    if (justification.trim().length < 15) {
      return setError('Gerekçeniz en az 15 karakter olmalıdır. Habermas\'ın "ideal konuşma durumu" ilkeleri gereği fikirlerinizin arkasındaki samimi nedeni duymak istiyoruz.');
    }

    setError('');
    const upperCode = sessionCode.trim().toUpperCase();

    try {
      // 1. Şifre gerekliliğini / oturum durumunu test et
      const res = await fetch(`/api/sessions/${upperCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: sessionPassword })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.passwordRequired) {
          return setError('Bu masaya erişmek için geçerli bir şifre girmelisiniz.');
        }
        return setError(data.message || 'Giriş yapılamadı.');
      }

      // Giriş başarılıysa accessToken'ı kaydet
      if (data.accessToken) {
        localStorage.setItem(`session_token_${upperCode}`, data.accessToken);
      }

      // App.jsx üzerindeki onJoin handler'ını çağır
      onJoin({
        sessionCode: upperCode,
        nickname: nickname.trim(),
        justification: justification.trim(),
        token: data.accessToken
      });
    } catch (err) {
      setError('Sunucu bağlantısı sırasında bir hata oluştu.');
    }
  };

  // Yeni Masa Oluşturma İşlemi
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return setError('Masa başlığı gereklidir.');
    if (!newQuestion.trim()) return setError('Müzakere sorusu gereklidir.');
    if (!creatorNickname.trim()) return setError('Moderatör rumuzu gereklidir.');
    if (newVisibility === 'PASSWORD_PROTECTED' && !newPassword) {
      return setError('Şifreli oturumlar için şifre belirlemelisiniz.');
    }

    setError('');
    try {
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          question: newQuestion.trim(),
          visibility: newVisibility,
          password: newPassword,
          nickname: creatorNickname.trim()
        })
      });
      const data = await res.json();

      if (!res.ok) {
        return setError(data.message || 'Masa oluşturulamadı.');
      }

      // Moderatör token'ı ve oturum kodunu kaydet
      localStorage.setItem(`moderator_token_${data.code}`, data.moderatorToken);
      if (data.token) {
        // Eğer katılımcı tokenı da varsa
        localStorage.setItem(`session_token_${data.code}`, data.token);
      }

      setSuccessMsg(`Masa '${data.code}' başarıyla oluşturuldu! Yönlendiriliyorsunuz...`);
      
      setTimeout(() => {
        onJoin({
          sessionCode: data.code,
          nickname: creatorNickname.trim(),
          justification: 'Kurucu Moderatör',
          isModerator: true,
          token: data.moderatorToken
        });
      }, 1500);

    } catch (err) {
      setError('Masa oluşturulurken bir hata oluştu.');
    }
  };

  return (
    <div className="lobby-layout">
      {/* Sol Panel: Giriş ve Fikir */}
      <div className="lobby-intro">
        <h1>Müzakere Masası</h1>
        <p>
          Müzakere Masası, sosyal ağların kutuplaştıran algoritmalarına karşı, 
          Jürgen Habermas'ın <strong>ideal konuşma durumu</strong> teorisini temel alan 
          bir uzlaşı arayışıdır. Katılımcılar olarak amacımız çatışmak değil; 
          birbirimizin gerekçelerini anlamak ve ortak paydaları (köprü cümlelerini) keşfetmektir.
        </p>

        <div className="concept-card-grid">
          <div className="concept-card">
            <div className="concept-card-icon">⚖️</div>
            <div className="concept-card-title">Eşit Katılım</div>
            <div className="concept-card-desc">Her ses eşit hakka sahiptir, hiyerarşi yoktur.</div>
          </div>
          <div className="concept-card">
            <div className="concept-card-icon">🧠</div>
            <div className="concept-card-title">Gerekçelendirme</div>
            <div className="concept-card-desc">"Ne düşündüğünüz" kadar "Neden düşündüğünüz" önemlidir.</div>
          </div>
          <div className="concept-card">
            <div className="concept-card-icon">🤝</div>
            <div className="concept-card-title">Samimiyet</div>
            <div className="concept-card-desc">Manipülasyondan uzak, açık ve dürüst argüman üretimi.</div>
          </div>
        </div>

        {question && (
          <div className="question-highlight-box">
            <h3>Güncel Müzakere Konusu</h3>
            <p>{question}</p>
          </div>
        )}

        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <Award size={18} className="text-secondary" />
          <span>Şu anda aktif oturumlarda <strong>{participantsCount || 0}</strong> katılımcı bulunuyor.</span>
        </div>
      </div>

      {/* Sağ Panel: Giriş / Masa Oluşturma Sekmeleri */}
      <div className="glass-panel" style={{ height: 'fit-content', width: '100%', maxWidth: '480px' }}>
        
        {/* Sekme Butonları */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem' }}>
          <button
            onClick={() => { setActiveTab('join'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'join' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'join' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <LogIn size={16} /> Masaya Katıl
          </button>
          <button
            onClick={() => { setActiveTab('create'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'create' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'create' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <PlusCircle size={16} /> Yeni Masa Aç
          </button>
        </div>

        {error && (
          <div style={{ 
            background: 'var(--color-disagree-glow)', 
            border: '1px solid var(--color-disagree)', 
            color: 'var(--text-main)', 
            padding: '0.75rem', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '1rem',
            fontSize: '0.85rem'
          }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{ 
            background: 'rgba(51, 255, 87, 0.1)', 
            border: '1px solid var(--color-agree)', 
            color: 'var(--text-main)', 
            padding: '0.75rem', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '1rem',
            fontSize: '0.85rem'
          }}>
            {successMsg}
          </div>
        )}

        {/* MASAYA KATIL FORMU */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoinSubmit}>
            <div className="form-group">
              <label className="form-label">Oturum Kodu</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Örn: XY12AB" 
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                maxLength={8}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <User size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Rumuz (Nickname)
              </label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Rumuzunuzu yazın..." 
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <MessageSquareCode size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Görüş Gerekçeniz (Süreçten Beklenti)
              </label>
              <textarea 
                className="form-textarea" 
                placeholder="Neden bu masadasınız? Habermas ilkeleri gereği gerekçenizi en az 15 karakterle açıklayın." 
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                maxLength={200}
                required
              ></textarea>
              <span style={{ fontSize: '0.75rem', color: justification.length >= 15 ? 'var(--color-agree)' : 'var(--color-warning)', alignSelf: 'flex-end' }}>
                {justification.length} / 200 karakter (en az 15)
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">
                <Lock size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Masa Şifresi (Eğer gerekliyse)
              </label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Şifreli masalar için şifre giriniz..." 
                value={sessionPassword}
                onChange={(e) => setSessionPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }}>
              Masaya Otur ve Müzakereye Başla
            </button>
          </form>
        )}

        {/* YENİ MASA AÇ FORMU */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit}>
            <div className="form-group">
              <label className="form-label">Masa Başlığı</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Masa konusunu özetleyen bir başlık..." 
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={50}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Açıklama / Bağlam</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Masa katılımcılarına rehberlik edecek kısa bağlam..." 
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Müzakere Konusu (Soru)</label>
              <textarea 
                className="form-textarea" 
                placeholder="Katılımcıların oylayacağı temel müzakere sorusu..." 
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={3}
                maxLength={150}
                required
              ></textarea>
            </div>

            <div className="form-group">
              <label className="form-label">Görünürlük ve Erişim</label>
              <select 
                className="form-input" 
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value)}
                style={{ background: '#110c22', color: '#fff' }}
              >
                <option value="PUBLIC">Herkese Açık (Şifresiz)</option>
                <option value="PASSWORD_PROTECTED">Şifre Korumalı</option>
              </select>
            </div>

            {newVisibility === 'PASSWORD_PROTECTED' && (
              <div className="form-group">
                <label className="form-label">Masa Şifresi</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Giriş şifresini belirleyin..." 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                <User size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Moderatör Rumuzunuz
              </label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Örn: Moderatör_Ahmet" 
                value={creatorNickname}
                onChange={(e) => setCreatorNickname(e.target.value)}
                maxLength={20}
                required
              />
            </div>

            <button type="submit" className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', borderColor: 'var(--color-primary)' }}>
              Masayı Oluştur ve Moderatör Olarak Gir
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
