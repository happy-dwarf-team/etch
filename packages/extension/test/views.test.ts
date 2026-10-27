import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '@etch/core';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '@etch/core/profile';
import {
  applyViewAction,
  chooseMember,
  initialChoice,
  savedView,
  toggleWidget,
  viewChoiceOf,
  viewId,
  viewMenu,
} from '../src/preview/views.ts';

const WINDOW = readGuiFile(
  parseScript(`guiTypes = { windowType = {
    name = "w"
    windowType = { name = "a" }
    windowType = { name = "b" }
    iconType = { name = "extra" }
  } }`),
).definitions[0] as Widget;

const PROFILE = layerProfiles('w', [
  readProfile(
    `{ "formatVersion": 1, "window": "w",
      "selectors": {
        "tab": { "kind": "ui", "label": "Tab", "values": { "a": "A", "b": "B" } },
        "owner": { "kind": "data", "fact": "province.ownedByPlayer" }
      },
      "groups": { "tab": { "selector": "tab", "members": { "a": "w/a", "b": "w/b" } } },
      "views": {
        "first": { "label": "First", "set": { "tab": "a" } },
        "second": { "label": "Second", "set": { "tab": "b" }, "toggles": { "w/extra": false } }
      },
      "defaultView": "first" }`,
    { layer: 0, source: 'vanilla', file: 'w.jsonc' },
  ).file ?? (undefined as never),
]);
const SCREEN = { width: 1920, height: 1080 };
const at = (path: string): Widget => widgetsAt(WINDOW, path)[0] as Widget;

describe("a window's view choice", () => {
  it('starts on the default view and follows View ▾', () => {
    const start = initialChoice(PROFILE);
    expect(start).toEqual({ view: 'first', set: { tab: 'a' }, toggles: {} });
    const second = applyViewAction(PROFILE, start, { kind: 'chooseView', id: 'second' });
    expect(second.toggles).toEqual({ 'w/extra': false });
    const owner = applyViewAction(PROFILE, second, {
      kind: 'select',
      selector: 'owner',
      value: 'no',
    });
    expect(owner.set).toEqual({ tab: 'b', owner: 'no' });
    expect(applyViewAction(PROFILE, owner, { kind: 'release', selector: 'owner' }).set).toEqual({
      tab: 'b',
    });
    expect(applyViewAction(PROFILE, owner, { kind: 'resetToggles' }).toggles).toEqual({});
  });

  it('keeps only eyes that differ from the profile, and a radio as one hand toggle', () => {
    const start = initialChoice(PROFILE);
    const view = evaluateView(PROFILE, WINDOW, SCREEN, viewChoiceOf(start));
    expect(toggleWidget(start, view, WINDOW, at('w/extra'), true).toggles).toEqual({});
    const hidden = toggleWidget(start, view, WINDOW, at('w/extra'), false);
    expect(hidden.toggles).toEqual({ 'w/extra': false });

    const radio = chooseMember(start, view, WINDOW, 'tab', 'b');
    expect(radio.toggles).toEqual({ 'w/a': false, 'w/b': true });
    const byHand = evaluateView(PROFILE, WINDOW, SCREEN, viewChoiceOf(radio));
    expect(byHand.handToggles).toBe(1);
    expect(byHand.groups[0]).toMatchObject({ chosen: 'b', byHand: true });
    expect(viewMenu(PROFILE, byHand, radio, true).label).toBe('First · 1 by hand');
    // Choosing what the selector shows anyway drops the radio's toggles.
    expect(chooseMember(radio, byHand, WINDOW, 'tab', 'a').toggles).toEqual({});
  });

  it('builds View ▾ and what Save as view writes', () => {
    const choice = applyViewAction(PROFILE, initialChoice(PROFILE), {
      kind: 'select',
      selector: 'tab',
      value: 'b',
    });
    const view = evaluateView(PROFILE, WINDOW, SCREEN, viewChoiceOf(choice));
    const menu = viewMenu(PROFILE, view, choice, false);
    expect(menu.label).toBe('Custom view');
    expect(menu.views.map((v) => [v.id, v.current, v.mine])).toEqual([
      ['first', false, false],
      ['second', false, false],
    ]);
    expect(menu.selectors.map((s) => [s.id, s.value, s.source])).toEqual([
      ['tab', 'b', 'you'],
      ['owner', 'yes', 'default'],
    ]);
    expect(savedView('Mine', view, choice)).toEqual({
      label: 'Mine',
      set: { tab: 'b', owner: 'yes' },
      toggles: {},
    });
    expect(viewId('First', PROFILE, [])).toBe('first-2');
    expect(viewId('First', PROFILE, ['first'])).toBe('first');
    expect(viewId('Own province!', PROFILE, [])).toBe('own-province');
  });
});
