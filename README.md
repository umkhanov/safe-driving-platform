# SafeDrive — Güvenli Sürüş ve Sürücü Davranışı Analizi Platformu

> Bursa Teknik Üniversitesi · Bilgisayar Mühendisliği · **Node.js ile Web Programlama** dönem projesi
> Kullanım senaryosu: **Senaryo 1 — Güvenli Sürüş ve Sürücü Davranışı Analizi**

Akıllı telefonu araç içi bir IoT uç düğümü olarak kullanan, sensör verisini gerçek zamanlı toplayan, eşik tabanlı analizle riskli sürüş davranışlarını tespit eden ve filo yönetim paneline canlı alarm düşüren uçtan uca bir platform.

Platform üç bileşenden oluşur:

| Bileşen | Teknoloji | Dizin |
|---------|-----------|-------|
| Backend API | Node.js + Express 5 | `src/` |
| Filo Yönetim Paneli | React + Vite | `frontend/dashboard/` |
| Mobil Uygulama | Expo + React Native | `frontend/mobile/` |

---

## Hızlı Başlangıç

### Backend

```bash
npm install
cp .env.example .env
npm run dev
```

Backend: `http://localhost:3000` — Swagger UI: `http://localhost:3000/docs`

Varsayılan admin hesabı:

```txt
Email: test@test.com
Şifre: 123456
```

### Dashboard

```bash
cd frontend/dashboard
npm install
npm run dev
```

Dashboard: `http://localhost:5173`

### Mobil Uygulama

```bash
cd frontend/mobile
npm install
npx expo start --lan
```

iPhone'da Expo Go ile QR kodu okutun. Backend URL olarak bilgisayarınızın yerel IP'sini kullanın: `http://<MAC_IP>:3000`

### Simülatör (mobil cihaz olmadan test)

Backend çalışırken ayrı bir terminalde:

```bash
npm run simulate
```

Simülatör otomatik kullanıcı/cihaz oluşturur, her saniye gerçekçi ivmeölçer/jiroskop/GPS verisi gönderir ve ~%3 olasılıkla anomali enjekte eder.

> **Not:** Depo `.env`, `node_modules` ve SQLite veritabanını içermez. Backend ilk açılışta `./data/app.db` dosyasını otomatik oluşturur.

---

## 1. Proje Tanımı

Bu proje, akıllı telefon sensörlerini kullanarak sürücü davranışlarını izleyen bir **Mobil Güvenlik ve Davranış Analizi Platformu**dur. Sürücünün telefonundaki mobil uygulama, ivmeölçer ve GPS verisini zaman damgasıyla toplayıp Node.js backend'ine iletir. Backend gelen veriyi doğrular, saklar ve eşik tabanlı analiz motorundan geçirir; ani fren, ani hızlanma, sert dönüş ve çarpışma şüphesi gibi riskli davranışları tespit ettiğinde alarm üretir. Alarmlar Socket.io ile web paneline gerçek zamanlı iletilir; filo yöneticisi araçları, sürüşleri ve alarm geçmişini panel üzerinden izler.

**Hedef kullanıcılar:** filo yöneticileri (admin) ve sürücüler (driver).

## 2. Gereksinim Analizi

### Fonksiyonel Gereksinimler

| # | Gereksinim |
|---|-----------|
| FR-1 | Mobil uygulama en az iki sensörden (ivmeölçer, GPS) zaman damgalı veri toplamalı |
| FR-2 | Sensör verileri toplu (batch) olarak REST API üzerinden sunucuya iletilmeli |
| FR-3 | Kullanıcılar e-posta/şifre ile kayıt olup JWT ile giriş yapabilmeli |
| FR-4 | İki rol bulunmalı: `admin` (tüm filo) ve `driver` (yalnızca kendi verisi) |
| FR-5 | Yetkisiz kullanıcılar başkalarının cihaz, telemetri ve alarmlarına erişememeli |
| FR-6 | Gelen telemetri eşik tabanlı analizden geçirilip riskli davranışlar alarm olarak kaydedilmeli |
| FR-7 | Yeni alarmlar panele sayfa yenilemeden, gerçek zamanlı düşmeli |
| FR-8 | Alarmlar listelenebilmeli, filtrelenebilmeli ve operatör tarafından onaylanabilmeli (ack) |
| FR-9 | Sürüş oturumları (trip) otomatik açılıp boşta kalınca otomatik kapanmalı; mesafe, alarm sayısı ve risk skoru tutulmalı |
| FR-10 | Panel; araçları, sürücüleri, sürüşleri ve zaman serisi grafiklerini görüntüleyebilmeli |

### Fonksiyonel Olmayan Gereksinimler

- **Güvenlik:** Şifreler bcrypt ile özetlenir; tüm korumalı uç noktalar ve WebSocket bağlantısı JWT doğrulaması gerektirir.
- **Veri bütünlüğü:** Telemetri kaydı ve alarm üretimi tek SQLite transaction'ında yapılır.
- **Test edilebilirlik:** Analiz motoru saf (pure) fonksiyonlardan oluşur; 46 otomatik test in-memory veritabanıyla, dış servis gerektirmeden çalışır.
- **Taşınabilirlik:** SQLite dosya tabanlıdır, sıfır konfigürasyonla her ortamda çalışır.
- **Gizlilik:** Konum izni kullanıcıdan açıkça istenir; yalnızca gerekli sensör verisi toplanır, kamera/mikrofon kullanılmaz.

## 3. Kullanım Senaryosu (Senaryo 1 — Güvenli Sürüş)

**Aktörler:** Sürücü (mobil uygulama), Filo Yöneticisi (web paneli)

**Örnek akış:**

1. Sürücü mobil uygulamaya giriş yapar ve **Start Driving** ile sürüş oturumunu başlatır.
2. Uygulama ivmeölçer (250 ms) ve GPS (1 sn) verisini toplar, 2 saniyede bir backend'e gönderir.
3. Backend ilk telemetriyle birlikte otomatik bir **trip** kaydı açar.
4. Sürücü ani fren yapar → analiz motoru `HARD_BRAKE` alarmı üretir.
5. Alarm veritabanına kaydedilir ve `alarm:new` olayı ile panele anında iletilir.
6. Filo yöneticisi panelde alarmı görür, detayını inceler ve onaylar (acknowledge).
7. Sürüş bitip telemetri kesilince trip otomatik olarak `Completed` durumuna geçer.

**Tespit edilen alarm durumları:** ani fren (`HARD_BRAKE`), beklenmeyen hızlanma (`RAPID_ACCEL`), sert dönüş (`SHARP_TURN`), çarpışma şüphesi (`CRASH_DETECTED`).

## 4. Sistem Mimarisi

```
[Mobil Uygulama / Simülatör] ──POST /telemetry──▶ ┐
                                                  │
                                                  ▼
                                  ┌────────── Express ───────────┐
                                  │ auth · devices · telemetry   │
                                  │ alarms · trips · vehicles    │
                                  │ /docs (Swagger UI)           │
                                  └──────┬───────────────────────┘
                                         │
                               analyzeBatch(samples)
                                         │
                                         ▼
                                  ┌─── SQLite ────┐
                                  │ users          │
                                  │ devices        │
                                  │ sensor_samples │
                                  │ alarms         │
                                  │ vehicles       │
                                  │ trips          │
                                  └────────────────┘
                                         │
                                         │ her yeni alarmda:
                                         ▼
                               ┌── Socket.io io.to() ──┐
                               │  user:<id>, admins    │
                               └───────────────────────┘
                                         │
                                         ▼
                               [Dashboard aboneleri]
```

## 5. Kullanılan Teknolojiler

| Katman | Teknoloji |
|--------|-----------|
| Backend | Node.js 18+, Express 5 |
| Veritabanı | SQLite (`better-sqlite3`) — dosya tabanlı, senkron, sıfır konfigürasyon |
| Kimlik doğrulama | JWT (`jsonwebtoken`) + bcrypt |
| Gerçek zamanlı iletişim | Socket.io (JWT el sıkışmalı) |
| Mobil uygulama | Expo + React Native (`expo-sensors`, `expo-location`) |
| Web paneli | React 19 + Vite + React Router |
| Veri görselleştirme | Recharts |
| API dokümantasyonu | OpenAPI 3.0 + Swagger UI |
| Test | `node:test` (yerleşik) + supertest |

## 6. Veri Modeli

```
users(id, email, password_hash, role[admin|driver], created_at)
devices(id, user_id → users, label, created_at)
sensor_samples(id, device_id → devices, ts, sensor_type, payload[JSON])
alarms(id, device_id → devices, ts, kind, severity, details[JSON],
       vehicle_id → vehicles, driver_id → users, trip_id → trips,
       acknowledged_at, acknowledged_by → users, created_at)
vehicles(id, name, status, current_driver_id → users,
         last_lat, last_lng, last_seen_at, risk_level, updated_at)
trips(id, driver_id → users, vehicle_id → vehicles, device_id → devices,
      started_at, ended_at, distance, risk_score, alerts_count,
      status[Active|Warning|Completed], last_lat, last_lng,
      last_sample_at, updated_at)
```

- Cihaz silindiğinde örnekleri ve alarmları da silinir (`ON DELETE CASCADE`).
- Zaman serisi sorguları için `sensor_samples(device_id, ts)` bileşik indeksi tanımlıdır.
- Trip mesafesi ardışık GPS noktaları arasında **haversine** formülüyle hesaplanır.
- Trip, `TRIP_IDLE_TIMEOUT_SECONDS` (varsayılan 60 sn) boyunca telemetri gelmezse otomatik `Completed` olur.

## 7. Gerçekleştirilen Modüller (Föy Karşılığı)

| Föy | Modül | Gerçekleştirme |
|-----|-------|----------------|
| 5.1 | Mobil veri toplama | İvmeölçer (250 ms) + GPS (1 sn/1 m), ISO-8601 zaman damgası, 2 sn'de bir batch gönderim |
| 5.2 | Node.js backend | Express 5, modüler route yapısı, veri doğrulama, anlamlı HTTP durum kodları |
| 5.3 | Doğrulama ve yetkilendirme | JWT + bcrypt, `admin`/`driver` rolleri, sahiplik kontrolü, `requireRole` middleware |
| 5.4 | Veritabanı | 6 tablolu ilişkisel şema (bkz. Bölüm 6) |
| 5.5 | Gerçek zamanlı izleme paneli | React dashboard, Socket.io ile canlı alarm akışı, Recharts ile zaman serisi grafikleri |
| 5.6 | Analiz / anomali tespiti | Eşik tabanlı kural motoru, saf fonksiyonlar, birim testli (bkz. Bölüm 10) |
| 5.7 | Alarm mekanizması | Panelde canlı bildirim, listeleme, filtreleme, acknowledge akışı |
| 5.8 | Dokümantasyon | Bu README + OpenAPI/Swagger + `docs/INTEGRATION.md` |

**Bonus özellikler:** Swagger/OpenAPI entegrasyonu · 46 otomatik test · Socket.io ile canlı veri akışı · rol tabanlı yetkilendirme · sensör simülatörü

## 8. Ortam Değişkenleri (`.env`)

| Değişken | Varsayılan | Amaç |
|----------|-----------|------|
| `PORT` | `3000` | HTTP portu |
| `SQLITE_PATH` | `./data/app.db` | Veritabanı dosyası |
| `JWT_SECRET` | — | **zorunlu**, JWT imzalama |
| `JWT_EXPIRES_IN` | `7d` | Token ömrü |
| `BCRYPT_ROUNDS` | `10` | Şifre özetleme maliyeti |
| `TRIP_IDLE_TIMEOUT_SECONDS` | `60` | Trip otomatik kapanma süresi |

## 9. API Dokümantasyonu

Tam istek/yanıt şemaları için sunucu açıkken `/docs` (Swagger UI) ve `/openapi.json` adreslerine bakın. Entegrasyon kılavuzu: [`docs/INTEGRATION.md`](docs/INTEGRATION.md)

| Metot | Yol | Açıklama |
|-------|-----|----------|
| `GET` | `/health` | Canlılık kontrolü |
| `POST` | `/auth/register` | Kullanıcı kaydı (`role` varsayılanı `driver`) |
| `POST` | `/auth/login` | `{ token, user }` döner |
| `GET` | `/devices` | Kendi cihazları (admin: tümü) |
| `POST` | `/devices` | Cihaz kaydı |
| `POST` | `/telemetry` | Toplu sensör verisi; analizi tetikler, trip yönetir |
| `GET` | `/telemetry` | `deviceId`, `from`, `to`, `sensorType` filtreleri |
| `GET` | `/alarms` | `status=active`, `deviceId` filtreleri |
| `PATCH` | `/alarms/:id/ack` | Alarmı onayla |
| `GET` | `/trips` · `/trips/:id` | Sürüş oturumları |
| `POST/PATCH/DELETE` | `/trips...` | Trip yönetimi |
| `GET` | `/vehicles` · `/vehicles/:id` | Araçlar |
| `POST/PATCH/DELETE` | `/vehicles...` | Araç yönetimi |
| `GET` | `/docs` | Swagger UI |

## 10. Analiz ve Anomali Tespiti (`src/analysis.js`)

Saf fonksiyonlardan oluşan, birim testlerle doğrulanmış eşik tabanlı kural motoru:

| Tür | Tetikleyici | Şiddet |
|-----|------------|--------|
| `HARD_BRAKE` | Boylamsal eksende `x ≤ −1.0 m/s²` veya g-normalize delta kuralları | low / medium / high |
| `RAPID_ACCEL` | Boylamsal eksende `x ≥ +2.5 m/s²` veya g-normalize delta kuralları | low / medium / high |
| `SHARP_TURN` | Yanal eksen (Y) delta eşiği veya jiroskop `\|z\| ≥ 1.8 rad/s` | low / medium / high |
| `CRASH_DETECTED` | Çok eksenli şiddetli hareket + ani vektör değişimi (demo profili) | critical |

Öne çıkan teknik detaylar:

- **Birim normalizasyonu:** İstemciler ivmeyi m/s² (simülatör) veya g (iOS) cinsinden gönderebilir; motor vektör büyüklüğüne bakarak otomatik g'ye normalize eder.
- **Delta analizi:** Tek örneğe değil, ardışık örnekler arasındaki değişime bakılır — elde tutulan telefonla yapılan demolarda da gerçekçi tetikleme sağlar.
- **Montaj varsayımı:** Telefon araç tutucusunda dik, şarj portu aşağıda, ekran sürücüye dönük kabul edilir (X: ileri/geri, Y: sağ/sol, Z: düşey).

## 11. Gerçek Zamanlı Yapı (Socket.io)

JWT ile el sıkışarak bağlanın:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000', { auth: { token: '<jwt>' } });
socket.on('alarm:new', (alarm) => { /* ... */ });
```

- Her kimlikli soket `user:<id>` odasına, admin rolündekiler ayrıca `admins` odasına katılır.
- Yeni alarm üretildiğinde `alarm:new` olayı yalnızca cihaz sahibine ve adminlere gider.
- Geçersiz/eksik token ile soket bağlantısı reddedilir.

## 12. Test Süreci ve Test Senaryoları

```bash
npm test
```

46 otomatik test; tamamı in-memory SQLite (`:memory:`) ve stub'lanmış Socket.io emitter ile çalışır — dış servis gerektirmez.

| Dosya | Kapsam |
|-------|--------|
| `auth.test.js` | Kayıt, giriş, validasyon, mükerrer e-posta |
| `devices.test.js` | Auth zorunluluğu, sahiplik, admin görünürlüğü |
| `telemetry.test.js` | Batch kayıt, zaman aralığı sorgusu, sahiplik, trip yaşam döngüsü |
| `analysis.test.js` | TDD ile kural motoru: eşikler, sınır değerler, şiddet bantları |
| `alarms.test.js` | Telemetri→alarm hattı, ack akışı, WebSocket auth middleware |
| `docs.test.js` | OpenAPI şeması + Swagger UI |

Otomatik testlere ek olarak uçtan uca doğrulama, simülatör (`npm run simulate`) ve gerçek cihazla (Expo Go) manuel demo senaryosu üzerinden yapılmıştır.

## 13. Ekip İçi Görev Dağılımı

| Ekip Üyesi | Sorumluluk |
|------------|-----------|
| Arda Aydınkılınç | Backend API, veri modeli, analiz motoru, gerçek zamanlı katman, mobil uygulama, dashboard, test ve dokümantasyon |

<!-- Ekip üyesi eklendikçe bu tabloyu güncelleyin: kim hangi modülü geliştirdi. -->

## 14. Karşılaşılan Kısıtlar

- **Sensör birim farkı:** iOS ivmeölçeri g cinsinden, simülatör m/s² cinsinden veri üretiyor; analiz motoruna otomatik birim normalizasyonu eklendi.
- **Montaj yönü bağımlılığı:** Eksen yorumu telefonun araç içindeki yönüne bağlı; sabit montaj varsayımı yapıldı ve elde tutulan demo için delta tabanlı hassas kurallar eklendi.
- **Expo Go kısıtları:** Arka planda sensör erişimi sınırlı olduğundan uygulamanın ön planda kalması gerekiyor; jiroskop verisi mobil istemciye eklenmedi (backend kuralı ve simülatör desteği mevcut).
- **Cihaz kaydı:** Mobil istemci şu an bootstrap ile oluşturulan varsayılan cihazı (`deviceId: 1`) kullanıyor; cihaz kaydının mobil arayüze taşınması gelecek geliştirme olarak bırakıldı.
- **SQLite tek yazıcı:** Ders ölçeği için yeterli; büyük filo senaryosunda PostgreSQL'e geçiş önerilir.
- **Gerçek araç testi:** Sınırlı sayıda gerçek sürüşle test edilebildi; eşik kalibrasyonu ağırlıkla simülatör ve kontrollü el hareketi profilleriyle yapıldı.

## 15. Demo Akışı

1. Backend'i başlat (`npm run dev`)
2. Dashboard'a admin olarak giriş yap (`localhost:5173`)
3. iPhone'da Expo Go ile mobil uygulamaya giriş yap
4. **Start Driving** — telemetri 2 sn'de bir akmaya başlar
5. Telefonu hareket ettir veya **Hard Brake Test**'e bas
6. Alarmın panele canlı düştüğünü, trip ve grafiklerin güncellendiğini gözlemle

## Proje Dizin Yapısı

```
src/
  index.js         # http sunucusu + socket.io bootstrap
  app.js           # express app factory (db + emit enjekte edilir)
  db.js            # SQLite + şema kurulumu
  auth.js          # bcrypt, JWT, middleware
  analysis.js      # saf tespit fonksiyonları
  realtime.js      # socket.io auth + çoklu oda yayını
  bootstrap.js     # varsayılan cihaz/araç kaydı
  routes/
    auth.js · devices.js · telemetry.js · alarms.js · trips.js · vehicles.js
frontend/
  dashboard/       # React + Vite filo paneli
  mobile/          # Expo + React Native mobil uygulama
scripts/
  simulator.js     # mobil cihaz simülatörü
tests/             # node:test dosyaları (46 test)
docs/
  openapi.js       # OpenAPI 3.0 şeması
  INTEGRATION.md   # mobil/panel ekipleri için entegrasyon kılavuzu
data/              # sqlite dosyası (gitignore'da)
```

## Lisans

MIT
