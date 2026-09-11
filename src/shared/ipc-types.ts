import type { FileAnalysis } from './types';

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
  /** Ordner für die Anzeige: relativ zur gewählten Wurzel, bei Einzeldateien der Elternordner */
  folder: string;
  /** Relativer Ordner zur gewählten Wurzel ('' in der Wurzel); fehlt bei einzeln gewählten Dateien */
  subdir?: string;
}

export interface ExportPiece {
  path: string;
  title: string;
  /** 1-basierte Seitennummern */
  pages: number[];
}

export interface ExportJob {
  /** Dateiname ohne Endung */
  fileName: string;
  pieces: ExportPiece[];
}

export interface ExportRequest {
  outputDir: string;
  jobs: ExportJob[];
}

export interface ExportResult {
  fileName: string;
  outputPath: string;
  pieceCount: number;
  pageCount: number;
}

export interface ExportProgress {
  jobIndex: number;
  pieceIndex: number;
  totalPieces: number;
  message: string;
}

export interface AiClassifyRequest {
  /** JPEG/PNG data URL des Kopfbereichs */
  imageDataUrl: string;
  /** Text der lokalen OCR als Hilfe */
  ocrText?: string;
}

export interface AiClassifyResponse {
  ok: boolean;
  error?: string;
  /** Rohtext der Überschrift, wie das Modell sie liest */
  headerText?: string;
  instrument?: string;
  number?: string;
  key?: string;
  isScore?: boolean;
  usage?: { promptTokens: number; completionTokens: number };
  model?: string;
}

export interface CacheEntry {
  info: FileInfo;
  analysis: FileAnalysis;
}
