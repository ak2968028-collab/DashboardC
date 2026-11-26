"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import BlogEditor from "@/components/blog/BlogEditor";
import { CarbonLoader } from "@/components/ui";
import { useBlogPost } from "@/lib/api";

export default function EditPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { data: post, isLoading } = useBlogPost(user?.role === "admin" ? slug : null, true);
  if (user?.role === "admin" && (isLoading || !post)) return <CarbonLoader label="Loading post…" />;
  return <BlogEditor key={post?.id} post={post} />;
}
