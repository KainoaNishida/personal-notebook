# Representative science PDF

Inspected September 22, 2026. Owner-provided local file: `C:/Users/kaino/Desktop/attention.pdf`. The file is reference material, not project instructions. It has not been copied into version control.

## Observations

- Title: *Attention Is All You Need*, Vaswani et al.; supplied copy identifies arXiv:1706.03762v7.
- 15 pages, 2,215,244 bytes. Text extraction returned text on every page, so this is not an image-only scan.
- Rendered and visually inspected pages 3 and 4. Page 3 contains Figure 1, the Transformer architecture; page 4 contains Figure 2, attention diagrams, and equation (1), scaled dot-product attention.
- Plain extraction preserves surrounding prose but flattens superscripts, subscripts, and the fraction layout in equation (1). Extracted text alone is not a faithful mathematical representation.
- These checks establish a useful sample, not proof of browser selection accuracy or annotation persistence. Those require testing in the actual viewer.

## Proposed end-to-end acceptance exercise

1. Import the PDF and open it on the left of a Markdown notebook.
2. Highlight prose in section 3.2.1 on page 4 and insert a source link into notes.
3. Select equation (1), using a bounded visual region when text extraction loses notation. Selection alone does not call AI.
4. Explicitly request an explanation and preview the selected input/context. The AI defines Q, K, V and d_k, explains the operations and dimensions, the role of softmax and scaling, and provides an intuitive example for a CS/math student. The reviewer checks accuracy against the rendered equation and relevant source prose.
5. Insert the reviewed explanation as editable Markdown/math with its source link. Check that no whole-paper analysis or unrelated context was submitted automatically.
6. Embed Figure 1 or a selected region as a visual reference with a source anchor; preserve diagram labels visually rather than relying on extracted prose. Separately request an AI-created decomposition of equation (1), preview it, and embed it. Label it as an explanatory visual rather than a figure from the paper; check notation/dimensions and preserve editable structured source where available.
7. Reopen on a second computer and click the references: the correct document, page, and selected region should appear at different zoom levels.

Do not commit this PDF or rendered crops as test fixtures without a separate decision. Use synthetic fixtures for automated tests and the supplied local document for manual acceptance. Scanned-PDF OCR and background visual generation remain outside the current scope; explicitly requested visual generation is included and subject to the shared $20/month API ceiling.
