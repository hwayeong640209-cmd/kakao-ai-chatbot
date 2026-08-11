import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export default async function handler(req, res) {
  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다.",
    });
  }

  try {
    // =========================
    // 1. 사용자 질문 확인
    // =========================
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "메시지를 입력해주세요.",
      });
    }

    // =========================
    // 2. 챗봇22.txt 읽기
    // =========================
    const filePath = path.join(
      process.cwd(),
      "data",
      "챗봇22.txt"
    );

    const knowledge = fs.readFileSync(filePath, "utf8");

    // =========================
    // 3. Gemini에게 전달할 지침
    // =========================
    const prompt = `
당신은 "한국도로교통공단 전남운전면허시험장 업무 안내 챗봇"입니다.

아래 [업무자료]에 있는 내용만을 근거로 답변하세요.

중요한 규칙:

1. 반드시 [업무자료]를 최우선으로 사용하세요.
2. 업무자료에 없는 내용은 추측해서 답변하지 마세요.
3. 일반적인 상식이나 인터넷에서 알고 있는 내용을 임의로 추가하지 마세요.
4. 사용자의 질문에 필요한 내용만 쉽고 정확하게 설명하세요.
5. 업무자료에 정확한 답이 없으면
   "제공된 업무자료에서 정확한 내용을 확인하기 어렵습니다."
   라고 답하세요.
6. 서로 다른 업무의 내용을 섞어서 답변하지 마세요.
7. 특히 면허 종류, 나이, 적성검사, 갱신, 시험 면제 여부, 수수료 등은 업무자료에 적힌 조건을 정확하게 구분하세요.
8. 질문이 애매하면 필요한 정보를 먼저 물어보세요.
9. 인사나 간단한 대화에는 자연스럽게 응답해도 됩니다.
10. 답변은 한국어로 하세요.
11. 답변에 [핵심], [주의사항] 같은 불필요한 태그를 붙이지 마세요.
12. 업무자료에 있는 URL은 필요할 경우 그대로 안내할 수 있습니다.

[업무자료]
${knowledge}

[사용자 질문]
${message}
`;

    // =========================
    // 4. Gemini 호출
    // =========================
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
    });

    // =========================
    // 5. 답변 추출
    // =========================
    const answer = response.text;

    if (!answer) {
      return res.status(500).json({
        error: "Gemini에서 답변을 받지 못했습니다.",
      });
    }

    // =========================
    // 6. 정상적인 JSON 응답
    // =========================
    return res.status(200).json({
      answer: answer.trim(),
    });

  } catch (error) {
    console.error("CHAT ERROR:", error);

    return res.status(500).json({
      error: "서버에서 오류가 발생했습니다.",
      detail:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
}
