import fs from "fs";
import path from "path";


// =====================================================
// 기본 설정
// =====================================================

const MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";


// =====================================================
// 데이터 파일 읽기
// =====================================================

function loadKnowledge() {

  try {

    const filePath = path.join(
      process.cwd(),
      "data",
      "챗봇22.txt"
    );


    const knowledge = fs.readFileSync(
      filePath,
      "utf8"
    );


    return knowledge;

  } catch (error) {

    console.error(
      "챗봇22.txt 읽기 오류:",
      error
    );


    throw new Error(
      "업무자료(챗봇22.txt)를 읽을 수 없습니다."
    );

  }

}


// =====================================================
// Gemini API 호출
// =====================================================

async function askGemini(question, knowledge) {

  const apiKey =
    process.env.GEMINI_API_KEY;


  if (!apiKey) {

    throw new Error(
      "GEMINI_API_KEY 환경변수가 설정되지 않았습니다."
    );

  }


  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;


  // -----------------------------------------------------
  // 챗봇의 핵심 규칙
  // -----------------------------------------------------

  const systemInstruction = `
너는 한국도로교통공단 전남운전면허시험장 업무 안내 챗봇이다.

반드시 아래의 [업무자료]만을 근거로 답변해야 한다.

[가장 중요한 원칙]

1. 업무자료에 없는 내용을 절대로 지어내지 않는다.

2. 일반적인 상식이나 인터넷에서 알고 있는 운전면허 정보를
   업무자료 대신 사용하지 않는다.

3. 질문에 대한 답이 업무자료에 없으면
   "제공된 업무자료에서 해당 내용을 확인하기 어렵습니다."
   라고 답한다.

4. 업무자료에 있는 수수료, 시간, 준비물, 절차, 면제 여부 등은
   임의로 변경하지 않는다.

5. 서로 다른 면허 종류의 정보를 섞지 않는다.

6. 숫자, 금액, 시간, 연령 조건은 특히 주의해서
   업무자료에 적힌 내용을 그대로 사용한다.

7. 사용자가 짧게 질문해도 업무자료에서 관련 내용을 찾아
   이해하기 쉽게 설명한다.

8. 사용자가 질문한 내용과 관계없는 업무자료 전체를
   불필요하게 출력하지 않는다.

9. 답변은 한국어로 한다.

10. "제공된 업무자료에 따르면"이라는 표현을 자연스럽게
    사용할 수 있다.

11. 자료에 URL이 있으면 필요할 경우 함께 안내한다.

12. 자료에 없는 외부 식당, 맛집, 날씨, 교통상황 등의 질문에는
    임의로 답하지 않는다.

13. 자료에 없는 내용을 추측해서 보충하지 않는다.

14. 질문의 표현이 다소 부정확하더라도 업무자료에서
    가장 가까운 항목을 찾아 답한다.

15. 특히 면허 종류, 연령, 시험 면제 여부, 수수료는
    반드시 업무자료를 기준으로 판단한다.


[답변 스타일]

- 너무 길게 설명하지 않는다.
- 필요한 경우 번호 목록을 사용한다.
- 수수료는 "14,000원"처럼 명확하게 표시한다.
- 준비물은 목록으로 보여준다.
- 절차는 순서대로 보여준다.
- 업무자료에 없는 사항은 추측하지 않는다.


[업무자료]

${knowledge}

[업무자료 끝]


이제 사용자의 질문에 답변하라.
`;


  const requestBody = {

    system_instruction: {

      parts: [
        {
          text: systemInstruction
        }
      ]

    },

    contents: [

      {
        role: "user",

        parts: [
          {
            text: question
          }
        ]

      }

    ],

    generationConfig: {

      temperature: 0.1,

      maxOutputTokens: 1500

    }

  };


  const response = await fetch(
    url,
    {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(requestBody)

    }
  );


  // -----------------------------------------------------
  // Gemini 서버 응답
  // -----------------------------------------------------

  const rawText =
    await response.text();


  let data;


  try {

    data = JSON.parse(rawText);

  } catch (error) {

    console.error(
      "Gemini 응답이 JSON이 아닙니다:",
      rawText
    );


    throw new Error(
      "AI 서버에서 올바르지 않은 응답을 받았습니다."
    );

  }


  // -----------------------------------------------------
  // Gemini API 오류
  // -----------------------------------------------------

  if (!response.ok) {

    console.error(
      "Gemini API 오류:",
      data
    );


    const apiError =
      data?.error?.message ||
      "Gemini API 호출 중 오류가 발생했습니다.";


    throw new Error(apiError);

  }


  // -----------------------------------------------------
  // 답변 추출
  // -----------------------------------------------------

  const answer =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();


  if (!answer) {

    console.error(
      "Gemini 답변 없음:",
      data
    );


    throw new Error(
      "AI가 답변을 반환하지 않았습니다."
    );

  }


  return answer;

}


// =====================================================
// Vercel API Handler
// =====================================================

export default async function handler(req, res) {


  // -----------------------------------------------------
  // CORS / 응답 형식
  // -----------------------------------------------------

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );


  // -----------------------------------------------------
  // POST만 허용
  // -----------------------------------------------------

  if (req.method !== "POST") {

    return res.status(405).json({

      error:
        "POST 방식으로 요청해야 합니다."

    });

  }


  try {


    // ---------------------------------------------------
    // 요청 데이터 확인
    // ---------------------------------------------------

    const question =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";


    if (!question) {

      return res.status(400).json({

        error:
          "질문 내용을 입력해 주세요."

      });

    }


    // 너무 긴 질문 방지
    if (question.length > 1000) {

      return res.status(400).json({

        error:
          "질문은 1,000자 이하로 입력해 주세요."

      });

    }


    // ---------------------------------------------------
    // 업무자료 불러오기
    // ---------------------------------------------------

    const knowledge =
      loadKnowledge();


    // ---------------------------------------------------
    // Gemini에 질문
    // ---------------------------------------------------

    const answer =
      await askGemini(
        question,
        knowledge
      );


    // ---------------------------------------------------
    // 정상 응답
    // ---------------------------------------------------

    return res.status(200).json({

      answer: answer

    });


  } catch (error) {


    console.error(
      "chat.js 서버 오류:",
      error
    );


    // ---------------------------------------------------
    // 클라이언트에 JSON으로 오류 전달
    // ---------------------------------------------------

    return res.status(500).json({

      error:
        error?.message ||
        "서버에서 오류가 발생했습니다."

    });

  }

}
