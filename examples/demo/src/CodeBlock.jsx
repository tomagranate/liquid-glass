import { useId, useState } from "react";
import { CheckIcon, ClipboardIcon } from "@heroicons/react/16/solid";
import { GlassOverPage } from "@tomagranate/liquid-glass/react";
import "./CodeBlock.css";

/* ── Tiny hand-rolled JS/JSX tokenizer ───────────────────────────────────────
   No dependency, no full parser: a short list of anchored regexes classifies
   each token, and identifiers are refined by context (keyword / Capitalized
   type / call). Good enough to make a code sample readable. */

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "new",
  "await",
  "async",
  "yield",
  "of",
  "in",
  "typeof",
  "instanceof",
  "void",
  "delete",
  "class",
  "extends",
  "super",
  "this",
]);

const LITERALS = new Set(["true", "false", "null", "undefined", "NaN"]);

const RULES = [
  [/^\/\/[^\n]*/, "comment"],
  [/^\/\*[\s\S]*?\*\//, "comment"],
  [/^`(?:\\.|\$\{[^}]*\}|[^`\\])*`/, "string"],
  [/^"(?:\\.|[^"\\])*"/, "string"],
  [/^'(?:\\.|[^'\\])*'/, "string"],
  [/^\d[\d._]*(?:\.\d+)?(?:e[+-]?\d+)?%?/i, "number"],
  [/^[A-Za-z_$][\w$]*/, "ident"],
  [/^\s+/, "ws"],
  [/^[^\sA-Za-z0-9_$]+/, "punct"],
];

function tokenize(code) {
  const tokens = [];
  let rest = code;
  while (rest.length) {
    let matched = false;
    for (const [re, kind] of RULES) {
      const m = re.exec(rest);
      if (!m) continue;
      const value = m[0];
      let type = kind;
      if (kind === "ident") {
        if (KEYWORDS.has(value)) type = "keyword";
        else if (LITERALS.has(value)) type = "literal";
        else if (/^[A-Z]/.test(value)) type = "type";
        else if (rest[value.length] === "(") type = "fn";
        else type = "plain";
      }
      tokens.push({ type, value });
      rest = rest.slice(value.length);
      matched = true;
      break;
    }
    if (!matched) {
      tokens.push({ type: "plain", value: rest[0] });
      rest = rest.slice(1);
    }
  }
  return tokens;
}

function Highlighted({ code }) {
  return (
    <code className="cb-code">
      {tokenize(code).map((t, i) =>
        t.type === "plain" || t.type === "ws" || t.type === "punct" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: token stream is stable
          <span key={i}>{t.value}</span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: token stream is stable
          <span key={i} className={`cb-${t.type}`}>
            {t.value}
          </span>
        ),
      )}
    </code>
  );
}

const CODE_GLASS = {
  radius: 18,
  depth: 18,
  scale: 40,
  blur: 2.5,
  chroma: 0.3,
  specular: 0.3,
  rimLight: 0.7,
  tint: "rgba(10,12,22,0.62)",
  shadow: "0 20px 54px rgba(0,0,0,0.4)",
};

/**
 * A glass-panelled code sample. Accepts either a single `code`/`lang`, or a
 * `tabs` array of `{ label, lang, code }` (e.g. "React" / "Vanilla"). The panel
 * itself uses page glass. Syntax highlighting is the local regex tokenizer.
 */
export function CodeBlock({ code, lang = "jsx", tabs, collapsed = true }) {
  const items = tabs ?? [{ label: lang.toUpperCase(), lang, code }];
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(!collapsed);
  const regionId = useId();
  const current = items[Math.min(active, items.length - 1)];

  const copy = () => {
    navigator.clipboard?.writeText(current.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <GlassOverPage className="cb" data-open={open} {...CODE_GLASS}>
      <div className="cb-head">
        <button
          type="button"
          className="cb-disclosure"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide code" : "Show code"}
        </button>
        {open && items.length > 1 ? (
          <div className="cb-tabs" role="tablist" aria-label="Code variants">
            {items.map((item, i) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={i === active}
                className="cb-tab"
                data-active={i === active}
                onClick={() => {
                  setActive(i);
                  setOpen(true);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : open ? (
          <span className="cb-lang">{current.label}</span>
        ) : null}
        {open && (
          <button
            type="button"
            className="cb-copy"
            onClick={copy}
            aria-label="Copy code"
          >
            {copied ? (
              <CheckIcon className="cb-copy-icon" />
            ) : (
              <ClipboardIcon className="cb-copy-icon" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <pre className="cb-pre" id={regionId} hidden={!open}>
        <Highlighted code={current.code} />
      </pre>
    </GlassOverPage>
  );
}

export default CodeBlock;
