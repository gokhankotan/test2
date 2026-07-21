/**
 * Pol.is Açık Veri Seti İçe Aktarma Script'i
 * Kullanım: node scripts/import-polis-dataset.js <datasetPath> <sessionCode>
 * Örnek: node scripts/import-polis-dataset.js ./polis-data/15-per-hour-seattle POLIS15HR
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { db } from '../server/database.js';
import { calculatePCA, runKMeansWithStability, analyzeCampsAndBridges, alignCentroids } from '../server/algorithms.js';
import { generateClusterSummary } from '../server/services/llm.service.js';

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
  const { scores, varianceExplained } = calculatePCA(X, 2);

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

  // Kutuplaşma
  let distSum = 0;
  let distCount = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      if (camps[i].size > 0 && camps[j].size > 0) {
        const dx = camps[i].x - camps[j].x;
        const dy = camps[i].y - camps[j].y;
        distSum += Math.sqrt(dx * dx + dy * dy);
        distCount++;
      }
    }
  }
  const polarisability = distCount > 0 ? Math.min(Math.round((distSum / distCount) / 160 * 100), 100) : 0;

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
    targetK: session.targetK || 3,
    polarizationHistory: session.polarizationHistory || [],
    varianceExplained,
    clusterStability
  };

  db.updateAnalysis(sessionCode, analysisResult);
  db.addPolarizationHistoryEntry(sessionCode, polarisability);
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

  // 4. Yeni Oturumu Oluştur (visibility: PASSWORD_PROTECTED)
  const session = db.createSessionSync({
    code: sessionCode,
    title: 'Pol.is Seattle 15$/Hour Debate',
    description: 'Pol.is Open Dataset — 15-per-hour-seattle (CC BY 4.0 Lisanslı Referans Veri Seti)',
    question: 'Should Seattle raise the minimum wage to $15 per hour for workers?',
    visibility: 'PASSWORD_PROTECTED',
    creatorId: adminId
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
      justification: 'Pol.is 15-per-hour-seattle katılımcısı',
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
            authorId: authorDbId,
            content: statement.text,
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
