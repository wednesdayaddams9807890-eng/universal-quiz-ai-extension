
(() => {
  if (window.__universalQuizSelectionInstalled) return;
  window.__universalQuizSelectionInstalled = true;

  let overlay = null;
  let box = null;
  let startX = 0;
  let startY = 0;
  let selecting = false;

  function startSelection() {
    overlay?.remove();

    overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      cursor: crosshair;
      background: rgba(0,0,0,0.05);
    `;

    box = document.createElement("div");
    box.style.cssText = `
      position: fixed;
      border: 2px solid #d9ff00;
      background: rgba(217,255,0,0.12);
      display: none;
      pointer-events: none;
      box-sizing: border-box;
    `;

    overlay.appendChild(box);
    document.documentElement.appendChild(overlay);

    overlay.addEventListener("mousedown", onDown);
    overlay.addEventListener("mousemove", onMove);
    overlay.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKey, true);
  }

  function onDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();

    selecting = true;
    startX = e.clientX;
    startY = e.clientY;

    box.style.display = "block";
    updateBox(e.clientX, e.clientY);
  }

  function updateBox(x, y) {
    box.style.left = Math.min(startX, x) + "px";
    box.style.top = Math.min(startY, y) + "px";
    box.style.width = Math.abs(x - startX) + "px";
    box.style.height = Math.abs(y - startY) + "px";
  }

  function isVisible(el) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function overlapsRect(el, rect) {
    const r = el.getBoundingClientRect();

    return (
      r.right > rect.left &&
      r.left < rect.right &&
      r.bottom > rect.top &&
      r.top < rect.bottom
    );
  }

  function onMove(e) {
    if (selecting) updateBox(e.clientX, e.clientY);
  }

  function cleanLines(rawText) {
    return rawText
      .split(/\n+/)
      .map(line => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter(line => !/^(?:☆|★|⚑|flag for review)$/i.test(line))
      .filter(line => !/^(?:previous|next|finish practice|submit mcq|new set|home|faqs?|log in|sign up)$/i.test(line))
      .filter(line => !/^(?:\d+\s*){2,20}$/.test(line))
      .filter(line => !/^(?:[A-D][.)]?\s*){2,8}$/i.test(line))
      .filter(line => !/^question\s+\d+\s+of\s+\d+/i.test(line))
      .filter(line => !/^score\b/i.test(line));
  }

  function extractQuestion(rawText) {
    const lines = cleanLines(rawText);
    const text = lines.join("\n");

    const labelRegex = /(?:^|\s)([A-D])[.)]\s*/gi;
    const matches = [...text.matchAll(labelRegex)].map(m => {
      const labelPosition = m[0].search(/[A-D]/i);

      return {
        label: m[1].toUpperCase(),
        start: m.index + labelPosition,
        endOfLabel: m.index + m[0].length
      };
    });

    // Find A, B, C, D sequences that have real option text.
    for (let i = 0; i <= matches.length - 4; i++) {
      const group = matches.slice(i, i + 4);

      if (group.map(m => m.label).join("") !== "ABCD") {
        continue;
      }

      const options = group.map((current, j) => {
        const next = group[j + 1];
        const end = next ? next.start : text.length;

        return {
          label: current.label,
          text: text.slice(current.endOfLabel, end).trim()
        };
      });

      // Ignore empty labels such as:
      // A.
      // B.
      // C.
      // D.
      if (options.some(o => !o.text || /^[A-D](?:\s+[A-D])*\.?$/i.test(o.text))) {
        continue;
      }

      // If another A label follows D, stop D before that repeated block.
      const nextA = matches.find(m =>
        m.start > group[3].start && m.label === "A"
      );

      if (nextA) {
        options[3].text = text
          .slice(group[3].endOfLabel, nextA.start)
          .trim();
      }

      if (options.some(o => o.text.length < 2)) {
        continue;
      }

      const question = text.slice(0, group[0].start).trim();

      return {
        question: question.replace(/^\d+[.)]?\s*/, "").trim(),
        options
      };
    }

    // Fallback for options displayed on separate lines.
    const options = [];
    const questionLines = [];

    for (const line of lines) {
      const match = line.match(/^([A-D])[.)]\s*(.*)$/i);

      if (match && match[2].trim()) {
        options.push({
          label: match[1].toUpperCase(),
          text: match[2].trim()
        });
      } else if (!/^[A-D][.)]?\s*$/i.test(line)) {
        questionLines.push(line);
      }
    }

    return {
      question: questionLines.join("\n").trim(),
      options: options.filter(o => o.text)
    };
  }

  function onUp(e) {
    if (!selecting) return;
    selecting = false;

    const rect = {
      left: Math.min(startX, e.clientX),
      top: Math.min(startY, e.clientY),
      right: Math.max(startX, e.clientX),
      bottom: Math.max(startY, e.clientY)
    };

    overlay?.remove();
    overlay = null;
    document.removeEventListener("keydown", onKey, true);

    const elements = [...document.querySelectorAll("body *")]
      .filter(isVisible)
      .filter(el => overlapsRect(el, rect));

    const collected = [];

    for (const el of elements) {
      const raw = (el.innerText || "").trim();
      if (!raw) continue;

      const r = el.getBoundingClientRect();
      const centerX = r.left + r.width / 2;
      const centerY = r.top + r.height / 2;

      if (
        centerX < rect.left ||
        centerX > rect.right ||
        centerY < rect.top ||
        centerY > rect.bottom
      ) {
        continue;
      }

      if (el.children.length > 0 && raw.includes("\n")) continue;

      collected.push({
        top: r.top,
        left: r.left,
        text: raw
      });
    }

    collected.sort((a, b) => {
      if (Math.abs(a.top - b.top) > 5) return a.top - b.top;
      return a.left - b.left;
    });

    const unique = [];
    const seen = new Set();

    for (const item of collected) {
      for (const line of cleanLines(item.text)) {
        if (!seen.has(line)) {
          seen.add(line);
          unique.push(line);
        }
      }
    }

    const extracted = extractQuestion(unique.join("\n"));

    const validOptions = extracted.options.filter(option => {
      const optionText = (option.text || "").trim();
      return optionText.length >= 2 &&
        !/^[A-D](?:\s+[A-D])*\.?$/i.test(optionText);
    });

    const savedText = validOptions.length === 4
      ? [
          extracted.question,
          ...validOptions.map(o => `${o.label}. ${o.text}`)
        ].filter(Boolean).join("\n")
      : unique.join("\n");

    if (!savedText.trim()) {
      alert("Question nahi mila. Question aur tamam options ko rectangle ke andar select karein.");
      return;
    }

    chrome.storage.local.set({ scannedQuizText: savedText }, () => {
      alert("Scan complete!\n\nDetected text:\n\n" + savedText);
    });
  }

  function onKey(e) {
    if (e.key === "Escape") {
      overlay?.remove();
      overlay = null;
      selecting = false;
      document.removeEventListener("keydown", onKey, true);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "START_SELECTION") {
      startSelection();
      sendResponse({ ok: true });
    }
  });
})();
