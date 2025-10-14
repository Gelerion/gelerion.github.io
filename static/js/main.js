// Root-level override for code copy behavior and code link clicks

function enhanceCodeBlocks() {
  const highlights = document.querySelectorAll('.row div.highlight');
  const copyText = '📋';
  const copiedText = '✔️';

  highlights.forEach((highlight) => {
    // Prefer explicit code element; fallback to pre or highlight itself
    const codeBlock = highlight.querySelector('code[data-lang]')
      || highlight.querySelector('pre code')
      || highlight.querySelector('pre')
      || highlight;

    // Defensive: block anchor clicks inside code in case CSS is overridden elsewhere
    highlight.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, true);
    });

    // Get or create a copy button; replace existing to remove old handlers
    let copyButton = highlight.querySelector('.copyCodeButton');
    if (copyButton) {
      const replacement = copyButton.cloneNode(true); // drops listeners
      copyButton.replaceWith(replacement);
      copyButton = replacement;
    } else {
      copyButton = document.createElement('button');
      copyButton.innerHTML = copyText;
      copyButton.classList.add('copyCodeButton');
      highlight.appendChild(copyButton);
    }

    copyButton.addEventListener('click', () => {
      const codeClone = codeBlock.cloneNode(true);
      // Remove line number columns produced by Chroma (both classes)
      codeClone.querySelectorAll('.ln, .lnt').forEach(el => el.remove());
      // Also remove any table-based line numbering wrappers
      codeClone.querySelectorAll('.lntable').forEach(tbl => {
        if (tbl.querySelector('td')) {
          const tds = tbl.querySelectorAll('td');
          if (tds.length >= 2) {
            const codeCell = tds[tds.length - 1];
            tbl.replaceWith(codeCell);
          }
        }
      });

      const codeText = codeClone.textContent; // preserve formatting exactly

      navigator.clipboard.writeText(codeText)
        .then(() => {
          copyButton.textContent = copiedText;
          setTimeout(() => { copyButton.textContent = copyText; }, 1000);
        })
        .catch((err) => {
          alert('Failed to copy text');
          console.error('Copy error', err);
        });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceCodeBlocks);
} else {
  // DOM already loaded, run immediately
  enhanceCodeBlocks();
}
