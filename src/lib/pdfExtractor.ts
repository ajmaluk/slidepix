import * as pdfjs from 'pdfjs-dist';
// @ts-ignore - Vite will handle the ?url import correctly
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { tesseractPool } from './tesseractPool';

// Initialize PDF.js worker using a local asset for reliability and version matching
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PDFExtractionResult {
  text: string;
  pages: number;
  isScanned: boolean;
  confidence: number;
}

export async function extractTextFromPDF(
  url: string,
  onProgress?: (percent: number) => void
): Promise<PDFExtractionResult> {
  const loadingTask = pdfjs.getDocument(url);
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const results: string[] = new Array(numPages).fill("");
  let pagesCompleted = 0;
  let scannedPagesCount = 0;

  console.log(`📄 Starting high-fidelity hybrid extraction for ${numPages} pages...`);

  // Process in parallel batches based on hardware concurrency for optimal speed
  const concurrency = Math.min(navigator.hardwareConcurrency || 4, 8);
  for (let i = 1; i <= numPages; i += concurrency) {
    const batch = [];
    for (let j = i; j < i + concurrency && j <= numPages; j++) {
      batch.push((async (pageNum) => {
        const page = await pdf.getPage(pageNum);
        
        // 1. Try fast text layer extraction
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ")
          .trim();
        
        if (pageText.length > 50) {
          // Found substantial text layer
          results[pageNum - 1] = `[Page ${pageNum}]\n${pageText}\n\n`;
        } else {
          // Likely scanned or very sparse - Fallback to OCR for this specific page
          scannedPagesCount++;
          const viewport = page.getViewport({ scale: 1.5 });
          const taskCanvas = document.createElement('canvas');
          const taskContext = taskCanvas.getContext('2d');
          taskCanvas.height = viewport.height;
          taskCanvas.width = viewport.width;

          await page.render({ canvasContext: taskContext!, viewport }).promise;

          try {
            const worker = await tesseractPool.getWorker();
            // Pass the canvas directly to Tesseract to avoid toDataURL overhead
            const { data: { text: ocrText } } = await (worker as any).recognize(taskCanvas);
            tesseractPool.releaseWorker(worker as any);
            results[pageNum - 1] = `[Page ${pageNum} (OCR)]\n${ocrText}\n\n`;
          } catch (err) {
            console.error(`OCR fallback failed for page ${pageNum}:`, err);
            results[pageNum - 1] = pageText.length > 0 
              ? `[Page ${pageNum}]\n${pageText}\n\n`
              : `[Page ${pageNum} (EMPTY)]\n\n`;
          }
        }

        pagesCompleted++;
        if (onProgress) {
          onProgress(Math.round((pagesCompleted / numPages) * 100));
        }
      })(j));
    }
    await Promise.all(batch);
  }

  return {
    text: results.join(""),
    pages: numPages,
    isScanned: scannedPagesCount > (numPages / 2), // If more than half are scanned, mark as scanned
    confidence: scannedPagesCount > 0 ? 0.85 : 1.0
  };
}

/** 
 * Keep ocrScannedPDF for backward compatibility or direct calls if needed, 
 * but extractTextFromPDF is now the preferred hybrid entry point.
 */
export async function ocrScannedPDF(
  pdf: any,
  onProgress?: (percent: number) => void
): Promise<PDFExtractionResult> {
  const numPages = pdf.numPages;
  const results: string[] = new Array(numPages).fill("");
  let pagesCompleted = 0;

  console.log(`🖼️ Starting multi-page OCR for ${numPages} scanned pages...`);

  // We'll process pages in parallel up to a reasonable limit based on hardware
  const concurrency = Math.min(navigator.hardwareConcurrency || 4, 8);
  for (let i = 1; i <= numPages; i += concurrency) {
    const batch = [];
    for (let j = i; j < i + concurrency && j <= numPages; j++) {
      batch.push((async (pageNum) => {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 }); // Balanced scale for speed/accuracy
        
        // Each parallel task needs its own canvas to avoid race conditions
        const taskCanvas = document.createElement('canvas');
        const taskContext = taskCanvas.getContext('2d');
        taskCanvas.height = viewport.height;
        taskCanvas.width = viewport.width;

        await page.render({ canvasContext: taskContext!, viewport }).promise;

        try {
          const worker = await tesseractPool.getWorker();
          // Pass the canvas directly to Tesseract to avoid toDataURL overhead
          const { data: { text } } = await (worker as any).recognize(taskCanvas);
          tesseractPool.releaseWorker(worker as any);
          results[pageNum - 1] = `[Page ${pageNum} (OCR)]\n${text}\n\n`;
        } catch (err) {
          console.error(`OCR failed for page ${pageNum}:`, err);
          results[pageNum - 1] = `[Page ${pageNum} (OCR FAILED)]\n\n`;
        }

        pagesCompleted++;
        if (onProgress) {
          onProgress(Math.round((pagesCompleted / numPages) * 100));
        }
      })(j));
    }
    await Promise.all(batch);
  }

  return {
    text: results.join(""),
    pages: numPages,
    isScanned: true,
    confidence: 0.8
  };
}
