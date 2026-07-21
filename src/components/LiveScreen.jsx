import React from 'react';
import { Users, FileText, Split, CheckCircle2, AlertCircle } from 'lucide-react';

const CAMP_COLORS = ["#FF5733", "#33FF57", "#3357FF"];

export default function LiveScreen({ question, analysis, stats }) {
  const points = analysis?.points || [];
  const camps = analysis?.camps || [];
  const bridges = analysis?.bridges || [];
  const polarisability = analysis?.polarisability || 0;

  return (
    <div className="live-layout">
      {/* Sol Sütun: Canlı Görselleştirme Haritası ve Kamp Detayları */}
      <div className="live-left glass-panel">
        <h2 style={{ fontSize: '1.4rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Split size={20} className="text-secondary" />
          Fikir Kümeleri Haritası
        </h2>
        
        <div style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}>
          <div className="chart-wrapper" style={{ maxWidth: '480px', width: '100%' }}>
            <svg viewBox="0 0 400 400" className="chart-svg">
              {/* Kamp Centroid Arka Plan Işımaları */}
              {camps.map((camp, idx) => (
                <circle
                  key={`glow-${idx}`}
                  cx={200 + camp.x * 2}
                  cy={200 - camp.y * 2}
                  r={camp.size > 0 ? 40 : 0}
                  fill={CAMP_COLORS[camp.id]}
                  opacity={0.08}
                />
              ))}

              {/* Eksenler */}
              <line x1="200" y1="0" x2="200" y2="400" className="chart-axis" />
              <line x1="0" y1="200" x2="400" y2="200" className="chart-axis" />

              {/* Katılımcı Noktaları */}
              {points.map((pt) => {
                const cx = 200 + pt.x * 2;
                const cy = 200 - pt.y * 2;
                return (
                  <circle
                    key={pt.id}
                    cx={cx}
                    cy={cy}
                    r={pt.isBot ? 4 : 6}
                    fill={CAMP_COLORS[pt.campId] || '#999'}
                    className="chart-point"
                    opacity={pt.isBot ? 0.7 : 0.95}
                  />
                );
              })}

              {/* Centroid Etiketleri */}
              {camps.map((camp, idx) => {
                if (camp.size === 0) return null;
                const cx = 200 + camp.x * 2;
                const cy = 200 - camp.y * 2;
                return (
                  <g key={`centroid-${idx}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={10}
                      fill={CAMP_COLORS[camp.id]}
                      stroke="#fff"
                      strokeWidth={1.5}
                      style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' }}
                    />
                    <text
                      x={cx}
                      y={cy - 16}
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="800"
                      textAnchor="middle"
                      style={{ textShadow: '0 2px 6px #000' }}
                    >
                      {camp.name.replace(/"/g, '')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Kamp Bazlı Karakteristikler */}
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Grup Eğilimleri:</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {camps.map((camp, idx) => {
              if (camp.size === 0) return null;
              return (
                <div key={idx} style={{ borderLeft: `3px solid ${CAMP_COLORS[camp.id]}`, paddingLeft: '0.75rem' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: CAMP_COLORS[camp.id] }}>
                    {camp.name} ({camp.size} Katılımcı)
                  </div>
                  {camp.topStatements && camp.topStatements.length > 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.2rem' }}>
                      En çok ayrıştığı görüş: "{camp.topStatements[0].text}" (Grup onayı: %{camp.topStatements[0].approvalRate})
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Henüz belirleyici görüş yok.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sağ Sütun: Başlık, İstatistikler ve Köprü Cümleleri */}
      <div className="live-right">
        {/* Soru Paneli */}
        <div className="glass-panel live-question-header">
          <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', fontWeight: 700 }}>
            Canlı Müzakere Masası
          </span>
          <h1 className="live-question-title" style={{ marginTop: '0.5rem' }}>
            {question || "Oturum Sorusunu Belirleyin"}
          </h1>
        </div>

        {/* Canlı İstatistik Kartları */}
        <div className="live-stats-row">
          <div className="stat-box glass-panel">
            <Users style={{ margin: '0 auto', color: 'var(--color-secondary)' }} size={24} />
            <div className="stat-value" style={{ marginTop: '0.25rem' }}>{stats?.participantsCount || 0}</div>
            <div className="stat-label">Katılımcı</div>
          </div>
          
          <div className="stat-box glass-panel">
            <FileText style={{ margin: '0 auto', color: 'var(--color-primary)' }} size={24} />
            <div className="stat-value" style={{ marginTop: '0.25rem' }}>{stats?.statementsCount || 0}</div>
            <div className="stat-label">Aktif Görüş</div>
          </div>

          <div className="stat-box glass-panel">
            <Split style={{ margin: '0 auto', color: 'var(--color-warning)' }} size={24} />
            <div className="stat-value" style={{ marginTop: '0.25rem' }}>%{polarisability}</div>
            <div className="stat-label">Kutuplaşma Derecesi</div>
          </div>
        </div>

        {/* Köprü Cümleleri (Uzlaşı Paydaları) */}
        <div className="glass-panel" style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={20} className="text-agree" />
            Köprü Cümleleri (Mutabakat Noktaları)
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Habermas'ın kamusal alanının nihai hedefi: Karşıt kampların en az %60 oranında ortak kabul gösterdiği, uzlaşı sağlanan görüşler.
          </p>

          {bridges.length > 0 ? (
            <div className="bridge-list">
              {bridges.slice(0, 4).map((bridge, index) => (
                <div key={bridge.id || index} className="bridge-item">
                  <div style={{ fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.4 }}>
                    "{bridge.text}"
                  </div>
                  <div className="bridge-meta">
                    <span className="bridge-tag">Ortak Mutabakat</span>
                    <span>Ortalama Onay: %{bridge.overallRate}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '4rem 1rem' }}>
              <AlertCircle size={32} style={{ color: 'var(--color-warning)', opacity: 0.8 }} />
              <p style={{ fontWeight: 500 }}>Henüz ortak mutabakat sağlanan köprü cümle bulunamadı.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Katılımcılar oy verdikçe ve farklı görüşleri onayladıkça, sistem kampları birleştiren ortak köprüleri burada listeler.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
