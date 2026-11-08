/**
 * Document ingestion.
 *
 * Text and Markdown arrive as-is; PDFs (a CNKI export, an official report) are
 * unpacked with unpdf and kept page by page so a citation can point back to
 * the source. Nothing here fetches the network: the operator supplies the file.
 */
import { extractText, getDocumentProxy } from 'unpdf'

export interface ExtractedDocument {
  text: string
  pages: number
}

function cleanPage(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
}

export async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const result = await extractText(pdf, { mergePages: false })
  const pages = Array.isArray(result.text) ? result.text : [String(result.text)]
  const cleaned = pages.map(cleanPage).filter((page) => page.length > 0)
  return {
    pages: pages.length,
    text: cleaned
      .map((page, index) => `<!-- 第 ${index + 1} 页 -->\n${page}`)
      .join('\n\n'),
  }
}

/** Cheap sanity check before we store a PDF that produced no text layer. */
export function looksLikeScannedPdf(text: string): boolean {
  return text.replace(/<!--[^>]*-->/g, '').trim().length < 40
}
