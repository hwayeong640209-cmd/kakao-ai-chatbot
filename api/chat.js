export default async function handler(req, res) {
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

if (req.method === "OPTIONS") {
return res.status(200).end();
}

if (req.method !== "POST") {
return res.status(405).json({
answer: "POST 요청만 가능합니다."
});
}

try {
const { message } = req.body || {};

```
if (!message || !message.trim()) {
  return res.status(400).json({
    answer: "질문을 입력해주세요."
  });
}

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY가 없습니다.");

  return res.status(500).json({
    answer: "GEMINI_API_KEY가 Vercel에 설정되지 않았습니다."
  });
}

const url =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

const response = await fetch(url, {
  method: "POST",

  headers: {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey
  },

  body: JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: message.trim()
          }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 1000
    }
  })
});

const responseText = await response.text();

console.log("Gemini HTTP 상태:", response.status);
console.log("Gemini 원본 응답:", responseText);

let data;

try {
  data = JSON.parse(responseText);
} catch (parseError) {
  console.error("Gemini 응답 JSON 파싱 실패:", responseText);

  return res.status(500).json({
    answer: "Gemini가 정상적인 JSON 응답을 보내지 않았습니다.",
    error: responseText
  });
}

if (!response.ok) {
  console.error("Gemini API 오류:", data);

  return res.status(500).json({
    answer: "Gemini API 오류가 발생했습니다.",
    error: data?.error?.message || "알 수 없는 오류",
    status: response.status
  });
}

const answer =
  data?.candidates?.[0]?.content?.parts?.[0]?.text;

if (!answer) {
  console.error("Gemini 답변 없음:", data);

  return res.status(500).json({
    answer: "Gemini에서 답변을 받지 못했습니다.",
    error: JSON.stringify(data)
  });
}

return res.status(200).json({
  answer: answer.trim()
});
```

} catch (error) {
console.error("서버 오류:", error);

```
return res.status(500).json({
  answer: "서버에서 오류가 발생했습니다.",
  error: error?.message || "알 수 없는 서버 오류"
});
```

}
}
