import fs from "fs";
import path from "path";


// ============================================================
// 기본 설정
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 현재 Google AI Studio에서 사용할 모델
const GEMINI_MODEL = "gemini-3.5-flash";


// ============================================================
// 텍스트 정리 함수
// ============================================================

function normalize(text = "") {

  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// 띄어쓰기를 제거한 비교용 문자열
//
// 예:
// 응시전교통안전교육
// 응시 전 교통안전교육
//
// → 둘 다 동일하게 비교 가능
//
function compact(text = "") {

  return normalize(text)
    .replace(/\s/g, "");
}


// ============================================================
// 지식자료 읽기
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
// TXT 자료를 Section으로 분리
// ============================================================
//
// 자료가
//
// 1. ...
// 2. ...
// 3. ...
//
// ① ...
// ② ...
//
// 등의 형태로 되어 있어도 최대한 항목 단위로 나눔
//
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


    // --------------------------------------------------------
    // 숫자 항목
    //
    // 1.
    // 2.
    // 25.
    //
    // --------------------------------------------------------

    const numberMatch =
      trimmed.match(/^(\d+)\.\s*(.*)$/);


    // --------------------------------------------------------
    // 동그라미 항목
    //
    // ①
    // ②
    // ③
    //
    // --------------------------------------------------------

    const circleMatch =
      trimmed.match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)$/);


    // --------------------------------------------------------
    // 새로운 Section 시작
    // --------------------------------------------------------

    if (numberMatch || circleMatch) {

      if (current) {

        current.content =
          current.content.trim();

        sections.push(current);
      }


      const marker =
        numberMatch
          ? numberMatch[1]
          : circleMatch[1];

      const title =
        numberMatch
          ? numberMatch[2]
          : circleMatch[2];


      current = {

        number: marker,

        title: title,

        content: title
      };


      continue;
    }


    // --------------------------------------------------------
    // 현재 Section의 내용
    // --------------------------------------------------------

    if (current) {

      current.content +=
        "\n" + trimmed;
    }

  }


  // 마지막 Section 저장
  if (current) {

    current.content =
      current.content.trim();

    sections.push(current);
  }


  return sections;
}


// ============================================================
// 자연어 → 자료 표현 변환
// ============================================================

const synonyms = {

  // 음주 관련
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

  "술 때문에": [
    "음주",
    "음주운전"
  ],

  // 면허 정지
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

  // 면허 취소
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

  // 예약
  "예약": [
    "예약",
    "접수방법",
    "온라인",
    "인터넷"
  ],

  "접수": [
    "접수방법",
    "예약"
  ],

  // 준비물
  "준비물": [
    "준비물"
  ],

  "뭐가필요": [
    "준비물"
  ],

  "뭐필요": [
    "준비물"
  ],

  // 갱신
  "갱신": [
    "갱신",
    "적성검사"
  ],

  // 재발급
  "재발급": [
    "재발급"
  ],

  // 고령자
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
// Section 검색
// ============================================================

function findSections(sections, question) {

  const q =
    normalize(question);

  const compactQuestion =
    compact(question);


  console.log(
    "사용자 질문:",
    question
  );


  // ==========================================================
  // ⭐ 핵심 규칙 1
  //
  // 음주/술 + 면허 정지/취소
  //
  // → 특별교통안전교육을 최우선으로 선택
  //
  // ==========================================================

  const hasAlcoholKeyword =
    /술|음주|음주운전|술먹고|술을마시고/.test(
      compactQuestion
    );


  const hasLicensePenaltyKeyword =
    /면허정지|면허취소|정지처분|취소처분|정지됐|정지되|취소됐|취소되/.test(
      compactQuestion
    );


  if (
    hasAlcoholKeyword &&
    hasLicensePenaltyKeyword
  ) {

    const specialEducation =
      sections.find(section => {

        return compact(
          section.title
        ).includes(
          "특별교통안전교육"
        );

      });


    if (specialEducation) {

      console.log(
        "음주 + 면허 정지/취소 감지"
      );

      console.log(
        "→ 특별교통안전교육 우선 선택"
      );


      return [
        specialEducation
      ];
    }
  }


  // ==========================================================
  // 2. 제목 직접 검색
  //
  // 띄어쓰기를 무시함
  //
  // 응시전교통안전교육
  // 응시 전 교통안전교육
  //
  // 둘을 같은 것으로 처리
  //
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

    console.log(
      "제목 직접 검색 결과:",
      directMatches.map(
        s =>
          `${s.number} ${s.title}`
      )
    );


    return directMatches;
  }


  // ==========================================================
  // 3. 질문 핵심 단어 추출
  // ==========================================================

  let keywords =
    q
      .split(/\s+/)
      .filter(
        word =>
          word.length >= 2
      );


  // ==========================================================
  // 4. 동의어 추가
  // ==========================================================

  const additionalKeywords = [];


  for (
    const keyword of keywords
  ) {

    const compactKeyword =
      compact(keyword);


    if (
      synonyms[compactKeyword]
    ) {

      additionalKeywords.push(
        ...synonyms[
          compactKeyword
        ]
      );
    }


    if (
      synonyms[keyword]
    ) {

      additionalKeywords.push(
        ...synonyms[keyword]
      );
    }
  }


  keywords = [

    ...keywords,

    ...additionalKeywords

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


  // ==========================================================
  // 5. Section별 점수 계산
  // ==========================================================

  const scored = [];


  for (
    const section of sections
  ) {

    const titleText =
      normalize(
        section.title
      );


    const contentText =
      normalize(
        section.content
      );


    const compactTitle =
      compact(
        section.title
      );


    const compactContent =
      compact(
        section.content
      );


    let score = 0;


    for (
      const keyword of keywords
    ) {

      const normalizedKeyword =
        normalize(keyword);


      const compactKeyword =
        compact(keyword);


      if (
        !normalizedKeyword
      ) {
        continue;
      }


      // ------------------------------------------------------
      // 제목에 있으면 높은 점수
      // ------------------------------------------------------

      if (
        titleText.includes(
          normalizedKeyword
        )
      ) {

        score += 10;
      }


      // 띄어쓰기 무시 제목 검색
      else if (
        compactTitle.includes(
          compactKeyword
        )
      ) {

        score += 10;
      }


      // ------------------------------------------------------
      // 내용에 있으면 점수
      // ------------------------------------------------------

      if (
        contentText.includes(
          normalizedKeyword
        )
      ) {

        score += 3;
      }


      // 띄어쓰기 무시 내용 검색
      else if (
        compactContent.includes(
          compactKeyword
        )
      ) {

        score += 3;
      }
    }


    if (
      score > 0
    ) {

      scored.push({

        section,

        score

      });
    }
  }


  // ==========================================================
  // 6. 점수순 정렬
  // ==========================================================

  scored.sort(
    (a, b) =>
      b.score - a.score
  );


  console.log(
    "검색 점수:",
    scored.map(
      item =>
        `${item.section.number} ${item.section.title} = ${item.score}`
    )
  );


  // ==========================================================
  // 7. 관련 자료 최대 3개 반환
  // ==========================================================

  const results =
    scored
      .slice(0, 3)
      .map(
        item =>
          item.section
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


// ============================================================
// Gemini 호출
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


  // ----------------------------------------------------------
  // AI에게 전달할 자료 만들기
  // ----------------------------------------------------------

  const knowledgeText =
    relevantSections
      .map(section => {

        return `
[${section.number}. ${section.title}]

${section.content}

`;

      })
      .join("\n");


  // ----------------------------------------------------------
  // 시스템 지침
  // ----------------------------------------------------------

  const systemInstruction = `

너는 한국도로교통공단 운전면허시험장 업무 안내 챗봇이다.

반드시 아래에 제공된 업무자료를 근거로 답변해야 한다.

중요 규칙:

1. 제공된 자료에 있는 내용만 사실로 답변한다.

2. 자료에 없는 내용을 일반적인 상식이나 인터넷 정보로 추측해서 답하지 않는다.

3. 자료에 명시되지 않은 경우에는
   "제공된 자료에서는 확인되지 않습니다."
   라고 안내한다.

4. 사용자가 자연어로 질문하더라도 질문의 의미를 파악해서
   제공된 자료와 연결한다.

5. 비슷한 업무가 여러 개 있으면 서로 섞지 않는다.

6. 특히 다음 두 교육은 반드시 구분한다.

   - 응시 전 교통안전교육
   - 특별교통안전교육

7. 사용자가 음주운전 또는 술 때문에 면허가 정지/취소되었다고 질문하면
   제공된 자료에 특별교통안전교육이 해당 상황과 연결되어 있다면
   특별교통안전교육 내용을 기준으로 답변한다.

8. 사용자가 두 가지 이상의 업무를 비교하면
   각각을 구분해서 설명한다.

9. 질문에 답할 때 필요한 경우
   "대상자 / 예약방법 / 준비물 / 수수료 / 교육시간"
   등의 항목으로 보기 쉽게 정리한다.

10. 자료에 "온라인 사전예약 필수"라고 되어 있으면
    현장접수 가능하다고 임의로 말하지 않는다.

11. "당일 현장결제"와 "현장접수"는 서로 다른 의미이므로
    혼동하지 않는다.

12. 답변은 너무 길게 작성하지 말고
    실제 민원인이 이해하기 쉽게 작성한다.

13. 자료에 없는 내용은 자신 있게 만들어내지 않는다.

`;



  // ----------------------------------------------------------
  // Gemini Prompt
  // ----------------------------------------------------------

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

자료에 명시되지 않은 내용은 추측하지 마세요.

`;


  // ----------------------------------------------------------
  // Gemini API
  // ----------------------------------------------------------

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;


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


  // ----------------------------------------------------------
  // API 오류 처리
  // ----------------------------------------------------------

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


  const data =
    await response.json();


  // ----------------------------------------------------------
  // Gemini 답변 추출
  // ----------------------------------------------------------

  const answer =
    data
      ?.candidates?.[0]
      ?.content?.parts?.[0]
      ?.text;


  if (!answer) {

    console.error(
      "Gemini 응답:",
      JSON.stringify(data)
    );


    throw new Error(
      "Gemini가 답변을 반환하지 않았습니다."
    );
  }


  return answer.trim();
}


// ============================================================
// Vercel API Handler
// ============================================================

export default async function handler(
  req,
  res
) {

  // ----------------------------------------------------------
  // POST만 허용
  // ----------------------------------------------------------

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

    // --------------------------------------------------------
    // 질문 가져오기
    // --------------------------------------------------------

    const question =
      req.body?.question;


    if (
      !question ||
      typeof question !== "string"
    ) {

      return res
        .status(400)
        .json({

          error:
            "질문을 입력해주세요."

        });
    }


    // --------------------------------------------------------
    // 지식자료 읽기
    // --------------------------------------------------------

    const knowledge =
      loadKnowledge();


    // --------------------------------------------------------
    // Section으로 분리
    // --------------------------------------------------------

    const sections =
      parseSections(
        knowledge
      );


    console.log(
      "전체 Section 수:",
      sections.length
    );


    // --------------------------------------------------------
    // 질문과 관련된 자료 검색
    // --------------------------------------------------------

    const relevantSections =
      findSections(
        sections,
        question
      );


    // --------------------------------------------------------
    // 관련 자료가 하나도 없는 경우
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Gemini에게 질문
    // --------------------------------------------------------

    const answer =
      await askGemini(
        question,
        relevantSections
      );


    // --------------------------------------------------------
    // 결과 반환
    // --------------------------------------------------------

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
