import { Fragment as e, forwardRef as t, useCallback as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useReducer as s, useRef as c, useState as l } from "react";
import { ArrowLeft as u, Ban as d, Bell as f, Check as p, ChevronDown as m, ChevronRight as h, CircleCheck as g, CircleDashed as _, CircleDot as v, DoorClosed as y, DoorOpen as b, ExternalLink as x, FileText as S, Gauge as C, Ghost as w, GraduationCap as T, Hammer as E, History as D, Hourglass as O, Languages as k, LoaderCircle as A, Lock as j, LogOut as M, Map as ee, MapPin as te, Megaphone as ne, Moon as re, MousePointerClick as ie, Pause as ae, Play as oe, Plus as N, RefreshCw as se, Rotate3d as ce, RotateCcw as le, RotateCw as ue, Send as de, SkipBack as fe, SkipForward as pe, Square as me, TriangleAlert as P, Volume2 as he, VolumeX as ge, Wind as _e, X as ve } from "lucide-react";
import * as ye from "@kirocrew/app-sdk";
import { useAppApi as be, useAppEvents as xe } from "@kirocrew/app-sdk";
import { Fragment as F, jsx as I, jsxs as L } from "react/jsx-runtime";
function Se(e, t, n) {
	let r = n.left + n.width / 2, i = n.top + n.height * .35, a = e - r, o = t - i, s = Math.hypot(a, o);
	if (!Number.isFinite(s) || s === 0) return {
		dx: 0,
		dy: 0
	};
	let c = Math.min(1, s / 200);
	return {
		dx: a / s * 4 * c,
		dy: o / s * 4 * c
	};
}
function Ce(e, t) {
	r(() => {
		let n = e.current;
		if (!t || n === null || typeof window.matchMedia != "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		let r = (e) => {
			let { dx: t, dy: r } = Se(e.clientX, e.clientY, n.getBoundingClientRect());
			n.style.setProperty("--hh-eye-x", t.toFixed(2)), n.style.setProperty("--hh-eye-y", r.toFixed(2));
		};
		return window.addEventListener("pointermove", r), () => {
			window.removeEventListener("pointermove", r), n.style.removeProperty("--hh-eye-x"), n.style.removeProperty("--hh-eye-y");
		};
	}, [e, t]);
}
// src/core/backend-status.ts
var we = "/apps/haunted-house/api/whoami", Te = [
	"timeout",
	"unreachable",
	"denied",
	"config"
], Ee = /* @__PURE__ */ new Set(["ok", "replay"]), De = "Backend sent an unexpected reply.", Oe = "Request failed.", ke = 200;
function Ae(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function je(e) {
	return typeof e == "string" && Te.includes(e);
}
function Me(e) {
	return Ae(e) ? typeof e.version == "string" && e.version.trim() !== "" ? { version: e.version.trim() } : je(e.error) ? { error: e.error } : null : null;
}
function Ne(e) {
	if (!Ae(e) || typeof e.backend != "string" || !Ee.has(e.backend)) return {
		kind: "unreachable",
		message: De
	};
	let t = Me(e.gateway);
	return t === null ? {
		kind: "unreachable",
		message: De
	} : {
		kind: "ok",
		gateway: t
	};
}
function Pe(e) {
	if (!Ae(e) && !(e instanceof Error)) return;
	let t = e.status;
	if (typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599) return t;
}
function Fe(e) {
	let t = e instanceof Error || Ae(e) ? e.message : void 0;
	if (typeof t != "string") return Oe;
	let n = t.trim();
	return n === "" ? Oe : n.length > ke ? `${n.slice(0, 199)}…` : n;
}
function Ie(e) {
	let t = Pe(e), n = Fe(e);
	return t === void 0 ? {
		kind: "unreachable",
		message: n
	} : {
		kind: "unreachable",
		status: t,
		message: n
	};
}
var Le = "Mansion service sent an unexpected reply.", Re = "Mansion request failed.", ze = [
	"ready",
	"missing",
	"conflict"
], Be = ["created", "existing_compatible"], Ve = [
	"invalid_request",
	"invalid_mansion_name",
	"unsafe_mansion_root",
	"symlink_escape",
	"mansion_conflict",
	"mansion_missing",
	"mansion_not_registered",
	"metadata_unavailable",
	"filesystem_error"
], He = class extends Error {
	constructor() {
		super(Le), this.name = "MansionApiParseError";
	}
}, Ue = {
	invalid_request: "The mansion request was not understood.",
	invalid_mansion_name: "Use 1–40 lowercase letters, numbers, and single hyphens.",
	unsafe_mansion_root: "Mansion storage is not configured safely.",
	symlink_escape: "The mansion path is not safe to use.",
	mansion_conflict: "Existing content conflicts with this mansion. Nothing was changed.",
	mansion_missing: "This mansion is missing from storage.",
	mansion_not_registered: "This mansion is not registered. Refresh the list and try again.",
	metadata_unavailable: "Mansion records are unavailable. Try again.",
	filesystem_error: "Mansion storage could not be accessed."
};
function We(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Ge(e, t) {
	let n = Object.keys(e);
	return n.length === t.length && n.every((e) => t.includes(e));
}
function Ke(e, t) {
	return typeof e == "string" && t.includes(e);
}
function qe(e) {
	return typeof e != "string" || e.length === 0 || e.length > 40 ? !1 : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(e)?.[0] === e;
}
function Je(e, t) {
	if (typeof e != "string" || !e.startsWith("~/") || e.includes("\\")) return !1;
	let n = e.slice(2).split("/");
	return n.length > 0 && n.every((e) => e !== "" && e !== "." && e !== ".." && !/[\u0000-\u001f\u007f]/.test(e)) && n.at(-1) === t;
}
function Ye(e) {
	if (!We(e)) throw new He();
	let { name: t, projectSpec: n, displayPath: r, status: i } = e;
	if (!qe(t) || !qe(n) || n !== t || !Je(r, t) || !Ke(i, ze)) throw new He();
	return {
		name: t,
		projectSpec: n,
		displayPath: r,
		status: i
	};
}
function Xe(e) {
	if (!We(e) || e.schemaVersion !== 1 || !Array.isArray(e.mansions)) throw new He();
	let t = e.mansions.map(Ye);
	if (new Set(t.map(({ name: e }) => e)).size !== t.length) throw new He();
	return {
		schemaVersion: 1,
		mansions: t
	};
}
function Ze(e) {
	if (!We(e) || !Ke(e.outcome, Be)) throw new He();
	let t = Ye(e.mansion);
	if (t.status !== "ready") throw new He();
	return {
		outcome: e.outcome,
		mansion: t
	};
}
function Qe(e) {
	if (!We(e)) throw new He();
	let t = Ye(e.mansion);
	if (t.status !== "ready") throw new He();
	return { mansion: t };
}
function $e(e, t = Re) {
	if (typeof e != "string") return t;
	let n = e.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
	return n === "" ? t : n.length > 200 ? `${n.slice(0, 199)}…` : n;
}
var et = 2e3, tt = "[\\t\\n \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]", nt = RegExp(`^${tt}+|${tt}+$`, "g");
function rt(e) {
	let t = e.codePointAt(0) ?? 0;
	return t === 9 || t === 10 ? !1 : t <= 31 || t >= 127 && t <= 159 || t >= 55296 && t <= 57343;
}
function it(e) {
	let t = e.replace(/\r\n?/g, "\n"), n = t.replace(nt, ""), r = [...n].length;
	return [...t].some(rt) ? {
		ok: !1,
		reason: "invalid_characters",
		length: r
	} : r > 2e3 ? {
		ok: !1,
		reason: "too_long",
		length: r
	} : {
		ok: !0,
		brief: n === "" ? null : n,
		length: r
	};
}
function at(e, t) {
	if (t === void 0) return { name: e };
	let n = it(t);
	if (!n.ok) throw RangeError(`mansion brief refused: ${n.reason}`);
	return n.brief === null ? { name: e } : {
		name: e,
		brief: n.brief
	};
}
function ot(e) {
	if (!We(e) || !Ge(e, ["error"]) || !We(e.error)) throw new He();
	let t = e.error;
	if (!Ge(t, ["code", "message"]) || !Ke(t.code, Ve) || typeof t.message != "string" || t.message.trim() === "") throw new He();
	return { error: {
		code: t.code,
		message: Ue[t.code]
	} };
}
// src/adapters/sdk.ts
var st = "/apps/haunted-house/api/mansions", ct = "/apps/haunted-house/api/mansions/open", lt = class extends Error {
	code;
	status;
	constructor(e, t = {}) {
		super(e), this.name = "MansionApiRequestError", this.code = t.code, this.status = t.status;
	}
};
function ut(e) {
	return typeof e == "object" && !!e || e instanceof Error;
}
function dt(e) {
	if (!ut(e)) return;
	let t = e.status;
	return typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599 ? t : void 0;
}
function ft(e) {
	let t = dt(e);
	if (!ut(e) || typeof e.body != "string") return new lt(Re, { status: t });
	try {
		let n = ot(JSON.parse(e.body));
		return new lt(n.error.message, {
			code: n.error.code,
			status: t
		});
	} catch {
		return new lt(Le, { status: t });
	}
}
function pt(e, t) {
	return Promise.resolve().then(e).then(t, (e) => {
		throw ft(e);
	});
}
function mt() {
	let e = be(), t = c(e);
	return t.current = e, o(() => ({
		list: () => pt(() => t.current.get(st), Xe),
		create: (e, n) => pt(() => t.current.post(st, at(e, n)), Ze),
		open: (e) => pt(() => t.current.post(ct, { name: e }), Qe)
	}), []);
}
function ht() {
	let e = be(), [t, i] = l(0), [a, o] = l({ kind: "loading" });
	return r(() => {
		let t = !1;
		return o({ kind: "loading" }), Promise.resolve().then(() => e.get(we)).then((e) => {
			t || o(Ne(e));
		}, (e) => {
			t || o(Ie(e));
		}), () => {
			t = !0;
		};
	}, [t]), {
		state: a,
		retry: n(() => i((e) => e + 1), [])
	};
}
function gt() {
	try {
		let e = ye.useChatLauncher;
		return typeof e == "function" ? e : void 0;
	} catch {
		return;
	}
}
var _t = gt();
function vt() {
	let e = _t?.(), t = c(e);
	t.current = e;
	let r = n((e) => {
		e !== "" && t.current?.openChat?.({ slotKey: e });
	}, []);
	return typeof e?.openChat == "function" ? r : null;
}
var yt = {
	mode: "light",
	accent: null,
	colorTheme: null
}, bt = 64;
function xt(e) {
	if (typeof e != "string") return null;
	let t = e.trim();
	return t !== "" && t.length <= bt && /^[\w#(),.%\s-]+$/.test(t) ? t : null;
}
function St(e) {
	if (typeof e != "object" || !e) return yt;
	let t = e;
	return {
		mode: t.mode === "dark" ? "dark" : t.mode === "light" ? "light" : yt.mode,
		accent: xt(t.accent),
		colorTheme: xt(t.colorTheme)
	};
}
function Ct(e) {
	try {
		let t = ye[e];
		return typeof t == "function" ? t : void 0;
	} catch {
		return;
	}
}
var wt = Ct("useTheme"), Tt = Ct("useNotify"), Et = Ct("useNavBadge");
function Dt(e) {
	if (e !== void 0) try {
		return e();
	} catch {
		return;
	}
}
function Ot() {
	let e = St(Dt(wt));
	return o(() => e, [
		e.mode,
		e.accent,
		e.colorTheme
	]);
}
function kt(e) {
	typeof e == "object" && e && typeof e.then == "function" && e.then(void 0, () => {});
}
function At() {
	let e = Dt(Tt), t = c(e);
	return t.current = e, n((e) => {
		let n = t.current;
		if (typeof n != "function" || e === "") return !1;
		try {
			return kt(n(e)), !0;
		} catch {
			return !1;
		}
	}, []);
}
function jt() {
	let e = Dt(Et), t = c(e);
	return t.current = e, n((e) => {
		let n = t.current;
		if (typeof n != "function") return !1;
		let r = Number.isFinite(e) ? Math.max(0, Math.trunc(e)) : 0;
		try {
			return kt(n(r)), !0;
		} catch {
			return !1;
		}
	}, []);
}
function Mt() {
	try {
		let e = ye.replayRecording;
		if (typeof e != "object" || !e) return null;
		let { load: t, present: n } = e;
		return typeof t == "function" && typeof n == "function" ? e : null;
	} catch {
		return null;
	}
}
var Nt = Mt(), Pt = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, transparent)`, Ft = `
/* Night paper: everything that carries words on the house's own paper (the balloon, the guide's settings, the toolbar's
   tags, the room's plate, the labels, the hall) is dark slate with bone ink, so nothing on the page is pale. */
.hh-guide-balloon, .hh-foyer-hall, .hh-stage-setting, .hh-stage-room-title, .hh-stage-label, .hh-stage-call, .hh-stage-exit, .hh-stage-pose, .hh-hall-pose,
.hh-ui-toolbar .hh-ui-mansion-name, .hh-ui-toolbar .hh-ui-toggle, .hh-ui-toolbar .hh-ui-status > summary, .hh-ui-toolbar .hh-ui-needs[data-count='0'],
.hh-ui-toolbar .hh-ui-reason, .hh-house[data-landing='true'] .hh-status[data-quiet='true'] {
  --hh-sc-ink: var(--hh-sc-slate-ink); --hh-sc-balloon: var(--hh-sc-slate); --hh-sc-brass: var(--hh-sc-slate-brass); }
.hh-guide-balloon { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; color: var(--hh-sc-ink); background: var(--hh-sc-balloon);
  border: 2px solid var(--hh-sc-ink); border-radius: 10px; box-shadow: 0 8px 28px color-mix(in srgb, var(--hh-sc-poche) 80%, transparent); }
/* What is true now stays in view. What can be done lies under it, and scrolls where the layout gives the balloon a height. */
.hh-guide-head, .hh-guide-body { display: grid; gap: 6px; min-width: 0; padding: 0 16px; }
.hh-guide-head { flex: none; padding-top: 12px; padding-bottom: 6px; }
.hh-guide-body { flex: 0 1 auto; min-height: 0; padding-bottom: 12px; }
.hh-guide-head:empty, .hh-guide-body:empty { display: none; }
.hh-guide-balloon p, .hh-guide-balloon ul, .hh-guide-balloon dl, .hh-guide-balloon dd { margin: 0; }
.hh-guide-status { font-family: var(--hh-font-serif); font-weight: 700; font-size: 1.125rem; line-height: 1.25; overflow-wrap: anywhere; }
.hh-guide-status:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 3px; border-radius: 2px; }
.hh-guide-terms { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 0.8125rem; }
.hh-guide-term { display: contents; }
.hh-guide-what { font: inherit; font-family: var(--hh-font-serif); color: var(--hh-sc-ink); background: none; border: 0; padding: 0;
  text-decoration: underline; cursor: pointer; }
.hh-guide-what:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 2px; }
.hh-guide-about { flex-basis: 100%; font-size: 0.875rem; line-height: 1.35; padding: 4px 8px; border-left: 4px solid var(--hh-sc-ink); }
.hh-guide-note { font-size: 0.875rem; line-height: 1.35; padding: 4px 8px; border-left: 4px solid var(--hh-sc-ink); background: ${Pt("--hh-sc-brass", 30)}; }
.hh-guide-question { font-family: var(--hh-font-serif); font-size: 0.9375rem; }
.hh-guide-options { list-style: none; padding: 0; display: grid; gap: 2px 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); min-width: 0; }
.hh-guide-option { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; width: 100%; min-width: 0; font: inherit;
  font-family: var(--hh-font-serif); text-align: left; color: var(--hh-sc-ink); background: transparent; border: 2px solid transparent; border-radius: 10px;
  padding: 3px 10px 3px 4px; cursor: pointer; }
.hh-guide-option:hover { border-color: var(--hh-sc-ink); background: ${Pt("--hh-sc-brass", 40)}; }
.hh-guide-option:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 1px; background: ${Pt("--hh-sc-brass", 40)}; }
.hh-guide-bullet { width: 1.25rem; aspect-ratio: 1; margin-top: 1px; border-radius: 50%; border: 2px solid var(--hh-sc-ink);
  background: radial-gradient(circle at 35% 30%, var(--hh-sc-moon), var(--hh-sc-brass) 62%); }
.hh-guide-option-words { display: grid; min-width: 0; }
.hh-guide-option-label { font-size: 1rem; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
.hh-guide-consequence { font-size: 0.8125rem; line-height: 1.3; overflow-wrap: anywhere; }
.hh-guide-kiro { font-weight: 400; font-style: italic; }
.hh-guide-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 2px; }
.hh-guide-foot-button, .hh-stage-setting, .hh-stage-call { display: inline-flex; align-items: center; gap: 4px; font: inherit; font-family: var(--hh-font-serif);
  font-size: 0.875rem; font-weight: 700; color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 999px;
  padding: 1px 12px; cursor: pointer; }
.hh-guide-foot-button:hover, .hh-stage-setting:hover, .hh-stage-call:hover { background: var(--hh-sc-brass); }
.hh-guide-foot-button:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 2px; }
.hh-stage-setting:focus-visible, .hh-stage-call:focus-visible { outline: 3px solid var(--hh-sc-lamp); outline-offset: 2px; }
/* Pressed: brass and a double border. The same height as unpressed, so pressing one never moves the row. */
.hh-stage-setting[aria-pressed='true'] { background: var(--hh-sc-brass); border-style: double; border-width: 3px; padding: 0 11px; }
.hh-guide-everything { display: grid; gap: 8px; padding-top: 8px; border-top: 2px dashed var(--hh-sc-ink); min-width: 0; }
.hh-guide-book-title { font-family: var(--hh-font-serif); font-size: 0.9375rem; font-weight: 700; }
.hh-guide-book { display: grid; gap: 6px; font-size: 0.8125rem; line-height: 1.35; }
.hh-guide-book dt { font-weight: 700; }
.hh-guide-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;
// src/components/house-art.tsx
function It({ viewBox: e, className: t, width: n, height: r, preserveAspectRatio: i, data: a = {}, children: o }) {
	return /* @__PURE__ */ I("svg", {
		viewBox: e,
		className: `hh-ui-art ${t}`,
		width: n,
		height: r,
		preserveAspectRatio: i,
		"aria-hidden": "true",
		focusable: "false",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 2,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		...a,
		children: o
	});
}
var Lt = "var(--hh-surface-raised, none)", Rt = [
	"plain",
	"archivist",
	"draughtsman",
	"foreman",
	"tinker",
	"medium"
];
function zt(e) {
	return Rt.find((t) => t !== "plain" && (e === t || e.startsWith(`${t}-`))) ?? "plain";
}
var Bt = {
	plain: "M10 40 V20 a10 10 0 0 1 20 0 V40 l-3.5 -4 l-3.5 4 l-3 -4 l-3 4 l-3.5 -4 z",
	archivist: "M12 42 V18 a8 8 0 0 1 16 0 V36 q0 5 4 6 q-6 1 -8 -3 l-4 4 l-4 -4 z",
	draughtsman: "M10 40 V22 L20 6 L30 22 V40 l-5 -4 l-5 4 l-5 -4 z",
	foreman: "M7 40 V24 q0 -6 5 -8 a8 8 0 0 1 16 0 q5 2 5 8 V40 h-6 v-3 h-4 v3 h-4 v-3 h-4 v3 z",
	tinker: "M11 38 V24 a9 9 0 0 1 18 0 V38 l-3 -4 l-3 4 l-3 -4 l-3 4 l-3 -4 z",
	medium: "M4 40 q6 -4 6 -18 a10 10 0 0 1 20 0 q0 14 6 18 q-6 2 -9 -2 l-3.5 4 l-3.5 -4 l-3.5 4 l-3.5 -4 q-3 4 -9 2 z"
}, Vt = {
	plain: null,
	archivist: /* @__PURE__ */ I("path", {
		d: "M30 28 h8 v9 h-8 z M34 28 v9",
		strokeWidth: 1
	}),
	draughtsman: /* @__PURE__ */ I("path", {
		d: "M31 38 l4 -12 l4 12 M33 33 h4",
		strokeWidth: 1
	}),
	foreman: /* @__PURE__ */ I("path", {
		d: "M11 13 a9 7 0 0 1 18 0 h3 M11 13 h18",
		strokeWidth: 1.5
	}),
	tinker: /* @__PURE__ */ I("path", {
		d: "M31 38 l5 -9 m-3 -1 a3 3 0 1 0 5 3",
		strokeWidth: 1.5
	}),
	medium: /* @__PURE__ */ I("path", {
		d: "M20 3 l1.5 3 l3 .5 l-2.2 2 l.6 3 l-2.9 -1.6 l-2.9 1.6 l.6 -3 l-2.2 -2 l3 -.5 z",
		strokeWidth: 1
	})
}, Ht = {
	idle: {
		tilt: "",
		marks: /* @__PURE__ */ I("path", { d: "M14 22 q2 2 4 0 M22 22 q2 2 4 0 M10 28 q-3 3 -2 7 M30 28 q3 3 2 7" })
	},
	working: {
		tilt: "rotate(6 20 40)",
		marks: /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I("circle", {
				cx: "17",
				cy: "21",
				r: "1.5",
				fill: "currentColor"
			}),
			/* @__PURE__ */ I("circle", {
				cx: "25",
				cy: "21",
				r: "1.5",
				fill: "currentColor"
			}),
			/* @__PURE__ */ I("path", { d: "M30 29 L41 18 M41 18 q3 -6 -1 -9 q-3 5 -6 12 M30 29 l-1 3" }),
			/* @__PURE__ */ I("path", { d: "M44 26 v-3 M42.5 24.5 h3 M8 22 v-3 M6.5 20.5 h3" })
		] })
	},
	waiting: {
		tilt: "",
		marks: /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I("circle", {
				cx: "16",
				cy: "21",
				r: "1.5",
				fill: "currentColor"
			}),
			/* @__PURE__ */ I("circle", {
				cx: "24",
				cy: "21",
				r: "1.5",
				fill: "currentColor"
			}),
			/* @__PURE__ */ I("path", { d: "M14 27 q2 2 4 0" }),
			/* @__PURE__ */ I("path", { d: "M30 24 L37 13 M10 28 q-3 3 -2 7" }),
			/* @__PURE__ */ L("g", {
				className: "hh-ui-art-glow",
				children: [/* @__PURE__ */ I("circle", {
					cx: "38",
					cy: "7",
					r: "7",
					fill: "currentColor",
					fillOpacity: .25,
					stroke: "none"
				}), /* @__PURE__ */ I("path", {
					d: "M35 4 h6 v7 h-6 z M38 1 v3 M34 11 h8",
					fill: "currentColor",
					fillOpacity: .5
				})]
			})
		] })
	},
	blocked: {
		tilt: "",
		dash: "5 3",
		marks: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("path", { d: "M14 22 h4 M22 22 h4 M16 28 h8 M12 33 L28 29 M12 29 L28 33" }), /* @__PURE__ */ I("g", {
			className: "hh-ui-art-web",
			strokeWidth: 1,
			children: /* @__PURE__ */ I("path", { d: "M30 4 L46 4 M46 4 L46 20 M46 4 L33 17 M38 4 q1 5 -3 8 q5 -2 11 0 M46 12 q-5 0 -8 -3" })
		})] })
	},
	failed: {
		tilt: "rotate(-24 20 40)",
		marks: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("path", { d: "M14 19 l4 4 M18 19 l-4 4 M22 19 l4 4 M26 19 l-4 4 M17 29 q3 -3 6 0 M9 30 l-4 6 M31 30 l4 6" }), /* @__PURE__ */ I("path", {
			className: "hh-ui-art-mark",
			d: "M38 6 l8 8 M46 6 l-8 8",
			strokeWidth: 3
		})] })
	},
	done: {
		tilt: "",
		marks: /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I("circle", {
				className: "hh-ui-art-check",
				cx: "20",
				cy: "24",
				r: "19",
				fill: "currentColor",
				fillOpacity: .12,
				stroke: "none"
			}),
			/* @__PURE__ */ I("path", { d: "M14 22 q2 -3 4 0 M22 22 q2 -3 4 0 M16 27 q4 4 8 0 M10 24 L5 14 M30 24 L35 14" }),
			/* @__PURE__ */ I("path", {
				className: "hh-ui-art-check",
				d: "M36 30 l3 3 l6 -8",
				strokeWidth: 3
			})
		] })
	},
	not_applicable: {
		tilt: "",
		marks: null
	},
	unavailable: {
		tilt: "",
		marks: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("path", { d: "M16 18 a4 4 0 1 1 6 3.5 q-2 1 -2 4" }), /* @__PURE__ */ I("circle", {
			cx: "20",
			cy: "30",
			r: "0.8",
			fill: "currentColor"
		})] })
	}
};
function Ut({ state: e, variant: t = "plain", size: n = 40 }) {
	let r = Ht[e], i = e === "not_applicable" || e === "unavailable";
	return /* @__PURE__ */ I(It, {
		viewBox: "0 0 48 46",
		className: "hh-ui-art-ghost",
		width: n,
		height: Math.round(n * 46 / 48),
		data: {
			"data-ghost": e,
			"data-variant": t
		},
		children: /* @__PURE__ */ L("g", {
			transform: r.tilt === "" ? void 0 : r.tilt,
			children: [
				/* @__PURE__ */ I("path", {
					d: Bt[t],
					fill: i ? "none" : Lt,
					strokeDasharray: i ? "2 4" : r.dash
				}),
				i ? null : Vt[t],
				/* @__PURE__ */ I("g", {
					strokeWidth: 1.5,
					children: r.marks
				})
			]
		})
	});
}
var Wt = {
	sealed: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
			fill: Lt
		}),
		/* @__PURE__ */ I("path", {
			d: "M5 22 H27",
			strokeWidth: 3
		}),
		/* @__PURE__ */ I("circle", {
			cx: "16",
			cy: "22",
			r: "4",
			fill: Lt
		}),
		/* @__PURE__ */ I("path", {
			d: "M14.5 22 h3",
			strokeWidth: 1
		})
	] }),
	waiting: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
			fill: Lt
		}),
		/* @__PURE__ */ I("circle", {
			cx: "16",
			cy: "18",
			r: "3"
		}),
		/* @__PURE__ */ I("path", { d: "M16 21 v3" }),
		/* @__PURE__ */ I("path", {
			d: "M28 12 l4 -3 M29 18 h5 M28 24 l4 3",
			strokeWidth: 1.5
		})
	] }),
	open: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38",
			strokeDasharray: "1 3"
		}),
		/* @__PURE__ */ I("path", {
			d: "M24 38 V8 l10 4 V42 z",
			fill: Lt
		}),
		/* @__PURE__ */ I("circle", {
			cx: "31",
			cy: "26",
			r: "1",
			fill: "currentColor"
		}),
		/* @__PURE__ */ I("path", {
			d: "M4 38 H24",
			strokeWidth: 1
		})
	] }),
	rejected: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("path", {
		d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
		fill: Lt
	}), /* @__PURE__ */ I("path", {
		d: "M4 14 L28 32 M28 14 L4 32",
		strokeWidth: 3
	})] }),
	not_applicable: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("path", { d: "M4 38 H28" }), /* @__PURE__ */ I("path", {
		d: "M8 38 V12 a8 8 0 0 1 16 0 V38",
		strokeDasharray: "1 5",
		strokeWidth: 1
	})] }),
	unavailable: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
			strokeDasharray: "2 4"
		}),
		/* @__PURE__ */ I("path", {
			d: "M13 18 a3.5 3.5 0 1 1 5 3 q-2 1 -2 4",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ I("circle", {
			cx: "16",
			cy: "30",
			r: "0.8",
			fill: "currentColor"
		})
	] })
};
function Gt({ state: e, size: t = 30 }) {
	return /* @__PURE__ */ I(It, {
		viewBox: "0 0 36 44",
		className: "hh-ui-art-door",
		width: t,
		height: Math.round(t * 44 / 36),
		data: { "data-door": e },
		children: Wt[e]
	});
}
// src/components/dread-art.tsx
var R = (e) => `hh-p-${e}`;
function Kt({ light: e, leakAt: t, effects: n }) {
	return n.stateLight ? /* @__PURE__ */ L("span", {
		className: "hh-dread-light",
		"data-light": e,
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ I("span", { className: "hh-dread-moon" }),
			e === "candle" ? /* @__PURE__ */ I("span", { className: "hh-dread-candle" }) : null,
			e === "leak" && t !== null ? /* @__PURE__ */ I("span", {
				className: "hh-dread-leak",
				"data-at": t
			}) : null
		]
	}) : null;
}
function qt({ effects: e }) {
	return !e.fog && !e.dust && !e.rain ? null : /* @__PURE__ */ L("span", {
		className: "hh-dread-air",
		"aria-hidden": "true",
		children: [
			e.rain ? /* @__PURE__ */ I("span", { className: "hh-dread-rain" }) : null,
			e.fog ? /* @__PURE__ */ I("span", { className: "hh-dread-fog" }) : null,
			e.dust ? /* @__PURE__ */ I(It, {
				viewBox: "0 0 1200 750",
				className: "hh-dread-dust",
				preserveAspectRatio: "none",
				children: Jt.map(([e, t, n], r) => /* @__PURE__ */ I("circle", {
					className: R("moon"),
					cx: e,
					cy: t,
					r: n,
					opacity: .35
				}, r))
			}) : null
		]
	});
}
var Jt = [
	[
		140,
		210,
		1.6
	],
	[
		260,
		330,
		1.2
	],
	[
		390,
		160,
		1.4
	],
	[
		455,
		420,
		1
	],
	[
		530,
		260,
		1.8
	],
	[
		610,
		380,
		1.1
	],
	[
		700,
		190,
		1.3
	],
	[
		780,
		300,
		1.5
	],
	[
		860,
		440,
		1
	],
	[
		930,
		230,
		1.2
	],
	[
		1010,
		350,
		1.6
	],
	[
		1080,
		180,
		1
	],
	[
		320,
		480,
		1.2
	],
	[
		680,
		470,
		1.4
	]
];
function Yt({ stance: e }) {
	return e === "edge" ? null : /* @__PURE__ */ I("span", {
		className: "hh-dread-shadow",
		"data-stance": e,
		"aria-hidden": "true"
	});
}
function Xt({ where: e, state: t }) {
	if (t !== "sealed" && t !== "open" && t !== "waiting") return null;
	let n = e === "side" ? {
		x: 1118,
		y: 388
	} : {
		x: 910,
		y: 412
	}, r = e === "side" ? {
		left: 1068,
		right: 1170,
		top: 300,
		bottom: 470
	} : {
		left: 842,
		right: 978,
		top: 318,
		bottom: 488
	};
	if (t === "open") {
		let t = e === "side" ? 612 : 530;
		return /* @__PURE__ */ L("g", {
			"data-binding": "broken",
			children: [
				/* @__PURE__ */ I(Zt, {
					from: [n.x - 70, t],
					to: [n.x + 30, t + 8]
				}),
				/* @__PURE__ */ I("path", {
					className: R("cloth-d"),
					d: `M${n.x - 34} ${t - 6} a12 12 0 0 1 12 -12 l4 14 Z`
				}),
				/* @__PURE__ */ I("path", {
					className: R("cloth-d"),
					d: `M${n.x - 14} ${t - 4} l6 -12 a12 12 0 0 1 10 14 Z`
				})
			]
		});
	}
	return /* @__PURE__ */ L("g", {
		"data-binding": t === "waiting" ? "straining" : "sealed",
		children: [
			/* @__PURE__ */ I(Zt, {
				from: [r.left, r.top],
				to: [r.right, r.bottom]
			}),
			/* @__PURE__ */ I(Zt, {
				from: [r.right, r.top],
				to: [r.left, r.bottom]
			}),
			/* @__PURE__ */ I("circle", {
				className: R("cloth-d"),
				cx: n.x,
				cy: n.y,
				r: 19
			}),
			/* @__PURE__ */ I("circle", {
				className: R("cloth"),
				cx: n.x,
				cy: n.y,
				r: 14
			}),
			/* @__PURE__ */ I("circle", {
				className: R("cloth-d"),
				cx: n.x,
				cy: n.y,
				r: 6
			}),
			/* @__PURE__ */ I("path", {
				className: R("cloth-d"),
				d: `M${n.x - 4} ${n.y + 16} l-6 18 l8 -4 Z M${n.x + 6} ${n.y + 16} l4 16 l4 -10 Z`
			})
		]
	});
}
function Zt({ from: e, to: t }) {
	let n = [];
	for (let r = 0; r <= 9; r += 1) {
		let i = r / 9, a = e[0] + (t[0] - e[0]) * i, o = e[1] + (t[1] - e[1]) * i + Math.sin(i * Math.PI) * 10;
		n.push(/* @__PURE__ */ I("ellipse", {
			className: R("stone"),
			cx: a,
			cy: o,
			rx: r % 2 == 0 ? 8 : 4,
			ry: r % 2 == 0 ? 4 : 7
		}, r));
	}
	return /* @__PURE__ */ I("g", { children: n });
}
var Qt = "M50 2 C30 2 20 22 20 48 C20 78 24 104 18 136 L26 128 L30 146 L38 132 L44 150 L50 134 L57 152 L62 132 L70 148 L74 128 L82 140 C76 108 80 78 80 48 C80 22 70 2 50 2 Z", $t = "M50 2 C70 2 80 22 80 48 C80 78 76 108 82 140 L74 128 L70 148 L64 134 C68 104 66 70 64 46 C62 24 58 8 50 2 Z", en = {
	idle: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("ellipse", {
		className: R("ink"),
		cx: 40,
		cy: 44,
		rx: 6,
		ry: 8
	}), /* @__PURE__ */ I("ellipse", {
		className: R("ink"),
		cx: 60,
		cy: 44,
		rx: 6,
		ry: 8
	})] }),
	working: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("ellipse", {
			className: R("ink"),
			cx: 44,
			cy: 42,
			rx: 5,
			ry: 8
		}),
		/* @__PURE__ */ I("ellipse", {
			className: R("ink"),
			cx: 62,
			cy: 42,
			rx: 5,
			ry: 8
		}),
		/* @__PURE__ */ I("path", {
			className: R("ghost-d"),
			d: "M76 70 C92 76 104 90 108 104 L100 106 C96 94 88 84 74 80 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: R("bone-d"),
			d: "M104 100 l10 -18 l3 2 l-9 18 Z"
		})
	] }),
	waiting: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("ellipse", {
			className: R("ink"),
			cx: 38,
			cy: 44,
			rx: 9,
			ry: 12
		}),
		/* @__PURE__ */ I("ellipse", {
			className: R("ink"),
			cx: 62,
			cy: 44,
			rx: 9,
			ry: 12
		}),
		/* @__PURE__ */ I("circle", {
			className: R("lamp"),
			cx: 38,
			cy: 46,
			r: 2.6
		}),
		/* @__PURE__ */ I("circle", {
			className: R("lamp"),
			cx: 62,
			cy: 46,
			r: 2.6
		}),
		/* @__PURE__ */ I("ellipse", {
			className: R("ink"),
			cx: 50,
			cy: 74,
			rx: 6,
			ry: 10
		})
	] }),
	blocked: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: R("ink"),
			d: "M32 44 h14 v5 h-14 Z M54 44 h14 v5 h-14 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: R("ink"),
			d: "M42 72 h16 v4 h-16 Z"
		}),
		[
			0,
			1,
			2,
			3,
			4,
			5
		].map((e) => /* @__PURE__ */ I("ellipse", {
			className: R("stone"),
			cx: 22 + e * 6,
			cy: 96 + e * 9,
			rx: e % 2 == 0 ? 5 : 3,
			ry: e % 2 == 0 ? 3 : 5
		}, e)),
		/* @__PURE__ */ I("rect", {
			className: R("stone"),
			x: 18,
			y: 86,
			width: 64,
			height: 7
		})
	] }),
	failed: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("ellipse", {
			className: R("ink"),
			cx: 40,
			cy: 46,
			rx: 7,
			ry: 5
		}),
		/* @__PURE__ */ I("ellipse", {
			className: R("ink"),
			cx: 60,
			cy: 46,
			rx: 7,
			ry: 5
		}),
		/* @__PURE__ */ I("path", {
			className: R("ink"),
			d: "M36 78 h28 v3 h-28 Z"
		})
	] }),
	done: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("ellipse", {
		className: R("ink"),
		cx: 40,
		cy: 46,
		rx: 4,
		ry: 2
	}), /* @__PURE__ */ I("ellipse", {
		className: R("ink"),
		cx: 60,
		cy: 46,
		rx: 4,
		ry: 2
	})] }),
	not_applicable: null,
	unavailable: null
}, tn = {
	idle: "rotate(4 50 140)",
	working: "rotate(10 50 140)",
	blocked: "rotate(-12 50 140)"
};
function nn({ state: e, role: t = "plain" }) {
	let n = e === "not_applicable" || e === "unavailable", r = R(e === "failed" ? "scorch" : e === "done" ? "ghost-faint" : e === "blocked" ? "ghost-d" : n ? "ghost-faint" : "ghost");
	return /* @__PURE__ */ I(It, {
		viewBox: "-30 -20 160 190",
		className: "hh-paint hh-paint-spectre hh-paint-hollow",
		data: {
			"data-ghost": e,
			"data-role": t,
			"data-hollow": "true"
		},
		children: /* @__PURE__ */ L("g", {
			stroke: "none",
			transform: tn[e],
			children: [
				e === "done" ? /* @__PURE__ */ I("ellipse", {
					className: R("ecto-glow"),
					cx: 50,
					cy: 80,
					rx: 52,
					ry: 78
				}) : null,
				/* @__PURE__ */ I("path", {
					className: r,
					d: Qt
				}),
				n || e === "failed" || e === "done" ? null : /* @__PURE__ */ I("path", {
					className: R("ghost-d"),
					d: $t
				}),
				e === "failed" ? /* @__PURE__ */ I("path", {
					className: R("ink"),
					d: Qt,
					opacity: .55,
					transform: "translate(50 76) scale(0.86) translate(-50 -76)"
				}) : null,
				en[e]
			]
		})
	});
}
// src/components/room-paint.tsx
var z = (e) => `hh-p-${e}`, rn = (e) => `hh-ps-${e}`, an = 1200;
function on(e) {
	let t = e % 2147483647;
	return t <= 0 && (t += 2147483646), () => (t = t * 16807 % 2147483647, (t - 1) / 2147483646);
}
var sn = [
	"cloth",
	"brass",
	"ecto-d",
	"paper-d",
	"night-2",
	"cloth-d",
	"wall-l",
	"brass-d"
];
function cn(e, t, n, r, i) {
	let a = on(i), o = [], s = e + 2, c = 0;
	for (; s < e + n - 8;) {
		let e = 7 + Math.round(a() * 9), n = Math.round(r * (.62 + a() * .36)), i = sn[Math.floor(a() * sn.length)];
		a() < .1 ? s += e + 6 : (o.push(/* @__PURE__ */ I("rect", {
			className: z(i),
			x: s,
			y: t + r - n,
			width: e,
			height: n
		}, `b${c}`)), o.push(/* @__PURE__ */ I("rect", {
			className: z("shade"),
			x: s + e - 2,
			y: t + r - n,
			width: 2,
			height: n
		}, `s${c}`)), a() < .5 && o.push(/* @__PURE__ */ I("rect", {
			className: z("brass-l"),
			x: s + 1,
			y: t + r - n + 6,
			width: e - 3,
			height: 2
		}, `t${c}`)), s += e + 1, c += 1);
	}
	return o;
}
function ln({ x: e, y: t, w: n, h: r, seed: i, shelves: a = 4 }) {
	let o = (r - 16) / a;
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("wood-d"),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-dd"),
			x: e + 10,
			y: t + 10,
			width: n - 20,
			height: r - 20
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-l"),
			x: e,
			y: t,
			width: n,
			height: 5
		}),
		Array.from({ length: a }, (r, a) => {
			let s = t + 10 + a * o;
			return /* @__PURE__ */ L("g", { children: [
				cn(e + 12, s + 6, n - 24, o - 14, i + a * 31),
				/* @__PURE__ */ I("rect", {
					className: z("wood"),
					x: e + 8,
					y: s + o - 8,
					width: n - 16,
					height: 8
				}),
				/* @__PURE__ */ I("rect", {
					className: z("wood-l"),
					x: e + 8,
					y: s + o - 8,
					width: n - 16,
					height: 2
				})
			] }, a);
		})
	] });
}
function un({ x: e, y: t, w: n, h: r }) {
	let i = (t) => e + t / 100 * n, a = (e) => t + e / 100 * r;
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("night-1"),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ I("rect", {
			className: z("night-2"),
			x: e,
			y: a(34),
			width: n,
			height: r * .2
		}),
		/* @__PURE__ */ I("rect", {
			className: z("night-3"),
			x: e,
			y: a(50),
			width: n,
			height: r * .14
		}),
		/* @__PURE__ */ I("rect", {
			className: z("night-4"),
			x: e,
			y: a(62),
			width: n,
			height: r * .1
		}),
		/* @__PURE__ */ I("circle", {
			className: z("moon-halo"),
			cx: i(68),
			cy: a(30),
			r: n * .2
		}),
		/* @__PURE__ */ I("circle", {
			className: z("moon"),
			cx: i(68),
			cy: a(30),
			r: n * .115
		}),
		/* @__PURE__ */ I("circle", {
			className: z("moon-d"),
			cx: i(64),
			cy: a(25),
			r: n * .022
		}),
		/* @__PURE__ */ I("circle", {
			className: z("moon-d"),
			cx: i(72),
			cy: a(35),
			r: n * .03
		}),
		/* @__PURE__ */ I("path", {
			className: z("hill-1"),
			d: `M${e} ${a(70)} Q${i(22)} ${a(52)} ${i(46)} ${a(68)} T${i(100)} ${a(60)} V${a(100)} H${e} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("hill-2"),
			d: `M${e} ${a(84)} Q${i(30)} ${a(70)} ${i(58)} ${a(84)} T${i(100)} ${a(78)} V${a(100)} H${e} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("hill-2"),
			d: `M${i(20)} ${a(86)} L${i(21)} ${a(52)} L${i(14)} ${a(38)} L${i(16)} ${a(37)} L${i(22)} ${a(47)} L${i(23)} ${a(30)} L${i(25)} ${a(30)} L${i(25)} ${a(46)} L${i(33)} ${a(34)} L${i(35)} ${a(36)} L${i(26)} ${a(54)} L${i(27)} ${a(86)} Z`
		}),
		[
			44,
			54,
			82
		].map((e, t) => /* @__PURE__ */ I("path", {
			className: z("hill-1"),
			d: `M${i(e)} ${a(82 - t)} v${-r * .07} a${n * .022} ${n * .022} 0 0 1 ${n * .044} 0 v${r * .07} Z`
		}, e)),
		[
			62,
			66,
			70,
			74
		].map((e) => /* @__PURE__ */ I("rect", {
			className: z("hill-2"),
			x: i(e),
			y: a(72),
			width: n * .012,
			height: r * .12
		}, e)),
		/* @__PURE__ */ I("rect", {
			className: z("hill-2"),
			x: i(60),
			y: a(76),
			width: n * .17,
			height: r * .015
		})
	] });
}
function dn({ x: e, y: t, w: n, h: r, curtains: i = !0 }) {
	let a = [
		1,
		2,
		3
	].map((t) => e + n / 4 * t), o = [1, 2].map((e) => t + r / 3 * e);
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("wood-dd"),
			x: e - 18,
			y: t - 18,
			width: n + 36,
			height: r + 36
		}),
		/* @__PURE__ */ I(un, {
			x: e,
			y: t,
			w: n,
			h: r
		}),
		a.map((e) => /* @__PURE__ */ I("rect", {
			className: z("wood-d"),
			x: e - 4,
			y: t,
			width: 8,
			height: r
		}, e)),
		o.map((t) => /* @__PURE__ */ I("rect", {
			className: z("wood-d"),
			x: e,
			y: t - 4,
			width: n,
			height: 8
		}, t)),
		/* @__PURE__ */ I("rect", {
			className: z("wood"),
			x: e - 26,
			y: t + r + 12,
			width: n + 52,
			height: 14
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-l"),
			x: e - 26,
			y: t + r + 12,
			width: n + 52,
			height: 3
		}),
		i ? /* @__PURE__ */ L("g", { children: [
			/* @__PURE__ */ I("rect", {
				className: z("brass-d"),
				x: e - 44,
				y: t - 36,
				width: n + 88,
				height: 8
			}),
			[e - 40, e + n - 30].map((e, n) => /* @__PURE__ */ L("g", { children: [
				/* @__PURE__ */ I("path", {
					className: z("cloth"),
					d: `M${e} ${t - 30} h70 q${n === 0 ? -10 : 10} ${r * .5} ${n === 0 ? -34 : 34} ${r * .62} q${n === 0 ? 22 : -22} ${r * .2} ${n === 0 ? 10 : -10} ${r * .5} h-46 Z`
				}),
				/* @__PURE__ */ I("path", {
					className: z("cloth-d"),
					d: `M${e + 18} ${t - 30} h10 q-6 ${r * .6} -8 ${r * 1.1} h-8 q8 -${r * .5} 6 -${r * 1.1} Z`
				}),
				/* @__PURE__ */ I("path", {
					className: z("cloth-d"),
					d: `M${e + 46} ${t - 30} h8 q-4 ${r * .5} -12 ${r * .7} h-6 q10 -${r * .3} 10 -${r * .7} Z`
				})
			] }, e)),
			/* @__PURE__ */ I("rect", {
				className: z("brass"),
				x: e - 46,
				y: t + r * .56,
				width: 26,
				height: 8
			}),
			/* @__PURE__ */ I("rect", {
				className: z("brass"),
				x: e + n + 20,
				y: t + r * .56,
				width: 26,
				height: 8
			})
		] }) : null
	] });
}
function fn({ x: e, y: t, h: n }) {
	let r = n * .26;
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("wood-d"),
			d: `M${e} ${t + n} V${t + n * .12} q${r / 2} ${-n * .14} ${r} 0 V${t + n} Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-dd"),
			x: e + r * .16,
			y: t + n * .34,
			width: r * .68,
			height: n * .5
		}),
		/* @__PURE__ */ I("rect", {
			className: z("glass"),
			x: e + r * .22,
			y: t + n * .36,
			width: r * .56,
			height: n * .46
		}),
		/* @__PURE__ */ I("rect", {
			className: z("brass-d"),
			x: e + r * .47,
			y: t + n * .36,
			width: r * .06,
			height: n * .3
		}),
		/* @__PURE__ */ I("circle", {
			className: z("brass"),
			cx: e + r * .5,
			cy: t + n * .7,
			r: r * .16
		}),
		/* @__PURE__ */ I("circle", {
			className: z("brass-l"),
			cx: e + r * .45,
			cy: t + n * .685,
			r: r * .05
		}),
		/* @__PURE__ */ I("circle", {
			className: z("brass-d"),
			cx: e + r * .5,
			cy: t + n * .2,
			r: r * .4
		}),
		/* @__PURE__ */ I("circle", {
			className: z("bone"),
			cx: e + r * .5,
			cy: t + n * .2,
			r: r * .33
		}),
		/* @__PURE__ */ I("path", {
			className: z("ink"),
			d: `M${e + r * .48} ${t + n * .2} v${-n * .065} h${r * .04} v${n * .065} l${r * .2} ${n * .03} l${-r * .02} ${n * .012} Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood"),
			x: e - 6,
			y: t + n - 14,
			width: r + 12,
			height: 14
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-l"),
			x: e - 6,
			y: t + n - 14,
			width: r + 12,
			height: 3
		}),
		/* @__PURE__ */ I("rect", {
			className: z("shade"),
			x: e + r * .82,
			y: t + n * .14,
			width: r * .18,
			height: n * .86
		})
	] });
}
function pn({ x: e, y: t, w: n, h: r }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("stone"),
			x: e,
			y: t + r * .16,
			width: n,
			height: r * .84
		}),
		/* @__PURE__ */ I("rect", {
			className: z("stone-l"),
			x: e - 12,
			y: t,
			width: n + 24,
			height: r * .16
		}),
		/* @__PURE__ */ I("rect", {
			className: z("stone-d"),
			x: e - 12,
			y: t + r * .13,
			width: n + 24,
			height: r * .04
		}),
		/* @__PURE__ */ I("path", {
			className: z("ink"),
			d: `M${e + n * .16} ${t + r} V${t + r * .5} q${n * .34} ${-r * .22} ${n * .68} 0 V${t + r} Z`
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ecto-glow"),
			cx: e + n * .5,
			cy: t + r * .86,
			rx: n * .3,
			ry: r * .2
		}),
		/* @__PURE__ */ I("path", {
			className: z("ecto-d"),
			d: `M${e + n * .3} ${t + r * .97} q${-n * .04} ${-r * .2} ${n * .06} ${-r * .3} q${n * .02} ${r * .1} ${n * .08} ${r * .06} q${-n * .02} ${-r * .18} ${n * .08} ${-r * .26} q${n * .04} ${r * .16} ${n * .1} ${r * .2} q${n * .06} ${-r * .04} ${n * .04} ${-r * .14} q${n * .1} ${r * .14} ${n * .06} ${r * .44} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("ecto"),
			d: `M${e + n * .4} ${t + r * .97} q${-n * .03} ${-r * .14} ${n * .05} ${-r * .2} q${n * .02} ${r * .06} ${n * .06} ${r * .02} q0 ${-r * .1} ${n * .05} ${-r * .14} q${n * .07} ${r * .12} ${n * .04} ${r * .32} Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-dd"),
			x: e + n * .24,
			y: t + r * .94,
			width: n * .52,
			height: r * .06
		}),
		[
			.08,
			.3,
			.52,
			.74
		].map((i, a) => /* @__PURE__ */ I("rect", {
			className: z("stone-d"),
			x: e + n * i,
			y: t + r * (a % 2 == 0 ? .3 : .24),
			width: n * .16,
			height: 3
		}, i))
	] });
}
function mn({ x: e, y: t, w: n, h: r }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("brass-d"),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ I("rect", {
			className: z("brass"),
			x: e + 4,
			y: t + 4,
			width: n - 8,
			height: r - 8
		}),
		/* @__PURE__ */ I("rect", {
			className: z("night-1"),
			x: e + 11,
			y: t + 11,
			width: n - 22,
			height: r - 22
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("paper-d"),
			cx: e + n * .5,
			cy: t + r * .42,
			rx: n * .15,
			ry: r * .16
		}),
		/* @__PURE__ */ I("path", {
			className: z("cloth-d"),
			d: `M${e + 11} ${t + r - 11} q${n * .39 - 11} ${-r * .5} ${n - 22} 0 Z`
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: e + n * .44,
			cy: t + r * .41,
			rx: n * .03,
			ry: r * .035
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: e + n * .56,
			cy: t + r * .41,
			rx: n * .03,
			ry: r * .035
		})
	] });
}
function hn({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("circle", {
			className: z("lamp-glow"),
			cx: e,
			cy: t - 20,
			r: 70
		}),
		/* @__PURE__ */ I("path", {
			className: z("brass-d"),
			d: `M${e - 16} ${t + 12} h32 l-6 12 h-20 Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("bone"),
			x: e - 6,
			y: t - 14,
			width: 12,
			height: 26
		}),
		/* @__PURE__ */ I("path", {
			className: z("lamp"),
			d: `M${e} ${t - 44} q11 16 0 28 q-11 -12 0 -28 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("moon"),
			d: `M${e} ${t - 34} q5 9 0 16 q-5 -7 0 -16 Z`
		})
	] });
}
function gn({ x: e }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("ink"),
			x: e - 2,
			y: 0,
			width: 4,
			height: 96
		}),
		/* @__PURE__ */ I("circle", {
			className: z("lamp-glow"),
			cx: e,
			cy: 130,
			r: 150
		}),
		/* @__PURE__ */ I("path", {
			className: z("ink"),
			d: `M${e - 110} 122 q110 54 220 0 v10 q-110 54 -220 0 Z`
		}),
		[
			-104,
			-52,
			0,
			52,
			104
		].map((t) => /* @__PURE__ */ L("g", { children: [/* @__PURE__ */ I("rect", {
			className: z("bone"),
			x: e + t - 5,
			y: t === 0 ? 118 : 100 + Math.abs(t) * .06,
			width: 10,
			height: 24
		}), /* @__PURE__ */ I("path", {
			className: z("lamp"),
			d: `M${e + t} ${t === 0 ? 92 : 74 + Math.abs(t) * .06} q9 14 0 24 q-9 -10 0 -24 Z`
		})] }, t))
	] });
}
function _n({ x: e, y: t, size: n, flip: r = !1 }) {
	let i = r ? -1 : 1, a = (r) => {
		let a = r * Math.PI / 180;
		return `M${e} ${t} l${i * Math.cos(a) * n} ${Math.sin(a) * n}`;
	}, o = (n) => `M${e + i * n} ${t} Q${e + i * n * .62} ${t + n * .62} ${e} ${t + n}`;
	return /* @__PURE__ */ L("g", {
		className: rn("web"),
		fill: "none",
		strokeWidth: 1.4,
		children: [/* @__PURE__ */ I("path", { d: [
			8,
			30,
			52,
			74
		].map(a).join(" ") }), /* @__PURE__ */ I("path", { d: [
			.34,
			.6,
			.86
		].map((e) => o(n * e)).join(" ") })]
	});
}
function vn(e) {
	return {
		top: 90 * e / 160,
		bottom: 640 - 120 * e / 160
	};
}
function yn(e, t, n) {
	let r = vn(e), i = vn(t), a = r.bottom - (r.bottom - r.top) * .66, o = i.bottom - (i.bottom - i.top) * .66, s = (e) => n ? an - e : e;
	return `M${s(e)} ${a} L${s(t)} ${o} L${s(t)} ${i.bottom} L${s(e)} ${r.bottom} Z`;
}
function bn({ mirror: e, state: t }) {
	let n = (t) => e ? an - t : t, r = t === "open", i = t === "waiting";
	return /* @__PURE__ */ L("g", {
		"data-paint-door": t,
		children: [
			/* @__PURE__ */ I("path", {
				className: z("wood-dd"),
				d: yn(30, 132, e)
			}),
			r || i ? /* @__PURE__ */ I("path", {
				className: z("lamp"),
				d: yn(38, 124, e)
			}) : null,
			r || i ? /* @__PURE__ */ I("path", {
				className: z("moon-halo"),
				d: yn(38, 124, e)
			}) : null,
			r ? /* @__PURE__ */ I("path", {
				className: z("wood"),
				d: `M${n(124)} 232 L${n(150)} 214 L${n(150)} 582 L${n(124)} 548 Z`
			}) : /* @__PURE__ */ L("g", { children: [
				/* @__PURE__ */ I("path", {
					className: z("wood"),
					d: yn(i ? 62 : 38, 124, e)
				}),
				/* @__PURE__ */ I("path", {
					className: z("wood-d"),
					d: `M${n(i ? 74 : 56)} 290 L${n(108)} 286 L${n(108)} 380 L${n(i ? 74 : 56)} 392 Z`
				}),
				/* @__PURE__ */ I("path", {
					className: z("wood-d"),
					d: `M${n(i ? 74 : 56)} 420 L${n(108)} 404 L${n(108)} 528 L${n(i ? 74 : 56)} 560 Z`
				}),
				/* @__PURE__ */ I("circle", {
					className: z("brass"),
					cx: n(i ? 70 : 48),
					cy: 404,
					r: 7
				}),
				/* @__PURE__ */ I("circle", {
					className: z("brass-l"),
					cx: n(i ? 69 : 47),
					cy: 402,
					r: 2.5
				})
			] }),
			t === "sealed" ? /* @__PURE__ */ L("g", { children: [
				/* @__PURE__ */ I("path", {
					className: z("ink"),
					d: `M${n(30)} 380 L${n(132)} 362 L${n(132)} 382 L${n(30)} 402 Z`
				}),
				/* @__PURE__ */ I("circle", {
					className: z("brass"),
					cx: n(82),
					cy: 382,
					r: 13
				}),
				/* @__PURE__ */ I("circle", {
					className: z("ink"),
					cx: n(82),
					cy: 380,
					r: 4
				}),
				/* @__PURE__ */ I("rect", {
					className: z("ink"),
					x: n(82) - 2,
					y: 380,
					width: 4,
					height: 9
				})
			] }) : null,
			t === "rejected" ? /* @__PURE__ */ L("g", { children: [/* @__PURE__ */ I("path", {
				className: z("bone-d"),
				d: `M${n(26)} 300 L${n(136)} 420 L${n(136)} 442 L${n(26)} 324 Z`
			}), /* @__PURE__ */ I("path", {
				className: z("bone"),
				d: `M${n(26)} 470 L${n(136)} 300 L${n(136)} 324 L${n(26)} 496 Z`
			})] }) : null
		]
	});
}
function xn({ step: e }) {
	if (e === 0) return null;
	let t = /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I(_n, {
		x: 0,
		y: 0,
		size: 170
	}), /* @__PURE__ */ I(_n, {
		x: 1200,
		y: 0,
		size: 120,
		flip: !0
	})] });
	return e === null || e === 1 ? t : /* @__PURE__ */ L(F, { children: [
		t,
		/* @__PURE__ */ I(_n, {
			x: 160,
			y: 90,
			size: 110
		}),
		/* @__PURE__ */ I(_n, {
			x: 1040,
			y: 90,
			size: 130,
			flip: !0
		}),
		e === 3 ? /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I(_n, {
				x: 0,
				y: 0,
				size: 300
			}),
			/* @__PURE__ */ I(_n, {
				x: 1200,
				y: 0,
				size: 260,
				flip: !0
			}),
			/* @__PURE__ */ I("g", {
				className: rn("web"),
				fill: "none",
				strokeWidth: 1.2,
				children: /* @__PURE__ */ I("path", { d: "M300 90 q30 70 4 150 M320 90 q-12 60 10 120 M860 90 q24 80 -6 170 M880 90 q-10 50 12 110" })
			})
		] }) : null
	] });
}
function Sn({ floor: e, beams: t = !1, leftDoor: n, rightDoor: r, children: i, dread: a }) {
	let o = Array.from({ length: 17 }, (e, t) => -400 + t * 125);
	return /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: z("ceil"),
			d: "M0 0 H1200 L1040 90 H160 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("side"),
			d: "M0 0 L160 90 V520 L0 640 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("side-d"),
			d: "M1200 0 L1040 90 V520 L1200 640 Z"
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wall"),
			x: 160,
			y: 90,
			width: 880,
			height: 430
		}),
		Array.from({ length: 22 }, (e, t) => /* @__PURE__ */ I("rect", {
			className: z("wall-l"),
			x: 170 + t * 40,
			y: 112,
			width: 14,
			height: 318,
			opacity: .18
		}, t)),
		/* @__PURE__ */ I("rect", {
			className: z("wall-dd"),
			x: 160,
			y: 90,
			width: 880,
			height: 22
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wall-l"),
			x: 160,
			y: 108,
			width: 880,
			height: 4
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wall-d"),
			x: 160,
			y: 430,
			width: 880,
			height: 90
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wall-l"),
			x: 160,
			y: 430,
			width: 880,
			height: 5
		}),
		Array.from({ length: 8 }, (e, t) => /* @__PURE__ */ I("rect", {
			className: z("wall-dd"),
			x: 176 + t * 110,
			y: 448,
			width: 94,
			height: 52
		}, t)),
		/* @__PURE__ */ I("rect", {
			className: z("wood-dd"),
			x: 160,
			y: 508,
			width: 880,
			height: 12
		}),
		/* @__PURE__ */ I("path", {
			className: z("wall-dd"),
			d: "M0 484 L160 430 V520 L0 640 Z",
			opacity: .55
		}),
		/* @__PURE__ */ I("path", {
			className: z("wall-dd"),
			d: "M1200 484 L1040 430 V520 L1200 640 Z",
			opacity: .7
		}),
		/* @__PURE__ */ I("path", {
			className: z(e === "tiles" ? "tile" : "floor"),
			d: "M160 520 H1040 L1200 640 V750 H0 V640 Z"
		}),
		/* @__PURE__ */ L("g", {
			className: rn(e === "tiles" ? "tile-line" : "floor-line"),
			fill: "none",
			strokeWidth: e === "tiles" ? 3 : 2,
			children: [/* @__PURE__ */ I("path", { d: o.map((e) => `M${600 + (e - 600) * 220 / 450} 520 L${e} 750`).join(" ") }), e === "tiles" ? /* @__PURE__ */ I("path", { d: [
				540,
				566,
				598,
				640,
				694
			].map((e) => `M${160 - (e - 520) * 160 / 120} ${e} H${1040 + (e - 520) * 160 / 120}`).join(" ") }) : null]
		}),
		/* @__PURE__ */ I("path", {
			className: z("shade"),
			d: "M160 520 H1040 L1090 558 H110 Z",
			opacity: .6
		}),
		t ? /* @__PURE__ */ L("g", { children: [
			/* @__PURE__ */ I("path", {
				className: z("wood-dd"),
				d: "M0 0 H70 L250 90 H160 Z"
			}),
			/* @__PURE__ */ I("path", {
				className: z("wood-dd"),
				d: "M1200 0 H1130 L950 90 H1040 Z"
			}),
			[
				330,
				600,
				870
			].map((e) => /* @__PURE__ */ I("path", {
				className: z("wood-dd"),
				d: `M${600 + (e - 600) * 1.36 - 26} 0 h52 L${e + 18} 90 h-36 Z`
			}, e)),
			/* @__PURE__ */ I("rect", {
				className: z("wood-dd"),
				x: 160,
				y: 90,
				width: 880,
				height: 30
			}),
			/* @__PURE__ */ I("rect", {
				className: z("wood-d"),
				x: 160,
				y: 116,
				width: 880,
				height: 5
			})
		] }) : null,
		n ? /* @__PURE__ */ I(bn, {
			mirror: !1,
			state: "plain"
		}) : null,
		r === null ? null : /* @__PURE__ */ I(bn, {
			mirror: !0,
			state: r
		}),
		a !== void 0 && r !== null && r !== "plain" ? /* @__PURE__ */ I(Xt, {
			where: "side",
			state: r
		}) : null,
		i,
		/* @__PURE__ */ I(xn, { step: a === void 0 ? null : a.webs }),
		/* @__PURE__ */ I("path", {
			className: z("vignette"),
			d: "M0 0 H1200 V750 H0 Z"
		})
	] });
}
function Cn() {
	return /* @__PURE__ */ I("path", {
		className: z("moon-pool"),
		d: "M452 520 H748 L900 750 H300 Z"
	});
}
function wn({ x: e }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("wood-dd"),
			x: e - 4,
			y: 230,
			width: 8,
			height: 300
		}),
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e - 34} 536 q34 -22 68 0 v8 h-68 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e - 4} 250 l-34 -22 l4 -6 l30 18 Z M${e + 4} 250 l34 -22 l-4 -6 l-30 18 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("cloth-d"),
			d: `M${e + 8} 250 q40 30 34 150 q-22 14 -44 0 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("ink"),
			d: `M${e - 50} 224 h40 l-6 -30 h-28 Z M${e - 58} 224 h56 v7 h-56 Z`
		})
	] });
}
function Tn({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("wood-dd"),
			x: e - 5,
			y: t,
			width: 10,
			height: 92
		}),
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e - 36} ${t + 100} q36 -22 72 0 v8 h-72 Z`
		}),
		/* @__PURE__ */ I("circle", {
			className: z("night-3"),
			cx: e,
			cy: t - 34,
			r: 42
		}),
		/* @__PURE__ */ I("path", {
			className: z("ecto-d"),
			d: `M${e - 26} ${t - 56} q20 -10 30 6 q-6 16 -22 10 Z M${e + 4} ${t - 26} q22 -6 26 10 q-10 18 -26 6 Z M${e - 30} ${t - 22} q10 4 8 16 q-10 2 -12 -8 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("brass"),
			d: `M${e - 48} ${t - 34} a48 48 0 0 0 96 0 h-6 a42 42 0 0 1 -84 0 Z`
		})
	] });
}
function En({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e + 40} ${t + 60} h14 v150 h-14 Z M${e + 210} ${t + 20} h14 v190 h-14 Z M${e + 20} ${t + 200} h230 v12 h-230 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("wood"),
			d: `M${e} ${t + 70} L${e + 280} ${t} l8 24 L${e + 8} ${t + 96} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("wood-l"),
			d: `M${e} ${t + 70} L${e + 280} ${t} l1.5 5 L${e + 1.5} ${t + 75} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("blueprint"),
			d: `M${e + 40} ${t + 54} L${e + 244} ${t + 4} l7 22 L${e + 47} ${t + 76} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: rn("paper"),
			fill: "none",
			d: `M${e + 70} ${t + 56} l70 -17 M${e + 80} ${t + 66} l44 -11 M${e + 160} ${t + 30} l50 -12 l4 12 l-50 12 Z`,
			strokeWidth: 2
		}),
		/* @__PURE__ */ I("path", {
			className: z("brass"),
			d: `M${e + 250} ${t - 6} l40 -84 l8 4 l-38 84 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("lamp"),
			d: `M${e + 276} ${t - 104} l52 16 l-22 34 l-42 -14 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("lamp-glow"),
			d: `M${e + 264} ${t - 70} l42 14 l-60 90 l-110 -30 Z`
		})
	] });
}
function Dn({ x: e, y: t, w: n, h: r }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("wood-d"),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-l"),
			x: e,
			y: t,
			width: n,
			height: 4
		}),
		Array.from({ length: 6 }, (i, a) => /* @__PURE__ */ L("g", { children: [/* @__PURE__ */ I("rect", {
			className: z("wood"),
			x: e + 8,
			y: t + 10 + a * ((r - 14) / 6),
			width: n - 16,
			height: (r - 14) / 6 - 6
		}), /* @__PURE__ */ I("rect", {
			className: z("brass"),
			x: e + n / 2 - 14,
			y: t + 10 + a * ((r - 14) / 6) + ((r - 14) / 6 - 6) / 2 - 2,
			width: 28,
			height: 4
		})] }, a)),
		[
			.1,
			.3,
			.52,
			.72
		].map((r, i) => /* @__PURE__ */ L("g", { children: [/* @__PURE__ */ I("rect", {
			className: z(i % 2 == 0 ? "paper" : "blueprint"),
			x: e + n * r,
			y: t - 62 - i * 6,
			width: n * .14,
			height: 62 + i * 6
		}), /* @__PURE__ */ I("ellipse", {
			className: z(i % 2 == 0 ? "paper-d" : "night-2"),
			cx: e + n * (r + .07),
			cy: t - 62 - i * 6,
			rx: n * .07,
			ry: 5
		})] }, r))
	] });
}
function On({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("blueprint"),
			x: e,
			y: t,
			width: 190,
			height: 130
		}),
		/* @__PURE__ */ I("g", {
			className: rn("paper"),
			fill: "none",
			strokeWidth: 2.5,
			children: /* @__PURE__ */ I("path", { d: `M${e + 34} ${t + 104} V${t + 60} L${e + 82} ${t + 28} L${e + 130} ${t + 60} V${t + 104} Z M${e + 66} ${t + 104} V${t + 78} h26 v26 M${e + 104} ${t + 66} h16 v16 h-16 Z M${e + 20} ${t + 116} H${e + 170}` })
		}),
		/* @__PURE__ */ I("rect", {
			className: z("paper"),
			x: e + 26,
			y: t + 150,
			width: 120,
			height: 84
		}),
		/* @__PURE__ */ I("g", {
			className: rn("night-2"),
			fill: "none",
			strokeWidth: 2,
			children: /* @__PURE__ */ I("path", { d: `M${e + 40} ${t + 170} h92 M${e + 40} ${t + 186} h70 M${e + 40} ${t + 202} h84 M${e + 40} ${t + 218} h50` })
		}),
		[
			[e + 8, t + 8],
			[e + 182, t + 8],
			[e + 34, t + 156],
			[e + 138, t + 156]
		].map(([e, t]) => /* @__PURE__ */ I("circle", {
			className: z("cloth"),
			cx: e,
			cy: t,
			r: 5
		}, `${e}-${t}`)),
		/* @__PURE__ */ I("path", {
			className: z("wood"),
			d: `M${e + 160} ${t + 144} h56 v12 h-22 v96 h-12 v-96 h-22 Z`
		})
	] });
}
function kn({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("wood"),
			x: e,
			y: t,
			width: 220,
			height: 190
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-l"),
			x: e,
			y: t,
			width: 220,
			height: 4
		}),
		Array.from({ length: 5 }, (n, r) => Array.from({ length: 9 }, (n, i) => /* @__PURE__ */ I("circle", {
			className: z("wood-dd"),
			cx: e + 22 + i * 22,
			cy: t + 24 + r * 36,
			r: 2.5
		}, `${r}-${i}`))),
		/* @__PURE__ */ I("path", {
			className: z("bone-d"),
			d: `M${e + 20} ${t + 34} h30 v22 h-11 v80 h-8 v-80 h-11 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("brass-d"),
			d: `M${e + 70} ${t + 40} l64 22 l-6 16 l-64 -22 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e + 96} ${t + 72} l14 5 l-26 80 l-14 -5 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("bone-d"),
			d: `M${e + 150} ${t + 34} a22 22 0 1 0 30 30 l22 70 l14 -4 l-22 -70 a22 22 0 0 0 -44 -26 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("cloth"),
			d: `M${e + 150} ${t + 150} h52 v22 h-52 Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("ink"),
			x: e + 160,
			y: t + 140,
			width: 8,
			height: 12
		})
	] });
}
function An({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e + 24} ${t + 30} h20 v170 h-20 Z M${e + 396} ${t + 30} h20 v170 h-20 Z M${e + 44} ${t + 120} h352 v14 h-352 Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood"),
			x: e,
			y: t,
			width: 440,
			height: 32
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-l"),
			x: e,
			y: t,
			width: 440,
			height: 5
		}),
		/* @__PURE__ */ I("path", {
			className: z("ink"),
			d: `M${e + 330} ${t} v-34 h64 v34 Z M${e + 346} ${t - 34} v-22 h32 v22 Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("stone-l"),
			x: e + 310,
			y: t - 66,
			width: 104,
			height: 8
		}),
		/* @__PURE__ */ I("path", {
			className: z("cloth"),
			d: `M${e + 60} ${t} v-46 h120 v46 Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("cloth-d"),
			x: e + 60,
			y: t - 22,
			width: 120,
			height: 6
		}),
		/* @__PURE__ */ I("path", {
			className: z("brass"),
			d: `M${e + 96} ${t - 46} v-18 h48 v18 h-8 v-10 h-32 v10 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("bone-d"),
			d: `M${e + 220} ${t} l52 -74 l14 10 l-46 64 Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood-d"),
			x: e + 470,
			y: t + 110,
			width: 96,
			height: 90
		}),
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e + 470} ${t + 110} l96 90 h-10 l-86 -80 Z M${e + 566} ${t + 110} l-96 90 h10 l86 -80 Z`
		})
	] });
}
function jn({ x: e, y: t, w: n }) {
	let r = (t, r) => {
		let i = on(r), a = [/* @__PURE__ */ I("rect", {
			className: z("wood"),
			x: e,
			y: t + 62,
			width: n,
			height: 10
		}, "s"), /* @__PURE__ */ I("rect", {
			className: z("wood-l"),
			x: e,
			y: t + 62,
			width: n,
			height: 2
		}, "l")], o = e + 10, s = 0;
		for (; o < e + n - 34;) {
			let e = 22 + Math.round(i() * 16), n = 30 + Math.round(i() * 30), r = [
				"ecto-d",
				"night-3",
				"cloth-d",
				"brass-d"
			][Math.floor(i() * 4)];
			a.push(/* @__PURE__ */ L("g", { children: [
				/* @__PURE__ */ I("rect", {
					className: z("glass-l"),
					x: o,
					y: t + 62 - n,
					width: e,
					height: n
				}),
				/* @__PURE__ */ I("rect", {
					className: z(r),
					x: o + 2,
					y: t + 62 - n * .6,
					width: e - 4,
					height: n * .6 - 2
				}),
				/* @__PURE__ */ I("rect", {
					className: z("wood-dd"),
					x: o - 1,
					y: t + 56 - n,
					width: e + 2,
					height: 7
				})
			] }, s)), o += e + 10, s += 1;
		}
		return /* @__PURE__ */ I("g", { children: a }, t);
	};
	return /* @__PURE__ */ I("g", { children: [
		t,
		t + 86,
		t + 172
	].map((e, t) => r(e, 41 + t * 17)) });
}
function Mn({ x: e, y: t }) {
	let n = (e, t, n, r, i) => /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z(i),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ I("rect", {
			className: z("shade"),
			x: e,
			y: t + r * .34,
			width: n,
			height: 4
		}),
		/* @__PURE__ */ I("rect", {
			className: z("brass-d"),
			x: e + n * .12,
			y: t,
			width: 10,
			height: r
		}),
		/* @__PURE__ */ I("rect", {
			className: z("brass-d"),
			x: e + n * .82,
			y: t,
			width: 10,
			height: r
		}),
		/* @__PURE__ */ I("rect", {
			className: z("brass"),
			x: e + n * .46,
			y: t + r * .26,
			width: n * .08,
			height: r * .2
		})
	] }, `${e}-${t}`);
	return /* @__PURE__ */ L("g", { children: [
		n(e, t + 96, 210, 104, "wood-d"),
		n(e + 24, t + 22, 150, 76, "cloth-d"),
		n(e + 46, t - 30, 96, 54, "wood")
	] });
}
function Nn({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("lamp-glow"),
			d: `M${e + 96} ${t + 44} L${e + 420} ${t - 70} V${t + 190} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e + 30} ${t + 80} l-40 150 h10 l40 -150 Z M${e + 70} ${t + 80} l40 150 h-10 l-40 -150 Z M${e + 46} ${t + 80} h8 v150 h-8 Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("ink"),
			x: e,
			y: t + 20,
			width: 100,
			height: 62
		}),
		/* @__PURE__ */ I("circle", {
			className: z("stone"),
			cx: e + 22,
			cy: t + 2,
			r: 34
		}),
		/* @__PURE__ */ I("circle", {
			className: z("ink"),
			cx: e + 22,
			cy: t + 2,
			r: 8
		}),
		/* @__PURE__ */ I("circle", {
			className: z("stone"),
			cx: e + 84,
			cy: t - 14,
			r: 42
		}),
		/* @__PURE__ */ I("circle", {
			className: z("ink"),
			cx: e + 84,
			cy: t - 14,
			r: 9
		}),
		[
			0,
			72,
			144,
			216,
			288
		].map((n) => {
			let r = n * Math.PI / 180;
			return /* @__PURE__ */ I("circle", {
				className: z("stone-d"),
				cx: e + 84 + Math.cos(r) * 24,
				cy: t - 14 + Math.sin(r) * 24,
				r: 7
			}, n);
		}),
		/* @__PURE__ */ I("rect", {
			className: z("brass"),
			x: e + 96,
			y: t + 34,
			width: 28,
			height: 22
		}),
		/* @__PURE__ */ I("circle", {
			className: z("moon"),
			cx: e + 124,
			cy: t + 45,
			r: 9
		})
	] });
}
function Pn({ x: e, y: t, w: n, h: r }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("bone-d"),
			d: `M${e} ${t + r} V${t + r * .3} q${n * .1} ${-r * .34} ${n * .5} ${-r * .3} q${n * .4} ${-r * .04} ${n * .5} ${r * .3} V${t + r} q${-n * .1} ${-r * .05} ${-n * .2} 0 q${-n * .1} ${-r * .06} ${-n * .2} 0 q${-n * .1} ${-r * .05} ${-n * .2} 0 q${-n * .1} ${-r * .06} ${-n * .2} 0 q${-n * .1} ${-r * .05} ${-n * .2} 0 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("bone"),
			d: `M${e + n * .1} ${t + r * .9} V${t + r * .34} q${n * .1} ${-r * .24} ${n * .3} ${-r * .24} q${-n * .14} ${r * .1} ${-n * .14} ${r * .8} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("shade"),
			d: `M${e + n * .62} ${t + r * .14} q${n * .3} ${r * .06} ${n * .38} ${r * .3} V${t + r * .96} h${-n * .14} Z`
		})
	] });
}
function Fn({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e - 250} ${t + 190} v-150 h26 v70 h60 v80 h-18 v-56 h-42 v56 Z M${e + 250} ${t + 190} v-150 h-26 v70 h-60 v80 h18 v-56 h42 v56 Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("cloth-d"),
			d: `M${e - 170} ${t + 30} q20 110 46 170 h248 q26 -60 46 -170 Z`
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("cloth"),
			cx: e,
			cy: t + 30,
			rx: 170,
			ry: 30
		}),
		/* @__PURE__ */ I("path", {
			className: z("shade"),
			d: `M${e - 110} ${t + 70} q8 70 22 130 h10 q-12 -60 -18 -130 Z M${e + 20} ${t + 64} h14 v136 h-14 Z M${e + 110} ${t + 70} q-8 70 -22 130 h-10 q12 -60 18 -130 Z`
		}),
		/* @__PURE__ */ I("circle", {
			className: z("ecto-glow"),
			cx: e,
			cy: t - 34,
			r: 130
		}),
		/* @__PURE__ */ I("path", {
			className: z("brass-d"),
			d: `M${e - 40} ${t + 26} h80 l-12 -24 h-56 Z`
		}),
		/* @__PURE__ */ I("circle", {
			className: z("ecto-d"),
			cx: e,
			cy: t - 42,
			r: 56
		}),
		/* @__PURE__ */ I("circle", {
			className: z("ecto"),
			cx: e - 8,
			cy: t - 50,
			r: 42
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("moon"),
			cx: e - 22,
			cy: t - 66,
			rx: 12,
			ry: 18
		}),
		/* @__PURE__ */ I("rect", {
			className: z("bone"),
			x: e + 104,
			y: t - 24,
			width: 14,
			height: 50
		}),
		/* @__PURE__ */ I("path", {
			className: z("lamp"),
			d: `M${e + 111} ${t - 56} q10 16 0 28 q-10 -12 0 -28 Z`
		}),
		/* @__PURE__ */ I("rect", {
			className: z("brass-d"),
			x: e + 96,
			y: t + 22,
			width: 30,
			height: 8
		})
	] });
}
function In({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("cloth-d"),
			d: "M160 112 H1040 V150 q-110 44 -220 0 q-110 44 -220 0 q-110 44 -220 0 q-110 44 -220 0 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("cloth"),
			d: "M160 112 H1040 V132 q-110 40 -220 0 q-110 40 -220 0 q-110 40 -220 0 q-110 40 -220 0 Z"
		}),
		[
			-150,
			-75,
			0,
			75,
			150
		].map((n, r) => /* @__PURE__ */ L("g", { children: [
			/* @__PURE__ */ I("circle", {
				className: z("ink"),
				cx: e + n,
				cy: t,
				r: 26
			}),
			r === 2 ? /* @__PURE__ */ I("circle", {
				className: z("moon"),
				cx: e + n,
				cy: t,
				r: 24
			}) : null,
			r === 1 ? /* @__PURE__ */ I("path", {
				className: z("moon"),
				d: `M${e + n} ${t - 24} a24 24 0 0 1 0 48 a14 24 0 0 0 0 -48 Z`
			}) : null,
			r === 3 ? /* @__PURE__ */ I("path", {
				className: z("moon"),
				d: `M${e + n} ${t - 24} a24 24 0 0 0 0 48 a14 24 0 0 1 0 -48 Z`
			}) : null
		] }, n))
	] });
}
function Ln({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("brass-d"),
			d: `M${e} ${t + 300} V${t + 60} a70 70 0 0 1 140 0 V${t + 300} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("night-2"),
			d: `M${e + 14} ${t + 286} V${t + 60} a56 56 0 0 1 112 0 V${t + 286} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("night-3"),
			d: `M${e + 30} ${t + 286} L${e + 96} ${t + 16} l14 6 L${e + 60} ${t + 286} Z`
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("paper-d"),
			cx: e + 78,
			cy: t + 130,
			rx: 20,
			ry: 28,
			opacity: .5
		})
	] });
}
function Rn({ x: e, y: t }) {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("wood-dd"),
			d: `M${e - 26} ${t + 380} V${t + 110} a176 176 0 0 1 352 0 V${t + 380} Z`
		}),
		/* @__PURE__ */ I("path", {
			className: z("night-2"),
			d: `M${e} ${t + 110} a150 150 0 0 1 300 0 Z`
		}),
		/* @__PURE__ */ I("circle", {
			className: z("moon"),
			cx: e + 196,
			cy: t + 52,
			r: 34
		}),
		/* @__PURE__ */ I("g", {
			className: rn("wood-dd"),
			fill: "none",
			strokeWidth: 8,
			children: /* @__PURE__ */ I("path", { d: `M${e + 150} ${t - 36} V${t + 110} M${e + 44} ${t + 4} L${e + 150} ${t + 110} L${e + 256} ${t + 4}` })
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood"),
			x: e,
			y: t + 118,
			width: 146,
			height: 262
		}),
		/* @__PURE__ */ I("rect", {
			className: z("wood"),
			x: e + 154,
			y: t + 118,
			width: 146,
			height: 262
		}),
		[e + 18, e + 172].map((e) => /* @__PURE__ */ L("g", { children: [/* @__PURE__ */ I("rect", {
			className: z("wood-d"),
			x: e,
			y: t + 138,
			width: 110,
			height: 96
		}), /* @__PURE__ */ I("rect", {
			className: z("wood-d"),
			x: e,
			y: t + 252,
			width: 110,
			height: 110
		})] }, e)),
		/* @__PURE__ */ I("circle", {
			className: z("brass"),
			cx: e + 134,
			cy: t + 252,
			r: 8
		}),
		/* @__PURE__ */ I("circle", {
			className: z("brass"),
			cx: e + 166,
			cy: t + 252,
			r: 8
		}),
		/* @__PURE__ */ I("rect", {
			className: z("shade"),
			x: e + 146,
			y: t + 118,
			width: 8,
			height: 262
		})
	] });
}
function zn({ state: e }) {
	let t = e === "open";
	return /* @__PURE__ */ L("g", {
		"data-paint-door": e,
		children: [
			/* @__PURE__ */ I("path", {
				className: z("wood-dd"),
				d: "M836 520 V284 a74 74 0 0 1 148 0 V520 Z"
			}),
			t || e === "waiting" ? /* @__PURE__ */ I("path", {
				className: z("lamp"),
				d: "M848 520 V284 a62 62 0 0 1 124 0 V520 Z"
			}) : null,
			t ? /* @__PURE__ */ I("path", {
				className: z("wood"),
				d: "M972 240 L1010 262 V546 L972 520 Z"
			}) : /* @__PURE__ */ L("g", { children: [
				/* @__PURE__ */ I("path", {
					className: z("wood"),
					d: e === "waiting" ? "M872 520 V284 a50 62 0 0 1 100 0 V520 Z" : "M848 520 V284 a62 62 0 0 1 124 0 V520 Z"
				}),
				/* @__PURE__ */ I("rect", {
					className: z("wood-d"),
					x: 886,
					y: 300,
					width: 70,
					height: 84
				}),
				/* @__PURE__ */ I("rect", {
					className: z("wood-d"),
					x: 886,
					y: 404,
					width: 70,
					height: 96
				}),
				/* @__PURE__ */ I("circle", {
					className: z("brass"),
					cx: e === "waiting" ? 884 : 864,
					cy: 398,
					r: 7
				})
			] }),
			e === "sealed" ? /* @__PURE__ */ L("g", { children: [
				/* @__PURE__ */ I("rect", {
					className: z("ink"),
					x: 830,
					y: 372,
					width: 160,
					height: 20
				}),
				/* @__PURE__ */ I("circle", {
					className: z("brass"),
					cx: 910,
					cy: 382,
					r: 14
				}),
				/* @__PURE__ */ I("circle", {
					className: z("ink"),
					cx: 910,
					cy: 380,
					r: 4
				})
			] }) : null,
			e === "rejected" ? /* @__PURE__ */ L("g", { children: [/* @__PURE__ */ I("path", {
				className: z("bone-d"),
				d: "M826 300 L994 440 V462 L826 322 Z"
			}), /* @__PURE__ */ I("path", {
				className: z("bone"),
				d: "M826 480 L994 300 V324 L826 504 Z"
			})] }) : null
		]
	});
}
function Bn(e, t) {
	switch (e) {
		case "foyer": return /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I(Rn, {
				x: 450,
				y: 140
			}),
			/* @__PURE__ */ I(fn, {
				x: 212,
				y: 170,
				h: 350
			}),
			/* @__PURE__ */ I(mn, {
				x: 352,
				y: 170,
				w: 70,
				h: 92
			}),
			/* @__PURE__ */ I(mn, {
				x: 790,
				y: 150,
				w: 96,
				h: 124
			}),
			/* @__PURE__ */ I(mn, {
				x: 906,
				y: 186,
				w: 74,
				h: 96
			}),
			/* @__PURE__ */ I(hn, {
				x: 400,
				y: 340
			}),
			/* @__PURE__ */ I(hn, {
				x: 800,
				y: 340
			}),
			/* @__PURE__ */ I(wn, { x: 950 }),
			/* @__PURE__ */ I(gn, { x: 600 }),
			/* @__PURE__ */ I("path", {
				className: z("cloth-d"),
				d: "M380 600 Q600 548 820 600 Q600 668 380 600 Z"
			}),
			/* @__PURE__ */ I("path", {
				className: z("cloth"),
				d: "M420 600 Q600 562 780 600 Q600 650 420 600 Z"
			})
		] });
		case "study": return /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I(dn, {
				x: 470,
				y: 170,
				w: 260,
				h: 230
			}),
			/* @__PURE__ */ I(Cn, {}),
			/* @__PURE__ */ I(ln, {
				x: 176,
				y: 128,
				w: 216,
				h: 392,
				seed: 7,
				shelves: 5
			}),
			/* @__PURE__ */ I(pn, {
				x: 804,
				y: 300,
				w: 196,
				h: 220
			}),
			/* @__PURE__ */ I(mn, {
				x: 846,
				y: 150,
				w: 112,
				h: 132
			}),
			/* @__PURE__ */ I(Tn, {
				x: 420,
				y: 436
			}),
			/* @__PURE__ */ I(hn, {
				x: 770,
				y: 250
			}),
			t ? /* @__PURE__ */ I("circle", {
				className: z("lamp-glow"),
				cx: 600,
				cy: 420,
				r: 320
			}) : null,
			/* @__PURE__ */ I("path", {
				className: z("cloth-d"),
				d: "M300 610 Q600 560 900 610 Q600 676 300 610 Z"
			})
		] });
		case "drafting-room": return /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I(dn, {
				x: 470,
				y: 170,
				w: 260,
				h: 230,
				curtains: !1
			}),
			/* @__PURE__ */ I(Cn, {}),
			/* @__PURE__ */ I(On, {
				x: 186,
				y: 150
			}),
			/* @__PURE__ */ I(Dn, {
				x: 806,
				y: 352,
				w: 206,
				h: 168
			}),
			/* @__PURE__ */ I(hn, {
				x: 420,
				y: 270
			}),
			/* @__PURE__ */ I(En, {
				x: 300,
				y: 400
			}),
			t ? /* @__PURE__ */ I("circle", {
				className: z("lamp-glow"),
				cx: 560,
				cy: 380,
				r: 300
			}) : null
		] });
		case "workshop": return /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I(dn, {
				x: 500,
				y: 170,
				w: 200,
				h: 180,
				curtains: !1
			}),
			/* @__PURE__ */ I(kn, {
				x: 196,
				y: 150
			}),
			/* @__PURE__ */ I(jn, {
				x: 770,
				y: 140,
				w: 250
			}),
			/* @__PURE__ */ I("rect", {
				className: z("ink"),
				x: 598,
				y: 0,
				width: 4,
				height: 150
			}),
			/* @__PURE__ */ I("path", {
				className: z("ink"),
				d: "M560 150 h80 l24 40 h-128 Z"
			}),
			/* @__PURE__ */ I("path", {
				className: z("lamp-glow"),
				d: "M536 190 h128 l150 340 H386 Z"
			}),
			/* @__PURE__ */ I(An, {
				x: 300,
				y: 430
			}),
			t ? /* @__PURE__ */ I("circle", {
				className: z("lamp-glow"),
				cx: 600,
				cy: 420,
				r: 320
			}) : null
		] });
		case "attic": return /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I("circle", {
				className: z("wood-dd"),
				cx: 600,
				cy: 280,
				r: 126
			}),
			/* @__PURE__ */ L("g", { children: [
				/* @__PURE__ */ I("circle", {
					className: z("night-1"),
					cx: 600,
					cy: 280,
					r: 108
				}),
				/* @__PURE__ */ I("circle", {
					className: z("moon-halo"),
					cx: 628,
					cy: 262,
					r: 76
				}),
				/* @__PURE__ */ I("circle", {
					className: z("moon"),
					cx: 628,
					cy: 262,
					r: 46
				}),
				/* @__PURE__ */ I("circle", {
					className: z("moon-d"),
					cx: 614,
					cy: 250,
					r: 9
				}),
				/* @__PURE__ */ I("rect", {
					className: z("wood-dd"),
					x: 594,
					y: 172,
					width: 12,
					height: 216
				}),
				/* @__PURE__ */ I("rect", {
					className: z("wood-dd"),
					x: 492,
					y: 274,
					width: 216,
					height: 12
				})
			] }),
			/* @__PURE__ */ I("path", {
				className: z("moon-pool"),
				d: "M500 520 H700 L860 750 H340 Z"
			}),
			/* @__PURE__ */ I(Mn, {
				x: 196,
				y: 320
			}),
			/* @__PURE__ */ I(Pn, {
				x: 800,
				y: 240,
				w: 210,
				h: 280
			}),
			/* @__PURE__ */ I(Nn, {
				x: 470,
				y: 420
			})
		] });
		case "seance-room": return /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I(In, {
				x: 600,
				y: 216
			}),
			/* @__PURE__ */ I(jn, {
				x: 186,
				y: 176,
				w: 190
			}),
			/* @__PURE__ */ I(Ln, {
				x: 846,
				y: 196
			}),
			/* @__PURE__ */ I(hn, {
				x: 420,
				y: 300
			}),
			/* @__PURE__ */ I(hn, {
				x: 780,
				y: 300
			}),
			/* @__PURE__ */ I(Fn, {
				x: 600,
				y: 470
			})
		] });
	}
}
function Vn({ room: e, door: t, secondDoor: n = null, lit: r = !1, hasPrevious: i, hasNext: a, dread: o }) {
	return /* @__PURE__ */ I(It, {
		viewBox: `0 0 ${an} 750`,
		className: "hh-paint",
		preserveAspectRatio: "xMidYMid slice",
		data: {
			"data-scene": e,
			"data-lit": r ? "true" : "false"
		},
		children: /* @__PURE__ */ I("g", {
			stroke: "none",
			children: /* @__PURE__ */ L(Sn, {
				floor: e === "foyer" || e === "study" ? "tiles" : "planks",
				beams: e === "attic",
				leftDoor: i,
				rightDoor: t ?? (a ? "plain" : null),
				dread: o,
				children: [
					Bn(e, r),
					n === null ? null : /* @__PURE__ */ I(zn, { state: n }),
					o !== void 0 && n !== null ? /* @__PURE__ */ I(Xt, {
						where: "back",
						state: n
					}) : null
				]
			})
		})
	});
}
function Hn() {
	return /* @__PURE__ */ I(It, {
		viewBox: `0 0 ${an} 750`,
		className: "hh-paint hh-paint-desk",
		preserveAspectRatio: "xMidYMid slice",
		children: /* @__PURE__ */ L("g", {
			stroke: "none",
			children: [
				/* @__PURE__ */ I("path", {
					className: z("shade"),
					d: "M40 640 H820 L900 750 H0 Z",
					opacity: .7
				}),
				/* @__PURE__ */ I("path", {
					className: z("wood"),
					d: "M60 622 H800 L880 750 H0 V690 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("wood-l"),
					d: "M60 622 H800 L804 629 H56 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("wood-d"),
					d: "M0 716 H858 L880 750 H0 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("leather"),
					d: "M110 640 H770 L818 706 H66 Z"
				}),
				/* @__PURE__ */ I("g", {
					className: rn("brass-d"),
					fill: "none",
					strokeWidth: 2,
					children: /* @__PURE__ */ I("path", { d: "M124 648 H762 L798 698 H88 Z" })
				}),
				/* @__PURE__ */ I("ellipse", {
					className: z("lamp-glow"),
					cx: 118,
					cy: 610,
					rx: 120,
					ry: 90
				}),
				/* @__PURE__ */ I("path", {
					className: z("brass-d"),
					d: "M84 668 h68 l-10 12 h-48 Z"
				}),
				/* @__PURE__ */ I("rect", {
					className: z("bone"),
					x: 104,
					y: 612,
					width: 28,
					height: 58
				}),
				/* @__PURE__ */ I("path", {
					className: z("bone-d"),
					d: "M124 612 h8 v58 h-8 Z M108 620 q-6 16 0 30 h6 q-4 -14 0 -30 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("lamp"),
					d: "M118 566 q18 26 0 46 q-18 -20 0 -46 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("moon"),
					d: "M118 584 q8 14 0 26 q-8 -12 0 -26 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("cloth-d"),
					d: "M190 690 L330 706 L470 688 V698 L330 716 L190 700 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("paper"),
					d: "M196 686 q66 -26 134 14 q68 -40 134 -16 V640 q-66 -24 -134 16 q-68 -40 -134 -14 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("paper-d"),
					d: "M330 656 v44 q30 -16 60 -22 v-44 q-30 6 -60 22 Z",
					opacity: .5
				}),
				/* @__PURE__ */ I("g", {
					className: rn("ink-soft"),
					fill: "none",
					strokeWidth: 2,
					children: /* @__PURE__ */ I("path", { d: "M216 652 q46 -12 96 12 M216 664 q46 -12 96 12 M216 676 q46 -12 96 12 M350 664 q46 -24 96 -14 M350 676 q46 -24 96 -14" })
				}),
				/* @__PURE__ */ I("path", {
					className: z("cloth"),
					d: "M326 656 h8 v62 l-4 -6 l-4 6 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("bone"),
					d: "M396 676 q40 -70 100 -96 q-8 54 -84 106 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("bone-d"),
					d: "M396 676 q44 -52 100 -96 q-52 54 -90 102 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("ink"),
					d: "M490 660 h44 v26 h-44 Z M498 650 h28 v10 h-28 Z"
				}),
				/* @__PURE__ */ I("ellipse", {
					className: z("night-3"),
					cx: 512,
					cy: 651,
					rx: 10,
					ry: 3
				}),
				/* @__PURE__ */ I("path", {
					className: z("wood-dd"),
					d: "M560 690 h108 v10 h-108 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("brass"),
					d: "M570 690 q0 -50 44 -50 q44 0 44 50 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("brass-l"),
					d: "M584 684 q2 -30 22 -38 q-12 14 -12 38 Z"
				}),
				/* @__PURE__ */ I("path", {
					className: z("brass-d"),
					d: "M636 690 q-2 -34 -22 -50 q44 0 44 50 Z"
				}),
				/* @__PURE__ */ I("rect", {
					className: z("brass-d"),
					x: 608,
					y: 628,
					width: 12,
					height: 14
				}),
				/* @__PURE__ */ I("circle", {
					className: z("brass-l"),
					cx: 614,
					cy: 624,
					r: 8
				}),
				/* @__PURE__ */ I("path", {
					className: z("bone"),
					d: "M704 692 q-20 -4 -20 -28 q0 -26 28 -26 q28 0 28 26 q0 24 -20 28 v8 h-16 Z"
				}),
				/* @__PURE__ */ I("ellipse", {
					className: z("ink"),
					cx: 702,
					cy: 664,
					rx: 6,
					ry: 8
				}),
				/* @__PURE__ */ I("ellipse", {
					className: z("ink"),
					cx: 722,
					cy: 664,
					rx: 6,
					ry: 8
				}),
				/* @__PURE__ */ I("path", {
					className: z("ink"),
					d: "M712 674 l4 8 h-8 Z"
				})
			]
		})
	});
}
var Un = [
	"plain",
	"archivist",
	"draughtsman",
	"foreman",
	"tinker",
	"medium"
];
function Wn(e) {
	return Un.find((t) => t !== "plain" && (e === t || e.startsWith(`${t}-`))) ?? "plain";
}
var Gn = "M50 6 C26 6 14 28 14 56 C14 84 20 100 15 122 C23 114 30 126 38 116 C45 128 52 114 60 122 C70 130 84 128 94 112 C81 117 76 106 80 90 C84 72 86 62 86 54 C86 28 74 6 50 6 Z", Kn = "M50 6 C74 6 86 28 86 54 C86 62 84 72 80 90 C76 106 81 117 94 112 C84 128 70 130 60 122 C66 110 70 92 70 60 C70 34 64 14 50 6 Z", qn = {
	plain: null,
	archivist: /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("rect", {
			className: z("cloth"),
			x: 66,
			y: 70,
			width: 26,
			height: 34
		}),
		/* @__PURE__ */ I("rect", {
			className: z("paper"),
			x: 88,
			y: 72,
			width: 5,
			height: 30
		}),
		/* @__PURE__ */ I("rect", {
			className: z("brass"),
			x: 70,
			y: 78,
			width: 14,
			height: 3
		})
	] }),
	draughtsman: /* @__PURE__ */ L("g", { children: [/* @__PURE__ */ I("path", {
		className: z("brass"),
		d: "M70 104 L92 58 l7 4 L77 108 Z"
	}), /* @__PURE__ */ I("path", {
		className: z("bone-d"),
		d: "M70 104 l2 9 l5 -5 Z"
	})] }),
	foreman: /* @__PURE__ */ L("g", { children: [/* @__PURE__ */ I("path", {
		className: z("lamp"),
		d: "M22 30 q28 -34 56 0 Z"
	}), /* @__PURE__ */ I("rect", {
		className: z("lamp-d"),
		x: 16,
		y: 28,
		width: 70,
		height: 7
	})] }),
	tinker: /* @__PURE__ */ I("path", {
		className: z("stone-l"),
		d: "M74 108 L88 68 a12 12 0 1 1 9 4 L83 110 Z"
	}),
	medium: /* @__PURE__ */ I("path", {
		className: z("moon"),
		d: "M50 -14 l4 9 l10 1 l-7 7 l2 10 l-9 -5 l-9 5 l2 -10 l-7 -7 l10 -1 Z"
	})
}, Jn = {
	idle: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("ellipse", {
		className: z("ink"),
		cx: 38,
		cy: 50,
		rx: 6,
		ry: 3
	}), /* @__PURE__ */ I("ellipse", {
		className: z("ink"),
		cx: 62,
		cy: 50,
		rx: 6,
		ry: 3
	})] }),
	working: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: 38,
			cy: 50,
			rx: 6,
			ry: 9
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: 62,
			cy: 50,
			rx: 6,
			ry: 9
		}),
		/* @__PURE__ */ I("path", {
			className: z("moon"),
			d: "M4 34 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z M98 20 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z"
		})
	] }),
	waiting: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: 38,
			cy: 50,
			rx: 6,
			ry: 9
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: 62,
			cy: 50,
			rx: 6,
			ry: 9
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: 50,
			cy: 72,
			rx: 5,
			ry: 6
		}),
		/* @__PURE__ */ I("circle", {
			className: z("lamp-glow"),
			cx: 6,
			cy: 36,
			r: 30
		}),
		/* @__PURE__ */ I("path", {
			className: z("ghost"),
			d: "M16 62 L8 44 l6 -3 L24 60 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("brass-d"),
			d: "M-2 22 h18 v6 h-18 Z M0 28 h14 v20 h-14 Z"
		}),
		/* @__PURE__ */ I("rect", {
			className: z("lamp"),
			x: 3,
			y: 31,
			width: 8,
			height: 14
		})
	] }),
	blocked: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("rect", {
			className: z("ink"),
			x: 31,
			y: 48,
			width: 14,
			height: 4
		}),
		/* @__PURE__ */ I("rect", {
			className: z("ink"),
			x: 55,
			y: 48,
			width: 14,
			height: 4
		}),
		/* @__PURE__ */ I("rect", {
			className: z("ink"),
			x: 40,
			y: 70,
			width: 20,
			height: 3
		}),
		/* @__PURE__ */ I("path", {
			className: z("ghost-d"),
			d: "M24 84 L76 76 l1 9 L25 93 Z M24 76 L76 84 l-1 9 L23 85 Z"
		})
	] }),
	failed: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("path", {
		className: z("ink"),
		d: "M32 44 l12 12 l-3 3 l-12 -12 Z M44 44 l3 3 l-12 12 l-3 -3 Z M56 44 l12 12 l-3 3 l-12 -12 Z M68 44 l3 3 l-12 12 l-3 -3 Z"
	}), /* @__PURE__ */ I("path", {
		className: z("ink"),
		d: "M40 76 q10 -8 20 0 l-2 3 q-8 -6 -16 0 Z"
	})] }),
	done: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("ellipse", {
			className: z("brass"),
			cx: 50,
			cy: -6,
			rx: 24,
			ry: 6
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("night-1"),
			cx: 50,
			cy: -6,
			rx: 16,
			ry: 3
		}),
		/* @__PURE__ */ I("path", {
			className: z("ink"),
			d: "M31 52 q7 -9 14 0 l-2 2 q-5 -6 -10 0 Z M55 52 q7 -9 14 0 l-2 2 q-5 -6 -10 0 Z"
		})
	] }),
	not_applicable: null,
	unavailable: null
}, Yn = {
	working: "rotate(7 50 120)",
	failed: "rotate(-26 50 120)"
};
function Xn({ state: e, role: t = "plain" }) {
	let n = e === "not_applicable" || e === "unavailable";
	return /* @__PURE__ */ I(It, {
		viewBox: "-30 -30 160 170",
		className: "hh-paint hh-paint-spectre",
		data: {
			"data-ghost": e,
			"data-role": t
		},
		children: /* @__PURE__ */ L("g", {
			stroke: "none",
			transform: Yn[e],
			children: [
				/* @__PURE__ */ I("path", {
					className: z(n ? "ghost-faint" : e === "blocked" ? "ghost-d" : "ghost"),
					d: Gn
				}),
				n ? null : /* @__PURE__ */ I("path", {
					className: z("ghost-d"),
					d: Kn,
					opacity: e === "blocked" ? .4 : 1
				}),
				n ? null : qn[t],
				Jn[e]
			]
		})
	});
}
var Zn = "M110 4 C94 10 82 34 80 62 C80 74 80 82 78 88 C70 92 66 100 66 110 C64 170 62 230 56 288 L66 281 L76 294 L88 282 L100 295 L112 283 L124 295 L136 282 L148 294 L158 282 L166 290 C160 230 158 170 154 110 C154 100 150 92 142 88 C140 82 140 74 140 62 C138 34 126 10 110 4 Z", Qn = "M110 4 C126 10 138 34 140 62 C140 74 140 82 142 88 C150 92 154 100 154 110 C158 170 160 230 166 290 L158 282 L148 294 L136 282 L124 295 L118 289 C122 230 124 170 122 116 C120 80 116 40 110 4 Z", $n = "M110 4 C94 10 82 34 80 62 C80 74 80 82 78 88 C70 92 66 100 66 110 C64 170 62 230 56 288 L62 284 C67 230 69 170 71 112 C71 104 75 97 83 93 C85 86 85 76 85 64 C87 38 97 16 110 4 Z", er = "M110 22 C98 26 89 42 89 62 C89 78 98 88 110 88 C122 88 131 78 131 62 C131 42 122 26 110 22 Z", tr = [
	[
		144,
		196,
		8
	],
	[
		146,
		211,
		-8
	],
	[
		148,
		226,
		8
	],
	[
		150,
		241,
		-8
	],
	[
		152,
		256,
		8
	],
	[
		155,
		270,
		-14
	],
	[
		163,
		282,
		-52
	],
	[
		176,
		289,
		-80
	],
	[
		190,
		291,
		-90
	]
];
function nr({ at: e }) {
	return /* @__PURE__ */ I(F, { children: e.map(([e, t, n]) => /* @__PURE__ */ I("ellipse", {
		className: rn("chain"),
		cx: e,
		cy: t,
		rx: 4,
		ry: 8.5,
		strokeWidth: 3,
		transform: `rotate(${n} ${e} ${t})`
	}, `${e}-${t}`)) });
}
function rr({ turn: e }) {
	return /* @__PURE__ */ L("g", {
		transform: `rotate(${e} 110 221)`,
		children: [
			/* @__PURE__ */ I("circle", {
				className: rn("brass"),
				cx: 110,
				cy: 226,
				r: 4.5,
				strokeWidth: 3
			}),
			/* @__PURE__ */ I("rect", {
				className: z("brass"),
				x: 108,
				y: 231,
				width: 4,
				height: 34
			}),
			/* @__PURE__ */ I("rect", {
				className: z("brass"),
				x: 112,
				y: 252,
				width: 8,
				height: 4
			}),
			/* @__PURE__ */ I("rect", {
				className: z("brass"),
				x: 112,
				y: 259,
				width: 6,
				height: 4
			}),
			/* @__PURE__ */ I("rect", {
				className: z("brass-d"),
				x: 108,
				y: 231,
				width: 1.5,
				height: 34
			})
		]
	});
}
function ir({ keys: e = 3 }) {
	return /* @__PURE__ */ L("g", { children: [
		[
			-26,
			0,
			24
		].slice(0, e).map((e) => /* @__PURE__ */ I(rr, { turn: e }, e)),
		/* @__PURE__ */ I("circle", {
			className: rn("brass-d"),
			cx: 110,
			cy: 206,
			r: 17.5,
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ I("circle", {
			className: rn("brass"),
			cx: 110,
			cy: 206,
			r: 15,
			strokeWidth: 4.5
		})
	] });
}
function ar() {
	return /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I("path", {
			className: z("robe"),
			d: "M152 106 C154 140 148 170 134 196 C126 190 118 184 110 180 L110 168 C124 150 134 128 138 102 Z"
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("hood"),
			cx: 112,
			cy: 180,
			rx: 9,
			ry: 7
		}),
		/* @__PURE__ */ I("path", {
			className: z("bone"),
			d: "M105 185 q5 5 12 0 l0 5 q-7 5 -12 0 Z"
		})
	] });
}
var or = {
	watching: /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I(ir, {}),
		/* @__PURE__ */ I(ar, {}),
		/* @__PURE__ */ I("path", {
			className: z("robe-l"),
			d: "M68 106 C66 140 72 170 86 196 C94 190 102 184 110 180 L110 168 C96 150 86 128 82 102 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("robe-rim"),
			d: "M68 106 C66 140 72 170 86 196 L90 193 C78 168 73 140 74 108 Z"
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("hood"),
			cx: 108,
			cy: 180,
			rx: 9,
			ry: 7
		}),
		/* @__PURE__ */ I("path", {
			className: z("bone"),
			d: "M103 185 q5 5 12 0 l0 5 q-7 5 -12 0 Z"
		})
	] }),
	pointing: /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I(ir, {}),
		/* @__PURE__ */ I(ar, {}),
		/* @__PURE__ */ I("path", {
			className: z("robe-l"),
			d: "M80 100 L16 118 L18 134 C34 142 50 158 58 178 C68 162 76 144 82 128 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("robe-rim"),
			d: "M80 100 L16 118 L17 124 L80 108 Z"
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("hood"),
			cx: 18,
			cy: 126,
			rx: 4,
			ry: 8
		}),
		/* @__PURE__ */ I("path", {
			className: z("bone"),
			d: "M19 120 L1 123 L1 127 L10 128 L10 133 L19 134 Z"
		})
	] }),
	"offering-key": /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I(ir, { keys: 2 }),
		/* @__PURE__ */ I(ar, {}),
		/* @__PURE__ */ I("circle", {
			className: z("lamp-glow"),
			cx: 24,
			cy: 152,
			r: 38
		}),
		/* @__PURE__ */ I("circle", {
			className: z("moon-halo"),
			cx: 24,
			cy: 152,
			r: 24
		}),
		/* @__PURE__ */ I("path", {
			className: z("robe-l"),
			d: "M80 102 C58 112 36 132 26 156 L30 172 C44 176 60 172 72 160 C78 146 82 132 84 122 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("robe-rim"),
			d: "M80 102 C58 112 36 132 26 156 L28 162 C38 138 58 120 80 110 Z"
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("hood"),
			cx: 29,
			cy: 164,
			rx: 5,
			ry: 9,
			transform: "rotate(-20 29 164)"
		}),
		/* @__PURE__ */ I("path", {
			className: z("bone"),
			d: "M4 163 L28 159 L30 167 L6 173 Z"
		}),
		/* @__PURE__ */ L("g", {
			transform: "rotate(-9 22 152)",
			children: [
				/* @__PURE__ */ I("rect", {
					className: z("brass"),
					x: 0,
					y: 150,
					width: 38,
					height: 5
				}),
				/* @__PURE__ */ I("rect", {
					className: z("brass"),
					x: 0,
					y: 155,
					width: 5,
					height: 9
				}),
				/* @__PURE__ */ I("rect", {
					className: z("brass"),
					x: 8,
					y: 155,
					width: 4,
					height: 6
				}),
				/* @__PURE__ */ I("rect", {
					className: z("brass-l"),
					x: 2,
					y: 151,
					width: 34,
					height: 1.5
				}),
				/* @__PURE__ */ I("circle", {
					className: rn("brass"),
					cx: 45,
					cy: 152.5,
					r: 8,
					strokeWidth: 4.5
				})
			]
		})
	] }),
	holding: /* @__PURE__ */ L("g", { children: [
		/* @__PURE__ */ I(ir, {}),
		/* @__PURE__ */ I(ar, {}),
		/* @__PURE__ */ I("path", {
			className: z("ghost"),
			d: "M26 208 C12 208 5 221 5 236 C5 250 8 258 6 270 C10 266 14 272 18 267 C21 273 25 266 29 270 C34 274 42 272 48 264 C41 266 39 260 41 252 C43 243 46 238 46 234 C46 220 39 208 26 208 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("ghost-d"),
			d: "M26 208 C39 208 46 220 46 234 C46 238 43 243 41 252 C39 260 41 266 48 264 C42 272 34 274 29 270 C32 262 36 250 36 234 C36 222 32 212 26 208 Z"
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: 18,
			cy: 230,
			rx: 3,
			ry: 4.5
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: 30,
			cy: 230,
			rx: 3,
			ry: 4.5
		}),
		/* @__PURE__ */ I("ellipse", {
			className: z("ink"),
			cx: 24,
			cy: 241,
			rx: 2.5,
			ry: 3
		}),
		/* @__PURE__ */ I("path", {
			className: z("robe-l"),
			d: "M80 102 C68 120 56 150 50 182 L64 190 C73 170 80 146 86 126 Z"
		}),
		/* @__PURE__ */ I("path", {
			className: z("robe-rim"),
			d: "M80 102 C68 120 56 150 50 182 L55 185 C60 154 70 126 84 108 Z"
		}),
		/* @__PURE__ */ I("circle", {
			className: z("bone"),
			cx: 56,
			cy: 190,
			r: 6
		}),
		/* @__PURE__ */ I(nr, { at: [
			[
				52,
				201,
				28
			],
			[
				44,
				211,
				46
			],
			[
				9,
				251,
				72
			],
			[
				20,
				254,
				94
			],
			[
				31,
				254,
				86
			],
			[
				42,
				250,
				108
			]
		] })
	] })
};
function sr({ pose: e }) {
	let t = e === "stepped-back";
	return /* @__PURE__ */ I(It, {
		viewBox: "0 0 200 300",
		className: "hh-paint hh-paint-warden",
		data: { "data-pose": e },
		children: /* @__PURE__ */ L("g", {
			stroke: "none",
			children: [
				/* @__PURE__ */ I("ellipse", {
					className: z("shade"),
					cx: 110,
					cy: 291,
					rx: 62,
					ry: 6
				}),
				/* @__PURE__ */ L("g", {
					transform: t ? "translate(110 292) scale(0.84) translate(-110 -292)" : void 0,
					opacity: t ? .6 : 1,
					children: [
						/* @__PURE__ */ I("path", {
							className: z("robe"),
							d: Zn
						}),
						/* @__PURE__ */ I("path", {
							className: z("robe-d"),
							d: Qn
						}),
						/* @__PURE__ */ I("path", {
							className: z("robe-rim"),
							d: $n
						}),
						/* @__PURE__ */ I("path", {
							className: z("robe-d"),
							opacity: .55,
							d: "M84 196 C82 226 80 258 76 290 L82 286 C86 258 88 226 89 198 Z M100 204 C100 234 100 262 98 291 L103 288 C105 262 105 234 104 206 Z"
						}),
						/* @__PURE__ */ I(nr, { at: tr }),
						t ? /* @__PURE__ */ I("path", {
							className: z("robe-d"),
							d: "M110 8 C107 60 106 130 107 286 L113 286 C114 130 113 60 110 8 Z"
						}) : /* @__PURE__ */ L(F, { children: [
							/* @__PURE__ */ I("path", {
								className: z("hood"),
								d: er
							}),
							/* @__PURE__ */ I("circle", {
								className: z("lamp-glow"),
								cx: 100,
								cy: 57,
								r: 13
							}),
							/* @__PURE__ */ I("circle", {
								className: z("lamp-glow"),
								cx: 120,
								cy: 57,
								r: 13
							}),
							/* @__PURE__ */ I("path", {
								className: z("lamp"),
								d: "M93 52 L108 58 L106 62.5 L94 57.5 Z M127 52 L112 58 L114 62.5 L126 57.5 Z"
							}),
							/* @__PURE__ */ I("path", {
								className: z("moon"),
								d: "M97 55 L106 58.6 L105 60.3 L98 57.4 Z M123 55 L114 58.6 L115 60.3 L122 57.4 Z"
							}),
							or[e]
						] })
					]
				}),
				/* @__PURE__ */ I("ellipse", {
					className: z("ghost-faint"),
					cx: 84,
					cy: 293,
					rx: 26,
					ry: 4.5
				}),
				/* @__PURE__ */ I("ellipse", {
					className: z("ghost-faint"),
					cx: 140,
					cy: 294,
					rx: 28,
					ry: 4.5
				})
			]
		})
	});
}
function cr({ knocker: e = !0 }) {
	return /* @__PURE__ */ I(It, {
		viewBox: `0 0 ${an} 750`,
		className: "hh-paint hh-paint-front",
		preserveAspectRatio: "xMidYMid slice",
		children: /* @__PURE__ */ L("g", {
			stroke: "none",
			children: [
				/* @__PURE__ */ I("rect", {
					className: z("door"),
					x: 0,
					y: 0,
					width: 1200,
					height: 750
				}),
				[
					[
						70,
						60,
						460,
						300
					],
					[
						670,
						60,
						460,
						300
					],
					[
						70,
						430,
						460,
						400
					],
					[
						670,
						430,
						460,
						400
					]
				].map(([e, t, n, r]) => /* @__PURE__ */ L("g", { children: [
					/* @__PURE__ */ I("rect", {
						className: z("door-d"),
						x: e,
						y: t,
						width: n,
						height: r
					}),
					/* @__PURE__ */ I("path", {
						className: z("door-dd"),
						d: `M${e} ${t} h${n} l-26 26 h${-(n - 52)} v${r - 52} l-26 26 Z`
					}),
					/* @__PURE__ */ I("path", {
						className: z("door-l"),
						d: `M${e + n} ${t + r} h${-n} l26 -26 h${n - 52} v${-(r - 52)} l26 -26 Z`
					}),
					/* @__PURE__ */ I("rect", {
						className: z("door"),
						x: e + 26,
						y: t + 26,
						width: n - 52,
						height: r - 52
					})
				] }, `${e}-${t}`)),
				/* @__PURE__ */ I("rect", {
					className: z("door-dd"),
					x: 594,
					y: 0,
					width: 12,
					height: 750
				}),
				/* @__PURE__ */ I("circle", {
					className: z("lamp-glow"),
					cx: 600,
					cy: 330,
					r: 260
				}),
				e ? /* @__PURE__ */ L("g", { children: [
					/* @__PURE__ */ I("path", {
						className: z("iron"),
						d: "M600 250 q-30 -40 -80 -30 q20 10 22 30 q-40 -12 -70 14 q30 0 40 22 q40 -22 88 -6 q48 -16 88 6 q10 -22 40 -22 q-30 -26 -70 -14 q2 -20 22 -30 q-50 -10 -80 30 Z"
					}),
					/* @__PURE__ */ I("circle", {
						className: z("iron"),
						cx: 600,
						cy: 262,
						r: 30
					}),
					/* @__PURE__ */ L("g", {
						className: "hh-knocker-eyes",
						children: [/* @__PURE__ */ I("circle", {
							className: z("lamp"),
							cx: 589,
							cy: 258,
							r: 5
						}), /* @__PURE__ */ I("circle", {
							className: z("lamp"),
							cx: 611,
							cy: 258,
							r: 5
						})]
					}),
					/* @__PURE__ */ I("path", {
						className: z("iron"),
						d: "M588 232 l-6 -22 l16 14 Z M612 232 l6 -22 l-16 14 Z"
					}),
					/* @__PURE__ */ L("g", {
						className: "hh-knocker-ring",
						children: [
							/* @__PURE__ */ I("circle", {
								className: z("iron"),
								cx: 600,
								cy: 364,
								r: 74
							}),
							/* @__PURE__ */ I("circle", {
								className: z("door"),
								cx: 600,
								cy: 364,
								r: 52
							}),
							/* @__PURE__ */ I("circle", {
								className: z("iron-l"),
								cx: 600,
								cy: 438,
								r: 20
							}),
							/* @__PURE__ */ I("circle", {
								className: z("iron"),
								cx: 600,
								cy: 438,
								r: 12
							})
						]
					})
				] }) : null,
				/* @__PURE__ */ I("path", {
					className: z("vignette"),
					d: "M0 0 H1200 V750 H0 Z"
				})
			]
		})
	});
}
// src/components/room-paint-styles.ts
var B = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, black)`, lr = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, white)`, ur = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, transparent)`, dr = {
	wall: "var(--hh-w)",
	"wall-l": lr("--hh-w", 78),
	"wall-d": B("--hh-w", 72),
	"wall-dd": B("--hh-w", 50),
	ceil: B("--hh-w", 34),
	side: B("--hh-w", 64),
	"side-d": B("--hh-w", 48),
	wood: "var(--hh-sc-wood)",
	"wood-l": lr("--hh-sc-wood", 74),
	"wood-d": "var(--hh-sc-wood-dark)",
	"wood-dd": B("--hh-sc-wood-dark", 56),
	floor: "var(--hh-sc-floor)",
	tile: "var(--hh-sc-tile)",
	brass: "var(--hh-sc-brass)",
	"brass-l": lr("--hh-sc-brass", 60),
	"brass-d": B("--hh-sc-brass", 62),
	cloth: "var(--hh-sc-cloth)",
	"cloth-d": B("--hh-sc-cloth", 62),
	paper: "var(--hh-sc-paper)",
	"paper-d": B("--hh-sc-paper", 78),
	bone: "var(--hh-sc-bone)",
	"bone-d": B("--hh-sc-bone", 76),
	ink: "var(--hh-sc-ink)",
	moon: "var(--hh-sc-moon)",
	"moon-d": B("--hh-sc-moon", 84),
	"moon-halo": ur("--hh-sc-moon", 16),
	"moon-pool": ur("--hh-sc-moon", 10),
	lamp: "var(--hh-sc-lamp)",
	"lamp-d": B("--hh-sc-lamp", 70),
	"lamp-glow": ur("--hh-sc-lamp", 13),
	ecto: "var(--hh-sc-ecto)",
	"ecto-d": B("--hh-sc-ecto", 62),
	"ecto-glow": ur("--hh-sc-ecto", 13),
	"night-1": "var(--hh-sc-night1)",
	"night-2": "var(--hh-sc-night2)",
	"night-3": "var(--hh-sc-night3)",
	"night-4": "var(--hh-sc-night4)",
	"hill-1": "var(--hh-sc-hill1)",
	"hill-2": "var(--hh-sc-hill2)",
	glass: B("--hh-sc-night2", 50),
	"glass-l": ur("--hh-sc-paper", 30),
	shade: ur("--hh-sc-ink", 34),
	stone: "var(--hh-sc-stone)",
	"stone-l": lr("--hh-sc-stone", 70),
	"stone-d": B("--hh-sc-stone", 60),
	blueprint: "var(--hh-sc-wall-drafting)",
	leather: "var(--hh-sc-leather)",
	ghost: "var(--hh-sc-spectre)",
	"ghost-d": B("--hh-sc-spectre", 80),
	"ghost-faint": ur("--hh-sc-spectre", 22),
	scorch: B("--hh-sc-wood-dark", 38),
	door: "var(--hh-sc-front-door)",
	"door-l": lr("--hh-sc-front-door", 80),
	"door-d": B("--hh-sc-front-door", 76),
	"door-dd": B("--hh-sc-front-door", 52),
	iron: "var(--hh-sc-iron)",
	"iron-l": lr("--hh-sc-iron", 72),
	vignette: "transparent",
	robe: B("--hh-sc-night2", 62),
	"robe-l": "var(--hh-sc-night2)",
	"robe-d": "var(--hh-sc-night1)",
	"robe-rim": "var(--hh-sc-night3)",
	hood: "var(--hh-sc-iron)"
}, fr = {
	web: ur("--hh-sc-bone", 46),
	"floor-line": B("--hh-sc-floor", 62),
	"tile-line": B("--hh-sc-tile", 58),
	paper: "var(--hh-sc-paper)",
	"night-2": "var(--hh-sc-night2)",
	"wood-dd": B("--hh-sc-wood-dark", 56),
	"brass-d": B("--hh-sc-brass", 62),
	"ink-soft": ur("--hh-sc-ink", 50),
	brass: "var(--hh-sc-brass)",
	chain: lr("--hh-sc-stone", 62)
};
Object.keys(dr), Object.keys(fr);
var pr = `
.hh-paint { position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none; }
.hh-paint[data-scene='foyer'], .hh-paint { --hh-w: var(--hh-sc-wall-foyer); }
.hh-paint[data-scene='study'] { --hh-w: var(--hh-sc-wall-study); }
.hh-paint[data-scene='drafting-room'] { --hh-w: var(--hh-sc-wall-drafting); }
.hh-paint[data-scene='workshop'] { --hh-w: var(--hh-sc-wall-workshop); }
.hh-paint[data-scene='attic'] { --hh-w: var(--hh-sc-wall-attic); }
.hh-paint[data-scene='seance-room'] { --hh-w: var(--hh-sc-wall-seance); }
${Object.entries(dr).map(([e, t]) => `.hh-p-${e} { fill: ${t}; }`).join("\n")}
${Object.entries(fr).map(([e, t]) => `.hh-ps-${e} { fill: none; stroke: ${t}; }`).join("\n")}
/* The Warden is told from the dark behind him by the light at his edge. */
.hh-paint-warden { filter: drop-shadow(0 0 9px var(--hh-sc-night3)) drop-shadow(0 0 2px var(--hh-sc-night3)); }
`, mr = [
	"canvas",
	"surface",
	"surfaceRaised",
	"text",
	"textMuted",
	"border",
	"focus",
	"accent",
	"accentText",
	"danger",
	"ok",
	"candle",
	"ghost",
	"working"
], hr = {
	light: {
		canvas: "#e9eff9",
		surface: "#f5f8fe",
		surfaceRaised: "#ffffff",
		text: "#131d3a",
		textMuted: "#45547a",
		border: "#5a6a94",
		focus: "#0a54c9",
		accent: "#9c4700",
		accentText: "#ffffff",
		danger: "#ad2318",
		ok: "#1c6b43",
		candle: "#9a5a00",
		ghost: "#5b4b9a",
		working: "#125c8c"
	},
	dark: {
		canvas: "#08070f",
		surface: "#13101d",
		surfaceRaised: "#1d1829",
		text: "#eef2ff",
		textMuted: "#bcc7e8",
		border: "#8c9bd0",
		focus: "#9cc8ff",
		accent: "#ffab4a",
		accentText: "#1c1204",
		danger: "#ff9c8f",
		ok: "#86e0ae",
		candle: "#ffc56b",
		ghost: "#d9d4ff",
		working: "#8fd0f5"
	}
}, gr = [
	"canvas",
	"surface",
	"surfaceRaised"
];
function _r(e, t) {
	return gr.map((n) => ({
		foreground: e,
		background: n,
		minimum: t
	}));
}
[
	..._r("text", 4.5),
	..._r("textMuted", 4.5),
	..._r("accent", 4.5),
	..._r("danger", 4.5),
	..._r("ok", 4.5),
	..._r("working", 4.5),
	..._r("border", 3),
	..._r("focus", 3),
	..._r("candle", 3),
	..._r("ghost", 3)
];
function vr(e) {
	return `--hh-fb-${e.replace(/[A-Z]/g, (e) => `-${e.toLowerCase()}`)}`;
}
function yr(e) {
	let t = hr[e];
	return mr.map((e) => `${vr(e)}: ${t[e]};`).join(" ");
}
var br = {
	ink: "#1a1326",
	bone: "#f6eeda",
	balloon: "#fff6cc",
	moon: "#fff3c4",
	lamp: "#ffa63d",
	ecto: "#9dffcf",
	wood: "#8a5a34",
	woodDark: "#573620",
	floor: "#9c6b3f",
	brass: "#d9a441",
	cloth: "#b23a48",
	paper: "#e9f1ff",
	roof: "#3a2d52",
	wallFoyer: "#6a2f7a",
	wallStudy: "#2f6b4f",
	wallDrafting: "#1f6a82",
	wallWorkshop: "#8a4630",
	wallAttic: "#6b4a2b",
	wallSeance: "#472a86",
	night1: "#140f3a",
	night2: "#3b2470",
	night3: "#6a3a8c",
	night4: "#b0567a",
	hill1: "#1d1440",
	hill2: "#0c0820",
	stone: "#6f6a7c",
	tile: "#3b3552",
	leather: "#1f4a3a",
	frontDoor: "#5b1626",
	iron: "#17151d",
	spectre: "#eaf6ff",
	slate: "#1d1626",
	slateInk: "#efe4cc",
	slateBrass: "#6d5426",
	sheet: "#0b0a14",
	sheetLine: "#1d1a2e",
	sheetInk: "#a99cc9",
	poche: "#050409"
}, xr = {
	light: br,
	dark: br
};
function Sr(e) {
	return `--hh-sc-${e.replace(/[A-Z]/g, (e) => `-${e.toLowerCase()}`)}`;
}
function Cr(e) {
	let t = xr[e];
	return Object.keys(t).map((e) => `${Sr(e)}: ${t[e]};`).join(" ");
}
// src/core/dread.ts
var wr = [
	"calm",
	"eerie",
	"dread"
], Tr = "eerie", Er = {
	calm: "Calm",
	eerie: "Eerie",
	dread: "Dread"
};
function Dr(e) {
	return wr[(wr.indexOf(e) + 1) % wr.length];
}
function Or(e) {
	return e.doors.some((e) => e.state === "waiting") ? "leak" : e.ghosts.some((e) => e.state === "working") ? "candle" : "moonlit";
}
function kr(e, t) {
	return t.some((t) => t.roomId === e.roomId && t.kind === "risky-decision") ? "held" : e.ghosts.some((e) => e.state === "working" || e.state === "waiting") ? "lit" : "dark";
}
var Ar = {
	dark: "Window dark: idle.",
	lit: "Window lit: work is happening.",
	held: "Window glowing red: something is held for you."
};
function jr(e) {
	let t = e.needsYou.find((e) => e.kind === "risky-decision" && e.ghostId !== null);
	return t === void 0 ? e.needsYou.length > 0 ? {
		stance: "forward",
		heldGhostId: null
	} : {
		stance: "edge",
		heldGhostId: null
	} : {
		stance: "holding",
		heldGhostId: t.ghostId
	};
}
function Mr(e) {
	return e.doors.some((e) => e.state === "waiting") || e.ghosts.some((e) => e.state === "working" || e.state === "waiting") ? 0 : e.ghosts.length === 0 ? 3 : e.ghosts.every((e) => e.state === "idle") ? 2 : 1;
}
function Nr(e, t) {
	let n = e !== "calm";
	return {
		night: !0,
		stateLight: n,
		fog: n,
		dust: n,
		rain: e === "dread",
		moves: n && t === "low-frequency"
	};
}
function Pr(e) {
	return !Number.isFinite(e) || e < 1 ? null : Math.min(90, 48 + 12 * (Math.floor(e) - 1));
}
// src/components/dread-styles.ts
var Fr = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, transparent)`, Ir = (e) => `color-mix(in srgb, var(--hh-sc-night1) ${e}%, black)`, Lr = ".hh-ui:is([data-fright='eerie'], [data-fright='dread'])", Rr = (e) => `color-mix(in srgb, var(--hh-sc-wood-dark) ${e}%, black)`, zr = (e) => `color-mix(in srgb, var(--hh-sc-brass) ${e}%, black)`, Br = `
/* The séance board: the replay bar is a board of dark wood with a brass rim; the scrubber is its track, one mark for
   each recorded event (--hh-marks), and the thumb is a planchette with a window. The native range input, its label
   and its value text stay as they are. */
.hh-ui-replay-bar { font-family: var(--hh-font-serif); color: var(--hh-sc-slate-ink);
  background: radial-gradient(ellipse 70% 120% at 50% 0%, ${Rr(60)} 0%, ${Rr(30)} 100%);
  border: 2px solid ${zr(60)}; border-radius: 12px; box-shadow: inset 0 0 0 3px ${Rr(22)}, 0 12px 30px ${Fr("--hh-sc-poche", 80)}; }
.hh-ui-replay-bar .hh-ui-note, .hh-ui-replay-bar .hh-ui-replay-speed legend { color: var(--hh-sc-slate-ink); }
.hh-ui-replay-bar .hh-ui-button { font-family: var(--hh-font-serif); color: var(--hh-sc-slate-ink); background: ${Rr(36)}; border: 2px solid ${zr(70)}; }
.hh-ui-replay-bar .hh-ui-button[data-variant='primary'] { color: var(--hh-sc-ink); background: var(--hh-sc-brass); border-color: var(--hh-sc-ink); }
.hh-ui-replay-range { appearance: none; -webkit-appearance: none; height: 34px; background: transparent; cursor: pointer; }
.hh-ui-replay-range::-webkit-slider-runnable-track { height: 22px; border-radius: 11px; border: 1px solid ${zr(70)};
  background: repeating-linear-gradient(90deg, ${zr(80)} 0 1px, transparent 1px calc(100% / var(--hh-marks, 1))), linear-gradient(180deg, ${Rr(28)}, ${Rr(48)}); }
.hh-ui-replay-range::-moz-range-track { height: 22px; border-radius: 11px; border: 1px solid ${zr(70)};
  background: repeating-linear-gradient(90deg, ${zr(80)} 0 1px, transparent 1px calc(100% / var(--hh-marks, 1))), linear-gradient(180deg, ${Rr(28)}, ${Rr(48)}); }
.hh-ui-replay-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 30px; height: 34px; margin-top: -7px; border: 0;
  clip-path: polygon(50% 0%, 96% 62%, 78% 100%, 22% 100%, 4% 62%);
  background: radial-gradient(circle at 50% 60%, ${Rr(30)} 0 5px, var(--hh-sc-brass) 5.5px 8px, var(--hh-sc-bone) 8.5px); }
.hh-ui-replay-range::-moz-range-thumb { width: 30px; height: 34px; border: 0; border-radius: 0;
  clip-path: polygon(50% 0%, 96% 62%, 78% 100%, 22% 100%, 4% 62%);
  background: radial-gradient(circle at 50% 60%, ${Rr(30)} 0 5px, var(--hh-sc-brass) 5.5px 8px, var(--hh-sc-bone) 8.5px); }
.hh-ui-replay-range:focus-visible { outline: 3px solid var(--hh-sc-lamp); outline-offset: 3px; border-radius: 12px; }
/* The replay bar and the practice board stand together at the head of the house. */
.hh-ui-replay-head { display: grid; gap: 8px; min-width: 0; }
/* The practice board sits under the replay bar, in the same wood: the run's numbers, the switch, and the question. */
.hh-ui-practice { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; min-width: 0; padding: 10px 14px; font-family: var(--hh-font-serif);
  color: var(--hh-sc-slate-ink); background: ${Rr(30)}; border: 2px solid ${zr(55)}; border-radius: 12px; }
.hh-ui-practice-numbers { flex: 1 1 18rem; margin: 0; font-size: 0.9375rem; }
.hh-ui-practice .hh-ui-button { font-family: var(--hh-font-serif); color: var(--hh-sc-slate-ink); background: ${Rr(40)}; border: 2px solid ${zr(70)}; }
.hh-ui-practice .hh-ui-button[data-variant='primary'], .hh-ui-practice .hh-ui-button[aria-pressed='true'] { color: var(--hh-sc-ink); background: var(--hh-sc-brass); border-color: var(--hh-sc-ink); }
.hh-ui-practice-body { flex: 1 1 100%; display: grid; gap: 8px; min-width: 0; }
.hh-ui-practice-note { margin: 0; padding: 2px 8px; border-left: 4px solid var(--hh-sc-lamp); font-weight: 700; }
.hh-ui-practice-question { margin: 0; font-size: 1.0625rem; font-weight: 700; }
.hh-ui-practice-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.hh-ui-practice-answer { display: grid; gap: 6px; justify-items: start; }
.hh-ui-practice-answer p { margin: 0; }
/* The map's windows from outside: lit where a ghost works, dark where nothing happens, red where something is held. */
.hh-ui-room-scene { position: relative; }
.hh-ui-window { position: absolute; z-index: 2; right: 8%; top: 10%; width: 9%; min-width: 12px; aspect-ratio: 2 / 3; border-radius: 50% 50% 2px 2px / 30% 30% 2px 2px;
  border: 2px solid ${Rr(30)}; background: ${Ir(80)}; pointer-events: none; }
.hh-ui-window[data-glow='lit'] { background: var(--hh-sc-lamp); box-shadow: 0 0 14px ${Fr("--hh-sc-lamp", 80)}; }
.hh-ui-window[data-glow='held'] { background: var(--hh-sc-cloth); box-shadow: 0 0 18px var(--hh-sc-cloth), 0 0 4px var(--hh-sc-lamp); }
/* The heading is a brass plate engraved with the house's name. */
.hh-status[data-compact='true'] h1 { display: inline-block; padding: 2px 16px 4px; font-size: 1.5rem; letter-spacing: 0.02em; color: var(--hh-sc-slate-ink);
  background: linear-gradient(180deg, ${Rr(46)}, ${Rr(26)}); border: 2px solid ${zr(70)}; border-radius: 6px;
  text-shadow: 0 0 10px ${Fr("--hh-sc-lamp", 55)}; box-shadow: 0 6px 18px ${Fr("--hh-sc-poche", 80)}; }

.hh-stage-spots { z-index: 2; }
.hh-dread-light, .hh-dread-air { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.hh-dread-light > span, .hh-dread-air > * { position: absolute; pointer-events: none; }
/* Moonlit: nothing happens here. The room sinks into blue dark; a cold shaft falls from above. */
.hh-dread-light { mix-blend-mode: multiply; background: linear-gradient(180deg, ${Fr("--hh-sc-night2", 70)} 0%, ${Ir(88)} 100%); opacity: 0.86; }
.hh-dread-moon { inset: 0; mix-blend-mode: screen; background: radial-gradient(ellipse 40% 70% at 50% 18%, ${Fr("--hh-sc-moon", 26)} 0%, transparent 70%); }
/* Candle: a ghost works. A warm pool on the desk pushes the dark back. */
.hh-dread-light[data-light='candle'] { background: radial-gradient(ellipse 46% 52% at 34% 82%, transparent 0%, transparent 30%, ${Fr("--hh-sc-night2", 64)} 62%, ${Ir(86)} 100%); }
.hh-dread-candle { inset: 0; mix-blend-mode: screen; background: radial-gradient(ellipse 30% 34% at 34% 82%, ${Fr("--hh-sc-lamp", 46)} 0%, transparent 72%); }
/* Leak: a door waits for you. The room is dark and light spills from under the door onto the floor. */
.hh-dread-light[data-light='leak'] { opacity: 0.92; }
.hh-dread-leak { mix-blend-mode: screen; filter: blur(3px); background: radial-gradient(ellipse 50% 50% at 50% 50%, ${Fr("--hh-sc-lamp", 90)} 0%, ${Fr("--hh-sc-lamp", 30)} 46%, transparent 72%); }
.hh-dread-leak[data-at='side'] { left: 84%; width: 16%; top: 70%; height: 20%; }
.hh-dread-leak[data-at='back'] { left: 66%; width: 20%; top: 62%; height: 14%; }
.hh-ui[data-fright='dread'] .hh-dread-light { opacity: 0.95; }
.hh-ui[data-fright='dread'] .hh-dread-light[data-light='candle'] { opacity: 0.9; }
/* Fog on the floor, dust in the moonlight, rain on the glass. */
.hh-dread-fog { left: -10%; right: -10%; bottom: -4%; height: 34%; filter: blur(8px);
  background: radial-gradient(ellipse 60% 70% at 30% 100%, ${Fr("--hh-sc-moon", 22)} 0%, transparent 70%), radial-gradient(ellipse 50% 60% at 78% 100%, ${Fr("--hh-sc-moon", 18)} 0%, transparent 72%); }
.hh-dread-dust { inset: 0; width: 100%; height: 100%; }
.hh-dread-rain { inset: -20% 0 0; opacity: 0.32;
  background: repeating-linear-gradient(104deg, transparent 0 26px, ${Fr("--hh-sc-moon", 40)} 26px 27px, transparent 27px 61px); }
/* The Warden's shadow reaches across the floor toward the room. */
.hh-dread-shadow { position: absolute; z-index: 1; right: 4%; bottom: 0; width: 46%; height: 16%; pointer-events: none; transform-origin: 100% 100%;
  transform: skewX(-38deg); background: radial-gradient(ellipse 100% 90% at 100% 100%, ${Ir(70)} 0%, ${Fr("--hh-sc-night1", 40)} 52%, transparent 76%); }
.hh-dread-shadow[data-stance='holding'] { width: 64%; height: 20%; }
/* He grows with what he holds: small at the edge when nothing waits, forward and brighter-eyed when something does. */
${Lr} .hh-stage-warden .hh-paint-warden { transform-origin: 50% 100%; }
${Lr} .hh-stage-room[data-stance='edge'] .hh-stage-warden .hh-paint-warden { transform: scale(0.78) translateX(14%); opacity: 0.86; }
${Lr} .hh-stage-room[data-stance='forward'] .hh-stage-warden .hh-paint-warden,
${Lr} .hh-stage-room[data-stance='holding'] .hh-stage-warden .hh-paint-warden {
  transform: scale(1.08) translateX(-6%); filter: drop-shadow(0 0 12px var(--hh-sc-lamp)) drop-shadow(0 0 3px var(--hh-sc-night3)); }
/* The night outside the house. */
.hh-house:not([data-landing='true']) { background: radial-gradient(ellipse 80% 50% at 75% -5%, ${Fr("--hh-sc-night2", 55)} 0%, transparent 70%), ${Ir(40)}; }
@keyframes hh-dread-drift { 0%, 100% { transform: translateX(-3%); } 50% { transform: translateX(3%); } }
@keyframes hh-dread-fall { from { transform: translateY(-12%); } to { transform: translateY(0); } }
@keyframes hh-dread-motes { 0%, 100% { opacity: 0.5; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-1.5%); } }
@keyframes hh-dread-flame { 0%, 100% { opacity: 1; } 50% { opacity: 0.82; } }
@media (prefers-reduced-motion: no-preference) {
  ${Lr}[data-motion='low-frequency'] .hh-dread-fog { animation: hh-dread-drift 24s ease-in-out infinite; }
  ${Lr}[data-motion='low-frequency'] .hh-dread-rain { animation: hh-dread-fall 2.4s linear infinite; }
  ${Lr}[data-motion='low-frequency'] .hh-dread-dust { animation: hh-dread-motes 9s ease-in-out infinite; }
  ${Lr}[data-motion='low-frequency'] .hh-dread-candle { animation: hh-dread-flame 3.2s ease-in-out infinite; }
  ${Lr}[data-motion='low-frequency'] .hh-dread-leak { animation: hh-dread-flame 4s ease-in-out infinite; }
  ${Lr}[data-motion='low-frequency'] .hh-stage-warden .hh-paint-warden { transition: transform 1.6s cubic-bezier(0.3, 0.1, 0.2, 1); }
}
`, Vr = {
	idle: "Idle",
	working: "Working",
	waiting: "Waiting",
	blocked: "Blocked",
	failed: "Failed",
	done: "Done"
}, Hr = /* @__PURE__ */ new Set([
	"waiting",
	"blocked",
	"failed"
]), Ur = {
	locked_door: "A door upstream is still sealed.",
	missing_input: "An input it needs is missing.",
	stalled: "The run stalled.",
	history_partial: "Part of its history could not be recovered.",
	cancelled: "The run was cancelled.",
	cancel_unconfirmed: "Cancelling was not confirmed.",
	capacity_unavailable: "No ghost is free to take this.",
	claim_conflict: "Another ghost holds this task.",
	contract_unavailable: "Its room contract is unavailable.",
	confinement_unavailable: "Its room limits could not be applied.",
	crew_usage_limit: "Kiro’s usage limit is reached. Retry once it resets."
}, Wr = 120;
function Gr(e, t) {
	let n = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function Kr(e) {
	if (e === null) return null;
	let t = Object.hasOwn(Ur, e) ? Ur[e] : void 0;
	if (t !== void 0) return t;
	if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(e)) {
		let t = Gr(e.replace(/_/g, " "), Wr);
		return t.charAt(0).toUpperCase() + t.slice(1);
	}
	let n = Gr(e, Wr);
	return n === "" ? null : n;
}
function qr(e) {
	let t = Gr(e.replace(/[-_]+/g, " "), 60);
	return t === "" ? "Ghost" : t.replace(/(^|\s)(\p{L})/gu, (e, t, n) => t + n.toUpperCase());
}
function Jr(e) {
	return e <= 0 ? null : e === 1 ? "1 approval pending" : `${e} approvals pending`;
}
var Yr = "house-operator";
function Xr(e, t = {}) {
	return Array.from(e).filter((e) => e.ghost_id !== Yr).map((e) => {
		let n = Object.hasOwn(t, e.ghost_id) ? t[e.ghost_id] : void 0;
		return {
			key: JSON.stringify([e.mansion_id, e.ghost_id]),
			ghostId: e.ghost_id,
			name: n === void 0 || n.trim() === "" ? qr(e.ghost_id) : n,
			state: e.state,
			stateText: Vr[e.state],
			pendingCount: e.pending_approvals.length,
			pendingText: Jr(e.pending_approvals.length),
			reason: Kr(e.reason)
		};
	});
}
var Zr = /* @__PURE__ */ new Set([
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"duplicate_sequence",
	"missing_sequence"
]);
function Qr(e) {
	let t = e.line === void 0 ? "" : ` at line ${e.line}`;
	if (Zr.has(e.code)) return `The séance log failed its integrity check${t}. Showing only the records before it.`;
	switch (e.code) {
		case "invalid_record":
		case "unsupported_schema": return `A séance log record${t} could not be read and was left out.`;
		case "history_partial": return "Some activity could not be recovered from Crew history.";
		case "invalid_envelope":
		case "unknown_session":
		case "approval_unmatched": return "A Crew event was refused and not recorded.";
		case "persistence_failed": return /\s/.test(e.safe_detail) ? Gr(e.safe_detail, 160) : "The séance log could not be saved or read. Showing the last confirmed state.";
		default: return "The séance log reported a problem. Showing the last confirmed state.";
	}
}
// src/core/house-registry.ts
var $r = {
	navigation: "navigation",
	requirements: "requirements",
	design: "design",
	"tasks-and-implementation": "tasks and implementation",
	replay: "replay",
	review: "review"
}, ei = [
	{
		id: "foyer",
		name: "Foyer",
		phase: "navigation",
		order: 0,
		scope: "mvp",
		neighbors: {
			ArrowUp: "drafting-room",
			ArrowLeft: "study",
			ArrowRight: "workshop"
		},
		workflowPhases: [],
		ghostRoles: []
	},
	{
		id: "study",
		name: "Study",
		phase: "requirements",
		order: 1,
		scope: "mvp",
		neighbors: {
			ArrowUp: "drafting-room",
			ArrowRight: "foyer"
		},
		workflowPhases: ["requirements"],
		ghostRoles: ["archivist"]
	},
	{
		id: "drafting-room",
		name: "Drafting Room",
		phase: "design",
		order: 2,
		scope: "mvp",
		neighbors: {
			ArrowUp: "attic",
			ArrowDown: "foyer",
			ArrowRight: "seance-room"
		},
		workflowPhases: ["design"],
		ghostRoles: ["draughtsman"]
	},
	{
		id: "workshop",
		name: "Workshop",
		phase: "tasks-and-implementation",
		order: 3,
		scope: "mvp",
		neighbors: {
			ArrowUp: "seance-room",
			ArrowLeft: "foyer"
		},
		workflowPhases: ["tasks", "implementation"],
		ghostRoles: ["foreman", "tinker"]
	},
	{
		id: "attic",
		name: "Attic",
		phase: "replay",
		order: 4,
		scope: "mvp",
		neighbors: { ArrowDown: "drafting-room" },
		workflowPhases: [],
		ghostRoles: []
	},
	{
		id: "seance-room",
		name: "Séance Room",
		phase: "review",
		order: 5,
		scope: "stretch",
		neighbors: {
			ArrowUp: "attic",
			ArrowDown: "workshop",
			ArrowLeft: "drafting-room"
		},
		workflowPhases: [],
		ghostRoles: ["medium"]
	}
], ti = new Map(ei.map((e) => [e.id, e]));
function ni(e) {
	return typeof e == "string" && ti.has(e);
}
function ri(e) {
	return ti.get(e);
}
function ii(e) {
	return ri(e).order;
}
function ai(e, t) {
	return ii(e) - ii(t);
}
function oi(e) {
	return ei.filter((t) => t.scope === "mvp" || e !== "hidden");
}
function si(e, t, n) {
	if (!n.has(e)) return e;
	let r = /* @__PURE__ */ new Set([e]), i = ti.get(e)?.neighbors[t];
	for (; i !== void 0 && !r.has(i);) {
		if (n.has(i)) return i;
		r.add(i), i = ti.get(i)?.neighbors[t];
	}
	return e;
}
function ci(e) {
	return e === "not_applicable" ? "not applicable" : e;
}
// src/core/interruption-policy.ts
var li = [
	"waiting",
	"blocked",
	"failed"
], ui = 1e4;
function di(e) {
	return li.includes(e);
}
var fi = {
	seenEventIds: /* @__PURE__ */ new Set(),
	burst: null
}, pi = [];
function mi(e) {
	return Array.from(e).length;
}
function hi(e) {
	let t = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim();
	if (t === "") return "A ghost";
	let n = Array.from(t);
	return n.length <= 60 ? t : `${n.slice(0, 59).join("").trimEnd()}…`;
}
var gi = {
	waiting: (e) => `${e} is waiting for your approval.`,
	blocked: (e) => `${e} is blocked.`,
	failed: (e) => `${e} failed.`
};
function _i(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.events) t.set(n.ghostId, n);
	let n = Array.from(t.values()).sort((e, t) => ii(e.roomId) - ii(t.roomId)), r = n.map((e) => gi[e.state](hi(e.ghostName)));
	e.events.length > 1 && r.push(`${e.events.length} events.`);
	let i = r.join(" ");
	return mi(i) > 240 && (i = n.length === 1 ? "1 ghost needs attention. Open Needs you for details." : `${n.length} ghosts need attention. Open Needs you for details.`), {
		text: i,
		eventIds: e.events.map((e) => e.eventId)
	};
}
function vi(e) {
	return {
		kind: "summary",
		..._i(e)
	};
}
function yi(e, t) {
	if (t.kind !== "transition" || t.fromState === t.toState || !Hr.has(t.toState) || !di(t.toState) || e.seenEventIds.has(t.eventId)) return {
		state: e,
		effects: pi
	};
	let n = e.burst, r = n === null ? t.observedAtMs : Math.max(t.observedAtMs, n.lastAcceptedAtMs), i = {
		eventId: t.eventId,
		ghostId: t.ghostId,
		ghostName: t.ghostName,
		roomId: t.roomId,
		state: t.toState,
		observedAtMs: r
	}, a = new Set(e.seenEventIds).add(t.eventId);
	return n !== null && r - n.lastAcceptedAtMs < 1e4 ? {
		state: {
			seenEventIds: a,
			burst: {
				openedAtMs: n.openedAtMs,
				lastAcceptedAtMs: r,
				events: [...n.events, i]
			}
		},
		effects: pi
	} : {
		state: {
			seenEventIds: a,
			burst: {
				openedAtMs: r,
				lastAcceptedAtMs: r,
				events: [i]
			}
		},
		effects: n === null ? pi : [vi(n)]
	};
}
function bi(e, t) {
	let n = e.burst;
	return n === null || t - n.lastAcceptedAtMs < 1e4 ? {
		state: e,
		effects: pi
	} : {
		state: {
			seenEventIds: e.seenEventIds,
			burst: null
		},
		effects: [vi(n)]
	};
}
function xi(e) {
	return e.burst === null ? null : e.burst.lastAcceptedAtMs + ui;
}
function Si(e, t) {
	return e.ghost_id === "house-operator" || t.roomId === null ? null : {
		kind: "transition",
		eventId: e.transition_id,
		ghostId: e.ghost_id,
		ghostName: t.ghostName,
		roomId: t.roomId,
		fromState: e.from_state,
		toState: e.to_state,
		observedAtMs: t.observedAtMs
	};
}
function Ci(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.transitions) n.from_state !== n.to_state && t.set(n.ghost_id, n);
	let n = [], r = [];
	for (let i of e.transitions) {
		if (e.offered.has(i.transition_id) || (n.push(i.transition_id), t.get(i.ghost_id) !== i) || e.currentState(i.ghost_id) !== i.to_state) continue;
		let a = Si(i, {
			roomId: e.roomOf(i.ghost_id),
			ghostName: e.nameOf(i.ghost_id),
			observedAtMs: e.observedAtMs
		});
		a !== null && r.push(a);
	}
	return {
		offered: n,
		events: r
	};
}
// src/adapters/host-effects.ts
function wi(e) {
	let t = Ot(), n = At(), i = jt(), a = c(e);
	a.current = e;
	let o = c(fi), s = c(/* @__PURE__ */ new Set()), l = c(null), u = e.active ? Math.max(0, Math.trunc(e.needsYouCount) || 0) : 0;
	return r(() => {
		i(u);
	}, [u, i]), r(() => () => void i(0), [i]), r(() => (o.current = fi, s.current = /* @__PURE__ */ new Set(), () => {
		l.current !== null && clearTimeout(l.current), l.current = null, o.current = fi;
	}), [e.mansionId, e.active]), r(() => {
		if (!e.active) return;
		let t = () => (a.current.now ?? Date.now)(), r = (e) => {
			for (let t of e) t.kind === "summary" && (n(t.text), a.current.onSummary({
				text: t.text,
				eventIds: t.eventIds
			}));
		}, i = () => {
			l.current !== null && clearTimeout(l.current), l.current = null;
			let e = xi(o.current);
			e !== null && (l.current = setTimeout(() => {
				l.current = null;
				let e = bi(o.current, t());
				o.current = e.state, r(e.effects), i();
			}, Math.max(e - t(), 0)));
		}, c = Ci({
			transitions: e.transitions,
			currentState: (t) => e.snapshots.get(t)?.state ?? null,
			offered: s.current,
			roomOf: e.roomOf,
			nameOf: e.nameOf,
			observedAtMs: t()
		});
		for (let e of c.offered) s.current.add(e);
		let u = !1;
		for (let e of c.events) {
			let t = yi(o.current, e);
			u ||= t.state !== o.current, o.current = t.state, r(t.effects);
		}
		u && i();
	}, [
		e.active,
		e.transitions,
		e.snapshots,
		e.roomOf,
		e.nameOf,
		n
	]), { theme: t };
}
var Ti = /* @__PURE__ */ new Set([
	"run_started",
	"ghost_progressed",
	"message_recorded",
	"message_updated",
	"response_segment_started",
	"response_chunk_recorded",
	"crew_turn_ended",
	"crew_error_observed",
	"run_completed",
	"run_blocked",
	"run_failed",
	"tool_started",
	"tool_updated",
	"tool_finished",
	"approval_requested",
	"approval_decided",
	"decision_recorded",
	"domain_event_recorded",
	"source_event_observed"
]), Ei = ["crew", "house"], Di = [
	"invalid_envelope",
	"unknown_session",
	"invalid_candidate",
	"invalid_record",
	"unsupported_schema",
	"duplicate_sequence",
	"missing_sequence",
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"missing_predecessor",
	"conflicting_variant",
	"approval_unmatched",
	"history_partial",
	"persistence_failed"
], Oi = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, ki = 262144, Ai = new Set(Ei), ji = new TextEncoder(), Mi = /^[0-9a-f]{64}$/, Ni = class extends Error {
	path;
	safeDetail;
	constructor(e, t) {
		super(t), this.path = e, this.safeDetail = t;
	}
};
function V(e, t) {
	throw new Ni(e, t);
}
function Pi(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) return !1;
	let t = Object.getPrototypeOf(e);
	return t === Object.prototype || t === null;
}
function Fi(e, t) {
	Pi(e) || V(t, "must be a JSON object");
	let n = Object.getOwnPropertyDescriptors(e);
	for (let e of Reflect.ownKeys(n)) {
		typeof e != "string" && V(t, "must contain only JSON object members");
		let r = n[e];
		r.enumerable && "value" in r || V(t, "must contain only JSON object members");
	}
	return e;
}
function Ii(e, t, n = [], r = "$") {
	let i = /* @__PURE__ */ new Set([...t, ...n]), a = Object.keys(e);
	(t.some((t) => !Object.hasOwn(e, t)) || a.some((e) => !i.has(e))) && V(r, "has missing or unexpected fields");
}
function Li(e) {
	for (let t = 0; t < e.length; t += 1) {
		let n = e.charCodeAt(t);
		if (n >= 55296 && n <= 56319) {
			let n = e.charCodeAt(t + 1);
			if (n < 56320 || n > 57343) return !0;
			t += 1;
		} else if (n >= 56320 && n <= 57343) return !0;
	}
	return !1;
}
function Ri(e) {
	return ji.encode(e).byteLength;
}
function zi(e, t, { maxBytes: n = 160, allowEmpty: r = !1 } = {}) {
	(typeof e != "string" || Li(e)) && V(t, "must be a valid Unicode string");
	let i = Ri(e);
	return (!r && i === 0 || i > n) && V(t, `must be ${r ? "at most" : "between 1 and"} ${n} UTF-8 bytes`), e;
}
function Bi(e, t, n) {
	return (typeof e != "number" || !Number.isInteger(e) || e < n) && V(t, `must be an integer greater than or equal to ${n}`), e;
}
function Vi(e, t, n) {
	return n && e === null ? null : Bi(e, t, 0);
}
function Hi(e, t) {
	let n = zi(e, t, { maxBytes: 40 });
	return (n.length > 40 || !Oi.test(n)) && V(t, "must be a kebab-case Mansion_ID of at most 40 characters"), n;
}
function Ui(e, t) {
	return typeof e == "string" && Ti.has(e) || V(t, "must be a supported Event_Type"), e;
}
function Wi(e, t) {
	return typeof e == "string" && Ai.has(e) || V(t, "must be a supported event origin"), e;
}
function Gi(e, t, n) {
	return typeof e == "string" && e.startsWith(t) && Mi.test(e.slice(t.length)) || V(n, `must be a lowercase ${t.slice(0, -1)} SHA-256 identifier`), e;
}
function Ki(e, t) {
	let n = Fi(e, t);
	return Ii(n, [
		"mansion_id",
		"ghost_id",
		"session_slot",
		"run_id",
		"run_sequence"
	], [], t), {
		mansion_id: Hi(n.mansion_id, `${t}.mansion_id`),
		ghost_id: zi(n.ghost_id, `${t}.ghost_id`),
		session_slot: zi(n.session_slot, `${t}.session_slot`),
		run_id: zi(n.run_id, `${t}.run_id`),
		run_sequence: Bi(n.run_sequence, `${t}.run_sequence`, 0)
	};
}
function qi(e, t) {
	return (!Array.isArray(e) || e.length < 1 || e.length > 8) && V(t, "must contain between 1 and 8 identity parts"), e.map((e, n) => zi(e, `${t}[${n}]`, {
		maxBytes: 512,
		allowEmpty: !0
	}));
}
function Ji(e, t) {
	let n = Fi(e, t);
	return Ii(n, [
		"origin",
		"source_type",
		"identity_parts",
		"revision",
		"generation",
		"source_sequence"
	], [], t), {
		origin: Wi(n.origin, `${t}.origin`),
		source_type: zi(n.source_type, `${t}.source_type`),
		identity_parts: qi(n.identity_parts, `${t}.identity_parts`),
		revision: Bi(n.revision, `${t}.revision`, 0),
		generation: zi(n.generation, `${t}.generation`, { allowEmpty: !0 }),
		source_sequence: Bi(n.source_sequence, `${t}.source_sequence`, 0)
	};
}
function Yi(e, t) {
	return Gi(e, "e1:", t);
}
function Xi(e, t, n) {
	return (!Array.isArray(e) || e.length > 32) && V(t, "must contain at most 32 causal predecessors"), e.map((e, r) => n(e, `${t}[${r}]`));
}
function Zi(e, t, n) {
	if (e === null || typeof e == "boolean" || typeof e == "string") return typeof e == "string" && Li(e) && V(t, "must contain valid Unicode strings"), e;
	if (typeof e == "number") return Number.isFinite(e) || V(t, "must contain only finite numbers"), Object.is(e, -0) ? 0 : e;
	if (Array.isArray(e)) {
		n.has(e) && V(t, "must not contain a cycle"), n.add(e);
		try {
			return e.map((e) => Zi(e, t, n));
		} finally {
			n.delete(e);
		}
	}
	if (Pi(e)) {
		n.has(e) && V(t, "must not contain a cycle"), n.add(e);
		try {
			let r = Fi(e, t), i = {};
			for (let e of Object.keys(r)) Li(e) && V(t, "must contain valid Unicode object keys"), Object.defineProperty(i, e, {
				value: Zi(r[e], t, n),
				enumerable: !0,
				configurable: !0,
				writable: !0
			});
			return i;
		} finally {
			n.delete(e);
		}
	}
	V(t, "must be JSON-compatible");
}
function Qi(e, t) {
	let n = Array.from(e, (e) => e.codePointAt(0)), r = Array.from(t, (e) => e.codePointAt(0)), i = Math.min(n.length, r.length);
	for (let e = 0; e < i; e += 1) if (n[e] !== r[e]) return n[e] - r[e];
	return n.length - r.length;
}
function $i(e) {
	if (e === null || typeof e == "boolean" || typeof e == "number" || typeof e == "string") return JSON.stringify(e);
	if (Array.isArray(e)) return `[${e.map($i).join(",")}]`;
	let t = e;
	return `{${Object.keys(t).sort(Qi).map((e) => `${JSON.stringify(e)}:${$i(t[e])}`).join(",")}}`;
}
var ea = [
	1116352408,
	1899447441,
	3049323471,
	3921009573,
	961987163,
	1508970993,
	2453635748,
	2870763221,
	3624381080,
	310598401,
	607225278,
	1426881987,
	1925078388,
	2162078206,
	2614888103,
	3248222580,
	3835390401,
	4022224774,
	264347078,
	604807628,
	770255983,
	1249150122,
	1555081692,
	1996064986,
	2554220882,
	2821834349,
	2952996808,
	3210313671,
	3336571891,
	3584528711,
	113926993,
	338241895,
	666307205,
	773529912,
	1294757372,
	1396182291,
	1695183700,
	1986661051,
	2177026350,
	2456956037,
	2730485921,
	2820302411,
	3259730800,
	3345764771,
	3516065817,
	3600352804,
	4094571909,
	275423344,
	430227734,
	506948616,
	659060556,
	883997877,
	958139571,
	1322822218,
	1537002063,
	1747873779,
	1955562222,
	2024104815,
	2227730452,
	2361852424,
	2428436474,
	2756734187,
	3204031479,
	3329325298
];
function ta(e, t) {
	return e >>> t | e << 32 - t;
}
function na(e) {
	let t = ji.encode(e), n = t.length * 8, r = Math.ceil((t.length + 9) / 64) * 64, i = new Uint8Array(r);
	i.set(t), i[t.length] = 128;
	let a = new DataView(i.buffer);
	a.setUint32(r - 8, Math.floor(n / 4294967296), !1), a.setUint32(r - 4, n >>> 0, !1);
	let o = new Uint32Array([
		1779033703,
		3144134277,
		1013904242,
		2773480762,
		1359893119,
		2600822924,
		528734635,
		1541459225
	]), s = /* @__PURE__ */ new Uint32Array(64);
	for (let e = 0; e < i.length; e += 64) {
		for (let t = 0; t < 16; t += 1) s[t] = a.getUint32(e + t * 4, !1);
		for (let e = 16; e < 64; e += 1) {
			let t = s[e - 15], n = s[e - 2], r = ta(t, 7) ^ ta(t, 18) ^ t >>> 3, i = ta(n, 17) ^ ta(n, 19) ^ n >>> 10;
			s[e] = s[e - 16] + r + s[e - 7] + i >>> 0;
		}
		let [t, n, r, i, c, l, u, d] = o;
		for (let e = 0; e < 64; e += 1) {
			let a = ta(c, 6) ^ ta(c, 11) ^ ta(c, 25), o = c & l ^ ~c & u, f = d + a + o + ea[e] + s[e] >>> 0, p = (ta(t, 2) ^ ta(t, 13) ^ ta(t, 22)) + (t & n ^ t & r ^ n & r) >>> 0;
			d = u, u = l, l = c, c = i + f >>> 0, i = r, r = n, n = t, t = f + p >>> 0;
		}
		o[0] = o[0] + t >>> 0, o[1] = o[1] + n >>> 0, o[2] = o[2] + r >>> 0, o[3] = o[3] + i >>> 0, o[4] = o[4] + c >>> 0, o[5] = o[5] + l >>> 0, o[6] = o[6] + u >>> 0, o[7] = o[7] + d >>> 0;
	}
	return Array.from(o, (e) => e.toString(16).padStart(8, "0")).join("");
}
function ra(e) {
	return {
		mansion_id: e.mansion_id,
		ghost_id: e.ghost_id,
		session_slot: e.session_slot,
		run_id: e.run_id,
		run_sequence: e.run_sequence
	};
}
function ia(e) {
	return {
		origin: e.origin,
		source_type: e.source_type,
		identity_parts: e.identity_parts,
		revision: e.revision,
		generation: e.generation,
		source_sequence: e.source_sequence
	};
}
function aa(e) {
	return {
		schema_version: e.schema_version,
		event_type: e.event_type,
		scope: ra(e.scope),
		source: ia(e.source),
		caused_by: e.caused_by,
		occurred_at_ms: e.occurred_at_ms,
		payload: e.payload
	};
}
function oa(e) {
	return `e1:${na($i([
		e.schema_version,
		e.event_type,
		ra(e.scope),
		{
			origin: e.source.origin,
			source_type: e.source.source_type,
			identity_parts: e.source.identity_parts
		}
	]))}`;
}
function sa(e) {
	return `r1:${na($i(aa(e)))}`;
}
function ca(e) {
	let t = {
		...aa(e),
		event_id: e.event_id,
		record_id: e.record_id,
		sequence: e.sequence,
		persisted_at_ms: e.persisted_at_ms
	};
	return e.prev_hash !== void 0 && e.hash !== void 0 && (t.prev_hash = e.prev_hash, t.hash = e.hash), t;
}
function la(e, t, n) {
	let r = Zi(e, n, /* @__PURE__ */ new Set());
	return Ri($i(r)) > 262144 && V(n, `must encode to at most ${ki} UTF-8 bytes`), t === "domain_event_recorded" ? ua(r, n) : r;
}
function ua(e, t) {
	let n = Fi(e, t);
	return Ii(n, [
		"domain",
		"kind",
		"entity_id",
		"data"
	], [], t), {
		domain: zi(n.domain, `${t}.domain`),
		kind: zi(n.kind, `${t}.kind`),
		entity_id: zi(n.entity_id, `${t}.entity_id`),
		data: Zi(n.data, `${t}.data`, /* @__PURE__ */ new Set())
	};
}
function da(e, t) {
	if (e.schema_version !== 1) throw new fa(t);
	return 1;
}
var fa = class extends Error {
	path;
	constructor(e) {
		super("schema version is not supported"), this.path = e;
	}
};
function pa(e, t) {
	try {
		return {
			ok: !0,
			value: t()
		};
	} catch (t) {
		return t instanceof fa ? {
			ok: !1,
			diagnostic: {
				code: "unsupported_schema",
				path: t.path,
				safe_detail: "Schema version is not supported."
			}
		} : t instanceof Ni ? {
			ok: !1,
			diagnostic: {
				code: e,
				path: t.path,
				safe_detail: t.safeDetail
			}
		} : {
			ok: !1,
			diagnostic: {
				code: e,
				safe_detail: "Value could not be inspected safely."
			}
		};
	}
}
function ma(e) {
	return pa("invalid_record", () => {
		let t = Fi(e, "$");
		Ii(t, [
			"schema_version",
			"event_id",
			"record_id",
			"sequence",
			"event_type",
			"scope",
			"source",
			"caused_by",
			"occurred_at_ms",
			"persisted_at_ms",
			"payload"
		], ["prev_hash", "hash"]);
		let n = da(t, "$.schema_version"), r = Ui(t.event_type, "$.event_type"), i = {
			schema_version: n,
			event_type: r,
			scope: Ki(t.scope, "$.scope"),
			source: Ji(t.source, "$.source"),
			caused_by: Xi(t.caused_by, "$.caused_by", Yi),
			occurred_at_ms: Vi(t.occurred_at_ms, "$.occurred_at_ms", !0),
			payload: la(t.payload, r, "$.payload")
		}, a = Gi(t.event_id, "e1:", "$.event_id"), o = Gi(t.record_id, "r1:", "$.record_id");
		a !== oa(i) && V("$.event_id", "does not match canonical event content"), o !== sa(i) && V("$.record_id", "does not match canonical event content");
		let s = Object.hasOwn(t, "prev_hash"), c = Object.hasOwn(t, "hash");
		s !== c && V("$", "prev_hash and hash must be present together");
		let l = {
			...i,
			event_id: a,
			record_id: o,
			sequence: Bi(t.sequence, "$.sequence", 1),
			persisted_at_ms: Vi(t.persisted_at_ms, "$.persisted_at_ms", !1)
		};
		return s && c ? {
			...l,
			prev_hash: Gi(t.prev_hash, "h1:", "$.prev_hash"),
			hash: Gi(t.hash, "h1:", "$.hash")
		} : l;
	});
}
function ha(e) {
	return `${$i(ca(e))}\n`;
}
function ga(e, t) {
	if (!Number.isSafeInteger(t) || t < 1) return {
		ok: !1,
		diagnostic: {
			code: "invalid_record",
			safe_detail: "Line number must be a positive integer."
		}
	};
	let n;
	try {
		n = JSON.parse(e);
	} catch {
		return {
			ok: !1,
			diagnostic: {
				code: "invalid_record",
				line: t,
				safe_detail: "Line is not valid JSON."
			}
		};
	}
	let r = ma(n);
	return r.ok ? r : {
		ok: !1,
		diagnostic: {
			...r.diagnostic,
			line: t
		}
	};
}
// src/core/ghost-state.ts
var _a = [
	"idle",
	"working",
	"waiting",
	"blocked",
	"failed",
	"done"
];
function va(e) {
	return e.caused_by.length + (e.occurred_at_ms === null ? 0 : 1) + (e.source.generation.length === 0 ? 0 : 1) + +(e.source.source_sequence > 0) + Aa(e.payload);
}
function ya(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = t.get(n.record_id);
		(e === void 0 || Fa(n, e) < 0) && t.set(n.record_id, n);
	}
	let n = /* @__PURE__ */ new Map();
	for (let e of t.values()) {
		let t = n.get(e.event_id);
		t === void 0 ? n.set(e.event_id, [e]) : t.push(e);
	}
	let r = [], i = /* @__PURE__ */ new Map();
	for (let [e, t] of n) {
		let n = t[0];
		for (let e of t.slice(1)) Pa(e, n) > 0 && (n = e);
		r.push(n);
		let a = t.map((e) => e.record_id).sort(H);
		a.length > 1 && Ba(i, {
			code: "conflicting_variant",
			event_id: e,
			related_event_id: null,
			kind: "conflict",
			record_ids: a
		});
	}
	r.sort(Ia);
	let a = new Map(r.map((e, t) => [e.event_id, t]));
	return r.forEach((e, t) => {
		for (let n of new Set(e.caused_by)) {
			let r = a.get(n);
			r === void 0 ? Ba(i, {
				code: "missing_predecessor",
				event_id: e.event_id,
				related_event_id: n,
				kind: "missing",
				record_ids: []
			}) : r >= t && Ba(i, {
				code: "missing_predecessor",
				event_id: e.event_id,
				related_event_id: n,
				kind: "forward",
				record_ids: []
			});
		}
	}), {
		events: r,
		diagnostics: Array.from(i.values()).sort(za)
	};
}
function ba(e, t, n, r) {
	return `t1:${na($i([
		e,
		t,
		n,
		r
	]))}`;
}
function xa(e) {
	let t = ya(e);
	return {
		selection: t,
		snapshots: Sa(t.events),
		transitions: Ea(t.events)
	};
}
function Sa(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = [n.scope.mansion_id, n.scope.ghost_id];
		t.set($i(e), e);
	}
	return Array.from(t.values()).sort(Ra).map(([t, n]) => Da(e, t, n));
}
function Ca(e) {
	return $i([
		e.run_sequence,
		e.run_id,
		e.session_slot
	]);
}
function wa(e, t) {
	switch (e.latest = t, t.event_type) {
		case "approval_requested":
			Ma(t, "mid") !== null && e.requests.push(t);
			break;
		case "approval_decided": {
			let n = Ma(t, "mid");
			n !== null && e.decided.add(n);
			break;
		}
		case "tool_started": {
			let n = Ma(t, "tool_call_id");
			n !== null && e.startedTools.add(n);
			break;
		}
		case "tool_finished": {
			let n = Ma(t, "tool_call_id");
			n !== null && Na(t, "final") === !0 && e.finishedTools.add(n);
			break;
		}
		case "run_failed":
			e.failed = t;
			break;
		case "run_blocked":
			e.blocked = t;
			break;
		case "run_completed":
			e.completed = t;
			break;
		case "ghost_progressed":
		case "run_started": e.progress = t;
	}
}
function Ta(e, t, n) {
	let r = e.selectedStart;
	if (r === null) return Oa(t, n);
	let i = e.runs.get(Ca(r.scope)), a = /* @__PURE__ */ new Set();
	for (let e of i.requests) {
		let t = Ma(e, "mid");
		i.decided.has(t) || a.add(t);
	}
	let o = Array.from(a).sort(H), s = Array.from(i.startedTools).filter((e) => !i.finishedTools.has(e)).sort(H), c, l;
	return i.failed === void 0 ? i.blocked === void 0 ? i.completed === void 0 ? o.length > 0 ? (c = "waiting", l = ka(i.requests, (e) => a.has(Ma(e, "mid")))) : (c = "working", l = i.progress) : (c = "done", l = i.completed) : (c = "blocked", l = i.blocked) : (c = "failed", l = i.failed), {
		mansion_id: t,
		ghost_id: n,
		run_id: r.scope.run_id,
		run_sequence: r.scope.run_sequence,
		state: c,
		pending_approvals: o,
		open_tools: s,
		latest_event_id: i.latest.event_id,
		latest_sequence: i.latest.sequence,
		reason: l === void 0 ? null : Ma(l, "reason")
	};
}
function Ea(e) {
	let t = /* @__PURE__ */ new Map(), n = [];
	for (let r of e) {
		let e = r.scope.mansion_id, i = r.scope.ghost_id, a = $i([e, i]), o = t.get(a);
		o === void 0 && (o = {
			runs: /* @__PURE__ */ new Map(),
			selectedStart: null,
			snapshot: Oa(e, i)
		}, t.set(a, o));
		let s = Ca(r.scope), c = o.runs.get(s);
		c === void 0 && (c = {
			requests: [],
			decided: /* @__PURE__ */ new Set(),
			startedTools: /* @__PURE__ */ new Set(),
			finishedTools: /* @__PURE__ */ new Set(),
			latest: r
		}, o.runs.set(s, c)), wa(c, r), r.event_type === "run_started" && (o.selectedStart === null || La(r, o.selectedStart) > 0) && (o.selectedStart = r);
		let l = o.snapshot, u = Ta(o, e, i);
		o.snapshot = u, Va(l, u) || n.push({
			transition_id: ba(r.event_id, e, i, u.state),
			causing_event_id: r.event_id,
			causing_sequence: r.sequence,
			mansion_id: e,
			ghost_id: i,
			from_state: l.state,
			to_state: u.state
		});
	}
	return n;
}
function Da(e, t, n) {
	let r = e.filter((e) => e.scope.mansion_id === t && e.scope.ghost_id === n), i = r.filter((e) => e.event_type === "run_started");
	if (i.length === 0) return Oa(t, n);
	let a = i[0];
	for (let e of i.slice(1)) La(e, a) > 0 && (a = e);
	let o = r.filter((e) => e.scope.run_sequence === a.scope.run_sequence && e.scope.run_id === a.scope.run_id && e.scope.session_slot === a.scope.session_slot), s = new Set(o.filter((e) => e.event_type === "approval_requested").map((e) => Ma(e, "mid")).filter((e) => e !== null)), c = new Set(o.filter((e) => e.event_type === "approval_decided").map((e) => Ma(e, "mid")).filter((e) => e !== null)), l = Array.from(s).filter((e) => !c.has(e)).sort(H), u = new Set(o.filter((e) => e.event_type === "tool_started").map((e) => Ma(e, "tool_call_id")).filter((e) => e !== null)), d = new Set(o.filter((e) => e.event_type === "tool_finished" && Na(e, "final") === !0).map((e) => Ma(e, "tool_call_id")).filter((e) => e !== null)), f = Array.from(u).filter((e) => !d.has(e)).sort(H), p = o.filter((e) => e.event_type === "run_failed"), m = o.filter((e) => e.event_type === "run_blocked"), h = o.filter((e) => e.event_type === "run_completed"), g, _;
	p.length > 0 ? (g = "failed", _ = p.at(-1)) : m.length > 0 ? (g = "blocked", _ = m.at(-1)) : h.length > 0 ? (g = "done", _ = h.at(-1)) : l.length > 0 ? (g = "waiting", _ = ka(o, (e) => e.event_type === "approval_requested" && l.includes(Ma(e, "mid") ?? ""))) : (g = "working", _ = ka(o, (e) => e.event_type === "ghost_progressed" || e.event_type === "run_started"));
	let v = o.at(-1);
	return {
		mansion_id: t,
		ghost_id: n,
		run_id: a.scope.run_id,
		run_sequence: a.scope.run_sequence,
		state: g,
		pending_approvals: l,
		open_tools: f,
		latest_event_id: v.event_id,
		latest_sequence: v.sequence,
		reason: _ === void 0 ? null : Ma(_, "reason")
	};
}
function Oa(e, t) {
	return {
		mansion_id: e,
		ghost_id: t,
		run_id: null,
		run_sequence: null,
		state: "idle",
		pending_approvals: [],
		open_tools: [],
		latest_event_id: null,
		latest_sequence: 0,
		reason: null
	};
}
function ka(e, t) {
	for (let n = e.length - 1; n >= 0; --n) {
		let r = e[n];
		if (t(r)) return r;
	}
}
function Aa(e) {
	return e === null ? 0 : typeof e == "string" ? e.length === 0 ? 0 : 1 : typeof e == "boolean" || typeof e == "number" ? 1 : Array.isArray(e) ? e.reduce((e, t) => e + Aa(t), 0) : Object.values(e).reduce((e, t) => e + Aa(t), 0);
}
function ja(e) {
	return e.payload === null || Array.isArray(e.payload) || typeof e.payload != "object" ? null : e.payload;
}
function Ma(e, t) {
	let n = ja(e)?.[t];
	return typeof n == "string" && n.length > 0 ? n : null;
}
function Na(e, t) {
	let n = ja(e)?.[t];
	return typeof n == "boolean" ? n : null;
}
function Pa(e, t) {
	if (e.source.revision !== t.source.revision) return e.source.revision - t.source.revision;
	let n = va(e) - va(t);
	return n === 0 ? H(e.record_id, t.record_id) : n;
}
function Fa(e, t) {
	if (e.sequence !== t.sequence) return e.sequence - t.sequence;
	let n = H(e.event_id, t.event_id);
	return n === 0 ? H(ha(e), ha(t)) : n;
}
function Ia(e, t) {
	return e.sequence === t.sequence ? H(e.event_id, t.event_id) : e.sequence - t.sequence;
}
function La(e, t) {
	if (e.scope.run_sequence !== t.scope.run_sequence) return e.scope.run_sequence - t.scope.run_sequence;
	let n = H(e.scope.run_id, t.scope.run_id);
	return n === 0 ? e.sequence === t.sequence ? H(e.event_id, t.event_id) : e.sequence - t.sequence : n;
}
function Ra(e, t) {
	let n = H(e[0], t[0]);
	return n === 0 ? H(e[1], t[1]) : n;
}
function za(e, t) {
	return [
		H(e.code, t.code),
		H(e.event_id, t.event_id),
		H(e.related_event_id ?? "", t.related_event_id ?? ""),
		H(e.kind, t.kind),
		H(e.record_ids.join(","), t.record_ids.join(","))
	].find((e) => e !== 0) ?? 0;
}
function Ba(e, t) {
	e.set($i(t), t);
}
function Va(e, t) {
	return $i(e) === $i(t);
}
function H(e, t) {
	let n = Array.from(e, (e) => e.codePointAt(0)), r = Array.from(t, (e) => e.codePointAt(0)), i = Math.min(n.length, r.length);
	for (let e = 0; e < i; e += 1) if (n[e] !== r[e]) return n[e] - r[e];
	return n.length - r.length;
}
var U = [
	"requirements",
	"design",
	"tasks",
	"implementation"
], Ha = [
	"not_started",
	"ready",
	"starting",
	"working",
	"waiting",
	"revision_required",
	"approved",
	"failed",
	"done"
], Ua = [
	"sealed",
	"waiting",
	"open",
	"rejected"
], Wa = [
	"pending",
	"approved",
	"rejected",
	"superseded"
], Ga = [
	"pending",
	"approved",
	"rejected",
	"consumed",
	"succeeded",
	"failed",
	"superseded"
], Ka = [
	"valid",
	"corrupt",
	"uncertain"
], qa = [
	"delete_path",
	"run_command",
	"git_write"
], Ja = [
	"list",
	"read",
	"write",
	"delete",
	"command_read",
	"command_write",
	"git_write"
], Ya = ["approved", "rejected"], Xa = ["operator", "crew"], Za = 1024, Qa = ["[redacted]", "[home]/"], $a = class extends Error {
	path;
	constructor(e) {
		super("refused"), this.path = e;
	}
};
function W(e) {
	throw new $a(e);
}
function eo(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function to(e, t, n, r = []) {
	eo(e) || W(t);
	for (let i of Object.keys(e)) !n.includes(i) && !r.includes(i) && W(t);
	for (let r of n) Object.hasOwn(e, r) || W(`${t}.${r}`);
	return e;
}
function no(e, t, n) {
	return typeof e == "string" && t.includes(e) || W(n), e;
}
function ro(e, t, n = 0) {
	return (typeof e != "number" || !Number.isSafeInteger(e) || e < n) && W(t), e;
}
var io = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
function ao(e, t, n = 160) {
	return (typeof e != "string" || e.length === 0 || e.length > n || io.test(e)) && W(t), e;
}
function oo(e, t) {
	return typeof e == "string" && /^[0-9a-f]{64}$/.test(e) || W(t), e;
}
function so(e, t, n = !1) {
	if (n && e === "") return "";
	let r = ao(e, t, Za);
	(r.startsWith("/") || r.includes("\\")) && W(t);
	for (let e of r.split("/")) (e === "" || e === "." || e === "..") && W(t);
	return r;
}
function co(e, t) {
	return (typeof e != "string" || e.length > 40 || !Oi.test(e)) && W(t), e;
}
function lo(e, t) {
	let n = to(e, t, [
		"revision",
		"sha256",
		"size_bytes"
	]);
	return {
		revision: ro(n.revision, `${t}.revision`, 1),
		sha256: oo(n.sha256, `${t}.sha256`),
		sizeBytes: ro(n.size_bytes, `${t}.size_bytes`)
	};
}
function uo(e, t) {
	if (e === null) return null;
	let n = to(e, t, [
		"outcome",
		"actor",
		"event_id",
		"sequence"
	]), r = n.event_id;
	return typeof r == "string" && /^e1:[0-9a-f]{64}$/.test(r) || W(`${t}.event_id`), {
		outcome: no(n.outcome, Ya, `${t}.outcome`),
		actor: no(n.actor, Xa, `${t}.actor`),
		eventId: r,
		sequence: ro(n.sequence, `${t}.sequence`, 1)
	};
}
function fo(e, t, n, r) {
	if (e === "pending") return t === null;
	if (e === "superseded") return t === null || r && t.outcome === "approved";
	let i = Object.hasOwn(n, e) ? n[e] : void 0;
	return i !== void 0 && t !== null && t.outcome === i;
}
var po = {
	approved: "approved",
	rejected: "rejected"
}, mo = {
	approved: "approved",
	rejected: "rejected",
	consumed: "approved",
	succeeded: "approved",
	failed: "approved"
};
function ho(e, t, n) {
	if (e === null) return null;
	let r = to(e, t, [
		"proposal_id",
		"phase",
		"document_path",
		"artifact_revision",
		"status",
		"created_sequence",
		"decision"
	]);
	r.phase !== n && W(`${t}.phase`);
	let i = no(r.status, Wa, `${t}.status`), a = uo(r.decision, `${t}.decision`);
	return fo(i, a, po, !1) || W(`${t}.decision`), {
		proposalId: ao(r.proposal_id, `${t}.proposal_id`),
		phase: n,
		documentPath: so(r.document_path, `${t}.document_path`),
		artifactRevision: lo(r.artifact_revision, `${t}.artifact_revision`),
		status: i,
		createdSequence: ro(r.created_sequence, `${t}.created_sequence`, 1),
		decision: a
	};
}
function go(e, t) {
	switch (e) {
		case "waiting": return t?.status === "pending";
		case "open": return t?.status === "approved";
		case "rejected": return t?.status === "rejected";
		case "sealed": return t === null || t.status === "superseded" || t.status === "rejected";
	}
}
function _o(e, t, n) {
	let r = to(e, t, [
		"phase",
		"status",
		"ghost_ids",
		"door"
	]);
	r.phase !== n && W(`${t}.phase`), (!Array.isArray(r.ghost_ids) || r.ghost_ids.length > 16) && W(`${t}.ghost_ids`);
	let i = r.ghost_ids.map((e, n) => ao(e, `${t}.ghost_ids[${n}]`));
	new Set(i).size !== i.length && W(`${t}.ghost_ids`);
	let a = to(r.door, `${t}.door`, ["status", "proposal"]), o = no(a.status, Ua, `${t}.door.status`), s = ho(a.proposal, `${t}.door.proposal`, n);
	return go(o, s) || W(`${t}.door`), {
		phase: n,
		status: no(r.status, Ha, `${t}.status`),
		ghostIds: i,
		door: {
			status: o,
			proposal: s
		}
	};
}
function vo(e) {
	return Qa.some((t) => e.includes(t));
}
function yo(e, t = 0) {
	return t > 8 ? !1 : e === null || typeof e == "boolean" ? !0 : typeof e == "number" ? Number.isSafeInteger(e) : typeof e == "string" ? !io.test(e) && !vo(e) : Array.isArray(e) ? e.every((e) => yo(e, t + 1)) : eo(e) ? Object.entries(e).every(([e, n]) => e !== "" && !io.test(e) && !vo(e) && yo(n, t + 1)) : !1;
}
function bo(e) {
	try {
		let t = to(e, "$", [
			"schema_version",
			"mansion_id",
			"session_slot",
			"room",
			"kind",
			"working_directory",
			"arguments",
			"path_intents"
		]);
		if (t.schema_version !== 1 || !eo(t.arguments) || !yo(t.arguments) || JSON.stringify(t.arguments).length > 16384 || !Array.isArray(t.path_intents) || t.path_intents.length > 64 || [
			t.session_slot,
			t.room,
			t.working_directory
		].some((e) => typeof e == "string" && vo(e))) return null;
		let n = t.path_intents.map((e, t) => {
			let n = to(e, `\$[${t}]`, ["path", "access"]);
			return typeof n.path == "string" && vo(n.path) && W("$"), {
				path: so(n.path, "$"),
				access: no(n.access, Ja, "$")
			};
		});
		return {
			schemaVersion: 1,
			mansionId: co(t.mansion_id, "$"),
			sessionSlot: ao(t.session_slot, "$"),
			room: ao(t.room, "$"),
			kind: no(t.kind, qa, "$"),
			workingDirectory: so(t.working_directory, "$", !0),
			arguments: t.arguments,
			pathIntents: n
		};
	} catch (e) {
		if (e instanceof $a) return null;
		throw e;
	}
}
function xo(e, t, n) {
	let r = to(e, t, [
		"proposal_id",
		"ghost_id",
		"session_slot",
		"room",
		"status",
		"action_digest",
		"descriptor",
		"created_sequence",
		"decision"
	]), i = no(r.status, Ga, `${t}.status`), a = uo(r.decision, `${t}.decision`);
	fo(i, a, mo, !0) || W(`${t}.decision`);
	let o = ao(r.session_slot, `${t}.session_slot`), s = r.room === null ? null : ao(r.room, `${t}.room`), c = r.descriptor === null ? null : bo(r.descriptor);
	return c !== null && (c.mansionId !== n || c.sessionSlot !== o || c.room !== s) && (c = null), {
		proposalId: ao(r.proposal_id, `${t}.proposal_id`),
		ghostId: ao(r.ghost_id, `${t}.ghost_id`),
		sessionSlot: o,
		room: s,
		status: i,
		actionDigest: oo(r.action_digest, `${t}.action_digest`),
		descriptor: c,
		createdSequence: ro(r.created_sequence, `${t}.created_sequence`, 1),
		decision: a
	};
}
function So(e, t) {
	let n = to(e, t, [
		"slot",
		"mid",
		"requested_sequence",
		"tool_name",
		"action_digest",
		"proposal_id"
	]);
	return {
		slot: ao(n.slot, `${t}.slot`),
		mid: ao(n.mid, `${t}.mid`),
		requestedSequence: ro(n.requested_sequence, `${t}.requested_sequence`, 1),
		toolName: n.tool_name === null ? null : ao(n.tool_name, `${t}.tool_name`),
		actionDigest: n.action_digest === null ? null : oo(n.action_digest, `${t}.action_digest`),
		proposalId: n.proposal_id === null ? null : ao(n.proposal_id, `${t}.proposal_id`)
	};
}
function Co(e, t) {
	new Set(e).size !== e.length && W(t);
}
function wo(e, t) {
	try {
		let n = to(e, "$", [
			"schema_version",
			"mansion_id",
			"version",
			"integrity",
			"waiting_count",
			"phases",
			"risky_proposals",
			"pending_permissions"
		], ["read_only"]);
		n.read_only !== void 0 && typeof n.read_only != "boolean" && W("$.read_only"), n.schema_version !== 1 && W("$.schema_version");
		let r = co(n.mansion_id, "$.mansion_id");
		t !== void 0 && r !== t && W("$.mansion_id");
		let i = ro(n.version, "$.version");
		Array.isArray(n.phases) && n.phases.length === U.length || W("$.phases");
		let a = U.map((e, t) => _o(n.phases[t], `$.phases[${t}]`, e));
		(!Array.isArray(n.risky_proposals) || n.risky_proposals.length > 200) && W("$.risky_proposals");
		let o = n.risky_proposals.map((e, t) => xo(e, `$.risky_proposals[${t}]`, r));
		Co(o.map((e) => e.proposalId), "$.risky_proposals"), (!Array.isArray(n.pending_permissions) || n.pending_permissions.length > 200) && W("$.pending_permissions");
		let s = n.pending_permissions.map((e, t) => So(e, `$.pending_permissions[${t}]`));
		return Co(s.map((e) => JSON.stringify([e.slot, e.mid])), "$.pending_permissions"), [
			...o.flatMap((e) => [e.createdSequence, e.decision?.sequence ?? 0]),
			...a.flatMap((e) => [e.door.proposal?.createdSequence ?? 0, e.door.proposal?.decision?.sequence ?? 0]),
			...s.map((e) => e.requestedSequence)
		].some((e) => e > i) && W("$.version"), {
			ok: !0,
			projection: {
				mansionId: r,
				version: i,
				integrity: no(n.integrity, Ka, "$.integrity"),
				waitingCount: ro(n.waiting_count, "$.waiting_count"),
				phases: a,
				riskyProposals: o,
				pendingPermissions: s,
				readOnly: n.read_only === !0
			}
		};
	} catch (e) {
		if (e instanceof $a) return {
			ok: !1,
			path: e.path
		};
		throw e;
	}
}
function To(e) {
	return {
		revision: e.revision,
		sha256: e.sha256,
		size_bytes: e.sizeBytes
	};
}
var Eo = [
	"study",
	"drafting-room",
	"workshop"
].map((e) => {
	let t = ri(e);
	return {
		id: e,
		name: t.name,
		phases: t.workflowPhases,
		roles: t.ghostRoles
	};
}), G = {
	requirements: "Requirements",
	design: "Design",
	tasks: "Tasks",
	implementation: "Implementation"
}, Do = {
	not_started: "Not started",
	ready: "Ready to start",
	starting: "Starting",
	working: "Working",
	waiting: "Waiting for your decision",
	revision_required: "Revision required",
	approved: "Approved",
	failed: "Failed to start",
	done: "Done"
}, Oo = {
	sealed: "Sealed door",
	waiting: "Door waiting for your decision",
	open: "Open door",
	rejected: "Door kept shut"
};
function ko(e, t = {}) {
	let n = Object.hasOwn(t, e) ? t[e] : void 0;
	return n === void 0 || n.trim() === "" ? qr(e) : n;
}
function Ao(e) {
	return Eo.find((t) => t.phases.includes(e)).id;
}
function jo(e, t) {
	if (t !== null) {
		for (let n of t.phases) if (n.ghostIds.includes(e)) return Ao(n.phase);
	}
	for (let t of Eo) if (t.roles.some((t) => e === t || e.startsWith(`${t}-`))) return t.id;
	return null;
}
function Mo(e) {
	return U[U.indexOf(e) + 1] ?? null;
}
function No(e, t) {
	let n = G[e].toLowerCase(), r = Mo(e);
	switch (t) {
		case "sealed": return `Sealed door: approve the ${n} to open it.`;
		case "waiting": return `The ${n} are ready. Approve or reject them to decide this door.`;
		case "open": return r === null ? `Open door: the ${n} were approved.` : `Open door: the ${n} were approved. ${G[r]} may be started.`;
		case "rejected": return `Door kept shut: the ${n} were rejected and need a revision.`;
	}
}
var Po = {
	read_only: "This is a recording. Nothing can be started, approved or rejected here.",
	loading: "Loading the state of the house. Decisions are off until it arrives.",
	unavailable: "The house could not be reached. Decisions are off until it answers.",
	malformed: "The house sent a state this page cannot read. Decisions are off.",
	integrity: "The séance log failed its integrity check. Decisions are off until it is repaired.",
	uncertain: "The latest ghost activity is not confirmed yet. Decisions are off until the house catches up.",
	catching_up: "Catching up with the séance log. Decisions are off until it is current.",
	stale: "Something changed in the house. Refreshing before you decide."
}, Fo = /* @__PURE__ */ new Set([
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"duplicate_sequence",
	"missing_sequence"
]);
function Io(e) {
	let t = (e) => ({
		canDecide: !1,
		block: e,
		text: Po[e]
	});
	return e.readOnly === !0 || e.projection?.readOnly === !0 ? t("read_only") : e.projectionStatus === "malformed" ? t("malformed") : e.projection === null ? t(e.projectionStatus === "unavailable" ? "unavailable" : "loading") : e.projection.integrity === "corrupt" ? t("integrity") : e.canonical.diagnostic === null ? e.projection.integrity === "uncertain" ? t("uncertain") : e.projectionStatus === "unavailable" ? t("unavailable") : !e.canonical.loaded || e.canonical.catchingUp ? t("catching_up") : e.canonical.highestSequence > e.projection.version ? t("stale") : {
		canDecide: !0,
		block: null,
		text: null
	} : t(Fo.has(e.canonical.diagnostic.code) ? "integrity" : "uncertain");
}
function Lo(e) {
	return e.kind === "start_phase" ? `phase:${e.phase}` : `proposal:${e.proposalId}`;
}
function Ro(e) {
	return e.slice(0, 12);
}
function zo(e) {
	return e === 1 ? "1 byte" : `${e.toLocaleString("en-US")} bytes`;
}
function Bo(e) {
	let t = e.outcome === "approved" ? "Approved" : "Rejected";
	return e.actor === "operator" ? `${t} by the operator in Haunted House.` : `${t} in Crew, outside Haunted House.`;
}
function Vo(e, t, n, r, i) {
	if (!e) return {
		canApprove: !1,
		canReject: !1,
		busy: !1,
		blockedText: null
	};
	let a = r === i, o = n.canDecide && r === null;
	return {
		canApprove: o && t,
		canReject: o,
		busy: a,
		blockedText: n.canDecide ? t ? null : "Blocked: this action cannot be shown completely, so it cannot be approved. You can reject it." : n.text
	};
}
function Ho(e, t, n, r) {
	let i = t.door.proposal;
	if (i === null) return null;
	let a = i.status === "pending" && t.door.status === "waiting", o = a ? "pending" : i.status === "pending" ? "superseded" : i.status, s = Vo(a, !0, n, r, `proposal:${i.proposalId}`), c = (n) => ({
		kind: "decide_door",
		decision: n,
		proposalId: i.proposalId,
		phase: t.phase,
		documentPath: i.documentPath,
		artifactRevision: i.artifactRevision,
		expectedVersion: e.version
	});
	return {
		...s,
		phase: t.phase,
		proposalId: i.proposalId,
		state: o,
		title: `${G[t.phase]} door`,
		documentPath: i.documentPath,
		revisionText: `Revision ${i.artifactRevision.revision}`,
		digestPrefix: Ro(i.artifactRevision.sha256),
		sizeText: zo(i.artifactRevision.sizeBytes),
		outcomeText: i.decision === null ? o === "superseded" ? "Superseded: the document changed after this proposal. A new revision needs its own decision." : null : Bo(i.decision),
		approve: s.canApprove ? c("approve") : null,
		reject: s.canReject ? c("reject") : null
	};
}
var Uo = {
	delete_path: "Delete a file or empty folder",
	run_command: "Run a command",
	git_write: "Change the git repository"
}, Wo = {
	list: "List",
	read: "Read",
	write: "Write",
	delete: "Delete",
	command_read: "Command may read",
	command_write: "Command may write",
	git_write: "Git may write"
}, Go = {
	pending: "Waiting for your decision",
	approved: "Approved, not used yet",
	rejected: "Rejected",
	consumed: "Approval used: the action is running",
	succeeded: "Done: the approved action succeeded",
	failed: "Failed: the approved action did not succeed. The approval is used up.",
	superseded: "Superseded"
}, Ko = "Approving allows exactly one attempt of exactly this action. If the attempt fails, the approval is used up and the ghost must ask again.";
function qo(e) {
	return Array.isArray(e) && e.every((e) => typeof e == "string") ? e.map((e) => JSON.stringify(e)).join(" ") : typeof e == "string" ? e : JSON.stringify(e);
}
function Jo(e) {
	return {
		scope: [
			{
				label: "Action",
				value: Uo[e.kind]
			},
			{
				label: "Mansion",
				value: e.mansionId
			},
			{
				label: "Room",
				value: e.room
			},
			{
				label: "Session",
				value: e.sessionSlot
			},
			{
				label: "Working folder",
				value: e.workingDirectory === "" ? "The mansion folder" : e.workingDirectory
			}
		],
		arguments: Object.keys(e.arguments).sort().map((t) => ({
			label: t,
			value: qo(e.arguments[t])
		})),
		paths: e.pathIntents.map((e) => ({
			label: Wo[e.access],
			value: e.path
		}))
	};
}
function Yo(e, t, n, r, i = {}) {
	let a = t.descriptor !== null, o = Vo(t.status === "pending", a, n, r, `proposal:${t.proposalId}`), s = t.descriptor === null ? {
		scope: [],
		arguments: [],
		paths: []
	} : Jo(t.descriptor), c = (n) => ({
		kind: "decide_risky",
		decision: n,
		proposalId: t.proposalId,
		actionDigest: t.actionDigest,
		expectedVersion: e.version
	});
	return {
		...o,
		proposalId: t.proposalId,
		ghostId: t.ghostId,
		ghostName: ko(t.ghostId, i),
		status: t.status,
		statusText: Go[t.status],
		title: t.descriptor === null ? "Risky action (details unavailable)" : Uo[t.descriptor.kind],
		complete: a,
		...s,
		digestPrefix: Ro(t.actionDigest),
		oneAttemptText: Ko,
		outcomeText: t.decision === null ? null : Bo(t.decision),
		approve: o.canApprove ? c("approve") : null,
		reject: o.canReject ? c("reject") : null
	};
}
var Xo = {
	ready: (e) => `Start ${e}`,
	failed: (e) => `Try starting ${e} again`,
	revision_required: (e) => `Start the ${e} revision`
};
function Zo(e, t, n, r) {
	let i = Xo[t.status];
	if (i === void 0) return null;
	let a = n.canDecide && r === null;
	return {
		phase: t.phase,
		label: i(G[t.phase].toLowerCase()),
		enabled: a,
		busy: r === `phase:${t.phase}`,
		command: a ? {
			kind: "start_phase",
			phase: t.phase,
			expectedVersion: e.version
		} : null
	};
}
function Qo(e, t = {}) {
	if (e === null) return [];
	let n = [], r = (e) => ko(e, t);
	for (let t of e.phases) {
		let e = t.door.proposal;
		t.door.status === "waiting" && e !== null && e.status === "pending" && n.push({
			kind: "door",
			id: `door:${e.proposalId}`,
			room: Ao(t.phase),
			phase: t.phase,
			ghostId: t.ghostIds.at(-1) ?? null,
			text: `The ${G[t.phase].toLowerCase()} door needs your decision.`
		});
	}
	let i = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set();
	for (let t of e.riskyProposals) {
		if (t.status !== "pending") continue;
		i.add(t.proposalId), a.add(t.sessionSlot);
		let o = t.descriptor === null ? "do something risky" : Uo[t.descriptor.kind].toLowerCase();
		n.push({
			kind: "risky",
			id: `risky:${t.proposalId}`,
			room: jo(t.ghostId, e) ?? "workshop",
			ghostId: t.ghostId,
			text: `${r(t.ghostId)} asks to ${o}.`
		});
	}
	for (let t of e.pendingPermissions) (t.proposalId === null ? a.has(t.slot) : i.has(t.proposalId)) || n.push({
		kind: "permission",
		id: `permission:${JSON.stringify([t.slot, t.mid])}`,
		room: null,
		ghostId: null,
		text: t.toolName === null ? "A ghost is waiting on a Crew tool prompt. Answer it in Crew." : `A ghost is waiting on a Crew tool prompt (${t.toolName}). Answer it in Crew.`
	});
	return n;
}
function $o(e) {
	return e === 0 ? "Nothing needs you" : e === 1 ? "1 thing needs you" : `${e} things need you`;
}
function es(e) {
	return e.length === 0 ? "No ghost here yet" : e.map((e) => `${e.name}: ${e.stateText}`).join(", ");
}
function ts(e, t, n = {}) {
	let r = Array.from(t), i = Qo(e, n);
	return Eo.map((t) => {
		let a = e === null ? [] : t.phases.map((t) => {
			let n = e.phases[U.indexOf(t)];
			return {
				phase: t,
				name: G[t],
				status: n.status,
				statusText: Do[n.status],
				doorStatus: n.door.status,
				doorText: Oo[n.door.status],
				doorHint: No(t, n.door.status)
			};
		}), o = Xr(r.filter((n) => jo(n.ghost_id, e) === t.id), n), s = i.filter((e) => e.room === t.id).length, c = a.length === 0 ? "State not loaded" : a.map((e) => `${e.name}: ${e.statusText}, ${e.doorText}`).join(". ");
		return {
			id: t.id,
			name: t.name,
			phases: a,
			ghosts: o,
			needsYou: s,
			label: `${t.name}. ${c}. ${es(o)}.${s > 0 ? ` ${$o(s)}.` : ""}`
		};
	});
}
function ns(e, t, n, r, i = {}) {
	if (e === null) return {
		room: t,
		phases: [],
		risky: []
	};
	let a = t.phases.map((t) => {
		let i = e.phases[U.indexOf(t.phase)];
		return {
			line: t,
			start: Zo(e, i, n, r),
			door: Ho(e, i, n, r)
		};
	}), o = e.riskyProposals.filter((n) => (jo(n.ghostId, e) ?? "workshop") === t.id), s = o.filter((e) => e.status === "pending"), c = o.filter((e) => e.status !== "pending").sort((e, t) => t.createdSequence - e.createdSequence).slice(0, 5);
	return {
		room: t,
		phases: a,
		risky: [...s, ...c].map((t) => Yo(e, t, n, r, i))
	};
}
// src/core/house-projection.ts
var rs = [
	"valid",
	"uncertain",
	"incompatible",
	"corrupt"
];
function is(e, t) {
	let n = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
var as = {
	uncertain: "This room's state is not confirmed. Its controls are off until the house catches up.",
	incompatible: "The house sent a state for this room that this page cannot read. Its controls are off.",
	corrupt: "This room's record failed its integrity check. Its controls are off until it is repaired."
}, os = "This is a recording. Nothing can be started, approved, rejected or opened in Crew here.", ss = "The Séance Room is locked. Review is a later chapter of this house, so nothing can be started or changed here.", cs = "This mansion's folder could not be confirmed. Return to the Foyer and open it again.", ls = {
	diagnostic: "Part of the séance log was left out. The Attic shows the records that could be read.",
	incompatible: "The séance log failed its integrity check. The Attic shows only the records before the failure."
}, us = "Door state unavailable", ds = "The state of this door could not be read. Nothing can be decided until it can.";
function fs(e, t) {
	return rs.indexOf(e) >= rs.indexOf(t) ? e : t;
}
var ps = {
	read_only: "valid",
	loading: "uncertain",
	unavailable: "uncertain",
	uncertain: "uncertain",
	catching_up: "uncertain",
	stale: "uncertain",
	malformed: "incompatible",
	integrity: "corrupt"
};
function ms(e, t) {
	switch (e.block) {
		case null:
		case "read_only":
		case "authority": return "valid";
		case "malformed": return "incompatible";
		case "integrity": return t.integrity === "corrupt" ? "corrupt" : "uncertain";
		default: return "uncertain";
	}
}
function hs(e) {
	return typeof e == "string" && Ua.includes(e);
}
function gs(e) {
	return typeof e == "string" && Ha.includes(e);
}
function _s(e) {
	return typeof e == "string" && _a.includes(e);
}
function vs(e, t) {
	let n = jo(e, t);
	if (n !== null) return n;
	for (let t of ei) if (t.ghostRoles.some((t) => e === t || e.startsWith(`${t}-`))) return t.id;
	return null;
}
var ys = [
	"failed",
	"blocked",
	"waiting",
	"working",
	"done",
	"idle"
];
function bs(e) {
	return e.length === 0 ? "not_applicable" : e.find((e) => e.state === "unavailable") === void 0 ? (e.find((e) => e.state !== "open") ?? e[e.length - 1]).state : "unavailable";
}
function xs(e) {
	return e.length === 0 ? "not_applicable" : e.some((e) => e.state === "unavailable") ? "unavailable" : ys.find((t) => e.some((e) => e.state === t)) ?? "not_applicable";
}
function Ss(e, t) {
	let n = !1, r = t.workflow, i = e.workflowPhases.map((e) => {
		let t = r?.phases[U.indexOf(e)], i = t?.door?.status;
		if (t === void 0 || !hs(i)) return r !== null && (n = !0), {
			phase: e,
			phaseName: G[e],
			state: "unavailable",
			text: us,
			hint: ds,
			proposalId: null,
			phaseStatus: null,
			phaseText: null
		};
		let a = t.door.proposal;
		return {
			phase: e,
			phaseName: G[e],
			state: i,
			text: Oo[i],
			hint: No(e, i),
			proposalId: i === "waiting" && a !== null && a.status === "pending" ? a.proposalId : null,
			phaseStatus: gs(t.status) ? t.status : null,
			phaseText: gs(t.status) ? `${G[e]}: ${Do[t.status]}` : null
		};
	}), a = [];
	for (let n of t.ghosts.values()) n.ghost_id !== "house-operator" && n.mansion_id === t.mansion.name && vs(n.ghost_id, r) === e.id && a.push(n);
	let o = a.filter((e) => _s(e.state)), s = new Map(Xr(o, t.ghostNames).map((e) => [e.ghostId, e]));
	return {
		doors: i,
		ghosts: a.map((e) => {
			let t = s.get(e.ghost_id);
			return t === void 0 ? (n = !0, {
				ghostId: e.ghost_id,
				name: is(e.ghost_id, 60),
				state: "unavailable",
				reason: null,
				pendingText: null
			}) : {
				ghostId: t.ghostId,
				name: is(t.name, 60) || "Ghost",
				state: t.state,
				reason: t.reason,
				pendingText: t.pendingText
			};
		}),
		malformed: n
	};
}
var Cs = {
	door: "door-decision",
	risky: "risky-decision",
	permission: "tool-decision"
};
function ws(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of Qo(e.workflow, e.ghostNames)) {
		let e = n.room ?? "foyer", r = t.get(e) ?? [];
		r.push({
			kind: Cs[n.kind],
			id: n.id,
			ghostId: n.ghostId,
			label: is(n.text, 160),
			status: "pending",
			actionAvailable: !0
		}), t.set(e, r);
	}
	return t;
}
function Ts(e) {
	return e === void 0 ? [] : e.runs.filter((e) => e.state === "failed").map((e) => ({
		runId: e.runId,
		ghostId: e.ghostId,
		label: is(`${is(e.ghostName, 60) || "A ghost"} failed. A fresh attempt can be started.`, 160),
		available: e.retry !== null
	}));
}
function Es(e) {
	return e === "valid" ? "valid" : e === "incompatible" ? "incompatible" : "uncertain";
}
function Ds(e, t, n, r) {
	let i = Ss(e, t), a = t.rooms.get(e.id), o = n.mode === "replay" || t.authority.block === "read_only", s = e.id === "seance-room" && n.seanceRoom !== "enabled", c = e.workflowPhases.length > 0 || e.id === "seance-room" && !s, l = "valid", u = null;
	e.id === "foyer" ? t.mansion.status !== "ready" && (l = "uncertain", u = cs) : e.id === "attic" ? (l = Es(t.replay.integrity), t.replay.integrity !== "valid" && (u = ls[t.replay.integrity])) : c && (t.authority.block !== null && (l = ps[t.authority.block]), l = fs(l, t.workflow === null ? "uncertain" : t.workflow.integrity), a !== void 0 && (l = fs(l, ms(a.gate, a)), l = fs(l, a.integrity)), l !== "valid" && (u = t.authority.block !== null && t.authority.block !== "read_only" ? t.authority.text : a !== void 0 && a.gate.block !== null && a.gate.block !== "read_only" && a.gate.block !== "authority" ? a.gate.text : null)), i.malformed && (l = fs(l, "incompatible"), u = as.incompatible);
	let d = e.id !== "attic" && !s, f = !c || t.authority.canDecide && (a === void 0 || a.gate.allowed), p = d && !o && l === "valid" && f, m = l === "valid" ? s ? ss : o ? os : p || !d ? null : t.authority.text ?? a?.gate.text ?? as.uncertain : u ?? as[l];
	return {
		roomId: e.id,
		name: e.name,
		phase: e.phase,
		door: bs(i.doors),
		ghost: xs(i.ghosts),
		doors: i.doors,
		ghosts: i.ghosts,
		integrity: l,
		mutatingActionsEnabled: p,
		readOnly: o,
		locked: s,
		diagnostic: m === null ? null : is(m, 240) || as.uncertain,
		waitingItems: s ? [] : r.get(e.id) ?? [],
		recoveryActions: s ? [] : Ts(a)
	};
}
function Os(e, t) {
	let n = ws(e), r = oi(t.seanceRoom).map((r) => Ds(r, e, t, n)), i = e.replay.diagnostics[0];
	return {
		mansionName: is(e.mansion.name, 60),
		mode: t.mode,
		rooms: r,
		needsYou: As(r),
		replay: {
			integrity: e.replay.integrity,
			validRecordCount: Math.max(0, Math.trunc(e.replay.validRecordCount) || 0),
			diagnostic: i === void 0 ? e.replay.integrity === "valid" ? null : ls[e.replay.integrity] : is(i.safeDetail, 240)
		}
	};
}
function ks(e) {
	return JSON.stringify([e.kind, e.id]);
}
function As(e) {
	let t = e.filter((e) => ni(e.roomId)).map((e, t) => ({
		room: e,
		index: t
	})).sort((e, t) => ai(e.room.roomId, t.room.roomId) || e.index - t.index), n = /* @__PURE__ */ new Set(), r = [], i = (e) => {
		let t = ks(e);
		n.has(t) || (n.add(t), r.push(e));
	};
	for (let { room: e } of t) {
		for (let t of e.waitingItems) t.status === "pending" && t.actionAvailable === !0 && i({
			id: t.id,
			kind: t.kind,
			roomId: e.roomId,
			ghostId: t.ghostId,
			label: t.label,
			actionAvailable: !0
		});
		for (let t of e.recoveryActions) t.available === !0 && i({
			id: t.runId,
			kind: "failed-run-recovery",
			roomId: e.roomId,
			ghostId: t.ghostId,
			label: t.label,
			actionAvailable: !0
		});
	}
	return r;
}
function js(e) {
	return e[0]?.roomId ?? null;
}
function Ms(e) {
	return $o(e.length);
}
function Ns(e) {
	return [
		{
			label: "Phase",
			value: $r[e.phase]
		},
		{
			label: "Door",
			value: ci(e.door)
		},
		{
			label: "Ghost",
			value: ci(e.ghost)
		}
	];
}
function Ps(e) {
	return `${is(e.name, 60).replace(/[.:]+$/u, "") || ri(e.roomId).name}. ${Ns(e).map((e) => `${e.label}: ${e.value}.`).join(" ")}`;
}
function Fs(e, t) {
	return `${t.name}, ghost in the ${e.name}. State: ${ci(t.state)}.`;
}
function Is(e, t) {
	return `${t.phaseName} door of the ${e.name}. State: ${ci(t.state)}.`;
}
function Ls(e) {
	switch (e.kind) {
		case "room": return JSON.stringify(["room", e.roomId]);
		case "ghost": return JSON.stringify([
			"ghost",
			e.roomId,
			e.ghostId
		]);
		case "door": return JSON.stringify([
			"door",
			e.roomId,
			e.phase
		]);
	}
}
function Rs(e, t) {
	if (e === null) return null;
	let n = t.rooms.find((t) => t.roomId === e.target.roomId);
	if (n === void 0) return null;
	let r = e.target;
	return r.kind === "ghost" && !n.ghosts.some((e) => e.ghostId === r.ghostId) || r.kind === "door" && !n.doors.some((e) => e.phase === r.phase) ? null : e;
}
// src/core/house-words.ts
var zs = [
	{
		id: "plan",
		plain: "plan",
		kiro: "spec",
		about: ["A spec is Kiro's name for the written plan of one feature.", "It is three files: requirements, design and tasks."],
		file: null
	},
	{
		id: "requirements",
		plain: "what it must do",
		kiro: "requirements",
		about: ["Requirements say what the software must do, one testable statement at a time.", "Kiro keeps them in requirements.md."],
		file: "requirements.md"
	},
	{
		id: "design",
		plain: "how it will work",
		kiro: "design",
		about: ["The design says how the software will be built to meet the requirements.", "Kiro keeps it in design.md."],
		file: "design.md"
	},
	{
		id: "tasks",
		plain: "to-do list",
		kiro: "tasks",
		about: ["Tasks are the ordered to-do list that turns the design into code.", "Kiro keeps them in tasks.md and ticks each one off."],
		file: "tasks.md"
	},
	{
		id: "build",
		plain: "the build",
		kiro: "implementation",
		about: ["Implementation is the work of carrying out the tasks.", "Each finished task leaves code in the project folder."],
		file: null
	},
	{
		id: "ghost",
		plain: "ghost",
		kiro: "agent",
		about: ["An agent is an AI worker with one job and its own limits.", "Each ghost in this house is one Kiro agent."],
		file: null
	},
	{
		id: "approve",
		plain: "open the door",
		kiro: "approve",
		about: ["Approving says a document is good enough to build on.", "Nothing moves to the next step until you approve."],
		file: null
	},
	{
		id: "reject",
		plain: "keep the door shut",
		kiro: "reject",
		about: ["To reject a document says it is not good enough yet.", "The door stays shut until a new version is approved."],
		file: null
	},
	{
		id: "revise",
		plain: "ask for a change",
		kiro: "revision request",
		about: ["A revision request is one note that asks the ghost who wrote a document to change it.", "It writes a new version, and the door stays shut meanwhile."],
		file: null
	},
	{
		id: "steering",
		plain: "house rules",
		kiro: "steering",
		about: ["Steering is the standing guidance every agent reads before it works.", "It keeps the work in line with how the project is run."],
		file: null
	},
	{
		id: "wall",
		plain: "wall",
		kiro: "path limit",
		about: ["A path limit is the list of folders an agent may read and write.", "An attempt to go outside it is refused."],
		file: null
	}
], Bs = new Map(zs.map((e) => [e.id, e]));
function Vs(e) {
	return typeof e == "string" && Bs.has(e);
}
function Hs(e) {
	return Bs.get(e);
}
function Us(e, t) {
	let n = Hs(e);
	return t === "with-kiro" ? `${n.plain} (${n.kiro})` : n.plain;
}
var Ws = /\{([A-Za-z]+)\}/g;
function Gs(e) {
	return e === "" ? e : e[0].toUpperCase() + e.slice(1);
}
function Ks(e, t) {
	return e.replace(Ws, (e, n) => {
		let r = n[0].toLowerCase() + n.slice(1);
		if (!Vs(r)) return e;
		let i = Us(r, t);
		return n[0] === n[0].toUpperCase() ? Gs(i) : i;
	});
}
function qs(e) {
	let t = [];
	for (let n of e.matchAll(Ws)) {
		let e = n[1][0].toLowerCase() + n[1].slice(1);
		Vs(e) && !t.includes(e) && t.push(e);
	}
	return t;
}
function Js(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
RegExp(`(?<![A-Za-z0-9_$])(?:${zs.map((e) => Js(e.kiro)).join("|")})(?![A-Za-z0-9_$])`, "i");
// src/core/house-guide.ts
var Ys = "What do you want to do?", Xs = [
	"start",
	"decide",
	"ask"
];
function Zs(e) {
	return e.flatMap((e) => {
		switch (e.kind) {
			case "map": return [Ls(e.target)];
			case "control":
			case "fill":
			case "focus": return [e.key];
			case "every": return [`${e.keyPrefix}*`];
			case "shell": return [`shell:${e.action}`];
			case "task": return [];
		}
	});
}
function Qs(e, t) {
	let n = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function $s(e) {
	return Qs(e, 36) || "a ghost";
}
var ec = /* @__PURE__ */ new Set([
	"Archivist",
	"Draughtsman",
	"Foreman",
	"Tinker",
	"Medium"
]);
function tc(e) {
	let t = $s(e);
	return ec.has(t) ? `the ${t}` : t;
}
function nc(e) {
	let t = e.trim();
	return t === "" || /[.!?…]$/.test(t) ? t : `${t}.`;
}
function rc(e) {
	return e === "" ? e : e[0].toUpperCase() + e.slice(1);
}
function ic(e) {
	return e.length <= 1 ? e[0] ?? "" : `${e.slice(0, -1).join(", ")} and ${e[e.length - 1]}`;
}
var ac = {
	foyer: "This is the Foyer, the way in and out.",
	study: "This is the Study. The Archivist writes {requirements} here.",
	"drafting-room": "This is the Drafting Room. The Draughtsman works out {design} here.",
	workshop: "This is the Workshop. The Foreman writes the {tasks}, and the Tinkers do {build}.",
	attic: "This is the Attic. Everything that happened in this house is kept here.",
	"seance-room": "This is the Séance Room, where finished work is checked."
}, oc = "The house is built. Every door is open.", sc = {
	requirements: {
		term: "requirements",
		writer: "The Archivist",
		has: "has",
		it: "It",
		the: "{requirements}",
		nothingYet: "Nothing is written yet.",
		startLabel: "Have the Archivist write {requirements}",
		startConsequence: "The Archivist starts writing. Nothing opens until you say so.",
		readLabel: "Read {requirements}",
		readAgainLabel: "Read {requirements} again"
	},
	design: {
		term: "design",
		writer: "The Draughtsman",
		has: "has",
		it: "It",
		the: "{design}",
		nothingYet: "Nothing is drawn yet.",
		startLabel: "Have the Draughtsman work out {design}",
		startConsequence: "The Draughtsman starts drawing. Nothing opens until you say so.",
		readLabel: "Read {design}",
		readAgainLabel: "Read {design} again"
	},
	tasks: {
		term: "tasks",
		writer: "The Foreman",
		has: "has",
		it: "It",
		the: "the {tasks}",
		nothingYet: "Nothing is written yet.",
		startLabel: "Have the Foreman write the {tasks}",
		startConsequence: "The Foreman starts writing. Nothing opens until you say so.",
		readLabel: "Read the {tasks}",
		readAgainLabel: "Read the {tasks} again"
	},
	implementation: {
		term: "build",
		writer: "The Tinkers",
		has: "have",
		it: "They",
		the: "{build}",
		nothingYet: "Nothing is built yet.",
		startLabel: "Build everything that is ready",
		startConsequence: "Ticks each piece of work that can start, then starts it. Up to three Tinkers work at once.",
		readLabel: "See what was built",
		readAgainLabel: "See what was built again"
	}
}, cc = /* @__PURE__ */ new Set([
	"ready",
	"failed",
	"revision_required"
]), lc = /* @__PURE__ */ new Set([
	"ready",
	"working",
	"failed",
	"revision_required"
]), uc = {
	study: "writing",
	"drafting-room": "drawing"
}, dc = {
	requirements: [
		{
			label: "Ask for a shorter version",
			text: "Make it shorter. Keep only what the first version needs."
		},
		{
			label: "Ask for an example in each one",
			text: "Add one example to each point."
		},
		{
			label: "Ask for simpler words",
			text: "Use simpler words."
		}
	],
	design: [
		{
			label: "Ask for fewer parts",
			text: "Make it simpler, with fewer parts."
		},
		{
			label: "Ask for one sentence on each part",
			text: "Explain each part in one sentence."
		},
		{
			label: "Ask how each point is tested",
			text: "Say how each point is tested."
		}
	],
	tasks: [
		{
			label: "Ask for smaller steps",
			text: "Split the large steps into smaller ones."
		},
		{
			label: "Ask for the most important first",
			text: "Put the most important step first."
		},
		{
			label: "Ask to drop what can wait",
			text: "Remove anything the first version does not need."
		}
	]
}, fc = {
	watching: "The Warden is watching.",
	pointing: "The Warden points to your next step.",
	"offering-key": "The Warden holds out a key.",
	"stepped-back": "The Warden has stepped back."
};
function pc(e, t = 1) {
	return t > 1 ? `The Warden is holding ${t} ghosts.` : e === null ? "The Warden is holding a ghost." : `The Warden is holding ${tc(e)}.`;
}
function mc(e) {
	return e.doors.find((e) => e.state !== "open") ?? e.doors[e.doors.length - 1] ?? null;
}
function hc(e) {
	let t = e.rooms.flatMap((e) => e.doors);
	return t.length > 0 && t.every((e) => e.state === "open");
}
function gc(e) {
	return e.phaseStatus === null || e.state === "open" || e.state === "waiting" ? !1 : (e.phase === "implementation" ? lc : cc).has(e.phaseStatus);
}
function _c(e) {
	return e.id.slice(e.id.indexOf(":") + 1);
}
function vc(e, t) {
	if (e.locked) return { kind: "locked" };
	let n = e.waitingItems.find((e) => e.status === "pending" && e.actionAvailable);
	if (n !== void 0) {
		if (n.kind === "door-decision") {
			let t = e.doors.find((e) => e.proposalId !== null && e.proposalId === _c(n)) ?? e.doors.find((e) => e.state === "waiting");
			if (t !== void 0) return {
				kind: "door-waiting",
				door: t
			};
		}
		return {
			kind: "catch",
			item: n,
			ghost: e.ghosts.find((e) => e.ghostId === n.ghostId) ?? null
		};
	}
	let r = (t) => e.ghosts.filter((e) => e.state === t), i = r("failed");
	if (i.length > 0) return {
		kind: "failed",
		ghosts: i,
		retry: e.recoveryActions.find((e) => e.available) ?? null
	};
	let a = r("blocked");
	if (a.length > 0) return {
		kind: "blocked",
		ghosts: a
	};
	let o = r("working");
	if (o.length > 0) return {
		kind: "working",
		ghosts: o
	};
	let s = mc(e);
	return s !== null && gc(s) ? {
		kind: "startable",
		door: s
	} : e.roomId !== "attic" && hc(t) ? { kind: "built" } : e.doors.length > 0 && e.doors.every((e) => e.state === "open") ? { kind: "door-open" } : { kind: "room" };
}
function yc(e, t) {
	let n = t.rooms.findIndex((t) => t.roomId === e.roomId);
	return t.rooms.slice(n + 1).find((e) => e.doors.length > 0) ?? null;
}
function K(e, ...t) {
	return {
		template: e,
		values: t
	};
}
function bc(e, t) {
	return Ks(e.template, t).replace(/⟦(\d)⟧/g, (t, n) => e.values[Number(n)] ?? "");
}
function xc(e, t, n, r) {
	switch (n.kind) {
		case "locked": return K("⟦0⟧", e.diagnostic ?? "This room is locked.");
		case "catch": return n.item.kind === "risky-decision" ? K("I have ⟦0⟧. ⟦1⟧ Nothing runs until you say.", n.ghost === null ? "a ghost" : tc(n.ghost.name), n.item.label) : K("⟦0⟧", n.item.label);
		case "door-waiting": {
			let e = sc[n.door.phase];
			return r !== null && r.kind === "door" && r.phase === n.door.phase ? K(`You are at the door. Opening it accepts this version of ${e.the}.`) : K(`${e.writer} ${e.has} finished ${e.the}. The door waits for you.`);
		}
		case "failed": {
			let e = rc(ic(n.ghosts.map((e) => tc(e.name)))), t = n.ghosts.length === 1 ? n.ghosts[0] : null, r = t === null || t.reason === null ? "" : ` ${nc(t.reason)}`;
			return K(`⟦0⟧ failed.⟦1⟧${n.retry === null ? "" : t !== null && n.retry.ghostId === t.ghostId ? " It can be tried again." : " A failed run can be tried again."}`, e, r);
		}
		case "blocked": {
			let e = rc(ic(n.ghosts.map((e) => tc(e.name)))), t = n.ghosts.length === 1 ? n.ghosts[0] : null, r = t === null || t.reason === null ? "" : ` ${nc(t.reason)}`;
			return K(`⟦0⟧ ${n.ghosts.length === 1 ? "is" : "are"} held.⟦1⟧`, e, r);
		}
		case "working": {
			let t = rc(ic(n.ghosts.map((e) => tc(e.name)))), r = uc[e.roomId] ?? "at work", i = e.doors.some((e) => e.state !== "open") ? e.doors.length === 1 ? " This door stays shut until you open it." : " The door stays shut until you open it." : "";
			return K(`⟦0⟧ ${n.ghosts.length === 1 ? "is" : "are"} ${r}.${i}`, t);
		}
		case "startable": {
			let t = sc[n.door.phase];
			switch (n.door.phaseStatus) {
				case "failed": return K(`${t.writer} could not start. ${t.it} can be started again.`);
				case "revision_required": return K(`The door was kept shut. ${t.writer} can write a new version of ${t.the}.`);
				case "working": return K("{Build} is under way. Anything that is ready can be started.");
				default: return K(n.door.phase === "implementation" ? `The {tasks} is settled. ${t.nothingYet}` : `${ac[e.roomId]} ${t.nothingYet}`);
			}
		}
		case "door-open": {
			let n = yc(e, t);
			return n === null ? K("This door is open.") : K("This door is open. The ⟦0⟧ is next.", n.name);
		}
		case "built": return K(oc);
		case "room": return K(ac[e.roomId]);
	}
}
function Sc(e, t) {
	switch (t.kind) {
		case "locked": return e.diagnostic === null ? [] : [e.diagnostic];
		case "catch": return [t.item.label];
		case "failed":
		case "blocked": {
			let e = t.ghosts.length === 1 ? t.ghosts[0].reason : null;
			return e === null ? [] : [e];
		}
		default: return [];
	}
}
function Cc(e, t, n) {
	if (t) return {
		pose: "stepped-back",
		label: fc["stepped-back"]
	};
	let r = n ? {
		pose: "pointing",
		label: fc.pointing
	} : {
		pose: "watching",
		label: fc.watching
	};
	switch (e.kind) {
		case "catch": return {
			pose: "holding",
			label: pc(e.ghost?.name ?? null)
		};
		case "blocked": return {
			pose: "holding",
			label: pc(e.ghosts.length === 1 ? e.ghosts[0].name : null, e.ghosts.length)
		};
		case "door-waiting": return {
			pose: "offering-key",
			label: fc["offering-key"]
		};
		case "failed": return e.retry === null ? {
			pose: "watching",
			label: fc.watching
		} : r;
		case "startable":
		case "door-open":
		case "built": return r;
		case "locked":
		case "working":
		case "room": return {
			pose: "watching",
			label: fc.watching
		};
	}
}
function wc(e) {
	let t = e.needsYou[0];
	if (t !== void 0 && e.rooms.some((e) => e.roomId === t.roomId)) return t.roomId;
	let n = e.rooms.find((e) => e.doors.some((e) => e.state !== "open"));
	return n === void 0 ? e.rooms.find((e) => e.roomId === "attic")?.roomId ?? e.rooms[0]?.roomId ?? "foyer" : n.roomId;
}
var Tc = { kind: "heading" };
function q(e, t, n, r, i, a = null) {
	return {
		id: e,
		kind: t,
		label: Qs(n, 60),
		consequence: Qs(r, 120),
		term: a,
		steps: i
	};
}
function Ec(e) {
	return Ks(e, "plain");
}
function Dc(e) {
	return {
		kind: "room",
		roomId: e
	};
}
function Oc(e, t) {
	return e === null || e.kind !== t.kind || e.roomId !== t.roomId ? !1 : e.kind === "ghost" && t.kind === "ghost" ? e.ghostId === t.ghostId : e.kind === "door" && t.kind === "door" ? e.phase === t.phase : !0;
}
function kc(e, t, n = Tc) {
	return Oc(e.surface, Dc(t)) ? [] : [{
		kind: "map",
		target: Dc(t),
		focus: n
	}];
}
function Ac(e) {
	return e !== "implementation";
}
function jc(e, t) {
	return q(`go:${e}`, "go", `Go to the ${t}`, `Opens the ${t}. Nothing there changes.`, [{
		kind: "map",
		target: Dc(e),
		focus: Tc
	}]);
}
function Mc(e) {
	return q("look", "look", `Look around the ${e.name}`, "Opens this room's sheet. Nothing changes.", [{
		kind: "map",
		target: Dc(e.roomId),
		focus: Tc
	}]);
}
function Nc() {
	return q("close", "look", "Close this sheet", "Puts the sheet away and shows the room.", [{
		kind: "shell",
		action: "close"
	}]);
}
function Pc(e) {
	return e === "" ? e : e[0].toLowerCase() + e.slice(1);
}
function Fc(e, t) {
	let n = sc[t.phase], r = kc(e.context, e.room.roomId);
	if (t.phase === "implementation") return q("build-all", "start", Ec(n.startLabel), n.startConsequence, [
		...r,
		{
			kind: "every",
			keyPrefix: "task:"
		},
		{
			kind: "control",
			key: "start-workshop"
		}
	], n.term);
	let i = t.phaseStatus === "failed" ? `Try ${Pc(n.writer)} again` : t.phaseStatus === "revision_required" ? `Have ${Pc(n.writer)} write a new version` : Ec(n.startLabel);
	return q(`start:${t.phase}`, "start", i, n.startConsequence, [...r, {
		kind: "control",
		key: `start:${t.phase}`
	}], n.term);
}
function Ic(e, t, n) {
	let r = sc[t.phase];
	return q(`read:${t.phase}`, "look", Ec(n ? r.readAgainLabel : r.readLabel), "Opens this room's sheet with the work on it. Nothing is decided.", [{
		kind: "map",
		target: Dc(e.room.roomId),
		focus: Tc
	}], r.term);
}
function Lc(e, t) {
	let n = sc[t];
	return q(`ask:${t}`, "ask", "Ask for a change", `Opens one note to ${Pc(n.writer)}. The door stays shut.`, [
		...kc(e.context, e.room.roomId),
		{
			kind: "control",
			key: `revise:${t}`
		},
		{
			kind: "task",
			task: {
				kind: "revise",
				phase: t,
				filled: !1
			}
		}
	], "revise");
}
function Rc(e, t) {
	let n = t.proposalId === null ? Tc : {
		kind: "proposal",
		proposalId: t.proposalId
	};
	return q(`door:${t.phase}`, "look", "Go to the door", "Shows exactly what you would be accepting. Nothing is decided yet.", [{
		kind: "map",
		target: {
			kind: "door",
			roomId: e.room.roomId,
			phase: t.phase,
			proposalId: t.proposalId
		},
		focus: n
	}]);
}
function zc(e) {
	return q(`approve:${e}`, "decide", "Open the door", "Accepts this version. The next step can then be started.", [{
		kind: "control",
		key: `approve:${e}`
	}], "approve");
}
function Bc(e) {
	return q(`reject:${e}`, "decide", "Keep the door shut", "Turns this version down. A new version will be needed.", [{
		kind: "control",
		key: `reject:${e}`
	}], "reject");
}
function Vc(e, t, n) {
	let r = e.surface;
	return r === null || r.roomId !== t.roomId ? !1 : r.kind === "room" || r.kind === "door" && r.phase === n.phase;
}
function Hc(e) {
	let t = q("write-own", "ask", "Write my own", "Puts the cursor in the note so you can type it.", [{
		kind: "focus",
		key: `revise-text:${e.phase}`
	}], "revise");
	return e.filled ? [
		q("send-change", "ask", "Send this change", "Sends the note once. A new version is written and the door stays shut.", [{
			kind: "control",
			key: `revise-send:${e.phase}`
		}, {
			kind: "task",
			task: null
		}], "revise"),
		q("ask-other", "ask", "Choose a different change", "Shows the ready-made changes again. Nothing is sent.", [{
			kind: "task",
			task: {
				...e,
				filled: !1
			}
		}], "revise"),
		t
	] : [...dc[e.phase].map((t, n) => q(`ready:${n}`, "ask", t.label, `Writes this in the note: ${t.text}`, [{
		kind: "fill",
		key: `revise-text:${e.phase}`,
		text: t.text
	}, {
		kind: "task",
		task: {
			...e,
			filled: !0
		}
	}], "revise")), t];
}
function Uc() {
	return [q("replay-toggle", "play", "Play or pause the recording", "The house fills in as it did when this was recorded.", [{
		kind: "control",
		key: "replay:toggle"
	}]), q("replay-restart", "play", "Play it from the start", "Goes back to the empty house.", [{
		kind: "control",
		key: "replay:restart"
	}])];
}
function Wc(e) {
	if (e.surface !== null && e.surface.roomId === "attic") return [q("attic-toggle", "play", "Play or pause here in the Attic", "Plays back what happened in this house, step by step.", [{
		kind: "control",
		key: "attic:toggle"
	}]), q("attic-next", "play", "Step forward once", "Shows the next thing that happened.", [{
		kind: "control",
		key: "attic:next"
	}])];
	let t = {
		kind: "map",
		target: Dc("attic"),
		focus: Tc
	};
	return [q("attic-watch", "play", "Watch how this house was built", "Opens the Attic and plays back what happened.", [t, {
		kind: "control",
		key: "attic:toggle"
	}]), q("attic-step", "look", "Step through it myself", "Opens the Attic with its list of everything that happened.", [t])];
}
function Gc() {
	return q("built", "look", "See what was made", "Lists what now exists, with its real file names and where it is kept.", [{
		kind: "map",
		target: Dc("foyer"),
		focus: {
			kind: "section",
			section: "built"
		}
	}]);
}
function Kc(e) {
	let { room: t, context: n, situation: r, projection: i } = e, a = n.surface, o = a !== null && a.roomId === t.roomId && a.kind === "room", s = i.rooms.some((e) => e.roomId === "attic"), c = n.task, l = (e) => e.state !== "open" && (e.state === "waiting" || e.phaseStatus === "waiting" || e.phaseStatus === "revision_required");
	if (c !== null && o && t.doors.some((e) => e.phase === c.phase && l(e))) return Hc(c);
	switch (r.kind) {
		case "locked": return [];
		case "catch": {
			if (r.item.kind !== "risky-decision") return [];
			let e = _c(r.item);
			return o ? [q(`allow:${e}`, "decide", "Allow it once", "Lets this one action run, once. It cannot be reused.", [{
				kind: "control",
				key: `approve:${e}`
			}], "approve"), q(`refuse:${e}`, "decide", "Refuse it", "The action does not run.", [{
				kind: "control",
				key: `reject:${e}`
			}], "reject")] : [q(`see-asked:${e}`, "look", "See exactly what it asked", "Shows the whole action and what it may touch. Nothing is decided yet.", [{
				kind: "map",
				target: Dc(t.roomId),
				focus: {
					kind: "proposal",
					proposalId: e
				}
			}])];
		}
		case "door-waiting": {
			let i = r.door, a = Ac(i.phase) ? [Lc(e, i.phase)] : [];
			return i.proposalId !== null && Vc(n, t, i) ? [
				zc(i.proposalId),
				...a,
				Ic(e, i, !0)
			] : [
				Ic(e, i, !1),
				...a,
				Rc(e, i)
			];
		}
		case "failed": {
			let e = r.ghosts[0], i = q(`see-ghost:${e.ghostId}`, "look", "See what went wrong", "Opens the ghost's details. Nothing changes.", [{
				kind: "map",
				target: {
					kind: "ghost",
					roomId: t.roomId,
					ghostId: e.ghostId
				},
				focus: Tc
			}]);
			if (r.retry === null) return [i];
			let a = t.ghosts.find((e) => e.ghostId === r.retry?.ghostId);
			return [q(`retry:${r.retry.runId}`, "start", a === void 0 ? "Try the failed run again" : `Try ${tc(a.name)} again`, "Starts a fresh attempt. The failed one is kept in the record.", [...kc(n, t.roomId), {
				kind: "control",
				key: `retry:${r.retry.runId}`
			}]), i];
		}
		case "blocked": {
			let e = r.ghosts[0];
			return [q(`see-ghost:${e.ghostId}`, "look", `See why ${tc(e.name)} is held`, "Opens the ghost's details. Nothing changes.", [{
				kind: "map",
				target: {
					kind: "ghost",
					roomId: t.roomId,
					ghostId: e.ghostId
				},
				focus: Tc
			}])];
		}
		case "working": return [q("watch", "look", `Watch ${ic(r.ghosts.map((e) => tc(e.name)))} work`, "Opens this room's sheet. Nothing changes.", [{
			kind: "map",
			target: Dc(t.roomId),
			focus: Tc
		}])];
		case "startable": {
			let n = Fc(e, r.door);
			return r.door.phase === "implementation" ? [n, q("choose-work", "look", "Choose what to build myself", "Opens the Workshop's list so you can tick the work yourself.", [{
				kind: "map",
				target: Dc(t.roomId),
				focus: Tc
			}])] : [n];
		}
		case "door-open": {
			let n = yc(t, i), r = mc(t);
			return [...n === null ? [] : [jc(n.roomId, n.name)], ...r === null ? [] : [Ic(e, r, !0)]];
		}
		case "built": return [Gc(), ...s ? Wc({
			...n,
			surface: null
		}).slice(0, 1) : []];
		case "room": return t.roomId === "attic" ? Wc(n) : [];
	}
}
function qc(e) {
	return [
		e.mapOpen ? q("map", "setting", "Put the house map away", "Shows the room again.", [{
			kind: "shell",
			action: "map"
		}]) : q("map", "setting", "See the whole house", "Lays the map of every room over this one.", [{
			kind: "shell",
			action: "map"
		}]),
		e.words === "with-kiro" ? q("words", "setting", "Hide Kiro's words", "Shows the everyday words alone.", [{
			kind: "shell",
			action: "kiro-words"
		}]) : q("words", "setting", "Show Kiro's words", "Puts the word Kiro uses beside each everyday word.", [{
			kind: "shell",
			action: "kiro-words"
		}]),
		e.reveal ? q("reveal", "setting", "Hide the labels", "Takes the labels off the things in the room.", [{
			kind: "shell",
			action: "reveal"
		}]) : q("reveal", "setting", "Show me what I can press", "Labels every working thing in the room. The ? key does the same.", [{
			kind: "shell",
			action: "reveal"
		}])
	];
}
function Jc(e) {
	let t = /* @__PURE__ */ new Set(), n = [];
	for (let r of e) t.has(r.id) || (t.add(r.id), n.push(r));
	return n;
}
function Yc(e, t) {
	if (e.steps.length !== 1) return !1;
	let n = e.steps[0];
	return n.kind === "map" && n.focus.kind === "heading" && Oc(t, n.target);
}
function Xc(e, t) {
	if (e.steps.length !== 1) return !1;
	let n = e.steps[0];
	return n.kind === "map" && n.target.kind === "room" && n.target.roomId === t;
}
function Zc(e, t) {
	let n = e.rooms.findIndex((e) => e.roomId === t.roomId);
	if (n < 0) return null;
	let r = e.rooms[n], i = vc(r, e), a = e.mode === "live", o = a && r.mutatingActionsEnabled && !r.readOnly && !r.locked, s = {
		projection: e,
		room: r,
		context: t,
		situation: i
	}, c = (e) => e === void 0 ? null : {
		roomId: e.roomId,
		name: e.name
	}, l = t.surface, u = l !== null && l.roomId === r.roomId, d = wc(e), f = e.rooms.find((e) => e.roomId === d)?.name ?? "", p = hc(e), m = (e) => e.filter((e) => (o || !Xs.includes(e.kind)) && !Yc(e, l)), h = m(Kc(s)), g = h.some((e) => Xc(e, r.roomId)), _ = i.kind === "door-waiting" && i.door.proposalId !== null && Vc(t, r, i.door) ? [Bc(i.door.proposalId)] : [], v = Jc(m([
		...a ? [] : Uc(),
		...h,
		...u ? [Nc()] : [],
		...d !== r.roomId && f !== "" ? [jc(d, f)] : [],
		...l === null && !r.locked && r.roomId !== "attic" && !g ? [Mc(r)] : [],
		...p ? [Gc()] : [],
		...qc(t).slice(0, 1)
	])), y = Jc(m([
		...v,
		..._,
		...e.rooms.filter((e) => e.roomId !== r.roomId).map((e) => jc(e.roomId, e.name)),
		...e.needsYou.length === 0 ? [] : [q("needs-you", "go", "Go to what needs you", "Opens the first room where something waits for you.", [{
			kind: "shell",
			action: "needs-you"
		}])],
		...qc(t),
		...t.canLeave ? [q("exit", "leave", "Leave this house", "Goes back to the Foyer hall. Nothing here stops.", [{
			kind: "shell",
			action: "exit"
		}])] : []
	])), b = xc(r, e, i, l), x = Cc(i, t.quiet, r.integrity === "valid");
	return {
		status: Qs(bc(b, t.words), 240),
		statusKind: i.kind,
		terms: qs(b.template),
		quotes: Sc(r, i),
		note: a && !o && !r.readOnly && r.diagnostic !== null && i.kind !== "locked" ? r.diagnostic : null,
		question: Ys,
		options: v.slice(0, 4),
		everything: y,
		pose: x.pose,
		poseLabel: Qs(x.label, 60),
		previous: c(e.rooms[n - 1]),
		next: c(e.rooms[n + 1])
	};
}
// src/core/motion-policy.ts
function Qc(e) {
	return e.stillHouse === !1 && e.prefersReducedMotion === !1 ? "low-frequency" : "none";
}
function $c(e) {
	return e !== !1;
}
function el(e) {
	return {
		stillHouse: e.stillHouse,
		prefersReducedMotion: e.prefersReducedMotion,
		effective: Qc(e)
	};
}
// src/components/house-stage-art.tsx
var J = (e) => `hh-sf-${e}`, tl = {
	foyer: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M72 120 V52 a28 28 0 0 1 56 0 V120 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("moon"),
			d: "M78 52 a22 22 0 0 1 44 0 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M100 30 V52 M84 37 L100 52 L116 37",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M78 56 H98 V120 H78 z M102 56 H122 V120 H102 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M82 62 h12 v22 h-12 z M106 62 h12 v22 h-12 z M82 90 h12 v24 h-12 z M106 90 h12 v24 h-12 z",
			strokeWidth: 1.2
		}),
		/* @__PURE__ */ I("circle", {
			className: J("brass"),
			cx: "96",
			cy: "88",
			r: "2"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("brass"),
			cx: "104",
			cy: "88",
			r: "2"
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M38 58 h10 l-2 8 h-6 z M152 58 h10 l-2 8 h-6 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("lamp"),
			d: "M43 44 q5 7 0 13 q-5 -6 0 -13 z M157 44 q5 7 0 13 q-5 -6 0 -13 z",
			strokeWidth: 1.2
		})
	] }),
	study: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: J("glass"),
			d: "M40 96 V40 a22 22 0 0 1 44 0 V96 z"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("moon"),
			cx: "70",
			cy: "44",
			r: "9"
		}),
		/* @__PURE__ */ I("path", {
			d: "M62 18 V96 M40 58 H84",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ I("path", {
			className: J("cloth"),
			d: "M30 14 H94 V22 H30 z M32 22 q10 40 -2 78 h12 q6 -40 0 -78 z M92 22 q-10 40 2 78 h-12 q-6 -40 0 -78 z"
		}),
		/* @__PURE__ */ I("rect", {
			className: J("brass"),
			x: "124",
			y: "30",
			width: "34",
			height: "42",
			rx: "2"
		}),
		/* @__PURE__ */ I("rect", {
			className: J("paper"),
			x: "129",
			y: "35",
			width: "24",
			height: "32"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("bone"),
			cx: "141",
			cy: "47",
			r: "6"
		}),
		/* @__PURE__ */ I("path", {
			d: "M133 67 q8 -12 16 0",
			strokeWidth: 1.5
		})
	] }),
	"drafting-room": /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("rect", {
			className: J("sheet"),
			x: "26",
			y: "24",
			width: "84",
			height: "60"
		}),
		/* @__PURE__ */ I("path", {
			className: J("none"),
			d: "M40 72 V48 L60 34 L80 48 V72 z M52 72 V58 h10 v14 M68 52 h8 v8 h-8 z M34 78 H102",
			stroke: "var(--hh-sc-paper, none)",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ I("circle", {
			className: J("cloth"),
			cx: "30",
			cy: "28",
			r: "2.5"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("cloth"),
			cx: "106",
			cy: "28",
			r: "2.5"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M124 22 h52 v7 h-22 v58 h-8 v-58 h-22 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M118 98 h64 v5 h-64 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("paper"),
			d: "M124 98 v-9 a4 4 0 0 1 8 0 v9 z M136 98 v-13 a4 4 0 0 1 8 0 v13 z M150 98 v-8 a4 4 0 0 1 8 0 v8 z M164 98 v-11 a4 4 0 0 1 8 0 v11 z"
		})
	] }),
	workshop: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("rect", {
			className: J("wood"),
			x: "24",
			y: "22",
			width: "96",
			height: "58",
			rx: "2"
		}),
		/* @__PURE__ */ I("path", {
			d: "M36 32 v6 M52 32 v6 M68 32 v6 M84 32 v6 M100 32 v6",
			strokeWidth: 1,
			strokeDasharray: "1 5"
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M34 40 h8 v8 h-3 v26 h-2 v-26 h-3 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("bone"),
			d: "M52 40 l16 6 l-2 5 l-16 -6 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M58 49 l4 2 l-9 23 l-4 -2 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("bone"),
			d: "M80 40 h26 l-6 10 h-20 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M84 50 v-4 M90 50 v-4 M96 50 v-4",
			strokeWidth: 1
		}),
		/* @__PURE__ */ I("path", {
			className: J("cloth"),
			d: "M82 60 a7 7 0 1 1 9 9 l8 8 l-4 4 l-8 -8 a7 7 0 0 1 -5 -13 z"
		}),
		/* @__PURE__ */ I("rect", {
			className: J("glass"),
			x: "138",
			y: "26",
			width: "38",
			height: "38"
		}),
		/* @__PURE__ */ I("path", {
			d: "M157 26 V64 M138 45 H176",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M134 64 h46 v5 h-46 z"
		})
	] }),
	attic: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M0 0 H200 V10 H0 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M56 10 h8 v110 h-8 z M136 10 h8 v110 h-8 z"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("glass"),
			cx: "100",
			cy: "58",
			r: "26"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("moon"),
			cx: "108",
			cy: "52",
			r: "11"
		}),
		/* @__PURE__ */ I("path", {
			d: "M74 58 H126 M100 32 V84",
			strokeWidth: 2
		}),
		/* @__PURE__ */ I("path", {
			d: "M200 10 L168 10 M200 10 L200 44 M200 10 L174 36 M184 10 q2 9 -6 16 q8 -5 22 -3 M192 10 q0 5 -3 8 q4 -2 11 -1",
			strokeWidth: 1
		})
	] }),
	"seance-room": /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: J("cloth"),
			d: "M0 0 H200 V16 q-25 12 -50 0 q-25 12 -50 0 q-25 12 -50 0 q-25 12 -50 0 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("cloth"),
			d: "M0 16 q14 50 0 104 h20 q10 -54 0 -104 z M200 16 q-14 50 0 104 h-20 q-10 -54 0 -104 z"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("moon"),
			cx: "100",
			cy: "52",
			r: "12"
		}),
		/* @__PURE__ */ I("path", {
			className: J("moon"),
			d: "M70 42 a10 10 0 1 0 0 20 a13 13 0 0 1 0 -20 z M130 42 a10 10 0 1 1 0 20 a13 13 0 0 0 0 -20 z"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("ink"),
			cx: "48",
			cy: "52",
			r: "6"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("ink"),
			cx: "152",
			cy: "52",
			r: "6"
		}),
		/* @__PURE__ */ I("path", {
			d: "M40 30 q60 16 120 0",
			strokeWidth: 1,
			strokeDasharray: "2 4"
		})
	] })
}, nl = {
	foyer: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M18 120 V40 q14 -14 28 0 V120 z"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("bone"),
			cx: "32",
			cy: "50",
			r: "9"
		}),
		/* @__PURE__ */ I("path", {
			d: "M32 50 V44 M32 50 l4 3",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ I("rect", {
			className: J("glass"),
			x: "25",
			y: "66",
			width: "14",
			height: "44"
		}),
		/* @__PURE__ */ I("path", {
			d: "M32 66 V98",
			strokeWidth: 1.2
		}),
		/* @__PURE__ */ I("circle", {
			className: J("brass"),
			cx: "32",
			cy: "101",
			r: "4"
		}),
		/* @__PURE__ */ I("path", {
			d: "M168 120 V40 M158 120 h20 M168 52 l-10 -8 M168 52 l10 -8 M168 64 l-8 -6",
			strokeWidth: 3
		}),
		/* @__PURE__ */ I("path", {
			className: J("ink"),
			d: "M150 40 h22 l-4 -10 h-14 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M118 96 h34 v5 h-34 z M122 101 h4 v19 h-4 z M144 101 h4 v19 h-4 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("lamp"),
			d: "M127 96 q-4 -9 3 -15 q4 -3 5 0 q4 -3 5 0 q7 6 3 15 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("ink"),
			d: "M133 86 l2 3 l-4 0 z M139 86 l2 3 l-4 0 z M132 92 h8 l-2 2 h-4 z",
			stroke: "none"
		}),
		/* @__PURE__ */ I("path", {
			d: "M135 81 q0 -5 3 -6",
			strokeWidth: 2
		})
	] }),
	study: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("rect", {
			className: J("wood-dark"),
			x: "136",
			y: "26",
			width: "54",
			height: "94"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M140 30 h46 v24 h-46 z M140 58 h46 v24 h-46 z M140 86 h46 v30 h-46 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("cloth"),
			d: "M143 34 h6 v20 h-6 z M158 38 h5 v16 h-5 z M146 62 h7 v20 h-7 z M172 90 h8 v26 h-8 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M149 36 h5 v18 h-5 z M168 32 h7 v22 h-7 z M158 60 h6 v22 h-6 z M144 92 h6 v24 h-6 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("ecto"),
			d: "M163 34 h5 v20 h-5 z M176 36 h6 v18 h-6 z M168 64 h8 v18 h-8 z M154 94 h7 v22 h-7 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("bone"),
			d: "M176 60 l8 22 h-12 z M163 98 h7 v18 h-7 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M34 84 h82 v7 h-82 z M40 91 h6 v29 h-6 z M104 91 h6 v29 h-6 z M52 91 h46 v12 h-46 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("ecto"),
			d: "M56 66 h26 l-5 -12 h-16 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M67 66 h4 v14 h8 v4 h-20 v-4 h8 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("paper"),
			d: "M86 78 l18 -3 l2 8 l-18 2 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("bone"),
			d: "M104 74 q8 -16 16 -18 q-3 12 -13 20 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("cloth"),
			d: "M2 120 V70 q10 -8 20 0 V120 h-4 V98 H6 v22 z"
		})
	] }),
	"drafting-room": /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M44 74 L132 50 l3 8 L47 82 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("sheet"),
			d: "M56 66 L120 49 l3 9 L60 75 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M68 66 l40 -11 M72 71 l28 -8",
			stroke: "var(--hh-sc-paper, none)",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M66 78 h7 v42 h-7 z M112 64 h7 v56 h-7 z M58 112 h70 v6 h-70 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M124 46 l14 -26 l4 2 l-13 26 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("lamp"),
			d: "M132 16 l18 6 l-8 12 l-14 -5 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M18 92 h24 v6 h-24 z M22 98 h4 v22 h-4 z M34 98 h4 v22 h-4 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M154 92 h36 l-4 28 h-28 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("paper"),
			d: "M160 92 V72 a4 4 0 0 1 8 0 v20 z M170 92 V62 a4 4 0 0 1 8 0 v30 z M180 92 V78 a3 3 0 0 1 6 0 v14 z"
		})
	] }),
	workshop: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M60 74 h104 v9 h-104 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M66 83 h8 v37 h-8 z M150 83 h8 v37 h-8 z M74 98 h76 v6 h-76 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("ink"),
			d: "M142 74 v-12 h16 v12 z M146 62 v-8 h8 v8 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M134 56 h32",
			strokeWidth: 3
		}),
		/* @__PURE__ */ I("path", {
			className: J("cloth"),
			d: "M78 74 v-14 h34 v14 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M88 60 v-6 h14 v6 M92 66 h6"
		}),
		/* @__PURE__ */ I("path", {
			className: J("bone"),
			d: "M118 74 l14 -20 l4 3 l-12 17 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood"),
			d: "M8 86 h40 v6 h-40 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M14 92 l-6 28 M22 92 l6 28 M42 92 l6 28 M34 92 l-6 28",
			strokeWidth: 3
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M172 96 h24 v24 h-24 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M172 96 l24 24 M196 96 l-24 24",
			strokeWidth: 1.5
		})
	] }),
	attic: /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M64 92 q0 -8 8 -8 h52 q8 0 8 8 v28 h-68 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M64 98 h68 v5 h-68 z M94 98 h8 v10 h-8 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("ink"),
			d: "M82 84 v-14 h30 v14 z"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("bone"),
			cx: "88",
			cy: "62",
			r: "9"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("bone"),
			cx: "108",
			cy: "60",
			r: "11"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("ink"),
			cx: "88",
			cy: "62",
			r: "2",
			stroke: "none"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("ink"),
			cx: "108",
			cy: "60",
			r: "2",
			stroke: "none"
		}),
		/* @__PURE__ */ I("path", {
			className: J("lamp"),
			d: "M112 73 l34 -12 v24 z",
			fillOpacity: .45,
			stroke: "none"
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M112 72 h8 v8 h-8 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("paper"),
			d: "M10 96 h34 v24 h-34 z M16 76 h24 v20 h-24 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M10 104 h34 M27 96 v8 M16 84 h24",
			strokeWidth: 1.2
		}),
		/* @__PURE__ */ I("path", {
			className: J("bone"),
			d: "M158 120 V62 q14 -20 28 0 V120 q-5 -5 -9 0 q-5 -5 -10 0 q-4 -5 -9 0 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M166 76 q6 -8 12 0 M165 92 q7 5 14 0",
			strokeWidth: 1.2
		})
	] }),
	"seance-room": /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I("ellipse", {
			className: J("cloth"),
			cx: "100",
			cy: "86",
			rx: "46",
			ry: "9"
		}),
		/* @__PURE__ */ I("path", {
			className: J("cloth"),
			d: "M54 86 q4 22 12 34 h68 q8 -12 12 -34 q-46 14 -92 0 z"
		}),
		/* @__PURE__ */ I("path", {
			d: "M70 96 q4 12 8 22 M130 96 q-4 12 -8 22 M100 96 v24",
			strokeWidth: 1
		}),
		/* @__PURE__ */ I("path", {
			className: J("brass"),
			d: "M90 84 h20 l-3 -6 h-14 z"
		}),
		/* @__PURE__ */ I("circle", {
			className: J("ecto"),
			cx: "100",
			cy: "64",
			r: "15"
		}),
		/* @__PURE__ */ I("path", {
			d: "M92 60 q4 -7 12 -6",
			stroke: "var(--hh-sc-bone, none)",
			strokeWidth: 2
		}),
		/* @__PURE__ */ I("path", {
			className: J("wood-dark"),
			d: "M18 120 V66 h8 v26 h20 v28 h-6 v-20 H26 v20 z M182 120 V66 h-8 v26 h-20 v28 h6 v-20 h14 v20 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("bone"),
			d: "M134 78 h6 v-14 h-6 z"
		}),
		/* @__PURE__ */ I("path", {
			className: J("lamp"),
			d: "M137 52 q4 6 0 11 q-4 -5 0 -11 z",
			strokeWidth: 1.2
		})
	] })
};
function rl({ room: e }) {
	return /* @__PURE__ */ I(It, {
		viewBox: "0 0 200 120",
		className: "hh-stage-art hh-stage-wall-art",
		preserveAspectRatio: "xMidYMax meet",
		data: { "data-scene": e },
		children: tl[e]
	});
}
function il({ room: e }) {
	return /* @__PURE__ */ I(It, {
		viewBox: "0 0 200 120",
		className: "hh-stage-art hh-stage-prop-art",
		preserveAspectRatio: "xMidYMax meet",
		data: { "data-scene": e },
		children: nl[e]
	});
}
function al() {
	return /* @__PURE__ */ L(It, {
		viewBox: "0 0 400 70",
		className: "hh-stage-art hh-stage-roof-art",
		preserveAspectRatio: "none",
		children: [
			/* @__PURE__ */ I("path", {
				className: J("wall-attic"),
				d: "M286 44 V10 h26 v40 z"
			}),
			/* @__PURE__ */ I("path", {
				className: J("ink"),
				d: "M282 10 h34 v6 h-34 z"
			}),
			/* @__PURE__ */ I("path", {
				className: J("roof"),
				d: "M2 70 L200 4 L398 70 z",
				strokeWidth: 2.5
			}),
			/* @__PURE__ */ I("path", {
				d: "M40 60 H360 M74 49 H326 M108 38 H292 M142 27 H258 M176 16 H224",
				strokeWidth: 1,
				strokeDasharray: "14 6"
			}),
			/* @__PURE__ */ I("circle", {
				className: J("glass"),
				cx: "200",
				cy: "44",
				r: "9"
			}),
			/* @__PURE__ */ I("path", {
				d: "M191 44 H209 M200 35 V53",
				strokeWidth: 1.2
			})
		]
	});
}
function ol() {
	return /* @__PURE__ */ L(It, {
		viewBox: "0 0 200 90",
		className: "hh-stage-art hh-stage-sky-art",
		preserveAspectRatio: "xMaxYMin meet",
		children: [
			/* @__PURE__ */ I("circle", {
				className: J("moon"),
				cx: "160",
				cy: "30",
				r: "20"
			}),
			/* @__PURE__ */ I("path", {
				d: "M150 22 a4 4 0 1 0 0.1 0 M166 36 a6 6 0 1 0 0.1 0 M168 20 a2 2 0 1 0 0.1 0",
				strokeWidth: 1
			}),
			/* @__PURE__ */ I("path", {
				className: J("ink"),
				d: "M100 34 q5 -7 10 0 q3 -3 6 0 q5 -7 10 0 q-7 -1 -9 5 q-2 -3 -4 -3 q-2 0 -4 3 q-2 -6 -9 -5 z"
			}),
			/* @__PURE__ */ I("path", {
				className: J("ink"),
				d: "M58 58 q4 -6 8 0 q2 -2 4 0 q4 -6 8 0 q-5 -1 -7 4 q-1 -2 -3 -2 q-2 0 -3 2 q-2 -5 -7 -4 z"
			}),
			/* @__PURE__ */ I("path", {
				className: J("ink"),
				d: "M124 66 q3 -5 6 0 q2 -2 4 0 q3 -5 6 0 q-4 -1 -5 3 q-1 -2 -3 -2 q-2 0 -3 2 q-1 -4 -5 -3 z"
			}),
			/* @__PURE__ */ I("path", {
				d: "M20 16 v6 M17 19 h6 M84 10 v4 M82 12 h4 M40 44 v4 M38 46 h4",
				strokeWidth: 1.2
			})
		]
	});
}
function sl() {
	return /* @__PURE__ */ L(It, {
		viewBox: "0 0 400 60",
		className: "hh-stage-art hh-stage-yard-art",
		preserveAspectRatio: "xMidYMax meet",
		children: [
			/* @__PURE__ */ I("path", {
				d: "M0 58 H400",
				strokeWidth: 2
			}),
			/* @__PURE__ */ I("path", {
				className: J("ink"),
				d: "M26 58 V30 q-10 -8 -14 -20 q8 8 14 10 q-2 -12 4 -20 q0 12 4 18 q8 -4 12 -14 q-2 16 -12 24 V58 z"
			}),
			/* @__PURE__ */ I("path", {
				d: "M58 58 V40 l3 -4 l3 4 V58 M72 58 V38 l3 -4 l3 4 V58 M86 58 V42 l3 -4 l3 4 V58 M54 46 H96 M54 52 H96",
				strokeWidth: 1.5
			}),
			/* @__PURE__ */ I("path", {
				className: J("bone"),
				d: "M316 58 V40 a8 8 0 0 1 16 0 V58 z M344 58 V46 a6 6 0 0 1 12 0 V58 z"
			}),
			/* @__PURE__ */ I("path", {
				d: "M320 44 h8 M324 40 v10",
				strokeWidth: 1.2
			}),
			/* @__PURE__ */ I("path", {
				className: J("lamp"),
				d: "M372 58 q-12 -2 -10 -12 q2 -8 12 -7 q10 -1 12 7 q2 10 -10 12 z"
			}),
			/* @__PURE__ */ I("path", {
				className: J("ink"),
				d: "M368 46 l3 4 h-6 z M378 46 l3 4 h-6 z M367 53 h14 l-3 3 h-8 z",
				stroke: "none"
			}),
			/* @__PURE__ */ I("path", {
				d: "M374 39 q0 -5 4 -6",
				strokeWidth: 2
			})
		]
	});
}
J("cloth"), J("paper"), J("bone"), J("brass"), J("wood-dark"), J("brass"), J("bone"), J("wood-dark"), J("ink"), J("brass"), J("brass"), J("wall-attic"), J("bone"), J("roof"), J("lamp"), J("wood"), J("lamp"), J("bone"), J("brass");
// src/components/RoomDiorama.tsx
function cl(e, t) {
	let n = Ls(t), r = e.closest(".hh-ui")?.querySelectorAll("[data-opener-key]") ?? [];
	for (let e of r) if (e.getAttribute("data-opener-key") === n) {
		e.click();
		return;
	}
}
function ll(e, t) {
	return {
		"--hh-i": e,
		"--hh-n": t
	};
}
function ul({ room: e, interactive: t = !1 }) {
	let n = (e) => t ? {
		"data-pick": e.kind,
		onClick: (t) => {
			t.stopPropagation(), cl(t.currentTarget, e);
		}
	} : {}, r = e.ghosts.some((e) => e.state === "working" || e.state === "waiting");
	return /* @__PURE__ */ L("div", {
		className: "hh-stage",
		"data-scene": e.roomId,
		"data-lit": r,
		"data-locked": e.locked,
		"aria-hidden": "true",
		...n({
			kind: "room",
			roomId: e.roomId
		}),
		children: [
			/* @__PURE__ */ I("span", { className: "hh-stage-plane hh-stage-ceiling" }),
			/* @__PURE__ */ I("span", { className: "hh-stage-plane hh-stage-left" }),
			/* @__PURE__ */ I("span", { className: "hh-stage-plane hh-stage-right" }),
			/* @__PURE__ */ I("span", { className: "hh-stage-plane hh-stage-floor" }),
			/* @__PURE__ */ L("span", {
				className: "hh-stage-plane hh-stage-back",
				"data-doors": Math.min(e.doors.length, 2),
				children: [/* @__PURE__ */ I(rl, { room: e.roomId }), e.doors.length === 0 ? null : /* @__PURE__ */ I("span", {
					className: "hh-stage-doors",
					children: e.doors.map((t) => /* @__PURE__ */ L("span", {
						className: "hh-stage-door",
						"data-door": t.state,
						...n({
							kind: "door",
							roomId: e.roomId,
							phase: t.phase,
							proposalId: t.proposalId
						}),
						children: [/* @__PURE__ */ I("span", { className: "hh-stage-doorway" }), /* @__PURE__ */ L("span", {
							className: "hh-stage-leaf",
							children: [/* @__PURE__ */ I("span", { className: "hh-stage-mark" }), /* @__PURE__ */ I("span", { className: "hh-stage-mark" })]
						})]
					}, t.phase))
				})]
			}),
			/* @__PURE__ */ I("span", { className: "hh-stage-glow" }),
			/* @__PURE__ */ I("span", { className: "hh-stage-eyes" }),
			/* @__PURE__ */ I("span", {
				className: "hh-stage-props",
				children: /* @__PURE__ */ I(il, { room: e.roomId })
			}),
			e.ghosts.length === 0 ? null : /* @__PURE__ */ I("span", {
				className: "hh-stage-ghosts",
				children: e.ghosts.map((t, r) => /* @__PURE__ */ I("span", {
					className: "hh-stage-ghost",
					"data-ghost": t.state,
					style: ll(r, e.ghosts.length),
					...n({
						kind: "ghost",
						roomId: e.roomId,
						ghostId: t.ghostId
					}),
					children: /* @__PURE__ */ I(Ut, {
						state: t.state,
						variant: zt(t.ghostId),
						size: 72
					})
				}, t.ghostId))
			}),
			/* @__PURE__ */ I("span", { className: "hh-stage-web" }),
			/* @__PURE__ */ I("span", { className: "hh-stage-mist" })
		]
	});
}
// src/components/RoomHotspots.tsx
var dl = /* @__PURE__ */ new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End"
]);
function fl({ room: e, needsYou: t, openKey: n, panelId: r, onOpen: a, onArrow: o, glow: s = "dark" }) {
	let c = i(), l = i(), u = {
		kind: "room",
		roomId: e.roomId
	}, d = Ls(u), p = [t > 0 ? c : null, e.diagnostic === null ? null : l].filter((e) => e !== null).join(" "), [m, h, g] = Ns(e), v = e.readOnly && !e.locked && e.integrity === "valid";
	return /* @__PURE__ */ L("li", {
		className: "hh-ui-room-cell",
		"data-room": e.roomId,
		"data-integrity": e.integrity,
		"data-locked": e.locked,
		"data-read-only": e.readOnly,
		"data-needs": t > 0,
		"data-glow": s,
		children: [/* @__PURE__ */ L("div", {
			className: "hh-ui-room-controls",
			children: [
				/* @__PURE__ */ L("button", {
					type: "button",
					className: "hh-ui-room-control",
					"data-room-control": e.roomId,
					"data-opener-key": d,
					"aria-label": Ps(e),
					"aria-describedby": p === "" ? void 0 : p,
					"aria-disabled": e.locked ? !0 : void 0,
					"aria-expanded": n === d,
					"aria-controls": n === d ? r : void 0,
					onClick: (e) => a(u, e.currentTarget),
					onKeyDown: (t) => {
						!dl.has(t.key) || t.altKey || t.ctrlKey || t.metaKey || (t.preventDefault(), o(e.roomId, t.key));
					},
					children: [
						/* @__PURE__ */ L("span", {
							className: "hh-ui-room-name",
							children: [
								e.locked ? /* @__PURE__ */ I(j, {
									size: 16,
									"aria-hidden": !0
								}) : null,
								" ",
								e.name
							]
						}),
						/* @__PURE__ */ L("span", {
							className: "hh-ui-state",
							"data-field": "phase",
							children: [/* @__PURE__ */ I(_, {
								size: 16,
								"aria-hidden": !0
							}), /* @__PURE__ */ L("span", { children: [
								m.label,
								": ",
								/* @__PURE__ */ I("span", {
									className: "hh-ui-state-word",
									children: m.value
								})
							] })]
						}),
						/* @__PURE__ */ L("span", {
							className: "hh-ui-state",
							"data-field": "door",
							"data-door": e.door,
							children: [/* @__PURE__ */ I(Gt, {
								state: e.door,
								size: 18
							}), /* @__PURE__ */ L("span", { children: [
								h.label,
								": ",
								/* @__PURE__ */ I("span", {
									className: "hh-ui-state-word",
									children: h.value
								})
							] })]
						}),
						/* @__PURE__ */ L("span", {
							className: "hh-ui-state",
							"data-field": "ghost",
							"data-ghost": e.ghost,
							children: [/* @__PURE__ */ I(Ut, {
								state: e.ghost,
								size: 22
							}), /* @__PURE__ */ L("span", { children: [
								g.label,
								": ",
								/* @__PURE__ */ I("span", {
									className: "hh-ui-state-word",
									children: g.value
								})
							] })]
						})
					]
				}),
				e.ghosts.length === 0 ? null : /* @__PURE__ */ I("div", {
					className: "hh-ui-ghosts",
					children: e.ghosts.map((t) => {
						let i = {
							kind: "ghost",
							roomId: e.roomId,
							ghostId: t.ghostId
						}, o = Ls(i);
						return /* @__PURE__ */ L("button", {
							type: "button",
							className: "hh-ui-ghost-control",
							"data-ghost-control": t.ghostId,
							"data-ghost": t.state,
							"data-opener-key": o,
							"aria-label": Fs(e, t),
							"aria-expanded": n === o,
							"aria-controls": n === o ? r : void 0,
							onClick: (e) => a(i, e.currentTarget),
							children: [/* @__PURE__ */ I(Ut, {
								state: t.state,
								variant: zt(t.ghostId),
								size: 56
							}), /* @__PURE__ */ I("span", {
								className: "hh-ui-state",
								children: /* @__PURE__ */ L("span", { children: [
									/* @__PURE__ */ L("span", {
										className: "hh-ui-ghost-name",
										children: [t.name, ":"]
									}),
									" ",
									/* @__PURE__ */ I("span", {
										className: "hh-ui-state-word",
										children: ci(t.state)
									}),
									t.pendingText === null ? null : `, ${t.pendingText}`
								] })
							})]
						}, t.ghostId);
					})
				}),
				e.doors.length === 0 ? null : /* @__PURE__ */ I("div", {
					className: "hh-ui-doors",
					children: e.doors.map((t) => {
						let i = {
							kind: "door",
							roomId: e.roomId,
							phase: t.phase,
							proposalId: t.proposalId
						}, o = Ls(i);
						return /* @__PURE__ */ L("button", {
							type: "button",
							className: "hh-ui-door-control",
							"data-door-control": t.phase,
							"data-phase": t.phase,
							"data-status": t.phaseStatus ?? "unavailable",
							"data-door": t.state,
							"data-opener-key": o,
							"aria-label": Is(e, t),
							"aria-expanded": n === o,
							"aria-controls": n === o ? r : void 0,
							onClick: (e) => a(i, e.currentTarget),
							children: [/* @__PURE__ */ I(Gt, { state: t.state }), /* @__PURE__ */ I("span", {
								className: "hh-ui-state",
								children: /* @__PURE__ */ L("span", { children: [
									t.phaseName,
									" door: ",
									/* @__PURE__ */ I("span", {
										className: "hh-ui-state-word",
										children: ci(t.state)
									}),
									/* @__PURE__ */ L("span", {
										className: "hh-ui-door-words",
										children: [" ", t.text]
									}),
									t.phaseText === null ? null : /* @__PURE__ */ L("span", {
										className: "hh-ui-door-words",
										children: [" ", t.phaseText]
									})
								] })
							})]
						}, t.phase);
					})
				}),
				t > 0 ? /* @__PURE__ */ L("p", {
					className: "hh-ui-state hh-ui-room-needs",
					id: c,
					children: [/* @__PURE__ */ I(f, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", {
						className: "hh-ui-state-word",
						children: $o(t)
					})]
				}) : null,
				e.diagnostic === null ? null : /* @__PURE__ */ L("p", {
					className: v ? "hh-ui-reason hh-ui-state hh-ui-visually-hidden" : "hh-ui-reason hh-ui-state",
					id: l,
					"data-room-reason": e.locked ? "locked" : e.readOnly ? "read-only" : "diagnostic",
					children: [e.locked || e.readOnly ? /* @__PURE__ */ I(j, {
						size: 16,
						"aria-hidden": !0
					}) : /* @__PURE__ */ I(P, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", { children: e.diagnostic })]
				})
			]
		}), /* @__PURE__ */ L("div", {
			className: "hh-ui-room-scene",
			children: [/* @__PURE__ */ I(ul, {
				room: e,
				interactive: !0
			}), /* @__PURE__ */ I("span", {
				className: "hh-ui-window",
				"data-glow": s,
				title: Ar[s],
				"aria-hidden": "true"
			})]
		})]
	});
}
// src/components/HouseMap.tsx
var pl = "Mansion rooms", ml = "Arrow keys move between rooms. Enter opens a room, a ghost or a door. Escape closes it. Doors open only when you approve them.";
function hl({ projection: e, openSurface: t, motion: r, openKey: a = null, panelId: s = "", view: l = "front" }) {
	let u = i(), d = c(null), f = o(() => new Set(e.rooms.map((e) => e.roomId)), [e.rooms]), p = f.has("seance-room"), m = n((t, n) => {
		let r = e.rooms.map((e) => e.roomId), i = n === "Home" ? r[0] : n === "End" ? r[r.length - 1] : si(t, n, f);
		i !== void 0 && i !== t && d.current?.querySelector(`[data-room-control="${i}"]`)?.focus();
	}, [e.rooms, f]);
	return /* @__PURE__ */ L("nav", {
		className: "hh-ui-map",
		"aria-label": pl,
		"data-motion-art": r,
		children: [
			/* @__PURE__ */ I("h3", {
				className: "hh-ui-map-title",
				id: u,
				tabIndex: -1,
				"data-map-title": !0,
				children: "The house"
			}),
			/* @__PURE__ */ I("p", {
				className: "hh-ui-reason hh-ui-map-help",
				children: ml
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-ui-house",
				"data-view": l,
				children: [
					/* @__PURE__ */ I(ol, {}),
					/* @__PURE__ */ I(al, {}),
					/* @__PURE__ */ I("ol", {
						className: "hh-ui-rooms",
						"data-seance": p ? "shown" : "hidden",
						ref: d,
						"aria-labelledby": u,
						children: e.rooms.map((n) => /* @__PURE__ */ I(fl, {
							room: n,
							needsYou: e.needsYou.filter((e) => e.roomId === n.roomId).length,
							glow: kr(n, e.needsYou),
							openKey: a,
							panelId: s,
							onOpen: t,
							onArrow: m
						}, n.roomId))
					}),
					/* @__PURE__ */ I(sl, {}),
					/* @__PURE__ */ L("p", {
						className: "hh-stage-titleblock",
						"aria-hidden": "true",
						children: [
							/* @__PURE__ */ I("span", { children: "Section through every floor" }),
							/* @__PURE__ */ I("span", { children: "Drawn after dark" }),
							/* @__PURE__ */ I("span", { children: "Not to scale" })
						]
					})
				]
			})
		]
	});
}
// src/core/guide-layout.ts
var gl = 1200, _l = 170 / 160, vl = 300 / 200, yl = 18 * _l / vl, bl = {
	previous: {
		left: 2.5,
		top: 28,
		width: 8.5,
		height: 53
	},
	door: {
		left: 89,
		top: 28,
		width: 8.5,
		height: 53
	},
	"door-2": {
		left: 69.7,
		top: 28,
		width: 12.3,
		height: 41.5
	},
	ledger: {
		left: 15.8,
		top: 84.5,
		width: 23.4,
		height: 11.5
	},
	bell: {
		left: 46.5,
		top: 82.5,
		width: 9.4,
		height: 11
	}
}, xl = {
	left: 84,
	top: 82,
	width: 16,
	height: 18
};
yl * vl / 100 - xl.height / 100 * (750 / gl);
var Sl = {
	guideMin: 20,
	guideMax: 26,
	strip: 8,
	apron: 22,
	sceneMinSide: 30,
	sceneMinStacked: 38,
	sideMin: 56
}, Cl = .085, wl = gl / 750;
function Tl(e, t) {
	return (e.windowHeight - e.sceneTop - t) * wl;
}
function El(e) {
	let t = e.windowHeight - e.sceneTop;
	return Math.min(Tl(e, Sl.strip * e.rem), t / .71);
}
function Dl(e) {
	let { rem: t, houseWidth: n } = e;
	if (e.windowWidth < 900) return {
		layout: "narrow",
		sceneWidth: Math.max(0, n),
		guideWidth: 0
	};
	let r = Tl(e, Sl.apron * t), i = El(e), a = Math.min(n, r), o = Math.min(n - Sl.guideMin * t - 12, i);
	if (n < Sl.sideMin * t || o < a) return {
		layout: "stacked",
		sceneWidth: Math.max(0, Math.min(n, Math.max(Sl.sceneMinStacked * t, r))),
		guideWidth: 0
	};
	let s = Math.max(Sl.sceneMinSide * t, i), c = Math.min(Sl.guideMax * t, Math.max(Sl.guideMin * t, n - 12 - s));
	return {
		layout: "side",
		sceneWidth: Math.min(n - c - 12, s),
		guideWidth: c
	};
}
var Ol = {
	failed: 21,
	blocked: 21,
	working: 30
}, kl = {
	left: 26,
	width: 46
}, Al = {
	left: 24,
	width: 44
};
function jl() {
	return 9 * _l * gl / 750;
}
function Ml(e) {
	return Ol[e] ?? 27;
}
function Nl(e, t, n, r = !1) {
	let i = Math.max(1, Math.trunc(t) || 1), a = Math.min(i - 1, Math.max(0, Math.trunc(e) || 0)), o = jl(), s = r ? Al : kl;
	return {
		left: s.left + (a + .5) / i * s.width - 9 / 2,
		top: 100 - Ml(n) - o,
		width: 9,
		height: o
	};
}
var Pl = {
	requirements: "requirements",
	design: "design",
	tasks: "tasks",
	implementation: "build"
}, Fl = {
	requirements: "Door for {word}",
	design: "Door for {word}",
	tasks: "Door for the {word}",
	implementation: "Door for {word}"
};
function Il(e) {
	let t = (e) => +(e.box.top >= xl.top);
	return [...e].sort((e, n) => t(e) - t(n) || e.box.left - n.box.left);
}
function Ll(e, t, n, r) {
	let i = [], a = {
		kind: "room",
		roomId: e.roomId
	};
	t.previous !== null && i.push({
		key: "previous",
		kind: "previous",
		box: bl.previous,
		label: `To the ${t.previous.name}`,
		name: `To the ${t.previous.name}. Opens that room.`,
		steps: [{
			kind: "map",
			target: {
				kind: "room",
				roomId: t.previous.roomId
			},
			focus: { kind: "heading" }
		}]
	});
	let [o, s] = e.doors, c = (t, r) => {
		let i = `${Fl[t.phase].replace("{word}", Us(Pl[t.phase], n))}: ${ci(t.state)}`;
		return {
			key: r,
			kind: "door",
			box: bl[r],
			label: i,
			name: `${i}. Shows this door and what it waits for.`,
			steps: [{
				kind: "map",
				target: {
					kind: "door",
					roomId: e.roomId,
					phase: t.phase,
					proposalId: t.proposalId
				},
				focus: { kind: "heading" }
			}]
		};
	};
	o === void 0 ? t.next !== null && i.push({
		key: "next",
		kind: "next",
		box: bl.door,
		label: `To the ${t.next.name}`,
		name: `To the ${t.next.name}. Opens that room.`,
		steps: [{
			kind: "map",
			target: {
				kind: "room",
				roomId: t.next.roomId
			},
			focus: { kind: "heading" }
		}]
	}) : i.push(c(o, "door")), s !== void 0 && i.push(c(s, "door-2")), e.ghosts.forEach((t, n) => {
		let r = `${t.name}: ${ci(t.state)}`;
		i.push({
			key: `ghost:${t.ghostId}`,
			kind: "ghost",
			box: Nl(n, e.ghosts.length, t.state, s !== void 0),
			label: r,
			name: `${r}. Shows what this ghost is doing.`,
			steps: [{
				kind: "map",
				target: {
					kind: "ghost",
					roomId: e.roomId,
					ghostId: t.ghostId
				},
				focus: { kind: "heading" }
			}]
		});
	}), i.push({
		key: "ledger",
		kind: "ledger",
		box: bl.ledger,
		label: "Ledger: this room's sheet",
		name: `Ledger: this room's sheet. Opens the sheet of the ${e.name}.`,
		steps: [{
			kind: "map",
			target: a,
			focus: { kind: "heading" }
		}]
	});
	let l = r === 0 ? "Bell: nothing needs you" : r === 1 ? "Bell: 1 thing needs you" : `Bell: ${r} things need you`;
	return i.push({
		key: "bell",
		kind: "bell",
		box: bl.bell,
		label: l,
		name: r === 0 ? `${l}. A press does nothing until something waits.` : `${l}. Goes to the first of them.`,
		steps: [{
			kind: "shell",
			action: "needs-you"
		}]
	}), Il(i);
}
var Rl = `
.hh-ui { ${yr("dark")}
  --hh-canvas: var(--hh-fb-canvas);
  --hh-surface: var(--hh-fb-surface);
  --hh-surface-raised: var(--hh-fb-surface-raised);
  --hh-text: var(--hh-fb-text);
  --hh-text-muted: var(--hh-fb-text-muted);
  --hh-border: var(--hh-fb-border);
  --hh-border-soft: var(--hh-fb-border);
  --hh-focus: var(--hh-fb-focus);
  --hh-accent: var(--hh-fb-accent);
  --hh-primary: var(--hh-fb-accent);
  --hh-primary-text: var(--hh-fb-accent-text);
  --hh-danger: var(--hh-fb-danger);
  --hh-ok: var(--hh-fb-ok);
  --hh-candle: var(--hh-fb-candle);
  --hh-ghost: var(--hh-fb-ghost);
  --hh-working: var(--hh-fb-working);
  --hh-font-sans: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  --hh-font-serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  color: var(--hh-text); background: var(--hh-canvas); font-family: var(--hh-font-sans); font-size: 1rem; line-height: 1.45;
  display: grid; gap: 14px; min-width: 0; max-width: 100%; box-sizing: border-box; padding: 16px;
  border: 1px solid var(--hh-border-soft); border-radius: 12px; overflow-wrap: anywhere; }
.hh-ui[data-theme='dark'] { ${yr("dark")} }
.hh-ui *, .hh-ui *::before, .hh-ui *::after { box-sizing: border-box; }
.hh-ui h2, .hh-ui h3, .hh-ui h4, .hh-ui p { margin: 0; overflow-wrap: anywhere; }
.hh-ui h2, .hh-ui h3 { font-family: var(--hh-font-serif); font-weight: 700; letter-spacing: 0.01em; }
.hh-ui h2 { font-size: 1.375rem; line-height: 1.2; }
.hh-ui h3 { font-size: 1.125rem; }
.hh-ui h4 { font-size: 0.9375rem; }
.hh-ui h2:focus-visible, .hh-ui h3:focus-visible, .hh-ui h4:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }
.hh-ui-muted { color: var(--hh-text-muted); }
.hh-ui-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }

.hh-ui-behind { display: grid; gap: 14px; min-width: 0; }
.hh-ui-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-width: 0; }
.hh-ui-mansion-name { min-width: 0; flex: 1 1 8rem; overflow-wrap: anywhere; }
.hh-ui-mansion-name .hh-ui-muted { font-family: var(--hh-font-sans); font-size: 0.875rem; font-weight: 400;
  letter-spacing: 0.08em; text-transform: uppercase; display: block; }
.hh-ui-needs, .hh-ui-toggle, .hh-ui-button, .hh-ui-panel-close, .hh-ui-status > summary {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; font: inherit; text-align: left;
  color: var(--hh-text); background: var(--hh-surface-raised); border: 1px solid var(--hh-border);
  border-radius: 8px; padding: 6px 12px; cursor: pointer; overflow-wrap: anywhere; }
.hh-ui-needs { border-radius: 999px; border-width: 2px; font-weight: 700; border-color: var(--hh-accent); padding: 6px 14px; }
.hh-ui-needs svg { flex: none; color: var(--hh-accent); }
.hh-ui-needs[data-count='0'] { border-style: dashed; border-width: 1px; font-weight: 400; color: var(--hh-text-muted);
  border-color: var(--hh-border); cursor: default; }
.hh-ui-needs[data-count='0'] svg { color: var(--hh-text-muted); }
.hh-ui-toggle[aria-pressed='true'] { border-style: double; border-width: 4px; padding: 3px 9px; font-weight: 600; }
.hh-ui-button[data-variant='primary'] { color: var(--hh-primary-text); background: var(--hh-primary); font-weight: 600; }
.hh-ui-status { min-width: 0; }
.hh-ui-status > summary { list-style-position: inside; }
.hh-ui-status-body { margin-top: 8px; padding: 8px 10px; border: 1px solid var(--hh-border-soft); border-radius: 6px; }

.hh-ui-needs:focus-visible, .hh-ui-toggle:focus-visible, .hh-ui-button:focus-visible, .hh-ui-panel-close:focus-visible,
.hh-ui-status > summary:focus-visible, .hh-ui-room-control:focus-visible, .hh-ui-ghost-control:focus-visible,
.hh-ui-door-control:focus-visible, .hh-ui-panel:focus-visible, .hh-ui-map-title:focus-visible, .hh-ui-replay-range:focus-visible {
  outline: 2px solid var(--hh-focus); outline-offset: 2px; }

.hh-ui [aria-disabled='true'], .hh-ui button:disabled { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted); }
.hh-ui-reason { font-size: 0.875rem; color: var(--hh-text-muted); }

.hh-ui-note { display: flex; align-items: flex-start; gap: 6px; min-width: 0; padding: 8px 10px;
  border: 1px solid var(--hh-border); border-left-width: 4px; border-radius: 6px; background: var(--hh-surface); }
.hh-ui-note svg { flex: none; margin-top: 2px; }
.hh-ui-note[data-kind='diagnostic'] { border-style: dashed; border-left-style: solid; }
.hh-ui-note[data-kind='diagnostic'] svg { color: var(--hh-danger); }
.hh-ui-note[data-kind='read-only'] { border-left-style: double; border-left-width: 6px; }
.hh-ui-note[data-kind='locked'] { border-style: dotted; border-left-style: dotted; }

.hh-ui-replay-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; min-width: 0; padding: 10px 14px;
  color: var(--hh-text); background: var(--hh-surface-raised); border: 2px solid var(--hh-border); border-radius: 10px; }
.hh-ui-replay-label { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; font-size: 0.8125rem; }
.hh-ui-replay-label svg { flex: none; color: var(--hh-danger); }
.hh-ui-replay-buttons { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.hh-ui-replay-progress { display: grid; gap: 2px; flex: 1 1 12rem; min-width: 0; }
.hh-ui-replay-position { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 0.875rem; }
.hh-ui-replay-range { width: 100%; min-width: 0; margin: 0; accent-color: var(--hh-accent); }
.hh-ui-replay-speed { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0;
  margin: 0; padding: 0; border: 0; font-size: 0.875rem; }
.hh-ui-replay-speed legend { float: left; margin-right: 6px; padding: 0; color: var(--hh-text-muted); }
.hh-ui-replay-speed label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.hh-ui-replay-speed input { margin: 0; accent-color: var(--hh-accent); }
.hh-ui-replay-speed input:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }
.hh-ui-note.hh-ui-replay-note { flex: 1 1 100%; display: flex; align-items: flex-start; gap: 6px; padding: 0; border: 0;
  background: transparent; font-size: 0.875rem; color: var(--hh-text-muted); }
.hh-ui-replay-note svg { flex: none; margin-top: 2px; }
.hh-ui-replay-reasons { flex: 1 1 100%; margin: 0; padding: 0 0 0 1.25rem; font-size: 0.875rem; color: var(--hh-text-muted); }

.hh-ui-house { position: relative; min-width: 0; }
.hh-ui-map { position: relative; min-width: 0; }
.hh-ui-map-title { margin: 0 0 4px; }
.hh-ui-house-art { position: absolute; top: 0; left: 0; width: 100%; height: auto; color: var(--hh-border); pointer-events: none; }
.hh-ui-house .hh-ui-house-art { display: none; }
.hh-ui-rooms { position: relative; list-style: none; margin: 0; padding: 0; min-width: 0;
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }

.hh-ui-room-cell { position: relative; min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; padding: 10px;
  background: var(--hh-surface); border: 2px solid var(--hh-border); border-radius: 6px; }
.hh-ui-room-cell[data-integrity='uncertain'], .hh-ui-room-cell[data-integrity='incompatible'] { border-style: dashed; }
.hh-ui-room-cell[data-integrity='corrupt'] { border-style: dotted; border-width: 3px; padding: 9px; }
.hh-ui-room-cell[data-locked='true'] { border-style: dotted;
  background: repeating-linear-gradient(135deg, var(--hh-surface) 0 10px, var(--hh-surface-raised) 10px 20px); }
.hh-ui-room-cell[data-needs='true'] { border-top-style: double; border-top-width: 6px; padding-top: 6px; border-color: var(--hh-accent); }
.hh-ui-room-controls { position: relative; display: grid; align-content: start; gap: 8px; min-width: 0; }
.hh-ui-room-scene { position: relative; align-self: stretch; justify-self: stretch; width: 100%; min-width: 0; aspect-ratio: 4 / 1; container-type: size; pointer-events: none; }
.hh-ui-room-art { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--hh-border); pointer-events: none; }
.hh-ui-room-scene > .hh-ui-room-wall { display: none; }
.hh-ui-room-wall { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--hh-border-soft); pointer-events: none; }
.hh-ui-room-motifs { position: absolute; left: 0; bottom: 0; }
@container (max-aspect-ratio: 6 / 7) {
  .hh-ui-room-scene > .hh-ui-room-wall { display: block; }
}

.hh-ui-room-control, .hh-ui-ghost-control, .hh-ui-door-control {
  display: grid; gap: 4px; justify-items: start; width: 100%; min-width: 0; font: inherit; text-align: left;
  color: var(--hh-text); background: var(--hh-surface-raised); border: 1px solid var(--hh-border);
  padding: 8px 10px; cursor: pointer; overflow-wrap: anywhere; }
.hh-ui-room-control { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 14px; border-radius: 8px; border-width: 2px; }
.hh-ui-room-control[aria-expanded='true'] { border-style: double; border-width: 4px; padding: 6px 8px; }
.hh-ui-room-name { flex: 1 1 100%; display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--hh-font-serif); font-weight: 700; font-size: 1.1875rem; line-height: 1.25; }
.hh-ui-room-control .hh-ui-state { font-size: 0.8125rem; color: var(--hh-text-muted); }
.hh-ui-room-control .hh-ui-state-word { color: var(--hh-text); }
.hh-ui-state { display: flex; align-items: flex-start; gap: 6px; min-width: 0; font-size: 0.875rem; }
.hh-ui-state svg { flex: none; margin-top: 1px; }
.hh-ui-state-word { font-weight: 700; }

.hh-ui-ghosts, .hh-ui-doors { display: grid; gap: 8px; min-width: 0;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); }
.hh-ui-ghost-control { --hh-state: var(--hh-ghost); display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px;
  border-radius: 28px 28px 8px 8px; padding-left: 8px; }
.hh-ui-ghost-control > .hh-ui-state { flex: 1 1 6.5em; min-width: 0; }
.hh-ui-ghost-control .hh-ui-art-ghost { color: var(--hh-state); }
.hh-ui-ghost-name { display: block; font-weight: 700; font-size: 1rem; }
.hh-ui-ghost-control .hh-ui-state-word { color: var(--hh-state-text, var(--hh-text)); }
.hh-ui-ghost-control[data-ghost='idle'] { border-style: solid; border-width: 1px; }
.hh-ui-ghost-control[data-ghost='working'] { --hh-state: var(--hh-working); --hh-state-text: var(--hh-working);
  border-style: solid; border-width: 3px; padding: 6px 8px; border-color: var(--hh-working); }
.hh-ui-ghost-control[data-ghost='waiting'] { --hh-state: var(--hh-accent); --hh-state-text: var(--hh-accent);
  border-style: double; border-width: 4px; padding: 5px 7px; border-color: var(--hh-accent); }
.hh-ui-ghost-control[data-ghost='blocked'] { --hh-state: var(--hh-text-muted); --hh-state-text: var(--hh-text-muted);
  border-style: dashed; border-width: 2px; padding: 7px 9px; }
.hh-ui-ghost-control[data-ghost='failed'] { --hh-state: var(--hh-danger); --hh-state-text: var(--hh-danger);
  border-style: dotted; border-width: 3px; padding: 6px 8px; border-radius: 4px; border-color: var(--hh-danger); }
.hh-ui-ghost-control[data-ghost='done'] { --hh-state: var(--hh-ok); --hh-state-text: var(--hh-ok);
  border-style: solid; border-width: 2px; padding: 7px 9px; border-radius: 8px; }
.hh-ui-ghost-control[data-ghost='not_applicable'], .hh-ui-ghost-control[data-ghost='unavailable'] {
  --hh-state: var(--hh-text-muted); border-style: dashed; border-width: 1px; color: var(--hh-text-muted); }
.hh-ui-room-control .hh-ui-state[data-ghost='working'] svg { color: var(--hh-working); }
.hh-ui-room-control .hh-ui-state[data-ghost='waiting'] svg, .hh-ui-room-control .hh-ui-state[data-door='waiting'] svg { color: var(--hh-accent); }
.hh-ui-room-control .hh-ui-state[data-ghost='failed'] svg { color: var(--hh-danger); }
.hh-ui-room-control .hh-ui-state[data-ghost='done'] svg, .hh-ui-room-control .hh-ui-state[data-door='open'] svg { color: var(--hh-ok); }

.hh-ui-door-control { grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 8px; border-radius: 14px 14px 2px 2px;
  font-size: 0.875rem; }
.hh-ui-door-control[data-door='sealed'] { border-style: solid; border-width: 3px; padding: 6px 8px; }
.hh-ui-door-control[data-door='waiting'] { border-style: double; border-width: 4px; padding: 5px 7px; border-color: var(--hh-accent); }
.hh-ui-door-control[data-door='open'] { border-style: solid; border-width: 1px; border-left-width: 6px; padding-left: 5px; border-left-color: var(--hh-ok); }
.hh-ui-door-control[data-door='rejected'] { border-style: dotted; border-width: 3px; padding: 6px 8px; }
.hh-ui-door-control[data-door='not_applicable'], .hh-ui-door-control[data-door='unavailable'] {
  border-style: dashed; border-width: 1px; color: var(--hh-text-muted); }
.hh-ui-door-control[data-door='waiting'] .hh-ui-art-door { color: var(--hh-accent); }
.hh-ui-door-control[data-door='rejected'] .hh-ui-art-door { color: var(--hh-danger); }
.hh-ui-door-control[data-door='open'] .hh-ui-art-door { color: var(--hh-ok); }

.hh-ui-art { display: block; flex: none; max-width: 100%; }
.hh-ui .lucide { width: 1em; height: auto; }
.hh-ui-ghost-control .hh-ui-art-ghost { width: 3.5em; height: auto; }
.hh-ui-door-control .hh-ui-art-door { width: 2em; height: auto; }
.hh-ui-room-control .hh-ui-art { width: 1.375em; height: auto; }
.hh-ui-art-ghost { color: var(--hh-ghost); overflow: visible; }
.hh-ui-art-door { color: var(--hh-border); }
.hh-ui-art-candle { color: var(--hh-border); }
.hh-ui-art-flame { color: var(--hh-candle); transform-box: fill-box; transform-origin: center bottom; }
.hh-ui-art-glow { color: var(--hh-candle); }
.hh-ui-art-mark { color: var(--hh-danger); }
.hh-ui-art-check { color: var(--hh-ok); }
.hh-ui-art-web { color: var(--hh-text-muted); }
.hh-ui-art-dust { color: var(--hh-text-muted); }

.hh-ui-needs-list { flex: 1 1 100%; margin: 0; padding: 0 0 0 1.25rem; font-size: 0.875rem; }
.hh-ui-map-help { margin: 0 0 10px; }
.hh-ui-door-words { display: block; font-weight: 400; }
.hh-ui-room-motifs { display: flex; align-items: flex-end; gap: 6px; }
.hh-ui-room-needs { margin: 0; color: var(--hh-text); }
.hh-ui-room-needs svg { color: var(--hh-accent); }
.hh-ui-notes { display: grid; gap: 8px; min-width: 0; }
.hh-ui-notes:empty { display: none; }

.hh-ui-backdrop { position: fixed; inset: 0; background: var(--hh-canvas); opacity: 0.85; }
.hh-ui-panel { display: grid; gap: 12px; align-content: start; min-width: 0; width: min(42rem, 100%); max-width: 100%;
  color: var(--hh-text); background: var(--hh-surface); border: 2px solid var(--hh-border); border-radius: 10px;
  padding: 14px 16px; overflow-wrap: anywhere; }
.hh-ui-panel[data-mode='dialog'] { position: fixed; top: 5vh; left: 50%; translate: -50% 0; max-height: 90vh; overflow-y: auto;
  width: min(42rem, calc(100% - 24px)); }
.hh-ui-panel[data-mode='region'] { position: static; }
.hh-ui-panel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.hh-ui-panel-body { display: grid; gap: 12px; min-width: 0; }
.hh-ui-panel-body code, .hh-ui-panel-body pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8125rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.hh-ui-panel-secondary { border-top: 1px solid var(--hh-border-soft); padding-top: 10px; }

.hh-ui-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }

@media (max-width: 640px) {
  .hh-ui { padding: 10px; }
  .hh-ui-rooms { grid-template-columns: minmax(0, 1fr); }
  .hh-ui-panel[data-mode='dialog'] { top: 0; max-height: 100vh; width: 100%; }
}

@media (min-width: 900px) {
  .hh-ui-replay-bar { position: sticky; top: 0; z-index: 2; }
  .hh-ui-house { padding: 11% 2% 0; }
  .hh-ui-house .hh-ui-house-art { display: block; }
  .hh-ui-rooms { padding: 12px; gap: 12px; border: 3px solid var(--hh-border); border-top-width: 1px; border-bottom-width: 6px;
    border-radius: 0 0 4px 4px;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1fr);
    grid-template-areas: 'attic attic attic attic' 'drafting drafting drafting drafting' 'study foyer workshop workshop'; }
  .hh-ui-rooms[data-seance='shown'] {
    grid-template-areas: 'attic attic attic attic' 'drafting drafting seance seance' 'study foyer workshop workshop'; }
  .hh-ui-room-cell[data-room='foyer'] { grid-area: foyer; }
  .hh-ui-room-cell[data-room='study'] { grid-area: study; }
  .hh-ui-room-cell[data-room='drafting-room'] { grid-area: drafting; }
  .hh-ui-room-cell[data-room='workshop'] { grid-area: workshop; }
  .hh-ui-room-cell[data-room='attic'] { grid-area: attic; grid-template-rows: auto; grid-template-columns: minmax(0, 1fr) auto; }
  .hh-ui-room-cell[data-room='seance-room'] { grid-area: seance; }
  .hh-ui-room-cell[data-room='attic'] .hh-ui-room-scene { width: 14rem; max-width: 100%; aspect-ratio: auto; }
}

@keyframes hh-ui-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes hh-ui-flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
@keyframes hh-ui-drift { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
@media (prefers-reduced-motion: no-preference) {
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-ghost[data-ghost='idle'] { animation: hh-ui-float 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-ghost[data-ghost='done'] { animation: hh-ui-float 6s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-ghost[data-ghost='working'] { animation: hh-ui-flicker 2s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-ghost .hh-ui-art-glow { animation: hh-ui-flicker 3s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-flame { animation: hh-ui-flicker 3s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-dust { animation: hh-ui-drift 9s ease-in-out infinite; }
}
.hh-ui[data-motion='none'], .hh-ui[data-motion='none'] *, .hh-ui:not([data-motion]) * { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  .hh-ui, .hh-ui * { animation: none !important; transition: none !important; }
}
`, zl = 1.2, Bl = 750 / gl, Vl = gl / 750, Hl = .03, Ul = .8, Wl = .6, Y = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, black)`, X = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, transparent)`, Gl = `
.hh-ui { ${Cr("dark")}
  --hh-font-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
  --hh-font-label: var(--hh-font-sans);
  --hh-depth: 110px; --hh-room-h: clamp(130px, 30vw, 200px); border-radius: 16px; }
.hh-ui[data-theme='dark'] { ${Cr("dark")} }

.hh-ui h2, .hh-ui h3 { letter-spacing: 0; }
.hh-ui-needs, .hh-ui-toggle, .hh-ui-button, .hh-ui-panel-close, .hh-ui-status > summary {
  font-family: var(--hh-font-label); font-weight: 600; border-width: 2px; border-radius: 6px; }
.hh-ui-needs { border-radius: 999px; }
.hh-ui-mansion-name .hh-ui-muted { font-family: var(--hh-font-label); letter-spacing: 0; text-transform: none; }
.hh-ui-replay-label { font-family: var(--hh-font-label); letter-spacing: 0; text-transform: none; font-size: 0.9375rem; }
.hh-ui-map-title { font-size: 1.5rem; }
.hh-ui-view-toggle { display: none; }

.hh-ui-house { position: relative; padding: 14px; border: 2px solid var(--hh-sc-sheet-ink); border-radius: 12px;
  background-color: var(--hh-sc-sheet);
  background-image: linear-gradient(var(--hh-sc-sheet-line) 1px, transparent 1px), linear-gradient(90deg, var(--hh-sc-sheet-line) 1px, transparent 1px),
    linear-gradient(${X("--hh-sc-sheet-ink", 22)} 1px, transparent 1px), linear-gradient(90deg, ${X("--hh-sc-sheet-ink", 22)} 1px, transparent 1px);
  background-size: 20px 20px, 20px 20px, 100px 100px, 100px 100px; background-position: -1px -1px; }
.hh-stage-art { display: block; pointer-events: none; color: var(--hh-sc-ink); }
.hh-stage-roof-art, .hh-stage-sky-art, .hh-stage-yard-art { display: none; }
.hh-stage-yard-art { color: var(--hh-sc-sheet-ink); }
.hh-stage-sky-art { color: var(--hh-sc-sheet-ink); }
.hh-stage-titleblock { display: none; }

.hh-ui-rooms { gap: 12px; }
.hh-ui-room-cell { padding: 0; gap: 0; grid-template-rows: auto minmax(0, 1fr); border-color: var(--hh-sc-poche);
  border-width: 4px; border-radius: 6px; background: var(--hh-sc-poche); }
.hh-ui-room-cell[data-integrity='corrupt'] { padding: 0; }
.hh-ui-room-cell[data-needs='true'] { padding-top: 0; }
.hh-ui-room-cell[data-locked='true'] { background: var(--hh-sc-poche); }
.hh-ui-room-scene { grid-row: 1; aspect-ratio: auto; height: var(--hh-room-h); container-type: normal; perspective: 700px; perspective-origin: 50% 42%; }
.hh-ui-room-controls { grid-row: 2; padding: 8px 10px 10px; background: var(--hh-surface); border-radius: 0 0 2px 2px; }
.hh-ui-room-control { border-color: transparent; background: transparent; padding: 2px 4px; }
.hh-ui-room-name { font-size: 1.25rem; }
.hh-ui-room-control .hh-ui-state, .hh-ui-ghost-control, .hh-ui-door-control { font-family: var(--hh-font-label); }
.hh-ui-ghost-control { border-radius: 22px 22px 10px 10px; }

.hh-stage { position: absolute; inset: 0; transform-style: preserve-3d; --hh-w: var(--hh-sc-wall-foyer); }
.hh-stage[data-scene='study'] { --hh-w: var(--hh-sc-wall-study); }
.hh-stage[data-scene='drafting-room'] { --hh-w: var(--hh-sc-wall-drafting); }
.hh-stage[data-scene='workshop'] { --hh-w: var(--hh-sc-wall-workshop); }
.hh-stage[data-scene='attic'] { --hh-w: var(--hh-sc-wall-attic); }
.hh-stage[data-scene='seance-room'] { --hh-w: var(--hh-sc-wall-seance); }
.hh-stage-plane { position: absolute; display: block; transform-style: preserve-3d; }
.hh-stage-back { inset: 0; transform: translateZ(calc(-1 * var(--hh-depth)));
  background:
    linear-gradient(to top, ${Y("--hh-w", 58)} 0 22%, ${Y("--hh-sc-wood-dark", 80)} 22% 24.5%, transparent 24.5%),
    repeating-linear-gradient(90deg, transparent 0 13px, ${X("--hh-sc-bone", 9)} 13px 26px),
    var(--hh-w); }
.hh-stage-floor { left: 0; right: 0; bottom: 0; height: var(--hh-depth); transform-origin: 50% 100%; transform: rotateX(90deg);
  background:
    linear-gradient(to bottom, ${Y("--hh-sc-ink", 100)} -10%, transparent 55%),
    repeating-linear-gradient(90deg, var(--hh-sc-floor) 0 26px, ${Y("--hh-sc-floor", 62)} 26px 28px); }
.hh-stage-ceiling { left: 0; right: 0; top: 0; height: var(--hh-depth); transform-origin: 50% 0; transform: rotateX(-90deg);
  background: linear-gradient(to top, ${Y("--hh-w", 30)}, ${Y("--hh-w", 46)}); }
.hh-stage-left { left: 0; top: 0; bottom: 0; width: var(--hh-depth); transform-origin: 0 50%; transform: rotateY(90deg);
  background: linear-gradient(to top, ${Y("--hh-w", 40)} 0 22%, ${Y("--hh-sc-wood-dark", 60)} 22% 24.5%, transparent 24.5%), ${Y("--hh-w", 70)}; }
.hh-stage-right { right: 0; top: 0; bottom: 0; width: var(--hh-depth); transform-origin: 100% 50%; transform: rotateY(-90deg);
  background: linear-gradient(to top, ${Y("--hh-w", 34)} 0 22%, ${Y("--hh-sc-wood-dark", 52)} 22% 24.5%, transparent 24.5%), ${Y("--hh-w", 58)}; }
.hh-stage[data-scene='workshop'] .hh-stage-back { background:
    repeating-linear-gradient(0deg, transparent 0 11px, ${Y("--hh-w", 55)} 11px 13px),
    repeating-linear-gradient(90deg, transparent 0 30px, ${Y("--hh-w", 55)} 30px 32px), var(--hh-w); }
.hh-stage[data-scene='attic'] .hh-stage-back { background:
    repeating-linear-gradient(90deg, transparent 0 22px, ${Y("--hh-w", 55)} 22px 24px), var(--hh-w); }

.hh-stage-wall-art { position: absolute; left: 0; bottom: 0; width: 100%; height: 100%; }
.hh-stage-back[data-doors='1'] .hh-stage-wall-art { left: 24%; width: 76%; }
.hh-stage-back[data-doors='2'] .hh-stage-wall-art { left: 42%; width: 58%; }
.hh-stage-props { position: absolute; inset: 0; transform: translateZ(calc(-0.42 * var(--hh-depth))); pointer-events: none; }
.hh-stage-prop-art { position: absolute; left: 0; bottom: 0; width: 100%; height: 92%; }
.hh-stage-glow { position: absolute; inset: -6%; transform: translateZ(calc(-0.7 * var(--hh-depth))); pointer-events: none;
  background: radial-gradient(closest-side, ${X("--hh-sc-ink", 0)}, ${X("--hh-sc-ink", 62)}); }
.hh-stage[data-lit='true'] .hh-stage-glow { background: radial-gradient(closest-side, ${X("--hh-sc-lamp", 42)}, ${X("--hh-sc-lamp", 8)} 70%, transparent); }
.hh-stage[data-locked='true'] .hh-stage-glow { background: repeating-linear-gradient(135deg, ${X("--hh-sc-ink", 70)} 0 12px, ${X("--hh-sc-ink", 40)} 12px 24px); }

.hh-stage-doors { position: absolute; left: 5%; bottom: 0; height: 68%; display: flex; align-items: flex-end; gap: 8%;
  width: 40%; transform-style: preserve-3d; }
.hh-stage-door { position: relative; display: block; flex: none; height: 100%; aspect-ratio: 5 / 9; transform-style: preserve-3d;
  background: var(--hh-sc-ink); border: 3px solid var(--hh-sc-wood-dark); border-bottom-width: 0;
  border-radius: 46% 46% 0 0 / 24% 24% 0 0; }
.hh-stage-doorway { position: absolute; inset: 0; display: block; border-radius: inherit; }
.hh-stage-door[data-door='open'] .hh-stage-doorway, .hh-stage-door[data-door='waiting'] .hh-stage-doorway {
  background: radial-gradient(ellipse at 50% 70%, var(--hh-sc-moon), var(--hh-sc-lamp) 55%, ${Y("--hh-sc-lamp", 45)}); }
.hh-stage-leaf { position: absolute; inset: 0; display: block; border-radius: inherit; transform-origin: 0 50%;
  border: 2px solid var(--hh-sc-ink);
  background:
    radial-gradient(circle at 82% 56%, var(--hh-sc-brass) 0 3px, var(--hh-sc-ink) 3px 4.5px, transparent 4.5px),
    linear-gradient(${Y("--hh-sc-wood", 70)}, ${Y("--hh-sc-wood", 70)}) 50% 30% / 56% 26% no-repeat,
    linear-gradient(${Y("--hh-sc-wood", 70)}, ${Y("--hh-sc-wood", 70)}) 50% 82% / 56% 30% no-repeat,
    var(--hh-sc-wood); }
.hh-stage-door[data-door='waiting'] .hh-stage-leaf { transform: rotateY(-22deg); }
.hh-stage-door[data-door='open'] .hh-stage-leaf { transform: rotateY(-78deg); }
.hh-stage-door[data-door='not_applicable'] .hh-stage-leaf, .hh-stage-door[data-door='unavailable'] .hh-stage-leaf {
  background: ${Y("--hh-w", 80)}; border-style: dashed; }
.hh-stage-mark { position: absolute; display: none; left: -18%; right: -18%; top: 42%; height: 11%;
  background: var(--hh-sc-wood-dark); border: 2px solid var(--hh-sc-ink); border-radius: 2px; }
.hh-stage-door[data-door='sealed'] .hh-stage-mark:first-child { display: block; background: var(--hh-sc-brass); }
.hh-stage-door[data-door='rejected'] .hh-stage-mark { display: block; background: var(--hh-sc-bone); }
.hh-stage-door[data-door='rejected'] .hh-stage-mark:first-child { transform: rotate(32deg); }
.hh-stage-door[data-door='rejected'] .hh-stage-mark:last-child { transform: rotate(-32deg); }

.hh-stage-ghosts { position: absolute; inset: 0; transform-style: preserve-3d; pointer-events: none; }
.hh-stage-ghost { position: absolute; display: block; bottom: 20%; width: clamp(48px, 22%, 96px);
  left: calc((var(--hh-i) + 1) / (var(--hh-n) + 1) * 100%); margin-left: clamp(-48px, -11%, -24px);
  transform: translateZ(calc(-0.18 * var(--hh-depth) - var(--hh-i) * 0.16 * var(--hh-depth)));
  --hh-surface-raised: var(--hh-sc-bone); --hh-glow: var(--hh-sc-ecto); }
.hh-stage-ghost .hh-ui-art-ghost { width: 100%; height: auto; color: var(--hh-sc-ink);
  filter: drop-shadow(0 0 7px var(--hh-glow)) drop-shadow(0 0 2px var(--hh-glow)); }
.hh-stage-ghost[data-ghost='working'] { --hh-glow: var(--hh-sc-paper); bottom: 24%; }
.hh-stage-ghost[data-ghost='waiting'] { --hh-glow: var(--hh-sc-lamp); }
.hh-stage-ghost[data-ghost='failed'] { --hh-glow: var(--hh-sc-cloth); bottom: 6%; }
.hh-stage-ghost[data-ghost='blocked'] { --hh-glow: var(--hh-sc-ink); bottom: 10%; }
.hh-stage-ghost[data-ghost='done'] { bottom: 28%; }
.hh-stage-ghost .hh-ui-art-check, .hh-stage-ghost .hh-ui-art-mark, .hh-stage-ghost .hh-ui-art-glow, .hh-stage-ghost .hh-ui-art-web { color: var(--hh-glow); }
.hh-stage-ghost[data-ghost='blocked'] .hh-ui-art-web { color: var(--hh-sc-bone); }

.hh-stage[data-pick], .hh-stage [data-pick] { pointer-events: auto; cursor: pointer; }
.hh-stage-ghost[data-pick]:hover .hh-ui-art-ghost { filter: drop-shadow(0 0 12px var(--hh-glow)) drop-shadow(0 0 4px var(--hh-sc-bone)); }
.hh-stage-door[data-pick]:hover { border-color: var(--hh-sc-lamp); }

.hh-stage-eyes { position: absolute; inset: 0; display: none; pointer-events: none; transform: translateZ(calc(-1 * var(--hh-depth) + 2px));
  background:
    radial-gradient(circle at 71% 34%, var(--hh-sc-lamp) 0 2px, transparent 3px),
    radial-gradient(circle at 74.5% 34%, var(--hh-sc-lamp) 0 2px, transparent 3px),
    radial-gradient(circle at 18% 58%, var(--hh-sc-ecto) 0 1.5px, transparent 2.5px),
    radial-gradient(circle at 20.5% 58%, var(--hh-sc-ecto) 0 1.5px, transparent 2.5px); }
.hh-stage[data-lit='false'] .hh-stage-eyes { display: block; }
.hh-stage-web { position: absolute; left: 0; top: 0; display: block; width: clamp(34px, 16%, 84px); aspect-ratio: 1; pointer-events: none;
  border-radius: 0 0 100% 0;
  background:
    repeating-radial-gradient(circle at 0 0, transparent 0 22%, ${X("--hh-sc-bone", 55)} 22% 24%),
    conic-gradient(from 90deg at 0 0, ${X("--hh-sc-bone", 55)} 0 2deg, transparent 2deg 28deg, ${X("--hh-sc-bone", 55)} 28deg 30deg, transparent 30deg 58deg, ${X("--hh-sc-bone", 55)} 58deg 60deg, transparent 60deg 88deg, ${X("--hh-sc-bone", 55)} 88deg 90deg, transparent 90deg); }
.hh-stage-mist { position: absolute; left: 0; right: 0; bottom: 0; display: block; height: 26%; pointer-events: none;
  background: linear-gradient(to top, ${X("--hh-sc-paper", 30)}, ${X("--hh-sc-paper", 8)} 60%, transparent); }

.hh-ui { position: relative; padding: 0; gap: 0; border: 0; border-radius: 0; background: var(--hh-sc-poche); }
.hh-ui-behind { gap: 0; }
.hh-ui-behind ~ .hh-ui-behind { padding: 16px; gap: 14px; background: var(--hh-canvas); }
.hh-ui-replay-bar { margin: 10px 12px; }
.hh-ui-notes { padding: 10px 12px; }
.hh-ui-panel { width: auto; margin: 12px; border-width: 2px; border-radius: 6px; box-shadow: 0 10px 30px ${X("--hh-sc-ink", 70)}; }
.hh-ui-panel-head h4 { font-family: var(--hh-font-serif); font-size: 1.375rem; }

.hh-ui-toolbar { padding: 10px 12px; gap: 6px 8px; }
.hh-ui-toolbar .hh-ui-mansion-name { flex: 0 1 auto; margin-right: auto; padding: 3px 12px; font-size: 1rem; line-height: 1.3;
  color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 2px solid var(--hh-sc-ink); border-radius: 4px; }
.hh-ui-toolbar .hh-ui-mansion-name .hh-ui-muted { display: inline; color: var(--hh-sc-ink); font-family: var(--hh-font-serif);
  font-size: 0.8125rem; font-weight: 400; }
.hh-ui-toolbar .hh-ui-needs, .hh-ui-toolbar .hh-ui-toggle, .hh-ui-toolbar .hh-ui-status > summary {
  font-family: var(--hh-font-serif); font-size: 0.875rem; font-weight: 700; color: var(--hh-sc-ink); background: var(--hh-sc-balloon);
  border: 2px solid var(--hh-sc-ink); border-radius: 999px; padding: 2px 12px; box-shadow: none; }
.hh-ui-toolbar .hh-ui-needs { background: var(--hh-sc-lamp); border-color: var(--hh-sc-ink); }
.hh-ui-toolbar .hh-ui-needs svg, .hh-ui-toolbar .hh-ui-needs[data-count='0'] svg { color: var(--hh-sc-ink); }
.hh-ui-toolbar .hh-ui-needs[data-count='0'] { background: var(--hh-sc-balloon); color: var(--hh-sc-ink); border-style: dashed; border-width: 2px; }
.hh-ui-toolbar .hh-ui-toggle[aria-pressed='true'] { background: var(--hh-sc-brass); border-style: double; border-width: 4px; padding: 0 10px; }
.hh-ui-toolbar [aria-disabled='true'] { color: var(--hh-sc-ink); }
.hh-ui-toolbar .hh-ui-needs:focus-visible, .hh-ui-toolbar .hh-ui-toggle:focus-visible, .hh-ui-toolbar .hh-ui-status > summary:focus-visible {
  outline: 3px solid var(--hh-sc-lamp); outline-offset: 2px; }
.hh-ui-toolbar .hh-ui-reason { padding: 2px 10px; color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border-radius: 4px; }
.hh-ui-toolbar .hh-ui-status-body { color: var(--hh-text); background: var(--hh-surface); border: 2px solid var(--hh-sc-ink); }
.hh-ui-needs-list { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* The walk-in room, top to bottom: the painted room, the labels of its working things, its name plate, and the apron. */
.hh-stage-room { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: 'scene' 'labels' 'title' 'apron';
  min-width: 0; background: var(--hh-sc-poche); }
.hh-stage-room-title { grid-area: title; justify-self: start; margin: 10px 12px 0; padding: 2px 12px; font-size: 0.9375rem;
  color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 2px solid var(--hh-sc-ink); border-radius: 4px; }
.hh-stage-room-scene { grid-area: scene; position: relative; min-width: 0; width: 100%; aspect-ratio: ${gl} / 750; overflow: hidden; background: var(--hh-sc-poche); }
.hh-stage-room-scene::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at 50% 46%, transparent 52%, ${X("--hh-sc-ink", 62)} 100%); }
.hh-stage-spots { position: absolute; inset: 0; pointer-events: none; }
/* Each spot and figure is placed by the layout table (core/guide-layout.ts), in percent of the room. */
.hh-stage-spot, .hh-stage-figure { position: absolute; display: block; pointer-events: auto; cursor: pointer; }
.hh-stage-spot:hover { background: ${X("--hh-sc-moon", 14)}; outline: 2px solid var(--hh-sc-moon); outline-offset: -2px; border-radius: 4px; }
.hh-stage-figure .hh-paint-spectre { filter: drop-shadow(0 0 10px var(--hh-sc-ecto)); }
.hh-stage-figure[data-ghost='waiting'] .hh-paint-spectre { filter: drop-shadow(0 0 12px var(--hh-sc-lamp)); }
.hh-stage-figure[data-ghost='failed'] .hh-paint-spectre { filter: drop-shadow(0 0 10px var(--hh-sc-cloth)); }
.hh-stage-figure[data-ghost='blocked'] .hh-paint-spectre { filter: none; }
.hh-stage-figure:hover .hh-paint-spectre { filter: drop-shadow(0 0 16px var(--hh-sc-moon)); }
.hh-stage-spot[data-label]:hover::after, .hh-stage-figure[data-label]:hover::after { content: attr(data-label); position: absolute; left: 50%; bottom: 100%;
  translate: -50% -4px; padding: 2px 10px; font-family: var(--hh-font-serif); font-size: 0.8125rem; font-weight: 700; white-space: nowrap;
  color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 4px; }
.hh-stage-spot[data-spot='door']:hover::after, .hh-stage-spot[data-spot='next']:hover::after { left: auto; right: 0; translate: 0 -4px; }
.hh-stage-spot[data-spot='previous']:hover::after { left: 0; translate: 0 -4px; }

/* The labels of the working things. On a narrow page they are a plain list under the room. */
.hh-stage-labels { grid-area: labels; list-style: none; margin: 0; padding: 8px 12px 0; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.hh-stage-label { font: inherit; font-family: var(--hh-font-serif); font-size: 0.8125rem; font-weight: 700; line-height: 1.25; text-align: left;
  color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 4px; padding: 2px 10px; cursor: pointer;
  overflow-wrap: anywhere; }
.hh-stage-label:hover { background: var(--hh-sc-brass); }
.hh-stage-label:focus-visible { outline: 3px solid var(--hh-sc-lamp); outline-offset: 2px; }

/* The apron: the Warden's balloon, the guide's settings and the Warden. None of it lies over the room. */
.hh-stage-apron { grid-area: apron; display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 8px; padding: 8px 12px 12px; min-width: 0; }
${Ft}/* The map is always on the page of a narrow layout, so there is nothing to put away there. */
.hh-stage-setting[data-map-toggle] { display: none; }
.hh-stage-settings { display: flex; flex-wrap: wrap; gap: 6px 8px; min-width: 0; }

.hh-stage-keeper { display: flex; align-items: flex-end; gap: 10px; min-width: 0; }
.hh-stage-caption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.hh-stage-warden { position: relative; display: block; flex: none; width: clamp(56px, 18vw, 96px); aspect-ratio: 200 / 300; }
.hh-stage-pose { margin: 0; font-family: var(--hh-font-serif); font-size: 0.8125rem; line-height: 1.3; color: var(--hh-sc-ink); }
.hh-stage-exit { display: inline-flex; align-items: center; gap: 4px; font: inherit; font-family: var(--hh-font-serif); font-weight: 700;
  font-size: 0.8125rem; color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 3px;
  padding: 1px 12px; cursor: pointer; }
.hh-stage-exit:focus-visible { outline: 3px solid var(--hh-sc-lamp); outline-offset: 2px; }

.hh-sf-none { fill: none; }
.hh-sf-wood { fill: var(--hh-sc-wood); }
.hh-sf-wood-dark { fill: var(--hh-sc-wood-dark); }
.hh-sf-brass { fill: var(--hh-sc-brass); }
.hh-sf-cloth { fill: var(--hh-sc-cloth); }
.hh-sf-paper { fill: var(--hh-sc-paper); }
.hh-sf-bone { fill: var(--hh-sc-bone); }
.hh-sf-moon { fill: var(--hh-sc-moon); }
.hh-sf-lamp { fill: var(--hh-sc-lamp); }
.hh-sf-ecto { fill: var(--hh-sc-ecto); }
.hh-sf-ink { fill: var(--hh-sc-ink); }
.hh-sf-roof { fill: var(--hh-sc-roof); }
.hh-sf-sheet { fill: var(--hh-sc-wall-drafting); }
.hh-sf-wall-attic { fill: var(--hh-sc-wall-attic); }
.hh-sf-glass { fill: ${Y("--hh-sc-sheet-ink", 38)}; }
.hh-stage-yard-art .hh-sf-ink, .hh-stage-sky-art .hh-sf-ink { fill: var(--hh-sc-sheet-ink); }

@media (max-width: 640px) {
  .hh-ui { --hh-room-h: clamp(140px, 46vw, 220px); }
  .hh-ui-house { padding: 8px; }
}

@media (min-width: 900px) {
  .hh-ui { --hh-depth: 170px; --hh-room-h: clamp(150px, 15.5vw, 230px); }
  .hh-ui-house { padding: 20px 7% 14px; perspective: 1500px; perspective-origin: 50% 46%; }
  .hh-stage-roof-art { display: block; width: 106%; margin: 0 -3% -3px; aspect-ratio: 400 / 70; }
  .hh-stage-sky-art { display: block; position: absolute; top: 6px; right: 8px; width: 30%; }
  .hh-stage-yard-art { display: block; width: 114%; margin: 0 -7%; aspect-ratio: 400 / 60; }
  .hh-stage-titleblock { display: grid; position: absolute; right: 10px; bottom: 10px; margin: 0; font-family: var(--hh-font-label);
    font-size: 0.75rem; line-height: 1.3; color: var(--hh-sc-sheet-ink); border: 1px solid var(--hh-sc-sheet-ink); background: var(--hh-sc-sheet); }
  .hh-stage-titleblock span { padding: 2px 8px; border-top: 1px solid var(--hh-sc-sheet-ink); }
  .hh-stage-titleblock span:first-child { border-top: 0; }
  .hh-ui-rooms { padding: 0; gap: 8px; border: 8px solid var(--hh-sc-poche); border-top-width: 8px; border-bottom-width: 10px; border-radius: 0 0 3px 3px;
    background: none; transform-style: preserve-3d; }
  .hh-ui-rooms::before { content: ''; position: absolute; inset: -8px; background: var(--hh-sc-poche);
    transform: translateZ(calc(-1 * var(--hh-depth) - 2px)); }
  .hh-ui-room-cell, .hh-ui-room-cell[data-locked='true'] { border-width: 0; border-radius: 0; background: none; transform-style: preserve-3d; }
  .hh-ui-room-cell[data-needs='true'] { border-top-width: 6px; }
  .hh-ui-room-cell, .hh-ui-room-cell[data-room='attic'] { grid-template-rows: minmax(var(--hh-room-h), 1fr) auto; grid-template-columns: minmax(0, 1fr); }
  .hh-ui-room-scene { height: auto; perspective: none; transform-style: preserve-3d; }
  .hh-ui-room-cell[data-room='attic'] { grid-template-rows: minmax(calc(var(--hh-room-h) * 0.8), 1fr) auto; }
  .hh-ui-room-cell[data-room='attic'] .hh-ui-room-scene { width: 100%; }
  .hh-ui-room-control .hh-ui-state[data-field='door'], .hh-ui-room-control .hh-ui-state[data-field='ghost'] {
    position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .hh-ui-view-toggle { display: inline-flex; }
  /* The room is sized as one length (--hh-scene-w), so that it and what stands under it fit one window, and so the
     Warden and the sheets laid over the room can be sized from it. How much the page has above the room
     (--hh-scene-top) and how tall the toolbar has wrapped (--hh-toolbar-h) are measured (use-stage-metrics.ts);
     the values here stand until then. The same lengths are in core/guide-layout.ts (stageFit). */
  .hh-ui { container-type: inline-size; grid-template-columns: minmax(0, 1fr); justify-items: center; --hh-scene-top: 7rem; --hh-toolbar-h: 3.4rem;
    --hh-scene-w: min(100cqw, max(${Sl.sceneMinStacked}rem, calc((100vh - var(--hh-scene-top) - ${Sl.apron}rem) * ${Vl})));
    --hh-stage-w: var(--hh-scene-w); --hh-scene-h: calc(var(--hh-scene-w) * ${Bl}); }
  .hh-ui[data-mode='replay'] { --hh-scene-top: 14rem; }
  /* The toolbar, the room and the notes sit on the house's own grid, so the open sheet can share the room's row. */
  .hh-ui > .hh-ui-behind:first-of-type { display: contents; }
  .hh-ui > .hh-ui-behind:first-of-type > * { width: var(--hh-stage-w); grid-column: 1; }
  .hh-ui-replay-bar { grid-row: 1; margin: 10px 0 0; }
  .hh-ui-replay-head { grid-row: 1; margin: 10px 0 0; }
  .hh-ui-replay-head > .hh-ui-replay-bar { margin: 0; }
  /* The toolbar is one row of its own above the room: nothing of it lies on the painting. */
  .hh-ui-toolbar { grid-row: 2; align-self: end; z-index: 5; }
  .hh-stage-room { grid-row: 3; }
  .hh-ui-notes { grid-row: 4; }
  .hh-ui-announcer { grid-row: 5; }
  /* The labels lie over the room, each above its object. An absolutely placed grid child is placed against its
     grid area, so the list is given the room's area: against its own, it would lie under the room, over the apron. */
  .hh-stage-labels { grid-area: scene; position: absolute; z-index: 2; left: 0; top: 0; width: var(--hh-scene-w); aspect-ratio: ${gl} / 750; padding: 0;
    display: block; pointer-events: none; }
  .hh-stage-label-place { position: absolute; padding-bottom: 4px; pointer-events: auto; }
  .hh-stage-label-place[data-anchor='centre'] { translate: -50% 0; }
  .hh-stage-label-place[data-raised='true'] { translate: -50% -1.9rem; }
  /* On a small room the labels are set a little smaller, so two that stand close (the ledger and the bell) do not touch. */
  .hh-stage-label { white-space: nowrap; font-size: clamp(0.6875rem, calc(var(--hh-scene-w) * 0.0118), 0.8125rem); padding: 1px 8px; }
  .hh-stage-setting[data-map-toggle] { display: inline-flex; }
  /* The Warden stands at the right end of the apron, twice a ghost's height: his width is WARDEN_WIDTH percent of the
     room's width, at his drawing's proportions. The apron is kept tall enough that he rises into the room only inside
     the Guide Reserve. */
  .hh-stage-apron { padding-right: calc(var(--hh-scene-w) * ${(yl + 4) / 100}); min-height: calc(var(--hh-scene-w) * 0.085 + 4.5rem); }
  .hh-guide-balloon { grid-column: 1; grid-row: 1; align-self: start;
    max-height: max(15rem, calc(100vh - var(--hh-scene-top) - var(--hh-scene-h) - 6.5rem)); }
  .hh-guide-body { overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--hh-sc-ink) transparent; }
  .hh-stage-settings { grid-column: 1; grid-row: 2; align-self: start; }
  .hh-stage-room[data-quiet='true'] .hh-stage-settings { grid-row: 1; }
  .hh-guide-balloon::after { content: ''; position: absolute; right: -11px; bottom: 30px; width: 18px; aspect-ratio: 1; background: var(--hh-sc-balloon);
    border-top: 2px solid var(--hh-sc-ink); border-right: 2px solid var(--hh-sc-ink); transform: rotate(45deg); }
  .hh-stage-keeper { position: absolute; z-index: 3; right: calc(var(--hh-scene-w) * 0.016); bottom: 8px; width: calc(var(--hh-scene-w) * ${yl / 100});
    display: grid; justify-items: center; gap: 3px; text-align: center; }
  .hh-stage-caption { justify-content: center; }
  .hh-stage-warden { width: 100%; }
  /* The open sheet and the map of the whole house lie over the left of the room: under the toolbar's tags, however
     many rows they take, and inside the room, so neither reaches the name plate, the balloon or the Guide Reserve. */
  .hh-ui-panel[data-mode='region'], .hh-ui > .hh-ui-behind ~ .hh-ui-behind { grid-row: 3; grid-column: 1; align-self: start; justify-self: start;
    margin: 12px 0 0 calc((100cqw - var(--hh-stage-w)) / 2 + var(--hh-scene-w) * ${Hl});
    max-height: calc(var(--hh-scene-h) - 1.5rem); min-height: 10rem; overflow-y: auto; }
  .hh-ui-panel[data-mode='region'] { z-index: 4; width: calc(var(--hh-scene-w) * ${Wl}); max-width: 54rem; }
  /* The map is laid over the room on request, and put away again. */
  .hh-ui > .hh-ui-behind ~ .hh-ui-behind { z-index: 6; width: calc(var(--hh-scene-w) * ${Ul});
    border: 2px solid var(--hh-sc-ink); border-radius: 6px; box-shadow: 0 14px 40px ${X("--hh-sc-ink", 80)}; }
  .hh-ui[data-map='closed'] > .hh-ui-behind ~ .hh-ui-behind:not(:focus-within) { position: absolute; width: 1px; height: 1px; min-height: 0; margin: -1px; padding: 0; border: 0;
    overflow: hidden; clip-path: inset(50%); }
  .hh-ui-door-control .hh-ui-door-words { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .hh-ui-house[data-view='turned'] { perspective-origin: 30% 44%; }
  .hh-ui-house[data-view='turned'] .hh-ui-rooms, .hh-ui-house[data-view='turned'] .hh-stage-roof-art { transform: rotateY(16deg); transform-origin: 50% 50%; }
}

/* A window too short for the balloon to lie under the room: the room takes the height and the Warden's balloon stands
   beside it. The shell asks for this layout where it gives the larger room (core/guide-layout.ts, stageFit). */
@media (min-width: 900px) {
  .hh-ui[data-layout='side'] {
    --hh-fit-w: max(${Sl.sceneMinSide}rem, min(calc((100vh - var(--hh-scene-top) - ${Sl.strip}rem) * ${Vl}), calc((100vh - var(--hh-scene-top)) / ${Bl + Cl})));
    --hh-guide-w: clamp(${Sl.guideMin}rem, calc(100cqw - 12px - var(--hh-fit-w)), ${Sl.guideMax}rem);
    --hh-scene-w: min(calc(100cqw - var(--hh-guide-w) - 12px), var(--hh-fit-w));
    --hh-stage-w: calc(var(--hh-scene-w) + var(--hh-guide-w) + 12px); }
  /* Two columns that do not push each other. Left: the room, and under it a strip with the guide's settings. Right:
     the room's name plate, the balloon and the words beside the Warden. The first two rows are exactly as tall as
     the room, so a tall balloon grows down past the strip and never opens a gap under the room. The strip and the
     last row together are tall enough that the Warden, whose head rises into the Guide Reserve, has floor to stand on. */
  .hh-ui[data-layout='side'] .hh-stage-room { grid-template-columns: var(--hh-scene-w) var(--hh-guide-w); column-gap: 12px;
    grid-template-rows: 2.75rem calc(var(--hh-scene-h) - 2.75rem) minmax(calc(var(--hh-scene-w) * ${Cl} - 2.4rem), auto) auto;
    grid-template-areas: 'scene title' 'scene balloon' 'settings balloon' '. caption'; }
  .hh-ui[data-layout='side'] .hh-stage-room-scene { align-self: start; }
  .hh-ui[data-layout='side'] .hh-stage-room-title { align-self: start; margin: 10px 0 0; }
  .hh-ui[data-layout='side'] .hh-stage-apron, .hh-ui[data-layout='side'] .hh-stage-keeper { display: contents; }
  /* The balloon rises from where he stands. It may be as tall as the window has room for; past that it scrolls inside. */
  .hh-ui[data-layout='side'] .hh-guide-balloon { grid-area: balloon; align-self: end; margin: 0 10px 0 0; max-height: max(12rem, calc(100vh - var(--hh-scene-top) - 6rem)); }
  .hh-ui[data-layout='side'] .hh-guide-balloon::after { right: auto; left: -11px; bottom: 3.5rem; border-top: 0; border-right: 0; border-left: 2px solid var(--hh-sc-ink);
    border-bottom: 2px solid var(--hh-sc-ink); }
  .hh-ui[data-layout='side'] .hh-guide-options { grid-template-columns: minmax(0, 1fr); }
  .hh-ui[data-layout='side'] .hh-stage-settings { grid-area: settings; align-self: start; margin: 10px calc(var(--hh-scene-w) * ${(yl + 4) / 100}) 8px 12px; }
  /* He stands in the room's own corner, in front of the right end of the desk: his head at the top of the Guide Reserve. */
  .hh-ui[data-layout='side'] .hh-stage-warden { position: absolute; z-index: 3; left: calc(var(--hh-scene-w) * ${(100 - yl - 1.2) / 100});
    top: calc(var(--hh-scene-h) * ${xl.top / 100} + 2px); width: calc(var(--hh-scene-w) * ${yl / 100}); }
  .hh-ui[data-layout='side'] .hh-stage-caption { grid-area: caption; align-self: end; justify-content: flex-start; margin: 6px 10px 8px 0; }
}

@keyframes hh-stage-hover { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } }
@keyframes hh-stage-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.72; } }
@media (prefers-reduced-motion: no-preference) {
  .hh-ui[data-motion='low-frequency'] .hh-stage-leaf { transition: transform ${zl}s cubic-bezier(0.3, 0.1, 0.2, 1); }
  .hh-ui[data-motion='low-frequency'] .hh-ui-rooms, .hh-ui[data-motion='low-frequency'] .hh-stage-roof-art { transition: transform 1.4s cubic-bezier(0.3, 0.1, 0.2, 1); }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='idle'] { animation: hh-stage-hover 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='working'] { animation: hh-stage-hover 2.4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='waiting'] { animation: hh-stage-hover 3s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='done'] { animation: hh-stage-hover 6s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage[data-lit='true'] .hh-stage-glow { animation: hh-stage-breathe 5s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-eyes { animation: hh-stage-breathe 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-mist { animation: hh-stage-breathe 7s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-figure .hh-paint-spectre { animation: hh-stage-hover 4s ease-in-out infinite; }
}
`, Kl = "Something else…", ql = "Step back", Jl = "The Warden stops talking. Every control and the house map still work.", Yl = "What the words mean";
function Xl({ option: e, words: t, onPress: n, pressesOf: r }) {
	let a = i(), o = i(), s = t === "with-kiro" && e.term != null ? Hs(e.term).kiro : null;
	return /* @__PURE__ */ I("li", { children: /* @__PURE__ */ L("button", {
		type: "button",
		className: "hh-guide-option",
		"data-guide-option": e.id,
		"data-kind": e.kind,
		"data-presses": r?.(e),
		"aria-labelledby": a,
		"aria-describedby": o,
		onClick: (t) => n(e, t.currentTarget),
		children: [/* @__PURE__ */ I("span", {
			className: "hh-guide-bullet",
			"aria-hidden": "true"
		}), /* @__PURE__ */ L("span", {
			className: "hh-guide-option-words",
			children: [/* @__PURE__ */ L("span", {
				className: "hh-guide-option-label",
				id: a,
				children: [e.label, s === null ? null : /* @__PURE__ */ L(F, { children: [" ", /* @__PURE__ */ L("span", {
					className: "hh-guide-kiro",
					children: [
						"(",
						s,
						")"
					]
				})] })]
			}), /* @__PURE__ */ I("span", {
				className: "hh-guide-consequence",
				id: o,
				children: e.consequence
			})]
		})]
	}) });
}
function Zl({ id: e }) {
	let [t, n] = l(!1), r = i(), a = Hs(e);
	return /* @__PURE__ */ L("span", {
		className: "hh-guide-term",
		"data-term": e,
		children: [/* @__PURE__ */ L("button", {
			type: "button",
			className: "hh-guide-what",
			"aria-expanded": t,
			"aria-controls": t ? r : void 0,
			onClick: () => n((e) => !e),
			children: [
				"What is “",
				a.plain,
				"”?"
			]
		}), t ? /* @__PURE__ */ L("span", {
			className: "hh-guide-about",
			id: r,
			children: [
				a.about[0],
				" ",
				a.about[1]
			]
		}) : null]
	});
}
function Ql({ view: e, words: t, onPress: n, onStepBack: a, refusal: o = null, pressesOf: s, statusRef: u, children: d }) {
	let [f, p] = l(!1), g = i(), _ = i(), v = c(null), y = u ?? v, b = e.terms ?? [], x = e.note ?? null, S = new Set(e.options.map((e) => e.id)), C = e.everything.filter((e) => !S.has(e.id)), w = c(null);
	r(() => {
		let e = w.current;
		if (e === null || e.isConnected) return;
		w.current = null;
		let t = document.activeElement;
		(t === null || t === document.body) && y.current?.focus();
	});
	let T = (e, t) => {
		w.current = t, n(e, t);
	};
	return /* @__PURE__ */ L("div", {
		className: "hh-guide-balloon",
		"data-guide-balloon": !0,
		"data-status": e.statusKind,
		children: [/* @__PURE__ */ L("div", {
			className: "hh-guide-head",
			children: [
				/* @__PURE__ */ I("p", {
					className: "hh-guide-status",
					"data-guide-text": !0,
					tabIndex: -1,
					ref: y,
					children: e.status
				}),
				b.length === 0 ? null : /* @__PURE__ */ I("p", {
					className: "hh-guide-terms",
					children: b.map((e) => /* @__PURE__ */ I(Zl, { id: e }, e))
				}),
				x === null ? null : /* @__PURE__ */ I("p", {
					className: "hh-guide-note",
					"data-guide-note": !0,
					children: x
				}),
				o === null ? null : /* @__PURE__ */ I("p", {
					className: "hh-guide-note",
					"data-guide-refusal": !0,
					children: o
				}),
				e.question === null ? null : /* @__PURE__ */ I("p", {
					className: "hh-guide-question",
					children: e.question
				})
			]
		}), /* @__PURE__ */ L("div", {
			className: "hh-guide-body",
			children: [
				d,
				e.options.length === 0 ? null : /* @__PURE__ */ I("ul", {
					className: "hh-guide-options",
					"data-guide-primary": !0,
					children: e.options.map((e) => /* @__PURE__ */ I(Xl, {
						option: e,
						words: t,
						onPress: T,
						pressesOf: s
					}, e.id))
				}),
				/* @__PURE__ */ L("div", {
					className: "hh-guide-foot",
					children: [
						/* @__PURE__ */ L("button", {
							type: "button",
							className: "hh-guide-foot-button",
							"data-guide-more": !0,
							"aria-expanded": f,
							"aria-controls": f ? g : void 0,
							onClick: () => p((e) => !e),
							children: [I(f ? m : h, {
								size: 14,
								"aria-hidden": !0
							}), Kl]
						}),
						/* @__PURE__ */ I("button", {
							type: "button",
							className: "hh-guide-foot-button",
							"data-guide-step-back": !0,
							"aria-describedby": _,
							onClick: a,
							children: ql
						}),
						/* @__PURE__ */ I("span", {
							className: "hh-guide-hidden",
							id: _,
							children: Jl
						})
					]
				}),
				f ? /* @__PURE__ */ L("div", {
					className: "hh-guide-everything",
					id: g,
					"data-guide-everything": !0,
					children: [
						C.length === 0 ? null : /* @__PURE__ */ I("ul", {
							className: "hh-guide-options",
							children: C.map((e) => /* @__PURE__ */ I(Xl, {
								option: e,
								words: t,
								onPress: T,
								pressesOf: s
							}, e.id))
						}),
						/* @__PURE__ */ I("p", {
							className: "hh-guide-book-title",
							children: Yl
						}),
						/* @__PURE__ */ I("dl", {
							className: "hh-guide-book",
							"data-word-book": !0,
							children: zs.map((e) => /* @__PURE__ */ L("div", {
								"data-term": e.id,
								children: [/* @__PURE__ */ L("dt", { children: [
									e.plain,
									" ",
									/* @__PURE__ */ L("span", {
										className: "hh-guide-kiro",
										children: [
											"(Kiro: ",
											e.kiro,
											")"
										]
									})
								] }), /* @__PURE__ */ L("dd", { children: [
									e.about[0],
									" ",
									e.about[1]
								] })]
							}, e.id))
						})
					]
				}) : null
			]
		})]
	});
}
// src/components/ObjectLabels.tsx
var $l = "Things you can press in this room";
function eu(e) {
	let t = e.left + e.width / 2, n = `${100 - e.top}%`;
	return t < 20 ? {
		anchor: "left",
		style: {
			left: `${e.left}%`,
			bottom: n
		}
	} : t > 80 ? {
		anchor: "right",
		style: {
			right: `${100 - e.left - e.width}%`,
			bottom: n
		}
	} : {
		anchor: "centre",
		style: {
			left: `${t}%`,
			bottom: n
		}
	};
}
function tu({ objects: e, onPress: t }) {
	return /* @__PURE__ */ I("ul", {
		className: "hh-stage-labels",
		"data-object-labels": !0,
		"aria-label": $l,
		children: e.map((e) => {
			let n = eu(e.box);
			return /* @__PURE__ */ I("li", {
				className: "hh-stage-label-place",
				"data-anchor": n.anchor,
				"data-raised": e.key === "door-2",
				style: n.style,
				children: /* @__PURE__ */ I("button", {
					type: "button",
					className: "hh-stage-label",
					"data-object-label": e.key,
					"data-kind": e.kind,
					"aria-label": e.name,
					onClick: (n) => t(e.steps, n.currentTarget),
					children: e.label
				})
			}, e.key);
		})
	});
}
// src/components/RoomStage.tsx
var nu = "Fright", ru = "Calm, Eerie or Dread: how dark and frightening the house is drawn. It changes nothing else.", iu = "Call the Warden", au = "He says what is going on in this room and lists what you can do.", ou = "Guide settings", su = "House map", cu = "Show Kiro's words", lu = "Show me what I can press";
function uu(e) {
	return {
		left: `${e.left}%`,
		top: `${e.top}%`,
		width: `${e.width}%`,
		height: `${e.height}%`
	};
}
var du = ["ledger", "bell"];
function fu({ projection: e, roomId: t, view: n, words: r, quiet: a = !1, settings: o, open: s = !1, onPress: c, onStepBack: l, onCallWarden: u, onReturn: d, refusal: f = null, statusRef: p, motion: m = "none" }) {
	let h = i(), g = i(), _ = e.rooms.find((e) => e.roomId === t);
	if (_ === void 0) return null;
	let v = _.ghosts.some((e) => e.state === "working" || e.state === "waiting"), [y, b] = _.doors, x = Ll(_, n, r, e.needsYou.length), S = Nr(o.fright, m), C = o.fright !== "calm", T = Or(_), E = jr(e).stance, D = y?.state === "waiting" ? "side" : b?.state === "waiting" ? "back" : null, O = (e) => {
		let t = e.kind === "ghost" ? _.ghosts.find((t) => `ghost:${t.ghostId}` === e.key) : void 0;
		return t === void 0 ? /* @__PURE__ */ I("span", {
			className: "hh-stage-spot",
			"data-spot": e.key,
			"data-label": e.label,
			style: uu(e.box),
			onClick: () => c(e.steps)
		}, e.key) : /* @__PURE__ */ I("span", {
			className: "hh-stage-figure",
			"data-ghost": t.state,
			"data-label": e.label,
			style: uu(e.box),
			onClick: () => c(e.steps),
			children: I(C ? nn : Xn, {
				state: t.state,
				role: Wn(t.ghostId)
			})
		}, e.key);
	};
	return /* @__PURE__ */ L("div", {
		className: "hh-stage-room",
		"data-stage-room": t,
		"data-open": s,
		"data-quiet": a,
		"data-reveal": o.reveal,
		"data-light": C ? T : void 0,
		"data-stance": E,
		children: [
			/* @__PURE__ */ L("h3", {
				className: "hh-stage-room-title",
				"data-stage-title": !0,
				children: ["You are in the ", _.name]
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-stage-room-scene",
				children: [
					/* @__PURE__ */ I(Vn, {
						room: t,
						door: y === void 0 ? null : y.state,
						secondDoor: b === void 0 ? null : b.state,
						lit: v,
						hasPrevious: n.previous !== null,
						hasNext: n.next !== null,
						dread: C ? { webs: Mr(_) } : void 0
					}),
					/* @__PURE__ */ I("div", {
						className: "hh-stage-spots",
						"aria-hidden": "true",
						children: x.filter((e) => !du.includes(e.kind)).map(O)
					}),
					/* @__PURE__ */ I(Hn, {}),
					/* @__PURE__ */ I(Kt, {
						light: T,
						leakAt: D,
						effects: S
					}),
					/* @__PURE__ */ I(qt, { effects: S }),
					C ? /* @__PURE__ */ I(Yt, { stance: E }) : null,
					/* @__PURE__ */ I("div", {
						className: "hh-stage-spots",
						"aria-hidden": "true",
						children: x.filter((e) => du.includes(e.kind)).map(O)
					})
				]
			}),
			o.reveal ? /* @__PURE__ */ I(tu, {
				objects: x,
				onPress: c
			}) : null,
			/* @__PURE__ */ L("div", {
				className: "hh-stage-apron",
				"data-stage-apron": !0,
				children: [
					a ? null : /* @__PURE__ */ I(Ql, {
						view: n,
						words: r,
						onPress: (e, t) => c(e.steps, t),
						onStepBack: l,
						refusal: f,
						pressesOf: (e) => Zs(e.steps).join(" "),
						statusRef: p
					}),
					/* @__PURE__ */ L("div", {
						className: "hh-stage-settings",
						role: "group",
						"aria-label": ou,
						"data-guide-settings": !0,
						children: [
							/* @__PURE__ */ L("button", {
								type: "button",
								className: "hh-stage-setting",
								"data-map-toggle": !0,
								"aria-pressed": o.mapOpen,
								onClick: o.onToggleMap,
								children: [
									/* @__PURE__ */ I(ee, {
										size: 13,
										"aria-hidden": !0
									}),
									su,
									": ",
									o.mapOpen ? "open" : "closed"
								]
							}),
							/* @__PURE__ */ L("button", {
								type: "button",
								className: "hh-stage-setting",
								"data-words-toggle": !0,
								"aria-pressed": o.kiroWords,
								onClick: o.onToggleWords,
								children: [
									/* @__PURE__ */ I(k, {
										size: 13,
										"aria-hidden": !0
									}),
									cu,
									": ",
									o.kiroWords ? "on" : "off"
								]
							}),
							/* @__PURE__ */ L("button", {
								type: "button",
								className: "hh-stage-setting",
								"data-reveal-toggle": !0,
								"aria-pressed": o.reveal,
								onClick: o.onToggleReveal,
								children: [
									/* @__PURE__ */ I(ie, {
										size: 13,
										"aria-hidden": !0
									}),
									lu,
									": ",
									o.reveal ? "on" : "off"
								]
							}),
							/* @__PURE__ */ L("button", {
								type: "button",
								className: "hh-stage-setting",
								"data-fright-toggle": o.fright,
								"aria-describedby": g,
								onClick: o.onCycleFright,
								children: [
									/* @__PURE__ */ I(w, {
										size: 13,
										"aria-hidden": !0
									}),
									nu,
									": ",
									Er[o.fright]
								]
							}),
							/* @__PURE__ */ I("span", {
								className: "hh-guide-hidden",
								id: g,
								children: ru
							})
						]
					}),
					/* @__PURE__ */ L("div", {
						className: "hh-stage-keeper",
						"data-guide-keeper": !0,
						children: [/* @__PURE__ */ I("span", {
							className: "hh-stage-warden",
							"aria-hidden": "true",
							children: /* @__PURE__ */ I(sr, { pose: n.pose })
						}), /* @__PURE__ */ L("div", {
							className: "hh-stage-caption",
							children: [
								/* @__PURE__ */ I("p", {
									className: "hh-stage-pose",
									"data-guide-pose": n.pose,
									children: n.poseLabel
								}),
								a ? /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ L("button", {
									type: "button",
									className: "hh-stage-call",
									"data-guide-call": !0,
									"aria-describedby": h,
									onClick: u,
									children: [/* @__PURE__ */ I(ne, {
										size: 13,
										"aria-hidden": !0
									}), iu]
								}), /* @__PURE__ */ I("span", {
									className: "hh-guide-hidden",
									id: h,
									children: au
								})] }) : null,
								d === void 0 ? null : /* @__PURE__ */ L("button", {
									type: "button",
									className: "hh-stage-exit",
									"data-guide-exit": !0,
									"aria-label": "Exit to the Foyer",
									onClick: d,
									children: [/* @__PURE__ */ I(M, {
										size: 13,
										"aria-hidden": !0
									}), "Exit"]
								})
							]
						})]
					})
				]
			})
		]
	});
}
// src/adapters/house-sound.ts
var pu = .12, mu = .5, hu = 1.5, gu = .22, _u = .16;
function vu(e, t, n, r, i, a = 0) {
	let o = e.ctx.createGain(), s = e.at + a;
	return o.gain.setValueAtTime(1e-4, s), o.gain.exponentialRampToValueAtTime(t, s + n), o.gain.setValueAtTime(t, s + n + r), o.gain.exponentialRampToValueAtTime(1e-4, s + n + r + i), o.connect(e.out), o;
}
function yu(e, t, n) {
	let r = e.ctx.createBufferSource();
	return r.buffer = e.noise, r.loop = !0, r.start(e.at + t), r.stop(e.at + t + n), r;
}
function bu(e, t, n, r) {
	let i = e.ctx.createOscillator();
	return i.type = t, i.start(e.at + n), i.stop(e.at + n + r), i;
}
function xu(e, t, n, r, i = .5, a = 0) {
	let o = e.at + a, s = bu(e, "sawtooth", a, t), c = Math.max(6, Math.round(t * 14));
	for (let e = 0; e <= c; e += 1) {
		let i = e / c, a = e % 2 == 0 ? 1 : .9;
		s.frequency.setValueAtTime((n + (r - n) * i ** 1.6) * a, o + i * t);
	}
	let l = bu(e, "square", a, t);
	l.frequency.setValueAtTime(34, o), l.frequency.exponentialRampToValueAtTime(11, o + t);
	let u = e.ctx.createGain();
	u.gain.value = .45;
	let d = vu(e, i, .05, t * .55, t * .4, a), f = e.ctx.createGain();
	f.gain.value = .55, l.connect(u).connect(f.gain);
	for (let [n, r] of [[760, 9], [1900, 12]]) {
		let i = e.ctx.createBiquadFilter();
		i.type = "bandpass", i.Q.value = r, i.frequency.setValueAtTime(n * .8, o), i.frequency.linearRampToValueAtTime(n * 1.25, o + t), s.connect(i).connect(f);
	}
	f.connect(d);
}
function Su(e, t, n = .9, r = 92) {
	let i = e.at + t, a = bu(e, "sine", t, .3);
	a.frequency.setValueAtTime(r, i), a.frequency.exponentialRampToValueAtTime(r * .45, i + .22), a.connect(vu(e, n, .004, .02, .2, t));
	let o = e.ctx.createBiquadFilter();
	o.type = "lowpass", o.frequency.value = 420, yu(e, t, .12).connect(o).connect(vu(e, n * .5, .003, .01, .08, t));
}
function Cu(e, t) {
	let n = e.at, r = e.ctx.createBiquadFilter();
	r.type = "bandpass", r.Q.value = 2.2, r.frequency.setValueAtTime(260, n), r.frequency.exponentialRampToValueAtTime(1300, n + t * .45), r.frequency.exponentialRampToValueAtTime(380, n + t), yu(e, 0, t).connect(r).connect(vu(e, .5, t * .35, .05, t * .55));
	let i = bu(e, "sine", 0, t);
	i.frequency.setValueAtTime(330, n), i.frequency.linearRampToValueAtTime(495, n + t * .5), i.frequency.linearRampToValueAtTime(392, n + t), i.connect(vu(e, .12, t * .3, .1, t * .5));
}
function wu(e, t, n, r = .4, i = 1.1) {
	for (let [a, o] of [
		[1, 1],
		[2.76, .35],
		[5.4, .12]
	]) {
		let s = bu(e, "sine", n, i + .1);
		s.frequency.value = t * a, s.connect(vu(e, r * o, .004, .01, i * (a === 1 ? 1 : .5), n));
	}
}
function Tu(e) {
	let t = e.at, n = bu(e, "triangle", 0, .95);
	n.frequency.setValueAtTime(410, t), n.frequency.exponentialRampToValueAtTime(150, t + .9);
	let r = bu(e, "sine", 0, .95);
	r.frequency.value = 6;
	let i = e.ctx.createGain();
	i.gain.value = 14, r.connect(i).connect(n.frequency), n.connect(vu(e, .3, .06, .4, .45));
}
var Eu = {
	"door-open": (e) => {
		xu(e, 1.25, 96, 178), Su(e, 1.22, .3, 70);
	},
	"door-knock": (e) => {
		Su(e, 0, .8, 140), Su(e, .19, .7, 132), Su(e, .44, .9, 120);
	},
	"door-seal": (e) => {
		xu(e, .5, 170, 110, .35), Su(e, .48, .9, 84);
	},
	"door-slam": (e) => {
		Su(e, 0, 1, 76), Su(e, .07, .5, 58), xu(e, .3, 240, 200, .18, .12);
	},
	"ghost-wake": (e) => Cu(e, .95),
	"ghost-done": (e) => {
		wu(e, 659.25, 0, .32), wu(e, 987.77, .16, .26);
	},
	"ghost-fail": (e) => Tu(e),
	"needs-you": (e) => {
		wu(e, 783.99, 0, .3, .8), wu(e, 622.25, .22, .3, 1.2);
	},
	"panel-open": (e) => xu(e, .42, 130, 205, .3),
	"panel-close": (e) => Su(e, 0, .45, 110)
};
function Du() {
	if (typeof window > "u") return null;
	let e = window;
	return e.AudioContext ?? e.webkitAudioContext ?? null;
}
function Ou() {
	let e = Du();
	if (e === null) return null;
	let t;
	try {
		t = new e();
	} catch {
		return null;
	}
	let n = t.createGain();
	n.gain.value = gu, n.connect(t.destination);
	let r = t.createBuffer(1, t.sampleRate * 2, t.sampleRate), i = r.getChannelData(0);
	for (let e = 0; e < i.length; e += 1) i[e] = Math.random() * 2 - 1;
	let a = t.createBufferSource();
	a.buffer = r, a.loop = !0;
	let o = t.createBiquadFilter();
	o.type = "bandpass", o.Q.value = .9, o.frequency.value = 380;
	let s = t.createGain();
	s.gain.value = _u;
	let c = t.createOscillator();
	c.frequency.value = .07;
	let l = t.createGain();
	l.gain.value = 190;
	let u = t.createGain();
	u.gain.value = _u * .6, c.connect(l).connect(o.frequency), c.connect(u).connect(s.gain), a.connect(o).connect(s).connect(n), a.start(), c.start();
	let d = !1, f = t.createGain();
	f.gain.value = 1e-4;
	let p = t.createBiquadFilter();
	p.type = "lowpass", p.frequency.value = 240;
	for (let [e, n] of [[55, "sine"], [82.4, "triangle"]]) {
		let r = t.createOscillator();
		r.type = n, r.frequency.value = e, r.connect(p), r.start();
	}
	p.connect(f).connect(n);
	let m = null, h = (e) => {
		let n = Math.max(1, Math.round(t.sampleRate * 60 / e)), r = t.createBuffer(1, n, t.sampleRate), i = r.getChannelData(0), a = (e, r, a) => {
			let o = Math.round(e * t.sampleRate), s = Math.round(.16 * t.sampleRate);
			for (let e = 0; e < s && o + e < n; e += 1) {
				let n = e / t.sampleRate;
				i[o + e] += a * Math.sin(2 * Math.PI * r * n) * Math.exp(-n * 26);
			}
		};
		return a(0, 52, 1), a(.24, 44, .7), r;
	}, g = (e, n) => {
		let r = t.currentTime;
		e.gain.cancelScheduledValues(r), e.gain.setValueAtTime(Math.max(1e-4, e.gain.value), r), e.gain.exponentialRampToValueAtTime(Math.max(1e-4, n), r + hu);
	}, _ = () => {
		if (m === null) return;
		let e = m;
		m = null, g(e.level, 1e-4), e.source.stop(t.currentTime + hu + .1);
	};
	return {
		setDread: ({ drone: e, heartbeatBpm: r }) => {
			if (!d) try {
				if (g(f, e ? pu : 1e-4), r === null) {
					_();
					return;
				}
				if (m !== null && m.bpm === r) return;
				_();
				let i = t.createBufferSource();
				i.buffer = h(r), i.loop = !0;
				let a = t.createGain();
				a.gain.value = 1e-4, i.connect(a).connect(n), i.start(), g(a, mu), m = {
					source: i,
					level: a,
					bpm: r
				};
			} catch {}
		},
		play: (e) => {
			if (!d) try {
				t.state === "suspended" && t.resume(), Eu[e]({
					ctx: t,
					out: n,
					noise: r,
					at: t.currentTime + .02
				});
			} catch {}
		},
		close: () => {
			d || (d = !0, t.close().catch(() => void 0));
		}
	};
}
var ku = {
	open: "door-open",
	waiting: "door-knock",
	rejected: "door-slam",
	sealed: "door-seal"
}, Au = {
	working: "ghost-wake",
	done: "ghost-done",
	failed: "ghost-fail"
};
function ju(e, t) {
	if (e === null || e.mansionName !== t.mansionName) return [];
	let n = [], r = (e) => {
		e !== void 0 && !n.includes(e) && n.push(e);
	}, i = new Map(e.rooms.map((e) => [e.roomId, e]));
	for (let e of t.rooms) {
		let t = i.get(e.roomId);
		if (t !== void 0) for (let n of e.doors) {
			let e = t.doors.find((e) => e.phase === n.phase);
			e !== void 0 && e.state !== n.state && r(ku[n.state]);
		}
	}
	for (let e of t.rooms) {
		let t = i.get(e.roomId);
		if (t !== void 0) for (let n of e.ghosts) {
			let e = t.ghosts.find((e) => e.ghostId === n.ghostId);
			(e === void 0 ? n.state === "working" : e.state !== n.state) && r(Au[n.state]);
		}
	}
	return t.needsYou.length > e.needsYou.length && r("needs-you"), n.slice(0, 3);
}
function Mu(e, t, i = Ou, a = "calm") {
	let [o, s] = l(!1), [u, d] = l(!0), f = c(null), p = c([]), m = n(() => {
		for (let e of p.current) clearTimeout(e);
		p.current = [], f.current?.close(), f.current = null;
	}, []);
	r(() => m, [m]);
	let h = n((e) => {
		e.forEach((e, t) => {
			t === 0 ? f.current?.play(e) : p.current.push(setTimeout(() => f.current?.play(e), t * 420));
		});
	}, []), g = n(() => {
		if (f.current !== null) {
			m(), s(!1);
			return;
		}
		let e = i();
		e === null ? d(!1) : (f.current = e, s(!0), e.play("panel-open"));
	}, [i, m]), _ = c(null);
	r(() => {
		let t = _.current;
		_.current = e, f.current !== null && h(ju(t, e));
	}, [e, h]);
	let v = c(t);
	r(() => {
		let e = v.current;
		v.current = t, f.current !== null && e !== t && h([t === null ? "panel-close" : "panel-open"]);
	}, [t, h]);
	let y = e.needsYou.length;
	return r(() => {
		f.current?.setDread?.({
			drone: a !== "calm",
			heartbeatBpm: a === "calm" ? null : Pr(y)
		});
	}, [
		o,
		a,
		y
	]), {
		on: o,
		available: u,
		toggle: g
	};
}
// src/components/HouseToolbar.tsx
var Nu = "This browser cannot play the house sounds.", Pu = "Your browser asks for reduced motion, so the house is still either way.", Fu = t(function({ mansionName: e, needsYou: t, onNeedsYou: n, motion: r, onToggleStillHouse: a, status: o, sound: s, view: c }, l) {
	let u = i(), d = i(), p = Ms(t), m = t.length === 0;
	return /* @__PURE__ */ L("div", {
		className: "hh-ui-toolbar",
		"data-toolbar": !0,
		children: [
			/* @__PURE__ */ L("h2", {
				className: "hh-ui-mansion-name",
				ref: l,
				tabIndex: -1,
				children: [/* @__PURE__ */ I("span", {
					className: "hh-ui-muted",
					children: "Mansion "
				}), e]
			}),
			/* @__PURE__ */ L("button", {
				type: "button",
				className: "hh-ui-needs",
				"data-count": t.length,
				"data-opener-key": "needs-you",
				"aria-disabled": m,
				"aria-label": m ? `Needs you: ${p}.` : `Needs you: ${p}. Go to the first.`,
				onClick: (e) => {
					m || n(e.currentTarget);
				},
				children: [/* @__PURE__ */ I(f, {
					size: 16,
					"aria-hidden": !0
				}), p]
			}),
			/* @__PURE__ */ L("button", {
				type: "button",
				className: "hh-ui-toggle",
				"aria-pressed": r.stillHouse,
				"aria-describedby": r.prefersReducedMotion ? u : void 0,
				onClick: a,
				children: [
					/* @__PURE__ */ I(_e, {
						size: 16,
						"aria-hidden": !0
					}),
					"Still house: ",
					r.stillHouse ? "on" : "off"
				]
			}),
			r.prefersReducedMotion ? /* @__PURE__ */ I("span", {
				className: "hh-ui-reason",
				id: u,
				children: Pu
			}) : null,
			s === void 0 ? null : /* @__PURE__ */ L("button", {
				type: "button",
				className: "hh-ui-toggle",
				"data-sound-toggle": !0,
				"aria-pressed": s.on,
				"aria-disabled": !s.available || void 0,
				"aria-describedby": s.available ? void 0 : d,
				onClick: s.onToggle,
				children: [
					s.on ? /* @__PURE__ */ I(he, {
						size: 16,
						"aria-hidden": !0
					}) : /* @__PURE__ */ I(ge, {
						size: 16,
						"aria-hidden": !0
					}),
					"Sound: ",
					s.on ? "on" : "off"
				]
			}),
			s === void 0 || s.available ? null : /* @__PURE__ */ I("span", {
				className: "hh-ui-reason",
				id: d,
				children: Nu
			}),
			c === void 0 ? null : /* @__PURE__ */ L("button", {
				type: "button",
				className: "hh-ui-toggle hh-ui-view-toggle",
				"data-view-toggle": !0,
				"aria-pressed": c.turned,
				onClick: c.onToggle,
				children: [
					/* @__PURE__ */ I(ce, {
						size: 16,
						"aria-hidden": !0
					}),
					"Side view: ",
					c.turned ? "on" : "off"
				]
			}),
			o === void 0 ? null : /* @__PURE__ */ L("details", {
				className: "hh-ui-status",
				children: [/* @__PURE__ */ I("summary", { children: "System status" }), /* @__PURE__ */ I("div", {
					className: "hh-ui-status-body",
					children: o
				})]
			}),
			m ? null : /* @__PURE__ */ I("ul", {
				className: "hh-ui-needs-list",
				"aria-label": "Waiting on you",
				children: t.map((e) => /* @__PURE__ */ I("li", { children: e.label }, `${e.kind}:${e.id}`))
			})
		]
	});
});
// src/components/LiveAnnouncer.tsx
function Iu({ message: e, turn: t = 0 }) {
	return /* @__PURE__ */ I("p", {
		className: "hh-ui-announcer",
		"aria-live": "polite",
		"aria-atomic": "true",
		"data-announcer": !0,
		children: /* @__PURE__ */ I("span", { children: e }, t)
	});
}
// src/components/RoomPanelHost.tsx
function Lu(e) {
	return e.replace(/["\\]/g, "\\$&");
}
function Ru(e, t, i = null) {
	let [a, o] = l([]), s = c(a);
	s.current = a;
	let u = c(null), d = c(null), f = c(null), p = n((e, t, n = {}) => {
		let r = {
			surface: {
				target: e,
				openerKey: t?.getAttribute("data-opener-key") ?? Ls(e)
			},
			opener: t
		};
		u.current = {
			kind: "opened",
			focus: n.focus ?? { kind: "heading" }
		}, o((e) => n.placement === "push" ? [...e, r] : [r]);
	}, []), m = n(() => {
		let e = s.current, t = e[e.length - 1];
		t !== void 0 && (u.current = {
			kind: "restore",
			opener: t.opener,
			openerKey: t.surface.openerKey,
			target: t.surface.target
		}, o(e.slice(0, -1)));
	}, []), h = a.findIndex((t) => Rs(t.surface, e) === null);
	r(() => {
		if (h === -1) return;
		let e = s.current[h];
		e !== void 0 && (u.current = {
			kind: "restore",
			opener: e.opener,
			openerKey: e.surface.openerKey,
			target: e.surface.target
		}, o(s.current.slice(0, h)));
	}, [h]), r(() => {
		let e = u.current;
		if (e === null) return;
		u.current = null;
		let n = t.current;
		if (e.kind === "opened") {
			let t = e.focus.kind === "selector" ? f.current?.querySelector(e.focus.selector) : null;
			if (t != null && (t.hasAttribute("tabindex") || t.setAttribute("tabindex", "-1"), t.focus(), document.activeElement === t)) return;
			d.current?.focus();
		} else ((e.opener !== null && e.opener.isConnected ? e.opener : null) ?? n?.querySelector(`[data-opener-key="${Lu(e.openerKey)}"]`) ?? null ?? n?.querySelector(`[data-room-control="${Lu(e.target.roomId)}"]`) ?? null ?? n?.querySelector("[data-map-title]") ?? null)?.focus();
	}, [a, t]);
	let g = c(null);
	return r(() => {
		let e = g.current !== null && i === null;
		if (g.current = i, !e || s.current.length === 0) return;
		let t = document.activeElement;
		(t === null || t === document.body) && d.current?.focus();
	}, [i]), {
		top: a[a.length - 1]?.surface ?? null,
		depth: a.length,
		open: p,
		close: m,
		headingRef: d,
		panelRef: f
	};
}
var zu = "button, [href], input, select, textarea, summary, [tabindex]:not([tabindex=\"-1\"])";
function Bu({ id: e, title: t, mode: n, stack: r, closeLabel: i, children: a }) {
	let o = r.top;
	if (o === null) return null;
	let s = `${e}-title`, c = o.target, l = /* @__PURE__ */ L("section", {
		className: "hh-ui-panel",
		id: e,
		role: n === "dialog" ? "dialog" : "region",
		"aria-modal": n === "dialog" || void 0,
		"aria-labelledby": s,
		"data-mode": n,
		"data-surface": c.kind,
		"data-room-panel": c.kind === "room" ? c.roomId : void 0,
		"data-surface-room": c.roomId,
		"data-depth": r.depth,
		ref: r.panelRef,
		onKeyDown: (e) => {
			if (n !== "dialog" || e.key !== "Tab") return;
			let t = e.currentTarget, i = Array.from(t.querySelectorAll(zu)).filter((e) => !e.hasAttribute("disabled"));
			if (i.length === 0) return;
			let a = i[0], o = i[i.length - 1], s = document.activeElement;
			e.shiftKey && (s === a || s === r.headingRef.current) ? (e.preventDefault(), o.focus()) : !e.shiftKey && s === o && (e.preventDefault(), a.focus());
		},
		children: [/* @__PURE__ */ L("div", {
			className: "hh-ui-panel-head",
			children: [/* @__PURE__ */ I("h4", {
				id: s,
				ref: r.headingRef,
				tabIndex: -1,
				children: t
			}), /* @__PURE__ */ L("button", {
				type: "button",
				className: "hh-ui-panel-close",
				onClick: r.close,
				children: [/* @__PURE__ */ I(ve, {
					size: 16,
					"aria-hidden": !0
				}), i]
			})]
		}), /* @__PURE__ */ I("div", {
			className: "hh-ui-panel-body",
			children: a
		})]
	});
	return n === "dialog" ? /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("div", {
		className: "hh-ui-backdrop",
		"data-backdrop": !0,
		onClick: r.close
	}), l] }) : l;
}
var Vu = {
	map: "[data-map-toggle]",
	reveal: "[data-reveal-toggle]",
	"kiro-words": "[data-words-toggle]",
	"needs-you": "[data-opener-key=\"needs-you\"]",
	close: ".hh-ui-panel-close",
	exit: "[data-guide-exit]"
};
function Hu(e) {
	return e.replace(/["\\]/g, "\\$&");
}
function Uu(e) {
	switch (e.kind) {
		case "heading": return { kind: "heading" };
		case "proposal": return {
			kind: "selector",
			selector: `[data-proposal="${Hu(e.proposalId)}"]`
		};
		case "section": return {
			kind: "selector",
			selector: `[data-section="${Hu(e.section)}"]`
		};
	}
}
function Wu(e) {
	return e.getAttribute("aria-disabled") === "true" || e.hasAttribute("disabled");
}
function Gu(e, t) {
	let n = (e.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((e) => e !== "").map((e) => t.querySelector(`[id="${Hu(e)}"]`)?.textContent?.trim() ?? "").filter((e) => e !== "").join(" ");
	return n === "" ? null : n;
}
function Ku(e, t) {
	let n = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
	(Object.getOwnPropertyDescriptor(n, "value")?.set)?.call(e, t), e.dispatchEvent(new Event("input", { bubbles: !0 }));
}
function qu({ root: e, setOpening: t, onTask: i, fallbackReason: a }) {
	let [o, s] = l(null), [u, d] = l(null), f = c({
		setOpening: t,
		onTask: i,
		fallbackReason: a
	});
	f.current = {
		setOpening: t,
		onTask: i,
		fallbackReason: a
	};
	let p = n((e, t = null) => {
		d(null), s(e.length === 0 ? null : {
			steps: e,
			from: t,
			index: 0,
			commits: 0
		});
	}, []), m = n(() => d(null), []), h = c(null);
	return r(() => {
		if (o === null || h.current === o) return;
		h.current = o;
		let t = e.current, n = o.steps[o.index];
		if (t === null || n === void 0 || o.commits >= 12) {
			s(null);
			return;
		}
		let r = (e) => {
			d((e === null ? null : Gu(e, t)) ?? f.current.fallbackReason() ?? "That is not available right now."), s(null);
		}, i = () => s(o.index + 1 >= o.steps.length ? null : {
			...o,
			index: o.index + 1,
			commits: o.commits + 1
		}), a = (e) => t.querySelector(`[data-guide-control="${Hu(e)}"]`);
		switch (n.kind) {
			case "map": {
				let e = t.querySelector(`[data-opener-key="${Hu(Ls(n.target))}"]`);
				return e === null ? r(null) : (f.current.setOpening({
					focus: Uu(n.focus),
					from: o.from
				}), e.click(), f.current.setOpening(null), i());
			}
			case "control": {
				let e = a(n.key);
				return e === null || Wu(e) ? r(e) : (e.getAttribute("aria-expanded") !== "true" && e.click(), i());
			}
			case "fill": {
				let e = a(n.key);
				return !(e instanceof HTMLTextAreaElement || e instanceof HTMLInputElement) || e.readOnly || Wu(e) ? r(e) : (Ku(e, n.text), e.focus(), i());
			}
			case "focus": {
				let e = a(n.key);
				return e === null ? r(null) : (e.focus(), i());
			}
			case "every": {
				let e = Array.from(t.querySelectorAll(`[data-guide-control^="${Hu(n.keyPrefix)}"]`));
				for (let t of e) !Wu(t) && !t.checked && t.click();
				return i();
			}
			case "shell": {
				let e = t.querySelector(Vu[n.action]);
				return e === null || Wu(e) ? r(e) : (e.click(), i());
			}
			case "task": return f.current.onTask(n.task), i();
		}
	}, [o, e]), {
		run: p,
		refusal: u,
		clearRefusal: m
	};
}
// src/components/use-reduced-motion.ts
var Ju = "(prefers-reduced-motion: reduce)";
function Yu() {
	try {
		return typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia(Ju) : null;
	} catch {
		return null;
	}
}
function Xu() {
	let [e, t] = l(() => $c(Yu()?.matches));
	return r(() => {
		let e = Yu();
		if (e === null) {
			t(!0);
			return;
		}
		let n = (e) => t($c(e.matches));
		if (t($c(e.matches)), typeof e.addEventListener == "function") return e.addEventListener("change", n), () => e.removeEventListener("change", n);
		if (typeof e.addListener == "function") return e.addListener(n), () => e.removeListener(n);
		t(!0);
	}, []), e;
}
// src/components/use-stage-metrics.ts
function Zu(e) {
	let t = 0;
	for (let n = e; n !== null; n = n.offsetParent instanceof HTMLElement ? n.offsetParent : null) t += n.offsetTop;
	return t;
}
function Qu(e) {
	let t = Number.parseFloat(e);
	return Number.isFinite(t) ? t : 0;
}
function $u(e) {
	let [t, n] = l("stacked");
	return a(() => {
		let t = e.current;
		if (t === null || typeof ResizeObserver > "u" || typeof window > "u") return;
		let r = () => {
			let e = t.querySelector("[data-stage-room]");
			if (e === null) return;
			let r = t.querySelector(".hh-ui-toolbar"), i = window.getComputedStyle(t), a = Zu(e);
			t.style.setProperty("--hh-scene-top", `${a}px`), r !== null && r.offsetHeight > 0 && t.style.setProperty("--hh-toolbar-h", `${r.offsetHeight}px`);
			let o = Dl({
				windowWidth: window.innerWidth,
				windowHeight: window.innerHeight,
				houseWidth: t.clientWidth - Qu(i.paddingLeft) - Qu(i.paddingRight),
				sceneTop: a,
				rem: Qu(window.getComputedStyle(document.documentElement).fontSize) || 16
			});
			n(o.layout);
		}, i = new ResizeObserver(r);
		i.observe(t);
		let a = t.querySelector(".hh-ui-toolbar");
		return a !== null && i.observe(a), window.addEventListener("resize", r), r(), () => {
			i.disconnect(), window.removeEventListener("resize", r);
		};
	}, [e]), t;
}
// src/components/MansionShell.tsx
var ed = {
	quiet: !1,
	kiroWords: !1,
	reveal: !1
}, td = {
	quiet: (e) => e ? "The Warden has stepped back. The house map and every control still work." : "The Warden is back.",
	kiroWords: (e) => e ? "Kiro's words are shown beside the plain ones." : "Kiro's words are hidden.",
	reveal: (e) => e ? "Everything you can press in this room now has a label." : "The labels are off."
}, nd = {
	room: "Close room",
	ghost: "Close ghost details",
	door: "Close door details"
};
function rd(e, t) {
	let n = e.rooms.find((e) => e.roomId === t.roomId);
	if (n === void 0) return "";
	switch (t.kind) {
		case "room": return n.name;
		case "ghost": return n.ghosts.find((e) => e.ghostId === t.ghostId)?.name ?? n.name;
		case "door": return `${n.doors.find((e) => e.phase === t.phase)?.phaseName ?? n.name} door`;
	}
}
var id = "(min-width: 900px)";
function ad() {
	if (typeof window > "u" || typeof window.matchMedia != "function") return !1;
	let e = window.matchMedia(id);
	return e.media === id && e.matches;
}
function od(e) {
	return e.replace(/["\\]/g, "\\$&");
}
function sd(e) {
	let t = e.id.indexOf(":"), n = e.kind === "door-decision" || e.kind === "risky-decision" ? e.id.slice(t + 1) : null;
	return n === null || n === "" ? { kind: "heading" } : {
		kind: "selector",
		selector: `[data-proposal="${od(n)}"]`
	};
}
function cd({ projection: e, renderSurface: t, host: a, message: s = "", status: u, notes: d, banner: f, busy: p = !1, onReturn: m, panelMode: h = "region", inFlight: g = null, panelStyles: _ = "", guide: v }) {
	let y = c(null), b = c(null), x = c(null), S = i(), C = Ru(e, y, g), w = $u(y), [T, E] = l(!1), D = el({
		stillHouse: T,
		prefersReducedMotion: Xu()
	}), [O, k] = l({
		text: s,
		turn: 0
	}), A = n((e) => {
		e !== "" && k((t) => ({
			text: e,
			turn: t.turn + 1
		}));
	}, []), j = c(!0);
	r(() => {
		j.current ? j.current = !1 : A(s);
	}, [s, A]);
	let M = n((e) => A(e.text), [A]), { theme: ee } = wi({
		...a,
		needsYouCount: e.needsYou.length,
		onSummary: M
	});
	r(() => {
		b.current?.focus();
	}, []);
	let te = c(null), ne = n((e, t) => C.open(e, te.current?.from ?? t, {
		placement: "replace",
		focus: te.current?.focus
	}), [C.open]), re = o(() => ({
		openNested: (e, t) => C.open(e, t, { placement: "push" }),
		close: C.close,
		stillHouse: D.effective === "none"
	}), [
		C.open,
		C.close,
		D.effective
	]), ie = e.needsYou, ae = n((e) => {
		let t = js(ie), n = ie[0];
		t !== null && n !== void 0 && C.open({
			kind: "room",
			roomId: t
		}, e, {
			placement: "replace",
			focus: sd(n)
		});
	}, [ie, C.open]), oe = c({
		open: C.top !== null,
		close: C.close,
		onReturn: m,
		mapOpen: !1,
		closeMap: () => {},
		reveal: !1,
		setReveal: (e) => {}
	});
	oe.current = {
		...oe.current,
		open: C.top !== null,
		close: C.close,
		onReturn: m
	}, r(() => {
		let e = (e) => {
			if (e.defaultPrevented) return;
			let t = oe.current;
			if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
				let n = e.target instanceof Element ? e.target : null;
				if (n !== null && n.closest("input, textarea, select, [contenteditable]:not([contenteditable=\"false\"])") !== null) return;
				e.preventDefault(), t.setReveal(!t.reveal);
			} else e.key === "Escape" && (t.open ? (e.preventDefault(), t.close()) : t.mapOpen ? (e.preventDefault(), t.closeMap()) : t.reveal ? (e.preventDefault(), t.setReveal(!1)) : t.onReturn !== void 0 && (e.preventDefault(), t.onReturn()));
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, []);
	let N = C.top, se = N === null ? null : Ls(N.target), [ce, le] = l(Tr), ue = Mu(e, se, void 0, ce), [de, fe] = l(!1), [pe, me] = l(null), P = N === null ? null : N.target.roomId;
	r(() => {
		P !== null && me(P);
	}, [P]);
	let [he, ge] = l(!1), _e = n(() => ge((e) => !e), []);
	r(() => {
		he && y.current?.querySelector("[data-map-title]")?.focus();
	}, [he]), r(() => {
		se === null ? (document.activeElement?.closest("[data-map-sheet]") ?? null) !== null && ad() && (x.current ?? y.current?.querySelector("[data-guide-call]"))?.focus() : ge(!1);
	}, [se]), oe.current.mapOpen = he, oe.current.closeMap = () => {
		ge(!1), y.current?.querySelector("[data-map-toggle]")?.focus();
	};
	let ve = P ?? pe ?? wc(e), ye = e.rooms.some((e) => e.roomId === ve) ? ve : e.rooms[0]?.roomId ?? "foyer", [be, xe] = l(ed), F = v?.settings ?? be, Se = v?.onChange ?? xe, Ce = c(F);
	Ce.current = F;
	let we = n((e, t) => {
		Ce.current[e] !== t && (Se({
			...Ce.current,
			[e]: t
		}), A(td[e](t)));
	}, [Se, A]), Te = c(ce);
	Te.current = ce;
	let Ee = n(() => {
		let e = Dr(Te.current);
		le(e), A(`Fright: ${Er[e]}.`);
	}, [A]);
	oe.current.reveal = F.reveal, oe.current.setReveal = (e) => we("reveal", e);
	let [De, Oe] = l(null);
	r(() => Oe(null), [se]);
	let ke = F.kiroWords ? "with-kiro" : "plain", Ae = Zc(e, {
		roomId: ye,
		surface: N === null ? null : N.target,
		task: De,
		quiet: F.quiet,
		words: ke,
		reveal: F.reveal,
		mapOpen: he,
		canLeave: m !== void 0
	}), je = c(null);
	je.current = Ae?.note ?? null;
	let Me = qu({
		root: y,
		setOpening: (e) => {
			te.current = e;
		},
		onTask: Oe,
		fallbackReason: () => je.current
	});
	r(() => {
		Me.refusal !== null && A(Me.refusal);
	}, [Me.refusal, A]);
	let Ne = c(null), Pe = n(() => {
		Ne.current = "call", we("quiet", !0);
	}, [we]), Fe = n(() => {
		Ne.current = "status", we("quiet", !1);
	}, [we]);
	r(() => {
		let e = Ne.current;
		Ne.current = null, e === "status" && x.current?.focus(), e === "call" && y.current?.querySelector("[data-guide-call]")?.focus();
	}, [F.quiet]);
	let Ie = h === "dialog" && N !== null ? { inert: "" } : {};
	return /* @__PURE__ */ L("section", {
		className: "hh-ui",
		"aria-label": `Mansion ${e.mansionName}`,
		"aria-busy": p,
		"data-theme": ee.mode,
		"data-motion": D.effective,
		"data-fright": ce,
		"data-still": D.effective === "none",
		"data-mode": e.mode,
		"data-map": he ? "open" : "closed",
		"data-layout": w,
		ref: y,
		onKeyDown: (e) => {
			e.key !== "Escape" || e.defaultPrevented || C.top === null || (e.preventDefault(), C.close());
		},
		children: [
			/* @__PURE__ */ I("style", { children: Rl + Gl + pr + Br + _ }),
			/* @__PURE__ */ L("div", {
				className: "hh-ui-behind",
				...Ie,
				children: [
					/* @__PURE__ */ I(Fu, {
						ref: b,
						mansionName: e.mansionName,
						needsYou: ie,
						onNeedsYou: ae,
						motion: D,
						onToggleStillHouse: () => E((e) => !e),
						status: u,
						sound: {
							on: ue.on,
							available: ue.available,
							onToggle: ue.toggle
						},
						view: {
							turned: de,
							onToggle: () => fe((e) => !e)
						}
					}),
					f,
					Ae === null ? null : /* @__PURE__ */ I(fu, {
						projection: e,
						roomId: ye,
						view: Ae,
						words: ke,
						quiet: F.quiet,
						settings: {
							mapOpen: he,
							onToggleMap: _e,
							kiroWords: F.kiroWords,
							onToggleWords: () => we("kiroWords", !Ce.current.kiroWords),
							reveal: F.reveal,
							onToggleReveal: () => we("reveal", !Ce.current.reveal),
							fright: ce,
							onCycleFright: Ee
						},
						motion: D.effective,
						open: N !== null && N.target.roomId === ye,
						onPress: Me.run,
						onStepBack: Pe,
						onCallWarden: Fe,
						onReturn: m,
						refusal: Me.refusal,
						statusRef: x
					}),
					d
				]
			}),
			N === null ? null : /* @__PURE__ */ I(Bu, {
				id: S,
				title: rd(e, N.target),
				mode: h,
				stack: C,
				closeLabel: nd[N.target.kind],
				children: t(N, re)
			}, `${C.depth}:${Ls(N.target)}`),
			/* @__PURE__ */ I("div", {
				className: "hh-ui-behind",
				"data-map-sheet": !0,
				...Ie,
				children: /* @__PURE__ */ I(hl, {
					projection: e,
					openSurface: ne,
					motion: D.effective,
					openKey: se,
					panelId: S,
					view: de ? "turned" : "front"
				})
			}),
			/* @__PURE__ */ I(Iu, {
				message: O.text,
				turn: O.turn
			})
		]
	});
}
var ld = String.fromCodePoint(8204, 8205), ud = String.fromCodePoint(4447, 4448, 12644, 65440, 10240), dd = RegExp(`[^${ld}\\P{C}]+`, "gu"), fd = RegExp(`[${ud}\\s]+`, "u"), pd = RegExp(`^[${ld}]+|[${ld}]+$`, "gu"), md = RegExp(`[${ld} ]+$`, "u");
function hd(e) {
	let t = e.replace(dd, " ").split(fd).map((e) => e.replace(pd, "")).filter((e) => e !== "");
	return Array.from(t.join(" ")).slice(0, 40).join("").replace(md, "");
}
var gd = "Come in.";
function _d(e) {
	return e === "" ? gd : `Come in, ${e}.`;
}
var vd = [
	{
		name: "word-counter",
		title: "A word counter",
		brief: "A command-line tool that counts the lines, words and characters in a text file. Keep it small: one file of Python and its tests."
	},
	{
		name: "to-do-list",
		title: "A to-do list",
		brief: "A command-line to-do list that adds, lists and completes items and saves them to a file. Keep it small: one file of Python and its tests."
	},
	{
		name: "unit-converter",
		title: "A unit converter",
		brief: "A command-line tool that converts kilometres to miles, kilograms to pounds, and Celsius to Fahrenheit, and back. Keep it small: one file of Python and its tests."
	}
], yd = "my-house", bd = /* @__PURE__ */ new Set([
	"i",
	"we",
	"id",
	"want",
	"need",
	"would",
	"like",
	"please",
	"to",
	"build",
	"make",
	"create",
	"write",
	"me",
	"us",
	"lets",
	"let",
	"just",
	"can",
	"you"
]), xd = /* @__PURE__ */ new Set([
	"a",
	"an",
	"the",
	"some",
	"my",
	"our"
]), Sd = new Set("that which who to for with and or in on of from by as so when where it is".split(" ")), Cd = {
	ø: "o",
	ß: "ss",
	ł: "l",
	đ: "d",
	æ: "ae",
	œ: "oe",
	þ: "th",
	ð: "d",
	ı: "i"
};
function wd(e) {
	return e.toLowerCase().normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[øßłđæœþðı]/g, (e) => Cd[e] ?? e).split(/\s+/).map((e) => e.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).filter((e) => e !== "");
}
function Td(e) {
	let t = wd(e), n = 0;
	for (; n < t.length && (bd.has(t[n]) || xd.has(t[n]));) n += 1;
	let r = n < t.length ? t.slice(n).filter((e) => !xd.has(e)) : t, i = [], a = (e) => [...i, e].join("-").length <= 24;
	for (let e of r) {
		if (i.length >= 2 && Sd.has(e)) break;
		if (a(e)) i.push(e);
		else {
			for (let t of e.split("-")) {
				if (!a(t)) break;
				i.push(t);
			}
			break;
		}
	}
	let o = i.length > 0 ? i.join("-") : (r[0] ?? "").split("-")[0].slice(0, 24);
	return qe(o) ? o : yd;
}
function Ed(e, t, n = null) {
	let r = vd.find((t) => t.brief === e.trim())?.name ?? null, i = (n !== null && qe(n) ? n : r) ?? Td(e);
	if (!t.has(i)) return i;
	for (let e = 2;; e += 1) {
		let n = `-${e}`, r = `${i.slice(0, 40 - n.length).replace(/-+$/, "")}${n}`;
		if (!t.has(r)) return r;
	}
}
function Dd(e) {
	return {
		place: "loading",
		visitorName: "",
		firstTime: !1,
		idea: !1,
		replay: e,
		cameFrom: "hall"
	};
}
function Od(e, t) {
	switch (t.type) {
		case "list_loaded": return e.place === "loading" ? {
			...e,
			place: t.mansionCount <= 0 || e.replay ? "gate" : "hall"
		} : e;
		case "knocked": return e.place === "gate" ? {
			...e,
			place: "hall",
			visitorName: hd(t.name),
			firstTime: !0,
			idea: !e.replay
		} : e;
		case "stepped_outside": return e.place === "hall" ? {
			...e,
			place: "gate",
			visitorName: "",
			firstTime: !1,
			idea: !1
		} : e;
		case "idea_opened": return e.place === "hall" && !e.replay && !e.idea ? {
			...e,
			idea: !0
		} : e;
		case "idea_closed": return e.place === "hall" && e.idea ? {
			...e,
			idea: !1
		} : e;
		case "mansion_opened": return e.place === "loading" || e.place === "mansion" ? e : {
			...e,
			place: "mansion",
			idea: !1,
			cameFrom: e.place
		};
		case "mansion_left": return e.place === "mansion" ? {
			...e,
			place: e.cameFrom
		} : e;
	}
}
var kd = "The house is shut.", Ad = "Who is knocking?", jd = "A name is optional. It stays on this page and is forgotten when you leave.", Md = "Knock", Nd = "Opens the front door.", Pd = "What do you want to build?", Fd = "Your idea, in your own words", Id = "A sentence or two is enough. Pick an example to start from, or write your own.", Ld = "Build this", Rd = "Puts this idea in the box. You can change it before anything is made.";
function zd(e) {
	return `Makes the project folder ${e} and takes you inside. Nothing is written until you ask.`;
}
var Bd = "What do you want to do?", Vd = {
	id: "step-outside",
	label: "Step outside",
	consequence: "Shows the front gate again and forgets your name. Nothing else changes."
};
function Hd(e, t, n, r) {
	let i = t.filter((e) => e.status === "ready"), a = e.firstTime ? `${_d(e.visitorName)} ` : "", o = {
		pose: "pointing",
		poseLabel: "The Warden points to your next step."
	}, s = {
		pose: "watching",
		poseLabel: "The Warden is watching."
	};
	if (e.replay) {
		let e = i.find((e) => e.name === r) ?? i[0];
		return e === void 0 ? {
			status: `${a}This house holds a recording, but it could not be read.`,
			question: Bd,
			options: [Vd],
			...s
		} : {
			status: `${a}This house holds a recording of ${e.name} being built.`,
			question: Bd,
			options: [{
				id: `watch:${e.name}`,
				label: `Watch ${e.name} get built`,
				consequence: "Opens the recorded house. Nothing in a recording can be changed."
			}, Vd],
			...o
		};
	}
	let c = i.find((e) => e.name === n) ?? (i.length === 1 ? i[0] : void 0), l = c === void 0 ? [] : [{
		id: `enter:${c.name}`,
		label: `Go back into ${c.name}`,
		consequence: "Opens it in the room where the work is."
	}];
	if (e.idea) return {
		status: `${a}Nothing here opens unless you open it.`,
		question: Pd,
		options: [
			...l,
			{
				id: "name-myself",
				label: "Choose the name myself",
				consequence: "Goes to the form below, where you name the mansion and describe it."
			},
			Vd
		],
		...o
	};
	let u = t.length;
	return {
		status: `${a}${u === 0 ? "No mansion stands here yet." : i.length === 0 ? u === 1 ? `One mansion stands here, ${t[0].name}, but it cannot be opened. The list below says why.` : `${u} mansions stand here, but none can be opened. The list below says why.` : u === 1 ? `One mansion stands here: ${t[0].name}.` : `${u} mansions stand here.`}`,
		question: Bd,
		options: [
			...l,
			{
				id: "build-new",
				label: "Build something new",
				consequence: "Asks what you want to build. Nothing is made yet."
			},
			Vd
		],
		...c === void 0 && u > 0 ? s : o
	};
}
// src/landing.ts
var Ud = "A house for your AI agents: each room is a phase of spec-driven work, each ghost an agent you can watch, and each door opens only when you approve.", Wd = {
	mansion: "demo-mansion",
	text: "Watch a mansion get built, then step through what happened."
}, Gd = "\n/* The Warden and his balloon. On a narrow page he stands under it, small; on a wide one beside it, at full height. */\n.hh-hall-guide { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: end; min-width: 0; }\n.hh-hall-guide .hh-guide-balloon { min-width: 0; }\n.hh-hall-own { color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 10px; padding: 12px 16px; min-width: 0; }\n.hh-hall-keeper { display: flex; align-items: flex-end; gap: 10px; min-width: 0; }\n/* His drawing fills this box, so the box is what places it. */\n.hh-hall-warden { position: relative; display: block; flex: none; width: clamp(56px, 16vw, 88px); aspect-ratio: 200 / 300; }\n.hh-hall-caption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }\n.hh-hall-pose { margin: 0; padding: 2px 10px; font-family: var(--hh-font-serif); font-size: 0.8125rem; line-height: 1.3;\n  color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 1px solid var(--hh-sc-ink); border-radius: 4px; }\n.hh-foyer-guide { margin: 0 0 14px; }\n\n/* The Gate's one field and its Knock; the Idea Step's field and its \"Build this\". They sit in the balloon. */\n.hh-gate-form, .hh-idea { display: grid; gap: 6px; min-width: 0; margin: 0; }\n.hh-gate-question, .hh-idea-field label { font-family: var(--hh-font-serif); font-weight: 700; font-size: 1.0625rem; line-height: 1.25; }\n.hh-idea-field { display: grid; gap: 4px; min-width: 0; }\n.hh-gate-name, .hh-idea-field textarea { box-sizing: border-box; width: 100%; max-width: 24rem; font: inherit; color: var(--hh-sc-ink); background: color-mix(in srgb, var(--hh-sc-balloon) 70%, black);\n  border: 2px solid var(--hh-sc-ink); border-radius: 6px; padding: 6px 10px; }\n.hh-idea-field textarea { max-width: none; min-height: 4.5rem; resize: vertical; }\n.hh-gate-name:focus-visible, .hh-idea-field textarea:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 2px; }\n.hh-idea-field textarea[aria-invalid='true'] { border-width: 3px; }\n.hh-gate-hint, .hh-idea-hint { font-size: 0.8125rem; line-height: 1.3; overflow-wrap: anywhere; }\n.hh-gate-actions, .hh-idea-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 4px; }\n.hh-gate-knock { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-family: var(--hh-font-serif); font-weight: 700; font-size: 1.0625rem;\n  color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 2px solid var(--hh-sc-ink); border-radius: 6px; padding: 5px 18px;\n  box-shadow: 0 3px 0 var(--hh-sc-ink); cursor: pointer; }\n.hh-gate-knock:hover { background: var(--hh-sc-moon); }\n.hh-gate-knock:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 3px; }\n.hh-gate-knock[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }\n.hh-idea-examples { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 8px; }\n.hh-idea-error { display: flex; align-items: flex-start; gap: 6px; margin: 0; padding: 4px 8px; font-size: 0.875rem; font-weight: 600; line-height: 1.35;\n  border-left: 4px solid var(--hh-sc-ink); overflow-wrap: anywhere; }\n.hh-idea-error svg { flex: none; margin-top: 2px; }\n.hh-idea-name { margin: 0; font-size: 0.9375rem; overflow-wrap: anywhere; }\n.hh-idea-name code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; }\n\n@media (min-width: 900px) {\n  .hh-hall-guide { grid-template-columns: minmax(0, 1fr) auto; column-gap: 22px; }\n  .hh-hall-keeper { display: grid; justify-items: center; gap: 6px; width: 9.5rem; text-align: center; }\n  .hh-hall-warden { width: 9.5rem; }\n  .hh-hall-caption { justify-content: center; }\n  .hh-hall-guide .hh-guide-balloon::after { content: ''; position: absolute; right: -11px; bottom: 5.5rem; width: 18px; aspect-ratio: 1; background: var(--hh-sc-balloon);\n    border-top: 2px solid var(--hh-sc-ink); border-right: 2px solid var(--hh-sc-ink); transform: rotate(45deg); }\n}\n", Kd = "What should this mansion become?", qd = "Optional. A few plain sentences about the feature; the Archivist reads them before writing requirements.", Jd = `Keep the brief to ${et} characters or fewer.`, Yd = "Remove control characters from the brief. Line breaks and tabs are fine.", Xd = (e) => `${e.length} / ${et} characters${e.ok ? "" : e.reason === "too_long" ? ", too long" : ""}`, Zd = (e) => e.ok ? null : e.reason === "too_long" ? Jd : Yd, Qd = () => {
	let [e, t] = l(""), [r, i] = l(null), a = o(() => it(e), [e]), s = n((e) => {
		t(e), i(null);
	}, []), c = n(() => {
		let e = Zd(a);
		return i(e), e === null;
	}, [a]), u = n(() => {
		t(""), i(null);
	}, []);
	return {
		text: e,
		counter: Xd(a),
		error: r,
		change: s,
		check: c,
		clear: u
	};
}, $d = "Lowercase letters, numbers, and single hyphens, up to 40 characters. For example: weather-station.", ef = "Enter a name for the mansion.", tf = "Use 1–40 lowercase letters, numbers, and single hyphens.";
function nf({ ready: e, mutation: t, onCreate: n }) {
	let r = i(), a = i(), o = i(), s = i(), u = i(), d = i(), f = i(), p = i(), m = c(null), h = c(null), g = Qd(), [_, v] = l(""), [y, b] = l(null), x = t.kind === "creating" || t.kind === "opening", S = t.kind === "creating" ? t.name : null, C = t.kind === "error" && t.operation === "create" ? `Could not create ${t.name}. ${t.message}` : null, w = y ?? C, T = !e || x;
	return /* @__PURE__ */ L("form", {
		className: "hh-create",
		noValidate: !0,
		onSubmit: async (e) => {
			e.preventDefault(), T || (qe(_) ? (b(null), g.check() ? await n(_, g.text) ? (v(""), g.clear()) : m.current?.focus() : h.current?.focus()) : (b(_ === "" ? ef : tf), m.current?.focus()));
		},
		children: [
			/* @__PURE__ */ L("div", {
				className: "hh-field",
				children: [
					/* @__PURE__ */ I("label", {
						htmlFor: r,
						children: "New mansion name"
					}),
					/* @__PURE__ */ I("input", {
						id: r,
						ref: m,
						type: "text",
						name: "mansion-name",
						value: _,
						maxLength: 40,
						pattern: "[a-z0-9]+(-[a-z0-9]+)*",
						required: !0,
						autoComplete: "off",
						autoCapitalize: "none",
						spellCheck: !1,
						readOnly: S !== null,
						"aria-invalid": w !== null,
						"aria-describedby": `${a} ${o}`,
						onChange: (e) => {
							v(e.target.value), b(null);
						}
					}),
					/* @__PURE__ */ I("span", {
						id: a,
						className: "hh-foyer-hint",
						children: $d
					})
				]
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-field",
				children: [
					/* @__PURE__ */ I("label", {
						htmlFor: u,
						children: Kd
					}),
					/* @__PURE__ */ I("textarea", {
						id: u,
						ref: h,
						name: "mansion-brief",
						rows: 4,
						value: g.text,
						readOnly: S !== null,
						"aria-invalid": g.error !== null,
						"aria-describedby": `${d} ${f} ${p}`,
						onChange: (e) => g.change(e.target.value)
					}),
					/* @__PURE__ */ I("span", {
						id: d,
						className: "hh-foyer-hint",
						children: qd
					}),
					/* @__PURE__ */ I("span", {
						id: f,
						className: "hh-foyer-hint",
						children: g.counter
					}),
					g.error === null ? null : /* @__PURE__ */ L("p", {
						id: p,
						className: "hh-foyer-error",
						children: [/* @__PURE__ */ I(P, {
							size: 16,
							"aria-hidden": !0
						}), /* @__PURE__ */ I("span", { children: g.error })]
					})
				]
			}),
			w === null ? null : /* @__PURE__ */ L("p", {
				id: o,
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ I(P, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: w })]
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ L("button", {
					type: "submit",
					className: "hh-button",
					"aria-disabled": T,
					"aria-describedby": s,
					children: [/* @__PURE__ */ I(N, {
						size: 16,
						"aria-hidden": !0
					}), "Create mansion"]
				}), /* @__PURE__ */ I("span", {
					id: s,
					className: "hh-foyer-inline",
					children: S === null ? null : /* @__PURE__ */ L(F, { children: [
						/* @__PURE__ */ I(A, {
							size: 16,
							"aria-hidden": !0,
							className: "hh-foyer-spin"
						}),
						"Creating ",
						S,
						"…"
					] })
				})]
			})
		]
	});
}
// src/rooms/foyer/foyer-styles.ts
var rf = "\n.hh-foyer { color: var(--card-fg, var(--text, var(--hh-fb-text, inherit))); font: inherit; max-width: 48rem; margin: 20px auto 0; }\n.hh-foyer[data-view='mansion'] { max-width: none; margin: 0; }\n.hh-foyer-hall, .hh-shell { background: var(--card, var(--hh-fb-surface, transparent));\n  border: 1px solid var(--border, var(--hh-fb-border, currentColor)); border-radius: 12px; padding: 18px 20px; }\n.hh-foyer h2 { font-family: \"Iowan Old Style\", \"Palatino Linotype\", Palatino, \"Book Antiqua\", Georgia, \"Times New Roman\", serif; font-size: 1.375rem; margin: 0 0 4px; }\n.hh-foyer h3 { font-size: 1rem; margin: 0 0 4px; }\n.hh-foyer h2:focus-visible, .hh-foyer-region:focus-visible { outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n.hh-foyer-lede { margin: 0 0 12px; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n.hh-foyer-invite { margin: 0 0 16px; padding: 10px 14px; font-size: 1.0625rem; font-weight: 600;\n  border-left: 4px solid var(--warn, var(--hh-fb-accent, currentColor)); background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border-radius: 0 8px 8px 0; }\n.hh-foyer-region { margin: 0 0 24px; }\n.hh-foyer-inline { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n.hh-foyer-hint { display: block; margin: 4px 0 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); font-size: 0.875rem; }\n.hh-foyer-error { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; overflow-wrap: anywhere; }\n.hh-foyer-error svg { color: var(--warn, var(--hh-fb-danger, currentColor)); flex: none; margin-top: 2px; }\n.hh-foyer-empty { border: 1px dashed var(--border, var(--hh-fb-border, currentColor)); border-radius: 8px; padding: 12px 16px; }\n.hh-foyer-empty p { margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n\n.hh-mansions { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 10px;\n  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); }\n.hh-mansions legend { padding: 0; margin: 0 0 8px; font-weight: 700; }\n.hh-mansion { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 2px; align-items: center; min-width: 0;\n  background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border: 1px solid var(--border, var(--hh-fb-border, currentColor)); border-radius: 10px; padding: 12px 14px; cursor: pointer; }\n.hh-mansion[data-selected='true'] { border-color: var(--warn, var(--hh-fb-accent, currentColor)); border-width: 3px; padding: 10px 12px; }\n.hh-mansion[data-status='missing'], .hh-mansion[data-status='conflict'] { cursor: not-allowed; border-style: dashed;\n  background: transparent; }\n.hh-mansion:focus-within { outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n.hh-mansion input { margin: 0; width: 1rem; height: 1rem; accent-color: var(--warn, var(--hh-fb-accent, auto)); }\n.hh-mansion-name { font-family: \"Iowan Old Style\", \"Palatino Linotype\", Palatino, \"Book Antiqua\", Georgia, \"Times New Roman\", serif; font-weight: 700; font-size: 1.0625rem;\n  overflow-wrap: anywhere; }\n.hh-mansion-path, .hh-mansion-status { grid-column: 2; font-size: 0.8125rem; overflow-wrap: anywhere; }\n.hh-mansion-path { color: var(--muted, var(--hh-fb-text-muted, inherit)); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }\n.hh-mansion-status { display: inline-flex; align-items: center; gap: 6px; }\n.hh-mansion { container-type: inline-size; }\n@container (min-width: 16em) { .hh-path-part { white-space: nowrap; } }\n.hh-status-ready svg { color: var(--ok, var(--hh-fb-ok, currentColor)); }\n.hh-status-missing svg { color: var(--muted, var(--hh-fb-text-muted, currentColor)); }\n.hh-status-conflict svg { color: var(--warn, var(--hh-fb-danger, currentColor)); }\n\n.hh-foyer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 14px; }\n.hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;\n  color: inherit; background: transparent; border: 1px solid var(--border-strong, var(--hh-fb-border, currentColor));\n  border-width: 2px; border-radius: 999px; padding: 6px 16px; font-weight: 600; }\n.hh-button-primary { color: var(--accent-fg, var(--hh-fb-accent-text, inherit)); background: var(--accent, var(--hh-fb-accent, transparent));\n  font-weight: 700; padding: 10px 18px; font-size: 1.0625rem; }\n.hh-button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }\n.hh-button:focus-visible, .hh-field input:focus-visible, .hh-field textarea:focus-visible {\n  outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n\n.hh-create { margin: 0; padding-top: 16px; border-top: 1px solid var(--border, var(--hh-fb-border, currentColor)); }\n.hh-field { display: grid; gap: 4px; min-width: 0; }\n.hh-field label { font-weight: 600; }\n.hh-field input, .hh-field textarea { font: inherit; color: inherit; background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border: 1px solid var(--border-strong, var(--hh-fb-border, currentColor)); border-radius: 6px; padding: 6px 10px;\n  width: 100%; min-width: 0; max-width: 24rem; box-sizing: border-box; }\n.hh-field input[aria-invalid='true'], .hh-field textarea[aria-invalid='true'] { border-width: 2px; }\n.hh-field textarea { resize: vertical; max-width: 36rem; min-height: 5rem; }\n.hh-create .hh-field + .hh-field { margin-top: 12px; }\n\n.hh-shell-eyebrow { margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); font-size: 0.875rem; }\n.hh-shell-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 12px 0; }\n.hh-shell-facts dt { font-weight: 600; }\n.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; }\n.hh-shell-rooms { margin: 12px 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n\n.hh-foyer-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }\n\n@media (max-width: 640px) {\n  .hh-foyer-hall, .hh-shell { padding: 14px 12px; }\n}\n\n@keyframes hh-foyer-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-foyer[data-motion='low-frequency'] .hh-foyer-spin { animation: hh-foyer-spin 2s linear infinite; }\n}\n", af = {
	ready: "Ready to open",
	missing: "Missing: its folder is no longer in storage, so it cannot be opened.",
	conflict: "Conflict: its folder no longer looks like a mansion, so it cannot be opened."
};
function of({ status: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "ready": return /* @__PURE__ */ I(g, { ...t });
		case "missing": return /* @__PURE__ */ I(_, { ...t });
		case "conflict": return /* @__PURE__ */ I(P, { ...t });
	}
}
function sf({ path: t }) {
	let n = t.split("/");
	return /* @__PURE__ */ I(F, { children: n.map((t, r) => /* @__PURE__ */ L(e, { children: [/* @__PURE__ */ I("span", {
		className: "hh-path-part",
		children: r < n.length - 1 ? `${t}/` : t
	}), r < n.length - 1 ? /* @__PURE__ */ I("wbr", {}) : null] }, r)) });
}
function cf({ mansion: e, group: t, selected: n, onSelect: r }) {
	return /* @__PURE__ */ L("label", {
		className: "hh-mansion",
		"data-status": e.status,
		"data-selected": n,
		children: [
			/* @__PURE__ */ I("input", {
				type: "radio",
				name: t,
				value: e.name,
				checked: n,
				disabled: e.status !== "ready",
				onChange: () => r(e.name)
			}),
			/* @__PURE__ */ I("span", {
				className: "hh-mansion-name",
				children: e.name
			}),
			/* @__PURE__ */ I("span", {
				className: "hh-mansion-path",
				children: /* @__PURE__ */ I(sf, { path: e.displayPath })
			}),
			/* @__PURE__ */ L("span", {
				className: `hh-mansion-status hh-status-${e.status}`,
				children: [/* @__PURE__ */ I(of, { status: e.status }), af[e.status]]
			})
		]
	});
}
function lf({ load: e, selectedName: t, mutation: n, onSelect: r, onOpen: a, onRetry: o }) {
	let s = i(), l = i(), u = i(), d = i(), f = c(null), p = n.kind === "creating" || n.kind === "opening", m = n.kind === "error" && n.operation === "open" ? n : null, h = e.kind === "ready" && t !== null && !p, g = e.kind === "loading" || e.kind === "ready" && e.mansions.length > 0;
	return /* @__PURE__ */ L("div", {
		className: "hh-foyer-region",
		ref: f,
		tabIndex: -1,
		children: [
			e.kind === "loading" ? /* @__PURE__ */ L("p", {
				className: "hh-foyer-inline",
				children: [/* @__PURE__ */ I(A, {
					size: 16,
					"aria-hidden": !0,
					className: "hh-foyer-spin"
				}), "Loading mansions…"]
			}) : null,
			e.kind === "error" ? /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ L("p", {
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ I(P, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: ["Could not load the mansion list. ", e.message] })]
			}), /* @__PURE__ */ I("div", {
				className: "hh-foyer-actions",
				children: /* @__PURE__ */ L("button", {
					type: "button",
					className: "hh-button",
					onClick: () => {
						f.current?.focus(), o();
					},
					children: [/* @__PURE__ */ I(ue, {
						size: 16,
						"aria-hidden": !0
					}), "Retry"]
				})
			})] }) : null,
			e.kind === "ready" && e.mansions.length === 0 ? /* @__PURE__ */ L("div", {
				className: "hh-foyer-empty",
				children: [/* @__PURE__ */ I("h3", { children: "No mansions yet" }), /* @__PURE__ */ I("p", { children: "The house is quiet. Name your first mansion below to create it." })]
			}) : null,
			e.kind === "ready" && e.mansions.length > 0 ? /* @__PURE__ */ L("fieldset", {
				className: "hh-mansions",
				role: "radiogroup",
				"aria-labelledby": l,
				onKeyDown: (e) => {
					let t = e.target;
					e.key === "Enter" && t instanceof HTMLInputElement && t.type === "radio" && (e.preventDefault(), !t.disabled && !p && a(t.value, t));
				},
				children: [/* @__PURE__ */ I("legend", {
					id: l,
					children: "Mansions"
				}), e.mansions.map((e) => /* @__PURE__ */ I(cf, {
					mansion: e,
					group: s,
					selected: e.name === t,
					onSelect: r
				}, e.name))]
			}) : null,
			g ? /* @__PURE__ */ L("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ L("button", {
					type: "button",
					className: "hh-button hh-button-primary",
					"aria-disabled": !h,
					"aria-describedby": `${u} ${d}`,
					onClick: (e) => {
						h && t !== null && a(t, e.currentTarget);
					},
					children: [/* @__PURE__ */ I(b, {
						size: 16,
						"aria-hidden": !0
					}), t === null ? "Open mansion" : `Open ${t}`]
				}), /* @__PURE__ */ I("span", {
					id: u,
					className: "hh-foyer-inline",
					children: n.kind === "opening" ? /* @__PURE__ */ L(F, { children: [
						/* @__PURE__ */ I(A, {
							size: 16,
							"aria-hidden": !0,
							className: "hh-foyer-spin"
						}),
						"Opening ",
						n.name,
						"…"
					] }) : e.kind === "ready" && t === null ? "Select a ready mansion to open it." : null
				})]
			}) : null,
			m ? /* @__PURE__ */ L("p", {
				id: d,
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ I(P, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: [
					"Could not open ",
					m.name,
					". ",
					m.message
				] })]
			}) : null
		]
	});
}
// src/rooms/foyer/MansionShell.tsx
function uf({ mansion: e, onReturn: t, children: n }) {
	let a = i(), o = c(null), s = c(t);
	return s.current = t, r(() => {
		o.current?.focus();
	}, []), r(() => {
		let e = (e) => {
			e.key !== "Escape" || e.defaultPrevented || (e.preventDefault(), s.current());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, []), /* @__PURE__ */ L("section", {
		className: "hh-shell",
		"aria-labelledby": a,
		children: [
			/* @__PURE__ */ I("p", {
				className: "hh-shell-eyebrow",
				children: "Mansion"
			}),
			/* @__PURE__ */ I("h2", {
				id: a,
				ref: o,
				tabIndex: -1,
				children: e.name
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ L("button", {
					type: "button",
					className: "hh-button",
					onClick: t,
					children: [/* @__PURE__ */ I(u, {
						size: 16,
						"aria-hidden": !0
					}), "Return to Foyer"]
				}), /* @__PURE__ */ I("span", {
					className: "hh-foyer-hint",
					children: "Escape also returns to the Foyer."
				})]
			}),
			/* @__PURE__ */ L("dl", {
				className: "hh-shell-facts",
				children: [
					/* @__PURE__ */ I("dt", { children: "Project spec" }),
					/* @__PURE__ */ I("dd", { children: e.projectSpec }),
					/* @__PURE__ */ I("dt", { children: "Folder" }),
					/* @__PURE__ */ I("dd", { children: e.displayPath })
				]
			}),
			n ?? /* @__PURE__ */ I("p", {
				className: "hh-shell-rooms",
				children: "The rooms are still dark. Ghosts move in with a later chapter."
			})
		]
	});
}
// src/core/foyer-reducer.ts
function df() {
	return {
		load: { kind: "loading" },
		mutation: { kind: "idle" },
		selectedName: null,
		view: { kind: "foyer" }
	};
}
function ff(e, t) {
	return e.name < t.name ? -1 : +(e.name > t.name);
}
function pf(e, t) {
	return [...e.filter(({ name: e }) => e !== t.name), t].sort(ff);
}
function mf(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.name, n);
	return [...t.values()].sort(ff);
}
function hf(e, t) {
	return e === null ? null : t.some(({ name: t, status: n }) => t === e && n === "ready") ? e : null;
}
function gf(e) {
	return e.load.kind === "ready" ? e.load.mansions : null;
}
function _f(e) {
	return e.kind === "creating" || e.kind === "opening";
}
function vf(e, t, n) {
	return e.kind === t && e.name === n;
}
function yf(e, t) {
	switch (t.type) {
		case "load_started": return df();
		case "load_succeeded": {
			let n = mf(t.mansions);
			return {
				load: {
					kind: "ready",
					mansions: n
				},
				mutation: { kind: "idle" },
				selectedName: hf(e.selectedName, n),
				view: { kind: "foyer" }
			};
		}
		case "load_failed": return {
			load: {
				kind: "error",
				message: $e(t.message)
			},
			mutation: { kind: "idle" },
			selectedName: null,
			view: { kind: "foyer" }
		};
		case "mansion_selected": {
			if (e.view.kind !== "foyer" || e.load.kind !== "ready") return e;
			if (t.name === null) return e.selectedName === null ? e : {
				...e,
				selectedName: null
			};
			let n = hf(t.name, e.load.mansions);
			return n === null || n === e.selectedName ? e : {
				...e,
				selectedName: n
			};
		}
		case "create_started": return e.view.kind !== "foyer" || e.load.kind !== "ready" || _f(e.mutation) ? e : {
			...e,
			mutation: {
				kind: "creating",
				name: t.name
			}
		};
		case "create_succeeded": {
			if (!vf(e.mutation, "creating", t.mansion.name)) return e;
			let n = gf(e);
			if (n === null || t.mansion.status !== "ready") return e;
			let r = pf(n, t.mansion);
			return {
				...e,
				load: {
					kind: "ready",
					mansions: r
				},
				mutation: { kind: "idle" },
				selectedName: hf(e.selectedName, r)
			};
		}
		case "create_failed": return vf(e.mutation, "creating", t.name) ? {
			...e,
			mutation: {
				kind: "error",
				operation: "create",
				name: t.name,
				message: $e(t.message)
			}
		} : e;
		case "open_started": return e.view.kind !== "foyer" || e.load.kind !== "ready" || _f(e.mutation) || e.selectedName !== t.name || !e.load.mansions.some(({ name: e, status: n }) => e === t.name && n === "ready") ? e : {
			...e,
			mutation: {
				kind: "opening",
				name: t.name
			}
		};
		case "open_succeeded": {
			if (!vf(e.mutation, "opening", t.mansion.name) || t.mansion.status !== "ready") return e;
			let n = gf(e);
			return n === null ? e : {
				load: {
					kind: "ready",
					mansions: pf(n, t.mansion)
				},
				mutation: { kind: "idle" },
				selectedName: t.mansion.name,
				view: {
					kind: "mansion",
					mansion: t.mansion
				}
			};
		}
		case "open_failed": return vf(e.mutation, "opening", t.name) ? {
			...e,
			mutation: {
				kind: "error",
				operation: "open",
				name: t.name,
				message: $e(t.message)
			}
		} : e;
		case "returned_to_foyer": return e.view.kind === "mansion" ? {
			...e,
			mutation: { kind: "idle" },
			view: { kind: "foyer" }
		} : e;
	}
}
// src/rooms/foyer/use-foyer.ts
var bf = {
	created: (e) => `Mansion ${e} created.`,
	existing_compatible: (e) => `Mansion ${e} already exists. Nothing was changed.`
};
function xf(e) {
	return e instanceof lt || e instanceof He ? e.message : Re;
}
function Sf({ onAnnounce: e } = {}) {
	let t = mt(), i = c(t);
	i.current = t;
	let a = c(e);
	a.current = e;
	let [s, u] = l(df), d = c(s), f = c(!1), [p, m] = l(0), h = n((e) => {
		let t = yf(d.current, e);
		return t !== d.current && (d.current = t, f.current && u(t)), t;
	}, []);
	r(() => (f.current = !0, () => {
		f.current = !1;
	}), []), r(() => {
		let e = !1;
		return h({ type: "load_started" }), i.current.list().then(({ mansions: t }) => {
			e || h({
				type: "load_succeeded",
				mansions: t
			});
		}, (t) => {
			e || h({
				type: "load_failed",
				message: xf(t)
			});
		}), () => {
			e = !0;
		};
	}, [p, h]);
	let g = n(() => m((e) => e + 1), []), _ = n((e) => {
		h({
			type: "mansion_selected",
			name: e
		});
	}, [h]), v = n(async (e, t) => {
		let n = d.current;
		if (h({
			type: "create_started",
			name: e
		}) === n) return !1;
		try {
			let { outcome: n, mansion: r } = await i.current.create(e, t);
			if (r.name !== e) throw new He();
			return h({
				type: "create_succeeded",
				mansion: r
			}), a.current?.(bf[n](e)), !0;
		} catch (t) {
			return h({
				type: "create_failed",
				name: e,
				message: xf(t)
			}), !1;
		}
	}, [h]), y = n((e) => {
		h({
			type: "mansion_selected",
			name: e
		});
		let t = d.current;
		h({
			type: "open_started",
			name: e
		}) !== t && i.current.open(e).then(({ mansion: t }) => {
			t.name === e ? (h({
				type: "open_succeeded",
				mansion: t
			}), a.current?.(`Mansion ${e} opened.`)) : h({
				type: "open_failed",
				name: e,
				message: Le
			});
		}, (t) => {
			h({
				type: "open_failed",
				name: e,
				message: xf(t)
			});
		});
	}, [h]), b = n(() => {
		h({ type: "returned_to_foyer" });
	}, [h]);
	return o(() => ({
		state: s,
		retryLoad: g,
		select: _,
		create: v,
		open: y,
		returnToFoyer: b
	}), [
		s,
		g,
		_,
		v,
		y,
		b
	]);
}
// src/rooms/foyer/Foyer.tsx
var Cf = { kind: "idle" };
function wf({ onAnnounce: e, stillHouse: t = !1, renderMansion: o, renderShell: s, onMansionChange: u, preselect: d, invitation: f, visit: p, onLoad: m }) {
	let h = Ot(), g = i(), [_, v] = l(""), { state: y, retryLoad: b, select: x, create: S, open: C, returnToFoyer: w } = Sf({ onAnnounce: e ?? v }), T = c(!1);
	r(() => {
		T.current || d === void 0 || y.load.kind !== "ready" || (T.current = !0, y.load.mansions.some((e) => e.name === d && e.status === "ready") && y.selectedName === null && x(d));
	}, [
		d,
		y.load,
		y.selectedName,
		x
	]);
	let E = y.view.kind === "mansion", D = c(null), O = c(null), k = c(null), A = c(null), j = c(!1), [M, ee] = l("hall"), [te, ne] = l(null), re = n((e, t) => {
		D.current = t, O.current = t.getAttribute("data-guide-option"), C(e);
	}, [C]), ie = n((e, t) => {
		ee("hall"), re(e, t);
	}, [re]), ae = n((e, t) => (ee("hall"), S(e, t)), [S]), oe = n((e, t) => {
		ee("guide"), re(e, t);
	}, [re]), N = n(async (e, t, n) => {
		if (ee("guide"), te === null || te.name !== e || te.brief !== t) {
			if (!await S(e, t)) return !1;
			ne({
				name: e,
				brief: t
			});
		}
		return re(e, n), !0;
	}, [
		S,
		te,
		re
	]);
	r(() => {
		if (j.current && !E) {
			let e = O.current, t = e === null ? null : k.current?.querySelector(`[data-guide-option="${e.replace(/["\\]/g, "\\$&")}"]`) ?? null;
			(D.current?.isConnected ? D.current : t ?? A.current)?.focus();
		}
		j.current = E;
	}, [E]);
	let se = y.view.kind === "mansion" ? y.view.mansion : null, ce = c(u);
	ce.current = u, a(() => {
		ce.current?.(se);
	}, [se]), a(() => () => ce.current?.(null), []);
	let le = c(m);
	le.current = m, a(() => {
		le.current?.(y.load);
	}, [y.load]);
	let ue = E || p?.hidden === !0, de = {
		mansions: y.load.kind === "ready" ? y.load.mansions : [],
		selectedName: y.selectedName,
		ready: y.load.kind === "ready",
		mutation: y.mutation.kind === "error" && M !== "guide" ? Cf : y.mutation,
		made: te,
		open: oe,
		build: N
	}, fe = y.mutation.kind === "error" && M === "guide" ? Cf : y.mutation, pe = p === void 0 || ue ? null : p.renderGuide(de);
	return /* @__PURE__ */ L("div", {
		className: "hh-foyer",
		ref: k,
		"data-view": E ? "mansion" : "hall",
		"data-theme-mode": h.mode,
		"data-motion": t ? "none" : "low-frequency",
		style: { colorScheme: h.mode },
		children: [
			/* @__PURE__ */ I("style", { children: rf }),
			pe == null ? null : /* @__PURE__ */ I("div", {
				className: "hh-foyer-guide",
				"data-foyer-guide": !0,
				children: pe
			}),
			/* @__PURE__ */ L("section", {
				className: "hh-foyer-hall",
				"aria-labelledby": g,
				hidden: ue,
				children: [
					/* @__PURE__ */ I("h2", {
						id: g,
						ref: A,
						tabIndex: -1,
						children: "Foyer"
					}),
					/* @__PURE__ */ I("p", {
						className: "hh-foyer-lede",
						children: "Each mansion is one software project. Choose one to enter, or create a new one."
					}),
					f === void 0 ? null : /* @__PURE__ */ I("p", {
						className: "hh-foyer-invite",
						children: f
					}),
					/* @__PURE__ */ I(lf, {
						load: y.load,
						selectedName: y.selectedName,
						mutation: fe,
						onSelect: x,
						onOpen: ie,
						onRetry: b
					}),
					/* @__PURE__ */ I(nf, {
						ready: y.load.kind === "ready",
						mutation: fe,
						onCreate: ae
					})
				]
			}),
			y.view.kind === "mansion" ? s === void 0 ? /* @__PURE__ */ I(uf, {
				mansion: y.view.mansion,
				onReturn: w,
				children: o?.(y.view.mansion)
			}) : s(y.view.mansion, w) : null,
			e ? null : /* @__PURE__ */ I("p", {
				className: "hh-foyer-announcer",
				"aria-live": "polite",
				children: _
			})
		]
	});
}
// src/rooms/foyer/Gate.tsx
function Tf({ onKnock: e, formId: t }) {
	let [n, r] = l(""), a = i(), o = i(), s = i();
	return /* @__PURE__ */ L("form", {
		className: "hh-gate-form",
		id: t,
		"data-gate": !0,
		noValidate: !0,
		onSubmit: (t) => {
			t.preventDefault(), e(n);
		},
		children: [
			/* @__PURE__ */ I("label", {
				className: "hh-gate-question",
				htmlFor: a,
				children: Ad
			}),
			/* @__PURE__ */ I("input", {
				id: a,
				className: "hh-gate-name",
				type: "text",
				value: n,
				autoComplete: "off",
				autoCapitalize: "words",
				spellCheck: !1,
				maxLength: 120,
				"aria-describedby": o,
				onChange: (e) => r(e.target.value)
			}),
			/* @__PURE__ */ I("span", {
				id: o,
				className: "hh-gate-hint",
				children: jd
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-gate-actions",
				children: [/* @__PURE__ */ L("button", {
					type: "submit",
					className: "hh-gate-knock",
					"data-guide-option": "knock",
					"aria-describedby": s,
					children: [/* @__PURE__ */ I(b, {
						size: 18,
						"aria-hidden": !0
					}), Md]
				}), /* @__PURE__ */ I("span", {
					id: s,
					className: "hh-gate-hint",
					children: Nd
				})]
			})
		]
	});
}
// src/rooms/foyer/HallGuide.tsx
var Ef = "Call the Warden", Df = "The Warden says what is true here and what you can do about it.", Of = "The Warden has stepped back.";
function kf({ status: e, question: t, options: n, pose: r, poseLabel: a, words: o, quiet: s, onPress: c, onStepBack: l, onCallWarden: u, statusRef: d, children: f }) {
	let p = i(), m = s ? "stepped-back" : r;
	return /* @__PURE__ */ L("div", {
		className: "hh-hall-guide",
		"data-hall-guide": !0,
		"data-quiet": s,
		children: [s ? f == null ? null : /* @__PURE__ */ I("div", {
			className: "hh-hall-own",
			children: f
		}) : /* @__PURE__ */ I(Ql, {
			view: {
				status: e,
				question: t,
				options: n,
				everything: n
			},
			words: o,
			onPress: c,
			onStepBack: l,
			statusRef: d,
			children: f
		}), /* @__PURE__ */ L("div", {
			className: "hh-hall-keeper",
			"data-guide-keeper": !0,
			children: [/* @__PURE__ */ I("span", {
				className: "hh-hall-warden",
				"aria-hidden": "true",
				children: /* @__PURE__ */ I(sr, { pose: m })
			}), /* @__PURE__ */ L("div", {
				className: "hh-hall-caption",
				children: [/* @__PURE__ */ I("p", {
					className: "hh-hall-pose",
					"data-guide-pose": m,
					children: s ? Of : a
				}), s ? /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ L("button", {
					type: "button",
					className: "hh-stage-call",
					"data-guide-call": !0,
					"aria-describedby": p,
					onClick: u,
					children: [/* @__PURE__ */ I(ne, {
						size: 13,
						"aria-hidden": !0
					}), Ef]
				}), /* @__PURE__ */ I("span", {
					className: "hh-guide-hidden",
					id: p,
					children: Df
				})] }) : null]
			})]
		})]
	});
}
// src/rooms/foyer/use-idea-step.ts
var Af = "Say what you want to build, or pick an example.";
function jf(e, t) {
	let r = Qd(), [i, a] = l(null), [s, c] = l(!1), u = o(() => new Set(e.map((e) => e.name)), [e]), d = o(() => it(r.text).length === 0, [r.text]), f = t !== null && t.brief === r.text, p = o(() => f ? t.name : Ed(r.text, u, i), [
		f,
		t,
		r.text,
		u,
		i
	]), m = n((e) => {
		r.change(e.brief), a(e.name), c(!1);
	}, [r.change]), h = n((e) => {
		r.change(e), c(!1), e.trim() === "" && a(null);
	}, [r.change]), g = n(() => d ? (c(!0), !1) : r.check(), [d, r.check]);
	return {
		text: r.text,
		counter: r.counter,
		error: s ? Af : r.error,
		name: p,
		alreadyMade: f,
		pick: m,
		change: h,
		check: g
	};
}
// src/rooms/foyer/IdeaStep.tsx
var Mf = "Examples to start with", Nf = (e) => `The project folder ${e} is already made. This takes you inside.`;
function Pf({ mansions: e, ready: t, mutation: n, made: r, onBuild: a }) {
	let o = i(), s = i(), l = i(), u = i(), d = i(), f = i(), p = i(), m = c(null), h = c(null), g = jf(e, r), _ = n.kind === "creating" || n.kind === "opening", v = !t || _, y = n.kind === "error" ? `Could not ${n.operation} ${n.name}. ${n.message}` : null, b = g.error ?? y;
	return /* @__PURE__ */ L("form", {
		className: "hh-idea",
		"data-idea-step": !0,
		noValidate: !0,
		onSubmit: async (e) => {
			e.preventDefault(), v || h.current === null || g.check() && await a(g.name, g.text, h.current) || m.current?.focus();
		},
		children: [
			/* @__PURE__ */ I("ul", {
				className: "hh-idea-examples",
				"aria-label": Mf,
				children: vd.map((e) => /* @__PURE__ */ I("li", { children: /* @__PURE__ */ I("button", {
					type: "button",
					className: "hh-guide-foot-button hh-idea-example",
					"data-example": e.name,
					"aria-describedby": p,
					onClick: () => {
						g.pick(e), m.current?.focus();
					},
					children: e.title
				}) }, e.name))
			}),
			/* @__PURE__ */ I("span", {
				className: "hh-guide-hidden",
				id: p,
				children: Rd
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-idea-field",
				children: [
					/* @__PURE__ */ I("label", {
						htmlFor: o,
						children: Fd
					}),
					/* @__PURE__ */ I("textarea", {
						id: o,
						ref: m,
						rows: 3,
						value: g.text,
						readOnly: _,
						"aria-invalid": b !== null,
						"aria-describedby": `${s} ${l} ${u} ${d}`,
						onChange: (e) => g.change(e.target.value)
					}),
					/* @__PURE__ */ I("span", {
						id: s,
						className: "hh-idea-hint",
						children: Id
					}),
					/* @__PURE__ */ I("span", {
						id: l,
						className: "hh-idea-hint",
						children: g.counter
					})
				]
			}),
			b === null ? null : /* @__PURE__ */ L("p", {
				id: u,
				className: "hh-idea-error",
				"data-idea-error": !0,
				children: [/* @__PURE__ */ I(P, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: b })]
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-idea-name",
				id: d,
				"data-idea-name": !0,
				children: ["Project folder: ", /* @__PURE__ */ I("code", { children: g.name })]
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-idea-actions",
				children: [/* @__PURE__ */ L("button", {
					type: "submit",
					ref: h,
					className: "hh-gate-knock",
					"data-guide-option": "build-this",
					"aria-disabled": v,
					"aria-describedby": f,
					children: [/* @__PURE__ */ I(E, {
						size: 18,
						"aria-hidden": !0
					}), Ld]
				}), /* @__PURE__ */ I("span", {
					id: f,
					className: "hh-idea-hint",
					children: _ ? /* @__PURE__ */ L(F, { children: [
						/* @__PURE__ */ I(A, {
							size: 14,
							"aria-hidden": !0,
							className: "hh-foyer-spin"
						}),
						" ",
						n.kind === "creating" ? `Making ${n.name}…` : `Opening ${n.name}…`
					] }) : g.alreadyMade ? Nf(g.name) : zd(g.name)
				})]
			})
		]
	});
}
// src/core/seance-log.ts
var Ff = `h1:${"0".repeat(64)}`;
function If(e) {
	let t = { ...ca(e) };
	return delete t.hash, `h1:${na($i(t))}`;
}
function Lf(e) {
	let t = e.split("\n");
	t.at(-1) === "" && t.pop();
	let n = [], r = [], i = /* @__PURE__ */ new Set(), a = null, o = Ff;
	for (let e = 0; e < t.length; e += 1) {
		let s = e + 1, c = t[e].endsWith("\r") ? t[e].slice(0, -1) : t[e];
		if (c.trim() === "") continue;
		let l = ga(c, s);
		if (!l.ok) {
			r.push(l.diagnostic);
			continue;
		}
		let u = l.value, d = Rf(u, n.length + 1, a, o, i);
		if (d !== null) return r.push({
			...d,
			line: s
		}), {
			events: n,
			highestSequence: n.length,
			validPrefixLines: e,
			integrityOk: !1,
			diagnostics: r
		};
		a = u.hash !== void 0, u.hash !== void 0 && (o = u.hash), i.add(u.record_id), n.push(u);
	}
	return {
		events: n,
		highestSequence: n.length,
		validPrefixLines: t.length,
		integrityOk: !0,
		diagnostics: r
	};
}
function Rf(e, t, n, r, i) {
	if (e.sequence !== t) return e.sequence < t ? {
		code: "duplicate_sequence",
		path: "$.sequence",
		safe_detail: "Sequence repeats an earlier record."
	} : {
		code: "missing_sequence",
		path: "$.sequence",
		safe_detail: "Sequence skips a record."
	};
	let a = e.hash !== void 0;
	if (n !== null && n !== a) return {
		code: "mixed_integrity_mode",
		safe_detail: "Log switches between linked and unlinked records."
	};
	if (a) {
		if (e.prev_hash !== r) return {
			code: "hash_link_broken",
			path: "$.prev_hash",
			safe_detail: "Record does not link to its predecessor."
		};
		if (e.hash !== If(e)) return {
			code: "hash_mismatch",
			path: "$.hash",
			safe_detail: "Record hash does not match its content."
		};
	}
	return i.has(e.record_id) ? {
		code: "invalid_record",
		path: "$.record_id",
		safe_detail: "Record_ID repeats an earlier record."
	} : null;
}
var zf = {
	records: /* @__PURE__ */ new Map(),
	highestSequence: 0,
	contiguousSequence: 0
};
function Bf(e, t) {
	let n = [], r = null;
	for (let i of t) (r ?? e.records).has(i.record_id) || (r ??= new Map(e.records), r.set(i.record_id, i), n.push(i));
	if (r === null) return {
		log: e,
		applied: n
	};
	let i = e.highestSequence;
	for (let e of n) i = Math.max(i, e.sequence);
	let a = /* @__PURE__ */ new Set();
	for (let e of r.values()) a.add(e.sequence);
	let o = e.contiguousSequence;
	for (; a.has(o + 1);) o += 1;
	return {
		log: {
			records: r,
			highestSequence: i,
			contiguousSequence: o
		},
		applied: n
	};
}
function Vf(e) {
	let t = xa(Array.from(e));
	return {
		events: t.selection.events,
		selectionDiagnostics: t.selection.diagnostics,
		snapshots: t.snapshots,
		transitions: t.transitions
	};
}
function Hf(e) {
	return Vf(e.records.values());
}
var Uf = "guardrail", Wf = Yr, Gf = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/, Kf = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/, qf = /^[a-z][a-z0-9_]{0,63}$/, Jf = /^[0-9a-f]{64}$/, Yf = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, Xf = 2 ** 31 - 1, Zf = 2 ** 53 - 1, Qf = 1024, $f = 32, ep = 255, tp = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u, np = (e) => new TextEncoder().encode(e).length;
function rp(e) {
	if (typeof e != "string" || e === "" || np(e) > Qf || e.includes("\\") || tp.test(e) || e.startsWith("/") || e.normalize("NFC") !== e) return !1;
	let t = e.split("/");
	return t.length > $f ? !1 : t.every((e) => e !== "" && e !== "." && e !== ".." && np(e) <= ep && !/%[0-9A-Fa-f]{2}/.test(e));
}
var Z = (e) => typeof e == "string" && Gf.test(e), ip = (e) => typeof e == "string" && Kf.test(e), ap = (e) => typeof e == "string" && qf.test(e), op = (e) => typeof e == "string" && U.includes(e), sp = (e) => typeof e == "string" && Jf.test(e), cp = (e) => rp(e), lp = (e, t) => (n) => typeof n == "number" && Number.isSafeInteger(n) && n >= e && n <= t, up = (...e) => (t) => typeof t == "string" && e.includes(t), dp = (e) => (t) => t === null || e(t), fp = (e) => typeof e == "object" && !!e && !Array.isArray(e), pp = lp(1, Xf), mp = lp(0, Zf), hp = up("operator", "crew"), gp = {
	document_path: cp,
	revision: pp,
	sha256: sp,
	size_bytes: mp
}, _p = {
	phase: op,
	proposal_id: Z,
	...gp,
	actor: hp,
	command_id: Z
}, vp = {
	proposal_id: Z,
	action_digest: sp,
	actor: hp,
	command_id: Z,
	crew_slot: dp(ip),
	crew_mid: dp(ip)
}, yp = {
	proposal_id: Z,
	action_digest: sp,
	claim_id: Z,
	code: ap,
	exit_code: dp(lp(-255, 255)),
	output_bytes: mp
}, bp = {
	phase_start_reserved: [{
		phase: op,
		reservation_id: Z,
		command_id: Z
	}, "phase"],
	phase_started: [{
		phase: op,
		reservation_id: Z,
		session_slot: ip
	}, "phase"],
	phase_start_failed: [{
		phase: op,
		reservation_id: Z,
		code: ap
	}, "phase"],
	phase_start_denied: [{
		phase: op,
		command_id: Z,
		code: ap
	}, "phase"],
	phase_output_ready: [{
		phase: op,
		proposal_id: Z,
		...gp
	}, "proposal_id"],
	revision_started: [{
		phase: op,
		command_id: Z,
		session_slot: ip
	}, "phase"],
	door_superseded: [{
		phase: op,
		proposal_id: Z,
		revision: pp,
		sha256: sp,
		code: ap
	}, "proposal_id"],
	door_approved: [_p, "proposal_id"],
	door_rejected: [_p, "proposal_id"],
	risky_action_proposed: [{
		proposal_id: Z,
		action_digest: sp,
		descriptor: fp
	}, "proposal_id"],
	risky_action_approved: [vp, "proposal_id"],
	risky_action_rejected: [vp, "proposal_id"],
	risky_action_superseded: [{
		proposal_id: Z,
		action_digest: sp,
		code: ap
	}, "proposal_id"],
	risky_action_consumed: [{
		proposal_id: Z,
		action_digest: sp,
		claim_id: Z,
		session_slot: ip
	}, "proposal_id"],
	risky_action_denied: [{
		proposal_id: Z,
		action_digest: dp(sp),
		denial_id: Z,
		session_slot: ip,
		code: ap
	}, "proposal_id"],
	risky_action_succeeded: [yp, "proposal_id"],
	risky_action_failed: [yp, "proposal_id"],
	approval_resolution_ignored: [{
		resolution_id: Z,
		session_slot: ip,
		mid: ip,
		outcome: up("approved", "rejected"),
		code: ap
	}, "resolution_id"],
	path_denied: [{
		denial_id: Z,
		session_slot: ip,
		room: ap,
		access: up(...Ja),
		code: ap,
		path: dp(cp)
	}, "denial_id"],
	spec_write_prepared: [{
		write_id: Z,
		phase: op,
		document_path: cp,
		base_revision: lp(0, Xf),
		base_sha256: dp(sp),
		revision: pp,
		sha256: sp,
		size_bytes: mp
	}, "write_id"],
	spec_document_written: [{
		write_id: Z,
		phase: op,
		...gp
	}, "write_id"],
	spec_write_recovered: [{
		write_id: Z,
		phase: op,
		document_path: cp,
		outcome: up("completed", "not_applied")
	}, "write_id"],
	spec_write_uncertain: [{
		write_id: Z,
		phase: op,
		document_path: cp,
		code: ap
	}, "write_id"],
	room_tool_answered: [{
		answer_id: Z,
		session_slot: ip,
		mid: ip,
		tool: up("list_room_files", "read_room_file", "write_spec_document", "write_room_file", "submit_phase_output"),
		outcome: up("approved"),
		actor: up("house"),
		reason: up("non_risky_room_tool")
	}, "answer_id"]
};
Object.keys(bp);
function xp(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Sp(e) {
	if (e.event_type !== "domain_event_recorded") return null;
	let t = e.payload;
	if (!xp(t) || t.domain !== "doors_and_guardrails") return null;
	if (e.source.origin !== "house" || e.source.source_type !== Uf) return "untrusted_source";
	let n = Object.keys(t);
	if (n.length !== 4 || ![
		"domain",
		"kind",
		"entity_id",
		"data"
	].every((e) => n.includes(e))) return "invalid_shape";
	let r = t.kind;
	if (typeof r != "string" || !Object.hasOwn(bp, r)) return "unsupported_value";
	let [i, a] = bp[r], o = t.data;
	if (!xp(o)) return "invalid_type";
	let s = Object.keys(o);
	if (!s.every((e) => Object.hasOwn(i, e))) return "unknown_field";
	if (s.length !== Object.keys(i).length) return "missing_field";
	for (let [e, t] of Object.entries(i)) if (!t(o[e])) return "invalid_value";
	return t.entity_id === o[a] ? {
		kind: r,
		data: o,
		eventId: e.event_id,
		sequence: e.sequence,
		ghostId: e.scope.ghost_id,
		sessionSlot: e.scope.session_slot,
		mansionId: e.scope.mansion_id
	} : "mismatch";
}
var Cp = /* @__PURE__ */ new Set([
	"phase_start_reserved",
	"phase_started",
	"phase_start_failed",
	"phase_start_denied",
	"phase_output_ready",
	"revision_started",
	"door_superseded",
	"door_approved",
	"door_rejected",
	"spec_write_prepared",
	"spec_document_written",
	"spec_write_recovered",
	"spec_write_uncertain"
]);
function wp(e) {
	if (!rp(e)) return null;
	let t = e.split("/");
	return t.length !== 4 || t[0] !== ".kiro" || t[1] !== "specs" || t[2].length > 64 || !Yf.test(t[2]) ? null : U.slice(0, 3).find((e) => t[3] === `${e}.md`) ?? null;
}
function Tp(e) {
	return {
		revision: e.revision,
		sha256: e.sha256,
		sizeBytes: e.size_bytes
	};
}
function Ep(e, t) {
	return e.revision === t.revision && e.sha256 === t.sha256 && e.sizeBytes === t.sizeBytes;
}
function Dp(e, t) {
	for (let n of e.pendingWrites.values()) if (n.documentPath === t) return !0;
	return !1;
}
function Op(e, t) {
	return {
		outcome: t,
		actor: e.data.actor,
		eventId: e.eventId,
		sequence: e.sequence
	};
}
function kp(e, t) {
	let { kind: n, data: r } = t;
	if (!Cp.has(n)) return null;
	let i = r.phase, a = e.phases[i];
	if (n === "phase_start_denied") return null;
	if (n === "phase_start_reserved") {
		let t = r.command_id;
		return e.commandIds.has(t) ? "duplicate_command" : U.slice(0, U.indexOf(i)).every((t) => e.phases[t].door === "open") ? a.status !== "ready" && a.status !== "failed" && a.status !== "revision_required" ? "invalid_state" : (e.commandIds.add(t), a.status = "starting", a.reservationId = r.reservation_id, null) : "predecessor_door_sealed";
	}
	if (n === "phase_started" || n === "phase_start_failed") return a.status === "starting" ? r.reservation_id === a.reservationId ? (n === "phase_started" ? (a.status = "working", a.sessionSlot = r.session_slot) : a.status = "failed", null) : "reservation_mismatch" : "invalid_state";
	if (n === "revision_started") {
		let t = r.command_id;
		return e.commandIds.has(t) ? "duplicate_command" : a.status === "revision_required" ? (e.commandIds.add(t), a.status = "working", a.sessionSlot = r.session_slot, null) : "invalid_state";
	}
	if (n === "phase_output_ready") {
		let n = r.proposal_id, o = r.document_path, s = Tp(r);
		if (a.status !== "working") return "invalid_state";
		if (e.proposalIds.has(n)) return "duplicate_proposal";
		let c = wp(o);
		if (i === "implementation" ? c !== null : c !== i) return "document_mismatch";
		if (s.revision <= a.lastRevision) return "stale_revision";
		if (Dp(e, o)) return "write_pending";
		let l = e.documents.get(o);
		return l !== void 0 && !Ep(l, s) ? "artifact_mismatch" : (e.proposalIds.add(n), a.status = "waiting", a.door = "waiting", a.lastRevision = s.revision, a.proposal = {
			proposalId: n,
			phase: i,
			documentPath: o,
			artifactRevision: s,
			status: "pending",
			createdSequence: t.sequence,
			decision: null
		}, null);
	}
	if (n === "door_superseded" || n === "door_approved" || n === "door_rejected") {
		let o = a.proposal;
		if (a.status !== "waiting" || o === null || o.status !== "pending") return "no_pending_proposal";
		if (r.proposal_id !== o.proposalId) return "stale_proposal";
		let s = o.artifactRevision;
		if (r.revision !== s.revision || r.sha256 !== s.sha256) return "stale_revision";
		if (n === "door_superseded") return a.status = "working", a.door = "sealed", a.proposal = {
			...o,
			status: "superseded"
		}, null;
		let c = r.command_id;
		if (e.commandIds.has(c)) return "duplicate_command";
		if (r.document_path !== o.documentPath || r.size_bytes !== s.sizeBytes) return "stale_revision";
		let l = e.documents.get(o.documentPath);
		if (l !== void 0 && !Ep(l, s) || Dp(e, o.documentPath)) return "artifact_changed";
		if (e.commandIds.add(c), n === "door_approved") {
			a.status = "approved", a.door = "open", a.proposal = {
				...o,
				status: "approved",
				decision: Op(t, "approved")
			};
			let n = U[U.indexOf(i) + 1];
			n !== void 0 && e.phases[n].status === "not_started" && (e.phases[n].status = "ready");
		} else a.status = "revision_required", a.door = "rejected", a.proposal = {
			...o,
			status: "rejected",
			decision: Op(t, "rejected")
		};
		return null;
	}
	let o = r.write_id, s = r.document_path;
	if (n === "spec_write_prepared") {
		if (wp(s) !== i) return "document_mismatch";
		if (a.status !== "working" && a.status !== "waiting") return "invalid_state";
		if (e.pendingWrites.has(o) || Dp(e, s)) return "write_pending";
		let t = e.documents.get(s), n = t?.revision ?? 0, c = t?.sha256 ?? null;
		return r.base_revision !== n || r.base_sha256 !== c || r.revision !== n + 1 ? "stale_revision" : (e.pendingWrites.set(o, {
			phase: i,
			documentPath: s,
			artifact: Tp(r)
		}), null);
	}
	let c = e.pendingWrites.get(o);
	return c === void 0 ? "write_missing" : c.phase !== i || c.documentPath !== s ? "write_mismatch" : n === "spec_document_written" ? Ep(Tp(r), c.artifact) ? (e.pendingWrites.delete(o), e.documents.set(s, c.artifact), null) : "write_mismatch" : (n === "spec_write_recovered" && (e.pendingWrites.delete(o), r.outcome === "completed" && e.documents.set(s, c.artifact)), null);
}
var Ap = /* @__PURE__ */ new Set([
	"risky_action_approved",
	"risky_action_rejected",
	"risky_action_superseded",
	"risky_action_consumed",
	"risky_action_denied",
	"risky_action_succeeded",
	"risky_action_failed"
]);
function jp(e) {
	try {
		return na($i(e));
	} catch {
		return null;
	}
}
function Mp(e) {
	let t = bo(e.data.descriptor);
	return t === null || jp(e.data.descriptor) !== e.data.action_digest || t.mansionId !== e.mansionId || t.sessionSlot !== e.sessionSlot ? null : t;
}
function Np(e, t) {
	let { kind: n, data: r } = t;
	if (n === "risky_action_proposed") {
		let n = r.proposal_id;
		if (e.proposals.has(n)) return "duplicate_proposal";
		let i = Mp(t);
		return e.proposals.set(n, {
			proposalId: n,
			ghostId: t.ghostId,
			sessionSlot: t.sessionSlot,
			actionDigest: r.action_digest,
			descriptor: i,
			room: i?.room ?? null,
			status: "pending",
			createdSequence: t.sequence,
			decision: null,
			claimId: null
		}), null;
	}
	if (!Ap.has(n) || n === "risky_action_denied") return null;
	let i = e.proposals.get(r.proposal_id);
	if (i === void 0) return "proposal_missing";
	if (r.action_digest !== i.actionDigest) return "digest_mismatch";
	if (n === "risky_action_approved" || n === "risky_action_rejected") {
		let a = n === "risky_action_approved", o = r.command_id;
		return i.status === "pending" ? e.commandIds.has(o) ? "duplicate_command" : a && i.descriptor === null ? "proposal_blocked" : (e.commandIds.add(o), i.status = a ? "approved" : "rejected", i.decision = Op(t, a ? "approved" : "rejected"), null) : "already_decided";
	}
	return n === "risky_action_superseded" ? i.status !== "pending" && i.status !== "approved" ? "not_supersedable" : (i.status = "superseded", null) : n === "risky_action_consumed" ? i.status === "approved" ? i.descriptor === null || r.session_slot !== i.sessionSlot || t.sessionSlot !== i.sessionSlot ? "identity_mismatch" : (i.status = "consumed", i.claimId = r.claim_id, null) : "not_approved" : i.status === "consumed" ? r.claim_id === i.claimId ? (i.status = n === "risky_action_succeeded" ? "succeeded" : "failed", null) : "claim_mismatch" : "not_consumed";
}
function Pp(e, t) {
	let n = Array.from(e).filter((e) => e.scope.mansion_id === t.mansionId).sort((e, t) => e.sequence - t.sequence || (e.event_id < t.event_id ? -1 : +(e.event_id > t.event_id))), r = Object.fromEntries(U.map((e, t) => [e, {
		status: t === 0 ? "ready" : "not_started",
		door: "sealed",
		proposal: null,
		reservationId: null,
		sessionSlot: null,
		lastRevision: 0
	}])), i = {
		phases: r,
		documents: /* @__PURE__ */ new Map(),
		pendingWrites: /* @__PURE__ */ new Map(),
		proposalIds: /* @__PURE__ */ new Set(),
		commandIds: /* @__PURE__ */ new Set()
	}, a = {
		proposals: /* @__PURE__ */ new Map(),
		commandIds: /* @__PURE__ */ new Set()
	}, o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), c = [], l = 0;
	for (let e of n) {
		l = Math.max(l, e.sequence), e.scope.ghost_id !== Wf && !s.has(e.scope.session_slot) && s.set(e.scope.session_slot, e.scope.ghost_id);
		let t = e.payload, n = xp(t) ? t.mid : void 0;
		if (typeof n == "string" && e.source.origin === "crew") {
			let t = JSON.stringify([e.scope.session_slot, n]);
			e.event_type === "approval_requested" && !o.has(t) ? o.set(t, {
				slot: e.scope.session_slot,
				mid: n,
				requestedSequence: e.sequence,
				toolName: null,
				actionDigest: null,
				proposalId: null
			}) : e.event_type === "approval_decided" && o.delete(t);
		}
		let r = Sp(e);
		if (r !== null) {
			if (typeof r == "string") c.push({
				sequence: e.sequence,
				eventId: e.event_id,
				kind: "invalid_payload",
				code: r
			});
			else for (let e of [kp(i, r), Np(a, r)]) e !== null && c.push({
				sequence: r.sequence,
				eventId: r.eventId,
				kind: r.kind,
				code: e
			});
		}
	}
	let u = Array.from(a.proposals.values(), (e) => ({
		proposalId: e.proposalId,
		ghostId: e.ghostId,
		sessionSlot: e.sessionSlot,
		room: e.room,
		status: e.status,
		actionDigest: e.actionDigest,
		descriptor: e.descriptor,
		createdSequence: e.createdSequence,
		decision: e.decision
	})), d = U.map((e) => {
		let t = r[e], n = t.sessionSlot === null ? void 0 : s.get(t.sessionSlot);
		return {
			phase: e,
			status: t.status,
			ghostIds: n === void 0 ? [] : [n],
			door: {
				status: t.door,
				proposal: t.proposal
			}
		};
	}), f = Array.from(o.values());
	return {
		projection: {
			mansionId: t.mansionId,
			version: l,
			integrity: t.integrity ?? "valid",
			waitingCount: d.filter((e) => e.door.proposal?.status === "pending").length + u.filter((e) => e.status === "pending").length + f.length,
			phases: d,
			riskyProposals: u,
			pendingPermissions: f,
			readOnly: t.readOnly === !0
		},
		diagnostics: c
	};
}
// src/core/replay-timeline.ts
var Fp = {
	fixture_unavailable: "The replay recording could not be loaded.",
	invalid_record: "A record could not be read and was left out.",
	unsupported_schema: "A record uses an unsupported schema and was left out.",
	integrity_failed: "The log failed its integrity check. Only the records before the failure are replayed.",
	invalid_transition: "A workflow record was not a valid step and changed nothing.",
	missing_predecessor: "A record names a predecessor that is not in the log.",
	causal_cycle: "A record names a predecessor that does not come before it.",
	conflicting_variant: "Several records describe one event. One was chosen by the canonical rule.",
	contract_unavailable: "The replay contract is unavailable. The last valid state is kept."
};
function Ip(e, t = {}) {
	return {
		code: e,
		...t.line === void 0 ? {} : { line: t.line },
		...t.recordId === void 0 ? {} : { recordId: t.recordId },
		safeDetail: Fp[e]
	};
}
function Lp(e) {
	let t = { line: e.line };
	switch (e.code) {
		case "unsupported_schema": return Ip("unsupported_schema", t);
		case "duplicate_sequence":
		case "missing_sequence":
		case "hash_mismatch":
		case "hash_link_broken":
		case "mixed_integrity_mode": return Ip("integrity_failed", t);
		default: return Ip("invalid_record", t);
	}
}
function Rp(e, t) {
	let n = { recordId: t.get(e.event_id) };
	return e.code === "conflicting_variant" ? Ip("conflicting_variant", n) : Ip(e.kind === "forward" ? "causal_cycle" : "missing_predecessor", n);
}
function zp(e) {
	return new Map(e.map((e) => [e.event_id, e.record_id]));
}
function Bp(e, t = {}) {
	let n = ya(Array.from(e)), r = zp(n.events);
	return {
		records: n.events,
		diagnostics: [...t.diagnostics ?? [], ...n.diagnostics.map((e) => Rp(e, r))],
		integrityOk: t.integrityOk !== !1
	};
}
function Vp(e) {
	let t = Lf(e);
	return Bp(t.events, {
		diagnostics: t.diagnostics.map(Lp),
		integrityOk: t.integrityOk
	});
}
function Hp(e, t) {
	let n = Array.from(e), r = Array.from(t);
	for (let e = 0; e < Math.min(n.length, r.length); e += 1) {
		let t = n[e].codePointAt(0) - r[e].codePointAt(0);
		if (t !== 0) return t;
	}
	return n.length - r.length;
}
function Up(e, t) {
	let n = t.integrityOk !== !1, r = e.events, i = zp(r), a = [], o = Array.from(new Set(r.map((e) => e.scope.mansion_id))).sort(Hp).map((e) => {
		let t = Pp(r, {
			mansionId: e,
			integrity: n ? "valid" : "corrupt",
			readOnly: !0
		});
		for (let e of t.diagnostics) a.push(Ip("invalid_transition", { recordId: i.get(e.eventId) }));
		return t.projection;
	});
	return {
		ghosts: e.snapshots,
		transitions: e.transitions,
		workflows: o,
		integrity: n ? a.length > 0 ? "diagnostic" : "valid" : "incompatible",
		validRecordCount: r.length,
		diagnostics: a
	};
}
function Wp(e, t = {}) {
	return Up(Vf(e), t);
}
function Gp(e, t = {}) {
	return Up(Hf(Bf(zf, e).log), t);
}
function Kp(e) {
	return (t) => Wp(t, { integrityOk: e.integrityOk });
}
function qp(e, t) {
	return e.workflows.find((e) => e.mansionId === t) ?? null;
}
var Jp = {
	parse: Vp,
	select: (e) => Bp(e),
	fold: Wp,
	foldLive: Gp
}, Yp = "Recorded event", Xp = "Operator";
function Zp(e) {
	let t = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), n = Array.from(t);
	return n.length <= 160 ? t : `${n.slice(0, 159).join("")}…`;
}
function Qp(e) {
	return typeof e == "object" && e && !Array.isArray(e) ? e : {};
}
function $p(e, t, n) {
	let r = t[n];
	return typeof r == "string" && Object.hasOwn(e, r) ? e[r] : null;
}
var em = Object.fromEntries(Eo.map((e) => [e.id, e.name])), tm = {
	approved: "approved",
	rejected: "rejected",
	denied: "rejected"
}, nm = {
	run_started: "Run started",
	ghost_progressed: "Progress reported",
	message_recorded: "Message recorded",
	message_updated: "Message updated",
	response_segment_started: "Response started",
	response_chunk_recorded: "Response text recorded",
	crew_turn_ended: "Crew turn ended",
	crew_error_observed: "Crew error observed",
	run_completed: "Run completed",
	run_blocked: "Run blocked",
	run_failed: "Run failed",
	tool_started: "Tool call started",
	tool_updated: "Tool call updated",
	tool_finished: "Tool call finished",
	approval_requested: "Approval requested",
	approval_decided: "Approval decided",
	decision_recorded: "Decision recorded",
	domain_event_recorded: "House event recorded",
	source_event_observed: "Source event observed"
}, rm = {
	phase_start_reserved: "Phase start reserved",
	phase_started: "Phase started",
	phase_start_failed: "Phase start failed",
	phase_start_denied: "Phase start denied",
	phase_output_ready: "Phase output ready for the Door",
	revision_started: "Revision started",
	door_superseded: "Door proposal superseded",
	door_approved: "Door approved",
	door_rejected: "Door rejected",
	risky_action_proposed: "Risky action proposed",
	risky_action_approved: "Risky action approved",
	risky_action_rejected: "Risky action rejected",
	risky_action_superseded: "Risky action superseded",
	risky_action_consumed: "Approved action claimed",
	risky_action_denied: "Risky action denied",
	risky_action_succeeded: "Approved action succeeded",
	risky_action_failed: "Approved action failed",
	approval_resolution_ignored: "Approval resolution ignored",
	path_denied: "Path access denied",
	spec_write_prepared: "Spec document write prepared",
	spec_document_written: "Spec document written",
	spec_write_recovered: "Spec document write recovered",
	spec_write_uncertain: "Spec document write uncertain",
	room_tool_answered: "Room tool approved by the house"
};
function im(e) {
	let t = Sp(e);
	if (t === null) return nm.domain_event_recorded;
	if (typeof t == "string") return "Workflow record refused";
	let n = rm[t.kind], r = t.data.phase;
	return typeof r == "string" && U.includes(r) ? `${n}: ${G[r]}` : n;
}
function am(e) {
	let t = Object.hasOwn(nm, e.event_type) ? nm[e.event_type] : void 0;
	if (t === void 0) return Yp;
	let n = Qp(e.payload);
	switch (e.event_type) {
		case "run_started": {
			let e = $p(em, n, "room");
			return e === null ? t : `${t} in the ${e}`;
		}
		case "run_blocked":
		case "run_failed": {
			let e = $p(Ur, n, "reason");
			return e === null ? t : `${t}: ${e}`;
		}
		case "tool_started": return n.is_shell === !0 ? "Shell tool call started" : t;
		case "approval_decided": {
			let e = $p(tm, n, "outcome");
			return e === null ? t : `${t}: ${e}`;
		}
		case "crew_turn_ended": return n.needs_input === !0 ? `${t}: needs input` : t;
		case "domain_event_recorded": return im(e);
		default: return t;
	}
}
function om(e) {
	let t = e.scope.ghost_id;
	return t === "house-operator" ? Xp : Zp(qr(t));
}
function sm(e, t) {
	return {
		recordId: e.record_id,
		eventId: e.event_id,
		eventType: Object.hasOwn(nm, e.event_type) ? e.event_type : "unknown",
		actorLabel: om(e),
		summary: Zp(am(e)),
		presentationOffsetMs: t
	};
}
var cm = 4e3, lm = 1e3;
function um(e, t) {
	let n = e.occurred_at_ms, r = t.occurred_at_ms, i = Number.isSafeInteger(n) && Number.isSafeInteger(r) ? r - n : 0;
	return Math.min(Math.max(i > 0 ? i : lm, 250), cm);
}
function dm(e) {
	let t = [], n = 0;
	return e.forEach((r, i) => {
		i > 0 && (n += um(e[i - 1], r)), t.push(n);
	}), t;
}
function fm(e) {
	let t = dm(e.records);
	return {
		records: e.records,
		timeline: e.records.map((e, n) => sm(e, t[n])),
		diagnostics: e.diagnostics,
		integrityOk: e.integrityOk
	};
}
function pm(e) {
	return {
		records: [],
		timeline: [],
		diagnostics: [Ip(e)],
		integrityOk: !0
	};
}
// src/core/seance-api.ts
var mm = "/apps/haunted-house/api/mansions";
function hm(e) {
	return `${mm}/${encodeURIComponent(e)}/seance/ingest`;
}
function gm(e, t, n = 500) {
	return `${mm}/${encodeURIComponent(e)}/seance/events?after_sequence=${t}&limit=${n}`;
}
function _m(e) {
	return `${mm}/${encodeURIComponent(e)}/seance/reconcile`;
}
var vm = new Set(Di), ym = 160, bm = 20;
function xm(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Sm(e) {
	return {
		ok: !1,
		diagnostic: {
			code: "persistence_failed",
			safe_detail: e
		}
	};
}
function Cm(e) {
	if (!xm(e)) return null;
	let t = typeof e.code == "string" && vm.has(e.code) ? e.code : "persistence_failed", n = typeof e.safe_detail == "string" ? e.safe_detail : e.reason, r = typeof n == "string" ? n.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, ym) : "", i = typeof e.line == "number" && Number.isSafeInteger(e.line) && e.line > 0 ? e.line : null;
	return i === null ? {
		code: t,
		safe_detail: r
	} : {
		code: t,
		safe_detail: r,
		line: i
	};
}
function wm(e) {
	if (!xm(e)) return Sm("The backend sent an unexpected response.");
	if (!Array.isArray(e.events)) return Sm("The backend response has no event list.");
	let t = e.highest_sequence;
	if (typeof t != "number" || !Number.isSafeInteger(t) || t < 0) return Sm("The backend response has no valid highest Sequence.");
	let n = [];
	if (Array.isArray(e.diagnostics)) for (let t of e.diagnostics.slice(0, bm)) {
		let e = Cm(t);
		e !== null && n.push(e);
	}
	let r = [];
	for (let t of e.events) {
		let e = ma(t);
		e.ok ? r.push(e.value) : n.length < bm && n.push(e.diagnostic);
	}
	let i = Array.isArray(e.reconcile_slots) ? e.reconcile_slots.filter((e) => typeof e == "string" && e.length > 0 && e.length <= 160).slice(0, 8) : [], a = e.next_event_in_ms;
	return {
		ok: !0,
		page: {
			events: r,
			highestSequence: t,
			diagnostics: n,
			reconcileSlots: i,
			nextEventInMs: typeof a == "number" && Number.isFinite(a) && a >= 0 ? a : null
		}
	};
}
function Tm(e) {
	if (typeof e != "object" || !e) return null;
	let t = e.status;
	return typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599 ? t : null;
}
var Em = 4096;
function Dm(e) {
	if (typeof e != "object" || !e) return null;
	let t = e.body;
	if (typeof t != "string" || t.length > Em) return null;
	try {
		let e = JSON.parse(t);
		if (!xm(e) || !xm(e.error)) return null;
		let n = e.error.code;
		return typeof n == "string" && /^[a-z_]{1,64}$/.test(n) ? n : null;
	} catch {
		return null;
	}
}
function Om(e, t) {
	if (typeof e != "object" || !e) return null;
	let n = e.body;
	if (typeof n != "string" || n.length > 65536) return null;
	let r;
	try {
		r = JSON.parse(n);
	} catch {
		return null;
	}
	if (!xm(r) || !Array.isArray(r.diagnostics)) return null;
	let i = /* @__PURE__ */ new Map();
	for (let e of r.diagnostics) {
		if (!xm(e)) return null;
		let { index: n, code: r } = e;
		if (typeof n != "number" || !Number.isInteger(n) || n < 0 || n >= t || typeof r != "string" || !/^[a-z_]{1,64}$/.test(r)) return null;
		i.has(n) || i.set(n, r);
	}
	return i.size === 0 ? null : Array.from(i, ([e, t]) => ({
		index: e,
		code: t
	})).sort((e, t) => e.index - t.index);
}
function km(e) {
	return e !== null && e >= 400 && e < 500 && e !== 408 && e !== 429;
}
// src/adapters/attic-log-source.ts
var Am = {
	status: "loading",
	selection: null,
	safeMessage: null
}, jm = {
	status: "error",
	selection: null,
	safeMessage: Fp.fixture_unavailable
}, Mm = {
	records: [],
	diagnostics: [],
	integrityOk: !0
};
function Nm(e) {
	return {
		status: "ready",
		selection: e,
		safeMessage: null
	};
}
function Pm(e, t) {
	return {
		...e,
		records: e.records.filter((e) => e.scope.mansion_id === t)
	};
}
async function Fm(e, t) {
	let n;
	try {
		n = await e.load();
	} catch {
		return jm;
	}
	return typeof n == "string" ? Nm(Pm(Jp.parse(n), t)) : jm;
}
async function Im(e, t) {
	let n = [], r = [], i = /* @__PURE__ */ new Set(), a = 0;
	try {
		for (let o = 0; o < 200; o += 1) {
			let o = wm(await e.get(gm(t, a, 500)));
			if (!o.ok) return jm;
			for (let e of o.page.diagnostics) {
				let t = Lp(e), n = `${t.code}:${t.line ?? ""}`;
				i.has(n) || r.length >= 50 || (i.add(n), r.push(t));
			}
			let s = a;
			for (let e of o.page.events) e.scope.mansion_id === t && n.push(e), s = Math.max(s, e.sequence);
			if (s === a || s >= o.page.highestSequence) break;
			a = s;
		}
	} catch (e) {
		return Tm(e) === 404 && Dm(e) === "log_not_found" ? Nm(Mm) : jm;
	}
	return Nm(Bp(n, {
		diagnostics: r,
		integrityOk: !r.some((e) => e.code === "integrity_failed")
	}));
}
function Lm(e) {
	let t = be(), i = c(t);
	i.current = t;
	let [a, o] = l(0), [s, u] = l(Am);
	r(() => {
		let t = !1;
		return u(Am), (Nt === null ? Im({ get: (e) => i.current.get(e) }, e) : Fm(Nt, e)).then((e) => {
			t || u(e);
		}), () => {
			t = !0;
		};
	}, [e, a]);
	let d = n(() => o((e) => e + 1), []);
	return {
		result: s,
		mode: Nt === null ? "live" : "replay",
		reload: d
	};
}
// src/core/replay-reducer.ts
var Rm = [
	.5,
	1,
	2
], zm = {
	invalid_cursor: "That position is not an event of this replay.",
	invalid_speed: "Playback speed must be 0.5×, 1× or 2×.",
	invalid_command: "That replay command is not supported.",
	contract_unavailable: "The replay could not show that position. The last valid state is kept."
};
function Bm(e) {
	return Rm.includes(e);
}
function Vm(e, t) {
	return typeof t == "number" && Number.isInteger(t) && t >= 0 && t <= e.records.length;
}
function Hm(e) {
	return {
		code: e,
		safeDetail: zm[e]
	};
}
function Um(e, t) {
	return {
		status: "paused",
		cursor: 0,
		speed: 1,
		generation: 0,
		projection: t(e.records.slice(0, 0)),
		commandError: null
	};
}
function Wm(e, t) {
	return e.commandError?.code === t ? e : {
		...e,
		commandError: Hm(t)
	};
}
function Gm(e) {
	return e.commandError === null ? e : {
		...e,
		commandError: null
	};
}
function Km(e, t, n, r, i) {
	let a;
	try {
		a = i(e.records.slice(0, n));
	} catch {
		return {
			...t,
			status: t.status === "playing" ? "paused" : t.status,
			generation: t.generation + 1,
			commandError: Hm("contract_unavailable")
		};
	}
	return {
		...t,
		status: r,
		cursor: n,
		projection: a,
		generation: t.generation + 1,
		commandError: null
	};
}
function qm(e, t, n, r) {
	let i = e.records.length;
	switch (n.kind) {
		case "play":
		case "resume": return t.status === "playing" ? Gm(t) : i === 0 ? t.status === "complete" ? Gm(t) : {
			...t,
			status: "complete",
			commandError: null
		} : t.cursor >= i ? Km(e, t, 0, "playing", r) : {
			...t,
			status: "playing",
			generation: t.generation + 1,
			commandError: null
		};
		case "pause": return t.status === "playing" ? {
			...t,
			status: "paused",
			generation: t.generation + 1,
			commandError: null
		} : Gm(t);
		case "restart": return t.status === "paused" && t.cursor === 0 ? Gm(t) : Km(e, t, 0, "paused", r);
		case "set_speed": return Bm(n.speed) ? n.speed === t.speed ? Gm(t) : {
			...t,
			speed: n.speed,
			generation: t.status === "playing" ? t.generation + 1 : t.generation,
			commandError: null
		} : Wm(t, "invalid_speed");
		case "seek": {
			if (!Vm(e, n.cursor)) return Wm(t, "invalid_cursor");
			let a = n.cursor === i ? "complete" : t.status === "playing" ? "playing" : "paused";
			return Km(e, t, n.cursor, a, r);
		}
		case "step": {
			if (t.status !== "playing" || n.generation !== t.generation || t.cursor >= i) return t;
			let a = t.cursor + 1;
			return Km(e, t, a, a === i ? "complete" : "playing", r);
		}
		default: return Wm(t, "invalid_command");
	}
}
function Jm(e, t) {
	if (t.status !== "playing" || t.cursor >= e.timeline.length) return null;
	let n = e.timeline[t.cursor].presentationOffsetMs, r = t.cursor === 0 ? 0 : e.timeline[t.cursor - 1].presentationOffsetMs;
	return Math.max(n - r, 0) / t.speed;
}
function Ym(e, t) {
	return t <= 0 ? "Start of replay" : `Event ${t} of ${e.records.length}`;
}
// src/adapters/replay-controller.ts
var Xm = { schedule(e, t, n) {
	let r = setTimeout(n, e);
	return () => clearTimeout(r);
} };
function Zm(e, t) {
	return e.records.length <= t.records.length && e.records.every((e, n) => e.record_id === t.records[n].record_id);
}
function Qm(e, t, n) {
	let r = e.state.generation + 1, i = Um(t, n);
	if (e.state.cursor === 0 || !Zm(e.model, t)) return {
		...i,
		generation: r
	};
	let a = e.state.cursor;
	try {
		return {
			status: a === t.records.length && e.state.status === "complete" ? "complete" : "paused",
			cursor: a,
			speed: e.state.speed,
			generation: r,
			projection: n(t.records.slice(0, a)),
			commandError: null
		};
	} catch {
		return {
			...i,
			generation: r
		};
	}
}
function $m(e, t, i = Xm) {
	let [a, o] = l(() => ({
		model: e,
		fold: t,
		state: Um(e, t)
	})), s = a;
	(a.model !== e || a.fold !== t) && (s = {
		model: e,
		fold: t,
		state: Qm(a, e, t)
	}, o(s));
	let u = n((e) => {
		o((t) => {
			let n = qm(t.model, t.state, e, t.fold);
			return n === t.state ? t : {
				...t,
				state: n
			};
		});
	}, []), d = c(i);
	d.current = i;
	let { state: f } = s, p = s.model;
	return r(() => {
		let e = Jm(p, f);
		if (e === null) return;
		let t = f.generation;
		return d.current.schedule(e, t, () => u({
			kind: "step",
			generation: t
		}));
	}, [
		p,
		f.generation,
		f.status,
		u
	]), {
		model: s.model,
		state: f,
		command: u
	};
}
// src/adapters/attic-replay.ts
var eh = {
	records: [],
	timeline: [],
	diagnostics: [],
	integrityOk: !0
}, th = pm("fixture_unavailable");
function nh(e, t) {
	return e.integrityOk === t.integrityOk && e.records.length === t.records.length && e.records.every((e, n) => e.record_id === t.records[n].record_id) && e.diagnostics.length === t.diagnostics.length && e.diagnostics.every((e, n) => {
		let r = t.diagnostics[n];
		return e.code === r.code && e.line === r.line && e.recordId === r.recordId;
	});
}
function rh(e, t, n) {
	return {
		workflow: qp(t, n) ?? Pp([], {
			mansionId: n,
			integrity: t.integrity === "incompatible" ? "corrupt" : "valid",
			readOnly: !0
		}).projection,
		snapshots: new Map(t.ghosts.filter((e) => e.mansion_id === n).map((e) => [e.ghost_id, e])),
		transitions: t.transitions,
		highestSequence: t.validRecordCount === 0 ? 0 : e.records[t.validRecordCount - 1]?.sequence ?? 0
	};
}
function ih(e, t) {
	let n = [...e.diagnostics, ...t.diagnostics];
	return {
		integrity: t.integrity === "incompatible" || !e.integrityOk ? "incompatible" : n.length > 0 ? "diagnostic" : "valid",
		validRecordCount: e.records.length,
		diagnostics: n
	};
}
function ah(e, t) {
	let n = Lm(e), { result: i } = n, a = c(null), s = o(() => {
		if (i.status === "ready" && i.selection !== null) {
			let t = fm(i.selection), n = a.current;
			return n !== null && n.mansionId === e && nh(n.model, t) ? n.model : (a.current = {
				mansionId: e,
				model: t
			}, t);
		}
		return i.status === "error" ? (a.current = null, th) : a.current?.mansionId === e ? a.current.model : eh;
	}, [i, e]), l = $m(s, o(() => Kp(s), [s]), t), { state: u } = l;
	r(() => {
		Nt?.present(e, u.cursor);
	}, [e, u.cursor]);
	let d = n.mode, f = o(() => ih(l.model, u.projection), [l.model, u.projection]), p = o(() => d === "replay" ? rh(l.model, u.projection, e) : null, [
		d,
		l.model,
		u.projection,
		e
	]);
	return o(() => ({
		mansionId: e,
		mode: d,
		readOnly: d === "replay",
		source: i.status,
		model: l.model,
		state: u,
		command: l.command,
		refresh: n.reload,
		upstream: f,
		house: p
	}), [
		e,
		d,
		i.status,
		l.model,
		u,
		l.command,
		n.reload,
		f,
		p
	]);
}
var oh = [
	"requirements",
	"design",
	"tasks"
], sh = [
	"queued",
	"active",
	"complete",
	"failed",
	"cancelled",
	"blocked",
	"skipped"
], ch = [
	"crew_capacity",
	"local_capacity",
	"claim_busy"
], lh = [
	"reviewing",
	"pass",
	"changes_requested",
	"blocked"
], uh = [
	"proposed",
	"approved",
	"rejected"
], dh = 1e3, fh = 1024, ph = class extends Error {
	path;
	constructor(e) {
		super("refused"), this.path = e;
	}
};
function Q(e) {
	throw new ph(e);
}
function mh(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function hh(e, t, n, r = []) {
	mh(e) || Q(t);
	for (let i of Object.keys(e)) !n.includes(i) && !r.includes(i) && Q(t);
	for (let r of n) Object.hasOwn(e, r) || Q(`${t}.${r}`);
	return e;
}
function gh(e, t, n) {
	return typeof e == "string" && t.includes(e) || Q(n), e;
}
function _h(e, t, n = 0, r = 2 ** 53 - 1) {
	return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && Q(t), e;
}
function vh(e, t) {
	return typeof e != "boolean" && Q(t), e;
}
function yh(e, t, n) {
	return (!Array.isArray(e) || e.length > n) && Q(t), e;
}
var bh = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/, xh = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
function Sh(e, t, n = 160) {
	return (typeof e != "string" || e.length === 0 || e.length > n || bh.test(e)) && Q(t), e;
}
function Ch(e, t) {
	return e === null ? null : t(e);
}
var wh = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
function Th(e, t) {
	return typeof e == "string" && wh.test(e) || Q(t), e;
}
var Eh = /^[a-z][a-z0-9_]{0,63}$/;
function Dh(e, t) {
	return typeof e == "string" && Eh.test(e) || Q(t), e;
}
var Oh = /^[1-9][0-9]{0,3}\.[1-9][0-9]{0,3}$/;
function kh(e, t) {
	return typeof e == "string" && Oh.test(e) || Q(t), e;
}
var Ah = /^[A-Za-z0-9-]{1,160}$/;
function jh(e, t) {
	let n = Sh(e, t, fh);
	(n.startsWith("/") || n.includes("\\") || n.startsWith("~")) && Q(t);
	for (let e of n.split("/")) (e === "" || e === "." || e === "..") && Q(t);
	return n;
}
function Mh(e, t) {
	new Set(e).size !== e.length && Q(t);
}
function Nh(e, t) {
	let n = yh(e, t, 32).map((e, n) => jh(e, `${t}[${n}]`));
	return Mh(n, t), n;
}
function Ph(e, t, n) {
	return (typeof e != "string" || e.trim() === "" || e.length > n || xh.test(e)) && Q(t), e;
}
function Fh(e, t) {
	let n = hh(e, t, [
		"revision",
		"sha256",
		"size_bytes"
	]);
	return typeof n.sha256 == "string" && /^[0-9a-f]{64}$/.test(n.sha256) || Q(`${t}.sha256`), {
		revision: _h(n.revision, `${t}.revision`, 1),
		sha256: n.sha256,
		sizeBytes: _h(n.size_bytes, `${t}.size_bytes`)
	};
}
function Ih(e, t) {
	return yh(e, t, 50).map((e, n) => {
		let r = `${t}[${n}]`, i = hh(e, r, [
			"code",
			"location",
			"message"
		]);
		return {
			code: Dh(i.code, `${r}.code`),
			location: Sh(i.location, `${r}.location`, 96),
			message: Sh(i.message, `${r}.message`, 200)
		};
	});
}
function Lh(e, t) {
	let n = hh(e, t, [
		"artifact_revision",
		"validated",
		"content",
		"findings"
	]), r = n.content;
	return r !== null && (typeof r != "string" || r.length > 524288) && Q(`${t}.content`), {
		artifactRevision: Fh(n.artifact_revision, `${t}.artifact_revision`),
		validated: vh(n.validated, `${t}.validated`),
		content: r,
		findings: Ih(n.findings, `${t}.findings`)
	};
}
function Rh(e, t, n, r) {
	let i = hh(e, t, [
		"phase",
		"document_path",
		"write_scope",
		"artifact"
	]);
	i.phase !== n && Q(`${t}.phase`);
	let a = jh(i.document_path, `${t}.document_path`);
	return a !== `.kiro/specs/${r}/${n}.md` && Q(`${t}.document_path`), {
		phase: n,
		documentPath: a,
		writeScope: Nh(i.write_scope, `${t}.write_scope`),
		artifact: Ch(i.artifact, (e) => Lh(e, `${t}.artifact`))
	};
}
function zh(e, t) {
	let n = hh(e, t, [
		"status",
		"attempt",
		"run_id",
		"reason_code"
	]);
	return {
		status: gh(n.status, sh, `${t}.status`),
		attempt: _h(n.attempt, `${t}.attempt`, 0, 3),
		runId: Ch(n.run_id, (e) => Th(e, `${t}.run_id`)),
		reasonCode: Ch(n.reason_code, (e) => Dh(e, `${t}.reason_code`))
	};
}
function Bh(e, t) {
	let n = hh(e, t, [
		"dispatch_failures",
		"next_delay_seconds",
		"last_reason"
	]);
	return {
		dispatchFailures: _h(n.dispatch_failures, `${t}.dispatch_failures`, 0, 1e6),
		nextDelaySeconds: _h(n.next_delay_seconds, `${t}.next_delay_seconds`, 0, 15),
		lastReason: gh(n.last_reason, ch, `${t}.last_reason`)
	};
}
function Vh(e, t) {
	let n = hh(e, t, [
		"task_id",
		"title",
		"optional",
		"complete",
		"requirements",
		"writes",
		"wave",
		"selected",
		"outcome",
		"backpressure"
	]), r = yh(n.requirements, `${t}.requirements`, 64).map((e, n) => kh(e, `${t}.requirements[${n}]`));
	Mh(r, `${t}.requirements`);
	let i = vh(n.complete, `${t}.complete`), a = Ch(n.outcome, (e) => zh(e, `${t}.outcome`));
	return a?.status === "complete" && !i && Q(`${t}.outcome`), i && a !== null && a.status !== "complete" && Q(`${t}.outcome`), {
		taskId: kh(n.task_id, `${t}.task_id`),
		title: Sh(n.title, `${t}.title`, 200),
		optional: vh(n.optional, `${t}.optional`),
		complete: i,
		requirements: r,
		writes: Nh(n.writes, `${t}.writes`),
		wave: Ch(n.wave, (e) => _h(e, `${t}.wave`, 0, 200)),
		selected: vh(n.selected, `${t}.selected`),
		outcome: a,
		backpressure: Ch(n.backpressure, (e) => Bh(e, `${t}.backpressure`))
	};
}
function Hh(e, t) {
	let n = hh(e, t, [
		"tasks",
		"waves",
		"findings"
	]), r = yh(n.tasks, `${t}.tasks`, 200).map((e, n) => Vh(e, `${t}.tasks[${n}]`));
	Mh(r.map((e) => e.taskId), `${t}.tasks`);
	let i = new Map(r.map((e) => [e.taskId, e])), a = yh(n.waves, `${t}.waves`, 200).map((e, n) => yh(e, `${t}.waves[${n}]`, 200).map((e, r) => {
		let a = `${t}.waves[${n}][${r}]`, o = kh(e, a);
		return i.get(o)?.wave !== n && Q(a), o;
	}));
	Mh(a.flat(), `${t}.waves`);
	let o = new Set(a.flat());
	for (let [e, n] of r.entries()) n.wave !== null && !o.has(n.taskId) && Q(`${t}.tasks[${e}].wave`);
	return r.filter((e) => e.outcome?.status === "active").length > 3 && Q(`${t}.tasks`), {
		tasks: r,
		waves: a,
		findings: Ih(n.findings, `${t}.findings`)
	};
}
function Uh(e, t) {
	let n = hh(e, t, [
		"run_id",
		"run_sequence",
		"ghost_id",
		"session_slot",
		"phase",
		"task_id",
		"attempt",
		"can_cancel",
		"cancel_requested",
		"can_retry",
		"session_link",
		"summary",
		"reason_code",
		"claim_paths"
	]), r = gh(n.phase, U, `${t}.phase`), i = Ch(n.task_id, (e) => kh(e, `${t}.task_id`));
	i !== null != (r === "implementation") && Q(`${t}.task_id`);
	let a = _h(n.attempt, `${t}.attempt`, 1, 3), o = vh(n.can_cancel, `${t}.can_cancel`), s = vh(n.can_retry, `${t}.can_retry`);
	o && s && Q(`${t}.can_retry`), s && a >= 3 && Q(`${t}.can_retry`);
	let c = Sh(n.session_slot, `${t}.session_slot`), l = n.session_link;
	l === null || typeof l == "string" && Ah.test(l) || Q(`${t}.session_link`);
	let u = Nh(n.claim_paths, `${t}.claim_paths`);
	return u.length > 0 && i === null && Q(`${t}.claim_paths`), {
		runId: Th(n.run_id, `${t}.run_id`),
		runSequence: _h(n.run_sequence, `${t}.run_sequence`, 0, 1e6),
		ghostId: Sh(n.ghost_id, `${t}.ghost_id`),
		sessionSlot: c,
		phase: r,
		taskId: i,
		attempt: a,
		canCancel: o,
		cancelRequested: vh(n.cancel_requested, `${t}.cancel_requested`),
		canRetry: s,
		sessionLink: l,
		summary: Ch(n.summary, (e) => Ph(e, `${t}.summary`, dh)),
		reasonCode: Ch(n.reason_code, (e) => Dh(e, `${t}.reason_code`)),
		claimPaths: u
	};
}
function Wh(e, t) {
	let n = hh(e, t, [
		"cycle",
		"status",
		"ghost_id",
		"session_link",
		"findings",
		"repairs"
	]), r = n.session_link;
	r === null || typeof r == "string" && Ah.test(r) || Q(`${t}.session_link`);
	let i = yh(n.findings, `${t}.findings`, 50).map((e, n) => {
		let r = `${t}.findings[${n}]`, i = hh(e, r, [
			"finding_id",
			"requirement_ids",
			"paths",
			"summary"
		]), a = yh(i.requirement_ids, `${r}.requirement_ids`, 64).map((e, t) => kh(e, `${r}.requirement_ids[${t}]`));
		return Mh(a, `${r}.requirement_ids`), {
			findingId: Th(i.finding_id, `${r}.finding_id`),
			requirementIds: a,
			paths: Nh(i.paths, `${r}.paths`),
			summary: Ph(i.summary, `${r}.summary`, dh)
		};
	});
	Mh(i.map((e) => e.findingId), `${t}.findings`);
	let a = yh(n.repairs, `${t}.repairs`, 50).map((e, n) => {
		let r = `${t}.repairs[${n}]`, a = hh(e, r, [
			"task_id",
			"finding_id",
			"title",
			"writes",
			"status"
		]), o = Th(a.finding_id, `${r}.finding_id`);
		return i.some((e) => e.findingId === o) || Q(`${r}.finding_id`), {
			taskId: kh(a.task_id, `${r}.task_id`),
			findingId: o,
			title: Sh(a.title, `${r}.title`, 200),
			writes: Nh(a.writes, `${r}.writes`),
			status: gh(a.status, uh, `${r}.status`)
		};
	});
	Mh(a.map((e) => e.findingId), `${t}.repairs`), Mh(a.map((e) => e.taskId), `${t}.repairs`);
	let o = gh(n.status, lh, `${t}.status`);
	return o === "pass" && (i.length > 0 || a.length > 0) && Q(`${t}.findings`), {
		cycle: _h(n.cycle, `${t}.cycle`, 1, 3),
		status: o,
		ghostId: Sh(n.ghost_id, `${t}.ghost_id`),
		sessionLink: r,
		findings: i,
		repairs: a
	};
}
var Gh = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function Kh(e, t, n) {
	try {
		let r = hh(e, "$", [
			"schema_version",
			"mansion_id",
			"spec_name",
			"version",
			"integrity",
			"seance_enabled",
			"documents",
			"task_plan",
			"runs",
			"review"
		], ["read_only"]);
		r.schema_version !== 1 && Q("$.schema_version"), r.read_only !== void 0 && typeof r.read_only != "boolean" && Q("$.read_only");
		let i = r.mansion_id;
		(typeof i != "string" || i.length > 40 || !Oi.test(i)) && Q("$.mansion_id"), t !== void 0 && i !== t && Q("$.mansion_id");
		let a = r.spec_name;
		(typeof a != "string" || a.length > 40 || !Gh.test(a)) && Q("$.spec_name"), n !== void 0 && a !== n && Q("$.spec_name"), Array.isArray(r.documents) && r.documents.length === oh.length || Q("$.documents");
		let o = oh.map((e, t) => Rh(r.documents[t], `$.documents[${t}]`, e, a)), s = yh(r.runs, "$.runs", 64).map((e, t) => Uh(e, `$.runs[${t}]`));
		Mh(s.map((e) => e.runId), "$.runs");
		let c = vh(r.seance_enabled, "$.seance_enabled"), l = Ch(r.review, (e) => Wh(e, "$.review"));
		return l !== null && !c && Q("$.review"), {
			ok: !0,
			roomGhosts: {
				mansionId: i,
				specName: a,
				version: _h(r.version, "$.version"),
				integrity: gh(r.integrity, Ka, "$.integrity"),
				readOnly: r.read_only === !0,
				seanceEnabled: c,
				documents: o,
				taskPlan: Ch(r.task_plan, (e) => Hh(e, "$.task_plan")),
				runs: s,
				review: l
			}
		};
	} catch (e) {
		if (e instanceof ph) return {
			ok: !1,
			path: e.path
		};
		throw e;
	}
}
// src/core/room-view.ts
var qh = 4e3;
function Jh(e) {
	switch (e.kind) {
		case "send_feedback": return `feedback:${e.phase}`;
		case "start_workshop": return "workshop";
		case "cancel_run":
		case "retry_run": return `run:${e.runId}`;
	}
}
var Yh = {
	loading: "Loading this room's output. Its controls are off until it arrives.",
	unavailable: "This room's output could not be read. Its controls are off; Door and approval decisions are unaffected.",
	malformed: "The house sent room output this page cannot read. This room's controls are off.",
	read_only: "This is a recording. Nothing can be sent, cancelled or retried here.",
	integrity: "The room's output failed its integrity check. Its controls are off until it is repaired.",
	mismatch: "The room's output and the house's state are from different moments. Refreshing before anything can be sent."
};
function Xh(e, t) {
	return t.documents.some((n) => {
		let r = e.phases[U.indexOf(n.phase)], i = r.door.proposal;
		return i === null || i.status !== "pending" || r.door.status !== "waiting" ? !1 : n.artifact === null ? !t.readOnly : n.artifact.artifactRevision.sha256 !== i.artifactRevision.sha256 || n.artifact.artifactRevision.revision !== i.artifactRevision.revision;
	});
}
function Zh(e) {
	let t = (e, t = !1) => ({
		allowed: !1,
		block: e,
		text: Yh[e],
		needsRefresh: t
	});
	return e.roomGhosts?.readOnly === !0 ? t("read_only") : e.authority.canDecide ? e.roomGhostsStatus === "malformed" ? t("malformed") : e.roomGhosts === null || e.projection === null ? t(e.roomGhostsStatus === "unavailable" ? "unavailable" : "loading") : e.roomGhostsStatus === "ready" ? e.roomGhosts.integrity === "corrupt" || e.projection.integrity === "corrupt" ? t("integrity") : e.roomGhosts.integrity === e.projection.integrity ? e.roomGhosts.integrity === "valid" ? e.roomGhosts.mansionId !== e.projection.mansionId || e.roomGhosts.version !== e.projection.version || Xh(e.projection, e.roomGhosts) ? t("mismatch", !0) : {
		allowed: !0,
		block: null,
		text: null,
		needsRefresh: !1
	} : t("integrity") : t("mismatch", !0) : t(e.roomGhostsStatus) : {
		allowed: !1,
		block: "authority",
		text: e.authority.text,
		needsRefresh: !1
	};
}
var Qh = "Another request is on its way. Wait for it to finish.";
function $h(e, t, n, r, i = null) {
	let a = r === Jh(t), o = n.allowed ? i === null ? r === null ? null : Qh : i : n.text;
	return {
		label: e,
		command: o === null ? t : null,
		busy: a,
		blockedText: a ? null : o
	};
}
var eg = {
	requirements: "Requirements document",
	design: "Design document",
	tasks: "Task plan"
}, tg = {
	unwritten: "Not written yet",
	valid: "Valid: it passed the house's checks",
	invalid: "Not valid: it failed the house's checks",
	unknown: "Not checked here"
};
function ng(e) {
	return e === 1 ? "1 byte" : `${e.toLocaleString("en-US")} bytes`;
}
function rg(e) {
	return e === 0 ? "No findings" : e === 1 ? "1 finding" : `${e} findings`;
}
var ig = /* @__PURE__ */ new Set(["waiting", "revision_required"]);
function ag(e, t, n, r, i) {
	if (!ig.has(e.status) || e.door.status === "open" || !n.runs.some((e) => e.phase === t)) return null;
	let a = `feedback:${t}`, o = r.allowed ? i !== null && i !== a ? Qh : null : r.text;
	return {
		phase: t,
		label: `Ask for a revision of the ${G[t].toLowerCase()}`,
		maxCharacters: qh,
		enabled: o === null && i === null,
		busy: i === a,
		blockedText: o,
		expectedVersion: n.version
	};
}
function og(e) {
	let t = e.trim();
	return t === "" ? {
		ok: !1,
		text: "Write what should change before sending."
	} : t.length > 4e3 ? {
		ok: !1,
		text: `Keep the request under ${qh.toLocaleString("en-US")} characters.`
	} : {
		ok: !0,
		feedback: t
	};
}
function sg(e) {
	for (let t of e.phases) {
		let e = t.door.proposal?.documentPath;
		if (e !== void 0 && e.includes("/")) return e.slice(0, e.lastIndexOf("/"));
	}
}
function cg(e, t, n, r, i, a) {
	let o = t === null ? null : t.phases[U.indexOf(e)], s = o?.door.proposal ?? null, c = n?.documents[oh.indexOf(e)] ?? null, l = c?.artifact ?? null, u = l?.artifactRevision ?? s?.artifactRevision ?? null, d = l !== null || t === null ? void 0 : sg(t), f = (l === null ? s?.documentPath ?? (d === void 0 ? void 0 : `${d}/${e}.md`) : void 0) ?? c?.documentPath ?? `.kiro/specs/${a}/${e}.md`, p = l === null ? u === null ? "unwritten" : "unknown" : l.validated ? "valid" : "invalid", m = s !== null && s.status === "pending" && o?.door.status === "waiting" ? s : null, h = l !== null && m !== null && (l.artifactRevision.sha256 !== m.artifactRevision.sha256 || l.artifactRevision.revision !== m.artifactRevision.revision);
	return {
		phase: e,
		title: eg[e],
		documentPath: f,
		validation: p,
		validationText: tg[p],
		revisionText: u === null ? null : `Revision ${u.revision} (${ng(u.sizeBytes)})`,
		digest: u?.sha256 ?? null,
		digestPrefix: u === null ? null : Ro(u.sha256),
		content: l?.content ?? null,
		contentNote: l?.content == null ? u === null ? "Nothing has been written here yet." : n?.readOnly === !0 ? "The séance log records the path, revision and digest of a document, never its text, so this recording has no text to show." : l === null ? "The document text is not loaded. The facts below come from the door proposal." : "The house did not send the text of this document. Its path, revision and digest are exact." : null,
		findings: l?.findings ?? [],
		findingsText: rg(l?.findings.length ?? 0),
		writeScope: c === null || l === null && f !== c.documentPath ? [f] : c.writeScope,
		doorNote: h ? `The text shown is revision ${l.artifactRevision.revision}. The door proposal covers revision ${m.artifactRevision.revision} (digest ${Ro(m.artifactRevision.sha256)}). The house is refreshing.` : null,
		feedback: o == null || n === null ? null : ag(o, e, n, r, i)
	};
}
var lg = "Opening this session from Haunted House is not available yet. Find it in Crew by its name.", ug = "This is a recording: there is no Crew session to open.";
function dg(e, t = 400) {
	let n = e.replace(/\s+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function fg(e, t, n, r, i, a) {
	let o = t.get(e.ghostId), s = o !== void 0 && o.run_id === e.runId ? o.state : null, c = s === null ? "Earlier run" : Vr[s], l = ko(e.ghostId, a), u = n.version;
	return {
		runId: e.runId,
		ghostId: e.ghostId,
		ghostName: l,
		phase: e.phase,
		taskId: e.taskId,
		state: s,
		stateText: c,
		attemptText: `Attempt ${e.attempt} of 3`,
		summary: e.summary === null ? null : dg(e.summary),
		reasonText: Kr(e.reasonCode),
		writeScope: e.claimPaths,
		cancel: e.cancelRequested ? {
			label: "Cancelling…",
			command: null,
			busy: !1,
			blockedText: "Cancellation was requested. Waiting for Crew to confirm it."
		} : e.canCancel ? $h(`Cancel ${l}'s run`, {
			kind: "cancel_run",
			runId: e.runId,
			expectedVersion: u
		}, r, i) : null,
		retry: e.canRetry ? $h("Retry with a fresh session", {
			kind: "retry_run",
			runId: e.runId,
			expectedVersion: u
		}, r, i) : null,
		exhaustedText: !e.canRetry && !e.canCancel && e.attempt >= 3 && (s === "failed" || s === "blocked") ? "All 3 attempts are used. Nothing retries on its own." : null,
		sessionLink: {
			slotKey: n.readOnly ? null : e.sessionLink,
			label: `Open ${l}'s Crew session (${c})`,
			disabledText: n.readOnly ? ug : e.sessionLink === null ? lg : null
		}
	};
}
var pg = {
	not_selected: "Not selected",
	queued: "Queued",
	backpressure: "Queued: waiting for capacity",
	active: "A Tinker is working on it",
	complete: "Done",
	failed: "Failed",
	cancelled: "Cancelled",
	blocked: "Blocked",
	skipped: "Skipped"
}, mg = {
	crew_capacity: "Crew has no room for another ghost right now",
	local_capacity: "All 3 Tinker seats are taken",
	claim_busy: "Another task is writing the same files"
};
function hg(e) {
	return e.complete ? "complete" : e.outcome === null ? "not_selected" : e.outcome.status === "queued" && e.backpressure !== null ? "backpressure" : e.outcome.status;
}
function gg(e) {
	if (e.complete) return null;
	if (e.backpressure !== null) {
		let { dispatchFailures: t, nextDelaySeconds: n, lastReason: r } = e.backpressure, i = t === 1 ? "1 refusal so far" : `${t} refusals so far`, a = n === 1 ? "1 second" : `${n} seconds`;
		return `${mg[r]}. Next try in ${a} (${i}). This does not use up an attempt.`;
	}
	return Kr(e.outcome?.reasonCode ?? null);
}
function _g(e) {
	return !e.complete && (e.outcome === null || e.outcome.status === "skipped");
}
function vg(e, t, n, r, i) {
	let a = t.taskPlan;
	if (a === null) return null;
	let o = new Map(n.filter((e) => e.taskId !== null).map((e) => [e.runId, e])), s = (e) => {
		let t = hg(e);
		return {
			taskId: e.taskId,
			title: e.title,
			optional: e.optional,
			complete: e.complete,
			status: t,
			statusText: pg[t],
			requirementsText: e.requirements.length === 0 ? "None" : e.requirements.join(", "),
			writes: e.writes,
			attemptText: e.outcome === null || e.outcome.attempt === 0 ? null : `Attempt ${e.outcome.attempt} of 3`,
			detail: gg(e),
			selectable: _g(e),
			run: e.outcome?.runId == null ? null : o.get(e.outcome.runId) ?? null
		};
	}, c = a.waves.map((e, t) => ({
		wave: t,
		title: `Wave ${t + 1}`,
		tasks: a.tasks.filter((e) => e.wave === t).map(s)
	})), l = a.tasks.filter((e) => e.wave === null).map(s);
	l.length > 0 && c.push({
		wave: null,
		title: "Outside the waves",
		tasks: l
	});
	let u = a.tasks.filter((e) => e.outcome?.status === "active").length, d = e?.phases[U.indexOf("tasks")].door.status, f = r.allowed ? d === "open" ? a.findings.length > 0 ? "The task plan has findings. It needs a revision before any task can start." : a.tasks.some(_g) ? i !== null && i !== "workshop" ? Qh : null : "Every open task is already selected or done." : "Sealed door: approve the task plan before any task can start." : r.text;
	return {
		waves: c,
		taskCount: a.tasks.length,
		doneCount: a.tasks.filter((e) => e.complete).length,
		activeCount: u,
		capacityText: `${u} of 3 Tinkers working`,
		findings: a.findings,
		startBlockedText: f,
		startBusy: i === "workshop",
		expectedVersion: t.version
	};
}
function yg(e, t) {
	if (e.startBlockedText !== null || e.startBusy) return null;
	let n = e.waves.flatMap((e) => e.tasks), r = n.filter((e) => t.has(e.taskId)).map((e) => e.taskId);
	return r.length === 0 || r.length !== t.size || n.some((e) => t.has(e.taskId) && !e.selectable) ? null : {
		kind: "start_workshop",
		taskIds: r,
		expectedVersion: e.expectedVersion
	};
}
var bg = {
	study: ["requirements"],
	"drafting-room": ["design"],
	workshop: ["tasks"]
};
function xg(e) {
	let { room: t, projection: n, roomGhosts: r, snapshots: i } = e, a = e.names ?? {}, o = Zh(e), s = t.phases.map((e) => e.phase), c = n === null ? [] : s.map((e) => n.phases[U.indexOf(e)]), l = new Set(t.ghosts.map((e) => e.ghostId)), u = r === null ? [] : r.runs.filter((e) => s.includes(e.phase)).map((t) => fg(t, i, r, o, e.inFlight, a)).reverse(), d = r === null || t.id !== "workshop" ? null : vg(n, r, u, o, e.inFlight);
	return {
		projectionVersion: n?.version ?? 0,
		integrity: n === null ? "uncertain" : r === null ? n.integrity : Sg(n.integrity, r.integrity),
		room: t.id,
		ghosts: Array.from(i.values()).filter((e) => l.has(e.ghost_id)),
		phases: c,
		gate: o,
		documents: bg[t.id].map((t) => cg(t, n, r, o, e.inFlight, e.specName)),
		taskBoard: d,
		runs: u,
		outputNote: r === null ? e.roomGhostsStatus === "loading" ? Yh.loading : e.roomGhostsStatus === "malformed" ? Yh.malformed : Yh.unavailable : null,
		ownsImplementationStart: d !== null
	};
}
function Sg(e, t) {
	return e === "corrupt" || t === "corrupt" ? "corrupt" : e === "uncertain" || t === "uncertain" ? "uncertain" : "valid";
}
function Cg(e, t, n, r, i) {
	if (!n.allowed || r !== null || e === null || t === null || i.expectedVersion !== e.version || i.expectedVersion !== t.version) return null;
	switch (i.kind) {
		case "send_feedback": {
			let n = og(i.feedback);
			if (!n.ok || n.feedback !== i.feedback) return null;
			let r = t.phases[U.indexOf(i.phase)];
			return !ig.has(r.status) || r.door.status === "open" ? null : e.runs.some((e) => e.phase === i.phase) ? i : null;
		}
		case "start_workshop": {
			let n = e.taskPlan;
			if (n === null || n.findings.length > 0 || t.phases[U.indexOf("tasks")].door.status !== "open" || i.taskIds.length === 0 || new Set(i.taskIds).size !== i.taskIds.length) return null;
			let r = new Set(n.tasks.filter(_g).map((e) => e.taskId));
			return i.taskIds.every((e) => r.has(e)) ? i : null;
		}
		case "cancel_run": {
			let t = e.runs.find((e) => e.runId === i.runId);
			return t !== void 0 && t.canCancel && !t.cancelRequested ? i : null;
		}
		case "retry_run": {
			let t = e.runs.find((e) => e.runId === i.runId);
			return t !== void 0 && t.canRetry && t.attempt < 3 ? i : null;
		}
	}
}
var wg = {
	reviewing: "The Medium is reviewing",
	pass: "Passed: the review found nothing to change",
	changes_requested: "Changes requested",
	blocked: "Blocked: the review needs your decision"
}, Tg = {
	proposed: "Proposed: not started",
	approved: "Approved for the Workshop",
	rejected: "Rejected"
};
function Eg(e, t, n = {}) {
	if (e === null || !e.seanceEnabled || e.review === null) return null;
	let r = e.review, i = t.get(r.ghostId)?.state ?? null, a = i === null ? "No run yet" : Vr[i], o = ko(r.ghostId, n);
	return {
		status: r.status,
		statusText: wg[r.status],
		cycleText: `Review cycle ${r.cycle} of 3`,
		limitText: r.status === "blocked" || r.cycle >= 3 && r.status === "changes_requested" ? "Three review cycles ended without a pass. No fourth review starts on its own: the next step is your decision." : null,
		ghostName: o,
		state: i,
		stateText: a,
		findings: r.findings.map((e) => {
			let t = r.repairs.find((t) => t.findingId === e.findingId);
			return {
				findingId: e.findingId,
				summary: dg(e.summary),
				requirementsText: e.requirementIds.length === 0 ? "None" : e.requirementIds.join(", "),
				paths: e.paths,
				repair: t === void 0 ? null : {
					taskId: t.taskId,
					title: t.title,
					writes: t.writes,
					status: t.status,
					statusText: Tg[t.status]
				}
			};
		}),
		sessionLink: {
			slotKey: e.readOnly ? null : r.sessionLink,
			label: `Open ${o}'s Crew session (${a})`,
			disabledText: e.readOnly ? ug : r.sessionLink === null ? lg : null
		}
	};
}
// src/core/room-api.ts
var Dg = "/apps/haunted-house/api";
function Og(e, t) {
	return `${Dg}/mansions/${encodeURIComponent(e)}/specs/${encodeURIComponent(t)}`;
}
function kg(e, t) {
	return `${Og(e, t)}/room-ghosts`;
}
function Ag(e, t) {
	return `${Og(e, t)}/feedback`;
}
function jg(e, t) {
	return `${Og(e, t)}/workshop/start`;
}
function Mg(e) {
	return `${Dg}/room-ghosts/runs/${encodeURIComponent(e)}/cancel`;
}
function Ng(e) {
	return `${Dg}/room-ghosts/runs/${encodeURIComponent(e)}/retry`;
}
function Pg(e, t, n, r) {
	let i = {
		command_id: r,
		expected_version: n.expectedVersion
	};
	switch (n.kind) {
		case "send_feedback": return {
			path: Ag(e, t),
			body: {
				...i,
				phase: n.phase,
				feedback: n.feedback
			}
		};
		case "start_workshop": return {
			path: jg(e, t),
			body: {
				...i,
				task_ids: [...n.taskIds]
			}
		};
		case "cancel_run": return {
			path: Mg(n.runId),
			body: {
				...i,
				mansion_id: e
			}
		};
		case "retry_run": return {
			path: Ng(n.runId),
			body: {
				...i,
				mansion_id: e
			}
		};
	}
}
var Fg = {
	conflict: "The room changed before your request arrived, so nothing was done. Check what is shown now and try again.",
	invalid: "The house refused that request. Nothing was done.",
	not_found: "That run or spec no longer exists. Nothing was done.",
	integrity: "The séance log failed its integrity check, so the house accepts no requests. Nothing was done.",
	contract: "The house cannot do this right now: a contract it depends on is unavailable. Nothing was done.",
	crew: "Crew did not answer in time. Check the state shown before trying again.",
	read_only: "This is a recording. Nothing was done.",
	unavailable: "The house could not be reached. It is not known whether anything was done; the state is being read again."
};
function Ig(e) {
	let t = (e) => ({
		kind: e,
		text: Fg[e]
	});
	switch (Tm(e)) {
		case 409: return t("conflict");
		case 400:
		case 413:
		case 422: return t("invalid");
		case 404: return t("not_found");
		case 423: return t("integrity");
		case 503: return t("contract");
		case 405: return t("read_only");
		case 502:
		case 504: return t("crew");
		default: {
			let n = Dm(e);
			return t(n === "contract_unavailable" ? "contract" : n === "integrity_unavailable" ? "integrity" : "unavailable");
		}
	}
}
function Lg(e) {
	switch (e.kind) {
		case "send_feedback": return "Revision request sent to the same session. The door stays sealed until you approve a new revision.";
		case "start_workshop": return e.taskIds.length === 1 ? "1 task selected. A Tinker starts when a seat and its files are free." : `${e.taskIds.length} tasks selected. Tinkers start as seats and files come free, at most three at a time.`;
		case "cancel_run": return "Cancellation requested. The run stops when Crew confirms it.";
		case "retry_run": return "Retry accepted. A fresh session takes the next attempt.";
	}
}
// src/adapters/room-ghosts-api.ts
var Rg = {
	status: "loading",
	roomGhosts: null,
	inFlight: null,
	notice: null
}, zg = 5e3, Bg = 150, Vg = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
};
function Hg() {
	if (typeof crypto < "u" && typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(16);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
function Ug(e) {
	let { api: t, mansionId: n, specName: r } = e, i = e.timers ?? Vg, a = e.pollMs ?? zg, o = e.refreshDelayMs ?? Bg, s = e.newCommandId ?? Hg, c = Rg, l = /* @__PURE__ */ new Set(), u = !1, d = !0, f = null, p = !1, m = null, h = null, g = "";
	function _(e) {
		if (u) return;
		let t = {
			...c,
			...e
		};
		if (t.status !== c.status || t.roomGhosts !== c.roomGhosts || t.inFlight !== c.inFlight || t.notice !== c.notice) {
			c = t;
			for (let e of [...l]) e(c);
		}
	}
	function v(e) {
		return e !== null && i.clear(e), null;
	}
	function y() {
		let e = c.roomGhosts;
		return c.status !== "ready" || e === null || e.readOnly ? !1 : e.runs.some((e) => e.cancelRequested) || (e.taskPlan?.tasks.some((e) => e.backpressure !== null) ?? !1);
	}
	function b() {
		m = v(m), !u && d && y() && (m = i.set(() => {
			m = null, x();
		}, a));
	}
	function x() {
		return u ? Promise.resolve() : f === null ? (m = v(m), h = v(h), f = Promise.resolve().then(() => t.get(kg(n, r))).then((e) => {
			let t = Kh(e, n, r);
			if (!t.ok) return _({ status: "malformed" });
			let i = c.roomGhosts;
			return i !== null && t.roomGhosts.version < i.version ? _({ status: "ready" }) : _({
				status: "ready",
				roomGhosts: t.roomGhosts
			});
		}, () => _({ status: "unavailable" })).finally(() => {
			f = null, u || (p ? (p = !1, x()) : b());
		}), f) : (p = !0, f);
	}
	async function S() {
		for (await x(); f !== null && !u;) await f;
	}
	return {
		getState: () => c,
		subscribe(e) {
			return l.add(e), () => {
				l.delete(e);
			};
		},
		start() {
			x();
		},
		refresh: x,
		noteWorkflowVersion(e, t = !1) {
			if (u || c.status === "loading" || c.status === "ready" && c.roomGhosts?.version === e && !t) return;
			let n = `${e}:${c.roomGhosts?.version ?? "none"}:${c.status}`;
			n !== g && (g = n, h === null && (h = i.set(() => {
				h = null, x();
			}, o)));
		},
		send(i, a) {
			if (u || a.workflowBusy) return Promise.resolve();
			let o = Cg(c.roomGhosts, a.projection, a.gate, c.inFlight, i);
			if (o === null) return Promise.resolve();
			let l = Pg(n, r, o, s());
			return _({
				inFlight: Jh(o),
				notice: null
			}), Promise.resolve().then(() => t.post(l.path, l.body)).then(() => Lg(o), (e) => Ig(e).text).then((e) => S().then(() => _({
				inFlight: null,
				notice: e
			}))).finally(() => {
				u || e.onCommandSettled?.();
			});
		},
		setVisible(e) {
			u || d === e || (d = e, d ? x() : m = v(m));
		},
		dispose() {
			u = !0, m = v(m), h = v(h), l.clear();
		}
	};
}
var Wg = () => Promise.resolve();
function Gg(e, t, i, a) {
	let o = be(), s = c(o);
	s.current = o;
	let u = c(a);
	u.current = a;
	let d = c(null), [f, p] = l(Rg);
	return r(() => {
		if (e === null) {
			p(Rg);
			return;
		}
		let n = Ug({
			mansionId: e,
			specName: t,
			api: {
				get: (e) => s.current.get(e),
				post: (e, t) => s.current.post(e, t)
			},
			onCommandSettled: () => u.current?.()
		});
		d.current = n, p(n.getState());
		let r = n.subscribe(p), i = () => n.setVisible(document.visibilityState !== "hidden");
		return document.addEventListener("visibilitychange", i), n.start(), () => {
			document.removeEventListener("visibilitychange", i), r(), n.dispose(), d.current === n && (d.current = null);
		};
	}, [e, t]), r(() => {
		i !== null && d.current?.noteWorkflowVersion(i);
	}, [
		i,
		f.roomGhosts,
		f.status
	]), {
		state: f,
		send: n((e, t) => d.current?.send(e, t) ?? Wg(), []),
		refresh: n(() => d.current?.refresh() ?? Wg(), []),
		noteDisagreement: n((e) => d.current?.noteWorkflowVersion(e, !0), [])
	};
}
// src/adapters/seance-live.ts
var Kg = [
	"approval_resolved",
	"chat_chunk",
	"chat_done",
	"chat_error",
	"chat_message",
	"chat_message_update",
	"chat_segment",
	"chat_status",
	"shared_crew.decision",
	"tool_call",
	"tool_result"
], qg = {
	highestSequence: 0,
	snapshots: /* @__PURE__ */ new Map(),
	catchingUp: !1,
	diagnostic: null,
	loaded: !1,
	transitions: [],
	pendingEnvelopes: 0
}, Jg = 5e3, Yg = [
	1e3,
	2e3,
	5e3,
	15e3
], Xg = 500, Zg = 50, Qg = 3e4, $g = 200, e_ = 5e3, t_ = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
}, n_ = {
	code: "persistence_failed",
	safe_detail: "The backend did not confirm the latest ghost activity. Trying again."
}, r_ = {
	code: "invalid_envelope",
	safe_detail: "The backend refused a Crew event, so it was not recorded."
}, i_ = {
	code: "persistence_failed",
	safe_detail: "The séance log of this mansion is not available, so new ghost activity was not recorded."
}, a_ = {
	code: "persistence_failed",
	safe_detail: "Too much ghost activity is waiting for the backend. The oldest events were dropped."
}, o_ = {
	code: "persistence_failed",
	safe_detail: "Could not read the séance log. Showing the last confirmed state."
}, s_ = {
	code: "history_partial",
	safe_detail: "Could not recover missed activity from Crew history."
};
function c_(e) {
	let { api: t, mansionId: n } = e, r = e.timers ?? t_, i = e.pollMs ?? Jg, a = e.retryDelaysMs ?? Yg, o = e.maxQueue ?? Xg, s = qg, c = zf, l = /* @__PURE__ */ new Set(), u = !1, d = !0, f = [], p = !1, m = 0, h = 0, g = null, _ = null, v = null, y = !1, b = !1, x = !1, S = null, C = null, w = null;
	function T(e) {
		if (!u) {
			s = {
				...s,
				...e,
				diagnostic: C ?? w,
				pendingEnvelopes: f.length
			};
			for (let e of [...l]) e(s);
		}
	}
	function E(e) {
		let t = Bf(c, e.events.filter((e) => e.scope.mansion_id === n));
		if (t.applied.length === 0) return;
		c = t.log;
		let r = Hf(c);
		T({
			highestSequence: c.highestSequence,
			snapshots: new Map(r.snapshots.map((e) => [e.ghost_id, e])),
			transitions: r.transitions
		});
	}
	function D(e) {
		return e !== null && r.clear(e), null;
	}
	function O() {
		for (let e of s.snapshots.values()) if (e.state === "working" || e.state === "waiting") return !0;
		return !1;
	}
	function k(e) {
		if (_ = D(_), u || !d) return;
		let t = e === null ? O() ? i : null : Math.min(Math.max(e, Zg), Qg);
		t !== null && (_ = r.set(() => {
			_ = null, A(!1);
		}, t));
	}
	function A(e) {
		return u ? Promise.resolve() : (e && !s.catchingUp && T({ catchingUp: !0 }), v === null ? (_ = D(_), v = Promise.resolve().then(async () => {
			let e = null, r = [];
			try {
				let i = null;
				for (let a = 0; a < $g; a += 1) {
					let a = await t.get(gm(n, c.contiguousSequence, 500));
					if (u) return;
					let o = wm(a);
					if (!o.ok) {
						i = o.diagnostic;
						break;
					}
					let s = c.contiguousSequence;
					if (E(o.page), i ??= o.page.diagnostics[0] ?? null, e = o.page.nextEventInMs, r = o.page.reconcileSlots, c.contiguousSequence >= o.page.highestSequence || c.contiguousSequence === s) break;
				}
				w = i, T({
					catchingUp: b,
					loaded: !0
				});
			} catch (e) {
				if (u) return;
				Tm(e) === 404 && Dm(e) === "log_not_found" ? (w = null, T({
					catchingUp: b,
					loaded: !0
				})) : (w = o_, T({ catchingUp: b }));
			}
			r.length > 0 && ee(r), k(e);
		}).finally(() => {
			if (v = null, !u) {
				if (y) {
					let e = b;
					y = !1, b = !1, A(e);
				}
				M();
			}
		}), v) : (y = !0, b ||= e, v));
	}
	function j() {
		if (h >= a.length) return;
		let e = a[h];
		h += 1, g = r.set(() => {
			g = null, M();
		}, e);
	}
	function M() {
		if (u || p || g !== null || f.length === 0 || v !== null) return;
		let e = m > 0 ? 1 : Math.min(f.length, 100), r = f.slice(0, e);
		p = !0, Promise.resolve().then(() => t.post(hm(n), { envelopes: r })).then((e) => {
			if (p = !1, u) return;
			f[0] === r[0] && f.splice(0, r.length), m > 0 && --m, h = 0;
			let t = wm(e);
			t.ok ? (C = null, E(t.page), T({}), t.page.reconcileSlots.length > 0 && ee(t.page.reconcileSlots), c.contiguousSequence < Math.max(c.highestSequence, t.page.highestSequence) ? A(!1) : k(null)) : (C = t.diagnostic, T({})), M();
		}, (e) => {
			if (p = !1, u) return;
			let t = Tm(e);
			if (t === 404 || t === 409) f[0] === r[0] && f.splice(0, r.length), m = 0, C = i_, T({}), M();
			else if (km(t)) {
				let t = Om(e, r.length);
				if (t !== null && f[0] === r[0]) {
					for (let { index: e } of [...t].reverse()) f.splice(e, 1);
					t.some(({ code: e }) => e !== "unknown_session") && (C = r_), T({}), M();
					return;
				}
				r.length > 1 ? m = r.length : (f[0] === r[0] && f.shift(), m > 0 && --m, C = r_), T({}), M();
			} else C = n_, T({}), j();
		});
	}
	function ee(e) {
		if (u || x || S !== null || e.length === 0) return Promise.resolve();
		x = !0;
		let i = { slots: e.slice(0, 8) };
		return Promise.resolve().then(() => t.post(_m(n), i)).then((e) => {
			if (u) return;
			let t = wm(e);
			t.ok ? (E(t.page), w = t.page.diagnostics[0] ?? w) : w = s_, T({});
		}, () => {
			u || (w = s_, T({}));
		}).finally(() => {
			if (x = !1, !u) return S = r.set(() => {
				S = null;
			}, e_), A(!1);
		});
	}
	return {
		getState: () => s,
		subscribe(e) {
			return l.add(e), () => {
				l.delete(e);
			};
		},
		start() {
			A(!0);
		},
		forward(e, t) {
			u || (f.push({
				type: e,
				data: t
			}), f.length > o && (f.splice(0, f.length - o), C = a_), T({}), g === null && h >= a.length && (h = Math.max(a.length - 1, 0)), M());
		},
		catchUp: () => A(!0),
		reconcile: ee,
		setVisible(e) {
			u || d === e || (d = e, d ? (h = 0, A(!0)) : _ = D(_));
		},
		dispose() {
			u = !0, _ = D(_), g = D(g), S = D(S), l.clear(), f.length = 0;
		}
	};
}
function l_(e) {
	let t = be(), i = c(t);
	i.current = t;
	let a = c(null), [s, u] = l(qg);
	r(() => {
		if (e === null) {
			u(qg);
			return;
		}
		let t = c_({
			mansionId: e,
			api: {
				get: (e) => i.current.get(e),
				post: (e, t) => i.current.post(e, t)
			}
		});
		a.current = t, u(t.getState());
		let n = t.subscribe(u), r = () => t.setVisible(document.visibilityState !== "hidden");
		return document.addEventListener("visibilitychange", r), t.start(), () => {
			document.removeEventListener("visibilitychange", r), n(), t.dispose(), a.current === t && (a.current = null);
		};
	}, [e]);
	let d = o(() => Kg.map((e) => (t) => a.current?.forward(e, t)), []);
	Kg.forEach((e, t) => {
		xe(e, d[t]);
	});
	let f = n(() => {
		a.current?.catchUp();
	}, []);
	return o(() => ({
		state: s,
		catchUp: f
	}), [s, f]);
}
// src/core/house-reducer.ts
var u_ = {
	projection: null,
	projectionStatus: "loading",
	inFlight: null,
	notice: null
};
function d_(e, t) {
	switch (t.type) {
		case "projection_received": {
			let n = e.projection;
			return n !== null && n.mansionId === t.projection.mansionId && t.projection.version < n.version ? e.projectionStatus === "ready" ? e : {
				...e,
				projectionStatus: "ready"
			} : {
				...e,
				projection: t.projection,
				projectionStatus: "ready"
			};
		}
		case "projection_refused": return e.projectionStatus === "malformed" ? e : {
			...e,
			projectionStatus: "malformed"
		};
		case "projection_unavailable": return e.projectionStatus === "unavailable" ? e : {
			...e,
			projectionStatus: "unavailable"
		};
		case "command_sent": return {
			...e,
			inFlight: t.target,
			notice: null
		};
		case "command_settled": return {
			...e,
			inFlight: null,
			notice: t.notice
		};
		case "notice_dismissed": return e.notice === null ? e : {
			...e,
			notice: null
		};
		case "proposal_viewed":
		case "ghost_activity":
		case "timer_elapsed": return e;
		default: return e;
	}
}
function f_(e, t) {
	return e.revision === t.revision && e.sha256 === t.sha256 && e.sizeBytes === t.sizeBytes;
}
function p_(e, t, n) {
	let r = e.projection;
	if (!t.canDecide || e.inFlight !== null || r === null || e.projectionStatus !== "ready" || n.expectedVersion !== r.version) return null;
	switch (n.kind) {
		case "start_phase": {
			let e = r.phases.find((e) => e.phase === n.phase);
			return e?.status === "ready" || e?.status === "failed" || e?.status === "revision_required" ? n : null;
		}
		case "decide_door": {
			let e = r.phases.find((e) => e.phase === n.phase), t = e?.door.proposal;
			return e === void 0 || t == null || e.door.status !== "waiting" || t.status !== "pending" || t.proposalId !== n.proposalId || t.documentPath !== n.documentPath ? null : f_(t.artifactRevision, n.artifactRevision) ? n : null;
		}
		case "decide_risky": {
			let e = r.riskyProposals.find((e) => e.proposalId === n.proposalId);
			return e === void 0 || e.status !== "pending" || e.actionDigest !== n.actionDigest || n.decision === "approve" && e.descriptor === null ? null : n;
		}
	}
}
// src/core/workflow-api.ts
var m_ = "/apps/haunted-house/api/mansions";
function h_(e) {
	return `${m_}/${encodeURIComponent(e)}`;
}
function g_(e) {
	return `${h_(e)}/workflow`;
}
function __(e, t) {
	return `${h_(e)}/phases/${t}/start`;
}
function v_(e, t, n) {
	return `${h_(e)}/doors/${encodeURIComponent(t)}/${n}`;
}
function y_(e, t, n) {
	return `${h_(e)}/approvals/${encodeURIComponent(t)}/${n}`;
}
function b_(e, t, n) {
	let r = {
		command_id: n,
		expected_version: t.expectedVersion
	};
	switch (t.kind) {
		case "start_phase": return {
			path: __(e, t.phase),
			body: r
		};
		case "decide_door": return {
			path: v_(e, t.proposalId, t.decision),
			body: {
				...r,
				phase: t.phase,
				document_path: t.documentPath,
				artifact_revision: To(t.artifactRevision)
			}
		};
		case "decide_risky": return {
			path: y_(e, t.proposalId, t.decision),
			body: {
				...r,
				action_digest: t.actionDigest
			}
		};
	}
}
function x_(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function S_(e, t) {
	if (!x_(e)) return null;
	let { event_id: n, sequence: r, version: i } = e;
	if (typeof n != "string" || !/^e1:[0-9a-f]{64}$/.test(n) || typeof r != "number" || !Number.isSafeInteger(r) || r < 1) return null;
	let a = wo(e.workflow, t);
	return !a.ok || i !== a.projection.version || r > a.projection.version ? null : {
		eventId: n,
		sequence: r,
		projection: a.projection
	};
}
var C_ = {
	conflict: "The house changed before your decision arrived, so nothing was recorded. Check what is shown now and decide again.",
	invalid: "The house refused that request. Nothing was recorded.",
	not_found: "That mansion or proposal no longer exists. Nothing was recorded.",
	integrity: "The séance log failed its integrity check, so the house accepts no decisions. Nothing was recorded.",
	crew: "Crew did not answer in time. Check the state shown before trying again.",
	read_only: "This is a recording. Nothing was recorded.",
	unavailable: "The house could not be reached. It is not known whether anything was recorded; the state is being read again."
}, w_ = 524288;
function T_(e, t) {
	if (typeof e != "object" || !e) return null;
	let n = e.body;
	if (typeof n != "string" || n.length > w_) return null;
	try {
		let e = JSON.parse(n);
		if (!x_(e)) return null;
		let r = wo(e.workflow, t);
		return r.ok ? r.projection : null;
	} catch {
		return null;
	}
}
function E_(e, t) {
	let n = Tm(e), r = T_(e, t), i = (e) => ({
		kind: e,
		text: C_[e],
		projection: r
	});
	switch (n) {
		case 409: return i("conflict");
		case 400:
		case 413:
		case 422: return i("invalid");
		case 404: return i("not_found");
		case 423: return i("integrity");
		case 405: return i("read_only");
		case 502:
		case 504: return i("crew");
		default: return i(Dm(e) === "integrity_unavailable" ? "integrity" : "unavailable");
	}
}
function D_(e) {
	switch (e.kind) {
		case "start_phase": return `${G[e.phase]} started.`;
		case "decide_door": return e.decision === "approve" ? `${G[e.phase]} door approved. The next phase starts only when you start it.` : `${G[e.phase]} door rejected. A revision is required.`;
		case "decide_risky": return e.decision === "approve" ? "Action approved for one attempt." : "Action rejected. It will not run.";
	}
}
// src/adapters/workflow-live.ts
var O_ = 5e3, k_ = 150, A_ = "The house answered in a way this page cannot read. Reading the state again before anything else.", j_ = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
};
function M_() {
	if (typeof crypto < "u" && typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(16);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
function N_(e) {
	let { api: t, mansionId: n } = e, r = e.timers ?? j_, i = e.pollMs ?? O_, a = e.refreshDelayMs ?? k_, o = e.newCommandId ?? M_, s = u_, c = /* @__PURE__ */ new Set(), l = !1, u = !0, d = null, f = !1, p = null, m = null, h = 0;
	function g(e) {
		if (l) return;
		let t = d_(s, e);
		if (t !== s) {
			s = t;
			for (let e of [...c]) e(s);
		}
	}
	function _(e) {
		return e !== null && r.clear(e), null;
	}
	function v() {
		if (s.projectionStatus !== "ready" || s.projection === null) return !0;
		let e = s.projection;
		return e.readOnly ? !1 : h > e.version || e.integrity === "uncertain" || Qo(e).length > 0 || e.phases.some((e) => e.status === "starting");
	}
	function y() {
		p = _(p), !l && u && v() && (p = r.set(() => {
			p = null, b();
		}, i));
	}
	function b() {
		return l ? Promise.resolve() : d === null ? (p = _(p), m = _(m), d = Promise.resolve().then(() => t.get(g_(n))).then((e) => {
			let t = wo(e, n);
			g(t.ok ? {
				type: "projection_received",
				projection: t.projection
			} : { type: "projection_refused" });
		}, () => g({ type: "projection_unavailable" })).finally(() => {
			d = null, l || (f ? (f = !1, b()) : y());
		}), d) : (f = !0, d);
	}
	return {
		getState: () => s,
		subscribe(e) {
			return c.add(e), () => {
				c.delete(e);
			};
		},
		start() {
			b();
		},
		dispatch(e) {
			g(e);
		},
		refresh: b,
		noteCanonical(e) {
			l || s.projection === null || e <= s.projection.version || e <= h || (h = e, m === null && (m = r.set(() => {
				m = null, b();
			}, a)));
		},
		send(r, i) {
			if (l) return Promise.resolve();
			let a = p_(s, i, r);
			if (a === null) return Promise.resolve();
			let c = b_(n, a, o());
			return g({
				type: "command_sent",
				target: Lo(a)
			}), Promise.resolve().then(() => t.post(c.path, c.body)).then((e) => {
				let t = S_(e, n);
				if (t === null) return g({
					type: "command_settled",
					notice: A_
				}), b();
				g({
					type: "projection_received",
					projection: t.projection
				}), g({
					type: "command_settled",
					notice: D_(a)
				}), y();
			}, (e) => {
				let t = E_(e, n);
				if (t.projection !== null && g({
					type: "projection_received",
					projection: t.projection
				}), g({
					type: "command_settled",
					notice: t.text
				}), t.projection === null && t.kind !== "read_only") return b();
				y();
			}).finally(() => {
				l || e.onCommandSettled?.();
			});
		},
		setVisible(e) {
			l || u === e || (u = e, u ? b() : p = _(p));
		},
		dispose() {
			l = !0, p = _(p), m = _(m), c.clear();
		}
	};
}
var P_ = () => Promise.resolve();
function F_(e, t, i) {
	let a = be(), o = c(a);
	o.current = a;
	let s = c(i);
	s.current = i;
	let u = c(null), [d, f] = l(u_);
	return r(() => {
		if (e === null) {
			f(u_);
			return;
		}
		let t = N_({
			mansionId: e,
			api: {
				get: (e) => o.current.get(e),
				post: (e, t) => o.current.post(e, t)
			},
			onCommandSettled: () => s.current?.()
		});
		u.current = t, f(t.getState());
		let n = t.subscribe(f), r = () => t.setVisible(document.visibilityState !== "hidden");
		return document.addEventListener("visibilitychange", r), t.start(), () => {
			document.removeEventListener("visibilitychange", r), n(), t.dispose(), u.current === t && (u.current = null);
		};
	}, [e]), r(() => {
		u.current?.noteCanonical(t);
	}, [t, d.projection]), {
		state: d,
		dispatch: n((e) => u.current?.dispatch(e) ?? void 0, []),
		send: n((e, t) => u.current?.send(e, t) ?? P_(), []),
		refresh: n(() => u.current?.refresh() ?? P_(), [])
	};
}
// src/adapters/house-projection.ts
function I_(e) {
	let t = e.diagnostic;
	if (t === null) return {
		integrity: "valid",
		validRecordCount: e.highestSequence,
		diagnostics: []
	};
	let n = Lp(t);
	return {
		integrity: n.code === "integrity_failed" ? "incompatible" : "diagnostic",
		validRecordCount: e.highestSequence,
		diagnostics: [n]
	};
}
function L_(e) {
	let t = e.ghostNames, n = Io({
		projection: e.workflow,
		projectionStatus: e.workflowStatus,
		canonical: e.canonical,
		readOnly: e.readOnly
	}), r = e.roomInFlight ?? (e.workflowInFlight === null ? null : `workflow:${e.workflowInFlight}`), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map();
	for (let o of ts(e.workflow, e.snapshots.values(), t)) i.set(o.id, ns(e.workflow, o, n, e.workflowInFlight, t)), a.set(o.id, xg({
		room: o,
		specName: e.specName,
		projection: e.workflow,
		snapshots: e.snapshots,
		roomGhosts: e.roomGhosts,
		roomGhostsStatus: e.roomGhostsStatus,
		authority: n,
		inFlight: r,
		names: t
	}));
	return {
		authority: n,
		details: i,
		outputs: a,
		input: {
			mansion: e.mansion,
			workflow: e.workflow,
			authority: n,
			ghosts: e.snapshots,
			rooms: a,
			replay: e.replay,
			ghostNames: t
		}
	};
}
function R_(e) {
	let { mansion: t, ghostNames: i, seanceRoom: a, mode: s } = e, l = t.name, u = t.projectSpec, d = e.replayed ?? null, { state: f, catchUp: p } = l_(l), { state: m, send: h, refresh: g } = F_(l, f.highestSequence, p), _ = n(() => {
		p(), g();
	}, [p, g]), v = Gg(l, u, (d === null ? m.projection : d.workflow)?.version ?? null, _), y = vt(), b = d === null ? m.projection : d.workflow, x = d === null ? m.projectionStatus : "ready", S = d === null ? f.snapshots : d.snapshots, C = d === null ? f.transitions : d.transitions, w = v.state.roomGhosts, T = v.state.status, E = d === null ? f.highestSequence : d.highestSequence, D = s === "replay", O = o(() => ({
		loaded: d !== null || f.loaded,
		catchingUp: d === null && f.catchingUp,
		highestSequence: E,
		diagnostic: f.diagnostic
	}), [
		d,
		f.loaded,
		f.catchingUp,
		f.diagnostic,
		E
	]), k = o(() => e.replay ?? I_(O), [e.replay, O]), A = o(() => L_({
		mansion: t,
		specName: u,
		workflow: b,
		workflowStatus: x,
		snapshots: S,
		canonical: O,
		roomGhosts: w,
		roomGhostsStatus: T,
		replay: k,
		workflowInFlight: m.inFlight,
		roomInFlight: v.state.inFlight,
		ghostNames: i,
		readOnly: D
	}), [
		t,
		u,
		b,
		x,
		S,
		O,
		w,
		T,
		k,
		m.inFlight,
		v.state.inFlight,
		i,
		D
	]), j = o(() => Os(A.input, {
		seanceRoom: a,
		mode: s
	}), [
		A.input,
		a,
		s
	]), M = A.authority, ee = o(() => Zh({
		projection: b,
		roomGhosts: w,
		roomGhostsStatus: T,
		authority: M
	}), [
		b,
		w,
		T,
		M
	]), te = v.noteDisagreement;
	r(() => {
		d === null && ee.needsRefresh && m.projection !== null && te(m.projection.version);
	}, [
		d,
		ee.needsRefresh,
		m.projection,
		v.state.roomGhosts,
		te
	]);
	let ne = o(() => a === "enabled" ? Eg(w, S, i) : null, [
		a,
		w,
		S,
		i
	]), re = c(e.onAnnounce);
	re.current = e.onAnnounce, r(() => {
		m.notice !== null && re.current(m.notice);
	}, [m.notice]), r(() => {
		v.state.notice !== null && re.current(v.state.notice);
	}, [v.state.notice]);
	let ie = v.send, ae = c({
		projection: m.projection,
		gate: ee,
		workflowBusy: m.inFlight !== null
	});
	ae.current = {
		projection: m.projection,
		gate: ee,
		workflowBusy: m.inFlight !== null
	};
	let oe = n((e) => {
		ie(e, ae.current);
	}, [ie]), N = c(M);
	N.current = M;
	let se = n((e) => {
		h(e, N.current);
	}, [h]), ce = n((e) => vs(e, b), [b]), le = n((e) => ko(e, i), [i]), ue = o(() => ({
		transitions: C,
		snapshots: S,
		roomOf: ce,
		nameOf: le
	}), [
		C,
		S,
		ce,
		le
	]);
	return {
		projection: j,
		authority: M,
		loading: d === null && (m.projectionStatus === "loading" || !f.loaded && f.diagnostic === null),
		logProblem: f.diagnostic === null ? null : Qr(f.diagnostic),
		details: A.details,
		outputs: A.outputs,
		review: ne,
		notice: m.notice,
		roomNotice: v.state.notice,
		inFlight: m.inFlight ?? v.state.inFlight,
		send: se,
		sendRoom: oe,
		openSession: y,
		canonical: ue
	};
}
// src/components/room-output-styles.ts
var z_ = "\n.hh-output { display: grid; gap: 10px; }\n.hh-artifact { border: 1px solid var(--border, currentColor); border-top: 3px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-artifact[data-validation='invalid'] { border-top-style: double; border-top-width: 5px; }\n.hh-artifact[data-validation='unwritten'] { border-style: dashed; }\n.hh-artifact-head { display: flex; align-items: flex-start; gap: 6px; }\n.hh-artifact-head svg { flex: none; margin-top: 2px; color: var(--hh-candle); }\n.hh-artifact-note { margin: 0; font-size: 0.875rem; color: var(--muted, inherit); }\n.hh-document { max-height: 24rem; overflow: auto; border: 1px solid var(--border, currentColor); border-radius: 4px;\n  padding: 8px 12px; background: var(--input, transparent); font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-document:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-document > :first-child { margin-top: 0; }\n.hh-document > :last-child { margin-bottom: 0; }\n.hh-md-heading { font-weight: 600; margin: 12px 0 4px; }\n.hh-md-heading[data-level='1'] { font-size: 1.0625rem; }\n.hh-md-heading[data-level='2'] { font-size: 1rem; }\n.hh-document p { margin: 6px 0; }\n.hh-md-quote { border-left: 3px solid var(--border-strong, currentColor); padding-left: 8px; }\n.hh-md-list { list-style: none; margin: 6px 0; padding: 0; display: grid; gap: 2px; }\n.hh-md-item { display: flex; align-items: flex-start; gap: 6px; }\n.hh-md-item svg { flex: none; margin-top: 3px; }\n.hh-md-marker { flex: none; min-width: 0.75rem; color: var(--muted, inherit); }\n.hh-document pre { margin: 6px 0; padding: 6px 8px; overflow: auto; border: 1px solid var(--border, currentColor);\n  border-radius: 4px; }\n.hh-document code, .hh-document pre, .hh-task code, .hh-run code, .hh-findings code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 0.8125rem; }\n.hh-document hr { border: 0; border-top: 1px solid var(--border, currentColor); margin: 8px 0; }\n.hh-findings { margin: 0; padding: 0 0 0 1.25rem; font-size: 0.875rem; display: grid; gap: 2px; }\n.hh-finding-code { color: var(--muted, inherit); }\n.hh-scope { list-style: none; margin: 0; padding: 0; }\n\n.hh-run { display: grid; gap: 4px; }\n.hh-run-summary { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-runs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }\n.hh-runs > li { display: grid; gap: 6px; }\n.hh-session-link { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-size: 0.875rem; }\n.hh-button-quiet { border-style: dotted; padding: 3px 10px; font-size: 0.875rem; }\n.hh-session-link-note { color: var(--muted, inherit); }\n\n.hh-board { border: 1px solid var(--border, currentColor); border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-wave { display: grid; gap: 6px; }\n.hh-tasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }\n.hh-task { border: 1px solid var(--border, currentColor); border-left: 4px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 8px 10px; display: grid; gap: 4px; }\n.hh-task[data-status='active'] { border-left-style: double; border-left-width: 6px; }\n.hh-task[data-status='not_selected'], .hh-task[data-status='skipped'] { border-left-style: dotted; }\n.hh-task[data-status='failed'], .hh-task[data-status='blocked'], .hh-task[data-status='cancelled'] { border-left-style: dashed; }\n.hh-task-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 0.875rem; }\n.hh-task-head input { margin: 0; width: 1rem; height: 1rem; align-self: center; accent-color: var(--accent, auto); }\n.hh-task-head input:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-task-id { font-weight: 600; }\n.hh-tag { border: 1px solid var(--border-strong, currentColor); border-radius: 999px; padding: 0 8px; font-size: 0.75rem; }\n.hh-task-detail { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n\n.hh-revision { display: grid; gap: 6px; }\n.hh-revision label { font-weight: 600; font-size: 0.875rem; }\n.hh-revision textarea { font: inherit; color: inherit; background: var(--input, transparent);\n  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 10px; min-height: 5rem;\n  resize: vertical; width: 100%; box-sizing: border-box; }\n.hh-revision textarea:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-revision textarea[aria-invalid='true'] { border-width: 2px; }\n\n.hh-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }\n", B_ = [
	"requirements",
	"design",
	"tasks"
], V_ = [
	"Open Kiro.",
	"Choose File, then Open Folder.",
	"Pick the folder shown above.",
	"The plan is listed under Specs."
], H_ = "This is a recording. The folder was on the computer that made it, not on this one.";
function U_(e, t) {
	return e.rooms.some((e) => e.doors.some((e) => e.phase === t && e.state === "open"));
}
function W_(e, t) {
	let n = [];
	for (let r of B_) {
		if (!U_(e, r)) continue;
		let i = Hs(r), a = t.documents.find((e) => e.phase === r && i.file !== null && e.path.split("/").pop() === i.file);
		a !== void 0 && n.push({
			term: r,
			plain: i.plain,
			kiro: i.kiro,
			path: a.path
		});
	}
	let r = e.mode === "replay";
	return {
		built: hc(e),
		rows: n,
		tasks: t.tasks.filter((e) => e.complete).map((e) => ({
			taskId: e.taskId,
			title: e.title,
			files: [...e.writes]
		})),
		folder: t.folder,
		folderNote: r ? H_ : null,
		steps: r ? [] : V_
	};
}
// src/core/attic-view.ts
var G_ = "This is a recording. It is read-only: nothing here starts, approves, rejects, retries or opens a Crew session.", K_ = "The Attic replays this mansion’s séance log. Replaying changes nothing: the rooms keep showing the live house.", q_ = "Reading the séance log…", J_ = "This log has no events yet. There is nothing to replay.", Y_ = "No problems were found in this log.", X_ = "Start of replay. No event has been shown yet.", Z_ = "Now showing";
function Q_(e) {
	return e === 0 ? "No events recorded" : e === 1 ? "1 event recorded" : `${e} events recorded`;
}
function $_(e) {
	return `${e}×`;
}
var ev = Rm.map((e) => ({
	speed: e,
	text: $_(e)
}));
function tv(e, t, n) {
	return e === "playing" ? "Playing" : e === "complete" ? n === 0 ? "Nothing to replay" : "Replay complete" : t === 0 ? "Paused at the start" : "Paused";
}
var nv = {
	enabled: !0,
	reason: null
}, rv = (e) => ({
	enabled: !1,
	reason: e
}), iv = "There are no events to replay.", av = "The replay is at its start.", ov = "This is the last event.";
function sv(e, t) {
	let n = e.records.length, r = n === 0, i = t.cursor >= n, a = t.cursor === 0, o = t.status === "playing" ? "pause" : a || i ? "play" : "resume";
	return {
		playAction: o,
		playLabel: o === "pause" ? "Pause" : o === "resume" ? "Resume" : "Play",
		play: o === "pause" ? nv : r ? rv(iv) : nv,
		restart: r ? rv(iv) : a && t.status !== "playing" ? rv(av) : nv,
		previous: r ? rv(iv) : a ? rv(av) : nv,
		next: r ? rv(iv) : i ? rv(ov) : nv,
		seek: r ? rv(iv) : nv,
		previousCursor: Math.max(t.cursor - 1, 0),
		nextCursor: Math.min(t.cursor + 1, n)
	};
}
function cv(e, t) {
	return e.timeline.map((e, n) => ({
		key: e.recordId,
		position: n + 1,
		actor: e.actorLabel,
		summary: e.summary,
		current: n === t - 1,
		played: n < t
	}));
}
function lv(e, t) {
	let n = e.timeline[t - 1];
	return t <= 0 || n === void 0 ? X_ : `${Ym(e, t)}. ${n.actorLabel}: ${n.summary}.`;
}
function uv(e) {
	return `Replay complete. ${Ym(e, e.records.length)}.`;
}
function dv(e) {
	return e <= 0 ? null : e === 1 ? "1 decision waiting at this point" : `${e} decisions waiting at this point`;
}
function fv(e, t, n) {
	let r = e.records.length, i = t.projection, a = qp(i, n), o = e.timeline[t.cursor - 1];
	return {
		statusText: tv(t.status, t.cursor, r),
		positionText: Ym(e, t.cursor),
		totalText: Q_(r),
		currentText: t.cursor <= 0 || o === void 0 ? X_ : `${o.actorLabel}: ${o.summary}`,
		phases: a === null ? [] : a.phases.map((e) => ({
			phase: e.phase,
			status: e.status,
			door: e.door.status,
			text: `${G[e.phase]}: ${Do[e.status]}. ${Oo[e.door.status]}.`
		})),
		ghosts: i.ghosts.filter((e) => e.mansion_id === n && e.ghost_id !== "house-operator").map((e) => ({
			ghostId: e.ghost_id,
			state: e.state,
			text: `${qr(e.ghost_id)}: ${Vr[e.state]}`
		})),
		waitingText: dv(a?.waitingCount ?? 0)
	};
}
function pv(e) {
	return e.line === void 0 ? e.safeDetail : `Line ${e.line}: ${e.safeDetail}`;
}
function mv(e, t) {
	let n = [
		...t.commandError === null ? [] : [t.commandError.safeDetail],
		...e.diagnostics.map(pv),
		...t.projection.diagnostics.map(pv)
	], r = Array.from(new Set(n)), i = r.slice(0, 20), a = r.length - i.length;
	return {
		rows: i.map((e, t) => ({
			key: `${t}:${e}`,
			text: e
		})),
		moreText: a > 0 ? `and ${a} more` : null,
		total: r.length
	};
}
// src/rooms/attic/attic-styles.ts
var hv = "\n.hh-attic { display: grid; gap: 14px; min-width: 0; }\n.hh-attic h4 { margin: 0 0 6px; font-size: 0.9375rem; }\n.hh-attic p { margin: 0; overflow-wrap: anywhere; }\n.hh-attic-section { min-width: 0; display: grid; gap: 8px; }\n.hh-attic-note { display: flex; align-items: flex-start; gap: 6px; min-width: 0; padding: 8px 10px;\n  border: 1px solid var(--hh-border, currentColor); border-left-width: 6px; border-left-style: double; border-radius: 6px;\n  background: var(--hh-surface, transparent); }\n.hh-attic-note svg, .hh-attic-line svg { flex: none; margin-top: 2px; }\n.hh-attic-line { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }\n.hh-attic-status { font-weight: 600; }\n.hh-attic-muted { color: var(--hh-text-muted, inherit); }\n.hh-attic-buttons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }\n.hh-attic-button { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; min-height: 2.25rem;\n  font: inherit; text-align: left; color: var(--hh-text, inherit); background: var(--hh-surface-raised, transparent);\n  border: 1px solid var(--hh-border, currentColor); border-radius: 6px; padding: 6px 12px; cursor: pointer; }\n.hh-attic-button[data-variant='primary'] { color: var(--hh-primary-text, inherit); background: var(--hh-primary, transparent);\n  border-width: 2px; font-weight: 600; }\n.hh-attic-button[aria-disabled='true'] { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted, inherit);\n  background: var(--hh-surface, transparent); font-weight: 400; }\n.hh-attic-button:focus-visible, .hh-attic-range:focus-visible, .hh-attic-speed input:focus-visible,\n.hh-attic-timeline:focus-visible { outline: 2px solid var(--hh-focus, currentColor); outline-offset: 2px; }\n.hh-attic-reasons { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 0.875rem;\n  color: var(--hh-text-muted, inherit); }\n.hh-attic-speed { border: 1px solid var(--hh-border-soft, currentColor); border-radius: 6px; margin: 0; padding: 6px 10px;\n  display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; min-width: 0; }\n.hh-attic-speed legend { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; }\n.hh-attic-speed label { display: inline-flex; align-items: center; gap: 4px; min-height: 2rem; cursor: pointer; }\n.hh-attic-speed input:checked + span { font-weight: 700; text-decoration: underline; }\n.hh-attic-seek { display: grid; gap: 4px; min-width: 0; }\n.hh-attic-range { width: 100%; min-width: 0; margin: 0; accent-color: var(--hh-primary, auto); }\n.hh-attic-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; min-width: 0; }\n.hh-attic-timeline { max-height: 18rem; overflow-y: auto; min-width: 0; padding: 4px;\n  border: 1px solid var(--hh-border-soft, currentColor); border-radius: 6px; }\n.hh-attic-entries { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; min-width: 0; }\n.hh-attic-entry { display: grid; grid-template-columns: 1.25rem 2.5rem minmax(0, 1fr); column-gap: 6px; align-items: start;\n  padding: 4px 6px; border: 1px solid transparent; border-left: 4px solid transparent; border-radius: 4px; }\n.hh-attic-entry[data-played='false'] { color: var(--hh-text-muted, inherit); border-left: 4px dotted var(--hh-border-soft, currentColor); }\n.hh-attic-entry[data-played='true'] { border-left: 4px solid var(--hh-border, currentColor); }\n.hh-attic-entry[aria-current='step'] { font-weight: 700; border: 2px solid var(--hh-border, currentColor);\n  border-left: 6px double var(--hh-accent, currentColor); background: var(--hh-surface-raised, transparent); }\n.hh-attic-entry-mark svg { color: var(--hh-accent, currentColor); }\n.hh-attic-entry-number { font-variant-numeric: tabular-nums; }\n.hh-attic-entry-now { display: block; font-size: 0.8125rem; }\n.hh-attic-diagnostics li { display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px;\n  border: 1px dashed var(--hh-border, currentColor); border-left: 4px solid var(--hh-danger, currentColor); border-radius: 6px; }\n.hh-attic-diagnostics svg { flex: none; margin-top: 2px; color: var(--hh-danger, currentColor); }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-attic[data-motion='low-frequency'] .hh-attic-entry { transition: background-color 0.4s ease-out; }\n}\n.hh-attic[data-motion='none'] *, .hh-attic:not([data-motion]) * { animation: none !important; transition: none !important; }\n@media (prefers-reduced-motion: reduce) {\n  .hh-attic * { animation: none !important; transition: none !important; }\n}\n";
// src/rooms/attic/ReplayControls.tsx
function gv({ transport: e, speed: t, cursor: n, total: r, positionText: a, onPlay: o, onRestart: s, onPrevious: c, onNext: l, onSeek: u, onSpeed: d }) {
	let f = i(), p = (e) => `${f}-${e}-reason`, m = (e, t) => t.enabled ? void 0 : p(e), h = [
		[
			"play",
			e.playLabel,
			e.play
		],
		[
			"restart",
			"Restart",
			e.restart
		],
		[
			"previous",
			"Previous event",
			e.previous
		],
		[
			"next",
			"Next event",
			e.next
		]
	];
	return /* @__PURE__ */ L("div", {
		className: "hh-attic-section",
		"data-attic": "controls",
		children: [
			/* @__PURE__ */ L("div", {
				className: "hh-attic-buttons",
				children: [
					/* @__PURE__ */ L("button", {
						type: "button",
						className: "hh-attic-button",
						"data-variant": "primary",
						"data-action": e.playAction,
						"data-guide-control": "attic:toggle",
						"aria-disabled": !e.play.enabled,
						"aria-describedby": m("play", e.play),
						onClick: o,
						children: [e.playAction === "pause" ? /* @__PURE__ */ I(ae, {
							size: 16,
							"aria-hidden": !0
						}) : /* @__PURE__ */ I(oe, {
							size: 16,
							"aria-hidden": !0
						}), e.playLabel]
					}),
					/* @__PURE__ */ L("button", {
						type: "button",
						className: "hh-attic-button",
						"data-action": "restart",
						"aria-disabled": !e.restart.enabled,
						"aria-describedby": m("restart", e.restart),
						onClick: s,
						children: [/* @__PURE__ */ I(le, {
							size: 16,
							"aria-hidden": !0
						}), "Restart"]
					}),
					/* @__PURE__ */ L("button", {
						type: "button",
						className: "hh-attic-button",
						"data-action": "previous",
						"aria-disabled": !e.previous.enabled,
						"aria-describedby": m("previous", e.previous),
						onClick: c,
						children: [/* @__PURE__ */ I(fe, {
							size: 16,
							"aria-hidden": !0
						}), "Previous event"]
					}),
					/* @__PURE__ */ L("button", {
						type: "button",
						className: "hh-attic-button",
						"data-action": "next",
						"data-guide-control": "attic:next",
						"aria-disabled": !e.next.enabled,
						"aria-describedby": m("next", e.next),
						onClick: l,
						children: [/* @__PURE__ */ I(pe, {
							size: 16,
							"aria-hidden": !0
						}), "Next event"]
					})
				]
			}),
			h.some(([, , e]) => !e.enabled) ? /* @__PURE__ */ I("ul", {
				className: "hh-attic-reasons",
				children: h.map(([e, t, n]) => n.enabled ? null : /* @__PURE__ */ L("li", {
					id: p(e),
					children: [
						t,
						": ",
						n.reason
					]
				}, e))
			}) : null,
			/* @__PURE__ */ L("fieldset", {
				className: "hh-attic-speed",
				children: [/* @__PURE__ */ L("legend", { children: [/* @__PURE__ */ I(C, {
					size: 16,
					"aria-hidden": !0
				}), "Playback speed"] }), ev.map((e) => /* @__PURE__ */ L("label", { children: [/* @__PURE__ */ I("input", {
					type: "radio",
					name: `${f}-speed`,
					value: e.speed,
					checked: t === e.speed,
					onChange: () => d(e.speed)
				}), /* @__PURE__ */ I("span", { children: e.text })] }, e.speed))]
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-attic-seek",
				children: [
					/* @__PURE__ */ L("label", {
						htmlFor: `${f}-seek`,
						children: ["Replay position: ", a]
					}),
					/* @__PURE__ */ I("input", {
						id: `${f}-seek`,
						className: "hh-attic-range",
						type: "range",
						min: 0,
						max: r,
						step: 1,
						value: n,
						"aria-valuetext": a,
						"aria-disabled": !e.seek.enabled,
						"aria-describedby": e.seek.enabled ? void 0 : `${f}-seek-reason`,
						onChange: (t) => {
							e.seek.enabled && u(Number(t.currentTarget.value));
						}
					}),
					e.seek.enabled ? null : /* @__PURE__ */ I("p", {
						className: "hh-attic-muted",
						id: `${f}-seek-reason`,
						children: e.seek.reason
					})
				]
			})
		]
	});
}
// src/rooms/attic/ReplayDiagnostics.tsx
function _v({ diagnostics: e }) {
	return e.rows.length === 0 ? /* @__PURE__ */ L("p", {
		className: "hh-attic-line hh-attic-muted",
		"data-attic": "diagnostics-empty",
		children: [/* @__PURE__ */ I(g, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ I("span", { children: Y_ })]
	}) : /* @__PURE__ */ L("div", {
		className: "hh-attic-section",
		"data-attic": "diagnostics",
		children: [/* @__PURE__ */ I("ul", {
			className: "hh-attic-list hh-attic-diagnostics",
			children: e.rows.map((e) => /* @__PURE__ */ L("li", { children: [/* @__PURE__ */ I(P, {
				size: 16,
				"aria-hidden": !0
			}), /* @__PURE__ */ I("span", { children: e.text })] }, e.key))
		}), e.moreText === null ? null : /* @__PURE__ */ I("p", {
			className: "hh-attic-muted",
			children: e.moreText
		})]
	});
}
// src/rooms/attic/ReplaySummary.tsx
function vv({ status: e }) {
	return I(e === "playing" ? oe : e === "complete" ? g : ae, {
		size: 16,
		"aria-hidden": !0
	});
}
function yv({ summary: e, status: t }) {
	return /* @__PURE__ */ L("div", {
		className: "hh-attic-section",
		"data-attic": "summary",
		children: [
			/* @__PURE__ */ L("p", {
				className: "hh-attic-line hh-attic-status",
				"data-status": t,
				children: [/* @__PURE__ */ I(vv, { status: t }), /* @__PURE__ */ L("span", { children: [
					e.statusText,
					". ",
					e.positionText,
					". ",
					e.totalText,
					"."
				] })]
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-attic-line",
				"data-attic": "current",
				children: [/* @__PURE__ */ I(te, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: e.currentText })]
			}),
			e.phases.length === 0 ? null : /* @__PURE__ */ I("ul", {
				className: "hh-attic-list",
				"aria-label": "Phases and Doors at this point",
				children: e.phases.map((e) => /* @__PURE__ */ L("li", {
					className: "hh-attic-line",
					"data-phase": e.phase,
					"data-status": e.status,
					"data-door": e.door,
					children: [/* @__PURE__ */ I(y, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", { children: e.text })]
				}, e.phase))
			}),
			e.ghosts.length === 0 ? null : /* @__PURE__ */ I("ul", {
				className: "hh-attic-list",
				"aria-label": "Ghosts at this point",
				children: e.ghosts.map((e) => /* @__PURE__ */ L("li", {
					className: "hh-attic-line",
					"data-ghost": e.ghostId,
					"data-state": e.state,
					children: [/* @__PURE__ */ I(w, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", { children: e.text })]
				}, e.ghostId))
			}),
			e.waitingText === null ? null : /* @__PURE__ */ I("p", {
				className: "hh-attic-muted",
				children: e.waitingText
			})
		]
	});
}
// src/rooms/attic/ReplayTimeline.tsx
function bv({ rows: e, label: t }) {
	let n = c(null), i = e.find((e) => e.current)?.key ?? null;
	return r(() => {
		let e = n.current;
		if (e === null) return;
		if (i === null) {
			e.scrollTop = 0;
			return;
		}
		let t = e.querySelector("[aria-current=\"step\"]");
		if (t === null) return;
		let r = t.offsetTop - e.offsetTop;
		r < e.scrollTop ? e.scrollTop = r : r + t.offsetHeight > e.scrollTop + e.clientHeight && (e.scrollTop = r + t.offsetHeight - e.clientHeight);
	}, [i]), e.length === 0 ? /* @__PURE__ */ I("p", {
		className: "hh-attic-muted",
		"data-attic": "timeline-empty",
		children: J_
	}) : /* @__PURE__ */ I("div", {
		className: "hh-attic-timeline",
		role: "group",
		"aria-label": t,
		tabIndex: 0,
		ref: n,
		"data-attic": "timeline",
		children: /* @__PURE__ */ I("ol", {
			className: "hh-attic-entries",
			children: e.map((e) => /* @__PURE__ */ L("li", {
				className: "hh-attic-entry",
				"aria-current": e.current ? "step" : void 0,
				"data-played": e.played,
				"data-position": e.position,
				children: [
					/* @__PURE__ */ I("span", {
						className: "hh-attic-entry-mark",
						children: e.current ? /* @__PURE__ */ I(te, {
							size: 16,
							"aria-hidden": !0
						}) : null
					}),
					/* @__PURE__ */ L("span", {
						className: "hh-attic-entry-number",
						children: [e.position, ". "]
					}),
					/* @__PURE__ */ L("span", { children: [
						e.current ? /* @__PURE__ */ L("span", {
							className: "hh-attic-entry-now",
							children: [Z_, ". "]
						}) : null,
						e.actor,
						": ",
						e.summary
					] })
				]
			}, e.key))
		})
	});
}
// src/rooms/attic/use-attic-panel.ts
function xv(e, t, { watch: i = !0, refresh: a = !0 } = {}) {
	let { model: s, state: l, command: u, mansionId: d, source: f, mode: p, refresh: m } = e, h = c(t);
	h.current = t;
	let g = o(() => sv(s, l), [s, l]), _ = o(() => fv(s, l, d), [
		s,
		l,
		d
	]), v = o(() => cv(s, l.cursor), [s, l.cursor]), y = o(() => mv(s, l), [s, l]), b = c({
		transport: g,
		model: s
	});
	b.current = {
		transport: g,
		model: s
	};
	let x = n(() => {
		let { transport: e } = b.current;
		e.play.enabled && u({ kind: e.playAction });
	}, [u]), S = n(() => {
		let { transport: e, model: t } = b.current;
		e.restart.enabled && (u({ kind: "restart" }), h.current(lv(t, 0)));
	}, [u]), C = n((e) => {
		let { transport: t, model: n } = b.current;
		if (!t[e].enabled) return;
		let r = e === "previous" ? t.previousCursor : t.nextCursor;
		u({
			kind: "seek",
			cursor: r
		}), h.current(lv(n, r));
	}, [u]), w = n(() => C("previous"), [C]), T = n(() => C("next"), [C]), E = n((e) => u({
		kind: "seek",
		cursor: e
	}), [u]), D = n((e) => u({
		kind: "set_speed",
		speed: e
	}), [u]), O = c(l.status);
	r(() => {
		let e = O.current;
		O.current = l.status, i && e === "playing" && l.status === "complete" && h.current(uv(s));
	}, [
		l.status,
		s,
		i
	]), r(() => {
		i && l.commandError !== null && h.current(l.commandError.safeDetail);
	}, [l.commandError, i]), r(() => {
		i && f === "error" && h.current(Fp.fixture_unavailable);
	}, [f, i]);
	let k = c(m);
	return k.current = m, r(() => {
		a && p === "live" && k.current();
	}, [
		p,
		d,
		a
	]), {
		transport: g,
		summary: _,
		rows: v,
		diagnostics: y,
		speed: l.speed,
		cursor: l.cursor,
		total: s.records.length,
		onPlay: x,
		onRestart: S,
		onPrevious: w,
		onNext: T,
		onSeek: E,
		onSpeed: D
	};
}
// src/rooms/attic/AtticPanel.tsx
function Sv({ replay: e, onAnnounce: t, motion: n = "none", watch: r = !0 }) {
	let a = xv(e, t, { watch: r }), o = i(), s = e.source === "loading" && a.total === 0;
	return /* @__PURE__ */ L("div", {
		className: "hh-attic",
		"data-attic-panel": !0,
		"data-mode": e.mode,
		"data-motion": n,
		"data-source": e.source,
		children: [
			/* @__PURE__ */ I("style", { children: hv }),
			/* @__PURE__ */ L("p", {
				className: "hh-attic-note",
				"data-attic": "mode",
				children: [e.readOnly ? /* @__PURE__ */ I(j, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ I(D, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: e.readOnly ? G_ : K_ })]
			}),
			s ? /* @__PURE__ */ L("p", {
				className: "hh-attic-line hh-attic-muted",
				"data-attic": "loading",
				children: [/* @__PURE__ */ I(se, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: q_ })]
			}) : null,
			/* @__PURE__ */ L("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${o}-controls`,
				children: [/* @__PURE__ */ I("h4", {
					id: `${o}-controls`,
					children: "Playback"
				}), /* @__PURE__ */ I(gv, {
					transport: a.transport,
					speed: a.speed,
					cursor: a.cursor,
					total: a.total,
					positionText: a.summary.positionText,
					onPlay: a.onPlay,
					onRestart: a.onRestart,
					onPrevious: a.onPrevious,
					onNext: a.onNext,
					onSeek: a.onSeek,
					onSpeed: a.onSpeed
				})]
			}),
			/* @__PURE__ */ L("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${o}-summary`,
				children: [/* @__PURE__ */ I("h4", {
					id: `${o}-summary`,
					children: "The house at this point"
				}), /* @__PURE__ */ I(yv, {
					summary: a.summary,
					status: e.state.status
				})]
			}),
			/* @__PURE__ */ L("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${o}-timeline`,
				children: [/* @__PURE__ */ I("h4", {
					id: `${o}-timeline`,
					children: "Timeline"
				}), /* @__PURE__ */ I(bv, {
					rows: a.rows,
					label: "Timeline of recorded events"
				})]
			}),
			/* @__PURE__ */ L("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${o}-diagnostics`,
				children: [/* @__PURE__ */ I("h4", {
					id: `${o}-diagnostics`,
					children: "Diagnostics"
				}), /* @__PURE__ */ I(_v, { diagnostics: a.diagnostics })]
			})
		]
	});
}
// src/rooms/attic/ReplayBar.tsx
var Cv = "Recording playback";
function wv({ panel: e, readOnlyText: t, startText: n }) {
	let r = i(), { transport: a } = e, o = (e, t) => t.enabled ? null : /* @__PURE__ */ I("span", {
		className: "hh-ui-visually-hidden",
		id: `${r}-${e}`,
		children: t.reason
	});
	return /* @__PURE__ */ L("div", {
		className: "hh-ui-replay-bar",
		role: "group",
		"aria-label": Cv,
		"data-replay-bar": !0,
		children: [
			/* @__PURE__ */ L("span", {
				className: "hh-ui-replay-label",
				children: [/* @__PURE__ */ I(v, {
					size: 16,
					"aria-hidden": !0
				}), "Recording"]
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-ui-replay-buttons",
				children: [
					/* @__PURE__ */ L("button", {
						type: "button",
						className: "hh-ui-button",
						"data-variant": "primary",
						"data-action": a.playAction,
						"data-guide-control": "replay:toggle",
						"aria-disabled": !a.play.enabled,
						"aria-describedby": a.play.enabled ? void 0 : `${r}-play`,
						onClick: e.onPlay,
						children: [a.playAction === "pause" ? /* @__PURE__ */ I(ae, {
							size: 16,
							"aria-hidden": !0
						}) : /* @__PURE__ */ I(oe, {
							size: 16,
							"aria-hidden": !0
						}), a.playLabel]
					}),
					/* @__PURE__ */ L("button", {
						type: "button",
						className: "hh-ui-button",
						"data-action": "restart",
						"data-guide-control": "replay:restart",
						"aria-disabled": !a.restart.enabled,
						"aria-describedby": a.restart.enabled ? void 0 : `${r}-restart`,
						onClick: e.onRestart,
						children: [/* @__PURE__ */ I(le, {
							size: 16,
							"aria-hidden": !0
						}), "Restart"]
					}),
					o("play", a.play),
					o("restart", a.restart)
				]
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-ui-replay-progress",
				children: [/* @__PURE__ */ I("label", {
					className: "hh-ui-replay-position",
					htmlFor: `${r}-seek`,
					children: e.summary.positionText
				}), /* @__PURE__ */ I("input", {
					id: `${r}-seek`,
					className: "hh-ui-replay-range",
					type: "range",
					min: 0,
					max: e.total,
					step: 1,
					value: e.cursor,
					"aria-label": `Recording position: ${e.summary.positionText}`,
					"aria-valuetext": e.summary.positionText,
					"aria-disabled": !a.seek.enabled,
					style: { "--hh-marks": Math.max(1, e.total) },
					onChange: (t) => {
						a.seek.enabled && e.onSeek(Number(t.currentTarget.value));
					}
				})]
			}),
			/* @__PURE__ */ L("fieldset", {
				className: "hh-ui-replay-speed",
				children: [/* @__PURE__ */ L("legend", { children: [/* @__PURE__ */ I(C, {
					size: 14,
					"aria-hidden": !0
				}), " Speed"] }), ev.map((t) => /* @__PURE__ */ L("label", { children: [/* @__PURE__ */ I("input", {
					type: "radio",
					name: `${r}-speed`,
					value: t.speed,
					checked: e.speed === t.speed,
					onChange: () => e.onSpeed(t.speed)
				}), /* @__PURE__ */ I("span", { children: t.text })] }, t.speed))]
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-ui-note hh-ui-replay-note",
				"data-kind": "read-only",
				"data-block": "read_only",
				children: [/* @__PURE__ */ I(j, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: [t, n === null ? null : /* @__PURE__ */ L("span", {
					"data-replay-start": !0,
					children: [" ", n]
				})] })]
			})
		]
	});
}
// src/core/practice.ts
var Tv = {
	door_approved: {
		subject: "door",
		outcome: "approved"
	},
	door_rejected: {
		subject: "door",
		outcome: "rejected"
	},
	risky_action_approved: {
		subject: "risky",
		outcome: "approved"
	},
	risky_action_rejected: {
		subject: "risky",
		outcome: "rejected"
	}
}, Ev = {
	requirements: "what it must do (the requirements)",
	design: "how it will be built (the design)",
	tasks: "the to-do list (the tasks)",
	implementation: "the finished work"
}, Dv = "Practice. Nothing real changes: this is a recording.";
function Ov(e) {
	let [t, n] = e.split("-"), r = t.charAt(0).toUpperCase() + t.slice(1);
	return n === void 0 ? `the ${r}` : `${r} ${n}`;
}
function kv(e, t) {
	let n = (e.find((e) => e.kind === "risky_action_proposed" && e.data.proposal_id === t)?.data.descriptor)?.arguments?.argv;
	return Array.isArray(n) && n.every((e) => typeof e == "string") ? n.join(" ") : null;
}
function Av(e) {
	let t = e.map(Sp).filter((e) => e !== null && typeof e != "string"), n = /* @__PURE__ */ new Set(), r = [];
	for (let e of t) {
		let i = Tv[e.kind], a = e.data.proposal_id;
		if (!(i === void 0 || typeof a != "string" || n.has(a))) {
			if (n.add(a), i.subject === "door") {
				let t = typeof e.data.phase == "string" ? e.data.phase : "";
				r.push({
					sequence: e.sequence,
					eventId: e.eventId,
					subject: "door",
					proposalId: a,
					ghostId: e.ghostId,
					question: `${Ov(e.ghostId).replace(/^the/, "The")} has finished ${Ev[t] ?? "its work"}. Do you open the door?`,
					choices: ["Open the door", "Keep it shut and ask for changes"],
					recorded: i.outcome
				});
			} else {
				let n = kv(t, a);
				r.push({
					sequence: e.sequence,
					eventId: e.eventId,
					subject: "risky",
					proposalId: a,
					ghostId: e.ghostId,
					question: `${Ov(e.ghostId).replace(/^the/, "The")} wants to run ${n === null ? "a command" : `"${n}"`}. Do you let it?`,
					choices: ["Allow it, once", "Refuse it"],
					recorded: i.outcome
				});
			}
		}
	}
	return r.sort((e, t) => e.sequence - t.sequence);
}
function jv(e, t) {
	return {
		meaning: e.subject === "door" ? t === "approved" ? "Opening the door accepts this version, and the next room may start." : "Keeping it shut stops the next room from starting until the work is changed and shown to you again." : t === "approved" ? "Allowing it lets this exact command run once, in the folder it named, and nothing else." : "Refusing it means nothing runs. The ghost goes back to its work and may ask again for less.",
		recorded: e.recorded === "approved" ? `In the recording, the owner chose: ${e.choices[0].toLowerCase()}.` : `In the recording, the owner chose: ${e.choices[1].toLowerCase()}.`,
		same: t === e.recorded
	};
}
function Mv(e) {
	let t = new Set(e.map((e) => e.scope.ghost_id).filter((e) => e !== "")), n = 0;
	for (let t of e) {
		let e = Sp(t);
		e !== null && typeof e != "string" && (e.kind === "phase_output_ready" || e.kind === "risky_action_proposed") && (n += 1);
	}
	return {
		records: e.length,
		ghosts: t.size,
		waits: n
	};
}
function Nv(e) {
	let t = (e, t, n) => `${e} ${e === 1 ? t : n}`;
	return `This recording holds ${t(e.records, "event", "events")} from ${t(e.ghosts, "ghost", "ghosts")}. The house stopped and waited for a person ${t(e.waits, "time", "times")}.`;
}
// src/rooms/attic/PracticeBoard.tsx
var Pv = "Practice: you decide", Fv = "The recording stops wherever its owner had to decide, and asks you instead. Nothing real changes.", Iv = "Press Play. The recording will stop at the next decision.", Lv = "You have made every decision in this recording.";
function Rv({ practice: e }) {
	let t = i(), { on: n, asking: r, answer: a } = e;
	return /* @__PURE__ */ L("section", {
		className: "hh-ui-practice",
		"aria-label": "Practice",
		"data-practice": n ? "on" : "off",
		children: [
			/* @__PURE__ */ I("p", {
				className: "hh-ui-practice-numbers",
				"data-log-numbers": !0,
				children: Nv(e.numbers)
			}),
			/* @__PURE__ */ L("button", {
				type: "button",
				className: "hh-ui-button",
				"data-practice-toggle": !0,
				"aria-pressed": n,
				"aria-describedby": t,
				onClick: e.toggle,
				children: [
					/* @__PURE__ */ I(T, {
						size: 16,
						"aria-hidden": !0
					}),
					Pv,
					": ",
					n ? "on" : "off"
				]
			}),
			/* @__PURE__ */ I("span", {
				className: "hh-ui-visually-hidden",
				id: t,
				children: Fv
			}),
			n ? /* @__PURE__ */ L("div", {
				className: "hh-ui-practice-body",
				"data-practice-body": !0,
				children: [/* @__PURE__ */ I("p", {
					className: "hh-ui-practice-note",
					"data-practice-note": !0,
					children: Dv
				}), r === null ? /* @__PURE__ */ I("p", { children: e.made > 0 && e.made === e.total ? Lv : Iv }) : /* @__PURE__ */ L("div", {
					"data-practice-question": r.proposalId,
					children: [/* @__PURE__ */ I("p", {
						className: "hh-ui-practice-question",
						children: r.question
					}), a === null ? /* @__PURE__ */ L("div", {
						className: "hh-ui-practice-choices",
						children: [/* @__PURE__ */ I("button", {
							type: "button",
							className: "hh-ui-button",
							"data-variant": "primary",
							"data-practice-choice": "approved",
							onClick: () => e.choose("approved"),
							children: r.choices[0]
						}), /* @__PURE__ */ I("button", {
							type: "button",
							className: "hh-ui-button",
							"data-practice-choice": "rejected",
							onClick: () => e.choose("rejected"),
							children: r.choices[1]
						})]
					}) : /* @__PURE__ */ L("div", {
						className: "hh-ui-practice-answer",
						"data-practice-answer": a.same ? "same" : "different",
						children: [
							/* @__PURE__ */ I("p", { children: a.meaning }),
							/* @__PURE__ */ I("p", { children: a.recorded }),
							/* @__PURE__ */ I("button", {
								type: "button",
								className: "hh-ui-button",
								"data-variant": "primary",
								"data-practice-go-on": !0,
								onClick: e.goOn,
								children: "Go on with the recording"
							})
						]
					})]
				})]
			}) : null
		]
	});
}
// src/rooms/attic/use-practice.ts
function zv(e) {
	let t = e.model.records, i = o(() => Av(t), [t]), a = o(() => Mv(t), [t]), [s, u] = l(!1), [d, f] = l(/* @__PURE__ */ new Set()), [p, m] = l(null), { cursor: h, status: g } = e.state, _ = e.command, v = c(h);
	r(() => {
		let e = v.current;
		if (v.current = h, !s) return;
		let t = i.find((t) => !d.has(t.eventId) && e < t.sequence && h >= t.sequence - 1 && e <= t.sequence - 1);
		t !== void 0 && (g === "playing" && _({ kind: "pause" }), h !== t.sequence - 1 && _({
			kind: "seek",
			cursor: t.sequence - 1
		}));
	}, [
		s,
		h,
		g,
		i,
		d,
		_
	]);
	let y = s ? i.find((e) => !d.has(e.eventId) && h === e.sequence - 1) ?? null : null, b = n(() => {
		u((e) => !e), f(/* @__PURE__ */ new Set()), m(null);
	}, []), x = n((e) => {
		y !== null && m(jv(y, e));
	}, [y]), S = n(() => {
		y !== null && (f((e) => /* @__PURE__ */ new Set([...e, y.eventId])), m(null), v.current = y.sequence, _({
			kind: "seek",
			cursor: y.sequence
		}), _({ kind: "play" }));
	}, [y, _]);
	return {
		on: s,
		toggle: b,
		asking: y,
		answer: y === null ? null : p,
		choose: x,
		goOn: S,
		numbers: a,
		made: d.size,
		total: i.length
	};
}
// src/rooms/house/RoomNote.tsx
function Bv({ room: e }) {
	if (e.diagnostic === null) return null;
	let t = e.integrity === "valid" ? e.locked ? "locked" : e.readOnly ? "read-only" : "diagnostic" : "diagnostic";
	return /* @__PURE__ */ L("p", {
		className: "hh-ui-note",
		"data-kind": t,
		"data-room-note": !0,
		children: [I(t === "diagnostic" ? P : j, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ I("span", { children: e.diagnostic })]
	});
}
// src/rooms/house/DecisionButtons.tsx
function Vv({ approve: e, reject: t, busy: n, subject: r, describedBy: i, proposalId: a, onSend: o }) {
	return /* @__PURE__ */ L("div", {
		className: "hh-decide",
		"aria-busy": n,
		children: [/* @__PURE__ */ L("button", {
			type: "button",
			className: "hh-button hh-button-primary",
			"data-guide-control": a === void 0 ? void 0 : `approve:${a}`,
			"aria-label": `Approve ${r}`,
			"aria-disabled": e === null,
			"aria-describedby": e === null ? i : void 0,
			onClick: () => {
				e !== null && o(e);
			},
			children: [/* @__PURE__ */ I(p, {
				size: 16,
				"aria-hidden": !0
			}), n ? "Sending…" : "Approve"]
		}), /* @__PURE__ */ L("button", {
			type: "button",
			className: "hh-button hh-button-reject",
			"data-guide-control": a === void 0 ? void 0 : `reject:${a}`,
			"aria-label": `Reject ${r}`,
			"aria-disabled": t === null,
			"aria-describedby": t === null ? i : void 0,
			onClick: () => {
				t !== null && o(t);
			},
			children: [/* @__PURE__ */ I(ve, {
				size: 16,
				"aria-hidden": !0
			}), "Reject"]
		})]
	});
}
// src/rooms/house/DoorPanel.tsx
function Hv({ view: e, onSend: t }) {
	let n = i(), r = i(), a = e.state === "pending";
	return /* @__PURE__ */ L("article", {
		className: "hh-proposal",
		"aria-labelledby": n,
		"data-state": e.state,
		"data-proposal": e.proposalId,
		children: [
			/* @__PURE__ */ L("div", {
				className: "hh-proposal-head",
				children: [/* @__PURE__ */ I(y, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("h5", {
					id: n,
					children: e.title
				})]
			}),
			/* @__PURE__ */ L("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ I("dt", { children: "Document" }),
					/* @__PURE__ */ I("dd", { children: /* @__PURE__ */ I("code", { children: e.documentPath }) }),
					/* @__PURE__ */ I("dt", { children: "Revision" }),
					/* @__PURE__ */ L("dd", { children: [
						e.revisionText,
						", ",
						e.sizeText
					] }),
					/* @__PURE__ */ I("dt", { children: "Digest" }),
					/* @__PURE__ */ L("dd", { children: [/* @__PURE__ */ I("code", { children: e.digestPrefix }), " (first 12 characters of its SHA-256)"] })
				]
			}),
			a ? /* @__PURE__ */ L(F, { children: [
				/* @__PURE__ */ I("p", {
					className: "hh-proposal-sub",
					children: "Your decision covers exactly this revision. If the document changes, it needs a new decision. Approving opens the door; the next phase starts only when you start it."
				}),
				e.blockedText === null ? null : /* @__PURE__ */ L("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: r,
					children: [/* @__PURE__ */ I(j, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ I(Vv, {
					approve: e.approve,
					reject: e.reject,
					busy: e.busy,
					subject: `${e.title}, ${e.revisionText.toLowerCase()}`,
					describedBy: e.blockedText === null ? void 0 : r,
					proposalId: e.proposalId,
					onSend: t
				})
			] }) : /* @__PURE__ */ L("p", {
				className: "hh-proposal-note hh-proposal-outcome",
				"data-outcome": e.state,
				children: [e.state === "approved" ? /* @__PURE__ */ I(g, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ I(d, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: e.outcomeText })]
			})
		]
	});
}
// src/rooms/house/house-icons.tsx
var $ = {
	size: 16,
	"aria-hidden": !0
}, Uv = {
	not_started: "plain",
	ready: "plain",
	starting: "plain",
	working: "plain",
	waiting: "attention",
	revision_required: "attention",
	approved: "ok",
	failed: "attention",
	done: "ok"
}, Wv = {
	sealed: "plain",
	waiting: "attention",
	open: "ok",
	rejected: "attention"
}, Gv = {
	idle: "plain",
	working: "plain",
	waiting: "attention",
	blocked: "attention",
	failed: "attention",
	done: "ok"
};
function Kv({ status: e }) {
	switch (e) {
		case "not_started": return /* @__PURE__ */ I(_, { ...$ });
		case "ready": return /* @__PURE__ */ I(oe, { ...$ });
		case "starting":
		case "working": return /* @__PURE__ */ I(A, {
			...$,
			className: "hh-spin"
		});
		case "waiting": return /* @__PURE__ */ I(O, { ...$ });
		case "revision_required": return /* @__PURE__ */ I(d, { ...$ });
		case "failed": return /* @__PURE__ */ I(P, { ...$ });
		case "approved":
		case "done": return /* @__PURE__ */ I(g, { ...$ });
	}
}
function qv({ status: e }) {
	switch (e) {
		case "sealed": return /* @__PURE__ */ I(j, { ...$ });
		case "waiting": return /* @__PURE__ */ I(y, { ...$ });
		case "open": return /* @__PURE__ */ I(b, { ...$ });
		case "rejected": return /* @__PURE__ */ I(d, { ...$ });
	}
}
function Jv({ state: e }) {
	switch (e) {
		case "idle": return /* @__PURE__ */ I(re, { ...$ });
		case "working": return /* @__PURE__ */ I(A, {
			...$,
			className: "hh-spin"
		});
		case "waiting": return /* @__PURE__ */ I(O, { ...$ });
		case "blocked": return /* @__PURE__ */ I(j, { ...$ });
		case "failed": return /* @__PURE__ */ I(P, { ...$ });
		case "done": return /* @__PURE__ */ I(g, { ...$ });
	}
}
function Yv({ status: e }) {
	switch (e) {
		case "pending": return /* @__PURE__ */ I(O, { ...$ });
		case "approved":
		case "succeeded": return /* @__PURE__ */ I(g, { ...$ });
		case "consumed": return /* @__PURE__ */ I(A, {
			...$,
			className: "hh-spin"
		});
		case "rejected":
		case "superseded": return /* @__PURE__ */ I(d, { ...$ });
		case "failed": return /* @__PURE__ */ I(P, { ...$ });
	}
}
// src/rooms/house/use-revision-request.ts
function Xv(e, t) {
	let [i, a] = l(!1), [o, s] = l(""), [u, d] = l(null), f = c(null), p = c(null), m = c(!1);
	return r(() => {
		i && !m.current && p.current?.focus(), !i && m.current && f.current?.focus(), m.current = i;
	}, [i]), {
		open: i,
		text: o,
		error: u,
		toggleRef: f,
		fieldRef: p,
		show: n(() => a(!0), []),
		hide: n(() => {
			a(!1), d(null);
		}, []),
		change: n((e) => {
			s(e), d(null);
		}, []),
		submit: n(() => {
			if (!e.enabled) return;
			let n = og(o);
			n.ok ? (t({
				kind: "send_feedback",
				phase: e.phase,
				feedback: n.feedback,
				expectedVersion: e.expectedVersion
			}), s(""), d(null), a(!1)) : (d(n.text), p.current?.focus());
		}, [
			e.enabled,
			e.phase,
			e.expectedVersion,
			o,
			t
		])
	};
}
// src/rooms/house/RevisionRequest.tsx
function Zv({ view: e, onSend: t }) {
	let n = Xv(e, t), r = i(), a = i(), o = i(), s = i(), c = i();
	return /* @__PURE__ */ L("div", {
		className: "hh-revision",
		"data-revision": e.phase,
		children: [/* @__PURE__ */ I("div", {
			className: "hh-decide",
			"aria-busy": e.busy,
			children: /* @__PURE__ */ I("button", {
				type: "button",
				className: "hh-button hh-button-quiet",
				"data-guide-control": `revise:${e.phase}`,
				ref: n.toggleRef,
				"aria-expanded": n.open,
				"aria-controls": n.open ? r : void 0,
				onClick: n.open ? n.hide : n.show,
				children: e.busy ? "Sending the revision request…" : e.label
			})
		}), n.open ? /* @__PURE__ */ L("form", {
			id: r,
			className: "hh-revision",
			"aria-label": e.label,
			noValidate: !0,
			onSubmit: (e) => {
				e.preventDefault(), n.submit();
			},
			onKeyDown: (e) => {
				e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), n.hide());
			},
			children: [
				/* @__PURE__ */ I("label", {
					htmlFor: a,
					children: "What should change?"
				}),
				/* @__PURE__ */ I("textarea", {
					id: a,
					ref: n.fieldRef,
					"data-guide-control": `revise-text:${e.phase}`,
					value: n.text,
					maxLength: e.maxCharacters,
					rows: 4,
					"aria-describedby": n.error === null ? o : `${o} ${s}`,
					"aria-invalid": n.error !== null,
					onChange: (e) => n.change(e.target.value)
				}),
				/* @__PURE__ */ L("p", {
					className: "hh-proposal-sub",
					id: o,
					children: [
						"Sent once, to the same ghost session. The door stays sealed until you approve a new revision. Up to",
						" ",
						e.maxCharacters.toLocaleString("en-US"),
						" characters."
					]
				}),
				n.error === null ? null : /* @__PURE__ */ L("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: s,
					children: [/* @__PURE__ */ I(j, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", { children: n.error })]
				}),
				e.blockedText === null ? null : /* @__PURE__ */ L("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: c,
					children: [/* @__PURE__ */ I(j, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ L("div", {
					className: "hh-decide",
					children: [/* @__PURE__ */ L("button", {
						type: "submit",
						className: "hh-button hh-button-primary",
						"data-guide-control": `revise-send:${e.phase}`,
						"aria-disabled": !e.enabled,
						"aria-describedby": e.blockedText === null ? void 0 : c,
						children: [/* @__PURE__ */ I(de, {
							size: 16,
							"aria-hidden": !0
						}), "Send revision request"]
					}), /* @__PURE__ */ L("button", {
						type: "button",
						className: "hh-button",
						onClick: n.hide,
						children: [/* @__PURE__ */ I(ve, {
							size: 16,
							"aria-hidden": !0
						}), "Close without sending"]
					})]
				})
			]
		}) : null]
	});
}
// src/rooms/house/RiskyActionPanel.tsx
function Qv({ title: e, lines: t, empty: n }) {
	return /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("p", {
		className: "hh-proposal-group",
		children: e
	}), t.length === 0 ? /* @__PURE__ */ I("p", {
		className: "hh-proposal-sub",
		children: n
	}) : /* @__PURE__ */ I("dl", {
		className: "hh-facts",
		children: t.map((e, t) => /* @__PURE__ */ L("div", {
			style: { display: "contents" },
			children: [/* @__PURE__ */ I("dt", { children: e.label }), /* @__PURE__ */ I("dd", { children: /* @__PURE__ */ I("code", { children: e.value }) })]
		}, `${e.label}-${t}`))
	})] });
}
function $v({ view: e, onSend: t }) {
	let n = e.ghostName, r = i(), a = i(), o = e.status === "pending";
	return /* @__PURE__ */ L("article", {
		className: "hh-proposal",
		"aria-labelledby": r,
		"data-state": e.status,
		"data-blocked": o && !e.complete,
		"data-proposal": e.proposalId,
		children: [
			/* @__PURE__ */ L("div", {
				className: "hh-proposal-head",
				children: [/* @__PURE__ */ I(Yv, { status: e.status }), /* @__PURE__ */ L("h5", {
					id: r,
					children: [
						n,
						" asks: ",
						e.title
					]
				})]
			}),
			/* @__PURE__ */ I("p", {
				className: "hh-proposal-sub",
				children: e.statusText
			}),
			e.complete ? /* @__PURE__ */ L(F, { children: [
				/* @__PURE__ */ I(Qv, {
					title: "Scope",
					lines: e.scope,
					empty: "No scope."
				}),
				/* @__PURE__ */ I(Qv, {
					title: "Exact arguments",
					lines: e.arguments,
					empty: "No arguments."
				}),
				/* @__PURE__ */ I(Qv, {
					title: "Paths it may touch",
					lines: e.paths,
					empty: "No paths."
				})
			] }) : null,
			/* @__PURE__ */ L("dl", {
				className: "hh-facts",
				children: [/* @__PURE__ */ I("dt", { children: "Digest" }), /* @__PURE__ */ L("dd", { children: [/* @__PURE__ */ I("code", { children: e.digestPrefix }), " (first 12 characters of the action's SHA-256)"] })]
			}),
			o ? /* @__PURE__ */ L(F, { children: [
				/* @__PURE__ */ I("p", {
					className: "hh-proposal-sub",
					children: e.oneAttemptText
				}),
				e.blockedText === null ? null : /* @__PURE__ */ L("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: a,
					children: [/* @__PURE__ */ I(j, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ I(Vv, {
					approve: e.approve,
					reject: e.reject,
					busy: e.busy,
					subject: `${e.title.toLowerCase()} for ${n}, digest ${e.digestPrefix}`,
					describedBy: e.blockedText === null ? void 0 : a,
					proposalId: e.proposalId,
					onSend: t
				})
			] }) : e.outcomeText === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-proposal-note hh-proposal-outcome",
				"data-outcome": e.status,
				children: [/* @__PURE__ */ I(Yv, { status: e.status }), /* @__PURE__ */ I("span", { children: e.outcomeText })]
			})
		]
	});
}
// src/core/markdown-blocks.ts
var ey = 1500, ty = /* @__PURE__ */ RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\u2028\u2029\\u202a-\\u202e\\u2066-\\u2069]", "g");
function ny(e) {
	return e.replace(/\r\n?/g, "\n").replace(ty, "");
}
var ry = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|((?<![A-Za-z0-9_])_(?![\s_])[^_\n]+(?<!\s)_(?![A-Za-z0-9_]))/g;
function iy(e) {
	let t = [], n = 0;
	for (let r of e.matchAll(ry)) {
		let i = r.index ?? 0;
		i > n && t.push({
			kind: "text",
			text: e.slice(n, i)
		});
		let a = r[0];
		r[1] === void 0 ? r[2] === void 0 ? t.push({
			kind: "emphasis",
			text: a.slice(1, -1)
		}) : t.push({
			kind: "strong",
			text: a.slice(2, -2)
		}) : t.push({
			kind: "code",
			text: a.slice(1, -1)
		}), n = i + a.length;
	}
	return n < e.length && t.push({
		kind: "text",
		text: e.slice(n)
	}), t;
}
var ay = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/, oy = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]{0,24})/, sy = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/, cy = /^(\s*)(?:([-*+])|(\d{1,4})[.)])\s+(.*)$/, ly = /^\[( |x|X)\](\*?)\s+(.*)$/, uy = /^\s*\|.*\|\s*$/;
function dy(e, t = ey) {
	let n = ny(e).split("\n"), r = [], i = [], a = [], o = !1, s = () => {
		i.length > 0 && (r.push({
			kind: "paragraph",
			inlines: iy(i.join(" "))
		}), i = []), a.length > 0 && (r.push({
			kind: "list",
			items: a
		}), a = []);
	};
	for (let e = 0; e < n.length; e += 1) {
		if (r.length >= t) {
			o = !0;
			break;
		}
		let c = n[e], l = oy.exec(c);
		if (l !== null) {
			s();
			let t = [];
			for (e += 1; e < n.length && !n[e].trimStart().startsWith(l[1]);) t.push(n[e]), e += 1;
			r.push({
				kind: "code",
				language: l[2],
				text: t.join("\n")
			});
			continue;
		}
		if (c.trim() === "") {
			s();
			continue;
		}
		let u = ay.exec(c);
		if (u !== null) {
			s(), r.push({
				kind: "heading",
				level: u[1].length,
				inlines: iy(u[2])
			});
			continue;
		}
		if (sy.test(c)) {
			s(), r.push({ kind: "rule" });
			continue;
		}
		if (uy.test(c)) {
			s();
			let t = [c];
			for (; e + 1 < n.length && uy.test(n[e + 1]);) e += 1, t.push(n[e]);
			r.push({
				kind: "code",
				language: "table",
				text: t.join("\n")
			});
			continue;
		}
		let d = cy.exec(c);
		if (d !== null) {
			i.length > 0 && s();
			let e = ly.exec(d[4]);
			a.push({
				depth: Math.min(Math.floor(d[1].replace(/\t/g, "  ").length / 2), 5),
				checked: e === null ? null : e[1] !== " ",
				optional: e !== null && e[2] === "*",
				number: d[3] === void 0 ? null : `${d[3]}.`,
				inlines: iy(e === null ? d[4] : e[3])
			});
		} else c.trimStart().startsWith(">") ? (s(), r.push({
			kind: "quote",
			inlines: iy(c.trimStart().replace(/^>\s?/, ""))
		})) : (a.length > 0 && s(), i.push(c.trim()));
	}
	return o || s(), {
		blocks: r,
		truncated: o
	};
}
// src/components/MarkdownView.tsx
function fy({ parts: e }) {
	return /* @__PURE__ */ I(F, { children: e.map((e, t) => {
		switch (e.kind) {
			case "code": return /* @__PURE__ */ I("code", { children: e.text }, t);
			case "strong": return /* @__PURE__ */ I("strong", { children: e.text }, t);
			case "emphasis": return /* @__PURE__ */ I("em", { children: e.text }, t);
			default: return /* @__PURE__ */ I("span", { children: e.text }, t);
		}
	}) });
}
function py({ item: e }) {
	return /* @__PURE__ */ L("li", {
		className: "hh-md-item",
		style: { marginLeft: `${e.depth * 1.25}rem` },
		"data-checked": e.checked ?? void 0,
		children: [e.checked === null ? /* @__PURE__ */ I("span", {
			className: "hh-md-marker",
			"aria-hidden": !0,
			children: e.number ?? "•"
		}) : e.checked ? /* @__PURE__ */ I(p, {
			size: 14,
			"aria-hidden": !0
		}) : /* @__PURE__ */ I(me, {
			size: 14,
			"aria-hidden": !0
		}), /* @__PURE__ */ L("span", { children: [
			e.checked === null ? e.number === null ? null : /* @__PURE__ */ L("span", {
				className: "hh-visually-hidden",
				children: [e.number, " "]
			}) : /* @__PURE__ */ L("span", {
				className: "hh-visually-hidden",
				children: [
					e.checked ? "Done" : "Open",
					e.optional ? ", optional" : "",
					":",
					" "
				]
			}),
			/* @__PURE__ */ I(fy, { parts: e.inlines }),
			e.optional ? /* @__PURE__ */ I("span", {
				"aria-hidden": !0,
				children: " (optional)"
			}) : null
		] })]
	});
}
var my = 6;
function hy(e, t) {
	return Math.min(my, e + t - 1);
}
function gy({ block: e, baseLevel: t }) {
	switch (e.kind) {
		case "heading": return /* @__PURE__ */ I("p", {
			className: "hh-md-heading",
			role: "heading",
			"aria-level": hy(t, e.level),
			"data-level": e.level,
			children: /* @__PURE__ */ I(fy, { parts: e.inlines })
		});
		case "paragraph": return /* @__PURE__ */ I("p", { children: /* @__PURE__ */ I(fy, { parts: e.inlines }) });
		case "quote": return /* @__PURE__ */ I("p", {
			className: "hh-md-quote",
			children: /* @__PURE__ */ I(fy, { parts: e.inlines })
		});
		case "list": return /* @__PURE__ */ I("ul", {
			className: "hh-md-list",
			children: e.items.map((e, t) => /* @__PURE__ */ I(py, { item: e }, t))
		});
		case "code": return /* @__PURE__ */ I("pre", {
			"data-language": e.language === "" ? void 0 : e.language,
			children: /* @__PURE__ */ I("code", { children: e.text })
		});
		case "rule": return /* @__PURE__ */ I("hr", {});
	}
}
function _y({ text: e, baseLevel: t = 6 }) {
	let n = o(() => dy(e), [e]);
	return /* @__PURE__ */ L(F, { children: [n.blocks.map((e, n) => /* @__PURE__ */ I(gy, {
		block: e,
		baseLevel: t
	}, n)), n.truncated ? /* @__PURE__ */ I("p", {
		className: "hh-artifact-note",
		children: "The document is longer than this view shows. Its digest covers all of it."
	}) : null] });
}
// src/components/ArtifactView.tsx
var vy = {
	unwritten: "plain",
	unknown: "plain",
	valid: "ok",
	invalid: "attention"
};
function yy({ state: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "valid": return /* @__PURE__ */ I(g, { ...t });
		case "invalid": return /* @__PURE__ */ I(d, { ...t });
		default: return /* @__PURE__ */ I(_, { ...t });
	}
}
function by({ view: e }) {
	let t = i();
	return /* @__PURE__ */ L("article", {
		className: "hh-artifact",
		"aria-labelledby": t,
		"data-artifact": e.phase,
		"data-validation": e.validation,
		children: [
			/* @__PURE__ */ L("div", {
				className: "hh-artifact-head",
				children: [/* @__PURE__ */ I(S, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("h5", {
					id: t,
					children: e.title
				})]
			}),
			e.content === null ? /* @__PURE__ */ I("p", {
				className: "hh-artifact-note",
				"data-content": "none",
				children: e.contentNote
			}) : /* @__PURE__ */ I("div", {
				className: "hh-document",
				role: "region",
				"aria-label": `${e.title} text`,
				tabIndex: 0,
				"data-content": "text",
				children: /* @__PURE__ */ I(_y, { text: e.content })
			}),
			e.doorNote === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				"data-door-note": !0,
				children: [/* @__PURE__ */ I(P, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: e.doorNote })]
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-room-line",
				"data-tone": vy[e.validation],
				"data-validation-line": !0,
				children: [/* @__PURE__ */ I(yy, { state: e.validation }), /* @__PURE__ */ L("span", { children: [e.validationText, e.findings.length > 0 ? `. ${e.findingsText}:` : ""] })]
			}),
			e.findings.length === 0 ? null : /* @__PURE__ */ I("ul", {
				className: "hh-findings",
				"aria-label": `${e.title} findings`,
				children: e.findings.map((e, t) => /* @__PURE__ */ L("li", {
					"data-finding": e.code,
					children: [
						/* @__PURE__ */ I("code", { children: e.location }),
						": ",
						e.message,
						" ",
						/* @__PURE__ */ L("span", {
							className: "hh-finding-code",
							children: [
								"(",
								e.code,
								")"
							]
						})
					]
				}, `${e.code}-${e.location}-${t}`))
			}),
			/* @__PURE__ */ L("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ I("dt", { children: "Document" }),
					/* @__PURE__ */ I("dd", { children: /* @__PURE__ */ I("code", { children: e.documentPath }) }),
					e.revisionText === null ? null : /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("dt", { children: "Revision" }), /* @__PURE__ */ I("dd", { children: e.revisionText })] }),
					e.digest === null ? null : /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("dt", { children: "Digest" }), /* @__PURE__ */ L("dd", { children: [/* @__PURE__ */ I("code", {
						"data-digest": !0,
						children: e.digest
					}), " (SHA-256 of these bytes)"] })] }),
					/* @__PURE__ */ L("dt", { children: [/* @__PURE__ */ I(j, {
						size: 14,
						"aria-hidden": !0
					}), " May write"] }),
					/* @__PURE__ */ L("dd", { children: [/* @__PURE__ */ I("ul", {
						className: "hh-scope",
						"aria-label": `Paths the ghost of this room may write for the ${e.title.toLowerCase()}`,
						children: e.writeScope.map((e) => /* @__PURE__ */ I("li", { children: /* @__PURE__ */ I("code", { children: e }) }, e))
					}), "Nothing else: every other write needs your approval."] })
				]
			})
		]
	});
}
// src/components/GhostOutputSummary.tsx
function xy({ run: e }) {
	return /* @__PURE__ */ L("div", {
		className: "hh-run",
		"data-run": e.runId,
		"data-ghost": e.ghostId,
		"data-state": e.state ?? "earlier",
		children: [
			/* @__PURE__ */ L("p", {
				className: "hh-room-line",
				"data-tone": e.state === null ? "plain" : Gv[e.state],
				children: [e.state === null ? /* @__PURE__ */ I(_, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ I(Jv, { state: e.state }), /* @__PURE__ */ L("span", { children: [
					e.ghostName,
					": ",
					e.stateText,
					e.taskId === null ? "" : `, task ${e.taskId}`,
					". ",
					e.attemptText,
					"."
				] })]
			}),
			e.summary === null ? null : /* @__PURE__ */ I("p", {
				className: "hh-run-summary",
				"data-summary": !0,
				children: e.summary
			}),
			e.reasonText === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-room-line",
				"data-tone": "attention",
				"data-reason": !0,
				children: [/* @__PURE__ */ I(P, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: e.reasonText })]
			}),
			e.writeScope.length === 0 ? null : /* @__PURE__ */ L("p", {
				className: "hh-room-line",
				"data-claim": !0,
				children: [/* @__PURE__ */ I(j, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: [
					"This run may write only:",
					" ",
					e.writeScope.map((e, t) => /* @__PURE__ */ L("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ I("code", { children: e })] }, e))
				] })]
			})
		]
	});
}
// src/components/RunRecoveryControls.tsx
function Sy({ view: e, kind: t, runId: n, describedBy: r, onSend: i }) {
	let a = e.command;
	return /* @__PURE__ */ L("button", {
		type: "button",
		className: t === "cancel" ? "hh-button hh-button-reject" : "hh-button",
		"data-control": t,
		"data-guide-control": t === "retry" ? `retry:${n}` : void 0,
		"aria-disabled": a === null,
		"aria-describedby": a === null && e.blockedText !== null ? r : void 0,
		onClick: () => {
			a !== null && i(a);
		},
		children: [I(t === "cancel" ? d : ue, {
			size: 16,
			"aria-hidden": !0
		}), e.busy ? "Sending…" : e.label]
	});
}
function Cy({ run: e, onSend: t }) {
	let n = i(), r = e.cancel?.blockedText ?? e.retry?.blockedText ?? null;
	return e.cancel === null && e.retry === null && e.exhaustedText === null ? null : /* @__PURE__ */ L("div", {
		className: "hh-recovery",
		"data-recovery": e.runId,
		children: [
			e.cancel === null && e.retry === null ? null : /* @__PURE__ */ L("div", {
				className: "hh-decide",
				"aria-busy": (e.cancel?.busy ?? !1) || (e.retry?.busy ?? !1),
				children: [e.cancel === null ? null : /* @__PURE__ */ I(Sy, {
					view: e.cancel,
					kind: "cancel",
					runId: e.runId,
					describedBy: n,
					onSend: t
				}), e.retry === null ? null : /* @__PURE__ */ I(Sy, {
					view: e.retry,
					kind: "retry",
					runId: e.runId,
					describedBy: n,
					onSend: t
				})]
			}),
			r === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				id: n,
				children: [/* @__PURE__ */ I(j, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: r })]
			}),
			e.exhaustedText === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-proposal-note",
				"data-exhausted": !0,
				children: [/* @__PURE__ */ I(j, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: e.exhaustedText })]
			})
		]
	});
}
function wy({ view: e, onOpen: t }) {
	let n = i(), r = e.slotKey, a = r === null || t === null, o = e.disabledText ?? (t === null ? "This version of Crew offers no way to open the session from here. Find it in Crew by its name." : null);
	return /* @__PURE__ */ L("p", {
		className: "hh-session-link",
		"data-session-link": a ? "off" : "on",
		children: [/* @__PURE__ */ L("button", {
			type: "button",
			className: "hh-button hh-button-quiet",
			"aria-disabled": a,
			"aria-describedby": a && o !== null ? n : void 0,
			"data-slot": r ?? void 0,
			onClick: () => {
				r !== null && t !== null && t(r);
			},
			children: [/* @__PURE__ */ I(x, {
				size: 14,
				"aria-hidden": !0
			}), e.label]
		}), a && o !== null ? /* @__PURE__ */ I("span", {
			id: n,
			className: "hh-session-link-note",
			children: o
		}) : null]
	});
}
// src/rooms/workshop/use-task-selection.ts
function Ty(e) {
	let [t, r] = l(() => /* @__PURE__ */ new Set()), i = o(() => {
		let n = new Set(e.waves.flatMap((e) => e.tasks.filter((e) => e.selectable).map((e) => e.taskId)));
		return new Set([...t].filter((e) => n.has(e)));
	}, [e.waves, t]), a = n((e) => {
		r((t) => {
			let n = new Set(t);
			return n.delete(e) || n.add(e), n;
		});
	}, []), s = n(() => r(/* @__PURE__ */ new Set()), []);
	return {
		chosen: i,
		toggle: a,
		command: o(() => yg(e, i), [e, i]),
		clear: s
	};
}
// src/rooms/workshop/WorkshopTaskBoard.tsx
var Ey = {
	not_selected: "plain",
	queued: "plain",
	backpressure: "attention",
	active: "plain",
	complete: "ok",
	failed: "attention",
	cancelled: "attention",
	blocked: "attention",
	skipped: "plain"
};
function Dy({ status: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "complete": return /* @__PURE__ */ I(p, { ...t });
		case "active": return /* @__PURE__ */ I(A, {
			...t,
			className: "hh-spin"
		});
		case "queued":
		case "backpressure": return /* @__PURE__ */ I(O, { ...t });
		case "failed": return /* @__PURE__ */ I(P, { ...t });
		case "blocked": return /* @__PURE__ */ I(j, { ...t });
		case "cancelled": return /* @__PURE__ */ I(d, { ...t });
		case "not_selected":
		case "skipped": return /* @__PURE__ */ I(_, { ...t });
	}
}
function Oy({ row: e, chosen: t, onToggle: n, onSend: r, onOpenSession: a }) {
	let o = i();
	return /* @__PURE__ */ L("li", {
		className: "hh-task",
		"data-task": e.taskId,
		"data-status": e.status,
		"aria-labelledby": o,
		children: [
			/* @__PURE__ */ L("div", {
				className: "hh-task-head",
				children: [
					e.selectable ? /* @__PURE__ */ I("input", {
						type: "checkbox",
						"data-guide-control": `task:${e.taskId}`,
						checked: t,
						"aria-label": `Select task ${e.taskId}: ${e.title}`,
						onChange: () => n(e.taskId)
					}) : null,
					/* @__PURE__ */ L("span", {
						id: o,
						children: [
							/* @__PURE__ */ I("span", {
								className: "hh-task-id",
								children: e.taskId
							}),
							" ",
							e.title
						]
					}),
					e.optional ? /* @__PURE__ */ I("span", {
						className: "hh-tag",
						children: "Optional"
					}) : null
				]
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-room-line",
				"data-tone": Ey[e.status],
				"data-task-status": !0,
				children: [/* @__PURE__ */ I(Dy, { status: e.status }), /* @__PURE__ */ L("span", { children: [e.statusText, e.attemptText === null ? "" : `. ${e.attemptText}`] })]
			}),
			e.detail === null ? null : /* @__PURE__ */ I("p", {
				className: "hh-task-detail",
				"data-task-detail": !0,
				children: e.detail
			}),
			/* @__PURE__ */ L("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ I("dt", { children: "Requirements" }),
					/* @__PURE__ */ I("dd", { children: e.requirementsText }),
					/* @__PURE__ */ I("dt", { children: "May write" }),
					/* @__PURE__ */ I("dd", { children: e.writes.map((e, t) => /* @__PURE__ */ L("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ I("code", { children: e })] }, e)) })
				]
			}),
			e.run === null ? null : /* @__PURE__ */ L(F, { children: [
				/* @__PURE__ */ I(xy, { run: e.run }),
				/* @__PURE__ */ I(Cy, {
					run: e.run,
					onSend: r
				}),
				/* @__PURE__ */ I(wy, {
					view: e.run.sessionLink,
					onOpen: a
				})
			] })
		]
	});
}
function ky({ board: e, onSend: t, onOpenSession: n }) {
	let r = Ty(e), a = i(), o = i(), s = r.chosen.size, c = e.startBlockedText ?? (s === 0 ? "Tick at least one open task to start." : null);
	return /* @__PURE__ */ L("section", {
		className: "hh-board",
		"aria-labelledby": a,
		"data-board": !0,
		children: [
			/* @__PURE__ */ I("h5", {
				id: a,
				children: "Task board"
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-room-line",
				"data-board-summary": !0,
				children: [/* @__PURE__ */ I(O, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: [
					e.doneCount,
					" of ",
					e.taskCount,
					" tasks done. ",
					e.capacityText,
					"."
				] })]
			}),
			e.findings.length === 0 ? null : /* @__PURE__ */ I("ul", {
				className: "hh-findings",
				"aria-label": "Task plan findings",
				children: e.findings.map((e, t) => /* @__PURE__ */ L("li", {
					"data-finding": e.code,
					children: [
						/* @__PURE__ */ I("code", { children: e.location }),
						": ",
						e.message,
						" ",
						/* @__PURE__ */ L("span", {
							className: "hh-finding-code",
							children: [
								"(",
								e.code,
								")"
							]
						})
					]
				}, `${e.code}-${e.location}-${t}`))
			}),
			e.waves.map((e) => /* @__PURE__ */ I(Ay, {
				title: e.title,
				children: e.tasks.map((e) => /* @__PURE__ */ I(Oy, {
					row: e,
					chosen: r.chosen.has(e.taskId),
					onToggle: r.toggle,
					onSend: t,
					onOpenSession: n
				}, e.taskId))
			}, e.wave ?? "outside")),
			/* @__PURE__ */ I("div", {
				className: "hh-decide",
				"aria-busy": e.startBusy,
				children: /* @__PURE__ */ L("button", {
					type: "button",
					className: "hh-button hh-button-primary",
					"data-control": "start-workshop",
					"data-guide-control": "start-workshop",
					"aria-disabled": r.command === null,
					"aria-describedby": r.command === null && c !== null ? o : void 0,
					onClick: () => {
						r.command !== null && (t(r.command), r.clear());
					},
					children: [/* @__PURE__ */ I(oe, {
						size: 16,
						"aria-hidden": !0
					}), e.startBusy ? "Starting…" : s === 1 ? "Start 1 selected task" : `Start ${s} selected tasks`]
				})
			}),
			r.command !== null || c === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				id: o,
				children: [/* @__PURE__ */ I(j, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: c })]
			})
		]
	});
}
function Ay({ title: e, children: t }) {
	let n = i();
	return /* @__PURE__ */ L("div", {
		className: "hh-wave",
		role: "group",
		"aria-labelledby": n,
		children: [/* @__PURE__ */ I("p", {
			className: "hh-proposal-group",
			id: n,
			children: e
		}), /* @__PURE__ */ I("ul", {
			className: "hh-tasks",
			children: t
		})]
	});
}
// src/rooms/house/RoomOutput.tsx
function jy({ output: e, onSend: t, onOpenSession: n }) {
	return /* @__PURE__ */ L("div", {
		className: "hh-output",
		"data-room-output": e.room,
		children: [
			e.outputNote === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-house-note hh-house-muted",
				"data-output-note": !0,
				children: [/* @__PURE__ */ I(se, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: e.outputNote })]
			}),
			e.documents.map((e) => /* @__PURE__ */ I(by, { view: e }, e.phase)),
			e.taskBoard === null ? null : /* @__PURE__ */ I(ky, {
				board: e.taskBoard,
				onSend: t,
				onOpenSession: n
			})
		]
	});
}
// src/rooms/house/RoomRuns.tsx
function My({ output: e, onSend: t, onOpenSession: n }) {
	let r = new Set(e.taskBoard?.waves.flatMap((e) => e.tasks.flatMap((e) => e.run === null ? [] : [e.run.runId])) ?? []), i = e.runs.filter((e) => !r.has(e.runId));
	return i.length === 0 ? null : /* @__PURE__ */ L("div", {
		className: "hh-phase",
		"data-room-runs": !0,
		children: [/* @__PURE__ */ I("p", {
			className: "hh-proposal-group",
			children: "Runs in this room"
		}), /* @__PURE__ */ I("ul", {
			className: "hh-runs",
			children: i.map((e) => /* @__PURE__ */ L("li", { children: [
				/* @__PURE__ */ I(xy, { run: e }),
				/* @__PURE__ */ I(Cy, {
					run: e,
					onSend: t
				}),
				/* @__PURE__ */ I(wy, {
					view: e.sessionLink,
					onOpen: n
				})
			] }, e.runId))
		})]
	});
}
// src/rooms/house/RoomPanel.tsx
var Ny = () => {};
function Py({ detail: e, onSend: t, output: n = null, onRoomSend: r = Ny, onOpenSession: i = null }) {
	let { room: a } = e;
	return /* @__PURE__ */ L("div", {
		className: "hh-room-panel",
		"data-room-body": a.id,
		children: [
			n === null ? null : /* @__PURE__ */ I(jy, {
				output: n,
				onSend: r,
				onOpenSession: i
			}),
			e.phases.map(({ line: e, start: i, door: a }) => /* @__PURE__ */ L("div", {
				className: "hh-phase",
				"data-phase": e.phase,
				"data-status": e.status,
				children: [
					/* @__PURE__ */ L("p", {
						className: "hh-room-line",
						"data-tone": Uv[e.status],
						children: [/* @__PURE__ */ I(Kv, { status: e.status }), /* @__PURE__ */ L("span", { children: [
							e.name,
							": ",
							e.statusText
						] })]
					}),
					/* @__PURE__ */ L("p", {
						className: "hh-room-line",
						"data-tone": Wv[e.doorStatus],
						children: [/* @__PURE__ */ I(qv, { status: e.doorStatus }), /* @__PURE__ */ I("span", { children: e.doorHint })]
					}),
					i === null || e.phase === "implementation" && n?.ownsImplementationStart === !0 ? null : /* @__PURE__ */ I("div", {
						className: "hh-decide",
						"aria-busy": i.busy,
						children: /* @__PURE__ */ L("button", {
							type: "button",
							className: "hh-button hh-button-primary",
							"data-guide-control": `start:${e.phase}`,
							"aria-disabled": i.command === null,
							onClick: () => {
								i.command !== null && t(i.command);
							},
							children: [/* @__PURE__ */ I(oe, {
								size: 16,
								"aria-hidden": !0
							}), i.busy ? "Starting…" : i.label]
						})
					}),
					a === null ? null : /* @__PURE__ */ I(Hv, {
						view: a,
						onSend: t
					}),
					n?.documents.map((t) => t.phase === e.phase && t.feedback !== null ? /* @__PURE__ */ I(Zv, {
						view: t.feedback,
						onSend: r
					}, t.phase) : null)
				]
			}, e.phase)),
			/* @__PURE__ */ L("div", {
				className: "hh-phase",
				children: [/* @__PURE__ */ I("p", {
					className: "hh-proposal-group",
					children: "Ghosts in this room"
				}), a.ghosts.length === 0 ? /* @__PURE__ */ L("p", {
					className: "hh-room-line",
					children: [/* @__PURE__ */ I(Jv, { state: "idle" }), /* @__PURE__ */ I("span", { children: "No ghost here yet" })]
				}) : /* @__PURE__ */ I("ul", {
					className: "hh-ghost-lines",
					children: a.ghosts.map((e) => /* @__PURE__ */ L("li", {
						className: "hh-room-line",
						"data-tone": Gv[e.state],
						"data-ghost": e.ghostId,
						children: [/* @__PURE__ */ I(Jv, { state: e.state }), /* @__PURE__ */ L("span", { children: [
							e.name,
							": ",
							e.stateText,
							e.pendingText === null ? null : `, ${e.pendingText}`,
							e.reason === null ? null : `. ${e.reason}`
						] })]
					}, e.key))
				})]
			}),
			e.risky.length === 0 ? null : /* @__PURE__ */ L("div", {
				className: "hh-phase",
				children: [/* @__PURE__ */ I("p", {
					className: "hh-proposal-group",
					children: "Risky actions"
				}), e.risky.map((e) => /* @__PURE__ */ I($v, {
					view: e,
					onSend: t
				}, e.proposalId))]
			}),
			n === null ? null : /* @__PURE__ */ I(My, {
				output: n,
				onSend: r,
				onOpenSession: i
			})
		]
	});
}
// src/rooms/house/room-house-panel.ts
var Fy = "This room's state has not been read yet.";
// src/rooms/drafting-room/DraftingHousePanel.tsx
function Iy({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I(Bv, { room: e }), t === null ? /* @__PURE__ */ I("p", {
		className: "hh-ui-reason",
		children: Fy
	}) : /* @__PURE__ */ I(Py, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/foyer/BuiltPage.tsx
var Ly = "What was made", Ry = "Every door is open. This is what now exists, under the names Kiro uses for it.", zy = "Finished work", By = "Open this project in Kiro";
function Vy(e) {
	return e === "" ? e : e[0].toUpperCase() + e.slice(1);
}
function Hy({ view: e }) {
	let t = i();
	return e.built ? /* @__PURE__ */ L("section", {
		className: "hh-built",
		"aria-labelledby": t,
		"data-section": "built",
		"data-built": !0,
		tabIndex: -1,
		children: [
			/* @__PURE__ */ I("h5", {
				id: t,
				children: Ly
			}),
			/* @__PURE__ */ I("p", {
				className: "hh-built-lede",
				children: Ry
			}),
			e.rows.length === 0 ? null : /* @__PURE__ */ L("table", {
				className: "hh-built-table",
				children: [/* @__PURE__ */ I("thead", { children: /* @__PURE__ */ L("tr", { children: [
					/* @__PURE__ */ I("th", {
						scope: "col",
						children: "What"
					}),
					/* @__PURE__ */ I("th", {
						scope: "col",
						children: "Kiro calls it"
					}),
					/* @__PURE__ */ I("th", {
						scope: "col",
						children: "File"
					})
				] }) }), /* @__PURE__ */ I("tbody", { children: e.rows.map((e) => /* @__PURE__ */ L("tr", {
					"data-built-row": e.term,
					children: [
						/* @__PURE__ */ I("th", {
							scope: "row",
							children: Vy(e.plain)
						}),
						/* @__PURE__ */ I("td", { children: e.kiro }),
						/* @__PURE__ */ I("td", { children: /* @__PURE__ */ I("code", { children: e.path }) })
					]
				}, e.term)) })]
			}),
			e.tasks.length === 0 ? null : /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I("p", {
				className: "hh-built-group",
				children: zy
			}), /* @__PURE__ */ I("ul", {
				className: "hh-built-tasks",
				children: e.tasks.map((e) => /* @__PURE__ */ L("li", {
					"data-built-task": e.taskId,
					children: [/* @__PURE__ */ I("span", { children: e.title }), e.files.map((e) => /* @__PURE__ */ I("code", { children: e }, e))]
				}, e.taskId))
			})] }),
			/* @__PURE__ */ I("p", {
				className: "hh-built-group",
				children: By
			}),
			/* @__PURE__ */ L("dl", {
				className: "hh-facts",
				children: [/* @__PURE__ */ I("dt", { children: "Folder" }), /* @__PURE__ */ I("dd", { children: /* @__PURE__ */ I("code", {
					"data-built-folder": !0,
					children: e.folder
				}) })]
			}),
			e.folderNote === null ? /* @__PURE__ */ I("ol", {
				className: "hh-built-steps",
				children: e.steps.map((e) => /* @__PURE__ */ I("li", { children: e }, e))
			}) : /* @__PURE__ */ I("p", {
				className: "hh-built-lede",
				"data-built-note": !0,
				children: e.folderNote
			})
		]
	}) : null;
}
// src/rooms/foyer/ActiveMansionFoyerPanel.tsx
var Uy = "Escape also returns to the Foyer when no room is open.";
function Wy({ room: e, mansion: t, onReturn: n, built: r }) {
	return /* @__PURE__ */ L(F, { children: [
		/* @__PURE__ */ I(Bv, { room: e }),
		/* @__PURE__ */ L("dl", {
			className: "hh-shell-facts",
			"data-active-mansion": t.name,
			children: [
				/* @__PURE__ */ I("dt", { children: "Mansion" }),
				/* @__PURE__ */ I("dd", { children: t.name }),
				/* @__PURE__ */ I("dt", { children: "Project spec" }),
				/* @__PURE__ */ I("dd", { children: t.projectSpec }),
				/* @__PURE__ */ I("dt", { children: "Folder" }),
				/* @__PURE__ */ I("dd", { children: t.displayPath })
			]
		}),
		/* @__PURE__ */ L("div", {
			className: "hh-foyer-actions",
			children: [/* @__PURE__ */ L("button", {
				type: "button",
				className: "hh-button",
				onClick: n,
				children: [/* @__PURE__ */ I(u, {
					size: 16,
					"aria-hidden": !0
				}), "Return to Foyer"]
			}), /* @__PURE__ */ I("span", {
				className: "hh-foyer-hint",
				children: Uy
			})]
		}),
		r === void 0 ? null : /* @__PURE__ */ I(Hy, { view: r })
	] });
}
// src/rooms/seance-room/LockedSeancePanel.tsx
function Gy() {
	return /* @__PURE__ */ L("p", {
		className: "hh-ui-note",
		"data-kind": "locked",
		"data-seance": "locked",
		children: [/* @__PURE__ */ I(j, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ I("span", { children: ss })]
	});
}
// src/rooms/seance-room/SeanceRoomPanel.tsx
function Ky({ status: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "reviewing": return /* @__PURE__ */ I(A, {
			...t,
			className: "hh-spin"
		});
		case "pass": return /* @__PURE__ */ I(g, { ...t });
		case "changes_requested": return /* @__PURE__ */ I(d, { ...t });
		case "blocked": return /* @__PURE__ */ I(j, { ...t });
	}
}
function qy({ view: e, onOpenSession: t }) {
	return /* @__PURE__ */ L("div", {
		className: "hh-room-panel",
		"data-review": e.status,
		children: [/* @__PURE__ */ L("div", {
			className: "hh-output",
			children: [
				/* @__PURE__ */ L("p", {
					className: "hh-room-line",
					"data-tone": e.status === "pass" ? "ok" : e.status === "reviewing" ? "plain" : "attention",
					"data-verdict": !0,
					children: [/* @__PURE__ */ I(Ky, { status: e.status }), /* @__PURE__ */ L("span", { children: [
						e.statusText,
						". ",
						e.cycleText,
						"."
					] })]
				}),
				e.limitText === null ? null : /* @__PURE__ */ L("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					"data-review-limit": !0,
					children: [/* @__PURE__ */ I(j, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ I("span", { children: e.limitText })]
				}),
				e.findings.length === 0 ? null : /* @__PURE__ */ I("ul", {
					className: "hh-tasks",
					"aria-label": "Review findings",
					children: e.findings.map((e) => /* @__PURE__ */ L("li", {
						className: "hh-task",
						"data-finding": e.findingId,
						children: [
							/* @__PURE__ */ I("p", {
								className: "hh-run-summary",
								children: e.summary
							}),
							/* @__PURE__ */ L("dl", {
								className: "hh-facts",
								children: [
									/* @__PURE__ */ I("dt", { children: "Requirements" }),
									/* @__PURE__ */ I("dd", { children: e.requirementsText }),
									/* @__PURE__ */ I("dt", { children: "Files" }),
									/* @__PURE__ */ I("dd", { children: e.paths.length === 0 ? "None" : e.paths.map((e, t) => /* @__PURE__ */ L("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ I("code", { children: e })] }, e)) })
								]
							}),
							e.repair === null ? null : /* @__PURE__ */ L("p", {
								className: "hh-room-line",
								"data-repair": e.repair.status,
								children: [/* @__PURE__ */ I(O, {
									size: 16,
									"aria-hidden": !0
								}), /* @__PURE__ */ L("span", { children: [
									"Repair task ",
									e.repair.taskId,
									": ",
									e.repair.title,
									". ",
									e.repair.statusText,
									". May write:",
									" ",
									e.repair.writes.map((e, t) => /* @__PURE__ */ L("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ I("code", { children: e })] }, e))
								] })]
							})
						]
					}, e.findingId))
				})
			]
		}), /* @__PURE__ */ L("div", {
			className: "hh-phase",
			children: [/* @__PURE__ */ L("p", {
				className: "hh-room-line",
				"data-tone": e.state === null ? "plain" : Gv[e.state],
				children: [/* @__PURE__ */ I(Jv, { state: e.state ?? "idle" }), /* @__PURE__ */ L("span", { children: [
					e.ghostName,
					": ",
					e.stateText
				] })]
			}), /* @__PURE__ */ I(wy, {
				view: e.sessionLink,
				onOpen: t
			})]
		})]
	});
}
// src/rooms/seance-room/SeanceHousePanel.tsx
var Jy = "No review yet. The Medium reviews only when the house asks it to.";
function Yy({ room: e, review: t, onOpenSession: n }) {
	return /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I(Bv, { room: e }), t === null ? /* @__PURE__ */ I("p", {
		className: "hh-ui-reason",
		"data-seance": "empty",
		children: Jy
	}) : /* @__PURE__ */ I(qy, {
		view: t,
		onOpenSession: n
	})] });
}
// src/rooms/study/StudyHousePanel.tsx
function Xy({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I(Bv, { room: e }), t === null ? /* @__PURE__ */ I("p", {
		className: "hh-ui-reason",
		children: Fy
	}) : /* @__PURE__ */ I(Py, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/workshop/WorkshopHousePanel.tsx
function Zy({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I(Bv, { room: e }), t === null ? /* @__PURE__ */ I("p", {
		className: "hh-ui-reason",
		children: Fy
	}) : /* @__PURE__ */ I(Py, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/house/DoorSurface.tsx
function Qy({ room: e, door: t, decision: n, onSend: r, onOpenRoom: i }) {
	return /* @__PURE__ */ L("div", {
		className: "hh-door-surface",
		"data-door-surface": t.phase,
		children: [
			/* @__PURE__ */ I(Bv, { room: e }),
			/* @__PURE__ */ L("p", {
				className: "hh-ui-state",
				"data-door": t.state,
				children: [/* @__PURE__ */ I(Gt, { state: t.state }), /* @__PURE__ */ L("span", { children: ["Door state: ", /* @__PURE__ */ I("span", {
					className: "hh-ui-state-word",
					children: ci(t.state)
				})] })]
			}),
			/* @__PURE__ */ I("p", {
				"data-door-hint": !0,
				children: t.hint
			}),
			t.phaseText === null ? null : /* @__PURE__ */ I("p", {
				className: "hh-ui-reason",
				children: t.phaseText
			}),
			n === null ? null : /* @__PURE__ */ I(Hv, {
				view: n,
				onSend: r
			}),
			/* @__PURE__ */ I("div", {
				className: "hh-decide",
				children: /* @__PURE__ */ L("button", {
					type: "button",
					className: "hh-button",
					"data-opener-key": `nested:room:${e.roomId}`,
					onClick: (t) => i({
						kind: "room",
						roomId: e.roomId
					}, t.currentTarget),
					children: [
						/* @__PURE__ */ I(b, {
							size: 16,
							"aria-hidden": !0
						}),
						"Open the ",
						e.name
					]
				})
			})
		]
	});
}
// src/rooms/house/GhostSurface.tsx
function $y({ room: e, ghost: t, onOpenRoom: n }) {
	return /* @__PURE__ */ L("div", {
		className: "hh-ghost-surface",
		"data-ghost-surface": t.ghostId,
		children: [
			/* @__PURE__ */ L("p", {
				className: "hh-ui-state",
				"data-ghost": t.state,
				children: [/* @__PURE__ */ I(Ut, {
					state: t.state,
					variant: zt(t.ghostId)
				}), /* @__PURE__ */ L("span", { children: [
					"Ghost state: ",
					/* @__PURE__ */ I("span", {
						className: "hh-ui-state-word",
						children: ci(t.state)
					}),
					t.pendingText === null ? null : `, ${t.pendingText}`
				] })]
			}),
			t.reason === null ? null : /* @__PURE__ */ I("p", {
				"data-ghost-reason": !0,
				children: t.reason
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-ui-reason",
				children: [
					t.name,
					" lives in the ",
					e.name,
					". Looking at a ghost changes nothing."
				]
			}),
			/* @__PURE__ */ I("div", {
				className: "hh-decide",
				children: /* @__PURE__ */ L("button", {
					type: "button",
					className: "hh-button",
					"data-opener-key": `nested:room:${e.roomId}`,
					onClick: (t) => n({
						kind: "room",
						roomId: e.roomId
					}, t.currentTarget),
					children: [
						/* @__PURE__ */ I(b, {
							size: 16,
							"aria-hidden": !0
						}),
						"Open the ",
						e.name
					]
				})
			})
		]
	});
}
// src/rooms/house/panel-styles.ts
var eb = "\n.hh-room-panel h5, .hh-proposal h5, .hh-artifact h5 { font-size: 0.875rem; margin: 0; overflow-wrap: anywhere; }\n[data-surface] .hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer; min-width: 0;\n  max-width: 100%; text-align: left; color: var(--hh-text); background: var(--hh-surface-raised);\n  border: 1px solid var(--hh-border); border-radius: 6px; padding: 6px 12px; overflow-wrap: anywhere; }\n[data-surface] .hh-button-primary { color: var(--hh-primary-text); background: var(--hh-primary); }\n[data-surface] .hh-button:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }\n[data-surface] .hh-button[aria-disabled='true'] { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted);\n  background: var(--hh-surface); }\n[data-surface] .hh-button-reject { border-style: double; border-width: 3px; padding: 4px 10px; }\n[data-surface] .hh-button-reject[aria-disabled='true'] { border-style: dashed; border-width: 1px; padding: 6px 12px; }\n\n.hh-room-panel { display: grid; gap: 12px; min-width: 0; }\n.hh-room-line { display: flex; align-items: flex-start; gap: 6px; font-size: 0.875rem; overflow-wrap: anywhere; margin: 0; }\n.hh-room-line svg { flex: none; margin-top: 2px; color: var(--hh-text-muted); }\n.hh-room-line[data-tone='ok'] svg { color: var(--hh-ok); }\n.hh-room-line[data-tone='attention'] svg { color: var(--hh-accent); }\n.hh-house-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; overflow-wrap: anywhere; }\n.hh-house-note svg { flex: none; margin-top: 2px; }\n.hh-house-muted { color: var(--hh-text-muted); }\n.hh-phase { display: grid; gap: 6px; border-top: 1px solid var(--hh-border-soft); padding-top: 10px; min-width: 0; }\n/* What was made: a plain table of names and files, the finished work, and how to open the folder in Kiro. */\n.hh-built { display: grid; gap: 8px; min-width: 0; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hh-border); }\n.hh-built:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 4px; }\n.hh-built h5 { margin: 0; font-size: 1rem; }\n.hh-built-lede { margin: 0; font-size: 0.875rem; color: var(--hh-text-muted); }\n.hh-built-group { margin: 6px 0 0; font-weight: 600; }\n.hh-built-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }\n.hh-built-table th, .hh-built-table td { text-align: left; vertical-align: top; padding: 4px 12px 4px 0; border-bottom: 1px solid var(--hh-border); overflow-wrap: anywhere; }\n.hh-built-table thead th { font-weight: 600; color: var(--hh-text-muted); }\n.hh-built-table code, .hh-built-tasks code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.8125rem; overflow-wrap: anywhere; }\n.hh-built-tasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 0.875rem; }\n.hh-built-tasks li { display: flex; flex-wrap: wrap; gap: 2px 10px; min-width: 0; }\n.hh-built-steps { margin: 0; padding-left: 1.25rem; font-size: 0.875rem; }\n.hh-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: 0.875rem; }\n.hh-facts dt { color: var(--hh-text-muted); }\n.hh-facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }\n.hh-facts code, .hh-proposal code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 0.8125rem; overflow-wrap: anywhere; }\n.hh-ghost-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }\n.hh-ghost-surface, .hh-door-surface { display: grid; gap: 10px; min-width: 0; }\n.hh-ghost-surface p, .hh-door-surface p { margin: 0; }\n.hh-shell-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; margin: 0; }\n.hh-shell-facts dt { font-weight: 600; }\n.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }\n\n.hh-proposal { border: 1px solid var(--hh-border-soft); border-left: 4px solid var(--hh-border);\n  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; min-width: 0; }\n.hh-proposal:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }\n.hh-proposal[data-state='pending'] { border-left-style: double; border-left-width: 6px; }\n.hh-proposal[data-blocked='true'] { border-style: dashed; border-left-style: dashed; }\n.hh-proposal-head { display: flex; align-items: flex-start; gap: 6px; }\n.hh-proposal-head svg { flex: none; margin-top: 2px; color: var(--hh-accent); }\n.hh-proposal-sub { font-size: 0.875rem; margin: 0; }\n.hh-proposal-group { font-size: 0.8125rem; font-weight: 600; margin: 4px 0 0; color: var(--hh-text-muted); }\n.hh-proposal-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-proposal-note svg { flex: none; margin-top: 2px; }\n.hh-proposal-blocked svg { color: var(--hh-accent); }\n.hh-proposal-outcome[data-outcome='approved'] svg { color: var(--hh-ok); }\n.hh-decide { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }\n\n@keyframes hh-house-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  [data-motion='low-frequency'] .hh-spin { animation: hh-house-spin 2s linear infinite; }\n}\n", tb = "locked", nb = "The recording is paused at its start. Press Play to watch the house fill, or open the Attic to step through it.", rb = "This is a recording. Nothing can be started, approved or rejected here.", ib = eb + z_;
function ab({ mansion: e, onReturn: t, announcement: i = "", status: a, ghostNames: s, seanceRoom: c = tb, panelMode: u, replayScheduler: d, now: f, guide: p }) {
	let [m, h] = l(i);
	r(() => h(i), [i]);
	let g = n((e) => h(e), []), _ = ah(e.name, d), v = _.mode, y = R_({
		mansion: e,
		ghostNames: s,
		seanceRoom: c,
		mode: v,
		replay: _.upstream,
		replayed: _.house,
		onAnnounce: g
	}), { projection: b } = y, x = xv(_, g, {
		watch: v === "replay",
		refresh: !1
	}), S = zv(_), C = o(() => ({
		mansionId: e.name,
		active: v === "live",
		transitions: y.canonical.transitions,
		snapshots: y.canonical.snapshots,
		roomOf: y.canonical.roomOf,
		nameOf: y.canonical.nameOf,
		now: f
	}), [
		e.name,
		v,
		y.canonical,
		f
	]), w = o(() => ({
		documents: Array.from(y.outputs.values()).flatMap((e) => e.documents.map((e) => ({
			phase: e.phase,
			path: e.documentPath
		}))),
		tasks: (y.outputs.get("workshop")?.taskBoard?.waves ?? []).flatMap((e) => e.tasks.map((e) => ({
			taskId: e.taskId,
			title: e.title,
			complete: e.complete,
			writes: e.writes
		}))),
		folder: e.displayPath
	}), [y.outputs, e.displayPath]), T = (n, r) => {
		let i = n.target, a = b.rooms.find((e) => e.roomId === i.roomId);
		if (a === void 0) return null;
		let o = y.details.get(a.roomId) ?? null, s = y.outputs.get(a.roomId) ?? null;
		if (i.kind === "ghost") {
			let e = a.ghosts.find((e) => e.ghostId === i.ghostId);
			return e === void 0 ? null : /* @__PURE__ */ I($y, {
				room: a,
				ghost: e,
				onOpenRoom: r.openNested
			});
		}
		if (i.kind === "door") {
			let e = a.doors.find((e) => e.phase === i.phase);
			if (e === void 0) return null;
			let t = o?.phases.find((e) => e.line.phase === i.phase)?.door ?? null;
			return /* @__PURE__ */ I(Qy, {
				room: a,
				door: e,
				decision: t,
				onSend: y.send,
				onOpenRoom: r.openNested
			});
		}
		let c = {
			room: a,
			detail: o,
			output: s,
			onSend: y.send,
			onRoomSend: y.sendRoom,
			onOpenSession: y.openSession
		};
		switch (a.roomId) {
			case "foyer": return /* @__PURE__ */ I(Wy, {
				room: a,
				mansion: e,
				onReturn: t,
				built: W_(b, w)
			});
			case "study": return /* @__PURE__ */ I(Xy, { ...c });
			case "drafting-room": return /* @__PURE__ */ I(Iy, { ...c });
			case "workshop": return /* @__PURE__ */ I(Zy, { ...c });
			case "attic": return /* @__PURE__ */ L(F, { children: [a.diagnostic === null || a.readOnly && a.integrity === "valid" ? null : /* @__PURE__ */ L("p", {
				className: "hh-ui-note",
				"data-kind": "diagnostic",
				"data-attic-diagnostic": !0,
				children: [/* @__PURE__ */ I(P, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: a.diagnostic })]
			}), /* @__PURE__ */ I(Sv, {
				replay: _,
				onAnnounce: g,
				motion: r.stillHouse ? "none" : "low-frequency",
				watch: v !== "replay"
			})] });
			case "seance-room": return a.locked ? /* @__PURE__ */ I(Gy, {}) : /* @__PURE__ */ I(Yy, {
				room: a,
				review: y.review,
				onOpenSession: y.openSession
			});
		}
	}, E = /* @__PURE__ */ L("div", {
		className: "hh-ui-notes",
		children: [
			y.loading ? /* @__PURE__ */ L("p", {
				className: "hh-ui-note",
				"data-kind": "loading",
				"data-house-loading": !0,
				children: [/* @__PURE__ */ I(se, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: "Loading the house…" })]
			}) : null,
			y.logProblem === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-ui-note",
				"data-kind": "diagnostic",
				"data-log-problem": !0,
				children: [/* @__PURE__ */ I(P, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: y.logProblem })]
			}),
			y.authority.text === null || y.authority.block === "loading" || v === "replay" && y.authority.block === "read_only" ? null : /* @__PURE__ */ L("p", {
				className: "hh-ui-note",
				"data-kind": y.authority.block === "read_only" ? "read-only" : "diagnostic",
				"data-block": y.authority.block,
				children: [/* @__PURE__ */ I(j, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ I("span", { children: y.authority.text })]
			}),
			y.notice === null ? null : /* @__PURE__ */ I("p", {
				className: "hh-ui-note",
				"data-kind": "notice",
				"data-house-notice": !0,
				children: /* @__PURE__ */ I("span", { children: y.notice })
			}),
			y.roomNotice === null ? null : /* @__PURE__ */ I("p", {
				className: "hh-ui-note",
				"data-kind": "notice",
				"data-room-notice": !0,
				children: /* @__PURE__ */ I("span", { children: y.roomNotice })
			})
		]
	});
	return /* @__PURE__ */ I(cd, {
		projection: b,
		renderSurface: T,
		host: C,
		message: m,
		status: a,
		notes: E,
		banner: v === "replay" ? /* @__PURE__ */ L("div", {
			className: "hh-ui-replay-head",
			children: [/* @__PURE__ */ I(wv, {
				panel: x,
				readOnlyText: y.authority.block === "read_only" && y.authority.text !== null ? y.authority.text : rb,
				startText: _.state.cursor === 0 ? nb : null
			}), /* @__PURE__ */ I(Rv, { practice: S })]
		}) : void 0,
		busy: y.loading,
		onReturn: t,
		panelMode: u,
		inFlight: y.inFlight,
		panelStyles: ib,
		guide: p
	});
}
// src/App.tsx
var ob = {
	denied: {
		short: "Refused the app token",
		long: "Gateway refused the app token. Re-enable the app or approve its permissions on the app page."
	},
	timeout: {
		short: "No answer in time",
		long: "Gateway did not answer in time."
	},
	unreachable: {
		short: "Not reachable",
		long: "Backend could not reach the gateway."
	},
	config: {
		short: "Not set up",
		long: "Gateway settings for this app are missing or not local, so the backend did not call it."
	}
};
function sb(e) {
	return e === void 0 ? "" : ` (HTTP ${e})`;
}
function cb(e) {
	switch (e.kind) {
		case "loading": return {
			tone: "pending",
			text: "Checking…"
		};
		case "ok": return {
			tone: "ok",
			text: "Reachable"
		};
		case "unreachable": return {
			tone: "problem",
			text: `Not reachable${sb(e.status)}`,
			detail: e.message
		};
	}
}
function lb(e) {
	switch (e.kind) {
		case "loading": return {
			tone: "pending",
			text: "Checking…"
		};
		case "unreachable": return {
			tone: "unknown",
			text: "Unknown until the backend answers"
		};
		case "ok": return "version" in e.gateway ? {
			tone: "ok",
			text: `Version ${e.gateway.version}`
		} : {
			tone: "problem",
			text: ob[e.gateway.error].short
		};
	}
}
function ub(e) {
	switch (e.kind) {
		case "loading": return "Checking the backend…";
		case "unreachable": return `Backend not reachable${sb(e.status)}`;
		case "ok": return "version" in e.gateway ? `Backend reachable · Gateway ${e.gateway.version}` : `Backend reachable · ${ob[e.gateway.error].long}`;
	}
}
function db({ tone: e }) {
	let t = {
		size: 18,
		"aria-hidden": !0
	};
	switch (e) {
		case "ok": return /* @__PURE__ */ I(g, {
			...t,
			className: "hh-icon hh-icon-ok"
		});
		case "problem": return /* @__PURE__ */ I(P, {
			...t,
			className: "hh-icon hh-icon-problem"
		});
		case "pending": return /* @__PURE__ */ I(A, {
			...t,
			className: "hh-icon hh-icon-pending"
		});
		case "unknown": return /* @__PURE__ */ I(_, {
			...t,
			className: "hh-icon hh-icon-unknown"
		});
	}
}
function fb({ name: e, view: t }) {
	return /* @__PURE__ */ L("li", {
		className: "hh-row",
		"data-tone": t.tone,
		children: [
			/* @__PURE__ */ I(db, { tone: t.tone }),
			/* @__PURE__ */ I("span", {
				className: "hh-row-name",
				children: e
			}),
			/* @__PURE__ */ I("span", {
				className: "hh-row-text",
				children: t.text
			}),
			t.detail ? /* @__PURE__ */ I("span", {
				className: "hh-row-detail",
				children: t.detail
			}) : null
		]
	});
}
var pb = `
.hh-house { ${yr("dark")} ${Cr("dark")}
  --hh-font-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
  font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--card-fg, var(--text, var(--hh-fb-text))); line-height: 1.45;
  display: block; max-width: 76rem; margin: 0 auto; padding: 8px 12px 32px; box-sizing: border-box; }
/* Inside a mansion the room is sized to the window, so the page keeps little under it. */
.hh-house:has(.hh-ui) { padding-bottom: 12px; }
.hh-status { color: var(--card-fg, var(--text, var(--hh-fb-text))); background: var(--card, var(--hh-fb-surface));
  border: 1px solid var(--border, var(--hh-fb-border)); border-radius: 12px; padding: 16px 20px;
  max-width: 48rem; margin: 16px auto 0; font: inherit; }
.hh-status h1 { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif; font-size: 2.5rem; line-height: 1.1;
  margin: 0 0 12px; letter-spacing: 0; }
.hh-status[data-compact='true'] { border: 0; background: transparent; padding: 0; margin: 8px 0 10px; max-width: none; }
.hh-status[data-compact='true'] h1 { margin: 0; font-size: 1.25rem; }
.hh-status[data-quiet='true'] { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 20px;
  border: 0; background: transparent; padding: 8px 0 0; }
.hh-status[data-quiet='true'] > :not(.hh-hero-art) { grid-column: 2; }
.hh-status[data-quiet='true'] h1 { margin: 0 0 6px; }
.hh-hero-art { grid-row: 1 / span 3; width: 14rem; max-width: 36vw; height: auto; color: var(--hh-sc-ink); }
.hh-hero-sheet { fill: var(--hh-sc-sheet); stroke: var(--hh-sc-sheet-ink); }
.hh-hero-grid { stroke: var(--hh-sc-sheet-line); }
.hh-hero-line { stroke: var(--hh-sc-sheet-ink); }
.hh-hero-line-fill { fill: var(--hh-sc-sheet-ink); }
.hh-hero-moon { fill: var(--hh-sc-moon); stroke: var(--hh-sc-sheet-ink); }
.hh-hero-wall { fill: var(--hh-sc-wall-foyer); }
.hh-hero-roof { fill: var(--hh-sc-roof); }
.hh-hero-door { fill: var(--hh-sc-wood); }
.hh-hero-lamp { fill: var(--hh-sc-lamp); }
.hh-hero-bone { fill: var(--hh-sc-bone); }
.hh-tagline { margin: 0 0 8px; font-size: 1.0625rem; max-width: 36rem; }
.hh-status[data-quiet='true'] .hh-rows { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
.hh-status[data-quiet='true'] .hh-summary { font-size: 0.8125rem; color: var(--muted, var(--hh-fb-text-muted)); }
.hh-rows { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 8px; }
.hh-row { display: grid; grid-template-columns: 18px 5rem 1fr; column-gap: 10px; align-items: center; }
.hh-row-name { font-weight: 600; }
.hh-row-detail { grid-column: 3; color: var(--muted, var(--hh-fb-text-muted)); font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-icon { flex: none; }
.hh-icon-ok { color: var(--ok, var(--hh-fb-ok)); }
.hh-icon-problem { color: var(--warn, var(--hh-fb-danger)); }
.hh-icon-pending, .hh-icon-unknown { color: var(--muted, var(--hh-fb-text-muted)); }
.hh-summary { margin: 0; }
.hh-announcement { display: block; margin-top: 4px; }
.hh-actions { margin-top: 12px; }
.hh-retry { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;
  color: var(--accent-fg, var(--hh-fb-accent-text)); background: var(--accent, var(--hh-fb-accent));
  border: 1px solid var(--border-strong, var(--hh-fb-border)); border-radius: 6px; padding: 6px 12px; }
.hh-retry:focus-visible { outline: 2px solid var(--ring, var(--hh-fb-focus)); outline-offset: 2px; }
/* The way in: the front door fills the page, the name is its brass plate, the Warden stands by his balloon, and the
   Foyer is a sheet of cream paper. */
.hh-house[data-landing='true'] { position: relative; display: flex; flex-direction: column; max-width: none; min-height: 100vh; margin: 0; padding: 0 16px 48px;
  overflow: hidden; background: var(--hh-sc-front-door); }
/* The door is as tall as the window, not as the page, so it is the same door at the Gate and behind a long hall. */
.hh-landing-door { position: absolute; inset: 0 0 auto; height: 100vh; display: block; container-type: size; }
/* The painted knocker knocks for a pointer. The Knock button is the real control. */
.hh-landing-knocker { position: absolute; left: 50%; top: 50%; width: max(15cqw, 24cqh); aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; cursor: pointer; }
.hh-landing-door::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 46% 52% at 50% 40%, transparent 0%, color-mix(in srgb, var(--hh-sc-night1) 55%, transparent) 62%, color-mix(in srgb, var(--hh-sc-night1) 30%, black) 100%); }
.hh-knocker-eyes { transform: translate(calc(var(--hh-eye-x, 0) * 1px), calc(var(--hh-eye-y, 0) * 1px)); }
@media (prefers-reduced-motion: no-preference) { .hh-knocker-eyes { transition: transform 0.5s ease-out; } }
.hh-landing-knocker:hover { outline: 3px solid var(--hh-sc-lamp); outline-offset: 4px; }
/* The Gate: nothing but the door, the plate, and the Warden's question at the foot of the window. */
.hh-gate { position: relative; z-index: 1; box-sizing: border-box; width: 100%; max-width: 44rem; margin: auto auto 0; padding-top: 24px; }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] { position: relative; z-index: 1; display: block; box-sizing: border-box; width: 100%; max-width: 30rem; margin: 5vh auto 0;
  padding: 14px 24px 12px; text-align: center; color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 3px solid var(--hh-sc-ink);
  border-radius: 6px; box-shadow: 0 5px 0 var(--hh-sc-ink); }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] .hh-tagline { margin: 0 auto 6px; }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] .hh-summary { color: var(--hh-sc-ink); }
.hh-house[data-landing='true'] .hh-foyer { position: relative; z-index: 1; box-sizing: border-box; width: 100%; max-width: 44rem; }
.hh-house[data-landing='true'] .hh-foyer-hall { ${yr("dark")}
  --card: var(--hh-sc-balloon); --card-fg: var(--hh-fb-text); --text: var(--hh-fb-text); --muted: var(--hh-fb-text-muted);
  --border: var(--hh-fb-border); --border-strong: var(--hh-fb-border); --input: var(--hh-fb-surface-raised); --ok: var(--hh-fb-ok);
  --warn: var(--hh-fb-accent); --accent: var(--hh-fb-accent); --accent-fg: var(--hh-fb-accent-text); --ring: var(--hh-fb-focus);
  color: var(--hh-fb-text); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 10px;
  box-shadow: 4px 5px 0 var(--hh-sc-ink); }
@media (max-width: 640px) {
  .hh-status[data-quiet='true'] { grid-template-columns: minmax(0, 1fr); }
  .hh-status[data-quiet='true'] > :not(.hh-hero-art) { grid-column: 1; }
  .hh-hero-art { grid-row: auto; width: 10rem; }
  .hh-status h1 { font-size: 1.875rem; }
}
@keyframes hh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .hh-icon-pending { animation: hh-spin 2s linear infinite; }
}
`;
function mb({ state: e }) {
	return /* @__PURE__ */ L("ul", {
		className: "hh-rows",
		"aria-label": "Status",
		children: [/* @__PURE__ */ I(fb, {
			name: "Backend",
			view: cb(e)
		}), /* @__PURE__ */ I(fb, {
			name: "Gateway",
			view: lb(e)
		})]
	});
}
var hb = [];
function gb({ landing: e } = {}) {
	let { state: t, retry: a } = ht(), o = Nt !== null, u = e ?? (o ? Wd : void 0), [d, f] = l(""), [p, m] = l(null), [h, g] = l(ed), [_, v] = s(Od, o, Dd), [y, b] = l(!0), x = t.kind === "ok", S = x && p !== null, C = x && !S && _.place === "gate", w = i(), T = c(null);
	Ce(T, C);
	let E = n((e) => {
		b(e.kind === "loading"), e.kind === "ready" && v({
			type: "list_loaded",
			mansionCount: e.mansions.length
		});
	}, []), D = n((e) => {
		m(e), v({ type: e === null ? "mansion_left" : "mansion_opened" });
	}, []), O = c(null), k = c(null);
	r(() => {
		let e = k.current;
		k.current = null;
		let t = () => document.querySelector("[data-hall-guide] [data-guide-call]");
		e === "status" && (O.current ?? t())?.focus(), e === "idea" && document.querySelector("[data-idea-step] textarea")?.focus(), e === "call" && t()?.focus();
	}, [
		_.place,
		_.idea,
		h.quiet
	]);
	let A = (e) => {
		k.current = e ? "call" : "status", g((t) => ({
			...t,
			quiet: e
		})), f(td.quiet(e));
	}, j = {
		words: h.kiroWords ? "with-kiro" : "plain",
		quiet: h.quiet,
		onStepBack: () => A(!0),
		onCallWarden: () => A(!1),
		statusRef: O
	}, M = (e, t, n) => {
		e.id.startsWith("enter:") || e.id.startsWith("watch:") ? n.open(e.id.slice(e.id.indexOf(":") + 1), t) : e.id === "build-new" ? (k.current = "idea", v({ type: "idea_opened" })) : e.id === "name-myself" ? (v({ type: "idea_closed" }), document.querySelector(".hh-create input")?.focus()) : e.id === "step-outside" && (k.current = "status", v({ type: "stepped_outside" }));
	}, ee = (e) => {
		if (_.place !== "hall" && _.place !== "mansion") return null;
		let t = Hd(_, e.mansions, e.selectedName, u?.mansion ?? null);
		return /* @__PURE__ */ I(kf, {
			...j,
			status: t.status,
			question: t.question,
			options: t.options,
			pose: t.pose,
			poseLabel: t.poseLabel,
			onPress: (t, n) => M(t, n, e),
			children: _.idea ? /* @__PURE__ */ I(Pf, {
				mansions: e.mansions,
				ready: e.ready,
				mutation: e.mutation,
				made: e.made,
				onBuild: e.build
			}) : null
		});
	}, te = n((e, n) => /* @__PURE__ */ I(ab, {
		mansion: e,
		onReturn: n,
		announcement: d,
		guide: {
			settings: h,
			onChange: g
		},
		status: /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ I(mb, { state: t }), /* @__PURE__ */ I("p", {
			className: "hh-summary",
			children: ub(t)
		})] })
	}), [
		d,
		h,
		t
	]);
	return /* @__PURE__ */ L("main", {
		className: "hh-house",
		"aria-labelledby": "hh-status-title",
		"data-landing": x && !S,
		"data-place": x ? _.place : void 0,
		children: [
			/* @__PURE__ */ I("style", { children: pb + pr + Ft + Gd }),
			x && !S ? /* @__PURE__ */ L("span", {
				className: "hh-landing-door",
				"aria-hidden": "true",
				ref: T,
				children: [/* @__PURE__ */ I(cr, { knocker: _.place !== "hall" }), C ? /* @__PURE__ */ I("span", {
					className: "hh-landing-knocker",
					"data-knocker": !0,
					onClick: () => {
						let e = document.getElementById(w);
						e instanceof HTMLFormElement && e.requestSubmit();
					}
				}) : null]
			}) : null,
			/* @__PURE__ */ L("div", {
				className: "hh-status",
				"data-compact": S,
				"data-quiet": x && !S,
				children: [/* @__PURE__ */ I("h1", {
					id: "hh-status-title",
					children: "Haunted House"
				}), S ? null : /* @__PURE__ */ L(F, { children: [
					x ? /* @__PURE__ */ I("p", {
						className: "hh-tagline",
						children: Ud
					}) : null,
					/* @__PURE__ */ I(mb, { state: t }),
					/* @__PURE__ */ L("p", {
						className: "hh-summary",
						"aria-live": "polite",
						children: [ub(t), x && d !== "" ? /* @__PURE__ */ L(F, { children: [" ", /* @__PURE__ */ I("span", {
							className: "hh-announcement",
							children: d
						})] }) : null]
					}),
					t.kind === "unreachable" ? /* @__PURE__ */ I("div", {
						className: "hh-actions",
						children: /* @__PURE__ */ L("button", {
							type: "button",
							className: "hh-retry",
							onClick: a,
							children: [/* @__PURE__ */ I(ue, {
								size: 16,
								"aria-hidden": !0
							}), "Retry"]
						})
					}) : null
				] })]
			}),
			C ? /* @__PURE__ */ I("div", {
				className: "hh-gate",
				"data-gate-screen": !0,
				children: /* @__PURE__ */ I(kf, {
					...j,
					status: kd,
					question: null,
					options: hb,
					pose: "watching",
					poseLabel: fc.watching,
					onPress: () => {},
					children: /* @__PURE__ */ I(Tf, {
						formId: w,
						onKnock: (e) => {
							k.current = "status", v({
								type: "knocked",
								name: e
							});
						}
					})
				})
			}) : null,
			x ? /* @__PURE__ */ I(wf, {
				onAnnounce: f,
				onMansionChange: D,
				onLoad: E,
				renderShell: te,
				preselect: u?.mansion,
				invitation: u?.text,
				visit: {
					hidden: _.place === "gate" || _.place === "loading" && y,
					renderGuide: ee
				}
			}) : null
		]
	});
}
export { gb as default };
