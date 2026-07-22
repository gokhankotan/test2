import React, { useState } from 'react';
import { HelpCircle, Users, Check, X, Settings, FileText, Play, Shield, AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { t } from '../i18n';

export default function AdminDashboard({ 
  question, 
  moderationQueue, 
  stats, 
  status = 'active',
  onUpdateSessionStatus,
  onUpdateQuestion, 
  onApproveStatement, 
  onRejectStatement, 
  onRunSimulation, 
  onResetSession, 
  onOpenLiveScreen, 
  onOpenReport,
  participants = [],
  onKickParticipant,
  targetK = 3,
  camps = [],
  onUpdateCampsCount,
  onRenameCamp,
  lang = 'tr',
  aiAccuracy = 0
}) {
  const [newQuestion, setNewQuestion] = useState(question);
  const [simCount, setSimCount] = useState(100);
  const [simStatus, setSimStatus] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);

  // Kamp ismi düzenleme state'leri
  const [editingCampId, setEditingCampId] = useState(null);
  const [editingCampName, setEditingCampName] = useState('');

  const handleSaveCampName = (campId) => {
    if (!editingCampName.trim()) return;
    onRenameCamp(campId, editingCampName.trim());
    setEditingCampId(null);
    setEditingCampName('');
  };

  const handleUpdateQuestion = (e) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    onUpdateQuestion(newQuestion.trim());
    alert('Müzakere sorusu başarıyla güncellendi.');
  };

  const handleRunSimulation = (count) => {
    setSimStatus('Simülasyon çalıştırılıyor...');
    onRunSimulation(count, (res) => {
      if (res.success) {
        setSimStatus(`${count} yapay katılımcı ve oyları başarıyla eklendi! Kümeleme güncellendi.`);
        setTimeout(() => setSimStatus(''), 5000);
      } else {
        setSimStatus(`Simülasyon hatası: ${res.message}`);
      }
    });
  };

  const handleResetSession = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    onResetSession((res) => {
      if (res.success) {
        setResetConfirm(false);
        setNewQuestion('');
        alert('Tüm oturum verileri sıfırlandı ve varsayılan görüşler yüklendi.');
      } else {
        alert(`Sıfırlama hatası: ${res.message}`);
      }
    });
  };

  return (
    <div className="admin-layout">
      {/* Sol Panel: Oturum ve Simülasyon Ayarları */}
      <div className="admin-left-col" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Canlı Yayın & Rapor Kontrolü */}
        <div className="glass-panel" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            onClick={onOpenLiveScreen} 
            className="btn" 
            style={{ flex: 1, minWidth: '150px', background: 'var(--color-secondary)' }}
          >
            <Play size={16} /> {t('navLive', lang)}
          </button>
          <button 
            onClick={onOpenReport} 
            className="btn" 
            style={{ flex: 1, minWidth: '150px', background: 'var(--color-primary)' }}
          >
            <FileText size={16} /> {t('navReport', lang)}
          </button>
        </div>

        {/* Masa Durumu Kontrolü */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} className="text-secondary" />
            {t('adminStatusTitle', lang)}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {t('adminStatusDesc', lang)}
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={() => onUpdateSessionStatus('active')} 
              className="btn btn-agree"
              style={{ flex: 1, opacity: status === 'active' ? 1 : 0.4 }}
            >
              {t('adminStatusPlay', lang)}
            </button>
            <button 
              onClick={() => onUpdateSessionStatus('paused')} 
              className="btn btn-disagree"
              style={{ flex: 1, opacity: status === 'paused' ? 1 : 0.4 }}
            >
              ⏸️ {t('adminStatusPause', lang)}
            </button>
          </div>
        </div>

        {/* Müzakere Sorusu Ayarı */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} className="text-secondary" />
            {t('adminQuestionTitle', lang)}
          </h2>
          <form onSubmit={handleUpdateQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('adminQuestionFormLabel', lang)}</label>
              <textarea 
                className="form-input" 
                rows={3}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              {t('adminQuestionUpdateBtn', lang)}
            </button>
          </form>
        </div>

        {/* Fikir Kümeleme ve Kamp Ayarları */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} className="text-secondary" />
            {lang === 'tr' ? 'Fikir Kümeleme ve Kamp Ayarları' : 'Opinion Clustering & Camp Settings'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {lang === 'tr' 
              ? 'K-Means algoritması için hedef grup sayısını belirleyin ve grupları isimlendirin.' 
              : 'Configure the target cluster size for K-Means and customize group names.'}
          </p>

          {/* Kamp Sayısı Seçici */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {lang === 'tr' ? 'Hedef Kamp Sayısı (K Değeri):' : 'Target Camp Count (K Value):'}
            </label>
            <select
              className="form-input"
              value={targetK}
              onChange={(e) => onUpdateCampsCount(parseInt(e.target.value, 10))}
              style={{ background: '#110c22', color: '#fff', fontSize: '0.85rem', padding: '0.5rem' }}
            >
              <option value="2">2 {lang === 'tr' ? 'Fikir Grubu' : 'Opinion Clusters'}</option>
              <option value="3">3 {lang === 'tr' ? 'Fikir Grubu (Varsayılan)' : 'Opinion Clusters (Default)'}</option>
              <option value="4">4 {lang === 'tr' ? 'Fikir Grubu' : 'Opinion Clusters'}</option>
              <option value="5">5 {lang === 'tr' ? 'Fikir Grubu' : 'Opinion Clusters'}</option>
            </select>
          </div>

          {/* Kampları Yeniden Adlandırma Listesi */}
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
              {lang === 'tr' ? 'Kampları Yeniden Adlandır:' : 'Rename Active Camps:'}
            </label>
            
            {camps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {camps.map((camp) => {
                  const isEditing = editingCampId === camp.id;
                  const campLetter = String.fromCharCode(65 + camp.id);
                  return (
                    <div key={camp.id} style={{ 
                      background: 'rgba(0,0,0,0.2)', 
                      border: '1px solid var(--border-light)', 
                      borderRadius: 'var(--radius-md)', 
                      padding: '0.6rem 0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                        {lang === 'tr' ? `Grup ${campLetter}` : `Cluster ${campLetter}`} ({camp.size} {lang === 'tr' ? 'kişi' : 'people'})
                      </div>

                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={editingCampName}
                            onChange={(e) => setEditingCampName(e.target.value)}
                            style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                            placeholder={lang === 'tr' ? 'Yeni grup ismi...' : 'New cluster name...'}
                            maxLength={40}
                          />
                          <button 
                            onClick={() => handleSaveCampName(camp.id)}
                            className="btn btn-agree"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                          >
                            {lang === 'tr' ? 'Kaydet' : 'Save'}
                          </button>
                          <button 
                            onClick={() => { setEditingCampId(null); setEditingCampName(''); }}
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', border: '1px solid var(--border-light)' }}
                          >
                            {lang === 'tr' ? 'İptal' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            "{camp.name}"
                          </span>
                          <button 
                            onClick={() => { setEditingCampId(camp.id); setEditingCampName(camp.name); }}
                            className="btn btn-secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }}
                          >
                            {lang === 'tr' ? 'Düzenle' : 'Edit'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {lang === 'tr' ? 'Henüz aktif fikir kampı bulunmuyor.' : 'No active opinion camps found yet.'}
              </p>
            )}
          </div>
        </div>

        {/* Simülasyon Paneli */}
        <div className="glass-panel simulation-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} className="text-secondary" />
            {t('adminSimTitle', lang)}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {t('adminSimDesc', lang)}
          </p>

          <div className="simulation-grid">
            <button onClick={() => handleRunSimulation(100)} className="btn btn-pass">
              {t('adminSimBtn', lang, { count: 100 })}
            </button>
            <button onClick={() => handleRunSimulation(200)} className="btn btn-pass">
              {t('adminSimBtn', lang, { count: 200 })}
            </button>
            <button onClick={() => handleRunSimulation(500)} className="btn btn-pass">
              {t('adminSimBtn', lang, { count: 500 })}
            </button>
          </div>

          {simStatus && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'var(--bg-main)',
              border: '1px solid var(--border-glow)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: 'var(--color-secondary)',
              fontWeight: 500
            }}>
              {simStatus}
            </div>
          )}
        </div>

        {/* Aktif Katılımcılar Listesi */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} className="text-secondary" />
            {t('partModKickTitle', lang)} ({participants.length})
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {lang === 'tr' 
              ? 'Masaya bağlı katılımcıları görüntüleyin. Sabotaj yapan veya kuralları ihlal eden kişileri masadan atabilirsiniz.' 
              : 'View connected participants. You can kick users who sabotage the deliberation or violate the rules.'}
          </p>
          
          <div className="participant-list">
            {participants.length > 0 ? (
              participants.map(p => (
                <div key={p.id} className="participant-list-item">
                  <div className="participant-list-name" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                    <span>{p.isBot ? '🤖' : '👤'}</span>
                    <strong>{p.nickname}</strong>
                    {p.justification && (
                      <span className="participant-list-meta" title={p.justification} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ({p.justification})
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm(t('adminKickConfirm', lang, { nick: p.nickname }))) {
                        onKickParticipant(p.id);
                      }
                    }}
                    className="btn btn-disagree"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    {t('partBtnKick', lang)}
                  </button>
                </div>
              ))
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
                {t('partModKickEmpty', lang)}
              </p>
            )}
          </div>
        </div>

        {/* Sıfırlama */}
        <div className="glass-panel" style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-disagree)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} />
            {lang === 'tr' ? 'Tehlikeli Bölge' : 'Danger Zone'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {t('adminResetDesc', lang)}
          </p>

          <button 
            onClick={handleResetSession} 
            className="btn btn-disagree" 
            style={{ width: '100%' }}
          >
            {resetConfirm ? t('adminResetBtnConfirm', lang) : t('adminResetBtn', lang)}
          </button>
          {resetConfirm && (
            <button 
              onClick={() => setResetConfirm(false)} 
              className="btn btn-pass" 
              style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem' }}
            >
              {lang === 'tr' ? 'Vazgeç' : 'Cancel'}
            </button>
          )}
        </div>
      </div>

      {/* Sağ Panel: Moderasyon Kuyruğu */}
      <div className="admin-right-col glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={18} className="text-secondary" />
          {t('adminQueueTitle', lang)} ({moderationQueue.length})
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {t('adminQueueDesc', lang)}
        </p>

        {aiAccuracy !== undefined && (
          <div style={{
            marginBottom: '1.25rem',
            padding: '0.6rem 0.85rem',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            color: '#93c5fd',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🎯 <strong>{lang === 'tr' 
              ? `AI Moderasyon Doğruluğu: %${aiAccuracy} doğru alarm` 
              : `AI Moderation Accuracy: ${aiAccuracy}% true alert`}</strong>
          </div>
        )}

        <div style={{ maxHeight: '550px', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {moderationQueue.length > 0 ? (
            moderationQueue.map((item) => (
              <div key={item.id} className="moderation-item">
                <div style={{ fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.4 }}>
                  "{item.text}"
                </div>

                {item.aiWarning && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    color: '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}>
                    <span>{t('adminAiWarningLabel', lang)}</span>
                    <strong>{item.aiWarning}</strong>
                  </div>
                )}

                <div className="moderation-meta">
                  <span>{lang === 'tr' ? 'Yazan' : 'Author'}: <strong>{item.author}</strong></span>
                  <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="moderation-actions">
                  <button 
                    onClick={() => onApproveStatement(item.id)} 
                    className="btn btn-agree" 
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    <Check size={14} /> {t('adminQueueApproveBtn', lang)}
                  </button>
                  <button 
                    onClick={() => onRejectStatement(item.id)} 
                    className="btn btn-disagree" 
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    <X size={14} /> {t('adminQueueRejectBtn', lang)}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: '4rem 1rem' }}>
              <div className="empty-state-icon">🛡️</div>
              <p>{t('adminQueueEmpty', lang)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
