import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { db } from '../database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'kamusal_alan_gizli_anahtar';

// 1. Admin yetkilendirme middleware'i
export function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Yetkisiz erişim: Token bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Erişim reddedildi: Admin yetkisi gerekiyor.' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Geçersiz veya süresi dolmuş token.' });
  }
}

// 2. Şifreli oturum giriş denemeleri için hız sınırlayıcı (Rate Limiter)
// IP başına 5 başarısız denemede 15 dakika kilit
export const passwordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 5,
  message: {
    success: false,
    message: 'Çok fazla hatalı şifre denemesi yaptınız. Güvenliğiniz için 15 dakika kilitlendiniz.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Sadece başarısız giriş denemelerini saymak için, 200 OK dışındaki durumları limitleyebiliriz veya basitçe tüm istekleri limitleyebiliriz.
  // Giriş endpoint'inde rate limiter'ı doğrudan kullanacağımız için, oraya yapılan istek sayısını sınırlamak en garantisidir.
  skipSuccessfulRequests: true // Başarılı girişler limiti etkilemesin
});

// 3. Katılımcı oturum erişim kontrolü (Public / Şifreli)
export async function checkParticipantAccess(req, res, next) {
  const code = req.params.code || req.body.sessionCode || req.query.sessionCode;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Oturum kodu belirtilmedi.' });
  }

  const session = await db.getSessionByCode(code);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
  }

  // Oturum PUBLIC ise doğrudan geçişe izin ver
  if (session.visibility === 'PUBLIC') {
    return next();
  }

  // Oturum PASSWORD_PROTECTED ise token'ları kontrol et
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Bu masaya erişmek için şifre veya oturum yetkisi gerekiyor.', passwordRequired: true });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Senaryo A: Moderatör token'ı (Şifreyi bypass eder)
    if (decoded.type === 'moderator' && decoded.sessionCode === code) {
      req.moderator = decoded;
      return next();
    }

    // Senaryo B: Katılımcı erişim token'ı
    if (decoded.type === 'participant_access' && decoded.sessionCode === code) {
      // Şifre güncellenmişse eski token'ları iptal et
      if (session.passwordUpdatedAt) {
        const passwordUpdatedTime = Math.floor(new Date(session.passwordUpdatedAt).getTime() / 1000);
        if (decoded.iat < passwordUpdatedTime) {
          return res.status(403).json({ 
            success: false, 
            message: 'Oturum şifresi değiştirildi. Lütfen yeni şifreyi girin.', 
            passwordRequired: true 
          });
        }
      }
      req.participantAccess = decoded;
      return next();
    }

    return res.status(403).json({ success: false, message: 'Geçersiz oturum token türü.', passwordRequired: true });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Oturum süresi doldu veya geçersiz token.', passwordRequired: true });
  }
}

// 4. Moderatör yetki kontrolü
export async function checkModerator(req, res, next) {
  const code = req.params.code || req.body.sessionCode;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Oturum kodu belirtilmedi.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Moderatör yetkisi bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'moderator' || decoded.sessionCode !== code) {
      return res.status(403).json({ success: false, message: 'Yetkisiz işlem: Sadece bu masanın moderatörü işlem yapabilir.' });
    }
    req.moderator = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Geçersiz veya süresi dolmuş moderatör token.' });
  }
}
