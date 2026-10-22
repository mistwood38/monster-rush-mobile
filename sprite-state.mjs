/** Visual-only finite state animator. No browser API; usable in a Canvas/Three.js sprite layer.
 *  Intentional: source images are frame clips, not 3D bones or original full-body redraws.
 */
export class SpriteStateMachine {
  constructor(clips, initial = 'idle') {
    this.clips = clips;
    this.base = initial;
    this.state = initial;
    this.elapsed = 0;
    this.locked = false;
  }
  setBase(state) {
    if (!(state in this.clips)) throw new Error(`Unknown base state ${state}`);
    this.base = state;
    if (!this.locked && !this._isAction()) this._switch(state);
  }
  _isAction() { return ['shoot','hit','down','skill','attack','windup','recover'].includes(this.state); }
  _switch(state) { if (this.state !== state) { this.state = state; this.elapsed = 0; } }
  trigger(state) {
    if (!(state in this.clips)) return false;
    if (this.locked) return false;
    const priority = {idle:1,run:1,hover:1,shoot:2,skill:2,windup:3,attack:3,recover:2,hit:4,down:9};
    const p = priority[state] ?? 2, old = priority[this.state] ?? 1;
    if (this._isAction() && p < old) return false;
    this.state = state;
    this.elapsed = 0;
    if (state === 'down') this.locked = true;
    return true;
  }
  tick(deltaMs) {
    if (!(deltaMs >= 0) || !Number.isFinite(deltaMs)) throw new Error('invalid timestep');
    const clip = this.clips[this.state];
    if (!clip) throw new Error(`Missing clip: ${this.state}`);
    this.elapsed += Math.min(deltaMs, 100);
    const period = 1000 / Math.max(1, clip.fps || 1);
    const length = Math.max(1, clip.frames.length) * period;
    if (!clip.loop && !this.locked && this.elapsed >= length) {
      const oldState=this.state;
      if (oldState==='windup' && this.clips.attack) this._switch('attack');
      else if (oldState==='attack' && this.clips.recover) this._switch('recover');
      else this._switch(this.base);
    }
    return this.frame();
  }
  frame() {
    const clip = this.clips[this.state];
    if (!clip?.frames?.length) return null;
    const index = Math.floor((this.elapsed/1000) * Math.max(1,clip.fps||1));
    return {state:this.state, index:clip.loop ? index%clip.frames.length : Math.min(index,clip.frames.length-1),
      path:clip.frames[clip.loop ? index%clip.frames.length : Math.min(index,clip.frames.length-1)]};
  }
  reset(base='idle') { if (!(base in this.clips)) throw new Error('missing reset state');this.base=base;this.state=base;this.elapsed=0;this.locked=false; }
}
