import express, { Request, Response } from "express";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

const router = express.Router();

console.log('CHAVE SENDO USADA PELO GEMINI:', process.env.GEMINI_API_KEY ? 'Carregada' : 'UNDEFINED');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

const model = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
  safetySettings,
});

// Divide texto em partes
function splitIntoChunks(text: string, maxSize = 5000): string[] {
  const chunks: string[] = [];
  let pos = 0;

  while (pos < text.length) {
    chunks.push(text.slice(pos, pos + maxSize));
    pos += maxSize;
  }
  return chunks;
}

// Resume 1 chunk de forma robusta
async function summarizeChunk(chunk: string, index: number): Promise<string> {

  const prompt = `
Resuma o texto abaixo de forma concisa, capturando apenas as ideias centrais:

${chunk}
`;

  try {
    console.log(`Submetendo chunk ${index + 1}...`);
    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response.candidates || response.candidates.length === 0 || 
        (response.candidates[0].finishReason !== 'STOP' && response.candidates[0].finishReason !== 'MAX_TOKENS')) {
      
      console.warn(`Chunk ${index + 1} bloqueado ou finalizado indevidamente. Razão: ${response.promptFeedback?.blockReason || response.candidates?.[0]?.finishReason}`);
      return ""; // Retorna vazio se bloqueado
    }

    return response.text();
  } catch (error: any) {
    console.error(`Erro ao resumir chunk ${index + 1}:`, error.message);
    return ""; // Retorna vazio em caso de erro
  }
}

// Resume todos os chunks em PARALELO
async function summarizeInChunks(fullText: string): Promise<string> {
  const chunks = splitIntoChunks(fullText);
  console.log(`Texto dividido em ${chunks.length} chunks.`);

  // Mapeia chunks
  const partialPromises = chunks.map((chunk, i) =>
    summarizeChunk(chunk, i)
  );

  console.log(`Resumindo todos os ${chunks.length} chunks em paralelo...`);
  const partials = await Promise.all(partialPromises);

  // Filtra resumos que podem ter falhado
  const validPartials = partials.filter(p => p && p.trim().length > 0);

  if (validPartials.length === 0) {
    console.error("Nenhum chunk pôde ser resumido.");
    throw new Error("Falha ao resumir os chunks de texto. Todos os pedidos falharam ou foram bloqueados.");
  }
  
  console.log(`Resumos parciais concluídos. Combinando ${validPartials.length} resumos...`);
  
  // Se houver apenas 1 chunk, retorna ele diretamente
  if (validPartials.length === 1) {
    return validPartials[0];
  }

  // AJUSTE DO PROMPT: Pedindo concisão na combinação final
  const finalPrompt = `
Combine os resumos parciais abaixo em um único texto coeso e conciso:

${validPartials.join("\n\n---\n\n")}
`;
  
  try {
    const result = await model.generateContent(finalPrompt);
    return result.response.text();
  } catch (error: any) {
    console.error("❌ Erro ao combinar resumos finais:", error.message);
    throw new Error("Falha ao gerar o resumo final combinado.");
  }
}

// Rota principal
router.post("/summarize", async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required." });
    }

    const summary = await summarizeInChunks(text);

    return res.json({ summary });
  } catch (error: any) {
    console.error("❌ Erro na Rota /summarize:", error);
    return res.status(500).json({
      error: "Gemini summarization failed.",
      details: error.message,
    });
  }
});

export default router;
