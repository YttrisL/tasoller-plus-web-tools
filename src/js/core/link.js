// ---------------------------------------------------------------------------------------------
// Link: the client side of the command channel (HID interface with usage page 0xFF00)
//   cmd 1 handshake, cmd 2 version, cmd 4 update, and the settings commands used by TasollerDevice.
// `io` supplies exchange(frame, timeoutMs) -> Uint8Array(64) | null, recv(timeoutMs) and send(frame).
// ---------------------------------------------------------------------------------------------
class FlashError extends Error {}

class Link {
  constructor(io, log = () => {}) { this.io = io; this.log = log; this.rk = SHARED_RK; this.warned = false; this.logDetail = log; this.tail = Promise.resolve(); this.shaken = false; }

  lock(fn) { const run = this.tail.then(() => fn()); this.tail = run.then(() => {}, () => {}); return run; }

  async _handshake(quick) {
    let last = null;
    for (let attempt = 0; attempt < (quick ? 2 : 3); attempt++) {
      const challenge = randomBytes(16), nonce = randomBytes(1)[0];
      const request = buildFrame(1, nonce, challenge);                // sent in the clear
      const session = AES.ecb(SHARED_RK, challenge, true);            // session key = AES(shared key, challenge)
      this.rk = AES.expandKey(session);
      this.logDetail("> handshake " + hex(request, 24));
      const raw = await this.io.exchange(request, quick ? 900 : 1500);
      if (!raw) { last = "no answer"; continue; }
      const r = AES.ecb(this.rk, raw, false);
      this.logDetail("< " + hex(r, 24));
      if (r[1] !== 1 || r[2] !== nonce) { last = "the answer is not a valid handshake reply (wrong key, or not a Tasoller command channel)"; continue; }
      this.shaken = true;
      return;
    }
    this.rk = SHARED_RK; this.shaken = false;
    throw new FlashError("handshake failed: " + last);
  }

  // One request/reply. Returns the decrypted reply frame; throws if the device does not answer with
  // the same command (which is what the official tool counts as failure). Stale frames are skipped.
  async _request(cmd, payload, timeoutMs, what) {
    const nonce = randomBytes(1)[0];
    const plain = buildFrame(cmd, nonce, payload);
    this.logDetail("> " + hex(plain, 4 + payload.length));
    let raw = await this.io.exchange(AES.ecb(this.rk, plain, true), timeoutMs);
    for (let tries = 0; tries < 6; tries++) {
      if (!raw) throw new FlashError(what + ": no answer from the device");
      const r = AES.ecb(this.rk, raw, false);
      this.logDetail("< " + hex(r, 4 + Math.max(0, r[0] - 2)));
      if (r[1] === cmd) {
        if (!this.warned && (r[2] !== nonce || !frameChecksumOk(r))) {
          this.warned = true; this.log("note: a reply had a different nonce or a bad checksum (the official tool does not check this either)");
        }
        return r;
      }
      if (r[1] === CMD.ERROR) throw new FlashError(what + ": the device reported an error (status " + r[3] + ")");
      raw = await this.io.recv(timeoutMs);        // not our reply: look at the next report
    }
    throw new FlashError(what + ": unexpected replies");
  }

  handshake() { return this.lock(() => this._handshake()); }

  // Send one command, return the reply payload (bytes after [L][cmd][nonce]).
  command(cmd, payload, timeoutMs = 2000, what = "command 0x" + cmd.toString(16)) {
    return this.lock(async () => {
      const r = await this._request(cmd, Uint8Array.from(payload), timeoutMs, what);
      return r.slice(3, 1 + Math.min(r[0], 62));
    });
  }

  // Send a command the device never answers (it resets while carrying it out).
  sendNoReply(cmd, payload) {
    return this.lock(async () => {
      try { await this.io.send(AES.ecb(this.rk, buildFrame(cmd, randomBytes(1)[0], Uint8Array.from(payload)), true)); }
      catch (e) { this.log("command 0x" + cmd.toString(16) + ": " + e.message + " (normal if the device already reset)"); }
      this.shaken = false;
    });
  }

  async _version() {
    const r = await this._request(2, new Uint8Array(0), 1500, "reading the version");
    const n = Math.max(0, Math.min(r[0] - 2, 58));
    let s = ""; for (let i = 0; i < n && r[3 + i] !== 0; i++) s += String.fromCharCode(r[3 + i]);
    return s;
  }
  version() { return this.lock(() => this._version()); }
  probe(quick) { return this.lock(async () => { await this._handshake(quick); return this._version(); }); }

  update(image, packageVersion, onProgress = () => {}) { return this.lock(() => this._update(image, packageVersion, onProgress)); }
  async _update(image, packageVersion, onProgress) {
    if (image.length < 0x400 || image.length > SLOT_SIZE) throw new FlashError("image size out of range");
    await this._handshake();
    const deviceVersion = await this._version();
    this.log("device version: " + deviceVersion);
    const dp = versionPrefix(deviceVersion), pp = versionPrefix(packageVersion);
    if (dp === null || pp === null || dp !== pp)
      throw new FlashError("incompatible firmware versions (device '" + deviceVersion + "', package '" + packageVersion + "'); nothing was written");

    onProgress("erase", 0, image.length);
    await this._request(4, Uint8Array.from([1, ...u32le(image.length)]), 20000, "start of the update");
    let n = 0;
    for (let off = 0; off < image.length; off += CHUNK) {
      const chunk = image.subarray(off, Math.min(off + CHUNK, image.length));
      const p = new Uint8Array(5 + chunk.length); p[0] = 2; p.set(u32le(off), 1); p.set(chunk, 5);
      await this._request(4, p, 3000, "writing at offset 0x" + off.toString(16));
      if (++n % 16 === 0) onProgress("write", off + chunk.length, image.length);
    }
    onProgress("write", image.length, image.length);
    if (deviceVersion.includes("BOOT")) {
      this.log("device reports a BOOT version: the check step is skipped, as the official tool does");
    } else {
      onProgress("check", image.length, image.length);
      await this._request(4, Uint8Array.from([3, sum8(image)]), 10000, "final check");
    }
    // reboot: the device resets and does not answer
    const nonce = randomBytes(1)[0];
    try { await this.io.send(AES.ecb(this.rk, buildFrame(4, nonce, Uint8Array.from([4])), true)); }
    catch (e) { this.log("reboot command: " + e.message + " (normal if the device already reset)"); }
    this.shaken = false;
    onProgress("reboot", image.length, image.length);
    return deviceVersion;
  }
}

