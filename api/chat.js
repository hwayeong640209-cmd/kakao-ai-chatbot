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
  if (!question) return "";

  return String(question)
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000);
}

/* =========================================================
   질문 추출
   카카오 / 일반 fetch / 기존 프론트 등 여러 형태 지원
========================================================= */

function extractQuestion(body) {
  if (!body) return "";

  // body 자체가 문자열
  if (typeof body === "string") {
    return normalizeQuestion(body);
  }

  // 가장 일반적인 형태
  const candidates = [
    body.question,
    body.message,
    body.content,
    body.text,

    // 카카오 i 오픈빌더 / 스킬 요청 형태
    body.userRequest?.utterance,

    // 혹시 message 안쪽에 들어오는 경우
    body.message?.text,
    body.message?.content,

    // 기타 구조
    body.request?.question,
    body.request?.message,
    body.request?.utterance,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeQuestion(candidate);
    }
  }

  return "";
}

/* =========================================================
   질문 유형 판단
========================================================= */

function detectQuestionType(question) {
  const q = question.toLowerCase();

  /* -----------------------------------------
     고령운전자 관련
  ----------------------------------------- */

  const seniorKeywords = [
    "고령",
    "고령자",
    "고령운전자",
    "고령 운전자",
    "어르신",
    "75세",
    "75세 이상",
    "70세 이상",
    "치매",
    "치매검사",
    "치매 검사",
    "치매안심센터",
    "인지",
    "인지검사",
    "인지 검사",
    "인지선별검사",
    "인지 선별검사",
    "고령자교육",
    "고령운전자교육",
    "고령운전자 교육",
    "고령교육",
    "고령자 교육",
    "고령운전자 의무교육",
  ];

  /* -----------------------------------------
     기관 관련
  ----------------------------------------- */

  const organizationKeywords = [
    "도로교통공단",
    "한국도로교통공단",
    "도로공사",
    "한국도로공사",
    "교통안전공단",
    "한국교통안전공단",
    "공단이랑",
    "공단과",
    "공단하고",
    "공사랑",
    "공사와",
    "공사하고",
    "기관 차이",
    "기관차이",
    "어느 기관",
    "무슨 기관",
    "소속 기관",
    "소속기관",
  ];

  /* -----------------------------------------
     일상 대화
  ----------------------------------------- */

  const dailyKeywords = [
    "안녕",
    "안녕하세요",
    "하이",
    "헬로",
    "고마워",
    "감사",
    "감사합니다",
    "반가워",
    "반갑습니다",
    "누구야",
    "뭐야",
    "도와줘",
    "도와주세요",
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
   질문 키워드 확장
========================================================= */

function expandKeywords(question) {
  const q = question.toLowerCase();

  const keywords = new Set();

  // 원래 질문 단어
  q.split(/[\s,?.!~]+/)
    .filter((word) => word.length >= 2)
    .forEach((word) => keywords.add(word));

  /* -----------------------------------------
     고령 관련 동의어 / 연관어
  ----------------------------------------- */

  if (
    q.includes("75세") ||
    q.includes("고령") ||
    q.includes("어르신") ||
    q.includes("고령자")
  ) {
    [
      "75세",
      "75세 이상",
      "고령운전자",
      "고령운전자교육",
      "고령운전자 의무교육",
      "적성검사",
      "갱신",
      "치매검사",
      "치매",
      "인지",
      "치매안심센터",
      "결과서",
      "유효기간",
      "면허",
      "운전면허",
      "교육",
    ].forEach((word) => keywords.add(word));
  }

  /* -----------------------------------------
     갱신 관련
  ----------------------------------------- */

  if (
    q.includes("갱신") ||
    q.includes("면허 갱신") ||
    q.includes("적성검사") ||
    q.includes("면허") && q.includes("75")
  ) {
    [
      "갱신",
      "적성검사",
      "신청",
      "시험장",
      "경찰서",
      "온라인",
      "준비물",
      "수수료",
      "사진",
      "운전면허증",
    ].forEach((word) => keywords.add(word));
  }

  /* -----------------------------------------
     치매 / 인지검사
  ----------------------------------------- */

  if (
    q.includes("치매") ||
    q.includes("인지")
  ) {
    [
      "치매",
      "치매검사",
      "치매선별검사",
      "치매안심센터",
      "인지",
      "인지검사",
      "인지선별검사",
      "결과서",
      "유효기간",
      "진단서",
      "소견서",
    ].forEach((word) => keywords.add(word));
  }

  /* -----------------------------------------
     기능시험
  ----------------------------------------- */

  if (
    q.includes("기능시험") ||
    q.includes("기능 시험")
  ) {
    [
      "기능시험",
      "온라인접수",
      "온라인접수 가능 시간",
      "안전운전통합민원",
      "수수료",
      "준비물",
    ].forEach((word) => keywords.add(word));
  }

  /* -----------------------------------------
     기관 비교
  ----------------------------------------- */

  if (
    q.includes("도로교통공단") ||
    q.includes("도로공사") ||
    q.includes("교통안전공단") ||
    q.includes("기관")
  ) {
    [
      "도로교통공단",
      "한국도로교통공단",
      "도로공사",
      "한국도로공사",
      "교통안전공단",
      "한국교통안전공단",
      "소속",
      "설립",
      "목적",
      "업무",
      "역할",
      "기관",
    ].forEach((word) => keywords.add(word));
  }

  return [...keywords];
}

/* =========================================================
   Knowledge를 의미 있는 블록으로 분리
========================================================= */

function splitIntoBlocks(text) {
  if (!text) return [];

  // [제목], ● 제목, ① 제목 등을 기준으로 최대한 의미 단위 유지
  const lines = text.split(/\r?\n/);

  const blocks = [];
  let current = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const isHeading =
      /^\[.+\]$/.test(trimmed) ||
      /^●/.test(trimmed) ||
      /^①/.test(trimmed) ||
      /^②/.test(trimmed) ||
      /^③/.test(trimmed) ||
      /^\d+\.\s/.test(trimmed);

    if (isHeading && current.length > 0) {
      blocks.push(current.join("\n").trim());
      current = [];
    }

    if (trimmed) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join("\n").trim());
  }

  // 너무 작은 조각 합치기
  const merged = [];
  let buffer = "";

  for (const block of blocks) {
    if (block.length < 80) {
      buffer += (buffer ? "\n" : "") + block;
    } else {
      if (buffer) {
        merged.push(buffer);
        buffer = "";
      }

      merged.push(block);
    }
  }

  if (buffer) {
    merged.push(buffer);
  }

  return merged;
}

/* =========================================================
   관련 블록 검색
========================================================= */

function findRelevantBlocks(text, question, options = {}) {
  if (!text) return "";

  const {
    maxBlocks = 12,
    maxChars = 18000,
    minimumScore = 1,
  } = options;

  const blocks = splitIntoBlocks(text);

  if (!blocks.length) {
    return text.substring(0, maxChars);
  }

  const keywords = expandKeywords(question);

  const scored = blocks.map((block, index) => {
    const lower = block.toLowerCase();

    let score = 0;

    for (const keyword of keywords) {
      const k = keyword.toLowerCase();

      if (lower.includes(k)) {
        // 긴 키워드일수록 더 중요
        score += k.length >= 5 ? 4 : 2;
      }
    }

    // 질문의 핵심 단어가 제목에 있으면 추가 가중치
    if (
      lower.includes("적성검사") &&
      question.includes("갱신")
    ) {
      score += 8;
    }

    if (
      lower.includes("치매검사") &&
      (
        question.includes("75") ||
        question.includes("고령") ||
        question.includes("치매")
      )
    ) {
      score += 10;
    }

    if (
      lower.includes("고령운전자") &&
      (
        question.includes("75") ||
        question.includes("고령")
      )
    ) {
      score += 8;
    }

    return {
      block,
      score,
      index,
    };
  });

  const relevant = scored
    .filter((item) => item.score >= minimumScore)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.index - b.index;
    })
    .slice(0, maxBlocks);

  // 검색 결과가 너무 적으면 앞부분 일부 제공
  if (!relevant.length) {
    return blocks
      .slice(0, 3)
      .join("\n\n")
      .substring(0, maxChars);
  }

  // 원래 자료 순서대로 정렬
  relevant.sort((a, b) => a.index - b.index);

  return relevant
    .map((item) => item.block)
    .join("\n\n")
    .substring(0, maxChars);
}

/* =========================================================
   자료 선택
========================================================= */

function selectKnowledge(question, knowledge) {
  const type = detectQuestionType(question);

  const selected = [];

  /*
   * 핵심:
   *
   * 일반 질문
   * → 챗봇22 우선
   *
   * 고령 질문
   * → 챗봇22 + 고령 Q&A
   *
   * 기관 질문
   * → 챗봇22 + 공단법
   *
   * 일상 질문
   * → 일상 Q&A
   */

  if (type === "senior") {
    selected.push({
      name: FILES.main,
      priority: 1,
      content: findRelevantBlocks(
        knowledge.main,
        question,
        {
          maxBlocks: 14,
          maxChars: 22000,
          minimumScore: 1,
        }
      ),
    });

    selected.push({
      name: FILES.senior,
      priority: 2,
      content: findRelevantBlocks(
        knowledge.senior,
        question,
        {
          maxBlocks: 10,
          maxChars: 12000,
          minimumScore: 1,
        }
      ),
    });
  }

  else if (type === "organization") {
    selected.push({
      name: FILES.main,
      priority: 1,
      content: findRelevantBlocks(
        knowledge.main,
        question,
        {
          maxBlocks: 8,
          maxChars: 12000,
          minimumScore: 1,
        }
      ),
    });

    selected.push({
      name: FILES.organization,
      priority: 2,
      content: findRelevantBlocks(
        knowledge.organization,
        question,
        {
          maxBlocks: 10,
          maxChars: 14000,
          minimumScore: 1,
        }
      ),
    });
  }

  else if (type === "daily") {
    selected.push({
      name: FILES.daily,
      priority: 1,
      content: findRelevantBlocks(
        knowledge.daily,
        question,
        {
          maxBlocks: 8,
          maxChars: 8000,
          minimumScore: 1,
        }
      ),
    });

    // 일상 Q&A에서 답을 못 찾을 경우
    // 챗봇22도 아주 조금 참고
    if (!selected[0].content) {
      selected.push({
        name: FILES.main,
        priority: 2,
        content: findRelevantBlocks(
          knowledge.main,
          question,
          {
            maxBlocks: 3,
            maxChars: 5000,
            minimumScore: 1,
          }
        ),
      });
    }
  }

  else {
    selected.push({
      name: FILES.main,
      priority: 1,
      content: findRelevantBlocks(
        knowledge.main,
        question,
        {
          maxBlocks: 10,
          maxChars: 18000,
          minimumScore: 1,
        }
      ),
    });
  }

  return selected.filter(
    (item) => item.content && item.content.trim()
  );
}

/* =========================================================
   Prompt용 Knowledge 생성
========================================================= */

function buildKnowledgePrompt(selectedKnowledge) {
  if (!selectedKnowledge.length) {
    return "참고할 업무자료가 없습니다.";
  }

  return selectedKnowledge
    .sort((a, b) => a.priority - b.priority)
    .map((item) => {
      return `
━━━━━━━━━━━━━━━━━━━━
[자료 우선순위 ${item.priority}]
[자료명: ${item.name}]
━━━━━━━━━━━━━━━━━━━━

${item.content}
`;
    })
    .join("\n");
}

/* =========================================================
   시스템 프롬프트
========================================================= */

function buildSystemPrompt(question, knowledgeText) {
  const type = detectQuestionType(question);

  let specialInstruction = "";

  if (type === "senior") {
    specialInstruction = `
[고령운전자 질문 처리]

이 질문은 고령운전자 관련 질문이다.

특히 70세/75세 이상 면허 적성검사·갱신 질문에서는
교육만 단독으로 답하지 말고, 참고자료에서 확인되는 관련 절차를
하나의 흐름으로 종합해서 답한다.

예를 들어 질문이
"75세인데 면허 갱신하려면?"
이라면 자료에 있는 범위에서 다음과 같은 관련 항목을 함께 검토한다.

- 면허 종류별 적성검사 대상 여부
- 75세 이상 추가 절차
- 치매검사
- 치매검사 결과서
- 고령운전자 의무교육
- 방문교육 / 온라인교육
- 시험장 / 경찰서 / 온라인 신청
- 준비물
- 수수료
- 건강검진 및 신체검사 관련 사항
- 갱신기간 관련 사항

단, 자료에 없는 내용을 임의로 추가하지 않는다.

질문이 "치매검사는?"처럼 좁은 질문이면
치매 관련 내용에 집중한다.
`;
  }

  if (type === "organization") {
    specialInstruction = `
[기관 비교 질문 처리]

이 질문은 기관의 차이를 묻는 질문이다.

"한국도로교통공단과 한국도로공사는 뭐가 달라?"
처럼 질문하면 단순히 "서로 다른 기관입니다"라고 끝내지 않는다.

참고자료에서 확인되는 범위 내에서 다음 항목을 비교한다.

- 기관명
- 설립/법적 근거
- 소속 또는 관련 근거
- 주요 역할
- 담당 업무
- 운전면허·교통안전과의 관련성
- 도로 건설·관리와의 관련성

자료에 확인되지 않는 항목은 추측하지 않는다.

사용자가 이해하기 쉽도록 짧은 비교 형태로 답한다.
`;
  }

  if (type === "daily") {
    specialInstruction = `
[일상 대화 처리]

인사, 감사, 간단한 대화라면
업무자료를 장황하게 설명하지 않는다.

예:
"안녕하세요" → 자연스럽게 인사한다.
"고마워" → 자연스럽게 응답한다.

일상 질문 Q&A에 적절한 답이 있다면 그것을 우선 사용한다.
`;
  }

  return `
너는 한국도로교통공단 운전면허 및 교통안전 관련 안내를 도와주는 챗봇이다.

반드시 아래 참고 업무자료를 근거로 답변한다.

━━━━━━━━━━━━━━━━━━━━
[가장 중요한 답변 원칙]
━━━━━━━━━━━━━━━━━━━━

1. 자료의 우선순위는 다음과 같다.

   1순위: 챗봇22.txt
   2순위: 고령운전자 교통안전교육 관련 Q&A.txt
   2순위: 한국도로교통공단법.txt
   일상대화: 일상 질문 Q&A.txt

2. 챗봇22.txt에 답변 근거가 있으면 이를 가장 우선한다.

3. 보조자료는 챗봇22.txt의 내용을 보완하기 위해 사용한다.

4. 자료가 서로 다른 경우에는 우선순위가 높은 자료를 따른다.

5. 제공된 자료에 없는 사실을 일반적인 상식이나 인터넷 지식으로
   임의로 추가하지 않는다.

6. 단순히 자료의 한 문장만 복사해서 답하지 않는다.
   질문과 관련된 자료가 여러 곳에 있다면 관련 내용을 종합한다.

7. 특히 절차를 묻는 질문은 자료에 있는 절차를 순서대로 정리한다.

8. 사용자가 특정 연령, 면허 종류, 교육, 검사 등을 질문하면
   그 조건에 해당하는 부분을 우선적으로 찾는다.

9. 질문과 관계없는 정보를 장황하게 나열하지 않는다.

10. 그러나 질문에 직접적으로 필요한 절차나 준비사항은
    빠뜨리지 않는다.

11. "75세인데 면허 갱신하려면?"처럼 범위가 넓은 질문은
    관련 절차를 충분히 설명한다.

12. 반대로 "치매검사 어디서 받아?"처럼 범위가 좁은 질문은
    해당 질문에 집중한다.

13. 사용자가 묻지 않은 일반적인 운전면허 취득 절차를
    불필요하게 추가하지 않는다.

14. 전화번호, 수수료, 주소, URL 등 구체적인 정보는
    참고자료에 있는 경우에만 사용한다.

15. 자료에 URL이 있다면 자료에 있는 URL을 그대로 사용할 수 있다.

16. 답변은 자연스러운 한국어로 작성한다.

17. 기본 답변 길이는 약 5~10문장 또는 적절한 bullet 형식으로 한다.

18. 절차가 필요한 질문은 번호를 사용한다.

19. 사용자가 "자세히" 또는 "전체 절차"라고 요청한 경우에만
    더 상세하게 설명한다.

20. 같은 문장이나 같은 내용을 반복하지 않는다.

21. "제공된 자료에서는 확인되지 않습니다"라는 표현은
    실제로 자료를 검토했지만 답변 근거를 찾지 못한 경우에만 사용한다.

22. 답변에서 내부 파일명이나 knowledge라는 표현은
    사용자에게 필요하지 않다면 언급하지 않는다.

${specialInstruction}

━━━━━━━━━━━━━━━━━━━━
[사용자 질문]
━━━━━━━━━━━━━━━━━━━━

${question}

━━━━━━━━━━━━━━━━━━━━
[참고 업무자료]
━━━━━━━━━━━━━━━━━━━━

${knowledgeText}

━━━━━━━━━━━━━━━━━━━━
[답변 작성]
━━━━━━━━━━━━━━━━━━━━

위 참고자료를 충분히 검토하여 질문에 직접 답변하라.

자료에 관련 내용이 여러 곳에 있으면 하나의 자연스러운 답변으로 통합하라.

특히 절차 질문에서는 중요한 단계를 빠뜨리지 말 것.

질문과 관계없는 내용은 제외할 것.

답변만 출력할 것.
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
            temperature: 0.2,
            maxOutputTokens: 1200,
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

      console.error(
        `Gemini API attempt ${attempt + 1}:`,
        response.status,
        errorMessage
      );

      /*
       * 429 → 재시도
       */
      if (response.status === 429) {
        if (attempt < MAX_RETRIES - 1) {
          const delay =
            RETRY_BASE_DELAY * Math.pow(2, attempt);

          console.log(
            `429 detected. Retry after ${delay}ms`
          );

          await sleep(delay);
          continue;
        }
      }

      /*
       * 서버 오류 → 재시도
       */
      if (
        response.status >= 500 &&
        response.status <= 599
      ) {
        if (attempt < MAX_RETRIES - 1) {
          const delay =
            RETRY_BASE_DELAY * Math.pow(2, attempt);

          await sleep(delay);
          continue;
        }
      }

      /*
       * 400 / 401 / 403 등은 즉시 종료
       */
      break;

    } catch (error) {
      lastError = error;

      console.error(
        `Gemini request attempt ${attempt + 1}:`,
        error
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay =
          RETRY_BASE_DELAY * Math.pow(2, attempt);

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
   Sleep
========================================================= */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* =========================================================
   Gemini 실패 시 자료 기반 Fallback
========================================================= */

function fallbackAnswer(question, knowledge) {
  const q = question.toLowerCase();
  const type = detectQuestionType(question);

  /* =======================================================
     일상 대화
  ======================================================= */

  if (
    q.includes("안녕") ||
    q.includes("안녕하세요") ||
    q.includes("하이")
  ) {
    return "안녕하세요! 운전면허와 교통안전 관련 궁금한 점을 말씀해 주세요. 😊";
  }

  if (
    q.includes("고마워") ||
    q.includes("감사") ||
    q.includes("고맙")
  ) {
    return "네, 도움이 되었다니 다행이에요! 궁금한 점이 있으면 편하게 물어보세요. 😊";
  }

  /* =======================================================
     고령운전자 75세 이상
  ======================================================= */

  if (
    type === "senior" &&
    (
      q.includes("75세") ||
      q.includes("고령") ||
      q.includes("치매") ||
      q.includes("인지")
    )
  ) {
    /*
     * 자료에서 확인되는 75세 이상 공통 절차
     */
    if (
      q.includes("갱신") ||
      q.includes("면허") ||
      q.includes("적성검사")
    ) {
      return (
        "만 75세 이상 운전자가 면허 적성검사·갱신을 할 때는 일반적인 갱신 절차에 추가로 고령운전자 관련 절차가 필요합니다.\n\n" +
        "1. 치매검사(치매안심센터)를 받고 결과서를 준비합니다. 결과서는 유효기간 1년으로 안내되어 있습니다.\n" +
        "2. 고령운전자 의무교육을 이수합니다. 방문교육 또는 온라인교육이 가능합니다.\n" +
        "3. 이후 시험장·경찰서를 방문하거나 온라인으로 적성검사를 신청합니다.\n\n" +
        "다만 세부 준비물과 수수료는 보유하신 면허 종류(예: 1종보통, 2종보통 등)에 따라 달라질 수 있습니다."
      );
    }

    if (
      q.includes("치매") ||
      q.includes("인지")
    ) {
      return (
        "네. 제공된 안내자료 기준으로 만 75세 이상 적성검사 대상자는 치매검사를 받아야 합니다.\n\n" +
        "치매검사는 지역 치매안심센터에서 받을 수 있으며, 적성검사 시 결과서를 지참해야 합니다. 결과서의 유효기간은 1년으로 안내되어 있습니다.\n\n" +
        "또한 치매선별검사 결과 치매 또는 경도인지장애(인지저하)인 경우에는 치매진단서 또는 소견서가 필요할 수 있습니다."
      );
    }

    if (
      q.includes("교육") ||
      q.includes("온라인") ||
      q.includes("수강")
    ) {
      return (
        "만 75세 이상 고령운전자의 의무교육은 방문교육 또는 온라인교육으로 받을 수 있습니다.\n" +
        "현장교육은 사전예약이 필요하며, 온라인교육은 교통안전교육센터에서 수강할 수 있습니다."
      );
    }
  }

  /* =======================================================
     기관 비교
  ======================================================= */

  if (
    type === "organization" &&
    (
      q.includes("도로교통공단") ||
      q.includes("도로공사")
    )
  ) {
    /*
     * Gemini가 429일 때도 최소한 구분 가능하도록
     * 자료에 포함된 표현을 우선 사용.
     */
    return (
      "한국도로교통공단과 한국도로공사는 서로 다른 기관입니다.\n\n" +
      "한국도로교통공단은 운전면허시험·적성검사·교통안전교육 등 운전자와 교통안전 관련 업무를 담당하고, " +
      "한국도로공사는 고속도로의 건설·관리·운영 등 도로 분야의 업무를 담당하는 기관으로 구분하면 이해하기 쉽습니다.\n\n" +
      "즉, 운전면허나 교통안전교육은 한국도로교통공단, 고속도로 건설·관리와 관련된 업무는 한국도로공사 쪽이라고 보면 됩니다."
    );
  }

  /* =======================================================
     기능시험
  ======================================================= */

  if (
    q.includes("기능시험") &&
    (
      q.includes("예약") ||
      q.includes("온라인")
    )
  ) {
    return (
      "장내기능시험은 안전운전통합민원에서 온라인으로 예약할 수 있습니다.\n\n" +
      "온라인 접수 가능 시간은 07:30~22:00이며, " +
      "온라인 접수자의 경우 온라인 또는 시험장 방문을 통한 취소·환불이 가능합니다."
    );
  }

  /* =======================================================
     기본 fallback
  ======================================================= */

  return (
    "현재 답변을 처리하는 데 일시적인 문제가 발생했습니다.\n" +
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
    /*
     * 질문 추출
     */

    const question = extractQuestion(req.body);

    /*
     * 질문 없음
     */

    if (!question) {
      console.error(
        "Question extraction failed:",
        JSON.stringify(req.body)
      );

      return res.status(400).json({
        error: "질문을 입력해주세요.",
      });
    }

    /*
     * Knowledge 로드
     */

    const knowledge = loadKnowledge();

    /*
     * 질문 유형에 맞는 자료 선택
     */

    const selectedKnowledge =
      selectKnowledge(
        question,
        knowledge
      );

    /*
     * Prompt 자료 생성
     */

    const knowledgeText =
      buildKnowledgePrompt(
        selectedKnowledge
      );

    /*
     * 시스템 프롬프트 생성
     */

    const prompt =
      buildSystemPrompt(
        question,
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
        "Gemini final error:",
        geminiError
      );

      /*
       * Gemini 실패 시 fallback
       */

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
