import { setLudoDuck } from './ludoSound';
import { setSfxDuck } from './sound';
import { useVoice } from './voice';

/**
 * Live voice comes first: while anyone talks (me or another player), game sounds and music go
 * quieter; when everyone is quiet they come back. A short hold avoids pumping between words.
 */
let ducked = false;
let release: number | undefined;
useVoice.subscribe((st) => {
  const talking = !!st.roomId && Object.values(st.speaking).some(Boolean);
  if (talking) {
    window.clearTimeout(release);
    if (!ducked) {
      ducked = true;
      setLudoDuck(0.3);
      setSfxDuck(0.35);
    }
  } else if (ducked) {
    window.clearTimeout(release);
    release = window.setTimeout(() => {
      ducked = false;
      setLudoDuck(1);
      setSfxDuck(1);
    }, 700);
  }
});
