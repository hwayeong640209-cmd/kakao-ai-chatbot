import fs from "fs";
import path from "path";

/*
===========================================================
  한국도로교통공단 카카오톡 챗봇
  - 자료 우선순위 검색
  - 고령운전자 Q&A 우선 검색
  - 기관 구분 질문 별도 처리
  - 429 자동 재시도
  - Gemini 전달 자료 최소화
  - 긴 답변 방지
  - 자료 밖의 내용 추측 금지
===========================================================
*/

// =========================================================
// 1. 기본 설정
// =========================================================

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

const MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash";

const API_KEY = process.env.GEMINI_API_KEY;

// Gemini 요청 횟수
const MAX_RETRY = 4;

// Gemini에 전달할 최대 문자 수
const MAX_CONTEXT_LENGTH = 12000;

// 검색 결과 하나당 최대 문자 수
const MAX_CHUNK_LENGTH = 3500;


// =========================================================
// 2. 파일명
// =========================================================

const FILES = {
  MAIN: "챗봇22.txt",
  ELDERLY: "고령운전자 교통안전교육 관련 Q&A.txt",
  DAILY: "일상 질문 Q&A.txt",
  LAW: "한국도로교통공단법.txt",
};


// =========================================================
// 3. 파일 읽기
// =========================================================

function readKnowledge(filename) {
  try {
    const filePath = path.join(KNOWLEDGE_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return "";
    }

    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`파일 읽기 오류: ${filename}`, error);
    return "";
  }
}


// =========================================================
// 4. 질문 정규화
// =========================================================

function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


// =========================================================
// 5. 질문 유형 판별
// =========================================================

function detectQuestionType(question) {
  const q = normalize(question);

  // -------------------------------
  // 고령운전자
  // -------------------------------

  const elderlyKeywords = [
    "75세",
    "75 세",
    "고령",
    "고령자",
    "고령운전자",
    "고령 운전자",
    "고령자교육",
    "고령자 교육",
    "고령운전자교육",
    "고령운전자 교육",
    "치매검사",
    "치매안심센터",
    "인지선별검사",
    "cist",
    "인지검사",
  ];

  if (elderlyKeywords.some(k => q.includes(k))) {
    return "ELDERLY";
  }


  // -------------------------------
  // 기관 차이
  // -------------------------------

  const institutionKeywords = [
    "도로교통공단",
    "도로공사",
    "한국도로공사",
    "교통안전공단",
    "한국교통안전공단",
    "도로교통공단이랑",
    "도로공사랑",
    "공단이랑",
    "공사랑",
    "기관 차이",
    "기관차이",
    "무슨 차이",
    "뭐가 달라",
    "어디가 다른",
  ];

  if (institutionKeywords.some(k => q.includes(k))) {
    return "INSTITUTION";
  }


  // -------------------------------
  // 법령
  // -------------------------------

  const lawKeywords = [
    "법령",
    "법률",
    "법 조항",
    "조문",
    "시행령",
    "시행규칙",
    "법적 근거",
    "법적으로",
  ];

  if (lawKeywords.some(k => q.includes(k))) {
    return "LAW";
  }


  // -------------------------------
  // 면허시험 / 면허취득
  // -------------------------------

  const licenseKeywords = [
    "면허",
    "운전면허",
    "갱신",
    "적성검사",
    "재발급",
    "기능시험",
    "학과시험",
    "필기시험",
    "도로주행",
    "연습면허",
    "면허취득",
    "면허 따",
    "시험 예약",
    "시험접수",
    "예약",
  ];

  if (licenseKeywords.some(k => q.includes(k))) {
    return "LICENSE";
  }


  // -------------------------------
  // 교통안전교육
  // -------------------------------

  const educationKeywords = [
    "교통안전교육",
    "안전교육",
    "응시전교육",
    "응시 전 교육",
    "특별교통안전교육",
    "교육 예약",
    "교육 신청",
  ];

  if (educationKeywords.some(k => q.includes(k))) {
    return "EDUCATION";
  }


  return "GENERAL";
}


// =========================================================
// 6. 텍스트를 작은 단위로 분리
// =========================================================

function splitIntoChunks(text) {
  if (!text) return [];

  const sections = text
    .split(/\n\s*\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const chunks = [];

  for (const section of sections) {
    if (section.length <= MAX_CHUNK_LENGTH) {
      chunks.push(section);
      continue;
    }

    for (let i = 0; i < section.length; i += MAX_CHUNK_LENGTH) {
      chunks.push(
        section.substring(i, i + MAX_CHUNK_LENGTH)
      );
    }
  }

  return chunks;
}


// =========================================================
// 7. 키워드 추출
// =========================================================

function extractKeywords(question) {
  const q = normalize(question);

  const stopWords = [
    "이",
    "가",
    "은",
    "는",
    "을",
    "를",
    "에",
    "에서",
    "으로",
    "로",
    "하고",
    "그리고",
    "어떻게",
    "무엇",
    "뭐",
    "어디",
    "알려줘",
    "알려주세요",
    "싶어",
    "싶습니다",
    "해주세요",
    "하려면",
    "할까요",
    "있나요",
    "있어",
    "인가요",
  ];

  return q
    .replace(/[?!.,]/g, " ")
    .split(/\s+/)
    .filter(word => word.length >= 2)
    .filter(word => !stopWords.includes(word));
}


// =========================================================
// 8. 관련도 점수 계산
// =========================================================

function scoreChunk(chunk, keywords) {
  const text = normalize(chunk);

  let score = 0;

  for (const keyword of keywords) {

    if (text.includes(keyword)) {
      score += 3;
    }

    // 긴 키워드는 추가 가중치
    if (
      keyword.length >= 4 &&
      text.includes(keyword)
    ) {
      score += 2;
    }
  }

  return score;
}


// =========================================================
// 9. 관련 자료 검색
// =========================================================

function searchKnowledge(text, question, maxResults = 4) {

  if (!text) return [];

  const keywords = extractKeywords(question);

  const chunks = splitIntoChunks(text);

  const scored = chunks.map(chunk => ({
    chunk,
    score: scoreChunk(chunk, keywords),
  }));

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.chunk);
}


// =========================================================
// 10. 질문 유형별 자료 선택
// =========================================================

function buildContext(question) {

  const type = detectQuestionType(question);

  let primary = "";
  let secondary = "";

  // ---------------------------------------------
  // 고령운전자
  // ---------------------------------------------

  if (type === "ELDERLY") {

    const elderly = readKnowledge(FILES.ELDERLY);
    const main = readKnowledge(FILES.MAIN);

    const elderlyResults =
      searchKnowledge(
        elderly,
        question,
        4
      );

    const mainResults =
      searchKnowledge(
        main,
        question,
        2
      );

    primary = elderlyResults.join("\n\n");
    secondary = mainResults.join("\n\n");

    return {
      type,
      context: limitContext(
        `[고령운전자 Q&A - 우선자료]\n${primary}\n\n` +
        `[챗봇22 - 보조자료]\n${secondary}`
      ),
    };
  }


  // ---------------------------------------------
  // 기관 차이
  // ---------------------------------------------

  if (type === "INSTITUTION") {

    const main = readKnowledge(FILES.MAIN);
    const daily = readKnowledge(FILES.DAILY);

    const mainResults =
      searchKnowledge(
        main,
        question,
        5
      );

    const dailyResults =
      searchKnowledge(
        daily,
        question,
        3
      );

    primary = mainResults.join("\n\n");
    secondary = dailyResults.join("\n\n");

    return {
      type,
      context: limitContext(
        `[기관 구분 관련 자료]\n${primary}\n\n` +
        `[보조 Q&A]\n${secondary}`
      ),
    };
  }


  // ---------------------------------------------
  // 법령
  // ---------------------------------------------

  if (type === "LAW") {

    const law = readKnowledge(FILES.LAW);
    const main = readKnowledge(FILES.MAIN);

    const lawResults =
      searchKnowledge(
        law,
        question,
        5
      );

    const mainResults =
      searchKnowledge(
        main,
        question,
        2
      );

    return {
      type,
      context: limitContext(
        `[한국도로교통공단법]\n${lawResults.join("\n\n")}\n\n` +
        `[챗봇22 보조자료]\n${mainResults.join("\n\n")}`
      ),
    };
  }


  // ---------------------------------------------
  // 면허 / 시험
  // ---------------------------------------------

  if (
    type === "LICENSE" ||
    type === "EDUCATION"
  ) {

    const main = readKnowledge(FILES.MAIN);

    const mainResults =
      searchKnowledge(
        main,
        question,
        5
      );

    return {
      type,
      context: limitContext(
        `[챗봇22 - 주요 안내자료]\n` +
        mainResults.join("\n\n")
      ),
    };
  }


  // ---------------------------------------------
  // 일반 질문
  // ---------------------------------------------

  if (type === "GENERAL") {

    const daily = readKnowledge(FILES.DAILY);

    const dailyResults =
      searchKnowledge(
        daily,
        question,
        4
      );

    return {
      type,
      context: limitContext(
        `[일상 질문 Q&A]\n` +
        dailyResults.join("\n\n")
      ),
    };
  }


  return {
    type,
    context: "",
  };
}


// =========================================================
// 11. Context 최대 크기 제한
// =========================================================

function limitContext(text) {

  if (!text) return "";

  if (text.length <= MAX_CONTEXT_LENGTH) {
    return text;
  }

  return text.substring(
    0,
    MAX_CONTEXT_LENGTH
  );
}


// =========================================================
// 12. Gemini System Prompt
// =========================================================

function buildPrompt(question, type, context) {

  return `
당신은 한국도로교통공단 운전면허시험장 안내 챗봇입니다.

반드시 아래 제공된 자료를 기준으로 답변하세요.

[가장 중요한 원칙]

1. 제공된 자료에 없는 내용을 만들어내지 마세요.
2. 일반적인 상식이나 인터넷 지식을 추가하지 마세요.
3. 자료끼리 내용이 겹치면 질문 유형에 맞는 우선자료를 먼저 사용하세요.
4. 질문에 직접 필요한 내용만 답변하세요.
5. 관련 없는 자료를 길게 나열하지 마세요.
6. 사용자가 요청하지 않았다면 전체 면허취득 절차를 설명하지 마세요.
7. 사용자가 요청하지 않았다면 수많은 면제조건이나 다른 시험 종류를 설명하지 마세요.
8. 답변은 가능한 한 짧고 이해하기 쉽게 작성하세요.
9. 자료에 정확한 전화번호, 준비물, 비용, 절차가 있으면 자료의 내용을 그대로 활용하세요.
10. 자료에 없는 내용이면 반드시
   "제공된 자료에서 확인되지 않습니다."
   라고 답하세요.

[질문 유형]
${type}

[사용자 질문]
${question}

[참고자료]
${context || "관련 자료를 찾지 못했습니다."}

[답변 작성 규칙]

- 단순 질문: 2~5문장
- 절차 질문: 핵심 단계 3~6개 정도
- 전화번호/예약 질문: 필요한 전화번호와 예약방법만
- "자세히 알려줘"라고 요청한 경우에만 상세하게 설명
- 질문과 직접 관련 없는 자료는 절대 덧붙이지 마세요.
- 마크다운은 필요한 경우에만 사용하세요.
- 답변 마지막에 불필요한 설명이나 추측을 붙이지 마세요.

특히 고령운전자 질문인 경우:
고령운전자 Q&A가 우선자료입니다.
챗봇22 자료는 고령운전자 Q&A에 필요한 내용이 없을 때만 보조적으로 사용하세요.

특히 기관 차이 질문인 경우:
한국도로교통공단, 한국도로공사, 한국교통안전공단 등을 혼동하지 말고
참고자료에 있는 기관 설명을 기준으로 비교하세요.

이제 질문에 답변하세요.
`;
}


// =========================================================
// 13. Gemini 호출
// =========================================================

async function callGemini(prompt) {

  if (!API_KEY) {
    throw new Error(
      "GEMINI_API_KEY 환경변수가 없습니다."
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;


  let lastError = null;


  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {

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
            temperature: 0.1,
            maxOutputTokens: 700,
            topP: 0.8,
          },

        }),

      });


      // -------------------------------
      // 정상 응답
      // -------------------------------

      if (response.ok) {

        const data =
          await response.json();

        const text =
          data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
          throw new Error(
            "Gemini 응답에 텍스트가 없습니다."
          );
        }

        return text.trim();
      }


      // -------------------------------
      // 429
      // -------------------------------

      if (response.status === 429) {

        const retryAfter =
          response.headers.get("retry-after");

        let waitTime =
          retryAfter
            ? Number(retryAfter) * 1000
            : Math.pow(2, attempt) * 1500;

        // 너무 오래 기다리지 않도록 제한
        waitTime =
          Math.min(waitTime, 10000);

        console.log(
          `Gemini 429 - ${attempt + 1}회 재시도`
        );

        await sleep(waitTime);

        continue;
      }


      // -------------------------------
      // 기타 오류
      // -------------------------------

      const errorText =
        await response.text();

      lastError =
        new Error(
          `Gemini API 오류 ${response.status}: ${errorText}`
        );

      break;

    } catch (error) {

      lastError = error;

      if (attempt < MAX_RETRY - 1) {

        const waitTime =
          Math.min(
            Math.pow(2, attempt) * 1000,
            8000
          );

        await sleep(waitTime);

      }

    }

  }


  throw lastError ||
    new Error("Gemini API 호출 실패");
}


// =========================================================
// 14. sleep
// =========================================================

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}


// =========================================================
// 15. 답변 후처리
// =========================================================

function cleanAnswer(answer) {

  if (!answer) {
    return "제공된 자료에서 확인되지 않습니다.";
  }


  let result = answer.trim();


  // Gemini가 이상한 접두어를 붙이는 경우 제거
  result = result
    .replace(/^답변\s*[:：]\s*/i, "")
    .replace(/^최종답변\s*[:：]\s*/i, "");


  // 지나치게 많은 빈 줄 제거
  result =
    result.replace(/\n{3,}/g, "\n\n");


  // 너무 긴 답변 방지
  // 단, 문장이 중간에서 잘리지 않도록 마지막 줄 단위로 정리
  if (result.length > 2500) {

    result =
      result.substring(0, 2500);

    const lastPeriod =
      Math.max(
        result.lastIndexOf("."),
        result.lastIndexOf("다."),
        result.lastIndexOf("\n")
      );

    if (lastPeriod > 500) {
      result =
        result.substring(
          0,
          lastPeriod + 1
        );
    }
  }


  return result.trim();
}


// =========================================================
// 16. Gemini 실패 시 간단한 자료 직접 답변
// =========================================================

function fallbackAnswer(question, type, context) {

  if (!context) {
    return "제공된 자료에서 확인되지 않습니다.";
  }


  // Gemini가 429로 계속 실패하더라도
  // 자료 자체가 검색된 경우 최소한의 안내를 제공
  //
  // 여기서는 자료 전체를 그대로 출력하지 않고
  // 첫 번째 관련 chunk만 사용한다.

  const firstChunk =
    context
      .split("\n\n")
      .filter(Boolean)
      .find(x =>
        !x.startsWith("[챗봇22") &&
        !x.startsWith("[보조")
      );


  if (!firstChunk) {
    return "현재 챗봇 사용량이 일시적으로 많아 답변을 처리하지 못했습니다. 잠시 후 다시 질문해주세요.";
  }


  // 너무 긴 원문을 그대로 보여주지 않음
  if (firstChunk.length <= 900) {
    return firstChunk;
  }


  return (
    firstChunk.substring(0, 900) +
    "\n\n자세한 내용은 관련 자료를 확인해주세요."
  );
}


// =========================================================
// 17. Vercel API Handler
// =========================================================

export default async function handler(req, res) {

  // ---------------------------------------------
  // CORS
  // ---------------------------------------------

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


  // OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  // POST만 허용
  if (req.method !== "POST") {

    return res.status(405).json({
      answer:
        "POST 요청만 사용할 수 있습니다.",
    });

  }


  try {

    // -------------------------------------------
    // 질문 가져오기
    // -------------------------------------------

    const question =
      typeof req.body?.question === "string"
        ? req.body.question.trim()
        : "";


    if (!question) {

      return res.status(400).json({
        answer:
          "질문을 입력해주세요.",
      });

    }


    // -------------------------------------------
    // 질문 유형 + 자료 검색
    // -------------------------------------------

    const {
      type,
      context,
    } = buildContext(question);


    console.log(
      "질문:",
      question
    );

    console.log(
      "질문유형:",
      type
    );

    console.log(
      "Context 길이:",
      context.length
    );


    // -------------------------------------------
    // 자료가 전혀 없으면 Gemini 호출하지 않음
    // -------------------------------------------

    if (!context) {

      return res.status(200).json({
        answer:
          "제공된 자료에서 확인되지 않습니다.",
      });

    }


    // -------------------------------------------
    // Gemini Prompt
    // -------------------------------------------

    const prompt =
      buildPrompt(
        question,
        type,
        context
      );


    // -------------------------------------------
    // Gemini 호출
    // -------------------------------------------

    let answer;

    try {

      answer =
        await callGemini(prompt);

    } catch (geminiError) {

      console.error(
        "Gemini 최종 오류:",
        geminiError
      );


      // 429 등 Gemini 오류가 나더라도
      // 자료 검색 자체는 성공했다면 fallback
      answer =
        fallbackAnswer(
          question,
          type,
          context
        );
    }


    // -------------------------------------------
    // 최종 답변 정리
    // -------------------------------------------

    answer =
      cleanAnswer(answer);


    return res.status(200).json({
      answer,
      type,
    });


  } catch (error) {

    console.error(
      "Chatbot Error:",
      error
    );


    return res.status(500).json({
      answer:
        "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    });

  }

}
