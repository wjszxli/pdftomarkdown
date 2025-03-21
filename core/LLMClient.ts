import * as fs from "fs";
import axios from "axios";

export class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Send a completion request to the LLM API
   */
  async completion(
    userMessage: string,
    systemPrompt: string = "",
    imagePaths: string[] | null = null,
    temperature: number = 0.5,
    maxTokens: number = 8192
  ): Promise<string> {
    // Create the request payload
    const messages: Array<{ role: string; content: any }> = [];

    // Add system message if provided
    if (systemPrompt) {
      messages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    // Prepare user message content
    let userContent: any = { text: userMessage };

    // If image paths are provided, add them to the content
    if (imagePaths && imagePaths.length > 0) {
      userContent = [userContent];

      // Add each image to the content
      for (const imagePath of imagePaths) {
        try {
          const imageData = fs.readFileSync(imagePath);
          const base64Image = imageData.toString("base64");

          userContent.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg", // Adjust based on actual image type
              data: base64Image,
            },
          });
        } catch (error) {
          console.error(`Error reading image file ${imagePath}: ${error}`);
          throw error;
        }
      }
    }

    // Add user message
    messages.push({
      role: "user",
      content: userContent,
    });

    // Prepare the request payload
    const payload = {
      model: this.model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
    };

    try {
      // Send the request to the API
      const response = await axios.post(
        `${this.baseUrl}models/${this.model}:generateContent`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      // Extract and return the generated text
      if (
        response.data &&
        response.data.candidates &&
        response.data.candidates.length > 0 &&
        response.data.candidates[0].content &&
        response.data.candidates[0].content.parts &&
        response.data.candidates[0].content.parts.length > 0
      ) {
        return response.data.candidates[0].content.parts[0].text;
      }

      return "";
    } catch (error) {
      console.error(`Error calling LLM API: ${error}`);
      throw error;
    }
  }
}
