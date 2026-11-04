"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { mutate } from "swr";
import { useAuth } from "@/components/AuthContext";
import BlogBody from "@/components/blog/BlogBody";
import { postDate } from "@/components/blog/BlogCard";
import { blogCoverUrl, errorText, sendApi, useBlogPost } from "@/lib/api";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: post, error, isLoading } = useBlogPost(slug, isAdmin);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div className="loading">Loading post…</div>;
  if (error || !post) {
    return (
      <div className="blog-empty">
        <p>This post could not be found.</p>
        <Link href="/blog" className="btn"><ArrowLeft size={14} /> All posts</Link>
      </div>
    );
  }
  const cover = blogCoverUrl(post);

  const remove = async () => {
    if (!confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await sendApi("DELETE", `/api/blog/${post.id}`);
      await mutate((key) => typeof key === "string" && key.startsWith("/api/blog"));
      router.push("/blog");
    } catch (err) {
      alert(errorText(err));
      setBusy(false);
    }
  };

  return (
    <article className="blog-article">
      <Link href="/blog" className="blog-back"><ArrowLeft size={14} /> All posts</Link>
      <div className="blog-article-meta">
        <span className="blog-chip">{post.category}</span>
        {!post.published && <span className="blog-chip draft">Draft · only admins can see this</span>}
        <span>{postDate(post)}</span>
        {(post.author_name || post.author) && <span>· {post.author_name ?? post.author}</span>}
      </div>
      <h1>{post.title}</h1>
      {post.excerpt && <p className="blog-lead">{post.excerpt}</p>}
      {cover && <img className="blog-article-cover" src={cover} alt="" />}
      <BlogBody body={post.body} />
      {isAdmin && (
        <div className="blog-admin-bar">
          <Link href={`/blog/${post.slug}/edit`} className="btn"><Pencil size={14} /> Edit</Link>
          <button type="button" className="btn danger" onClick={remove} disabled={busy}><Trash2 size={14} /> Delete</button>
        </div>
      )}
    </article>
  );
}
