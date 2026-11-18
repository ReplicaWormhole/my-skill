function installSelectionAction(dialog, onAsk) {
  const button = document.getElementById('ask-selection');
  const main = document.querySelector('main');
  const transcript = dialog.querySelector('#chat-history');
  const quote = dialog.querySelector('#chat-quote');
  const normalLabel = button.textContent;
  let passage;
  let frame;

  function elementAt(node) {
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  }

  function hide() {
    passage = undefined;
    button.hidden = true;
  }

  function selectionText(range, fallback) {
    const scope = elementAt(range.commonAncestorContainer);
    const enclosingMath = scope.closest('math');
    const formulas = enclosingMath ? [enclosingMath] :
      [...scope.querySelectorAll('math')].filter(math => range.intersectsNode(math));
    if (!formulas.length) return fallback;

    const fragment = range.cloneContents();
    const copies = [...fragment.querySelectorAll('math')];
    if (copies.length !== formulas.length) return fallback;
    copies.forEach((copy, index) => {
      const original = formulas[index];
      const annotation = original.querySelector('annotation[encoding="application/x-tex"]');
      const expression = original.querySelector('semantics')?.firstElementChild;
      if (annotation && expression) {
        const whole = document.createRange();
        whole.selectNodeContents(expression);
        if (range.compareBoundaryPoints(Range.START_TO_START, whole) <= 0 &&
            range.compareBoundaryPoints(Range.END_TO_END, whole) >= 0) {
          const tex = annotation.textContent.trim();
          if (original.getAttribute('display') === 'block') {
            const display = tex.startsWith('\\begin{') ? tex :
              `\\begin{equation*}\n${tex}\n\\end{equation*}`;
            copy.replaceWith(`\n${display}\n`);
          } else {
            copy.replaceWith(` $${tex}$ `);
          }
          return;
        }
      }
      copy.querySelectorAll('annotation').forEach(hidden => hidden.remove());
    });
    for (const block of fragment.querySelectorAll('p, li, br')) block.after('\n');
    return fragment.textContent.trim();
  }

  function update() {
    frame = undefined;
    const selection = window.getSelection();
    const visibleText = selection?.toString().trim();
    if (!visibleText || !selection.rangeCount) {
      // Keyboard users can tab to the action after making a selection.
      if (document.activeElement !== button) hide();
      return;
    }
    const range = selection.getRangeAt(0);
    const start = elementAt(range.startContainer);
    const end = elementAt(range.endContainer);
    const inside = container => container.contains(start) && container.contains(end);
    const inChat = dialog.open && (inside(transcript) || inside(quote));
    if (!inChat && (dialog.open || !inside(main))) {
      hide();
      return;
    }

    const text = selectionText(range, visibleText);
    const rects = [...range.getClientRects()].filter(rect => rect.width && rect.height);
    const rect = rects.find(rect => rect.bottom > 0 && rect.top < window.innerHeight);
    if (!rect) {
      hide();
      return;
    }
    const startMessage = start.closest('.chat-message');
    const endMessage = end.closest('.chat-message');
    const message = inChat && startMessage && startMessage === endMessage ? startMessage : null;
    const scope = inChat ? (inside(quote) ? quote : message ?? transcript) : main;
    passage = {
      location: inChat ? 'chat' : 'proof',
      node: inChat ? null : start.closest('details[id], #step-1')?.id || 'step-1',
      text,
      source: message?.dataset.speaker ?? (inChat ? 'chat' : 'proof'),
      message: message?.dataset.message ?? '',
      position: {
        ...passagePosition(scope, range, message ? [...transcript.children].indexOf(message) : null),
        scope: scope === quote ? 'quote' : inChat ? 'history' : 'proof',
      },
    };
    const host = inChat ? dialog : document.body;
    if (button.parentElement !== host) host.append(button);
    button.hidden = false;
    button.disabled = text.length > 16000;
    button.textContent = button.disabled ? 'Select a shorter passage' : normalLabel;

    const bounds = inChat ? dialog.getBoundingClientRect() : {left: 0, right: window.innerWidth};
    const width = button.offsetWidth;
    const height = button.offsetHeight;
    const left = Math.min(Math.max(rect.left, bounds.left + 8), bounds.right - width - 8);
    const above = rect.top - height - 6;
    const below = rect.bottom + 6;
    const top = above >= 4 ? above : Math.min(below, window.innerHeight - height - 4);
    button.style.left = `${left}px`;
    button.style.top = `${Math.max(top, 4)}px`;
  }

  function schedule() {
    if (frame === undefined) frame = requestAnimationFrame(update);
  }

  function ask() {
    if (!passage || button.disabled || button.hidden) return;
    const chosen = passage;
    hide();
    window.getSelection().removeAllRanges();
    onAsk(chosen);
  }

  document.addEventListener('selectionchange', schedule);
  document.addEventListener('scroll', schedule, {capture: true, passive: true});
  window.addEventListener('resize', schedule);
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.addEventListener('click', ask);
  document.addEventListener('keydown', event => {
    if (event.altKey && event.key === 'Enter' && !button.hidden && !button.disabled) {
      event.preventDefault();
      ask();
    }
  });
  return hide;
}
