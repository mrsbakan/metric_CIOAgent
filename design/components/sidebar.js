/* AgentMetric — Sidebar web component
   Usage: <app-sidebar active="home" collapsed></app-sidebar>
   Active values: home | chat | dashboard | approvals | kb |
                  users | prompts | alerts | connectors |
                  license | audit | settings
*/
(function () {
  const NAV_PRIMARY = [
    { id: 'home',      href: 'home.html',           label: 'Home',
      icon: '<path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/>' },
    { id: 'chat',      href: 'chatbot.html',        label: 'ChatBot',
      icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    { id: 'dashboard', href: 'dashboard.html',      label: 'Dashboard',
      icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
    { id: 'approvals', href: 'approvals.html',      label: 'Approvals', badge: '12',
      icon: '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
    { id: 'kb',        href: 'knowledge-base.html', label: 'Knowledge Base',
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>' },
  ];

  const NAV_CONFIG = [
    { id: 'users',      href: 'configuration.html',             label: 'Users & Roles',
      icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>' },
    { id: 'prompts',    href: 'configuration.html#prompts',     label: 'Prompts & Skills',
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>' },
    { id: 'alerts',     href: 'configuration.html#alerts',      label: 'Alerts & Escalation',
      icon: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M13.73 21a2 2 0 0 1-3.46 0"/>' },
    { id: 'connectors', href: 'configuration.html#connectors',  label: 'Connectors',
      icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' },
  ];

  const NAV_SYSTEM = [
    { id: 'license', href: 'system.html',          label: 'License & Usage',
      icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
    { id: 'audit',   href: 'system.html#audit',    label: 'Audit Log',
      icon: '<path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/>' },
  ];

  const SVG = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${paths}</svg>`;

  const item = (def, active) => {
    const isActive = def.id === active;
    const tag = isActive ? 'div' : 'a';
    const href = isActive ? '' : ` href="${def.href}"`;
    const dataActive = isActive ? ' data-active="true"' : '';
    const badge = def.badge
      ? ` <span class="badge badge-primary">${def.badge}</span>`
      : '';
    return `<${tag} class="navitem"${href}${dataActive}>${SVG(def.icon)}${def.label}${badge}</${tag}>`;
  };

  class AppSidebar extends HTMLElement {
    static get observedAttributes() { return ['active', 'collapsed']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }

    render() {
      const active = this.getAttribute('active') || '';
      const collapsed = this.hasAttribute('collapsed');
      const userName = this.getAttribute('user-name') || 'Satılmış Bakan';
      const userRole = this.getAttribute('user-role') || 'CIO · Power user';
      const userInitials = this.getAttribute('user-initials') || 'SB';

      this.innerHTML = `
        <aside class="am-sidebar${collapsed ? ' collapsed' : ''}">
          <div class="am-sidebar-head">
            <a href="home.html" class="am-logo"><span class="agent">agent</span><span class="metric">metric</span></a>
            <button class="btn btn-icon btn-sm btn-ghost" title="Collapse" data-action="collapse">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
            </button>
          </div>

          <nav>
            ${NAV_PRIMARY.map(d => item(d, active)).join('')}
            <div class="am-sidebar-section">Configuration</div>
            ${NAV_CONFIG.map(d => item(d, active)).join('')}
            <div class="am-sidebar-section">System</div>
            ${NAV_SYSTEM.map(d => item(d, active)).join('')}
          </nav>

          <div class="am-sidebar-foot">
            <span class="avatar">${userInitials}</span>
            <div class="meta">
              <div class="name t-truncate">${userName}</div>
              <div class="role">${userRole}</div>
            </div>
            <a class="btn btn-icon btn-sm btn-ghost" title="Settings" href="settings.html">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </a>
          </div>
        </aside>
      `;

      const collapseBtn = this.querySelector('[data-action="collapse"]');
      if (collapseBtn) collapseBtn.addEventListener('click', () => this.toggleAttribute('collapsed'));
    }
  }
  customElements.define('app-sidebar', AppSidebar);
})();
