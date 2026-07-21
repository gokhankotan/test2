/**
 * Müzakere Masası - Performans ve Ölçeklenebilirlik Testi
 * Yüzlerce eşzamanlı katılımcı ve oylama durumunda analiz motorunun hızını ölçer.
 */

import { calculatePCA, calculateKMeans, analyzeCampsAndBridges } from './algorithms.js';

console.log("====================================================");
console.log("MÜZAKERE MASASI - PERFORMANS VE ÖLÇEKLENEBİLİRLİK TESTİ");
console.log("====================================================\n");

function runTest(participantCount, statementCount) {
  console.log(`Test Parametreleri:`);
  console.log(`- Katılımcı Sayısı (N): ${participantCount}`);
  console.log(`- Görüş Sayısı (M): ${statementCount}`);
  console.log(`- Toplam Oy Hücresi: ${participantCount * statementCount}\n`);

  // 1. Rastgele matris üretme
  const startMatrixBuild = performance.now();
  const X = [];
  const votesOpts = [1, -1, 0]; // Kabul, Red, Kararsız
  
  for (let i = 0; i < participantCount; i++) {
    const row = [];
    for (let j = 0; j < statementCount; j++) {
      // Rastgele oy ata
      row.push(votesOpts[Math.floor(Math.random() * votesOpts.length)]);
    }
    X.push(row);
  }
  const endMatrixBuild = performance.now();
  console.log(`[1] Oy Matrisi Oluşturma Süresi: ${(endMatrixBuild - startMatrixBuild).toFixed(2)} ms`);

  // Mock veri yapıları
  const mockStatements = Array.from({ length: statementCount }, (_, i) => ({ id: `s-${i}`, text: `Görüş Metni #${i}`, approved: true }));
  const mockParticipants = Array.from({ length: participantCount }, (_, i) => {
    const votes = {};
    mockStatements.forEach((st, sIdx) => {
      votes[st.id] = X[i][sIdx];
    });
    return { id: `p-${i}`, nickname: `Katilimci_${i}`, votes };
  });

  // 2. PCA Testi
  const startPCA = performance.now();
  const { scores } = calculatePCA(X, 2);
  const endPCA = performance.now();
  console.log(`[2] PCA Boyut İndirgeme (NIPALS) Süresi: ${(endPCA - startPCA).toFixed(2)} ms`);

  // 3. K-Means Testi
  const startKMeans = performance.now();
  const points = scores.map(pt => [pt[0], pt[1]]);
  const { assignments } = calculateKMeans(points, 3);
  const endKMeans = performance.now();
  console.log(`[3] K-Means Kümeleme (K=3) Süresi: ${(endKMeans - startKMeans).toFixed(2)} ms`);

  // 4. Köprü ve Kamp Karakteristik Analizi Testi
  const startAnalysis = performance.now();
  analyzeCampsAndBridges(mockStatements, mockParticipants, assignments, 3);
  const endAnalysis = performance.now();
  console.log(`[4] Köprü & Kamp Analiz Süresi: ${(endAnalysis - startAnalysis).toFixed(2)} ms`);

  const totalTime = (endPCA - startPCA) + (endKMeans - startKMeans) + (endAnalysis - startAnalysis);
  console.log(`\n--> TOPLAM MATEMATİKSEL HESAPLAMA SÜRESİ: ${totalTime.toFixed(2)} ms`);
  console.log("====================================================\n");
  
  if (totalTime < 50) {
    console.log("SONUÇ: PERFORMANS MÜKEMMEL! (50 ms altında reaksiyon süresi)");
  } else if (totalTime < 200) {
    console.log("SONUÇ: PERFORMANS İYİ. (200 ms altında reaksiyon süresi)");
  } else {
    console.log("SONUÇ: PERFORMANS İYİLEŞTİRİLEBİLİR. (200 ms üzerinde reaksiyon süresi)");
  }
}

// 200 Katılımcı testi (Ölçek testi 1)
runTest(200, 15);

// 1000 Katılımcı testi (Stres testi 2)
runTest(1000, 25);
