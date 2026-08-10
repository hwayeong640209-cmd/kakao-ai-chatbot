import fs from "fs";
import path from "path";


// ============================================================
// 1. 기본 설정
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 현재 사용 중인 Gemini 모델
const GEMINI_MODEL = "gemini-3.5-flash";


// ============================================================
// 2. 텍스트 정리
// ============================================================

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// 띄어쓰기 제거
// 예:
// "응시 전 교통안전교육"
// "응시전교통안전교육"
// → 같은 것으로 검색
function compact(text = "") {
  return normalize(text).replace(/\s/g, "");
}


// ============================================================
// 3. 지식자료 읽기
// ============================================================

function loadKnowledge() {

  const filePath = path.join(
    process.cwd(),
    "knowledge",
    "챗봇22.txt"
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(
      "knowledge/챗봇22.txt 파일을 찾을 수 없습니다."
    );
  }

  return fs.readFileSync(
    filePath,
    "utf8"
  );
}


// ============================================================
// 4. TXT 자료를 Section으로 나누기
// ============================================================

function parseSections(text) {

  const lines = text.split(/\r?\n/);

  const sections = [];

  let current = null;


  for (const line of lines) {

    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }


    // 숫자 항목
    // 1. 제목
    // 2. 제목
    const numberMatch =
      trimmed.match(/^(\d+)\.\s*(.*)$/);


    // 동그라미 항목
    // ① 제목
    // ② 제목
    const circleMatch =
      trimmed.match(
        /^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)$/
      );


    // 새로운 Section 발견
    if (numberMatch || circleMatch) {

      if (current) {

        current.content =
          current.content.trim();

        sections.push(current);
      }


      const number =
        numberMatch
          ? numberMatch[1]
          : circleMatch[1];


      const title =
        numberMatch
          ? numberMatch[2]
          : circleMatch[2];


      current = {

        number,

        title,

        content: title

      };


      continue;
    }


    // 현재 Section 내용
    if (current) {

      current.content +=
        "\n" + trimmed;

    }

  }


  // 마지막 Section
  if (current) {

    current.content =
      current.content.trim();

    sections.push(current);

  }


  return sections;
}


// ============================================================
// 5. 자연어 동의어
// ============================================================

const synonyms = {

  // ------------------------------
  // 음주
  // ------------------------------

  "술": [
    "음주",
    "음주운전"
  ],

  "술먹고": [
    "음주",
    "음주운전"
  ],

  "술먹은": [
    "음주",
    "음주운전"
  ],

  "술때문에": [
    "음주",
    "음주운전"
  ],

  "음주": [
    "음주",
    "음주운전"
  ],


  // ------------------------------
  // 면허 정지
  // ------------------------------

  "면허정지": [
    "면허 정지",
    "정지 처분"
  ],

  "면허가정지": [
    "면허 정지",
    "정지 처분"
  ],

  "정지됐": [
    "면허 정지",
    "정지 처분"
  ],

  "정지되": [
    "면허 정지",
    "정지 처분"
  ],


  // ------------------------------
  // 면허 취소
  // ------------------------------

  "면허취소": [
    "면허 취소",
    "취소 처분"
  ],

  "면허가취소": [
    "면허 취소",
    "취소 처분"
  ],

  "취소됐": [
    "면허 취소",
    "취소 처분"
  ],

  "취소되": [
    "면허 취소",
    "취소 처분"
  ],


  // ------------------------------
  // 예약
  // ------------------------------

  "예약": [
    "예약",
    "접수",
    "온라인",
    "인터넷"
  ],

  "접수": [
    "접수",
    "예약",
    "온라인",
    "인터넷"
  ],


  // ------------------------------
  // 준비물
  // ------------------------------

  "준비물": [
    "준비물"
  ],

  "뭐가필요": [
    "준비물"
  ],

  "뭐필요": [
    "준비물"
  ],


  // ------------------------------
  // 갱신
  // ------------------------------

  "갱신": [
    "갱신",
    "적성검사"
  ],


  // ------------------------------
  // 고령자
  // ------------------------------

  "75살": [
    "75세",
    "고령운전자"
  ],

  "75세": [
    "75세",
    "고령운전자"
  ],

  "어르신": [
    "고령운전자"
  ]

};


// ============================================================
// 6. 질문과 관련된 Section 찾기
// ============================================================

function findSections(
  sections,
  question
) {

  const normalizedQuestion =
    normalize(question);

  const compactQuestion =
    compact(question);


  // ==========================================================
  // 특별 규칙
  //
  // "술 + 면허정지/취소"
  //
  // → 특별교통안전교육 우선
  // ==========================================================

  const hasAlcohol =
    /술|음주|음주운전|술먹고|술먹은/.test(
      compactQuestion
    );


  const hasLicensePenalty =
    /면허정지|면허취소|정지처분|취소처분|정지됐|정지되|취소됐|취소되/.test(
      compactQuestion
    );


  if (
    hasAlcohol &&
    hasLicensePenalty
  ) {

    const specialEducation =
      sections.find(
        section =>
          compact(section.title)
            .includes(
              "특별교통안전교육"
            )
      );


    if (specialEducation) {

      console.log(
        "음주 + 면허 정지/취소 감지"
      );

      console.log(
        "특별교통안전교육 Section 선택"
      );


      return [
        specialEducation
      ];

    }

  }


  // ==========================================================
  // 제목 직접 검색
  // ==========================================================

  const directMatches = [];


  for (const section of sections) {

    const title =
      compact(section.title);


    if (
      title.length >= 4 &&
      compactQuestion.includes(title)
    ) {

      directMatches.push(
        section
      );

    }

  }


  if (
    directMatches.length > 0
  ) {

    return directMatches;

  }


  // ==========================================================
  // 질문에서 단어 추출
  // ==========================================================

  let keywords =
    normalizedQuestion
      .split(/\s+/)
      .filter(
        word =>
          word.length >= 2
      );


  // ==========================================================
  // 동의어 추가
  // ==========================================================

  const additionalKeywords = [];


  for (const keyword of keywords) {

    const compactKeyword =
      compact(keyword);


    if (
      synonyms[compactKeyword]
    ) {

      additionalKeywords.push(
        ...synonyms[compactKeyword]
      );

    }

  }


  keywords = [
    ...keywords,
    ...additionalKeywords
  ];


  // 중복 제거
  keywords = [
    ...new Set(keywords)
  ];


  // ==========================================================
  // Section별 점수 계산
  // ==========================================================

  const scored = [];


  for (const section of sections) {

    const title =
      normalize(section.title);

    const content =
      normalize(section.content);

    const compactTitle =
      compact(section.title);

    const compactContent =
      compact(section.content);


    let score = 0;


    for (const keyword of keywords) {

      const word =
        normalize(keyword);

      const compactWord =
        compact(keyword);


      if (!word) {
        continue;
      }


      // 제목에 있으면 높은 점수
      if (
        title.includes(word)
      ) {

        score += 10;

      }
      else if (
        compactTitle.includes(compactWord)
      ) {

        score += 10;

      }


      // 본문에 있으면 점수
      if (
        content.includes(word)
      ) {

        score += 3;

      }
      else if (
        compactContent.includes(compactWord)
      ) {

        score += 3;

      }

    }


    if (score > 0) {

      scored.push({
        section,
        score
      });

    }

  }


  // ==========================================================
  // 높은 점수부터 정렬
  // ==========================================================

  scored.sort(
    (a, b) =>
      b.score - a.score
  );


  // 최대 3개 Section
  return scored
    .slice(0, 3)
    .map(
      item =>
        item.section
    );
}


// ============================================================
// 7. Gemini 호출
// ============================================================

async function askGemini(
  question,
  relevantSections
) {

  if (!GEMINI_API_KEY) {

    throw new Error(
      "GEMINI_API_KEY 환경변수가 없습니다."
    );

  }


  // ==========================================================
  // Gemini에게 전달할 자료
  // ==========================================================

  const knowledgeText =
    relevantSections
      .map(section => {

        return `
[${section.number}. ${section.title}]

${section.content}
`;

      })
      .join("\n");


  // ==========================================================
  // AI 지침
  // ==========================================================

  const systemInstruction = `

너는 한국도로교통공단 운전면허시험장 업무 안내 챗봇이다.

반드시 제공된 업무자료를 근거로 답변한다.

[중요 규칙]

1. 제공된 자료에 있는 내용만 사실로 답변한다.

2. 자료에 없는 내용을 일반적인 상식이나 인터넷 정보로 추측하지 않는다.

3. 자료에 없는 경우 다음과 같이 안내한다.

"제공된 자료에서는 확인되지 않습니다."

4. 사용자가 자연어로 질문해도 질문의 의미를 파악하여
제공된 자료와 연결한다.

5. 비슷한 업무를 서로 섞지 않는다.

6. 특히 다음 두 교육을 반드시 구분한다.

- 응시 전 교통안전교육
- 특별교통안전교육

7. 사용자가 음주 또는 술 때문에 면허가 정지/취소되었다고
질문하면 특별교통안전교육 관련 자료를 우선하여 답변한다.

8. 두 가지 업무를 비교하는 질문이라면
각각을 명확하게 나누어서 설명한다.

9. 필요한 경우 다음 항목으로 정리한다.

- 대상
- 예약방법
- 접수방법
- 준비물
- 수수료
- 교육시간

10. 자료에 "온라인 사전예약 필수"라고 되어 있으면
현장접수가 가능하다고 임의로 말하지 않는다.

11. "당일 현장결제"와 "현장접수"를 혼동하지 않는다.

12. 답변은 실제 민원인이 이해하기 쉽게 작성한다.

13. 제공된 자료에 없는 내용을 만들어내지 않는다.

`;


  // ==========================================================
  // Gemini Prompt
  // ==========================================================

  const prompt = `

${systemInstruction}

==================================================
제공된 업무자료
==================================================

${knowledgeText}

==================================================
사용자 질문
==================================================

${question}

==================================================
답변
==================================================

위 업무자료만 근거로 사용자의 질문에 답변하세요.

자료에 없는 내용은 추측하지 마세요.

`;


  // ==========================================================
  // Gemini API URL
  // ==========================================================

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;


  // ==========================================================
  // API 호출
  // ==========================================================

  const response =
    await fetch(
      url,
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          contents: [

            {

              role: "user",

              parts: [

                {
                  text: prompt
                }

              ]

            }

          ],

          generationConfig: {

            temperature: 0.2,

            maxOutputTokens: 1000

          }

        })

      }
    );


  // ==========================================================
  // Gemini 오류
  // ==========================================================

  if (!response.ok) {

    const errorText =
      await response.text();

    console.error(
      "Gemini API 오류:",
      errorText
    );


    throw new Error(
      `Gemini API 오류 (${response.status})`
    );

  }


  // ==========================================================
  // 응답 JSON
  // ==========================================================

  const data =
    await response.json();


  console.log(
    "Gemini 응답:",
    JSON.stringify(data)
  );


  // ==========================================================
  // 답변 추출
  // ==========================================================

  const answer =
    data
      ?.candidates?.[0]
      ?.content?.parts
      ?.map(part => part.text || "")
      ?.join("")
      ?.trim();


  if (!answer) {

    throw new Error(
      "Gemini가 답변을 반환하지 않았습니다."
    );

  }


  return answer;
}


// ============================================================
// 8. Vercel API
// ============================================================

export default async function handler(
  req,
  res
) {

  // ==========================================================
  // POST 확인
  // ==========================================================

  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({

        error:
          "POST 요청만 사용할 수 있습니다."

      });

  }


  try {

    // ========================================================
    // ⭐ 질문 가져오기
    //
    // 프론트에서 어떤 이름으로 보내더라도 최대한 대응
    //
    // question
    // message
    // prompt
    // text
    // ========================================================

    const question =
      req.body?.question ??
      req.body?.message ??
      req.body?.prompt ??
      req.body?.text ??
      "";


    // 문자열로 변환
    const cleanQuestion =
      String(question).trim();


    console.log(
      "받은 질문:",
      cleanQuestion
    );


    // ========================================================
    // 질문이 없는 경우
    // ========================================================

    if (
      !cleanQuestion
    ) {

      return res
        .status(400)
        .json({

          error:
            "질문을 입력해주세요."

        });

    }


    // ========================================================
    // 지식자료 읽기
    // ========================================================

    const knowledge =
      loadKnowledge();


    // ========================================================
    // Section 분리
    // ========================================================

    const sections =
      parseSections(
        knowledge
      );


    console.log(
      "전체 Section:",
      sections.length
    );


    // ========================================================
    // 관련 자료 검색
    // ========================================================

    const relevantSections =
      findSections(
        sections,
        cleanQuestion
      );


    console.log(
      "검색된 Section:",
      relevantSections.map(
        section =>
          section.title
      )
    );


    // ========================================================
    // 관련 자료 없음
    // ========================================================

    if (
      relevantSections.length === 0
    ) {

      return res
        .status(200)
        .json({

          answer:
            "죄송합니다. 제공된 업무자료에서는 질문하신 내용에 대한 정보를 확인하기 어렵습니다."

        });

    }


    // ========================================================
    // Gemini에게 질문
    // ========================================================

    const answer =
      await askGemini(
        cleanQuestion,
        relevantSections
      );


    // ========================================================
    // 최종 답변
    // ========================================================

    return res
      .status(200)
      .json({

        answer

      });


  } catch (error) {

    console.error(
      "챗봇 오류:",
      error
    );


    return res
      .status(500)
      .json({

        error:
          error.message ||
          "챗봇 처리 중 오류가 발생했습니다."

      });

  }

}
