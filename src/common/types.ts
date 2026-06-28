import { Event, Person } from '@wca/helpers';

/**
 * WCIF Extension
 */
export interface WcifExtension {
  id: string;
  specUrl: string;
  data: Record<string, unknown>;
}

/**
 * Podium template extension data
 */
export const CURRENT_TEMPLATE_VERSION = 2;

export interface PodiumTemplateExtensionData {
  templateVersion?: number;
  podiumCertificateJson: string;
  podiumCertificateStyleJson: string;
  pageOrientation: 'landscape' | 'portrait';
  backgroundForPreviewOnly: boolean;
  countries: string;
  xOffset: number;
  yOffset: number;
}

/**
 * Competition summary from the unofficial WCA API
 */
export interface Competition {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  city: string;
  country: string;
}

/**
 * Raw competition data from the unofficial API
 */
export interface RawCompetition {
  id: string;
  name: string;
  date: {
    from: string;
    till: string;
  };
  city: string;
  country: string;
}

/**
 * Response from the unofficial competitions API
 */
export interface CompetitionsApiResponse {
  items?: RawCompetition[];
}

/**
 * WCIF (WCA Competition Interchange Format) structure
 */
export interface WCIF {
  id: string;
  name: string;
  shortName: string;
  persons: Person[];
  events: Event[];
  schedule: unknown;
  competitorLimit: number | null;
  extensions: WcifExtension[];
}

/**
 * PDFMake document definition (minimal typing for this project)
 */
export interface PdfDocument {
  pageOrientation: 'landscape' | 'portrait' | string;
  pageMargins: number[];
  content: PdfContentItem[];
  styles: Record<string, unknown>;
  defaultStyle: Record<string, unknown>;
  background?: {
    image: string;
    width: number;
    alignment: string;
  };
}

export interface PdfContentItem {
  text?: unknown;
  alignment?: string;
  margin?: number[];
  pageBreak?: string;
  columns?: PdfContentItem[];
  stack?: PdfContentItem[];
  width?: string | number;
  style?: string;
  table?: unknown;
  layout?: string;
  absolutePosition?: { x: number; y: number };
  fontSize?: number;
  bold?: boolean;
}

/**
 * PdfMake library interface (minimal typing for usage in this project)
 */
export interface PdfMakeStatic {
  fonts: Record<string, { normal: string; bold: string; italics?: string; bolditalics?: string }>;
  createPdf(document: PdfDocument): {
    download(filename: string): void;
    open(): void;
    getBlob(callback: (blob: Blob) => void): void;
    getDataUrl(callback: (dataUrl: string) => void): void;
    getBuffer(callback: (buffer: ArrayBuffer) => void): void;
  };
}

/**
 * PDF.js library interface (minimal typing for rendering PDF pages to canvas)
 */
export interface PdfjsLib {
  getDocument(data: { data: ArrayBuffer }): { promise: Promise<PdfjsDocument> };
  GlobalWorkerOptions: { workerSrc: string };
}

export interface PdfjsDocument {
  getPage(pageNumber: number): Promise<PdfjsPage>;
}

export interface PdfjsPage {
  getViewport(params: { scale: number }): PdfjsViewport;
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: PdfjsViewport; background?: string }): { promise: Promise<void> };
}

export interface PdfjsViewport {
  width: number;
  height: number;
}
