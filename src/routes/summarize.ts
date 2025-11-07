import { log } from "console";
import express, { Request, Response } from "express";
import fetch from "node-fetch";

const router = express.Router();
const HF_API_URL = "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn";

router.post("/summarize", async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Text is required." });
  }

  try {
    
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    });
    // console.log("porra", response);
    const data = await response.json();

    if (Array.isArray(data) && data[0]?.summary_text) {
      return res.json({ summary: data[0].summary_text });
    }

    return res.status(500).json({ error: "Failed to generate summary.", data });
  } catch (error) {
    console.error("Summarization error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
