import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 챗봇 업무자료 읽기
const filePath = path.join(
  process.cwd(),
  "data",
  "chatbot22.txt"
);

const knowledge = fs.readFileSync(filePath, "utf-8");


// 질문과 관련된 내용을 찾는 함수
function findRelevantSections(question) {
  const sections = knowledge
    .split(/\n(?=\d+\)|\d+\.)/)
    .map(section => section.trim())
    .filter(Boolean);

  const words = question
    .toLowerCase()
    .replace(/[^\w가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length >= 2);

  const scored = sections.map(section => {
    const lowerSection = section.toLowerCase();

    let score = 0;

    for (const word of words) {
      if (lowerSection.includes(word)) {
        score++;
      }
    }

    return {
      section,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const relevant = scored
    .filter(item => item.score > 0)
    .slice(0, 5)
    .map(item => item.section);

  return relevant.join("\n\n");
}


export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다."
    });
  }

  try {

    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "메시지를 입력해주세요."
      });
    }


    // 질문과 관련된 업무자료 찾기
    const relevantKnowledge =
      findRelevantSections(message);


    // 관련 자료가 없는 경우
    if (!relevantKnowledge) {
      return res.status(200).json({
        answer:
          "죄송합니다. 현재 업무자료에서 해당 질문에 대한 정확한 안내 내용을 찾지 못했습니다."
      });
    }


    const prompt = `
당신은 한국도로교통공단 전남운전면허시험장
업무 안내 전문 챗봇입니다.

반드시 아래의 [업무자료]만을 근거로 답변하세요.

중요 규칙:

1. 업무자료에 없는 사실을 절대로 만들어내지 마세요.
2. 일반적인 상식이나 인터넷에서 알고 있는 내용을 추가하지 마세요.
3. 업무자료에 질문에 대한 답이 없으면
   "현재 업무자료에서 확인되지 않습니다."
   라고 답하세요.
4. 질문과 관련된 내용만 간결하게 답변하세요.
5. 필요하면 다음 형식을 사용하세요.

[핵심]
[절차]
[준비물]
[수수료]
[주의사항]

6. 업무자료에 여러 정보가 있더라도 질문에 필요한 내용만 선택하세요.
7. 사용자가 "안녕", "안녕하세요"처럼 인사하면
   업무자료의 내용을 억지로 인용하지 말고
   자연스럽게 인사한 뒤 도움을 받을 수 있는 업무를 안내하세요.
8. 숫자, 시간, 수수료, 나이, 면제 여부 등은
   업무자료에 있는 내용을 그대로 사용하세요.
9. 업무자료에 서로 다른 내용이 있으면 임의로 판단하여 수정하지 마세요.
10. 답변은 한국어로 하세요.

[사용자 질문]
${message}

[질문과 관련하여 검색된 업무자료]
${relevantKnowledge}
`;


    const interaction = await ai.interactions.create({
      model: "gemini-3.5-flash-lite",
      input: prompt,
    });


    const answer =
      interaction.output_text;


    if (!answer) {
      return res.status(500).json({
        error: "Gemini에서 답변을 받지 못했습니다."
      });
    }


    return res.status(200).json({
      answer: answer.trim()
    });


  } catch (error) {

    console.error(
      "Gemini API Error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Gemini API 호출 중 오류가 발생했습니다."
    });
  }
}
