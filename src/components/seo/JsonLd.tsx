import { BlogPost } from '@/types';

export function OrganizationJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KumoLab',
    url: 'https://kumolab-anime.com',
    logo: 'https://kumolab-anime.com/kumolab-logo.png',
    sameAs: [
      'https://x.com/KumoLabAnime',
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function WebSiteJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'KumoLab',
    url: 'https://kumolab-anime.com',
    description: 'Daily anime updates, verified news, release dates, trailers, and industry intel - without the noise.',
    publisher: {
      '@type': 'Organization',
      name: 'KumoLab',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function ArticleJsonLd({ post }: { post: BlogPost }) {
  const baseUrl = 'https://kumolab-anime.com';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.seoTitle || post.title,
    description: post.metaDescription || post.excerpt || '',
    image: post.image ? (post.image.startsWith('http') ? post.image : `${baseUrl}${post.image}`) : `${baseUrl}/kumolab-logo.png`,
    datePublished: post.timestamp,
    dateModified: post.updated_at || post.timestamp,
    author: {
      '@type': 'Organization',
      name: 'KumoLab',
      url: baseUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: 'KumoLab',
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/kumolab-logo.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${baseUrl}/blog/${post.slug}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
