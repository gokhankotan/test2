/**
 * Müzakere Masası - Matematik Analiz Motoru
 * PCA (Temel Bileşenler Analizi) ve K-Means algoritmalarını içerir.
 */

/**
 * NIPALS (Non-linear Iterative Partial Least Squares) algoritması ile PCA hesaplar.
 * Eksik oylar (null) pairwise deletion ile işlenir — null hücreler hesaba hiç girmez.
 *
 * @param {(number|null)[][]} X - Katılımcı oy matrisi. Satırlar: Katılımcılar, Sütunlar: Görüşler.
 *                                Katılıyorum: 1, Katılmıyorum: -1, Geç/Nötr: 0, Oy yok: null.
 * @param {number} numComponents - Çıkarılacak bileşen sayısı (Varsayılan: 2)
 * @returns {{scores: number[][], loadings: number[][], varianceExplained: number[]}}
 *          scores: Katılımcıların 2D koordinatları (N x numComponents)
 *          loadings: Görüşlerin eksenlerdeki ağırlıkları (numComponents x M)
 *          varianceExplained: Her bileşenin açıkladığı varyans oranı (ör. [0.42, 0.18])
 */
export function calculatePCA(X, numComponents = 2, maxIter = 100, tol = 1e-6) {
  const n = X.length;
  if (n === 0) return { scores: [], loadings: [], varianceExplained: [] };
  const m = X[0].length;
  if (m === 0) return {
    scores: Array(n).fill(0).map(() => Array(numComponents).fill(0)),
    loadings: [],
    varianceExplained: []
  };

  // X matrisinin kopyasını oluştur (E matrisi) — null değerler korunur
  let E = X.map(row => [...row]);

  // Sütunları merkezileştir: sadece null olmayan değerlerin ortalamasını kullan.
  // null hücreler null kalır (pairwise deletion için gerekli).
  const colMeans = Array(m).fill(0);
  for (let j = 0; j < m; j++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
        sum += E[i][j];
        count++;
      }
    }
    colMeans[j] = count > 0 ? sum / count : 0;
    for (let i = 0; i < n; i++) {
      if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
        E[i][j] -= colMeans[j];
      }
      // null hücreler olduğu gibi null kalır
    }
  }

  // Toplam varyansı hesapla (Frobenius norm karesi) — sadece null olmayan hücreler
  let totalVariance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
        totalVariance += E[i][j] * E[i][j];
      }
    }
  }

  const scores = Array(n).fill(0).map(() => Array(numComponents).fill(0));
  const loadings = Array(numComponents).fill(0).map(() => Array(m).fill(0));
  const varianceExplained = [];

  for (let c = 0; c < numComponents; c++) {
    // Başlangıç t vektörü: her satır için null olmayan ilk değeri al
    let t = E.map(row => {
      for (let j = 0; j < m; j++) {
        if (row[j] !== null && row[j] !== undefined && !isNaN(row[j])) {
          return row[j];
        }
      }
      return 0;
    });
    let p = Array(m).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      const tDotT_total = t.reduce((sum, val) => sum + val * val, 0);
      if (tDotT_total < 1e-10) break;

      // p = E^T * t / (t^T * t) — pairwise deletion:
      // Her j sütunu için sadece E[i][j] != null olan satırlar kullanılır.
      for (let j = 0; j < m; j++) {
        let numerator = 0;
        let denominator = 0;
        for (let i = 0; i < n; i++) {
          if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
            numerator += E[i][j] * t[i];
            denominator += t[i] * t[i];
          }
        }
        p[j] = denominator > 1e-10 ? numerator / denominator : 0;
      }

      // p vektörünü normalize et (p / ||p||)
      const pNorm = Math.sqrt(p.reduce((sum, val) => sum + val * val, 0));
      if (pNorm < 1e-10) break;
      for (let j = 0; j < m; j++) p[j] /= pNorm;

      // Yeni t vektörünü hesapla (t_new = E * p) — pairwise deletion:
      // Her i satırı için sadece E[i][j] != null olan sütunlar katkıda bulunur.
      const tNew = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < m; j++) {
          if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
            sum += E[i][j] * p[j];
          }
        }
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

    // Bu bileşenin açıkladığı varyans oranını hesapla (deflation öncesi)
    const componentVariance = t.reduce((sum, val) => sum + val * val, 0);
    varianceExplained.push(totalVariance > 1e-10 ? componentVariance / totalVariance : 0);

    // E matrisini güncelle (deflation): E = E - t * p^T
    // Sadece null olmayan hücrelerde deflation uygulanır; null hücreler değişmez.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
          E[i][j] -= t[i] * p[j];
        }
      }
    }

    // Ağırlık ve skorları kaydet
    for (let j = 0; j < m; j++) loadings[c][j] = p[j];
    for (let i = 0; i < n; i++) scores[i][c] = t[i];
  }

  return { scores, loadings, varianceExplained };
}

/**
 * Katılımcıların 2D koordinatlarını K-Means ile gruplar.
 * @param {number[][]} points - Katılımcıların 2D koordinat listesi (N x 2)
 * @param {number} k - Küme sayısı (Kamp sayısı)
 * @returns {{assignments: number[], centroids: number[][]}}\
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
 * K-Means'i `runs` kez farklı rastgele başlangıçla çalıştırır.
 * En düşük WCSS (Within-Cluster Sum of Squares) skoruna sahip sonucu seçer.
 * Ayrıca çalıştırmalar arasındaki küme etiket kararlılığını (clusterStability) hesaplar.
 *
 * @param {number[][]} points - 2D koordinat listesi
 * @param {number} k - Küme sayısı
 * @param {number} runs - Kaç kez çalıştırılacağı (varsayılan 5)
 * @returns {{assignments: number[], centroids: number[][], clusterStability: number}}
 *          clusterStability: 0.0–1.0 arası, 1.0 = tüm çalıştırmalarda aynı sonuç
 */
export function runKMeansWithStability(points, k, runs = 5) {
  const n = points.length;
  if (n === 0) return { assignments: [], centroids: [], clusterStability: 1.0 };
  if (n <= k) {
    return {
      assignments: Array.from({ length: n }, (_, i) => i),
      centroids: points.map(p => [...p]),
      clusterStability: 1.0
    };
  }

  const results = [];

  for (let r = 0; r < runs; r++) {
    const result = calculateKMeans(points, k);

    // WCSS hesapla: her nokta ile bağlı olduğu centroid arasındaki kare mesafelerinin toplamı
    let wcss = 0;
    for (let i = 0; i < n; i++) {
      const c = result.assignments[i];
      const centroid = result.centroids[c];
      const dx = points[i][0] - centroid[0];
      const dy = points[i][1] - centroid[1];
      wcss += dx * dx + dy * dy;
    }
    results.push({ ...result, wcss });
  }

  // En iyi sonucu (en düşük WCSS) seç
  results.sort((a, b) => a.wcss - b.wcss);
  const best = results[0];

  // Küme Kararlılığı: her çalıştırmayı best'e hizalayıp katılımcıların
  // kaçının aynı kümeye atandığına bak. Ortalama uyum oranı = clusterStability.
  let totalAgreement = 0;
  for (let r = 0; r < runs; r++) {
    // Bu çalıştırmayı best centroid'leriyle hizala (etiket permütasyonu sorununu gider)
    const aligned = alignCentroids(results[r].centroids, results[r].assignments, best.centroids);
    let agreement = 0;
    for (let i = 0; i < n; i++) {
      if (aligned.assignments[i] === best.assignments[i]) agreement++;
    }
    totalAgreement += agreement / n;
  }

  const clusterStability = parseFloat((totalAgreement / runs).toFixed(3));

  return {
    assignments: best.assignments,
    centroids: best.centroids,
    clusterStability
  };
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
      const voteVal = p.votes[st.id]; // 1: agree, -1: disagree, 0: pass/nötr, undefined: oy vermedi
      if (voteVal === 1) {
        campVotes[c][sIdx].agree++;
        campVotes[c][sIdx].total++;
      } else if (voteVal === -1) {
        campVotes[c][sIdx].disagree++;
        campVotes[c][sIdx].total++;
      } else if (voteVal === 0) {
        campVotes[c][sIdx].pass++;
        // Bilinçli "Geç" oyu total'e dahil edilmez (onay oranını etkilememesi için)
      }
      // undefined/null: oy vermemiş, hiçbir sayaca eklenmez
    });
  });

  const bridges = [];
  const campCharacteristics = Array(k).fill(0).map(() => []);

  statements.forEach((st, sIdx) => {
    // Her kamp için onay oranını bul: katılıyorum / (katılıyorum + katılmıyorum)
    const campApprovalRates = [];

    for (let c = 0; c < k; c++) {
      const votes = campVotes[c][sIdx];
      // Eğer kampta hiç kimse +1/-1 oyu kullanmadıysa oranı 0 kabul et
      const rate = votes.total > 0 ? votes.agree / votes.total : 0;
      campApprovalRates.push(rate);
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

      // Kamp içi onay yüksek (>%50) ve diğer kamplardan farkı belirgin (>0.2) ise
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

/**
 * Yeni hesaplanan centroid'leri, bir önceki turun centroid'leri ile eşleştirerek küme etiketlerinin
 * kararlılığını (label stability) sağlar. Greedy nearest-neighbor matching kullanır.
 */
export function alignCentroids(newCentroids, assignments, previousCentroids) {
  if (!previousCentroids || previousCentroids.length === 0 || newCentroids.length === 0) {
    return { assignments, centroids: newCentroids };
  }

  const k = newCentroids.length;
  const kp = previousCentroids.length;

  // Tüm çiftler arasındaki mesafeleri hesapla
  const pairs = [];
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < kp; j++) {
      const nc = newCentroids[i];
      const oc = previousCentroids[j];
      const dist = (nc[0] - oc[0]) * (nc[0] - oc[0]) + (nc[1] - oc[1]) * (nc[1] - oc[1]);
      pairs.push({ newIdx: i, oldIdx: j, dist });
    }
  }

  // Mesafeye göre küçükten büyüğe sırala
  pairs.sort((a, b) => a.dist - b.dist);

  const matchedNew = new Set();
  const matchedOld = new Set();
  const indexMapping = {}; // newIdx -> oldIdx

  // Greedy eşleştirme
  for (const pair of pairs) {
    if (!matchedNew.has(pair.newIdx) && !matchedOld.has(pair.oldIdx)) {
      matchedNew.add(pair.newIdx);
      matchedOld.add(pair.oldIdx);
      indexMapping[pair.newIdx] = pair.oldIdx;
    }
  }

  // Eşleşmeyen yeni kümeler varsa (örneğin k > kp ise), bunları kalan boş eski indekslere ata
  let nextAvailableOldIdx = 0;
  for (let i = 0; i < k; i++) {
    if (indexMapping[i] === undefined) {
      while (matchedOld.has(nextAvailableOldIdx) && nextAvailableOldIdx < k) {
        nextAvailableOldIdx++;
      }
      indexMapping[i] = nextAvailableOldIdx;
      matchedOld.add(nextAvailableOldIdx);
    }
  }

  // Yeni centroid ve assignments dizilerini mapping'e göre güncelle
  const alignedCentroids = Array(k).fill(0).map(() => [0, 0]);
  for (let i = 0; i < k; i++) {
    const oldIdx = indexMapping[i];
    if (oldIdx < k) {
      alignedCentroids[oldIdx] = [...newCentroids[i]];
    } else {
      alignedCentroids[i] = [...newCentroids[i]];
      indexMapping[i] = i;
    }
  }

  const alignedAssignments = assignments.map(val => indexMapping[val] !== undefined ? indexMapping[val] : val);

  return { assignments: alignedAssignments, centroids: alignedCentroids };
}
