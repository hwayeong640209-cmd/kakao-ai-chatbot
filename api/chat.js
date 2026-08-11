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
    // ==========================================
    // 1. API KEY 확인
    // ==========================================

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY가 없습니다.");

      return res.status(500).json({
        answer: "GEMINI_API_KEY가 설정되지 않았습니다."
      });
    }

    // ==========================================
    // 2. 사용자 질문
    // ==========================================

    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        answer: "질문을 입력해주세요."
      });
    }

    // ==========================================
    // 3. Gemini 연결
    // ==========================================

    const ai = new GoogleGenAI({
      apiKey: apiKey
    });

    // ==========================================
    // 4. Gemini 호출
    // ==========================================

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",

      contents: message,

      config: {
        systemInstruction: `
당신은 한국도로교통공단 전남운전면허시험장
업무 안내 챗봇입니다.

사용자의 질문에 친절하고 이해하기 쉽게 답변하세요.

답변은 가능하면 다음과 같이 구성하세요.

핵심:
질문에 대한 가장 중요한 답변을 먼저 설명합니다.

절차:
필요한 경우 순서대로 설명합니다.

준비물:
필요한 준비물을 설명합니다.

수수료:
확인 가능한 경우 설명합니다.

참고:
주의사항이나 추가로 알아야 할 내용을 설명합니다.

모든 질문에 무조건 모든 항목을 사용할 필요는 없습니다.

모르는 내용은 추측하지 말고
"현재 제공된 정보만으로는 정확한 내용을 확인하기 어렵습니다."
라고 답변하세요.

사용자가 일상적인 표현으로 질문하더라도
질문의 의도를 파악해서 쉽게 설명하세요.
        `,

        maxOutputTokens: 1000
      }
    });

    // ==========================================
    // 5. 답변 확인
    // ==========================================

    const answer = response.text;

    if (!answer) {
      console.error("Gemini 응답에 text가 없습니다.");
      console.error(response);

      return res.status(500).json({
        answer: "Gemini에서 답변을 받지 못했습니다."
      });
    }

    // ==========================================
    // 6. 정상 응답
    // ==========================================

    return res.status(200).json({
      answer: answer.trim()
    });

  } catch (error) {

    console.error("================================");
    console.error("Gemini API 오류");
    console.error(error);
    console.error("================================");

    return res.status(500).json({
      answer: "Gemini API 호출 중 오류가 발생했습니다.",
      detail: error?.message || String(error)
    });
  }
}
