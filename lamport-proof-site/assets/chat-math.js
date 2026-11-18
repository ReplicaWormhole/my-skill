function setupChatMath(served) {
  const cache = new Map();
  const requests = new WeakMap();
  const htmlTags = new Set('p br strong em b i code pre blockquote ol ul li dl dt dd h1 h2 h3 h4 span div table thead tbody tr th td sub sup'.split(' '));
  const mathTags = new Set('math semantics annotation mrow mi mo mn ms mtext mspace mstyle mfrac msqrt mroot msup msub msubsup munderover munder mover mtable mtr mtd menclose mphantom mpadded mfenced mmultiscripts mprescripts none'.split(' '));
  const mathAttributes = new Set('display encoding mathvariant mathsize stretchy symmetric form fence separator largeop movablelimits accent accentunder columnalign rowalign columnspacing rowspacing width height depth linethickness lspace rspace notation scriptlevel displaystyle'.split(' '));
  const mathNamespace = 'http://www.w3.org/1998/Math/MathML';

  function copySafe(parent, child) {
    if (child.nodeType === Node.TEXT_NODE) {
      parent.append(child.textContent);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const isMath = child.namespaceURI === mathNamespace;
    const tag = child.localName;
    let target = parent;
    if ((isMath ? mathTags : htmlTags).has(tag)) {
      target = isMath ? document.createElementNS(mathNamespace, tag) : document.createElement(tag);
      if (isMath) {
        for (const attr of child.attributes) {
          if (mathAttributes.has(attr.name)) target.setAttribute(attr.name, attr.value);
        }
      }
      parent.append(target);
    }
    for (const nested of child.childNodes) copySafe(target, nested);
  }

  // Reuse math for reopened threads and avoid starting a process per message at once.
  let queue = Promise.resolve();
  function format(text) {
    if (!cache.has(text)) {
      queue = queue.then(async () => {
        const response = await fetch('/api/chat-math', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({text}),
        });
        if (!response.ok) return null;
        const {html} = await response.json();
        return typeof html === 'string' ? html : null;
      }).catch(() => null);
      cache.set(text, queue);
    }
    return cache.get(text);
  }

  return function renderMath(target, text, complete) {
    target.textContent = text;
    const request = {};
    requests.set(target, request);
    if (!served || !/\\[(\[]|\$|\\begin\{/.test(text)) return;
    format(text).then(html => {
      function apply() {
        if (!html || !target.isConnected || requests.get(target) !== request) return;
        const selection = window.getSelection();
        if (selection?.rangeCount && !selection.isCollapsed &&
            selection.getRangeAt(0).intersectsNode(target)) {
          document.addEventListener('selectionchange', apply, {once: true});
          return;
        }
        const template = document.createElement('template');
        template.innerHTML = html;
        const fragment = document.createDocumentFragment();
        for (const child of template.content.childNodes) copySafe(fragment, child);
        target.replaceChildren(fragment);
        complete();
      }
      apply();
    });
  };
}
