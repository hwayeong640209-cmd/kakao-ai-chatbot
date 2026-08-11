import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
apiKey: process.env.GEMINI_API_KEY,
});

export default async function handler(req, res) {
// CORS
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

// OPTIONS
if (req.method === "OPTIONS") {
return res.status(200).end();
}

// POST만 허용
if (req.method !== "POST") {
return res.status(405).json({
answer: "POST 요청만 허용됩니다.",
});
}

try {
const { message } = req.body || {};

```
// 질문 확인
if (!message || typeof message !== "string" || !message.trim()) {
  return res.status(400).json({
    answer: "메시지를 입력해주세요.",
  });
}

// Gemini Interactions API
const interaction = await ai.interactions.create({
  model: "gemini-3.5-flash",
  input: message.trim(),
});

console.log("Gemini interaction:", interaction);

const answer = interaction.output_text;

if (!answer) {
  return res.status(500).json({
    answer: "Gemini에서 답변을 받지 못했습니다.",
  });
}

return res.status(200).json({
  answer: answer.trim(),
});
```

} catch (error) {
console.error("Gemini API Error:", error);

```
return res.status(500).json({
  answer: "Gemini API 호출 중 오류가 발생했습니다.",
  error: error?.message || String(error),
});
```

}
}
