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

**Sıra:** Palet → Firma → Ürün → Miktar → Birim

> “Palet 1, A firması, domates salçası, 40, adet.”

- Aralarda duraksayabilirsiniz; parçalar tek kayıtta birleşir ve ekrandaki 5 kutu canlı dolar.
- Karışık sıra da anlaşılır: “A firmasına ait 40 adet domates salçasını birinci palete ekle.”
  Sıralı okuma ile serbest okuma aynı alanda farklı sonuç verirse alan **belirsiz** kalır; sistem tahmin etmez.
- **Eksik bilgi tahmin edilmez.** Birim söylenmezse “adet” varsayılmaz; eksik alan sarı yanar ve sesli sorulur.
  Yalnızca eksik olanı söylemeniz yeterlidir (“kasa”, “40 adet”, “B firması”).
- Eksiksiz anlaşılan ürün “Onay bekleyen ürünler” listesine düşer. **“kaydet”** deyince hepsi kaydedilir.
- **Sesle düzeltme:** “miktar 50 olsun”, “firma B olsun”, “birim koli olsun”, “ürün makarna olsun”, “palet 3 olsun”
  (şu anki kayda, yoksa listedeki son satıra uygulanır).
- Diğer komutlar: “iptal” (şu anki kayıt), “son satırı sil”, “listeyi temizle”.
- **Kayıtlı adlar önceliklidir:** Firma kodu/adı ve daha önce girilmiş ürün adları tanınır; “domatez salçası” → “Domates Salçası”.
- **Öğrenme:** Kaydetmeden önce düzelttiğiniz firma/ürün adları öğrenilir (Yönetim → Sesli komut). Yanlış öğrenileni oradan silebilirsiniz.
- Ayarlar (Sesle Ürün Ekle sayfasının altında): sürekli dinleme, sesli sorma, “palet/firma önceki satırdan devam etsin”,
  yapay zekâ yardımı, onaysız kaydetme.

### Yapay zekâ yardımı (isteğe bağlı)
Vercel → Settings → Environment Variables'a `ANTHROPIC_API_KEY` eklenip ayarlardan açıldığında, yerel çözümleyicinin
dolduramadığı alanlar yapay zekâya sorulur. Yapay zekâ yalnızca **boş** alanları doldurur, söyleneni değiştirmez;
doldurduğu alanlar “YZ” etiketiyle gösterilir ve listedeki firma/birimler dışında değer kabul edilmez.

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
