// Поддельный WebRTC для тестов: два «соединения» связываются через общий реестр, каналы открываются после обмена приглашением и ответом.
"use strict";
class FakeChannel {
  constructor(label, opts) { this.label = label; this.opts = opts; this.readyState = "connecting"; this.binaryType = "blob"; this.peer = null; this.sent = []; }
  send(data) {
    if (this.readyState !== "open") throw new Error("InvalidStateError");
    this.sent.push(data);
    const peer = this.peer;
    queueMicrotask(() => {
      if (!peer.onmessage || peer.readyState !== "open") return;
      // как настоящий канал: байты приходят ArrayBuffer'ом, если приёмник просил binaryType = "arraybuffer"
      const out = typeof data !== "string" && peer.binaryType === "arraybuffer" ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
      peer.onmessage({ data: out });
    });
  }
  open() { this.readyState = "open"; this.onopen && this.onopen({}); }
  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed"; this.onclose && this.onclose({});
    if (this.peer && this.peer.readyState !== "closed") this.peer.close();
  }
}

let counter = 0;
const registry = new Map();

class FakePC {
  constructor(config) {
    this.config = config; this.id = ++counter; this.channels = []; this.iceGatheringState = "new"; this.closed = false;
    registry.set(this.id, this); FakePC.all.push(this);
  }
  createDataChannel(label, opts) { const ch = new FakeChannel(label, opts); this.channels.push(ch); return ch; }
  async createOffer() { return { type: "offer", sdp: sdp(this.id, "offer", this.channels.map(c => c.label)) }; }
  async createAnswer() { return { type: "answer", sdp: sdp(this.id, "answer", [], this.remoteId) }; }
  async setLocalDescription(d) {
    this.localDescription = d;
    if (!FakePC.neverGather) { this.iceGatheringState = "complete"; this.onicegatheringstatechange && this.onicegatheringstatechange(); }
    else { this.iceGatheringState = "gathering"; this.onicegatheringstatechange && this.onicegatheringstatechange(); }
    for (const ms of FakePC.candidateTimes) setTimeout(() => this.onicecandidate && this.onicecandidate({ candidate: { candidate: "candidate:1 1 udp 1 192.0.2.1 9 typ host" } }), ms);
  }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
    const peerId = +/a=fake-id:(\d+)/.exec(d.sdp)[1];
    this.remoteId = peerId;
    const other = registry.get(peerId);
    if (d.type === "offer") {
      other.remoteId = this.id;
      for (const ch of other.channels) {
        const mirror = new FakeChannel(ch.label, ch.opts);
        mirror.peer = ch; ch.peer = mirror; this.channels.push(mirror);
        queueMicrotask(() => this.ondatachannel && this.ondatachannel({ channel: mirror }));
      }
    } else {
      for (const ch of this.channels) queueMicrotask(() => { ch.open(); ch.peer.open(); });
    }
  }
  close() { this.closed = true; this.channels.forEach(c => c.close()); }
}
FakePC.all = [];
FakePC.neverGather = false;
FakePC.candidateTimes = [];                       // когда (мс после setLocalDescription) приходят кандидаты
FakePC.reset = () => { FakePC.all = []; FakePC.neverGather = false; FakePC.candidateTimes = []; };

function sdp(id, kind, labels, remote) {
  return ["v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", `a=fake-id:${id}`, `a=fake-kind:${kind}`, ...(labels.length ? [`a=fake-labels:${labels.join(",")}`] : []),
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0", "a=ice-ufrag:abcd", "a=sctp-port:5000", ""].join("\r\n");
}

module.exports = { FakePC, FakeChannel, sdp };
