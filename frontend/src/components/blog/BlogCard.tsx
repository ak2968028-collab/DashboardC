import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { blogCoverUrl } from "@/lib/api";
import type { BlogPost } from "@/lib/types";

export const postDate = (p: BlogPost) =>
  new Date(p.published_at ?? p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Post card: cover (or a placeholder), category, title and excerpt. */
export default function BlogCard({ post }: { post: BlogPost }) {
  const cover = blogCoverUrl(post);
  return (
    <Link href={`/blog/${post.slug}`} className="blog-card">
      <div className="blog-card-cover">
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="blog-card-placeholder"><Newspaper size={34} /></span>}
        <span className="blog-chip">{post.category}</span>
        {!post.published && <span className="blog-chip draft">Draft</span>}
      </div>
      <div className="blog-card-body">
        <small>{postDate(post)}{post.author_name || post.author ? ` · ${post.author_name ?? post.author}` : ""}</small>
        <h3>{post.title}</h3>
        {post.excerpt && <p>{post.excerpt}</p>}
        <span className="blog-card-more">Read more <ArrowRight size={14} /></span>
      </div>
    </Link>
  );
}
