import Image from "next/image";

/**
 * The Mr Mailer identity, as generated PNGs.
 *
 * `scripts/generate-brand-assets.mjs` derives every file used here from
 * `public/mr-mailer-logo.png`, which is the only source of truth:
 *
 *   logo-lockup.png  920x636   mascot stacked over the wordmark
 *   logo-mascot.png  740x535   the mascot on its own (watermark)
 *   logo-mark.png    256x256   square mascot crop (app header)
 *
 * Two things drive the design of this component.
 *
 * The artwork is ~67% dark navy on transparency, so it needs a light plate
 * wherever the surface is dark. That is what `tile` and the `--logo-tile-bg`
 * token are for: the token is transparent in the light theme and a light plate
 * in both dark paths, so the same component works in each without knowing which
 * one it is in. A page with its own dark background sets the token locally.
 *
 * Nothing here can distort the artwork. The wrapper takes its height from the
 * image's own aspect ratio via `aspect-ratio`, and the image is drawn with
 * `object-fit: contain`, so a wrong `size` can only ever produce transparent
 * padding — never a stretched mascot.
 */
type LogoProps = {
  /** Rendered width. A number is px; a string is used verbatim, e.g. "100%". */
  size: number | string;
  /** Light plate behind the artwork, for dark surfaces. Off for the watermark. */
  tile?: boolean;
  /** Only for the logo that is a page's LCP image. */
  priority?: boolean;
  className?: string;
  alt?: string;
};

function Plate({
  src,
  naturalWidth,
  naturalHeight,
  size,
  tile = true,
  priority = false,
  className,
  alt,
  sizes,
  padRatio,
  radiusRatio,
}: Omit<LogoProps, "alt"> & {
  src: string;
  alt: string;
  naturalWidth: number;
  naturalHeight: number;
  sizes: string;
  padRatio: number;
  radiusRatio: number;
}) {
  // Percentages resolve against the width for both padding and radius, so one
  // ratio works for any `size` without a separate code path for numbers.
  const pad = tile ? `${padRatio * 100}%` : 0;
  const radius = `${radiusRatio * 100}%`;

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        lineHeight: 0,
        width: size,
        aspectRatio: `${naturalWidth} / ${naturalHeight}`,
        boxSizing: "border-box",
        padding: pad,
        // The lockup is a wide card, so its radius is a fraction of its width;
        // a percentage radius on the square mark reads as a rounded square.
        borderRadius: radius,
        background: tile ? "var(--logo-tile-bg, transparent)" : "transparent",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={naturalWidth}
        height={naturalHeight}
        priority={priority}
        sizes={sizes}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
    </span>
  );
}

/** Mascot over wordmark. The hero lockup: landing page and login page. */
export function MrMailerLogo({ alt = "Mr Mailer", ...props }: LogoProps) {
  return (
    <Plate
      {...props}
      src="/logo-lockup.png"
      naturalWidth={1129}
      naturalHeight={780}
      alt={alt}
      sizes="(max-width: 640px) 88vw, 460px"
      padRatio={0.05}
      radiusRatio={0.075}
    />
  );
}

/**
 * The whole mascot, uncropped. Only the watermark uses this — it is 740x535, so
 * it is far too wide to sit inline in a header.
 */
export function MrMailerMascot({ alt = "", ...props }: LogoProps) {
  return (
    <Plate
      {...props}
      src="/logo-mascot.png"
      naturalWidth={740}
      naturalHeight={535}
      alt={alt}
      sizes="560px"
      padRatio={0}
      radiusRatio={0}
    />
  );
}

/**
 * The square mascot crop on its own, for the app header.
 *
 * This is the character rather than the monogram, so it is recognisably the same
 * artwork as the favicon without being legible at favicon sizes — see the note
 * in the generator about the mascot having no discernible face at 16px.
 */
export function MrMailerMark({ alt = "Mr Mailer", ...props }: LogoProps) {
  return (
    <Plate
      {...props}
      src="/logo-mark.png"
      naturalWidth={320}
      naturalHeight={320}
      alt={alt}
      sizes="48px"
      padRatio={0.08}
      radiusRatio={0.2}
    />
  );
}
