"use client";

import { AssistantChat } from "@/components/AssistantChat";
import { PageTitle } from "@/components/ui";

export default function AssistantPage() {
  return (
    <>
      <PageTitle>AI Carbon Assistant</PageTitle>
      <AssistantChat variant="page" />
    </>
  );
}
