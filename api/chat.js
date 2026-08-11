// api/chat.js

import fs from "fs";
import path from "path";

/* =========================================================
   기본 설정
   ========================================================= */

const API_KEY = process.env.GEMINI_API_KEY;

// GEMINI_MODEL 환경변수는 사용하지 않음.
// 모델은 코드에서 고정.
const MODEL = "gemini-2.5-flash";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1500;


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
   모든 Knowledge 읽기
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
   질문 유형 판단
   ========================================================= */

function detectQuestionType(question) {
  const q = question.toLowerCase();

  // 고령운전자 관련 질문
  const seniorKeywords = [
    "고령",
    "고령자",
    "어르신",
    "75세",
    "75세 이상",
    "65세",
    "적성검사",
    "고령운전자",
    "치매안심센터",
    "인지선별검사",
    "인지검사",
    "고령자교육",
    "고령운전자교육",
  ];

  // 기관 구분 관련 질문
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
  ];

  // 일상적인 질문
  const dailyKeywords = [
    "안녕",
    "고마워",
    "감사",
    "반가워",
    "누구야",
    "뭐야",
    "도와줘",
  ];

  if (seniorKeywords.some((keyword) => q.includes(keyword))) {
    return "senior";
  }

  if (organizationKeywords.some((keyword) => q.includes(keyword))) {
    return "organization";
  }

  if (dailyKeywords.some((keyword) => q.includes(keyword))) {
    return "daily";
  }

  return "general";
}


/* =========================================================
   질문과 가장 관련된 자료 선택
   ========================================================= */

function selectKnowledge(question, knowledge) {
  const type = detectQuestionType(question);

  let selected = [];

  /*
   * 가장 중요한 원칙
   *
   * 1. 챗봇22는 항상 우선
   * 2. 고령 질문 → 챗봇22 + 고령자 Q&A
   * 3. 기관 질문 → 챗봇22 + 공단법
   * 4. 일반 질문 → 챗봇22 + 필요할 때 일상 Q&A
   */

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

  else if (type === "daily") {
    selected = [
      {
        name: FILES.daily,
        priority: 1,
        content: knowledge.daily,
      },
    ];
  }

  else {
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
      {
        name: FILES.organization,
        priority: 3,
        content: knowledge.organization,
      },
      {
        name: FILES.daily,
        priority: 4,
        content: knowledge.daily,
      },
    ];
  }

  return selected.filter((item) => item.content);
}


/* =========================================================
   자료 길이 제한
   ========================================================= */

function limitKnowledge(text, maxLength = 30000) {
  if (!text) return "";

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength);
}


/* =========================================================
   Knowledge Prompt 생성
   ========================================================= */

function buildKnowledgePrompt(question, selectedKnowledge) {
  let result = "";

  for (const item of selectedKnowledge) {
    result += `
==================================================
[자료 우선순위 ${item.priority}]
파일명: ${item.name}
==================================================

${limitKnowledge(item.content)}

`;
  }

  return result;
}


/* =========================================================
   시스템 프롬프트
   ========================================================= */

function buildSystemPrompt(question, knowledgeText) {
  return `
너는 한국도로교통공단 운전면허 및 교통안전 관련 안내를 도와주는 챗봇이다.

아래에 제공된 업무자료를 반드시 근거로 답변한다.

[가장 중요한 답변 원칙]

1. "챗봇22.txt"를 가장 중요한 실제 안내자료로 취급한다.

2. 고령운전자 관련 질문의 경우:
   - 먼저 챗봇22.txt 내용을 기준으로 답한다.
   - 부족하거나 구체적인 고령운전자 교육 정보가 필요한 경우
     "고령운전자 교통안전교육 관련 Q&A.txt"를 보조자료로 사용한다.

3. 한국도로교통공단, 한국도로공사, 한국교통안전공단 등
   기관의 차이를 묻는 질문은:
   - 먼저 챗봇22.txt를 기준으로 답한다.
   - 필요한 경우 "한국도로교통공단법.txt"를 보조자료로 사용한다.

4. 일상적인 인사나 간단한 대화는 "일상 질문 Q&A.txt"를 참고한다.

5. 자료 간 내용이 다를 경우:
   - 우선순위가 높은 자료의 내용을 따른다.
   - 챗봇22.txt가 있으면 챗봇22.txt를 우선한다.
   - 보조자료를 이용해 임의로 내용을 확장하지 않는다.

6. 제공된 자료에 없는 내용은 추측하거나 만들어내지 않는다.

7. 법률, 교육시간, 수수료, 예약방법, 전화번호, 주소 등
   구체적인 정보는 자료에 있는 경우에만 안내한다.

8. 사용자가 단순한 질문을 하면 전체 자료를 장황하게 설명하지 않는다.

9. 질문에 직접 필요한 내용만 답한다.

10. 일반적으로 3~6문장 또는 짧은 bullet 형태로 답한다.

11. 사용자가 "자세히 알려줘", "전체 절차 알려줘" 등의 요청을 했을 때만
    상세한 내용을 제공한다.

12. 질문이 명확하면 불필요한 확인 질문을 하지 않는다.

13. "제공된 자료에서는 확인되지 않습니다"라고 답해야 하는 경우에는
    정말로 제공된 자료에서 답을 찾을 수 없을 때만 사용한다.

14. 답변에서 "챗봇22.txt", "보조자료", "knowledge 파일" 등의
    내부 자료명은 사용자에게 불필요하다면 언급하지 않는다.

15. 답변은 실제 민원 안내를 받는 사람이 이해하기 쉬운 자연스러운 한국어로 작성한다.

16. 사용자가 묻지 않은 운전면허 취득 절차 전체를 보여주지 않는다.

17. 특히 "75세인데 면허 갱신하려면?"처럼 특정 질문에는
    질문과 직접 관련된 고령운전자 갱신·교육 내용만 우선적으로 답한다.

18. 동일한 내용이나 문장을 반복하지 않는다.

19. 자료에 URL이 있는 경우 자료에 적힌 URL을 그대로 안내할 수 있다.

20. 전화번호도 자료에 있는 번호만 사용한다.

--------------------------------------------------
사용자 질문
--------------------------------------------------

${question}

--------------------------------------------------
참고 업무자료
--------------------------------------------------

${knowledgeText}

--------------------------------------------------
최종 답변 작성
--------------------------------------------------

위 자료를 근거로 사용자 질문에 직접 답변하라.

불필요한 전체 자료 나열 금지.
질문과 관계없는 시험 절차나 교육 내용을 추가하지 말 것.
`;
}


/* =========================================================
   Gemini API 호출
   ========================================================= */

async function callGemini(prompt) {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
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
            maxOutputTokens: 800,
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

        throw new Error("Gemini 응답 내용이 없습니다.");
      }

      const errorMessage =
        data?.error?.message ||
        `Gemini API 오류 (${response.status})`;

      lastError = new Error(errorMessage);

      /*
       * 429인 경우 잠시 기다렸다가 다시 요청
       */
      if (response.status === 429) {
        if (attempt < MAX_RETRIES - 1) {
          const delay =
            RETRY_BASE_DELAY * Math.pow(2, attempt);

          await sleep(delay);
          continue;
        }
      }

      /*
       * 400 / 401 / 403 등은 재시도해도 해결되지 않는 경우가 많으므로
       * 바로 종료
       */
      break;

    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES - 1) {
        const delay =
          RETRY_BASE_DELAY * Math.pow(2, attempt);

        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError || new Error("Gemini API 호출에 실패했습니다.");
}


/* =========================================================
   Sleep
   ========================================================= */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/* =========================================================
   Gemini 실패 시 간단한 자료 기반 답변
   ========================================================= */

function fallbackAnswer(question, knowledge) {
  const type = detectQuestionType(question);

  /*
   * 429 등으로 Gemini를 사용할 수 없을 때
   * 최소한 자주 묻는 질문은 자료 기반으로 답할 수 있도록 한다.
   */

  const q = question.toLowerCase();

  // -----------------------------------------
  // 고령운전자
  // -----------------------------------------

  if (
    type === "senior" &&
    (
      q.includes("75세") ||
      q.includes("고령") ||
      q.includes("고령자") ||
      q.includes("고령운전자")
    )
  ) {
    if (
      q.includes("온라인") ||
      q.includes("교육") ||
      q.includes("수강")
    ) {
      return (
        "만 75세 이상 고령운전자의 교통안전교육은 " +
        "온라인 또는 교육장 방문 방식으로 받을 수 있습니다. " +
        "온라인 교육은 교통안전교육센터에서 수강할 수 있으며, " +
        "교육장 교육은 사전예약이 필요합니다."
      );
    }

    if (
      q.includes("갱신") ||
      q.includes("적성검사") ||
      q.includes("면허")
    ) {
      return (
        "만 75세 이상 운전자는 면허 갱신(적성검사) 전에 " +
        "고령운전자 교통안전교육을 이수해야 합니다. " +
        "교육은 온라인 또는 교육장 방문 방식으로 받을 수 있습니다. " +
        "구체적인 갱신 준비물과 절차는 자료에 안내된 내용을 기준으로 확인해야 합니다."
      );
    }
  }


  // -----------------------------------------
  // 기관 구분
  // -----------------------------------------

  if (
    type === "organization" &&
    (
      q.includes("도로교통공단") ||
      q.includes("도로공사") ||
      q.includes("교통안전공단")
    )
  ) {
    /*
     * 기관 차이는 챗봇22 또는 공단법에 정보가 있을 때만
     * Gemini가 상세하게 정리하도록 하고,
     * fallback에서는 임의의 기관 정보를 추가하지 않는다.
     */

    const main = knowledge.main || "";
    const organization = knowledge.organization || "";

    if (
      main.includes("도로공사") ||
      main.includes("도로교통공단")
    ) {
      return (
        "한국도로교통공단과 한국도로공사는 서로 다른 기관입니다. " +
        "주요 역할과 담당 업무가 다르므로, 질문하신 업무에 따라 " +
        "담당 기관을 확인해야 합니다."
      );
    }

    if (organization) {
      return (
        "한국도로교통공단에 관한 기관 정보는 제공된 자료를 기준으로 안내할 수 있습니다. " +
        "다른 기관과의 구체적인 차이는 해당 자료에 확인되는 범위에서 안내됩니다."
      );
    }
  }


  // -----------------------------------------
  // 기능시험
  // -----------------------------------------

  if (
    q.includes("기능시험") &&
    (
      q.includes("예약") ||
      q.includes("온라인")
    )
  ) {
    return (
      "장내기능시험은 안전운전통합민원에서 온라인으로 예약할 수 있습니다. " +
      "온라인 접수 가능 시간은 07:30~22:00입니다."
    );
  }


  // -----------------------------------------
  // 기본 fallback
  // -----------------------------------------

  return (
    "현재 답변을 처리하는 데 일시적인 문제가 발생했습니다. " +
    "잠시 후 다시 질문해 주세요."
  );
}


/* =========================================================
   HTTP Handler
   ========================================================= */

export default async function handler(req, res) {
  /*
   * CORS
   */
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


  /*
   * OPTIONS
   */
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  /*
   * POST만 허용
   */
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다.",
    });
  }


  try {
    const question =
      typeof req.body?.question === "string"
        ? req.body.question.trim()
        : "";


    /*
     * 질문 없음
     */
    if (!question) {
      return res.status(400).json({
        error: "질문을 입력해주세요.",
      });
    }


    /*
     * 너무 긴 질문 방지
     */
    const safeQuestion = question.substring(0, 2000);


    /*
     * Knowledge 로드
     */
    const knowledge = loadKnowledge();


    /*
     * 질문 유형에 따라 자료 선택
     */
    const selectedKnowledge =
      selectKnowledge(
        safeQuestion,
        knowledge
      );


    /*
     * Prompt용 자료 생성
     */
    const knowledgeText =
      buildKnowledgePrompt(
        safeQuestion,
        selectedKnowledge
      );


    /*
     * 시스템 프롬프트
     */
    const prompt =
      buildSystemPrompt(
        safeQuestion,
        knowledgeText
      );


    /*
     * Gemini 호출
     */
    try {
      const answer =
        await callGemini(prompt);

      return res.status(200).json({
        answer,
      });

    } catch (geminiError) {
      console.error(
        "Gemini error:",
        geminiError
      );


      /*
       * Gemini가 429 등으로 실패하면
       * 자료 기반 fallback
       */
      const fallback =
        fallbackAnswer(
          safeQuestion,
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
