"use strict";

const HTML_ESCAPE = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);
}

function safeHref(value) {
  const href = String(value || "").trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return "";
  if (/^(?:https?:\/\/|mailto:|#|\/(?!\/))/i.test(href)) return href;
  return "";
}

function isEscaped(text, index) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function findClosing(text, marker, start) {
  let index = start;
  while ((index = text.indexOf(marker, index)) !== -1) {
    if (!isEscaped(text, index) && (marker.length > 1 || text[index + 1] !== marker)) return index;
    index += marker.length;
  }
  return -1;
}

function findUnescaped(text, char, start) {
  let index = start;
  while ((index = text.indexOf(char, index)) !== -1) {
    if (!isEscaped(text, index)) return index;
    index++;
  }
  return -1;
}

function validDelimited(value) {
  return value && !/^\s|\s$/.test(value);
}

function inlineMarkdown(source) {
  const text = String(source || "");
  let html = "";
  let plain = "";

  function flushPlain() {
    if (!plain) return;
    html += escapeHtml(plain);
    plain = "";
  }

  for (let i = 0; i < text.length; ) {
    const char = text[i];

    if (char === "\\" && /[\\`*_[\]~<>]/.test(text[i + 1] || "")) {
      plain += text[i + 1];
      i += 2;
      continue;
    }

    if (char === "\n") {
      flushPlain();
      html += "<br>";
      i++;
      continue;
    }

    if (char === "`") {
      let run = 1;
      while (text[i + run] === "`") run++;
      const marker = "`".repeat(run);
      const end = findClosing(text, marker, i + run);
      if (end !== -1) {
        flushPlain();
        html += `<code>${escapeHtml(text.slice(i + run, end).replace(/\n/g, " "))}</code>`;
        i = end + run;
        continue;
      }
    }

    const triple = text.slice(i, i + 3);
    if (triple === "***" || triple === "___") {
      const end = findClosing(text, triple, i + 3);
      const value = end === -1 ? "" : text.slice(i + 3, end);
      if (validDelimited(value)) {
        flushPlain();
        html += `<strong><em>${inlineMarkdown(value)}</em></strong>`;
        i = end + 3;
        continue;
      }
    }

    const pair = text.slice(i, i + 2);
    if (pair === "**" || pair === "__" || pair === "~~") {
      const end = findClosing(text, pair, i + 2);
      const value = end === -1 ? "" : text.slice(i + 2, end);
      if (validDelimited(value)) {
        flushPlain();
        const tag = pair === "~~" ? "del" : "strong";
        html += `<${tag}>${inlineMarkdown(value)}</${tag}>`;
        i = end + 2;
        continue;
      }
    }

    if (char === "*" || char === "_") {
      const previous = text[i - 1] || "";
      if (!(char === "_" && /[\w]/.test(previous))) {
        const end = findClosing(text, char, i + 1);
        const value = end === -1 ? "" : text.slice(i + 1, end);
        if (validDelimited(value)) {
          flushPlain();
          html += `<em>${inlineMarkdown(value)}</em>`;
          i = end + 1;
          continue;
        }
      }
    }

    if (char === "[") {
      const labelEnd = findUnescaped(text, "]", i + 1);
      if (labelEnd > i + 1 && text[labelEnd + 1] === "(") {
        const targetEnd = findUnescaped(text, ")", labelEnd + 2);
        if (targetEnd !== -1) {
          const href = safeHref(text.slice(labelEnd + 2, targetEnd));
          if (href) {
            flushPlain();
            const external = /^https?:\/\//i.test(href);
            const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
            html += `<a href="${escapeHtml(href)}"${attrs}>${inlineMarkdown(text.slice(i + 1, labelEnd))}</a>`;
            i = targetEnd + 1;
            continue;
          }
        }
      }
    }

    if (char === "<") {
      const end = findUnescaped(text, ">", i + 1);
      if (end !== -1) {
        const href = safeHref(text.slice(i + 1, end));
        if (href && !/\s/.test(href)) {
          flushPlain();
          const external = /^https?:\/\//i.test(href);
          const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
          html += `<a href="${escapeHtml(href)}"${attrs}>${escapeHtml(href)}</a>`;
          i = end + 1;
          continue;
        }
      }
    }

    plain += char;
    i++;
  }

  flushPlain();
  return html;
}

function fenceStart(line) {
  const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  return {
    char: match[1][0],
    length: match[1].length,
    language: (match[2].trim().split(/\s+/)[0] || "").replace(/[^a-z0-9+#._-]/gi, "").slice(0, 32),
  };
}

function fenceEnd(line, fence) {
  const pattern = new RegExp(`^\\s{0,3}${fence.char}{${fence.length},}\\s*$`);
  return pattern.test(line);
}

function listItem(line) {
  let match = /^\s{0,3}[-+*]\s+(.+)$/.exec(line);
  if (match) return { ordered: false, text: match[1] };
  match = /^\s{0,3}\d+[.)]\s+(.+)$/.exec(line);
  return match ? { ordered: true, text: match[1] } : null;
}

function isHorizontalRule(line) {
  return /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
}

function isBlockStart(line) {
  return (
    !!fenceStart(line) ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    !!listItem(line) ||
    isHorizontalRule(line)
  );
}

function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  let html = "";

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = fenceStart(line);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !fenceEnd(lines[i], fence)) code.push(lines[i++]);
      if (i < lines.length) i++;
      const language = fence.language ? ` class="language-${escapeHtml(fence.language)}"` : "";
      html += `<pre><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`;
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
      i++;
      continue;
    }

    if (isHorizontalRule(line)) {
      html += "<hr>";
      i++;
      continue;
    }

    const quote = /^\s{0,3}>\s?(.*)$/.exec(line);
    if (quote) {
      const quoted = [];
      while (i < lines.length) {
        const next = /^\s{0,3}>\s?(.*)$/.exec(lines[i]);
        if (!next) break;
        quoted.push(next[1]);
        i++;
      }
      html += `<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`;
      continue;
    }

    const firstItem = listItem(line);
    if (firstItem) {
      const items = [];
      const ordered = firstItem.ordered;
      while (i < lines.length) {
        const item = listItem(lines[i]);
        if (!item || item.ordered !== ordered) break;
        items.push(item.text);
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      html += `<${tag}>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${tag}>`;
      continue;
    }

    const paragraph = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++]);
    html += `<p>${inlineMarkdown(paragraph.join("\n"))}</p>`;
  }

  return html;
}

const markdownApi = { escapeHtml, inlineMarkdown, renderMarkdown, safeHref };
if (typeof module === "object" && module.exports) module.exports = markdownApi;
if (typeof document === "object") Object.assign(globalThis, markdownApi);
