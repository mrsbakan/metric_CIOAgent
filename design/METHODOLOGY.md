# CIO Agent — UI Methodology

> **Tek kural: Hard-coded stil yok.** Tüm görsel kararlar referans dosyalarından gelir.

Bu doküman, projenin tüm HTML sayfalarının nasıl yazılması gerektiğini tanımlar. Yeni bir sayfa eklerken, mevcut bir sayfayı düzenlerken **bu kurallara uyulur**.

---

## 1. Dosya Hiyerarşisi (Source of Truth)

```
styles/
  tokens.css        ← renk, spacing, radius, shadow, font değişkenleri (CSS vars)
  components.css    ← paylaşılan component sınıfları (.btn, .card, .input, vb.) + utility'ler
  <module>.css      ← sayfa/modül-spesifik stiller (örn: chatbot.css, login.css, home.css)

<module>.html       ← yalnızca yapı + sınıf referansları. ASLA <style> bloğu, ASLA inline style.
```

**Kural:** Bir HTML dosyasının `<head>` kısmı şöyle başlar — başka stil bağlantısı olamaz:
```html
<link rel="stylesheet" href="styles/tokens.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/<module>.css">
```

---

## 2. Yasaklar

| ❌ Yasak | ✅ Yerine |
|---|---|
| `<style>…</style>` HTML içinde | `styles/<module>.css` dosyasına taşı |
| `style="color: red;"` inline | yeni bir sınıf yarat veya utility kullan |
| `style="background: #e11d48"` | `var(--brand-600)` token'ı |
| Hex değer (`#ffffff`) | token (`var(--n-0)`) |
| `font-family: 'Inter', …` | `var(--font-sans)` |
| Magic number (`padding: 17px`) | scale (`4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32`) |

---

## 3. Token Sistemi

Tüm değerler `tokens.css`'te tanımlıdır. Yeni renk/spacing **eklenmeyecek** — eğer ihtiyaç varsa önce token tanımla, sonra kullan.

### Renk
- **Brand:** `--brand-50 … --brand-900` (kırmızı/crimson)
- **Neutral:** `--n-0 … --n-950`
- **Semantic:** `--success`, `--warning`, `--danger`, `--info` (+ `-bg` varyantları)
- **Surface:** `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--border`, `--border-strong`
- **Text:** `--text`, `--text-muted`, `--text-subtle`

### Spacing scale
`4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 / 32 / 40 / 48 / 56` px — sadece bunlar.

### Radius
`--r-xs (4) / --r-sm (6) / --r-md (8) / --r-lg (12) / --r-xl (16) / --r-2xl (20) / --r-full`

### Shadow
`--shadow-sm / --shadow-md / --shadow-lg / --shadow-xl / --shadow-focus`

### Font
- `--font-sans` → Geist (default)
- `--font-mono` → JetBrains Mono

---

## 4. Component Sınıfları

`components.css` aşağıdaki sınıfları sağlar. Yeni bir buton/input/card stillemiyoruz — bunları kullanıyoruz.

| Kategori | Sınıflar |
|---|---|
| **Logo** | `.am-logo` + `.agent` + `.metric` |
| **Button** | `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger` / `.btn-success` / `.btn-icon` · modifier'lar `.btn-sm` / `.btn-lg` |
| **Input** | `.input` / `.select` / `.textarea` |
| **Form** | `.switch[data-on]` / `.checkbox[data-on]` / `.segmented` |
| **Badge** | `.badge` + `.badge-primary/success/warning/danger/info` + `.badge-dot` |
| **Avatar** | `.avatar` |
| **Status** | `.status-dot.online/warn/offline/error` |
| **Card** | `.card` |
| **Chip** | `.chip` + `.chip-removable` |
| **Layout** | `.am-shell` / `.am-sidebar` / `.am-topbar` / `.am-main` |
| **Nav** | `.navitem[data-active]` |
| **Tabs** | `.tabs` + `.tab[data-active]` |

### Utility sınıflar
| Sınıf | Etkisi |
|---|---|
| `.t-mono` `.t-muted` `.t-subtle` `.t-truncate` | typography |
| `.row` | display: flex; align-items: center |
| `.gap-4 .gap-6 .gap-8 .gap-12 .gap-16` | flex/grid gap |
| `.spacer` | flex: 1 |
| `.divider` | 1px ayırıcı çizgi |
| `.w-full` `.h-full` | %100 boyut |
| `.mt-8 .mt-12 .mt-16 .mt-24 .mt-32` | margin-top scale |

State modifier'ları **`data-*` attribute** ile — ASLA `class="active"` ile değil:
```html
<button class="navitem" data-active="true">…</button>
<button class="switch" data-on="false"></button>
```

---

## 5. Sayfa-spesifik Stil Yazımı

Bir sayfa kendine özel layout ister (örn: login'in split panel'i, home'un grid'i).

**Doğru yaklaşım:**
1. `styles/<module>.css` dosyası aç
2. **Sayfa-spesifik prefix** ile sınıf yaz: `.login-…`, `.home-…`, `.chat-…`
3. Sınıfın içinde **yine token kullan** — magic number yok

```css
/* styles/login.css — DOĞRU */
.login-shell { min-height: 100vh; display: flex; justify-content: center; }
.login-panel { width: 100%; max-width: 560px; padding: 40px 56px; background: var(--bg); }
.login-title { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; color: var(--text); }
```

```html
<!-- DOĞRU -->
<div class="login-shell">
  <section class="login-panel">
    <h1 class="login-title">Sign in</h1>
  </section>
</div>

<!-- YANLIŞ -->
<div style="display: flex; min-height: 100vh; justify-content: center;">
  <section style="max-width: 560px; padding: 40px 56px;">
    <h1 style="font-size: 28px;">Sign in</h1>
  </section>
</div>
```

---

## 6. Code Review Kontrol Listesi

Yeni bir HTML dosyası mergelemeden önce:

- [ ] `<style>` bloğu **yok**
- [ ] `style="…"` inline attribute **yok**
- [ ] Hiçbir hex/rgb değeri **yok** (hepsi token)
- [ ] Hiçbir font-family literal **yok** (hepsi `var(--font-…)`)
- [ ] State'ler `data-*` ile yönetiliyor
- [ ] Yeni bir sayfa-spesifik stil eklenmişse `styles/<module>.css` dosyasına yazılmış
- [ ] `<head>` yalnızca: tokens.css → components.css → modül.css yüklüyor

---

## 7. Framework'e Aktarım (Claude Code, Next.js, vb.)

Bu yapı doğrudan modern framework'lere taşınır:

| HTML/CSS | Framework karşılığı |
|---|---|
| `tokens.css` | `globals.css` veya `theme.ts` |
| `components.css` | `<Button>`, `<Input>`, `<Badge>` componentleri |
| `<module>.css` | `app/<route>/<route>.module.css` veya Tailwind ile rewriting |
| `data-active="true"` | `aria-selected` / state prop |

**Token taşınması:**
- Tailwind kullanılırsa → `tailwind.config.ts > theme.extend.colors` içine `--brand-*` ve `--n-*` aktarılır
- shadcn/ui → `globals.css`'teki `--background`, `--foreground`, vb. CSS var'larını **bizim** token'larımızla map'le

---

## 8. Yeni Sayfa Eklerken Akış

1. Sayfanın layout'unu kafanda kur — hangi component'ler var?
2. Eksik component varsa **önce** `components.css`'e ekle, kullanım dokümante et
3. Sayfa-spesifik kısımlar için `styles/<module>.css` aç
4. HTML dosyasını yaz — yalnızca sınıflar
5. Bu kontrol listesini geç

---

**Bu doküman canlı bir referans.** Yeni bir component eklendiğinde bu dosya güncellenir. Yeni bir sayfa yazılırken bu dosya **önce okunur**.
