/**
 * The load checks of a window profile (ADR 0006, spec section 4) against the window it describes:
 * a path that names no widget of the window, an unknown selector, value, fact, view, save path,
 * template or `positionType` is an error on the entry, which is then skipped, and the rest
 * applies. Checks run on the layered profile, so an entry may use what a lower layer defines; each
 * error goes to the file that wrote the entry.
 */
import type { Widget } from '../model/gui.ts';
import type { SourceRange } from '../script/tree.ts';
import { factNamed } from './facts.ts';
import type {
  Content,
  ContentSource,
  Link,
  PathRef,
  ProfileDiagnostic,
  ProfileFile,
  Repeater,
  Rule,
  Selector,
  View,
  WindowProfile,
  Written,
} from './format.ts';
import { profilePattern, widgetsAt } from './paths.ts';
import { readSavePath } from './save-paths.ts';

/** The widget kinds a repeater fills. */
const LIST_KINDS = new Set(['listboxType', 'smoothListboxType']);

export interface ProfileCheckInput {
  /** The top-level window, as the playset's winning `.gui` file defines it. */
  readonly window: Widget;
  /** Whether the window's file defines a `positionType` of this name (ignoring case). */
  readonly positionType: (name: string) => boolean;
  /** The playset's top-level definition of a name, for a repeater's template; unchecked without. */
  readonly template?: (name: string) => Widget | undefined;
  /** Whether the playset defines a top-level window of a name, for links; unchecked without. */
  readonly windowExists?: (name: string) => boolean;
}

export interface CheckedProfile {
  /** The profile without its faulty entries. */
  readonly profile: WindowProfile;
  readonly diagnostics: readonly ProfileDiagnostic[];
}

/** Checks a layered profile against its window and leaves out what fails. */
export function checkProfile(profile: WindowProfile, input: ProfileCheckInput): CheckedProfile {
  const diagnostics: ProfileDiagnostic[] = [];
  const error = (
    entry: Written,
    code: ProfileDiagnostic['code'],
    range: SourceRange,
    message: string,
  ): void => {
    diagnostics.push({
      severity: 'error',
      code,
      message,
      start: range.start,
      end: range.end,
      file: entry.origin.file,
    });
  };

  if (input.window.name?.toLowerCase() !== profile.window.toLowerCase()) {
    // The caller picks files by window; a file whose "window" says otherwise is not this one's.
    throw new Error(`profile of ${profile.window} checked against ${input.window.name ?? '?'}`);
  }

  const pathFails = (entry: Written, ref: PathRef): boolean => {
    const compiled = profilePattern(ref.path);
    if ('problem' in compiled) {
      error(entry, 'profile-unknown-path', ref.range, compiled.problem);
      return true;
    }
    if (widgetsAt(input.window, ref.path).length === 0) {
      error(
        entry,
        'profile-unknown-path',
        ref.range,
        `No widget of ${profile.window} has the path "${ref.path}".`,
      );
      return true;
    }
    return false;
  };

  const selectors = new Map<string, Selector>();
  for (const selector of profile.selectors) {
    if (selectorFails(selector, error)) continue;
    selectors.set(selector.id, selector);
  }
  const hasValue = (entry: Written, id: string, value: string, range: SourceRange): boolean => {
    const selector = selectors.get(id);
    if (selector === undefined) {
      error(
        entry,
        'profile-unknown-name',
        range,
        `No selector "${id}" is defined, or it failed its check.`,
      );
      return false;
    }
    if (!selector.values.some((v) => v.id === value)) {
      error(
        entry,
        'profile-unknown-value',
        range,
        `Selector "${id}" has no value "${value}"; it has ${quoted(selector.values.map((v) => v.id))}.`,
      );
      return false;
    }
    return true;
  };

  const groups = profile.groups.filter((group) => {
    const selector = selectors.get(group.selector);
    if (selector === undefined) {
      error(
        group,
        'profile-unknown-name',
        group.range,
        `No selector "${group.selector}" is defined, or it failed its check.`,
      );
      return false;
    }
    let ok = true;
    for (const member of group.members) {
      ok = hasValue(group, group.selector, member.value, member.range) && ok;
      ok = !pathFails(group, member) && ok;
    }
    if (!group.none) {
      const missing = selector.values.filter((v) => !group.members.some((m) => m.value === v.id));
      if (missing.length > 0) {
        error(
          group,
          'profile-unknown-value',
          group.range,
          `Group "${group.id}" has no member for ${quoted(missing.map((v) => v.id))}; ` +
            'give each value a member, or set "none": true.',
        );
        ok = false;
      }
    }
    return ok;
  });

  const rules = profile.rules.filter((rule: Rule) => {
    let ok = true;
    for (const condition of rule.when) {
      for (const value of condition.values) {
        ok = hasValue(rule, condition.selector, value, condition.range) && ok;
      }
    }
    for (const ref of [
      ...rule.show,
      ...rule.hide,
      ...rule.notCreated,
      ...rule.position,
      ...rule.frame,
    ]) {
      ok = !pathFails(rule, ref) && ok;
    }
    for (const move of rule.position) {
      if (!input.positionType(move.positionType)) {
        error(
          rule,
          'profile-unknown-name',
          move.range,
          `The file of ${profile.window} defines no positionType "${move.positionType}".`,
        );
        ok = false;
      }
    }
    return ok;
  });

  const views = profile.views.filter((view: View) => {
    let ok = true;
    for (const setting of view.set) {
      if (selectors.get(setting.selector)?.kind === 'resolution') {
        error(
          view,
          'profile-unknown-name',
          setting.range,
          `A view does not set the resolution selector "${setting.selector}"; the preview's screen decides it.`,
        );
        ok = false;
        continue;
      }
      ok = hasValue(view, setting.selector, setting.value, setting.range) && ok;
    }
    for (const toggle of view.toggles) ok = !pathFails(view, toggle) && ok;
    return ok;
  });

  const saveFails = (
    entry: Written,
    source: ContentSource,
    options: { entry?: boolean } = {},
  ): boolean => {
    let failed = false;
    for (const ref of source.save) {
      const path = readSavePath(ref.path, options);
      if ('problem' in path) {
        error(entry, 'profile-unknown-source', ref.range, path.problem);
        failed = true;
      }
    }
    return failed;
  };

  const content = profile.content.filter((entry: Content) => {
    const pathOk = !pathFails(entry, entry.path);
    return !saveFails(entry, entry) && pathOk;
  });

  const repeaters = profile.repeaters.filter((repeater: Repeater) => {
    let ok = !pathFails(repeater, repeater.path);
    for (const list of widgetsAt(input.window, repeater.path.path)) {
      if (!LIST_KINDS.has(list.kind)) {
        error(
          repeater,
          'profile-unknown-path',
          repeater.path.range,
          `A repeater fills a list box; "${repeater.path.path}" is a ${list.kind}.`,
        );
        ok = false;
        break;
      }
    }
    if (repeater.from !== undefined) {
      const from = readSavePath(repeater.from.path, { collection: true });
      if ('problem' in from) {
        error(repeater, 'profile-unknown-source', repeater.from.range, from.problem);
        ok = false;
      }
    }
    const template = input.template?.(repeater.template);
    if (input.template !== undefined && template === undefined) {
      error(
        repeater,
        'profile-unknown-source',
        repeater.templateRange,
        `The playset defines no top-level "${repeater.template}" for the entries.`,
      );
      ok = false;
    }
    for (const field of repeater.fields) {
      if (template !== undefined && widgetsAt(template, field.path.path).length === 0) {
        error(
          repeater,
          'profile-unknown-path',
          field.path.range,
          `No widget of ${repeater.template} has the path "${field.path.path}"; a field's path starts with the template's name.`,
        );
        ok = false;
      }
      ok = !saveFails(repeater, field, { entry: repeater.from !== undefined }) && ok;
    }
    return ok;
  });

  const links = profile.links.filter((link: Link) => {
    let ok = true;
    for (const condition of link.when) {
      for (const value of condition.values) {
        ok = hasValue(link, condition.selector, value, condition.range) && ok;
      }
    }
    if (input.windowExists !== undefined && !input.windowExists(link.window)) {
      error(
        link,
        'profile-unknown-name',
        link.windowRange,
        `The playset defines no window "${link.window}".`,
      );
      ok = false;
    }
    return ok;
  });

  let defaultView = profile.defaultView;
  if (defaultView !== undefined && !views.some((v) => v.id === defaultView)) {
    const named = profile.views.find((v) => v.id === defaultView);
    // A default view that failed its check was reported with the view.
    const at = profile.defaultViewAt;
    if (named === undefined && at !== undefined) {
      error(at, 'profile-unknown-name', at.range, `No view "${defaultView}" is defined.`);
    }
    defaultView = views[0]?.id;
  }

  return {
    profile: {
      ...profile,
      selectors: [...selectors.values()],
      groups,
      rules,
      views,
      content,
      repeaters,
      links,
      defaultView,
    },
    diagnostics,
  };
}

function selectorFails(
  selector: Selector,
  error: (
    entry: Written,
    code: ProfileDiagnostic['code'],
    range: SourceRange,
    message: string,
  ) => void,
): boolean {
  if (!selector.values.some((v) => v.id === selector.default)) {
    error(
      selector,
      'profile-unknown-value',
      selector.range,
      `Selector "${selector.id}" has no value "${selector.default}" for its default.`,
    );
    return true;
  }
  if (selector.kind !== 'data') return false;
  const fact = factNamed(selector.fact ?? '');
  if (fact === undefined) {
    error(
      selector,
      'profile-unknown-fact',
      selector.range,
      `Etch implements no fact "${selector.fact ?? ''}"; a new fact needs an Etch release.`,
    );
    return true;
  }
  const ids = selector.values.map((v) => v.id);
  if (ids.length !== fact.values.length || !fact.values.every((v) => ids.includes(v))) {
    error(
      selector,
      'profile-unknown-fact',
      selector.range,
      `Fact ${fact.name} has the values ${quoted(fact.values)}; selector "${selector.id}" has ${quoted(ids)}.`,
    );
    return true;
  }
  return false;
}

/**
 * The notice for a file checked with another version of its game or mod than the playset has;
 * the file still applies. `undefined` when the versions match or either is unknown.
 */
export function otherVersionNotice(
  file: ProfileFile,
  version: string | undefined,
  range: SourceRange = { start: 0, end: 0 },
): ProfileDiagnostic | undefined {
  if (file.checkedWith === undefined || version === undefined) return undefined;
  if (file.checkedWith.trim() === version.trim()) return undefined;
  return {
    severity: 'information',
    code: 'profile-other-version',
    message:
      `The ${file.window} profile of ${file.origin.source} was checked with ${file.checkedWith}; ` +
      `the playset has ${version}. It still applies.`,
    start: range.start,
    end: range.end,
    file: file.origin.file,
  };
}

function quoted(values: readonly string[]): string {
  return values.map((v) => `"${v}"`).join(', ');
}
