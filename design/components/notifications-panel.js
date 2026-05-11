/* AgentMetric — Notifications drawer (right-edge slide-in)
   Usage: <app-notifications-panel></app-notifications-panel>
   Open via attribute: panel.setAttribute('open', '') or panel.toggleAttribute('open')
*/
(function () {
  const FEED = [
    { tone: 'critical', when: '2m ago',  title: 'PROJ-118 risk score crossed 0.80',
      meta: 'Auto-escalation pending your approval' },
    { tone: 'warning',  when: '14m ago', title: 'ServiceNow connector p95 above 2s',
      meta: 'Degraded · 3 retries' },
    { tone: 'info',     when: '32m ago', title: 'Morning digest is ready',
      meta: '12 new items · 4 actions suggested' },
    { tone: 'info',     when: '1h ago',  title: 'Approval timed out: IT-2041',
      meta: 'Re-queued for tomorrow 09:00' },
    { tone: 'info',     when: '3h ago',  title: 'New skill installed: jira.bulk_close',
      meta: 'By admin@acme-corp.com' },
  ];

  class AppNotificationsPanel extends HTMLElement {
    static get observedAttributes() { return ['open']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }

    render() {
      const isOpen = this.hasAttribute('open');
      this.innerHTML = `
        <div class="notif-overlay" data-open="${isOpen}" data-action="close"></div>
        <aside class="notif-drawer" data-open="${isOpen}" role="dialog" aria-label="Notifications">
          <header class="notif-head">
            <h3>Notifications</h3>
            <div class="spacer"></div>
            <button class="btn btn-ghost btn-sm">Mark all read</button>
            <button class="btn btn-icon btn-sm btn-ghost" data-action="close" title="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </header>
          <div class="notif-tabs">
            <button data-active="true">All <span class="count">${FEED.length}</span></button>
            <button>Critical <span class="count">${FEED.filter(f=>f.tone==='critical').length}</span></button>
            <button>Mentions</button>
          </div>
          <div class="notif-list">
            ${FEED.map(f => `
              <div class="notif-item">
                <span class="dot t-${f.tone}"></span>
                <div class="body">
                  <div class="title">${f.title}</div>
                  <div class="meta">${f.meta}</div>
                </div>
                <span class="when">${f.when}</span>
              </div>
            `).join('')}
          </div>
          <footer class="notif-foot">
            <a href="#" class="link-brand">Notification settings</a>
          </footer>
        </aside>
      `;

      this.querySelectorAll('[data-action="close"]').forEach(el =>
        el.addEventListener('click', () => this.removeAttribute('open'))
      );
    }
  }
  customElements.define('app-notifications-panel', AppNotificationsPanel);
})();
