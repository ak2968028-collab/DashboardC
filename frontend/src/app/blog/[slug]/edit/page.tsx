"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import BlogEditor from "@/components/blog/BlogEditor";
import { useBlogPost } from "@/lib/api";

export default function EditPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { data: post, isLoading } = useBlogPost(user?.role === "admin" ? slug : null, true);
  if (user?.role === "admin" && (isLoading || !post)) return <div className="loading">Loading post…</div>;
  return <BlogEditor key={post?.id} post={post} />;
}
