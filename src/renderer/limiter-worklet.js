// A look-ahead limiter: it sees each peak 5 ms early and turns the mix down just enough, so nothing can clip.
const CEILING = 0.891; // -1 dB, which leaves room for MP3 encoding
const RELEASE_SECONDS = 0.12;

class MelodyLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    const size = this.size = Math.max(2, Math.round(sampleRate * 0.005));
    this.left = new Float32Array(size);
    this.right = new Float32Array(size);
    this.wanted = new Float64Array(size).fill(1); // the gain each recent sample needs
    this.smooth = new Float64Array(size).fill(1); // the recent gains being averaged
    this.sum = size;
    this.at = 0;
    this.env = 1;
    this.release = 1 - Math.exp(-1 / (RELEASE_SECONDS * sampleRate));
    this.queue = new Int32Array(size); // positions of the lowest gains, oldest first
    this.head = 0;
    this.count = 0;
    this.written = 0;
  }

  // The lowest gain needed by any sample still in the look-ahead window.
  lowest(index, value) {
    const { queue, wanted, size } = this;
    while (this.count && wanted[queue[(this.head + this.count - 1) % size] % size] >= value) this.count--;
    queue[(this.head + this.count) % size] = index;
    this.count++;
    if (this.written - this.absolute(queue[this.head]) >= size) { this.head = (this.head + 1) % size; this.count--; }
    return wanted[queue[this.head] % size];
  }

  // Queue entries wrap at a multiple of the window, so recover how many samples ago each was written.
  absolute(index) {
    const span = this.size * 1024, now = this.written % span;
    return this.written - ((now - index + span) % span);
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0], outL = output[0], outR = output[1] || output[0];
    const inL = input[0], inR = input[1] || input[0], size = this.size;
    for (let i = 0; i < outL.length; i++) {
      const l = inL ? inL[i] : 0, r = inR ? inR[i] : 0, peak = Math.max(Math.abs(l), Math.abs(r));
      const at = this.at, need = peak > CEILING ? CEILING / peak : 1;
      this.wanted[at] = need;
      const low = this.lowest(this.written % (size * 1024), need);
      this.env = Math.min(low, this.env + (1 - this.env) * this.release);
      this.sum += this.env - this.smooth[at];
      this.smooth[at] = this.env;
      const gain = Math.min(1, this.sum / size);
      const next = (at + 1) % size; // the oldest sample in the delay line
      outL[i] = this.left[next] * gain;
      if (outR !== outL) outR[i] = this.right[next] * gain;
      this.left[at] = l;
      this.right[at] = r;
      this.at = next;
      this.written++;
      if (this.written >= 2 ** 40) this.written = this.written % (size * 1024) + size * 1024;
    }
    return true;
  }
}
registerProcessor('melody-limiter', MelodyLimiter);
