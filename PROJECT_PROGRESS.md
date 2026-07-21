# ⚖️ Müzakere Masası — Proje İlerleyiş Tarihçesi ve Görev Takibi (PROJECT_PROGRESS.md)

Bu doküman, Müzakere Masası projesinin başlangıçtan itibaren geçirmiş olduğu tüm geliştirme aşamalarını, mimari kararları, eklenen özellikleri ve mevcut durumunu adım adım kayıt altında tutmak amacıyla oluşturulmuştur. Her yeni işlem sonrasında güncellenmeye uygundur.

---

## 📌 Proje Özeti ve Amacı

- **Kuram**: Jürgen Habermas'ın Kamusal Alan ve İdeal Konuşma Durumu teorisi (Eşit katılım, gerekçelendirme, samimiyet).
- **Problem**: Sosyal medya platformlarının uzlaşıyı değil kutuplaşmayı ve çatışmayı ödüllendirmesi. Klasik anketlerin ise "neden" ve "kimlerle birlikte" sorularını ölçememesi.
- **Çözüm**: Katılımcıların kısa görüş yazıp diğer görüşleri oyladığı; oy örüntülerinden PCA + K-Means ile fikir kamplarının (küme) çıkarıldığı ve farklı grupların ortak onayladığı "Köprü Cümleler"in (konsensüs) canlı olarak tespit edildiği dijital müzakere platformu.

---

## 🚀 Aşama 1: Temel Prototip ve Analiz Motoru Kurulumu

- [x] **Backend Altyapısı (Express & Socket.io)**
  - Express.js HTTP REST API sunucusu kuruldu.
  - Socket.io entegrasyonu ile oyların ve yeni fikirlerin tüm istemcilere saniyelik yayınlanması sağlandı.
  - Veritabanı bağlantısı olmasa dahi çalışan In-Memory Data Store (çevrimdışı/demo modu) yedekleme mekanizması geliştirildi.
- [x] **Matematik ve Kümeleme Motoru**
  - Katılımcı oylarının matrix formuna getirilip `ml-pca` ile 2 boyutlu (2D) koordinat düzlemine indirgenmesi.
  - `ml-kmeans` ile 2 boyutlu düzlemdeki katılımcıların oy benzerliklerine göre gruplara (kamplara) ayrılması.
  - **Köprü Cümle Formülü**: Her kampa dahil üyelerin `> %60` onayını alan ve toplam katılımcıların `≥ %30`'u tarafından oylanan cümlelerin süzülmesi.
- [x] **Frontend Arayüzü (React + Vite + Vanilla CSS)**
  - Glassmorphism ve dark mode odaklı, modern visual tasarım sistemi (`index.css`).
  - Google Fonts Outfit tipografisi entegrasyonu.
  - **Katılımcı Masası**: Görüş yazma formu ve `Katılıyorum / Kararsızım / Katılmıyorum` oylama kartları.
  - **Canlı Harita & Uzlaşı Dashboard**: Chart.js 2D Scatter plot ile katılımcıların anlık harita konumları, fikir grupları özetleri ve köprü cümle paneli.
  - **Çalıştırma Scripti**: Paralel başlatma sağlayan `run.ps1` PowerShell scripti.

---

## 🛡️ Aşama 2: Güvenlik, Veri Modeli ve Yönetici Katmanı

- [x] **Prisma & Veritabanı Şeması (`schema.prisma`)**
  - `Admin` modeli eklendi (Email, Bcrypt passwordHash).
  - `Visibility` enum (`PUBLIC`, `PASSWORD_PROTECTED`) tanımlandı.
  - `Session` modeline `visibility`, `passwordHash`, `passwordUpdatedAt` ve `creatorId` alanları eklendi.
  - `prisma/seed.js` scripti ile `admin@muzakere.local` / `admin123` varsayılan admin hesabı oluşturuldu.
- [x] **Güvenlik & Yetkilendirme Middleware'leri (`auth.middleware.js`)**
  - `bcrypt` (cost factor 12) ile güvenli şifre hashleme.
  - `authenticateAdmin`: Platform admin JWT doğrulama (`type:'admin'`).
  - `checkParticipantAccess`: Şifreli oturumlar için `type:'participant_access'` JWT doğrulama ve `passwordUpdatedAt` ile token iptal kontrolü.
  - `passwordRateLimiter`: IP başına 5 başarısız denemede 15 dakika kilit (`express-rate-limit`).
- [x] **Yönetici İşlevleri ve Owner Check**
  - `POST /api/admin/login`: Admin girişi.
  - `POST /api/sessions`: Adminlerin oturum oluşturması.
  - `PATCH /api/sessions/:code/password`: Sadece oturumu oluşturan adminin (`session.creatorId === adminId`) şifre/görünürlük değiştirebilmesi.

---

## 🛠️ Aşama 3: Herkese Açık Oturum Oluşturma & Yerleşik Moderatörlük (Mevcut Aşama)

- [x] **Herkese Açık Oturum Oluşturma Endpoint'i (`POST /api/sessions/create`)**
  - Giriş yapan veya yapmayan herhangi bir kullanıcının başlık, açıklama, rumuz ve Public/Private tercihiyle yeni masa açabilmesi.
  - Benzersiz 6 karakterli oturum kodu (`generateUniqueSessionCode`) üretimi.
  - Oluşturan kullanıcıya özel 24 saat geçerli `type:'moderator'` JWT token'ı verilmesi ve `localStorage` üzerinde `moderator_token_<code>` olarak saklanması.
- [x] **Bypass ve Moderatör Yetkilendirmesi**
  - `checkModerator` middleware'i yazıldı.
  - `checkParticipantAccess` middleware'i, kendi oluşturduğu şifreli oturuma giren moderatörlerin şifre kontrolünü otomatik bypass etmesini sağladı.
  - `PATCH /api/sessions/:code/password` endpoint'i hem platform adminlerini hem de oturum moderatörlerini destekleyecek şekilde güncellendi.
- [x] **Fikir Moderasyon Akışı**
  - `POST /api/sessions/:code/opinion`: Yeni gönderilen görüşler varsayılan olarak `PENDING` durumunda kaydedilir.
  - `PATCH /api/sessions/:code/opinions/:id/status`: Moderatörün görüşleri `APPROVED` veya `REJECTED` olarak işaretlemesi.
  - Katılımcıların yalnızca onaylanan (`APPROVED`) görüşleri oylayabilmesi ve harita analizine sadece onaylı görüşlerin dahil edilmesi.
  - Socket.io `opinion_moderated` olayı ile tüm istemcilerin canlı güncellenmesi.
- [x] **Katılımcı Ekranında Yerleşik Moderatör Paneli**
  - Giriş ekranında "Mevcut Masaya Katıl" ve "Yeni Masa Oluştur" sekmeleri.
  - Moderatör yetkisi olan kullanıcıların Katılımcı Masası sekmesinde beliren Moderatör Kontrol Paneli:
    - **Bekleyen Görüşler Kuyruğu**: Onayla / Reddet butonları.
    - **Masa Erişim Ayarları Formu**: Canlı olarak masa şifresini veya görünürlüğünü değiştirme.

---

## 🧠 Aşama 4: LLM Entegrasyonu, Sonuç Raporu, Docker & Birim Testleri

- [x] **LLM Küme Dili Özeti Servisi (`backend/src/services/llm.service.js`)**
  - `openai` npm paketi ile kurumsal LLM API çağrısı (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_NAME` ortam değişkenleri).
  - Her fikir kümesinin oyladığı görüşlerden 1-2 cümlelik Türkçe grup özeti üretilmesi.
  - Ortam değişkenleri tanımlı değilse veya sunucu erişilemezse otomatik kural tabanlı (rule-based) fallback özetleri.
  - `runAnalysis` fonksiyonuna entegre edildi — küme özetleri artık LLM'den veya fallback'ten geliyor.
- [x] **Sonuç Raporu (JSON Export & Yazdırma Görünümü)**
  - `GET /api/sessions/:code/report` endpoint'i: Oturum özetini, istatistikleri, kampları, köprü cümlelerini ve tüm görüşleri detaylı JSON olarak indirilebilir formatta sunar.
  - Frontend header'a "📄 JSON Rapor" ve "🖨️ Yazdır" butonları eklendi.
  - `@media print` CSS kuralları ile baskıya uygun beyaz-arka planlı, temiz rapor görünümü.
- [x] **Docker Compose PostgreSQL Altyapısı (`docker-compose.yml`)**
  - PostgreSQL 16 Alpine container tanımı, kalıcı volume ile veri koruması.
  - `docker-compose up -d` → `npm run db:push` → `npm run seed` tek adım kurulum akışı.
- [x] **Vitest ile Birim Testleri (`backend/tests/analysis.test.js`)**
  - PCA matris indirgeme testi (4 katılımcı × 3 görüş → 2D koordinat).
  - K-Means kümeleme testi (zıt noktaların farklı kümelere atanması).
  - Köprü Cümle kuralı testi (≥ %30 katılım + her kampta > %60 onay formülü).
  - `npm test` scripti ile `vitest run` otomatik çalıştırma.

---

## 🧪 Test ve Doğrulama Durumu

| Test Adı | Açıklama | Durum |
| :--- | :--- | :--- |
| Public Erişim | PUBLIC oturumlara şifresiz katılım | ✅ BAŞARILI |
| Şifreli Giriş | PASSWORD_PROTECTED oturuma doğru şifre ile katılım | ✅ BAŞARILI |
| Rate Limiting | 5 hatalı şifre denemesinde 15 dk kilitlenme (HTTP 429) | ✅ BAŞARILI |
| Token İptali | Şifre değiştiğinde eski katılımcı token'ının reddedilmesi (HTTP 403) | ✅ BAŞARILI |
| Yerleşik Moderasyon | Moderatörün görüş onaylaması ve canlı oylamaya düşmesi | ✅ BAŞARILI |
| Moderatör Şifre Ayarı | Moderatörün yerleşik panelden masa şifresini değiştirebilmesi | ✅ BAŞARILI |
| Vite / Build | Frontend derleme ve modül dönüşüm kontrolleri (49 modül) | ✅ BAŞARILI |
| Vitest PCA | PCA matris indirgeme birim testi | ✅ BAŞARILI |
| Vitest K-Means | K-Means kümeleme birim testi | ✅ BAŞARILI |
| Vitest Köprü Cümle | Köprü Cümle kuralı doğrulama birim testi | ✅ BAŞARILI |
| Backend Syntax | `node --check index.js` syntax doğrulaması | ✅ BAŞARILI |

---

## 📂 Dosya Yapısı Haritası

- `backend/index.js` — Express REST, Socket.io, LLM entegrasyonu ve rapor endpoint'i.
- `backend/src/middleware/auth.middleware.js` — `authenticateAdmin`, `checkParticipantAccess`, `checkModerator`, `passwordRateLimiter`.
- `backend/src/services/llm.service.js` — OpenAI SDK entegrasyonlu küme özetleyicisi (fallback destekli).
- `backend/tests/analysis.test.js` — Vitest birim testleri (PCA, K-Means, Köprü Cümle).
- `backend/prisma/schema.prisma` — Veri modeli şeması.
- `docker-compose.yml` — PostgreSQL 16 container tanımı.
- `frontend/src/App.jsx` — Ana React bileşeni (Moderatör Paneli, Rapor butonları dahil).
- `frontend/src/index.css` — Tasarım sistemi, Glassmorphism ve `@media print` stilleri.
- `run.ps1` — Tek tıkla backend + frontend başlatma scripti.
