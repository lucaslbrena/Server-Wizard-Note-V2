import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import mammoth from "mammoth";
import fetch from "node-fetch";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// ✅ universal safe import for pdf-parse
let pdfParse: any;
try {
  const maybe = require("pdf-parse");
  pdfParse = typeof maybe === "function" ? maybe : maybe.default;
} catch (err) {
  console.error("❌ Could not import pdf-parse:", err);
}

const HF_API_URL =
  "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn";

router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  console.log("📥 Received upload:", req.file);

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    let text = "";

    // ✅ handle PDF
    if (req.file.mimetype === "application/pdf") {
      const pdfBuffer = fs.readFileSync(req.file.path);
      const pdf = await pdfParse(pdfBuffer);
      text = pdf.text;
    }
    // ✅ handle DOCX
    else if (
      req.file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ path: req.file.path });
      text = result.value;
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text.slice(0, 4000) }),
    });

    const data: any = await response.json();

    res.json({
      summary: data[0]?.summary_text || "No summary generated",
      length: text.length,
      fileName: req.file.originalname,
    });

    // cleanup
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("⚠️ Error deleting temp file:", err);
    });
  } catch (error) {
    console.error("❌ Processing error:", error);
    res.status(500).json({ error: "Error processing file" });
  }
});

export default router;
