import { useState } from "react";

const basics = [
  [
    "Headings",
    "# Large heading\n## Section\n### Subsection\n\nUse up to six # symbols, followed by a space.",
  ],
  [
    "Emphasis",
    "**Bold**\n*Italic*\n***Bold italic***\n~~Strikethrough~~\n`Inline code`",
  ],
  [
    "Lists and tasks",
    "- Bullet\n  - Nested bullet\n\n1. First step\n2. Second step\n\n- [ ] Unfinished task\n- [x] Finished task",
  ],
  [
    "Links and footnotes",
    "[Link text](https://example.com)\n\nA statement with a footnote.[^1]\n\n[^1]: Additional explanation.",
  ],
  ["Quotes and dividers", "> A quotation\n>\n> A second paragraph\n\n---"],
  [
    "Tables",
    "| Method | Time |\n| --- | ---: |\n| Binary search | O(log n) |\n| Linear search | O(n) |\n\nUse :---, :---:, or ---: for left, center, or right alignment.",
  ],
];
const code = '```python\ndef greet(name):\n    print(f"Hello, {name}!")\n```';
const equation =
  "$E = mc^2$ inside a sentence.\n\n$$\nx = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n$$";
const math = [
  ["Exponent / subscript", "x^2, x_i, x_{ij}"],
  ["Fraction / root", "\\frac{a}{b}, \\sqrt{x}"],
  ["Greek letters", "\\alpha, \\beta, \\theta, \\pi"],
  ["Multiply / compare", "\\cdot, \\times, \\leq, \\geq, \\neq, \\approx"],
  ["Sum / integral", "\\sum_{i=1}^{n} i, \\int_0^1 x^2\\,dx"],
  ["Vector / infinity / text", "\\vec{v}, \\infty, \\text{where}"],
];
function Example({ title, source }: { title: string; source: string }) {
  const [status, setStatus] = useState("Copy example");
  return (
    <section className="format-example">
      <div className="row between">
        <h2>{title}</h2>
        <button
          type="button"
          aria-label={`Copy ${title.toLowerCase()} example`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(source);
              setStatus("Copied");
            } catch {
              setStatus("Select and copy the example");
            }
          }}
        >
          {status}
        </button>
      </div>
      <pre>
        <code>{source}</code>
      </pre>
    </section>
  );
}
export function MarkdownHelp() {
  return (
    <main className="page markdown-help">
      <h1>Markdown guide</h1>
      <p className="muted">
        Type these shortcuts into any note. Use the editor’s source button to
        see all Markdown, or live preview to see formatting. Click formatted
        text to edit its source.
      </p>
      <div className="format-grid">
        <Example title="Code blocks" source={code} />
        <Example title="Math equations" source={equation} />
      </div>
      <p>
        Code blocks start and end with three backticks on separate lines. Add a
        language such as <code>python</code>, <code>javascript</code>,{" "}
        <code>cpp</code>, or <code>json</code> for highlighting. Use single
        dollar signs for inline math, or double dollar signs on separate lines
        for a displayed equation.
      </p>
      <div className="format-grid">
        {basics.map(([title, source]) => (
          <Example key={title} title={title} source={source} />
        ))}
      </div>
      <section className="format-example">
        <h2>More math</h2>
        <p>Use these LaTeX commands inside dollar signs.</p>
        <dl className="math-reference">
          {math.map(([label, syntax]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <code>{syntax}</code>
              </dd>
            </div>
          ))}
        </dl>
        <Example
          title="Aligned equations"
          source={
            "$$\n\\begin{aligned}\na &= b + c \\\\\nd &= e + f\n\\end{aligned}\n$$"
          }
        />
      </section>
      <section className="format-example">
        <h2>Paragraphs, images, and literal characters</h2>
        <p>
          Leave a blank line between paragraphs. End a line with two spaces for
          a line break within a paragraph. Put a backslash before a formatting
          character to show it literally: <code>{"\\*"}</code> displays an
          asterisk.
        </p>
        <p>
          Use <strong>Insert image</strong> in the editor to upload an image;
          add an optional caption beneath it. External image URLs and raw HTML
          are not rendered. Custom HTML colors, fonts, and underlines are not
          supported.
        </p>
      </section>
      <details className="format-advanced">
        <summary>Diagrams and plots</summary>
        <p>
          Use Mermaid for diagrams and JSON for simple line or scatter plots
          (2–200 points).
        </p>
        <div className="format-grid">
          <Example
            title="Mermaid diagram"
            source={
              "```mermaid\nflowchart LR\n    A[Read paper] --> B[Take notes]\n    B --> C[Test an idea]\n```"
            }
          />
          <Example
            title="Plot"
            source={
              '```plot\n{\n  "title": "Example results",\n  "xLabel": "Step",\n  "yLabel": "Score",\n  "type": "line",\n  "points": [\n    {"x": 1, "y": 2},\n    {"x": 2, "y": 5},\n    {"x": 3, "y": 9}\n  ]\n}\n```'
            }
          />
        </div>
      </details>
    </main>
  );
}
