# Frontend Start Prompt — CIOAgent

> Yeni bir Claude chat başlattığında **bu mesajı kopyala-yapıştır**. 30 saniyede tüm context yüklenir.
> Oturum sonunda **"oturumu kapat"** yaz → Claude SESSION_LOG ve PROJECT_STATE'i otomatik günceller.

---

## 📋 Yeni chat'e atılacak mesaj

```
Merhaba. CIOAgent projesine devam ediyoruz.

Önce şu 3 dosyayı oku ve durumu özetle:
- @CLAUDE.md            (proje brief'i)
- @METHODOLOGY.md       (UI kuralları — sıfır inline style, token-only)
- @PROJECT_STATE.md     (yapılanlar, bekleyenler, component API)

Sonra mevcut sayfa örneklerine göz at:
- @home.html            (sidebar + topbar kullanımı)
- @chatbot.html         (sidebar + custom convo header)
- @login.html           (auth pattern)
- @design-system.html   (token + component galerisi)

Stil katmanı:
- @styles/tokens.css
- @styles/components.css
- @styles/layout-components.css

Web component'ler:
- @components/sidebar.js
- @components/topbar.js
- @components/notifications-panel.js

Son session loguna bak:
- @SESSION_LOG.md     (önceki session'larda ne yapıldı, ne devredildi)

Hazır olduğunda bana sor:
1. Hangi modülden devam edelim? (sıradakiler PROJECT_STATE.md'de)
2. Methodology'de bir değişiklik gerekiyor mu?

Dil: Türkçe. Adım adım git, plan + onay + uygulama. Detaya inmeden önce planı sun.

---

## 🔴 SESSION CLOSE PROTOKOLÜ

Kullanıcı **"oturumu kapat"** yazdığında şunu yap:

1. Bu session'da yapılanları listele
2. Kalan (tamamlanmayan) modülleri listele
3. `PROJECT_STATE.md`'yi güncelle → tamamlananları ✅'e taşı
4. `SESSION_LOG.md`'ye yeni bir session bloğu **EN ÜSTE** ekle (tarih + yapılanlar + devredenler + notlar)
5. Kullanıcıya kısa özet sun

Format (SESSION_LOG.md için):
\```
## 📋 Session #N — DD MMM YYYY

**Süre:** ~X saat (tahmini)

### ✅ Bu session'da tamamlananlar
- modül adı — kısa açıklama

### 🚧 Devredilen (tamamlanmamış)
1. Modül adı
...

### 📝 Notlar
- önemli kararlar, değişiklikler
\```
```

---

## 🔑 Kritik kurallar (yeni chat unutmasın)

1. **Sıfır inline `style=""`** — her şey `styles/<module>.css`'e
2. **Sıfır hex/font literal** — hepsi `var(--…)` token
3. **Tekrarlanan layout = web component** — sidebar/topbar HTML kopyalanmaz
4. **State `data-*` ile** — `data-active="true"`, `class="active"` değil
5. **Sayfa iskeleti** her zaman aynı (PROJECT_STATE.md'de tam hali)
6. **Onaysız detaya inme** — önce plan, sonra onay, sonra uygulama
7. **Türkçe konuş**, UI metinleri İngilizce

---

## 📦 Modül başlatma şablonu

Yeni bir modül yaparken bu sırayı takip et:

1. **Soru sor** — kapsam, akış, varyasyon ihtiyacı, hangi connector'lara dokunacak
2. **Plan** — modülün layout'unu, hangi component'leri kullanacağını anlat
3. **Onay bekle**
4. `styles/<module>.css` aç
5. `<module>.html` yaz — sadece `<app-sidebar>` + `<app-topbar>` + içerik
6. Yeni paylaşılan component lazımsa `components/<name>.js` aç + sidebar'a item ekle
7. `PROJECT_STATE.md`'de bekleyen → tamamlanan'a taşı
8. `done` + verifier

---

## 🎨 Brand pinleme

- Logo: `<span class="agent">agent</span><span class="metric">metric</span>` — `--brand-600` + `--text`
- Primary renk: `--brand-600` (rose-600)
- Font: `--font-sans` (Geist)
- Tone: enterprise, sade, modern, yeni nesil; "AI slop" yok (gradient bombası, gereksiz emoji, içi boş istatistik)
