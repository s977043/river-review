Finding: Hero image has `loading="lazy"` — this defers the browser's fetch and is a likely LCP regression for above-the-fold content.

Evidence:

```diff
-      <img src="/hero.jpg" alt="..." width="1200" height="600" fetchpriority="high" />
+      <img src="/hero.jpg" alt="..." width="1200" height="600" loading="lazy" />
```

The diff removes `fetchpriority="high"` and adds `loading="lazy"`. For a hero image that is visible on initial load, `loading="lazy"` instructs the browser to delay the fetch until the image is near the viewport — but it is already in the viewport, so this serves no benefit and directly delays LCP.

Metric: LCP

Suggestion: Remove `loading="lazy"` and restore `fetchpriority="high"`. Optionally add `decoding="async"` to avoid blocking the main thread during image decode:

```html
<img src="/hero.jpg" alt="..." width="1200" height="600" fetchpriority="high" decoding="async" />
```

Reference: [MDN — HTMLImageElement.loading](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/loading), [web.dev — LCP](https://web.dev/lcp/)

Severity: minor
Confidence: high
