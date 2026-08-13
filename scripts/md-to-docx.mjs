/**
 * Convert a Markdown file to a Word .docx (Headings, paragraphs, lists, tables).
 * Usage: node scripts/md-to-docx.mjs <input.md> <output.docx>
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error("Usage: node scripts/md-to-docx.mjs <input.md> <output.docx>");
  process.exit(1);
}

const md = fs.readFileSync(inFile, "utf8");
const tokens = marked.lexer(md);

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function inlineRuns(inlineTokens = []) {
  const runs = [];
  for (const t of inlineTokens) {
    if (t.type === "text") {
      runs.push(new TextRun({ text: t.text, size: 22 }));
    } else if (t.type === "strong") {
      const inner = t.tokens ? t.tokens.map((x) => x.text || "").join("") : t.text;
      runs.push(new TextRun({ text: inner, bold: true, size: 22 }));
    } else if (t.type === "em") {
      const inner = t.tokens ? t.tokens.map((x) => x.text || "").join("") : t.text;
      runs.push(new TextRun({ text: inner, italics: true, size: 22 }));
    } else if (t.type === "codespan") {
      runs.push(new TextRun({ text: t.text, font: "Consolas", size: 20 }));
    } else if (t.type === "link") {
      runs.push(new TextRun({ text: `${t.text} (${t.href})`, color: "0563C1", size: 22 }));
    } else if (t.tokens) {
      runs.push(...inlineRuns(t.tokens));
    } else if (t.text) {
      runs.push(new TextRun({ text: t.text, size: 22 }));
    }
  }
  return runs.length ? runs : [new TextRun({ text: "", size: 22 })];
}

function stripMd(text) {
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n/g, " ");
}

function headingLevel(depth) {
  if (depth <= 1) return HeadingLevel.HEADING_1;
  if (depth === 2) return HeadingLevel.HEADING_2;
  if (depth === 3) return HeadingLevel.HEADING_3;
  return HeadingLevel.HEADING_4;
}

function listItemRuns(item) {
  if (item.tokens?.[0]?.type === "text" && item.tokens[0].tokens) {
    return inlineRuns(item.tokens[0].tokens);
  }
  if (item.tokens?.[0]?.type === "paragraph") {
    return inlineRuns(item.tokens[0].tokens);
  }
  return [new TextRun({ text: item.text.replace(/\n/g, " "), size: 22 })];
}

const children = [];

for (const token of tokens) {
  if (token.type === "heading") {
    children.push(
      new Paragraph({
        heading: headingLevel(token.depth),
        children: inlineRuns(token.tokens),
        spacing: { before: token.depth === 1 ? 360 : 240, after: 120 },
      }),
    );
  } else if (token.type === "paragraph") {
    children.push(
      new Paragraph({
        children: inlineRuns(token.tokens),
        spacing: { after: 120 },
      }),
    );
  } else if (token.type === "list") {
    for (const item of token.items) {
      children.push(
        new Paragraph({
          children: listItemRuns(item),
          bullet: token.ordered ? undefined : { level: 0 },
          numbering: token.ordered ? { reference: "numbered-list", level: 0 } : undefined,
          spacing: { after: 60 },
        }),
      );
    }
  } else if (token.type === "table") {
    const colCount = token.header.length;
    const colWidth = Math.floor(9000 / colCount);
    const headerRow = new TableRow({
      children: token.header.map(
        (cell) =>
          new TableCell({
            borders,
            width: { size: colWidth, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [new TextRun({ text: stripMd(cell.text), bold: true, size: 18 })],
              }),
            ],
          }),
      ),
    });
    const bodyRows = token.rows.map(
      (row) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                borders,
                width: { size: colWidth, type: WidthType.DXA },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: stripMd(cell.text), size: 18 })],
                  }),
                ],
              }),
          ),
        }),
    );
    children.push(
      new Table({
        width: { size: 9000, type: WidthType.DXA },
        rows: [headerRow, ...bodyRows],
      }),
    );
    children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
  } else if (token.type === "hr") {
    children.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 8 } },
        spacing: { before: 120, after: 200 },
        children: [],
      }),
    );
  } else if (token.type === "code") {
    for (const line of token.text.split("\n")) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })],
          spacing: { after: 40 },
        }),
      );
    }
  }
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "numbered-list",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: "left",
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, buffer);
console.log(`Wrote ${outFile} (${buffer.length} bytes)`);
