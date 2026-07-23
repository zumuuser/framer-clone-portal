/**
 * FramerClone brand mark — light logo only (site-wide).
 * WebP first, PNG fallback. Works on light and dark UI.
 */
type BrandLogoProps = {
  /** Display width in CSS pixels (default hero size) */
  width?: number;
  className?: string;
  priority?: boolean;
  /** Layout alignment of the mark */
  align?: "center" | "start";
};

export function BrandLogo({
  width = 360,
  className = "",
  priority = false,
  align = "center",
}: BrandLogoProps) {
  const alignClass = align === "start" ? "mr-auto" : "mx-auto";

  return (
    <div
      className={`flex w-full justify-center ${alignClass} ${className}`}
      style={{ maxWidth: width }}
    >
      <picture className="block w-full">
        <source srcSet="/framerclonelogolight.webp" type="image/webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/framerclonelogolight.png"
          alt="FramerClone"
          width={720}
          height={402}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          className="h-auto w-full object-contain"
        />
      </picture>
    </div>
  );
}
