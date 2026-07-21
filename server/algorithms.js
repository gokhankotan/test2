/**
 * Müzakere Masası - Matematik Analiz Motoru
 * PCA (Temel Bileşenler Analizi) ve K-Means algoritmalarını içerir.
 */

/**
 * NIPALS (Non-linear Iterative Partial Least Squares) algoritması ile PCA hesaplar.
 * @param {number[][]} X - Katılımcı oy matrisi. Satırlar: Katılımcılar, Sütunlar: Görüşler.
 *                         Katılıyorum: 1, Katılmıyorum: -1, Kararsız/Oy yok: 0.
 * @param {number} numComponents - Çıkarılacak bileşen sayısı (Varsayılan: 2)
 * @returns {{scores: number[][], loadings: number[][]}} 
 *          scores: Katılımcıların 2D koordinatları (N x 2)
 *          loadings: Görüşlerin eksenlerdeki ağırlıkları (2 x M)
 */
export function calculatePCA(X, numComponents = 2, maxIter = 100, tol = 1e-6) {
  const n = X.length;
  if (n === 0) return { scores: [], loadings: [] };
  const m = X[0].length;
  if (m === 0) return { scores: Array(n).fill(0).map(() => Array(numComponents).fill(0)), loadings: [] };

  // X matrisinin kopyasını oluştur (E matrisi)
  let E = X.map(row => [...row]);

  // Sütunları merkezileştir (Ortalamasını çıkar)
  const colMeans = Array(m).fill(0);
  for (let j = 0; j < m; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += E[i][j];
    colMeans[j] = sum / n;
    for (let i = 0; i < n; i++) E[i][j] -= colMeans[j];
  }

  const scores = Array(n).fill(0).map(() => Array(numComponents).fill(0));
  const loadings = Array(numComponents).fill(0).map(() => Array(m).fill(0));

  for (let c = 0; c < numComponents; c++) {
    // Başlangıçta t vektörü olarak E'nin varyansı en yüksek kolonunu veya ilk kolonunu seç
    let t = E.map(row => row[0] || 0);
    let p = Array(m).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      // p = E^T * t / (t^T * t)
      const tDotT = t.reduce((sum, val) => sum + val * val, 0);
      if (tDotT < 1e-10) break;

      for (let j = 0; j < m; j++) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += E[i][j] * t[i];
        p[j] = sum / tDotT;
      }

      // p vektörünü normalize et (p / ||p||)
      const pNorm = Math.sqrt(p.reduce((sum, val) => sum + val * val, 0));
      if (pNorm < 1e-10) break;
      for (let j = 0; j < m; j++) p[j] /= pNorm;

      // Yeni t vektörünü hesapla (t_new = E * p)
      const tNew = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < m; j++) sum += E[i][j] * p[j];
        tNew[i] = sum;
      }

      // Yakınsama testi
      let diff = 0;
      for (let i = 0; i < n; i++) {
        diff += (tNew[i] - t[i]) * (tNew[i] - t[i]);
      }
      t = tNew;

      if (diff < tol) break;
    }

    // E matrisini güncelle (deflation): E = E - t * p^T
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        E[i][j] -= t[i] * p[j];
      }
    }

    // Ağırlık ve skorları kaydet
    for (let j = 0; j < m; j++) loadings[c][j] = p[j];
    for (let i = 0; i < n; i++) scores[i][c] = t[i];
  }

  return { scores, loadings };
}

/**
 * Katılımcıların 2D koordinatlarını K-Means ile gruplar.
 * @param {number[][]} points - Katılımcıların 2D koordinat listesi (N x 2)
 * @param {number} k - Küme sayısı (Kamp sayısı)
 * @returns {{assignments: number[], centroids: number[][]}}
 *          assignments: Her katılımcının hangi kampa ait olduğu (N boyutlu dizi)
 *          centroids: Kampların merkez koordinatları (k x 2)
 */
export function calculateKMeans(points, k = 3, maxIter = 50) {
  const n = points.length;
  if (n === 0) return { assignments: [], centroids: [] };
  
  // Katılımcı sayısı kamp sayısından azsa her birini kendi kampına koy
  if (n <= k) {
    return {
      assignments: Array.from({ length: n }, (_, i) => i),
      centroids: points.map(p => [...p])
    };
  }

  // Centroidleri rastgele seç (Basit random pick)
  let centroids = [];
  const usedIndices = new Set();
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * n);
    if (!usedIndices.has(idx)) {
      centroids.push([...points[idx]]);
      usedIndices.add(idx);
    }
  }

  let assignments = Array(n).fill(-1);
  let changed = true;
  let iter = 0;

  while (changed && iter < maxIter) {
    changed = false;
    iter++;

    // Her noktayı en yakın centroid'e ata
    const nextAssignments = [];
    for (let i = 0; i < n; i++) {
      const p = points[i];
      let minD = Infinity;
      let bestC = 0;
      for (let c = 0; c < k; c++) {
        const cnt = centroids[c];
        const d = (p[0] - cnt[0]) * (p[0] - cnt[0]) + (p[1] - cnt[1]) * (p[1] - cnt[1]);
        if (d < minD) {
          minD = d;
          bestC = c;
        }
      }
      nextAssignments.push(bestC);
      if (nextAssignments[i] !== assignments[i]) {
        changed = true;
      }
    }
    assignments = nextAssignments;

    // Centroidleri yeniden hesapla
    const newCentroids = Array(k).fill(0).map(() => [0, 0]);
    const counts = Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      newCentroids[c][0] += points[i][0];
      newCentroids[c][1] += points[i][1];
      counts[c]++;
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = [
          newCentroids[c][0] / counts[c],
          newCentroids[c][1] / counts[c]
        ];
      } else {
        // Boş küme kalırsa rastgele bir noktaya taşı
        const idx = Math.floor(Math.random() * n);
        centroids[c] = [...points[idx]];
        changed = true;
      }
    }
  }

  return { assignments, centroids };
}

/**
 * Kamp analizlerini yapar: Köprü cümleleri ve kampların karakteristik cümlelerini bulur.
 * @param {object[]} statements - Tüm görüşlerin listesi
 * @param {object[]} participants - Tüm katılımcıların listesi
 * @param {number[]} assignments - Katılımcıların kamp eşleşmeleri
 * @param {number} k - Kamp sayısı
 */
export function analyzeCampsAndBridges(statements, participants, assignments, k = 3) {
  const m = statements.length;
  if (m === 0) return { bridges: [], campCharacteristics: Array(k).fill(0).map(() => []) };

  // Kamp bazında katılım sayılarını bul
  const campSizes = Array(k).fill(0);
  assignments.forEach(c => campSizes[c]++);

  // Görüş bazında her kampın oy dağılımını hesapla
  // votes: campVotes[campId][statementId] = { agree: 0, disagree: 0, pass: 0 }
  const campVotes = Array(k).fill(0).map(() => 
    Array(m).fill(0).map(() => ({ agree: 0, disagree: 0, pass: 0, total: 0 }))
  );

  participants.forEach((p, pIdx) => {
    const c = assignments[pIdx];
    if (c === undefined || c < 0 || c >= k) return;

    statements.forEach((st, sIdx) => {
      const voteVal = p.votes[st.id]; // 1: agree, -1: disagree, 0: pass/no vote
      if (voteVal === 1) {
        campVotes[c][sIdx].agree++;
        campVotes[c][sIdx].total++;
      } else if (voteVal === -1) {
        campVotes[c][sIdx].disagree++;
        campVotes[c][sIdx].total++;
      } else if (voteVal === 0) {
        campVotes[c][sIdx].pass++;
      }
    });
  });

  const bridges = [];
  const campCharacteristics = Array(k).fill(0).map(() => []);

  statements.forEach((st, sIdx) => {
    // Her kamp için onay oranını bul: kabul / toplam_oy (kararsız hariç veya dahil, kararsız hariç oran daha sağlıklıdır)
    const campApprovalRates = [];
    let isValidForAnalysis = true;

    for (let c = 0; c < k; c++) {
      const votes = campVotes[c][sIdx];
      // Eğer kampta hiç kimse oy vermediyse oranı 0 kabul et
      const rate = votes.total > 0 ? votes.agree / votes.total : 0;
      campApprovalRates.push(rate);
      
      // Eğer bir kampta oy sayısı çok azsa güvenilirlik düşüktür ama analize devam et
    }

    // 1. Köprü Görüş Testi (Tüm aktif kamplarda yüksek oranda onay alan)
    // En az 2 kamp aktifse köprü aranabilir
    const activeCampsCount = campSizes.filter(s => s > 0).length;
    if (activeCampsCount >= 2) {
      const minApproval = Math.min(...campApprovalRates.filter((_, c) => campSizes[c] > 0));
      const overallAgreeCount = participants.filter(p => p.votes[st.id] === 1).length;
      const overallVoteCount = participants.filter(p => p.votes[st.id] === 1 || p.votes[st.id] === -1).length;
      const overallRate = overallVoteCount > 0 ? overallAgreeCount / overallVoteCount : 0;

      // Köprü kriteri: Tüm aktif kamplarda onay oranı >= %60
      if (minApproval >= 0.6) {
        bridges.push({
          statement: st,
          minApproval,
          overallRate,
          campApprovalRates
        });
      }
    } else {
      // Tek kamp varsa, genel onay oranı %70 üzerindekileri uzlaşı kabul et
      const overallAgreeCount = participants.filter(p => p.votes[st.id] === 1).length;
      const overallVoteCount = participants.filter(p => p.votes[st.id] === 1 || p.votes[st.id] === -1).length;
      const overallRate = overallVoteCount > 0 ? overallAgreeCount / overallVoteCount : 0;
      if (overallRate >= 0.7) {
        bridges.push({
          statement: st,
          minApproval: overallRate,
          overallRate,
          campApprovalRates
        });
      }
    }

    // 2. Kamp Karakteristiği Testi
    // Bir kampın yüksek kabul verip, diğer kampların düşük kabul ettiği görüşler
    for (let c = 0; c < k; c++) {
      if (campSizes[c] === 0) continue;
      const thisCampRate = campApprovalRates[c];
      
      // Diğer kampların ortalama kabul oranı
      let otherCampsSum = 0;
      let otherCampsCount = 0;
      for (let cOther = 0; cOther < k; cOther++) {
        if (cOther !== c && campSizes[cOther] > 0) {
          otherCampsSum += campApprovalRates[cOther];
          otherCampsCount++;
        }
      }
      const otherCampRateAvg = otherCampsCount > 0 ? otherCampsSum / otherCampsCount : 0;
      const contrastScore = thisCampRate - otherCampRateAvg;

      // Kamp içi onay yüksek (>%50) ve diğer kamplardan farkı belirgin (>0.25) ise
      if (thisCampRate >= 0.5 && contrastScore >= 0.2) {
        campCharacteristics[c].push({
          statement: st,
          approvalRate: thisCampRate,
          contrastScore,
          otherCampRateAvg
        });
      }
    }
  });

  // Köprü görüşleri onay oranına göre sırala
  bridges.sort((a, b) => b.minApproval - a.minApproval);

  // Kamp karakteristiklerini ayırt edicilik skoruna göre sırala ve ilk 3'ü al
  for (let c = 0; c < k; c++) {
    campCharacteristics[c].sort((a, b) => b.contrastScore - a.contrastScore);
    campCharacteristics[c] = campCharacteristics[c].slice(0, 3);
  }

  return {
    bridges,
    campCharacteristics
  };
}
