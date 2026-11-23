// A popover of the webviews' toolbars (etch#648): a button with aria-haspopup="dialog" opens a
// small form under it (`.pop`, role="dialog"), as VS Code's own widgets do. It is not modal: Tab
// moves through it and on, a click outside or Esc closes it, and Esc gives the focus back to its
// button. A `[data-close]` button inside closes it too.

/** Makes `button` open and close `pop`, placed under the button and kept inside the page. */
export function attachPopover(button: HTMLButtonElement, pop: HTMLElement): void {
  const place = (): void => {
    const anchor = button.getBoundingClientRect();
    const width = pop.offsetWidth;
    const left = Math.max(4, Math.min(anchor.left, window.innerWidth - width - 4));
    pop.style.left = `${String(left)}px`;
    pop.style.top = `${String(anchor.bottom + 2)}px`;
  };
  const close = (focusButton: boolean): void => {
    if (pop.hidden) return;
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  };
  const open = (): void => {
    pop.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    place();
    pop
      .querySelector<HTMLElement>('input:not([hidden]), select, button:not([data-close])')
      ?.focus();
  };

  button.addEventListener('click', () => {
    if (pop.hidden) open();
    else close(true);
  });
  pop.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  });
  for (const closer of pop.querySelectorAll<HTMLButtonElement>('[data-close]')) {
    closer.addEventListener('click', () => {
      close(true);
    });
  }
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Node) || pop.contains(target) || button.contains(target)) return;
    close(false);
  });
  window.addEventListener('resize', () => {
    if (!pop.hidden) place();
  });
}
