"use client";

import type { PostDraft, Script } from "@/lib/uslub/contract";
import { useState } from "react";
import { MOCK_POSTS } from "../studio/mocks";
import { PostReview, type ReviewState } from "../studio/PostReview";

export function ReviewDemo() {
  const [post, setPost] = useState<PostDraft>(MOCK_POSTS[0]);
  const [state, setState] = useState<ReviewState>("waiting");

  const onChange = (script: Script, text: string, humanScore?: number) =>
    setPost((p) => ({
      ...p,
      variants: { ...p.variants, [script]: text },
      neuroHits: {
        ...p.neuroHits,
        [script]: (p.neuroHits[script] ?? [])
          .filter((h) => text.includes(h.phrase))
          .map((h) => ({ ...h, index: text.indexOf(h.phrase) })),
      },
      humanScore: humanScore ?? p.humanScore,
    }));

  return (
    <PostReview
      post={post}
      state={state}
      reasons={state === "waiting" ? ["chegirma", "narx"] : undefined}
      demo
      onChange={onChange}
      onApprove={() => setState("approved")}
      onPublish={async () => {
        await new Promise((r) => setTimeout(r, 700));
        setState("published");
      }}
    />
  );
}
