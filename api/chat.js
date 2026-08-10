import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION = `
너는 제공된 업무자료를 기반으로 답변하는 한국어 AI 챗봇이다.

반드시 지켜야 할 규칙:

1. 제공된 업무자료를 최우선으로 사용한다.
2. 서로 다른 업무 항목의 내용을 임의로 섞지 않는다.
3. 사용자가 여러 항목을 질문하면 각 항목을 명확하게 구분해서 답변한다.
4. 자료에 없는 내용을 추측하지 않는다.
5. 현장접수와 현장결제를 절대로 같은 의미로 취급하지 않는다.
6. 온라인접수와 온라인사전예약을 구분한다.
7. 자료에 명시되지 않은 사항은 가능하다고 단정하지 않는다.
8. 자료에 없는 내용은 "제공된 자료에서는 확인되지 않습니다."라고 안내한다.
9. 자연스럽고 이해하기 쉬운 한국어로 답변한다.
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

  return await fs.readFile(
    filePath,
    "utf8"
  );
}


// ==========================================
// TXT를 항목별로 분리
// ==========================================

function extractSections(text) {

  const lines = text.split(/\r?\n/);

  const sections = [];

  let currentSection = null;

  for (const line of lines) {

    const match = line.match(
      /^\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*(.*)/
    );

    if (match) {

      if (currentSection) {
        sections.push(currentSection);
      }

      const number = match[1];

      let title = match[2].trim();

      // 제목에 ":"가 있으면 앞부분만 제목으로 사용
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


// 띄어쓰기를 제거한 비교용 문자열
function compact(text) {

  return normalize(text)
    .replace(/\s/g, "");
}


// ==========================================
// 여러 항목 검색
// ==========================================

function findSections(sections, question) {

  const q = normalize(question);
  const compactQuestion = compact(question);

  console.log("사용자 질문:", question);

  console.log(
    "전체 항목:",
    sections.map(
      s => `${s.number} ${s.title}`
    )
  );


  // ========================================
  // 1. 제목을 띄어쓰기 무시하고 정확하게 검색
  // ========================================

  const directMatches = [];

  for (const section of sections) {

    const title = compact(section.title);

    if (
      title.length >= 4 &&
      compactQuestion.includes(title)
    ) {

      directMatches.push(section);
    }
  }


  if (directMatches.length > 0) {

    console.log(
      "제목으로 직접 검색된 항목:",
      directMatches.map(
        s => `${s.number} ${s.title}`
      )
    );

    return directMatches;
  }


  // ========================================
  // 2. 자연어 표현을 업무자료 표현으로 변환
  // ========================================

  const synonyms = {

    "술": [
      "음주운전",
      "음주",
    ],

    "술먹고": [
      "음주운전",
      "음주",
    ],

    "술때문에": [
      "음주운전",
      "음주",
    ],

    "면허정지": [
      "면허 정지",
      "정지 처분",
    ],

    "면허취소": [
      "면허 취소",
      "취소 처분",
    ],

    "예약": [
      "접수방법",
      "온라인사전예약",
      "인터넷 접수",
    ],

  };


  // ========================================
  // 3. 질문의 핵심 단어 추출
  // ========================================

  let keywords = q
    .split(" ")
    .filter(word => word.length >= 2);


  // ========================================
  // 4. 동의어 / 자연어 표현 추가
  // ========================================

  const additionalKeywords = [];


  for (const keyword of keywords) {

    if (synonyms[keyword]) {

      additionalKeywords.push(
        ...synonyms[keyword]
      );
    }
  }


  keywords = [
    ...keywords,
    ...additionalKeywords,
  ];


  // 중복 제거
  keywords = [
    ...new Set(
      keywords
    )
  ];


  console.log(
    "검색 키워드:",
    keywords
  );


  // ========================================
  // 5. 제목 + 내용 전체를 검색
  // ========================================

  const scored = [];


  for (const section of sections) {

    const titleText =
      normalize(section.title);

    const contentText =
      normalize(section.content);


    let score = 0;


    for (const keyword of keywords) {

      const normalizedKeyword =
        normalize(keyword);


      if (
        titleText.includes(
          normalizedKeyword
        )
      ) {

        // 제목에서 발견되면 높은 점수
        score += 5;

      } else if (
        contentText.includes(
          normalizedKeyword
        )
      ) {

        // 본문에서 발견되면 점수
        score += 2;
      }
    }


    if (score > 0) {

      scored.push({
        section,
        score,
      });
    }
  }


  // ========================================
  // 6. 점수 높은 순서대로 정렬
  // ========================================

  scored.sort(
    (a, b) =>
      b.score - a.score
  );


  // ========================================
  // 7. 관련 항목 최대 3개
  // ========================================

  const results =
    scored
      .slice(0, 3)
      .map(
        item => item.section
      );


  console.log(
    "최종 검색 결과:",
    results.map(
      s =>
        `${s.number} ${s.title}`
    )
  );


  return results;
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
        error: "질문을 입력해주세요.",
      });
    }


    // ======================================
    // 지식자료 읽기
    // ======================================

    const knowledge =
      await loadKnowledge();


    // ======================================
    // 항목 분리
    // ======================================

    const sections =
      extractSections(
        knowledge
      );


    console.log(
      "전체 항목 수:",
      sections.length
    );


    // ======================================
    // 여러 항목 검색
    // ======================================

    const matchedSections =
      findSections(
        sections,
        message
      );


    // ======================================
    // 검색 결과 없음
    // ======================================

    if (
      !matchedSections ||
      matchedSections.length === 0
    ) {

      return res.status(200).json({

        answer:
          "죄송합니다. 현재 제공된 업무자료에서는 해당 내용을 확인하기 어렵습니다.",

      });
    }


    // ======================================
    // 검색된 항목들을 각각 구분해서 전달
    // ======================================

    const referenceText =
      matchedSections
        .map(section => {

          return `
[${section.number} ${section.title}]

${section.content}

`;

        })
        .join("\n--------------------\n");


    console.log(
      "Gemini에게 전달하는 항목:",
      matchedSections.map(
        s => `${s.number} ${s.title}`
      )
    );


    // ======================================
    // Gemini 질문
    // ======================================

    const prompt = `
사용자 질문:
${message}

========================================

[관련 업무자료]

${referenceText}

========================================

위에 제공된 업무자료를 근거로 사용자 질문에 답변하세요.

중요:

1. 각 업무 항목을 반드시 구분해서 판단하세요.

2. 서로 다른 항목의 내용을 합쳐서
   하나의 업무처럼 설명하지 마세요.

3. 사용자가 두 가지 이상의 교육이나 업무를
   비교하거나 함께 질문했다면
   각각을 별도로 설명하세요.

4. "현장접수"와 "현장결제"는 완전히 다른 개념입니다.

5. 자료에 "온라인사전예약 필수"라고 되어 있고
   "현장접수 가능"이라고 명시되어 있지 않다면
   현장접수가 가능하다고 말하지 마세요.

6. 자료에 없는 내용을 추측하지 마세요.

7. 자료에서 확인되지 않는 내용은
   "제공된 자료에서는 확인되지 않습니다."
   라고 답변하세요.

8. 사용자가 이해하기 쉽도록
   필요한 경우 번호나 bullet point를 사용하세요.

9. 답변은 자연스러운 한국어로 작성하세요.
`;


    // ======================================
    // Gemini 호출
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
