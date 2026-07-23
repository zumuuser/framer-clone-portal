/**
 * Fixed bottom beta mark — irregular silhouette + slight tilt.
 * Theme-aware; never steals focus from primary UI.
 */
export function BetaBanner() {
  return (
    <div className="beta-banner" aria-label="Beta software">
      <div className="beta-banner__shard">
        <span className="beta-banner__label">Beta</span>
        <span className="beta-banner__tick" aria-hidden="true" />
      </div>
    </div>
  );
}
