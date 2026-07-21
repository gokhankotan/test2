import { describe, it, expect } from 'vitest';
import { calculatePCA, calculateKMeans, analyzeCampsAndBridges } from '../algorithms.js';

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
});
