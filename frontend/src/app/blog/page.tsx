"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Newspaper, PenSquare } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import BlogCard from "@/components/blog/BlogCard";
import { useBlogPosts, useManagedPosts } from "@/lib/api";

export default function BlogPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: published = [], isLoading } = useBlogPosts();
  const { data: managed } = useManagedPosts(isAdmin);
  const posts = isAdmin && managed ? managed : published;
  const [category, setCategory] = useState("All");
  const categories = useMemo(() => ["All", ...new Set(posts.map((p) => p.category))], [posts]);
  const shown = category === "All" ? posts : posts.filter((p) => p.category === category);

  return (
    <div className="blog-page">
      {/* Title and description come from the page hero; this row holds the filters and the admin action. */}
      <div className="blog-head">
        <div className="blog-filters" role="group" aria-label="Category">
          {categories.length > 2 && categories.map((c) => (
            <button key={c} type="button" className={`lab-chip ${c === category ? "active" : ""}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        {isAdmin && <Link href="/blog/new" className="btn primary"><PenSquare size={16} /> New post</Link>}
      </div>
      {isLoading ? <div className="loading">Loading posts…</div> : shown.length ? (
        <div className="blog-grid">{shown.map((p) => <BlogCard key={p.id} post={p} />)}</div>
      ) : (
        <div className="blog-empty">
          <Newspaper size={36} />
          <p>No posts yet.{isAdmin ? " Write the first one with “New post”." : " Check back soon."}</p>
        </div>
      )}
    </div>
  );
}
