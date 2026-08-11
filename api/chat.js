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

    if (!message || !message.trim()) {
      return res.status(400).json({
        answer: "질문을 입력해주세요."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY 없음");

      return res.status(500).json({
        answer: "GEMINI_API_KEY가 설정되지 않았습니다."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" +
        apiKey,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
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
            maxOutputTokens: 1000
          }
        })
      }
    );

    const data = await response.json();

    console.log("Gemini status:", response.status);
    console.log("Gemini response:", JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({
        answer:
          "Gemini API 오류가 발생했습니다. Vercel 로그를 확인해주세요.",
        detail: data
      });
    }

    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      return res.status(500).json({
        answer: "Gemini에서 답변을 받지 못했습니다.",
        detail: data
      });
    }

    return res.status(200).json({
      answer: answer.trim()
    });

  } catch (error) {
    console.error("서버 오류:", error);

    return res.status(500).json({
      answer: "서버 오류가 발생했습니다.",
      detail: error.message
    });
  }
}
