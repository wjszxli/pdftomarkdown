import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { LLMClient } from "./core/LLMClient";
import { PDFWorker } from "./core/PDFWorker";

// Configure logger
const logger = {
  info: (message: string, ...args: any[]) => {
    const formattedMessage =
      args.length > 0
        ? args.reduce(
            (msg, arg, index) => msg.replace(`%${index + 1}`, String(arg)),
            message
          )
        : message;
    console.info(`${new Date().toISOString()} - INFO - ${formattedMessage}`);
  },
  error: (message: string) => {
    console.error(`${new Date().toISOString()} - ERROR - ${message}`);
  },
};

/**
 * Call OpenAI's completion interface for text generation
 */
async function completion(
  message: string,
  model: string = "",
  systemPrompt: string = "",
  imagePaths: string[] | null = null,
  temperature: number = 0.5,
  maxTokens: number = 8192,
  retryTimes: number = 3
): Promise<string> {
  // Get API key and API base URL from environment variables
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error("Please set the OPENAI_API_KEY environment variables");
    process.exit(1);
  }

  const baseUrl =
    process.env.OPENAI_API_BASE ||
    "https://generativelanguage.googleapis.com/v1beta/openai/";

  // If no model is specified, use the default model
  if (!model) {
    model = process.env.OPENAI_DEFAULT_MODEL || "gemini-1.5-pro";
  }

  // Initialize LLMClient
  const client = new LLMClient(baseUrl, apiKey, model);

  // Call completion method with retry mechanism
  for (let i = 0; i < retryTimes; i++) {
    try {
      const response = await client.completion(
        message,
        systemPrompt,
        imagePaths,
        temperature,
        maxTokens
      );
      return response;
    } catch (e) {
      logger.error(
        `LLM call failed: ${e instanceof Error ? e.message : String(e)}`
      );
      // If retry fails, wait for a while before retrying
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return "";
}

/**
 * Convert image to Markdown format
 */
async function convertImageToMarkdown(imagePath: string): Promise<string> {
  const userPrompt = `
    Please read the content in the image and transcribe it into Markdown, paying special attention to maintaining the format of headings, text, formulas, and table rows and columns. Only output the Markdown, no additional explanation is needed.
  `;

  const response = await completion(
    userPrompt,
    "gemini-1.5-pro",
    "",
    [imagePath],
    0.3,
    8192
  );
  return response;
}

async function main() {
  let startPage = 1;
  let endPage = 0;

  const args = process.argv.slice(2);

  if (!args.length) {
    logger.error(
      "Usage: ts-node index.ts [start_page] [end_page] < path_to_input.md"
    );
    process.exit(1);
  }

  if (args.length > 1) {
    startPage = parseInt(args[0], 10);
    endPage = parseInt(args[1], 10);
  } else if (args.length > 0) {
    startPage = 1;
    endPage = parseInt(args[0], 10);
  }

  // Read binary data from stdin
  const chunks: Buffer[] = [];
  process.stdin.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  await new Promise<void>((resolve) => {
    process.stdin.on("end", async () => {
      const inputData = Buffer.concat(chunks);
      if (inputData.length === 0) {
        logger.error("No input data received");
        logger.error(
          "Usage: ts-node index.ts [start_page] [end_page] < path_to_input.pdf"
        );
        process.exit(1);
      }

      // Create output directory
      const outputDir = path.join(
        "output",
        new Date().toISOString().replace(/[:.]/g, "")
      );
      fs.mkdirSync(outputDir, { recursive: true });

      // Save input PDF to output directory
      const inputPdfPath = path.join(outputDir, "input.pdf");
      fs.writeFileSync(inputPdfPath, inputData);

      const pdfWorker = new PDFWorker(inputPdfPath);
      const totalPages = await pdfWorker.getTotalPages();

      if (startPage < 1 || startPage > totalPages) {
        startPage = 1;
      }
      if (endPage === 0 || endPage > totalPages) {
        endPage = totalPages;
      }

      logger.info(
        "Start processing from page %1 to page %2",
        startPage,
        endPage
      );

      let extractPath = inputPdfPath;
      if (startPage !== 1 || endPage !== totalPages) {
        // Extract PDF content from specified page range
        extractPath = await pdfWorker.extractPages(
          startPage,
          endPage,
          outputDir
        );
        logger.info("Extract pages to %1", extractPath);
      }

      // Convert PDF to images
      const convertWorker = new PDFWorker(extractPath);
      const imgPaths = await convertWorker.convertToImages(outputDir);
      logger.info("Image conversion completed");

      // Convert images to Markdown
      let markdown = "";
      for (const imgPath of imgPaths.sort()) {
        const normalizedPath = imgPath.replace(/\\/g, "/");
        logger.info("Converting image %1 to Markdown", normalizedPath);
        const imgMarkdown = await convertImageToMarkdown(normalizedPath);
        markdown += imgMarkdown;
        markdown += "\n\n";
        logger.info("Markdown info %1", markdown);
      }

      logger.info("Image conversion to Markdown completed");

      // Output Markdown
      console.log(markdown);

      // Remove output directory
      fs.rmSync(outputDir, { recursive: true, force: true });

      resolve();
      process.exit(0);
    });
  });
}

main().catch((error) => {
  logger.error(`Error in main: ${error}`);
  process.exit(1);
});
