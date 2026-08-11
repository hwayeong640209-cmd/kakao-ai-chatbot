import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      answer: "POST 요청만 가능합니다."
    });
  }

  try {
    // API KEY 확인
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY가 없습니다.");

      return res.status(500).json({
        answer: "서버에 Gemini API Key가 설정되지 않았습니다."
      });
    }

    // 요청 데이터
    const body = req.body || {};
    const message = body.message;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        answer: "질문을 입력해주세요."
      });
    }

    // Gemini 연결
    const ai = new GoogleGenAI({
      apiKey: apiKey
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: message,
      config: {
        temperature: 0.2,
        maxOutputTokens: 1000
      }
    });

    const answer = response.text;

    if (!answer) {
      return res.status(500).json({
        answer: "Gemini에서 답변을 받지 못했습니다."
      });
    }

    console.log("사용자 질문:", message);
    console.log("Gemini 답변:", answer);

    return res.status(200).json({
      answer: answer.trim()
    });

  } catch (error) {
    console.error("========== GEMINI ERROR ==========");
    console.error(error);
    console.error("===================================");

    return res.status(500).json({
      answer: "Gemini API 처리 중 오류가 발생했습니다.",
      detail: error?.message || String(error)
    });
  }
}
