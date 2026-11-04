"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, ImagePlus, Save, X } from "lucide-react";
import useSWR, { mutate } from "swr";
import { useAuth } from "@/components/AuthContext";
import { blogCoverUrl, errorText, fetcher, sendApi } from "@/lib/api";
import type { BlogPostDetails } from "@/lib/types";
import BlogBody from "./BlogBody";

const HELP = "Blank line = new paragraph · ## Heading · - bullet · 1. numbered · > quote · **bold** · [text](https://link)";

/** Admin form for writing or editing a post; `post` is the existing post when editing. */
export default function BlogEditor({ post }: { post?: BlogPostDetails }) {
  const router = useRouter();
  const { user } = useAuth();
  const { data: categories = ["Update"] } = useSWR<string[]>("/api/blog/categories", fetcher);
  const [title, setTitle] = useState(post?.title ?? "");
  const [category, setCategory] = useState(post?.category ?? "Update");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [published, setPublished] = useState(post?.published ?? false);
  const [cover, setCover] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!cover) return setCoverUrl(null);
    const url = URL.createObjectURL(cover);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  if (user?.role !== "admin") {
    return <div className="blog-empty"><p>Only admins can write blog posts.</p><Link href="/login" className="btn">Sign in</Link></div>;
  }
  const existingCover = post && !removeCover && post.published ? blogCoverUrl(post) : null;
  const shownCover = coverUrl ?? existingCover;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("category", category);
      form.append("excerpt", excerpt);
      form.append("body", body);
      form.append("published", String(published));
      if (cover) form.append("cover", cover);
      if (post && removeCover) form.append("remove_cover", "true");
      const saved = await sendApi<BlogPostDetails>(post ? "PUT" : "POST", post ? `/api/blog/${post.id}` : "/api/blog", form);
      await mutate((key) => typeof key === "string" && key.startsWith("/api/blog"));
      router.push(`/blog/${saved.slug}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="blog-editor" onSubmit={submit}>
      <Link href={post ? `/blog/${post.slug}` : "/blog"} className="blog-back"><ArrowLeft size={14} /> Back</Link>
      <h1>{post ? "Edit post" : "New post"}</h1>
      <label className="field"><span>Title *</span>
        <input required minLength={3} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Clean cooking survey in Harahua block" />
      </label>
      <div className="blog-editor-row">
        <label className="field"><span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="blog-publish">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span><b>Published</b><small>{published ? "Visible to everyone" : "Draft: only admins can see it"}</small></span>
        </label>
      </div>
      <label className="field"><span>Summary (shown on cards)</span>
        <textarea rows={2} maxLength={400} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
      </label>

      <div className="field">
        <span>Cover image (JPEG, PNG, WebP or GIF, up to 5 MB)</span>
        {shownCover ? (
          <div className="blog-cover-preview">
            <img src={shownCover} alt="Cover preview" />
            <button type="button" className="icon-btn" aria-label="Remove cover" onClick={() => { setCover(null); setRemoveCover(true); }}><X size={16} /></button>
          </div>
        ) : post?.has_cover && !removeCover ? (
          <p className="caption">Current cover: {post.cover_filename ?? "image"} (shown once published).</p>
        ) : null}
        <label className="btn blog-cover-btn"><ImagePlus size={14} /> {shownCover ? "Replace image" : "Choose image"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { setCover(e.target.files?.[0] ?? null); setRemoveCover(false); }} />
        </label>
      </div>

      <div className="field">
        <span className="blog-body-label">
          Post *
          <button type="button" className="btn-ghost" onClick={() => setPreview(!preview)}><Eye size={13} /> {preview ? "Edit" : "Preview"}</button>
        </span>
        {preview ? (
          <div className="blog-preview"><BlogBody body={body || "Nothing written yet."} /></div>
        ) : (
          <textarea required rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="blog-textarea" />
        )}
        <small className="caption">{HELP}</small>
      </div>

      {error && <div className="alert error">{error}</div>}
      <div className="blog-admin-bar">
        <button type="submit" className="btn primary" disabled={busy || title.trim().length < 3 || !body.trim()}>
          <Save size={14} /> {busy ? "Saving…" : published ? "Save & publish" : "Save draft"}
        </button>
      </div>
    </form>
  );
}
