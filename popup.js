
const scanBtn = document.getElementById("scanBtn");
const answerBtn = document.getElementById("answerBtn");
const statusText = document.getElementById("status");
const scannedTextBox = document.getElementById("scannedText");
const answerBox = document.getElementById("answerBox");

const API_URL =
  "https://universal-quiz-ai-backend--kafaitahmad05.replit.app/api/suggest";

async function loadScannedText() {
  const result = await chrome.storage.local.get("scannedQuizText");
  scannedTextBox.textContent =
    result.scannedQuizText || "No text scanned yet.";
}

loadScannedText();

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  statusText.textContent = "Starting selection mode...";

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) throw new Error("Active tab nahi mila.");

    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "START_SELECTION"
      });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });

      await chrome.tabs.sendMessage(tab.id, {
        action: "START_SELECTION"
      });
    }

    window.close();
  } catch (error) {
    statusText.textContent = "Error: " + error.message;
    scanBtn.disabled = false;
  }
});

function cleanPageText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/Question\s+\d+\s+of\s+\d+/gi, " ")
    .replace(
      /\b(Previous|Next|Finish practice|Flag for review|Show answer)\b/gi,
      " "
    )
    .replace(/[☆★⚑]/g, " ")
    .trim();
}

function parseQuestionAndOptions(rawText) {
  const original = String(rawText || "").trim();

  if (!original) {
    throw new Error("Pehle quiz area scan karein.");
  }

  const lines = original
    .split(/\r?\n/)
    .map(line => cleanPageText(line))
    .filter(Boolean);

  const text = cleanPageText(original)
    .replace(/\s+/g, " ")
    .trim();

  const labels = ["A", "B", "C", "D", "E"];

  function makeResult(question, options) {
    const cleanedQuestion = String(question || "")
      .replace(/^Q(?:uestion)?\s*\d+\s*[:.)-]?\s*/i, "")
      .trim();

    return {
      question: cleanedQuestion ||
        "Choose the correct answer from these options.",
      options
    };
  }

  // Same-line True/False
  let match = text.match(
    /^(.+?)\s+A[.)]?\s*(True|False)\s+B[.)]?\s*(True|False)\s*$/i
  );

  if (match) {
    return makeResult(match[1], [
      { label: "A", text: match[2].trim() },
      { label: "B", text: match[3].trim() }
    ]);
  }

  // Same-line A. option B. option C. option D. option
  match = text.match(
    /^(.+?)\s+A[.)]\s*(.+?)\s+B[.)]\s*(.+?)\s+C[.)]\s*(.+?)\s+D[.)]\s*(.+)$/i
  );

  if (match) {
    return makeResult(match[1], [
      { label: "A", text: match[2].trim() },
      { label: "B", text: match[3].trim() },
      { label: "C", text: match[4].trim() },
      { label: "D", text: match[5].trim() }
    ]);
  }

  // Separate lines: A / 155 / B / 255 / C / 256 / D / 1515
  for (let start = 0; start < lines.length; start++) {
    const first = lines[start].match(/^([A-E])[.)]?$/i);

    if (!first || first[1].toUpperCase() !== "A") continue;

    const options = [];
    let index = start;

    while (index + 1 < lines.length && options.length < 5) {
      const labelMatch = lines[index].match(/^([A-E])[.)]?$/i);
      const expected = labels[options.length];

      if (!labelMatch || labelMatch[1].toUpperCase() !== expected) {
        break;
      }

      const optionText = lines[index + 1];

      if (!optionText || /^[A-E][.)]?$/i.test(optionText)) {
        break;
      }

      options.push({
        label: expected,
        text: optionText.trim()
      });

      index += 2;
    }

    if (options.length >= 2) {
      return makeResult(lines.slice(0, start).join(" "), options);
    }
  }

  // Separate numbered options: 1 / 155 / 2 / 255
  for (let start = 0; start < lines.length; start++) {
    if (!/^1[.)]?$/.test(lines[start])) continue;

    const options = [];
    let index = start;

    while (index + 1 < lines.length && options.length < 5) {
      const numberMatch = lines[index].match(/^([1-5])[.)]?$/);
      const expectedNumber = options.length + 1;

      if (!numberMatch || Number(numberMatch[1]) !== expectedNumber) {
        break;
      }

      const optionText = lines[index + 1];

      if (!optionText || /^[1-5][.)]?$/.test(optionText)) {
        break;
      }

      options.push({
        label: labels[options.length],
        text: optionText.trim()
      });

      index += 2;
    }

    if (options.length >= 2) {
      return makeResult(lines.slice(0, start).join(" "), options);
    }
  }

  // Separate lines: A. 155 / B. 255 / C. 256 / D. 1515
  for (let start = 0; start < lines.length; start++) {
    const options = [];
    let index = start;

    while (index < lines.length && options.length < 5) {
      const optionMatch = lines[index].match(
        /^([A-E])[.)]\s*(.+)$/i
      );

      const expected = labels[options.length];

      if (
        !optionMatch ||
        optionMatch[1].toUpperCase() !== expected
      ) {
        break;
      }

      options.push({
        label: expected,
        text: optionMatch[2].trim()
      });

      index++;
    }

    if (options.length >= 2) {
      return makeResult(lines.slice(0, start).join(" "), options);
    }
  }

  throw new Error(
    "Options detect nahi huay. Question aur tamam options scan karein."
  );
}

function getAnswerLabel(suggestion, options) {
  const text = String(suggestion || "").replace(/\*/g, "");

  const patterns = [
    /\bcorrect\s+option\s*(?:is\s*)?[:\-]?\s*\(?([A-E]|[1-5])\)?\b/i,
    /\bcorrect\s+answer\s*(?:is\s*)?[:\-]?\s*\(?([A-E]|[1-5])\)?\b/i,
    /\banswer\s*(?:is\s*)?[:\-]\s*\(?([A-E]|[1-5])\)?\b/i,
    /\boption\s*(?:is\s*)?[:\-]\s*\(?([A-E]|[1-5])\)?\b/i,
    /^\s*\(?([A-E]|[1-5])\)?[.)]?\s*$/i
  ];

  for (const pattern of patterns) {
    const result = text.match(pattern);
    if (!result) continue;

    const value = result[1].toUpperCase();
    const index = /^[1-5]$/.test(value)
      ? Number(value) - 1
      : value.charCodeAt(0) - 65;

    if (index >= 0 && index < options.length) {
      return options[index].label;
    }
  }

  return null;
}

answerBtn.addEventListener("click", async () => {
  answerBtn.disabled = true;
  answerBox.textContent = "AI is checking the question...";
  statusText.textContent = "Reading question and options...";

  try {
    const result = await chrome.storage.local.get("scannedQuizText");
    const rawText = (result.scannedQuizText || "").trim();

    if (!rawText) {
      throw new Error("Pehle quiz area scan karein.");
    }

    const parsed = parseQuestionAndOptions(rawText);

    scannedTextBox.textContent = [
      parsed.question,
      "",
      ...parsed.options.map(
        option => `${option.label}. ${option.text}`
      )
    ].join("\n");

    statusText.textContent = "Sending question to AI...";

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: parsed.question,
        options: parsed.options.map(
          option => `${option.label}. ${option.text}`
        )
      })
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Backend se valid JSON response nahi mila.");
    }

    if (!response.ok) {
      throw new Error(
        data.detail || "Backend error: " + response.status
      );
    }

    const suggestion = data.suggestion || "";
    answerBox.textContent =
      suggestion || "AI ne answer return nahi kiya.";

    const answerLabel = getAnswerLabel(suggestion, parsed.options);

    if (!answerLabel) {
      statusText.textContent =
        "AI response mila, lekin answer label identify nahi hua.";
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) {
      statusText.textContent =
        `AI answer ${answerLabel} mila, lekin active tab nahi mila.`;
      return;
    }

    try {
      const selection = await chrome.tabs.sendMessage(tab.id, {
        action: "SELECT_ANSWER",
        answer: answerLabel
      });

      statusText.textContent = selection?.ok
        ? `AI answer mila; option ${answerLabel} select ho gaya.`
        : `AI answer ${answerLabel} mila, lekin auto-select nahi hua. ${
            selection?.reason || ""
          }`;
    } catch {
      statusText.textContent =
        `AI answer ${answerLabel} mila; auto-selection available nahi hui.`;
    }
  } catch (error) {
    answerBox.textContent = "Error: " + error.message;
    statusText.textContent = "AI answer nahi mil saka.";
  } finally {
    answerBtn.disabled = false;
  }
});
