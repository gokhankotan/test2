import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

function debugParticipants() {
  const datasetPath = './polis-data/15-per-hour-seattle';
  const commentsFilePath = path.join(datasetPath, 'comments.csv');
  const votesFilePath = path.join(datasetPath, 'votes.csv');

  const rawComments = parse(fs.readFileSync(commentsFilePath, 'utf8'), { columns: true, skip_empty_lines: true });
  const rawVotes = parse(fs.readFileSync(votesFilePath, 'utf8'), { columns: true, skip_empty_lines: true });

  const approvedComments = rawComments.filter(c => String(c.moderated) === '1');
  const approvedCommentIds = new Set(approvedComments.map(c => String(c['comment-id'])));

  // Yöntem A: Scriptimizin kullandığı yöntem
  const participantIdsScript = new Set();
  approvedComments.forEach(c => {
    if (c['author-id'] !== undefined && c['author-id'] !== null && c['author-id'] !== '') {
      participantIdsScript.add(String(c['author-id']));
    }
  });

  rawVotes.forEach(v => {
    if (approvedCommentIds.has(String(v['comment-id']))) {
      if (v['voter-id'] !== undefined && v['voter-id'] !== null && v['voter-id'] !== '') {
        participantIdsScript.add(String(v['voter-id']));
      }
    }
  });

  // Yöntem B: Tüm ham oylar üzerinden (onay şartı aramadan) voter-id ve author-id toplama
  const allVoterIdsInVotesCsv = new Set();
  rawVotes.forEach(v => {
    if (v['voter-id'] !== undefined && v['voter-id'] !== null && v['voter-id'] !== '') {
      allVoterIdsInVotesCsv.add(String(v['voter-id']));
    }
  });

  const allAuthorIdsInCommentsCsv = new Set();
  rawComments.forEach(c => {
    if (c['author-id'] !== undefined && c['author-id'] !== null && c['author-id'] !== '') {
      allAuthorIdsInCommentsCsv.add(String(c['author-id']));
    }
  });

  const allCombinedRawIds = new Set([...allVoterIdsInVotesCsv, ...allAuthorIdsInCommentsCsv]);

  console.log(`📌 Script Yöntemiyle Bulunan Katılımcı Sayısı: ${participantIdsScript.size}`);
  console.log(`📌 votes.csv İçindeki Tüm voter-id Sayısı (Tüm Oylar): ${allVoterIdsInVotesCsv.size}`);
  console.log(`📌 comments.csv İçindeki Tüm author-id Sayısı: ${allAuthorIdsInCommentsCsv.size}`);
  console.log(`📌 Ham Veri Kümesi Birleşimi (Tüm Yazar + Tüm Oy Veren): ${allCombinedRawIds.size}`);

  // Farkı bulalım
  const missingInScript = [...allCombinedRawIds].filter(id => !participantIdsScript.has(id));
  console.log(`\n🔍 Script'e Girmeyen ID'ler (${missingInScript.length} adet):`, missingInScript);

  missingInScript.forEach(id => {
    const commentsByAuthor = rawComments.filter(c => String(c['author-id']) === id);
    const votesByVoter = rawVotes.filter(v => String(v['voter-id']) === id);

    console.log(`\n--- Teşhis Detayı ID: ${id} ---`);
    console.log(`Yazdığı Yorum Sayısı: ${commentsByAuthor.length}`);
    if (commentsByAuthor.length > 0) {
      commentsByAuthor.forEach(c => {
        console.log(`  - Comment ID: ${c['comment-id']}, moderated: ${c.moderated}, text: "${c['comment-body']}"`);
      });
    }
    console.log(`Kullandığı Oy Sayısı: ${votesByVoter.length}`);
    if (votesByVoter.length > 0) {
      votesByVoter.forEach(v => {
        const isApprovedComment = approvedCommentIds.has(String(v['comment-id']));
        console.log(`  - Vote on comment ${v['comment-id']} (Onaylı Görüş mü?: ${isApprovedComment}), Vote Val: ${v.vote}`);
      });
    }
  });
}

debugParticipants();
