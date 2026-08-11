```javascript
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ======================================================
// 설정
// ======================================================

const MODEL = "gemini-3.6-flash";

// 챗봇의 유일한 업무자료
const DATA_FILE = path.join(
  process.cwd(),
  "data",
  "챗봇22.txt"
);

// ======================================================
// 업무자료 읽기
// ======================================================

function loadKnowledge() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      throw new Error(
        `업무자료 파일을 찾을 수 없습니다: ${DATA_FILE}`
      );
    }

    return fs.readFileSync(DATA_FILE, "utf8");
  } catch (error) {
    console.error("업무자료 읽기 오류:", error);
    throw error;
  }
}

// ======================================================
// API
// ======================================================

export default async function handler(req, res) {
  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 사용할 수 있습니다.",
    });
  }

  try {
    // --------------------------------------------------
    // 사용자 질문 확인
    // --------------------------------------------------

    const userMessage =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (!userMessage) {
      return res.status(400).json({
        error: "질문을 입력해주세요.",
      });
    }

    // --------------------------------------------------
    // 업무자료 불러오기
    // --------------------------------------------------

    const knowledge = loadKnowledge();

    if (!knowledge.trim()) {
      return res.status(500).json({
        error: "챗봇 업무자료가 비어 있습니다.",
      });
    }

    // --------------------------------------------------
    // 시스템 지침
    // --------------------------------------------------

    const systemInstruction = `
너는 "한국도로교통공단 전남운전면허시험장 업무 안내 챗봇"이다.

가장 중요한 원칙은 다음과 같다.

[1. 답변의 근거]
사용자가 질문하면 반드시 아래에 제공된
"챗봇22.txt" 업무자료를 최우선이자 유일한 근거로 사용한다.

[2. 자료에 없는 내용 금지]
챗봇22.txt에 없는 내용을 일반적인 상식이나 인터넷 지식으로
추가해서 답변하지 않는다.

자료에 답이 없거나 충분하지 않다면 다음과 같이 답변한다.

"제공된 업무자료에서 해당 내용을 확인하기 어렵습니다."

필요한 경우:
"정확한 안내를 위해 전남운전면허시험장에 확인해 주세요."
라고 안내할 수 있다.

[3. 숫자와 수수료]
자료에 있는 숫자, 시간, 수수료, 면제 조건, 연령 기준,
사진 장수, 사진 규격 등을 임의로 바꾸거나 추측하지 않는다.

특히 사용자가 질문한 내용과 관련된 숫자는
반드시 챗봇22.txt의 내용을 기준으로 답변한다.

[4. 자료 내용의 충돌]
챗봇22.txt 안에서 서로 다른 내용이 발견되면
임의로 판단하여 새로운 기준을 만들지 않는다.

가능하면 질문과 가장 직접적으로 관련된 내용을 우선하고,
명확하지 않다면 자료상 확인이 어렵다고 안내한다.

[5. 질문 의도]
사용자의 질문을 자연스럽게 이해하되,
자료에 없는 정보를 추론하여 만들어내지 않는다.

예:
"전남시험장 몇 시에 열어?"
→ 자료에 있는 업무시간을 기준으로 답변한다.

"처음으로 운전면허 따려고 하는데 순서가 어떻게 돼?"
→ 자료에 있는 취득 절차를 기준으로 답변한다.

[6. 답변 방식]
답변은 한국어로 한다.

불필요하게 길게 설명하지 않는다.
질문에 직접 필요한 내용부터 알려준다.

필요하면 다음과 같이 보기 쉽게 정리한다.

- 대상
- 준비물
- 절차
- 수수료
- 주의사항

[7. 링크]
업무자료에 명시된 링크가 있다면 자료에 있는 링크를 사용한다.
자료에 없는 링크를 임의로 만들어내지 않는다.

[8. 음식점, 날씨, 주변 맛집 등]
챗봇의 업무자료와 관계없는 질문은
자료에 근거가 없으므로 다음과 같이 답한다.

"제공된 업무자료에서 해당 내용을 확인하기 어렵습니다."

[9. 인사말]
"안녕", "안녕하세요" 등의 인사에는 자연스럽게 응답할 수 있다.

예:
"안녕하세요! 한국도로교통공단 전남운전면허시험장
업무 안내 챗봇입니다. 운전면허와 관련하여 궁금하신
업무를 말씀해 주세요."

[10. 절대 하지 말아야 할 것]
- 자료에 없는 수수료를 만들어내지 않는다.
- 자료에 없는 시험 면제를 만들어내지 않는다.
- 자료에 없는 업무시간을 만들어내지 않는다.
- 자료에 없는 법률 정보를 추가하지 않는다.
- 인터넷 검색을 한 것처럼 말하지 않는다.
- 자료에 없는 내용을 확정적으로 말하지 않는다.
- "아마", "보통", "일반적으로" 등의 추측으로 자료의 빈칸을 채우지 않는다.

==================================================
아래부터가 유일한 업무자료이다.
==================================================

${knowledge}

==================================================
업무자료 끝
==================================================
`;

    // --------------------------------------------------
    // Gemini Interactions API 호출
    // --------------------------------------------------

    const interaction = await ai.interactions.create({
      model: MODEL,
      input: userMessage,
      system_instruction: systemInstruction,
      generation_config: {
        thinking_level: "low",
      },
    });

    // --------------------------------------------------
    // 응답 추출
    // --------------------------------------------------

    let answer = "";

    // SDK에서 제공하는 output_text 우선 사용
    if (
      typeof interaction.output_text === "string" &&
      interaction.output_text.trim()
    ) {
      answer = interaction.output_text.trim();
    }

    // 혹시 output_text가 없는 경우 steps에서 추출
    if (!answer && Array.isArray(interaction.steps)) {
      const texts = [];

      for (const step of interaction.steps) {
        if (
          step?.type === "model_output" &&
          Array.isArray(step.content)
        ) {
          for (const block of step.content) {
            if (
              block?.type === "text" &&
              typeof block.text === "string"
            ) {
              texts.push(block.text);
            }
          }
        }
      }

      answer = texts.join("\n").trim();
    }

    if (!answer) {
      throw new Error("Gemini에서 답변을 받지 못했습니다.");
    }

    // --------------------------------------------------
    // 정상 응답
    // --------------------------------------------------

    return res.status(200).json({
      answer,
    });

  } catch (error) {
    console.error("챗봇 API 오류:", error);

    // 프론트엔드에서 JSON으로 안전하게 받을 수 있도록
    // 항상 JSON 형태로 오류를 반환한다.
    return res.status(500).json({
      error:
        error?.message ||
        "서버에서 오류가 발생했습니다.",
    });
  }
}
```
