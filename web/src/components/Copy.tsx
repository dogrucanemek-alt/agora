"use client";

import { useState } from "react";

// A snippet with a copy button. The snippet itself is plain text in the page, so it reads the same without JavaScript.
export default function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copy">
      <div className="copyhead">
        <span>{label}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          }}
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}
