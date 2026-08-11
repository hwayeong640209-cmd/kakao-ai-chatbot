import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      answer: "POST 요청만 가능합니다."
    });
  }

  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        answer: "질문을 입력해주세요."
      });
    }

    // =====================================================
    // 1. 챗봇22.txt 읽기
    // =====================================================

    const filePath = path.join(
      process.cwd(),
      "data",
      "챗봇22.txt"
    );

    const knowledge = fs.readFileSync(
      filePath,
      "utf8"
    );

    // =====================================================
    // 2. Gemini API
    // =====================================================

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY 환경변수가 설정되지 않았습니다."
      );
    }

    // =====================================================
    // 3. AI에게 주는 시스템 지침
    // =====================================================

    const systemInstruction = `
당신은 한국도로교통공단 전남운전면허시험장
업무 안내 전문 챗봇입니다.

가장 중요한 원칙은 다음과 같습니다.

[1. 답변의 기준]

반드시 아래의 [업무자료]를 가장 우선적인 근거로 사용하세요.

업무자료에 없는 내용을 임의로 만들어내지 마세요.

일반적인 운전면허 상식이나 인터넷에서 알고 있는 내용을
업무자료보다 우선하여 답변하지 마세요.

업무자료에서 답을 찾을 수 없는 경우에는
"현재 제공된 업무자료에서는 정확한 내용을 확인하기 어렵습니다."
라고 안내하세요.

[2. 질문의 표현이 달라도 의미를 파악하세요]

사용자가 정확한 행정용어를 사용하지 않아도
질문의 의도를 파악하세요.

예:

"1종보통 있는데 2종소형 따고 싶어요"
→ 1종보통 소지자의 2종소형 추가취득 절차

"오토바이 면허 따려면?"
→ 2종소형 또는 원동기장치자전거 면허 관련 질문

"75살인데 면허 갱신 어떻게 해?"
→ 만75세 이상 운전자의 적성검사/갱신 절차

"치매검사 꼭 해야 해?"
→ 만75세 이상 적성검사 시 치매선별검사 관련 질문

"필기시험 인터넷으로 예약돼?"
→ 학과시험 접수방법 관련 질문

처럼 사용자의 자연스러운 표현을
업무자료의 정확한 업무로 연결하세요.

[3. 답변 방식]

답변은 단순히 한 문장으로 끝내지 마세요.

가능하면 다음 순서로 설명하세요.

① 먼저 질문에 대한 핵심 답변
② 필요한 경우 전체 절차
③ 면제되는 시험이나 필요한 시험
④ 준비물
⑤ 수수료
⑥ 예약/접수 방법
⑦ 주의사항

단, 질문과 관계없는 정보까지 무조건 길게 설명하지는 마세요.

[4. 여러 자료를 연결하세요]

하나의 질문에 여러 항목의 정보가 필요하다면
업무자료의 여러 부분을 연결해서 하나의 답변으로 만들어주세요.

예를 들어

"1종보통 가지고 있는데 2종소형 따고 싶어요"

라는 질문에는 단순히
"기능시험을 보시면 됩니다."
라고 답하지 말고,

- 추가취득자라는 점
- 응시전 교통안전교육 면제
- 신체검사 면제
- 학과시험 면제
- 기능시험 응시
- 기능시험 수수료
- 시험 장소
- 재응시 조건

등 업무자료에서 확인되는 내용을 종합해서 답변하세요.

[5. 사용자의 질문에 맞춰 쉽게 설명하세요]

공무원 문서처럼 딱딱하게 답하지 말고
일반인이 이해하기 쉬운 말로 설명하세요.

예:

"1종보통을 가지고 계시다면 처음 면허를 따는 것이 아니기 때문에
응시전 교통안전교육은 다시 받지 않으셔도 됩니다."

처럼 설명하세요.

[6. 중요한 구분]

'응시전 교통안전교육',
'특별교통안전교육',
'고령운전자 교통안전교육'을 혼동하지 마세요.

각 교육의 대상과 목적을 업무자료에 따라 구분하세요.

[7. 고령운전자 질문]

만75세 이상 적성검사 질문에서는
단순히 "고령운전자 교육을 받으세요"라고만 답하지 말고
업무자료에 있는 치매검사 → 고령운전자 의무교육 →
시험장/경찰서 또는 온라인 적성검사 신청 등의 절차를
함께 설명하세요.

[8. 답변 형식]

가능하면 다음처럼 작성하세요.

핵심:
○○입니다.

절차:
1. ...
2. ...
3. ...

준비물:
- ...
- ...

수수료:
- ...

참고:
- ...

질문에 따라 필요한 항목만 사용하세요.

[9. 절대 하지 말아야 할 것]

- 업무자료에 없는 내용을 사실처럼 말하지 마세요.
- 존재하지 않는 절차를 만들지 마세요.
- 면제되지 않는 시험을 면제라고 하지 마세요.
- 사용자가 묻지 않은 내용을 과도하게 장황하게 설명하지 마세요.
- 답변을 "현재 답변을 처리하는 데 일시적인 문제가 발생했습니다."
라고 임의로 표시하지 마세요.

[업무자료 시작]

${knowledge}

[업무자료 끝]
`;

    // =====================================================
    // 4. Gemini 호출
    // =====================================================

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" +
        apiKey,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
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
                  text: message
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200
          }
        })
      }
    );

    // =====================================================
    // 5. Gemini 오류 처리
    // =====================================================

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API 오류:", data);

      return res.status(500).json({
        answer:
          "AI 답변 처리 중 오류가 발생했습니다. 잠시 후 다시 질문해주세요."
      });
    }

    // =====================================================
    // 6. 답변 추출
    // =====================================================

    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      console.error("Gemini 응답:", data);

      return res.status(500).json({
        answer:
          "질문에 대한 답변을 찾지 못했습니다. 질문을 조금 다르게 입력해 주세요."
      });
    }

    return res.status(200).json({
      answer: answer.trim()
    });

  } catch (error) {
    console.error("서버 오류:", error);

    return res.status(500).json({
      answer:
        "서버에서 답변을 처리하는 중 문제가 발생했습니다."
    });
  }
}
