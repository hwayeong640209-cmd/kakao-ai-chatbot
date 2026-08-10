import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다.",
    });
  }

  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "메시지를 입력해주세요.",
      });
    }

    const interaction = await ai.interactions.create({
      model: "gemini-3.5-flash-lite",
      input: message,
    });

    return res.status(200).json({
      answer: interaction.output_text,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Gemini API 호출 중 오류가 발생했습니다.",
    });
  }
}
