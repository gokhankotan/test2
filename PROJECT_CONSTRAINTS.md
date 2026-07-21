# PROJECT_CONSTRAINTS.md — Müzakere Masası

> Bu dosya, Antigravity (ve her ajan oturumu) için bağlayıcı proje kısıtlarını içerir.
> Herhangi bir görev verilmeden önce bu dosya referans gösterilmelidir.
> Buradaki kararlar bilinçli tercihlerdir — "daha iyi" bir alternatif önerilse bile
> sapmadan önce insan onayı gerekir.

## 1. Teknoloji Yığını (Değiştirilemez — Onaysız Sapma Yok)

| Katman | Karar | Kesinlikle Kullanılmayacak |
|---|---|---|
| Backend | Node.js + Express | — |
| Gerçek zamanlı iletişim | Socket.io | Ham WebSocket API, ham `ws` kütüphanesi |
| ORM | Prisma | TypeORM, Sequelize, raw SQL |
| Veritabanı | **PostgreSQL** (Docker container, `docker-compose.yml` ile), baştan itibaren | SQLite (geliştirme dahil hiçbir aşamada kullanılmayacak) |
| Analiz motoru (PCA/Kümeleme) | Saf JS/TS: `ml-pca`, `ml-kmeans` | **Python, scikit-learn, herhangi bir Python mikroservisi** |
| LLM entegrasyonu | Kurumun kendi eğittiği model, OpenAI-uyumlu API üzerinden (`openai` npm paketi, `baseURL` kurumun endpoint'ine yönlendirilmiş) | **Gemini API, Claude API, OpenAI'ın kendi bulut servisi** — bunlar kullanılmayacak, sadece kurum içi endpoint'e bağlanılacak |
| Frontend | React 18 + Vite 5, state tabanlı routing (react-router-dom yerine `role` state'i ile görünüm değişimi — mevcut kod tabanının konvansiyonu, değiştirilmeyecek) | Next.js, Vue, Svelte |
| Görselleştirme | Chart.js / react-chartjs-2 (veya mevcut kod tabanındaki özel Canvas/SVG tabanlı 2D scatter — hangisi kullanılıyorsa o korunacak) | **D3.js kullanılmayacak** |
| Stil | Vanilla CSS, glassmorphism (mevcut kod tabanında zaten uygulanmış — bkz. madde 3 notu) | Yeni bir CSS framework/kütüphane eklenmeyecek |
| Kimlik doğrulama (admin) | JWT + bcrypt, **çoklu admin modeli** (`Admin` tablosu) | OAuth, harici auth sağlayıcı, kurumsal SSO, admin self-registration (public kayıt formu) |
| Kimlik doğrulama (katılımcı) | Rumuz (nickname) + session, doğrulama yok (public oturumlarda); **şifreli oturumlarda ek olarak conversation-specific JWT** | E-posta/şifre, SMS doğrulama |
| Rate limiting | `express-rate-limit` (şifre doğrulama endpoint'i için) | Redis tabanlı dağıtık rate limit (bu ölçekte gerek yok) |

## 2. Ortam Değişkenleri (.env şablonu)

```
DATABASE_URL="postgresql://postgres:dev@localhost:5432/muzakere_masasi"
JWT_SECRET=""
LLM_BASE_URL=""       # kurumun verdiği endpoint
LLM_API_KEY=""        # kurumun verdiği anahtar
LLM_MODEL_NAME=""     # kurumun belirttiği model adı
```

## 3. Kapsam Sınırı — Çekirdek (Core) vs Ertelenen (v1.1)

### Çekirdek — Bu Görevde Yapılacak
- Rumuz + session tabanlı katılım
- Görüş yazma (140-280 karakter sınırı)
- Buton ile oylama (+1 / -1 / 0) — **swipe/kart destesi değil**
- Periyodik (10-30 sn) PCA + KMeans hesaplama, WebSocket ile yayın
- Küme dili özeti (LLM API çağrısı)
- Köprü cümle tespiti (bkz. madde 5)
- Admin panel: oturum açma, oturum oluşturma, moderasyon kuyruğu
- Canlı ekran modu: statik/periyodik güncellenen 2D scatter plot (Chart.js)
- Sonuç raporu (JSON export + ekran/yazdırma görünümü)

### v1.1 — Bundan Sonra YAPILMAYACAK (yeni ekleme, genişletme durdurulacak)
- Kart destesi (swipe) arayüzü
- D3.js tabanlı canlı akan grafik (mevcut Chart.js/Canvas çözümü korunacak)
- Gelişmiş bot/manipülasyon tespiti (ML tabanlı) — mevcut bot simülatörü sadece
  yük/algoritma testi amaçlı, gerçek kötüye kullanım tespiti değil, bu ayrım korunacak
- Çoklu dil desteği
- Detaylı demografik segmentasyon
- Rol/yetki (RBAC) sistemi — admin/moderatör ayrımı madde 4b'de tanımlanan basit
  modelin ötesine geçmeyecek (ör. "süper admin", "salt-okunur admin" gibi kademeler yok)

> **Not:** Glassmorphism/animasyon ve kişisel konum mini-haritası daha önce bu listede
> "ertelendi" olarak işaretlenmişti, ancak mevcut kod tabanında zaten uygulanmış
> durumda. Bunları geri almak gereksiz kod kaybı olur — mevcut haliyle korunacak,
> ancak üzerine **yeni** görsel karmaşıklık eklenmeyecek.

**Ajan bu listedeki v1.1 maddelerinden herhangi birini "iyi olur" diyerek eklemeye çalışırsa DURMALI ve onay istemelidir.**

## 4. Veri Modeli (Prisma Schema — Final, Değiştirilmeden Kullanılacak)

```prisma
model Admin {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  sessions     Session[] // oluşturduğu oturumlar
}

enum Visibility {
  PUBLIC
  PASSWORD_PROTECTED
}

model Session {
  id                String        @id @default(uuid())
  code              String        @unique
  title             String
  description       String?
  question          String?       // müzakere edilecek ana soru
  status            String        @default("active") // "active" | "paused"
  isActive          Boolean       @default(true)
  visibility        Visibility    @default(PUBLIC)
  passwordHash      String?       // sadece PASSWORD_PROTECTED için dolu
  passwordUpdatedAt DateTime?     // şifre değişince eski token'ları geçersiz kılmak için
  creatorId         String?       // NULLABLE: admin panelinden değil, herkese açık
                                   // /api/sessions/create ile kurulan oturumlarda boş kalır
                                   // (bkz. madde 4b — moderatör token'ı bu durumda sahiplik kanıtı)
  creator           Admin?        @relation(fields: [creatorId], references: [id])
  analysis          Json?         // son hesaplanan analiz sonucunun cache'i (points, camps, bridges)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  opinions          Opinion[]
  participants      Participant[]
}

model Participant {
  id            String    @id @default(uuid())
  sessionId     String
  session       Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  nickname      String
  justification String?   // katılım gerekçesi, min 15 karakter (Habermas: gerekçelendirme ilkesi)
  isBot         Boolean   @default(false) // bot simülatörüyle oluşturulan sahte katılımcılar
  isBanned      Boolean   @default(false) // soft-ban: yeni oy/görüş engellenir, geçmiş katkılar SİLİNMEZ
  socketId      String?
  createdAt     DateTime  @default(now())
  votes         Vote[]
  opinions      Opinion[]

  @@unique([sessionId, nickname])
}

model Opinion {
  id          String      @id @default(uuid())
  sessionId   String
  session     Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  authorId    String
  author      Participant @relation(fields: [authorId], references: [id], onDelete: Cascade)
  content     String
  status      String      @default("PENDING") // PENDING, APPROVED, REJECTED
  createdAt   DateTime    @default(now())
  votes       Vote[]
}

model Vote {
  id            String      @id @default(uuid())
  participantId String
  participant   Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  opinionId     String
  opinion       Opinion     @relation(fields: [opinionId], references: [id], onDelete: Cascade)
  value         Int         // +1, -1, 0
  createdAt     DateTime    @default(now())

  @@unique([participantId, opinionId])
}
```

Not: Katılımcıya kendi yazdığı görüş oylama kuyruğunda **gösterilmemelidir** (`authorId` filtresiyle).

## 4b. Oturum Oluşturma ve Yetki Modeli (KARAR VERİLDİ — 2 Yollu Model)

**Karar (onaylandı):** Herkes admin olmadan `POST /api/sessions/create` ile serbestçe
oturum kurabilir. Bu, kurumsal olarak bilinçli bir tercihtir — platform kurumun
tek kontrollü aracı değil, Pol.is'e benzer açık bir model olarak konumlanmıştır.
Kurum, kendi resmi istişarelerini admin hesabıyla (`POST /api/sessions`) ayrıca
açabilir; bu iki yol birbirini dışlamaz.

**İki oturum oluşturma yolu:**

| Yol | Endpoint | Kimlik Doğrulama | `creatorId` | Sahiplik Kanıtı |
|---|---|---|---|---|
| Kurumsal (admin) | `POST /api/sessions` | Admin JWT gerekli | Dolu (o admin'in id'si) | Admin JWT |
| Herkese açık | `POST /api/sessions/create` | Gerekmez | `null` | Dönen `moderator` JWT (sessionId'ye özel) |

**Yetki kuralları:**
- **Şifre değiştirme/kaldırma (`PATCH /api/sessions/:code/password`):** SADECE o
  oturumun sahibi çağırabilir — bu, ya (a) `creatorId` ile eşleşen Admin JWT'si ya
  da (b) o `sessionId`'ye özel `moderator` JWT'sidir. **Başka hiçbir admin, başkasının
  kurduğu oturumun şifresini değiştiremez** — bu, kurumun tüm oturumları yönetmesi
  değil, sadece kendi oluşturduklarını yönetmesi anlamına gelir.
- **Devre dışı bırakma (`PATCH /api/sessions/:code/status` — YENİ endpoint, eklenecek):**
  Herhangi bir Admin, kötüye kullanılan/şikayet edilen bir oturumu `status: "paused"`
  yaparak durdurabilir — bu bir **denetim/moderasyon yetkisidir, düzenleme yetkisi
  değildir**. Admin şifreyi göremez/değiştiremez, sadece oturumu kapatabilir.
- Bu ayrım bilinçlidir: "herkes kurabilir" modeliyle "kurum tam kontrol eder" modeli
  birbiriyle çelişir; seçilen çözüm ortada bir denge — kurum kötüye kullanımı
  durdurabilir ama başkasının oturumunu ele geçiremez.

**Admin hesap yönetimi (değişmedi):**
- Public admin self-registration formu YOK. Admin hesapları sadece seed script
  (`prisma/seed.js`) veya doğrudan veritabanı üzerinden, kurum İT'si tarafından açılır.
- Admin girişi (`POST /api/admin/login`) e-posta + şifre ile, `Admin` tablosuna
  karşı doğrulanır.

**Kötüye kullanım önlemi (YENİ gereksinim — bu karardan doğan zorunlu ek):**
- `POST /api/sessions/create` **kimlik doğrulaması gerektirmediği için** spam/kötüye
  kullanıma açıktır. Bu endpoint'e de `express-rate-limit` uygulanmalıdır (ör. IP
  başına saatte belirli sayıda oturum oluşturma sınırı — kesin sayı Faz 1'de
  netleştirilecek, öneri: saatte 10).
- Bu, madde 1'deki rate-limiting kararının kapsamının genişletilmesidir — sadece
  şifre doğrulama değil, artık oturum oluşturma da sınırlanacak.

## 5. Köprü Cümle (Bridge Opinion) Kuralı — Kesin Formül

Bir görüş "köprü cümle" sayılır **ancak ve ancak**:
- Her kümede "Katılıyorum" oranı > %60 **VE**
- O görüşe oy veren toplam katılımcı sayısı ≥ oturumdaki toplam katılımcının %30'u

İkinci şart olmadan uygulanmayacak — az sayıda oyla yanıltıcı "konsensüs" iddiası oluşmasını önlemek için zorunludur.

## 6. Otonomi ve Onay Kuralları (Ajan İçin)

- Veri modeli, mimari, kütüphane seçimi içeren her görev **Plan Mode** ile yapılacak — önce plan sunulacak, onay sonrası uygulanacak.
- Küçük, izole düzeltmeler (tek bileşen stil düzeltmesi vb.) **Fast Mode** ile yapılabilir.
- Bu dosyadaki "Kesinlikle Kullanılmayacak" veya "v1.1" listesindeki bir öğeye değinen her öneri, uygulanmadan önce insana sorulmalıdır.
- `git commit` atmadan önce diff insan tarafından gözden geçirilecektir; ajan otomatik commit atmayacaktır.

## 7. Test Beklentileri

- Yük testi: k6, 200 sanal katılımcı simülasyonu
- Birim testi: vitest, PCA/KMeans fonksiyonları mock veriyle doğrulanacak

## 8. Üretim/Pilot Öncesi Güvenlik Sertleştirme (Kesin Gereksinimler)

Mevcut kod tabanı geliştirme için uygun varsayılanlar içeriyor; pilot/gerçek
kullanım öncesi aşağıdakiler **zorunlu**:

- `JWT_SECRET` için kod içi varsayılan (`kamusal_alan_gizli_anahtar` gibi) KALDIRILACAK.
  `.env`'de tanımlı değilse sunucu **başlamayı reddetmeli**, sessizce zayıf bir
  sırra düşmemeli.
- `NODE_ENV=production` iken `DATABASE_URL` tanımsızsa sunucu in-memory moda
  **sessizce geçmemeli**, hata verip kapanmalı — aksi halde pilot sırasında veri
  kaybı riski sessizce oluşur.
- Admin seed'inde sabit şifre (`admin123` gibi) kullanılmayacak; ilk kurulumda
  rastgele üretilip tek seferlik konsola yazdırılacak ya da ilk girişte zorunlu
  şifre değiştirme akışı olacak.
- CORS, geliştirmede "tüm kaynaklara açık" kalabilir ama pilot/üretim ortamında
  belirli origin'lere kısıtlanacak.
- `docker-compose.yml`'deki Postgres şifresi, pilot öncesi `.env`'den okunan
  gerçek bir değerle değiştirilecek (repo'daki varsayılan sadece yerel geliştirme içindir).

## 10. Socket.io Güvenlik ve Veri Bütünlüğü Kararları (Aşama 8-9 Sonrası)

- **Her ayrıcalıklı socket olayında** (`admin-rename-camp`, `admin-update-camps-count`,
  kick/ban, `admin-approve-statement` vb.) token, **sadece bağlantı kurulduğunda değil,
  her emit alındığında** yeniden doğrulanmalı — bağlantı süresince şifre değişmiş/yetki
  iptal edilmiş olabilir, canlı socket bağlantısı bu durumu otomatik yansıtmaz.
- **Katılımcı çıkarma (kick/ban) HARD DELETE yapmaz.** `Participant.isBanned = true`
  olarak işaretlenir. Kişinin PENDING (henüz onaylanmamış) görüşleri temizlenebilir,
  ama APPROVED görüşleri ve o görüşlere verilmiş başka katılımcıların oyları
  KORUNUR — cascade silme burada bilinçli olarak devre dışı bırakılır.
- **Kamp merkezi eşleştirme (centroid tracking):** Her yeni PCA/KMeans turunda,
  yeni merkezler bir önceki turun merkezleriyle (öklid mesafesi en yakın olan)
  eşleştirilmeli, böylece `admin-rename-camp` ile verilen isimler kümeler arası
  karışsa bile doğru gruba yapışmaya devam eder.

## 11. Analiz Güvenilirliği Kararları (Öncelik 1-3)

- **Eksik oy işleme:** Bir katılımcının oy vermediği görüş, matriste `0` (nötr oy)
  ile KARIŞTIRILMAMALI. Eksik hücreler `null`/`NaN` olarak işaretlenip, PCA
  hesaplarında (kovaryans/iç çarpım) sadece iki değişkeni de gerçekten oylamış
  katılımcılar üzerinden hesap yapılmalı (NIPALS'ın eksik veriyle çalışabilme
  özelliği bu amaçla zaten var, implementasyon bunu doğru kullanmalı).
- **Minimum örneklem eşiği (analiz motorunun kendisi için, köprü cümleden ayrı):**
  Analiz (kümeleme + kutuplaşma yüzdesi) yalnızca en az **10 katılımcı VE en az
  5 onaylanmış görüş** varsa çalışır. Bu eşiğin altında sistem "Anlamlı analiz
  için daha fazla katılım gerekli" mesajı göstermeli, sahte/erken kümeleme
  sonucu üretmemeli.
- **Varyans açıklama oranı:** `calculatePCA` çıktısına `varianceExplained`
  (ör. `[0.42, 0.18]`) eklenmeli. Toplam açıklanan varyans %40'ın altındaysa,
  arayüzde haritanın yanında bir uyarı gösterilmeli.
- **Küme kararlılığı:** Her analiz turunda K-Means 5-10 kez (farklı rastgele
  başlangıçla) çalıştırılıp en iyi sonuç seçilmeli; katılımcıların çalıştırmalar
  arasında aynı gruba düşme oranı bir "kararlılık skoru" olarak hesaplanıp
  rapora eklenmeli.

## 12. Yük Testi — İki Ayrı Test, Birbirinin Yerine Geçmez

- **Algoritma/ölçek testi (mevcut, bot simülatörü):** Admin panelindeki
  +100/+200/+500 bot simülasyonu, PCA/KMeans'in büyük veri setinde doğru
  çalıştığını test eder — ama tek process içinde çalıştığı için gerçek
  WebSocket eşzamanlılığını YANSITMAZ.
- **Gerçek eşzamanlılık testi (ayrı, dışarıdan yapılacak):** k6/artillery ile,
  gerçek ağ üzerinden 200 eşzamanlı WebSocket bağlantısı simüle edilecek —
  bu, sunucunun gerçek yük altında (event loop, bağlantı yönetimi) nasıl
  davrandığını gösterir. Bot simülatörü bunun yerine geçmez, ikisi de yapılmalı.
