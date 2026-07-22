import React, { useState, useEffect } from 'react';
import { Printer, ArrowLeft, Download, Award, FileSpreadsheet } from 'lucide-react';
import { t } from '../i18n';

export default function ReportView({ onBack, sessionCode, lang = 'tr' }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredHistoryPoint, setHoveredHistoryPoint] = useState(null);

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
        <p>{lang === 'tr' ? 'Rapor yükleniyor, lütfen bekleyin...' : 'Loading report, please wait...'}</p>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="report-container">
        <h2>{lang === 'tr' ? 'Hata' : 'Error'}</h2>
        <p>{lang === 'tr' ? 'Rapor verileri sunucudan alınamadı.' : 'Failed to retrieve report data from server.'}</p>
        <button onClick={onBack} className="btn" style={{ marginTop: '1rem' }}>
          {lang === 'tr' ? 'Geri Dön' : 'Go Back'}
        </button>
      </div>
    );
  }

  const { question, createdAt, participantsCount, statementsCount, analysis, participants } = reportData;

  const varianceExplained = analysis?.varianceExplained || [];
  const totalVariance = varianceExplained.reduce((s, v) => s + v, 0);
  const showVarianceWarning = !analysis?.insufficientData && !analysis?.insufficientVariance && varianceExplained.length > 0 && totalVariance < 0.40;

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
          <ArrowLeft size={16} /> {t('repBackBtn', lang)}
        </button>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <a 
            href={`/api/sessions/${sessionCode || 'DEFAULT'}/export/csv`} 
            className="btn btn-secondary" 
            style={{ 
              border: '1px solid #059669', 
              color: '#059669', 
              textDecoration: 'none', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              background: 'transparent'
            }}
            download
          >
            <Download size={16} /> {t('repCsvBtn', lang)}
          </a>
          <button onClick={handleExportJSON} className="btn btn-secondary" style={{ border: '1px solid #2563eb', color: '#2563eb' }}>
            <FileSpreadsheet size={16} /> JSON {lang === 'tr' ? 'Dışa Aktar' : 'Export'}
          </button>
          <button onClick={handlePrint} className="btn" style={{ background: '#7c3aed' }}>
            <Printer size={16} /> {lang === 'tr' ? 'Raporu Yazdır / PDF Kaydet' : 'Print / Save PDF'}
          </button>
        </div>
      </div>

      {/* Rapor Şablonu */}
      <div className="report-container">
        <div className="report-header">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚖️</div>
          <h1 className="report-title">{t('repTitle', lang)}</h1>
          <p className="report-subtitle">{t('repSubtitle', lang)}</p>
          <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            {t('repDate', lang)} {new Date(createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
          </p>
        </div>

        {/* Müzakere Konusu */}
        <div className="report-section">
          <h3>{t('repTableHeading', lang)}</h3>
          <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111', lineHeight: 1.4, margin: '0.5rem 0' }}>
            {question}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', background: '#f3f4f6', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div><strong>{lang === 'tr' ? 'Katılımcı Sayısı:' : 'Participants:'}</strong> {participantsCount}</div>
              <div><strong>{lang === 'tr' ? 'Toplam Görüş Sayısı:' : 'Total Opinions:'}</strong> {statementsCount}</div>
              <div>
                <strong>{lang === 'tr' ? 'Kutuplaşma Derecesi:' : 'Polarization:'}</strong>{' '}
                {analysis?.insufficientData ? '—' : (
                  analysis?.insufficientVariance ? (
                    <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                      {lang === 'tr' ? 'Kutuplaşma hesaplanamadı (tek grup / yetersiz ayrışma)' : 'Unable to calculate polarization (insufficient variance)'}
                    </span>
                  ) : `%${analysis?.polarisability}`
                )}
              </div>
            </div>
            
            {showVarianceWarning && (
              <div style={{
                fontSize: '0.8rem',
                color: '#b45309',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                padding: '0.4rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                marginTop: '0.25rem',
                lineHeight: 1.3
              }}>
                ⚠️ {lang === 'tr'
                  ? `Bu oran sınırlı bir varyansa (%${Math.round(totalVariance * 100)}) dayanıyor, temkinli yorumlayın.`
                  : `This rate is based on limited variance (%${Math.round(totalVariance * 100)}), interpret with caution.`}
              </div>
            )}
          </div>
        </div>

        {analysis?.insufficientData ? (
          /* Yetersiz Veri Durumu */
          <div className="report-section" style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            border: '1px dashed #d8b4fe',
            background: '#faf5ff',
            borderRadius: 'var(--radius-md)',
            color: '#7c3aed'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              {lang === 'tr' ? 'Raporlama İçin Yetersiz Veri' : 'Insufficient Data for Reporting'}
            </h4>
            <p style={{ fontSize: '0.88rem', color: '#6b7280', maxWidth: '400px', margin: '0 auto', lineHeight: 1.5 }}>
              {lang === 'tr'
                ? `Müzakere masasında analizlerin ve raporun üretilebilmesi için en az 10 katılımcı ve 5 onaylanmış görüş bulunmalıdır. (Şu an: ${participantsCount} katılımcı, ${statementsCount} görüş)`
                : `At least 10 participants and 5 approved opinions are required to generate the analysis and report. (Current: ${participantsCount} participants, ${statementsCount} opinions)`}
            </p>
          </div>
        ) : (
          <>

        {/* Köprü Cümleleri */}
        <div className="report-section">
          <h3>{t('repConsensusTitle', lang)}</h3>
          <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1rem' }}>
            {t('repConsensusDesc', lang)}
          </p>

          {analysis?.bridges && analysis.bridges.length > 0 ? (
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ width: '60%' }}>{t('repConsensusColText', lang)}</th>
                  <th style={{ textAlign: 'center' }}>{t('repConsensusColOverall', lang)}</th>
                  <th style={{ textAlign: 'center' }}>{t('repConsensusColMin', lang)}</th>
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
              {t('repConsensusEmpty', lang)}
            </div>
          )}
        </div>

        {/* Kampların Yapısı */}
        <div className="report-section">
          <h3>{t('repCampsTitle', lang)}</h3>
          <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1rem' }}>
            {t('repCampsDesc', lang)}
          </p>
          
          {analysis?.camps && analysis.camps.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {analysis.camps.map((camp, idx) => {
                const campLetter = String.fromCharCode(65 + camp.id);
                return (
                  <div key={idx} className="report-camp-card">
                    <div className="report-camp-title">
                      {lang === 'tr' ? `Grup ${campLetter}` : `Cluster ${campLetter}`} ({camp.size} {lang === 'tr' ? 'Katılımcı' : 'Participants'} - %{Math.round((camp.size / participantsCount) * 100)})
                    </div>
                    <div style={{ fontSize: '0.9rem' }}>
                      <p style={{ fontWeight: 600, color: '#4b5563', marginBottom: '0.5rem' }}>{t('repCampHeading', lang)}</p>
                      {camp.topStatements && camp.topStatements.length > 0 ? (
                        <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {camp.topStatements.map((st, sIdx) => (
                            <li key={sIdx}>
                              "{st.text}"
                              <span style={{ color: '#10b981', marginLeft: '0.5rem', fontWeight: 600 }}>({lang === 'tr' ? 'Grup içi onay' : 'Cluster approval'}: %{st.approvalRate})</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ color: '#888', fontStyle: 'italic' }}>{t('repCampEmpty', lang)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p>{t('repCampsEmptyGlobal', lang)}</p>
          )}
        </div>

        {/* Eşit Katılım ve Samimiyet Gerekçeleri */}
        <div className="report-section">
          <h3>{t('repJustifyTitle', lang)}</h3>
          <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1rem' }}>
            {t('repJustifyDesc', lang)}
          </p>

          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>{t('repJustifyColUser', lang)}</th>
                <th>{t('repJustifyColText', lang)}</th>
                <th style={{ width: '15%', textAlign: 'center' }}>{t('repJustifyColType', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {participants && participants.map((p, idx) => (
                <tr key={idx}>
                  <td><strong>{p.nickname}</strong></td>
                  <td style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>"{p.justification || (lang === 'tr' ? 'Gerekçe belirtilmemiş.' : 'No justification specified.')}"</td>
                  <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                    <span style={{ 
                      background: p.isBot ? '#e0f2fe' : '#f3e8ff', 
                      color: p.isBot ? '#0369a1' : '#6b21a8',
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      fontWeight: 600
                    }}>
                      {p.isBot ? (lang === 'tr' ? 'Bot' : 'Bot') : (lang === 'tr' ? 'Gerçek' : 'User')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Kutuplaşma Derecesi Zaman Serisi Trend Çizelgesi */}
        <div className="report-section no-print" style={{ marginTop: '2rem' }}>
          <h3>{lang === 'tr' ? 'Kutuplaşma Derecesi Zaman Çizelgesi' : 'Polarization Degree Timeline'}</h3>
          <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {lang === 'tr' 
              ? 'Müzakere sürecinde oylar verildikçe ve yeni görüşler eklendikçe kutuplaşma oranının değişimi.' 
              : 'The progression of polarization degree as votes were cast and statements submitted.'}
          </p>

          {analysis?.polarizationHistory && analysis.polarizationHistory.length >= 2 ? (() => {
            const history = analysis.polarizationHistory;
            const width = 500;
            const height = 180;
            const paddingLeft = 40;
            const paddingRight = 20;
            const paddingTop = 20;
            const paddingBottom = 30;
            
            const chartWidth = width - paddingLeft - paddingRight;
            const chartHeight = height - paddingTop - paddingBottom;

            // Koordinatları hesapla
            const chartPoints = history.map((pt, idx) => {
              const x = paddingLeft + (idx / (history.length - 1)) * chartWidth;
              const y = (paddingTop + chartHeight) - (pt.v / 100) * chartHeight;
              return { x, y, val: pt.v, time: pt.t };
            });

            // Path d dizesini oluştur
            const linePath = chartPoints.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
            
            return (
              <div style={{ position: 'relative', background: '#ffffff', border: '1px solid #e5e7eb', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                {hoveredHistoryPoint && (
                  <div style={{
                    position: 'absolute',
                    background: '#1e1b4b',
                    color: '#ffffff',
                    border: '1px solid #7c3aed',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    pointerEvents: 'none',
                    left: `${Math.min(hoveredHistoryPoint.x - 50, width - 110)}px`,
                    top: `${hoveredHistoryPoint.y - 45}px`,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
                    zIndex: 20
                  }}>
                    <div style={{ fontWeight: 'bold', color: '#a78bfa' }}>%{hoveredHistoryPoint.val} {lang === 'tr' ? 'Kutuplaşma' : 'Polarization'}</div>
                    <div style={{ fontSize: '0.68rem', color: '#d1d5db', marginTop: '0.15rem' }}>
                      {new Date(hoveredHistoryPoint.time).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                    </div>
                  </div>
                )}

                <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                  {/* Grid çizgileri ve eksenler */}
                  {[0, 25, 50, 75, 100].map((level) => {
                    const y = (paddingTop + chartHeight) - (level / 100) * chartHeight;
                    return (
                      <g key={level}>
                        <line 
                          x1={paddingLeft} 
                          y1={y} 
                          x2={width - paddingRight} 
                          y2={y} 
                          stroke="#f3f4f6" 
                          strokeWidth={1} 
                        />
                        <text 
                          x={paddingLeft - 8} 
                          y={y + 4} 
                          textAnchor="end" 
                          fontSize="9" 
                          fill="#9ca3af"
                        >
                          %{level}
                        </text>
                      </g>
                    );
                  })}

                  {/* Grafik çizgisi */}
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Veri Noktaları (Hover alanları) */}
                  {chartPoints.map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredHistoryPoint && hoveredHistoryPoint.time === pt.time ? 6 : 4}
                      fill={hoveredHistoryPoint && hoveredHistoryPoint.time === pt.time ? '#a78bfa' : '#7c3aed'}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      style={{ cursor: 'pointer', transition: 'all 0.1s' }}
                      onMouseEnter={() => setHoveredHistoryPoint(pt)}
                      onMouseLeave={() => setHoveredHistoryPoint(null)}
                    />
                  ))}
                </svg>
              </div>
            );
          })() : (
            <div style={{ padding: '2rem 1rem', border: '1px dashed #ccc', textAlign: 'center', color: '#666', borderRadius: 'var(--radius-md)' }}>
              {lang === 'tr' 
                ? 'Kutuplaşma grafiğinin çizilebilmesi için masada oylamaların yapılması ve en az 2 analizin tetiklenmesi gerekmektedir.' 
                : 'At least 2 analysis iterations are required to draw the polarization trend chart.'}
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
