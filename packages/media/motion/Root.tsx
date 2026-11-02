import { Composition } from 'remotion';
import { editLength, OUTPUT, type EditSpec } from '../src/edit.ts';
import { Clip } from './Clip.tsx';

const EMPTY: EditSpec = { id: 'empty', sources: {}, segments: [] };

/** One composition for every clip: its edit comes in the input props. */
export function Root() {
  return (
    <Composition
      id="clip"
      component={Clip}
      width={OUTPUT.width}
      height={OUTPUT.height}
      fps={OUTPUT.fps}
      durationInFrames={1}
      defaultProps={{ spec: EMPTY }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, editLength(props.spec).frames),
      })}
    />
  );
}
