// On github.com/*/*/issues/* pages, fetches the issue from the public GitHub API
// (anonymous, no key) and shows a small Contributor score badge in the sidebar.
// Defensive by design: any error, missing element or zero score leaves the page untouched.
(() => {
  const WEB_APP_URL = 'https://contributor-7cw.pages.dev/#discover';
  const BADGE_ID = 'contributor-ext-badge';
  const ISSUE_PATH = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;
  const MAX_SCORE = 60;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Tracks the issue currently shown so a slow response for a previous page is dropped.
  let activeKey = null;

  function parseIssueUrl(href) {
    const match = ISSUE_PATH.exec(href);
    if (!match) return null;
    return { owner: match[1], repo: match[2], number: match[3] };
  }

  // Minimal inline copy of the relevance scoring (content scripts cannot import modules).
  function scoreIssue(issue, now = Date.now()) {
    const labels = (issue.labels || [])
      .map((l) => (typeof l === 'string' ? l : l && l.name) || '')
      .map((name) => name.toLowerCase());
    const reasons = [];
    let score = 0;

    if (labels.some((n) => n.includes('good first issue') || n.includes('beginner'))) {
      score += 30;
      reasons.push('Good first issue');
    }
    if (labels.some((n) => n.includes('help wanted'))) {
      score += 15;
      reasons.push('Help wanted');
    }
    const updated = Date.parse(issue.updated_at);
    if (!Number.isNaN(updated)) {
      const ageDays = (now - updated) / DAY_MS;
      if (ageDays <= 30) {
        score += 15;
        reasons.push('Recently active');
      } else if (ageDays <= 90) {
        score += 8;
        reasons.push('Active this quarter');
      }
    }
    return { score: Math.min(score, MAX_SCORE), reasons };
  }

  function removeBadge() {
    const existing = document.getElementById(BADGE_ID);
    if (existing) existing.remove();
  }

  function buildBadge({ score, reasons }) {
    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    Object.assign(badge.style, {
      background: '#191a1b',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px',
      padding: '12px 16px',
      marginBottom: '8px',
      color: '#f7f8f8',
      font: '13px/1.5 system-ui, sans-serif',
    });

    const header = document.createElement('div');
    header.textContent = '◇ Contributor';
    Object.assign(header.style, {
      fontSize: '12px',
      color: '#8a8f98',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      marginBottom: '8px',
    });

    const track = document.createElement('div');
    Object.assign(track.style, {
      background: 'rgba(255,255,255,0.08)',
      borderRadius: '999px',
      height: '6px',
      overflow: 'hidden',
      marginBottom: '8px',
    });
    const fill = document.createElement('div');
    fill.setAttribute('role', 'meter');
    fill.setAttribute('aria-valuemin', '0');
    fill.setAttribute('aria-valuemax', String(MAX_SCORE));
    fill.setAttribute('aria-valuenow', String(score));
    fill.setAttribute('aria-label', 'Contributor match score');
    Object.assign(fill.style, {
      width: `${Math.round((score / MAX_SCORE) * 100)}%`,
      height: '100%',
      background: score >= 45 ? '#27a644' : score >= 25 ? '#5e6ad2' : '#8a8f98',
    });
    track.appendChild(fill);

    const label = document.createElement('div');
    label.textContent = `${score}/${MAX_SCORE} · ${reasons.join(' · ')}`;
    Object.assign(label.style, { marginBottom: '8px' });

    const link = document.createElement('a');
    link.href = WEB_APP_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Find similar issues ↗';
    Object.assign(link.style, { color: '#7170ff', textDecoration: 'none', fontSize: '12px' });

    badge.append(header, track, label, link);
    return badge;
  }

  function mountBadge(badge) {
    const sidebar = document.querySelector('.discussion-sidebar');
    if (sidebar) {
      sidebar.insertBefore(badge, sidebar.firstChild);
      return;
    }
    // Fallback: float over the page so the badge is still reachable.
    Object.assign(badge.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      maxWidth: '280px',
    });
    document.body.appendChild(badge);
  }

  async function update() {
    const issueRef = parseIssueUrl(location.href);
    if (!issueRef) {
      activeKey = null;
      removeBadge();
      return;
    }
    const { owner, repo, number } = issueRef;
    const key = `${owner}/${repo}#${number}`;
    if (key === activeKey && document.getElementById(BADGE_ID)) return;
    activeKey = key;
    removeBadge();

    try {
      const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`;
      const res = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) return;
      const issue = await res.json();
      if (activeKey !== key || !document.body) return;

      const result = scoreIssue(issue);
      if (result.score <= 0) return;
      removeBadge();
      mountBadge(buildBadge(result));
    } catch {
      // Never break the host page; no badge if the API is unreachable or rate-limited.
    }
  }

  update();
  // GitHub navigates without full reloads; re-run after in-app navigation.
  document.addEventListener('turbo:render', update);
})();
