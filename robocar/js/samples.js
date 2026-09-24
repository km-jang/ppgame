'use strict';
// 소리 파일 불러오기 (sounds/*.ogg, Kenney 무료 소리, sounds/LICENSE.md).
// 파일을 못 받거나 못 풀면(오래된 기기·인터넷 없음) 아무 일도 없고, 부르는 쪽은 합성음을 그대로 쓴다.
// 미리보기처럼 한 파일로 합칠 때는 window.SND_EMBED = {이름: base64}로 넣어 두면 그걸 쓴다.
(function (NS) {
  NS.makeSamples = function (dir) {
    const bufs = {};
    let ac = null, started = false;
    function fromB64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
    function decode(ab) { return new Promise((res, rej) => { try { const p = ac.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } }); }
    function load(ctx, names) {
      ac = ctx;
      if (started) return;
      started = true;
      const emb = (typeof window !== 'undefined' && window.SND_EMBED) || {};
      // 파일로 바로 연 경우(file://)는 브라우저가 소리 파일 읽기를 막으므로 시도하지 않는다
      const local = typeof location !== 'undefined' && location.protocol === 'file:';
      for (const n of names) {
        if (local && !emb[n]) continue;
        const src = emb[n] ? Promise.resolve(fromB64(emb[n]))
          : fetch(dir + n + '.ogg').then(r => { if (!r.ok) throw new Error('no file'); return r.arrayBuffer(); });
        src.then(decode).then(b => { bufs[n] = b; }).catch(() => { /* 합성음으로 대신 */ });
      }
    }
    // o: {vol, rate, dur(초, 이만큼만 틀고 끝을 부드럽게), off(시작 위치), loop}
    function play(n, bus, o) {
      const b = bufs[n];
      if (!b || !ac) return null;
      o = o || {};
      const s = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime + 0.003, v = o.vol == null ? 1 : o.vol;
      s.buffer = b; s.playbackRate.value = o.rate || 1; s.loop = !!o.loop;
      g.gain.setValueAtTime(v, t);
      if (o.dur) { g.gain.setValueAtTime(v, t + o.dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + o.dur); }
      s.connect(g); g.connect(bus);
      s.start(t, o.off || 0);
      if (o.dur) s.stop(t + o.dur + 0.02);
      return { src: s, gain: g };
    }
    return { load, play, has: n => !!bufs[n] };
  };
})(RC);
