import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      answer: "POST 요청만 가능합니다."
    });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({
        answer: "질문을 입력해주세요."
      });
    }

    console.log("사용자 질문:", message);
    console.log(
      "API KEY 존재:",
      !!process.env.GEMINI_API_KEY
    );

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: message,
    });

    console.log("Gemini 응답 성공");

    return res.status(200).json({
      answer: result.text
    });

  } catch (error) {
    console.error("========== GEMINI ERROR ==========");
    console.error(error);
    console.error("===================================");

    return res.status(500).json({
      answer: "Gemini 호출 실패",
      error: error.message
    });
  }
}
