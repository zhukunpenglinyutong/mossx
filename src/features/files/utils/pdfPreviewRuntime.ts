import { GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerConfigured = false;

export function ensurePdfPreviewWorker() {
  if (workerConfigured) {
    return;
  }
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}
