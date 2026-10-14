# Accessibility requirements

- Search controls have visible labels, accessible mode radio grouping and keyboard-only operation.
- Query feedback uses `role=status` + `aria-live=polite` to announce results and rate limits.
- Result links are standard accessible anchors to GitHub with distinguishable titles; CTA and copy prompt buttons have meaningful text.
- Relevance is given numerically and explained in text; color is not the only indicator.
- Layout adapts to narrow screens and supports zoom/high contrast.
- Use reduced motion preference for future animation; keep decorative background behind content.

## Release gate

Keyboard-only walkthrough, mobile viewport checks, axe/Lighthouse audit, color contrast evaluation, one screen reader walkthrough for discover/find/copy and confirmation that no hidden modal intercepts focus. Note that these tests have not yet been completed in a real browser for this alpha.
