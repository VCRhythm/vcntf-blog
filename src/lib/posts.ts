import { getCollection } from 'astro:content';

// Drafts (`draft: true` in frontmatter) are hidden from production builds
// (and therefore from ./deploy.sh) but still visible under `astro dev`.
export async function getPosts() {
  return getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
}

export async function getSortedPosts() {
  return (await getPosts()).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
