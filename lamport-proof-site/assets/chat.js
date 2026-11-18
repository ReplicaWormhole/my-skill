(() => {
  const dialog = document.getElementById('proof-chat');
  const form = document.getElementById('chat-form');
  const history = document.getElementById('chat-history');
  const status = document.getElementById('chat-status');
  const question = document.getElementById('chat-question');
  const send = document.getElementById('chat-send');
  const offline = document.getElementById('chat-offline');
  const quote = document.getElementById('chat-quote');
  const branchList = document.getElementById('chat-branches');
  const branchSummary = branchList.querySelector('summary');
  const children = document.getElementById('chat-children');
  const archive = document.getElementById('chat-archive');
  const parentButton = document.getElementById('chat-parent');
  const sourceButton = document.getElementById('chat-source');
  const proof = document.querySelector('main');
  const browseButton = document.getElementById('chat-browse');
  const returnButton = document.getElementById('chat-return');
  const openArchiveButton = document.getElementById('open-selection-chats');
  const snapshot = document.getElementById('proof-chat-data').dataset.snapshot;
  const served = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.protocol === 'http:';
  const renderMath = setupChatMath(served);
  const threads = new Map();
  const treeKey = `proof-chat-selections:${snapshot}`;
  const selections = new Map(savedSelections().map(item => [item.id, item]));
  let active;
  let archiveOrigin;
  let opener;
  let sourceFocus;
  let proofMarks = [];
  let chatMarks = [];
  let hoveredPassage;

  function readSaved(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function savedSelections() {
    const saved = readSaved(treeKey);
    return Array.isArray(saved) ? saved.filter(item =>
      typeof item?.id === 'string' && item.id.startsWith('selection-') &&
      typeof item.node === 'string' && document.getElementById(item.node) &&
      typeof item.text === 'string' && typeof item.message === 'string'
    ) : [];
  }

  function saveSelections() {
    for (const item of savedSelections()) {
      if (!selections.has(item.id)) selections.set(item.id, item);
    }
    localStorage.setItem(treeKey, JSON.stringify([...selections.values()]));
  }

  function threadFor(id) {
    if (threads.has(id)) return threads.get(id);
    const selected = selections.get(id);
    const key = `proof-chat:${snapshot}:${id}`;
    const saved = readSaved(key);
    const exchanges = Array.isArray(saved) ? saved.filter(entry =>
      typeof entry?.question === 'string' && typeof entry?.answer === 'string'
    ) : [];
    const thread = {id, node: selected?.node ?? id, selected, key, exchanges, draft: '', pending: '', error: ''};
    threads.set(id, thread);
    return thread;
  }

  function proofPassage(item) {
    const scope = item.position?.scope === 'proof' ? proof : document.getElementById(item.node);
    return locatePassage(scope, item.position, item.text) ??
      (scope !== proof ? locatePassage(proof, null, item.text) : null);
  }

  function chatPassage(item) {
    const anchor = item.position;
    if (anchor?.scope === 'quote') return locatePassage(quote, anchor, item.text);
    if (Number.isInteger(anchor?.message)) {
      const source = history.children[anchor.message];
      if (source?.dataset.message === item.message) return locatePassage(source, anchor, item.text);
    }
    if (item.message) {
      const matching = [...history.children].filter(entry => entry.dataset.message === item.message);
      return matching.length === 1 ? locatePassage(matching[0], null, item.text) : null;
    }
    return locatePassage(history, anchor, item.text) ?? locatePassage(quote, null, item.text);
  }

  function refreshProofHighlights() {
    proofMarks = markDiscussions(
      'proof-passages', [...selections.values()].filter(item => item.source === 'proof'), proofPassage
    );
  }

  function refreshChatHighlights() {
    const branches = [...selections.values()].filter(item => item.parent === active && active);
    chatMarks = markDiscussions('chat-passages', branches, chatPassage);
    if (sourceFocus?.parent === active && active) {
      const range = chatPassage(sourceFocus);
      if (range && scrollToPassage(range, history.contains(range.startContainer) ? history : quote)) {
        sourceFocus = undefined;
      }
    }
  }

  function viewSource() {
    const item = selections.get(active);
    if (!item) return;
    if (item.parent) {
      showThread(item.parent);
      sourceFocus = item;
      refreshChatHighlights();
      return;
    }
    dialog.close();
    requestAnimationFrame(() => {
      reveal(`#${item.node}`);
      const range = proofPassage(item);
      if (range) scrollToPassage(range);
    });
  }

  function appendMessage(author, speaker, text) {
    const entry = document.createElement('article');
    entry.className = 'chat-message';
    entry.dataset.speaker = speaker;
    entry.dataset.message = text;
    const name = document.createElement('strong');
    name.textContent = author;
    const body = document.createElement('div');
    body.className = 'chat-body';
    entry.append(name, body);
    history.append(entry);
    renderMath(body, text, refreshChatHighlights);
    return entry;
  }

  function render(thread) {
    history.replaceChildren();
    for (const exchange of thread.exchanges) {
      appendMessage('You', 'user', exchange.question);
      appendMessage('Codex', 'assistant', exchange.answer);
    }
    if (thread.pending) appendMessage('You', 'user', thread.pending).dataset.pending = '';
    syncComposer(thread);
    history.scrollTop = history.scrollHeight;
  }

  function syncComposer(thread) {
    status.textContent = thread.pending ? 'Waiting for Codex…' : thread.error;
    question.value = thread.draft;
    question.disabled = Boolean(thread.pending);
    send.disabled = Boolean(thread.pending);
  }

  function nodeTitle(node) {
    const target = document.getElementById(node);
    const label = node === 'step-1' ? target.querySelector('h1') :
      target.querySelector(':scope > summary .node-title');
    const plain = label.cloneNode(true);
    for (const annotation of plain.querySelectorAll('annotation')) annotation.remove();
    return plain.textContent.trim();
  }

  function quoteLink(item) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'chat-thread-link';
    link.textContent = item.text;
    link.addEventListener('click', () => showThread(item.id));
    const row = document.createElement('li');
    row.append(link);
    return row;
  }

  function showThread(id) {
    hideSelection();
    sourceFocus = undefined;
    paintPassages('focused-passage', []);
    const thread = threadFor(id);
    active = id;
    const node = thread.node;
    const selected = thread.selected;
    const label = selected ? 'Selection chat' : 'Chat';
    document.getElementById('chat-step').textContent = node.startsWith('step-') ?
      `Step ${node.slice(5)} · ${label}` : label;
    document.getElementById('chat-title').textContent = nodeTitle(node);
    archive.hidden = true;
    archive.replaceChildren();
    history.hidden = false;
    status.hidden = false;
    parentButton.hidden = !selected?.parent;
    sourceButton.hidden = !selected;
    browseButton.hidden = false;
    returnButton.hidden = true;
    quote.hidden = !selected;
    renderMath(quote, selected?.text ?? '', refreshChatHighlights);
    children.replaceChildren(...[...selections.values()].filter(item => item.parent === id).map(quoteLink));
    branchList.hidden = !children.childElementCount;
    branchSummary.textContent = `Branches (${children.childElementCount})`;
    offline.hidden = served;
    form.hidden = !served;
    if (!dialog.open) dialog.showModal();
    render(thread);
    refreshChatHighlights();
    if (served && !question.disabled) question.focus();
    else dialog.querySelector('form[method="dialog"] button').focus();
  }

  function showArchive() {
    hideSelection();
    sourceFocus = undefined;
    paintPassages('focused-passage', []);
    archiveOrigin = active;
    active = undefined;
    document.getElementById('chat-step').textContent = '';
    document.getElementById('chat-title').textContent = 'Selection chats';
    for (const element of [quote, branchList, history, status, offline, form, sourceButton, parentButton, browseButton]) {
      element.hidden = true;
    }
    returnButton.hidden = !archiveOrigin;
    archive.hidden = false;
    archive.replaceChildren();
    const tree = document.createElement('ul');
    const levels = new Map();
    for (const item of selections.values()) {
      const parent = item.parent && selections.has(item.parent) ? item.parent : null;
      if (!levels.has(parent)) levels.set(parent, []);
      levels.get(parent).push(item);
    }
    const stack = [[tree, null]];
    const seen = new Set();
    while (stack.length) {
      const [list, parent] = stack.pop();
      for (const item of levels.get(parent) ?? []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        const row = quoteLink(item);
        list.append(row);
        if (levels.has(item.id)) {
          const nested = document.createElement('ul');
          row.append(nested);
          stack.push([nested, item.id]);
        }
      }
    }
    if (tree.childElementCount) archive.append(tree);
    else archive.textContent = 'Select text in the proof or a chat to start a discussion.';
    if (!dialog.open) dialog.showModal();
    (archive.querySelector('button') ?? dialog.querySelector('form[method="dialog"] button')).focus();
  }

  function createSelection(passage) {
    const parent = passage.location === 'chat' ? active : null;
    if (passage.location === 'chat' && !parent) return;
    if (!dialog.open) opener = document.activeElement;
    const node = parent ? threadFor(parent).node : passage.node;
    const item = {
      id: `selection-${crypto.randomUUID()}`, parent, node,
      text: passage.text, source: passage.source, message: passage.message, position: passage.position,
    };
    selections.set(item.id, item);
    try {
      saveSelections();
    } catch {
      threadFor(item.id).error = 'This browser could not save the new chat.';
    }
    refreshProofHighlights();
    showThread(item.id);
  }

  function selectionContext(selected) {
    const path = [];
    const seen = new Set();
    for (let item = selected; item && !seen.has(item.id); item = selections.get(item.parent)) {
      seen.add(item.id);
      path.push(item);
    }
    const recent = path.length <= 8 ? path : [...path.slice(0, 7), path.at(-1)];
    return recent.reverse().map(item => ({
      source: item.source,
      text: item === selected ? item.text : item.text.slice(0, 4000),
      message: item === selected ? item.message : '',
    }));
  }

  const hideSelection = installSelectionAction(dialog, createSelection);

  function markedDiscussion(event) {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const scope = dialog.open ? target.closest('#chat-history, #chat-quote') : proof;
    if (!scope?.contains(target)) return null;
    return discussionAt(target, event.clientX, event.clientY, dialog.open ? chatMarks : proofMarks);
  }

  function showPassageCursor(target) {
    if (hoveredPassage === target) return;
    hoveredPassage?.classList.remove('passage-pointer');
    hoveredPassage = target;
    hoveredPassage?.classList.add('passage-pointer');
  }

  document.addEventListener('pointermove', event => {
    const selecting = event.buttons || window.getSelection()?.isCollapsed === false;
    showPassageCursor(!selecting && markedDiscussion(event) ? event.target : null);
  });

  // Run before proof-link navigation so a click inside a mark opens its chat.
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || !event.detail ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
        window.getSelection()?.isCollapsed === false) return;
    const item = markedDiscussion(event);
    if (!item) return;
    event.preventDefault();
    if (!dialog.open) opener = document.activeElement;
    showPassageCursor(null);
    showThread(item.id);
  }, {capture: true});

  openArchiveButton.hidden = false;
  openArchiveButton.addEventListener('click', () => {
    opener = openArchiveButton;
    showArchive();
  });
  sourceButton.addEventListener('click', viewSource);
  browseButton.addEventListener('click', showArchive);
  parentButton.addEventListener('click', () => showThread(selections.get(active).parent));
  returnButton.addEventListener('click', () => showThread(archiveOrigin));

  for (const button of document.querySelectorAll('[data-chat-node]')) {
    button.hidden = false;
    button.setAttribute('aria-label', `Ask Codex about ${nodeTitle(button.dataset.chatNode)}`);
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', () => {
      opener = button;
      showThread(button.dataset.chatNode);
    });
  }
  document.documentElement.classList.add('chat-ready');
  refreshProofHighlights();

  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    hideSelection();
    active = undefined;
    if (opener?.isConnected) opener.focus({preventScroll: true});
  });
  question.addEventListener('input', () => {
    if (active) threadFor(active).draft = question.value;
  });
  question.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!active || !served) return;
    const thread = threadFor(active);
    const text = question.value.trim();
    if (!text || thread.pending) return;
    thread.pending = text;
    thread.draft = '';
    thread.error = '';
    render(thread);
    refreshChatHighlights();

    let answer;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          node: thread.node, snapshot, question: text, history: thread.exchanges.slice(-8),
          selections: selectionContext(thread.selected),
        }),
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.answer !== 'string') {
        throw new Error(payload.error || 'The local server returned an invalid response.');
      }
      answer = payload.answer;
      thread.exchanges.push({question: text, answer});
      try {
        localStorage.setItem(thread.key, JSON.stringify(thread.exchanges));
      } catch {
        thread.error = 'This browser could not save the conversation. It is available until you close the page.';
      }
    } catch (error) {
      thread.draft = text;
      thread.error = error instanceof SyntaxError ? 'Start the local chat server and try again.' : error.message;
    } finally {
      thread.pending = '';
      if (active === thread.id && dialog.open) {
        const pending = history.querySelector('[data-pending]');
        if (answer !== undefined) {
          pending?.removeAttribute('data-pending');
          appendMessage('Codex', 'assistant', answer);
        } else {
          pending?.remove();
        }
        syncComposer(thread);
        refreshChatHighlights();
        if (window.getSelection().isCollapsed) {
          history.scrollTop = history.scrollHeight;
          question.focus();
        }
      }
    }
  });
})();
