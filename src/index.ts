
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import summarizeRoute from "./routes/summarize";
import uploadRoute from "./routes/upload"; // ✅ new import

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Register both routes here
app.use("/api", summarizeRoute);
app.use("/api", uploadRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
