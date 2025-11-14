import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import mammoth from "mammoth";

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const router = express.Router();
const upload = multer({ dest: "uploads/" });


console.log('UPLOAD: Chave GEMINI:', process.env.GEMINI_API_KEY ? 'Carregada' : 'UNDEFINED');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const model = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
  safetySettings,
});

function splitIntoChunks(text: string, maxSize = 5000): string[] {
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    chunks.push(text.slice(pos, pos + maxSize));
    pos += maxSize;
  }
  return chunks;
}

async function summarizeChunk(chunk: string, index: number): Promise<string> {
  const prompt = `Resuma o texto abaixo de forma concisa, capturando apenas as ideias centrais:\n\n${chunk}`;
  try {
    console.log(`Submetendo chunk ${index + 1}...`);
    const result = await model.generateContent(prompt);
    const response = result.response;
    if (!response.candidates || response.candidates.length === 0 || 
        (response.candidates[0].finishReason !== 'STOP' && response.candidates[0].finishReason !== 'MAX_TOKENS')) {
      console.warn(`Chunk ${index + 1} bloqueado. Razão: ${response.promptFeedback?.blockReason || response.candidates?.[0]?.finishReason}`);
      return "";
    }
    return response.text();
  } catch (error: any) {
    console.error(`Erro ao resumir chunk ${index + 1}:`, error.message);
    return "";
  }
}

async function summarizeInChunks(fullText: string): Promise<string> {
  const chunks = splitIntoChunks(fullText);
  console.log(`Texto dividido em ${chunks.length} chunks.`);

  const partialPromises = chunks.map((chunk, i) => summarizeChunk(chunk, i));
  const partials = await Promise.all(partialPromises);
  const validPartials = partials.filter(p => p && p.trim().length > 0);

  if (validPartials.length === 0) {
    throw new Error("Falha ao resumir os chunks de texto.");
  }
  
  console.log(`Resumos parciais concluídos. Combinando ${validPartials.length} resumos...`);
  
  if (validPartials.length === 1) {
    return validPartials[0];
  }

  const finalPrompt = `Combine os resumos parciais abaixo em um único texto coeso e conciso:\n\n${validPartials.join("\n\n---\n\n")}`;
  
  try {
    const result = await model.generateContent(finalPrompt);
    return result.response.text();
  } catch (error: any) {
    console.error("Erro ao combinar resumos finais:", error.message);
    throw new Error("Falha ao gerar o resumo final combinado.");
  }
}



// Função de extração de PDF
async function extractPdfText(filePath: string): Promise<string> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str).join(" ");
    fullText += strings + "\n";
  }
  return fullText;
}

router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    let text = "";

    console.log(`Processando arquivo: ${req.file.originalname} (${req.file.mimetype})`);

    // Extrair texto
    if (req.file.mimetype === "application/pdf") {
      text = await extractPdfText(req.file.path);
    } else if (
      req.file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ path: req.file.path });
      text = result.value;
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Could not extract text from file." });
    }

    console.log(`Texto extraído (${text.length} caracteres). Iniciando resumo com Gemini...`);

    const summary = await summarizeInChunks(text);

    // Retorna resposta
    return res.json({
      summary: summary || "No summary generated",
      length: text.length,
      fileName: req.file.originalname,
    });

  } catch (error: any) {
    console.error("❌ Processing error:", error);
    res.status(500).json({ error: "Error processing file", details: error.message });
  } finally {
    // Limpar arquivo temporário
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Error deleting temp file:", err);
    });
  }
});

export default router;