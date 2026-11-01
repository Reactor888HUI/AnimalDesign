// «Восьмёрка Баклажан» — прямое соединение игроков без сервера (WebRTC): хозяин создаёт «приглашение», друг отвечает «ответом».
// Коды — обычный текст (BK1.O.… / BK1.A.…), их можно переслать в мессенджере. По соединению идут два канала: «ctl» (надёжный, текст)
// и «pose» (без порядка и повторов, байты). Для остальной игры всё выглядит как обычный WebSocket (createRoomClient не знает разницы).
// Хозяин держит комнату у себя на странице (hub.js); гости — только клиенты. Проверяется tests/unit/direct.test.js (поддельный WebRTC)
// и tools/direct-browser.cjs (настоящий WebRTC в Chromium). Что приходит в код, разбирается один раз в decodeCode; кривое — CodeError по-русски.
"use strict";
(function (root) {
  const hubLib = typeof require !== "undefined" ? require("./hub.js") : root;
  const PREFIX = "BK1", MAX_CODE_CHARS = 8000, MAX_SDP_CHARS = 6000, MAX_SDP_LINES = 200, STUN = [{ urls: "stun:stun.l.google.com:19302" }];

  class CodeError extends Error {}

  function checkSdp(sdp) {
    if (typeof sdp !== "string" || sdp.length > MAX_SDP_CHARS) throw new CodeError("Описание соединения слишком длинное — код повреждён?");
    if (!/^[\x20-\x7e\r\n]*$/.test(sdp)) throw new CodeError("В коде есть недопустимые символы");
    if (!sdp.startsWith("v=0\r\n") || !sdp.endsWith("\r\n")) throw new CodeError("Код повреждён или обрезан — скопируйте его целиком");
    const lines = sdp.slice(0, -2).split("\r\n");
    if (lines.length > MAX_SDP_LINES || !lines.every(l => /^[a-z]=/.test(l))) throw new CodeError("Код повреждён — скопируйте его целиком");
    if (!/^m=application /m.test(sdp) || /^m=(audio|video)/m.test(sdp)) throw new CodeError("Это не код для игры (нет канала данных)");
  }

  const toBase64Url = text => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function fromBase64Url(text) {
    try {
      const b = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
      return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(b, c => c.charCodeAt(0)));
    } catch (e) { throw new CodeError("Код повреждён или обрезан — скопируйте его целиком"); }
  }

  // kind: "O" — приглашение, "A" — ответ.
  function encodeCode(kind, sdp) {
    checkSdp(sdp);
    return `${PREFIX}.${kind}.${toBase64Url(sdp)}`;
  }

  function decodeCode(text, kind) {
    if (typeof text !== "string") throw new CodeError("Код не найден — вставьте его целиком");
    const code = text.replace(/[\s«»"“”'`]/g, "");
    if (code.length > MAX_CODE_CHARS) throw new CodeError("Код слишком длинный — скопируйте только его");
    const m = /^BK1\.([OA])\.([A-Za-z0-9_-]+)$/.exec(code);
    if (!m) throw new CodeError("Это не код из игры — скопируйте его целиком, он начинается с BK1.");
    if (m[1] !== kind) throw new CodeError(kind === "O" ? "Это ответ, а здесь нужно приглашение" : "Это приглашение, а здесь нужен ответ");
    const sdp = fromBase64Url(m[2]);
    checkSdp(sdp);
    return sdp;
  }

  // Общая часть сокетов «как WebSocket»: обработчик открытия, поставленный после открытия, всё равно узнаёт о нём.
  class SocketBase {
    constructor() { this.readyState = 0; this.binaryType = "arraybuffer"; this._open = null; this.onmessage = null; this.onclose = null; }
    get onopen() { return this._open; }
    set onopen(fn) {
      this._open = fn;
      if (this.readyState === 1 && fn) queueMicrotask(() => { if (this._open === fn) fn({}); });
    }
    _opened() { if (this.readyState === 0) { this.readyState = 1; if (this._open) this._open({}); } }
    _closed() { if (this.readyState !== 3) { this.readyState = 3; if (this.onclose) this.onclose({}); } }
    _deliver(data) { if (this.onmessage) this.onmessage({ data }); }
  }

  // Сокет поверх двух каналов WebRTC: текст — в «ctl», байты — в «pose».
  class ChannelSocket extends SocketBase {
    constructor({ ctl, pose }) {
      super();
      this.ctl = ctl; this.pose = pose;
      for (const ch of [ctl, pose]) {
        ch.binaryType = "arraybuffer";
        ch.onmessage = e => this._deliver(e.data);
        ch.onclose = () => this._closed();
        ch.onopen = () => this._check();
      }
      this._check();
    }
    _check() { if (this.ctl.readyState === "open" && this.pose.readyState === "open") this._opened(); }
    send(data) {
      try { (typeof data === "string" ? this.ctl : this.pose).send(data); } catch (e) { /* ещё не открыт или закрывается — не страшно */ }
    }
    close() { this._closed(); this.ctl.close(); this.pose.close(); }
  }

  const asArrayBuffer = d => (typeof d === "string" ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));

  // Ждём адреса для соединения: до «сбор завершён», либо до тишины quietMs после последнего адреса, либо не дольше ms.
  // (Часть окружений присылает адреса сразу, а «завершено» — никогда или через секунды.)
  function gathered(pc, ms, quietMs) {
    return new Promise(resolve => {
      let quiet = null;
      const limit = setTimeout(finish, ms);
      function finish() { clearTimeout(limit); clearTimeout(quiet); pc.onicecandidate = null; pc.onicegatheringstatechange = null; resolve(); }
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") finish(); };
      pc.onicecandidate = e => {
        if (!e.candidate) return finish();
        clearTimeout(quiet);
        quiet = setTimeout(finish, quietMs);
      };
    });
  }

  function createDirectHost({ RTC = globalThis.RTCPeerConnection, stun = false, gatherMs = 2500, quietMs = 400, inviteTtlMs = 180000, maxGuests = 6, onState = () => {} } = {}) {
    const targets = new Map(), guests = new Map();          // id → сокет; id → { pc, sock }
    let pending = null, expired = false, next = 1;

    const hub = hubLib.createHub({ send: (id, data) => { const t = targets.get(id); if (t) t.send(data); }, close: id => { const t = targets.get(id); if (t) t.close(); } });

    // Сокет для собственного клиента хозяина: без сети, прямо в комнату.
    const local = new SocketBase();
    local.send = data => hub.receive("host", data);
    targets.set("host", { send: data => { const out = asArrayBuffer(data); queueMicrotask(() => local._deliver(out)); }, close: () => local._closed() });
    hub.connect("host");
    local._opened();

    function dropPending() {
      if (!pending) return;
      clearTimeout(pending.timer);
      pending.pc.close();
      pending = null;
    }

    function attach(id, pc, sock) {
      sock.onopen = () => { targets.set(id, sock); hub.connect(id); guests.set(id, { pc, sock }); if (pending && pending.id === id) { clearTimeout(pending.timer); pending = null; } onState("Друг подключился"); };
      sock.onmessage = e => hub.receive(id, e.data);
      sock.onclose = () => { hub.disconnect(id); targets.delete(id); guests.delete(id); pc.close(); onState("Друг отключился"); };
    }

    const host = {
      hub, guests: () => [...guests.keys()],
      Socket: function () { return local; },
      async invite() {
        if (guests.size >= maxGuests) throw new CodeError("Комната заполнена");
        dropPending(); expired = false;
        const pc = new RTC({ iceServers: stun ? STUN : [] }), id = "g" + next++;
        const ctl = pc.createDataChannel("ctl"), pose = pc.createDataChannel("pose", { ordered: false, maxRetransmits: 0 });
        const sock = new ChannelSocket({ ctl, pose });
        const timer = setTimeout(() => { if (pending && pending.id === id) { dropPending(); expired = true; onState("Приглашение устарело"); } }, inviteTtlMs);
        if (timer.unref) timer.unref();                                   // в Node таймер не удерживает процесс (в браузере setTimeout отдаёт число)
        pending = { pc, id, timer };
        attach(id, pc, sock);
        const ready = gathered(pc, gatherMs, quietMs);
        await pc.setLocalDescription(await pc.createOffer());
        await ready;
        return encodeCode("O", pc.localDescription.sdp);
      },
      async accept(code) {
        const sdp = decodeCode(code, "A");
        if (!pending) throw new CodeError(expired ? "Приглашение устарело — создайте новое" : "Сначала создайте приглашение");
        await pending.pc.setRemoteDescription({ type: "answer", sdp });
      },
      cancel: dropPending,
      close() {
        dropPending();
        hub.disconnect("host");
        local._closed();
        for (const { pc } of guests.values()) pc.close();
      },
    };
    local.close = () => host.close();                                   // клиент хозяина вышел — закрывается всё
    return host;
  }

  function createDirectGuest({ RTC = globalThis.RTCPeerConnection, stun = false, gatherMs = 2500, quietMs = 400 } = {}) {
    let sock = null, pc = null, resolveReady;
    const ready = new Promise(r => { resolveReady = r; });
    return {
      ready,
      Socket: function () { return sock; },
      async join(code) {
        const sdp = decodeCode(code, "O");
        pc = new RTC({ iceServers: stun ? STUN : [] });
        const channels = {};
        pc.ondatachannel = e => {
          channels[e.channel.label] = e.channel;
          if (channels.ctl && channels.pose && !sock) { sock = new ChannelSocket({ ctl: channels.ctl, pose: channels.pose }); resolveReady(sock); }
        };
        await pc.setRemoteDescription({ type: "offer", sdp });
        const done = gathered(pc, gatherMs, quietMs);
        await pc.setLocalDescription(await pc.createAnswer());
        await done;
        return encodeCode("A", pc.localDescription.sdp);
      },
      close() { if (sock) sock.close(); if (pc) pc.close(); },
    };
  }

  const api = { encodeCode, decodeCode, CodeError, ChannelSocket, createDirectHost, createDirectGuest };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
