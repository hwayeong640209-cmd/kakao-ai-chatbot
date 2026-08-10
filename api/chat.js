import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ==========================================
// AI 기본 지침
// ==========================================
const SYSTEM_INSTRUCTION = `
너는 업무자료를 기반으로 답변하는 한국어 AI 챗봇이다.

가장 중요한 원칙:

1. 사용자 질문과 관련된 제공 자료만 근거로 답변한다.
2. 서로 다른 업무나 항목의 내용을 절대로 섞지 않는다.
3. 자료에 명시되지 않은 내용을 추측해서 추가하지 않는다.
4. "현장접수", "현장결제", "온라인예약", "온라인사전예약"처럼
   의미가 다른 표현을 절대로 같은 의미로 바꾸지 않는다.
5. 자료에 "온라인사전예약 필수"라고 되어 있다면
   자료에 현장접수가 가능하다고 명시되어 있지 않는 한
   현장접수가 가능하다고 말하지 않는다.
6. 자료의 내용과 일반적인 상식이 다를 경우,
   이 챗봇에서는 제공된 자료를 우선한다.
7. 자료에서 확인되지 않는 내용은 추측하지 말고
   "제공된 자료에서는 확인되지 않습니다."라고 안내한다.
8. 사용자가 이해하기 쉬운 자연스러운 한국어로 답변한다.
9. 필요하면 번호나 bullet point를 사용한다.

특히 중요:
제공된 자료에 서로 다른 항목이 함께 있더라도
각 항목의 내용을 서로 섞어서는 안 된다.
`;

// ==========================================
// 지식자료 읽기
// ==========================================
async function loadKnowledge() {
  const filePath = path.join(
    process.cwd(),
    "knowledge",
    "챗봇22.txt"
  );

  return await fs.readFile(filePath, "utf8");
}

// ==========================================
// TXT를 항목별로 분리
//
// 예:
// ① 응시전교통안전교육
// 내용...
//
// ② 특별교통안전교육
// 내용...
//
// 처럼 되어 있는 자료를 각각 하나의 항목으로 분리한다.
// ==========================================
function splitIntoSections(text) {
  const lines = text.split(/\r?\n/);

  const sections = [];
  let current = null;

  for (const line of lines) {

    // ① ~ ⑳ 형태의 항목 제목 찾기
    const match = line.match(
      /^\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*(.*)$/
    );

    if (match) {

      // 기존 항목 저장
      if (current) {
        sections.push(current);
      }

      current = {
        title: `${match[1]} ${match[2]}`.trim(),
        content: line.trim(),
      };

    } else if (current) {

      current.content += "\n" + line;
    }
  }

  // 마지막 항목
  if (current) {
    sections.push(current);
  }

  return sections;
}

// ==========================================
// 텍스트 정리
// ==========================================
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ==========================================
// 질문과 가장 관련된 항목 찾기
// ==========================================
function findBestSection(sections, question) {

  const normalizedQuestion = normalize(question);

  // --------------------------------------
  // 1. 제목에 질문의 핵심 표현이 정확하게
  //    들어있는 항목을 최우선으로 선택
  // --------------------------------------

  let exactMatches = sections.filter(section => {

    const title = normalize(section.title);

    // 제목 전체가 질문에 포함되는 경우
    if (
      title.length >= 4 &&
      normalizedQuestion.includes(title)
    ) {
      return true;
    }

    // 번호를 제외한 제목으로 비교
    const titleWithoutNumber = title
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/, "");

    if (
      titleWithoutNumber.length >= 4 &&
      normalizedQuestion.includes(titleWithoutNumber)
    ) {
      return true;
    }

    return false;
  });

  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  // --------------------------------------
  // 2. 정확한 제목이 없다면
  //    질문의 단어와 가장 많이 겹치는 항목 검색
  // --------------------------------------

  const keywords = normalizedQuestion
    .split(" ")
    .filter(word => word.length >= 2);

  const scored = sections.map(section => {

    const sectionText = normalize(
      section.title + " " + section.content
    );

    let score = 0;

    for (const keyword of keywords) {

      if (sectionText.includes(keyword)) {
        score++;
      }
    }

    return {
      section,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score === 0) {
    return null;
  }

  return scored[0].section;
}

// ==========================================
// API
// ==========================================
export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다.",
    });
  }

  try {

    const { message } = req.body;

    if (
      !message ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "메시지를 입력해주세요.",
      });
    }

    // --------------------------------------
    // 1. 지식자료 읽기
    // --------------------------------------

    const knowledge = await loadKnowledge();

    // --------------------------------------
    // 2. 항목별로 분리
    // --------------------------------------

    const sections = splitIntoSections(knowledge);

    console.log(
      "총 항목 수:",
      sections.length
    );

    // --------------------------------------
    // 3. 질문과 가장 관련된 항목 찾기
    // --------------------------------------

    const bestSection = findBestSection(
      sections,
      message
    );

    // --------------------------------------
    // 4. 관련 자료가 없으면
    // --------------------------------------

    if (!bestSection) {

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",

        contents: `
사용자 질문:
${message}

제공된 업무자료에서 질문과 직접적으로 관련된 항목을 찾지 못했습니다.

자료에 없는 내용을 업무자료에 있는 것처럼 만들어내지 마세요.

다음과 같이 자연스럽게 안내해주세요:

"죄송합니다. 현재 제공된 업무자료에서는 해당 내용을 확인하기 어렵습니다."
`,

        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      return res.status(200).json({
        answer: response.text,
      });
    }

    // --------------------------------------
    // 5. 오직 선택된 항목만 Gemini에게 전달
    // --------------------------------------

    const referenceText = bestSection.content;

    console.log(
      "선택된 항목:",
      bestSection.title
    );

    // --------------------------------------
    // 6. Gemini에게 답변 요청
    // --------------------------------------

    const prompt = `
사용자 질문:
${message}

============================

[질문과 관련된 업무자료]

${referenceText}

============================

위 자료만 근거로 사용자의 질문에 답변하세요.

중요한 규칙:

- 위 자료는 하나의 업무 항목입니다.
- 다른 업무 항목의 내용을 가져오지 마세요.
- 자료에 없는 내용을 추측하지 마세요.
- "현장접수"와 "현장결제"를 동일하게 취급하지 마세요.
- "온라인예약"과 "온라인사전예약 필수"를 구분하세요.
- 자료에 명확하게 적혀 있지 않은 사항은
  가능하다고 단정하지 마세요.
- 사용자가 질문한 내용에 해당하는 부분만 간결하게 답변하세요.

답변:
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

    console.error(
      "Gemini API Error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Gemini API 호출 중 오류가 발생했습니다.",
    });
  }
}
