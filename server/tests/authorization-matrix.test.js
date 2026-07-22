import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifySessionToken, isSessionOwner, requireSessionOwnership } from '../middleware/auth.middleware.js';
import { db } from '../database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'kamusal_alan_gizli_anahtar';

describe('Yetkilendirme Matrisi (Authorization Matrix) Testleri', () => {
  let admin1, admin2;
  let sessionAdmin1, sessionPublic;
  let admin1Token, admin2Token;
  let modAdmin1Token, modPublicToken;

  beforeEach(async () => {
    // Database'i initialize et
    await db.initialized;
    
    // Test verilerini hazırla
    admin1 = { id: 'admin-1-id', email: 'admin1@muzakere.local', username: 'admin1' };
    admin2 = { id: 'admin-2-id', email: 'admin2@muzakere.local', username: 'admin2' };

    // DB'deki in-memory listeleri temizleyelim/mock edelim
    db.sessions.clear();

    // Admin 1 tarafından oluşturulmuş oturum
    sessionAdmin1 = {
      id: 'session-admin1-id',
      code: 'ADM1S',
      title: 'Admin 1 Session',
      question: 'Question 1',
      creatorId: admin1.id,
      participants: [],
      statements: [],
      moderationQueue: [],
      analysis: null
    };
    db.sessions.set(sessionAdmin1.code, sessionAdmin1);

    // Herkese açık oluşturulmuş oturum (creatorId null)
    sessionPublic = {
      id: 'session-public-id',
      code: 'PUBS',
      title: 'Public Session',
      question: 'Question 2',
      creatorId: null,
      participants: [],
      statements: [],
      moderationQueue: [],
      analysis: null
    };
    db.sessions.set(sessionPublic.code, sessionPublic);

    // JWT token'ları üret
    admin1Token = jwt.sign({ type: 'admin', email: admin1.email, username: admin1.username, id: admin1.id }, JWT_SECRET);
    admin2Token = jwt.sign({ type: 'admin', email: admin2.email, username: admin2.username, id: admin2.id }, JWT_SECRET);

    modAdmin1Token = jwt.sign({ type: 'moderator', sessionCode: sessionAdmin1.code }, JWT_SECRET);
    modPublicToken = jwt.sign({ type: 'moderator', sessionCode: sessionPublic.code }, JWT_SECRET);
  });

  describe('isSessionOwner fonksiyonu sahiplik kontrolü', () => {
    it('Admin 1 kendi oturumunun sahibidir', () => {
      const decoded = jwt.verify(admin1Token, JWT_SECRET);
      expect(isSessionOwner(decoded, sessionAdmin1)).toBe(true);
    });

    it('Admin 2 Admin 1 oturumunun sahibi DEĞİLDİR', () => {
      const decoded = jwt.verify(admin2Token, JWT_SECRET);
      expect(isSessionOwner(decoded, sessionAdmin1)).toBe(false);
    });

    it('Admin 1 herkese açık (public) oturumun sahibi DEĞİLDİR', () => {
      const decoded = jwt.verify(admin1Token, JWT_SECRET);
      expect(isSessionOwner(decoded, sessionPublic)).toBe(false);
    });

    it('sessionAdmin1 moderatörü kendi oturumunun sahibidir', () => {
      const decoded = jwt.verify(modAdmin1Token, JWT_SECRET);
      expect(isSessionOwner(decoded, sessionAdmin1)).toBe(true);
    });

    it('sessionPublic moderatörü kendi oturumunun sahibidir', () => {
      const decoded = jwt.verify(modPublicToken, JWT_SECRET);
      expect(isSessionOwner(decoded, sessionPublic)).toBe(true);
    });

    it('sessionAdmin1 moderatörü public oturumun sahibi DEĞİLDİR', () => {
      const decoded = jwt.verify(modAdmin1Token, JWT_SECRET);
      expect(isSessionOwner(decoded, sessionPublic)).toBe(false);
    });
  });

  describe('requireSessionOwnership middleware testleri', () => {
    it('Sahip Admin için middleware next() çağırmalıdır', async () => {
      const req = {
        params: { code: 'ADM1S' },
        headers: { authorization: `Bearer ${admin1Token}` }
      };
      let nextCalled = false;
      const res = {};
      const next = () => { nextCalled = true; };

      await requireSessionOwnership(req, res, next);
      expect(nextCalled).toBe(true);
      expect(req.decoded.id).toBe(admin1.id);
    });

    it('Sahip olmayan Admin için middleware 403 dönmelidir', async () => {
      const req = {
        params: { code: 'ADM1S' },
        headers: { authorization: `Bearer ${admin2Token}` }
      };
      let statusValue = null;
      let jsonMessage = null;
      const res = {
        status(code) {
          statusValue = code;
          return {
            json(data) {
              jsonMessage = data;
            }
          };
        }
      };
      const next = () => {};

      await requireSessionOwnership(req, res, next);
      expect(statusValue).toBe(403);
      expect(jsonMessage.success).toBe(false);
    });

    it('Sahip olan Moderator için middleware next() çağırmalıdır', async () => {
      const req = {
        params: { code: 'PUBS' },
        headers: { authorization: `Bearer ${modPublicToken}` }
      };
      let nextCalled = false;
      const res = {};
      const next = () => { nextCalled = true; };

      await requireSessionOwnership(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it('Yanlış Moderator için middleware 403 dönmelidir', async () => {
      const req = {
        params: { code: 'PUBS' },
        headers: { authorization: `Bearer ${modAdmin1Token}` }
      };
      let statusValue = null;
      const res = {
        status(code) {
          statusValue = code;
          return { json() {} };
        }
      };
      const next = () => {};

      await requireSessionOwnership(req, res, next);
      expect(statusValue).toBe(403);
    });
  });

  describe('Oturum Durumu Güncelleme (Pause/Play) Oversight yetkisi', () => {
    const checkOversightAuth = (token, sessionCode) => {
      const authResult = verifySessionToken(token, sessionCode);
      if (!authResult.isValid) return false;
      return authResult.type === 'admin' || authResult.type === 'moderator';
    };

    it('Herhangi bir admin (Admin 2) Admin 1 oturumunun durumunu güncelleyebilir (Oversight)', () => {
      const allowed = checkOversightAuth(admin2Token, sessionAdmin1.code);
      expect(allowed).toBe(true);
    });

    it('Oturumun moderatörü oturum durumunu güncelleyebilir', () => {
      const allowed = checkOversightAuth(modAdmin1Token, sessionAdmin1.code);
      expect(allowed).toBe(true);
    });

    it('Farklı bir oturumun moderatörü bu oturumun durumunu GÜNCELLEYEMEZ', () => {
      const allowed = checkOversightAuth(modPublicToken, sessionAdmin1.code);
      expect(allowed).toBe(false);
    });
  });

  describe('Sorun 1 Regresyonu: Şifre değiştikten sonra eski tokenın reddedilmesi', () => {
    it('Şifre değiştikten sonra oluşturulan eski iat değerine sahip katılımcı tokenı reddedilmelidir', () => {
      const oldIat = 1000;
      const oldToken = jwt.sign({
        type: 'participant_access',
        sessionCode: 'ADM1S',
        iat: oldIat
      }, JWT_SECRET);

      const session = db.getSessionSync('ADM1S');
      session.passwordUpdatedAt = new Date(1500 * 1000);

      const authResult = verifySessionToken(oldToken, 'ADM1S');
      expect(authResult.isValid).toBe(false);
      expect(authResult.reason).toBe('PASSWORD_CHANGED');
    });
  });

  describe('Sorun 2 Regresyonu: Kick sonrası onaylı görüşlerin korunması', () => {
    it('Bir katılımcı engellendiğinde PENDING görüşleri silinmeli, ancak APPROVED görüşleri korunmalıdır', () => {
      const session = db.getSessionSync('ADM1S');
      session.statements = [];
      session.moderationQueue = [];
      session.participants = [];
      
      const participantId = 'test-participant-id';
      const participant = {
        id: participantId,
        nickname: 'Sorunlu Katılımcı',
        justification: 'Gerekçe açıklaması...',
        isBot: false,
        isBanned: false,
        votes: {}
      };
      session.participants.push(participant);

      const opinionPending = {
        id: 'op-pending-id',
        author: participant.nickname,
        text: 'Bu bir bekleyen görüş.',
        status: 'PENDING'
      };
      const opinionApproved = {
        id: 'op-approved-id',
        author: participant.nickname,
        text: 'Bu bir onaylı görüş.',
        status: 'APPROVED'
      };

      session.moderationQueue.push(opinionPending);
      session.statements.push(opinionApproved);

      const success = db.kickParticipant('ADM1S', participantId);
      expect(success).toBe(true);

      expect(participant.isBanned).toBe(true);
      const hasPending = session.moderationQueue.some(o => o.id === 'op-pending-id');
      expect(hasPending).toBe(false);
      const hasApproved = session.statements.some(o => o.id === 'op-approved-id');
      expect(hasApproved).toBe(true);
    });
  });
});
