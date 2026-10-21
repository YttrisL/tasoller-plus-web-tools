function store(k, v) { try { localStorage.setItem("tasoller." + k, v); } catch (e) {} }
function load(k) { try { return localStorage.getItem("tasoller." + k); } catch (e) { return null; } }
const hid = () => ("hid" in navigator) ? navigator.hid : null;

