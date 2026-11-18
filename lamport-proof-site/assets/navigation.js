const tree = document.getElementById('proof-tree');
const roadmap = [...document.querySelectorAll('.roadmap a')];

function targetFor(hash) {
  return document.getElementById(hash.slice(1));
}

function reveal(hash, focus = false) {
  const target = targetFor(hash);
  const branch = target?.closest('.branch > details');
  for (const link of roadmap) {
    if (link.hash === `#${branch?.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }

  if (!target) return;
  for (let element = target; element; element = element.parentElement) {
    if (element instanceof HTMLDetailsElement) element.open = true;
  }

  if (focus) {
    const focusTarget = target instanceof HTMLDetailsElement
      ? target.querySelector(':scope > summary')
      : target;
    if (focusTarget.tabIndex < 0) focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  }
  target.scrollIntoView({ block: 'start' });
}

function setProofDepth(open) {
  for (const details of tree.querySelectorAll('details')) details.open = open;
}

document.querySelector('.controls').hidden = false;
document.getElementById('expand').addEventListener('click', () => setProofDepth(true));
document.getElementById('collapse').addEventListener('click', () => {
  setProofDepth(false);
  history.replaceState(null, '', location.pathname + location.search);
  for (const link of roadmap) link.removeAttribute('aria-current');
  document.getElementById('proof-heading').scrollIntoView({ block: 'start' });
});

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || !targetFor(link.hash) || event.defaultPrevented ||
      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
  reveal(link.hash, true);
});

window.addEventListener('hashchange', () => reveal(location.hash));
if (location.hash) requestAnimationFrame(() => reveal(location.hash));
