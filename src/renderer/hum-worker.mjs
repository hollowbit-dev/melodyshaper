import { beatboxToHits, humToNotes } from './pitch.mjs';

self.onmessage = ({ data }) => {
  try {
    if (data.mode === 'beat') {
      self.postMessage({ hits: beatboxToHits(data.samples, data.sampleRate, data.options) });
      return;
    }
    const { notes, sung } = humToNotes(data.samples, data.sampleRate, data.options);
    self.postMessage({ notes, sung });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
