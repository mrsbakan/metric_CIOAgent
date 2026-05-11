/* AgentMetric — Topbar web component
   Usage:
     <app-topbar variant="home" greeting="Good afternoon, Satılmış"
                 sub="Wednesday · 7 May · 14:22"
                 cta="New conversation" cta-href="chatbot.html"></app-topbar>
     <app-topbar variant="chat" title="Conversation · CRM Migration risk review"
                 status-text="agent · ready" status-tone="online"></app-topbar>

   Variants: home | chat | plain
*/
(function () {
  const ICONS = {
    search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    bell:   '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
    plus:   '<path d="M12 5v14M5 12h14"/>',
    panel:  '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    share:  '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>',
    more:   '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  };
  const SVG = (paths, w = 16) =>
    `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${paths}</svg>`;

  class AppTopbar extends HTMLElement {
    static get observedAttributes() {
      return ['variant', 'greeting', 'sub', 'title', 'cta', 'cta-href',
              'status-text', 'status-tone', 'show-search', 'show-bell'];
    }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }

    render() {
      const variant = this.getAttribute('variant') || 'home';
      const showSearch = this.getAttribute('show-search') !== 'false';
      const showBell   = this.getAttribute('show-bell')   !== 'false';

      const searchBlock = showSearch ? `
        <div class="qsearch">
          ${SVG(ICONS.search, 14).replace('<svg ', '<svg class="s-icon" ')}
          <input placeholder="Search anything · ask the agent · jump to…" />
          <kbd>⌘K</kbd>
        </div>` : '';

      const bellBlock = showBell ? `
        <button class="btn btn-icon btn-sm btn-ghost btn-bell" title="Notifications" data-action="toggle-notifications">
          ${SVG(ICONS.bell, 16)}
          <span class="bell-dot"></span>
        </button>` : '';

      if (variant === 'home') {
        const greeting = this.getAttribute('greeting') || 'Good afternoon';
        const sub      = this.getAttribute('sub')      || '';
        const cta      = this.getAttribute('cta')      || 'New conversation';
        const ctaHref  = this.getAttribute('cta-href') || 'chatbot.html';

        this.innerHTML = `
          <header class="home-topbar">
            <div class="greeting">
              <span class="hello">${greeting}</span>
              ${sub ? `<span class="when">${sub}</span>` : ''}
            </div>
            <div class="spacer"></div>
            ${searchBlock}
            ${bellBlock}
            <a class="btn btn-secondary btn-sm" href="${ctaHref}">
              ${SVG(ICONS.plus, 12)}
              ${cta}
            </a>
          </header>
        `;
      } else if (variant === 'chat') {
        const title      = this.getAttribute('title')       || 'Conversation';
        const statusText = this.getAttribute('status-text') || 'agent · ready';
        const statusTone = this.getAttribute('status-tone') || 'online';

        this.innerHTML = `
          <header class="chat-topbar">
            <button class="btn btn-icon btn-sm btn-ghost" title="Toggle threads" data-action="toggle-threads">
              ${SVG(ICONS.panel, 14)}
            </button>
            <div class="title-block">
              <h2 class="title">${title}</h2>
              <div class="status">
                <span class="status-dot ${statusTone}"></span>
                <span>${statusText}</span>
              </div>
            </div>
            <div class="spacer"></div>
            ${bellBlock}
            <button class="btn btn-secondary btn-sm" title="Share">
              ${SVG(ICONS.share, 12)}
              Share
            </button>
            <button class="btn btn-icon btn-sm btn-ghost" title="More">
              ${SVG(ICONS.more, 14)}
            </button>
          </header>
        `;
      } else {
        // plain — just a title
        const title = this.getAttribute('title') || '';
        this.innerHTML = `
          <header class="plain-topbar">
            <h2 class="title">${title}</h2>
            <div class="spacer"></div>
            ${searchBlock}
            ${bellBlock}
          </header>
        `;
      }

      const bell = this.querySelector('[data-action="toggle-notifications"]');
      if (bell) bell.addEventListener('click', () => {
        const panel = document.querySelector('app-notifications-panel');
        if (panel) panel.toggleAttribute('open');
        else this.dispatchEvent(new CustomEvent('topbar:bell', { bubbles: true }));
      });
    }
  }
  customElements.define('app-topbar', AppTopbar);
})();
