// Draws one clip's edit (src/edit.ts): its segments cut one after another, each panel a part of
// its master moved by its camera, the drawn pointer, highlights and key captions. The look follows
// the Etch site (etch-website DESIGN.md): the Forge neutrals, the verdigris accent, IBM Plex Sans and
// JetBrains Mono.
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/jetbrains-mono';
import { useEffect, useState, type CSSProperties } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Freeze,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {
  editLength,
  FULL_FRAME,
  OUTPUT,
  panelState,
  pointerAt,
  toOutput,
  type Caption,
  type EditSpec,
  type Highlight,
  type Panel,
  type PanelState,
  type Segment,
} from '../src/edit.ts';

const COLOURS = {
  bg: '#16171a',
  surface: '#1f2024',
  text: '#ececee',
  muted: '#a9abb3',
  accent: '#4fc9a8',
  key: '#2b2d33',
} as const;
const SANS = '"IBM Plex Sans Variable", sans-serif';
const MONO = '"JetBrains Mono Variable", monospace';
/** How long captions and highlights fade in and out. */
const FADE = 0.2;

export function Clip({ spec }: { spec: EditSpec }) {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    void document.fonts.ready.then(() => {
      continueRender(handle);
    });
  }, [handle]);

  const frame = useCurrentFrame();
  const total = editLength(spec).frames;
  const first = spec.segments[0];
  // The loop's dissolve: the clip's first frame over its last ones, from clear to opaque.
  const fadeFrames = Math.round((spec.loopFade ?? 0) * OUTPUT.fps);
  const fade = fadeFrames > 0 ? (frame - (total - 1 - fadeFrames)) / fadeFrames : 0;
  let from = 0;
  return (
    <AbsoluteFill style={{ background: COLOURS.bg }}>
      {spec.segments.map((segment, i) => {
        const start = from;
        const frames = Math.round(segment.duration * OUTPUT.fps);
        from += frames;
        return (
          <Sequence key={i} from={start} durationInFrames={frames}>
            <SegmentView spec={spec} segment={segment} />
          </Sequence>
        );
      })}
      {first !== undefined && fade > 0 && (
        <AbsoluteFill style={{ opacity: Math.min(1, fade), background: COLOURS.bg }}>
          <Freeze frame={0}>
            <SegmentView spec={spec} segment={first} />
          </Freeze>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

function SegmentView({ spec, segment }: { spec: EditSpec; segment: Segment }) {
  const t = useCurrentFrame() / OUTPUT.fps;
  const states = segment.panels.map((panel) => panelState(panel, t));
  // The smaller frame on top: an inset over the panel it sits on, whichever comes first.
  const order = states
    .map((state, i) => ({ i, area: state.frame.w * state.frame.h }))
    .sort((a, b) => b.area - a.area)
    .map(({ i }) => i);
  return (
    <AbsoluteFill>
      {order.map((i) => (
        <PanelView
          key={i}
          spec={spec}
          panel={segment.panels[i] as Panel}
          state={states[i] as PanelState}
          t={t}
        />
      ))}
      {segment.highlights.map((highlight, i) => (
        <HighlightView key={i} highlight={highlight} state={states[highlight.panel]} t={t} />
      ))}
      {segment.captions.map((caption, i) => (
        <CaptionView key={i} caption={caption} t={t} />
      ))}
    </AbsoluteFill>
  );
}

/** 0 to 1 and back over `from`–`to`, with FADE at each end. */
function fade(t: number, from: number, to: number): number {
  return Math.max(0, Math.min(1, (t - from) / FADE, (to - t) / FADE));
}

function PanelView({
  spec,
  panel,
  state,
  t,
}: {
  spec: EditSpec;
  panel: Panel;
  state: PanelState;
  t: number;
}) {
  const source = spec.sources[panel.source];
  if (source === undefined) throw new Error(`no source ${panel.source}`);
  const { frame, view } = state;
  const scale = frame.w / view.w;
  const full =
    frame.x === FULL_FRAME.x &&
    frame.y === FULL_FRAME.y &&
    frame.w === FULL_FRAME.w &&
    frame.h === FULL_FRAME.h;
  const box: CSSProperties = {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    overflow: 'hidden',
    opacity: state.opacity,
    borderRadius: full ? 0 : 14,
    boxShadow: full ? 'none' : '0 24px 60px -24px rgb(0 0 0 / 0.8)',
    background: COLOURS.surface,
  };
  const sourceTime = panel.start + t;
  const pointer = panel.pointer === undefined ? undefined : pointerAt(panel.pointer, sourceTime);
  const click = panel.pointer?.clicks.findLast((at) => at <= sourceTime);
  return (
    <div style={box}>
      <OffthreadVideo
        src={staticFile(source.file)}
        muted
        trimBefore={Math.round(panel.start * OUTPUT.fps)}
        style={{
          position: 'absolute',
          left: -view.x * scale,
          top: -view.y * scale,
          width: source.width * scale,
          height: source.height * scale,
          maxWidth: 'none',
        }}
      />
      {pointer !== undefined && (
        <PointerView
          x={(pointer.x - view.x) * scale}
          y={(pointer.y - view.y) * scale}
          scale={scale}
          since={click === undefined ? undefined : sourceTime - click}
        />
      )}
    </div>
  );
}

/** An arrow pointer, drawn the size a pointer has at the master's device scale (2). */
function PointerView({
  x,
  y,
  scale,
  since,
}: {
  x: number;
  y: number;
  scale: number;
  since: number | undefined;
}) {
  const size = 34 * scale;
  const ripple = since !== undefined && since < 0.5 ? since / 0.5 : undefined;
  return (
    <>
      {ripple !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: x - 30 * scale * ripple,
            top: y - 30 * scale * ripple,
            width: 60 * scale * ripple,
            height: 60 * scale * ripple,
            borderRadius: '50%',
            border: `${String(3 * scale)}px solid ${COLOURS.accent}`,
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={{ position: 'absolute', left: x - size * 0.12, top: y - size * 0.06 }}
      >
        <path
          d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.7 L10.6 14 L17 14 Z"
          fill="#fff"
          stroke="#111"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}

function HighlightView({
  highlight,
  state,
  t,
}: {
  highlight: Highlight;
  state: PanelState | undefined;
  t: number;
}) {
  const opacity = fade(t, highlight.from, highlight.to);
  if (state === undefined || opacity <= 0) return null;
  const pad = 6;
  const a = toOutput(state, { x: highlight.rect.x, y: highlight.rect.y });
  const b = toOutput(state, {
    x: highlight.rect.x + highlight.rect.w,
    y: highlight.rect.y + highlight.rect.h,
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: a.x - pad,
        top: a.y - pad,
        width: b.x - a.x + 2 * pad,
        height: b.y - a.y + 2 * pad,
        border: `4px solid ${COLOURS.accent}`,
        borderRadius: 10,
        boxShadow: `0 0 0 6px rgb(79 201 168 / 0.22), 0 0 32px rgb(79 201 168 / 0.35)`,
        opacity,
      }}
    />
  );
}

function CaptionView({ caption, t }: { caption: Caption; t: number }) {
  const opacity = fade(t, caption.from, caption.to);
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 56,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        transform: `translateY(${String((1 - opacity) * 12)}px)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '14px 24px',
          borderRadius: 16,
          background: 'rgb(22 23 26 / 0.9)',
          border: '1px solid rgb(255 255 255 / 0.12)',
          boxShadow: '0 18px 40px -18px rgb(0 0 0 / 0.9)',
          fontFamily: SANS,
          fontSize: 30,
          color: COLOURS.text,
        }}
      >
        {caption.keys !== undefined && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {caption.keys.map((key, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: COLOURS.muted }}>+</span>}
                <kbd
                  style={{
                    fontFamily: MONO,
                    fontSize: 26,
                    padding: '4px 12px',
                    borderRadius: 8,
                    background: COLOURS.key,
                    borderBottom: '3px solid #0d0e10',
                    color: COLOURS.text,
                  }}
                >
                  {key}
                </kbd>
              </span>
            ))}
          </span>
        )}
        {caption.text !== undefined && <span>{caption.text}</span>}
      </div>
    </div>
  );
}
