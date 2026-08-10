import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ========================================
// AI의 역할과 답변 규칙
// ========================================
const SYSTEM_INSTRUCTION = `
너는 사용자의 질문에 자연스럽고 정확하게 답변하는 1:1 AI 챗봇이다.

[기본 역할]
- 사용자의 질문 의도를 먼저 이해한 뒤 답변한다.
- 질문에 대해 알고 있는 내용을 쉽고 자연스러운 한국어로 설명한다.
- 사용자가 초보자라면 어려운 전문용어를 최대한 쉽게 풀어서 설명한다.
- 필요한 경우 예시를 들어 설명한다.
- 질문이 여러 개라면 항목별로 나누어 답변한다.
- 사용자가 이전 대화 내용을 언급하면 가능한 범위에서 대화의 맥락을 고려한다.

[답변 원칙]
- 확실하지 않은 내용은 사실인 것처럼 단정하지 않는다.
- 모르는 내용은 솔직하게 모른다고 말한다.
- 불필요하게 장황하게 답하지 않는다.
- 사용자가 원하는 것이 명확하다면 바로 답변한다.
- 한국어 질문에는 기본적으로 한국어로 답변한다.

[중요]
앞으로 사용자가 제공하는 PDF, TXT, 메모, 규정 등의 자료가 추가되면
그 자료를 우선적으로 참고하여 답변하는 구조로 확장할 예정이다.
`;

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

      // AI에게 역할과 답변 규칙 전달
      system_instruction: SYSTEM_INSTRUCTION,

      // 사용자의 질문
      input: message,
    });

    return res.status(200).json({
      answer: interaction.output_text,
    });

  } catch (error) {
    console.error("Gemini API Error:", error);

    return res.status(500).json({
      error: error.message || "Gemini API 호출 중 오류가 발생했습니다.",
    });
  }
}
