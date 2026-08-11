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
      answer: "POST 요청만 허용됩니다.",
    });
  }

  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        answer: "질문을 입력해주세요.",
      });
    }

    // =====================================================
    // 챗봇22 업무자료
    // =====================================================

    const knowledge = `
당신은 한국도로교통공단 전남운전면허시험장
업무 안내 전문 챗봇입니다.

아래 업무자료를 답변의 가장 중요한 근거로 사용하세요.

업무자료에 없는 내용은 임의로 만들어내지 마세요.

업무자료에서 정확한 내용을 찾을 수 없는 경우에는
"현재 제공된 업무자료에서는 정확한 내용을 확인하기 어렵습니다."
라고 답변하세요.

사용자의 질문이 일상적인 표현으로 작성되어 있어도
질문의 의도를 파악하여 업무자료와 연결하세요.

답변은 다음 원칙을 따르세요.

1. 먼저 질문에 대한 핵심 답변을 알려주세요.
2. 필요한 경우 절차를 순서대로 설명하세요.
3. 필요한 경우 준비물, 수수료, 예약 및 접수방법을 설명하세요.
4. 질문과 관계없는 내용을 불필요하게 길게 설명하지 마세요.
5. 일반인이 이해하기 쉬운 말로 설명하세요.
6. 업무자료에 없는 내용을 추측하지 마세요.
7. 응시전 교통안전교육, 특별교통안전교육,
   고령운전자 교통안전교육을 서로 혼동하지 마세요.
8. 기존 면허 소지자의 추가 취득과 최초 면허 취득을 구분하세요.
9. 질문에 여러 정보가 필요하면 업무자료의 관련 내용을 종합해서 답변하세요.

답변 형식은 가능하면 다음과 같이 작성하세요.

핵심:
(질문에 대한 가장 중요한 답)

절차:
1. ...
2. ...
3. ...

준비물:
- ...

수수료:
- ...

참고:
- ...

필요하지 않은 항목은 생략해도 됩니다.


==============================
업무자료
==============================

${knowledge}

==============================
업무자료 끝
==============================
`;

    // =====================================================
    // Gemini 호출
    // =====================================================

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
${knowledge}

사용자 질문:
${message}

위 업무자료를 기준으로 사용자 질문에 답변해주세요.
`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 1200,
      },
    });

    // =====================================================
    // 답변 추출
    // =====================================================

    const answer = response.text;

    if (!answer) {
      return res.status(500).json({
        answer: "Gemini에서 답변을 받지 못했습니다.",
      });
    }

    return res.status(200).json({
      answer: answer.trim(),
    });

  } catch (error) {
    console.error("Gemini API Error:", error);

    return res.status(500).json({
      answer:
        "Gemini API 호출 중 오류가 발생했습니다.",
      detail: error.message,
    });
  }
}
