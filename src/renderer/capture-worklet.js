// Copies microphone audio to the app, tagged with its exact position on the audio clock.
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage({ frame: currentFrame, data: channel.slice(0) });
    return true;
  }
}
registerProcessor('melody-capture', Capture);
