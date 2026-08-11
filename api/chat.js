// api/chat.js

import fs from "fs";
import path from "path";

/* =========================================================
   기본 설정
========================================================= */

const API_KEY = process.env.GEMINI_API_KEY;

// 환경변수 GEMINI_MODEL은 사용하지 않음.
// 모델은 코드에서 고정.
const MODEL = "gemini-2.5-flash";

// 429 발생 시 재시도
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 2000;


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
      console.error(`Knowledge file not found: ${filename}`);
      return "";
    }

    return fs.readFileSync(filePath, "utf8");

  } catch (error) {
    console.error(`Failed to read ${filename}:`, error);
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
   질문 정리
========================================================= */

function normalizeQuestion(question) {
  if (typeof question !== "string") {
    return "";
  }

  return question
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000);
}


/* =========================================================
   질문 유형 판단
========================================================= */

function detectQuestionType(question) {
  const q = question.toLowerCase();

  /* -----------------------------
     고령운전자 관련
  ----------------------------- */

  const seniorKeywords = [
    "고령",
    "고령자",
    "어르신",
    "75세",
    "75세 이상",
    "65세",
    "고령운전자",
    "고령자교육",
    "고령운전자교육",
    "고령운전자 교통안전교육",
    "적성검사",
    "면허 갱신",
    "면허갱신",
    "갱신",
    "치매안심센터",
    "인지선별검사",
    "인지검사",
    "인지능력",
  ];

  if (seniorKeywords.some((keyword) => q.includes(keyword))) {
    return "senior";
  }


  /* -----------------------------
     기관 구분 관련
  ----------------------------- */

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
    "기관 차이",
    "기관차이",
    "어느 기관",
    "소속 기관",
    "무슨 기관",
  ];

  if (organizationKeywords.some((keyword) => q.includes(keyword))) {
    return "organization";
  }


  /* -----------------------------
     일상 질문
  ----------------------------- */

  const dailyKeywords = [
    "안녕",
    "안녕하세요",
    "고마워",
    "감사합니다",
    "감사해",
    "반가워",
    "누구야",
    "뭐야",
    "도와줘",
  ];

  if (dailyKeywords.some((keyword) => q.includes(keyword))) {
    return "daily";
  }


  return "general";
}


/* =========================================================
   Knowledge 선택

   핵심 원칙

   챗봇22 = 실제 안내의 주자료

   고령 질문
   → 챗봇22 + 고령자 Q&A

   기관 질문
   → 챗봇22 + 기관 자료

   일상 질문
   → 일상 Q&A

   일반 질문
   → 챗봇22
========================================================= */

function selectKnowledge(question, knowledge) {
  const type = detectQuestionType(question);

  let selected = [];


  /* -----------------------------
     고령운전자
  ----------------------------- */

  if (type === "senior") {
    selected = [
      {
        name: FILES.main,
        priority: 1,
        content: knowledge.main,
      },
      {
        name: FILES.senior,
        priority: 2,
        content: knowledge.senior,
      },
    ];
  }


  /* -----------------------------
     기관 구분
  ----------------------------- */

  else if (type === "organization") {
    selected = [
      {
        name: FILES.main,
        priority: 1,
        content: knowledge.main,
      },
      {
        name: FILES.organization,
        priority: 2,
        content: knowledge.organization,
      },
    ];
  }


  /* -----------------------------
     일상 질문
  ----------------------------- */

  else if (type === "daily") {
    selected = [
      {
        name: FILES.daily,
        priority: 1,
        content: knowledge.daily,
      },
    ];
  }


  /* -----------------------------
     일반 질문
  ----------------------------- */

  else {
    selected = [
      {
        name: FILES.main,
        priority: 1,
        content: knowledge.main,
      },
    ];
  }


  return selected.filter(
    (item) =>
      typeof item.content === "string" &&
      item.content.trim().length > 0
  );
}


/* =========================================================
   자료 길이 제한

   한 파일이 너무 길 경우 Gemini에 전부 넣지 않도록 제한
========================================================= */

function limitKnowledge(text, maxLength = 28000) {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength);
}


/* =========================================================
   Knowledge Prompt 생성
========================================================= */

function buildKnowledgePrompt(selectedKnowledge) {
  let result = "";

  for (const item of selectedKnowledge) {
    result += `
==================================================
자료명: ${item.name}
우선순위: ${item.priority}
==================================================

${limitKnowledge(item.content)}

==================================================

`;
  }

  return result.trim();
}


/* =========================================================
   시스템 프롬프트
========================================================= */

function buildSystemPrompt(question, knowledgeText) {
  return `
너는 한국도로교통공단 운전면허 및 교통안전 관련 안내를 도와주는 챗봇이다.

반드시 아래 제공된 업무자료를 근거로 답변한다.

==================================================
[자료 우선순위]
==================================================

1순위: 챗봇22.txt

2순위:
- 고령운전자 교통안전교육 관련 Q&A.txt
- 한국도로교통공단법.txt

3순위:
- 일상 질문 Q&A.txt

중요:
자료 간 내용이 다르면 우선순위가 높은 자료를 따른다.

특히 챗봇22.txt가 존재하는 경우
한국도로교통공단의 실제 민원 안내는 챗봇22.txt를 가장 우선하여 사용한다.


==================================================
[고령운전자 질문]
==================================================

고령운전자, 75세 이상, 면허 갱신, 적성검사,
고령운전자 교통안전교육 등의 질문은

1. 먼저 챗봇22.txt에서 답을 찾는다.

2. 챗봇22.txt만으로 구체적인 고령운전자 교육 정보를
   충분히 설명하기 어려운 경우에만
   "고령운전자 교통안전교육 관련 Q&A.txt"를 보조적으로 사용한다.

3. 고령자 Q&A의 내용을 무조건 전부 출력하지 않는다.

4. 사용자의 질문에 필요한 부분만 사용한다.

예:

사용자가
"75세인데 면허 갱신하려면?"

이라고 물으면

면허 갱신에 필요한 고령운전자 교육,
교육 대상,
교육 방법,
필요한 절차 등
질문에 직접 필요한 내용만 간단하게 답한다.

운전면허 취득 절차 전체를 출력하지 않는다.


==================================================
[기관 구분 질문]
==================================================

한국도로교통공단,
한국도로공사,
한국교통안전공단 등의 차이를 묻는 질문은

1. 먼저 챗봇22.txt를 확인한다.

2. 챗봇22.txt에 부족한 기관 관련 정보가 있을 경우
   한국도로교통공단법.txt를 보조자료로 사용한다.

3. 기관 관련 자료에 없는 내용은 추측하지 않는다.


==================================================
[일상 질문]
==================================================

인사나 간단한 일상 질문은
일상 질문 Q&A.txt를 참고한다.


==================================================
[답변 원칙]
==================================================

1. 제공된 자료에 있는 내용을 기준으로 답변한다.

2. 자료에 없는 사실을 임의로 만들어내지 않는다.

3. 법률, 교육시간, 수수료, 전화번호, 주소,
   예약방법 등 구체적인 정보는
   자료에 있는 경우에만 안내한다.

4. 질문에 직접 필요한 내용만 답한다.

5. 사용자가 묻지 않은 내용을 장황하게 설명하지 않는다.

6. 일반적인 질문은 3~6문장 또는 짧은 bullet 형식으로 답한다.

7. 사용자가 "자세히", "전체 절차", "상세하게" 등을 요청한 경우에만
   더 자세하게 설명한다.

8. 동일한 내용을 반복하지 않는다.

9. 내부 파일명이나 Knowledge라는 표현을
   사용자에게 불필요하게 노출하지 않는다.

10. 자료에 URL이 있는 경우 해당 URL을 그대로 안내할 수 있다.

11. 자료에 있는 전화번호만 안내한다.

12. 질문이 명확하면 불필요한 확인 질문을 하지 않는다.

13. "제공된 자료에서는 확인되지 않습니다"라는 답변은
   실제로 제공된 자료에서 답을 찾을 수 없는 경우에만 사용한다.

14. 사용자가 특정 질문 하나를 했으면
   그 질문에 대한 답변만 한다.

15. 특히 "75세인데 면허 갱신하려면?"과 같은 질문에
   일반적인 신규 운전면허 취득절차 전체를 출력하지 않는다.

16. 답변은 실제 운전면허시험장 민원 안내를 받는 사람이
   이해하기 쉬운 자연스러운 한국어로 작성한다.


==================================================
[사용자 질문]
==================================================

${question}


==================================================
[참고 업무자료]
==================================================

${knowledgeText}


==================================================
[최종 답변]
==================================================

위 자료를 근거로 사용자 질문에 직접 답변하라.

질문과 관계없는 자료를 나열하지 말 것.

불필요하게 긴 답변을 하지 말 것.

자료에 없는 내용을 추측하여 추가하지 말 것.
`;
}


/* =========================================================
   Sleep
========================================================= */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/* =========================================================
   Gemini API 호출
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


  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {

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
            maxOutputTokens: 700,
          },

        }),
      });


      const data = await response.json();


      /* -----------------------------
         성공
      ----------------------------- */

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


      /* -----------------------------
         오류
      ----------------------------- */

      const errorMessage =
        data?.error?.message ||
        `Gemini API 오류 (${response.status})`;


      lastError = new Error(
        `Gemini API 오류 (${response.status}): ${errorMessage}`
      );


      /* -----------------------------
         429 재시도
      ----------------------------- */

      if (response.status === 429) {

        console.error(
          `Gemini 429 발생 - ${attempt + 1}번째 시도`
        );


        if (attempt < MAX_RETRIES - 1) {

          const delay =
            RETRY_BASE_DELAY *
            Math.pow(2, attempt);

          await sleep(delay);

          continue;
        }
      }


      /* -----------------------------
         다른 오류는 즉시 종료
      ----------------------------- */

      break;

    } catch (error) {

      lastError = error;

      console.error(
        `Gemini request error - attempt ${attempt + 1}:`,
        error
      );


      if (attempt < MAX_RETRIES - 1) {

        const delay =
          RETRY_BASE_DELAY *
          Math.pow(2, attempt);

        await sleep(delay);

        continue;
      }
    }
  }


  throw (
    lastError ||
    new Error("Gemini API 호출에 실패했습니다.")
  );
}


/* =========================================================
   Gemini 실패 시 자료 기반 Fallback

   Gemini가 429를 내더라도 자주 묻는 질문은 답변하도록 함.
========================================================= */

function fallbackAnswer(question, knowledge) {

  const q = question.toLowerCase();

  const type = detectQuestionType(question);


  /* =======================================================
     고령운전자
  ======================================================= */

  if (type === "senior") {

    /* -----------------------------
       온라인 교육
    ----------------------------- */

    if (
      q.includes("온라인") ||
      q.includes("인터넷") ||
      q.includes("수강")
    ) {

      return (
        "네. 만 75세 이상 고령운전자의 교통안전교육은 " +
        "온라인으로 수강할 수 있습니다. " +
        "교통안전교육센터에서 온라인 교육을 이용할 수 있으며, " +
        "교육장 방문 교육을 선택하는 경우에는 사전예약이 필요합니다."
      );
    }


    /* -----------------------------
       면허 갱신
    ----------------------------- */

    if (
      q.includes("갱신") ||
      q.includes("적성검사") ||
      q.includes("면허")
    ) {

      return (
        "만 75세 이상 운전자는 면허 갱신(적성검사) 전에 " +
        "고령운전자 교통안전교육을 이수해야 합니다. " +
        "교육은 온라인 또는 교육장 방문 방식으로 받을 수 있습니다. " +
        "교육장 교육은 사전예약이 필요합니다."
      );
    }


    /* -----------------------------
       고령운전자 교육
    ----------------------------- */

    if (
      q.includes("교육") ||
      q.includes("고령운전자")
    ) {

      return (
        "만 75세 이상 운전면허 취득 또는 갱신 대상자는 " +
        "고령운전자 교통안전교육 대상입니다. " +
        "교육은 온라인 또는 교육장 방문 방식으로 받을 수 있습니다."
      );
    }
  }


  /* =======================================================
     기관 구분
  ======================================================= */

  if (type === "organization") {

    const main =
      knowledge.main || "";

    const organization =
      knowledge.organization || "";


    /*
     * 자료 안에 기관 관련 내용이 있는 경우
     * 최소한의 답변 제공
     */

    if (
      main.includes("도로공사") ||
      main.includes("도로교통공단") ||
      organization.trim()
    ) {

      return (
        "한국도로교통공단과 한국도로공사는 서로 다른 기관입니다. " +
        "담당하는 업무와 역할이 다르며, " +
        "질문하신 업무에 따라 담당 기관이 달라질 수 있습니다."
      );
    }
  }


  /* =======================================================
     기능시험 온라인 예약
  ======================================================= */

  if (
    q.includes("기능시험") &&
    (
      q.includes("예약") ||
      q.includes("온라인")
    )
  ) {

    return (
      "장내기능시험은 안전운전통합민원에서 " +
      "온라인으로 예약할 수 있습니다. " +
      "온라인 접수 가능 시간은 07:30~22:00입니다."
    );
  }


  /* =======================================================
     자료 기반 검색용 간단 fallback
  ======================================================= */

  const allText = [
    knowledge.main || "",
    knowledge.senior || "",
    knowledge.organization || "",
    knowledge.daily || "",
  ].join("\n");


  /*
   * 질문에 포함된 핵심 단어가 자료에 있는지 확인
   */

  const words = q
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);


  let bestScore = 0;
  let bestPosition = -1;


  for (const word of words) {

    const position =
      allText.toLowerCase().indexOf(word);

    if (position !== -1) {

      const score = word.length;

      if (score > bestScore) {
        bestScore = score;
        bestPosition = position;
      }
    }
  }


  if (bestPosition >= 0) {

    const start =
      Math.max(0, bestPosition - 150);

    const end =
      Math.min(
        allText.length,
        bestPosition + 500
      );

    const snippet =
      allText.substring(start, end).trim();


    return (
      "관련 자료에서 확인되는 내용입니다.\n\n" +
      snippet
    );
  }


  /* =======================================================
     최종 fallback
  ======================================================= */

  return (
    "현재 답변을 처리하는 데 일시적인 문제가 발생했습니다. " +
    "잠시 후 다시 질문해 주세요."
  );
}


/* =========================================================
   카카오톡 / 일반 API에서 질문 추출

   중요:
   기존 코드는 req.body.question만 확인했기 때문에
   카카오톡에서는 질문을 못 읽고 있었음.

   아래에서는 여러 형태를 모두 지원함.

   1. 카카오 i 오픈빌더
      req.body.userRequest.utterance

   2. 기존 프론트
      req.body.question

   3. 일반 API
      req.body.message
      req.body.text

   4. body가 문자열 JSON으로 들어오는 경우
========================================================= */

function extractQuestion(req) {

  let body = req.body;


  /* -----------------------------
     body가 문자열인 경우
  ----------------------------- */

  if (typeof body === "string") {

    try {
      body = JSON.parse(body);
    } catch (error) {

      // 단순 문자열 자체가 질문인 경우
      return normalizeQuestion(body);
    }
  }


  if (!body || typeof body !== "object") {
    return "";
  }


  /* =======================================================
     카카오 i 오픈빌더
  ======================================================= */

  const kakaoQuestion =
    body?.userRequest?.utterance;

  if (
    typeof kakaoQuestion === "string" &&
    kakaoQuestion.trim()
  ) {
    return normalizeQuestion(kakaoQuestion);
  }


  /* =======================================================
     기존 question
  ======================================================= */

  const question =
    body?.question;

  if (
    typeof question === "string" &&
    question.trim()
  ) {
    return normalizeQuestion(question);
  }


  /* =======================================================
     message
  ======================================================= */

  const message =
    body?.message;

  if (
    typeof message === "string" &&
    message.trim()
  ) {
    return normalizeQuestion(message);
  }


  /* =======================================================
     text
  ======================================================= */

  const text =
    body?.text;

  if (
    typeof text === "string" &&
    text.trim()
  ) {
    return normalizeQuestion(text);
  }


  return "";
}


/* =========================================================
   HTTP Handler
========================================================= */

export default async function handler(req, res) {

  /* =======================================================
     CORS
  ======================================================= */

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


  /* =======================================================
     OPTIONS
  ======================================================= */

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  /* =======================================================
     POST만 허용
  ======================================================= */

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "POST 요청만 허용됩니다.",
    });
  }


  try {

    /* =====================================================
       질문 추출
    ===================================================== */

    const question =
      extractQuestion(req);


    console.log(
      "Received question:",
      question
    );


    /* =====================================================
       질문 없음
    ===================================================== */

    if (!question) {

      return res.status(400).json({
        error: "질문을 입력해주세요.",
      });
    }


    /* =====================================================
       Knowledge 로드
    ===================================================== */

    const knowledge =
      loadKnowledge();


    /* =====================================================
       질문 유형
    ===================================================== */

    const questionType =
      detectQuestionType(question);


    console.log(
      "Question type:",
      questionType
    );


    /* =====================================================
       관련 자료 선택
    ===================================================== */

    const selectedKnowledge =
      selectKnowledge(
        question,
        knowledge
      );


    console.log(
      "Selected knowledge:",
      selectedKnowledge.map(
        (item) => item.name
      )
    );


    /* =====================================================
       Knowledge Prompt
    ===================================================== */

    const knowledgeText =
      buildKnowledgePrompt(
        selectedKnowledge
      );


    /* =====================================================
       시스템 프롬프트
    ===================================================== */

    const prompt =
      buildSystemPrompt(
        question,
        knowledgeText
      );


    /* =====================================================
       Gemini 호출
    ===================================================== */

    try {

      const answer =
        await callGemini(prompt);


      return res.status(200).json({
        answer: answer,
      });

    } catch (geminiError) {

      console.error(
        "Gemini error:",
        geminiError
      );


      /* =================================================
         Gemini 실패 → 자료 기반 fallback
      ================================================= */

      const fallback =
        fallbackAnswer(
          question,
          knowledge
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
