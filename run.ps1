# Müzakere Masası Başlatma Scripti
# Bu script Docker veritabanını başlatır, Prisma şemasını senkronize eder ve uygulamayı açar.

Clear-Host
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "⚖️  MÜZAKERE MASASI — ÇALIŞTIRMA SCRIPTİ" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Docker Compose Kontrolü ve Başlatma
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "🐳 Docker algılandı. PostgreSQL veritabanı konteyneri başlatılıyor..." -ForegroundColor Yellow
    docker-compose up -d
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Veritabanı başarıyla ayağa kaldırıldı." -ForegroundColor Green
    } else {
        Write-Host "⚠️  Docker başlatılamadı. Veritabanı bağlantısı kurulamayabilir, ancak In-Memory yedekleme modu devreye girecektir." -ForegroundColor DarkYellow
    }
} else {
    Write-Host "ℹ️  Sistemde Docker bulunamadı. Uygulama otomatik olarak bellek içi (In-Memory) çevrimdışı modda başlatılacaktır." -ForegroundColor Yellow
}
Write-Host ""

# 2. Prisma Şema Eşitleme ve Seed Yapma
if (Test-Path "prisma/schema.prisma") {
    Write-Host "📦 Prisma veritabanı şeması ve istemcisi hazırlanıyor..." -ForegroundColor Yellow
    # Prisma istemcisini oluştur
    npx.cmd prisma generate
    
    # DB push işlemi
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "💾 Şema veritabanına aktarılıyor (Prisma db push)..." -ForegroundColor Yellow
        npx.cmd prisma db push --accept-data-loss
        
        Write-Host "🌱 Veritabanına varsayılan tohum veriler (Seed) ekleniyor..." -ForegroundColor Yellow
        npx.cmd prisma db seed
    }
}
Write-Host ""

# 3. Uygulamayı Paralel Başlatma
Write-Host "🚀 Sunucu ve İstemci geliştirme sunucuları paralel başlatılıyor..." -ForegroundColor Green
Write-Host "👉 İstemci adresi: http://localhost:5173" -ForegroundColor Cyan
Write-Host "👉 Sunucu adresi: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Ctrl+C tuşlarına basarak oturumu kapatabilirsiniz." -ForegroundColor DarkGray
Write-Host ""

npm.cmd run dev
