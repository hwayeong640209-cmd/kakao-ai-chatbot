// api/chat.js

import fs from "fs";
import path from "path";

/* =========================================================
   기본 설정
========================================================= */

const API_KEY = process.env.GEMINI_API_KEY;

// 환경변수 GEMINI_MODEL 사용하지 않음
const MODEL = "gemini-2.5-flash";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1800;

/* =========================================================
   Knowledge 파일
========================================================= */

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

const FILES = {
  main: "챗봇22.txt",
  senior: "고령운전자 교통안전교육 관련 Q&A.txt",
  organization: "한국도로교통공단법.txt",
  daily: "일상 질문 Q&A.txt",
};

/* =========================================================
   파일 읽기
========================================================= */

function readKnowledgeFile(filename) {
  try {
    const filePath = path.join(KNOWLEDGE_DIR, filename);

    if (!fs.existsSync(filePath)) {
      console.error("Knowledge file not found:", filename);
      return "";
    }

    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error("Failed to read:", filename, error);
    return "";
  }
}

/* =========================================================
   Knowledge 전체 로드
========================================================= */

function loadKnowledge() {
  return {
    main: readKnowledgeFile(FILES.main),
    senior: readKnowledgeFile(FILES.senior),
    organization: readKnowledgeFile(FILES.organization),
    daily: readKnowledgeFile(FILES.daily),
  };
}

/* =========================================================
   질문 정규화
========================================================= */

function normalizeQuestion(question) {
  return question
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   질문 유형 감지
========================================================= */

function detectQuestionType(question) {
  const q = normalizeQuestion(question);

  const seniorKeywords = [
    "고령",
    "고령자",
    "고령운전자",
    "어르신",
    "75세",
    "75세 이상",
    "치매",
    "인지",
    "인지선별",
    "인지검사",
    "적성검사",
    "면허갱신",
    "면허 갱신",
  ];

  const organizationKeywords = [
    "도로교통공단",
    "한국도로교통공단",
    "도로공사",
    "한국도로공사",
    "교통안전공단",
    "한국교통안전공단",
    "공단이랑",
    "공단과",
    "공사랑",
    "공사와",
    "기관차이",
    "기관 차이",
    "어느 기관",
  ];

  const dailyKeywords = [
    "안녕",
    "안녕하세요",
    "고마워",
    "감사합니다",
    "감사해",
    "반가워",
    "누구야",
    "뭐야",
  ];

  if (seniorKeywords.some((k) => q.includes(k))) {
    return "senior";
  }

  if (organizationKeywords.some((k) => q.includes(k))) {
    return "organization";
  }

  if (dailyKeywords.some((k) => q.includes(k))) {
    return "daily";
  }

  return "general";
}

/* =========================================================
   토큰화
   질문에서 중요한 단어 추출
========================================================= */

function tokenize(text) {
  return normalizeQuestion(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

/* =========================================================
   자료를 문단/블록 단위로 분리
========================================================= */

function splitIntoChunks(text) {
  if (!text) return [];

  return text
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 20);
}

/* =========================================================
   질문과 자료의 관련도 계산

   단순히 "고령 질문이면 senior 파일만 사용"하지 않고
   실제 질문의 단어가 자료 어느 부분에 있는지 찾는다.
========================================================= */

function scoreChunk(question, chunk) {
  const questionTokens = tokenize(question);
  const normalizedChunk = normalizeQuestion(chunk);

  let score = 0;

  for (const token of questionTokens) {
    if (normalizedChunk.includes(token)) {
      score += token.length >= 4 ? 3 : 1;
    }
  }

  /* 주요 개념에 추가 가중치 */

  const importantPairs = [
    ["1종보통", "1종보통"],
    ["2종소형", "2종소형"],
    ["원동기", "원동기"],
    ["연습면허", "연습면허"],
    ["기능시험", "기능시험"],
    ["도로주행", "도로주행"],
    ["학과시험", "학과시험"],
    ["갱신", "갱신"],
    ["적성검사", "적성검사"],
    ["고령운전자", "고령운전자"],
    ["75세", "75세"],
    ["치매", "치매"],
    ["인지검사", "인지검사"],
    ["도로교통공단", "도로교통공단"],
    ["도로공사", "도로공사"],
  ];

  for (const [keyword] of importantPairs) {
    if (
      normalizeQuestion(question).includes(keyword) &&
      normalizedChunk.includes(keyword)
    ) {
      score += 8;
    }
  }

  return score;
}

/* =========================================================
   특정 파일에서 질문 관련 내용 추출
========================================================= */

function searchFile(question, filename, content, maxChunks = 12) {
  if (!content) return [];

  const chunks = splitIntoChunks(content);

  const scored = chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(question, chunk),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxChunks);
}

/* =========================================================
   관련 Knowledge 검색

   핵심:
   챗봇22는 항상 검색
   + 질문과 관련된 보조자료 검색
========================================================= */

function retrieveKnowledge(question, knowledge) {
  const type = detectQuestionType(question);

  const results = [];

  /* -------------------------------------------------------
     1. 챗봇22는 항상 최우선
  ------------------------------------------------------- */

  const mainResults = searchFile(
    question,
    FILES.main,
    knowledge.main,
    14
  );

  for (const item of mainResults) {
    results.push({
      source: FILES.main,
      priority: 1,
      score: item.score,
      text: item.chunk,
    });
  }

  /* -------------------------------------------------------
     2. 고령 관련 질문
  ------------------------------------------------------- */

  if (type === "senior") {
    const seniorResults = searchFile(
      question,
      FILES.senior,
      knowledge.senior,
      8
    );

    for (const item of seniorResults) {
      results.push({
        source: FILES.senior,
        priority: 2,
        score: item.score,
        text: item.chunk,
      });
    }
  }

  /* -------------------------------------------------------
     3. 기관 관련 질문
  ------------------------------------------------------- */

  if (type === "organization") {
    const organizationResults = searchFile(
      question,
      FILES.organization,
      knowledge.organization,
      8
    );

    for (const item of organizationResults) {
      results.push({
        source: FILES.organization,
        priority: 2,
        score: item.score,
        text: item.chunk,
      });
    }
  }

  /* -------------------------------------------------------
     4. 일반 질문에서도 관련 보조자료 검색

     예:
     "1종 연습면허로 원동기 타도 되나?"

     → general이지만 챗봇22 검색 결과가 부족하면
       senior/organization/daily도 관련 부분 검색
  ------------------------------------------------------- */

  if (type === "general") {
    const extraFiles = [
      [FILES.senior, knowledge.senior, 3],
      [FILES.organization, knowledge.organization, 3],
      [FILES.daily, knowledge.daily, 3],
    ];

    for (const [filename, content, priority] of extraFiles) {
      const fileResults = searchFile(
        question,
        filename,
        content,
        5
      );

      for (const item of fileResults) {
        results.push({
          source: filename,
          priority,
          score: item.score,
          text: item.chunk,
        });
      }
    }
  }

  /* -------------------------------------------------------
     5. 중복 제거
  ------------------------------------------------------- */

  const unique = [];
  const seen = new Set();

  results
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      return b.score - a.score;
    })
    .forEach((item) => {
      const key = item.text.substring(0, 200);

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    });

  return unique;
}

/* =========================================================
   Gemini에 전달할 자료 만들기
========================================================= */

function buildKnowledgeText(results) {
  if (!results.length) {
    return "관련 자료를 찾지 못했습니다.";
  }

  let output = "";

  let totalLength = 0;

  const MAX_TOTAL_LENGTH = 26000;

  for (const item of results) {
    const block = `
[자료: ${item.source}]
${item.text}

`;

    if (
      totalLength + block.length >
      MAX_TOTAL_LENGTH
    ) {
      continue;
    }

    output += block;
    totalLength += block.length;
  }

  return output;
}

/* =========================================================
   시스템 프롬프트
========================================================= */

function buildPrompt(question, knowledgeText) {
  return `
너는 한국도로교통공단의 운전면허 및 교통안전 관련 민원 안내를 돕는 챗봇이다.

사용자의 질문에 대해 아래 제공된 업무자료를 근거로 답변한다.

==================================================
[가장 중요한 답변 원칙]
==================================================

1. 챗봇22.txt의 내용이 가장 우선이다.

2. 챗봇22.txt에서 질문과 관련된 내용을 찾을 수 있다면
   반드시 그 내용을 중심으로 답변한다.

3. 질문의 표현이 자료의 표현과 달라도 의미가 같다면
   관련 내용을 찾아 답변한다.

예:
- "2종소형 따고 싶어"
- "2종 소형 추가취득"
- "1종보통 가지고 있는데 2종소형 응시"
- "원동기 면허 따려면"
- "연습면허로 원동기 운전 가능?"

이처럼 사용자가 자연어로 질문해도
자료에서 관련 내용을 찾아 답변한다.

4. 단순 키워드가 정확하게 일치하지 않는다고 해서
   "자료에서 확인되지 않습니다"라고 하지 않는다.

5. 질문과 관련된 여러 자료 조각을 종합하여 답변한다.

6. 단, 자료에 없는 내용을 일반 상식이나 기억으로
   임의로 추가하지 않는다.

7. 자료 간 내용이 충돌하면 챗봇22.txt를 우선한다.

8. 고령운전자 관련 질문은 챗봇22.txt를 우선하고,
   고령운전자 교통안전교육 관련 Q&A.txt를 보조자료로 활용한다.

9. 기관 관련 질문은 챗봇22.txt를 우선하고,
   한국도로교통공단법.txt를 보조자료로 활용한다.

10. 일상적인 인사는 일상 질문 Q&A.txt를 활용한다.

==================================================
[답변 방식]
==================================================

11. 질문의 핵심에 직접 답한다.

12. 사용자가 절차를 물어보면
    해당 절차를 순서대로 설명한다.

13. 사용자가 "무엇이 필요한가", "뭐 해야 하나"라고 물으면
    관련 준비사항과 절차를 함께 설명한다.

14. 사용자가 특정 나이, 면허 종류, 시험 종류 등을 제시하면
    그 조건에 맞는 답변을 한다.

15. 예를 들어:

"75세인데 면허 갱신하려면?"

이라고 물으면 단순히 교육 하나만 말하지 말고,
제공된 자료에 해당 연령의 갱신과 관련된
교육, 적성검사, 인지검사, 치매검사, 준비물,
신청방법 등의 내용이 있다면 함께 설명한다.

단, 자료에 없는 내용은 추가하지 않는다.

16. 비교 질문은 표 또는 bullet을 활용하여
    차이를 명확하게 설명한다.

예:
"도로교통공단과 도로공사는 뭐가 달라?"

라고 물으면 단순히 "서로 다른 기관입니다"라고 끝내지 말고,
자료에 확인되는 범위에서
소속, 주요 업무, 담당 영역 등의 차이를 설명한다.

17. 사용자가 절차를 요청하지 않았다면
    불필요하게 전체 업무자료를 나열하지 않는다.

18. 반대로 "절차를 알려줘", "자세히 알려줘"라고 하면
    관련 절차를 충분히 설명한다.

19. 답변은 일반적으로 5~10문장 정도로 한다.

20. 질문이 간단하면 짧게 답한다.

21. 질문이 복합적이면 관련된 내용을 묶어서 답한다.

22. 동일한 내용을 반복하지 않는다.

23. 자료에 있는 URL, 전화번호, 주소는
    필요한 경우 그대로 안내한다.

24. 내부 파일 이름을 사용자에게 굳이 설명하지 않는다.

25. 답변은 실제 운전면허시험장 직원이 민원인에게 설명하듯
    자연스럽고 이해하기 쉬운 한국어로 작성한다.

==================================================
[매우 중요한 제한]
==================================================

- 자료에 없는 법률 내용을 만들어내지 않는다.
- 자료에 없는 수수료를 만들어내지 않는다.
- 자료에 없는 전화번호를 만들어내지 않는다.
- 자료에 없는 절차를 만들어내지 않는다.
- 자료에 없는 기관 역할을 임의로 추가하지 않는다.

다만 자료에 관련 내용이 여러 군데 흩어져 있다면
그 내용을 찾아 하나의 자연스러운 답변으로 합쳐서 설명한다.

==================================================
[사용자 질문]
==================================================

${question}

==================================================
[검색된 업무자료]
==================================================

${knowledgeText}

==================================================
[최종 답변]
==================================================

사용자의 질문에 직접 답변하라.
검색된 업무자료에서 관련된 내용을 최대한 활용하라.
질문과 관계없는 내용은 제외하라.
`;
}

/* =========================================================
   Sleep
========================================================= */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* =========================================================
   Gemini API
========================================================= */

async function callGemini(prompt) {
  if (!API_KEY) {
    throw new Error(
      "GEMINI_API_KEY가 설정되지 않았습니다."
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  let lastError = null;

  for (
    let attempt = 0;
    attempt < MAX_RETRIES;
    attempt++
  ) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],

          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 1000,
          },
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const answer =
          data?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("")
            .trim();

        if (answer) {
          return answer;
        }

        throw new Error(
          "Gemini 응답 내용이 없습니다."
        );
      }

      const message =
        data?.error?.message ||
        `Gemini API 오류 (${response.status})`;

      lastError = new Error(message);

      console.error(
        `Gemini attempt ${attempt + 1}:`,
        response.status,
        message
      );

      /* 429만 재시도 */

      if (response.status === 429) {
        if (attempt < MAX_RETRIES - 1) {
          const delay =
            RETRY_BASE_DELAY *
            Math.pow(2, attempt);

          await sleep(delay);
          continue;
        }
      }

      break;

    } catch (error) {
      lastError = error;

      console.error(
        `Gemini request attempt ${attempt + 1}:`,
        error
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay =
          RETRY_BASE_DELAY *
          Math.pow(2, attempt);

        await sleep(delay);
      }
    }
  }

  throw (
    lastError ||
    new Error("Gemini API 호출 실패")
  );
}

/* =========================================================
   Gemini 실패 시 fallback
========================================================= */

function fallbackAnswer(question, knowledgeResults) {
  if (
    knowledgeResults &&
    knowledgeResults.length > 0
  ) {
    const top = knowledgeResults
      .slice(0, 3)
      .map((item) => item.text)
      .join("\n\n");

    return (
      "관련 업무자료에서 확인되는 내용입니다.\n\n" +
      top
    );
  }

  return (
    "현재 답변을 처리하는 데 일시적인 문제가 발생했습니다. " +
    "잠시 후 다시 질문해주세요."
  );
}

/* =========================================================
   HTTP Handler
========================================================= */

export default async function handler(req, res) {

  /* CORS */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  /* OPTIONS */

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  /* POST */

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다.",
    });
  }

  try {

    /* ---------------------------------------------
       질문 가져오기
    --------------------------------------------- */

    let question = "";

    if (
      typeof req.body === "object" &&
      req.body !== null
    ) {
      question =
        typeof req.body.question === "string"
          ? req.body.question.trim()
          : "";
    }

    /*
     * 혹시 body가 문자열로 들어오는 경우
     */

    if (!question && typeof req.body === "string") {
      try {
        const parsed =
          JSON.parse(req.body);

        if (
          typeof parsed.question === "string"
        ) {
          question =
            parsed.question.trim();
        }
      } catch (error) {
        console.error(
          "JSON parse error:",
          error
        );
      }
    }

    /* 질문 없음 */

    if (!question) {
      return res.status(400).json({
        error: "질문을 입력해주세요.",
      });
    }

    /* 질문 길이 제한 */

    const safeQuestion =
      question.substring(0, 2000);

    /* ---------------------------------------------
       Knowledge 로드
    --------------------------------------------- */

    const knowledge =
      loadKnowledge();

    /* ---------------------------------------------
       질문 관련 자료 검색
    --------------------------------------------- */

    const results =
      retrieveKnowledge(
        safeQuestion,
        knowledge
      );

    console.log(
      "Question:",
      safeQuestion
    );

    console.log(
      "Retrieved:",
      results.map((item) => ({
        source: item.source,
        score: item.score,
      }))
    );

    /* ---------------------------------------------
       Gemini용 자료
    --------------------------------------------- */

    const knowledgeText =
      buildKnowledgeText(results);

    /* ---------------------------------------------
       Prompt
    --------------------------------------------- */

    const prompt =
      buildPrompt(
        safeQuestion,
        knowledgeText
      );

    /* ---------------------------------------------
       Gemini 호출
    --------------------------------------------- */

    try {

      const answer =
        await callGemini(prompt);

      return res.status(200).json({
        answer,
      });

    } catch (geminiError) {

      console.error(
        "Gemini final error:",
        geminiError
      );

      /*
       * Gemini 실패하더라도
       * 검색된 자료가 있으면 자료 기반 답변
       */

      const fallback =
        fallbackAnswer(
          safeQuestion,
          results
        );

      return res.status(200).json({
        answer: fallback,
      });
    }

  } catch (error) {

    console.error(
      "Chatbot server error:",
      error
    );

    return res.status(500).json({
      error:
        "챗봇 처리 중 오류가 발생했습니다.",
    });
  }
}
