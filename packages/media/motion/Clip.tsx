// Draws one clip's edit (src/edit.ts): its segments cut one after another, each panel a part of
// its master moved by its camera, the drawn pointer, highlights, and key captions in the caption
// band at the bottom, which no panel enters. The look follows
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
  CAPTION_BAND,
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
  type Veil,
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
/** How long a veil fades in and out: as long as a menu's panel takes to unfold (`UNFOLD`). */
const VEIL_FADE = 0.12;

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
          veils={(segment.veils ?? []).filter((veil) => veil.panel === i)}
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
  veils,
  t,
}: {
  spec: EditSpec;
  panel: Panel;
  state: PanelState;
  veils: readonly Veil[];
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
    ...(panel.fadeRight === undefined
      ? {}
      : {
          maskImage: `linear-gradient(to right, #000 calc(100% - ${String(panel.fadeRight)}px), transparent)`,
        }),
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
      {veils.map((veil, i) => {
        const opacity = Math.max(
          0,
          Math.min(1, (t - veil.from) / VEIL_FADE, (veil.to - t) / VEIL_FADE),
        );
        if (opacity <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: (veil.rect.x - view.x) * scale,
              top: (veil.rect.y - view.y) * scale,
              width: veil.rect.w * scale,
              height: veil.rect.h * scale,
              opacity,
              backdropFilter: 'blur(18px) brightness(0.5) saturate(0.4)',
              background: 'rgb(31 32 36 / 0.35)',
              border: '1px solid rgb(255 255 255 / 0.08)',
              borderRadius: 8,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * An arrow pointer, drawn the size Windows draws its pointer at the master's device scale (1): the
 * arrow about 13 × 19 px, so it covers no more of a tip beside it than the real one does.
 */
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
  const size = 22 * scale;
  const ripple = since !== undefined && since < 0.5 ? since / 0.5 : undefined;
  return (
    <>
      {ripple !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: x - 20 * scale * ripple,
            top: y - 20 * scale * ripple,
            width: 40 * scale * ripple,
            height: 40 * scale * ripple,
            borderRadius: '50%',
            border: `${String(2 * scale)}px solid ${COLOURS.accent}`,
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

/** A caption in the caption band, under every panel: it never covers what a panel shows. */
function CaptionView({ caption, t }: { caption: Caption; t: number }) {
  const opacity = fade(t, caption.from, caption.to);
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: OUTPUT.height - CAPTION_BAND,
        height: CAPTION_BAND,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          fontFamily: SANS,
          fontSize: 40,
          fontWeight: 500,
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
                    fontSize: 34,
                    padding: '4px 14px',
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
