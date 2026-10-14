// Adds a small badge next to the issue title on github.com/*/*/issues/* pages.
// Defensive by design: any missing element or error leaves the page untouched.
(() => {
  const WEB_APP_URL = 'https://github.com/EvanGUTK/Contributor';
  const BADGE_ID = 'contributor-ext-badge';
  const TITLE_SELECTORS = ['bdi.js-issue-title', '[data-testid="issue-title"]', 'h1'];

  function findTitle() {
    for (const selector of TITLE_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function addBadge() {
    try {
      if (!document.body || document.getElementById(BADGE_ID)) return;
      const title = findTitle();
      if (!title || !title.parentNode) return;

      const badge = document.createElement('a');
      badge.id = BADGE_ID;
      badge.href = WEB_APP_URL;
      badge.target = '_blank';
      badge.rel = 'noopener noreferrer';
      badge.textContent = '◇ Contributor: open web app to find similar issues';
      Object.assign(badge.style, {
        display: 'inline-block',
        marginLeft: '8px',
        padding: '2px 8px',
        border: '1px solid currentColor',
        borderRadius: '999px',
        font: '12px/1.5 system-ui, sans-serif',
        color: 'inherit',
        textDecoration: 'none',
        verticalAlign: 'middle',
      });
      title.insertAdjacentElement('afterend', badge);
    } catch {
      // Never break the host page.
    }
  }

  addBadge();
  // GitHub navigates without full reloads; retry after in-app navigation.
  document.addEventListener('turbo:render', addBadge);
})();
