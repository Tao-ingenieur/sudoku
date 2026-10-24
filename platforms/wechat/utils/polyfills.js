/* Small compatibility polyfills for older WeChat base libraries. */
if (!Array.prototype.flatMap) {
  Object.defineProperty(Array.prototype, 'flatMap', {
    value: function flatMap(callback, thisArg) {
      const out = [];
      for (let i = 0; i < this.length; i++) {
        const value = callback.call(thisArg, this[i], i, this);
        if (Array.isArray(value)) out.push.apply(out, value);
        else out.push(value);
      }
      return out;
    },
    configurable: true,
    writable: true,
  });
}
if (!Uint16Array.from) {
  Uint16Array.from = function from(source) {
    const out = new Uint16Array(source.length);
    for (let i = 0; i < source.length; i++) out[i] = source[i];
    return out;
  };
}
if (!String.prototype.padStart) {
  String.prototype.padStart = function padStart(targetLength, padString) {
    const fill = padString === undefined ? ' ' : String(padString);
    let value = String(this);
    while (value.length < targetLength) value = fill + value;
    return value.slice(-Math.max(targetLength, String(this).length));
  };
}
