import { createWorker, Worker } from 'tesseract.js';

class TesseractPool {
  private workers: Worker[] = [];
  private queue: { resolve: (worker: Worker) => void; reject: (err: any) => void }[] = [];
  private maxWorkers: number;
  private activeWorkers = 0;
  private initialized = false;

  constructor(maxWorkers = 4) {
    this.maxWorkers = maxWorkers;
  }

  setMaxWorkers(n: number) {
    this.maxWorkers = n;
  }

  async getWorker(): Promise<Worker> {
    if (this.workers.length > 0) {
      return this.workers.pop()!;
    }

    if (this.activeWorkers < this.maxWorkers) {
      this.activeWorkers++;
      try {
        const worker = await createWorker('eng+hin');
        return worker;
      } catch (err) {
        this.activeWorkers--;
        throw err;
      }
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  releaseWorker(worker: Worker) {
    if (this.queue.length > 0) {
      const { resolve } = this.queue.shift()!;
      resolve(worker);
    } else {
      this.workers.push(worker);
    }
  }

  async terminate() {
    await Promise.all(this.workers.map(w => w.terminate()));
    this.workers = [];
    this.activeWorkers = 0;
  }
}

export const tesseractPool = new TesseractPool(navigator.hardwareConcurrency || 4);
