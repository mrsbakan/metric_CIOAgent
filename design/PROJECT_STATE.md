# CIOAgent — Project State

> Last updated: 11 May 2026
> Read this **before** doing any work. Update it **after** every milestone.
> Session geçmişi için: `SESSION_LOG.md`
> Yeni chat protokolü için: `frontend_start_prompt.md`

---

## 🎯 Vizyon (özet)

**CIO Agent** = on-prem, müşterinin kendi tenant'ında çalışan kurumsal AI orchestration platformu.
**Tek uygulama: AgentMetric Studio.** Ayrı admin paneli yok — tüm konfigürasyon Studio içinden.
**Dil:** Türkçe (kullanıcıyla iletişim) · UI metinleri İngilizce.
**Brand:** "agent" (kırmızı/rose-600) + "metric" (siyah), düz metin wordmark, ikon yok.

---

## ✅ Tamamlanan modüller

| Modül | Dosya | Durum |
|---|---|---|
| Design System | `design-system.html` | ✅ Token + component galerisi |
| Login | `login.html` | ✅ 4 state: signin / mfa / sso / forgot · tek panel, sağ panel yok |
| Home (internal landing) | `home.html` | ✅ Greeting · ask-agent · alerts · KPIs · approvals · activity |
| ChatBot | `chatbot.html` | ✅ 3 kolon: threads · stream · context panel |

---

## 🚧 Bekleyen modüller

1. **Approvals & Pending Actions** — onay kuyruğu, detay, approve/edit/reject
2. **Dashboard** — agent metrikleri, trend grafikleri
3. **Configuration** — Users · Roles · Prompts · Skills · Alerts · Connectors (tabbed)
4. **Knowledge Base** — kaynak dokümanlar, sync, RAG indexing
5. **System** — License & Usage · Apply Token · Audit Log
6. **User Settings** — profil, MFA, oturumlar
7. **ChatBot embed widget** — iframe için kompakt versiyon

**Önerilen sıra:** Approvals → Dashboard → Configuration → KB → System → Settings → Embed.

---

## 🧱 Altyapı

### Stil katmanı (`styles/`)
- `tokens.css` — renk, spacing, radius, shadow, font CSS değişkenleri
- `components.css` — `.btn`, `.input`, `.badge`, `.chip`, `.navitem`, `.card`, utility'ler
- `layout-components.css` — web component host stilleri
- `notifications.css` — drawer
- `login.css`, `home.css`, `chatbot.css` — sayfa-özel

### Web component'ler (`components/`)
| Component | Attribute API |
|---|---|
| `<app-sidebar>` | `active`, `collapsed`, `user-name`, `user-role`, `user-initials` |
| `<app-topbar>` | `variant` (home/chat/plain), `greeting`, `sub`, `title`, `cta`, `cta-href`, `status-text`, `status-tone`, `show-search`, `show-bell` |
| `<app-notifications-panel>` | `open` (boolean attr — toggle ile aç/kapa) |
| `<app-footer-bar>` | `variant` (login), `version` |

### Sidebar `active=` değerleri
`home` · `chat` · `dashboard` · `approvals` · `kb` · `users` · `prompts` · `alerts` · `connectors` · `license` · `audit` · `settings`

---

## 📐 Methodology özeti (tam hali: `METHODOLOGY.md`)

- ❌ `<style>` bloğu HTML içinde
- ❌ `style="…"` inline attribute
- ❌ Hex/rgb/font literal — hepsi token
- ❌ Magic number — spacing scale: 4/6/8/10/12/14/16/20/24/28/32/40/48/56
- ✅ State'ler `data-*` ile (örn: `data-active="true"`)
- ✅ Sayfa-spesifik stil → `styles/<module>.css`
- ✅ Tekrarlanan layout → web component

### Yeni sayfa iskeleti
```html
<head>
  <link rel="stylesheet" href="styles/tokens.css">
  <link rel="stylesheet" href="styles/components.css">
  <link rel="stylesheet" href="styles/layout-components.css">
  <link rel="stylesheet" href="styles/notifications.css">
  <link rel="stylesheet" href="styles/<module>.css">
</head>
<body>
<div class="<module>-shell" data-screen-label="<Module>">
  <app-sidebar active="<id>"></app-sidebar>
  <main>
    <app-topbar variant="home" greeting="..." cta="..."></app-topbar>
    <!-- content -->
  </main>
</div>
<app-notifications-panel></app-notifications-panel>
<script src="components/sidebar.js"></script>
<script src="components/topbar.js"></script>
<script src="components/notifications-panel.js"></script>
</body>
```

---

## 🗝️ Kararlar (locked)

- Tek uygulama (AgentMetric Studio) — ayrı CIO admin sayfası yok
- Ayrı ayrı `.html` dosyaları — SPA değil
- Responsive: desktop-first, sonra mobile
- Logo: metin "agent" (rose-600) + "metric" (siyah), ikon yok
- Renk paleti: rose-600 primary
- Font: Geist (default), Inter / Manrope / Space Grotesk tweak'lenebilir
- Design context: müşterinin kullanacağı agent arayüzleri (login → dashboard → alerts → escalations → insights)
