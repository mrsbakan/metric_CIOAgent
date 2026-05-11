/* AgentMetric — Footer bar (used in login + auth pages)
   Usage: <app-footer-bar variant="login"></app-footer-bar>
*/
(function () {
  class AppFooterBar extends HTMLElement {
    static get observedAttributes() { return ['variant', 'version']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }

    render() {
      const variant = this.getAttribute('variant') || 'login';
      const version = this.getAttribute('version') || 'v2.4.1';

      this.innerHTML = `
        <footer class="${variant}-foot">
          <span>© 2026 AgentMetric · ${version}</span>
          <div class="links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Status</a>
            <a href="#">Self-host docs</a>
          </div>
        </footer>
      `;
    }
  }
  customElements.define('app-footer-bar', AppFooterBar);
})();
