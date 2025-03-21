import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

export class PDFWorker {
  private pdfPath: string;

  constructor(pdfPath: string) {
    this.pdfPath = pdfPath;
  }

  /**
   * Get the total number of pages in the PDF
   */
  async getTotalPages(): Promise<number> {
    // Using pdfinfo to get page count
    return new Promise<number>((resolve, reject) => {
      const pdfinfo = spawn("pdfinfo", [this.pdfPath]);
      let output = "";

      pdfinfo.stdout.on("data", (data) => {
        output += data.toString();
      });

      pdfinfo.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`pdfinfo exited with code ${code}`));
          return;
        }

        // Parse output to find page count
        const pageMatch = output.match(/Pages:\s+(\d+)/);
        if (pageMatch && pageMatch[1]) {
          resolve(parseInt(pageMatch[1], 10));
        } else {
          reject(new Error("Could not determine page count"));
        }
      });

      pdfinfo.on("error", (err) => {
        reject(new Error(`Failed to run pdfinfo: ${err.message}`));
      });
    });
  }

  /**
   * Extract pages from the PDF
   */
  async extractPages(
    startPage: number,
    endPage: number,
    outputDir: string
  ): Promise<string> {
    const outputPath = path.join(
      outputDir,
      `extract_${startPage}_${endPage}.pdf`
    );

    return new Promise<string>((resolve, reject) => {
      const pdfseparate = spawn("pdftk", [
        this.pdfPath,
        "cat",
        `${startPage}-${endPage}`,
        "output",
        outputPath,
      ]);

      pdfseparate.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`pdftk exited with code ${code}`));
          return;
        }
        resolve(outputPath);
      });

      pdfseparate.on("error", (err) => {
        reject(new Error(`Failed to run pdftk: ${err.message}`));
      });
    });
  }

  /**
   * Convert PDF pages to images
   */
  async convertToImages(outputDir: string): Promise<string[]> {
    const imageOutputDir = path.join(outputDir, "images");
    fs.mkdirSync(imageOutputDir, { recursive: true });

    return new Promise<string[]>((resolve, reject) => {
      // Use pdftoppm to convert PDF to images
      const pdftoppm = spawn("pdftoppm", [
        "-jpeg", // Output in JPEG format
        "-r",
        "300", // Resolution 300 DPI
        this.pdfPath,
        path.join(imageOutputDir, "page"),
      ]);

      pdftoppm.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`pdftoppm exited with code ${code}`));
          return;
        }

        // Get all image files in the output directory
        try {
          const files = fs
            .readdirSync(imageOutputDir)
            .filter((file) => file.endsWith(".jpg"))
            .map((file) => path.join(imageOutputDir, file));

          resolve(files);
        } catch (err) {
          reject(new Error(`Failed to read image directory: ${err}`));
        }
      });

      pdftoppm.on("error", (err) => {
        reject(new Error(`Failed to run pdftoppm: ${err.message}`));
      });
    });
  }
}
