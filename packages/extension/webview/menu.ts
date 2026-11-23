// A menu of the webviews' toolbars (etch#648): a button with aria-haspopup="menu" opens a list of
// choices under it, as VS Code's own menus do. The arrow keys, Home and End move between the
// items, Enter or Space picks one, and Esc closes the menu and gives the focus back to its button.

/**
 * One item of a menu: one choice of a few, ticked when it is the current one (`checked`), or a
 * command, which has no `checked`.
 */
export interface MenuItem {
  readonly label: string;
  /** The keys that do the same, or a count, shown at the right. */
  readonly keys?: string;
  readonly checked?: boolean;
  /** Shown but not picked: the arrow keys pass it. */
  readonly disabled?: boolean;
  readonly title?: string;
  readonly pick: () => void;
}

/** A line between two groups of items. */
export const SEPARATOR = 'separator';

/** The name of the group of items under it, such as "Views". */
export interface MenuHeading {
  readonly heading: string;
}

/**
 * Makes `button` open `menu` (an empty element with role="menu" next to it), filled from `items`
 * each time it opens, so it shows the current choice.
 */
export function attachMenu(
  button: HTMLButtonElement,
  menu: HTMLElement,
  items: () => readonly (MenuItem | MenuHeading | typeof SEPARATOR)[],
): void {
  const entries = (): HTMLButtonElement[] => [
    ...menu.querySelectorAll<HTMLButtonElement>('button.item:not(:disabled)'),
  ];
  const close = (focusButton: boolean): void => {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  };
  const open = (): void => {
    menu.replaceChildren(
      ...items().map((item) => {
        if (item === SEPARATOR) return document.createElement('hr');
        if ('heading' in item) {
          const heading = document.createElement('div');
          heading.className = 'heading';
          heading.setAttribute('role', 'presentation');
          heading.textContent = item.heading;
          return heading;
        }
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.className = 'item';
        entry.tabIndex = -1;
        if (item.checked === undefined) {
          entry.setAttribute('role', 'menuitem');
        } else {
          entry.setAttribute('role', 'menuitemradio');
          entry.setAttribute('aria-checked', String(item.checked));
        }
        entry.disabled = item.disabled === true;
        if (item.title !== undefined) entry.title = item.title;
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = item.label;
        const keys = document.createElement('span');
        keys.className = 'keys';
        keys.textContent = item.keys ?? '';
        entry.append(mark, label, keys);
        entry.addEventListener('click', () => {
          close(true);
          item.pick();
        });
        return entry;
      }),
    );
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const all = entries();
    (all.find((entry) => entry.getAttribute('aria-checked') === 'true') ?? all[0])?.focus();
  };

  button.addEventListener('click', () => {
    if (menu.hidden) open();
    else close(true);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    open();
  });
  menu.addEventListener('keydown', (event) => {
    const all = entries();
    const at = all.findIndex((entry) => entry === document.activeElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = at < 0 || at === all.length - 1 ? 0 : at + 1;
        break;
      case 'ArrowUp':
        next = at <= 0 ? all.length - 1 : at - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = all.length - 1;
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case 'Tab':
        // The focus goes on from the button, as if the menu had not been open.
        close(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    all[next]?.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Node) || menu.contains(target) || button.contains(target)) return;
    close(false);
  });
}
