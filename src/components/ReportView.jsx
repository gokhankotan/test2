import React, { useState, useEffect } from 'react';
import { Printer, ArrowLeft, Download, Award, FileSpreadsheet } from 'lucide-react';

export default function ReportView({ onBack, sessionCode }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const code = sessionCode || 'DEFAULT';
    fetch(`/api/sessions/${code}/report`)
      .then(res => res.json())
      .then(data => {
        setReportData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Rapor yükleme hatası:', err);
        setLoading(false);
      });
  }, [sessionCode]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportJSON = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muzakere_rapor_${sessionCode || 'DEFAULT'}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <p>Rapor yükleniyor, lütfen bekleyin...</p>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="report-container">
        <h2>Hata</h2>
        <p>Rapor verileri sunucudan alınamadı.</p>
        <button onClick={onBack} className="btn" style={{ marginTop: '1rem' }}>
          Geri Dön
        </button>
      </div>
    );
  }

  const { question, createdAt, participantsCount, statementsCount, analysis, participants } = reportData;

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '2rem 1rem' }}>
      {/* Yazdırma Esnasında Gizlenecek Kontroller */}
      <div className="no-print" style={{ 
        maxWidth: '900px', 
        margin: '0 auto 1.5rem auto', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <button onClick={onBack} className="btn btn-secondary" style={{ border: '1px solid #374151', color: '#374151' }}>
          <ArrowLeft size={16} /> Paneli Dön
        </button>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleExportJSON} className="btn btn-secondary" style={{ border: '1px solid #2563eb', color: '#2563eb' }}>
            <FileSpreadsheet size={16} /> JSON Dışa Aktar
          </button>
          <button onClick={handlePrint} className="btn" style={{ background: '#7c3aed' }}>
            <Printer size={16} /> Raporu Yazdır / PDF Kaydet
          </button>
        </div>
      </div>

      {/* Rapor Şablonu */}
      <div className="report-container">
        <div className="report-header">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚖️</div>
          <h1 className="report-title">Müzakere Masası Sonuç Raporu</h1>
          <p className="report-subtitle">Kamu İstişare ve Ortak Mutabakat Analizi</p>
          <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Oluşturulma Tarihi: {new Date(createdAt).toLocaleString('tr-TR')}
          </p>
        </div>

        {/* Müzakere Konusu */}
        <div className="report-section">
          <h3>Müzakere Edilen Soru</h3>
          <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111', lineHeight: 1.4, margin: '0.5rem 0' }}>
            {question}
          </p>
          <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', background: '#f3f4f6', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
            <div><strong>Katılımcı Sayısı:</strong> {participantsCount}</div>
            <div><strong>Toplam Görüş Sayısı:</strong> {statementsCount}</div>
            <div><strong>Kutuplaşma Derecesi:</strong> %{analysis?.polarisability || 0}</div>
          </div>
        </div>

        {/* Köprü Cümleleri */}
        <div className="report-section">
          <h3>Uzlaşı Bulguları (Köprü Cümleleri)</h3>
          <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Farklı kampların ortak paydada buluştuğu (her kampta en az %60 onay alan) uzlaşı cümleleridir.
          </p>

          {analysis?.bridges && analysis.bridges.length > 0 ? (
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ width: '60%' }}>Görüş Cümlesi</th>
                  <th style={{ textAlign: 'center' }}>Ortalama Onay</th>
                  <th style={{ textAlign: 'center' }}>En Düşük Onay</th>
                </tr>
              </thead>
              <tbody>
                {analysis.bridges.map((bridge, idx) => (
                  <tr key={idx}>
                    <td><strong>"{bridge.text}"</strong></td>
                    <td style={{ textAlign: 'center', color: 'green', fontWeight: 'bold' }}>%{bridge.overallRate}</td>
                    <td style={{ textAlign: 'center' }}>%{bridge.minApproval}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '1.5rem', border: '1px dashed #ccc', textAlign: 'center', color: '#666', borderRadius: 'var(--radius-md)' }}>
              Müzakere sürecinde yeterli onay oranına ulaşan bir köprü cümle (uzlaşı maddesi) tespit edilememiştir.
            </div>
          )}
        </div>

        {/* Kampların Yapısı */}
        <div className="report-section">
          <h3>Fikir Kamplarının Dağılımı ve Eğilimleri</h3>
          <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Oylama örüntülerine göre gruplanan kampların boyutları ve onları diğer gruplardan ayıran en temel görüşler.
          </p>
          
          {analysis?.camps && analysis.camps.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {analysis.camps.map((camp, idx) => (
                <div key={idx} className="report-camp-card">
                  <div className="report-camp-title">
                    {camp.name} ({camp.size} Katılımcı - %{Math.round((camp.size / participantsCount) * 100)})
                  </div>
                  <div style={{ fontSize: '0.9rem' }}>
                    <p style={{ fontWeight: 600, color: '#4b5563', marginBottom: '0.5rem' }}>Grup için Karakteristik Görüşler:</p>
                    {camp.topStatements && camp.topStatements.length > 0 ? (
                      <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {camp.topStatements.map((st, sIdx) => (
                          <li key={sIdx}>
                            "{st.text}"
                            <span style={{ color: '#10b981', marginLeft: '0.5rem', fontWeight: 600 }}>(Grup içi onay: %{st.approvalRate})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ color: '#888', fontStyle: 'italic' }}>Bu kamp için belirleyici bir görüş tespit edilmemiştir.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>Yeterli veri bulunmadığı için kamp kümelemesi yapılamamıştır.</p>
          )}
        </div>

        {/* Eşit Katılım ve Samimiyet Gerekçeleri */}
        <div className="report-section">
          <h3>Katılımcı Gerekçeleri (Süreç Samimiyeti)</h3>
          <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Habermas'ın "ideal konuşma durumu" ilkesinin gerektirdiği, katılımcıların sürece başlarken beyan ettikleri gerekçeler.
          </p>

          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Katılımcı</th>
                <th>Katılım Gerekçesi</th>
                <th style={{ width: '15%', textAlign: 'center' }}>Tür</th>
              </tr>
            </thead>
            <tbody>
              {participants && participants.map((p, idx) => (
                <tr key={idx}>
                  <td><strong>{p.nickname}</strong></td>
                  <td style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>"{p.justification || 'Gerekçe belirtilmemiş.'}"</td>
                  <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                    <span style={{ 
                      background: p.isBot ? '#e0f2fe' : '#f3e8ff', 
                      color: p.isBot ? '#0369a1' : '#6b21a8',
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      fontWeight: 600
                    }}>
                      {p.isBot ? 'Bot' : 'Gerçek'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
