import { Fragment, type ReactNode } from "react";

/** Inline **bold** and [text](https://link); everything else is plain text (no HTML is interpreted). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] ? <b key={m.index}>{m[1]}</b>
      : <a key={m.index} href={m[3]} target="_blank" rel="noopener noreferrer">{m[2]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders a post body: blank-line separated paragraphs, "## " / "### " headings, "- " bullets and "> " quotes. */
export default function BlogBody({ body }: { body: string }) {
  const blocks = body.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="blog-body">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (block.startsWith("### ")) return <h3 key={i}>{inline(block.slice(4))}</h3>;
        if (block.startsWith("## ")) return <h2 key={i}>{inline(block.slice(3))}</h2>;
        if (lines.every((l) => /^[-*] /.test(l))) return <ul key={i}>{lines.map((l, k) => <li key={k}>{inline(l.slice(2))}</li>)}</ul>;
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\d+\. /, ""))}</li>)}</ol>;
        if (lines.every((l) => l.startsWith("> "))) return <blockquote key={i}>{inline(lines.map((l) => l.slice(2)).join(" "))}</blockquote>;
        return <p key={i}>{lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
