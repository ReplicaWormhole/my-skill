function passagePosition(scope, range, message = null) {
  const before = document.createRange();
  before.selectNodeContents(scope);
  before.setEnd(range.startContainer, range.startOffset);
  return {start: before.toString().length, text: range.toString(), message};
}

function locatePassage(scope, position, quote) {
  if (!scope) return null;
  const text = scope.textContent;
  let start = position?.start;
  let length = position?.text?.length;
  if (!length || text.slice(start, start + length) !== position.text) {
    // Old chats only saved their quoted text. Prefer a unique match in their source.
    const formula = [...scope.querySelectorAll('math')].filter(math =>
      math.querySelector('annotation')?.textContent.trim() === quote.trim());
    if (formula.length === 1) {
      const range = document.createRange();
      range.selectNode(formula[0]);
      return range;
    }
    const spans = Array.from(text.matchAll(/\s+|[^\s]/g));
    const normalized = spans.map(match => /\s/.test(match[0][0]) ? ' ' : match[0]).join('');
    const query = quote.trim().replace(/\s+/g, ' ');
    const offset = normalized.indexOf(query);
    if (!query || offset < 0 || normalized.indexOf(query, offset + 1) >= 0) return null;
    start = spans[offset].index;
    const last = spans[offset + query.length - 1];
    length = last.index + last[0].length - start;
  }

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let first;
  let firstOffset;
  for (let node; (node = walker.nextNode());) {
    const next = offset + node.length;
    if (!first && start < next) {
      first = node;
      firstOffset = start - offset;
    }
    if (first && start + length <= next) {
      const range = document.createRange();
      range.setStart(first, firstOffset);
      range.setEnd(node, start + length - offset);
      return range;
    }
    offset = next;
  }
  return null;
}

function paintPassages(name, ranges) {
  if (globalThis.Highlight && CSS.highlights) {
    CSS.highlights.set(name, new Highlight(...ranges.filter(Boolean)));
  }
}

function markDiscussions(name, items, locate) {
  if (!globalThis.Highlight || !CSS.highlights) return [];
  // Prefer the most specific passage when highlights overlap. The newest wins a tie.
  const marks = [...items].reverse().map(item => ({item, range: locate(item)}))
    .filter(mark => mark.range)
    .sort((a, b) => a.item.text.length - b.item.text.length);
  paintPassages(name, marks.map(mark => mark.range));
  return marks;
}

function discussionAt(target, x, y, marks) {
  if (target.closest('button, input, textarea, select, [contenteditable]')) return null;
  return marks.find(({range}) => range.intersectsNode(target) &&
    [...range.getClientRects()].some(rect =>
      x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
    ))?.item;
}

function scrollToPassage(range, scrollArea) {
  for (const end of [range.startContainer, range.endContainer]) {
    for (let node = end.parentElement; node; node = node.parentElement) {
      if (node.matches('details')) node.open = true;
    }
  }
  const rect = [...range.getClientRects()].find(part => part.width && part.height);
  if (!rect) return false;
  if (scrollArea) {
    scrollArea.scrollTop += rect.top - scrollArea.getBoundingClientRect().top - 20;
  } else {
    window.scrollBy({top: rect.top - window.innerHeight * .3});
  }
  paintPassages('focused-passage', [range]);
  return true;
}
