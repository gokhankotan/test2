/**
 * Müzakere Masası - Express & Socket.io Sunucusu
 * Gerçek zamanlı senkronizasyon, API uç noktaları, LLM entegrasyonu ve çoklu oturum desteği sağlar.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

import { db } from './database.js';
import { calculatePCA, calculateKMeans, analyzeCampsAndBridges } from './algorithms.js';
import { authenticateAdmin, passwordRateLimiter, checkParticipantAccess, checkModerator } from './middleware/auth.middleware.js';
import { generateClusterSummary } from './services/llm.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'kamusal_alan_gizli_anahtar';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// API: Giriş ve Rapor Çıktısı

// 1. Admin Girişi
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  const adminEmail = email || 'admin@muzakere.local';

  try {
    let admin = null;
    if (db.isPrismaActive) {
      admin = await db.prisma.admin.findUnique({ where: { email: adminEmail } });
    } else if (adminEmail === 'admin@muzakere.local') {
      // Çevrimdışı modda fallback
      const hash = await bcrypt.hash('admin123', 12);
      admin = { email: 'admin@muzakere.local', passwordHash: hash };
    }

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Geçersiz e-posta veya şifre.' });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Geçersiz e-posta veya şifre.' });
    }

    const token = jwt.sign({ 
      type: 'admin', 
      email: admin.email, 
      id: admin.id || 'offline-admin-id' 
    }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Admin Oturum Oluşturma
app.post('/api/sessions', authenticateAdmin, async (req, res) => {
  const { title, description, question, visibility, password } = req.body;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    let passwordHash = null;
    if (visibility === 'PASSWORD_PROTECTED' && password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    const session = db.createSessionSync({
      code,
      title,
      description,
      question,
      visibility,
      passwordHash,
      creatorId: req.admin.id
    });

    res.status(201).json({ success: true, code: session.code, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Herkese Açık / Şifreli Oturum Oluşturma & Yerleşik Moderatörlük
app.post('/api/sessions/create', async (req, res) => {
  const { title, description, question, visibility, password, nickname } = req.body;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    let passwordHash = null;
    if (visibility === 'PASSWORD_PROTECTED' && password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    // Oturumu oluştur
    const session = db.createSessionSync({
      code,
      title,
      description,
      question,
      visibility,
      passwordHash,
      creatorId: null
    });

    // Oluşturan kullanıcıyı ilk katılımcı ve moderatör yapalım
    const creatorNickname = nickname || 'Moderatör';
    const participant = db.addParticipant(code, creatorNickname, 'Masayı kuran moderatör.');

    // 24 saat geçerli moderatör token'ı
    const moderatorToken = jwt.sign({
      type: 'moderator',
      sessionCode: code,
      nickname: creatorNickname,
      participantId: participant.id
    }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      success: true,
      code,
      moderatorToken,
      participant,
      session
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Şifreli Oturuma Giriş / Token Alma
app.post('/api/sessions/:code/join', passwordRateLimiter, async (req, res) => {
  const { code } = req.params;
  const { password } = req.body;
  const upperCode = code.toUpperCase();

  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    if (session.visibility === 'PUBLIC') {
      const accessToken = jwt.sign({ type: 'participant_access', sessionCode: upperCode }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ success: true, accessToken });
    }

    if (!password) {
      return res.status(400).json({ success: false, message: 'Bu masa şifrelidir. Şifre girmelisiniz.' });
    }

    const isMatch = await bcrypt.compare(password, session.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Hatalı şifre.' });
    }

    const accessToken = jwt.sign({ type: 'participant_access', sessionCode: upperCode }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, accessToken });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Oturum Ayarları (Şifre ve Görünürlük Değiştirme)
app.patch('/api/sessions/:code/password', async (req, res) => {
  const { code } = req.params;
  const { password, visibility } = req.body;
  const authHeader = req.headers.authorization;
  const upperCode = code.toUpperCase();

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Yetkilendirme token\'ı bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    let authorized = false;

    if (decoded.type === 'admin') {
      if (session.creatorId === decoded.id || !session.creatorId) {
        authorized = true;
      }
    } else if (decoded.type === 'moderator') {
      if (decoded.sessionCode === upperCode) {
        authorized = true;
      }
    }

    if (!authorized) {
      return res.status(403).json({ success: false, message: 'Bu oturumun şifresini değiştirmek için yetkiniz yok.' });
    }

    let newPasswordHash = session.passwordHash;
    if (visibility === 'PASSWORD_PROTECTED' && password) {
      newPasswordHash = await bcrypt.hash(password, 12);
    } else if (visibility === 'PUBLIC') {
      newPasswordHash = null;
    }

    db.updateSessionPassword(upperCode, newPasswordHash, visibility);
    io.to(`session-${upperCode}`).emit('session-settings-updated', { visibility });

    res.json({ success: true, message: 'Oturum erişim ayarları başarıyla güncellendi.' });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Geçersiz yetki token\'ı.' });
  }
});

// 6. Görüş Gönderme (HTTP API)
app.post('/api/sessions/:code/opinion', checkParticipantAccess, async (req, res) => {
  const { code } = req.params;
  const { text, author, isBot } = req.body;
  const upperCode = code.toUpperCase();

  if (!text) {
    return res.status(400).json({ success: false, message: 'Görüş metni gereklidir.' });
  }

  try {
    const statement = db.addStatement(upperCode, text, author, false, !!isBot);
    const session = db.getSessionSync(upperCode);
    
    // Moderatör odasına kuyruk güncellemesi gönder
    io.to(`moderator-${upperCode}`).emit('moderation-queue', session.moderationQueue);

    res.status(201).json({ success: true, message: 'Görüşünüz moderasyon kuyruğuna alındı.', statement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Görüş Moderasyon Durumu Değiştirme (HTTP API)
app.patch('/api/sessions/:code/opinions/:id/status', checkModerator, async (req, res) => {
  const { code, id } = req.params;
  const { status } = req.body; // APPROVED veya REJECTED
  const upperCode = code.toUpperCase();

  try {
    const session = db.getSessionSync(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    let statement = null;
    if (status === 'APPROVED') {
      statement = db.approveStatement(upperCode, id);
    } else if (status === 'REJECTED') {
      statement = db.rejectStatement(upperCode, id);
    } else {
      return res.status(400).json({ success: false, message: 'Geçersiz statü değeri.' });
    }

    if (!statement) {
      return res.status(404).json({ success: false, message: 'Görüş bulunamadı veya zaten işlendi.' });
    }

    // Moderatörlere güncel kuyruğu gönder
    io.to(`moderator-${upperCode}`).emit('moderation-queue', session.moderationQueue);

    if (status === 'APPROVED') {
      // Tüm odaya yeni oylanabilir görüşü bildir
      io.to(`session-${upperCode}`).emit('new-statement', statement);
      // Analizi tetikle
      runAndBroadcastAnalysis(upperCode);
    }

    // Canlı oylama güncellemesi için yayın
    io.to(`session-${upperCode}`).emit('opinion_moderated', { id, status, statement });

    res.json({ success: true, statement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Sonuç Raporu (JSON)
app.get('/api/sessions/:code/report', async (req, res) => {
  const { code } = req.params;
  const upperCode = code.toUpperCase();

  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    res.json({
      code: session.code,
      title: session.title,
      description: session.description,
      question: session.question,
      createdAt: session.createdAt,
      participantsCount: session.participants.length,
      statementsCount: session.statements.length,
      statements: session.statements,
      analysis: session.analysis,
      participants: session.participants.map(p => ({
        nickname: p.nickname,
        justification: p.justification,
        votesCount: Object.keys(p.votes).length,
        isBot: !!p.isBot
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Geriye dönük uyumluluk için eski rapor endpoint'i
app.get('/api/session/report', (req, res) => {
  res.redirect('/api/sessions/DEFAULT/report');
});

// Statik Dosyaları Sunma
const clientDistPath = path.join(__dirname, '../dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  if (!req.url.startsWith('/api') && !req.url.startsWith('/socket.io')) {
    res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
      if (err) {
        res.status(200).send(`
          <html>
            <head><title>Müzakere Masası</title><style>body{background:#111;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}</style></head>
            <body>
              <div style="text-align:center;">
                <h2>Müzakere Masası Sunucusu Çalışıyor</h2>
                <p>Frontend dosyaları henüz derlenmemiş. Geliştirme modu için lütfen <code>npm run dev</code> çalıştırın.</p>
              </div>
            </body>
          </html>
        `);
      }
    });
  }
});

// Analiz Hesaplama ve Yayınlama Mantığı (Oturum Bazında Debounced)
const activeDebouncers = new Map();
const ANALYSIS_COOLDOWN = 1500; // Milisaniye

function runAndBroadcastAnalysis(sessionCode) {
  if (!activeDebouncers.has(sessionCode)) {
    activeDebouncers.set(sessionCode, { pending: false, lastRun: 0 });
  }
  const state = activeDebouncers.get(sessionCode);
  const now = Date.now();
  const timeSinceLast = now - state.lastRun;

  if (timeSinceLast < ANALYSIS_COOLDOWN) {
    if (!state.pending) {
      state.pending = true;
      setTimeout(() => {
        state.pending = false;
        performAnalysis(sessionCode);
      }, ANALYSIS_COOLDOWN - timeSinceLast);
    }
    return;
  }

  performAnalysis(sessionCode);
}

async function performAnalysis(sessionCode) {
  const session = db.getSessionSync(sessionCode);
  if (!session) return;

  const participants = session.participants;
  const statements = session.statements;
  
  const n = participants.length;
  const m = statements.length;

  const state = activeDebouncers.get(sessionCode);
  if (state) state.lastRun = Date.now();

  // Yeterli veri yoksa boş sonuç gönder
  if (n < 3 || m < 2) {
    const emptyAnalysis = {
      points: participants.map(p => ({ id: p.id, nickname: p.nickname, x: 0, y: 0, campId: 0, isBot: !!p.isBot })),
      camps: [
        { id: 0, name: "Ortak Alan", size: n, x: 0, y: 0, topStatements: [], summary: "Yeterli katılım sağlandığında fikir grupları burada analiz edilecektir." }
      ],
      bridges: [],
      polarisability: 0
    };
    db.updateAnalysis(sessionCode, emptyAnalysis);
    io.to(`session-${sessionCode}`).emit('analysis-update', emptyAnalysis);
    return;
  }

  // 1. Oy matrisini oluştur
  const X = participants.map(p => {
    return statements.map(st => p.votes[st.id] !== undefined ? p.votes[st.id] : 0);
  });

  // 2. PCA Koordinatlarını hesapla
  const { scores } = calculatePCA(X, 2);

  // Koordinatları görselleştirme için normalize et (-80 ile 80 arasına çek)
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

  const points = participants.map((p, i) => {
    let xCoord = 0;
    let yCoord = 0;
    
    if (rangeX > 1e-5) xCoord = ((scores[i][0] - minX) / rangeX) * 160 - 80;
    if (rangeY > 1e-5) yCoord = ((scores[i][1] - minY) / rangeY) * 160 - 80;

    return {
      id: p.id,
      nickname: p.nickname,
      x: parseFloat(xCoord.toFixed(2)),
      y: parseFloat(yCoord.toFixed(2)),
      campId: 0, // K-Means ile doldurulacak
      isBot: !!p.isBot
    };
  });

  // 3. K-Means ile 3 Gruba Kümele
  const coordinates2D = points.map(pt => [pt.x, pt.y]);
  const k = Math.min(3, n);
  const { assignments, centroids } = calculateKMeans(coordinates2D, k);

  points.forEach((pt, idx) => {
    pt.campId = assignments[idx];
  });

  // 4. Köprü Cümleleri ve Kamp Ayırt Edici Özellikleri Analizi
  const { bridges, campCharacteristics } = analyzeCampsAndBridges(statements, participants, assignments, k);

  // 5. Kampları Detaylandır (LLM Entegrasyonu ile)
  const camps = await Promise.all(Array(k).fill(0).map(async (_, cIdx) => {
    const size = points.filter(pt => pt.campId === cIdx).length;
    const centroid = centroids[cIdx] || [0, 0];
    
    let name = `Grup ${String.fromCharCode(65 + cIdx)}`;
    const characteristics = campCharacteristics[cIdx] || [];
    if (characteristics.length > 0) {
      const bestText = characteristics[0].statement.text;
      const cleanWordList = bestText.split(" ").slice(0, 3).join(" ");
      name = `"${cleanWordList}..." Taraftarları`;
    }

    const topStatements = characteristics.map(c => ({
      text: c.statement.text,
      approvalRate: Math.round(c.approvalRate * 100),
      contrastScore: parseFloat(c.contrastScore.toFixed(2))
    }));

    // LLM ile Türkçe grup özeti al
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

  // Kutuplaşma Derecesini (Polarisability) hesapla
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

  const analysis = {
    points,
    camps,
    bridges: bridges.map(b => ({
      id: b.statement.id,
      text: b.statement.text,
      minApproval: Math.round(b.minApproval * 100),
      overallRate: Math.round(b.overallRate * 100),
      campApprovalRates: b.campApprovalRates.map(r => Math.round(r * 100))
    })),
    polarisability
  };

  db.updateAnalysis(sessionCode, analysis);
  io.to(`session-${sessionCode}`).emit('analysis-update', analysis);
}

// Socket.io Bağlantı Kontrolleri
io.on('connection', (socket) => {
  console.log(`Yeni bağlantı: ${socket.id}`);

  // Geriye dönük uyumluluk için varsayılan session durumunu gönder
  const defaultSession = db.session;
  socket.emit('session-state', {
    question: defaultSession.question,
    status: defaultSession.status,
    statements: defaultSession.statements,
    analysis: defaultSession.analysis,
    participantsCount: defaultSession.participants.length
  });

  // Odaya Katılma
  socket.on('join-session', ({ sessionCode }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    socket.join(`session-${code}`);

    const session = db.getSessionSync(code);
    if (!session) {
      return callback && callback({ success: false, message: 'Oturum bulunamadı.' });
    }

    socket.emit('session-state', {
      question: session.question,
      status: session.status,
      statements: session.statements,
      analysis: session.analysis,
      participantsCount: session.participants.length
    });

    if (callback) callback({ success: true });
  });

  // Admin Odasına Katılma
  socket.on('admin-join', ({ sessionCode } = {}) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    socket.join(`moderator-${code}`);
    
    const session = db.getSessionSync(code);
    if (session) {
      socket.emit('moderation-queue', session.moderationQueue);
    }
  });

  // Katılımcı Kayıt
  socket.on('register-participant', ({ sessionCode, nickname, justification }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    try {
      const participant = db.addParticipant(code, nickname, justification);
      callback({ success: true, participantId: participant.id, nickname: participant.nickname });
      
      // Moderatörlere bildir
      io.to(`moderator-${code}`).emit('participant-joined', {
        id: participant.id,
        nickname: participant.nickname,
        justification: participant.justification
      });

      const session = db.getSessionSync(code);
      io.to(`session-${code}`).emit('stats-update', { participantsCount: session.participants.length });

      runAndBroadcastAnalysis(code);
    } catch (err) {
      callback({ success: false, message: err.message || 'Kayıt sırasında hata oluştu' });
    }
  });

  // Görüş Ekleme (Socket fallback - HTTP API tercih edilir)
  socket.on('submit-statement', ({ sessionCode, participantId, text }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    const session = db.getSessionSync(code);
    if (!session) {
      return callback({ success: false, message: 'Oturum bulunamadı.' });
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      return callback({ success: false, message: 'Geçersiz katılımcı kimliği' });
    }

    db.addStatement(code, text, participant.nickname, false);
    callback({ success: true, message: 'Görüşünüz moderasyon kuyruğuna alındı' });

    io.to(`moderator-${code}`).emit('moderation-queue', session.moderationQueue);
  });

  // Oy Verme
  socket.on('submit-vote', ({ sessionCode, participantId, statementId, voteValue }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    const success = db.castVote(code, participantId, statementId, voteValue);
    
    if (success) {
      if (callback) callback({ success: true });
      runAndBroadcastAnalysis(code);
    } else {
      if (callback) callback({ success: false, message: 'Oy kaydedilemedi' });
    }
  });

  // --- ADMIN/MODERATÖR SOCKET İŞLEMLERİ ---
  
  // Görüş Onaylama
  socket.on('admin-approve-statement', ({ sessionCode, statementId }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    const statement = db.approveStatement(code, statementId);
    
    if (statement) {
      const session = db.getSessionSync(code);
      io.to(`moderator-${code}`).emit('moderation-queue', session.moderationQueue);
      io.to(`session-${code}`).emit('new-statement', statement);
      runAndBroadcastAnalysis(code);
    }
  });

  // Görüş Reddetme
  socket.on('admin-reject-statement', ({ sessionCode, statementId }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    const statement = db.rejectStatement(code, statementId);
    
    if (statement) {
      const session = db.getSessionSync(code);
      io.to(`moderator-${code}`).emit('moderation-queue', session.moderationQueue);
    }
  });

  // Soru Güncelleme
  socket.on('admin-update-question', ({ sessionCode, newQuestion }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    db.updateSessionQuestion(code, newQuestion);
    io.to(`session-${code}`).emit('question-updated', newQuestion);
  });

  // Simülasyon Çalıştırma (Katılımcı Yük Testi)
  socket.on('admin-run-simulation', ({ sessionCode, count }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    try {
      db.simulateBots(code, count);
      const session = db.getSessionSync(code);

      callback({ success: true, message: `${count} adet simüle katılımcı başarıyla oy verdi.` });
      
      io.to(`session-${code}`).emit('stats-update', { participantsCount: session.participants.length });
      performAnalysis(code); // Debounce beklemeden doğrudan çalıştır
    } catch (err) {
      callback({ success: false, message: `Simülasyon hatası: ${err.message}` });
    }
  });

  // Oturumu Sıfırlama
  socket.on('admin-reset-session', ({ sessionCode }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    try {
      db.reset(code);
      const session = db.getSessionSync(code);

      io.to(`session-${code}`).emit('session-reset', {
        question: session.question,
        status: session.status,
        statements: session.statements,
        analysis: session.analysis,
        participantsCount: session.participants.length
      });

      io.to(`moderator-${code}`).emit('moderation-queue', session.moderationQueue);
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Bağlantı kesildi: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} portunda çalışıyor.`);
});
