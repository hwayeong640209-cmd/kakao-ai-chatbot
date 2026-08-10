import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION = `
너는 제공된 업무자료를 기반으로 답변하는 한국어 AI 챗봇이다.

반드시 지켜야 할 규칙:

1. 제공된 자료를 최우선으로 사용한다.
2. 서로 다른 업무 항목의 내용을 절대로 섞지 않는다.
3. 자료에 없는 내용을 추측하지 않는다.
4. 현장접수와 현장결제를 절대로 같은 의미로 취급하지 않는다.
5. 온라인예약과 온라인사전예약 필수를 구분한다.
6. 자료에 명시되지 않은 사항을 가능하다고 단정하지 않는다.
7. 자료에서 확인되지 않는 경우에는
   "제공된 자료에서는 해당 내용을 확인하기 어렵습니다."
   라고 답한다.
8. 사용자가 이해하기 쉬운 자연스러운 한국어로 답한다.
`;

async function loadKnowledge() {
  const filePath = path.join(
    process.cwd(),
    "knowledge",
    "챗봇22.txt"
  );

  return await fs.readFile(filePath, "utf8");
}


// ==========================================
// 항목 추출
// ==========================================
function extractSections(text) {

  const lines = text.split(/\r?\n/);

  const sections = [];

  let currentSection = null;

  for (const line of lines) {

    // ①, ②, ③ ... 로 시작하는 항목 찾기
    const match = line.match(
      /^\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*(.*)/
    );

    if (match) {

      // 이전 항목 저장
      if (currentSection) {
        sections.push(currentSection);
      }

      const number = match[1];

      let title = match[2].trim();

      // ":" 뒤의 설명은 제목에서 제거
      if (title.includes(":")) {
        title = title.split(":")[0].trim();
      }

      currentSection = {
        number,
        title,
        content: line.trim(),
      };

    } else {

      if (currentSection) {
        currentSection.content += "\n" + line;
      }
    }
  }

  // 마지막 항목
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}


// ==========================================
// 문자열 정리
// ==========================================
function normalize(text) {

  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ==========================================
// 질문에서 특정 항목명 찾기
// ==========================================
function findSections(sections, question) {

  const q = normalize(question);

  console.log("사용자 질문:", question);

  console.log(
    "인식된 항목:",
    sections.map(
      s => `${s.number} ${s.title}`
    )
  );


  // ========================================
  // 1순위
  // 항목 제목이 질문에 직접 포함되어 있는지 확인
  // ========================================

  for (const section of sections) {

    const title = normalize(section.title);

    if (
      title.length >= 4 &&
      q.includes(title)
    ) {

      console.log(
        "정확히 선택된 항목:",
        section.number,
        section.title
      );

      return section;
    }
  }


  // ========================================
  // 2순위
  // 제목의 핵심 단어가 질문에 포함되어 있는지
  // ========================================

  for (const section of sections) {

    const titleWords = normalize(section.title)
      .split(" ")
      .filter(word => word.length >= 2);

    let matched = 0;

    for (const word of titleWords) {

      if (q.includes(word)) {
        matched++;
      }
    }

    if (matched >= 1) {

      console.log(
        "키워드로 선택된 항목:",
        section.number,
        section.title
      );

      return section;
    }
  }


  console.log("관련 항목을 찾지 못함");

  return null;
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
      typeof message !== "string"
    ) {

      return res.status(400).json({
        error: "질문을 입력해주세요.",
      });
    }


    // ======================================
    // TXT 읽기
    // ======================================

    const knowledge = await loadKnowledge();


    // ======================================
    // 항목 분리
    // ======================================

    const sections =
      extractSections(knowledge);


    console.log(
      "전체 항목 수:",
      sections.length
    );


    // ======================================
    // 질문에 맞는 항목 찾기
    // ======================================

    const section =
      findSection(
        sections,
        message
      );


    // ======================================
    // 항목을 못 찾은 경우
    // ======================================

    if (!section) {

      return res.status(200).json({

        answer:
          "죄송합니다. 현재 제공된 업무자료에서는 해당 내용을 확인하기 어렵습니다.",

      });
    }


    // ======================================
    // 선택된 항목만 AI에게 전달
    // ======================================

    const referenceText =
      section.content;


    console.log(
      "Gemini에게 전달하는 항목:",
      section.number,
      section.title
    );


    const prompt = `
사용자 질문:
${message}

--------------------------------

[업무자료]

${referenceText}

--------------------------------

위 업무자료는 하나의 독립된 업무 항목이다.

이 자료만 근거로 사용자의 질문에 답변하라.

절대 다른 업무의 정보를 추가하지 마라.

특히 다음을 엄격하게 구분하라.

- 현장접수
- 현장결제
- 온라인접수
- 온라인사전예약

자료에 "온라인사전예약 필수"라고 되어 있다면
현장접수가 가능하다고 추측하지 마라.

자료에 명시되어 있지 않은 내용은
가능하다고 단정하지 마라.

답변은 자연스러운 한국어로 작성하라.
`;


    // ======================================
    // Gemini
    // ======================================

    const response =
      await ai.models.generateContent({

        model:
          "gemini-3.5-flash-lite",

        contents:
          prompt,

        config: {
          systemInstruction:
            SYSTEM_INSTRUCTION,
        },

      });


    return res.status(200).json({

      answer:
        response.text,

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
