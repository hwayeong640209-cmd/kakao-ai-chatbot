import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

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
      error: "POST 요청만 허용됩니다.",
    });
  }

  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "메시지를 입력해주세요.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY가 설정되지 않았습니다.",
      });
    }

    // 챗봇22.txt 읽기
    const filePath = path.join(process.cwd(), "챗봇22.txt");

    const knowledge = fs.readFileSync(filePath, "utf8");

    const prompt = `
너는 "한국도로교통공단 전남운전면허시험장 업무용 챗봇"이다.

아래 [업무자료]만을 근거로 사용자 질문에 답변한다.

절대로 업무자료에 없는 내용을 추측하거나 만들어내지 않는다.

업무자료와 질문이 관련이 없으면 다음과 같이 답한다.

"죄송합니다. 전남운전면허시험장 업무자료에 해당 내용이 없어 정확한 안내가 어렵습니다."

답변할 때는 다음 원칙을 지킨다.

1. 업무자료의 내용을 최우선으로 사용한다.
2. 업무자료에 없는 수수료, 시간, 준비물, 절차 등을 임의로 만들지 않는다.
3. 사용자가 묻는 내용과 직접 관련된 정보만 간결하게 답한다.
4. 필요한 경우 순서대로 번호를 붙여 설명한다.
5. 금액과 시간은 업무자료에 적힌 내용을 그대로 사용한다.
6. "전남시험장", "전남운전면허시험장"은 같은 장소를 의미한다.
7. 사용자가 나이, 면허종류, 취득하려는 면허 등을 말하면 해당 조건에 맞는 내용만 안내한다.
8. 인사말에는 자연스럽게 응답한다.
9. 답변 첫머리에 "[핵심]" 같은 불필요한 표시를 붙이지 않는다.
10. 답변은 한국어로 한다.

[업무자료]
${knowledge}

[사용자 질문]
${message}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
    });

    const answer = response.text;

    if (!answer) {
      return res.status(500).json({
        error: "Gemini에서 답변을 받지 못했습니다.",
      });
    }

    return res.status(200).json({
      answer: answer.trim(),
    });

  } catch (error) {
    console.error("CHAT ERROR:", error);

    return res.status(500).json({
      error: "서버에서 오류가 발생했습니다.",
      detail: error.message,
    });
  }
}
