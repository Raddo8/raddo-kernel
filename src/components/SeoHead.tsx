import { Helmet } from "react-helmet-async";

const SITE_ORIGIN = "https://chiefofbusiness.ai";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

type SeoHeadProps = {
  title: string;
  description: string;
  /** Route path beginning with "/". Used for canonical + og:url. */
  path: string;
  /** Robots directive. Omit for default (index,follow). */
  robots?: "noindex,follow" | "noindex,nofollow";
  /** Shorthand · emits `noindex, nofollow` when true. */
  noindex?: boolean;
  ogImage?: string;
};

export function SeoHead({
  title,
  description,
  path,
  robots,
  noindex,
  ogImage = DEFAULT_OG_IMAGE,
}: SeoHeadProps) {
  const url = `${SITE_ORIGIN}${path}`;
  const robotsValue = noindex ? "noindex, nofollow" : robots;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {robotsValue ? <meta name="robots" content={robotsValue} /> : null}

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
