/**
 * Fixed, non-interactive atmospheric layer.
 * Light painting in light theme, dark painting in dark theme.
 * Heavy blur + ~80% theme veil — mood only, never competes with UI.
 */
export function AtmosphereBg() {
  return (
    <div className="atmosphere-bg" aria-hidden="true">
      <div className="atmosphere-bg__paint atmosphere-bg__paint--light" />
      <div className="atmosphere-bg__paint atmosphere-bg__paint--dark" />
      <div className="atmosphere-bg__veil" />
    </div>
  );
}
