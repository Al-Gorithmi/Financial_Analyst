// pdf-parse exports a PDFParse class, not a simple function
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Uint8Array }) => {
    load(): Promise<void>;
    getText(): Promise<{ text: string; pages: number }>;
    destroy(): Promise<void>;
  };
};

export interface ParsedPDF {
  text: string;
  numPages: number;
}

export async function parsePDF(buffer: Buffer): Promise<ParsedPDF> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  await parser.load();
  const result = await parser.getText();
  await parser.destroy();
  return {
    text: result.text,
    numPages: result.pages,
  };
}
