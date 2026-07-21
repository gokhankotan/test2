import React, { useState } from 'react';
import { Settings, Shield, Users, RefreshCw, Send, Play, FileText, Check, X, AlertTriangle } from 'lucide-react';

export default function AdminDashboard({ 
  question, 
  moderationQueue, 
  stats, 
  onUpdateQuestion, 
  onApproveStatement, 
  onRejectStatement, 
  onRunSimulation, 
  onResetSession, 
  onOpenLiveScreen, 
  onOpenReport 
}) {
  const [newQuestion, setNewQuestion] = useState(question);
  const [simCount, setSimCount] = useState(100);
  const [simStatus, setSimStatus] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);

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
            <Play size={16} /> Canlı Ekranı Aç (Projeksiyon)
          </button>
          <button 
            onClick={onOpenReport} 
            className="btn" 
            style={{ flex: 1, minWidth: '150px', background: 'var(--color-primary)' }}
          >
            <FileText size={16} /> Sonuç Raporunu Görüntüle
          </button>
        </div>

        {/* Müzakere Sorusu Ayarı */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} className="text-secondary" />
            Müzakere Masası Konusu
          </h2>
          <form onSubmit={handleUpdateQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Aktif Müzakere Sorusu</label>
              <textarea 
                className="form-input" 
                rows={3}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              Soruyu Güncelle ve Tümüne Duyur
            </button>
          </form>
        </div>

        {/* Simülasyon Paneli */}
        <div className="glass-panel simulation-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} className="text-secondary" />
            Ölçeklenebilirlik & Bot Simülatörü
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Sistemin yüzlerce eşzamanlı katılımcıyla çalışmasını test etmek için 3 ana fikir kampına oy dağıtacak yapay katılımcılar (botlar) oluşturun.
          </p>

          <div className="simulation-grid">
            <button onClick={() => handleRunSimulation(100)} className="btn btn-pass">
              +100 Katılımcı Simüle Et
            </button>
            <button onClick={() => handleRunSimulation(200)} className="btn btn-pass">
              +200 Katılımcı Simüle Et
            </button>
            <button onClick={() => handleRunSimulation(500)} className="btn btn-pass">
              +500 Katılımcı Simüle Et
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

        {/* Sıfırlama */}
        <div className="glass-panel" style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-disagree)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} />
            Tehlikeli Bölge
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Mevcut tüm katılımcı oylarını, eklenen görüşleri sıfırlar ve varsayılan müzakere durumuna geri döner.
          </p>

          <button 
            onClick={handleResetSession} 
            className="btn btn-disagree" 
            style={{ width: '100%' }}
          >
            {resetConfirm ? 'GERÇEKTEN SIFIRLA (TIKLAYIN)' : 'Oturumu Tamamen Sıfırla'}
          </button>
          {resetConfirm && (
            <button 
              onClick={() => setResetConfirm(false)} 
              className="btn btn-pass" 
              style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem' }}
            >
              Vazgeç
            </button>
          )}
        </div>
      </div>

      {/* Sağ Panel: Moderasyon Kuyruğu */}
      <div className="admin-right-col glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={18} className="text-secondary" />
          Görüş Moderasyon Kuyruğu ({moderationQueue.length})
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Katılımcıların gönderdiği görüşler burada listelenir. Oylama havuzuna dahil edilmeden önce spam, hakaret veya konu dışı içerikleri elemek için onaylamanız gerekir.
        </p>

        <div style={{ maxHeight: '550px', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {moderationQueue.length > 0 ? (
            moderationQueue.map((item) => (
              <div key={item.id} className="moderation-item">
                <div style={{ fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.4 }}>
                  "{item.text}"
                </div>
                <div className="moderation-meta">
                  <span>Yazan: <strong>{item.author}</strong></span>
                  <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="moderation-actions">
                  <button 
                    onClick={() => onApproveStatement(item.id)} 
                    className="btn btn-agree" 
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    <Check size={14} /> Onayla ve Yayınla
                  </button>
                  <button 
                    onClick={() => onRejectStatement(item.id)} 
                    className="btn btn-disagree" 
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    <X size={14} /> Reddet
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: '4rem 1rem' }}>
              <div className="empty-state-icon">🛡️</div>
              <p>Moderasyon kuyruğu temiz.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Katılımcıların yazdığı yeni görüşler onaylanmak üzere buraya düşecektir.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
