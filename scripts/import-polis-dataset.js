/**
 * Pol.is Açık Veri Seti İçe Aktarma Script'i
 * Kullanım: node scripts/import-polis-dataset.js <datasetPath> <sessionCode>
 * Örnek: node scripts/import-polis-dataset.js ./polis-data/15-per-hour-seattle POLIS15HR
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { db } from '../server/database.js';
import { calculatePCA, runKMeansWithStability, analyzeCampsAndBridges, alignCentroids, calculatePolarisability, calculateKMeans } from '../server/algorithms.js';
import { generateClusterSummary, generateAxisLabel } from '../server/services/llm.service.js';

async function performAnalysisForScript(sessionCode) {
  console.log(`\n🔍 '${sessionCode}' için analiz motoru çalıştırılıyor...`);
  const session = db.getSessionSync(sessionCode);
  if (!session) {
    console.error('Analiz için oturum bulunamadı.');
    return null;
  }

  const activeParticipants = session.participants.filter(p => !p.isBanned);
  const statements = session.statements;

  const n = activeParticipants.length;
  const m = statements.length;

  console.log(`   Katılımcı Sayısı: ${n}`);
  console.log(`   Onaylı Görüş Sayısı: ${m}`);

  const MIN_PARTICIPANTS = 10;
  const MIN_OPINIONS = 5;

  if (n < MIN_PARTICIPANTS || m < MIN_OPINIONS) {
    const insufficientPayload = {
      insufficientData: true,
      participantsNeeded: Math.max(0, MIN_PARTICIPANTS - n),
      opinionsNeeded: Math.max(0, MIN_OPINIONS - m),
      currentParticipants: n,
      currentOpinions: m
    };
    db.updateAnalysis(sessionCode, insufficientPayload);
    console.log('⚠️ Yetersiz veri eşiğine takıldı.');
    return insufficientPayload;
  }

  // 1. Oy matrisini oluştur (null-fill)
  const X = activeParticipants.map(p => {
    return statements.map(st => p.votes[st.id] !== undefined ? p.votes[st.id] : null);
  });

  // 2. PCA Koordinatlarını hesapla
  const { scores, loadings, varianceExplained } = calculatePCA(X, 2);

  // 2b. PCA Eksen Yorumlanabilirliği Etiketlerini Oluştur
  const getTop3LoadingStatements = (axisIdx) => {
    if (!loadings || !loadings[axisIdx]) return [];
    const mapped = loadings[axisIdx].map((val, idx) => ({ val: Math.abs(val), idx, originalVal: val }));
    mapped.sort((a, b) => b.val - a.val);
    return mapped.slice(0, 3).map(item => ({
      statement: statements[item.idx],
      loading: item.originalVal
    }));
  };

  const top3X = getTop3LoadingStatements(0);
  const top3Y = getTop3LoadingStatements(1);

  const [axisLabelX, axisLabelY] = await Promise.all([
    generateAxisLabel('x', top3X),
    generateAxisLabel('y', top3Y)
  ]);

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  scores.forEach(pt => {
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  });

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  const points = activeParticipants.map((p, i) => {
    let xCoord = 0;
    let yCoord = 0;

    if (rangeX > 1e-5) xCoord = ((scores[i][0] - minX) / rangeX) * 160 - 80;
    if (rangeY > 1e-5) yCoord = ((scores[i][1] - minY) / rangeY) * 160 - 80;

    return {
      id: p.id,
      nickname: p.nickname,
      justification: p.justification || '',
      x: parseFloat(xCoord.toFixed(2)),
      y: parseFloat(yCoord.toFixed(2)),
      campId: 0,
      isBot: !!p.isBot
    };
  });

  // 3. K-Means (5 turlu kararlılık skoru ile)
  const coordinates2D = points.map(pt => [pt.x, pt.y]);
  const k = Math.min(session.targetK || 3, n);
  const { assignments, centroids, clusterStability } = runKMeansWithStability(coordinates2D, k, 5);

  let previousCentroids = [];
  if (session.analysis && session.analysis.camps) {
    previousCentroids = session.analysis.camps.map(c => [c.x, c.y]);
  }

  const aligned = alignCentroids(centroids, assignments, previousCentroids);
  const alignedAssignments = aligned.assignments;
  const alignedCentroids = aligned.centroids;

  points.forEach((pt, idx) => {
    pt.campId = alignedAssignments[idx];
  });

  // 4. Köprü Cümleler ve Kamp Özellikleri
  const { bridges, campCharacteristics } = analyzeCampsAndBridges(statements, activeParticipants, alignedAssignments, k);

  // 5. Kamp Özetleri
  const camps = await Promise.all(Array(k).fill(0).map(async (_, cIdx) => {
    const size = points.filter(pt => pt.campId === cIdx).length;
    const centroid = alignedCentroids[cIdx] || [0, 0];

    let name = `Grup ${String.fromCharCode(65 + cIdx)}`;
    if (session.customCampNames && session.customCampNames[cIdx] !== undefined) {
      name = session.customCampNames[cIdx];
    } else {
      const characteristics = campCharacteristics[cIdx] || [];
      if (characteristics.length > 0) {
        const bestText = characteristics[0].statement.text;
        const cleanWordList = bestText.split(" ").slice(0, 3).join(" ");
        name = `"${cleanWordList}..." Taraftarları`;
      }
    }

    const topStatements = (campCharacteristics[cIdx] || []).map(c => ({
      text: c.statement.text,
      approvalRate: Math.round(c.approvalRate * 100),
      contrastScore: parseFloat(c.contrastScore.toFixed(2))
    }));

    const summary = await generateClusterSummary(cIdx, topStatements);

    return {
      id: cIdx,
      name,
      size,
      x: parseFloat(centroid[0].toFixed(2)),
      y: parseFloat(centroid[1].toFixed(2)),
      topStatements,
      summary
    };
  }));

  // 5b. Alt Kümeleme (Recursive Sub-clustering) Hesapla
  const subClustersMap = {};
  const totalParticipants = points.length;

  camps.forEach(camp => {
    const parentCampId = camp.id;
    const campPoints = points.filter(pt => pt.campId === parentCampId);
    const size = campPoints.length;

    // Kamp büyüklüğü >= toplam katılımcının %40'ı VE >= 20 katılımcı ise
    if (size >= totalParticipants * 0.40 && size >= 20) {
      const campCoords = campPoints.map(pt => [pt.x, pt.y]);
      const { assignments, centroids } = calculateKMeans(campCoords, 2);

      const subCamp0Size = assignments.filter(a => a === 0).length;
      const subCamp1Size = assignments.filter(a => a === 1).length;

      const subCentroids = [
        { id: 0, x: parseFloat(centroids[0][0].toFixed(2)), y: parseFloat(centroids[0][1].toFixed(2)), size: subCamp0Size },
        { id: 1, x: parseFloat(centroids[1][0].toFixed(2)), y: parseFloat(centroids[1][1].toFixed(2)), size: subCamp1Size }
      ];

      const participantAssignments = {};
      campPoints.forEach((pt, idx) => {
        participantAssignments[pt.id] = assignments[idx];
      });

      subClustersMap[parentCampId] = {
        centroids: subCentroids,
        assignments: participantAssignments
      };
    }
  });

  const finalSubClusters = Object.keys(subClustersMap).length > 0 ? subClustersMap : null;

  // Kutuplaşma Derecesini (Polarisability) yeni formülle hesapla
  const polResult = calculatePolarisability(points, camps);
  const polarisability = polResult.polarisability;
  const insufficientVariance = polResult.insufficientVariance;

  const analysisResult = {
    points,
    camps,
    bridges: bridges.map(b => ({
      id: b.statement.id,
      text: b.statement.text,
      minApproval: Math.round(b.minApproval * 100),
      overallRate: Math.round(b.overallRate * 100),
      campApprovalRates: b.campApprovalRates.map(r => Math.round(r * 100))
    })),
    polarisability,
    insufficientVariance,
    axisLabels: { x: axisLabelX, y: axisLabelY },
    subClusters: finalSubClusters,
    targetK: session.targetK || 3,
    polarizationHistory: session.polarizationHistory || [],
    varianceExplained,
    clusterStability
  };

  db.updateAnalysis(sessionCode, analysisResult);
  if (polarisability !== null) {
    db.addPolarizationHistoryEntry(sessionCode, polarisability);
  }
  analysisResult.polarizationHistory = session.polarizationHistory || [];

  return analysisResult;
}

async function main() {
  const args = process.argv.slice(2);
  const datasetPath = args[0] || './polis-data/15-per-hour-seattle';
  const sessionCode = (args[1] || 'POLIS15HR').toUpperCase();

  console.log(`🚀 Pol.is İçe Aktarma Başlatılıyor...`);
  console.log(`   Veri Dizin Path: ${datasetPath}`);
  console.log(`   Hedef Oturum Kodu: ${sessionCode}`);

  await db.initialized;

  // 1. İdempotency Kontrolü
  const existingSession = db.getSessionSync(sessionCode);
  if (existingSession) {
    console.log(`\n⚠️ UYARI: '${sessionCode}' kodlu oturum veritabanında zaten mevcut!`);
    console.log(`   Yinelenen veri oluşmasını önlemek için içe aktarma sonlandırıldı.`);
    process.exit(0);
  }

  // 2. CSV Dosyalarını Oku
  const commentsFilePath = path.join(datasetPath, 'comments.csv');
  const votesFilePath = path.join(datasetPath, 'votes.csv');

  if (!fs.existsSync(commentsFilePath) || !fs.existsSync(votesFilePath)) {
    console.error(`❌ HATA: CSV dosyaları '${datasetPath}' altında bulunamadı!`);
    process.exit(1);
  }

  const commentsContent = fs.readFileSync(commentsFilePath, 'utf8');
  const votesContent = fs.readFileSync(votesFilePath, 'utf8');

  const rawComments = parse(commentsContent, { columns: true, skip_empty_lines: true });
  const rawVotes = parse(votesContent, { columns: true, skip_empty_lines: true });

  console.log(`\n📊 Ham Veri Yüklendi:`);
  console.log(`   Toplam Yorum Satırı: ${rawComments.length}`);
  console.log(`   Toplam Oy Satırı: ${rawVotes.length}`);

  // Sadece moderated === '1' olan yorumları filtresine göre al
  const approvedComments = rawComments.filter(c => String(c.moderated) === '1');
  console.log(`   Onaylanmış Yorum Sayısı (moderated === 1): ${approvedComments.length}`);

  const approvedCommentIds = new Set(approvedComments.map(c => String(c['comment-id'])));

  // Tüm benzersiz katılımcı (voter ve author) ID'lerini topla
  const participantIds = new Set();
  approvedComments.forEach(c => {
    if (c['author-id'] !== undefined && c['author-id'] !== null && c['author-id'] !== '') {
      participantIds.add(String(c['author-id']));
    }
  });

  rawVotes.forEach(v => {
    if (approvedCommentIds.has(String(v['comment-id']))) {
      if (v['voter-id'] !== undefined && v['voter-id'] !== null && v['voter-id'] !== '') {
        participantIds.add(String(v['voter-id']));
      }
    }
  });

  console.log(`   Aktarılacak Benzersiz Katılımcı Sayısı: ${participantIds.size}`);

  // 3. Admin Kaydını Bul
  let adminId = null;
  if (db.isPrismaActive) {
    const admin = await db.prisma.admin.findFirst();
    if (admin) adminId = admin.id;
  }
  if (!adminId) {
    const masterAdmin = db.admins.get('admin@muzakere.local');
    if (masterAdmin) adminId = masterAdmin.id;
  }

  // 4. summary.csv dosyasını oku ve dinamik meta verileri belirle
  let title = 'Pol.is İçe Aktarılan Veriseti';
  let question = 'Müzakere masası sorusu';
  let description = 'Pol.is Açık Veri Seti (CC BY 4.0 Lisanslı Referans Veri Seti)';
  let datasetName = path.basename(datasetPath);

  const summaryFilePath = path.join(datasetPath, 'summary.csv');
  if (fs.existsSync(summaryFilePath)) {
    try {
      const summaryLines = fs.readFileSync(summaryFilePath, 'utf8').split('\n');
      const summaryObj = {};
      summaryLines.forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join(',').trim().replace(/^"|"$/g, '');
          summaryObj[key] = val;
        }
      });
      if (summaryObj.topic) {
        title = `Pol.is: ${summaryObj.topic}`;
        datasetName = summaryObj.topic;
      }
      if (summaryObj['conversation-description']) {
        question = summaryObj['conversation-description'];
        description = `Pol.is "${summaryObj.topic}" müzakeresi veriseti.`;
      }
    } catch (e) {
      console.log('⚠️ summary.csv okunurken hata oluştu, varsayılan değerler kullanılacak:', e.message);
    }
  }

  // Yeni Oturumu Oluştur (visibility: PASSWORD_PROTECTED)
  const session = db.createSessionSync({
    code: sessionCode,
    title: title,
    description: description,
    question: question,
    visibility: 'PASSWORD_PROTECTED',
    creatorId: adminId,
    skipDefaultStatements: true
  });

  // Varsayılan ifadeleri temizle
  session.statements = [];

  // 5. Katılımcıları Ekle
  const participantMap = new Map(); // polis_id -> participant object

  for (const pId of participantIds) {
    const id = `p-polis-${pId}`;
    const nickname = `polis-katilimci-${pId}`;
    const pObj = {
      id,
      nickname,
      justification: `Pol.is ${datasetName} katılımcısı`,
      votes: {},
      isBot: false,
      isBanned: false,
      joinedAt: new Date()
    };
    session.participants.push(pObj);
    participantMap.set(pId, pObj);

    if (db.isPrismaActive) {
      await db.prisma.participant.create({
        data: {
          id: pObj.id,
          sessionId: session.id,
          nickname: pObj.nickname,
          justification: pObj.justification,
          isBot: false,
          isBanned: false
        }
      }).catch(() => {});
    }
  }

  // 6. Onaylı Görüşleri (Opinions/Statements) Ekle
  const commentIdToStatementId = new Map(); // polis comment-id -> statement.id

  for (const c of approvedComments) {
    const originalCommentId = String(c['comment-id']);
    const statementId = `s-polis-${originalCommentId}`;
    const authorNick = `polis-katilimci-${c['author-id']}`;

    const statement = {
      id: statementId,
      text: c['comment-body'], // Kısaltılmadan orijinal içerik
      author: authorNick,
      timestamp: new Date(),
      approved: true
    };

    session.statements.push(statement);
    commentIdToStatementId.set(originalCommentId, statementId);

    if (db.isPrismaActive) {
      // prisma için author participant kaydını bul
      const authorP = participantMap.get(String(c['author-id']));
      const authorDbId = authorP ? authorP.id : session.participants[0]?.id;

      if (authorDbId) {
        await db.prisma.opinion.create({
          data: {
            id: statement.id,
            sessionId: session.id,
            author: authorNick,
            text: statement.text,
            status: 'APPROVED'
          }
        }).catch(() => {});
      }
    }
  }

  // 7. Oyları Ekle
  let voteCount = 0;
  for (const v of rawVotes) {
    const commentId = String(v['comment-id']);
    const voterId = String(v['voter-id']);
    const voteVal = parseInt(v['vote'], 10); // 1, -1, 0

    const statementId = commentIdToStatementId.get(commentId);
    const participant = participantMap.get(voterId);

    if (statementId && participant && !isNaN(voteVal)) {
      // Katılımcının bellek içi oy nesnesine yaz
      participant.votes[statementId] = voteVal;
      voteCount++;

      if (db.isPrismaActive) {
        const opinionDbId = statementId;
        const participantDbId = participant.id;
        await db.prisma.vote.create({
          data: {
            participantId: participantDbId,
            opinionId: opinionDbId,
            value: voteVal
          }
        }).catch(() => {});
      }
    }
  }

  console.log(`\n✅ İçe Aktarım Başarıyla Tamamlandı:`);
  console.log(`   Oturum Kodu: ${session.code}`);
  console.log(`   Katılımcı Kaydı: ${session.participants.length}`);
  console.log(`   Görüş Kaydı: ${session.statements.length}`);
  console.log(`   İşlenen Oy Sayısı: ${voteCount}`);

  // 8. Analiz Motorunu Çağır ve prisma disconnect öncesi tamamlanmasını bekle!
  const analysisRes = await performAnalysisForScript(sessionCode);

  if (db.isPrismaActive) {
    await db.prisma.$disconnect();
    console.log('🔌 Veritabanı bağlantısı güvenle kapatıldı.');
  }

  console.log(`\n🎉 Bütün işlemler başarıyla tamamlandı.`);
}

main().catch(err => {
  console.error('❌ İçe aktarma sırasında beklenmeyen hata oluştu:', err);
  process.exit(1);
});
