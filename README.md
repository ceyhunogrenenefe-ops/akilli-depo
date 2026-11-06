# Akıllı Depo — Sesli Palet ve Depo Yönetim Sistemi

Telefondan konuşarak palete ürün kaydetme, palet/firma yönetimi, profesyonel Excel raporları ve
ilgili kişilere e-posta / WhatsApp ile otomatik liste gönderimi.

Teknoloji (mevcut projelerinizle aynı): **Vite + React + Tailwind**, **Supabase** (Postgres, Auth, Storage, Realtime),
**Vercel** (statik site + sunucusuz API).

---

## 1. Hızlı deneme (Demo modu)

```bash
npm install
npm run dev        # http://localhost:5173
```

Supabase ayarı yoksa uygulama **Demo modunda** açılır: veriler yalnızca o tarayıcıda saklanır, otomatik gönderim kapalıdır
(WhatsApp/e-posta bağlantı butonları ve “Excel paylaş” çalışır).

## 2. Kalıcı kurulum

### 2.1 Supabase
1. Yeni bir Supabase projesi açın. Mevcut koçluk projelerinizden **ayrı** olması önerilir.
2. **SQL Editor** → `supabase/schema.sql` dosyasının tamamını yapıştırıp çalıştırın.
   Tablolar, roller, satır bazlı yetkiler, değişiklik kaydı tetikleyicileri, `raporlar` depolama alanı ve A/B/C firmaları oluşur.
3. **Authentication → Users → Add user** ile kendi hesabınızı oluşturun. **İlk kullanıcı otomatik olarak Yönetici olur.**
   Diğer kullanıcıları uygulama içinden (Yönetim → Kullanıcılar) eklersiniz.

### 2.2 Vercel
1. Bu klasörü bir GitHub deposuna gönderin ve Vercel'de **New Project** ile içe aktarın (Framework: Vite).
2. **Environment Variables** bölümüne `.env.example` içindeki değerleri girin. En az şunlar gerekir:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy edin. Mikrofon yalnızca **HTTPS** üzerinde çalışır; Vercel adresi bunu sağlar.

### 2.3 Telefona kurma
Siteyi telefonda açın → Chrome: **⋮ → Ana ekrana ekle** / Safari: **Paylaş → Ana Ekrana Ekle**.
Uygulama gibi tam ekran açılır.

---

## 3. Sesli komutlar

| Söylenen | Kaydedilen |
|---|---|
| “Birinci palete A firması için domates salçası 40 adet ekle.” | Palet 1 · A Firması · Domates Salçası · 40 adet |
| “İkinci palete B firmasından 25 koli makarna ekle.” | Palet 2 · B Firması · Makarna · 25 koli |
| “3. palete C firması için 10 kasa ayran ve 5 çuval un” | 2 satır, aynı palet ve firma |
| “Üçüncü palete A firması 10 koli çay, B firması 5 koli şeker” | 2 satır, farklı firmalar |
| “A firması 12 koli zeytin” | Palet söylenmezse **aktif palet** |
| “Son palete …” / “Yeni palete …” | En son palet / sıradaki yeni palet |
| “Geri al” | Son kaydı siler |
| Onay kartında “evet” / “iptal” | Onaylar / vazgeçer |

- Sayılar rakamla ya da yazıyla anlaşılır: “kırk”, “yüz yirmi beş”, “on ikinci palet”, “2,5 ton”.
- Firma, kod harfiyle (“A firması”, “be firmasından”) ya da tam adıyla (“Yılmaz Gıda için”) söylenebilir.
- Birimler: adet/tane, koli, kutu, paket, kasa, çuval, torba, şişe, teneke, bidon, kavanoz, balya, rulo, kg/kilo, gr, ton, litre, metre.
- **Net anlaşılan** komutlar onay sorulmadan kaydedilir, sesli olarak teyit edilir ve 7 saniye boyunca “Geri Al” ile geri alınabilir.
- **Anlaşılmayan** komutlarda (firma/palet/ürün/miktar eksik, kayıtlı olmayan firma, sırada olmayan yeni palet numarası)
  düzenlenebilir bir onay kartı açılır.
- Ses tanıma tarayıcının kendi motorunu kullanır (Android Chrome, iPhone Safari, masaüstü Chrome/Edge). Desteklenmeyen
  tarayıcılarda klavyedeki mikrofon tuşuyla dikte edip aynı kutuya yazdırabilirsiniz.

## 4. Roller

| Rol | Yetki |
|---|---|
| Yönetici | Her şey + firmalar, bildirim alıcıları, kullanıcılar |
| Personel | Palet/ürün ekler, düzenler, taşır, siler; Excel indirir; bildirim gönderir |
| Depo sorumlusu | Tüm paletleri görür, Excel indirir |
| Firma yetkilisi | **Yalnızca kendi firmasının** ürünlerini görür ve indirir (veritabanı seviyesinde RLS ile) |

## 5. Bildirimler

Yönetim → **Bildirim alıcıları**: firma yetkilileri, Hollanda depo sorumlusu, kendiniz ve personel.
Bildirim Gönder ekranında paletleri ve alıcıları seçin:

- **Otomatik gönder**: sunucu her alıcı için kendi kapsamındaki Excel'i üretir. Firma yetkilisi yalnızca kendi ürünlerini, diğerleri tüm listeyi alır.
  - E-posta: HTML tablo + Excel eki (Resend veya SMTP).
  - WhatsApp: liste özeti + Excel dosyası/bağlantısı (7 gün geçerli). Sağlayıcı `WHATSAPP_PROVIDER` ile seçilir:
    - `meta`: WhatsApp Cloud API. İşletmenin başlattığı mesajlar için onaylı şablon gerekir
      (başlık: **Doküman**, gövde: `{{1}}`). Şablon tanımlı değilse yalnızca son 24 saatte yazışılan kişilere gider.
    - `twilio`: Twilio WhatsApp
    - `webhook`: kendi WhatsApp ağ geçidiniz (ör. VPS'teki `whatsapp-gateway`). `POST {to, text, fileUrl, fileName}` alır.
- **Hiç ayar gerektirmeyen yollar**: her alıcının yanında *WhatsApp* (wa.me bağlantısı), *E-posta* (mailto) ve
  telefonda *Excel paylaş* (dosyayı doğrudan WhatsApp'a ekler) butonları vardır.
- Palet “Tamamlandı” yapıldığında bildirim gönderilmesi önerilir. Gönderim sonrası paletler “Gönderildi” olarak işaretlenebilir.
- Tüm gönderimler Geçmiş → *Gönderilen bildirimler* altında kayıtlıdır.

## 6. Excel raporları

- **Genel rapor**: Özet (firma × birim toplamları, genel toplam formülleri, ürün toplamları) · Palet Listesi
  (palet → firma → ürün, palet toplamları, yazdırmaya hazır) · Detay (filtrelenebilir düz tablo).
- **Firma raporu**: yalnızca o firmanın ürünleri, birim bazında genel toplam, ürün toplamları ve palet dağılımı.
- Kapsam: tüm paletler, duruma göre (açık/tamamlandı/gönderildi) veya seçili paletler.

## 7. Geçmiş işlemler

Ürün ekleme, düzenleme, palet değiştirme (taşıma), silme; palet, firma ve alıcı değişiklikleri veritabanı tetikleyicileriyle
**kim, ne zaman, önce/sonra** bilgisiyle otomatik kaydedilir. Uygulamadan atlatılamaz.

## 8. Proje yapısı

```
supabase/schema.sql      Veritabanı şeması, yetkiler, tetikleyiciler
src/lib/parser.js        Türkçe sesli komut çözümleyici (+ parser.test.js)
src/lib/excel.js         Excel rapor oluşturucu (tarayıcı + sunucu ortak)
src/lib/summary.js       WhatsApp/e-posta metin özeti
src/lib/db.js            Veri katmanı (Supabase / Demo)
src/pages/*              Ekranlar
api/notify.js            E-posta + WhatsApp gönderimi (+ notify.test.js)
api/users.js             Kullanıcı oluşturma (yönetici)
api/_lib/server.js       Sağlayıcı entegrasyonları
```

Testler: `npm test`
