# Entegrasyon Rehberi — Safe Driving Backend

Bu dokümanın hedef kitlesi: bu API'yi tüketecek **mobil** veya **dashboard frontend** ekibi.

Backend bağımsız bir REST + WebSocket servisidir. Hiçbir UI içermez — sadece veri sözleşmesi.

---

## 1. Sistem ne yapıyor? (30 saniyelik özet)

```
Mobil telefon                       Bu backend                          Dashboard
─────────────                      ─────────────                       ──────────
 1. Register/Login           ───▶   JWT verir
 2. Cihaz kaydı (1 kez)      ───▶   deviceId verir
 3. Sensör verisi (sürekli)  ───▶   Saklar
                                     │
                                     └─ Eşik aşılırsa alarm üretir
                                        │
                                        └──▶ Socket.io ile push  ◀── Dashboard dinler
                                                                     ("alarm:new" event'i)
```

**Dört temel kavram:**

| Kavram | Ne | Nereden geliyor |
|---|---|---|
| **User** | Sürücü veya admin. Email + password ile kayıt | `/auth/register` |
| **Device** | Telefon. Bir user birden çok cihaza sahip olabilir | `/devices` POST |
| **Sample** | Tek sensör okuması (`deviceId`, `ts`, `sensorType`, `payload`) | `/telemetry` POST |
| **Alarm** | Anomali tespiti sonucu (`HARD_BRAKE`, `RAPID_ACCEL`, `SHARP_TURN`) | Otomatik üretilir |

---

## 2. Base URL & format

- **Base:** `http://localhost:3000`
- **Tüm body'ler:** `application/json`
- **Tüm korumalı endpoint'ler:** `Authorization: Bearer <jwt>` header'ı gerekli
- **Tarih formatı:** ISO 8601, örn. `"2026-05-12T13:42:01Z"`

---

## 3. Auth akışı

### 3.1 Kayıt — `POST /auth/register`

```http
POST /auth/register
Content-Type: application/json

{ "email": "ahmet@x.com", "password": "demo123" }
```

**201:**
```json
{ "id": 1, "email": "ahmet@x.com", "role": "user" }
```

Admin oluşturmak için `"role": "admin"` ekle. Geçersiz role değeri sessizce `user`'a düşer.

**Hata kodları:**
- `400` — email veya password eksik
- `409` — email zaten kayıtlı

### 3.2 Giriş — `POST /auth/login`

```http
POST /auth/login

{ "email": "ahmet@x.com", "password": "demo123" }
```

**200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "user": { "id": 1, "email": "ahmet@x.com", "role": "user" }
}
```

Token'ı sakla (mobil: secure storage, dashboard: `localStorage`/`sessionStorage`). Bundan sonra her korumalı istekte gönder:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

Token süresi varsayılan **7 gün**. Süre dolarsa `401` alırsın → tekrar login.

**Hata kodları:**
- `400` — eksik alan
- `401` — yanlış email/password

---

## 4. Mobil ekibi için: telemetri gönderme

### 4.1 Cihaz kaydı (uygulama ilk açıldığında, **bir kez**)

```http
POST /devices
Authorization: Bearer <token>

{ "label": "Ahmet'in iPhone 13" }
```

**201:**
```json
{ "id": 1, "label": "Ahmet'in iPhone 13", "userId": 1 }
```

`id` değerini telefonun yerel depolamasında sakla → bundan sonra `deviceId` olarak göndereceksin.

### 4.2 Sensör örneği gönderme

```http
POST /telemetry
Authorization: Bearer <token>

{
  "deviceId": 1,
  "samples": [
    { "ts": "2026-05-12T13:42:01Z", "sensorType": "accel",
      "payload": { "x": -0.12, "y": 0.03, "z": 9.79 } },
    { "ts": "2026-05-12T13:42:01Z", "sensorType": "gyro",
      "payload": { "x": 0.01, "y": 0.02, "z": 0.04 } },
    { "ts": "2026-05-12T13:42:01Z", "sensorType": "gps",
      "payload": { "lat": 40.1834, "lng": 29.1212, "speedKmh": 42.5 } }
  ]
}
```

**201:**
```json
{ "count": 3, "alarms": 0 }
```

`alarms > 0` ise o batch'te anomali bulundu → alarmlar zaten DB'ye yazıldı + dashboard'lara WS event'i gitti. Mobil tarafında ek bir iş yapmana gerek yok.

### 4.3 Kurallar ve ipuçları

| Kural | Açıklama |
|---|---|
| `samples` boş olamaz | En az 1 örnek lazım, 400 dönerim |
| `ts` ISO 8601 | `"2026-05-12T13:42:01Z"` formatı |
| Karışık batch OK | `accel` + `gyro` + `gps` aynı POST'ta yollanabilir |
| Optimal batch boyutu | 10–50 örnek. Saniyede 1 batch realistik |
| Başka birinin cihazına yazamazsın | `deviceId` sana ait değilse 403 |
| Bilinmeyen cihaz | 404 |

### 4.4 Sensör payload'ları (analizde kullanılan alanlar)

| `sensorType` | Önemli alanlar | Açıklama |
|---|---|---|
| `accel` | `x` (m/s²) | Aracın **uzunlamasına** ekseni. Negatif = frenleme, pozitif = hızlanma |
| `gyro` | `z` (rad/s) | **Yaw** (sağa-sola dönüş hızı). İşaret yön |
| `gps` | `lat`, `lng`, `speedKmh` | Şu an analiz edilmiyor, sadece saklanıyor |

**Telefon montaj konvansiyonu:** telefon araç içinde, `x` ekseni aracın ileri yönüyle hizalı olacak şekilde sabitlenmiş varsayılıyor. Bu konvansiyon dışında veri gönderirsen analiz yanlış yorumlar.

---

## 5. Dashboard ekibi için: veri okuma

### 5.1 Cihaz listesi

```http
GET /devices
Authorization: Bearer <token>
```

**200:**
```json
[
  { "id": 1, "userId": 1, "label": "Ahmet'in iPhone", "createdAt": "..." }
]
```

- User: sadece kendi cihazları
- Admin: tüm cihazlar

### 5.2 Geçmiş telemetri

```http
GET /telemetry?deviceId=1&from=2026-05-12T13:00:00Z&to=2026-05-12T14:00:00Z&sensorType=accel
```

| Parametre | Zorunlu | Açıklama |
|---|---|---|
| `deviceId` | ✅ | Hangi cihaz |
| `from` | — | ISO 8601, dahil |
| `to` | — | ISO 8601, dahil |
| `sensorType` | — | `accel` / `gyro` / `gps` |

**200:**
```json
[
  { "id": 42, "deviceId": 1, "ts": "2026-05-12T13:42:01Z",
    "sensorType": "accel", "payload": { "x": -0.12, "y": 0.03, "z": 9.79 } }
]
```

Grafik çizmek için `sensorType=accel` filtresiyle çekip `payload.x` üzerinden time series oluşturabilirsin.

### 5.3 Alarm listesi

```http
GET /alarms                       # tüm alarmlar (role'e göre filtreli)
GET /alarms?status=active         # sadece onaylanmamışlar
GET /alarms?deviceId=1            # tek cihazın alarmları
```

**200:**
```json
[
  {
    "id": 7,
    "deviceId": 1,
    "ts": "2026-05-12T13:42:01Z",
    "kind": "HARD_BRAKE",
    "severity": "medium",
    "details": { "x": -6.2 },
    "acknowledgedAt": null,
    "acknowledgedBy": null,
    "createdAt": "2026-05-12 13:42:02"
  }
]
```

### 5.4 Alarm onaylama

```http
PATCH /alarms/7/ack
Authorization: Bearer <token>
```

**200** — güncellenmiş alarm objesi. `acknowledgedAt` ve `acknowledgedBy` dolar.

---

## 6. Socket.io: canlı alarm akışı (dashboard için)

Dashboard sayfası açıldığında bağlantı kur:

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: localStorage.getItem('jwt') }
});

socket.on('connect', () => console.log('connected'));
socket.on('connect_error', (err) => console.error('auth fail:', err.message));

socket.on('hello', ({ userId, role }) => {
  console.log(`signed in as ${role}`);
});

socket.on('alarm:new', (alarm) => {
  // alarm objesi = REST'in /alarms döndüğüyle aynı şema
  console.log('NEW ALARM:', alarm.kind, alarm.severity);
  // ör. toast göster, listeye ekle, harita üzerinde nokta yak, ...
});
```

**Auth davranışı:**
- Token yoksa veya geçersizse `connect_error` ile bağlantı reddedilir
- Token'ı handshake'te `auth: { token }` ile ver (header olarak değil)

**Hangi alarmları alır?**
- Normal user: **sadece kendi cihazlarının** alarmları
- Admin: **tüm cihazların** alarmları

(Sunucu otomatik `user:<id>` ve `admins` odalarına join ediyor; alarm üretildiğinde ikisine de push edilir.)

---

## 7. Anomali kuralları (referans)

Backend şu eşiklere göre alarm üretir:

| Alarm | Tetik koşulu | Severity bantları (|magnitude|) |
|---|---|---|
| `HARD_BRAKE` | `accel.payload.x ≤ -4` | low: 4–6 · medium: 6–8 · high: ≥8 |
| `RAPID_ACCEL` | `accel.payload.x ≥ +4` | low: 4–6 · medium: 6–8 · high: ≥8 |
| `SHARP_TURN` | `|gyro.payload.z| ≥ 1.5` | low: 1.5–2 · medium: 2–3 · high: ≥3 |

> Eşikleri değiştirmek için `src/analysis.js` → `THRESHOLDS`.

---

## 8. Hata kodları cheat-sheet

Tüm hata response'ları:
```json
{ "error": "human-readable message" }
```

| Status | Ne zaman |
|---|---|
| `200` | Tamam (GET, PATCH başarılı) |
| `201` | Oluşturuldu (register, device, telemetry batch) |
| `400` | Eksik veya geçersiz parametre |
| `401` | Token yok / geçersiz / süresi dolmuş, ya da yanlış credential |
| `403` | Token var ama başkasının kaynağına erişiyorsun |
| `404` | Kaynak bulunamadı (device, alarm) |
| `409` | Çakışma (örn. duplicate email) |

---

## 9. Uçtan uca hızlı test (curl)

```bash
BASE=http://localhost:3000

# 1. Kayıt
curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"ahmet@x.com","password":"demo123"}'

# 2. Login, token'ı sakla
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ahmet@x.com","password":"demo123"}' | jq -r .token)

# 3. Cihaz kayıt
DEVICE_ID=$(curl -s -X POST $BASE/devices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"label":"Test phone"}' | jq -r .id)
echo "device $DEVICE_ID"

# 4. Hard brake telemetri yolla (anomali tetiklenir)
curl -s -X POST $BASE/telemetry \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"deviceId\":$DEVICE_ID,\"samples\":[{\"ts\":\"2026-05-12T14:00:00Z\",\"sensorType\":\"accel\",\"payload\":{\"x\":-6}}]}"

# 5. Alarm üretildi mi?
curl -s $BASE/alarms -H "Authorization: Bearer $TOKEN" | jq
```

`HARD_BRAKE` kindinde bir alarm görmeli.

---

## 10. Sıkça karşılaşılan sorunlar

| Belirti | Sebep / Çözüm |
|---|---|
| `401 invalid credentials` | Önce `/auth/register`'ı çağırmadın, ya da password yanlış |
| `401 missing token` | `Authorization: Bearer ...` header'ı eksik |
| `403 forbidden` | Başka birinin cihazına yazıyor/okuyorsun |
| `404 device not found` | `deviceId` yanlış veya silinmiş |
| `409 email already exists` | Aynı email ikinci kez register edildi → direkt login dene |
| Server restart'tan sonra her şey kayboldu | `data/app.db` dosyasını silmişsindir — SQLite kalıcı ama dosya gidince veri de gider |
| Socket.io bağlanmıyor (`connect_error`) | Token yok, geçersiz veya süresi dolmuş |
| `accel` yolladım ama alarm gelmedi | `payload.x` eşiği aşmıyor olabilir (≤ -4 veya ≥ +4) |

---

## 11. Sözleşmeyi keşfetmek için araçlar

- **Swagger UI (interaktif):** `http://localhost:3000/docs`
- **Ham OpenAPI 3.0 spec:** `http://localhost:3000/openapi.json`
- **Postman / Insomnia:** `openapi.json`'u import et, hazır collection olur
- **Mobil yokken test:** `npm run simulate` — gerçekçi sürüş verisi üretir, alarmlar dahil
