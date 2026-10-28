
(() => {
  if (window.__universalQuizSelectionInstalled) return;
  window.__universalQuizSelectionInstalled = true;

  let overlay = null;
  let box = null;
  let startX = 0;
  let startY = 0;
  let selecting = false;
  let scannedControls = [];

  const normalize = (text) =>
    String(text || "").replace(/\s+/g, " ").trim();

  function isVisible(el) {
    if (!(el instanceof Element)) return false;

    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      r.width > 0 &&
      r.height > 0
    );
  }

  function intersectsElement(el, rect) {
    const r = el.getBoundingClientRect();

    return (
      r.right > rect.left &&
      r.left < rect.right &&
      r.bottom > rect.top &&
      r.top < rect.bottom
    );
  }

  function getControlText(input) {
    if (input.labels && input.labels.length) {
      const text = [...input.labels]
        .map(label => label.innerText || label.textContent || "")
        .join(" ");

      if (normalize(text)) return normalize(text);
    }

    const label = input.closest("label");
    if (label) {
      const text = normalize(label.innerText || label.textContent);
      if (text) return text;
    }

    const answerRow = input.closest(
      ".answer, .r0, .r1, li, [role='radio'], [role='checkbox']"
    );

    if (answerRow) {
      const text = normalize(answerRow.innerText || answerRow.textContent);
      if (text) return text;
    }

    const parent = input.parentElement;
    if (parent) {
      const text = normalize(parent.innerText || parent.textContent);
      if (text) return text;
    }

    return normalize(
      input.getAttribute("aria-label") ||
      input.value ||
      ""
    );
  }

  function startSelection() {
    overlay?.remove();

    overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.04)";

    box = document.createElement("div");
    box.style.cssText =
      "position:fixed;border:2px solid #d9ff00;background:rgba(217,255,0,.12);display:none;pointer-events:none;box-sizing:border-box";

    overlay.appendChild(box);
    document.documentElement.appendChild(overlay);

    overlay.addEventListener("mousedown", onDown);
    overlay.addEventListener("mousemove", onMove);
    overlay.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKey, true);
  }

  function onDown(event) {
    if (event.button !== 0) return;

    event.preventDefault();
    selecting = true;
    startX = event.clientX;
    startY = event.clientY;

    box.style.display = "block";
    updateBox(event.clientX, event.clientY);
  }

  function updateBox(x, y) {
    box.style.left = Math.min(startX, x) + "px";
    box.style.top = Math.min(startY, y) + "px";
    box.style.width = Math.abs(x - startX) + "px";
    box.style.height = Math.abs(y - startY) + "px";
  }

  function onMove(event) {
    if (selecting) updateBox(event.clientX, event.clientY);
  }

  function collectTextNodes(rect) {
    const results = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    let node;

    while ((node = walker.nextNode())) {
      const text = normalize(node.nodeValue);
      if (!text) continue;

      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) continue;

      if (
        parent.closest(
          "script, style, noscript, textarea, select, option, " +
          "input, button, [contenteditable='true']"
        )
      ) {
        continue;
      }

      const range = document.createRange();
      range.selectNodeContents(node);

      const rects = [...range.getClientRects()];
      range.detach();

      const matchingRect = rects.find(r =>
        r.width > 0 &&
        r.height > 0 &&
        r.right > rect.left &&
        r.left < rect.right &&
        r.bottom > rect.top &&
        r.top < rect.bottom
      );

      if (matchingRect) {
        results.push({
          text,
          top: matchingRect.top,
          left: matchingRect.left
        });
      }
    }

    return results;
  }

  function cleanCollectedLines(collected) {
    collected.sort((a, b) => {
      if (Math.abs(a.top - b.top) > 5) {
        return a.top - b.top;
      }
      return a.left - b.left;
    });

    const seen = new Set();
    const lines = [];

    for (const item of collected) {
      const text = normalize(item.text);
      if (!text || seen.has(text)) continue;

      seen.add(text);
      lines.push(text);
    }

    return lines;
  }

  function onUp(event) {
    if (!selecting) return;
    selecting = false;

    const rect = {
      left: Math.min(startX, event.clientX),
      top: Math.min(startY, event.clientY),
      right: Math.max(startX, event.clientX),
      bottom: Math.max(startY, event.clientY)
    };

    overlay?.remove();
    overlay = null;
    document.removeEventListener("keydown", onKey, true);

    const collected = collectTextNodes(rect);

    const controls = [
      ...document.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], ' +
        '[role="radio"], [role="checkbox"]'
      )
    ].filter(el => {
      if (!isVisible(el)) return false;

      const label = el.closest("label");
      const row = el.closest(".answer, .r0, .r1, li");

      return (
        intersectsElement(el, rect) ||
        (label && intersectsElement(label, rect)) ||
        (row && intersectsElement(row, rect))
      );
    });

    scannedControls = controls.map((el, index) => ({
      el,
      index,
      text: getControlText(el),
      group: el.name || el.getAttribute("name") || ""
    }));

    for (const item of scannedControls) {
      if (!item.text) continue;

      const label = item.el.closest("label");
      const row = item.el.closest(".answer, .r0, .r1, li");
      const source = label || row || item.el;
      const r = source.getBoundingClientRect();

      collected.push({
        text: item.text,
        top: r.top,
        left: r.left
      });
    }

    const lines = cleanCollectedLines(collected);
    const savedText = lines.join("\n").trim();

    if (!savedText) {
      alert("Question aur tamam options ko rectangle ke andar select karo.");
      return;
    }

    chrome.storage.local.set(
      { scannedQuizText: savedText },
      () => {
        alert("Scan complete!\n\nDetected text:\n\n" + savedText);
      }
    );
  }

  function onKey(event) {
    if (event.key === "Escape") {
      overlay?.remove();
      overlay = null;
      selecting = false;
      document.removeEventListener("keydown", onKey, true);
    }
  }

  function extractLabel(answer) {
    const text = String(answer || "").trim();

    const match = text.match(
      /\b(?:correct\s+option|correct\s+answer|option|answer)\s*(?:is\s*)?(?:[:=-]\s*)?[\(\[]?\s*([A-D]|[1-4])\s*[\)\]]?/i
    );

    if (match) {
      const value = match[1].toUpperCase();

      return /^[1-4]$/.test(value)
        ? "ABCD"[Number(value) - 1]
        : value;
    }

    const startMatch = text.match(
      /^\s*[\(\[]?\s*([A-D]|[1-4])\s*[\)\]]?\s*[.):\s-]/i
    );

    if (startMatch) {
      const value = startMatch[1].toUpperCase();

      return /^[1-4]$/.test(value)
        ? "ABCD"[Number(value) - 1]
        : value;
    }

    return null;
  }

  function selectAnswer(answer) {
    const value = String(answer || "").trim();

    if (!value) {
      return { ok: false, reason: "Answer empty hai." };
    }

    const wantedLabel = extractLabel(value);
    let target = null;

    if (wantedLabel) {
      target = scannedControls.find(item => {
        const match = normalize(item.text).match(
          /^\s*[\(\[]?\s*([A-D]|[1-4])\s*[\)\]]?\s*[.):\s-]/i
        );

        if (!match) return false;

        const raw = match[1].toUpperCase();
        const found = /^[1-4]$/.test(raw)
          ? "ABCD"[Number(raw) - 1]
          : raw;

        return found === wantedLabel;
      });
    }

    if (!target) {
      const answerText = normalize(value).toLowerCase();

      target = scannedControls.find(item => {
        const controlText = normalize(item.text).toLowerCase();

        return (
          controlText &&
          (
            answerText.includes(controlText) ||
            controlText.includes(answerText)
          )
        );
      });
    }

    if (!target) {
      return {
        ok: false,
        reason:
          "Matching radio/checkbox nahi mila. Question aur options dobara scan karo."
      };
    }

    target.el.click();

    return {
      ok: true,
      selected: target.text || wantedLabel
    };
  }

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (message.action === "START_SELECTION") {
        startSelection();
        sendResponse({ ok: true });
        return;
      }

      if (message.action === "SELECT_ANSWER") {
        sendResponse(selectAnswer(message.answer));
      }
    }
  );
})();
