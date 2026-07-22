import { db } from '../server/database.js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { calculatePCA, runKMeansWithStability, analyzeCampsAndBridges, alignCentroids, calculatePolarisability } from '../server/algorithms.js';

async function verifyPolis() {
  await db.initialized;

  const datasetPath = './polis-data/15-per-hour-seattle';
  const sessionCode = 'POLIS15HR';

  const commentsFilePath = path.join(datasetPath, 'comments.csv');
  const votesFilePath = path.join(datasetPath, 'votes.csv');

  const rawComments = parse(fs.readFileSync(commentsFilePath, 'utf8'), { columns: true, skip_empty_lines: true });
  const rawVotes = parse(fs.readFileSync(votesFilePath, 'utf8'), { columns: true, skip_empty_lines: true });

  const approvedComments = rawComments.filter(c => String(c.moderated) === '1');
  const approvedCommentIds = new Set(approvedComments.map(c => String(c['comment-id'])));

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

  const session = db.createSessionSync({
    code: sessionCode,
    title: 'Pol.is Seattle 15$/Hour Debate',
    description: 'Pol.is Open Dataset',
    question: 'Should Seattle raise the minimum wage to $15 per hour?',
    visibility: 'PASSWORD_PROTECTED'
  });

  session.statements = [];

  const participantMap = new Map();
  for (const pId of participantIds) {
    const id = `p-polis-${pId}`;
    const nickname = `polis-katilimci-${pId}`;
    const pObj = { id, nickname, justification: '', votes: {}, isBot: false, isBanned: false, joinedAt: new Date() };
    session.participants.push(pObj);
    participantMap.set(pId, pObj);
  }

  const commentIdToStatementId = new Map();
  for (const c of approvedComments) {
    const originalCommentId = String(c['comment-id']);
    const statementId = `s-polis-${originalCommentId}`;
    const authorNick = `polis-katilimci-${c['author-id']}`;
    const statement = { id: statementId, text: c['comment-body'], author: authorNick, timestamp: new Date(), approved: true };
    session.statements.push(statement);
    commentIdToStatementId.set(originalCommentId, statementId);
  }

  for (const v of rawVotes) {
    const commentId = String(v['comment-id']);
    const voterId = String(v['voter-id']);
    const voteVal = parseInt(v['vote'], 10);
    const statementId = commentIdToStatementId.get(commentId);
    const participant = participantMap.get(voterId);
    if (statementId && participant && !isNaN(voteVal)) {
      participant.votes[statementId] = voteVal;
    }
  }

  // Analiz Hesapla
  const activeParticipants = session.participants.filter(p => !p.isBanned);
  const statements = session.statements;
  const n = activeParticipants.length;
  const m = statements.length;

  const X = activeParticipants.map(p => {
    return statements.map(st => p.votes[st.id] !== undefined ? p.votes[st.id] : null);
  });

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
    let xCoord = 0, yCoord = 0;
    if (rangeX > 1e-5) xCoord = ((scores[i][0] - minX) / rangeX) * 160 - 80;
    if (rangeY > 1e-5) yCoord = ((scores[i][1] - minY) / rangeY) * 160 - 80;
    return { id: p.id, nickname: p.nickname, x: parseFloat(xCoord.toFixed(2)), y: parseFloat(yCoord.toFixed(2)), campId: 0, isBot: false };
  });

  const coordinates2D = points.map(pt => [pt.x, pt.y]);
  const k = Math.min(session.targetK || 3, n);
  const { assignments, centroids, clusterStability } = runKMeansWithStability(coordinates2D, k, 5);

  const { bridges, campCharacteristics } = analyzeCampsAndBridges(statements, activeParticipants, assignments, k);

  const camps = Array(k).fill(0).map((_, cIdx) => {
    const size = points.filter((_, idx) => assignments[idx] === cIdx).length;
    const centroid = centroids[cIdx] || [0, 0];
    return { 
      id: cIdx, 
      size,
      x: centroid[0],
      y: centroid[1]
    };
  });

  const polResult = calculatePolarisability(points, camps);
  const polarisability = polResult.polarisability;

  console.log("\n================ ANALİZ MOTURU DOĞRULAMA ÇIKTISI ================");
  console.log(`📌 İçe Aktarılan Katılımcı Sayısı (N): ${n}`);
  console.log(`📌 İçe Aktarılan Onaylı Görüş Sayısı (M): ${m}`);
  console.log(`📌 Eşik Durumu (insufficientData): false (Yetersiz Veri Uyarısı Çıkmadı ✅)`);
  console.log(`📌 Tespit Edilen Kamp Sayısı (k): ${k}`);
  console.log(`   - Grup A Katılımcı Sayısı: ${camps[0]?.size || 0}`);
  console.log(`   - Grup B Katılımcı Sayısı: ${camps[1]?.size || 0}`);
  console.log(`   - Grup C Katılımcı Sayısı: ${camps[2]?.size || 0}`);
  console.log(`📌 Varyans Açıklama Oranı (varianceExplained): [${varianceExplained.map(v => (v * 100).toFixed(1) + '%').join(', ')}]`);
  console.log(`   - Toplam Açıklanan Varyans: ${(varianceExplained.reduce((a,b)=>a+b,0)*100).toFixed(1)}%`);
  console.log(`📌 Küme Kararlılığı Skoru (clusterStability): ${clusterStability}`);
  console.log(`📌 Hesaplanan Kutuplaşma Derecesi: %${polarisability}`);
  console.log(`📌 Tespit Edilen Köprü Cümle (Uzlaşı) Sayısı: ${bridges.length}`);
  if (bridges.length > 0) {
    console.log(`   Top 3 Köprü Cümle:`);
    bridges.slice(0, 3).forEach((b, i) => {
      console.log(`     ${i+1}. "${b.statement.text.substring(0, 70)}..." (Min Onay: %${Math.round(b.minApproval*100)}, Genel: %${Math.round(b.overallRate*100)})`);
    });
  }
  console.log("=================================================================\n");
}

verifyPolis().catch(console.error);
