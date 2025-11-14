
import dotenv from "dotenv";
dotenv.config(); 

import express from "express";
import cors from "cors";
import summarizeRoute from "./routes/summarize"; 
import uploadRoute from "./routes/upload";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", summarizeRoute);
app.use("/api", uploadRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log("GEMINI_API_KEY ->", process.env.GEMINI_API_KEY);
});
