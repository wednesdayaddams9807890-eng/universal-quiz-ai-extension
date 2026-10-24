
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

    if (!tab?.id) {
      throw new Error("Active tab nahi mila.");
    }

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
  return text
    .replace(/\r/g, "\n")
    .replace(
      /TestUstad\s+Exams\s+Subjects\s+Quizzes\s+Games\s+Guides\s+Pricing\s+Log in\s+Sign up/gi,
      " "
    )
    .replace(
      /Question\s+\d+\s+of\s+\d+\s*[·•]?\s*\d*\s*answered\s*[\d:]*/gi,
      " "
    )
    .replace(
      /\b(Previous|Next|Finish practice|Flag for review)\b/gi,
      " "
    )
    .replace(/[☆★⚑]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parseQuestionAndOptions(rawText) {
  const text = cleanPageText(rawText);

  // Supports: A O(1), A. O(1), and A) O(1)
  const regex = /(?:^|\s)([A-D])(?:[.)])?\s+/gi;
  const candidates = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const leadingSpace = match[0].match(/^\s*/)[0].length;
    const start = match.index + leadingSpace;

    candidates.push({
      label: match[1].toUpperCase(),
      start,
      endOfLabel: regex.lastIndex
    });
  }

  let sequence = null;

  // Find four consecutive labels in A, B, C, D order.
  for (let i = 0; i <= candidates.length - 4; i++) {
    const group = candidates.slice(i, i + 4);

    if (group.map(item => item.label).join("") !== "ABCD") {
      continue;
    }

    const options = group.map((item, index) => {
      const next = group[index + 1];
      const end = next ? next.start : text.length;

      let optionText = text
        .slice(item.endOfLabel, end)
        .trim();

      optionText = optionText
        .replace(/\s*(?:☆|★|⚑).*$/s, "")
        .replace(
          /\s+(?:Previous|Next|Finish practice)\b.*$/i,
          ""
        )
        .trim();

      return {
        label: item.label,
        text: optionText
      };
    });

    if (options.every(option => option.text.length > 0)) {
      sequence = { group, options };
      break;
    }
  }

  if (!sequence) {
    throw new Error(
      "A-D options detect nahi huay. Question aur tamam options ko ek rectangle mein select karein."
    );
  }

  let question = text
    .slice(0, sequence.group[0].start)
    .trim();

  question = question
    .replace(/^\s*[\d:·•]+\s*/, "")
    .replace(/^\s*answered\s*/i, "")
    .trim();

  if (!question) {
    throw new Error(
      "Question text detect nahi hua. Dobara scan karein."
    );
  }

  return {
    question,
    options: sequence.options
  };
}

answerBtn.addEventListener("click", async () => {
  answerBtn.disabled = true;
  answerBox.textContent = "AI is checking the question...";
  statusText.textContent = "Reading question and options...";

  try {
    const result = await chrome.storage.local.get(
      "scannedQuizText"
    );

    const rawText = (result.scannedQuizText || "").trim();

    if (!rawText) {
      throw new Error("Pehle quiz area scan karein.");
    }

    const parsed = parseQuestionAndOptions(rawText);

    const formattedText = [
      parsed.question,
      "",
      ...parsed.options.map(
        option => `${option.label}. ${option.text}`
      )
    ].join("\n");

    scannedTextBox.textContent = formattedText;
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || "Backend error: " + response.status
      );
    }

    answerBox.textContent =
      data.suggestion || "AI ne answer return nahi kiya.";

    statusText.textContent = "AI response received.";
  } catch (error) {
    answerBox.textContent = "Error: " + error.message;
    statusText.textContent = "AI answer nahi mil saka.";
  } finally {
    answerBtn.disabled = false;
  }
});
