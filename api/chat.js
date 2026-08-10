import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ========================================
// AI 역할
// ========================================
const SYSTEM_INSTRUCTION = `
너는 사용자의 질문에 자연스럽고 정확하게 답변하는 1:1 AI 챗봇이다.

[답변 원칙]
- 사용자의 질문 의도를 먼저 파악한다.
- 제공된 업무자료가 있다면 반드시 그 자료를 우선적으로 참고한다.
- 자료에 없는 내용은 자료에 있다고 거짓말하지 않는다.
- 자료에서 답을 찾지 못했다면 "제공된 자료에서는 확인되지 않습니다."라고 말한다.
- 자료와 일반적인 지식을 구분한다.
- 한국어 질문에는 자연스러운 한국어로 답변한다.
- 초보자도 이해하기 쉽게 설명한다.
- 필요하면 항목별로 정리한다.
- 지나치게 장황하게 답하지 않는다.
`;

// ========================================
// 지식자료 읽기
// ========================================
async function loadKnowledge() {
  const filePath = path.join(
    process.cwd(),
    "knowledge",
    "챗봇22.txt"
  );

  return await fs.readFile(filePath, "utf8");
}

// ========================================
// 간단한 키워드 검색
// ========================================
function searchKnowledge(text, question) {
  const lines = text.split("\n");

  // 질문에서 의미 있는 단어 추출
  const keywords = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(word => word.length >= 2);

  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();

    let score = 0;

    for (const keyword of keywords) {
      if (line.includes(keyword)) {
        score++;
      }
    }

    if (score > 0) {
      // 검색된 줄 주변 내용도 함께 가져온다.
      const start = Math.max(0, i - 3);
      const end = Math.min(lines.length, i + 5);

      results.push({
        score,
        text: lines.slice(start, end).join("\n"),
      });
    }
  }

  // 관련도가 높은 내용부터 정렬
  results.sort((a, b) => b.score - a.score);

  // 중복 제거
  const unique = [];
  const seen = new Set();

  for (const result of results) {
    const key = result.text.trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(result.text);

    if (unique.length >= 5) {
      break;
    }
  }

  return unique;
}

// ========================================
// API
// ========================================
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

    // 1. 지식자료 읽기
    const knowledge = await loadKnowledge();

    // 2. 질문과 관련된 자료 검색
    const searchResults = searchKnowledge(
      knowledge,
      message
    );

    // 3. 검색 결과를 Gemini에게 전달
    const referenceText =
      searchResults.length > 0
        ? searchResults.join("\n\n--------------------\n\n")
        : "관련 자료를 찾지 못했습니다.";

    const prompt = `
사용자의 질문:
${message}

아래는 우리 챗봇이 보유한 업무자료에서
사용자의 질문과 관련해서 검색된 내용이다.

[검색된 자료]
${referenceText}

[답변 방법]
1. 검색된 자료를 가장 우선적으로 참고한다.
2. 자료에 명확한 답이 있으면 그 내용을 바탕으로 자연스럽게 설명한다.
3. 자료에 없는 내용을 임의로 만들어내지 않는다.
4. 자료에서 답을 찾을 수 없다면
   "제공된 자료에서는 해당 내용을 확인하기 어렵습니다."
   라고 안내한다.
5. 사용자가 이해하기 쉽도록 답변한다.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",

      contents: prompt,

      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    return res.status(200).json({
      answer: response.text,
    });

  } catch (error) {
    console.error("Gemini API Error:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Gemini API 호출 중 오류가 발생했습니다.",
    });
  }
}
