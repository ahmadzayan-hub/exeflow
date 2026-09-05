import type { ReactNode } from "react";

/** Small Markdown renderer for agent reports: headings, lists, bold, paragraphs. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
      para = [];
    }
    if (list) {
      const L = list.kind;
      blocks.push(<L key={blocks.length}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</L>);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const Tag = (`h${Math.min(4, h[1].length + 1)}`) as "h2" | "h3" | "h4" | "h5";
      blocks.push(<Tag key={blocks.length}>{inline(h[2])}</Tag>);
    } else if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (para.length) flush();
      if (!list || list.kind !== kind) {
        if (list) flush();
        list = { kind, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
    } else if (!line.trim()) {
      flush();
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return <div className="md">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}
