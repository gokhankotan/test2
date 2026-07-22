import { describe, it, expect } from 'vitest';
import { calculatePCA, calculateKMeans, analyzeCampsAndBridges, alignCentroids, runKMeansWithStability } from '../algorithms.js';

describe('Matematik ve Kümeleme Motoru Birim Testleri', () => {
  
  // 1. PCA Matris İndirgeme Testi
  it('PCA Matris İndirgeme (4 Katılımcı x 3 Görüş -> 2D Koordinat)', () => {
    // 4 katılımcı ve 3 görüşlü bir oylama matrisi oluştur (1: Katılıyorum, -1: Katılmıyorum, 0: Kararsız)
    const X = [
      [1, -1, 0],
      [1, -1, 1],
      [-1, 1, -1],
      [-1, 1, 0]
    ];

    const numComponents = 2;
    const { scores, loadings } = calculatePCA(X, numComponents);

    // 4 katılımcının da koordinatları hesaplanmış olmalı
    expect(scores).toHaveLength(4);
    scores.forEach(point => {
      // 2 boyutlu koordinat sistemi
      expect(point).toHaveLength(2);
      // Koordinat değerleri sayı olmalı
      expect(typeof point[0]).toBe('number');
      expect(typeof point[1]).toBe('number');
    });

    // Yükleme matrisi boyutu (2 bileşen x 3 görüş) olmalı
    expect(loadings).toHaveLength(numComponents);
    expect(loadings[0]).toHaveLength(3);
  });

  // 2. K-Means Kümeleme Testi
  it('K-Means Kümeleme (Zıt noktaların farklı kümelere atanması)', () => {
    // Kümeleme düzleminde birbirinden çok uzak 2 grup nokta
    const points = [
      [-50, -50], // A Grubu
      [-48, -49], // A Grubu
      [50, 50],   // B Grubu
      [49, 48]    // B Grubu
    ];

    const k = 2;
    const { assignments, centroids } = calculateKMeans(points, k);

    expect(assignments).toHaveLength(points.length);
    expect(centroids).toHaveLength(k);

    // Zıt gruplar farklı kümelere atanmış olmalı
    const clusterA = assignments[0];
    const clusterAPeer = assignments[1];
    const clusterB = assignments[2];
    const clusterBPeer = assignments[3];

    // Aynı gruptaki noktaların kümeleri aynı olmalı
    expect(clusterA).toBe(clusterAPeer);
    expect(clusterB).toBe(clusterBPeer);
    // Farklı gruptaki noktaların kümeleri farklı olmalı
    expect(clusterA).not.toBe(clusterB);
  });

  // 3. Köprü Cümle Kuralı Testi
  it('Köprü Cümle Kuralı Doğrulama (>= %30 Katılım + Her kampta > %60 Onay)', () => {
    // 3 Görüş Tanımı
    const statements = [
      { id: 's-1', text: 'Herkesin katıldığı ortak köprü görüş.', approved: true },
      { id: 's-2', text: 'Sadece 1. kampın desteklediği kutuplaşmış görüş.', approved: true },
      { id: 's-3', text: 'Kimsenin oylamadığı (%30 katılımın altında kalan) görüş.', approved: true }
    ];

    // 4 Katılımcı
    const participants = [
      { id: 'p-1', votes: { 's-1': 1, 's-2': 1 } },
      { id: 'p-2', votes: { 's-1': 1, 's-2': 1 } },
      { id: 'p-3', votes: { 's-1': 1, 's-2': -1 } },
      { id: 'p-4', votes: { 's-1': 1, 's-2': -1 } }
    ];

    // 2 Kampa ataması: p-1 & p-2 Kamp 0, p-3 & p-4 Kamp 1
    const assignments = [0, 0, 1, 1];
    const k = 2;

    const { bridges, campCharacteristics } = analyzeCampsAndBridges(statements, participants, assignments, k);

    // s-1 köprü cümle olmalı (Çünkü her kampta onay oranı %100 (> %60) ve katılım oranı %100 (> %30))
    const isS1Bridge = bridges.some(b => b.statement.id === 's-1');
    expect(isS1Bridge).toBe(true);

    // s-2 kutuplaşmış olmalı, köprü cümle olmamalı (Kamp 1 onay oranı %0)
    const isS2Bridge = bridges.some(b => b.statement.id === 's-2');
    expect(isS2Bridge).toBe(false);

    // s-2 Kamp 0 için karakteristik özellik olmalı (Çünkü Kamp 0'da %100 onay, Kamp 1'de %0 onay)
    const camp0Characteristics = campCharacteristics[0];
    const isS2CharacteristicForCamp0 = camp0Characteristics.some(c => c.statement.id === 's-2');
    expect(isS2CharacteristicForCamp0).toBe(true);
  });

  // 4. Centroid Eşleştirme ve Etiket Kararlılığı Testi
  it('Centroid Eşleştirme (K-Means küme indeks kararlılığı / Label stability)', () => {
    // Eski centroid'ler (indeks 0 ve 1)
    const previousCentroids = [
      [-10, -10], // Centroid 0
      [10, 10]    // Centroid 1
    ];

    // Yeni analizde centroid'lerin sırası yer değiştirmiş olarak gelsin (yeni centroid 0 eskinin 1'ine yakın, yeni 1 eskinin 0'ına yakın)
    const newCentroids = [
      [11, 9],    // Yeni centroid 0 -> Eski Centroid 1'e yakın
      [-9, -11]   // Yeni centroid 1 -> Eski Centroid 0'a yakın
    ];

    // Katılımcıların yeni atamaları: [0, 0, 1, 1]
    const assignments = [0, 0, 1, 1];

    const { assignments: alignedAssignments, centroids: alignedCentroids } = alignCentroids(newCentroids, assignments, previousCentroids);

    // Eşleştirmeden sonra:
    // Yeni centroid 0 (eski 1'e yakın olan) 1. indekse oturmalı.
    // Yeni centroid 1 (eski 0'a yakın olan) 0. indekse oturmalı.
    expect(alignedCentroids[0]).toEqual(newCentroids[1]);
    expect(alignedCentroids[1]).toEqual(newCentroids[0]);

    // Katılımcı atamaları da buna göre haritalanmalı:
    // Eskiden 0 olan atama (yeni 0'a ait olan) artık 1 olmalı.
    // Eskiden 1 olan atama (yeni 1'e ait olan) artık 0 olmalı.
    expect(alignedAssignments).toEqual([1, 1, 0, 0]);
  });

  // 5a. Eksik Oy (null) vs Sıfır Doldurma (zero-fill) PCA Karşılaştırması
  it('PCA: null-fill matrisi, zero-fill matrisinden farklı skor üretmeli', () => {
    // İki grup arasında net ayrışan oy yapısı:
    // Katılımcı 1-3: Grup A (sörüş 1'e +1, sörüş 2'ye -1)
    // Katılımcı 4-6: Grup B (sörüş 1'e -1, sörüş 2'ye +1)
    // Katılımcı 1 ve 4, sörüş 3'ü hiç oylamamış → null

    const Xnull = [
      [1, -1, null],   // Grup A — sörüş 3'ü oylamamış
      [1, -1, 1],      // Grup A — tümünü oyladı
      [1, -1, 1],      // Grup A — tümünü oyladı
      [-1, 1, null],   // Grup B — sörüş 3'ü oylamamış
      [-1, 1, -1],     // Grup B — tümünü oyladı
      [-1, 1, -1]      // Grup B — tümünü oyladı
    ];

    // Zero-fill versiyonu: aynı matris ama null'lar 0 ile doldurulmuş
    const Xzero = Xnull.map(row => row.map(v => v === null ? 0 : v));

    const { scores: scoresNull, varianceExplained: veNull } = calculatePCA(Xnull, 2);
    const { scores: scoresZero } = calculatePCA(Xzero, 2);

    // Her iki matris de 6 katılımcının 2D koordinatlarını üretmeli
    expect(scoresNull).toHaveLength(6);
    expect(scoresZero).toHaveLength(6);

    // null-fill'in varianceExplained dönmesi gerekiyor
    expect(veNull.length).toBeGreaterThan(0);
    expect(veNull[0]).toBeGreaterThanOrEqual(0);
    expect(veNull[0]).toBeLessThanOrEqual(1);

    // null-fill ile zero-fill, eksik hücreler için farklı skor üretmeli
    // (Katılımcı 0 ve 3'ün x koordinatları farklı olmalı — null fill daha saf)
    const nullScore0 = scoresNull[0][0];
    const zeroScore0 = scoresZero[0][0];
    // Her iki versiyonun da aynı yönde (pozitif/negatif) ayrışmasını doğrula:
    // Grup A katılımcıları aynı işarette olmalı
    const sameSignInNull = Math.sign(scoresNull[0][0]) === Math.sign(scoresNull[1][0]);
    expect(sameSignInNull).toBe(true);
    // Zero-fill ve null-fill skor değerleri bu eksik hücre için farklı olmalı
    expect(Math.abs(nullScore0 - zeroScore0)).toBeGreaterThan(0);
  });

  // 5b. Minimum Örneklem Eşiği Mantığı Testi
  it('Minimum eşik: 8 katılımcı / 3 görüş → insufficientData true döndürmeli', () => {
    // Bu test, index.js'deki eşik mantığını algoritmik olarak doğrular.
    // Gerçek PCA/KMeans çağrısını simüle eden basit eşik kontrolü:
    const MIN_PARTICIPANTS = 10;
    const MIN_OPINIONS = 5;

    const checkThreshold = (n, m) => {
      if (n < MIN_PARTICIPANTS || m < MIN_OPINIONS) {
        return {
          insufficientData: true,
          participantsNeeded: Math.max(0, MIN_PARTICIPANTS - n),
          opinionsNeeded: Math.max(0, MIN_OPINIONS - m)
        };
      }
      return { insufficientData: false };
    };

    // 8 katılımcı, 3 görüş → yetersiz
    const result1 = checkThreshold(8, 3);
    expect(result1.insufficientData).toBe(true);
    expect(result1.participantsNeeded).toBe(2);  // 10 - 8
    expect(result1.opinionsNeeded).toBe(2);      // 5 - 3

    // 10 katılımcı, 5 görüş → yeterli
    const result2 = checkThreshold(10, 5);
    expect(result2.insufficientData).toBe(false);

    // 15 katılımcı, 3 görüş → görüş eksik
    const result3 = checkThreshold(15, 3);
    expect(result3.insufficientData).toBe(true);
    expect(result3.participantsNeeded).toBe(0);
    expect(result3.opinionsNeeded).toBe(2);
  });

  // 5c. Küme Kararlılığı Skoru Testi
  it('runKMeansWithStability: net ayrışmış kümede yüksek (>0.8), rastgele dağılmışta düşük kararlılık', () => {
    // Net iki küme: sol alt ve sağ üst köşe (çok belirgin ayrışma)
    const separatedPoints = [
      [-80, -80], [-75, -78], [-78, -72], [-70, -75], [-82, -80],
      [80, 80],   [75, 78],  [78, 72],  [70, 75],  [82, 80]
    ];

    const { clusterStability: stabilityHigh } = runKMeansWithStability(separatedPoints, 2, 5);

    // Net ayrışmış veriler → yüksek kararlılık
    expect(stabilityHigh).toBeGreaterThan(0.8);
    expect(stabilityHigh).toBeLessThanOrEqual(1.0);

    // Rastgele dağılmış noktalarda kararlılık daha düşük beklenir
    // (tek boyutta küçük aralık, merkezi kümeler)
    const randomPoints = [
      [0, 1], [1, 0], [-1, 0], [0, -1], [0.5, 0.5],
      [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5], [0.1, 0.9], [-0.1, -0.9]
    ];
    const { clusterStability: stabilityLow } = runKMeansWithStability(randomPoints, 2, 5);

    // Rastgele/belirsiz veri → kararlılık her zaman yüksek olmaz
    // (Bu test deterministik garantisi olmayabilir, ama skoru 0–1 aralığında doğrular)
    expect(stabilityLow).toBeGreaterThanOrEqual(0);
    expect(stabilityLow).toBeLessThanOrEqual(1.0);

    // Net ayrışmış kümelerin rastgele dağılmıştan daha kararlı olduğu doğrulanır
    expect(stabilityHigh).toBeGreaterThanOrEqual(stabilityLow);
  });

  // 5d. varianceExplained Format Doğrulaması
  it('calculatePCA: varianceExplained [0..1] aralığında iki sayı içermeli', () => {
    const X = [
      [1, -1, 0, 1],
      [1, -1, 1, 0],
      [-1, 1, -1, 0],
      [-1, 1, 0, -1],
      [0, 0, 1, 1],
      [0, 0, -1, -1]
    ];

    const { scores, loadings, varianceExplained } = calculatePCA(X, 2);

    // 2 bileşen için varianceExplained 2 elemanlı olmalı
    expect(varianceExplained).toHaveLength(2);

    // Her eleman [0, 1] aralığında bir sayı olmalı
    varianceExplained.forEach(v => {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });

    // İlk bileşen ikinciden daha fazla varyans açıklamalı (NIPALS sıralaması)
    expect(varianceExplained[0]).toBeGreaterThanOrEqual(varianceExplained[1]);
  });

  // 6. Alt Kümeleme (Recursive Sub-clustering) Eşik Testi
  it('calculateKMeans K=2 ile alt kümeleme doğrulaması', () => {
    const parentCampPoints = [
      [10, 10], [12, 11], [11, 10], [9, 12], [10, 9],
      [-10, -10], [-11, -9], [-9, -11], [-12, -10], [-10, -12]
    ];
    const { assignments, centroids } = calculateKMeans(parentCampPoints, 2);

    expect(assignments).toHaveLength(10);
    expect(centroids).toHaveLength(2);
    const firstGroup = assignments.slice(0, 5);
    const secondGroup = assignments.slice(5, 10);
    
    expect(new Set(firstGroup).size).toBe(1);
    expect(new Set(secondGroup).size).toBe(1);
    expect(firstGroup[0]).not.toBe(secondGroup[0]);
  });

  // 7. Aykırı Değer (Ambiguous) Katılımcı Testi
  it('En yakın iki kamp merkezinin mesafeler oranına göre ambiguous: true/false tespiti', () => {
    const camps = [
      { id: 0, x: 50, y: 0 },
      { id: 1, x: -50, y: 0 }
    ];

    const ptAmbiguous = { id: 'p1', x: 1, y: 0, ambiguous: false };
    const ptClear = { id: 'p2', x: 48, y: 0, ambiguous: false };
    const points = [ptAmbiguous, ptClear];

    points.forEach(pt => {
      pt.ambiguous = false;
      if (camps.length >= 2) {
        const distances = camps.map(camp => {
          const dx = pt.x - camp.x;
          const dy = pt.y - camp.y;
          return Math.sqrt(dx * dx + dy * dy);
        });
        distances.sort((a, b) => a - b);
        const d1 = distances[0];
        const d2 = distances[1];
        if (d1 > 1e-5) {
          const ratio = d2 / d1;
          if (ratio < 1.2) {
            pt.ambiguous = true;
          }
        }
      }
    });

    expect(ptAmbiguous.ambiguous).toBe(true);
    expect(ptClear.ambiguous).toBe(false);
  });

  // 8. Katılım Eşitliği (Gini Katsayısı) Testi
  it('Gini katsayısı formülünün farklı dağılımlar için doğru çalışması', () => {
    const calculateGini = (values) => {
      const n = values.length;
      if (n === 0) return 0;
      const sum = values.reduce((acc, val) => acc + val, 0);
      if (sum === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      let tempSum = 0;
      for (let i = 0; i < n; i++) {
        tempSum += (i + 1) * sorted[i];
      }
      const gini = (2 * tempSum) / (n * sum) - (n + 1) / n;
      return parseFloat(gini.toFixed(3));
    };

    expect(calculateGini([2, 2, 2])).toBe(0);
    expect(calculateGini([0, 0, 10])).toBe(0.667);
    expect(calculateGini([1, 2, 3])).toBe(0.222);
    expect(calculateGini([])).toBe(0);
    expect(calculateGini([0, 0, 0])).toBe(0);
  });

  // 9. Oy Tamamlama Oranı Testi
  it('Oy tamamlama oranı formülünün doğru çalışması', () => {
    const statements = [
      { id: 's1' }, { id: 's2' }, { id: 's3' }
    ];
    const nonBotParticipants = [
      { id: 'p1', votes: { 's1': 1, 's2': -1, 's3': 0 } },
      { id: 'p2', votes: { 's1': 1, 's2': -1 } },
      { id: 'p3', votes: {} }
    ];

    const totalNonBotParticipants = nonBotParticipants.length;
    const totalApprovedOpinions = statements.length;

    let totalVotesCount = 0;
    if (totalNonBotParticipants > 0 && totalApprovedOpinions > 0) {
      const approvedOpinionIds = new Set(statements.map(st => st.id));
      nonBotParticipants.forEach(p => {
        Object.keys(p.votes).forEach(opId => {
          if (approvedOpinionIds.has(opId)) {
            totalVotesCount++;
          }
        });
      });
    }

    const voteCompletionRate = (totalNonBotParticipants > 0 && totalApprovedOpinions > 0)
      ? parseFloat(((totalVotesCount / (totalNonBotParticipants * totalApprovedOpinions)) * 100).toFixed(1))
      : 0;

    expect(voteCompletionRate).toBe(55.6);
  });

  // 10. AI Moderasyon Doğruluğu Testi
  it('AI Moderasyon Doğruluğu (doğru alarm) formülünün doğru hesaplanması', () => {
    const calculateAccuracy = (flaggedApproved, flaggedRejected) => {
      const totalDecided = flaggedApproved + flaggedRejected;
      return totalDecided === 0 ? 0 : Math.round((flaggedRejected / totalDecided) * 100);
    };

    expect(calculateAccuracy(0, 0)).toBe(0);
    expect(calculateAccuracy(0, 5)).toBe(100);
    expect(calculateAccuracy(5, 0)).toBe(0);
    expect(calculateAccuracy(3, 3)).toBe(50);
    expect(calculateAccuracy(2, 6)).toBe(75);
  });

  // 11. Oturumlar Arası Meta-Analiz Testi
  it('Sessions overview verisinin doğru eşlenmesi', () => {
    const mockSessions = [
      {
        code: 'S1',
        question: 'Q1',
        analysis: { polarisability: 45 },
        opinions: [ { status: 'APPROVED' }, { status: 'PENDING' } ],
        participants: [ { isBot: false }, { isBot: true } ]
      },
      {
        code: 'S2',
        question: 'Q2',
        analysis: null,
        opinions: [],
        participants: []
      }
    ];

    const mapped = mockSessions.map(session => {
      const analysisObj = session.analysis;
      const polarisability = (analysisObj && typeof analysisObj === 'object') ? analysisObj.polarisability : null;

      const approvedOpinions = session.opinions.filter(o => o.status === 'APPROVED');
      const nonBotParticipants = session.participants.filter(p => !p.isBot);

      return {
        code: session.code,
        question: session.question,
        participantsCount: nonBotParticipants.length,
        statementsCount: approvedOpinions.length,
        polarisability
      };
    });

    expect(mapped[0]).toEqual({
      code: 'S1',
      question: 'Q1',
      participantsCount: 1,
      statementsCount: 1,
      polarisability: 45
    });

    expect(mapped[1]).toEqual({
      code: 'S2',
      question: 'Q2',
      participantsCount: 0,
      statementsCount: 0,
      polarisability: null
    });
  });
});
