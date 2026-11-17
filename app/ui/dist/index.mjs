import { ArrowLeft as e, ArrowRight as t, Ban as n, Bell as r, BookOpen as i, Check as a, CircleCheck as o, CircleDashed as s, CircleDot as c, DoorClosed as l, DoorOpen as u, ExternalLink as d, FileText as f, Gauge as p, Ghost as m, History as h, Hourglass as g, LoaderCircle as _, Lock as v, LogOut as y, Map as b, MapPin as x, Moon as S, Pause as C, Play as w, Plus as T, RefreshCw as ee, Rotate3d as te, RotateCcw as ne, RotateCw as E, Send as D, SkipBack as re, SkipForward as O, Square as ie, TriangleAlert as k, Volume2 as ae, VolumeX as oe, Wind as se, X as ce } from "lucide-react";
import { Fragment as le, forwardRef as ue, useCallback as A, useEffect as j, useId as M, useLayoutEffect as de, useMemo as N, useRef as P, useState as F } from "react";
import * as fe from "@kirocrew/app-sdk";
import { useAppApi as pe, useAppEvents as me } from "@kirocrew/app-sdk";
import { Fragment as I, jsx as L, jsxs as R } from "react/jsx-runtime";
// src/core/backend-status.ts
var he = "/apps/haunted-house/api/whoami", ge = [
	"timeout",
	"unreachable",
	"denied",
	"config"
], _e = /* @__PURE__ */ new Set(["ok", "replay"]), ve = "Backend sent an unexpected reply.", ye = "Request failed.", be = 200;
function xe(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Se(e) {
	return typeof e == "string" && ge.includes(e);
}
function Ce(e) {
	return xe(e) ? typeof e.version == "string" && e.version.trim() !== "" ? { version: e.version.trim() } : Se(e.error) ? { error: e.error } : null : null;
}
function we(e) {
	if (!xe(e) || typeof e.backend != "string" || !_e.has(e.backend)) return {
		kind: "unreachable",
		message: ve
	};
	let t = Ce(e.gateway);
	return t === null ? {
		kind: "unreachable",
		message: ve
	} : {
		kind: "ok",
		gateway: t
	};
}
function Te(e) {
	if (!xe(e) && !(e instanceof Error)) return;
	let t = e.status;
	if (typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599) return t;
}
function Ee(e) {
	let t = e instanceof Error || xe(e) ? e.message : void 0;
	if (typeof t != "string") return ye;
	let n = t.trim();
	return n === "" ? ye : n.length > be ? `${n.slice(0, 199)}…` : n;
}
function De(e) {
	let t = Te(e), n = Ee(e);
	return t === void 0 ? {
		kind: "unreachable",
		message: n
	} : {
		kind: "unreachable",
		status: t,
		message: n
	};
}
var Oe = "Mansion service sent an unexpected reply.", ke = "Mansion request failed.", Ae = [
	"ready",
	"missing",
	"conflict"
], je = ["created", "existing_compatible"], Me = [
	"invalid_request",
	"invalid_mansion_name",
	"unsafe_mansion_root",
	"symlink_escape",
	"mansion_conflict",
	"mansion_missing",
	"mansion_not_registered",
	"metadata_unavailable",
	"filesystem_error"
], Ne = class extends Error {
	constructor() {
		super(Oe), this.name = "MansionApiParseError";
	}
}, Pe = {
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
function Fe(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Ie(e, t) {
	let n = Object.keys(e);
	return n.length === t.length && n.every((e) => t.includes(e));
}
function Le(e, t) {
	return typeof e == "string" && t.includes(e);
}
function Re(e) {
	return typeof e != "string" || e.length === 0 || e.length > 40 ? !1 : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(e)?.[0] === e;
}
function ze(e, t) {
	if (typeof e != "string" || !e.startsWith("~/") || e.includes("\\")) return !1;
	let n = e.slice(2).split("/");
	return n.length > 0 && n.every((e) => e !== "" && e !== "." && e !== ".." && !/[\u0000-\u001f\u007f]/.test(e)) && n.at(-1) === t;
}
function Be(e) {
	if (!Fe(e)) throw new Ne();
	let { name: t, projectSpec: n, displayPath: r, status: i } = e;
	if (!Re(t) || !Re(n) || n !== t || !ze(r, t) || !Le(i, Ae)) throw new Ne();
	return {
		name: t,
		projectSpec: n,
		displayPath: r,
		status: i
	};
}
function Ve(e) {
	if (!Fe(e) || e.schemaVersion !== 1 || !Array.isArray(e.mansions)) throw new Ne();
	let t = e.mansions.map(Be);
	if (new Set(t.map(({ name: e }) => e)).size !== t.length) throw new Ne();
	return {
		schemaVersion: 1,
		mansions: t
	};
}
function He(e) {
	if (!Fe(e) || !Le(e.outcome, je)) throw new Ne();
	let t = Be(e.mansion);
	if (t.status !== "ready") throw new Ne();
	return {
		outcome: e.outcome,
		mansion: t
	};
}
function Ue(e) {
	if (!Fe(e)) throw new Ne();
	let t = Be(e.mansion);
	if (t.status !== "ready") throw new Ne();
	return { mansion: t };
}
function We(e, t = ke) {
	if (typeof e != "string") return t;
	let n = e.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
	return n === "" ? t : n.length > 200 ? `${n.slice(0, 199)}…` : n;
}
var Ge = 2e3, Ke = "[\\t\\n \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]", qe = RegExp(`^${Ke}+|${Ke}+$`, "g");
function Je(e) {
	let t = e.codePointAt(0) ?? 0;
	return t === 9 || t === 10 ? !1 : t <= 31 || t >= 127 && t <= 159 || t >= 55296 && t <= 57343;
}
function Ye(e) {
	let t = e.replace(/\r\n?/g, "\n"), n = t.replace(qe, ""), r = [...n].length;
	return [...t].some(Je) ? {
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
function Xe(e, t) {
	if (t === void 0) return { name: e };
	let n = Ye(t);
	if (!n.ok) throw RangeError(`mansion brief refused: ${n.reason}`);
	return n.brief === null ? { name: e } : {
		name: e,
		brief: n.brief
	};
}
function Ze(e) {
	if (!Fe(e) || !Ie(e, ["error"]) || !Fe(e.error)) throw new Ne();
	let t = e.error;
	if (!Ie(t, ["code", "message"]) || !Le(t.code, Me) || typeof t.message != "string" || t.message.trim() === "") throw new Ne();
	return { error: {
		code: t.code,
		message: Pe[t.code]
	} };
}
// src/adapters/sdk.ts
var Qe = "/apps/haunted-house/api/mansions", $e = "/apps/haunted-house/api/mansions/open", et = class extends Error {
	code;
	status;
	constructor(e, t = {}) {
		super(e), this.name = "MansionApiRequestError", this.code = t.code, this.status = t.status;
	}
};
function tt(e) {
	return typeof e == "object" && !!e || e instanceof Error;
}
function nt(e) {
	if (!tt(e)) return;
	let t = e.status;
	return typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599 ? t : void 0;
}
function rt(e) {
	let t = nt(e);
	if (!tt(e) || typeof e.body != "string") return new et(ke, { status: t });
	try {
		let n = Ze(JSON.parse(e.body));
		return new et(n.error.message, {
			code: n.error.code,
			status: t
		});
	} catch {
		return new et(Oe, { status: t });
	}
}
function it(e, t) {
	return Promise.resolve().then(e).then(t, (e) => {
		throw rt(e);
	});
}
function at() {
	let e = pe(), t = P(e);
	return t.current = e, N(() => ({
		list: () => it(() => t.current.get(Qe), Ve),
		create: (e, n) => it(() => t.current.post(Qe, Xe(e, n)), He),
		open: (e) => it(() => t.current.post($e, { name: e }), Ue)
	}), []);
}
function ot() {
	let e = pe(), [t, n] = F(0), [r, i] = F({ kind: "loading" });
	return j(() => {
		let t = !1;
		return i({ kind: "loading" }), Promise.resolve().then(() => e.get(he)).then((e) => {
			t || i(we(e));
		}, (e) => {
			t || i(De(e));
		}), () => {
			t = !0;
		};
	}, [t]), {
		state: r,
		retry: A(() => n((e) => e + 1), [])
	};
}
function st() {
	try {
		let e = fe.useChatLauncher;
		return typeof e == "function" ? e : void 0;
	} catch {
		return;
	}
}
var ct = st();
function lt() {
	let e = ct?.(), t = P(e);
	t.current = e;
	let n = A((e) => {
		e !== "" && t.current?.openChat?.({ slotKey: e });
	}, []);
	return typeof e?.openChat == "function" ? n : null;
}
var ut = {
	mode: "light",
	accent: null,
	colorTheme: null
}, dt = 64;
function ft(e) {
	if (typeof e != "string") return null;
	let t = e.trim();
	return t !== "" && t.length <= dt && /^[\w#(),.%\s-]+$/.test(t) ? t : null;
}
function pt(e) {
	if (typeof e != "object" || !e) return ut;
	let t = e;
	return {
		mode: t.mode === "dark" ? "dark" : t.mode === "light" ? "light" : ut.mode,
		accent: ft(t.accent),
		colorTheme: ft(t.colorTheme)
	};
}
function mt(e) {
	try {
		let t = fe[e];
		return typeof t == "function" ? t : void 0;
	} catch {
		return;
	}
}
var ht = mt("useTheme"), gt = mt("useNotify"), _t = mt("useNavBadge");
function vt(e) {
	if (e !== void 0) try {
		return e();
	} catch {
		return;
	}
}
function yt() {
	let e = pt(vt(ht));
	return N(() => e, [
		e.mode,
		e.accent,
		e.colorTheme
	]);
}
function bt(e) {
	typeof e == "object" && e && typeof e.then == "function" && e.then(void 0, () => {});
}
function xt() {
	let e = vt(gt), t = P(e);
	return t.current = e, A((e) => {
		let n = t.current;
		if (typeof n != "function" || e === "") return !1;
		try {
			return bt(n(e)), !0;
		} catch {
			return !1;
		}
	}, []);
}
function St() {
	let e = vt(_t), t = P(e);
	return t.current = e, A((e) => {
		let n = t.current;
		if (typeof n != "function") return !1;
		let r = Number.isFinite(e) ? Math.max(0, Math.trunc(e)) : 0;
		try {
			return bt(n(r)), !0;
		} catch {
			return !1;
		}
	}, []);
}
function Ct() {
	try {
		let e = fe.replayRecording;
		if (typeof e != "object" || !e) return null;
		let { load: t, present: n } = e;
		return typeof t == "function" && typeof n == "function" ? e : null;
	} catch {
		return null;
	}
}
var wt = Ct();
// src/components/house-art.tsx
function Tt({ viewBox: e, className: t, width: n, height: r, preserveAspectRatio: i, data: a = {}, children: o }) {
	return /* @__PURE__ */ L("svg", {
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
var Et = "var(--hh-surface-raised, none)", Dt = [
	"plain",
	"archivist",
	"draughtsman",
	"foreman",
	"tinker",
	"medium"
];
function Ot(e) {
	return Dt.find((t) => t !== "plain" && (e === t || e.startsWith(`${t}-`))) ?? "plain";
}
var kt = {
	plain: "M10 40 V20 a10 10 0 0 1 20 0 V40 l-3.5 -4 l-3.5 4 l-3 -4 l-3 4 l-3.5 -4 z",
	archivist: "M12 42 V18 a8 8 0 0 1 16 0 V36 q0 5 4 6 q-6 1 -8 -3 l-4 4 l-4 -4 z",
	draughtsman: "M10 40 V22 L20 6 L30 22 V40 l-5 -4 l-5 4 l-5 -4 z",
	foreman: "M7 40 V24 q0 -6 5 -8 a8 8 0 0 1 16 0 q5 2 5 8 V40 h-6 v-3 h-4 v3 h-4 v-3 h-4 v3 z",
	tinker: "M11 38 V24 a9 9 0 0 1 18 0 V38 l-3 -4 l-3 4 l-3 -4 l-3 4 l-3 -4 z",
	medium: "M4 40 q6 -4 6 -18 a10 10 0 0 1 20 0 q0 14 6 18 q-6 2 -9 -2 l-3.5 4 l-3.5 -4 l-3.5 4 l-3.5 -4 q-3 4 -9 2 z"
}, At = {
	plain: null,
	archivist: /* @__PURE__ */ L("path", {
		d: "M30 28 h8 v9 h-8 z M34 28 v9",
		strokeWidth: 1
	}),
	draughtsman: /* @__PURE__ */ L("path", {
		d: "M31 38 l4 -12 l4 12 M33 33 h4",
		strokeWidth: 1
	}),
	foreman: /* @__PURE__ */ L("path", {
		d: "M11 13 a9 7 0 0 1 18 0 h3 M11 13 h18",
		strokeWidth: 1.5
	}),
	tinker: /* @__PURE__ */ L("path", {
		d: "M31 38 l5 -9 m-3 -1 a3 3 0 1 0 5 3",
		strokeWidth: 1.5
	}),
	medium: /* @__PURE__ */ L("path", {
		d: "M20 3 l1.5 3 l3 .5 l-2.2 2 l.6 3 l-2.9 -1.6 l-2.9 1.6 l.6 -3 l-2.2 -2 l3 -.5 z",
		strokeWidth: 1
	})
}, jt = {
	idle: {
		tilt: "",
		marks: /* @__PURE__ */ L("path", { d: "M14 22 q2 2 4 0 M22 22 q2 2 4 0 M10 28 q-3 3 -2 7 M30 28 q3 3 2 7" })
	},
	working: {
		tilt: "rotate(6 20 40)",
		marks: /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L("circle", {
				cx: "17",
				cy: "21",
				r: "1.5",
				fill: "currentColor"
			}),
			/* @__PURE__ */ L("circle", {
				cx: "25",
				cy: "21",
				r: "1.5",
				fill: "currentColor"
			}),
			/* @__PURE__ */ L("path", { d: "M30 29 L41 18 M41 18 q3 -6 -1 -9 q-3 5 -6 12 M30 29 l-1 3" }),
			/* @__PURE__ */ L("path", { d: "M44 26 v-3 M42.5 24.5 h3 M8 22 v-3 M6.5 20.5 h3" })
		] })
	},
	waiting: {
		tilt: "",
		marks: /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L("circle", {
				cx: "16",
				cy: "21",
				r: "1.5",
				fill: "currentColor"
			}),
			/* @__PURE__ */ L("circle", {
				cx: "24",
				cy: "21",
				r: "1.5",
				fill: "currentColor"
			}),
			/* @__PURE__ */ L("path", { d: "M14 27 q2 2 4 0" }),
			/* @__PURE__ */ L("path", { d: "M30 24 L37 13 M10 28 q-3 3 -2 7" }),
			/* @__PURE__ */ R("g", {
				className: "hh-ui-art-glow",
				children: [/* @__PURE__ */ L("circle", {
					cx: "38",
					cy: "7",
					r: "7",
					fill: "currentColor",
					fillOpacity: .25,
					stroke: "none"
				}), /* @__PURE__ */ L("path", {
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
		marks: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("path", { d: "M14 22 h4 M22 22 h4 M16 28 h8 M12 33 L28 29 M12 29 L28 33" }), /* @__PURE__ */ L("g", {
			className: "hh-ui-art-web",
			strokeWidth: 1,
			children: /* @__PURE__ */ L("path", { d: "M30 4 L46 4 M46 4 L46 20 M46 4 L33 17 M38 4 q1 5 -3 8 q5 -2 11 0 M46 12 q-5 0 -8 -3" })
		})] })
	},
	failed: {
		tilt: "rotate(-24 20 40)",
		marks: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("path", { d: "M14 19 l4 4 M18 19 l-4 4 M22 19 l4 4 M26 19 l-4 4 M17 29 q3 -3 6 0 M9 30 l-4 6 M31 30 l4 6" }), /* @__PURE__ */ L("path", {
			className: "hh-ui-art-mark",
			d: "M38 6 l8 8 M46 6 l-8 8",
			strokeWidth: 3
		})] })
	},
	done: {
		tilt: "",
		marks: /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L("circle", {
				className: "hh-ui-art-check",
				cx: "20",
				cy: "24",
				r: "19",
				fill: "currentColor",
				fillOpacity: .12,
				stroke: "none"
			}),
			/* @__PURE__ */ L("path", { d: "M14 22 q2 -3 4 0 M22 22 q2 -3 4 0 M16 27 q4 4 8 0 M10 24 L5 14 M30 24 L35 14" }),
			/* @__PURE__ */ L("path", {
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
		marks: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("path", { d: "M16 18 a4 4 0 1 1 6 3.5 q-2 1 -2 4" }), /* @__PURE__ */ L("circle", {
			cx: "20",
			cy: "30",
			r: "0.8",
			fill: "currentColor"
		})] })
	}
};
function Mt({ state: e, variant: t = "plain", size: n = 40 }) {
	let r = jt[e], i = e === "not_applicable" || e === "unavailable";
	return /* @__PURE__ */ L(Tt, {
		viewBox: "0 0 48 46",
		className: "hh-ui-art-ghost",
		width: n,
		height: Math.round(n * 46 / 48),
		data: {
			"data-ghost": e,
			"data-variant": t
		},
		children: /* @__PURE__ */ R("g", {
			transform: r.tilt === "" ? void 0 : r.tilt,
			children: [
				/* @__PURE__ */ L("path", {
					d: kt[t],
					fill: i ? "none" : Et,
					strokeDasharray: i ? "2 4" : r.dash
				}),
				i ? null : At[t],
				/* @__PURE__ */ L("g", {
					strokeWidth: 1.5,
					children: r.marks
				})
			]
		})
	});
}
var Nt = {
	sealed: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
			fill: Et
		}),
		/* @__PURE__ */ L("path", {
			d: "M5 22 H27",
			strokeWidth: 3
		}),
		/* @__PURE__ */ L("circle", {
			cx: "16",
			cy: "22",
			r: "4",
			fill: Et
		}),
		/* @__PURE__ */ L("path", {
			d: "M14.5 22 h3",
			strokeWidth: 1
		})
	] }),
	waiting: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
			fill: Et
		}),
		/* @__PURE__ */ L("circle", {
			cx: "16",
			cy: "18",
			r: "3"
		}),
		/* @__PURE__ */ L("path", { d: "M16 21 v3" }),
		/* @__PURE__ */ L("path", {
			d: "M28 12 l4 -3 M29 18 h5 M28 24 l4 3",
			strokeWidth: 1.5
		})
	] }),
	open: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38",
			strokeDasharray: "1 3"
		}),
		/* @__PURE__ */ L("path", {
			d: "M24 38 V8 l10 4 V42 z",
			fill: Et
		}),
		/* @__PURE__ */ L("circle", {
			cx: "31",
			cy: "26",
			r: "1",
			fill: "currentColor"
		}),
		/* @__PURE__ */ L("path", {
			d: "M4 38 H24",
			strokeWidth: 1
		})
	] }),
	rejected: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("path", {
		d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
		fill: Et
	}), /* @__PURE__ */ L("path", {
		d: "M4 14 L28 32 M28 14 L4 32",
		strokeWidth: 3
	})] }),
	not_applicable: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("path", { d: "M4 38 H28" }), /* @__PURE__ */ L("path", {
		d: "M8 38 V12 a8 8 0 0 1 16 0 V38",
		strokeDasharray: "1 5",
		strokeWidth: 1
	})] }),
	unavailable: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
			strokeDasharray: "2 4"
		}),
		/* @__PURE__ */ L("path", {
			d: "M13 18 a3.5 3.5 0 1 1 5 3 q-2 1 -2 4",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ L("circle", {
			cx: "16",
			cy: "30",
			r: "0.8",
			fill: "currentColor"
		})
	] })
};
function Pt({ state: e, size: t = 30 }) {
	return /* @__PURE__ */ L(Tt, {
		viewBox: "0 0 36 44",
		className: "hh-ui-art-door",
		width: t,
		height: Math.round(t * 44 / 36),
		data: { "data-door": e },
		children: Nt[e]
	});
}
// src/components/room-paint.tsx
var z = (e) => `hh-p-${e}`, Ft = (e) => `hh-ps-${e}`, It = 1200;
function Lt(e) {
	let t = e % 2147483647;
	return t <= 0 && (t += 2147483646), () => (t = t * 16807 % 2147483647, (t - 1) / 2147483646);
}
var Rt = [
	"cloth",
	"brass",
	"ecto-d",
	"paper-d",
	"night-2",
	"cloth-d",
	"wall-l",
	"brass-d"
];
function zt(e, t, n, r, i) {
	let a = Lt(i), o = [], s = e + 2, c = 0;
	for (; s < e + n - 8;) {
		let e = 7 + Math.round(a() * 9), n = Math.round(r * (.62 + a() * .36)), i = Rt[Math.floor(a() * Rt.length)];
		a() < .1 ? s += e + 6 : (o.push(/* @__PURE__ */ L("rect", {
			className: z(i),
			x: s,
			y: t + r - n,
			width: e,
			height: n
		}, `b${c}`)), o.push(/* @__PURE__ */ L("rect", {
			className: z("shade"),
			x: s + e - 2,
			y: t + r - n,
			width: 2,
			height: n
		}, `s${c}`)), a() < .5 && o.push(/* @__PURE__ */ L("rect", {
			className: z("brass-l"),
			x: s + 1,
			y: t + r - n + 6,
			width: e - 3,
			height: 2
		}, `t${c}`)), s += e + 1, c += 1);
	}
	return o;
}
function Bt({ x: e, y: t, w: n, h: r, seed: i, shelves: a = 4 }) {
	let o = (r - 16) / a;
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("wood-d"),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-dd"),
			x: e + 10,
			y: t + 10,
			width: n - 20,
			height: r - 20
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-l"),
			x: e,
			y: t,
			width: n,
			height: 5
		}),
		Array.from({ length: a }, (r, a) => {
			let s = t + 10 + a * o;
			return /* @__PURE__ */ R("g", { children: [
				zt(e + 12, s + 6, n - 24, o - 14, i + a * 31),
				/* @__PURE__ */ L("rect", {
					className: z("wood"),
					x: e + 8,
					y: s + o - 8,
					width: n - 16,
					height: 8
				}),
				/* @__PURE__ */ L("rect", {
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
function Vt({ x: e, y: t, w: n, h: r }) {
	let i = (t) => e + t / 100 * n, a = (e) => t + e / 100 * r;
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("night-1"),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ L("rect", {
			className: z("night-2"),
			x: e,
			y: a(34),
			width: n,
			height: r * .2
		}),
		/* @__PURE__ */ L("rect", {
			className: z("night-3"),
			x: e,
			y: a(50),
			width: n,
			height: r * .14
		}),
		/* @__PURE__ */ L("rect", {
			className: z("night-4"),
			x: e,
			y: a(62),
			width: n,
			height: r * .1
		}),
		/* @__PURE__ */ L("circle", {
			className: z("moon-halo"),
			cx: i(68),
			cy: a(30),
			r: n * .2
		}),
		/* @__PURE__ */ L("circle", {
			className: z("moon"),
			cx: i(68),
			cy: a(30),
			r: n * .115
		}),
		/* @__PURE__ */ L("circle", {
			className: z("moon-d"),
			cx: i(64),
			cy: a(25),
			r: n * .022
		}),
		/* @__PURE__ */ L("circle", {
			className: z("moon-d"),
			cx: i(72),
			cy: a(35),
			r: n * .03
		}),
		/* @__PURE__ */ L("path", {
			className: z("hill-1"),
			d: `M${e} ${a(70)} Q${i(22)} ${a(52)} ${i(46)} ${a(68)} T${i(100)} ${a(60)} V${a(100)} H${e} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("hill-2"),
			d: `M${e} ${a(84)} Q${i(30)} ${a(70)} ${i(58)} ${a(84)} T${i(100)} ${a(78)} V${a(100)} H${e} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("hill-2"),
			d: `M${i(20)} ${a(86)} L${i(21)} ${a(52)} L${i(14)} ${a(38)} L${i(16)} ${a(37)} L${i(22)} ${a(47)} L${i(23)} ${a(30)} L${i(25)} ${a(30)} L${i(25)} ${a(46)} L${i(33)} ${a(34)} L${i(35)} ${a(36)} L${i(26)} ${a(54)} L${i(27)} ${a(86)} Z`
		}),
		[
			44,
			54,
			82
		].map((e, t) => /* @__PURE__ */ L("path", {
			className: z("hill-1"),
			d: `M${i(e)} ${a(82 - t)} v${-r * .07} a${n * .022} ${n * .022} 0 0 1 ${n * .044} 0 v${r * .07} Z`
		}, e)),
		[
			62,
			66,
			70,
			74
		].map((e) => /* @__PURE__ */ L("rect", {
			className: z("hill-2"),
			x: i(e),
			y: a(72),
			width: n * .012,
			height: r * .12
		}, e)),
		/* @__PURE__ */ L("rect", {
			className: z("hill-2"),
			x: i(60),
			y: a(76),
			width: n * .17,
			height: r * .015
		})
	] });
}
function Ht({ x: e, y: t, w: n, h: r, curtains: i = !0 }) {
	let a = [
		1,
		2,
		3
	].map((t) => e + n / 4 * t), o = [1, 2].map((e) => t + r / 3 * e);
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("wood-dd"),
			x: e - 18,
			y: t - 18,
			width: n + 36,
			height: r + 36
		}),
		/* @__PURE__ */ L(Vt, {
			x: e,
			y: t,
			w: n,
			h: r
		}),
		a.map((e) => /* @__PURE__ */ L("rect", {
			className: z("wood-d"),
			x: e - 4,
			y: t,
			width: 8,
			height: r
		}, e)),
		o.map((t) => /* @__PURE__ */ L("rect", {
			className: z("wood-d"),
			x: e,
			y: t - 4,
			width: n,
			height: 8
		}, t)),
		/* @__PURE__ */ L("rect", {
			className: z("wood"),
			x: e - 26,
			y: t + r + 12,
			width: n + 52,
			height: 14
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-l"),
			x: e - 26,
			y: t + r + 12,
			width: n + 52,
			height: 3
		}),
		i ? /* @__PURE__ */ R("g", { children: [
			/* @__PURE__ */ L("rect", {
				className: z("brass-d"),
				x: e - 44,
				y: t - 36,
				width: n + 88,
				height: 8
			}),
			[e - 40, e + n - 30].map((e, n) => /* @__PURE__ */ R("g", { children: [
				/* @__PURE__ */ L("path", {
					className: z("cloth"),
					d: `M${e} ${t - 30} h70 q${n === 0 ? -10 : 10} ${r * .5} ${n === 0 ? -34 : 34} ${r * .62} q${n === 0 ? 22 : -22} ${r * .2} ${n === 0 ? 10 : -10} ${r * .5} h-46 Z`
				}),
				/* @__PURE__ */ L("path", {
					className: z("cloth-d"),
					d: `M${e + 18} ${t - 30} h10 q-6 ${r * .6} -8 ${r * 1.1} h-8 q8 -${r * .5} 6 -${r * 1.1} Z`
				}),
				/* @__PURE__ */ L("path", {
					className: z("cloth-d"),
					d: `M${e + 46} ${t - 30} h8 q-4 ${r * .5} -12 ${r * .7} h-6 q10 -${r * .3} 10 -${r * .7} Z`
				})
			] }, e)),
			/* @__PURE__ */ L("rect", {
				className: z("brass"),
				x: e - 46,
				y: t + r * .56,
				width: 26,
				height: 8
			}),
			/* @__PURE__ */ L("rect", {
				className: z("brass"),
				x: e + n + 20,
				y: t + r * .56,
				width: 26,
				height: 8
			})
		] }) : null
	] });
}
function Ut({ x: e, y: t, h: n }) {
	let r = n * .26;
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("wood-d"),
			d: `M${e} ${t + n} V${t + n * .12} q${r / 2} ${-n * .14} ${r} 0 V${t + n} Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-dd"),
			x: e + r * .16,
			y: t + n * .34,
			width: r * .68,
			height: n * .5
		}),
		/* @__PURE__ */ L("rect", {
			className: z("glass"),
			x: e + r * .22,
			y: t + n * .36,
			width: r * .56,
			height: n * .46
		}),
		/* @__PURE__ */ L("rect", {
			className: z("brass-d"),
			x: e + r * .47,
			y: t + n * .36,
			width: r * .06,
			height: n * .3
		}),
		/* @__PURE__ */ L("circle", {
			className: z("brass"),
			cx: e + r * .5,
			cy: t + n * .7,
			r: r * .16
		}),
		/* @__PURE__ */ L("circle", {
			className: z("brass-l"),
			cx: e + r * .45,
			cy: t + n * .685,
			r: r * .05
		}),
		/* @__PURE__ */ L("circle", {
			className: z("brass-d"),
			cx: e + r * .5,
			cy: t + n * .2,
			r: r * .4
		}),
		/* @__PURE__ */ L("circle", {
			className: z("bone"),
			cx: e + r * .5,
			cy: t + n * .2,
			r: r * .33
		}),
		/* @__PURE__ */ L("path", {
			className: z("ink"),
			d: `M${e + r * .48} ${t + n * .2} v${-n * .065} h${r * .04} v${n * .065} l${r * .2} ${n * .03} l${-r * .02} ${n * .012} Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood"),
			x: e - 6,
			y: t + n - 14,
			width: r + 12,
			height: 14
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-l"),
			x: e - 6,
			y: t + n - 14,
			width: r + 12,
			height: 3
		}),
		/* @__PURE__ */ L("rect", {
			className: z("shade"),
			x: e + r * .82,
			y: t + n * .14,
			width: r * .18,
			height: n * .86
		})
	] });
}
function Wt({ x: e, y: t, w: n, h: r }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("stone"),
			x: e,
			y: t + r * .16,
			width: n,
			height: r * .84
		}),
		/* @__PURE__ */ L("rect", {
			className: z("stone-l"),
			x: e - 12,
			y: t,
			width: n + 24,
			height: r * .16
		}),
		/* @__PURE__ */ L("rect", {
			className: z("stone-d"),
			x: e - 12,
			y: t + r * .13,
			width: n + 24,
			height: r * .04
		}),
		/* @__PURE__ */ L("path", {
			className: z("ink"),
			d: `M${e + n * .16} ${t + r} V${t + r * .5} q${n * .34} ${-r * .22} ${n * .68} 0 V${t + r} Z`
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("ecto-glow"),
			cx: e + n * .5,
			cy: t + r * .86,
			rx: n * .3,
			ry: r * .2
		}),
		/* @__PURE__ */ L("path", {
			className: z("ecto-d"),
			d: `M${e + n * .3} ${t + r * .97} q${-n * .04} ${-r * .2} ${n * .06} ${-r * .3} q${n * .02} ${r * .1} ${n * .08} ${r * .06} q${-n * .02} ${-r * .18} ${n * .08} ${-r * .26} q${n * .04} ${r * .16} ${n * .1} ${r * .2} q${n * .06} ${-r * .04} ${n * .04} ${-r * .14} q${n * .1} ${r * .14} ${n * .06} ${r * .44} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("ecto"),
			d: `M${e + n * .4} ${t + r * .97} q${-n * .03} ${-r * .14} ${n * .05} ${-r * .2} q${n * .02} ${r * .06} ${n * .06} ${r * .02} q0 ${-r * .1} ${n * .05} ${-r * .14} q${n * .07} ${r * .12} ${n * .04} ${r * .32} Z`
		}),
		/* @__PURE__ */ L("rect", {
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
		].map((i, a) => /* @__PURE__ */ L("rect", {
			className: z("stone-d"),
			x: e + n * i,
			y: t + r * (a % 2 == 0 ? .3 : .24),
			width: n * .16,
			height: 3
		}, i))
	] });
}
function Gt({ x: e, y: t, w: n, h: r }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("brass-d"),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ L("rect", {
			className: z("brass"),
			x: e + 4,
			y: t + 4,
			width: n - 8,
			height: r - 8
		}),
		/* @__PURE__ */ L("rect", {
			className: z("night-1"),
			x: e + 11,
			y: t + 11,
			width: n - 22,
			height: r - 22
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("paper-d"),
			cx: e + n * .5,
			cy: t + r * .42,
			rx: n * .15,
			ry: r * .16
		}),
		/* @__PURE__ */ L("path", {
			className: z("cloth-d"),
			d: `M${e + 11} ${t + r - 11} q${n * .39 - 11} ${-r * .5} ${n - 22} 0 Z`
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("ink"),
			cx: e + n * .44,
			cy: t + r * .41,
			rx: n * .03,
			ry: r * .035
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("ink"),
			cx: e + n * .56,
			cy: t + r * .41,
			rx: n * .03,
			ry: r * .035
		})
	] });
}
function Kt({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("circle", {
			className: z("lamp-glow"),
			cx: e,
			cy: t - 20,
			r: 70
		}),
		/* @__PURE__ */ L("path", {
			className: z("brass-d"),
			d: `M${e - 16} ${t + 12} h32 l-6 12 h-20 Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("bone"),
			x: e - 6,
			y: t - 14,
			width: 12,
			height: 26
		}),
		/* @__PURE__ */ L("path", {
			className: z("lamp"),
			d: `M${e} ${t - 44} q11 16 0 28 q-11 -12 0 -28 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("moon"),
			d: `M${e} ${t - 34} q5 9 0 16 q-5 -7 0 -16 Z`
		})
	] });
}
function qt({ x: e }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("ink"),
			x: e - 2,
			y: 0,
			width: 4,
			height: 96
		}),
		/* @__PURE__ */ L("circle", {
			className: z("lamp-glow"),
			cx: e,
			cy: 130,
			r: 150
		}),
		/* @__PURE__ */ L("path", {
			className: z("ink"),
			d: `M${e - 110} 122 q110 54 220 0 v10 q-110 54 -220 0 Z`
		}),
		[
			-104,
			-52,
			0,
			52,
			104
		].map((t) => /* @__PURE__ */ R("g", { children: [/* @__PURE__ */ L("rect", {
			className: z("bone"),
			x: e + t - 5,
			y: t === 0 ? 118 : 100 + Math.abs(t) * .06,
			width: 10,
			height: 24
		}), /* @__PURE__ */ L("path", {
			className: z("lamp"),
			d: `M${e + t} ${t === 0 ? 92 : 74 + Math.abs(t) * .06} q9 14 0 24 q-9 -10 0 -24 Z`
		})] }, t))
	] });
}
function Jt({ x: e, y: t, size: n, flip: r = !1 }) {
	let i = r ? -1 : 1, a = (r) => {
		let a = r * Math.PI / 180;
		return `M${e} ${t} l${i * Math.cos(a) * n} ${Math.sin(a) * n}`;
	}, o = (n) => `M${e + i * n} ${t} Q${e + i * n * .62} ${t + n * .62} ${e} ${t + n}`;
	return /* @__PURE__ */ R("g", {
		className: Ft("web"),
		fill: "none",
		strokeWidth: 1.4,
		children: [/* @__PURE__ */ L("path", { d: [
			8,
			30,
			52,
			74
		].map(a).join(" ") }), /* @__PURE__ */ L("path", { d: [
			.34,
			.6,
			.86
		].map((e) => o(n * e)).join(" ") })]
	});
}
function Yt(e) {
	return {
		top: 90 * e / 160,
		bottom: 640 - 120 * e / 160
	};
}
function Xt(e, t, n) {
	let r = Yt(e), i = Yt(t), a = r.bottom - (r.bottom - r.top) * .66, o = i.bottom - (i.bottom - i.top) * .66, s = (e) => n ? It - e : e;
	return `M${s(e)} ${a} L${s(t)} ${o} L${s(t)} ${i.bottom} L${s(e)} ${r.bottom} Z`;
}
function Zt({ mirror: e, state: t }) {
	let n = (t) => e ? It - t : t, r = t === "open", i = t === "waiting";
	return /* @__PURE__ */ R("g", {
		"data-paint-door": t,
		children: [
			/* @__PURE__ */ L("path", {
				className: z("wood-dd"),
				d: Xt(30, 132, e)
			}),
			r || i ? /* @__PURE__ */ L("path", {
				className: z("lamp"),
				d: Xt(38, 124, e)
			}) : null,
			r || i ? /* @__PURE__ */ L("path", {
				className: z("moon-halo"),
				d: Xt(38, 124, e)
			}) : null,
			r ? /* @__PURE__ */ L("path", {
				className: z("wood"),
				d: `M${n(124)} 232 L${n(150)} 214 L${n(150)} 582 L${n(124)} 548 Z`
			}) : /* @__PURE__ */ R("g", { children: [
				/* @__PURE__ */ L("path", {
					className: z("wood"),
					d: Xt(i ? 62 : 38, 124, e)
				}),
				/* @__PURE__ */ L("path", {
					className: z("wood-d"),
					d: `M${n(i ? 74 : 56)} 290 L${n(108)} 286 L${n(108)} 380 L${n(i ? 74 : 56)} 392 Z`
				}),
				/* @__PURE__ */ L("path", {
					className: z("wood-d"),
					d: `M${n(i ? 74 : 56)} 420 L${n(108)} 404 L${n(108)} 528 L${n(i ? 74 : 56)} 560 Z`
				}),
				/* @__PURE__ */ L("circle", {
					className: z("brass"),
					cx: n(i ? 70 : 48),
					cy: 404,
					r: 7
				}),
				/* @__PURE__ */ L("circle", {
					className: z("brass-l"),
					cx: n(i ? 69 : 47),
					cy: 402,
					r: 2.5
				})
			] }),
			t === "sealed" ? /* @__PURE__ */ R("g", { children: [
				/* @__PURE__ */ L("path", {
					className: z("ink"),
					d: `M${n(30)} 380 L${n(132)} 362 L${n(132)} 382 L${n(30)} 402 Z`
				}),
				/* @__PURE__ */ L("circle", {
					className: z("brass"),
					cx: n(82),
					cy: 382,
					r: 13
				}),
				/* @__PURE__ */ L("circle", {
					className: z("ink"),
					cx: n(82),
					cy: 380,
					r: 4
				}),
				/* @__PURE__ */ L("rect", {
					className: z("ink"),
					x: n(82) - 2,
					y: 380,
					width: 4,
					height: 9
				})
			] }) : null,
			t === "rejected" ? /* @__PURE__ */ R("g", { children: [/* @__PURE__ */ L("path", {
				className: z("bone-d"),
				d: `M${n(26)} 300 L${n(136)} 420 L${n(136)} 442 L${n(26)} 324 Z`
			}), /* @__PURE__ */ L("path", {
				className: z("bone"),
				d: `M${n(26)} 470 L${n(136)} 300 L${n(136)} 324 L${n(26)} 496 Z`
			})] }) : null
		]
	});
}
function Qt({ floor: e, beams: t = !1, leftDoor: n, rightDoor: r, children: i }) {
	let a = Array.from({ length: 17 }, (e, t) => -400 + t * 125);
	return /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: z("ceil"),
			d: "M0 0 H1200 L1040 90 H160 Z"
		}),
		/* @__PURE__ */ L("path", {
			className: z("side"),
			d: "M0 0 L160 90 V520 L0 640 Z"
		}),
		/* @__PURE__ */ L("path", {
			className: z("side-d"),
			d: "M1200 0 L1040 90 V520 L1200 640 Z"
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wall"),
			x: 160,
			y: 90,
			width: 880,
			height: 430
		}),
		Array.from({ length: 22 }, (e, t) => /* @__PURE__ */ L("rect", {
			className: z("wall-l"),
			x: 170 + t * 40,
			y: 112,
			width: 14,
			height: 318,
			opacity: .18
		}, t)),
		/* @__PURE__ */ L("rect", {
			className: z("wall-dd"),
			x: 160,
			y: 90,
			width: 880,
			height: 22
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wall-l"),
			x: 160,
			y: 108,
			width: 880,
			height: 4
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wall-d"),
			x: 160,
			y: 430,
			width: 880,
			height: 90
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wall-l"),
			x: 160,
			y: 430,
			width: 880,
			height: 5
		}),
		Array.from({ length: 8 }, (e, t) => /* @__PURE__ */ L("rect", {
			className: z("wall-dd"),
			x: 176 + t * 110,
			y: 448,
			width: 94,
			height: 52
		}, t)),
		/* @__PURE__ */ L("rect", {
			className: z("wood-dd"),
			x: 160,
			y: 508,
			width: 880,
			height: 12
		}),
		/* @__PURE__ */ L("path", {
			className: z("wall-dd"),
			d: "M0 484 L160 430 V520 L0 640 Z",
			opacity: .55
		}),
		/* @__PURE__ */ L("path", {
			className: z("wall-dd"),
			d: "M1200 484 L1040 430 V520 L1200 640 Z",
			opacity: .7
		}),
		/* @__PURE__ */ L("path", {
			className: z(e === "tiles" ? "tile" : "floor"),
			d: "M160 520 H1040 L1200 640 V750 H0 V640 Z"
		}),
		/* @__PURE__ */ R("g", {
			className: Ft(e === "tiles" ? "tile-line" : "floor-line"),
			fill: "none",
			strokeWidth: e === "tiles" ? 3 : 2,
			children: [/* @__PURE__ */ L("path", { d: a.map((e) => `M${600 + (e - 600) * 220 / 450} 520 L${e} 750`).join(" ") }), e === "tiles" ? /* @__PURE__ */ L("path", { d: [
				540,
				566,
				598,
				640,
				694
			].map((e) => `M${160 - (e - 520) * 160 / 120} ${e} H${1040 + (e - 520) * 160 / 120}`).join(" ") }) : null]
		}),
		/* @__PURE__ */ L("path", {
			className: z("shade"),
			d: "M160 520 H1040 L1090 558 H110 Z",
			opacity: .6
		}),
		t ? /* @__PURE__ */ R("g", { children: [
			/* @__PURE__ */ L("path", {
				className: z("wood-dd"),
				d: "M0 0 H70 L250 90 H160 Z"
			}),
			/* @__PURE__ */ L("path", {
				className: z("wood-dd"),
				d: "M1200 0 H1130 L950 90 H1040 Z"
			}),
			[
				330,
				600,
				870
			].map((e) => /* @__PURE__ */ L("path", {
				className: z("wood-dd"),
				d: `M${600 + (e - 600) * 1.36 - 26} 0 h52 L${e + 18} 90 h-36 Z`
			}, e)),
			/* @__PURE__ */ L("rect", {
				className: z("wood-dd"),
				x: 160,
				y: 90,
				width: 880,
				height: 30
			}),
			/* @__PURE__ */ L("rect", {
				className: z("wood-d"),
				x: 160,
				y: 116,
				width: 880,
				height: 5
			})
		] }) : null,
		n ? /* @__PURE__ */ L(Zt, {
			mirror: !1,
			state: "plain"
		}) : null,
		r === null ? null : /* @__PURE__ */ L(Zt, {
			mirror: !0,
			state: r
		}),
		i,
		/* @__PURE__ */ L(Jt, {
			x: 0,
			y: 0,
			size: 170
		}),
		/* @__PURE__ */ L(Jt, {
			x: 1200,
			y: 0,
			size: 120,
			flip: !0
		}),
		/* @__PURE__ */ L("path", {
			className: z("vignette"),
			d: "M0 0 H1200 V750 H0 Z"
		})
	] });
}
function $t() {
	return /* @__PURE__ */ L("path", {
		className: z("moon-pool"),
		d: "M452 520 H748 L900 750 H300 Z"
	});
}
function en({ x: e }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("wood-dd"),
			x: e - 4,
			y: 230,
			width: 8,
			height: 300
		}),
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e - 34} 536 q34 -22 68 0 v8 h-68 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e - 4} 250 l-34 -22 l4 -6 l30 18 Z M${e + 4} 250 l34 -22 l-4 -6 l-30 18 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("cloth-d"),
			d: `M${e + 8} 250 q40 30 34 150 q-22 14 -44 0 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("ink"),
			d: `M${e - 50} 224 h40 l-6 -30 h-28 Z M${e - 58} 224 h56 v7 h-56 Z`
		})
	] });
}
function tn({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("wood-dd"),
			x: e - 5,
			y: t,
			width: 10,
			height: 92
		}),
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e - 36} ${t + 100} q36 -22 72 0 v8 h-72 Z`
		}),
		/* @__PURE__ */ L("circle", {
			className: z("night-3"),
			cx: e,
			cy: t - 34,
			r: 42
		}),
		/* @__PURE__ */ L("path", {
			className: z("ecto-d"),
			d: `M${e - 26} ${t - 56} q20 -10 30 6 q-6 16 -22 10 Z M${e + 4} ${t - 26} q22 -6 26 10 q-10 18 -26 6 Z M${e - 30} ${t - 22} q10 4 8 16 q-10 2 -12 -8 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("brass"),
			d: `M${e - 48} ${t - 34} a48 48 0 0 0 96 0 h-6 a42 42 0 0 1 -84 0 Z`
		})
	] });
}
function nn({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e + 40} ${t + 60} h14 v150 h-14 Z M${e + 210} ${t + 20} h14 v190 h-14 Z M${e + 20} ${t + 200} h230 v12 h-230 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("wood"),
			d: `M${e} ${t + 70} L${e + 280} ${t} l8 24 L${e + 8} ${t + 96} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("wood-l"),
			d: `M${e} ${t + 70} L${e + 280} ${t} l1.5 5 L${e + 1.5} ${t + 75} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("blueprint"),
			d: `M${e + 40} ${t + 54} L${e + 244} ${t + 4} l7 22 L${e + 47} ${t + 76} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: Ft("paper"),
			fill: "none",
			d: `M${e + 70} ${t + 56} l70 -17 M${e + 80} ${t + 66} l44 -11 M${e + 160} ${t + 30} l50 -12 l4 12 l-50 12 Z`,
			strokeWidth: 2
		}),
		/* @__PURE__ */ L("path", {
			className: z("brass"),
			d: `M${e + 250} ${t - 6} l40 -84 l8 4 l-38 84 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("lamp"),
			d: `M${e + 276} ${t - 104} l52 16 l-22 34 l-42 -14 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("lamp-glow"),
			d: `M${e + 264} ${t - 70} l42 14 l-60 90 l-110 -30 Z`
		})
	] });
}
function rn({ x: e, y: t, w: n, h: r }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("wood-d"),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-l"),
			x: e,
			y: t,
			width: n,
			height: 4
		}),
		Array.from({ length: 6 }, (i, a) => /* @__PURE__ */ R("g", { children: [/* @__PURE__ */ L("rect", {
			className: z("wood"),
			x: e + 8,
			y: t + 10 + a * ((r - 14) / 6),
			width: n - 16,
			height: (r - 14) / 6 - 6
		}), /* @__PURE__ */ L("rect", {
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
		].map((r, i) => /* @__PURE__ */ R("g", { children: [/* @__PURE__ */ L("rect", {
			className: z(i % 2 == 0 ? "paper" : "blueprint"),
			x: e + n * r,
			y: t - 62 - i * 6,
			width: n * .14,
			height: 62 + i * 6
		}), /* @__PURE__ */ L("ellipse", {
			className: z(i % 2 == 0 ? "paper-d" : "night-2"),
			cx: e + n * (r + .07),
			cy: t - 62 - i * 6,
			rx: n * .07,
			ry: 5
		})] }, r))
	] });
}
function an({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("blueprint"),
			x: e,
			y: t,
			width: 190,
			height: 130
		}),
		/* @__PURE__ */ L("g", {
			className: Ft("paper"),
			fill: "none",
			strokeWidth: 2.5,
			children: /* @__PURE__ */ L("path", { d: `M${e + 34} ${t + 104} V${t + 60} L${e + 82} ${t + 28} L${e + 130} ${t + 60} V${t + 104} Z M${e + 66} ${t + 104} V${t + 78} h26 v26 M${e + 104} ${t + 66} h16 v16 h-16 Z M${e + 20} ${t + 116} H${e + 170}` })
		}),
		/* @__PURE__ */ L("rect", {
			className: z("paper"),
			x: e + 26,
			y: t + 150,
			width: 120,
			height: 84
		}),
		/* @__PURE__ */ L("g", {
			className: Ft("night-2"),
			fill: "none",
			strokeWidth: 2,
			children: /* @__PURE__ */ L("path", { d: `M${e + 40} ${t + 170} h92 M${e + 40} ${t + 186} h70 M${e + 40} ${t + 202} h84 M${e + 40} ${t + 218} h50` })
		}),
		[
			[e + 8, t + 8],
			[e + 182, t + 8],
			[e + 34, t + 156],
			[e + 138, t + 156]
		].map(([e, t]) => /* @__PURE__ */ L("circle", {
			className: z("cloth"),
			cx: e,
			cy: t,
			r: 5
		}, `${e}-${t}`)),
		/* @__PURE__ */ L("path", {
			className: z("wood"),
			d: `M${e + 160} ${t + 144} h56 v12 h-22 v96 h-12 v-96 h-22 Z`
		})
	] });
}
function on({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("wood"),
			x: e,
			y: t,
			width: 220,
			height: 190
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-l"),
			x: e,
			y: t,
			width: 220,
			height: 4
		}),
		Array.from({ length: 5 }, (n, r) => Array.from({ length: 9 }, (n, i) => /* @__PURE__ */ L("circle", {
			className: z("wood-dd"),
			cx: e + 22 + i * 22,
			cy: t + 24 + r * 36,
			r: 2.5
		}, `${r}-${i}`))),
		/* @__PURE__ */ L("path", {
			className: z("bone-d"),
			d: `M${e + 20} ${t + 34} h30 v22 h-11 v80 h-8 v-80 h-11 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("brass-d"),
			d: `M${e + 70} ${t + 40} l64 22 l-6 16 l-64 -22 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e + 96} ${t + 72} l14 5 l-26 80 l-14 -5 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("bone-d"),
			d: `M${e + 150} ${t + 34} a22 22 0 1 0 30 30 l22 70 l14 -4 l-22 -70 a22 22 0 0 0 -44 -26 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("cloth"),
			d: `M${e + 150} ${t + 150} h52 v22 h-52 Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("ink"),
			x: e + 160,
			y: t + 140,
			width: 8,
			height: 12
		})
	] });
}
function sn({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e + 24} ${t + 30} h20 v170 h-20 Z M${e + 396} ${t + 30} h20 v170 h-20 Z M${e + 44} ${t + 120} h352 v14 h-352 Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood"),
			x: e,
			y: t,
			width: 440,
			height: 32
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-l"),
			x: e,
			y: t,
			width: 440,
			height: 5
		}),
		/* @__PURE__ */ L("path", {
			className: z("ink"),
			d: `M${e + 330} ${t} v-34 h64 v34 Z M${e + 346} ${t - 34} v-22 h32 v22 Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("stone-l"),
			x: e + 310,
			y: t - 66,
			width: 104,
			height: 8
		}),
		/* @__PURE__ */ L("path", {
			className: z("cloth"),
			d: `M${e + 60} ${t} v-46 h120 v46 Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("cloth-d"),
			x: e + 60,
			y: t - 22,
			width: 120,
			height: 6
		}),
		/* @__PURE__ */ L("path", {
			className: z("brass"),
			d: `M${e + 96} ${t - 46} v-18 h48 v18 h-8 v-10 h-32 v10 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("bone-d"),
			d: `M${e + 220} ${t} l52 -74 l14 10 l-46 64 Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood-d"),
			x: e + 470,
			y: t + 110,
			width: 96,
			height: 90
		}),
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e + 470} ${t + 110} l96 90 h-10 l-86 -80 Z M${e + 566} ${t + 110} l-96 90 h10 l86 -80 Z`
		})
	] });
}
function cn({ x: e, y: t, w: n }) {
	let r = (t, r) => {
		let i = Lt(r), a = [/* @__PURE__ */ L("rect", {
			className: z("wood"),
			x: e,
			y: t + 62,
			width: n,
			height: 10
		}, "s"), /* @__PURE__ */ L("rect", {
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
			a.push(/* @__PURE__ */ R("g", { children: [
				/* @__PURE__ */ L("rect", {
					className: z("glass-l"),
					x: o,
					y: t + 62 - n,
					width: e,
					height: n
				}),
				/* @__PURE__ */ L("rect", {
					className: z(r),
					x: o + 2,
					y: t + 62 - n * .6,
					width: e - 4,
					height: n * .6 - 2
				}),
				/* @__PURE__ */ L("rect", {
					className: z("wood-dd"),
					x: o - 1,
					y: t + 56 - n,
					width: e + 2,
					height: 7
				})
			] }, s)), o += e + 10, s += 1;
		}
		return /* @__PURE__ */ L("g", { children: a }, t);
	};
	return /* @__PURE__ */ L("g", { children: [
		t,
		t + 86,
		t + 172
	].map((e, t) => r(e, 41 + t * 17)) });
}
function ln({ x: e, y: t }) {
	let n = (e, t, n, r, i) => /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z(i),
			x: e,
			y: t,
			width: n,
			height: r
		}),
		/* @__PURE__ */ L("rect", {
			className: z("shade"),
			x: e,
			y: t + r * .34,
			width: n,
			height: 4
		}),
		/* @__PURE__ */ L("rect", {
			className: z("brass-d"),
			x: e + n * .12,
			y: t,
			width: 10,
			height: r
		}),
		/* @__PURE__ */ L("rect", {
			className: z("brass-d"),
			x: e + n * .82,
			y: t,
			width: 10,
			height: r
		}),
		/* @__PURE__ */ L("rect", {
			className: z("brass"),
			x: e + n * .46,
			y: t + r * .26,
			width: n * .08,
			height: r * .2
		})
	] }, `${e}-${t}`);
	return /* @__PURE__ */ R("g", { children: [
		n(e, t + 96, 210, 104, "wood-d"),
		n(e + 24, t + 22, 150, 76, "cloth-d"),
		n(e + 46, t - 30, 96, 54, "wood")
	] });
}
function un({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("lamp-glow"),
			d: `M${e + 96} ${t + 44} L${e + 420} ${t - 70} V${t + 190} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e + 30} ${t + 80} l-40 150 h10 l40 -150 Z M${e + 70} ${t + 80} l40 150 h-10 l-40 -150 Z M${e + 46} ${t + 80} h8 v150 h-8 Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("ink"),
			x: e,
			y: t + 20,
			width: 100,
			height: 62
		}),
		/* @__PURE__ */ L("circle", {
			className: z("stone"),
			cx: e + 22,
			cy: t + 2,
			r: 34
		}),
		/* @__PURE__ */ L("circle", {
			className: z("ink"),
			cx: e + 22,
			cy: t + 2,
			r: 8
		}),
		/* @__PURE__ */ L("circle", {
			className: z("stone"),
			cx: e + 84,
			cy: t - 14,
			r: 42
		}),
		/* @__PURE__ */ L("circle", {
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
			return /* @__PURE__ */ L("circle", {
				className: z("stone-d"),
				cx: e + 84 + Math.cos(r) * 24,
				cy: t - 14 + Math.sin(r) * 24,
				r: 7
			}, n);
		}),
		/* @__PURE__ */ L("rect", {
			className: z("brass"),
			x: e + 96,
			y: t + 34,
			width: 28,
			height: 22
		}),
		/* @__PURE__ */ L("circle", {
			className: z("moon"),
			cx: e + 124,
			cy: t + 45,
			r: 9
		})
	] });
}
function dn({ x: e, y: t, w: n, h: r }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("bone-d"),
			d: `M${e} ${t + r} V${t + r * .3} q${n * .1} ${-r * .34} ${n * .5} ${-r * .3} q${n * .4} ${-r * .04} ${n * .5} ${r * .3} V${t + r} q${-n * .1} ${-r * .05} ${-n * .2} 0 q${-n * .1} ${-r * .06} ${-n * .2} 0 q${-n * .1} ${-r * .05} ${-n * .2} 0 q${-n * .1} ${-r * .06} ${-n * .2} 0 q${-n * .1} ${-r * .05} ${-n * .2} 0 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("bone"),
			d: `M${e + n * .1} ${t + r * .9} V${t + r * .34} q${n * .1} ${-r * .24} ${n * .3} ${-r * .24} q${-n * .14} ${r * .1} ${-n * .14} ${r * .8} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("shade"),
			d: `M${e + n * .62} ${t + r * .14} q${n * .3} ${r * .06} ${n * .38} ${r * .3} V${t + r * .96} h${-n * .14} Z`
		})
	] });
}
function fn({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e - 250} ${t + 190} v-150 h26 v70 h60 v80 h-18 v-56 h-42 v56 Z M${e + 250} ${t + 190} v-150 h-26 v70 h-60 v80 h18 v-56 h42 v56 Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("cloth-d"),
			d: `M${e - 170} ${t + 30} q20 110 46 170 h248 q26 -60 46 -170 Z`
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("cloth"),
			cx: e,
			cy: t + 30,
			rx: 170,
			ry: 30
		}),
		/* @__PURE__ */ L("path", {
			className: z("shade"),
			d: `M${e - 110} ${t + 70} q8 70 22 130 h10 q-12 -60 -18 -130 Z M${e + 20} ${t + 64} h14 v136 h-14 Z M${e + 110} ${t + 70} q-8 70 -22 130 h-10 q12 -60 18 -130 Z`
		}),
		/* @__PURE__ */ L("circle", {
			className: z("ecto-glow"),
			cx: e,
			cy: t - 34,
			r: 130
		}),
		/* @__PURE__ */ L("path", {
			className: z("brass-d"),
			d: `M${e - 40} ${t + 26} h80 l-12 -24 h-56 Z`
		}),
		/* @__PURE__ */ L("circle", {
			className: z("ecto-d"),
			cx: e,
			cy: t - 42,
			r: 56
		}),
		/* @__PURE__ */ L("circle", {
			className: z("ecto"),
			cx: e - 8,
			cy: t - 50,
			r: 42
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("moon"),
			cx: e - 22,
			cy: t - 66,
			rx: 12,
			ry: 18
		}),
		/* @__PURE__ */ L("rect", {
			className: z("bone"),
			x: e + 104,
			y: t - 24,
			width: 14,
			height: 50
		}),
		/* @__PURE__ */ L("path", {
			className: z("lamp"),
			d: `M${e + 111} ${t - 56} q10 16 0 28 q-10 -12 0 -28 Z`
		}),
		/* @__PURE__ */ L("rect", {
			className: z("brass-d"),
			x: e + 96,
			y: t + 22,
			width: 30,
			height: 8
		})
	] });
}
function pn({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("cloth-d"),
			d: "M160 112 H1040 V150 q-110 44 -220 0 q-110 44 -220 0 q-110 44 -220 0 q-110 44 -220 0 Z"
		}),
		/* @__PURE__ */ L("path", {
			className: z("cloth"),
			d: "M160 112 H1040 V132 q-110 40 -220 0 q-110 40 -220 0 q-110 40 -220 0 q-110 40 -220 0 Z"
		}),
		[
			-150,
			-75,
			0,
			75,
			150
		].map((n, r) => /* @__PURE__ */ R("g", { children: [
			/* @__PURE__ */ L("circle", {
				className: z("ink"),
				cx: e + n,
				cy: t,
				r: 26
			}),
			r === 2 ? /* @__PURE__ */ L("circle", {
				className: z("moon"),
				cx: e + n,
				cy: t,
				r: 24
			}) : null,
			r === 1 ? /* @__PURE__ */ L("path", {
				className: z("moon"),
				d: `M${e + n} ${t - 24} a24 24 0 0 1 0 48 a14 24 0 0 0 0 -48 Z`
			}) : null,
			r === 3 ? /* @__PURE__ */ L("path", {
				className: z("moon"),
				d: `M${e + n} ${t - 24} a24 24 0 0 0 0 48 a14 24 0 0 1 0 -48 Z`
			}) : null
		] }, n))
	] });
}
function mn({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("brass-d"),
			d: `M${e} ${t + 300} V${t + 60} a70 70 0 0 1 140 0 V${t + 300} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("night-2"),
			d: `M${e + 14} ${t + 286} V${t + 60} a56 56 0 0 1 112 0 V${t + 286} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("night-3"),
			d: `M${e + 30} ${t + 286} L${e + 96} ${t + 16} l14 6 L${e + 60} ${t + 286} Z`
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("paper-d"),
			cx: e + 78,
			cy: t + 130,
			rx: 20,
			ry: 28,
			opacity: .5
		})
	] });
}
function hn({ x: e, y: t }) {
	return /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("path", {
			className: z("wood-dd"),
			d: `M${e - 26} ${t + 380} V${t + 110} a176 176 0 0 1 352 0 V${t + 380} Z`
		}),
		/* @__PURE__ */ L("path", {
			className: z("night-2"),
			d: `M${e} ${t + 110} a150 150 0 0 1 300 0 Z`
		}),
		/* @__PURE__ */ L("circle", {
			className: z("moon"),
			cx: e + 196,
			cy: t + 52,
			r: 34
		}),
		/* @__PURE__ */ L("g", {
			className: Ft("wood-dd"),
			fill: "none",
			strokeWidth: 8,
			children: /* @__PURE__ */ L("path", { d: `M${e + 150} ${t - 36} V${t + 110} M${e + 44} ${t + 4} L${e + 150} ${t + 110} L${e + 256} ${t + 4}` })
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood"),
			x: e,
			y: t + 118,
			width: 146,
			height: 262
		}),
		/* @__PURE__ */ L("rect", {
			className: z("wood"),
			x: e + 154,
			y: t + 118,
			width: 146,
			height: 262
		}),
		[e + 18, e + 172].map((e) => /* @__PURE__ */ R("g", { children: [/* @__PURE__ */ L("rect", {
			className: z("wood-d"),
			x: e,
			y: t + 138,
			width: 110,
			height: 96
		}), /* @__PURE__ */ L("rect", {
			className: z("wood-d"),
			x: e,
			y: t + 252,
			width: 110,
			height: 110
		})] }, e)),
		/* @__PURE__ */ L("circle", {
			className: z("brass"),
			cx: e + 134,
			cy: t + 252,
			r: 8
		}),
		/* @__PURE__ */ L("circle", {
			className: z("brass"),
			cx: e + 166,
			cy: t + 252,
			r: 8
		}),
		/* @__PURE__ */ L("rect", {
			className: z("shade"),
			x: e + 146,
			y: t + 118,
			width: 8,
			height: 262
		})
	] });
}
function gn({ state: e }) {
	let t = e === "open";
	return /* @__PURE__ */ R("g", {
		"data-paint-door": e,
		children: [
			/* @__PURE__ */ L("path", {
				className: z("wood-dd"),
				d: "M836 520 V284 a74 74 0 0 1 148 0 V520 Z"
			}),
			t || e === "waiting" ? /* @__PURE__ */ L("path", {
				className: z("lamp"),
				d: "M848 520 V284 a62 62 0 0 1 124 0 V520 Z"
			}) : null,
			t ? /* @__PURE__ */ L("path", {
				className: z("wood"),
				d: "M972 240 L1010 262 V546 L972 520 Z"
			}) : /* @__PURE__ */ R("g", { children: [
				/* @__PURE__ */ L("path", {
					className: z("wood"),
					d: e === "waiting" ? "M872 520 V284 a50 62 0 0 1 100 0 V520 Z" : "M848 520 V284 a62 62 0 0 1 124 0 V520 Z"
				}),
				/* @__PURE__ */ L("rect", {
					className: z("wood-d"),
					x: 886,
					y: 300,
					width: 70,
					height: 84
				}),
				/* @__PURE__ */ L("rect", {
					className: z("wood-d"),
					x: 886,
					y: 404,
					width: 70,
					height: 96
				}),
				/* @__PURE__ */ L("circle", {
					className: z("brass"),
					cx: e === "waiting" ? 884 : 864,
					cy: 398,
					r: 7
				})
			] }),
			e === "sealed" ? /* @__PURE__ */ R("g", { children: [
				/* @__PURE__ */ L("rect", {
					className: z("ink"),
					x: 830,
					y: 372,
					width: 160,
					height: 20
				}),
				/* @__PURE__ */ L("circle", {
					className: z("brass"),
					cx: 910,
					cy: 382,
					r: 14
				}),
				/* @__PURE__ */ L("circle", {
					className: z("ink"),
					cx: 910,
					cy: 380,
					r: 4
				})
			] }) : null,
			e === "rejected" ? /* @__PURE__ */ R("g", { children: [/* @__PURE__ */ L("path", {
				className: z("bone-d"),
				d: "M826 300 L994 440 V462 L826 322 Z"
			}), /* @__PURE__ */ L("path", {
				className: z("bone"),
				d: "M826 480 L994 300 V324 L826 504 Z"
			})] }) : null
		]
	});
}
function _n(e, t) {
	switch (e) {
		case "foyer": return /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L(hn, {
				x: 450,
				y: 140
			}),
			/* @__PURE__ */ L(Ut, {
				x: 212,
				y: 170,
				h: 350
			}),
			/* @__PURE__ */ L(Gt, {
				x: 352,
				y: 170,
				w: 70,
				h: 92
			}),
			/* @__PURE__ */ L(Gt, {
				x: 790,
				y: 150,
				w: 96,
				h: 124
			}),
			/* @__PURE__ */ L(Gt, {
				x: 906,
				y: 186,
				w: 74,
				h: 96
			}),
			/* @__PURE__ */ L(Kt, {
				x: 400,
				y: 340
			}),
			/* @__PURE__ */ L(Kt, {
				x: 800,
				y: 340
			}),
			/* @__PURE__ */ L(en, { x: 950 }),
			/* @__PURE__ */ L(qt, { x: 600 }),
			/* @__PURE__ */ L("path", {
				className: z("cloth-d"),
				d: "M380 600 Q600 548 820 600 Q600 668 380 600 Z"
			}),
			/* @__PURE__ */ L("path", {
				className: z("cloth"),
				d: "M420 600 Q600 562 780 600 Q600 650 420 600 Z"
			})
		] });
		case "study": return /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L(Ht, {
				x: 470,
				y: 170,
				w: 260,
				h: 230
			}),
			/* @__PURE__ */ L($t, {}),
			/* @__PURE__ */ L(Bt, {
				x: 176,
				y: 128,
				w: 216,
				h: 392,
				seed: 7,
				shelves: 5
			}),
			/* @__PURE__ */ L(Wt, {
				x: 804,
				y: 300,
				w: 196,
				h: 220
			}),
			/* @__PURE__ */ L(Gt, {
				x: 846,
				y: 150,
				w: 112,
				h: 132
			}),
			/* @__PURE__ */ L(tn, {
				x: 420,
				y: 436
			}),
			/* @__PURE__ */ L(Kt, {
				x: 770,
				y: 250
			}),
			t ? /* @__PURE__ */ L("circle", {
				className: z("lamp-glow"),
				cx: 600,
				cy: 420,
				r: 320
			}) : null,
			/* @__PURE__ */ L("path", {
				className: z("cloth-d"),
				d: "M300 610 Q600 560 900 610 Q600 676 300 610 Z"
			})
		] });
		case "drafting-room": return /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L(Ht, {
				x: 470,
				y: 170,
				w: 260,
				h: 230,
				curtains: !1
			}),
			/* @__PURE__ */ L($t, {}),
			/* @__PURE__ */ L(an, {
				x: 186,
				y: 150
			}),
			/* @__PURE__ */ L(rn, {
				x: 806,
				y: 352,
				w: 206,
				h: 168
			}),
			/* @__PURE__ */ L(Kt, {
				x: 420,
				y: 270
			}),
			/* @__PURE__ */ L(nn, {
				x: 300,
				y: 400
			}),
			t ? /* @__PURE__ */ L("circle", {
				className: z("lamp-glow"),
				cx: 560,
				cy: 380,
				r: 300
			}) : null
		] });
		case "workshop": return /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L(Ht, {
				x: 500,
				y: 170,
				w: 200,
				h: 180,
				curtains: !1
			}),
			/* @__PURE__ */ L(on, {
				x: 196,
				y: 150
			}),
			/* @__PURE__ */ L(cn, {
				x: 770,
				y: 140,
				w: 250
			}),
			/* @__PURE__ */ L("rect", {
				className: z("ink"),
				x: 598,
				y: 0,
				width: 4,
				height: 150
			}),
			/* @__PURE__ */ L("path", {
				className: z("ink"),
				d: "M560 150 h80 l24 40 h-128 Z"
			}),
			/* @__PURE__ */ L("path", {
				className: z("lamp-glow"),
				d: "M536 190 h128 l150 340 H386 Z"
			}),
			/* @__PURE__ */ L(sn, {
				x: 300,
				y: 430
			}),
			t ? /* @__PURE__ */ L("circle", {
				className: z("lamp-glow"),
				cx: 600,
				cy: 420,
				r: 320
			}) : null
		] });
		case "attic": return /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L("circle", {
				className: z("wood-dd"),
				cx: 600,
				cy: 280,
				r: 126
			}),
			/* @__PURE__ */ R("g", { children: [
				/* @__PURE__ */ L("circle", {
					className: z("night-1"),
					cx: 600,
					cy: 280,
					r: 108
				}),
				/* @__PURE__ */ L("circle", {
					className: z("moon-halo"),
					cx: 628,
					cy: 262,
					r: 76
				}),
				/* @__PURE__ */ L("circle", {
					className: z("moon"),
					cx: 628,
					cy: 262,
					r: 46
				}),
				/* @__PURE__ */ L("circle", {
					className: z("moon-d"),
					cx: 614,
					cy: 250,
					r: 9
				}),
				/* @__PURE__ */ L("rect", {
					className: z("wood-dd"),
					x: 594,
					y: 172,
					width: 12,
					height: 216
				}),
				/* @__PURE__ */ L("rect", {
					className: z("wood-dd"),
					x: 492,
					y: 274,
					width: 216,
					height: 12
				})
			] }),
			/* @__PURE__ */ L("path", {
				className: z("moon-pool"),
				d: "M500 520 H700 L860 750 H340 Z"
			}),
			/* @__PURE__ */ L(ln, {
				x: 196,
				y: 320
			}),
			/* @__PURE__ */ L(dn, {
				x: 800,
				y: 240,
				w: 210,
				h: 280
			}),
			/* @__PURE__ */ L(un, {
				x: 470,
				y: 420
			})
		] });
		case "seance-room": return /* @__PURE__ */ R(I, { children: [
			/* @__PURE__ */ L(pn, {
				x: 600,
				y: 216
			}),
			/* @__PURE__ */ L(cn, {
				x: 186,
				y: 176,
				w: 190
			}),
			/* @__PURE__ */ L(mn, {
				x: 846,
				y: 196
			}),
			/* @__PURE__ */ L(Kt, {
				x: 420,
				y: 300
			}),
			/* @__PURE__ */ L(Kt, {
				x: 780,
				y: 300
			}),
			/* @__PURE__ */ L(fn, {
				x: 600,
				y: 470
			})
		] });
	}
}
function vn({ room: e, door: t, secondDoor: n = null, lit: r = !1, hasPrevious: i, hasNext: a }) {
	return /* @__PURE__ */ L(Tt, {
		viewBox: `0 0 ${It} 750`,
		className: "hh-paint",
		preserveAspectRatio: "xMidYMid slice",
		data: {
			"data-scene": e,
			"data-lit": r ? "true" : "false"
		},
		children: /* @__PURE__ */ L("g", {
			stroke: "none",
			children: /* @__PURE__ */ R(Qt, {
				floor: e === "foyer" || e === "study" ? "tiles" : "planks",
				beams: e === "attic",
				leftDoor: i,
				rightDoor: t ?? (a ? "plain" : null),
				children: [_n(e, r), n === null ? null : /* @__PURE__ */ L(gn, { state: n })]
			})
		})
	});
}
function yn() {
	return /* @__PURE__ */ L(Tt, {
		viewBox: `0 0 ${It} 750`,
		className: "hh-paint hh-paint-desk",
		preserveAspectRatio: "xMidYMid slice",
		children: /* @__PURE__ */ R("g", {
			stroke: "none",
			children: [
				/* @__PURE__ */ L("path", {
					className: z("shade"),
					d: "M40 640 H820 L900 750 H0 Z",
					opacity: .7
				}),
				/* @__PURE__ */ L("path", {
					className: z("wood"),
					d: "M60 622 H800 L880 750 H0 V690 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("wood-l"),
					d: "M60 622 H800 L804 629 H56 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("wood-d"),
					d: "M0 716 H858 L880 750 H0 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("leather"),
					d: "M110 640 H770 L818 706 H66 Z"
				}),
				/* @__PURE__ */ L("g", {
					className: Ft("brass-d"),
					fill: "none",
					strokeWidth: 2,
					children: /* @__PURE__ */ L("path", { d: "M124 648 H762 L798 698 H88 Z" })
				}),
				/* @__PURE__ */ L("ellipse", {
					className: z("lamp-glow"),
					cx: 118,
					cy: 610,
					rx: 120,
					ry: 90
				}),
				/* @__PURE__ */ L("path", {
					className: z("brass-d"),
					d: "M84 668 h68 l-10 12 h-48 Z"
				}),
				/* @__PURE__ */ L("rect", {
					className: z("bone"),
					x: 104,
					y: 612,
					width: 28,
					height: 58
				}),
				/* @__PURE__ */ L("path", {
					className: z("bone-d"),
					d: "M124 612 h8 v58 h-8 Z M108 620 q-6 16 0 30 h6 q-4 -14 0 -30 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("lamp"),
					d: "M118 566 q18 26 0 46 q-18 -20 0 -46 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("moon"),
					d: "M118 584 q8 14 0 26 q-8 -12 0 -26 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("cloth-d"),
					d: "M190 690 L330 706 L470 688 V698 L330 716 L190 700 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("paper"),
					d: "M196 686 q66 -26 134 14 q68 -40 134 -16 V640 q-66 -24 -134 16 q-68 -40 -134 -14 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("paper-d"),
					d: "M330 656 v44 q30 -16 60 -22 v-44 q-30 6 -60 22 Z",
					opacity: .5
				}),
				/* @__PURE__ */ L("g", {
					className: Ft("ink-soft"),
					fill: "none",
					strokeWidth: 2,
					children: /* @__PURE__ */ L("path", { d: "M216 652 q46 -12 96 12 M216 664 q46 -12 96 12 M216 676 q46 -12 96 12 M350 664 q46 -24 96 -14 M350 676 q46 -24 96 -14" })
				}),
				/* @__PURE__ */ L("path", {
					className: z("cloth"),
					d: "M326 656 h8 v62 l-4 -6 l-4 6 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("bone"),
					d: "M396 676 q40 -70 100 -96 q-8 54 -84 106 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("bone-d"),
					d: "M396 676 q44 -52 100 -96 q-52 54 -90 102 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("ink"),
					d: "M490 660 h44 v26 h-44 Z M498 650 h28 v10 h-28 Z"
				}),
				/* @__PURE__ */ L("ellipse", {
					className: z("night-3"),
					cx: 512,
					cy: 651,
					rx: 10,
					ry: 3
				}),
				/* @__PURE__ */ L("path", {
					className: z("wood-dd"),
					d: "M560 690 h108 v10 h-108 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("brass"),
					d: "M570 690 q0 -50 44 -50 q44 0 44 50 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("brass-l"),
					d: "M584 684 q2 -30 22 -38 q-12 14 -12 38 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("brass-d"),
					d: "M636 690 q-2 -34 -22 -50 q44 0 44 50 Z"
				}),
				/* @__PURE__ */ L("rect", {
					className: z("brass-d"),
					x: 608,
					y: 628,
					width: 12,
					height: 14
				}),
				/* @__PURE__ */ L("circle", {
					className: z("brass-l"),
					cx: 614,
					cy: 624,
					r: 8
				}),
				/* @__PURE__ */ L("path", {
					className: z("bone"),
					d: "M704 692 q-20 -4 -20 -28 q0 -26 28 -26 q28 0 28 26 q0 24 -20 28 v8 h-16 Z"
				}),
				/* @__PURE__ */ L("ellipse", {
					className: z("ink"),
					cx: 702,
					cy: 664,
					rx: 6,
					ry: 8
				}),
				/* @__PURE__ */ L("ellipse", {
					className: z("ink"),
					cx: 722,
					cy: 664,
					rx: 6,
					ry: 8
				}),
				/* @__PURE__ */ L("path", {
					className: z("ink"),
					d: "M712 674 l4 8 h-8 Z"
				})
			]
		})
	});
}
var bn = [
	"plain",
	"archivist",
	"draughtsman",
	"foreman",
	"tinker",
	"medium"
];
function xn(e) {
	return bn.find((t) => t !== "plain" && (e === t || e.startsWith(`${t}-`))) ?? "plain";
}
var Sn = "M50 6 C26 6 14 28 14 56 C14 84 20 100 15 122 C23 114 30 126 38 116 C45 128 52 114 60 122 C70 130 84 128 94 112 C81 117 76 106 80 90 C84 72 86 62 86 54 C86 28 74 6 50 6 Z", Cn = "M50 6 C74 6 86 28 86 54 C86 62 84 72 80 90 C76 106 81 117 94 112 C84 128 70 130 60 122 C66 110 70 92 70 60 C70 34 64 14 50 6 Z", wn = {
	plain: null,
	archivist: /* @__PURE__ */ R("g", { children: [
		/* @__PURE__ */ L("rect", {
			className: z("cloth"),
			x: 66,
			y: 70,
			width: 26,
			height: 34
		}),
		/* @__PURE__ */ L("rect", {
			className: z("paper"),
			x: 88,
			y: 72,
			width: 5,
			height: 30
		}),
		/* @__PURE__ */ L("rect", {
			className: z("brass"),
			x: 70,
			y: 78,
			width: 14,
			height: 3
		})
	] }),
	draughtsman: /* @__PURE__ */ R("g", { children: [/* @__PURE__ */ L("path", {
		className: z("brass"),
		d: "M70 104 L92 58 l7 4 L77 108 Z"
	}), /* @__PURE__ */ L("path", {
		className: z("bone-d"),
		d: "M70 104 l2 9 l5 -5 Z"
	})] }),
	foreman: /* @__PURE__ */ R("g", { children: [/* @__PURE__ */ L("path", {
		className: z("lamp"),
		d: "M22 30 q28 -34 56 0 Z"
	}), /* @__PURE__ */ L("rect", {
		className: z("lamp-d"),
		x: 16,
		y: 28,
		width: 70,
		height: 7
	})] }),
	tinker: /* @__PURE__ */ L("path", {
		className: z("stone-l"),
		d: "M74 108 L88 68 a12 12 0 1 1 9 4 L83 110 Z"
	}),
	medium: /* @__PURE__ */ L("path", {
		className: z("moon"),
		d: "M50 -14 l4 9 l10 1 l-7 7 l2 10 l-9 -5 l-9 5 l2 -10 l-7 -7 l10 -1 Z"
	})
}, Tn = {
	idle: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("ellipse", {
		className: z("ink"),
		cx: 38,
		cy: 50,
		rx: 6,
		ry: 3
	}), /* @__PURE__ */ L("ellipse", {
		className: z("ink"),
		cx: 62,
		cy: 50,
		rx: 6,
		ry: 3
	})] }),
	working: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("ellipse", {
			className: z("ink"),
			cx: 38,
			cy: 50,
			rx: 6,
			ry: 9
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("ink"),
			cx: 62,
			cy: 50,
			rx: 6,
			ry: 9
		}),
		/* @__PURE__ */ L("path", {
			className: z("moon"),
			d: "M4 34 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z M98 20 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z"
		})
	] }),
	waiting: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("ellipse", {
			className: z("ink"),
			cx: 38,
			cy: 50,
			rx: 6,
			ry: 9
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("ink"),
			cx: 62,
			cy: 50,
			rx: 6,
			ry: 9
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("ink"),
			cx: 50,
			cy: 72,
			rx: 5,
			ry: 6
		}),
		/* @__PURE__ */ L("circle", {
			className: z("lamp-glow"),
			cx: 6,
			cy: 36,
			r: 30
		}),
		/* @__PURE__ */ L("path", {
			className: z("ghost"),
			d: "M16 62 L8 44 l6 -3 L24 60 Z"
		}),
		/* @__PURE__ */ L("path", {
			className: z("brass-d"),
			d: "M-2 22 h18 v6 h-18 Z M0 28 h14 v20 h-14 Z"
		}),
		/* @__PURE__ */ L("rect", {
			className: z("lamp"),
			x: 3,
			y: 31,
			width: 8,
			height: 14
		})
	] }),
	blocked: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("rect", {
			className: z("ink"),
			x: 31,
			y: 48,
			width: 14,
			height: 4
		}),
		/* @__PURE__ */ L("rect", {
			className: z("ink"),
			x: 55,
			y: 48,
			width: 14,
			height: 4
		}),
		/* @__PURE__ */ L("rect", {
			className: z("ink"),
			x: 40,
			y: 70,
			width: 20,
			height: 3
		}),
		/* @__PURE__ */ L("path", {
			className: z("ghost-d"),
			d: "M24 84 L76 76 l1 9 L25 93 Z M24 76 L76 84 l-1 9 L23 85 Z"
		})
	] }),
	failed: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("path", {
		className: z("ink"),
		d: "M32 44 l12 12 l-3 3 l-12 -12 Z M44 44 l3 3 l-12 12 l-3 -3 Z M56 44 l12 12 l-3 3 l-12 -12 Z M68 44 l3 3 l-12 12 l-3 -3 Z"
	}), /* @__PURE__ */ L("path", {
		className: z("ink"),
		d: "M40 76 q10 -8 20 0 l-2 3 q-8 -6 -16 0 Z"
	})] }),
	done: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("ellipse", {
			className: z("brass"),
			cx: 50,
			cy: -6,
			rx: 24,
			ry: 6
		}),
		/* @__PURE__ */ L("ellipse", {
			className: z("night-1"),
			cx: 50,
			cy: -6,
			rx: 16,
			ry: 3
		}),
		/* @__PURE__ */ L("path", {
			className: z("ink"),
			d: "M31 52 q7 -9 14 0 l-2 2 q-5 -6 -10 0 Z M55 52 q7 -9 14 0 l-2 2 q-5 -6 -10 0 Z"
		})
	] }),
	not_applicable: null,
	unavailable: null
}, En = {
	working: "rotate(7 50 120)",
	failed: "rotate(-26 50 120)"
};
function Dn({ state: e, role: t = "plain" }) {
	let n = e === "not_applicable" || e === "unavailable";
	return /* @__PURE__ */ L(Tt, {
		viewBox: "-30 -30 160 170",
		className: "hh-paint hh-paint-spectre",
		data: {
			"data-ghost": e,
			"data-role": t
		},
		children: /* @__PURE__ */ R("g", {
			stroke: "none",
			transform: En[e],
			children: [
				/* @__PURE__ */ L("path", {
					className: z(n ? "ghost-faint" : e === "blocked" ? "ghost-d" : "ghost"),
					d: Sn
				}),
				n ? null : /* @__PURE__ */ L("path", {
					className: z("ghost-d"),
					d: Cn,
					opacity: e === "blocked" ? .4 : 1
				}),
				n ? null : wn[t],
				Tn[e]
			]
		})
	});
}
function On() {
	return /* @__PURE__ */ L(Tt, {
		viewBox: "-40 -50 190 250",
		className: "hh-paint hh-paint-caretaker",
		children: /* @__PURE__ */ R("g", {
			stroke: "none",
			children: [
				/* @__PURE__ */ L("circle", {
					className: z("lamp-glow"),
					cx: -4,
					cy: 70,
					r: 46
				}),
				/* @__PURE__ */ L("ellipse", {
					className: z("ecto-glow"),
					cx: 52,
					cy: 70,
					rx: 76,
					ry: 92
				}),
				/* @__PURE__ */ L("path", {
					className: z("ghost"),
					d: Sn
				}),
				/* @__PURE__ */ L("path", {
					className: z("ghost-d"),
					d: Cn
				}),
				/* @__PURE__ */ L("rect", {
					className: z("ink"),
					x: 22,
					y: -36,
					width: 56,
					height: 40
				}),
				/* @__PURE__ */ L("rect", {
					className: z("ink"),
					x: 8,
					y: 2,
					width: 84,
					height: 9
				}),
				/* @__PURE__ */ L("rect", {
					className: z("cloth"),
					x: 22,
					y: -8,
					width: 56,
					height: 9
				}),
				/* @__PURE__ */ L("ellipse", {
					className: z("ink"),
					cx: 38,
					cy: 42,
					rx: 6,
					ry: 8
				}),
				/* @__PURE__ */ L("ellipse", {
					className: z("ink"),
					cx: 62,
					cy: 42,
					rx: 6,
					ry: 8
				}),
				/* @__PURE__ */ L("path", {
					className: z("bone-d"),
					d: "M50 56 q-10 -6 -22 4 q12 4 22 0 q10 4 22 0 q-12 -10 -22 -4 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("cloth"),
					d: "M50 80 l-18 -9 v18 Z M50 80 l18 -9 v18 Z"
				}),
				/* @__PURE__ */ L("circle", {
					className: z("cloth-d"),
					cx: 50,
					cy: 80,
					r: 4
				}),
				/* @__PURE__ */ L("path", {
					className: z("ghost"),
					d: "M18 78 L2 60 l7 -5 L26 72 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("brass-d"),
					d: "M-14 46 h22 v7 h-22 Z M-12 53 h18 v30 h-18 Z M-14 83 h22 v6 h-22 Z"
				}),
				/* @__PURE__ */ L("rect", {
					className: z("lamp"),
					x: -8,
					y: 57,
					width: 10,
					height: 22
				}),
				/* @__PURE__ */ L("path", {
					className: z("moon"),
					d: "M-3 60 q4 8 0 15 q-4 -7 0 -15 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("brass-d"),
					d: "M-8 46 q5 -12 10 0 h-3 q-2 -6 -4 0 Z"
				}),
				/* @__PURE__ */ L("path", {
					className: z("wood-d"),
					d: "M-6 138 h112 v14 h-10 v32 h-92 v-32 h-10 Z"
				}),
				/* @__PURE__ */ L("rect", {
					className: z("wood-l"),
					x: -6,
					y: 138,
					width: 112,
					height: 4
				}),
				/* @__PURE__ */ L("rect", {
					className: z("wood-dd"),
					x: 4,
					y: 152,
					width: 92,
					height: 5
				})
			]
		})
	});
}
function kn() {
	return /* @__PURE__ */ L(Tt, {
		viewBox: `0 0 ${It} 750`,
		className: "hh-paint hh-paint-front",
		preserveAspectRatio: "xMidYMid slice",
		children: /* @__PURE__ */ R("g", {
			stroke: "none",
			children: [
				/* @__PURE__ */ L("rect", {
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
				].map(([e, t, n, r]) => /* @__PURE__ */ R("g", { children: [
					/* @__PURE__ */ L("rect", {
						className: z("door-d"),
						x: e,
						y: t,
						width: n,
						height: r
					}),
					/* @__PURE__ */ L("path", {
						className: z("door-dd"),
						d: `M${e} ${t} h${n} l-26 26 h${-(n - 52)} v${r - 52} l-26 26 Z`
					}),
					/* @__PURE__ */ L("path", {
						className: z("door-l"),
						d: `M${e + n} ${t + r} h${-n} l26 -26 h${n - 52} v${-(r - 52)} l26 -26 Z`
					}),
					/* @__PURE__ */ L("rect", {
						className: z("door"),
						x: e + 26,
						y: t + 26,
						width: n - 52,
						height: r - 52
					})
				] }, `${e}-${t}`)),
				/* @__PURE__ */ L("rect", {
					className: z("door-dd"),
					x: 594,
					y: 0,
					width: 12,
					height: 750
				}),
				/* @__PURE__ */ L("circle", {
					className: z("lamp-glow"),
					cx: 600,
					cy: 330,
					r: 260
				}),
				/* @__PURE__ */ L("path", {
					className: z("iron"),
					d: "M600 250 q-30 -40 -80 -30 q20 10 22 30 q-40 -12 -70 14 q30 0 40 22 q40 -22 88 -6 q48 -16 88 6 q10 -22 40 -22 q-30 -26 -70 -14 q2 -20 22 -30 q-50 -10 -80 30 Z"
				}),
				/* @__PURE__ */ L("circle", {
					className: z("iron"),
					cx: 600,
					cy: 262,
					r: 30
				}),
				/* @__PURE__ */ L("circle", {
					className: z("lamp"),
					cx: 589,
					cy: 258,
					r: 5
				}),
				/* @__PURE__ */ L("circle", {
					className: z("lamp"),
					cx: 611,
					cy: 258,
					r: 5
				}),
				/* @__PURE__ */ L("path", {
					className: z("iron"),
					d: "M588 232 l-6 -22 l16 14 Z M612 232 l6 -22 l-16 14 Z"
				}),
				/* @__PURE__ */ L("circle", {
					className: z("iron"),
					cx: 600,
					cy: 364,
					r: 74
				}),
				/* @__PURE__ */ L("circle", {
					className: z("door"),
					cx: 600,
					cy: 364,
					r: 52
				}),
				/* @__PURE__ */ L("circle", {
					className: z("iron-l"),
					cx: 600,
					cy: 438,
					r: 20
				}),
				/* @__PURE__ */ L("circle", {
					className: z("iron"),
					cx: 600,
					cy: 438,
					r: 12
				}),
				/* @__PURE__ */ L("path", {
					className: z("vignette"),
					d: "M0 0 H1200 V750 H0 Z"
				})
			]
		})
	});
}
// src/components/room-paint-styles.ts
var B = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, black)`, An = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, white)`, jn = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, transparent)`, Mn = {
	wall: "var(--hh-w)",
	"wall-l": An("--hh-w", 78),
	"wall-d": B("--hh-w", 72),
	"wall-dd": B("--hh-w", 50),
	ceil: B("--hh-w", 34),
	side: B("--hh-w", 64),
	"side-d": B("--hh-w", 48),
	wood: "var(--hh-sc-wood)",
	"wood-l": An("--hh-sc-wood", 74),
	"wood-d": "var(--hh-sc-wood-dark)",
	"wood-dd": B("--hh-sc-wood-dark", 56),
	floor: "var(--hh-sc-floor)",
	tile: "var(--hh-sc-tile)",
	brass: "var(--hh-sc-brass)",
	"brass-l": An("--hh-sc-brass", 60),
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
	"moon-halo": jn("--hh-sc-moon", 16),
	"moon-pool": jn("--hh-sc-moon", 10),
	lamp: "var(--hh-sc-lamp)",
	"lamp-d": B("--hh-sc-lamp", 70),
	"lamp-glow": jn("--hh-sc-lamp", 13),
	ecto: "var(--hh-sc-ecto)",
	"ecto-d": B("--hh-sc-ecto", 62),
	"ecto-glow": jn("--hh-sc-ecto", 13),
	"night-1": "var(--hh-sc-night1)",
	"night-2": "var(--hh-sc-night2)",
	"night-3": "var(--hh-sc-night3)",
	"night-4": "var(--hh-sc-night4)",
	"hill-1": "var(--hh-sc-hill1)",
	"hill-2": "var(--hh-sc-hill2)",
	glass: B("--hh-sc-night2", 50),
	"glass-l": jn("--hh-sc-paper", 30),
	shade: jn("--hh-sc-ink", 34),
	stone: "var(--hh-sc-stone)",
	"stone-l": An("--hh-sc-stone", 70),
	"stone-d": B("--hh-sc-stone", 60),
	blueprint: "var(--hh-sc-wall-drafting)",
	leather: "var(--hh-sc-leather)",
	ghost: "var(--hh-sc-spectre)",
	"ghost-d": B("--hh-sc-spectre", 80),
	"ghost-faint": jn("--hh-sc-spectre", 22),
	door: "var(--hh-sc-front-door)",
	"door-l": An("--hh-sc-front-door", 80),
	"door-d": B("--hh-sc-front-door", 76),
	"door-dd": B("--hh-sc-front-door", 52),
	iron: "var(--hh-sc-iron)",
	"iron-l": An("--hh-sc-iron", 72),
	vignette: "transparent"
}, Nn = {
	web: jn("--hh-sc-bone", 46),
	"floor-line": B("--hh-sc-floor", 62),
	"tile-line": B("--hh-sc-tile", 58),
	paper: "var(--hh-sc-paper)",
	"night-2": "var(--hh-sc-night2)",
	"wood-dd": B("--hh-sc-wood-dark", 56),
	"brass-d": B("--hh-sc-brass", 62),
	"ink-soft": jn("--hh-sc-ink", 50)
};
Object.keys(Mn), Object.keys(Nn);
var Pn = `
.hh-paint { position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none; }
.hh-paint[data-scene='foyer'], .hh-paint { --hh-w: var(--hh-sc-wall-foyer); }
.hh-paint[data-scene='study'] { --hh-w: var(--hh-sc-wall-study); }
.hh-paint[data-scene='drafting-room'] { --hh-w: var(--hh-sc-wall-drafting); }
.hh-paint[data-scene='workshop'] { --hh-w: var(--hh-sc-wall-workshop); }
.hh-paint[data-scene='attic'] { --hh-w: var(--hh-sc-wall-attic); }
.hh-paint[data-scene='seance-room'] { --hh-w: var(--hh-sc-wall-seance); }
${Object.entries(Mn).map(([e, t]) => `.hh-p-${e} { fill: ${t}; }`).join("\n")}
${Object.entries(Nn).map(([e, t]) => `.hh-ps-${e} { fill: none; stroke: ${t}; }`).join("\n")}
`, Fn = [
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
], In = {
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
		canvas: "#0c1530",
		surface: "#141f3f",
		surfaceRaised: "#1d2a52",
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
}, Ln = [
	"canvas",
	"surface",
	"surfaceRaised"
];
function Rn(e, t) {
	return Ln.map((n) => ({
		foreground: e,
		background: n,
		minimum: t
	}));
}
[
	...Rn("text", 4.5),
	...Rn("textMuted", 4.5),
	...Rn("accent", 4.5),
	...Rn("danger", 4.5),
	...Rn("ok", 4.5),
	...Rn("working", 4.5),
	...Rn("border", 3),
	...Rn("focus", 3),
	...Rn("candle", 3),
	...Rn("ghost", 3)
];
function zn(e) {
	return `--hh-fb-${e.replace(/[A-Z]/g, (e) => `-${e.toLowerCase()}`)}`;
}
function Bn(e) {
	let t = In[e];
	return Fn.map((e) => `${zn(e)}: ${t[e]};`).join(" ");
}
var Vn = {
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
	spectre: "#eaf6ff"
}, Hn = {
	light: {
		...Vn,
		sheet: "#d6e3f8",
		sheetLine: "#b4c8ec",
		sheetInk: "#355aa6",
		poche: "#1b2547"
	},
	dark: {
		...Vn,
		sheet: "#0d1838",
		sheetLine: "#1c3166",
		sheetInk: "#8fb3f5",
		poche: "#060a18"
	}
};
function Un(e) {
	return `--hh-sc-${e.replace(/[A-Z]/g, (e) => `-${e.toLowerCase()}`)}`;
}
function Wn(e) {
	let t = Hn[e];
	return Object.keys(t).map((e) => `${Un(e)}: ${t[e]};`).join(" ");
}
// src/landing.ts
var Gn = "A house for your AI agents: each room is a phase of spec-driven work, each ghost an agent you can watch, and each door opens only when you approve.", Kn = {
	mansion: "demo-mansion",
	text: "Watch a mansion get built, then step through what happened."
}, qn = "What should this mansion become?", Jn = "Optional. A few plain sentences about the feature; the Archivist reads them before writing requirements.", Yn = `Keep the brief to ${Ge} characters or fewer.`, Xn = "Remove control characters from the brief. Line breaks and tabs are fine.", Zn = (e) => `${e.length} / ${Ge} characters${e.ok ? "" : e.reason === "too_long" ? ", too long" : ""}`, Qn = (e) => e.ok ? null : e.reason === "too_long" ? Yn : Xn, $n = () => {
	let [e, t] = F(""), [n, r] = F(null), i = N(() => Ye(e), [e]), a = A((e) => {
		t(e), r(null);
	}, []), o = A(() => {
		let e = Qn(i);
		return r(e), e === null;
	}, [i]), s = A(() => {
		t(""), r(null);
	}, []);
	return {
		text: e,
		counter: Zn(i),
		error: n,
		change: a,
		check: o,
		clear: s
	};
}, er = "Lowercase letters, numbers, and single hyphens, up to 40 characters. For example: weather-station.", tr = "Enter a name for the mansion.", nr = "Use 1–40 lowercase letters, numbers, and single hyphens.";
function rr({ ready: e, mutation: t, onCreate: n }) {
	let r = M(), i = M(), a = M(), o = M(), s = M(), c = M(), l = M(), u = M(), d = P(null), f = P(null), p = $n(), [m, h] = F(""), [g, v] = F(null), y = t.kind === "creating" || t.kind === "opening", b = t.kind === "creating" ? t.name : null, x = t.kind === "error" && t.operation === "create" ? `Could not create ${t.name}. ${t.message}` : null, S = g ?? x, C = !e || y;
	return /* @__PURE__ */ R("form", {
		className: "hh-create",
		noValidate: !0,
		onSubmit: async (e) => {
			e.preventDefault(), C || (Re(m) ? (v(null), p.check() ? await n(m, p.text) ? (h(""), p.clear()) : d.current?.focus() : f.current?.focus()) : (v(m === "" ? tr : nr), d.current?.focus()));
		},
		children: [
			/* @__PURE__ */ R("div", {
				className: "hh-field",
				children: [
					/* @__PURE__ */ L("label", {
						htmlFor: r,
						children: "New mansion name"
					}),
					/* @__PURE__ */ L("input", {
						id: r,
						ref: d,
						type: "text",
						name: "mansion-name",
						value: m,
						maxLength: 40,
						pattern: "[a-z0-9]+(-[a-z0-9]+)*",
						required: !0,
						autoComplete: "off",
						autoCapitalize: "none",
						spellCheck: !1,
						readOnly: b !== null,
						"aria-invalid": S !== null,
						"aria-describedby": `${i} ${a}`,
						onChange: (e) => {
							h(e.target.value), v(null);
						}
					}),
					/* @__PURE__ */ L("span", {
						id: i,
						className: "hh-foyer-hint",
						children: er
					})
				]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-field",
				children: [
					/* @__PURE__ */ L("label", {
						htmlFor: s,
						children: qn
					}),
					/* @__PURE__ */ L("textarea", {
						id: s,
						ref: f,
						name: "mansion-brief",
						rows: 4,
						value: p.text,
						readOnly: b !== null,
						"aria-invalid": p.error !== null,
						"aria-describedby": `${c} ${l} ${u}`,
						onChange: (e) => p.change(e.target.value)
					}),
					/* @__PURE__ */ L("span", {
						id: c,
						className: "hh-foyer-hint",
						children: Jn
					}),
					/* @__PURE__ */ L("span", {
						id: l,
						className: "hh-foyer-hint",
						children: p.counter
					}),
					p.error === null ? null : /* @__PURE__ */ R("p", {
						id: u,
						className: "hh-foyer-error",
						children: [/* @__PURE__ */ L(k, {
							size: 16,
							"aria-hidden": !0
						}), /* @__PURE__ */ L("span", { children: p.error })]
					})
				]
			}),
			S === null ? null : /* @__PURE__ */ R("p", {
				id: a,
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ L(k, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: S })]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ R("button", {
					type: "submit",
					className: "hh-button",
					"aria-disabled": C,
					"aria-describedby": o,
					children: [/* @__PURE__ */ L(T, {
						size: 16,
						"aria-hidden": !0
					}), "Create mansion"]
				}), /* @__PURE__ */ L("span", {
					id: o,
					className: "hh-foyer-inline",
					children: b === null ? null : /* @__PURE__ */ R(I, { children: [
						/* @__PURE__ */ L(_, {
							size: 16,
							"aria-hidden": !0,
							className: "hh-foyer-spin"
						}),
						"Creating ",
						b,
						"…"
					] })
				})]
			})
		]
	});
}
// src/rooms/foyer/foyer-styles.ts
var ir = "\n.hh-foyer { color: var(--card-fg, var(--text, var(--hh-fb-text, inherit))); font: inherit; max-width: 48rem; margin: 20px auto 0; }\n.hh-foyer[data-view='mansion'] { max-width: none; margin: 0; }\n.hh-foyer-hall, .hh-shell { background: var(--card, var(--hh-fb-surface, transparent));\n  border: 1px solid var(--border, var(--hh-fb-border, currentColor)); border-radius: 12px; padding: 18px 20px; }\n.hh-foyer h2 { font-family: \"Iowan Old Style\", \"Palatino Linotype\", Palatino, \"Book Antiqua\", Georgia, \"Times New Roman\", serif; font-size: 1.375rem; margin: 0 0 4px; }\n.hh-foyer h3 { font-size: 1rem; margin: 0 0 4px; }\n.hh-foyer h2:focus-visible, .hh-foyer-region:focus-visible { outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n.hh-foyer-lede { margin: 0 0 12px; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n.hh-foyer-invite { margin: 0 0 16px; padding: 10px 14px; font-size: 1.0625rem; font-weight: 600;\n  border-left: 4px solid var(--warn, var(--hh-fb-accent, currentColor)); background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border-radius: 0 8px 8px 0; }\n.hh-foyer-region { margin: 0 0 24px; }\n.hh-foyer-inline { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n.hh-foyer-hint { display: block; margin: 4px 0 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); font-size: 0.875rem; }\n.hh-foyer-error { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; overflow-wrap: anywhere; }\n.hh-foyer-error svg { color: var(--warn, var(--hh-fb-danger, currentColor)); flex: none; margin-top: 2px; }\n.hh-foyer-empty { border: 1px dashed var(--border, var(--hh-fb-border, currentColor)); border-radius: 8px; padding: 12px 16px; }\n.hh-foyer-empty p { margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n\n.hh-mansions { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 10px;\n  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); }\n.hh-mansions legend { padding: 0; margin: 0 0 8px; font-weight: 700; }\n.hh-mansion { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 2px; align-items: center; min-width: 0;\n  background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border: 1px solid var(--border, var(--hh-fb-border, currentColor)); border-radius: 10px; padding: 12px 14px; cursor: pointer; }\n.hh-mansion[data-selected='true'] { border-color: var(--warn, var(--hh-fb-accent, currentColor)); border-width: 3px; padding: 10px 12px; }\n.hh-mansion[data-status='missing'], .hh-mansion[data-status='conflict'] { cursor: not-allowed; border-style: dashed;\n  background: transparent; }\n.hh-mansion:focus-within { outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n.hh-mansion input { margin: 0; width: 1rem; height: 1rem; accent-color: var(--warn, var(--hh-fb-accent, auto)); }\n.hh-mansion-name { font-family: \"Iowan Old Style\", \"Palatino Linotype\", Palatino, \"Book Antiqua\", Georgia, \"Times New Roman\", serif; font-weight: 700; font-size: 1.0625rem;\n  overflow-wrap: anywhere; }\n.hh-mansion-path, .hh-mansion-status { grid-column: 2; font-size: 0.8125rem; overflow-wrap: anywhere; }\n.hh-mansion-path { color: var(--muted, var(--hh-fb-text-muted, inherit)); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }\n.hh-mansion-status { display: inline-flex; align-items: center; gap: 6px; }\n.hh-mansion { container-type: inline-size; }\n@container (min-width: 16em) { .hh-path-part { white-space: nowrap; } }\n.hh-status-ready svg { color: var(--ok, var(--hh-fb-ok, currentColor)); }\n.hh-status-missing svg { color: var(--muted, var(--hh-fb-text-muted, currentColor)); }\n.hh-status-conflict svg { color: var(--warn, var(--hh-fb-danger, currentColor)); }\n\n.hh-foyer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 14px; }\n.hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;\n  color: inherit; background: transparent; border: 1px solid var(--border-strong, var(--hh-fb-border, currentColor));\n  border-width: 2px; border-radius: 999px; padding: 6px 16px; font-weight: 600; }\n.hh-button-primary { color: var(--accent-fg, var(--hh-fb-accent-text, inherit)); background: var(--accent, var(--hh-fb-accent, transparent));\n  font-weight: 700; padding: 10px 18px; font-size: 1.0625rem; }\n.hh-button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }\n.hh-button:focus-visible, .hh-field input:focus-visible, .hh-field textarea:focus-visible {\n  outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n\n.hh-create { margin: 0; padding-top: 16px; border-top: 1px solid var(--border, var(--hh-fb-border, currentColor)); }\n.hh-field { display: grid; gap: 4px; min-width: 0; }\n.hh-field label { font-weight: 600; }\n.hh-field input, .hh-field textarea { font: inherit; color: inherit; background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border: 1px solid var(--border-strong, var(--hh-fb-border, currentColor)); border-radius: 6px; padding: 6px 10px;\n  width: 100%; min-width: 0; max-width: 24rem; box-sizing: border-box; }\n.hh-field input[aria-invalid='true'], .hh-field textarea[aria-invalid='true'] { border-width: 2px; }\n.hh-field textarea { resize: vertical; max-width: 36rem; min-height: 5rem; }\n.hh-create .hh-field + .hh-field { margin-top: 12px; }\n\n.hh-shell-eyebrow { margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); font-size: 0.875rem; }\n.hh-shell-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 12px 0; }\n.hh-shell-facts dt { font-weight: 600; }\n.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; }\n.hh-shell-rooms { margin: 12px 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n\n.hh-foyer-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }\n\n@media (max-width: 640px) {\n  .hh-foyer-hall, .hh-shell { padding: 14px 12px; }\n}\n\n@keyframes hh-foyer-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-foyer[data-motion='low-frequency'] .hh-foyer-spin { animation: hh-foyer-spin 2s linear infinite; }\n}\n", ar = {
	ready: "Ready to open",
	missing: "Missing: its folder is no longer in storage, so it cannot be opened.",
	conflict: "Conflict: its folder no longer looks like a mansion, so it cannot be opened."
};
function or({ status: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "ready": return /* @__PURE__ */ L(o, { ...t });
		case "missing": return /* @__PURE__ */ L(s, { ...t });
		case "conflict": return /* @__PURE__ */ L(k, { ...t });
	}
}
function sr({ path: e }) {
	let t = e.split("/");
	return /* @__PURE__ */ L(I, { children: t.map((e, n) => /* @__PURE__ */ R(le, { children: [/* @__PURE__ */ L("span", {
		className: "hh-path-part",
		children: n < t.length - 1 ? `${e}/` : e
	}), n < t.length - 1 ? /* @__PURE__ */ L("wbr", {}) : null] }, n)) });
}
function cr({ mansion: e, group: t, selected: n, onSelect: r }) {
	return /* @__PURE__ */ R("label", {
		className: "hh-mansion",
		"data-status": e.status,
		"data-selected": n,
		children: [
			/* @__PURE__ */ L("input", {
				type: "radio",
				name: t,
				value: e.name,
				checked: n,
				disabled: e.status !== "ready",
				onChange: () => r(e.name)
			}),
			/* @__PURE__ */ L("span", {
				className: "hh-mansion-name",
				children: e.name
			}),
			/* @__PURE__ */ L("span", {
				className: "hh-mansion-path",
				children: /* @__PURE__ */ L(sr, { path: e.displayPath })
			}),
			/* @__PURE__ */ R("span", {
				className: `hh-mansion-status hh-status-${e.status}`,
				children: [/* @__PURE__ */ L(or, { status: e.status }), ar[e.status]]
			})
		]
	});
}
function lr({ load: e, selectedName: t, mutation: n, onSelect: r, onOpen: i, onRetry: a }) {
	let o = M(), s = M(), c = M(), l = M(), d = P(null), f = n.kind === "creating" || n.kind === "opening", p = n.kind === "error" && n.operation === "open" ? n : null, m = e.kind === "ready" && t !== null && !f, h = e.kind === "loading" || e.kind === "ready" && e.mansions.length > 0;
	return /* @__PURE__ */ R("div", {
		className: "hh-foyer-region",
		ref: d,
		tabIndex: -1,
		children: [
			e.kind === "loading" ? /* @__PURE__ */ R("p", {
				className: "hh-foyer-inline",
				children: [/* @__PURE__ */ L(_, {
					size: 16,
					"aria-hidden": !0,
					className: "hh-foyer-spin"
				}), "Loading mansions…"]
			}) : null,
			e.kind === "error" ? /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ R("p", {
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ L(k, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ R("span", { children: ["Could not load the mansion list. ", e.message] })]
			}), /* @__PURE__ */ L("div", {
				className: "hh-foyer-actions",
				children: /* @__PURE__ */ R("button", {
					type: "button",
					className: "hh-button",
					onClick: () => {
						d.current?.focus(), a();
					},
					children: [/* @__PURE__ */ L(E, {
						size: 16,
						"aria-hidden": !0
					}), "Retry"]
				})
			})] }) : null,
			e.kind === "ready" && e.mansions.length === 0 ? /* @__PURE__ */ R("div", {
				className: "hh-foyer-empty",
				children: [/* @__PURE__ */ L("h3", { children: "No mansions yet" }), /* @__PURE__ */ L("p", { children: "The house is quiet. Name your first mansion below to create it." })]
			}) : null,
			e.kind === "ready" && e.mansions.length > 0 ? /* @__PURE__ */ R("fieldset", {
				className: "hh-mansions",
				role: "radiogroup",
				"aria-labelledby": s,
				onKeyDown: (e) => {
					let t = e.target;
					e.key === "Enter" && t instanceof HTMLInputElement && t.type === "radio" && (e.preventDefault(), !t.disabled && !f && i(t.value, t));
				},
				children: [/* @__PURE__ */ L("legend", {
					id: s,
					children: "Mansions"
				}), e.mansions.map((e) => /* @__PURE__ */ L(cr, {
					mansion: e,
					group: o,
					selected: e.name === t,
					onSelect: r
				}, e.name))]
			}) : null,
			h ? /* @__PURE__ */ R("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ R("button", {
					type: "button",
					className: "hh-button hh-button-primary",
					"aria-disabled": !m,
					"aria-describedby": `${c} ${l}`,
					onClick: (e) => {
						m && t !== null && i(t, e.currentTarget);
					},
					children: [/* @__PURE__ */ L(u, {
						size: 16,
						"aria-hidden": !0
					}), t === null ? "Open mansion" : `Open ${t}`]
				}), /* @__PURE__ */ L("span", {
					id: c,
					className: "hh-foyer-inline",
					children: n.kind === "opening" ? /* @__PURE__ */ R(I, { children: [
						/* @__PURE__ */ L(_, {
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
			p ? /* @__PURE__ */ R("p", {
				id: l,
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ L(k, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ R("span", { children: [
					"Could not open ",
					p.name,
					". ",
					p.message
				] })]
			}) : null
		]
	});
}
// src/rooms/foyer/MansionShell.tsx
function ur({ mansion: t, onReturn: n, children: r }) {
	let i = M(), a = P(null), o = P(n);
	return o.current = n, j(() => {
		a.current?.focus();
	}, []), j(() => {
		let e = (e) => {
			e.key !== "Escape" || e.defaultPrevented || (e.preventDefault(), o.current());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, []), /* @__PURE__ */ R("section", {
		className: "hh-shell",
		"aria-labelledby": i,
		children: [
			/* @__PURE__ */ L("p", {
				className: "hh-shell-eyebrow",
				children: "Mansion"
			}),
			/* @__PURE__ */ L("h2", {
				id: i,
				ref: a,
				tabIndex: -1,
				children: t.name
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ R("button", {
					type: "button",
					className: "hh-button",
					onClick: n,
					children: [/* @__PURE__ */ L(e, {
						size: 16,
						"aria-hidden": !0
					}), "Return to Foyer"]
				}), /* @__PURE__ */ L("span", {
					className: "hh-foyer-hint",
					children: "Escape also returns to the Foyer."
				})]
			}),
			/* @__PURE__ */ R("dl", {
				className: "hh-shell-facts",
				children: [
					/* @__PURE__ */ L("dt", { children: "Project spec" }),
					/* @__PURE__ */ L("dd", { children: t.projectSpec }),
					/* @__PURE__ */ L("dt", { children: "Folder" }),
					/* @__PURE__ */ L("dd", { children: t.displayPath })
				]
			}),
			r ?? /* @__PURE__ */ L("p", {
				className: "hh-shell-rooms",
				children: "The rooms are still dark. Ghosts move in with a later chapter."
			})
		]
	});
}
// src/core/foyer-reducer.ts
function dr() {
	return {
		load: { kind: "loading" },
		mutation: { kind: "idle" },
		selectedName: null,
		view: { kind: "foyer" }
	};
}
function fr(e, t) {
	return e.name < t.name ? -1 : +(e.name > t.name);
}
function pr(e, t) {
	return [...e.filter(({ name: e }) => e !== t.name), t].sort(fr);
}
function mr(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.name, n);
	return [...t.values()].sort(fr);
}
function hr(e, t) {
	return e === null ? null : t.some(({ name: t, status: n }) => t === e && n === "ready") ? e : null;
}
function gr(e) {
	return e.load.kind === "ready" ? e.load.mansions : null;
}
function _r(e) {
	return e.kind === "creating" || e.kind === "opening";
}
function vr(e, t, n) {
	return e.kind === t && e.name === n;
}
function yr(e, t) {
	switch (t.type) {
		case "load_started": return dr();
		case "load_succeeded": {
			let n = mr(t.mansions);
			return {
				load: {
					kind: "ready",
					mansions: n
				},
				mutation: { kind: "idle" },
				selectedName: hr(e.selectedName, n),
				view: { kind: "foyer" }
			};
		}
		case "load_failed": return {
			load: {
				kind: "error",
				message: We(t.message)
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
			let n = hr(t.name, e.load.mansions);
			return n === null || n === e.selectedName ? e : {
				...e,
				selectedName: n
			};
		}
		case "create_started": return e.view.kind !== "foyer" || e.load.kind !== "ready" || _r(e.mutation) ? e : {
			...e,
			mutation: {
				kind: "creating",
				name: t.name
			}
		};
		case "create_succeeded": {
			if (!vr(e.mutation, "creating", t.mansion.name)) return e;
			let n = gr(e);
			if (n === null || t.mansion.status !== "ready") return e;
			let r = pr(n, t.mansion);
			return {
				...e,
				load: {
					kind: "ready",
					mansions: r
				},
				mutation: { kind: "idle" },
				selectedName: hr(e.selectedName, r)
			};
		}
		case "create_failed": return vr(e.mutation, "creating", t.name) ? {
			...e,
			mutation: {
				kind: "error",
				operation: "create",
				name: t.name,
				message: We(t.message)
			}
		} : e;
		case "open_started": return e.view.kind !== "foyer" || e.load.kind !== "ready" || _r(e.mutation) || e.selectedName !== t.name || !e.load.mansions.some(({ name: e, status: n }) => e === t.name && n === "ready") ? e : {
			...e,
			mutation: {
				kind: "opening",
				name: t.name
			}
		};
		case "open_succeeded": {
			if (!vr(e.mutation, "opening", t.mansion.name) || t.mansion.status !== "ready") return e;
			let n = gr(e);
			return n === null ? e : {
				load: {
					kind: "ready",
					mansions: pr(n, t.mansion)
				},
				mutation: { kind: "idle" },
				selectedName: t.mansion.name,
				view: {
					kind: "mansion",
					mansion: t.mansion
				}
			};
		}
		case "open_failed": return vr(e.mutation, "opening", t.name) ? {
			...e,
			mutation: {
				kind: "error",
				operation: "open",
				name: t.name,
				message: We(t.message)
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
var br = {
	created: (e) => `Mansion ${e} created.`,
	existing_compatible: (e) => `Mansion ${e} already exists. Nothing was changed.`
};
function xr(e) {
	return e instanceof et || e instanceof Ne ? e.message : ke;
}
function Sr({ onAnnounce: e } = {}) {
	let t = at(), n = P(t);
	n.current = t;
	let r = P(e);
	r.current = e;
	let [i, a] = F(dr), o = P(i), s = P(!1), [c, l] = F(0), u = A((e) => {
		let t = yr(o.current, e);
		return t !== o.current && (o.current = t, s.current && a(t)), t;
	}, []);
	j(() => (s.current = !0, () => {
		s.current = !1;
	}), []), j(() => {
		let e = !1;
		return u({ type: "load_started" }), n.current.list().then(({ mansions: t }) => {
			e || u({
				type: "load_succeeded",
				mansions: t
			});
		}, (t) => {
			e || u({
				type: "load_failed",
				message: xr(t)
			});
		}), () => {
			e = !0;
		};
	}, [c, u]);
	let d = A(() => l((e) => e + 1), []), f = A((e) => {
		u({
			type: "mansion_selected",
			name: e
		});
	}, [u]), p = A(async (e, t) => {
		let i = o.current;
		if (u({
			type: "create_started",
			name: e
		}) === i) return !1;
		try {
			let { outcome: i, mansion: a } = await n.current.create(e, t);
			if (a.name !== e) throw new Ne();
			return u({
				type: "create_succeeded",
				mansion: a
			}), r.current?.(br[i](e)), !0;
		} catch (t) {
			return u({
				type: "create_failed",
				name: e,
				message: xr(t)
			}), !1;
		}
	}, [u]), m = A((e) => {
		u({
			type: "mansion_selected",
			name: e
		});
		let t = o.current;
		u({
			type: "open_started",
			name: e
		}) !== t && n.current.open(e).then(({ mansion: t }) => {
			t.name === e ? (u({
				type: "open_succeeded",
				mansion: t
			}), r.current?.(`Mansion ${e} opened.`)) : u({
				type: "open_failed",
				name: e,
				message: Oe
			});
		}, (t) => {
			u({
				type: "open_failed",
				name: e,
				message: xr(t)
			});
		});
	}, [u]), h = A(() => {
		u({ type: "returned_to_foyer" });
	}, [u]);
	return N(() => ({
		state: i,
		retryLoad: d,
		select: f,
		create: p,
		open: m,
		returnToFoyer: h
	}), [
		i,
		d,
		f,
		p,
		m,
		h
	]);
}
// src/rooms/foyer/Foyer.tsx
function Cr({ onAnnounce: e, stillHouse: t = !1, renderMansion: n, renderShell: r, onMansionChange: i, preselect: a, invitation: o }) {
	let s = yt(), c = M(), [l, u] = F(""), { state: d, retryLoad: f, select: p, create: m, open: h, returnToFoyer: g } = Sr({ onAnnounce: e ?? u }), _ = P(!1);
	j(() => {
		_.current || a === void 0 || d.load.kind !== "ready" || (_.current = !0, d.load.mansions.some((e) => e.name === a && e.status === "ready") && d.selectedName === null && p(a));
	}, [
		a,
		d.load,
		d.selectedName,
		p
	]);
	let v = d.view.kind === "mansion", y = P(null), b = P(null), x = P(!1), S = A((e, t) => {
		y.current = t, h(e);
	}, [h]);
	j(() => {
		x.current && !v && (y.current?.isConnected ? y.current : b.current)?.focus(), x.current = v;
	}, [v]);
	let C = d.view.kind === "mansion" ? d.view.mansion : null, w = P(i);
	return w.current = i, de(() => {
		w.current?.(C);
	}, [C]), de(() => () => w.current?.(null), []), /* @__PURE__ */ R("div", {
		className: "hh-foyer",
		"data-view": v ? "mansion" : "hall",
		"data-theme-mode": s.mode,
		"data-motion": t ? "none" : "low-frequency",
		style: { colorScheme: s.mode },
		children: [
			/* @__PURE__ */ L("style", { children: ir }),
			/* @__PURE__ */ R("section", {
				className: "hh-foyer-hall",
				"aria-labelledby": c,
				hidden: v,
				children: [
					/* @__PURE__ */ L("h2", {
						id: c,
						ref: b,
						tabIndex: -1,
						children: "Foyer"
					}),
					/* @__PURE__ */ L("p", {
						className: "hh-foyer-lede",
						children: "Each mansion is one software project. Choose one to enter, or create a new one."
					}),
					o === void 0 ? null : /* @__PURE__ */ L("p", {
						className: "hh-foyer-invite",
						children: o
					}),
					/* @__PURE__ */ L(lr, {
						load: d.load,
						selectedName: d.selectedName,
						mutation: d.mutation,
						onSelect: p,
						onOpen: S,
						onRetry: f
					}),
					/* @__PURE__ */ L(rr, {
						ready: d.load.kind === "ready",
						mutation: d.mutation,
						onCreate: m
					})
				]
			}),
			d.view.kind === "mansion" ? r === void 0 ? /* @__PURE__ */ L(ur, {
				mansion: d.view.mansion,
				onReturn: g,
				children: n?.(d.view.mansion)
			}) : r(d.view.mansion, g) : null,
			e ? null : /* @__PURE__ */ L("p", {
				className: "hh-foyer-announcer",
				"aria-live": "polite",
				children: l
			})
		]
	});
}
var wr = /* @__PURE__ */ new Set([
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
]), Tr = ["crew", "house"], Er = [
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
], Dr = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, Or = 262144, kr = new Set(Tr), Ar = new TextEncoder(), jr = /^[0-9a-f]{64}$/, Mr = class extends Error {
	path;
	safeDetail;
	constructor(e, t) {
		super(t), this.path = e, this.safeDetail = t;
	}
};
function V(e, t) {
	throw new Mr(e, t);
}
function Nr(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) return !1;
	let t = Object.getPrototypeOf(e);
	return t === Object.prototype || t === null;
}
function Pr(e, t) {
	Nr(e) || V(t, "must be a JSON object");
	let n = Object.getOwnPropertyDescriptors(e);
	for (let e of Reflect.ownKeys(n)) {
		typeof e != "string" && V(t, "must contain only JSON object members");
		let r = n[e];
		r.enumerable && "value" in r || V(t, "must contain only JSON object members");
	}
	return e;
}
function Fr(e, t, n = [], r = "$") {
	let i = /* @__PURE__ */ new Set([...t, ...n]), a = Object.keys(e);
	(t.some((t) => !Object.hasOwn(e, t)) || a.some((e) => !i.has(e))) && V(r, "has missing or unexpected fields");
}
function Ir(e) {
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
function Lr(e) {
	return Ar.encode(e).byteLength;
}
function Rr(e, t, { maxBytes: n = 160, allowEmpty: r = !1 } = {}) {
	(typeof e != "string" || Ir(e)) && V(t, "must be a valid Unicode string");
	let i = Lr(e);
	return (!r && i === 0 || i > n) && V(t, `must be ${r ? "at most" : "between 1 and"} ${n} UTF-8 bytes`), e;
}
function zr(e, t, n) {
	return (typeof e != "number" || !Number.isInteger(e) || e < n) && V(t, `must be an integer greater than or equal to ${n}`), e;
}
function Br(e, t, n) {
	return n && e === null ? null : zr(e, t, 0);
}
function Vr(e, t) {
	let n = Rr(e, t, { maxBytes: 40 });
	return (n.length > 40 || !Dr.test(n)) && V(t, "must be a kebab-case Mansion_ID of at most 40 characters"), n;
}
function Hr(e, t) {
	return typeof e == "string" && wr.has(e) || V(t, "must be a supported Event_Type"), e;
}
function Ur(e, t) {
	return typeof e == "string" && kr.has(e) || V(t, "must be a supported event origin"), e;
}
function Wr(e, t, n) {
	return typeof e == "string" && e.startsWith(t) && jr.test(e.slice(t.length)) || V(n, `must be a lowercase ${t.slice(0, -1)} SHA-256 identifier`), e;
}
function Gr(e, t) {
	let n = Pr(e, t);
	return Fr(n, [
		"mansion_id",
		"ghost_id",
		"session_slot",
		"run_id",
		"run_sequence"
	], [], t), {
		mansion_id: Vr(n.mansion_id, `${t}.mansion_id`),
		ghost_id: Rr(n.ghost_id, `${t}.ghost_id`),
		session_slot: Rr(n.session_slot, `${t}.session_slot`),
		run_id: Rr(n.run_id, `${t}.run_id`),
		run_sequence: zr(n.run_sequence, `${t}.run_sequence`, 0)
	};
}
function Kr(e, t) {
	return (!Array.isArray(e) || e.length < 1 || e.length > 8) && V(t, "must contain between 1 and 8 identity parts"), e.map((e, n) => Rr(e, `${t}[${n}]`, {
		maxBytes: 512,
		allowEmpty: !0
	}));
}
function qr(e, t) {
	let n = Pr(e, t);
	return Fr(n, [
		"origin",
		"source_type",
		"identity_parts",
		"revision",
		"generation",
		"source_sequence"
	], [], t), {
		origin: Ur(n.origin, `${t}.origin`),
		source_type: Rr(n.source_type, `${t}.source_type`),
		identity_parts: Kr(n.identity_parts, `${t}.identity_parts`),
		revision: zr(n.revision, `${t}.revision`, 0),
		generation: Rr(n.generation, `${t}.generation`, { allowEmpty: !0 }),
		source_sequence: zr(n.source_sequence, `${t}.source_sequence`, 0)
	};
}
function Jr(e, t) {
	return Wr(e, "e1:", t);
}
function Yr(e, t, n) {
	return (!Array.isArray(e) || e.length > 32) && V(t, "must contain at most 32 causal predecessors"), e.map((e, r) => n(e, `${t}[${r}]`));
}
function Xr(e, t, n) {
	if (e === null || typeof e == "boolean" || typeof e == "string") return typeof e == "string" && Ir(e) && V(t, "must contain valid Unicode strings"), e;
	if (typeof e == "number") return Number.isFinite(e) || V(t, "must contain only finite numbers"), Object.is(e, -0) ? 0 : e;
	if (Array.isArray(e)) {
		n.has(e) && V(t, "must not contain a cycle"), n.add(e);
		try {
			return e.map((e) => Xr(e, t, n));
		} finally {
			n.delete(e);
		}
	}
	if (Nr(e)) {
		n.has(e) && V(t, "must not contain a cycle"), n.add(e);
		try {
			let r = Pr(e, t), i = {};
			for (let e of Object.keys(r)) Ir(e) && V(t, "must contain valid Unicode object keys"), Object.defineProperty(i, e, {
				value: Xr(r[e], t, n),
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
function Zr(e, t) {
	let n = Array.from(e, (e) => e.codePointAt(0)), r = Array.from(t, (e) => e.codePointAt(0)), i = Math.min(n.length, r.length);
	for (let e = 0; e < i; e += 1) if (n[e] !== r[e]) return n[e] - r[e];
	return n.length - r.length;
}
function H(e) {
	if (e === null || typeof e == "boolean" || typeof e == "number" || typeof e == "string") return JSON.stringify(e);
	if (Array.isArray(e)) return `[${e.map(H).join(",")}]`;
	let t = e;
	return `{${Object.keys(t).sort(Zr).map((e) => `${JSON.stringify(e)}:${H(t[e])}`).join(",")}}`;
}
var Qr = [
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
function $r(e, t) {
	return e >>> t | e << 32 - t;
}
function ei(e) {
	let t = Ar.encode(e), n = t.length * 8, r = Math.ceil((t.length + 9) / 64) * 64, i = new Uint8Array(r);
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
			let t = s[e - 15], n = s[e - 2], r = $r(t, 7) ^ $r(t, 18) ^ t >>> 3, i = $r(n, 17) ^ $r(n, 19) ^ n >>> 10;
			s[e] = s[e - 16] + r + s[e - 7] + i >>> 0;
		}
		let [t, n, r, i, c, l, u, d] = o;
		for (let e = 0; e < 64; e += 1) {
			let a = $r(c, 6) ^ $r(c, 11) ^ $r(c, 25), o = c & l ^ ~c & u, f = d + a + o + Qr[e] + s[e] >>> 0, p = ($r(t, 2) ^ $r(t, 13) ^ $r(t, 22)) + (t & n ^ t & r ^ n & r) >>> 0;
			d = u, u = l, l = c, c = i + f >>> 0, i = r, r = n, n = t, t = f + p >>> 0;
		}
		o[0] = o[0] + t >>> 0, o[1] = o[1] + n >>> 0, o[2] = o[2] + r >>> 0, o[3] = o[3] + i >>> 0, o[4] = o[4] + c >>> 0, o[5] = o[5] + l >>> 0, o[6] = o[6] + u >>> 0, o[7] = o[7] + d >>> 0;
	}
	return Array.from(o, (e) => e.toString(16).padStart(8, "0")).join("");
}
function ti(e) {
	return {
		mansion_id: e.mansion_id,
		ghost_id: e.ghost_id,
		session_slot: e.session_slot,
		run_id: e.run_id,
		run_sequence: e.run_sequence
	};
}
function ni(e) {
	return {
		origin: e.origin,
		source_type: e.source_type,
		identity_parts: e.identity_parts,
		revision: e.revision,
		generation: e.generation,
		source_sequence: e.source_sequence
	};
}
function ri(e) {
	return {
		schema_version: e.schema_version,
		event_type: e.event_type,
		scope: ti(e.scope),
		source: ni(e.source),
		caused_by: e.caused_by,
		occurred_at_ms: e.occurred_at_ms,
		payload: e.payload
	};
}
function ii(e) {
	return `e1:${ei(H([
		e.schema_version,
		e.event_type,
		ti(e.scope),
		{
			origin: e.source.origin,
			source_type: e.source.source_type,
			identity_parts: e.source.identity_parts
		}
	]))}`;
}
function ai(e) {
	return `r1:${ei(H(ri(e)))}`;
}
function oi(e) {
	let t = {
		...ri(e),
		event_id: e.event_id,
		record_id: e.record_id,
		sequence: e.sequence,
		persisted_at_ms: e.persisted_at_ms
	};
	return e.prev_hash !== void 0 && e.hash !== void 0 && (t.prev_hash = e.prev_hash, t.hash = e.hash), t;
}
function si(e, t, n) {
	let r = Xr(e, n, /* @__PURE__ */ new Set());
	return Lr(H(r)) > 262144 && V(n, `must encode to at most ${Or} UTF-8 bytes`), t === "domain_event_recorded" ? ci(r, n) : r;
}
function ci(e, t) {
	let n = Pr(e, t);
	return Fr(n, [
		"domain",
		"kind",
		"entity_id",
		"data"
	], [], t), {
		domain: Rr(n.domain, `${t}.domain`),
		kind: Rr(n.kind, `${t}.kind`),
		entity_id: Rr(n.entity_id, `${t}.entity_id`),
		data: Xr(n.data, `${t}.data`, /* @__PURE__ */ new Set())
	};
}
function li(e, t) {
	if (e.schema_version !== 1) throw new ui(t);
	return 1;
}
var ui = class extends Error {
	path;
	constructor(e) {
		super("schema version is not supported"), this.path = e;
	}
};
function di(e, t) {
	try {
		return {
			ok: !0,
			value: t()
		};
	} catch (t) {
		return t instanceof ui ? {
			ok: !1,
			diagnostic: {
				code: "unsupported_schema",
				path: t.path,
				safe_detail: "Schema version is not supported."
			}
		} : t instanceof Mr ? {
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
function fi(e) {
	return di("invalid_record", () => {
		let t = Pr(e, "$");
		Fr(t, [
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
		let n = li(t, "$.schema_version"), r = Hr(t.event_type, "$.event_type"), i = {
			schema_version: n,
			event_type: r,
			scope: Gr(t.scope, "$.scope"),
			source: qr(t.source, "$.source"),
			caused_by: Yr(t.caused_by, "$.caused_by", Jr),
			occurred_at_ms: Br(t.occurred_at_ms, "$.occurred_at_ms", !0),
			payload: si(t.payload, r, "$.payload")
		}, a = Wr(t.event_id, "e1:", "$.event_id"), o = Wr(t.record_id, "r1:", "$.record_id");
		a !== ii(i) && V("$.event_id", "does not match canonical event content"), o !== ai(i) && V("$.record_id", "does not match canonical event content");
		let s = Object.hasOwn(t, "prev_hash"), c = Object.hasOwn(t, "hash");
		s !== c && V("$", "prev_hash and hash must be present together");
		let l = {
			...i,
			event_id: a,
			record_id: o,
			sequence: zr(t.sequence, "$.sequence", 1),
			persisted_at_ms: Br(t.persisted_at_ms, "$.persisted_at_ms", !1)
		};
		return s && c ? {
			...l,
			prev_hash: Wr(t.prev_hash, "h1:", "$.prev_hash"),
			hash: Wr(t.hash, "h1:", "$.hash")
		} : l;
	});
}
function pi(e) {
	return `${H(oi(e))}\n`;
}
function mi(e, t) {
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
	let r = fi(n);
	return r.ok ? r : {
		ok: !1,
		diagnostic: {
			...r.diagnostic,
			line: t
		}
	};
}
// src/core/ghost-state.ts
var hi = [
	"idle",
	"working",
	"waiting",
	"blocked",
	"failed",
	"done"
];
function gi(e) {
	return e.caused_by.length + (e.occurred_at_ms === null ? 0 : 1) + (e.source.generation.length === 0 ? 0 : 1) + +(e.source.source_sequence > 0) + Oi(e.payload);
}
function _i(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = t.get(n.record_id);
		(e === void 0 || Mi(n, e) < 0) && t.set(n.record_id, n);
	}
	let n = /* @__PURE__ */ new Map();
	for (let e of t.values()) {
		let t = n.get(e.event_id);
		t === void 0 ? n.set(e.event_id, [e]) : t.push(e);
	}
	let r = [], i = /* @__PURE__ */ new Map();
	for (let [e, t] of n) {
		let n = t[0];
		for (let e of t.slice(1)) ji(e, n) > 0 && (n = e);
		r.push(n);
		let a = t.map((e) => e.record_id).sort(W);
		a.length > 1 && Li(i, {
			code: "conflicting_variant",
			event_id: e,
			related_event_id: null,
			kind: "conflict",
			record_ids: a
		});
	}
	r.sort(Ni);
	let a = new Map(r.map((e, t) => [e.event_id, t]));
	return r.forEach((e, t) => {
		for (let n of new Set(e.caused_by)) {
			let r = a.get(n);
			r === void 0 ? Li(i, {
				code: "missing_predecessor",
				event_id: e.event_id,
				related_event_id: n,
				kind: "missing",
				record_ids: []
			}) : r >= t && Li(i, {
				code: "missing_predecessor",
				event_id: e.event_id,
				related_event_id: n,
				kind: "forward",
				record_ids: []
			});
		}
	}), {
		events: r,
		diagnostics: Array.from(i.values()).sort(Ii)
	};
}
function vi(e, t, n, r) {
	return `t1:${ei(H([
		e,
		t,
		n,
		r
	]))}`;
}
function yi(e) {
	let t = _i(e);
	return {
		selection: t,
		snapshots: bi(t.events),
		transitions: wi(t.events)
	};
}
function bi(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = [n.scope.mansion_id, n.scope.ghost_id];
		t.set(H(e), e);
	}
	return Array.from(t.values()).sort(Fi).map(([t, n]) => Ti(e, t, n));
}
function xi(e) {
	return H([
		e.run_sequence,
		e.run_id,
		e.session_slot
	]);
}
function Si(e, t) {
	switch (e.latest = t, t.event_type) {
		case "approval_requested":
			U(t, "mid") !== null && e.requests.push(t);
			break;
		case "approval_decided": {
			let n = U(t, "mid");
			n !== null && e.decided.add(n);
			break;
		}
		case "tool_started": {
			let n = U(t, "tool_call_id");
			n !== null && e.startedTools.add(n);
			break;
		}
		case "tool_finished": {
			let n = U(t, "tool_call_id");
			n !== null && Ai(t, "final") === !0 && e.finishedTools.add(n);
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
function Ci(e, t, n) {
	let r = e.selectedStart;
	if (r === null) return Ei(t, n);
	let i = e.runs.get(xi(r.scope)), a = /* @__PURE__ */ new Set();
	for (let e of i.requests) {
		let t = U(e, "mid");
		i.decided.has(t) || a.add(t);
	}
	let o = Array.from(a).sort(W), s = Array.from(i.startedTools).filter((e) => !i.finishedTools.has(e)).sort(W), c, l;
	return i.failed === void 0 ? i.blocked === void 0 ? i.completed === void 0 ? o.length > 0 ? (c = "waiting", l = Di(i.requests, (e) => a.has(U(e, "mid")))) : (c = "working", l = i.progress) : (c = "done", l = i.completed) : (c = "blocked", l = i.blocked) : (c = "failed", l = i.failed), {
		mansion_id: t,
		ghost_id: n,
		run_id: r.scope.run_id,
		run_sequence: r.scope.run_sequence,
		state: c,
		pending_approvals: o,
		open_tools: s,
		latest_event_id: i.latest.event_id,
		latest_sequence: i.latest.sequence,
		reason: l === void 0 ? null : U(l, "reason")
	};
}
function wi(e) {
	let t = /* @__PURE__ */ new Map(), n = [];
	for (let r of e) {
		let e = r.scope.mansion_id, i = r.scope.ghost_id, a = H([e, i]), o = t.get(a);
		o === void 0 && (o = {
			runs: /* @__PURE__ */ new Map(),
			selectedStart: null,
			snapshot: Ei(e, i)
		}, t.set(a, o));
		let s = xi(r.scope), c = o.runs.get(s);
		c === void 0 && (c = {
			requests: [],
			decided: /* @__PURE__ */ new Set(),
			startedTools: /* @__PURE__ */ new Set(),
			finishedTools: /* @__PURE__ */ new Set(),
			latest: r
		}, o.runs.set(s, c)), Si(c, r), r.event_type === "run_started" && (o.selectedStart === null || Pi(r, o.selectedStart) > 0) && (o.selectedStart = r);
		let l = o.snapshot, u = Ci(o, e, i);
		o.snapshot = u, Ri(l, u) || n.push({
			transition_id: vi(r.event_id, e, i, u.state),
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
function Ti(e, t, n) {
	let r = e.filter((e) => e.scope.mansion_id === t && e.scope.ghost_id === n), i = r.filter((e) => e.event_type === "run_started");
	if (i.length === 0) return Ei(t, n);
	let a = i[0];
	for (let e of i.slice(1)) Pi(e, a) > 0 && (a = e);
	let o = r.filter((e) => e.scope.run_sequence === a.scope.run_sequence && e.scope.run_id === a.scope.run_id && e.scope.session_slot === a.scope.session_slot), s = new Set(o.filter((e) => e.event_type === "approval_requested").map((e) => U(e, "mid")).filter((e) => e !== null)), c = new Set(o.filter((e) => e.event_type === "approval_decided").map((e) => U(e, "mid")).filter((e) => e !== null)), l = Array.from(s).filter((e) => !c.has(e)).sort(W), u = new Set(o.filter((e) => e.event_type === "tool_started").map((e) => U(e, "tool_call_id")).filter((e) => e !== null)), d = new Set(o.filter((e) => e.event_type === "tool_finished" && Ai(e, "final") === !0).map((e) => U(e, "tool_call_id")).filter((e) => e !== null)), f = Array.from(u).filter((e) => !d.has(e)).sort(W), p = o.filter((e) => e.event_type === "run_failed"), m = o.filter((e) => e.event_type === "run_blocked"), h = o.filter((e) => e.event_type === "run_completed"), g, _;
	p.length > 0 ? (g = "failed", _ = p.at(-1)) : m.length > 0 ? (g = "blocked", _ = m.at(-1)) : h.length > 0 ? (g = "done", _ = h.at(-1)) : l.length > 0 ? (g = "waiting", _ = Di(o, (e) => e.event_type === "approval_requested" && l.includes(U(e, "mid") ?? ""))) : (g = "working", _ = Di(o, (e) => e.event_type === "ghost_progressed" || e.event_type === "run_started"));
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
		reason: _ === void 0 ? null : U(_, "reason")
	};
}
function Ei(e, t) {
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
function Di(e, t) {
	for (let n = e.length - 1; n >= 0; --n) {
		let r = e[n];
		if (t(r)) return r;
	}
}
function Oi(e) {
	return e === null ? 0 : typeof e == "string" ? e.length === 0 ? 0 : 1 : typeof e == "boolean" || typeof e == "number" ? 1 : Array.isArray(e) ? e.reduce((e, t) => e + Oi(t), 0) : Object.values(e).reduce((e, t) => e + Oi(t), 0);
}
function ki(e) {
	return e.payload === null || Array.isArray(e.payload) || typeof e.payload != "object" ? null : e.payload;
}
function U(e, t) {
	let n = ki(e)?.[t];
	return typeof n == "string" && n.length > 0 ? n : null;
}
function Ai(e, t) {
	let n = ki(e)?.[t];
	return typeof n == "boolean" ? n : null;
}
function ji(e, t) {
	if (e.source.revision !== t.source.revision) return e.source.revision - t.source.revision;
	let n = gi(e) - gi(t);
	return n === 0 ? W(e.record_id, t.record_id) : n;
}
function Mi(e, t) {
	if (e.sequence !== t.sequence) return e.sequence - t.sequence;
	let n = W(e.event_id, t.event_id);
	return n === 0 ? W(pi(e), pi(t)) : n;
}
function Ni(e, t) {
	return e.sequence === t.sequence ? W(e.event_id, t.event_id) : e.sequence - t.sequence;
}
function Pi(e, t) {
	if (e.scope.run_sequence !== t.scope.run_sequence) return e.scope.run_sequence - t.scope.run_sequence;
	let n = W(e.scope.run_id, t.scope.run_id);
	return n === 0 ? e.sequence === t.sequence ? W(e.event_id, t.event_id) : e.sequence - t.sequence : n;
}
function Fi(e, t) {
	let n = W(e[0], t[0]);
	return n === 0 ? W(e[1], t[1]) : n;
}
function Ii(e, t) {
	return [
		W(e.code, t.code),
		W(e.event_id, t.event_id),
		W(e.related_event_id ?? "", t.related_event_id ?? ""),
		W(e.kind, t.kind),
		W(e.record_ids.join(","), t.record_ids.join(","))
	].find((e) => e !== 0) ?? 0;
}
function Li(e, t) {
	e.set(H(t), t);
}
function Ri(e, t) {
	return H(e) === H(t);
}
function W(e, t) {
	let n = Array.from(e, (e) => e.codePointAt(0)), r = Array.from(t, (e) => e.codePointAt(0)), i = Math.min(n.length, r.length);
	for (let e = 0; e < i; e += 1) if (n[e] !== r[e]) return n[e] - r[e];
	return n.length - r.length;
}
// src/core/ghost-status.ts
var zi = {
	idle: "Idle",
	working: "Working",
	waiting: "Waiting",
	blocked: "Blocked",
	failed: "Failed",
	done: "Done"
}, Bi = /* @__PURE__ */ new Set([
	"waiting",
	"blocked",
	"failed"
]), Vi = {
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
}, Hi = 120;
function Ui(e, t) {
	let n = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function Wi(e) {
	if (e === null) return null;
	let t = Object.hasOwn(Vi, e) ? Vi[e] : void 0;
	if (t !== void 0) return t;
	if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(e)) {
		let t = Ui(e.replace(/_/g, " "), Hi);
		return t.charAt(0).toUpperCase() + t.slice(1);
	}
	let n = Ui(e, Hi);
	return n === "" ? null : n;
}
function Gi(e) {
	let t = Ui(e.replace(/[-_]+/g, " "), 60);
	return t === "" ? "Ghost" : t.replace(/(^|\s)(\p{L})/gu, (e, t, n) => t + n.toUpperCase());
}
function Ki(e) {
	return e <= 0 ? null : e === 1 ? "1 approval pending" : `${e} approvals pending`;
}
var qi = "house-operator";
function Ji(e, t = {}) {
	return Array.from(e).filter((e) => e.ghost_id !== qi).map((e) => {
		let n = Object.hasOwn(t, e.ghost_id) ? t[e.ghost_id] : void 0;
		return {
			key: JSON.stringify([e.mansion_id, e.ghost_id]),
			ghostId: e.ghost_id,
			name: n === void 0 || n.trim() === "" ? Gi(e.ghost_id) : n,
			state: e.state,
			stateText: zi[e.state],
			pendingCount: e.pending_approvals.length,
			pendingText: Ki(e.pending_approvals.length),
			reason: Wi(e.reason)
		};
	});
}
var Yi = /* @__PURE__ */ new Set([
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"duplicate_sequence",
	"missing_sequence"
]);
function Xi(e) {
	let t = e.line === void 0 ? "" : ` at line ${e.line}`;
	if (Yi.has(e.code)) return `The séance log failed its integrity check${t}. Showing only the records before it.`;
	switch (e.code) {
		case "invalid_record":
		case "unsupported_schema": return `A séance log record${t} could not be read and was left out.`;
		case "history_partial": return "Some activity could not be recovered from Crew history.";
		case "invalid_envelope":
		case "unknown_session":
		case "approval_unmatched": return "A Crew event was refused and not recorded.";
		case "persistence_failed": return /\s/.test(e.safe_detail) ? Ui(e.safe_detail, 160) : "The séance log could not be saved or read. Showing the last confirmed state.";
		default: return "The séance log reported a problem. Showing the last confirmed state.";
	}
}
// src/core/house-registry.ts
var Zi = {
	navigation: "navigation",
	requirements: "requirements",
	design: "design",
	"tasks-and-implementation": "tasks and implementation",
	replay: "replay",
	review: "review"
}, Qi = [
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
], $i = new Map(Qi.map((e) => [e.id, e]));
function ea(e) {
	return typeof e == "string" && $i.has(e);
}
function ta(e) {
	return $i.get(e);
}
function na(e) {
	return ta(e).order;
}
function ra(e, t) {
	return na(e) - na(t);
}
function ia(e) {
	return Qi.filter((t) => t.scope === "mvp" || e !== "hidden");
}
function aa(e, t, n) {
	if (!n.has(e)) return e;
	let r = /* @__PURE__ */ new Set([e]), i = $i.get(e)?.neighbors[t];
	for (; i !== void 0 && !r.has(i);) {
		if (n.has(i)) return i;
		r.add(i), i = $i.get(i)?.neighbors[t];
	}
	return e;
}
function oa(e) {
	return e === "not_applicable" ? "not applicable" : e;
}
var G = [
	"requirements",
	"design",
	"tasks",
	"implementation"
], sa = [
	"not_started",
	"ready",
	"starting",
	"working",
	"waiting",
	"revision_required",
	"approved",
	"failed",
	"done"
], ca = [
	"sealed",
	"waiting",
	"open",
	"rejected"
], la = [
	"pending",
	"approved",
	"rejected",
	"superseded"
], ua = [
	"pending",
	"approved",
	"rejected",
	"consumed",
	"succeeded",
	"failed",
	"superseded"
], da = [
	"valid",
	"corrupt",
	"uncertain"
], fa = [
	"delete_path",
	"run_command",
	"git_write"
], pa = [
	"list",
	"read",
	"write",
	"delete",
	"command_read",
	"command_write",
	"git_write"
], ma = ["approved", "rejected"], ha = ["operator", "crew"], ga = 1024, _a = ["[redacted]", "[home]/"], va = class extends Error {
	path;
	constructor(e) {
		super("refused"), this.path = e;
	}
};
function K(e) {
	throw new va(e);
}
function ya(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function ba(e, t, n, r = []) {
	ya(e) || K(t);
	for (let i of Object.keys(e)) !n.includes(i) && !r.includes(i) && K(t);
	for (let r of n) Object.hasOwn(e, r) || K(`${t}.${r}`);
	return e;
}
function xa(e, t, n) {
	return typeof e == "string" && t.includes(e) || K(n), e;
}
function Sa(e, t, n = 0) {
	return (typeof e != "number" || !Number.isSafeInteger(e) || e < n) && K(t), e;
}
var Ca = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
function wa(e, t, n = 160) {
	return (typeof e != "string" || e.length === 0 || e.length > n || Ca.test(e)) && K(t), e;
}
function Ta(e, t) {
	return typeof e == "string" && /^[0-9a-f]{64}$/.test(e) || K(t), e;
}
function Ea(e, t, n = !1) {
	if (n && e === "") return "";
	let r = wa(e, t, ga);
	(r.startsWith("/") || r.includes("\\")) && K(t);
	for (let e of r.split("/")) (e === "" || e === "." || e === "..") && K(t);
	return r;
}
function Da(e, t) {
	return (typeof e != "string" || e.length > 40 || !Dr.test(e)) && K(t), e;
}
function Oa(e, t) {
	let n = ba(e, t, [
		"revision",
		"sha256",
		"size_bytes"
	]);
	return {
		revision: Sa(n.revision, `${t}.revision`, 1),
		sha256: Ta(n.sha256, `${t}.sha256`),
		sizeBytes: Sa(n.size_bytes, `${t}.size_bytes`)
	};
}
function ka(e, t) {
	if (e === null) return null;
	let n = ba(e, t, [
		"outcome",
		"actor",
		"event_id",
		"sequence"
	]), r = n.event_id;
	return typeof r == "string" && /^e1:[0-9a-f]{64}$/.test(r) || K(`${t}.event_id`), {
		outcome: xa(n.outcome, ma, `${t}.outcome`),
		actor: xa(n.actor, ha, `${t}.actor`),
		eventId: r,
		sequence: Sa(n.sequence, `${t}.sequence`, 1)
	};
}
function Aa(e, t, n, r) {
	if (e === "pending") return t === null;
	if (e === "superseded") return t === null || r && t.outcome === "approved";
	let i = Object.hasOwn(n, e) ? n[e] : void 0;
	return i !== void 0 && t !== null && t.outcome === i;
}
var ja = {
	approved: "approved",
	rejected: "rejected"
}, Ma = {
	approved: "approved",
	rejected: "rejected",
	consumed: "approved",
	succeeded: "approved",
	failed: "approved"
};
function Na(e, t, n) {
	if (e === null) return null;
	let r = ba(e, t, [
		"proposal_id",
		"phase",
		"document_path",
		"artifact_revision",
		"status",
		"created_sequence",
		"decision"
	]);
	r.phase !== n && K(`${t}.phase`);
	let i = xa(r.status, la, `${t}.status`), a = ka(r.decision, `${t}.decision`);
	return Aa(i, a, ja, !1) || K(`${t}.decision`), {
		proposalId: wa(r.proposal_id, `${t}.proposal_id`),
		phase: n,
		documentPath: Ea(r.document_path, `${t}.document_path`),
		artifactRevision: Oa(r.artifact_revision, `${t}.artifact_revision`),
		status: i,
		createdSequence: Sa(r.created_sequence, `${t}.created_sequence`, 1),
		decision: a
	};
}
function Pa(e, t) {
	switch (e) {
		case "waiting": return t?.status === "pending";
		case "open": return t?.status === "approved";
		case "rejected": return t?.status === "rejected";
		case "sealed": return t === null || t.status === "superseded" || t.status === "rejected";
	}
}
function Fa(e, t, n) {
	let r = ba(e, t, [
		"phase",
		"status",
		"ghost_ids",
		"door"
	]);
	r.phase !== n && K(`${t}.phase`), (!Array.isArray(r.ghost_ids) || r.ghost_ids.length > 16) && K(`${t}.ghost_ids`);
	let i = r.ghost_ids.map((e, n) => wa(e, `${t}.ghost_ids[${n}]`));
	new Set(i).size !== i.length && K(`${t}.ghost_ids`);
	let a = ba(r.door, `${t}.door`, ["status", "proposal"]), o = xa(a.status, ca, `${t}.door.status`), s = Na(a.proposal, `${t}.door.proposal`, n);
	return Pa(o, s) || K(`${t}.door`), {
		phase: n,
		status: xa(r.status, sa, `${t}.status`),
		ghostIds: i,
		door: {
			status: o,
			proposal: s
		}
	};
}
function Ia(e) {
	return _a.some((t) => e.includes(t));
}
function La(e, t = 0) {
	return t > 8 ? !1 : e === null || typeof e == "boolean" ? !0 : typeof e == "number" ? Number.isSafeInteger(e) : typeof e == "string" ? !Ca.test(e) && !Ia(e) : Array.isArray(e) ? e.every((e) => La(e, t + 1)) : ya(e) ? Object.entries(e).every(([e, n]) => e !== "" && !Ca.test(e) && !Ia(e) && La(n, t + 1)) : !1;
}
function Ra(e) {
	try {
		let t = ba(e, "$", [
			"schema_version",
			"mansion_id",
			"session_slot",
			"room",
			"kind",
			"working_directory",
			"arguments",
			"path_intents"
		]);
		if (t.schema_version !== 1 || !ya(t.arguments) || !La(t.arguments) || JSON.stringify(t.arguments).length > 16384 || !Array.isArray(t.path_intents) || t.path_intents.length > 64 || [
			t.session_slot,
			t.room,
			t.working_directory
		].some((e) => typeof e == "string" && Ia(e))) return null;
		let n = t.path_intents.map((e, t) => {
			let n = ba(e, `\$[${t}]`, ["path", "access"]);
			return typeof n.path == "string" && Ia(n.path) && K("$"), {
				path: Ea(n.path, "$"),
				access: xa(n.access, pa, "$")
			};
		});
		return {
			schemaVersion: 1,
			mansionId: Da(t.mansion_id, "$"),
			sessionSlot: wa(t.session_slot, "$"),
			room: wa(t.room, "$"),
			kind: xa(t.kind, fa, "$"),
			workingDirectory: Ea(t.working_directory, "$", !0),
			arguments: t.arguments,
			pathIntents: n
		};
	} catch (e) {
		if (e instanceof va) return null;
		throw e;
	}
}
function za(e, t, n) {
	let r = ba(e, t, [
		"proposal_id",
		"ghost_id",
		"session_slot",
		"room",
		"status",
		"action_digest",
		"descriptor",
		"created_sequence",
		"decision"
	]), i = xa(r.status, ua, `${t}.status`), a = ka(r.decision, `${t}.decision`);
	Aa(i, a, Ma, !0) || K(`${t}.decision`);
	let o = wa(r.session_slot, `${t}.session_slot`), s = r.room === null ? null : wa(r.room, `${t}.room`), c = r.descriptor === null ? null : Ra(r.descriptor);
	return c !== null && (c.mansionId !== n || c.sessionSlot !== o || c.room !== s) && (c = null), {
		proposalId: wa(r.proposal_id, `${t}.proposal_id`),
		ghostId: wa(r.ghost_id, `${t}.ghost_id`),
		sessionSlot: o,
		room: s,
		status: i,
		actionDigest: Ta(r.action_digest, `${t}.action_digest`),
		descriptor: c,
		createdSequence: Sa(r.created_sequence, `${t}.created_sequence`, 1),
		decision: a
	};
}
function Ba(e, t) {
	let n = ba(e, t, [
		"slot",
		"mid",
		"requested_sequence",
		"tool_name",
		"action_digest",
		"proposal_id"
	]);
	return {
		slot: wa(n.slot, `${t}.slot`),
		mid: wa(n.mid, `${t}.mid`),
		requestedSequence: Sa(n.requested_sequence, `${t}.requested_sequence`, 1),
		toolName: n.tool_name === null ? null : wa(n.tool_name, `${t}.tool_name`),
		actionDigest: n.action_digest === null ? null : Ta(n.action_digest, `${t}.action_digest`),
		proposalId: n.proposal_id === null ? null : wa(n.proposal_id, `${t}.proposal_id`)
	};
}
function Va(e, t) {
	new Set(e).size !== e.length && K(t);
}
function Ha(e, t) {
	try {
		let n = ba(e, "$", [
			"schema_version",
			"mansion_id",
			"version",
			"integrity",
			"waiting_count",
			"phases",
			"risky_proposals",
			"pending_permissions"
		], ["read_only"]);
		n.read_only !== void 0 && typeof n.read_only != "boolean" && K("$.read_only"), n.schema_version !== 1 && K("$.schema_version");
		let r = Da(n.mansion_id, "$.mansion_id");
		t !== void 0 && r !== t && K("$.mansion_id");
		let i = Sa(n.version, "$.version");
		Array.isArray(n.phases) && n.phases.length === G.length || K("$.phases");
		let a = G.map((e, t) => Fa(n.phases[t], `$.phases[${t}]`, e));
		(!Array.isArray(n.risky_proposals) || n.risky_proposals.length > 200) && K("$.risky_proposals");
		let o = n.risky_proposals.map((e, t) => za(e, `$.risky_proposals[${t}]`, r));
		Va(o.map((e) => e.proposalId), "$.risky_proposals"), (!Array.isArray(n.pending_permissions) || n.pending_permissions.length > 200) && K("$.pending_permissions");
		let s = n.pending_permissions.map((e, t) => Ba(e, `$.pending_permissions[${t}]`));
		return Va(s.map((e) => JSON.stringify([e.slot, e.mid])), "$.pending_permissions"), [
			...o.flatMap((e) => [e.createdSequence, e.decision?.sequence ?? 0]),
			...a.flatMap((e) => [e.door.proposal?.createdSequence ?? 0, e.door.proposal?.decision?.sequence ?? 0]),
			...s.map((e) => e.requestedSequence)
		].some((e) => e > i) && K("$.version"), {
			ok: !0,
			projection: {
				mansionId: r,
				version: i,
				integrity: xa(n.integrity, da, "$.integrity"),
				waitingCount: Sa(n.waiting_count, "$.waiting_count"),
				phases: a,
				riskyProposals: o,
				pendingPermissions: s,
				readOnly: n.read_only === !0
			}
		};
	} catch (e) {
		if (e instanceof va) return {
			ok: !1,
			path: e.path
		};
		throw e;
	}
}
function Ua(e) {
	return {
		revision: e.revision,
		sha256: e.sha256,
		size_bytes: e.sizeBytes
	};
}
var Wa = [
	"study",
	"drafting-room",
	"workshop"
].map((e) => {
	let t = ta(e);
	return {
		id: e,
		name: t.name,
		phases: t.workflowPhases,
		roles: t.ghostRoles
	};
}), q = {
	requirements: "Requirements",
	design: "Design",
	tasks: "Tasks",
	implementation: "Implementation"
}, Ga = {
	not_started: "Not started",
	ready: "Ready to start",
	starting: "Starting",
	working: "Working",
	waiting: "Waiting for your decision",
	revision_required: "Revision required",
	approved: "Approved",
	failed: "Failed to start",
	done: "Done"
}, Ka = {
	sealed: "Sealed door",
	waiting: "Door waiting for your decision",
	open: "Open door",
	rejected: "Door kept shut"
};
function qa(e, t = {}) {
	let n = Object.hasOwn(t, e) ? t[e] : void 0;
	return n === void 0 || n.trim() === "" ? Gi(e) : n;
}
function Ja(e) {
	return Wa.find((t) => t.phases.includes(e)).id;
}
function Ya(e, t) {
	if (t !== null) {
		for (let n of t.phases) if (n.ghostIds.includes(e)) return Ja(n.phase);
	}
	for (let t of Wa) if (t.roles.some((t) => e === t || e.startsWith(`${t}-`))) return t.id;
	return null;
}
function Xa(e) {
	return G[G.indexOf(e) + 1] ?? null;
}
function Za(e, t) {
	let n = q[e].toLowerCase(), r = Xa(e);
	switch (t) {
		case "sealed": return `Sealed door: approve the ${n} to open it.`;
		case "waiting": return `The ${n} are ready. Approve or reject them to decide this door.`;
		case "open": return r === null ? `Open door: the ${n} were approved.` : `Open door: the ${n} were approved. ${q[r]} may be started.`;
		case "rejected": return `Door kept shut: the ${n} were rejected and need a revision.`;
	}
}
var Qa = {
	read_only: "This is a recording. Nothing can be started, approved or rejected here.",
	loading: "Loading the state of the house. Decisions are off until it arrives.",
	unavailable: "The house could not be reached. Decisions are off until it answers.",
	malformed: "The house sent a state this page cannot read. Decisions are off.",
	integrity: "The séance log failed its integrity check. Decisions are off until it is repaired.",
	uncertain: "The latest ghost activity is not confirmed yet. Decisions are off until the house catches up.",
	catching_up: "Catching up with the séance log. Decisions are off until it is current.",
	stale: "Something changed in the house. Refreshing before you decide."
}, $a = /* @__PURE__ */ new Set([
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"duplicate_sequence",
	"missing_sequence"
]);
function eo(e) {
	let t = (e) => ({
		canDecide: !1,
		block: e,
		text: Qa[e]
	});
	return e.readOnly === !0 || e.projection?.readOnly === !0 ? t("read_only") : e.projectionStatus === "malformed" ? t("malformed") : e.projection === null ? t(e.projectionStatus === "unavailable" ? "unavailable" : "loading") : e.projection.integrity === "corrupt" ? t("integrity") : e.canonical.diagnostic === null ? e.projection.integrity === "uncertain" ? t("uncertain") : e.projectionStatus === "unavailable" ? t("unavailable") : !e.canonical.loaded || e.canonical.catchingUp ? t("catching_up") : e.canonical.highestSequence > e.projection.version ? t("stale") : {
		canDecide: !0,
		block: null,
		text: null
	} : t($a.has(e.canonical.diagnostic.code) ? "integrity" : "uncertain");
}
function to(e) {
	return e.kind === "start_phase" ? `phase:${e.phase}` : `proposal:${e.proposalId}`;
}
function no(e) {
	return e.slice(0, 12);
}
function ro(e) {
	return e === 1 ? "1 byte" : `${e.toLocaleString("en-US")} bytes`;
}
function io(e) {
	let t = e.outcome === "approved" ? "Approved" : "Rejected";
	return e.actor === "operator" ? `${t} by the operator in Haunted House.` : `${t} in Crew, outside Haunted House.`;
}
function ao(e, t, n, r, i) {
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
function oo(e, t, n, r) {
	let i = t.door.proposal;
	if (i === null) return null;
	let a = i.status === "pending" && t.door.status === "waiting", o = a ? "pending" : i.status === "pending" ? "superseded" : i.status, s = ao(a, !0, n, r, `proposal:${i.proposalId}`), c = (n) => ({
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
		title: `${q[t.phase]} door`,
		documentPath: i.documentPath,
		revisionText: `Revision ${i.artifactRevision.revision}`,
		digestPrefix: no(i.artifactRevision.sha256),
		sizeText: ro(i.artifactRevision.sizeBytes),
		outcomeText: i.decision === null ? o === "superseded" ? "Superseded: the document changed after this proposal. A new revision needs its own decision." : null : io(i.decision),
		approve: s.canApprove ? c("approve") : null,
		reject: s.canReject ? c("reject") : null
	};
}
var so = {
	delete_path: "Delete a file or empty folder",
	run_command: "Run a command",
	git_write: "Change the git repository"
}, co = {
	list: "List",
	read: "Read",
	write: "Write",
	delete: "Delete",
	command_read: "Command may read",
	command_write: "Command may write",
	git_write: "Git may write"
}, lo = {
	pending: "Waiting for your decision",
	approved: "Approved, not used yet",
	rejected: "Rejected",
	consumed: "Approval used: the action is running",
	succeeded: "Done: the approved action succeeded",
	failed: "Failed: the approved action did not succeed. The approval is used up.",
	superseded: "Superseded"
}, uo = "Approving allows exactly one attempt of exactly this action. If the attempt fails, the approval is used up and the ghost must ask again.";
function fo(e) {
	return Array.isArray(e) && e.every((e) => typeof e == "string") ? e.map((e) => JSON.stringify(e)).join(" ") : typeof e == "string" ? e : JSON.stringify(e);
}
function po(e) {
	return {
		scope: [
			{
				label: "Action",
				value: so[e.kind]
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
			value: fo(e.arguments[t])
		})),
		paths: e.pathIntents.map((e) => ({
			label: co[e.access],
			value: e.path
		}))
	};
}
function mo(e, t, n, r, i = {}) {
	let a = t.descriptor !== null, o = ao(t.status === "pending", a, n, r, `proposal:${t.proposalId}`), s = t.descriptor === null ? {
		scope: [],
		arguments: [],
		paths: []
	} : po(t.descriptor), c = (n) => ({
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
		ghostName: qa(t.ghostId, i),
		status: t.status,
		statusText: lo[t.status],
		title: t.descriptor === null ? "Risky action (details unavailable)" : so[t.descriptor.kind],
		complete: a,
		...s,
		digestPrefix: no(t.actionDigest),
		oneAttemptText: uo,
		outcomeText: t.decision === null ? null : io(t.decision),
		approve: o.canApprove ? c("approve") : null,
		reject: o.canReject ? c("reject") : null
	};
}
var ho = {
	ready: (e) => `Start ${e}`,
	failed: (e) => `Try starting ${e} again`,
	revision_required: (e) => `Start the ${e} revision`
};
function go(e, t, n, r) {
	let i = ho[t.status];
	if (i === void 0) return null;
	let a = n.canDecide && r === null;
	return {
		phase: t.phase,
		label: i(q[t.phase].toLowerCase()),
		enabled: a,
		busy: r === `phase:${t.phase}`,
		command: a ? {
			kind: "start_phase",
			phase: t.phase,
			expectedVersion: e.version
		} : null
	};
}
function _o(e, t = {}) {
	if (e === null) return [];
	let n = [], r = (e) => qa(e, t);
	for (let t of e.phases) {
		let e = t.door.proposal;
		t.door.status === "waiting" && e !== null && e.status === "pending" && n.push({
			kind: "door",
			id: `door:${e.proposalId}`,
			room: Ja(t.phase),
			phase: t.phase,
			ghostId: t.ghostIds.at(-1) ?? null,
			text: `The ${q[t.phase].toLowerCase()} door needs your decision.`
		});
	}
	let i = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set();
	for (let t of e.riskyProposals) {
		if (t.status !== "pending") continue;
		i.add(t.proposalId), a.add(t.sessionSlot);
		let o = t.descriptor === null ? "do something risky" : so[t.descriptor.kind].toLowerCase();
		n.push({
			kind: "risky",
			id: `risky:${t.proposalId}`,
			room: Ya(t.ghostId, e) ?? "workshop",
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
function vo(e) {
	return e === 0 ? "Nothing needs you" : e === 1 ? "1 thing needs you" : `${e} things need you`;
}
function yo(e) {
	return e.length === 0 ? "No ghost here yet" : e.map((e) => `${e.name}: ${e.stateText}`).join(", ");
}
function bo(e, t, n = {}) {
	let r = Array.from(t), i = _o(e, n);
	return Wa.map((t) => {
		let a = e === null ? [] : t.phases.map((t) => {
			let n = e.phases[G.indexOf(t)];
			return {
				phase: t,
				name: q[t],
				status: n.status,
				statusText: Ga[n.status],
				doorStatus: n.door.status,
				doorText: Ka[n.door.status],
				doorHint: Za(t, n.door.status)
			};
		}), o = Ji(r.filter((n) => Ya(n.ghost_id, e) === t.id), n), s = i.filter((e) => e.room === t.id).length, c = a.length === 0 ? "State not loaded" : a.map((e) => `${e.name}: ${e.statusText}, ${e.doorText}`).join(". ");
		return {
			id: t.id,
			name: t.name,
			phases: a,
			ghosts: o,
			needsYou: s,
			label: `${t.name}. ${c}. ${yo(o)}.${s > 0 ? ` ${vo(s)}.` : ""}`
		};
	});
}
function xo(e, t, n, r, i = {}) {
	if (e === null) return {
		room: t,
		phases: [],
		risky: []
	};
	let a = t.phases.map((t) => {
		let i = e.phases[G.indexOf(t.phase)];
		return {
			line: t,
			start: go(e, i, n, r),
			door: oo(e, i, n, r)
		};
	}), o = e.riskyProposals.filter((n) => (Ya(n.ghostId, e) ?? "workshop") === t.id), s = o.filter((e) => e.status === "pending"), c = o.filter((e) => e.status !== "pending").sort((e, t) => t.createdSequence - e.createdSequence).slice(0, 5);
	return {
		room: t,
		phases: a,
		risky: [...s, ...c].map((t) => mo(e, t, n, r, i))
	};
}
// src/core/seance-log.ts
var So = `h1:${"0".repeat(64)}`;
function Co(e) {
	let t = { ...oi(e) };
	return delete t.hash, `h1:${ei(H(t))}`;
}
function wo(e) {
	let t = e.split("\n");
	t.at(-1) === "" && t.pop();
	let n = [], r = [], i = /* @__PURE__ */ new Set(), a = null, o = So;
	for (let e = 0; e < t.length; e += 1) {
		let s = e + 1, c = t[e].endsWith("\r") ? t[e].slice(0, -1) : t[e];
		if (c.trim() === "") continue;
		let l = mi(c, s);
		if (!l.ok) {
			r.push(l.diagnostic);
			continue;
		}
		let u = l.value, d = To(u, n.length + 1, a, o, i);
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
function To(e, t, n, r, i) {
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
		if (e.hash !== Co(e)) return {
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
var Eo = {
	records: /* @__PURE__ */ new Map(),
	highestSequence: 0,
	contiguousSequence: 0
};
function Do(e, t) {
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
function Oo(e) {
	let t = yi(Array.from(e));
	return {
		events: t.selection.events,
		selectionDiagnostics: t.selection.diagnostics,
		snapshots: t.snapshots,
		transitions: t.transitions
	};
}
function ko(e) {
	return Oo(e.records.values());
}
var Ao = "guardrail", jo = qi, Mo = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/, No = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/, Po = /^[a-z][a-z0-9_]{0,63}$/, Fo = /^[0-9a-f]{64}$/, Io = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, Lo = 2 ** 31 - 1, Ro = 2 ** 53 - 1, zo = 1024, Bo = 32, Vo = 255, Ho = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u, Uo = (e) => new TextEncoder().encode(e).length;
function Wo(e) {
	if (typeof e != "string" || e === "" || Uo(e) > zo || e.includes("\\") || Ho.test(e) || e.startsWith("/") || e.normalize("NFC") !== e) return !1;
	let t = e.split("/");
	return t.length > Bo ? !1 : t.every((e) => e !== "" && e !== "." && e !== ".." && Uo(e) <= Vo && !/%[0-9A-Fa-f]{2}/.test(e));
}
var J = (e) => typeof e == "string" && Mo.test(e), Go = (e) => typeof e == "string" && No.test(e), Ko = (e) => typeof e == "string" && Po.test(e), qo = (e) => typeof e == "string" && G.includes(e), Jo = (e) => typeof e == "string" && Fo.test(e), Yo = (e) => Wo(e), Xo = (e, t) => (n) => typeof n == "number" && Number.isSafeInteger(n) && n >= e && n <= t, Zo = (...e) => (t) => typeof t == "string" && e.includes(t), Qo = (e) => (t) => t === null || e(t), $o = (e) => typeof e == "object" && !!e && !Array.isArray(e), es = Xo(1, Lo), ts = Xo(0, Ro), ns = Zo("operator", "crew"), rs = {
	document_path: Yo,
	revision: es,
	sha256: Jo,
	size_bytes: ts
}, is = {
	phase: qo,
	proposal_id: J,
	...rs,
	actor: ns,
	command_id: J
}, as = {
	proposal_id: J,
	action_digest: Jo,
	actor: ns,
	command_id: J,
	crew_slot: Qo(Go),
	crew_mid: Qo(Go)
}, os = {
	proposal_id: J,
	action_digest: Jo,
	claim_id: J,
	code: Ko,
	exit_code: Qo(Xo(-255, 255)),
	output_bytes: ts
}, ss = {
	phase_start_reserved: [{
		phase: qo,
		reservation_id: J,
		command_id: J
	}, "phase"],
	phase_started: [{
		phase: qo,
		reservation_id: J,
		session_slot: Go
	}, "phase"],
	phase_start_failed: [{
		phase: qo,
		reservation_id: J,
		code: Ko
	}, "phase"],
	phase_start_denied: [{
		phase: qo,
		command_id: J,
		code: Ko
	}, "phase"],
	phase_output_ready: [{
		phase: qo,
		proposal_id: J,
		...rs
	}, "proposal_id"],
	revision_started: [{
		phase: qo,
		command_id: J,
		session_slot: Go
	}, "phase"],
	door_superseded: [{
		phase: qo,
		proposal_id: J,
		revision: es,
		sha256: Jo,
		code: Ko
	}, "proposal_id"],
	door_approved: [is, "proposal_id"],
	door_rejected: [is, "proposal_id"],
	risky_action_proposed: [{
		proposal_id: J,
		action_digest: Jo,
		descriptor: $o
	}, "proposal_id"],
	risky_action_approved: [as, "proposal_id"],
	risky_action_rejected: [as, "proposal_id"],
	risky_action_superseded: [{
		proposal_id: J,
		action_digest: Jo,
		code: Ko
	}, "proposal_id"],
	risky_action_consumed: [{
		proposal_id: J,
		action_digest: Jo,
		claim_id: J,
		session_slot: Go
	}, "proposal_id"],
	risky_action_denied: [{
		proposal_id: J,
		action_digest: Qo(Jo),
		denial_id: J,
		session_slot: Go,
		code: Ko
	}, "proposal_id"],
	risky_action_succeeded: [os, "proposal_id"],
	risky_action_failed: [os, "proposal_id"],
	approval_resolution_ignored: [{
		resolution_id: J,
		session_slot: Go,
		mid: Go,
		outcome: Zo("approved", "rejected"),
		code: Ko
	}, "resolution_id"],
	path_denied: [{
		denial_id: J,
		session_slot: Go,
		room: Ko,
		access: Zo(...pa),
		code: Ko,
		path: Qo(Yo)
	}, "denial_id"],
	spec_write_prepared: [{
		write_id: J,
		phase: qo,
		document_path: Yo,
		base_revision: Xo(0, Lo),
		base_sha256: Qo(Jo),
		revision: es,
		sha256: Jo,
		size_bytes: ts
	}, "write_id"],
	spec_document_written: [{
		write_id: J,
		phase: qo,
		...rs
	}, "write_id"],
	spec_write_recovered: [{
		write_id: J,
		phase: qo,
		document_path: Yo,
		outcome: Zo("completed", "not_applied")
	}, "write_id"],
	spec_write_uncertain: [{
		write_id: J,
		phase: qo,
		document_path: Yo,
		code: Ko
	}, "write_id"],
	room_tool_answered: [{
		answer_id: J,
		session_slot: Go,
		mid: Go,
		tool: Zo("list_room_files", "read_room_file", "write_spec_document", "write_room_file", "submit_phase_output"),
		outcome: Zo("approved"),
		actor: Zo("house"),
		reason: Zo("non_risky_room_tool")
	}, "answer_id"]
};
Object.keys(ss);
function cs(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function ls(e) {
	if (e.event_type !== "domain_event_recorded") return null;
	let t = e.payload;
	if (!cs(t) || t.domain !== "doors_and_guardrails") return null;
	if (e.source.origin !== "house" || e.source.source_type !== Ao) return "untrusted_source";
	let n = Object.keys(t);
	if (n.length !== 4 || ![
		"domain",
		"kind",
		"entity_id",
		"data"
	].every((e) => n.includes(e))) return "invalid_shape";
	let r = t.kind;
	if (typeof r != "string" || !Object.hasOwn(ss, r)) return "unsupported_value";
	let [i, a] = ss[r], o = t.data;
	if (!cs(o)) return "invalid_type";
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
var us = /* @__PURE__ */ new Set([
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
function ds(e) {
	if (!Wo(e)) return null;
	let t = e.split("/");
	return t.length !== 4 || t[0] !== ".kiro" || t[1] !== "specs" || t[2].length > 64 || !Io.test(t[2]) ? null : G.slice(0, 3).find((e) => t[3] === `${e}.md`) ?? null;
}
function fs(e) {
	return {
		revision: e.revision,
		sha256: e.sha256,
		sizeBytes: e.size_bytes
	};
}
function ps(e, t) {
	return e.revision === t.revision && e.sha256 === t.sha256 && e.sizeBytes === t.sizeBytes;
}
function ms(e, t) {
	for (let n of e.pendingWrites.values()) if (n.documentPath === t) return !0;
	return !1;
}
function hs(e, t) {
	return {
		outcome: t,
		actor: e.data.actor,
		eventId: e.eventId,
		sequence: e.sequence
	};
}
function gs(e, t) {
	let { kind: n, data: r } = t;
	if (!us.has(n)) return null;
	let i = r.phase, a = e.phases[i];
	if (n === "phase_start_denied") return null;
	if (n === "phase_start_reserved") {
		let t = r.command_id;
		return e.commandIds.has(t) ? "duplicate_command" : G.slice(0, G.indexOf(i)).every((t) => e.phases[t].door === "open") ? a.status !== "ready" && a.status !== "failed" && a.status !== "revision_required" ? "invalid_state" : (e.commandIds.add(t), a.status = "starting", a.reservationId = r.reservation_id, null) : "predecessor_door_sealed";
	}
	if (n === "phase_started" || n === "phase_start_failed") return a.status === "starting" ? r.reservation_id === a.reservationId ? (n === "phase_started" ? (a.status = "working", a.sessionSlot = r.session_slot) : a.status = "failed", null) : "reservation_mismatch" : "invalid_state";
	if (n === "revision_started") {
		let t = r.command_id;
		return e.commandIds.has(t) ? "duplicate_command" : a.status === "revision_required" ? (e.commandIds.add(t), a.status = "working", a.sessionSlot = r.session_slot, null) : "invalid_state";
	}
	if (n === "phase_output_ready") {
		let n = r.proposal_id, o = r.document_path, s = fs(r);
		if (a.status !== "working") return "invalid_state";
		if (e.proposalIds.has(n)) return "duplicate_proposal";
		let c = ds(o);
		if (i === "implementation" ? c !== null : c !== i) return "document_mismatch";
		if (s.revision <= a.lastRevision) return "stale_revision";
		if (ms(e, o)) return "write_pending";
		let l = e.documents.get(o);
		return l !== void 0 && !ps(l, s) ? "artifact_mismatch" : (e.proposalIds.add(n), a.status = "waiting", a.door = "waiting", a.lastRevision = s.revision, a.proposal = {
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
		if (l !== void 0 && !ps(l, s) || ms(e, o.documentPath)) return "artifact_changed";
		if (e.commandIds.add(c), n === "door_approved") {
			a.status = "approved", a.door = "open", a.proposal = {
				...o,
				status: "approved",
				decision: hs(t, "approved")
			};
			let n = G[G.indexOf(i) + 1];
			n !== void 0 && e.phases[n].status === "not_started" && (e.phases[n].status = "ready");
		} else a.status = "revision_required", a.door = "rejected", a.proposal = {
			...o,
			status: "rejected",
			decision: hs(t, "rejected")
		};
		return null;
	}
	let o = r.write_id, s = r.document_path;
	if (n === "spec_write_prepared") {
		if (ds(s) !== i) return "document_mismatch";
		if (a.status !== "working" && a.status !== "waiting") return "invalid_state";
		if (e.pendingWrites.has(o) || ms(e, s)) return "write_pending";
		let t = e.documents.get(s), n = t?.revision ?? 0, c = t?.sha256 ?? null;
		return r.base_revision !== n || r.base_sha256 !== c || r.revision !== n + 1 ? "stale_revision" : (e.pendingWrites.set(o, {
			phase: i,
			documentPath: s,
			artifact: fs(r)
		}), null);
	}
	let c = e.pendingWrites.get(o);
	return c === void 0 ? "write_missing" : c.phase !== i || c.documentPath !== s ? "write_mismatch" : n === "spec_document_written" ? ps(fs(r), c.artifact) ? (e.pendingWrites.delete(o), e.documents.set(s, c.artifact), null) : "write_mismatch" : (n === "spec_write_recovered" && (e.pendingWrites.delete(o), r.outcome === "completed" && e.documents.set(s, c.artifact)), null);
}
var _s = /* @__PURE__ */ new Set([
	"risky_action_approved",
	"risky_action_rejected",
	"risky_action_superseded",
	"risky_action_consumed",
	"risky_action_denied",
	"risky_action_succeeded",
	"risky_action_failed"
]);
function vs(e) {
	try {
		return ei(H(e));
	} catch {
		return null;
	}
}
function ys(e) {
	let t = Ra(e.data.descriptor);
	return t === null || vs(e.data.descriptor) !== e.data.action_digest || t.mansionId !== e.mansionId || t.sessionSlot !== e.sessionSlot ? null : t;
}
function bs(e, t) {
	let { kind: n, data: r } = t;
	if (n === "risky_action_proposed") {
		let n = r.proposal_id;
		if (e.proposals.has(n)) return "duplicate_proposal";
		let i = ys(t);
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
	if (!_s.has(n) || n === "risky_action_denied") return null;
	let i = e.proposals.get(r.proposal_id);
	if (i === void 0) return "proposal_missing";
	if (r.action_digest !== i.actionDigest) return "digest_mismatch";
	if (n === "risky_action_approved" || n === "risky_action_rejected") {
		let a = n === "risky_action_approved", o = r.command_id;
		return i.status === "pending" ? e.commandIds.has(o) ? "duplicate_command" : a && i.descriptor === null ? "proposal_blocked" : (e.commandIds.add(o), i.status = a ? "approved" : "rejected", i.decision = hs(t, a ? "approved" : "rejected"), null) : "already_decided";
	}
	return n === "risky_action_superseded" ? i.status !== "pending" && i.status !== "approved" ? "not_supersedable" : (i.status = "superseded", null) : n === "risky_action_consumed" ? i.status === "approved" ? i.descriptor === null || r.session_slot !== i.sessionSlot || t.sessionSlot !== i.sessionSlot ? "identity_mismatch" : (i.status = "consumed", i.claimId = r.claim_id, null) : "not_approved" : i.status === "consumed" ? r.claim_id === i.claimId ? (i.status = n === "risky_action_succeeded" ? "succeeded" : "failed", null) : "claim_mismatch" : "not_consumed";
}
function xs(e, t) {
	let n = Array.from(e).filter((e) => e.scope.mansion_id === t.mansionId).sort((e, t) => e.sequence - t.sequence || (e.event_id < t.event_id ? -1 : +(e.event_id > t.event_id))), r = Object.fromEntries(G.map((e, t) => [e, {
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
		l = Math.max(l, e.sequence), e.scope.ghost_id !== jo && !s.has(e.scope.session_slot) && s.set(e.scope.session_slot, e.scope.ghost_id);
		let t = e.payload, n = cs(t) ? t.mid : void 0;
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
		let r = ls(e);
		if (r !== null) {
			if (typeof r == "string") c.push({
				sequence: e.sequence,
				eventId: e.event_id,
				kind: "invalid_payload",
				code: r
			});
			else for (let e of [gs(i, r), bs(a, r)]) e !== null && c.push({
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
	})), d = G.map((e) => {
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
var Ss = {
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
function Cs(e, t = {}) {
	return {
		code: e,
		...t.line === void 0 ? {} : { line: t.line },
		...t.recordId === void 0 ? {} : { recordId: t.recordId },
		safeDetail: Ss[e]
	};
}
function ws(e) {
	let t = { line: e.line };
	switch (e.code) {
		case "unsupported_schema": return Cs("unsupported_schema", t);
		case "duplicate_sequence":
		case "missing_sequence":
		case "hash_mismatch":
		case "hash_link_broken":
		case "mixed_integrity_mode": return Cs("integrity_failed", t);
		default: return Cs("invalid_record", t);
	}
}
function Ts(e, t) {
	let n = { recordId: t.get(e.event_id) };
	return e.code === "conflicting_variant" ? Cs("conflicting_variant", n) : Cs(e.kind === "forward" ? "causal_cycle" : "missing_predecessor", n);
}
function Es(e) {
	return new Map(e.map((e) => [e.event_id, e.record_id]));
}
function Ds(e, t = {}) {
	let n = _i(Array.from(e)), r = Es(n.events);
	return {
		records: n.events,
		diagnostics: [...t.diagnostics ?? [], ...n.diagnostics.map((e) => Ts(e, r))],
		integrityOk: t.integrityOk !== !1
	};
}
function Os(e) {
	let t = wo(e);
	return Ds(t.events, {
		diagnostics: t.diagnostics.map(ws),
		integrityOk: t.integrityOk
	});
}
function ks(e, t) {
	let n = Array.from(e), r = Array.from(t);
	for (let e = 0; e < Math.min(n.length, r.length); e += 1) {
		let t = n[e].codePointAt(0) - r[e].codePointAt(0);
		if (t !== 0) return t;
	}
	return n.length - r.length;
}
function As(e, t) {
	let n = t.integrityOk !== !1, r = e.events, i = Es(r), a = [], o = Array.from(new Set(r.map((e) => e.scope.mansion_id))).sort(ks).map((e) => {
		let t = xs(r, {
			mansionId: e,
			integrity: n ? "valid" : "corrupt",
			readOnly: !0
		});
		for (let e of t.diagnostics) a.push(Cs("invalid_transition", { recordId: i.get(e.eventId) }));
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
function js(e, t = {}) {
	return As(Oo(e), t);
}
function Ms(e, t = {}) {
	return As(ko(Do(Eo, e).log), t);
}
function Ns(e) {
	return (t) => js(t, { integrityOk: e.integrityOk });
}
function Ps(e, t) {
	return e.workflows.find((e) => e.mansionId === t) ?? null;
}
var Fs = {
	parse: Os,
	select: (e) => Ds(e),
	fold: js,
	foldLive: Ms
}, Is = "Recorded event", Ls = "Operator";
function Rs(e) {
	let t = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), n = Array.from(t);
	return n.length <= 160 ? t : `${n.slice(0, 159).join("")}…`;
}
function zs(e) {
	return typeof e == "object" && e && !Array.isArray(e) ? e : {};
}
function Bs(e, t, n) {
	let r = t[n];
	return typeof r == "string" && Object.hasOwn(e, r) ? e[r] : null;
}
var Vs = Object.fromEntries(Wa.map((e) => [e.id, e.name])), Hs = {
	approved: "approved",
	rejected: "rejected",
	denied: "rejected"
}, Us = {
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
}, Ws = {
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
function Gs(e) {
	let t = ls(e);
	if (t === null) return Us.domain_event_recorded;
	if (typeof t == "string") return "Workflow record refused";
	let n = Ws[t.kind], r = t.data.phase;
	return typeof r == "string" && G.includes(r) ? `${n}: ${q[r]}` : n;
}
function Ks(e) {
	let t = Object.hasOwn(Us, e.event_type) ? Us[e.event_type] : void 0;
	if (t === void 0) return Is;
	let n = zs(e.payload);
	switch (e.event_type) {
		case "run_started": {
			let e = Bs(Vs, n, "room");
			return e === null ? t : `${t} in the ${e}`;
		}
		case "run_blocked":
		case "run_failed": {
			let e = Bs(Vi, n, "reason");
			return e === null ? t : `${t}: ${e}`;
		}
		case "tool_started": return n.is_shell === !0 ? "Shell tool call started" : t;
		case "approval_decided": {
			let e = Bs(Hs, n, "outcome");
			return e === null ? t : `${t}: ${e}`;
		}
		case "crew_turn_ended": return n.needs_input === !0 ? `${t}: needs input` : t;
		case "domain_event_recorded": return Gs(e);
		default: return t;
	}
}
function qs(e) {
	let t = e.scope.ghost_id;
	return t === "house-operator" ? Ls : Rs(Gi(t));
}
function Js(e, t) {
	return {
		recordId: e.record_id,
		eventId: e.event_id,
		eventType: Object.hasOwn(Us, e.event_type) ? e.event_type : "unknown",
		actorLabel: qs(e),
		summary: Rs(Ks(e)),
		presentationOffsetMs: t
	};
}
var Ys = 4e3, Xs = 1e3;
function Zs(e, t) {
	let n = e.occurred_at_ms, r = t.occurred_at_ms, i = Number.isSafeInteger(n) && Number.isSafeInteger(r) ? r - n : 0;
	return Math.min(Math.max(i > 0 ? i : Xs, 250), Ys);
}
function Qs(e) {
	let t = [], n = 0;
	return e.forEach((r, i) => {
		i > 0 && (n += Zs(e[i - 1], r)), t.push(n);
	}), t;
}
function $s(e) {
	let t = Qs(e.records);
	return {
		records: e.records,
		timeline: e.records.map((e, n) => Js(e, t[n])),
		diagnostics: e.diagnostics,
		integrityOk: e.integrityOk
	};
}
function ec(e) {
	return {
		records: [],
		timeline: [],
		diagnostics: [Cs(e)],
		integrityOk: !0
	};
}
// src/core/seance-api.ts
var tc = "/apps/haunted-house/api/mansions";
function nc(e) {
	return `${tc}/${encodeURIComponent(e)}/seance/ingest`;
}
function rc(e, t, n = 500) {
	return `${tc}/${encodeURIComponent(e)}/seance/events?after_sequence=${t}&limit=${n}`;
}
function ic(e) {
	return `${tc}/${encodeURIComponent(e)}/seance/reconcile`;
}
var ac = new Set(Er), oc = 160, sc = 20;
function cc(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function lc(e) {
	return {
		ok: !1,
		diagnostic: {
			code: "persistence_failed",
			safe_detail: e
		}
	};
}
function uc(e) {
	if (!cc(e)) return null;
	let t = typeof e.code == "string" && ac.has(e.code) ? e.code : "persistence_failed", n = typeof e.safe_detail == "string" ? e.safe_detail : e.reason, r = typeof n == "string" ? n.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, oc) : "", i = typeof e.line == "number" && Number.isSafeInteger(e.line) && e.line > 0 ? e.line : null;
	return i === null ? {
		code: t,
		safe_detail: r
	} : {
		code: t,
		safe_detail: r,
		line: i
	};
}
function dc(e) {
	if (!cc(e)) return lc("The backend sent an unexpected response.");
	if (!Array.isArray(e.events)) return lc("The backend response has no event list.");
	let t = e.highest_sequence;
	if (typeof t != "number" || !Number.isSafeInteger(t) || t < 0) return lc("The backend response has no valid highest Sequence.");
	let n = [];
	if (Array.isArray(e.diagnostics)) for (let t of e.diagnostics.slice(0, sc)) {
		let e = uc(t);
		e !== null && n.push(e);
	}
	let r = [];
	for (let t of e.events) {
		let e = fi(t);
		e.ok ? r.push(e.value) : n.length < sc && n.push(e.diagnostic);
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
function fc(e) {
	if (typeof e != "object" || !e) return null;
	let t = e.status;
	return typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599 ? t : null;
}
var pc = 4096;
function mc(e) {
	if (typeof e != "object" || !e) return null;
	let t = e.body;
	if (typeof t != "string" || t.length > pc) return null;
	try {
		let e = JSON.parse(t);
		if (!cc(e) || !cc(e.error)) return null;
		let n = e.error.code;
		return typeof n == "string" && /^[a-z_]{1,64}$/.test(n) ? n : null;
	} catch {
		return null;
	}
}
function hc(e, t) {
	if (typeof e != "object" || !e) return null;
	let n = e.body;
	if (typeof n != "string" || n.length > 65536) return null;
	let r;
	try {
		r = JSON.parse(n);
	} catch {
		return null;
	}
	if (!cc(r) || !Array.isArray(r.diagnostics)) return null;
	let i = /* @__PURE__ */ new Map();
	for (let e of r.diagnostics) {
		if (!cc(e)) return null;
		let { index: n, code: r } = e;
		if (typeof n != "number" || !Number.isInteger(n) || n < 0 || n >= t || typeof r != "string" || !/^[a-z_]{1,64}$/.test(r)) return null;
		i.has(n) || i.set(n, r);
	}
	return i.size === 0 ? null : Array.from(i, ([e, t]) => ({
		index: e,
		code: t
	})).sort((e, t) => e.index - t.index);
}
function gc(e) {
	return e !== null && e >= 400 && e < 500 && e !== 408 && e !== 429;
}
// src/adapters/attic-log-source.ts
var _c = {
	status: "loading",
	selection: null,
	safeMessage: null
}, vc = {
	status: "error",
	selection: null,
	safeMessage: Ss.fixture_unavailable
}, yc = {
	records: [],
	diagnostics: [],
	integrityOk: !0
};
function bc(e) {
	return {
		status: "ready",
		selection: e,
		safeMessage: null
	};
}
function xc(e, t) {
	return {
		...e,
		records: e.records.filter((e) => e.scope.mansion_id === t)
	};
}
async function Sc(e, t) {
	let n;
	try {
		n = await e.load();
	} catch {
		return vc;
	}
	return typeof n == "string" ? bc(xc(Fs.parse(n), t)) : vc;
}
async function Cc(e, t) {
	let n = [], r = [], i = /* @__PURE__ */ new Set(), a = 0;
	try {
		for (let o = 0; o < 200; o += 1) {
			let o = dc(await e.get(rc(t, a, 500)));
			if (!o.ok) return vc;
			for (let e of o.page.diagnostics) {
				let t = ws(e), n = `${t.code}:${t.line ?? ""}`;
				i.has(n) || r.length >= 50 || (i.add(n), r.push(t));
			}
			let s = a;
			for (let e of o.page.events) e.scope.mansion_id === t && n.push(e), s = Math.max(s, e.sequence);
			if (s === a || s >= o.page.highestSequence) break;
			a = s;
		}
	} catch (e) {
		return fc(e) === 404 && mc(e) === "log_not_found" ? bc(yc) : vc;
	}
	return bc(Ds(n, {
		diagnostics: r,
		integrityOk: !r.some((e) => e.code === "integrity_failed")
	}));
}
function wc(e) {
	let t = pe(), n = P(t);
	n.current = t;
	let [r, i] = F(0), [a, o] = F(_c);
	j(() => {
		let t = !1;
		return o(_c), (wt === null ? Cc({ get: (e) => n.current.get(e) }, e) : Sc(wt, e)).then((e) => {
			t || o(e);
		}), () => {
			t = !0;
		};
	}, [e, r]);
	let s = A(() => i((e) => e + 1), []);
	return {
		result: a,
		mode: wt === null ? "live" : "replay",
		reload: s
	};
}
// src/core/replay-reducer.ts
var Tc = [
	.5,
	1,
	2
], Ec = {
	invalid_cursor: "That position is not an event of this replay.",
	invalid_speed: "Playback speed must be 0.5×, 1× or 2×.",
	invalid_command: "That replay command is not supported.",
	contract_unavailable: "The replay could not show that position. The last valid state is kept."
};
function Dc(e) {
	return Tc.includes(e);
}
function Oc(e, t) {
	return typeof t == "number" && Number.isInteger(t) && t >= 0 && t <= e.records.length;
}
function kc(e) {
	return {
		code: e,
		safeDetail: Ec[e]
	};
}
function Ac(e, t) {
	return {
		status: "paused",
		cursor: 0,
		speed: 1,
		generation: 0,
		projection: t(e.records.slice(0, 0)),
		commandError: null
	};
}
function jc(e, t) {
	return e.commandError?.code === t ? e : {
		...e,
		commandError: kc(t)
	};
}
function Mc(e) {
	return e.commandError === null ? e : {
		...e,
		commandError: null
	};
}
function Nc(e, t, n, r, i) {
	let a;
	try {
		a = i(e.records.slice(0, n));
	} catch {
		return {
			...t,
			status: t.status === "playing" ? "paused" : t.status,
			generation: t.generation + 1,
			commandError: kc("contract_unavailable")
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
function Pc(e, t, n, r) {
	let i = e.records.length;
	switch (n.kind) {
		case "play":
		case "resume": return t.status === "playing" ? Mc(t) : i === 0 ? t.status === "complete" ? Mc(t) : {
			...t,
			status: "complete",
			commandError: null
		} : t.cursor >= i ? Nc(e, t, 0, "playing", r) : {
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
		} : Mc(t);
		case "restart": return t.status === "paused" && t.cursor === 0 ? Mc(t) : Nc(e, t, 0, "paused", r);
		case "set_speed": return Dc(n.speed) ? n.speed === t.speed ? Mc(t) : {
			...t,
			speed: n.speed,
			generation: t.status === "playing" ? t.generation + 1 : t.generation,
			commandError: null
		} : jc(t, "invalid_speed");
		case "seek": {
			if (!Oc(e, n.cursor)) return jc(t, "invalid_cursor");
			let a = n.cursor === i ? "complete" : t.status === "playing" ? "playing" : "paused";
			return Nc(e, t, n.cursor, a, r);
		}
		case "step": {
			if (t.status !== "playing" || n.generation !== t.generation || t.cursor >= i) return t;
			let a = t.cursor + 1;
			return Nc(e, t, a, a === i ? "complete" : "playing", r);
		}
		default: return jc(t, "invalid_command");
	}
}
function Fc(e, t) {
	if (t.status !== "playing" || t.cursor >= e.timeline.length) return null;
	let n = e.timeline[t.cursor].presentationOffsetMs, r = t.cursor === 0 ? 0 : e.timeline[t.cursor - 1].presentationOffsetMs;
	return Math.max(n - r, 0) / t.speed;
}
function Ic(e, t) {
	return t <= 0 ? "Start of replay" : `Event ${t} of ${e.records.length}`;
}
// src/adapters/replay-controller.ts
var Lc = { schedule(e, t, n) {
	let r = setTimeout(n, e);
	return () => clearTimeout(r);
} };
function Rc(e, t) {
	return e.records.length <= t.records.length && e.records.every((e, n) => e.record_id === t.records[n].record_id);
}
function zc(e, t, n) {
	let r = e.state.generation + 1, i = Ac(t, n);
	if (e.state.cursor === 0 || !Rc(e.model, t)) return {
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
function Bc(e, t, n = Lc) {
	let [r, i] = F(() => ({
		model: e,
		fold: t,
		state: Ac(e, t)
	})), a = r;
	(r.model !== e || r.fold !== t) && (a = {
		model: e,
		fold: t,
		state: zc(r, e, t)
	}, i(a));
	let o = A((e) => {
		i((t) => {
			let n = Pc(t.model, t.state, e, t.fold);
			return n === t.state ? t : {
				...t,
				state: n
			};
		});
	}, []), s = P(n);
	s.current = n;
	let { state: c } = a, l = a.model;
	return j(() => {
		let e = Fc(l, c);
		if (e === null) return;
		let t = c.generation;
		return s.current.schedule(e, t, () => o({
			kind: "step",
			generation: t
		}));
	}, [
		l,
		c.generation,
		c.status,
		o
	]), {
		model: a.model,
		state: c,
		command: o
	};
}
// src/adapters/attic-replay.ts
var Vc = {
	records: [],
	timeline: [],
	diagnostics: [],
	integrityOk: !0
}, Hc = ec("fixture_unavailable");
function Uc(e, t) {
	return e.integrityOk === t.integrityOk && e.records.length === t.records.length && e.records.every((e, n) => e.record_id === t.records[n].record_id) && e.diagnostics.length === t.diagnostics.length && e.diagnostics.every((e, n) => {
		let r = t.diagnostics[n];
		return e.code === r.code && e.line === r.line && e.recordId === r.recordId;
	});
}
function Wc(e, t, n) {
	return {
		workflow: Ps(t, n) ?? xs([], {
			mansionId: n,
			integrity: t.integrity === "incompatible" ? "corrupt" : "valid",
			readOnly: !0
		}).projection,
		snapshots: new Map(t.ghosts.filter((e) => e.mansion_id === n).map((e) => [e.ghost_id, e])),
		transitions: t.transitions,
		highestSequence: t.validRecordCount === 0 ? 0 : e.records[t.validRecordCount - 1]?.sequence ?? 0
	};
}
function Gc(e, t) {
	let n = [...e.diagnostics, ...t.diagnostics];
	return {
		integrity: t.integrity === "incompatible" || !e.integrityOk ? "incompatible" : n.length > 0 ? "diagnostic" : "valid",
		validRecordCount: e.records.length,
		diagnostics: n
	};
}
function Kc(e, t) {
	let n = wc(e), { result: r } = n, i = P(null), a = N(() => {
		if (r.status === "ready" && r.selection !== null) {
			let t = $s(r.selection), n = i.current;
			return n !== null && n.mansionId === e && Uc(n.model, t) ? n.model : (i.current = {
				mansionId: e,
				model: t
			}, t);
		}
		return r.status === "error" ? (i.current = null, Hc) : i.current?.mansionId === e ? i.current.model : Vc;
	}, [r, e]), o = Bc(a, N(() => Ns(a), [a]), t), { state: s } = o;
	j(() => {
		wt?.present(e, s.cursor);
	}, [e, s.cursor]);
	let c = n.mode, l = N(() => Gc(o.model, s.projection), [o.model, s.projection]), u = N(() => c === "replay" ? Wc(o.model, s.projection, e) : null, [
		c,
		o.model,
		s.projection,
		e
	]);
	return N(() => ({
		mansionId: e,
		mode: c,
		readOnly: c === "replay",
		source: r.status,
		model: o.model,
		state: s,
		command: o.command,
		refresh: n.reload,
		upstream: l,
		house: u
	}), [
		e,
		c,
		r.status,
		o.model,
		s,
		o.command,
		n.reload,
		l,
		u
	]);
}
// src/core/house-projection.ts
var qc = [
	"valid",
	"uncertain",
	"incompatible",
	"corrupt"
];
function Jc(e, t) {
	let n = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
var Yc = {
	uncertain: "This room's state is not confirmed. Its controls are off until the house catches up.",
	incompatible: "The house sent a state for this room that this page cannot read. Its controls are off.",
	corrupt: "This room's record failed its integrity check. Its controls are off until it is repaired."
}, Xc = "This is a recording. Nothing can be started, approved, rejected or opened in Crew here.", Zc = "The Séance Room is locked. Review is a later chapter of this house, so nothing can be started or changed here.", Qc = "This mansion's folder could not be confirmed. Return to the Foyer and open it again.", $c = {
	diagnostic: "Part of the séance log was left out. The Attic shows the records that could be read.",
	incompatible: "The séance log failed its integrity check. The Attic shows only the records before the failure."
}, el = "Door state unavailable", tl = "The state of this door could not be read. Nothing can be decided until it can.";
function nl(e, t) {
	return qc.indexOf(e) >= qc.indexOf(t) ? e : t;
}
var rl = {
	read_only: "valid",
	loading: "uncertain",
	unavailable: "uncertain",
	uncertain: "uncertain",
	catching_up: "uncertain",
	stale: "uncertain",
	malformed: "incompatible",
	integrity: "corrupt"
};
function il(e, t) {
	switch (e.block) {
		case null:
		case "read_only":
		case "authority": return "valid";
		case "malformed": return "incompatible";
		case "integrity": return t.integrity === "corrupt" ? "corrupt" : "uncertain";
		default: return "uncertain";
	}
}
function al(e) {
	return typeof e == "string" && ca.includes(e);
}
function ol(e) {
	return typeof e == "string" && sa.includes(e);
}
function sl(e) {
	return typeof e == "string" && hi.includes(e);
}
function cl(e, t) {
	let n = Ya(e, t);
	if (n !== null) return n;
	for (let t of Qi) if (t.ghostRoles.some((t) => e === t || e.startsWith(`${t}-`))) return t.id;
	return null;
}
var ll = [
	"failed",
	"blocked",
	"waiting",
	"working",
	"done",
	"idle"
];
function ul(e) {
	return e.length === 0 ? "not_applicable" : e.find((e) => e.state === "unavailable") === void 0 ? (e.find((e) => e.state !== "open") ?? e[e.length - 1]).state : "unavailable";
}
function dl(e) {
	return e.length === 0 ? "not_applicable" : e.some((e) => e.state === "unavailable") ? "unavailable" : ll.find((t) => e.some((e) => e.state === t)) ?? "not_applicable";
}
function fl(e, t) {
	let n = !1, r = t.workflow, i = e.workflowPhases.map((e) => {
		let t = r?.phases[G.indexOf(e)], i = t?.door?.status;
		if (t === void 0 || !al(i)) return r !== null && (n = !0), {
			phase: e,
			phaseName: q[e],
			state: "unavailable",
			text: el,
			hint: tl,
			proposalId: null,
			phaseStatus: null,
			phaseText: null
		};
		let a = t.door.proposal;
		return {
			phase: e,
			phaseName: q[e],
			state: i,
			text: Ka[i],
			hint: Za(e, i),
			proposalId: i === "waiting" && a !== null && a.status === "pending" ? a.proposalId : null,
			phaseStatus: ol(t.status) ? t.status : null,
			phaseText: ol(t.status) ? `${q[e]}: ${Ga[t.status]}` : null
		};
	}), a = [];
	for (let n of t.ghosts.values()) n.ghost_id !== "house-operator" && n.mansion_id === t.mansion.name && cl(n.ghost_id, r) === e.id && a.push(n);
	let o = a.filter((e) => sl(e.state)), s = new Map(Ji(o, t.ghostNames).map((e) => [e.ghostId, e]));
	return {
		doors: i,
		ghosts: a.map((e) => {
			let t = s.get(e.ghost_id);
			return t === void 0 ? (n = !0, {
				ghostId: e.ghost_id,
				name: Jc(e.ghost_id, 60),
				state: "unavailable",
				reason: null,
				pendingText: null
			}) : {
				ghostId: t.ghostId,
				name: Jc(t.name, 60) || "Ghost",
				state: t.state,
				reason: t.reason,
				pendingText: t.pendingText
			};
		}),
		malformed: n
	};
}
var pl = {
	door: "door-decision",
	risky: "risky-decision",
	permission: "tool-decision"
};
function ml(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of _o(e.workflow, e.ghostNames)) {
		let e = n.room ?? "foyer", r = t.get(e) ?? [];
		r.push({
			kind: pl[n.kind],
			id: n.id,
			ghostId: n.ghostId,
			label: Jc(n.text, 160),
			status: "pending",
			actionAvailable: !0
		}), t.set(e, r);
	}
	return t;
}
function hl(e) {
	return e === void 0 ? [] : e.runs.filter((e) => e.state === "failed").map((e) => ({
		runId: e.runId,
		ghostId: e.ghostId,
		label: Jc(`${Jc(e.ghostName, 60) || "A ghost"} failed. A fresh attempt can be started.`, 160),
		available: e.retry !== null
	}));
}
function gl(e) {
	return e === "valid" ? "valid" : e === "incompatible" ? "incompatible" : "uncertain";
}
function _l(e, t, n, r) {
	let i = fl(e, t), a = t.rooms.get(e.id), o = n.mode === "replay" || t.authority.block === "read_only", s = e.id === "seance-room" && n.seanceRoom !== "enabled", c = e.workflowPhases.length > 0 || e.id === "seance-room" && !s, l = "valid", u = null;
	e.id === "foyer" ? t.mansion.status !== "ready" && (l = "uncertain", u = Qc) : e.id === "attic" ? (l = gl(t.replay.integrity), t.replay.integrity !== "valid" && (u = $c[t.replay.integrity])) : c && (t.authority.block !== null && (l = rl[t.authority.block]), l = nl(l, t.workflow === null ? "uncertain" : t.workflow.integrity), a !== void 0 && (l = nl(l, il(a.gate, a)), l = nl(l, a.integrity)), l !== "valid" && (u = t.authority.block !== null && t.authority.block !== "read_only" ? t.authority.text : a !== void 0 && a.gate.block !== null && a.gate.block !== "read_only" && a.gate.block !== "authority" ? a.gate.text : null)), i.malformed && (l = nl(l, "incompatible"), u = Yc.incompatible);
	let d = e.id !== "attic" && !s, f = !c || t.authority.canDecide && (a === void 0 || a.gate.allowed), p = d && !o && l === "valid" && f, m = l === "valid" ? s ? Zc : o ? Xc : p || !d ? null : t.authority.text ?? a?.gate.text ?? Yc.uncertain : u ?? Yc[l];
	return {
		roomId: e.id,
		name: e.name,
		phase: e.phase,
		door: ul(i.doors),
		ghost: dl(i.ghosts),
		doors: i.doors,
		ghosts: i.ghosts,
		integrity: l,
		mutatingActionsEnabled: p,
		readOnly: o,
		locked: s,
		diagnostic: m === null ? null : Jc(m, 240) || Yc.uncertain,
		waitingItems: s ? [] : r.get(e.id) ?? [],
		recoveryActions: s ? [] : hl(a)
	};
}
function vl(e, t) {
	let n = ml(e), r = ia(t.seanceRoom).map((r) => _l(r, e, t, n)), i = e.replay.diagnostics[0];
	return {
		mansionName: Jc(e.mansion.name, 60),
		mode: t.mode,
		rooms: r,
		needsYou: bl(r),
		replay: {
			integrity: e.replay.integrity,
			validRecordCount: Math.max(0, Math.trunc(e.replay.validRecordCount) || 0),
			diagnostic: i === void 0 ? e.replay.integrity === "valid" ? null : $c[e.replay.integrity] : Jc(i.safeDetail, 240)
		}
	};
}
function yl(e) {
	return JSON.stringify([e.kind, e.id]);
}
function bl(e) {
	let t = e.filter((e) => ea(e.roomId)).map((e, t) => ({
		room: e,
		index: t
	})).sort((e, t) => ra(e.room.roomId, t.room.roomId) || e.index - t.index), n = /* @__PURE__ */ new Set(), r = [], i = (e) => {
		let t = yl(e);
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
function xl(e) {
	return e[0]?.roomId ?? null;
}
function Sl(e) {
	return vo(e.length);
}
function Cl(e) {
	return [
		{
			label: "Phase",
			value: Zi[e.phase]
		},
		{
			label: "Door",
			value: oa(e.door)
		},
		{
			label: "Ghost",
			value: oa(e.ghost)
		}
	];
}
function wl(e) {
	return `${Jc(e.name, 60).replace(/[.:]+$/u, "") || ta(e.roomId).name}. ${Cl(e).map((e) => `${e.label}: ${e.value}.`).join(" ")}`;
}
function Tl(e, t) {
	return `${t.name}, ghost in the ${e.name}. State: ${oa(t.state)}.`;
}
function El(e, t) {
	return `${t.phaseName} door of the ${e.name}. State: ${oa(t.state)}.`;
}
function Dl(e) {
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
function Ol(e, t) {
	if (e === null) return null;
	let n = t.rooms.find((t) => t.roomId === e.target.roomId);
	if (n === void 0) return null;
	let r = e.target;
	return r.kind === "ghost" && !n.ghosts.some((e) => e.ghostId === r.ghostId) || r.kind === "door" && !n.doors.some((e) => e.phase === r.phase) ? null : e;
}
var kl = [
	"requirements",
	"design",
	"tasks"
], Al = [
	"queued",
	"active",
	"complete",
	"failed",
	"cancelled",
	"blocked",
	"skipped"
], jl = [
	"crew_capacity",
	"local_capacity",
	"claim_busy"
], Ml = [
	"reviewing",
	"pass",
	"changes_requested",
	"blocked"
], Nl = [
	"proposed",
	"approved",
	"rejected"
], Pl = 1e3, Fl = 1024, Il = class extends Error {
	path;
	constructor(e) {
		super("refused"), this.path = e;
	}
};
function Y(e) {
	throw new Il(e);
}
function Ll(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Rl(e, t, n, r = []) {
	Ll(e) || Y(t);
	for (let i of Object.keys(e)) !n.includes(i) && !r.includes(i) && Y(t);
	for (let r of n) Object.hasOwn(e, r) || Y(`${t}.${r}`);
	return e;
}
function zl(e, t, n) {
	return typeof e == "string" && t.includes(e) || Y(n), e;
}
function Bl(e, t, n = 0, r = 2 ** 53 - 1) {
	return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && Y(t), e;
}
function Vl(e, t) {
	return typeof e != "boolean" && Y(t), e;
}
function Hl(e, t, n) {
	return (!Array.isArray(e) || e.length > n) && Y(t), e;
}
var Ul = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/, Wl = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
function Gl(e, t, n = 160) {
	return (typeof e != "string" || e.length === 0 || e.length > n || Ul.test(e)) && Y(t), e;
}
function Kl(e, t) {
	return e === null ? null : t(e);
}
var ql = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
function Jl(e, t) {
	return typeof e == "string" && ql.test(e) || Y(t), e;
}
var Yl = /^[a-z][a-z0-9_]{0,63}$/;
function Xl(e, t) {
	return typeof e == "string" && Yl.test(e) || Y(t), e;
}
var Zl = /^[1-9][0-9]{0,3}\.[1-9][0-9]{0,3}$/;
function Ql(e, t) {
	return typeof e == "string" && Zl.test(e) || Y(t), e;
}
var $l = /^[A-Za-z0-9-]{1,160}$/;
function eu(e, t) {
	let n = Gl(e, t, Fl);
	(n.startsWith("/") || n.includes("\\") || n.startsWith("~")) && Y(t);
	for (let e of n.split("/")) (e === "" || e === "." || e === "..") && Y(t);
	return n;
}
function tu(e, t) {
	new Set(e).size !== e.length && Y(t);
}
function nu(e, t) {
	let n = Hl(e, t, 32).map((e, n) => eu(e, `${t}[${n}]`));
	return tu(n, t), n;
}
function ru(e, t, n) {
	return (typeof e != "string" || e.trim() === "" || e.length > n || Wl.test(e)) && Y(t), e;
}
function iu(e, t) {
	let n = Rl(e, t, [
		"revision",
		"sha256",
		"size_bytes"
	]);
	return typeof n.sha256 == "string" && /^[0-9a-f]{64}$/.test(n.sha256) || Y(`${t}.sha256`), {
		revision: Bl(n.revision, `${t}.revision`, 1),
		sha256: n.sha256,
		sizeBytes: Bl(n.size_bytes, `${t}.size_bytes`)
	};
}
function au(e, t) {
	return Hl(e, t, 50).map((e, n) => {
		let r = `${t}[${n}]`, i = Rl(e, r, [
			"code",
			"location",
			"message"
		]);
		return {
			code: Xl(i.code, `${r}.code`),
			location: Gl(i.location, `${r}.location`, 96),
			message: Gl(i.message, `${r}.message`, 200)
		};
	});
}
function ou(e, t) {
	let n = Rl(e, t, [
		"artifact_revision",
		"validated",
		"content",
		"findings"
	]), r = n.content;
	return r !== null && (typeof r != "string" || r.length > 524288) && Y(`${t}.content`), {
		artifactRevision: iu(n.artifact_revision, `${t}.artifact_revision`),
		validated: Vl(n.validated, `${t}.validated`),
		content: r,
		findings: au(n.findings, `${t}.findings`)
	};
}
function su(e, t, n, r) {
	let i = Rl(e, t, [
		"phase",
		"document_path",
		"write_scope",
		"artifact"
	]);
	i.phase !== n && Y(`${t}.phase`);
	let a = eu(i.document_path, `${t}.document_path`);
	return a !== `.kiro/specs/${r}/${n}.md` && Y(`${t}.document_path`), {
		phase: n,
		documentPath: a,
		writeScope: nu(i.write_scope, `${t}.write_scope`),
		artifact: Kl(i.artifact, (e) => ou(e, `${t}.artifact`))
	};
}
function cu(e, t) {
	let n = Rl(e, t, [
		"status",
		"attempt",
		"run_id",
		"reason_code"
	]);
	return {
		status: zl(n.status, Al, `${t}.status`),
		attempt: Bl(n.attempt, `${t}.attempt`, 0, 3),
		runId: Kl(n.run_id, (e) => Jl(e, `${t}.run_id`)),
		reasonCode: Kl(n.reason_code, (e) => Xl(e, `${t}.reason_code`))
	};
}
function lu(e, t) {
	let n = Rl(e, t, [
		"dispatch_failures",
		"next_delay_seconds",
		"last_reason"
	]);
	return {
		dispatchFailures: Bl(n.dispatch_failures, `${t}.dispatch_failures`, 0, 1e6),
		nextDelaySeconds: Bl(n.next_delay_seconds, `${t}.next_delay_seconds`, 0, 15),
		lastReason: zl(n.last_reason, jl, `${t}.last_reason`)
	};
}
function uu(e, t) {
	let n = Rl(e, t, [
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
	]), r = Hl(n.requirements, `${t}.requirements`, 64).map((e, n) => Ql(e, `${t}.requirements[${n}]`));
	tu(r, `${t}.requirements`);
	let i = Vl(n.complete, `${t}.complete`), a = Kl(n.outcome, (e) => cu(e, `${t}.outcome`));
	return a?.status === "complete" && !i && Y(`${t}.outcome`), i && a !== null && a.status !== "complete" && Y(`${t}.outcome`), {
		taskId: Ql(n.task_id, `${t}.task_id`),
		title: Gl(n.title, `${t}.title`, 200),
		optional: Vl(n.optional, `${t}.optional`),
		complete: i,
		requirements: r,
		writes: nu(n.writes, `${t}.writes`),
		wave: Kl(n.wave, (e) => Bl(e, `${t}.wave`, 0, 200)),
		selected: Vl(n.selected, `${t}.selected`),
		outcome: a,
		backpressure: Kl(n.backpressure, (e) => lu(e, `${t}.backpressure`))
	};
}
function du(e, t) {
	let n = Rl(e, t, [
		"tasks",
		"waves",
		"findings"
	]), r = Hl(n.tasks, `${t}.tasks`, 200).map((e, n) => uu(e, `${t}.tasks[${n}]`));
	tu(r.map((e) => e.taskId), `${t}.tasks`);
	let i = new Map(r.map((e) => [e.taskId, e])), a = Hl(n.waves, `${t}.waves`, 200).map((e, n) => Hl(e, `${t}.waves[${n}]`, 200).map((e, r) => {
		let a = `${t}.waves[${n}][${r}]`, o = Ql(e, a);
		return i.get(o)?.wave !== n && Y(a), o;
	}));
	tu(a.flat(), `${t}.waves`);
	let o = new Set(a.flat());
	for (let [e, n] of r.entries()) n.wave !== null && !o.has(n.taskId) && Y(`${t}.tasks[${e}].wave`);
	return r.filter((e) => e.outcome?.status === "active").length > 3 && Y(`${t}.tasks`), {
		tasks: r,
		waves: a,
		findings: au(n.findings, `${t}.findings`)
	};
}
function fu(e, t) {
	let n = Rl(e, t, [
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
	]), r = zl(n.phase, G, `${t}.phase`), i = Kl(n.task_id, (e) => Ql(e, `${t}.task_id`));
	i !== null != (r === "implementation") && Y(`${t}.task_id`);
	let a = Bl(n.attempt, `${t}.attempt`, 1, 3), o = Vl(n.can_cancel, `${t}.can_cancel`), s = Vl(n.can_retry, `${t}.can_retry`);
	o && s && Y(`${t}.can_retry`), s && a >= 3 && Y(`${t}.can_retry`);
	let c = Gl(n.session_slot, `${t}.session_slot`), l = n.session_link;
	l === null || typeof l == "string" && $l.test(l) || Y(`${t}.session_link`);
	let u = nu(n.claim_paths, `${t}.claim_paths`);
	return u.length > 0 && i === null && Y(`${t}.claim_paths`), {
		runId: Jl(n.run_id, `${t}.run_id`),
		runSequence: Bl(n.run_sequence, `${t}.run_sequence`, 0, 1e6),
		ghostId: Gl(n.ghost_id, `${t}.ghost_id`),
		sessionSlot: c,
		phase: r,
		taskId: i,
		attempt: a,
		canCancel: o,
		cancelRequested: Vl(n.cancel_requested, `${t}.cancel_requested`),
		canRetry: s,
		sessionLink: l,
		summary: Kl(n.summary, (e) => ru(e, `${t}.summary`, Pl)),
		reasonCode: Kl(n.reason_code, (e) => Xl(e, `${t}.reason_code`)),
		claimPaths: u
	};
}
function pu(e, t) {
	let n = Rl(e, t, [
		"cycle",
		"status",
		"ghost_id",
		"session_link",
		"findings",
		"repairs"
	]), r = n.session_link;
	r === null || typeof r == "string" && $l.test(r) || Y(`${t}.session_link`);
	let i = Hl(n.findings, `${t}.findings`, 50).map((e, n) => {
		let r = `${t}.findings[${n}]`, i = Rl(e, r, [
			"finding_id",
			"requirement_ids",
			"paths",
			"summary"
		]), a = Hl(i.requirement_ids, `${r}.requirement_ids`, 64).map((e, t) => Ql(e, `${r}.requirement_ids[${t}]`));
		return tu(a, `${r}.requirement_ids`), {
			findingId: Jl(i.finding_id, `${r}.finding_id`),
			requirementIds: a,
			paths: nu(i.paths, `${r}.paths`),
			summary: ru(i.summary, `${r}.summary`, Pl)
		};
	});
	tu(i.map((e) => e.findingId), `${t}.findings`);
	let a = Hl(n.repairs, `${t}.repairs`, 50).map((e, n) => {
		let r = `${t}.repairs[${n}]`, a = Rl(e, r, [
			"task_id",
			"finding_id",
			"title",
			"writes",
			"status"
		]), o = Jl(a.finding_id, `${r}.finding_id`);
		return i.some((e) => e.findingId === o) || Y(`${r}.finding_id`), {
			taskId: Ql(a.task_id, `${r}.task_id`),
			findingId: o,
			title: Gl(a.title, `${r}.title`, 200),
			writes: nu(a.writes, `${r}.writes`),
			status: zl(a.status, Nl, `${r}.status`)
		};
	});
	tu(a.map((e) => e.findingId), `${t}.repairs`), tu(a.map((e) => e.taskId), `${t}.repairs`);
	let o = zl(n.status, Ml, `${t}.status`);
	return o === "pass" && (i.length > 0 || a.length > 0) && Y(`${t}.findings`), {
		cycle: Bl(n.cycle, `${t}.cycle`, 1, 3),
		status: o,
		ghostId: Gl(n.ghost_id, `${t}.ghost_id`),
		sessionLink: r,
		findings: i,
		repairs: a
	};
}
var mu = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function hu(e, t, n) {
	try {
		let r = Rl(e, "$", [
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
		r.schema_version !== 1 && Y("$.schema_version"), r.read_only !== void 0 && typeof r.read_only != "boolean" && Y("$.read_only");
		let i = r.mansion_id;
		(typeof i != "string" || i.length > 40 || !Dr.test(i)) && Y("$.mansion_id"), t !== void 0 && i !== t && Y("$.mansion_id");
		let a = r.spec_name;
		(typeof a != "string" || a.length > 40 || !mu.test(a)) && Y("$.spec_name"), n !== void 0 && a !== n && Y("$.spec_name"), Array.isArray(r.documents) && r.documents.length === kl.length || Y("$.documents");
		let o = kl.map((e, t) => su(r.documents[t], `$.documents[${t}]`, e, a)), s = Hl(r.runs, "$.runs", 64).map((e, t) => fu(e, `$.runs[${t}]`));
		tu(s.map((e) => e.runId), "$.runs");
		let c = Vl(r.seance_enabled, "$.seance_enabled"), l = Kl(r.review, (e) => pu(e, "$.review"));
		return l !== null && !c && Y("$.review"), {
			ok: !0,
			roomGhosts: {
				mansionId: i,
				specName: a,
				version: Bl(r.version, "$.version"),
				integrity: zl(r.integrity, da, "$.integrity"),
				readOnly: r.read_only === !0,
				seanceEnabled: c,
				documents: o,
				taskPlan: Kl(r.task_plan, (e) => du(e, "$.task_plan")),
				runs: s,
				review: l
			}
		};
	} catch (e) {
		if (e instanceof Il) return {
			ok: !1,
			path: e.path
		};
		throw e;
	}
}
// src/core/room-view.ts
var gu = 4e3;
function _u(e) {
	switch (e.kind) {
		case "send_feedback": return `feedback:${e.phase}`;
		case "start_workshop": return "workshop";
		case "cancel_run":
		case "retry_run": return `run:${e.runId}`;
	}
}
var vu = {
	loading: "Loading this room's output. Its controls are off until it arrives.",
	unavailable: "This room's output could not be read. Its controls are off; Door and approval decisions are unaffected.",
	malformed: "The house sent room output this page cannot read. This room's controls are off.",
	read_only: "This is a recording. Nothing can be sent, cancelled or retried here.",
	integrity: "The room's output failed its integrity check. Its controls are off until it is repaired.",
	mismatch: "The room's output and the house's state are from different moments. Refreshing before anything can be sent."
};
function yu(e, t) {
	return t.documents.some((n) => {
		let r = e.phases[G.indexOf(n.phase)], i = r.door.proposal;
		return i === null || i.status !== "pending" || r.door.status !== "waiting" ? !1 : n.artifact === null ? !t.readOnly : n.artifact.artifactRevision.sha256 !== i.artifactRevision.sha256 || n.artifact.artifactRevision.revision !== i.artifactRevision.revision;
	});
}
function bu(e) {
	let t = (e, t = !1) => ({
		allowed: !1,
		block: e,
		text: vu[e],
		needsRefresh: t
	});
	return e.roomGhosts?.readOnly === !0 ? t("read_only") : e.authority.canDecide ? e.roomGhostsStatus === "malformed" ? t("malformed") : e.roomGhosts === null || e.projection === null ? t(e.roomGhostsStatus === "unavailable" ? "unavailable" : "loading") : e.roomGhostsStatus === "ready" ? e.roomGhosts.integrity === "corrupt" || e.projection.integrity === "corrupt" ? t("integrity") : e.roomGhosts.integrity === e.projection.integrity ? e.roomGhosts.integrity === "valid" ? e.roomGhosts.mansionId !== e.projection.mansionId || e.roomGhosts.version !== e.projection.version || yu(e.projection, e.roomGhosts) ? t("mismatch", !0) : {
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
var xu = "Another request is on its way. Wait for it to finish.";
function Su(e, t, n, r, i = null) {
	let a = r === _u(t), o = n.allowed ? i === null ? r === null ? null : xu : i : n.text;
	return {
		label: e,
		command: o === null ? t : null,
		busy: a,
		blockedText: a ? null : o
	};
}
var Cu = {
	requirements: "Requirements document",
	design: "Design document",
	tasks: "Task plan"
}, wu = {
	unwritten: "Not written yet",
	valid: "Valid: it passed the house's checks",
	invalid: "Not valid: it failed the house's checks",
	unknown: "Not checked here"
};
function Tu(e) {
	return e === 1 ? "1 byte" : `${e.toLocaleString("en-US")} bytes`;
}
function Eu(e) {
	return e === 0 ? "No findings" : e === 1 ? "1 finding" : `${e} findings`;
}
var Du = /* @__PURE__ */ new Set(["waiting", "revision_required"]);
function Ou(e, t, n, r, i) {
	if (!Du.has(e.status) || e.door.status === "open" || !n.runs.some((e) => e.phase === t)) return null;
	let a = `feedback:${t}`, o = r.allowed ? i !== null && i !== a ? xu : null : r.text;
	return {
		phase: t,
		label: `Ask for a revision of the ${q[t].toLowerCase()}`,
		maxCharacters: gu,
		enabled: o === null && i === null,
		busy: i === a,
		blockedText: o,
		expectedVersion: n.version
	};
}
function ku(e) {
	let t = e.trim();
	return t === "" ? {
		ok: !1,
		text: "Write what should change before sending."
	} : t.length > 4e3 ? {
		ok: !1,
		text: `Keep the request under ${gu.toLocaleString("en-US")} characters.`
	} : {
		ok: !0,
		feedback: t
	};
}
function Au(e) {
	for (let t of e.phases) {
		let e = t.door.proposal?.documentPath;
		if (e !== void 0 && e.includes("/")) return e.slice(0, e.lastIndexOf("/"));
	}
}
function ju(e, t, n, r, i, a) {
	let o = t === null ? null : t.phases[G.indexOf(e)], s = o?.door.proposal ?? null, c = n?.documents[kl.indexOf(e)] ?? null, l = c?.artifact ?? null, u = l?.artifactRevision ?? s?.artifactRevision ?? null, d = l !== null || t === null ? void 0 : Au(t), f = (l === null ? s?.documentPath ?? (d === void 0 ? void 0 : `${d}/${e}.md`) : void 0) ?? c?.documentPath ?? `.kiro/specs/${a}/${e}.md`, p = l === null ? u === null ? "unwritten" : "unknown" : l.validated ? "valid" : "invalid", m = s !== null && s.status === "pending" && o?.door.status === "waiting" ? s : null, h = l !== null && m !== null && (l.artifactRevision.sha256 !== m.artifactRevision.sha256 || l.artifactRevision.revision !== m.artifactRevision.revision);
	return {
		phase: e,
		title: Cu[e],
		documentPath: f,
		validation: p,
		validationText: wu[p],
		revisionText: u === null ? null : `Revision ${u.revision} (${Tu(u.sizeBytes)})`,
		digest: u?.sha256 ?? null,
		digestPrefix: u === null ? null : no(u.sha256),
		content: l?.content ?? null,
		contentNote: l?.content == null ? u === null ? "Nothing has been written here yet." : n?.readOnly === !0 ? "The séance log records the path, revision and digest of a document, never its text, so this recording has no text to show." : l === null ? "The document text is not loaded. The facts below come from the door proposal." : "The house did not send the text of this document. Its path, revision and digest are exact." : null,
		findings: l?.findings ?? [],
		findingsText: Eu(l?.findings.length ?? 0),
		writeScope: c === null || l === null && f !== c.documentPath ? [f] : c.writeScope,
		doorNote: h ? `The text shown is revision ${l.artifactRevision.revision}. The door proposal covers revision ${m.artifactRevision.revision} (digest ${no(m.artifactRevision.sha256)}). The house is refreshing.` : null,
		feedback: o == null || n === null ? null : Ou(o, e, n, r, i)
	};
}
var Mu = "Opening this session from Haunted House is not available yet. Find it in Crew by its name.", Nu = "This is a recording: there is no Crew session to open.";
function Pu(e, t = 400) {
	let n = e.replace(/\s+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function Fu(e, t, n, r, i, a) {
	let o = t.get(e.ghostId), s = o !== void 0 && o.run_id === e.runId ? o.state : null, c = s === null ? "Earlier run" : zi[s], l = qa(e.ghostId, a), u = n.version;
	return {
		runId: e.runId,
		ghostId: e.ghostId,
		ghostName: l,
		phase: e.phase,
		taskId: e.taskId,
		state: s,
		stateText: c,
		attemptText: `Attempt ${e.attempt} of 3`,
		summary: e.summary === null ? null : Pu(e.summary),
		reasonText: Wi(e.reasonCode),
		writeScope: e.claimPaths,
		cancel: e.cancelRequested ? {
			label: "Cancelling…",
			command: null,
			busy: !1,
			blockedText: "Cancellation was requested. Waiting for Crew to confirm it."
		} : e.canCancel ? Su(`Cancel ${l}'s run`, {
			kind: "cancel_run",
			runId: e.runId,
			expectedVersion: u
		}, r, i) : null,
		retry: e.canRetry ? Su("Retry with a fresh session", {
			kind: "retry_run",
			runId: e.runId,
			expectedVersion: u
		}, r, i) : null,
		exhaustedText: !e.canRetry && !e.canCancel && e.attempt >= 3 && (s === "failed" || s === "blocked") ? "All 3 attempts are used. Nothing retries on its own." : null,
		sessionLink: {
			slotKey: n.readOnly ? null : e.sessionLink,
			label: `Open ${l}'s Crew session (${c})`,
			disabledText: n.readOnly ? Nu : e.sessionLink === null ? Mu : null
		}
	};
}
var Iu = {
	not_selected: "Not selected",
	queued: "Queued",
	backpressure: "Queued: waiting for capacity",
	active: "A Tinker is working on it",
	complete: "Done",
	failed: "Failed",
	cancelled: "Cancelled",
	blocked: "Blocked",
	skipped: "Skipped"
}, Lu = {
	crew_capacity: "Crew has no room for another ghost right now",
	local_capacity: "All 3 Tinker seats are taken",
	claim_busy: "Another task is writing the same files"
};
function Ru(e) {
	return e.complete ? "complete" : e.outcome === null ? "not_selected" : e.outcome.status === "queued" && e.backpressure !== null ? "backpressure" : e.outcome.status;
}
function zu(e) {
	if (e.complete) return null;
	if (e.backpressure !== null) {
		let { dispatchFailures: t, nextDelaySeconds: n, lastReason: r } = e.backpressure, i = t === 1 ? "1 refusal so far" : `${t} refusals so far`, a = n === 1 ? "1 second" : `${n} seconds`;
		return `${Lu[r]}. Next try in ${a} (${i}). This does not use up an attempt.`;
	}
	return Wi(e.outcome?.reasonCode ?? null);
}
function Bu(e) {
	return !e.complete && (e.outcome === null || e.outcome.status === "skipped");
}
function Vu(e, t, n, r, i) {
	let a = t.taskPlan;
	if (a === null) return null;
	let o = new Map(n.filter((e) => e.taskId !== null).map((e) => [e.runId, e])), s = (e) => {
		let t = Ru(e);
		return {
			taskId: e.taskId,
			title: e.title,
			optional: e.optional,
			complete: e.complete,
			status: t,
			statusText: Iu[t],
			requirementsText: e.requirements.length === 0 ? "None" : e.requirements.join(", "),
			writes: e.writes,
			attemptText: e.outcome === null || e.outcome.attempt === 0 ? null : `Attempt ${e.outcome.attempt} of 3`,
			detail: zu(e),
			selectable: Bu(e),
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
	let u = a.tasks.filter((e) => e.outcome?.status === "active").length, d = e?.phases[G.indexOf("tasks")].door.status, f = r.allowed ? d === "open" ? a.findings.length > 0 ? "The task plan has findings. It needs a revision before any task can start." : a.tasks.some(Bu) ? i !== null && i !== "workshop" ? xu : null : "Every open task is already selected or done." : "Sealed door: approve the task plan before any task can start." : r.text;
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
function Hu(e, t) {
	if (e.startBlockedText !== null || e.startBusy) return null;
	let n = e.waves.flatMap((e) => e.tasks), r = n.filter((e) => t.has(e.taskId)).map((e) => e.taskId);
	return r.length === 0 || r.length !== t.size || n.some((e) => t.has(e.taskId) && !e.selectable) ? null : {
		kind: "start_workshop",
		taskIds: r,
		expectedVersion: e.expectedVersion
	};
}
var Uu = {
	study: ["requirements"],
	"drafting-room": ["design"],
	workshop: ["tasks"]
};
function Wu(e) {
	let { room: t, projection: n, roomGhosts: r, snapshots: i } = e, a = e.names ?? {}, o = bu(e), s = t.phases.map((e) => e.phase), c = n === null ? [] : s.map((e) => n.phases[G.indexOf(e)]), l = new Set(t.ghosts.map((e) => e.ghostId)), u = r === null ? [] : r.runs.filter((e) => s.includes(e.phase)).map((t) => Fu(t, i, r, o, e.inFlight, a)).reverse(), d = r === null || t.id !== "workshop" ? null : Vu(n, r, u, o, e.inFlight);
	return {
		projectionVersion: n?.version ?? 0,
		integrity: n === null ? "uncertain" : r === null ? n.integrity : Gu(n.integrity, r.integrity),
		room: t.id,
		ghosts: Array.from(i.values()).filter((e) => l.has(e.ghost_id)),
		phases: c,
		gate: o,
		documents: Uu[t.id].map((t) => ju(t, n, r, o, e.inFlight, e.specName)),
		taskBoard: d,
		runs: u,
		outputNote: r === null ? e.roomGhostsStatus === "loading" ? vu.loading : e.roomGhostsStatus === "malformed" ? vu.malformed : vu.unavailable : null,
		ownsImplementationStart: d !== null
	};
}
function Gu(e, t) {
	return e === "corrupt" || t === "corrupt" ? "corrupt" : e === "uncertain" || t === "uncertain" ? "uncertain" : "valid";
}
function Ku(e, t, n, r, i) {
	if (!n.allowed || r !== null || e === null || t === null || i.expectedVersion !== e.version || i.expectedVersion !== t.version) return null;
	switch (i.kind) {
		case "send_feedback": {
			let n = ku(i.feedback);
			if (!n.ok || n.feedback !== i.feedback) return null;
			let r = t.phases[G.indexOf(i.phase)];
			return !Du.has(r.status) || r.door.status === "open" ? null : e.runs.some((e) => e.phase === i.phase) ? i : null;
		}
		case "start_workshop": {
			let n = e.taskPlan;
			if (n === null || n.findings.length > 0 || t.phases[G.indexOf("tasks")].door.status !== "open" || i.taskIds.length === 0 || new Set(i.taskIds).size !== i.taskIds.length) return null;
			let r = new Set(n.tasks.filter(Bu).map((e) => e.taskId));
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
var qu = {
	reviewing: "The Medium is reviewing",
	pass: "Passed: the review found nothing to change",
	changes_requested: "Changes requested",
	blocked: "Blocked: the review needs your decision"
}, Ju = {
	proposed: "Proposed: not started",
	approved: "Approved for the Workshop",
	rejected: "Rejected"
};
function Yu(e, t, n = {}) {
	if (e === null || !e.seanceEnabled || e.review === null) return null;
	let r = e.review, i = t.get(r.ghostId)?.state ?? null, a = i === null ? "No run yet" : zi[i], o = qa(r.ghostId, n);
	return {
		status: r.status,
		statusText: qu[r.status],
		cycleText: `Review cycle ${r.cycle} of 3`,
		limitText: r.status === "blocked" || r.cycle >= 3 && r.status === "changes_requested" ? "Three review cycles ended without a pass. No fourth review starts on its own: the next step is your decision." : null,
		ghostName: o,
		state: i,
		stateText: a,
		findings: r.findings.map((e) => {
			let t = r.repairs.find((t) => t.findingId === e.findingId);
			return {
				findingId: e.findingId,
				summary: Pu(e.summary),
				requirementsText: e.requirementIds.length === 0 ? "None" : e.requirementIds.join(", "),
				paths: e.paths,
				repair: t === void 0 ? null : {
					taskId: t.taskId,
					title: t.title,
					writes: t.writes,
					status: t.status,
					statusText: Ju[t.status]
				}
			};
		}),
		sessionLink: {
			slotKey: e.readOnly ? null : r.sessionLink,
			label: `Open ${o}'s Crew session (${a})`,
			disabledText: e.readOnly ? Nu : r.sessionLink === null ? Mu : null
		}
	};
}
// src/core/room-api.ts
var Xu = "/apps/haunted-house/api";
function Zu(e, t) {
	return `${Xu}/mansions/${encodeURIComponent(e)}/specs/${encodeURIComponent(t)}`;
}
function Qu(e, t) {
	return `${Zu(e, t)}/room-ghosts`;
}
function $u(e, t) {
	return `${Zu(e, t)}/feedback`;
}
function ed(e, t) {
	return `${Zu(e, t)}/workshop/start`;
}
function td(e) {
	return `${Xu}/room-ghosts/runs/${encodeURIComponent(e)}/cancel`;
}
function nd(e) {
	return `${Xu}/room-ghosts/runs/${encodeURIComponent(e)}/retry`;
}
function rd(e, t, n, r) {
	let i = {
		command_id: r,
		expected_version: n.expectedVersion
	};
	switch (n.kind) {
		case "send_feedback": return {
			path: $u(e, t),
			body: {
				...i,
				phase: n.phase,
				feedback: n.feedback
			}
		};
		case "start_workshop": return {
			path: ed(e, t),
			body: {
				...i,
				task_ids: [...n.taskIds]
			}
		};
		case "cancel_run": return {
			path: td(n.runId),
			body: {
				...i,
				mansion_id: e
			}
		};
		case "retry_run": return {
			path: nd(n.runId),
			body: {
				...i,
				mansion_id: e
			}
		};
	}
}
var id = {
	conflict: "The room changed before your request arrived, so nothing was done. Check what is shown now and try again.",
	invalid: "The house refused that request. Nothing was done.",
	not_found: "That run or spec no longer exists. Nothing was done.",
	integrity: "The séance log failed its integrity check, so the house accepts no requests. Nothing was done.",
	contract: "The house cannot do this right now: a contract it depends on is unavailable. Nothing was done.",
	crew: "Crew did not answer in time. Check the state shown before trying again.",
	read_only: "This is a recording. Nothing was done.",
	unavailable: "The house could not be reached. It is not known whether anything was done; the state is being read again."
};
function ad(e) {
	let t = (e) => ({
		kind: e,
		text: id[e]
	});
	switch (fc(e)) {
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
			let n = mc(e);
			return t(n === "contract_unavailable" ? "contract" : n === "integrity_unavailable" ? "integrity" : "unavailable");
		}
	}
}
function od(e) {
	switch (e.kind) {
		case "send_feedback": return "Revision request sent to the same session. The door stays sealed until you approve a new revision.";
		case "start_workshop": return e.taskIds.length === 1 ? "1 task selected. A Tinker starts when a seat and its files are free." : `${e.taskIds.length} tasks selected. Tinkers start as seats and files come free, at most three at a time.`;
		case "cancel_run": return "Cancellation requested. The run stops when Crew confirms it.";
		case "retry_run": return "Retry accepted. A fresh session takes the next attempt.";
	}
}
// src/adapters/room-ghosts-api.ts
var sd = {
	status: "loading",
	roomGhosts: null,
	inFlight: null,
	notice: null
}, cd = 5e3, ld = 150, ud = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
};
function dd() {
	if (typeof crypto < "u" && typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(16);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
function fd(e) {
	let { api: t, mansionId: n, specName: r } = e, i = e.timers ?? ud, a = e.pollMs ?? cd, o = e.refreshDelayMs ?? ld, s = e.newCommandId ?? dd, c = sd, l = /* @__PURE__ */ new Set(), u = !1, d = !0, f = null, p = !1, m = null, h = null, g = "";
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
		return u ? Promise.resolve() : f === null ? (m = v(m), h = v(h), f = Promise.resolve().then(() => t.get(Qu(n, r))).then((e) => {
			let t = hu(e, n, r);
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
			let o = Ku(c.roomGhosts, a.projection, a.gate, c.inFlight, i);
			if (o === null) return Promise.resolve();
			let l = rd(n, r, o, s());
			return _({
				inFlight: _u(o),
				notice: null
			}), Promise.resolve().then(() => t.post(l.path, l.body)).then(() => od(o), (e) => ad(e).text).then((e) => S().then(() => _({
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
var pd = () => Promise.resolve();
function md(e, t, n, r) {
	let i = pe(), a = P(i);
	a.current = i;
	let o = P(r);
	o.current = r;
	let s = P(null), [c, l] = F(sd);
	return j(() => {
		if (e === null) {
			l(sd);
			return;
		}
		let n = fd({
			mansionId: e,
			specName: t,
			api: {
				get: (e) => a.current.get(e),
				post: (e, t) => a.current.post(e, t)
			},
			onCommandSettled: () => o.current?.()
		});
		s.current = n, l(n.getState());
		let r = n.subscribe(l), i = () => n.setVisible(document.visibilityState !== "hidden");
		return document.addEventListener("visibilitychange", i), n.start(), () => {
			document.removeEventListener("visibilitychange", i), r(), n.dispose(), s.current === n && (s.current = null);
		};
	}, [e, t]), j(() => {
		n !== null && s.current?.noteWorkflowVersion(n);
	}, [
		n,
		c.roomGhosts,
		c.status
	]), {
		state: c,
		send: A((e, t) => s.current?.send(e, t) ?? pd(), []),
		refresh: A(() => s.current?.refresh() ?? pd(), []),
		noteDisagreement: A((e) => s.current?.noteWorkflowVersion(e, !0), [])
	};
}
// src/adapters/seance-live.ts
var hd = [
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
], gd = {
	highestSequence: 0,
	snapshots: /* @__PURE__ */ new Map(),
	catchingUp: !1,
	diagnostic: null,
	loaded: !1,
	transitions: [],
	pendingEnvelopes: 0
}, _d = 5e3, vd = [
	1e3,
	2e3,
	5e3,
	15e3
], yd = 500, bd = 50, xd = 3e4, Sd = 200, Cd = 5e3, wd = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
}, Td = {
	code: "persistence_failed",
	safe_detail: "The backend did not confirm the latest ghost activity. Trying again."
}, Ed = {
	code: "invalid_envelope",
	safe_detail: "The backend refused a Crew event, so it was not recorded."
}, Dd = {
	code: "persistence_failed",
	safe_detail: "The séance log of this mansion is not available, so new ghost activity was not recorded."
}, Od = {
	code: "persistence_failed",
	safe_detail: "Too much ghost activity is waiting for the backend. The oldest events were dropped."
}, kd = {
	code: "persistence_failed",
	safe_detail: "Could not read the séance log. Showing the last confirmed state."
}, Ad = {
	code: "history_partial",
	safe_detail: "Could not recover missed activity from Crew history."
};
function jd(e) {
	let { api: t, mansionId: n } = e, r = e.timers ?? wd, i = e.pollMs ?? _d, a = e.retryDelaysMs ?? vd, o = e.maxQueue ?? yd, s = gd, c = Eo, l = /* @__PURE__ */ new Set(), u = !1, d = !0, f = [], p = !1, m = 0, h = 0, g = null, _ = null, v = null, y = !1, b = !1, x = !1, S = null, C = null, w = null;
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
	function ee(e) {
		let t = Do(c, e.events.filter((e) => e.scope.mansion_id === n));
		if (t.applied.length === 0) return;
		c = t.log;
		let r = ko(c);
		T({
			highestSequence: c.highestSequence,
			snapshots: new Map(r.snapshots.map((e) => [e.ghost_id, e])),
			transitions: r.transitions
		});
	}
	function te(e) {
		return e !== null && r.clear(e), null;
	}
	function ne() {
		for (let e of s.snapshots.values()) if (e.state === "working" || e.state === "waiting") return !0;
		return !1;
	}
	function E(e) {
		if (_ = te(_), u || !d) return;
		let t = e === null ? ne() ? i : null : Math.min(Math.max(e, bd), xd);
		t !== null && (_ = r.set(() => {
			_ = null, D(!1);
		}, t));
	}
	function D(e) {
		return u ? Promise.resolve() : (e && !s.catchingUp && T({ catchingUp: !0 }), v === null ? (_ = te(_), v = Promise.resolve().then(async () => {
			let e = null, r = [];
			try {
				let i = null;
				for (let a = 0; a < Sd; a += 1) {
					let a = await t.get(rc(n, c.contiguousSequence, 500));
					if (u) return;
					let o = dc(a);
					if (!o.ok) {
						i = o.diagnostic;
						break;
					}
					let s = c.contiguousSequence;
					if (ee(o.page), i ??= o.page.diagnostics[0] ?? null, e = o.page.nextEventInMs, r = o.page.reconcileSlots, c.contiguousSequence >= o.page.highestSequence || c.contiguousSequence === s) break;
				}
				w = i, T({
					catchingUp: b,
					loaded: !0
				});
			} catch (e) {
				if (u) return;
				fc(e) === 404 && mc(e) === "log_not_found" ? (w = null, T({
					catchingUp: b,
					loaded: !0
				})) : (w = kd, T({ catchingUp: b }));
			}
			r.length > 0 && ie(r), E(e);
		}).finally(() => {
			if (v = null, !u) {
				if (y) {
					let e = b;
					y = !1, b = !1, D(e);
				}
				O();
			}
		}), v) : (y = !0, b ||= e, v));
	}
	function re() {
		if (h >= a.length) return;
		let e = a[h];
		h += 1, g = r.set(() => {
			g = null, O();
		}, e);
	}
	function O() {
		if (u || p || g !== null || f.length === 0 || v !== null) return;
		let e = m > 0 ? 1 : Math.min(f.length, 100), r = f.slice(0, e);
		p = !0, Promise.resolve().then(() => t.post(nc(n), { envelopes: r })).then((e) => {
			if (p = !1, u) return;
			f[0] === r[0] && f.splice(0, r.length), m > 0 && --m, h = 0;
			let t = dc(e);
			t.ok ? (C = null, ee(t.page), T({}), t.page.reconcileSlots.length > 0 && ie(t.page.reconcileSlots), c.contiguousSequence < Math.max(c.highestSequence, t.page.highestSequence) ? D(!1) : E(null)) : (C = t.diagnostic, T({})), O();
		}, (e) => {
			if (p = !1, u) return;
			let t = fc(e);
			if (t === 404 || t === 409) f[0] === r[0] && f.splice(0, r.length), m = 0, C = Dd, T({}), O();
			else if (gc(t)) {
				let t = hc(e, r.length);
				if (t !== null && f[0] === r[0]) {
					for (let { index: e } of [...t].reverse()) f.splice(e, 1);
					t.some(({ code: e }) => e !== "unknown_session") && (C = Ed), T({}), O();
					return;
				}
				r.length > 1 ? m = r.length : (f[0] === r[0] && f.shift(), m > 0 && --m, C = Ed), T({}), O();
			} else C = Td, T({}), re();
		});
	}
	function ie(e) {
		if (u || x || S !== null || e.length === 0) return Promise.resolve();
		x = !0;
		let i = { slots: e.slice(0, 8) };
		return Promise.resolve().then(() => t.post(ic(n), i)).then((e) => {
			if (u) return;
			let t = dc(e);
			t.ok ? (ee(t.page), w = t.page.diagnostics[0] ?? w) : w = Ad, T({});
		}, () => {
			u || (w = Ad, T({}));
		}).finally(() => {
			if (x = !1, !u) return S = r.set(() => {
				S = null;
			}, Cd), D(!1);
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
			D(!0);
		},
		forward(e, t) {
			u || (f.push({
				type: e,
				data: t
			}), f.length > o && (f.splice(0, f.length - o), C = Od), T({}), g === null && h >= a.length && (h = Math.max(a.length - 1, 0)), O());
		},
		catchUp: () => D(!0),
		reconcile: ie,
		setVisible(e) {
			u || d === e || (d = e, d ? (h = 0, D(!0)) : _ = te(_));
		},
		dispose() {
			u = !0, _ = te(_), g = te(g), S = te(S), l.clear(), f.length = 0;
		}
	};
}
function Md(e) {
	let t = pe(), n = P(t);
	n.current = t;
	let r = P(null), [i, a] = F(gd);
	j(() => {
		if (e === null) {
			a(gd);
			return;
		}
		let t = jd({
			mansionId: e,
			api: {
				get: (e) => n.current.get(e),
				post: (e, t) => n.current.post(e, t)
			}
		});
		r.current = t, a(t.getState());
		let i = t.subscribe(a), o = () => t.setVisible(document.visibilityState !== "hidden");
		return document.addEventListener("visibilitychange", o), t.start(), () => {
			document.removeEventListener("visibilitychange", o), i(), t.dispose(), r.current === t && (r.current = null);
		};
	}, [e]);
	let o = N(() => hd.map((e) => (t) => r.current?.forward(e, t)), []);
	hd.forEach((e, t) => {
		me(e, o[t]);
	});
	let s = A(() => {
		r.current?.catchUp();
	}, []);
	return N(() => ({
		state: i,
		catchUp: s
	}), [i, s]);
}
// src/core/house-reducer.ts
var Nd = {
	projection: null,
	projectionStatus: "loading",
	inFlight: null,
	notice: null
};
function Pd(e, t) {
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
function Fd(e, t) {
	return e.revision === t.revision && e.sha256 === t.sha256 && e.sizeBytes === t.sizeBytes;
}
function Id(e, t, n) {
	let r = e.projection;
	if (!t.canDecide || e.inFlight !== null || r === null || e.projectionStatus !== "ready" || n.expectedVersion !== r.version) return null;
	switch (n.kind) {
		case "start_phase": {
			let e = r.phases.find((e) => e.phase === n.phase);
			return e?.status === "ready" || e?.status === "failed" || e?.status === "revision_required" ? n : null;
		}
		case "decide_door": {
			let e = r.phases.find((e) => e.phase === n.phase), t = e?.door.proposal;
			return e === void 0 || t == null || e.door.status !== "waiting" || t.status !== "pending" || t.proposalId !== n.proposalId || t.documentPath !== n.documentPath ? null : Fd(t.artifactRevision, n.artifactRevision) ? n : null;
		}
		case "decide_risky": {
			let e = r.riskyProposals.find((e) => e.proposalId === n.proposalId);
			return e === void 0 || e.status !== "pending" || e.actionDigest !== n.actionDigest || n.decision === "approve" && e.descriptor === null ? null : n;
		}
	}
}
// src/core/workflow-api.ts
var Ld = "/apps/haunted-house/api/mansions";
function Rd(e) {
	return `${Ld}/${encodeURIComponent(e)}`;
}
function zd(e) {
	return `${Rd(e)}/workflow`;
}
function Bd(e, t) {
	return `${Rd(e)}/phases/${t}/start`;
}
function Vd(e, t, n) {
	return `${Rd(e)}/doors/${encodeURIComponent(t)}/${n}`;
}
function Hd(e, t, n) {
	return `${Rd(e)}/approvals/${encodeURIComponent(t)}/${n}`;
}
function Ud(e, t, n) {
	let r = {
		command_id: n,
		expected_version: t.expectedVersion
	};
	switch (t.kind) {
		case "start_phase": return {
			path: Bd(e, t.phase),
			body: r
		};
		case "decide_door": return {
			path: Vd(e, t.proposalId, t.decision),
			body: {
				...r,
				phase: t.phase,
				document_path: t.documentPath,
				artifact_revision: Ua(t.artifactRevision)
			}
		};
		case "decide_risky": return {
			path: Hd(e, t.proposalId, t.decision),
			body: {
				...r,
				action_digest: t.actionDigest
			}
		};
	}
}
function Wd(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Gd(e, t) {
	if (!Wd(e)) return null;
	let { event_id: n, sequence: r, version: i } = e;
	if (typeof n != "string" || !/^e1:[0-9a-f]{64}$/.test(n) || typeof r != "number" || !Number.isSafeInteger(r) || r < 1) return null;
	let a = Ha(e.workflow, t);
	return !a.ok || i !== a.projection.version || r > a.projection.version ? null : {
		eventId: n,
		sequence: r,
		projection: a.projection
	};
}
var Kd = {
	conflict: "The house changed before your decision arrived, so nothing was recorded. Check what is shown now and decide again.",
	invalid: "The house refused that request. Nothing was recorded.",
	not_found: "That mansion or proposal no longer exists. Nothing was recorded.",
	integrity: "The séance log failed its integrity check, so the house accepts no decisions. Nothing was recorded.",
	crew: "Crew did not answer in time. Check the state shown before trying again.",
	read_only: "This is a recording. Nothing was recorded.",
	unavailable: "The house could not be reached. It is not known whether anything was recorded; the state is being read again."
}, qd = 524288;
function Jd(e, t) {
	if (typeof e != "object" || !e) return null;
	let n = e.body;
	if (typeof n != "string" || n.length > qd) return null;
	try {
		let e = JSON.parse(n);
		if (!Wd(e)) return null;
		let r = Ha(e.workflow, t);
		return r.ok ? r.projection : null;
	} catch {
		return null;
	}
}
function Yd(e, t) {
	let n = fc(e), r = Jd(e, t), i = (e) => ({
		kind: e,
		text: Kd[e],
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
		default: return i(mc(e) === "integrity_unavailable" ? "integrity" : "unavailable");
	}
}
function Xd(e) {
	switch (e.kind) {
		case "start_phase": return `${q[e.phase]} started.`;
		case "decide_door": return e.decision === "approve" ? `${q[e.phase]} door approved. The next phase starts only when you start it.` : `${q[e.phase]} door rejected. A revision is required.`;
		case "decide_risky": return e.decision === "approve" ? "Action approved for one attempt." : "Action rejected. It will not run.";
	}
}
// src/adapters/workflow-live.ts
var Zd = 5e3, Qd = 150, $d = "The house answered in a way this page cannot read. Reading the state again before anything else.", ef = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
};
function tf() {
	if (typeof crypto < "u" && typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(16);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
function nf(e) {
	let { api: t, mansionId: n } = e, r = e.timers ?? ef, i = e.pollMs ?? Zd, a = e.refreshDelayMs ?? Qd, o = e.newCommandId ?? tf, s = Nd, c = /* @__PURE__ */ new Set(), l = !1, u = !0, d = null, f = !1, p = null, m = null, h = 0;
	function g(e) {
		if (l) return;
		let t = Pd(s, e);
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
		return e.readOnly ? !1 : h > e.version || e.integrity === "uncertain" || _o(e).length > 0 || e.phases.some((e) => e.status === "starting");
	}
	function y() {
		p = _(p), !l && u && v() && (p = r.set(() => {
			p = null, b();
		}, i));
	}
	function b() {
		return l ? Promise.resolve() : d === null ? (p = _(p), m = _(m), d = Promise.resolve().then(() => t.get(zd(n))).then((e) => {
			let t = Ha(e, n);
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
			let a = Id(s, i, r);
			if (a === null) return Promise.resolve();
			let c = Ud(n, a, o());
			return g({
				type: "command_sent",
				target: to(a)
			}), Promise.resolve().then(() => t.post(c.path, c.body)).then((e) => {
				let t = Gd(e, n);
				if (t === null) return g({
					type: "command_settled",
					notice: $d
				}), b();
				g({
					type: "projection_received",
					projection: t.projection
				}), g({
					type: "command_settled",
					notice: Xd(a)
				}), y();
			}, (e) => {
				let t = Yd(e, n);
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
var rf = () => Promise.resolve();
function af(e, t, n) {
	let r = pe(), i = P(r);
	i.current = r;
	let a = P(n);
	a.current = n;
	let o = P(null), [s, c] = F(Nd);
	return j(() => {
		if (e === null) {
			c(Nd);
			return;
		}
		let t = nf({
			mansionId: e,
			api: {
				get: (e) => i.current.get(e),
				post: (e, t) => i.current.post(e, t)
			},
			onCommandSettled: () => a.current?.()
		});
		o.current = t, c(t.getState());
		let n = t.subscribe(c), r = () => t.setVisible(document.visibilityState !== "hidden");
		return document.addEventListener("visibilitychange", r), t.start(), () => {
			document.removeEventListener("visibilitychange", r), n(), t.dispose(), o.current === t && (o.current = null);
		};
	}, [e]), j(() => {
		o.current?.noteCanonical(t);
	}, [t, s.projection]), {
		state: s,
		dispatch: A((e) => o.current?.dispatch(e) ?? void 0, []),
		send: A((e, t) => o.current?.send(e, t) ?? rf(), []),
		refresh: A(() => o.current?.refresh() ?? rf(), [])
	};
}
// src/adapters/house-projection.ts
function of(e) {
	let t = e.diagnostic;
	if (t === null) return {
		integrity: "valid",
		validRecordCount: e.highestSequence,
		diagnostics: []
	};
	let n = ws(t);
	return {
		integrity: n.code === "integrity_failed" ? "incompatible" : "diagnostic",
		validRecordCount: e.highestSequence,
		diagnostics: [n]
	};
}
function sf(e) {
	let t = e.ghostNames, n = eo({
		projection: e.workflow,
		projectionStatus: e.workflowStatus,
		canonical: e.canonical,
		readOnly: e.readOnly
	}), r = e.roomInFlight ?? (e.workflowInFlight === null ? null : `workflow:${e.workflowInFlight}`), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map();
	for (let o of bo(e.workflow, e.snapshots.values(), t)) i.set(o.id, xo(e.workflow, o, n, e.workflowInFlight, t)), a.set(o.id, Wu({
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
function cf(e) {
	let { mansion: t, ghostNames: n, seanceRoom: r, mode: i } = e, a = t.name, o = t.projectSpec, s = e.replayed ?? null, { state: c, catchUp: l } = Md(a), { state: u, send: d, refresh: f } = af(a, c.highestSequence, l), p = A(() => {
		l(), f();
	}, [l, f]), m = md(a, o, (s === null ? u.projection : s.workflow)?.version ?? null, p), h = lt(), g = s === null ? u.projection : s.workflow, _ = s === null ? u.projectionStatus : "ready", v = s === null ? c.snapshots : s.snapshots, y = s === null ? c.transitions : s.transitions, b = m.state.roomGhosts, x = m.state.status, S = s === null ? c.highestSequence : s.highestSequence, C = i === "replay", w = N(() => ({
		loaded: s !== null || c.loaded,
		catchingUp: s === null && c.catchingUp,
		highestSequence: S,
		diagnostic: c.diagnostic
	}), [
		s,
		c.loaded,
		c.catchingUp,
		c.diagnostic,
		S
	]), T = N(() => e.replay ?? of(w), [e.replay, w]), ee = N(() => sf({
		mansion: t,
		specName: o,
		workflow: g,
		workflowStatus: _,
		snapshots: v,
		canonical: w,
		roomGhosts: b,
		roomGhostsStatus: x,
		replay: T,
		workflowInFlight: u.inFlight,
		roomInFlight: m.state.inFlight,
		ghostNames: n,
		readOnly: C
	}), [
		t,
		o,
		g,
		_,
		v,
		w,
		b,
		x,
		T,
		u.inFlight,
		m.state.inFlight,
		n,
		C
	]), te = N(() => vl(ee.input, {
		seanceRoom: r,
		mode: i
	}), [
		ee.input,
		r,
		i
	]), ne = ee.authority, E = N(() => bu({
		projection: g,
		roomGhosts: b,
		roomGhostsStatus: x,
		authority: ne
	}), [
		g,
		b,
		x,
		ne
	]), D = m.noteDisagreement;
	j(() => {
		s === null && E.needsRefresh && u.projection !== null && D(u.projection.version);
	}, [
		s,
		E.needsRefresh,
		u.projection,
		m.state.roomGhosts,
		D
	]);
	let re = N(() => r === "enabled" ? Yu(b, v, n) : null, [
		r,
		b,
		v,
		n
	]), O = P(e.onAnnounce);
	O.current = e.onAnnounce, j(() => {
		u.notice !== null && O.current(u.notice);
	}, [u.notice]), j(() => {
		m.state.notice !== null && O.current(m.state.notice);
	}, [m.state.notice]);
	let ie = m.send, k = P({
		projection: u.projection,
		gate: E,
		workflowBusy: u.inFlight !== null
	});
	k.current = {
		projection: u.projection,
		gate: E,
		workflowBusy: u.inFlight !== null
	};
	let ae = A((e) => {
		ie(e, k.current);
	}, [ie]), oe = P(ne);
	oe.current = ne;
	let se = A((e) => {
		d(e, oe.current);
	}, [d]), ce = A((e) => cl(e, g), [g]), le = A((e) => qa(e, n), [n]), ue = N(() => ({
		transitions: y,
		snapshots: v,
		roomOf: ce,
		nameOf: le
	}), [
		y,
		v,
		ce,
		le
	]);
	return {
		projection: te,
		authority: ne,
		loading: s === null && (u.projectionStatus === "loading" || !c.loaded && c.diagnostic === null),
		logProblem: c.diagnostic === null ? null : Xi(c.diagnostic),
		details: ee.details,
		outputs: ee.outputs,
		review: re,
		notice: u.notice,
		roomNotice: m.state.notice,
		inFlight: u.inFlight ?? m.state.inFlight,
		send: se,
		sendRoom: ae,
		openSession: h,
		canonical: ue
	};
}
// src/core/interruption-policy.ts
var lf = [
	"waiting",
	"blocked",
	"failed"
], uf = 1e4;
function df(e) {
	return lf.includes(e);
}
var ff = {
	seenEventIds: /* @__PURE__ */ new Set(),
	burst: null
}, pf = [];
function mf(e) {
	return Array.from(e).length;
}
function hf(e) {
	let t = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim();
	if (t === "") return "A ghost";
	let n = Array.from(t);
	return n.length <= 60 ? t : `${n.slice(0, 59).join("").trimEnd()}…`;
}
var gf = {
	waiting: (e) => `${e} is waiting for your approval.`,
	blocked: (e) => `${e} is blocked.`,
	failed: (e) => `${e} failed.`
};
function _f(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.events) t.set(n.ghostId, n);
	let n = Array.from(t.values()).sort((e, t) => na(e.roomId) - na(t.roomId)), r = n.map((e) => gf[e.state](hf(e.ghostName)));
	e.events.length > 1 && r.push(`${e.events.length} events.`);
	let i = r.join(" ");
	return mf(i) > 240 && (i = n.length === 1 ? "1 ghost needs attention. Open Needs you for details." : `${n.length} ghosts need attention. Open Needs you for details.`), {
		text: i,
		eventIds: e.events.map((e) => e.eventId)
	};
}
function vf(e) {
	return {
		kind: "summary",
		..._f(e)
	};
}
function yf(e, t) {
	if (t.kind !== "transition" || t.fromState === t.toState || !Bi.has(t.toState) || !df(t.toState) || e.seenEventIds.has(t.eventId)) return {
		state: e,
		effects: pf
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
		effects: pf
	} : {
		state: {
			seenEventIds: a,
			burst: {
				openedAtMs: r,
				lastAcceptedAtMs: r,
				events: [i]
			}
		},
		effects: n === null ? pf : [vf(n)]
	};
}
function bf(e, t) {
	let n = e.burst;
	return n === null || t - n.lastAcceptedAtMs < 1e4 ? {
		state: e,
		effects: pf
	} : {
		state: {
			seenEventIds: e.seenEventIds,
			burst: null
		},
		effects: [vf(n)]
	};
}
function xf(e) {
	return e.burst === null ? null : e.burst.lastAcceptedAtMs + uf;
}
function Sf(e, t) {
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
function Cf(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.transitions) n.from_state !== n.to_state && t.set(n.ghost_id, n);
	let n = [], r = [];
	for (let i of e.transitions) {
		if (e.offered.has(i.transition_id) || (n.push(i.transition_id), t.get(i.ghost_id) !== i) || e.currentState(i.ghost_id) !== i.to_state) continue;
		let a = Sf(i, {
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
function wf(e) {
	let t = yt(), n = xt(), r = St(), i = P(e);
	i.current = e;
	let a = P(ff), o = P(/* @__PURE__ */ new Set()), s = P(null), c = e.active ? Math.max(0, Math.trunc(e.needsYouCount) || 0) : 0;
	return j(() => {
		r(c);
	}, [c, r]), j(() => () => void r(0), [r]), j(() => (a.current = ff, o.current = /* @__PURE__ */ new Set(), () => {
		s.current !== null && clearTimeout(s.current), s.current = null, a.current = ff;
	}), [e.mansionId, e.active]), j(() => {
		if (!e.active) return;
		let t = () => (i.current.now ?? Date.now)(), r = (e) => {
			for (let t of e) t.kind === "summary" && (n(t.text), i.current.onSummary({
				text: t.text,
				eventIds: t.eventIds
			}));
		}, c = () => {
			s.current !== null && clearTimeout(s.current), s.current = null;
			let e = xf(a.current);
			e !== null && (s.current = setTimeout(() => {
				s.current = null;
				let e = bf(a.current, t());
				a.current = e.state, r(e.effects), c();
			}, Math.max(e - t(), 0)));
		}, l = Cf({
			transitions: e.transitions,
			currentState: (t) => e.snapshots.get(t)?.state ?? null,
			offered: o.current,
			roomOf: e.roomOf,
			nameOf: e.nameOf,
			observedAtMs: t()
		});
		for (let e of l.offered) o.current.add(e);
		let u = !1;
		for (let e of l.events) {
			let t = yf(a.current, e);
			u ||= t.state !== a.current, a.current = t.state, r(t.effects);
		}
		u && c();
	}, [
		e.active,
		e.transitions,
		e.snapshots,
		e.roomOf,
		e.nameOf,
		n
	]), { theme: t };
}
// src/core/motion-policy.ts
function Tf(e) {
	return e.stillHouse === !1 && e.prefersReducedMotion === !1 ? "low-frequency" : "none";
}
function Ef(e) {
	return e !== !1;
}
function Df(e) {
	return {
		stillHouse: e.stillHouse,
		prefersReducedMotion: e.prefersReducedMotion,
		effective: Tf(e)
	};
}
// src/components/house-stage-art.tsx
var X = (e) => `hh-sf-${e}`, Of = {
	foyer: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M72 120 V52 a28 28 0 0 1 56 0 V120 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("moon"),
			d: "M78 52 a22 22 0 0 1 44 0 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M100 30 V52 M84 37 L100 52 L116 37",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M78 56 H98 V120 H78 z M102 56 H122 V120 H102 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M82 62 h12 v22 h-12 z M106 62 h12 v22 h-12 z M82 90 h12 v24 h-12 z M106 90 h12 v24 h-12 z",
			strokeWidth: 1.2
		}),
		/* @__PURE__ */ L("circle", {
			className: X("brass"),
			cx: "96",
			cy: "88",
			r: "2"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("brass"),
			cx: "104",
			cy: "88",
			r: "2"
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M38 58 h10 l-2 8 h-6 z M152 58 h10 l-2 8 h-6 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("lamp"),
			d: "M43 44 q5 7 0 13 q-5 -6 0 -13 z M157 44 q5 7 0 13 q-5 -6 0 -13 z",
			strokeWidth: 1.2
		})
	] }),
	study: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: X("glass"),
			d: "M40 96 V40 a22 22 0 0 1 44 0 V96 z"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("moon"),
			cx: "70",
			cy: "44",
			r: "9"
		}),
		/* @__PURE__ */ L("path", {
			d: "M62 18 V96 M40 58 H84",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ L("path", {
			className: X("cloth"),
			d: "M30 14 H94 V22 H30 z M32 22 q10 40 -2 78 h12 q6 -40 0 -78 z M92 22 q-10 40 2 78 h-12 q-6 -40 0 -78 z"
		}),
		/* @__PURE__ */ L("rect", {
			className: X("brass"),
			x: "124",
			y: "30",
			width: "34",
			height: "42",
			rx: "2"
		}),
		/* @__PURE__ */ L("rect", {
			className: X("paper"),
			x: "129",
			y: "35",
			width: "24",
			height: "32"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("bone"),
			cx: "141",
			cy: "47",
			r: "6"
		}),
		/* @__PURE__ */ L("path", {
			d: "M133 67 q8 -12 16 0",
			strokeWidth: 1.5
		})
	] }),
	"drafting-room": /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("rect", {
			className: X("sheet"),
			x: "26",
			y: "24",
			width: "84",
			height: "60"
		}),
		/* @__PURE__ */ L("path", {
			className: X("none"),
			d: "M40 72 V48 L60 34 L80 48 V72 z M52 72 V58 h10 v14 M68 52 h8 v8 h-8 z M34 78 H102",
			stroke: "var(--hh-sc-paper, none)",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ L("circle", {
			className: X("cloth"),
			cx: "30",
			cy: "28",
			r: "2.5"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("cloth"),
			cx: "106",
			cy: "28",
			r: "2.5"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M124 22 h52 v7 h-22 v58 h-8 v-58 h-22 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M118 98 h64 v5 h-64 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("paper"),
			d: "M124 98 v-9 a4 4 0 0 1 8 0 v9 z M136 98 v-13 a4 4 0 0 1 8 0 v13 z M150 98 v-8 a4 4 0 0 1 8 0 v8 z M164 98 v-11 a4 4 0 0 1 8 0 v11 z"
		})
	] }),
	workshop: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("rect", {
			className: X("wood"),
			x: "24",
			y: "22",
			width: "96",
			height: "58",
			rx: "2"
		}),
		/* @__PURE__ */ L("path", {
			d: "M36 32 v6 M52 32 v6 M68 32 v6 M84 32 v6 M100 32 v6",
			strokeWidth: 1,
			strokeDasharray: "1 5"
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M34 40 h8 v8 h-3 v26 h-2 v-26 h-3 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("bone"),
			d: "M52 40 l16 6 l-2 5 l-16 -6 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M58 49 l4 2 l-9 23 l-4 -2 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("bone"),
			d: "M80 40 h26 l-6 10 h-20 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M84 50 v-4 M90 50 v-4 M96 50 v-4",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", {
			className: X("cloth"),
			d: "M82 60 a7 7 0 1 1 9 9 l8 8 l-4 4 l-8 -8 a7 7 0 0 1 -5 -13 z"
		}),
		/* @__PURE__ */ L("rect", {
			className: X("glass"),
			x: "138",
			y: "26",
			width: "38",
			height: "38"
		}),
		/* @__PURE__ */ L("path", {
			d: "M157 26 V64 M138 45 H176",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M134 64 h46 v5 h-46 z"
		})
	] }),
	attic: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M0 0 H200 V10 H0 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M56 10 h8 v110 h-8 z M136 10 h8 v110 h-8 z"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("glass"),
			cx: "100",
			cy: "58",
			r: "26"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("moon"),
			cx: "108",
			cy: "52",
			r: "11"
		}),
		/* @__PURE__ */ L("path", {
			d: "M74 58 H126 M100 32 V84",
			strokeWidth: 2
		}),
		/* @__PURE__ */ L("path", {
			d: "M200 10 L168 10 M200 10 L200 44 M200 10 L174 36 M184 10 q2 9 -6 16 q8 -5 22 -3 M192 10 q0 5 -3 8 q4 -2 11 -1",
			strokeWidth: 1
		})
	] }),
	"seance-room": /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: X("cloth"),
			d: "M0 0 H200 V16 q-25 12 -50 0 q-25 12 -50 0 q-25 12 -50 0 q-25 12 -50 0 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("cloth"),
			d: "M0 16 q14 50 0 104 h20 q10 -54 0 -104 z M200 16 q-14 50 0 104 h-20 q-10 -54 0 -104 z"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("moon"),
			cx: "100",
			cy: "52",
			r: "12"
		}),
		/* @__PURE__ */ L("path", {
			className: X("moon"),
			d: "M70 42 a10 10 0 1 0 0 20 a13 13 0 0 1 0 -20 z M130 42 a10 10 0 1 1 0 20 a13 13 0 0 0 0 -20 z"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("ink"),
			cx: "48",
			cy: "52",
			r: "6"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("ink"),
			cx: "152",
			cy: "52",
			r: "6"
		}),
		/* @__PURE__ */ L("path", {
			d: "M40 30 q60 16 120 0",
			strokeWidth: 1,
			strokeDasharray: "2 4"
		})
	] })
}, kf = {
	foyer: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M18 120 V40 q14 -14 28 0 V120 z"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("bone"),
			cx: "32",
			cy: "50",
			r: "9"
		}),
		/* @__PURE__ */ L("path", {
			d: "M32 50 V44 M32 50 l4 3",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ L("rect", {
			className: X("glass"),
			x: "25",
			y: "66",
			width: "14",
			height: "44"
		}),
		/* @__PURE__ */ L("path", {
			d: "M32 66 V98",
			strokeWidth: 1.2
		}),
		/* @__PURE__ */ L("circle", {
			className: X("brass"),
			cx: "32",
			cy: "101",
			r: "4"
		}),
		/* @__PURE__ */ L("path", {
			d: "M168 120 V40 M158 120 h20 M168 52 l-10 -8 M168 52 l10 -8 M168 64 l-8 -6",
			strokeWidth: 3
		}),
		/* @__PURE__ */ L("path", {
			className: X("ink"),
			d: "M150 40 h22 l-4 -10 h-14 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M118 96 h34 v5 h-34 z M122 101 h4 v19 h-4 z M144 101 h4 v19 h-4 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("lamp"),
			d: "M127 96 q-4 -9 3 -15 q4 -3 5 0 q4 -3 5 0 q7 6 3 15 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("ink"),
			d: "M133 86 l2 3 l-4 0 z M139 86 l2 3 l-4 0 z M132 92 h8 l-2 2 h-4 z",
			stroke: "none"
		}),
		/* @__PURE__ */ L("path", {
			d: "M135 81 q0 -5 3 -6",
			strokeWidth: 2
		})
	] }),
	study: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("rect", {
			className: X("wood-dark"),
			x: "136",
			y: "26",
			width: "54",
			height: "94"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M140 30 h46 v24 h-46 z M140 58 h46 v24 h-46 z M140 86 h46 v30 h-46 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("cloth"),
			d: "M143 34 h6 v20 h-6 z M158 38 h5 v16 h-5 z M146 62 h7 v20 h-7 z M172 90 h8 v26 h-8 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M149 36 h5 v18 h-5 z M168 32 h7 v22 h-7 z M158 60 h6 v22 h-6 z M144 92 h6 v24 h-6 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("ecto"),
			d: "M163 34 h5 v20 h-5 z M176 36 h6 v18 h-6 z M168 64 h8 v18 h-8 z M154 94 h7 v22 h-7 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("bone"),
			d: "M176 60 l8 22 h-12 z M163 98 h7 v18 h-7 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M34 84 h82 v7 h-82 z M40 91 h6 v29 h-6 z M104 91 h6 v29 h-6 z M52 91 h46 v12 h-46 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("ecto"),
			d: "M56 66 h26 l-5 -12 h-16 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M67 66 h4 v14 h8 v4 h-20 v-4 h8 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("paper"),
			d: "M86 78 l18 -3 l2 8 l-18 2 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("bone"),
			d: "M104 74 q8 -16 16 -18 q-3 12 -13 20 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("cloth"),
			d: "M2 120 V70 q10 -8 20 0 V120 h-4 V98 H6 v22 z"
		})
	] }),
	"drafting-room": /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M44 74 L132 50 l3 8 L47 82 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("sheet"),
			d: "M56 66 L120 49 l3 9 L60 75 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M68 66 l40 -11 M72 71 l28 -8",
			stroke: "var(--hh-sc-paper, none)",
			strokeWidth: 1.5
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M66 78 h7 v42 h-7 z M112 64 h7 v56 h-7 z M58 112 h70 v6 h-70 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M124 46 l14 -26 l4 2 l-13 26 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("lamp"),
			d: "M132 16 l18 6 l-8 12 l-14 -5 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M18 92 h24 v6 h-24 z M22 98 h4 v22 h-4 z M34 98 h4 v22 h-4 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M154 92 h36 l-4 28 h-28 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("paper"),
			d: "M160 92 V72 a4 4 0 0 1 8 0 v20 z M170 92 V62 a4 4 0 0 1 8 0 v30 z M180 92 V78 a3 3 0 0 1 6 0 v14 z"
		})
	] }),
	workshop: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M60 74 h104 v9 h-104 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M66 83 h8 v37 h-8 z M150 83 h8 v37 h-8 z M74 98 h76 v6 h-76 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("ink"),
			d: "M142 74 v-12 h16 v12 z M146 62 v-8 h8 v8 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M134 56 h32",
			strokeWidth: 3
		}),
		/* @__PURE__ */ L("path", {
			className: X("cloth"),
			d: "M78 74 v-14 h34 v14 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M88 60 v-6 h14 v6 M92 66 h6"
		}),
		/* @__PURE__ */ L("path", {
			className: X("bone"),
			d: "M118 74 l14 -20 l4 3 l-12 17 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood"),
			d: "M8 86 h40 v6 h-40 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M14 92 l-6 28 M22 92 l6 28 M42 92 l6 28 M34 92 l-6 28",
			strokeWidth: 3
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M172 96 h24 v24 h-24 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M172 96 l24 24 M196 96 l-24 24",
			strokeWidth: 1.5
		})
	] }),
	attic: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M64 92 q0 -8 8 -8 h52 q8 0 8 8 v28 h-68 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M64 98 h68 v5 h-68 z M94 98 h8 v10 h-8 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("ink"),
			d: "M82 84 v-14 h30 v14 z"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("bone"),
			cx: "88",
			cy: "62",
			r: "9"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("bone"),
			cx: "108",
			cy: "60",
			r: "11"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("ink"),
			cx: "88",
			cy: "62",
			r: "2",
			stroke: "none"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("ink"),
			cx: "108",
			cy: "60",
			r: "2",
			stroke: "none"
		}),
		/* @__PURE__ */ L("path", {
			className: X("lamp"),
			d: "M112 73 l34 -12 v24 z",
			fillOpacity: .45,
			stroke: "none"
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M112 72 h8 v8 h-8 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("paper"),
			d: "M10 96 h34 v24 h-34 z M16 76 h24 v20 h-24 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M10 104 h34 M27 96 v8 M16 84 h24",
			strokeWidth: 1.2
		}),
		/* @__PURE__ */ L("path", {
			className: X("bone"),
			d: "M158 120 V62 q14 -20 28 0 V120 q-5 -5 -9 0 q-5 -5 -10 0 q-4 -5 -9 0 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M166 76 q6 -8 12 0 M165 92 q7 5 14 0",
			strokeWidth: 1.2
		})
	] }),
	"seance-room": /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("ellipse", {
			className: X("cloth"),
			cx: "100",
			cy: "86",
			rx: "46",
			ry: "9"
		}),
		/* @__PURE__ */ L("path", {
			className: X("cloth"),
			d: "M54 86 q4 22 12 34 h68 q8 -12 12 -34 q-46 14 -92 0 z"
		}),
		/* @__PURE__ */ L("path", {
			d: "M70 96 q4 12 8 22 M130 96 q-4 12 -8 22 M100 96 v24",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", {
			className: X("brass"),
			d: "M90 84 h20 l-3 -6 h-14 z"
		}),
		/* @__PURE__ */ L("circle", {
			className: X("ecto"),
			cx: "100",
			cy: "64",
			r: "15"
		}),
		/* @__PURE__ */ L("path", {
			d: "M92 60 q4 -7 12 -6",
			stroke: "var(--hh-sc-bone, none)",
			strokeWidth: 2
		}),
		/* @__PURE__ */ L("path", {
			className: X("wood-dark"),
			d: "M18 120 V66 h8 v26 h20 v28 h-6 v-20 H26 v20 z M182 120 V66 h-8 v26 h-20 v28 h6 v-20 h14 v20 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("bone"),
			d: "M134 78 h6 v-14 h-6 z"
		}),
		/* @__PURE__ */ L("path", {
			className: X("lamp"),
			d: "M137 52 q4 6 0 11 q-4 -5 0 -11 z",
			strokeWidth: 1.2
		})
	] })
};
function Af({ room: e }) {
	return /* @__PURE__ */ L(Tt, {
		viewBox: "0 0 200 120",
		className: "hh-stage-art hh-stage-wall-art",
		preserveAspectRatio: "xMidYMax meet",
		data: { "data-scene": e },
		children: Of[e]
	});
}
function jf({ room: e }) {
	return /* @__PURE__ */ L(Tt, {
		viewBox: "0 0 200 120",
		className: "hh-stage-art hh-stage-prop-art",
		preserveAspectRatio: "xMidYMax meet",
		data: { "data-scene": e },
		children: kf[e]
	});
}
function Mf() {
	return /* @__PURE__ */ R(Tt, {
		viewBox: "0 0 400 70",
		className: "hh-stage-art hh-stage-roof-art",
		preserveAspectRatio: "none",
		children: [
			/* @__PURE__ */ L("path", {
				className: X("wall-attic"),
				d: "M286 44 V10 h26 v40 z"
			}),
			/* @__PURE__ */ L("path", {
				className: X("ink"),
				d: "M282 10 h34 v6 h-34 z"
			}),
			/* @__PURE__ */ L("path", {
				className: X("roof"),
				d: "M2 70 L200 4 L398 70 z",
				strokeWidth: 2.5
			}),
			/* @__PURE__ */ L("path", {
				d: "M40 60 H360 M74 49 H326 M108 38 H292 M142 27 H258 M176 16 H224",
				strokeWidth: 1,
				strokeDasharray: "14 6"
			}),
			/* @__PURE__ */ L("circle", {
				className: X("glass"),
				cx: "200",
				cy: "44",
				r: "9"
			}),
			/* @__PURE__ */ L("path", {
				d: "M191 44 H209 M200 35 V53",
				strokeWidth: 1.2
			})
		]
	});
}
function Nf() {
	return /* @__PURE__ */ R(Tt, {
		viewBox: "0 0 200 90",
		className: "hh-stage-art hh-stage-sky-art",
		preserveAspectRatio: "xMaxYMin meet",
		children: [
			/* @__PURE__ */ L("circle", {
				className: X("moon"),
				cx: "160",
				cy: "30",
				r: "20"
			}),
			/* @__PURE__ */ L("path", {
				d: "M150 22 a4 4 0 1 0 0.1 0 M166 36 a6 6 0 1 0 0.1 0 M168 20 a2 2 0 1 0 0.1 0",
				strokeWidth: 1
			}),
			/* @__PURE__ */ L("path", {
				className: X("ink"),
				d: "M100 34 q5 -7 10 0 q3 -3 6 0 q5 -7 10 0 q-7 -1 -9 5 q-2 -3 -4 -3 q-2 0 -4 3 q-2 -6 -9 -5 z"
			}),
			/* @__PURE__ */ L("path", {
				className: X("ink"),
				d: "M58 58 q4 -6 8 0 q2 -2 4 0 q4 -6 8 0 q-5 -1 -7 4 q-1 -2 -3 -2 q-2 0 -3 2 q-2 -5 -7 -4 z"
			}),
			/* @__PURE__ */ L("path", {
				className: X("ink"),
				d: "M124 66 q3 -5 6 0 q2 -2 4 0 q3 -5 6 0 q-4 -1 -5 3 q-1 -2 -3 -2 q-2 0 -3 2 q-1 -4 -5 -3 z"
			}),
			/* @__PURE__ */ L("path", {
				d: "M20 16 v6 M17 19 h6 M84 10 v4 M82 12 h4 M40 44 v4 M38 46 h4",
				strokeWidth: 1.2
			})
		]
	});
}
function Pf() {
	return /* @__PURE__ */ R(Tt, {
		viewBox: "0 0 400 60",
		className: "hh-stage-art hh-stage-yard-art",
		preserveAspectRatio: "xMidYMax meet",
		children: [
			/* @__PURE__ */ L("path", {
				d: "M0 58 H400",
				strokeWidth: 2
			}),
			/* @__PURE__ */ L("path", {
				className: X("ink"),
				d: "M26 58 V30 q-10 -8 -14 -20 q8 8 14 10 q-2 -12 4 -20 q0 12 4 18 q8 -4 12 -14 q-2 16 -12 24 V58 z"
			}),
			/* @__PURE__ */ L("path", {
				d: "M58 58 V40 l3 -4 l3 4 V58 M72 58 V38 l3 -4 l3 4 V58 M86 58 V42 l3 -4 l3 4 V58 M54 46 H96 M54 52 H96",
				strokeWidth: 1.5
			}),
			/* @__PURE__ */ L("path", {
				className: X("bone"),
				d: "M316 58 V40 a8 8 0 0 1 16 0 V58 z M344 58 V46 a6 6 0 0 1 12 0 V58 z"
			}),
			/* @__PURE__ */ L("path", {
				d: "M320 44 h8 M324 40 v10",
				strokeWidth: 1.2
			}),
			/* @__PURE__ */ L("path", {
				className: X("lamp"),
				d: "M372 58 q-12 -2 -10 -12 q2 -8 12 -7 q10 -1 12 7 q2 10 -10 12 z"
			}),
			/* @__PURE__ */ L("path", {
				className: X("ink"),
				d: "M368 46 l3 4 h-6 z M378 46 l3 4 h-6 z M367 53 h14 l-3 3 h-8 z",
				stroke: "none"
			}),
			/* @__PURE__ */ L("path", {
				d: "M374 39 q0 -5 4 -6",
				strokeWidth: 2
			})
		]
	});
}
X("cloth"), X("paper"), X("bone"), X("brass"), X("wood-dark"), X("brass"), X("bone"), X("wood-dark"), X("ink"), X("brass"), X("brass"), X("wall-attic"), X("bone"), X("roof"), X("lamp"), X("wood"), X("lamp"), X("bone"), X("brass");
// src/components/RoomDiorama.tsx
function Ff(e, t) {
	let n = Dl(t), r = e.closest(".hh-ui")?.querySelectorAll("[data-opener-key]") ?? [];
	for (let e of r) if (e.getAttribute("data-opener-key") === n) {
		e.click();
		return;
	}
}
function If(e, t) {
	return {
		"--hh-i": e,
		"--hh-n": t
	};
}
function Lf({ room: e, interactive: t = !1 }) {
	let n = (e) => t ? {
		"data-pick": e.kind,
		onClick: (t) => {
			t.stopPropagation(), Ff(t.currentTarget, e);
		}
	} : {}, r = e.ghosts.some((e) => e.state === "working" || e.state === "waiting");
	return /* @__PURE__ */ R("div", {
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
			/* @__PURE__ */ L("span", { className: "hh-stage-plane hh-stage-ceiling" }),
			/* @__PURE__ */ L("span", { className: "hh-stage-plane hh-stage-left" }),
			/* @__PURE__ */ L("span", { className: "hh-stage-plane hh-stage-right" }),
			/* @__PURE__ */ L("span", { className: "hh-stage-plane hh-stage-floor" }),
			/* @__PURE__ */ R("span", {
				className: "hh-stage-plane hh-stage-back",
				"data-doors": Math.min(e.doors.length, 2),
				children: [/* @__PURE__ */ L(Af, { room: e.roomId }), e.doors.length === 0 ? null : /* @__PURE__ */ L("span", {
					className: "hh-stage-doors",
					children: e.doors.map((t) => /* @__PURE__ */ R("span", {
						className: "hh-stage-door",
						"data-door": t.state,
						...n({
							kind: "door",
							roomId: e.roomId,
							phase: t.phase,
							proposalId: t.proposalId
						}),
						children: [/* @__PURE__ */ L("span", { className: "hh-stage-doorway" }), /* @__PURE__ */ R("span", {
							className: "hh-stage-leaf",
							children: [/* @__PURE__ */ L("span", { className: "hh-stage-mark" }), /* @__PURE__ */ L("span", { className: "hh-stage-mark" })]
						})]
					}, t.phase))
				})]
			}),
			/* @__PURE__ */ L("span", { className: "hh-stage-glow" }),
			/* @__PURE__ */ L("span", { className: "hh-stage-eyes" }),
			/* @__PURE__ */ L("span", {
				className: "hh-stage-props",
				children: /* @__PURE__ */ L(jf, { room: e.roomId })
			}),
			e.ghosts.length === 0 ? null : /* @__PURE__ */ L("span", {
				className: "hh-stage-ghosts",
				children: e.ghosts.map((t, r) => /* @__PURE__ */ L("span", {
					className: "hh-stage-ghost",
					"data-ghost": t.state,
					style: If(r, e.ghosts.length),
					...n({
						kind: "ghost",
						roomId: e.roomId,
						ghostId: t.ghostId
					}),
					children: /* @__PURE__ */ L(Mt, {
						state: t.state,
						variant: Ot(t.ghostId),
						size: 72
					})
				}, t.ghostId))
			}),
			/* @__PURE__ */ L("span", { className: "hh-stage-web" }),
			/* @__PURE__ */ L("span", { className: "hh-stage-mist" })
		]
	});
}
// src/components/RoomHotspots.tsx
var Rf = /* @__PURE__ */ new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End"
]);
function zf({ room: e, needsYou: t, openKey: n, panelId: i, onOpen: a, onArrow: o }) {
	let c = M(), l = M(), u = {
		kind: "room",
		roomId: e.roomId
	}, d = Dl(u), f = [t > 0 ? c : null, e.diagnostic === null ? null : l].filter((e) => e !== null).join(" "), [p, m, h] = Cl(e), g = e.readOnly && !e.locked && e.integrity === "valid";
	return /* @__PURE__ */ R("li", {
		className: "hh-ui-room-cell",
		"data-room": e.roomId,
		"data-integrity": e.integrity,
		"data-locked": e.locked,
		"data-read-only": e.readOnly,
		"data-needs": t > 0,
		children: [/* @__PURE__ */ R("div", {
			className: "hh-ui-room-controls",
			children: [
				/* @__PURE__ */ R("button", {
					type: "button",
					className: "hh-ui-room-control",
					"data-room-control": e.roomId,
					"data-opener-key": d,
					"aria-label": wl(e),
					"aria-describedby": f === "" ? void 0 : f,
					"aria-disabled": e.locked ? !0 : void 0,
					"aria-expanded": n === d,
					"aria-controls": n === d ? i : void 0,
					onClick: (e) => a(u, e.currentTarget),
					onKeyDown: (t) => {
						!Rf.has(t.key) || t.altKey || t.ctrlKey || t.metaKey || (t.preventDefault(), o(e.roomId, t.key));
					},
					children: [
						/* @__PURE__ */ R("span", {
							className: "hh-ui-room-name",
							children: [
								e.locked ? /* @__PURE__ */ L(v, {
									size: 16,
									"aria-hidden": !0
								}) : null,
								" ",
								e.name
							]
						}),
						/* @__PURE__ */ R("span", {
							className: "hh-ui-state",
							"data-field": "phase",
							children: [/* @__PURE__ */ L(s, {
								size: 16,
								"aria-hidden": !0
							}), /* @__PURE__ */ R("span", { children: [
								p.label,
								": ",
								/* @__PURE__ */ L("span", {
									className: "hh-ui-state-word",
									children: p.value
								})
							] })]
						}),
						/* @__PURE__ */ R("span", {
							className: "hh-ui-state",
							"data-field": "door",
							"data-door": e.door,
							children: [/* @__PURE__ */ L(Pt, {
								state: e.door,
								size: 18
							}), /* @__PURE__ */ R("span", { children: [
								m.label,
								": ",
								/* @__PURE__ */ L("span", {
									className: "hh-ui-state-word",
									children: m.value
								})
							] })]
						}),
						/* @__PURE__ */ R("span", {
							className: "hh-ui-state",
							"data-field": "ghost",
							"data-ghost": e.ghost,
							children: [/* @__PURE__ */ L(Mt, {
								state: e.ghost,
								size: 22
							}), /* @__PURE__ */ R("span", { children: [
								h.label,
								": ",
								/* @__PURE__ */ L("span", {
									className: "hh-ui-state-word",
									children: h.value
								})
							] })]
						})
					]
				}),
				e.ghosts.length === 0 ? null : /* @__PURE__ */ L("div", {
					className: "hh-ui-ghosts",
					children: e.ghosts.map((t) => {
						let r = {
							kind: "ghost",
							roomId: e.roomId,
							ghostId: t.ghostId
						}, o = Dl(r);
						return /* @__PURE__ */ R("button", {
							type: "button",
							className: "hh-ui-ghost-control",
							"data-ghost-control": t.ghostId,
							"data-ghost": t.state,
							"data-opener-key": o,
							"aria-label": Tl(e, t),
							"aria-expanded": n === o,
							"aria-controls": n === o ? i : void 0,
							onClick: (e) => a(r, e.currentTarget),
							children: [/* @__PURE__ */ L(Mt, {
								state: t.state,
								variant: Ot(t.ghostId),
								size: 56
							}), /* @__PURE__ */ L("span", {
								className: "hh-ui-state",
								children: /* @__PURE__ */ R("span", { children: [
									/* @__PURE__ */ R("span", {
										className: "hh-ui-ghost-name",
										children: [t.name, ":"]
									}),
									" ",
									/* @__PURE__ */ L("span", {
										className: "hh-ui-state-word",
										children: oa(t.state)
									}),
									t.pendingText === null ? null : `, ${t.pendingText}`
								] })
							})]
						}, t.ghostId);
					})
				}),
				e.doors.length === 0 ? null : /* @__PURE__ */ L("div", {
					className: "hh-ui-doors",
					children: e.doors.map((t) => {
						let r = {
							kind: "door",
							roomId: e.roomId,
							phase: t.phase,
							proposalId: t.proposalId
						}, o = Dl(r);
						return /* @__PURE__ */ R("button", {
							type: "button",
							className: "hh-ui-door-control",
							"data-door-control": t.phase,
							"data-phase": t.phase,
							"data-status": t.phaseStatus ?? "unavailable",
							"data-door": t.state,
							"data-opener-key": o,
							"aria-label": El(e, t),
							"aria-expanded": n === o,
							"aria-controls": n === o ? i : void 0,
							onClick: (e) => a(r, e.currentTarget),
							children: [/* @__PURE__ */ L(Pt, { state: t.state }), /* @__PURE__ */ L("span", {
								className: "hh-ui-state",
								children: /* @__PURE__ */ R("span", { children: [
									t.phaseName,
									" door: ",
									/* @__PURE__ */ L("span", {
										className: "hh-ui-state-word",
										children: oa(t.state)
									}),
									/* @__PURE__ */ R("span", {
										className: "hh-ui-door-words",
										children: [" ", t.text]
									}),
									t.phaseText === null ? null : /* @__PURE__ */ R("span", {
										className: "hh-ui-door-words",
										children: [" ", t.phaseText]
									})
								] })
							})]
						}, t.phase);
					})
				}),
				t > 0 ? /* @__PURE__ */ R("p", {
					className: "hh-ui-state hh-ui-room-needs",
					id: c,
					children: [/* @__PURE__ */ L(r, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", {
						className: "hh-ui-state-word",
						children: vo(t)
					})]
				}) : null,
				e.diagnostic === null ? null : /* @__PURE__ */ R("p", {
					className: g ? "hh-ui-reason hh-ui-state hh-ui-visually-hidden" : "hh-ui-reason hh-ui-state",
					id: l,
					"data-room-reason": e.locked ? "locked" : e.readOnly ? "read-only" : "diagnostic",
					children: [e.locked || e.readOnly ? /* @__PURE__ */ L(v, {
						size: 16,
						"aria-hidden": !0
					}) : /* @__PURE__ */ L(k, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.diagnostic })]
				})
			]
		}), /* @__PURE__ */ L("div", {
			className: "hh-ui-room-scene",
			children: /* @__PURE__ */ L(Lf, {
				room: e,
				interactive: !0
			})
		})]
	});
}
// src/components/HouseMap.tsx
var Bf = "Mansion rooms", Vf = "Arrow keys move between rooms. Enter opens a room, a ghost or a door. Escape closes it. Doors open only when you approve them.";
function Hf({ projection: e, openSurface: t, motion: n, openKey: r = null, panelId: i = "", view: a = "front" }) {
	let o = M(), s = P(null), c = N(() => new Set(e.rooms.map((e) => e.roomId)), [e.rooms]), l = c.has("seance-room"), u = A((t, n) => {
		let r = e.rooms.map((e) => e.roomId), i = n === "Home" ? r[0] : n === "End" ? r[r.length - 1] : aa(t, n, c);
		i !== void 0 && i !== t && s.current?.querySelector(`[data-room-control="${i}"]`)?.focus();
	}, [e.rooms, c]);
	return /* @__PURE__ */ R("nav", {
		className: "hh-ui-map",
		"aria-label": Bf,
		"data-motion-art": n,
		children: [
			/* @__PURE__ */ L("h3", {
				className: "hh-ui-map-title",
				id: o,
				tabIndex: -1,
				"data-map-title": !0,
				children: "The house"
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-ui-reason hh-ui-map-help",
				children: Vf
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-ui-house",
				"data-view": a,
				children: [
					/* @__PURE__ */ L(Nf, {}),
					/* @__PURE__ */ L(Mf, {}),
					/* @__PURE__ */ L("ol", {
						className: "hh-ui-rooms",
						"data-seance": l ? "shown" : "hidden",
						ref: s,
						"aria-labelledby": o,
						children: e.rooms.map((n) => /* @__PURE__ */ L(zf, {
							room: n,
							needsYou: e.needsYou.filter((e) => e.roomId === n.roomId).length,
							openKey: r,
							panelId: i,
							onOpen: t,
							onArrow: u
						}, n.roomId))
					}),
					/* @__PURE__ */ L(Pf, {}),
					/* @__PURE__ */ R("p", {
						className: "hh-stage-titleblock",
						"aria-hidden": "true",
						children: [
							/* @__PURE__ */ L("span", { children: "Section through every floor" }),
							/* @__PURE__ */ L("span", { children: "Drawn after dark" }),
							/* @__PURE__ */ L("span", { children: "Not to scale" })
						]
					})
				]
			})
		]
	});
}
var Uf = `
.hh-ui { ${Bn("light")}
  --hh-canvas: var(--card, var(--hh-fb-canvas));
  --hh-surface: var(--card, var(--hh-fb-surface));
  --hh-surface-raised: var(--input, var(--hh-fb-surface-raised));
  --hh-text: var(--card-fg, var(--text, var(--hh-fb-text)));
  --hh-text-muted: var(--muted, var(--hh-fb-text-muted));
  --hh-border: var(--border-strong, var(--hh-fb-border));
  --hh-border-soft: var(--border, var(--hh-fb-border));
  --hh-focus: var(--ring, var(--hh-fb-focus));
  --hh-accent: var(--warn, var(--hh-fb-accent));
  --hh-primary: var(--accent, var(--hh-fb-accent));
  --hh-primary-text: var(--accent-fg, var(--hh-fb-accent-text));
  --hh-danger: var(--warn, var(--hh-fb-danger));
  --hh-ok: var(--ok, var(--hh-fb-ok));
  --hh-candle: var(--warn, var(--hh-fb-candle));
  --hh-ghost: var(--hh-fb-ghost);
  --hh-working: var(--hh-fb-working);
  --hh-font-sans: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  --hh-font-serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  color: var(--hh-text); background: var(--hh-canvas); font-family: var(--hh-font-sans); font-size: 1rem; line-height: 1.45;
  display: grid; gap: 14px; min-width: 0; max-width: 100%; box-sizing: border-box; padding: 16px;
  border: 1px solid var(--hh-border-soft); border-radius: 12px; overflow-wrap: anywhere; }
.hh-ui[data-theme='dark'] { ${Bn("dark")} }
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
`, Wf = 1.2, Z = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, black)`, Q = (e, t) => `color-mix(in srgb, var(${e}) ${t}%, transparent)`, Gf = `
.hh-ui { ${Wn("light")}
  --hh-font-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
  --hh-font-label: var(--hh-font-sans);
  --hh-depth: 110px; --hh-room-h: clamp(130px, 30vw, 200px); border-radius: 16px; }
.hh-ui[data-theme='dark'] { ${Wn("dark")} }

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
    linear-gradient(${Q("--hh-sc-sheet-ink", 22)} 1px, transparent 1px), linear-gradient(90deg, ${Q("--hh-sc-sheet-ink", 22)} 1px, transparent 1px);
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
    linear-gradient(to top, ${Z("--hh-w", 58)} 0 22%, ${Z("--hh-sc-wood-dark", 80)} 22% 24.5%, transparent 24.5%),
    repeating-linear-gradient(90deg, transparent 0 13px, ${Q("--hh-sc-bone", 9)} 13px 26px),
    var(--hh-w); }
.hh-stage-floor { left: 0; right: 0; bottom: 0; height: var(--hh-depth); transform-origin: 50% 100%; transform: rotateX(90deg);
  background:
    linear-gradient(to bottom, ${Z("--hh-sc-ink", 100)} -10%, transparent 55%),
    repeating-linear-gradient(90deg, var(--hh-sc-floor) 0 26px, ${Z("--hh-sc-floor", 62)} 26px 28px); }
.hh-stage-ceiling { left: 0; right: 0; top: 0; height: var(--hh-depth); transform-origin: 50% 0; transform: rotateX(-90deg);
  background: linear-gradient(to top, ${Z("--hh-w", 30)}, ${Z("--hh-w", 46)}); }
.hh-stage-left { left: 0; top: 0; bottom: 0; width: var(--hh-depth); transform-origin: 0 50%; transform: rotateY(90deg);
  background: linear-gradient(to top, ${Z("--hh-w", 40)} 0 22%, ${Z("--hh-sc-wood-dark", 60)} 22% 24.5%, transparent 24.5%), ${Z("--hh-w", 70)}; }
.hh-stage-right { right: 0; top: 0; bottom: 0; width: var(--hh-depth); transform-origin: 100% 50%; transform: rotateY(-90deg);
  background: linear-gradient(to top, ${Z("--hh-w", 34)} 0 22%, ${Z("--hh-sc-wood-dark", 52)} 22% 24.5%, transparent 24.5%), ${Z("--hh-w", 58)}; }
.hh-stage[data-scene='workshop'] .hh-stage-back { background:
    repeating-linear-gradient(0deg, transparent 0 11px, ${Z("--hh-w", 55)} 11px 13px),
    repeating-linear-gradient(90deg, transparent 0 30px, ${Z("--hh-w", 55)} 30px 32px), var(--hh-w); }
.hh-stage[data-scene='attic'] .hh-stage-back { background:
    repeating-linear-gradient(90deg, transparent 0 22px, ${Z("--hh-w", 55)} 22px 24px), var(--hh-w); }

.hh-stage-wall-art { position: absolute; left: 0; bottom: 0; width: 100%; height: 100%; }
.hh-stage-back[data-doors='1'] .hh-stage-wall-art { left: 24%; width: 76%; }
.hh-stage-back[data-doors='2'] .hh-stage-wall-art { left: 42%; width: 58%; }
.hh-stage-props { position: absolute; inset: 0; transform: translateZ(calc(-0.42 * var(--hh-depth))); pointer-events: none; }
.hh-stage-prop-art { position: absolute; left: 0; bottom: 0; width: 100%; height: 92%; }
.hh-stage-glow { position: absolute; inset: -6%; transform: translateZ(calc(-0.7 * var(--hh-depth))); pointer-events: none;
  background: radial-gradient(closest-side, ${Q("--hh-sc-ink", 0)}, ${Q("--hh-sc-ink", 62)}); }
.hh-stage[data-lit='true'] .hh-stage-glow { background: radial-gradient(closest-side, ${Q("--hh-sc-lamp", 42)}, ${Q("--hh-sc-lamp", 8)} 70%, transparent); }
.hh-stage[data-locked='true'] .hh-stage-glow { background: repeating-linear-gradient(135deg, ${Q("--hh-sc-ink", 70)} 0 12px, ${Q("--hh-sc-ink", 40)} 12px 24px); }

.hh-stage-doors { position: absolute; left: 5%; bottom: 0; height: 68%; display: flex; align-items: flex-end; gap: 8%;
  width: 40%; transform-style: preserve-3d; }
.hh-stage-door { position: relative; display: block; flex: none; height: 100%; aspect-ratio: 5 / 9; transform-style: preserve-3d;
  background: var(--hh-sc-ink); border: 3px solid var(--hh-sc-wood-dark); border-bottom-width: 0;
  border-radius: 46% 46% 0 0 / 24% 24% 0 0; }
.hh-stage-doorway { position: absolute; inset: 0; display: block; border-radius: inherit; }
.hh-stage-door[data-door='open'] .hh-stage-doorway, .hh-stage-door[data-door='waiting'] .hh-stage-doorway {
  background: radial-gradient(ellipse at 50% 70%, var(--hh-sc-moon), var(--hh-sc-lamp) 55%, ${Z("--hh-sc-lamp", 45)}); }
.hh-stage-leaf { position: absolute; inset: 0; display: block; border-radius: inherit; transform-origin: 0 50%;
  border: 2px solid var(--hh-sc-ink);
  background:
    radial-gradient(circle at 82% 56%, var(--hh-sc-brass) 0 3px, var(--hh-sc-ink) 3px 4.5px, transparent 4.5px),
    linear-gradient(${Z("--hh-sc-wood", 70)}, ${Z("--hh-sc-wood", 70)}) 50% 30% / 56% 26% no-repeat,
    linear-gradient(${Z("--hh-sc-wood", 70)}, ${Z("--hh-sc-wood", 70)}) 50% 82% / 56% 30% no-repeat,
    var(--hh-sc-wood); }
.hh-stage-door[data-door='waiting'] .hh-stage-leaf { transform: rotateY(-22deg); }
.hh-stage-door[data-door='open'] .hh-stage-leaf { transform: rotateY(-78deg); }
.hh-stage-door[data-door='not_applicable'] .hh-stage-leaf, .hh-stage-door[data-door='unavailable'] .hh-stage-leaf {
  background: ${Z("--hh-w", 80)}; border-style: dashed; }
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
    repeating-radial-gradient(circle at 0 0, transparent 0 22%, ${Q("--hh-sc-bone", 55)} 22% 24%),
    conic-gradient(from 90deg at 0 0, ${Q("--hh-sc-bone", 55)} 0 2deg, transparent 2deg 28deg, ${Q("--hh-sc-bone", 55)} 28deg 30deg, transparent 30deg 58deg, ${Q("--hh-sc-bone", 55)} 58deg 60deg, transparent 60deg 88deg, ${Q("--hh-sc-bone", 55)} 88deg 90deg, transparent 90deg); }
.hh-stage-mist { position: absolute; left: 0; right: 0; bottom: 0; display: block; height: 26%; pointer-events: none;
  background: linear-gradient(to top, ${Q("--hh-sc-paper", 30)}, ${Q("--hh-sc-paper", 8)} 60%, transparent); }

.hh-ui { position: relative; padding: 0; gap: 0; border: 0; border-radius: 0; background: var(--hh-sc-poche); }
.hh-ui-behind { gap: 0; }
.hh-ui-behind ~ .hh-ui-behind { padding: 16px; gap: 14px; background: var(--hh-canvas); }
.hh-ui-replay-bar { margin: 10px 12px; }
.hh-ui-notes { padding: 10px 12px; }
.hh-ui-panel { width: auto; margin: 12px; border-width: 2px; border-radius: 6px; box-shadow: 0 10px 30px ${Q("--hh-sc-ink", 70)}; }
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

.hh-stage-room { position: relative; display: grid; min-width: 0; background: var(--hh-sc-poche); }
.hh-stage-room-title { position: absolute; z-index: 3; left: 12px; bottom: 12px; max-width: 46%; padding: 2px 12px; font-size: 0.9375rem;
  color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 2px solid var(--hh-sc-ink); border-radius: 4px; }
.hh-stage-room-scene { position: relative; min-width: 0; width: 100%; aspect-ratio: 1200 / 750; overflow: hidden; background: var(--hh-sc-poche); }
.hh-stage-room-scene::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at 50% 46%, transparent 52%, ${Q("--hh-sc-ink", 62)} 100%); }
.hh-stage-spots { position: absolute; inset: 0; pointer-events: none; }
.hh-stage-spot, .hh-stage-figure { position: absolute; display: block; pointer-events: auto; cursor: pointer; }
.hh-stage-spot:hover { background: ${Q("--hh-sc-moon", 14)}; outline: 2px solid var(--hh-sc-moon); outline-offset: -2px; border-radius: 4px; }
.hh-stage-figure { width: 9%; aspect-ratio: 160 / 170; bottom: 27%;
  left: calc(26% + (var(--hh-i) + 0.5) / var(--hh-n) * 46% - 4.5%); }
.hh-stage-figure[data-ghost='failed'], .hh-stage-figure[data-ghost='blocked'] { bottom: 21%; }
.hh-stage-figure[data-ghost='working'] { bottom: 30%; }
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

.hh-stage-guide { display: flex; align-items: flex-end; gap: 8px; min-width: 0; padding: 12px; }
.hh-stage-balloon { position: relative; flex: 1 1 auto; min-width: 0; display: grid; gap: 5px; padding: 10px 14px 12px; margin-bottom: 30px;
  color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 10px;
  box-shadow: 3px 4px 0 ${Q("--hh-sc-ink", 55)}; }
.hh-stage-balloon::after { content: ''; position: absolute; right: 40px; bottom: -11px; width: 18px; aspect-ratio: 1;
  background: var(--hh-sc-balloon); border-right: 2px solid var(--hh-sc-ink); border-bottom: 2px solid var(--hh-sc-ink);
  transform: skewX(18deg) rotate(45deg); }
.hh-stage-balloon-title { font-family: var(--hh-font-serif); font-weight: 700; font-size: 1.0625rem; line-height: 1.25; }
.hh-stage-balloon-hint { font-family: var(--hh-font-serif); font-size: 0.875rem; }
.hh-stage-options { list-style: none; margin: 2px 0 0; padding: 0; display: grid; gap: 1px; min-width: 0; }
.hh-stage-option { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; font: inherit; font-family: var(--hh-font-serif);
  font-size: 0.9375rem; text-align: left; color: var(--hh-sc-ink); background: transparent; border: 2px solid transparent; border-radius: 999px;
  padding: 2px 12px 2px 3px; cursor: pointer; overflow-wrap: anywhere; }
.hh-stage-option:hover { border-color: var(--hh-sc-ink); background: ${Q("--hh-sc-brass", 40)}; }
.hh-stage-bullet { flex: none; display: inline-grid; place-items: center; width: 1.375rem; aspect-ratio: 1; border-radius: 50%;
  color: var(--hh-sc-ink); border: 2px solid var(--hh-sc-ink);
  background: radial-gradient(circle at 35% 30%, var(--hh-sc-moon), var(--hh-sc-brass) 62%); }
.hh-stage-option:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 1px; background: ${Q("--hh-sc-brass", 40)}; }
.hh-stage-keeper { flex: none; display: grid; justify-items: center; gap: 2px; }
.hh-stage-caretaker { position: relative; display: block; width: clamp(72px, 13vw, 132px); aspect-ratio: 190 / 250; }
.hh-stage-exit { display: inline-flex; align-items: center; gap: 4px; font: inherit; font-family: var(--hh-font-serif); font-weight: 700;
  font-size: 0.8125rem; color: var(--hh-sc-ecto); background: var(--hh-sc-ink); border: 2px solid var(--hh-sc-ecto); border-radius: 3px;
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
.hh-sf-glass { fill: ${Z("--hh-sc-sheet-ink", 38)}; }
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
  .hh-ui { grid-template-columns: minmax(0, 1fr); --hh-stage-w: min(100%, 138vh); }
  .hh-ui > .hh-ui-behind:first-of-type { grid-area: 1 / 1; display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; }
  .hh-ui > .hh-ui-behind:first-of-type > * { width: var(--hh-stage-w); }
  .hh-ui-replay-bar { grid-row: 1; margin: 10px 0; }
  .hh-stage-room { grid-row: 2; grid-column: 1; }
  .hh-ui-toolbar { grid-row: 2; grid-column: 1; align-self: start; z-index: 5; }
  .hh-ui-notes { grid-row: 3; }
  .hh-stage-guide { position: absolute; z-index: 3; right: 1.2%; bottom: 1.6%; width: min(22rem, 34%); padding: 0;
    flex-direction: column; align-items: flex-end; gap: 0; }
  .hh-stage-balloon { flex: none; width: 100%; margin-bottom: 14px; }
  .hh-ui-panel[data-mode='region'] { grid-area: 1 / 1; align-self: center; justify-self: center; z-index: 4;
    width: calc(var(--hh-stage-w) * 0.6); max-width: 54rem; translate: calc(var(--hh-stage-w) * -0.17) 0;
    max-height: min(80vh, 54vw); overflow-y: auto; margin: 0; }
  .hh-ui > .hh-ui-behind ~ .hh-ui-behind { position: absolute; z-index: 6; left: 50%; top: 3.5rem; translate: -50% 0;
    width: calc(var(--hh-stage-w) * 0.92); max-height: min(82vh, 56vw); overflow-y: auto; border: 2px solid var(--hh-sc-ink);
    border-radius: 6px; box-shadow: 0 14px 40px ${Q("--hh-sc-ink", 80)}; }
  .hh-ui[data-map='closed'] > .hh-ui-behind ~ .hh-ui-behind:not(:focus-within) { width: 1px; height: 1px; padding: 0; border: 0;
    overflow: hidden; clip-path: inset(50%); }
  .hh-ui-door-control .hh-ui-door-words { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .hh-ui-house[data-view='turned'] { perspective-origin: 30% 44%; }
  .hh-ui-house[data-view='turned'] .hh-ui-rooms, .hh-ui-house[data-view='turned'] .hh-stage-roof-art { transform: rotateY(16deg); transform-origin: 50% 50%; }
}

@keyframes hh-stage-hover { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } }
@keyframes hh-stage-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.72; } }
@media (prefers-reduced-motion: no-preference) {
  .hh-ui[data-motion='low-frequency'] .hh-stage-leaf { transition: transform ${Wf}s cubic-bezier(0.3, 0.1, 0.2, 1); }
  .hh-ui[data-motion='low-frequency'] .hh-ui-rooms, .hh-ui[data-motion='low-frequency'] .hh-stage-roof-art { transition: transform 1.4s cubic-bezier(0.3, 0.1, 0.2, 1); }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='idle'] { animation: hh-stage-hover 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='working'] { animation: hh-stage-hover 2.4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='waiting'] { animation: hh-stage-hover 3s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='done'] { animation: hh-stage-hover 6s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage[data-lit='true'] .hh-stage-glow { animation: hh-stage-breathe 5s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-eyes { animation: hh-stage-breathe 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-mist { animation: hh-stage-breathe 7s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-figure .hh-paint-spectre { animation: hh-stage-hover 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-caretaker .hh-paint-caretaker { animation: hh-stage-hover 6s ease-in-out infinite; }
}
`, Kf = [
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
];
new Map(Kf.map((e) => [e.id, e]));
function qf(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
RegExp(`(?<![A-Za-z0-9_$])(?:${Kf.map((e) => qf(e.kiro)).join("|")})(?![A-Za-z0-9_$])`, "i");
// src/core/house-guide.ts
function Jf(e) {
	return e.length <= 1 ? e[0] ?? "" : `${e.slice(0, -1).join(", ")} and ${e[e.length - 1]}`;
}
var Yf = {
	foyer: "This is the Foyer, the way in and out. The rooms open off it in the order the work is done.",
	study: "This is the Study. The Archivist writes the requirements here.",
	"drafting-room": "This is the Drafting Room. The Draughtsman turns the requirements into a design here.",
	workshop: "This is the Workshop. The Foreman plans the tasks and the Tinkers build them.",
	attic: "This is the Attic. It keeps the recording of everything that happened, ready to play back.",
	"seance-room": "This is the Séance Room, where finished work is reviewed."
};
function Xf(e) {
	if (e.locked) return e.diagnostic ?? "This room is locked.";
	let t = e.waitingItems.length;
	if (t > 0) return t === 1 ? "One thing in this room is waiting for you. It is on this room's sheet." : `${t} things in this room are waiting for you. They are on this room's sheet.`;
	let n = (t) => e.ghosts.filter((e) => e.state === t).map((e) => e.name), r = n("failed");
	if (r.length > 0) return `${Jf(r)} ${r.length === 1 ? "has" : "have"} failed. This room's sheet says why.`;
	let i = n("blocked");
	if (i.length > 0) return `${Jf(i)} ${i.length === 1 ? "is" : "are"} blocked. This room's sheet says why.`;
	let a = n("working");
	return a.length > 0 ? `${Jf(a)} ${a.length === 1 ? "is" : "are"} at work. A door opens only when you approve it.` : Yf[e.roomId];
}
function Zf(e, t) {
	let n = e.rooms.findIndex((e) => e.roomId === t);
	if (n < 0) return null;
	let r = (e) => e === void 0 ? null : {
		roomId: e.roomId,
		name: e.name
	};
	return {
		text: Xf(e.rooms[n]),
		previous: r(e.rooms[n - 1]),
		next: r(e.rooms[n + 1])
	};
}
// src/components/RoomStage.tsx
var Qf = "To open something, press it. Or choose:";
function $f(e, t) {
	e.closest(".hh-ui")?.querySelector(t)?.click();
}
function ep(e, t, n, r) {
	return {
		left: `${e}%`,
		top: `${t}%`,
		width: `${n}%`,
		height: `${r}%`
	};
}
var tp = ep(2.5, 28, 8.5, 53), np = ep(89, 28, 8.5, 53), rp = ep(69.7, 28, 12.3, 41.5), ip = ep(15.8, 84.5, 23.4, 11.5), ap = ep(46.5, 82.5, 9.4, 11);
function op({ projection: n, roomId: r, open: a = !1, onReturn: o, mapOpen: s = !1, onToggleMap: c }) {
	let l = n.rooms.find((e) => e.roomId === r), u = Zf(n, r);
	if (l === void 0 || u === null) return null;
	let d = l.ghosts.some((e) => e.state === "working" || e.state === "waiting"), [f, p] = l.doors, m = (e) => ({
		kind: "room",
		roomId: e
	}), h = (e, t, n, r) => /* @__PURE__ */ L("li", { children: /* @__PURE__ */ R("button", {
		type: "button",
		className: "hh-stage-option",
		"data-guide-option": e,
		onClick: (e) => r(e.currentTarget),
		children: [/* @__PURE__ */ L("span", {
			className: "hh-stage-bullet",
			"aria-hidden": "true",
			children: t
		}), /* @__PURE__ */ L("span", { children: n })]
	}) }, e), g = (e, t, n, r) => /* @__PURE__ */ L("span", {
		className: "hh-stage-spot",
		"data-spot": e,
		"data-label": t,
		style: n,
		onClick: (e) => r(e.currentTarget)
	}, e);
	return /* @__PURE__ */ R("div", {
		className: "hh-stage-room",
		"data-stage-room": r,
		"data-open": a,
		children: [
			/* @__PURE__ */ R("h3", {
				className: "hh-stage-room-title",
				"data-stage-title": !0,
				children: ["You are in the ", l.name]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-stage-room-scene",
				children: [
					/* @__PURE__ */ L(vn, {
						room: r,
						door: f === void 0 ? null : f.state,
						secondDoor: p === void 0 ? null : p.state,
						lit: d,
						hasPrevious: u.previous !== null,
						hasNext: u.next !== null
					}),
					/* @__PURE__ */ R("div", {
						className: "hh-stage-spots",
						"aria-hidden": "true",
						children: [
							u.previous === null ? null : g("previous", `To the ${u.previous.name}`, tp, (e) => Ff(e, m(u.previous.roomId))),
							f === void 0 ? u.next === null ? null : g("next", `To the ${u.next.name}`, np, (e) => Ff(e, m(u.next.roomId))) : g("door", `${f.phaseName} door: ${oa(f.state)}`, np, (e) => Ff(e, {
								kind: "door",
								roomId: r,
								phase: f.phase,
								proposalId: f.proposalId
							})),
							p === void 0 ? null : g("door-2", `${p.phaseName} door: ${oa(p.state)}`, rp, (e) => Ff(e, {
								kind: "door",
								roomId: r,
								phase: p.phase,
								proposalId: p.proposalId
							})),
							l.ghosts.map((e, t) => /* @__PURE__ */ L("span", {
								className: "hh-stage-figure",
								"data-ghost": e.state,
								"data-label": `${e.name}: ${oa(e.state)}`,
								style: {
									"--hh-i": t,
									"--hh-n": l.ghosts.length
								},
								onClick: (t) => Ff(t.currentTarget, {
									kind: "ghost",
									roomId: r,
									ghostId: e.ghostId
								}),
								children: /* @__PURE__ */ L(Dn, {
									state: e.state,
									role: xn(e.ghostId)
								})
							}, e.ghostId))
						]
					}),
					/* @__PURE__ */ L(yn, {}),
					/* @__PURE__ */ R("div", {
						className: "hh-stage-spots",
						"aria-hidden": "true",
						children: [g("ledger", `Open the ${l.name}`, ip, (e) => Ff(e, m(r))), g("bell", "What needs you", ap, (e) => $f(e, "[data-opener-key=\"needs-you\"]"))]
					})
				]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-stage-guide",
				children: [/* @__PURE__ */ R("div", {
					className: "hh-stage-balloon",
					children: [
						/* @__PURE__ */ L("p", {
							className: "hh-stage-balloon-title",
							"data-guide-text": !0,
							children: u.text
						}),
						/* @__PURE__ */ L("p", {
							className: "hh-stage-balloon-hint",
							children: Qf
						}),
						/* @__PURE__ */ R("ul", {
							className: "hh-stage-options",
							children: [
								a ? null : h("open", /* @__PURE__ */ L(i, { size: 13 }), `Look around the ${l.name}`, (e) => Ff(e, m(r))),
								u.previous === null ? null : h("previous", /* @__PURE__ */ L(e, { size: 13 }), `Go to the ${u.previous.name}`, (e) => Ff(e, m(u.previous.roomId))),
								u.next === null ? null : h("next", /* @__PURE__ */ L(t, { size: 13 }), `Go to the ${u.next.name}`, (e) => Ff(e, m(u.next.roomId))),
								c === void 0 ? null : h("map", /* @__PURE__ */ L(b, { size: 13 }), s ? "Put the house map away" : "See the whole house", c)
							]
						})
					]
				}), /* @__PURE__ */ R("div", {
					className: "hh-stage-keeper",
					children: [/* @__PURE__ */ L("span", {
						className: "hh-stage-caretaker",
						"aria-hidden": "true",
						children: /* @__PURE__ */ L(On, {})
					}), o === void 0 ? null : /* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-stage-exit",
						"data-guide-exit": !0,
						"aria-label": "Exit to the Foyer",
						onClick: o,
						children: [/* @__PURE__ */ L(y, {
							size: 13,
							"aria-hidden": !0
						}), "Exit"]
					})]
				})]
			})
		]
	});
}
// src/adapters/house-sound.ts
var sp = .22, cp = .16;
function lp(e, t, n, r, i, a = 0) {
	let o = e.ctx.createGain(), s = e.at + a;
	return o.gain.setValueAtTime(1e-4, s), o.gain.exponentialRampToValueAtTime(t, s + n), o.gain.setValueAtTime(t, s + n + r), o.gain.exponentialRampToValueAtTime(1e-4, s + n + r + i), o.connect(e.out), o;
}
function up(e, t, n) {
	let r = e.ctx.createBufferSource();
	return r.buffer = e.noise, r.loop = !0, r.start(e.at + t), r.stop(e.at + t + n), r;
}
function dp(e, t, n, r) {
	let i = e.ctx.createOscillator();
	return i.type = t, i.start(e.at + n), i.stop(e.at + n + r), i;
}
function fp(e, t, n, r, i = .5, a = 0) {
	let o = e.at + a, s = dp(e, "sawtooth", a, t), c = Math.max(6, Math.round(t * 14));
	for (let e = 0; e <= c; e += 1) {
		let i = e / c, a = e % 2 == 0 ? 1 : .9;
		s.frequency.setValueAtTime((n + (r - n) * i ** 1.6) * a, o + i * t);
	}
	let l = dp(e, "square", a, t);
	l.frequency.setValueAtTime(34, o), l.frequency.exponentialRampToValueAtTime(11, o + t);
	let u = e.ctx.createGain();
	u.gain.value = .45;
	let d = lp(e, i, .05, t * .55, t * .4, a), f = e.ctx.createGain();
	f.gain.value = .55, l.connect(u).connect(f.gain);
	for (let [n, r] of [[760, 9], [1900, 12]]) {
		let i = e.ctx.createBiquadFilter();
		i.type = "bandpass", i.Q.value = r, i.frequency.setValueAtTime(n * .8, o), i.frequency.linearRampToValueAtTime(n * 1.25, o + t), s.connect(i).connect(f);
	}
	f.connect(d);
}
function pp(e, t, n = .9, r = 92) {
	let i = e.at + t, a = dp(e, "sine", t, .3);
	a.frequency.setValueAtTime(r, i), a.frequency.exponentialRampToValueAtTime(r * .45, i + .22), a.connect(lp(e, n, .004, .02, .2, t));
	let o = e.ctx.createBiquadFilter();
	o.type = "lowpass", o.frequency.value = 420, up(e, t, .12).connect(o).connect(lp(e, n * .5, .003, .01, .08, t));
}
function mp(e, t) {
	let n = e.at, r = e.ctx.createBiquadFilter();
	r.type = "bandpass", r.Q.value = 2.2, r.frequency.setValueAtTime(260, n), r.frequency.exponentialRampToValueAtTime(1300, n + t * .45), r.frequency.exponentialRampToValueAtTime(380, n + t), up(e, 0, t).connect(r).connect(lp(e, .5, t * .35, .05, t * .55));
	let i = dp(e, "sine", 0, t);
	i.frequency.setValueAtTime(330, n), i.frequency.linearRampToValueAtTime(495, n + t * .5), i.frequency.linearRampToValueAtTime(392, n + t), i.connect(lp(e, .12, t * .3, .1, t * .5));
}
function hp(e, t, n, r = .4, i = 1.1) {
	for (let [a, o] of [
		[1, 1],
		[2.76, .35],
		[5.4, .12]
	]) {
		let s = dp(e, "sine", n, i + .1);
		s.frequency.value = t * a, s.connect(lp(e, r * o, .004, .01, i * (a === 1 ? 1 : .5), n));
	}
}
function gp(e) {
	let t = e.at, n = dp(e, "triangle", 0, .95);
	n.frequency.setValueAtTime(410, t), n.frequency.exponentialRampToValueAtTime(150, t + .9);
	let r = dp(e, "sine", 0, .95);
	r.frequency.value = 6;
	let i = e.ctx.createGain();
	i.gain.value = 14, r.connect(i).connect(n.frequency), n.connect(lp(e, .3, .06, .4, .45));
}
var _p = {
	"door-open": (e) => {
		fp(e, 1.25, 96, 178), pp(e, 1.22, .3, 70);
	},
	"door-knock": (e) => {
		pp(e, 0, .8, 140), pp(e, .19, .7, 132), pp(e, .44, .9, 120);
	},
	"door-seal": (e) => {
		fp(e, .5, 170, 110, .35), pp(e, .48, .9, 84);
	},
	"door-slam": (e) => {
		pp(e, 0, 1, 76), pp(e, .07, .5, 58), fp(e, .3, 240, 200, .18, .12);
	},
	"ghost-wake": (e) => mp(e, .95),
	"ghost-done": (e) => {
		hp(e, 659.25, 0, .32), hp(e, 987.77, .16, .26);
	},
	"ghost-fail": (e) => gp(e),
	"needs-you": (e) => {
		hp(e, 783.99, 0, .3, .8), hp(e, 622.25, .22, .3, 1.2);
	},
	"panel-open": (e) => fp(e, .42, 130, 205, .3),
	"panel-close": (e) => pp(e, 0, .45, 110)
};
function vp() {
	if (typeof window > "u") return null;
	let e = window;
	return e.AudioContext ?? e.webkitAudioContext ?? null;
}
function yp() {
	let e = vp();
	if (e === null) return null;
	let t;
	try {
		t = new e();
	} catch {
		return null;
	}
	let n = t.createGain();
	n.gain.value = sp, n.connect(t.destination);
	let r = t.createBuffer(1, t.sampleRate * 2, t.sampleRate), i = r.getChannelData(0);
	for (let e = 0; e < i.length; e += 1) i[e] = Math.random() * 2 - 1;
	let a = t.createBufferSource();
	a.buffer = r, a.loop = !0;
	let o = t.createBiquadFilter();
	o.type = "bandpass", o.Q.value = .9, o.frequency.value = 380;
	let s = t.createGain();
	s.gain.value = cp;
	let c = t.createOscillator();
	c.frequency.value = .07;
	let l = t.createGain();
	l.gain.value = 190;
	let u = t.createGain();
	u.gain.value = cp * .6, c.connect(l).connect(o.frequency), c.connect(u).connect(s.gain), a.connect(o).connect(s).connect(n), a.start(), c.start();
	let d = !1;
	return {
		play: (e) => {
			if (!d) try {
				t.state === "suspended" && t.resume(), _p[e]({
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
var bp = {
	open: "door-open",
	waiting: "door-knock",
	rejected: "door-slam",
	sealed: "door-seal"
}, xp = {
	working: "ghost-wake",
	done: "ghost-done",
	failed: "ghost-fail"
};
function Sp(e, t) {
	if (e === null || e.mansionName !== t.mansionName) return [];
	let n = [], r = (e) => {
		e !== void 0 && !n.includes(e) && n.push(e);
	}, i = new Map(e.rooms.map((e) => [e.roomId, e]));
	for (let e of t.rooms) {
		let t = i.get(e.roomId);
		if (t !== void 0) for (let n of e.doors) {
			let e = t.doors.find((e) => e.phase === n.phase);
			e !== void 0 && e.state !== n.state && r(bp[n.state]);
		}
	}
	for (let e of t.rooms) {
		let t = i.get(e.roomId);
		if (t !== void 0) for (let n of e.ghosts) {
			let e = t.ghosts.find((e) => e.ghostId === n.ghostId);
			(e === void 0 ? n.state === "working" : e.state !== n.state) && r(xp[n.state]);
		}
	}
	return t.needsYou.length > e.needsYou.length && r("needs-you"), n.slice(0, 3);
}
function Cp(e, t, n = yp) {
	let [r, i] = F(!1), [a, o] = F(!0), s = P(null), c = P([]), l = A(() => {
		for (let e of c.current) clearTimeout(e);
		c.current = [], s.current?.close(), s.current = null;
	}, []);
	j(() => l, [l]);
	let u = A((e) => {
		e.forEach((e, t) => {
			t === 0 ? s.current?.play(e) : c.current.push(setTimeout(() => s.current?.play(e), t * 420));
		});
	}, []), d = A(() => {
		if (s.current !== null) {
			l(), i(!1);
			return;
		}
		let e = n();
		e === null ? o(!1) : (s.current = e, i(!0), e.play("panel-open"));
	}, [n, l]), f = P(null);
	j(() => {
		let t = f.current;
		f.current = e, s.current !== null && u(Sp(t, e));
	}, [e, u]);
	let p = P(t);
	return j(() => {
		let e = p.current;
		p.current = t, s.current !== null && e !== t && u([t === null ? "panel-close" : "panel-open"]);
	}, [t, u]), {
		on: r,
		available: a,
		toggle: d
	};
}
// src/components/HouseToolbar.tsx
var wp = "This browser cannot play the house sounds.", Tp = "Your browser asks for reduced motion, so the house is still either way.", Ep = ue(function({ mansionName: e, needsYou: t, onNeedsYou: n, motion: i, onToggleStillHouse: a, status: o, sound: s, view: c }, l) {
	let u = M(), d = M(), f = Sl(t), p = t.length === 0;
	return /* @__PURE__ */ R("div", {
		className: "hh-ui-toolbar",
		"data-toolbar": !0,
		children: [
			/* @__PURE__ */ R("h2", {
				className: "hh-ui-mansion-name",
				ref: l,
				tabIndex: -1,
				children: [/* @__PURE__ */ L("span", {
					className: "hh-ui-muted",
					children: "Mansion "
				}), e]
			}),
			/* @__PURE__ */ R("button", {
				type: "button",
				className: "hh-ui-needs",
				"data-count": t.length,
				"data-opener-key": "needs-you",
				"aria-disabled": p,
				"aria-label": p ? `Needs you: ${f}.` : `Needs you: ${f}. Go to the first.`,
				onClick: (e) => {
					p || n(e.currentTarget);
				},
				children: [/* @__PURE__ */ L(r, {
					size: 16,
					"aria-hidden": !0
				}), f]
			}),
			/* @__PURE__ */ R("button", {
				type: "button",
				className: "hh-ui-toggle",
				"aria-pressed": i.stillHouse,
				"aria-describedby": i.prefersReducedMotion ? u : void 0,
				onClick: a,
				children: [
					/* @__PURE__ */ L(se, {
						size: 16,
						"aria-hidden": !0
					}),
					"Still house: ",
					i.stillHouse ? "on" : "off"
				]
			}),
			i.prefersReducedMotion ? /* @__PURE__ */ L("span", {
				className: "hh-ui-reason",
				id: u,
				children: Tp
			}) : null,
			s === void 0 ? null : /* @__PURE__ */ R("button", {
				type: "button",
				className: "hh-ui-toggle",
				"data-sound-toggle": !0,
				"aria-pressed": s.on,
				"aria-disabled": !s.available || void 0,
				"aria-describedby": s.available ? void 0 : d,
				onClick: s.onToggle,
				children: [
					s.on ? /* @__PURE__ */ L(ae, {
						size: 16,
						"aria-hidden": !0
					}) : /* @__PURE__ */ L(oe, {
						size: 16,
						"aria-hidden": !0
					}),
					"Sound: ",
					s.on ? "on" : "off"
				]
			}),
			s === void 0 || s.available ? null : /* @__PURE__ */ L("span", {
				className: "hh-ui-reason",
				id: d,
				children: wp
			}),
			c === void 0 ? null : /* @__PURE__ */ R("button", {
				type: "button",
				className: "hh-ui-toggle hh-ui-view-toggle",
				"data-view-toggle": !0,
				"aria-pressed": c.turned,
				onClick: c.onToggle,
				children: [
					/* @__PURE__ */ L(te, {
						size: 16,
						"aria-hidden": !0
					}),
					"Side view: ",
					c.turned ? "on" : "off"
				]
			}),
			o === void 0 ? null : /* @__PURE__ */ R("details", {
				className: "hh-ui-status",
				children: [/* @__PURE__ */ L("summary", { children: "System status" }), /* @__PURE__ */ L("div", {
					className: "hh-ui-status-body",
					children: o
				})]
			}),
			p ? null : /* @__PURE__ */ L("ul", {
				className: "hh-ui-needs-list",
				"aria-label": "Waiting on you",
				children: t.map((e) => /* @__PURE__ */ L("li", { children: e.label }, `${e.kind}:${e.id}`))
			})
		]
	});
});
// src/components/LiveAnnouncer.tsx
function Dp({ message: e, turn: t = 0 }) {
	return /* @__PURE__ */ L("p", {
		className: "hh-ui-announcer",
		"aria-live": "polite",
		"aria-atomic": "true",
		"data-announcer": !0,
		children: /* @__PURE__ */ L("span", { children: e }, t)
	});
}
// src/components/RoomPanelHost.tsx
function Op(e) {
	return e.replace(/["\\]/g, "\\$&");
}
function kp(e, t, n = null) {
	let [r, i] = F([]), a = P(r);
	a.current = r;
	let o = P(null), s = P(null), c = P(null), l = A((e, t, n = {}) => {
		let r = {
			surface: {
				target: e,
				openerKey: t?.getAttribute("data-opener-key") ?? Dl(e)
			},
			opener: t
		};
		o.current = {
			kind: "opened",
			focus: n.focus ?? { kind: "heading" }
		}, i((e) => n.placement === "push" ? [...e, r] : [r]);
	}, []), u = A(() => {
		let e = a.current, t = e[e.length - 1];
		t !== void 0 && (o.current = {
			kind: "restore",
			opener: t.opener,
			openerKey: t.surface.openerKey,
			target: t.surface.target
		}, i(e.slice(0, -1)));
	}, []), d = r.findIndex((t) => Ol(t.surface, e) === null);
	j(() => {
		if (d === -1) return;
		let e = a.current[d];
		e !== void 0 && (o.current = {
			kind: "restore",
			opener: e.opener,
			openerKey: e.surface.openerKey,
			target: e.surface.target
		}, i(a.current.slice(0, d)));
	}, [d]), j(() => {
		let e = o.current;
		if (e === null) return;
		o.current = null;
		let n = t.current;
		if (e.kind === "opened") {
			let t = e.focus.kind === "selector" ? c.current?.querySelector(e.focus.selector) : null;
			if (t != null && (t.hasAttribute("tabindex") || t.setAttribute("tabindex", "-1"), t.focus(), document.activeElement === t)) return;
			s.current?.focus();
		} else ((e.opener !== null && e.opener.isConnected ? e.opener : null) ?? n?.querySelector(`[data-opener-key="${Op(e.openerKey)}"]`) ?? null ?? n?.querySelector(`[data-room-control="${Op(e.target.roomId)}"]`) ?? null ?? n?.querySelector("[data-map-title]") ?? null)?.focus();
	}, [r, t]);
	let f = P(null);
	return j(() => {
		let e = f.current !== null && n === null;
		if (f.current = n, !e || a.current.length === 0) return;
		let t = document.activeElement;
		(t === null || t === document.body) && s.current?.focus();
	}, [n]), {
		top: r[r.length - 1]?.surface ?? null,
		depth: r.length,
		open: l,
		close: u,
		headingRef: s,
		panelRef: c
	};
}
var Ap = "button, [href], input, select, textarea, summary, [tabindex]:not([tabindex=\"-1\"])";
function jp({ id: e, title: t, mode: n, stack: r, closeLabel: i, children: a }) {
	let o = r.top;
	if (o === null) return null;
	let s = `${e}-title`, c = o.target, l = /* @__PURE__ */ R("section", {
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
			let t = e.currentTarget, i = Array.from(t.querySelectorAll(Ap)).filter((e) => !e.hasAttribute("disabled"));
			if (i.length === 0) return;
			let a = i[0], o = i[i.length - 1], s = document.activeElement;
			e.shiftKey && (s === a || s === r.headingRef.current) ? (e.preventDefault(), o.focus()) : !e.shiftKey && s === o && (e.preventDefault(), a.focus());
		},
		children: [/* @__PURE__ */ R("div", {
			className: "hh-ui-panel-head",
			children: [/* @__PURE__ */ L("h4", {
				id: s,
				ref: r.headingRef,
				tabIndex: -1,
				children: t
			}), /* @__PURE__ */ R("button", {
				type: "button",
				className: "hh-ui-panel-close",
				onClick: r.close,
				children: [/* @__PURE__ */ L(ce, {
					size: 16,
					"aria-hidden": !0
				}), i]
			})]
		}), /* @__PURE__ */ L("div", {
			className: "hh-ui-panel-body",
			children: a
		})]
	});
	return n === "dialog" ? /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("div", {
		className: "hh-ui-backdrop",
		"data-backdrop": !0,
		onClick: r.close
	}), l] }) : l;
}
// src/components/use-reduced-motion.ts
var Mp = "(prefers-reduced-motion: reduce)";
function Np() {
	try {
		return typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia(Mp) : null;
	} catch {
		return null;
	}
}
function Pp() {
	let [e, t] = F(() => Ef(Np()?.matches));
	return j(() => {
		let e = Np();
		if (e === null) {
			t(!0);
			return;
		}
		let n = (e) => t(Ef(e.matches));
		if (t(Ef(e.matches)), typeof e.addEventListener == "function") return e.addEventListener("change", n), () => e.removeEventListener("change", n);
		if (typeof e.addListener == "function") return e.addListener(n), () => e.removeListener(n);
		t(!0);
	}, []), e;
}
// src/components/MansionShell.tsx
var Fp = {
	room: "Close room",
	ghost: "Close ghost details",
	door: "Close door details"
};
function Ip(e, t) {
	let n = e.rooms.find((e) => e.roomId === t.roomId);
	if (n === void 0) return "";
	switch (t.kind) {
		case "room": return n.name;
		case "ghost": return n.ghosts.find((e) => e.ghostId === t.ghostId)?.name ?? n.name;
		case "door": return `${n.doors.find((e) => e.phase === t.phase)?.phaseName ?? n.name} door`;
	}
}
function Lp(e) {
	return e.replace(/["\\]/g, "\\$&");
}
function Rp(e) {
	let t = e.id.indexOf(":"), n = e.kind === "door-decision" || e.kind === "risky-decision" ? e.id.slice(t + 1) : null;
	return n === null || n === "" ? { kind: "heading" } : {
		kind: "selector",
		selector: `[data-proposal="${Lp(n)}"]`
	};
}
function zp({ projection: e, renderSurface: t, host: n, message: r = "", status: i, notes: a, banner: o, busy: s = !1, onReturn: c, panelMode: l = "region", inFlight: u = null, panelStyles: d = "" }) {
	let f = P(null), p = P(null), m = M(), h = kp(e, f, u), [g, _] = F(!1), v = Df({
		stillHouse: g,
		prefersReducedMotion: Pp()
	}), [y, b] = F({
		text: r,
		turn: 0
	}), x = A((e) => {
		e !== "" && b((t) => ({
			text: e,
			turn: t.turn + 1
		}));
	}, []), S = P(!0);
	j(() => {
		S.current ? S.current = !1 : x(r);
	}, [r, x]);
	let C = A((e) => x(e.text), [x]), { theme: w } = wf({
		...n,
		needsYouCount: e.needsYou.length,
		onSummary: C
	});
	j(() => {
		p.current?.focus();
	}, []);
	let T = A((e, t) => h.open(e, t, { placement: "replace" }), [h.open]), ee = N(() => ({
		openNested: (e, t) => h.open(e, t, { placement: "push" }),
		close: h.close,
		stillHouse: v.effective === "none"
	}), [
		h.open,
		h.close,
		v.effective
	]), te = e.needsYou, ne = A((e) => {
		let t = xl(te), n = te[0];
		t !== null && n !== void 0 && h.open({
			kind: "room",
			roomId: t
		}, e, {
			placement: "replace",
			focus: Rp(n)
		});
	}, [te, h.open]), E = P({
		open: h.top !== null,
		close: h.close,
		onReturn: c,
		mapOpen: !1,
		closeMap: () => {}
	});
	E.current = {
		open: h.top !== null,
		close: h.close,
		onReturn: c,
		mapOpen: E.current.mapOpen,
		closeMap: E.current.closeMap
	}, j(() => {
		let e = (e) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			let t = E.current;
			t.open ? (e.preventDefault(), t.close()) : t.mapOpen ? (e.preventDefault(), t.closeMap()) : t.onReturn !== void 0 && (e.preventDefault(), t.onReturn());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, []);
	let D = h.top, re = D === null ? null : Dl(D.target), O = Cp(e, re), [ie, k] = F(!1), [ae, oe] = F(null), se = D === null ? null : D.target.roomId;
	j(() => {
		se !== null && oe(se);
	}, [se]);
	let [ce, le] = F(!1), ue = A(() => le((e) => !e), []);
	j(() => {
		ce && f.current?.querySelector("[data-map-title]")?.focus();
	}, [ce]), j(() => {
		if (re !== null) {
			le(!1);
			return;
		}
		let e = document.activeElement?.closest("[data-map-sheet]") ?? null;
		e !== null && typeof window < "u" && window.getComputedStyle(e).clipPath.startsWith("inset") && f.current?.querySelector("[data-guide-option]")?.focus();
	}, [re]), E.current.mapOpen = ce, E.current.closeMap = () => {
		le(!1), f.current?.querySelector("[data-guide-option=\"map\"]")?.focus();
	};
	let de = se ?? ae ?? xl(e.needsYou) ?? "foyer", fe = e.rooms.some((e) => e.roomId === de) ? de : e.rooms[0]?.roomId ?? "foyer", pe = l === "dialog" && D !== null ? { inert: "" } : {};
	return /* @__PURE__ */ R("section", {
		className: "hh-ui",
		"aria-label": `Mansion ${e.mansionName}`,
		"aria-busy": s,
		"data-theme": w.mode,
		"data-motion": v.effective,
		"data-still": v.effective === "none",
		"data-mode": e.mode,
		"data-map": ce ? "open" : "closed",
		ref: f,
		onKeyDown: (e) => {
			e.key !== "Escape" || e.defaultPrevented || h.top === null || (e.preventDefault(), h.close());
		},
		children: [
			/* @__PURE__ */ L("style", { children: Uf + Gf + Pn + d }),
			/* @__PURE__ */ R("div", {
				className: "hh-ui-behind",
				...pe,
				children: [
					/* @__PURE__ */ L(Ep, {
						ref: p,
						mansionName: e.mansionName,
						needsYou: te,
						onNeedsYou: ne,
						motion: v,
						onToggleStillHouse: () => _((e) => !e),
						status: i,
						sound: {
							on: O.on,
							available: O.available,
							onToggle: O.toggle
						},
						view: {
							turned: ie,
							onToggle: () => k((e) => !e)
						}
					}),
					o,
					/* @__PURE__ */ L(op, {
						projection: e,
						roomId: fe,
						open: D !== null && D.target.roomId === fe,
						onReturn: c,
						mapOpen: ce,
						onToggleMap: ue
					}),
					a
				]
			}),
			D === null ? null : /* @__PURE__ */ L(jp, {
				id: m,
				title: Ip(e, D.target),
				mode: l,
				stack: h,
				closeLabel: Fp[D.target.kind],
				children: t(D, ee)
			}, `${h.depth}:${Dl(D.target)}`),
			/* @__PURE__ */ L("div", {
				className: "hh-ui-behind",
				"data-map-sheet": !0,
				...pe,
				children: /* @__PURE__ */ L(Hf, {
					projection: e,
					openSurface: T,
					motion: v.effective,
					openKey: re,
					panelId: m,
					view: ie ? "turned" : "front"
				})
			}),
			/* @__PURE__ */ L(Dp, {
				message: y.text,
				turn: y.turn
			})
		]
	});
}
// src/components/room-output-styles.ts
var Bp = "\n.hh-output { display: grid; gap: 10px; }\n.hh-artifact { border: 1px solid var(--border, currentColor); border-top: 3px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-artifact[data-validation='invalid'] { border-top-style: double; border-top-width: 5px; }\n.hh-artifact[data-validation='unwritten'] { border-style: dashed; }\n.hh-artifact-head { display: flex; align-items: flex-start; gap: 6px; }\n.hh-artifact-head svg { flex: none; margin-top: 2px; color: var(--hh-candle); }\n.hh-artifact-note { margin: 0; font-size: 0.875rem; color: var(--muted, inherit); }\n.hh-document { max-height: 24rem; overflow: auto; border: 1px solid var(--border, currentColor); border-radius: 4px;\n  padding: 8px 12px; background: var(--input, transparent); font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-document:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-document > :first-child { margin-top: 0; }\n.hh-document > :last-child { margin-bottom: 0; }\n.hh-md-heading { font-weight: 600; margin: 12px 0 4px; }\n.hh-md-heading[data-level='1'] { font-size: 1.0625rem; }\n.hh-md-heading[data-level='2'] { font-size: 1rem; }\n.hh-document p { margin: 6px 0; }\n.hh-md-quote { border-left: 3px solid var(--border-strong, currentColor); padding-left: 8px; }\n.hh-md-list { list-style: none; margin: 6px 0; padding: 0; display: grid; gap: 2px; }\n.hh-md-item { display: flex; align-items: flex-start; gap: 6px; }\n.hh-md-item svg { flex: none; margin-top: 3px; }\n.hh-md-marker { flex: none; min-width: 0.75rem; color: var(--muted, inherit); }\n.hh-document pre { margin: 6px 0; padding: 6px 8px; overflow: auto; border: 1px solid var(--border, currentColor);\n  border-radius: 4px; }\n.hh-document code, .hh-document pre, .hh-task code, .hh-run code, .hh-findings code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 0.8125rem; }\n.hh-document hr { border: 0; border-top: 1px solid var(--border, currentColor); margin: 8px 0; }\n.hh-findings { margin: 0; padding: 0 0 0 1.25rem; font-size: 0.875rem; display: grid; gap: 2px; }\n.hh-finding-code { color: var(--muted, inherit); }\n.hh-scope { list-style: none; margin: 0; padding: 0; }\n\n.hh-run { display: grid; gap: 4px; }\n.hh-run-summary { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-runs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }\n.hh-runs > li { display: grid; gap: 6px; }\n.hh-session-link { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-size: 0.875rem; }\n.hh-button-quiet { border-style: dotted; padding: 3px 10px; font-size: 0.875rem; }\n.hh-session-link-note { color: var(--muted, inherit); }\n\n.hh-board { border: 1px solid var(--border, currentColor); border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-wave { display: grid; gap: 6px; }\n.hh-tasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }\n.hh-task { border: 1px solid var(--border, currentColor); border-left: 4px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 8px 10px; display: grid; gap: 4px; }\n.hh-task[data-status='active'] { border-left-style: double; border-left-width: 6px; }\n.hh-task[data-status='not_selected'], .hh-task[data-status='skipped'] { border-left-style: dotted; }\n.hh-task[data-status='failed'], .hh-task[data-status='blocked'], .hh-task[data-status='cancelled'] { border-left-style: dashed; }\n.hh-task-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 0.875rem; }\n.hh-task-head input { margin: 0; width: 1rem; height: 1rem; align-self: center; accent-color: var(--accent, auto); }\n.hh-task-head input:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-task-id { font-weight: 600; }\n.hh-tag { border: 1px solid var(--border-strong, currentColor); border-radius: 999px; padding: 0 8px; font-size: 0.75rem; }\n.hh-task-detail { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n\n.hh-revision { display: grid; gap: 6px; }\n.hh-revision label { font-weight: 600; font-size: 0.875rem; }\n.hh-revision textarea { font: inherit; color: inherit; background: var(--input, transparent);\n  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 10px; min-height: 5rem;\n  resize: vertical; width: 100%; box-sizing: border-box; }\n.hh-revision textarea:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-revision textarea[aria-invalid='true'] { border-width: 2px; }\n\n.hh-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }\n", Vp = "This is a recording. It is read-only: nothing here starts, approves, rejects, retries or opens a Crew session.", Hp = "The Attic replays this mansion’s séance log. Replaying changes nothing: the rooms keep showing the live house.", Up = "Reading the séance log…", Wp = "This log has no events yet. There is nothing to replay.", Gp = "No problems were found in this log.", Kp = "Start of replay. No event has been shown yet.", qp = "Now showing";
function Jp(e) {
	return e === 0 ? "No events recorded" : e === 1 ? "1 event recorded" : `${e} events recorded`;
}
function Yp(e) {
	return `${e}×`;
}
var Xp = Tc.map((e) => ({
	speed: e,
	text: Yp(e)
}));
function Zp(e, t, n) {
	return e === "playing" ? "Playing" : e === "complete" ? n === 0 ? "Nothing to replay" : "Replay complete" : t === 0 ? "Paused at the start" : "Paused";
}
var Qp = {
	enabled: !0,
	reason: null
}, $p = (e) => ({
	enabled: !1,
	reason: e
}), em = "There are no events to replay.", tm = "The replay is at its start.", nm = "This is the last event.";
function rm(e, t) {
	let n = e.records.length, r = n === 0, i = t.cursor >= n, a = t.cursor === 0, o = t.status === "playing" ? "pause" : a || i ? "play" : "resume";
	return {
		playAction: o,
		playLabel: o === "pause" ? "Pause" : o === "resume" ? "Resume" : "Play",
		play: o === "pause" ? Qp : r ? $p(em) : Qp,
		restart: r ? $p(em) : a && t.status !== "playing" ? $p(tm) : Qp,
		previous: r ? $p(em) : a ? $p(tm) : Qp,
		next: r ? $p(em) : i ? $p(nm) : Qp,
		seek: r ? $p(em) : Qp,
		previousCursor: Math.max(t.cursor - 1, 0),
		nextCursor: Math.min(t.cursor + 1, n)
	};
}
function im(e, t) {
	return e.timeline.map((e, n) => ({
		key: e.recordId,
		position: n + 1,
		actor: e.actorLabel,
		summary: e.summary,
		current: n === t - 1,
		played: n < t
	}));
}
function am(e, t) {
	let n = e.timeline[t - 1];
	return t <= 0 || n === void 0 ? Kp : `${Ic(e, t)}. ${n.actorLabel}: ${n.summary}.`;
}
function om(e) {
	return `Replay complete. ${Ic(e, e.records.length)}.`;
}
function sm(e) {
	return e <= 0 ? null : e === 1 ? "1 decision waiting at this point" : `${e} decisions waiting at this point`;
}
function cm(e, t, n) {
	let r = e.records.length, i = t.projection, a = Ps(i, n), o = e.timeline[t.cursor - 1];
	return {
		statusText: Zp(t.status, t.cursor, r),
		positionText: Ic(e, t.cursor),
		totalText: Jp(r),
		currentText: t.cursor <= 0 || o === void 0 ? Kp : `${o.actorLabel}: ${o.summary}`,
		phases: a === null ? [] : a.phases.map((e) => ({
			phase: e.phase,
			status: e.status,
			door: e.door.status,
			text: `${q[e.phase]}: ${Ga[e.status]}. ${Ka[e.door.status]}.`
		})),
		ghosts: i.ghosts.filter((e) => e.mansion_id === n && e.ghost_id !== "house-operator").map((e) => ({
			ghostId: e.ghost_id,
			state: e.state,
			text: `${Gi(e.ghost_id)}: ${zi[e.state]}`
		})),
		waitingText: sm(a?.waitingCount ?? 0)
	};
}
function lm(e) {
	return e.line === void 0 ? e.safeDetail : `Line ${e.line}: ${e.safeDetail}`;
}
function um(e, t) {
	let n = [
		...t.commandError === null ? [] : [t.commandError.safeDetail],
		...e.diagnostics.map(lm),
		...t.projection.diagnostics.map(lm)
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
var dm = "\n.hh-attic { display: grid; gap: 14px; min-width: 0; }\n.hh-attic h4 { margin: 0 0 6px; font-size: 0.9375rem; }\n.hh-attic p { margin: 0; overflow-wrap: anywhere; }\n.hh-attic-section { min-width: 0; display: grid; gap: 8px; }\n.hh-attic-note { display: flex; align-items: flex-start; gap: 6px; min-width: 0; padding: 8px 10px;\n  border: 1px solid var(--hh-border, currentColor); border-left-width: 6px; border-left-style: double; border-radius: 6px;\n  background: var(--hh-surface, transparent); }\n.hh-attic-note svg, .hh-attic-line svg { flex: none; margin-top: 2px; }\n.hh-attic-line { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }\n.hh-attic-status { font-weight: 600; }\n.hh-attic-muted { color: var(--hh-text-muted, inherit); }\n.hh-attic-buttons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }\n.hh-attic-button { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; min-height: 2.25rem;\n  font: inherit; text-align: left; color: var(--hh-text, inherit); background: var(--hh-surface-raised, transparent);\n  border: 1px solid var(--hh-border, currentColor); border-radius: 6px; padding: 6px 12px; cursor: pointer; }\n.hh-attic-button[data-variant='primary'] { color: var(--hh-primary-text, inherit); background: var(--hh-primary, transparent);\n  border-width: 2px; font-weight: 600; }\n.hh-attic-button[aria-disabled='true'] { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted, inherit);\n  background: var(--hh-surface, transparent); font-weight: 400; }\n.hh-attic-button:focus-visible, .hh-attic-range:focus-visible, .hh-attic-speed input:focus-visible,\n.hh-attic-timeline:focus-visible { outline: 2px solid var(--hh-focus, currentColor); outline-offset: 2px; }\n.hh-attic-reasons { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 0.875rem;\n  color: var(--hh-text-muted, inherit); }\n.hh-attic-speed { border: 1px solid var(--hh-border-soft, currentColor); border-radius: 6px; margin: 0; padding: 6px 10px;\n  display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; min-width: 0; }\n.hh-attic-speed legend { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; }\n.hh-attic-speed label { display: inline-flex; align-items: center; gap: 4px; min-height: 2rem; cursor: pointer; }\n.hh-attic-speed input:checked + span { font-weight: 700; text-decoration: underline; }\n.hh-attic-seek { display: grid; gap: 4px; min-width: 0; }\n.hh-attic-range { width: 100%; min-width: 0; margin: 0; accent-color: var(--hh-primary, auto); }\n.hh-attic-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; min-width: 0; }\n.hh-attic-timeline { max-height: 18rem; overflow-y: auto; min-width: 0; padding: 4px;\n  border: 1px solid var(--hh-border-soft, currentColor); border-radius: 6px; }\n.hh-attic-entries { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; min-width: 0; }\n.hh-attic-entry { display: grid; grid-template-columns: 1.25rem 2.5rem minmax(0, 1fr); column-gap: 6px; align-items: start;\n  padding: 4px 6px; border: 1px solid transparent; border-left: 4px solid transparent; border-radius: 4px; }\n.hh-attic-entry[data-played='false'] { color: var(--hh-text-muted, inherit); border-left: 4px dotted var(--hh-border-soft, currentColor); }\n.hh-attic-entry[data-played='true'] { border-left: 4px solid var(--hh-border, currentColor); }\n.hh-attic-entry[aria-current='step'] { font-weight: 700; border: 2px solid var(--hh-border, currentColor);\n  border-left: 6px double var(--hh-accent, currentColor); background: var(--hh-surface-raised, transparent); }\n.hh-attic-entry-mark svg { color: var(--hh-accent, currentColor); }\n.hh-attic-entry-number { font-variant-numeric: tabular-nums; }\n.hh-attic-entry-now { display: block; font-size: 0.8125rem; }\n.hh-attic-diagnostics li { display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px;\n  border: 1px dashed var(--hh-border, currentColor); border-left: 4px solid var(--hh-danger, currentColor); border-radius: 6px; }\n.hh-attic-diagnostics svg { flex: none; margin-top: 2px; color: var(--hh-danger, currentColor); }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-attic[data-motion='low-frequency'] .hh-attic-entry { transition: background-color 0.4s ease-out; }\n}\n.hh-attic[data-motion='none'] *, .hh-attic:not([data-motion]) * { animation: none !important; transition: none !important; }\n@media (prefers-reduced-motion: reduce) {\n  .hh-attic * { animation: none !important; transition: none !important; }\n}\n";
// src/rooms/attic/ReplayControls.tsx
function fm({ transport: e, speed: t, cursor: n, total: r, positionText: i, onPlay: a, onRestart: o, onPrevious: s, onNext: c, onSeek: l, onSpeed: u }) {
	let d = M(), f = (e) => `${d}-${e}-reason`, m = (e, t) => t.enabled ? void 0 : f(e), h = [
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
	return /* @__PURE__ */ R("div", {
		className: "hh-attic-section",
		"data-attic": "controls",
		children: [
			/* @__PURE__ */ R("div", {
				className: "hh-attic-buttons",
				children: [
					/* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-attic-button",
						"data-variant": "primary",
						"data-action": e.playAction,
						"aria-disabled": !e.play.enabled,
						"aria-describedby": m("play", e.play),
						onClick: a,
						children: [e.playAction === "pause" ? /* @__PURE__ */ L(C, {
							size: 16,
							"aria-hidden": !0
						}) : /* @__PURE__ */ L(w, {
							size: 16,
							"aria-hidden": !0
						}), e.playLabel]
					}),
					/* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-attic-button",
						"data-action": "restart",
						"aria-disabled": !e.restart.enabled,
						"aria-describedby": m("restart", e.restart),
						onClick: o,
						children: [/* @__PURE__ */ L(ne, {
							size: 16,
							"aria-hidden": !0
						}), "Restart"]
					}),
					/* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-attic-button",
						"data-action": "previous",
						"aria-disabled": !e.previous.enabled,
						"aria-describedby": m("previous", e.previous),
						onClick: s,
						children: [/* @__PURE__ */ L(re, {
							size: 16,
							"aria-hidden": !0
						}), "Previous event"]
					}),
					/* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-attic-button",
						"data-action": "next",
						"aria-disabled": !e.next.enabled,
						"aria-describedby": m("next", e.next),
						onClick: c,
						children: [/* @__PURE__ */ L(O, {
							size: 16,
							"aria-hidden": !0
						}), "Next event"]
					})
				]
			}),
			h.some(([, , e]) => !e.enabled) ? /* @__PURE__ */ L("ul", {
				className: "hh-attic-reasons",
				children: h.map(([e, t, n]) => n.enabled ? null : /* @__PURE__ */ R("li", {
					id: f(e),
					children: [
						t,
						": ",
						n.reason
					]
				}, e))
			}) : null,
			/* @__PURE__ */ R("fieldset", {
				className: "hh-attic-speed",
				children: [/* @__PURE__ */ R("legend", { children: [/* @__PURE__ */ L(p, {
					size: 16,
					"aria-hidden": !0
				}), "Playback speed"] }), Xp.map((e) => /* @__PURE__ */ R("label", { children: [/* @__PURE__ */ L("input", {
					type: "radio",
					name: `${d}-speed`,
					value: e.speed,
					checked: t === e.speed,
					onChange: () => u(e.speed)
				}), /* @__PURE__ */ L("span", { children: e.text })] }, e.speed))]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-attic-seek",
				children: [
					/* @__PURE__ */ R("label", {
						htmlFor: `${d}-seek`,
						children: ["Replay position: ", i]
					}),
					/* @__PURE__ */ L("input", {
						id: `${d}-seek`,
						className: "hh-attic-range",
						type: "range",
						min: 0,
						max: r,
						step: 1,
						value: n,
						"aria-valuetext": i,
						"aria-disabled": !e.seek.enabled,
						"aria-describedby": e.seek.enabled ? void 0 : `${d}-seek-reason`,
						onChange: (t) => {
							e.seek.enabled && l(Number(t.currentTarget.value));
						}
					}),
					e.seek.enabled ? null : /* @__PURE__ */ L("p", {
						className: "hh-attic-muted",
						id: `${d}-seek-reason`,
						children: e.seek.reason
					})
				]
			})
		]
	});
}
// src/rooms/attic/ReplayDiagnostics.tsx
function pm({ diagnostics: e }) {
	return e.rows.length === 0 ? /* @__PURE__ */ R("p", {
		className: "hh-attic-line hh-attic-muted",
		"data-attic": "diagnostics-empty",
		children: [/* @__PURE__ */ L(o, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ L("span", { children: Gp })]
	}) : /* @__PURE__ */ R("div", {
		className: "hh-attic-section",
		"data-attic": "diagnostics",
		children: [/* @__PURE__ */ L("ul", {
			className: "hh-attic-list hh-attic-diagnostics",
			children: e.rows.map((e) => /* @__PURE__ */ R("li", { children: [/* @__PURE__ */ L(k, {
				size: 16,
				"aria-hidden": !0
			}), /* @__PURE__ */ L("span", { children: e.text })] }, e.key))
		}), e.moreText === null ? null : /* @__PURE__ */ L("p", {
			className: "hh-attic-muted",
			children: e.moreText
		})]
	});
}
// src/rooms/attic/ReplaySummary.tsx
function mm({ status: e }) {
	return L(e === "playing" ? w : e === "complete" ? o : C, {
		size: 16,
		"aria-hidden": !0
	});
}
function hm({ summary: e, status: t }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-attic-section",
		"data-attic": "summary",
		children: [
			/* @__PURE__ */ R("p", {
				className: "hh-attic-line hh-attic-status",
				"data-status": t,
				children: [/* @__PURE__ */ L(mm, { status: t }), /* @__PURE__ */ R("span", { children: [
					e.statusText,
					". ",
					e.positionText,
					". ",
					e.totalText,
					"."
				] })]
			}),
			/* @__PURE__ */ R("p", {
				className: "hh-attic-line",
				"data-attic": "current",
				children: [/* @__PURE__ */ L(x, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.currentText })]
			}),
			e.phases.length === 0 ? null : /* @__PURE__ */ L("ul", {
				className: "hh-attic-list",
				"aria-label": "Phases and Doors at this point",
				children: e.phases.map((e) => /* @__PURE__ */ R("li", {
					className: "hh-attic-line",
					"data-phase": e.phase,
					"data-status": e.status,
					"data-door": e.door,
					children: [/* @__PURE__ */ L(l, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.text })]
				}, e.phase))
			}),
			e.ghosts.length === 0 ? null : /* @__PURE__ */ L("ul", {
				className: "hh-attic-list",
				"aria-label": "Ghosts at this point",
				children: e.ghosts.map((e) => /* @__PURE__ */ R("li", {
					className: "hh-attic-line",
					"data-ghost": e.ghostId,
					"data-state": e.state,
					children: [/* @__PURE__ */ L(m, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.text })]
				}, e.ghostId))
			}),
			e.waitingText === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-attic-muted",
				children: e.waitingText
			})
		]
	});
}
// src/rooms/attic/ReplayTimeline.tsx
function gm({ rows: e, label: t }) {
	let n = P(null), r = e.find((e) => e.current)?.key ?? null;
	return j(() => {
		let e = n.current;
		if (e === null) return;
		if (r === null) {
			e.scrollTop = 0;
			return;
		}
		let t = e.querySelector("[aria-current=\"step\"]");
		if (t === null) return;
		let i = t.offsetTop - e.offsetTop;
		i < e.scrollTop ? e.scrollTop = i : i + t.offsetHeight > e.scrollTop + e.clientHeight && (e.scrollTop = i + t.offsetHeight - e.clientHeight);
	}, [r]), e.length === 0 ? /* @__PURE__ */ L("p", {
		className: "hh-attic-muted",
		"data-attic": "timeline-empty",
		children: Wp
	}) : /* @__PURE__ */ L("div", {
		className: "hh-attic-timeline",
		role: "group",
		"aria-label": t,
		tabIndex: 0,
		ref: n,
		"data-attic": "timeline",
		children: /* @__PURE__ */ L("ol", {
			className: "hh-attic-entries",
			children: e.map((e) => /* @__PURE__ */ R("li", {
				className: "hh-attic-entry",
				"aria-current": e.current ? "step" : void 0,
				"data-played": e.played,
				"data-position": e.position,
				children: [
					/* @__PURE__ */ L("span", {
						className: "hh-attic-entry-mark",
						children: e.current ? /* @__PURE__ */ L(x, {
							size: 16,
							"aria-hidden": !0
						}) : null
					}),
					/* @__PURE__ */ R("span", {
						className: "hh-attic-entry-number",
						children: [e.position, ". "]
					}),
					/* @__PURE__ */ R("span", { children: [
						e.current ? /* @__PURE__ */ R("span", {
							className: "hh-attic-entry-now",
							children: [qp, ". "]
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
function _m(e, t, { watch: n = !0, refresh: r = !0 } = {}) {
	let { model: i, state: a, command: o, mansionId: s, source: c, mode: l, refresh: u } = e, d = P(t);
	d.current = t;
	let f = N(() => rm(i, a), [i, a]), p = N(() => cm(i, a, s), [
		i,
		a,
		s
	]), m = N(() => im(i, a.cursor), [i, a.cursor]), h = N(() => um(i, a), [i, a]), g = P({
		transport: f,
		model: i
	});
	g.current = {
		transport: f,
		model: i
	};
	let _ = A(() => {
		let { transport: e } = g.current;
		e.play.enabled && o({ kind: e.playAction });
	}, [o]), v = A(() => {
		let { transport: e, model: t } = g.current;
		e.restart.enabled && (o({ kind: "restart" }), d.current(am(t, 0)));
	}, [o]), y = A((e) => {
		let { transport: t, model: n } = g.current;
		if (!t[e].enabled) return;
		let r = e === "previous" ? t.previousCursor : t.nextCursor;
		o({
			kind: "seek",
			cursor: r
		}), d.current(am(n, r));
	}, [o]), b = A(() => y("previous"), [y]), x = A(() => y("next"), [y]), S = A((e) => o({
		kind: "seek",
		cursor: e
	}), [o]), C = A((e) => o({
		kind: "set_speed",
		speed: e
	}), [o]), w = P(a.status);
	j(() => {
		let e = w.current;
		w.current = a.status, n && e === "playing" && a.status === "complete" && d.current(om(i));
	}, [
		a.status,
		i,
		n
	]), j(() => {
		n && a.commandError !== null && d.current(a.commandError.safeDetail);
	}, [a.commandError, n]), j(() => {
		n && c === "error" && d.current(Ss.fixture_unavailable);
	}, [c, n]);
	let T = P(u);
	return T.current = u, j(() => {
		r && l === "live" && T.current();
	}, [
		l,
		s,
		r
	]), {
		transport: f,
		summary: p,
		rows: m,
		diagnostics: h,
		speed: a.speed,
		cursor: a.cursor,
		total: i.records.length,
		onPlay: _,
		onRestart: v,
		onPrevious: b,
		onNext: x,
		onSeek: S,
		onSpeed: C
	};
}
// src/rooms/attic/AtticPanel.tsx
function vm({ replay: e, onAnnounce: t, motion: n = "none", watch: r = !0 }) {
	let i = _m(e, t, { watch: r }), a = M(), o = e.source === "loading" && i.total === 0;
	return /* @__PURE__ */ R("div", {
		className: "hh-attic",
		"data-attic-panel": !0,
		"data-mode": e.mode,
		"data-motion": n,
		"data-source": e.source,
		children: [
			/* @__PURE__ */ L("style", { children: dm }),
			/* @__PURE__ */ R("p", {
				className: "hh-attic-note",
				"data-attic": "mode",
				children: [e.readOnly ? /* @__PURE__ */ L(v, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ L(h, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.readOnly ? Vp : Hp })]
			}),
			o ? /* @__PURE__ */ R("p", {
				className: "hh-attic-line hh-attic-muted",
				"data-attic": "loading",
				children: [/* @__PURE__ */ L(ee, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: Up })]
			}) : null,
			/* @__PURE__ */ R("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${a}-controls`,
				children: [/* @__PURE__ */ L("h4", {
					id: `${a}-controls`,
					children: "Playback"
				}), /* @__PURE__ */ L(fm, {
					transport: i.transport,
					speed: i.speed,
					cursor: i.cursor,
					total: i.total,
					positionText: i.summary.positionText,
					onPlay: i.onPlay,
					onRestart: i.onRestart,
					onPrevious: i.onPrevious,
					onNext: i.onNext,
					onSeek: i.onSeek,
					onSpeed: i.onSpeed
				})]
			}),
			/* @__PURE__ */ R("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${a}-summary`,
				children: [/* @__PURE__ */ L("h4", {
					id: `${a}-summary`,
					children: "The house at this point"
				}), /* @__PURE__ */ L(hm, {
					summary: i.summary,
					status: e.state.status
				})]
			}),
			/* @__PURE__ */ R("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${a}-timeline`,
				children: [/* @__PURE__ */ L("h4", {
					id: `${a}-timeline`,
					children: "Timeline"
				}), /* @__PURE__ */ L(gm, {
					rows: i.rows,
					label: "Timeline of recorded events"
				})]
			}),
			/* @__PURE__ */ R("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${a}-diagnostics`,
				children: [/* @__PURE__ */ L("h4", {
					id: `${a}-diagnostics`,
					children: "Diagnostics"
				}), /* @__PURE__ */ L(pm, { diagnostics: i.diagnostics })]
			})
		]
	});
}
// src/rooms/attic/ReplayBar.tsx
var ym = "Recording playback";
function bm({ panel: e, readOnlyText: t, startText: n }) {
	let r = M(), { transport: i } = e, a = (e, t) => t.enabled ? null : /* @__PURE__ */ L("span", {
		className: "hh-ui-visually-hidden",
		id: `${r}-${e}`,
		children: t.reason
	});
	return /* @__PURE__ */ R("div", {
		className: "hh-ui-replay-bar",
		role: "group",
		"aria-label": ym,
		"data-replay-bar": !0,
		children: [
			/* @__PURE__ */ R("span", {
				className: "hh-ui-replay-label",
				children: [/* @__PURE__ */ L(c, {
					size: 16,
					"aria-hidden": !0
				}), "Recording"]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-ui-replay-buttons",
				children: [
					/* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-ui-button",
						"data-variant": "primary",
						"data-action": i.playAction,
						"aria-disabled": !i.play.enabled,
						"aria-describedby": i.play.enabled ? void 0 : `${r}-play`,
						onClick: e.onPlay,
						children: [i.playAction === "pause" ? /* @__PURE__ */ L(C, {
							size: 16,
							"aria-hidden": !0
						}) : /* @__PURE__ */ L(w, {
							size: 16,
							"aria-hidden": !0
						}), i.playLabel]
					}),
					/* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-ui-button",
						"data-action": "restart",
						"aria-disabled": !i.restart.enabled,
						"aria-describedby": i.restart.enabled ? void 0 : `${r}-restart`,
						onClick: e.onRestart,
						children: [/* @__PURE__ */ L(ne, {
							size: 16,
							"aria-hidden": !0
						}), "Restart"]
					}),
					a("play", i.play),
					a("restart", i.restart)
				]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-ui-replay-progress",
				children: [/* @__PURE__ */ L("label", {
					className: "hh-ui-replay-position",
					htmlFor: `${r}-seek`,
					children: e.summary.positionText
				}), /* @__PURE__ */ L("input", {
					id: `${r}-seek`,
					className: "hh-ui-replay-range",
					type: "range",
					min: 0,
					max: e.total,
					step: 1,
					value: e.cursor,
					"aria-label": `Recording position: ${e.summary.positionText}`,
					"aria-valuetext": e.summary.positionText,
					"aria-disabled": !i.seek.enabled,
					onChange: (t) => {
						i.seek.enabled && e.onSeek(Number(t.currentTarget.value));
					}
				})]
			}),
			/* @__PURE__ */ R("fieldset", {
				className: "hh-ui-replay-speed",
				children: [/* @__PURE__ */ R("legend", { children: [/* @__PURE__ */ L(p, {
					size: 14,
					"aria-hidden": !0
				}), " Speed"] }), Xp.map((t) => /* @__PURE__ */ R("label", { children: [/* @__PURE__ */ L("input", {
					type: "radio",
					name: `${r}-speed`,
					value: t.speed,
					checked: e.speed === t.speed,
					onChange: () => e.onSpeed(t.speed)
				}), /* @__PURE__ */ L("span", { children: t.text })] }, t.speed))]
			}),
			/* @__PURE__ */ R("p", {
				className: "hh-ui-note hh-ui-replay-note",
				"data-kind": "read-only",
				"data-block": "read_only",
				children: [/* @__PURE__ */ L(v, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ R("span", { children: [t, n === null ? null : /* @__PURE__ */ R("span", {
					"data-replay-start": !0,
					children: [" ", n]
				})] })]
			})
		]
	});
}
// src/rooms/house/RoomNote.tsx
function xm({ room: e }) {
	if (e.diagnostic === null) return null;
	let t = e.integrity === "valid" ? e.locked ? "locked" : e.readOnly ? "read-only" : "diagnostic" : "diagnostic";
	return /* @__PURE__ */ R("p", {
		className: "hh-ui-note",
		"data-kind": t,
		"data-room-note": !0,
		children: [L(t === "diagnostic" ? k : v, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ L("span", { children: e.diagnostic })]
	});
}
// src/rooms/house/DecisionButtons.tsx
function Sm({ approve: e, reject: t, busy: n, subject: r, describedBy: i, onSend: o }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-decide",
		"aria-busy": n,
		children: [/* @__PURE__ */ R("button", {
			type: "button",
			className: "hh-button hh-button-primary",
			"aria-label": `Approve ${r}`,
			"aria-disabled": e === null,
			"aria-describedby": e === null ? i : void 0,
			onClick: () => {
				e !== null && o(e);
			},
			children: [/* @__PURE__ */ L(a, {
				size: 16,
				"aria-hidden": !0
			}), n ? "Sending…" : "Approve"]
		}), /* @__PURE__ */ R("button", {
			type: "button",
			className: "hh-button hh-button-reject",
			"aria-label": `Reject ${r}`,
			"aria-disabled": t === null,
			"aria-describedby": t === null ? i : void 0,
			onClick: () => {
				t !== null && o(t);
			},
			children: [/* @__PURE__ */ L(ce, {
				size: 16,
				"aria-hidden": !0
			}), "Reject"]
		})]
	});
}
// src/rooms/house/DoorPanel.tsx
function Cm({ view: e, onSend: t }) {
	let r = M(), i = M(), a = e.state === "pending";
	return /* @__PURE__ */ R("article", {
		className: "hh-proposal",
		"aria-labelledby": r,
		"data-state": e.state,
		"data-proposal": e.proposalId,
		children: [
			/* @__PURE__ */ R("div", {
				className: "hh-proposal-head",
				children: [/* @__PURE__ */ L(l, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("h5", {
					id: r,
					children: e.title
				})]
			}),
			/* @__PURE__ */ R("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ L("dt", { children: "Document" }),
					/* @__PURE__ */ L("dd", { children: /* @__PURE__ */ L("code", { children: e.documentPath }) }),
					/* @__PURE__ */ L("dt", { children: "Revision" }),
					/* @__PURE__ */ R("dd", { children: [
						e.revisionText,
						", ",
						e.sizeText
					] }),
					/* @__PURE__ */ L("dt", { children: "Digest" }),
					/* @__PURE__ */ R("dd", { children: [/* @__PURE__ */ L("code", { children: e.digestPrefix }), " (first 12 characters of its SHA-256)"] })
				]
			}),
			a ? /* @__PURE__ */ R(I, { children: [
				/* @__PURE__ */ L("p", {
					className: "hh-proposal-sub",
					children: "Your decision covers exactly this revision. If the document changes, it needs a new decision. Approving opens the door; the next phase starts only when you start it."
				}),
				e.blockedText === null ? null : /* @__PURE__ */ R("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: i,
					children: [/* @__PURE__ */ L(v, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ L(Sm, {
					approve: e.approve,
					reject: e.reject,
					busy: e.busy,
					subject: `${e.title}, ${e.revisionText.toLowerCase()}`,
					describedBy: e.blockedText === null ? void 0 : i,
					onSend: t
				})
			] }) : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-outcome",
				"data-outcome": e.state,
				children: [e.state === "approved" ? /* @__PURE__ */ L(o, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ L(n, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.outcomeText })]
			})
		]
	});
}
// src/rooms/house/house-icons.tsx
var $ = {
	size: 16,
	"aria-hidden": !0
}, wm = {
	not_started: "plain",
	ready: "plain",
	starting: "plain",
	working: "plain",
	waiting: "attention",
	revision_required: "attention",
	approved: "ok",
	failed: "attention",
	done: "ok"
}, Tm = {
	sealed: "plain",
	waiting: "attention",
	open: "ok",
	rejected: "attention"
}, Em = {
	idle: "plain",
	working: "plain",
	waiting: "attention",
	blocked: "attention",
	failed: "attention",
	done: "ok"
};
function Dm({ status: e }) {
	switch (e) {
		case "not_started": return /* @__PURE__ */ L(s, { ...$ });
		case "ready": return /* @__PURE__ */ L(w, { ...$ });
		case "starting":
		case "working": return /* @__PURE__ */ L(_, {
			...$,
			className: "hh-spin"
		});
		case "waiting": return /* @__PURE__ */ L(g, { ...$ });
		case "revision_required": return /* @__PURE__ */ L(n, { ...$ });
		case "failed": return /* @__PURE__ */ L(k, { ...$ });
		case "approved":
		case "done": return /* @__PURE__ */ L(o, { ...$ });
	}
}
function Om({ status: e }) {
	switch (e) {
		case "sealed": return /* @__PURE__ */ L(v, { ...$ });
		case "waiting": return /* @__PURE__ */ L(l, { ...$ });
		case "open": return /* @__PURE__ */ L(u, { ...$ });
		case "rejected": return /* @__PURE__ */ L(n, { ...$ });
	}
}
function km({ state: e }) {
	switch (e) {
		case "idle": return /* @__PURE__ */ L(S, { ...$ });
		case "working": return /* @__PURE__ */ L(_, {
			...$,
			className: "hh-spin"
		});
		case "waiting": return /* @__PURE__ */ L(g, { ...$ });
		case "blocked": return /* @__PURE__ */ L(v, { ...$ });
		case "failed": return /* @__PURE__ */ L(k, { ...$ });
		case "done": return /* @__PURE__ */ L(o, { ...$ });
	}
}
function Am({ status: e }) {
	switch (e) {
		case "pending": return /* @__PURE__ */ L(g, { ...$ });
		case "approved":
		case "succeeded": return /* @__PURE__ */ L(o, { ...$ });
		case "consumed": return /* @__PURE__ */ L(_, {
			...$,
			className: "hh-spin"
		});
		case "rejected":
		case "superseded": return /* @__PURE__ */ L(n, { ...$ });
		case "failed": return /* @__PURE__ */ L(k, { ...$ });
	}
}
// src/rooms/house/use-revision-request.ts
function jm(e, t) {
	let [n, r] = F(!1), [i, a] = F(""), [o, s] = F(null), c = P(null), l = P(null), u = P(!1);
	return j(() => {
		n && !u.current && l.current?.focus(), !n && u.current && c.current?.focus(), u.current = n;
	}, [n]), {
		open: n,
		text: i,
		error: o,
		toggleRef: c,
		fieldRef: l,
		show: A(() => r(!0), []),
		hide: A(() => {
			r(!1), s(null);
		}, []),
		change: A((e) => {
			a(e), s(null);
		}, []),
		submit: A(() => {
			if (!e.enabled) return;
			let n = ku(i);
			n.ok ? (t({
				kind: "send_feedback",
				phase: e.phase,
				feedback: n.feedback,
				expectedVersion: e.expectedVersion
			}), a(""), s(null), r(!1)) : (s(n.text), l.current?.focus());
		}, [
			e.enabled,
			e.phase,
			e.expectedVersion,
			i,
			t
		])
	};
}
// src/rooms/house/RevisionRequest.tsx
function Mm({ view: e, onSend: t }) {
	let n = jm(e, t), r = M(), i = M(), a = M(), o = M(), s = M();
	return /* @__PURE__ */ R("div", {
		className: "hh-revision",
		"data-revision": e.phase,
		children: [/* @__PURE__ */ L("div", {
			className: "hh-decide",
			"aria-busy": e.busy,
			children: /* @__PURE__ */ L("button", {
				type: "button",
				className: "hh-button hh-button-quiet",
				ref: n.toggleRef,
				"aria-expanded": n.open,
				"aria-controls": n.open ? r : void 0,
				onClick: n.open ? n.hide : n.show,
				children: e.busy ? "Sending the revision request…" : e.label
			})
		}), n.open ? /* @__PURE__ */ R("form", {
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
				/* @__PURE__ */ L("label", {
					htmlFor: i,
					children: "What should change?"
				}),
				/* @__PURE__ */ L("textarea", {
					id: i,
					ref: n.fieldRef,
					value: n.text,
					maxLength: e.maxCharacters,
					rows: 4,
					"aria-describedby": n.error === null ? a : `${a} ${o}`,
					"aria-invalid": n.error !== null,
					onChange: (e) => n.change(e.target.value)
				}),
				/* @__PURE__ */ R("p", {
					className: "hh-proposal-sub",
					id: a,
					children: [
						"Sent once, to the same ghost session. The door stays sealed until you approve a new revision. Up to",
						" ",
						e.maxCharacters.toLocaleString("en-US"),
						" characters."
					]
				}),
				n.error === null ? null : /* @__PURE__ */ R("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: o,
					children: [/* @__PURE__ */ L(v, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: n.error })]
				}),
				e.blockedText === null ? null : /* @__PURE__ */ R("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: s,
					children: [/* @__PURE__ */ L(v, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ R("div", {
					className: "hh-decide",
					children: [/* @__PURE__ */ R("button", {
						type: "submit",
						className: "hh-button hh-button-primary",
						"aria-disabled": !e.enabled,
						"aria-describedby": e.blockedText === null ? void 0 : s,
						children: [/* @__PURE__ */ L(D, {
							size: 16,
							"aria-hidden": !0
						}), "Send revision request"]
					}), /* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-button",
						onClick: n.hide,
						children: [/* @__PURE__ */ L(ce, {
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
function Nm({ title: e, lines: t, empty: n }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("p", {
		className: "hh-proposal-group",
		children: e
	}), t.length === 0 ? /* @__PURE__ */ L("p", {
		className: "hh-proposal-sub",
		children: n
	}) : /* @__PURE__ */ L("dl", {
		className: "hh-facts",
		children: t.map((e, t) => /* @__PURE__ */ R("div", {
			style: { display: "contents" },
			children: [/* @__PURE__ */ L("dt", { children: e.label }), /* @__PURE__ */ L("dd", { children: /* @__PURE__ */ L("code", { children: e.value }) })]
		}, `${e.label}-${t}`))
	})] });
}
function Pm({ view: e, onSend: t }) {
	let n = e.ghostName, r = M(), i = M(), a = e.status === "pending";
	return /* @__PURE__ */ R("article", {
		className: "hh-proposal",
		"aria-labelledby": r,
		"data-state": e.status,
		"data-blocked": a && !e.complete,
		"data-proposal": e.proposalId,
		children: [
			/* @__PURE__ */ R("div", {
				className: "hh-proposal-head",
				children: [/* @__PURE__ */ L(Am, { status: e.status }), /* @__PURE__ */ R("h5", {
					id: r,
					children: [
						n,
						" asks: ",
						e.title
					]
				})]
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-proposal-sub",
				children: e.statusText
			}),
			e.complete ? /* @__PURE__ */ R(I, { children: [
				/* @__PURE__ */ L(Nm, {
					title: "Scope",
					lines: e.scope,
					empty: "No scope."
				}),
				/* @__PURE__ */ L(Nm, {
					title: "Exact arguments",
					lines: e.arguments,
					empty: "No arguments."
				}),
				/* @__PURE__ */ L(Nm, {
					title: "Paths it may touch",
					lines: e.paths,
					empty: "No paths."
				})
			] }) : null,
			/* @__PURE__ */ R("dl", {
				className: "hh-facts",
				children: [/* @__PURE__ */ L("dt", { children: "Digest" }), /* @__PURE__ */ R("dd", { children: [/* @__PURE__ */ L("code", { children: e.digestPrefix }), " (first 12 characters of the action's SHA-256)"] })]
			}),
			a ? /* @__PURE__ */ R(I, { children: [
				/* @__PURE__ */ L("p", {
					className: "hh-proposal-sub",
					children: e.oneAttemptText
				}),
				e.blockedText === null ? null : /* @__PURE__ */ R("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: i,
					children: [/* @__PURE__ */ L(v, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ L(Sm, {
					approve: e.approve,
					reject: e.reject,
					busy: e.busy,
					subject: `${e.title.toLowerCase()} for ${n}, digest ${e.digestPrefix}`,
					describedBy: e.blockedText === null ? void 0 : i,
					onSend: t
				})
			] }) : e.outcomeText === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-outcome",
				"data-outcome": e.status,
				children: [/* @__PURE__ */ L(Am, { status: e.status }), /* @__PURE__ */ L("span", { children: e.outcomeText })]
			})
		]
	});
}
// src/core/markdown-blocks.ts
var Fm = 1500, Im = /* @__PURE__ */ RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\u2028\u2029\\u202a-\\u202e\\u2066-\\u2069]", "g");
function Lm(e) {
	return e.replace(/\r\n?/g, "\n").replace(Im, "");
}
var Rm = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|((?<![A-Za-z0-9_])_(?![\s_])[^_\n]+(?<!\s)_(?![A-Za-z0-9_]))/g;
function zm(e) {
	let t = [], n = 0;
	for (let r of e.matchAll(Rm)) {
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
var Bm = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/, Vm = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]{0,24})/, Hm = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/, Um = /^(\s*)(?:([-*+])|(\d{1,4})[.)])\s+(.*)$/, Wm = /^\[( |x|X)\](\*?)\s+(.*)$/, Gm = /^\s*\|.*\|\s*$/;
function Km(e, t = Fm) {
	let n = Lm(e).split("\n"), r = [], i = [], a = [], o = !1, s = () => {
		i.length > 0 && (r.push({
			kind: "paragraph",
			inlines: zm(i.join(" "))
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
		let c = n[e], l = Vm.exec(c);
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
		let u = Bm.exec(c);
		if (u !== null) {
			s(), r.push({
				kind: "heading",
				level: u[1].length,
				inlines: zm(u[2])
			});
			continue;
		}
		if (Hm.test(c)) {
			s(), r.push({ kind: "rule" });
			continue;
		}
		if (Gm.test(c)) {
			s();
			let t = [c];
			for (; e + 1 < n.length && Gm.test(n[e + 1]);) e += 1, t.push(n[e]);
			r.push({
				kind: "code",
				language: "table",
				text: t.join("\n")
			});
			continue;
		}
		let d = Um.exec(c);
		if (d !== null) {
			i.length > 0 && s();
			let e = Wm.exec(d[4]);
			a.push({
				depth: Math.min(Math.floor(d[1].replace(/\t/g, "  ").length / 2), 5),
				checked: e === null ? null : e[1] !== " ",
				optional: e !== null && e[2] === "*",
				number: d[3] === void 0 ? null : `${d[3]}.`,
				inlines: zm(e === null ? d[4] : e[3])
			});
		} else c.trimStart().startsWith(">") ? (s(), r.push({
			kind: "quote",
			inlines: zm(c.trimStart().replace(/^>\s?/, ""))
		})) : (a.length > 0 && s(), i.push(c.trim()));
	}
	return o || s(), {
		blocks: r,
		truncated: o
	};
}
// src/components/MarkdownView.tsx
function qm({ parts: e }) {
	return /* @__PURE__ */ L(I, { children: e.map((e, t) => {
		switch (e.kind) {
			case "code": return /* @__PURE__ */ L("code", { children: e.text }, t);
			case "strong": return /* @__PURE__ */ L("strong", { children: e.text }, t);
			case "emphasis": return /* @__PURE__ */ L("em", { children: e.text }, t);
			default: return /* @__PURE__ */ L("span", { children: e.text }, t);
		}
	}) });
}
function Jm({ item: e }) {
	return /* @__PURE__ */ R("li", {
		className: "hh-md-item",
		style: { marginLeft: `${e.depth * 1.25}rem` },
		"data-checked": e.checked ?? void 0,
		children: [e.checked === null ? /* @__PURE__ */ L("span", {
			className: "hh-md-marker",
			"aria-hidden": !0,
			children: e.number ?? "•"
		}) : e.checked ? /* @__PURE__ */ L(a, {
			size: 14,
			"aria-hidden": !0
		}) : /* @__PURE__ */ L(ie, {
			size: 14,
			"aria-hidden": !0
		}), /* @__PURE__ */ R("span", { children: [
			e.checked === null ? e.number === null ? null : /* @__PURE__ */ R("span", {
				className: "hh-visually-hidden",
				children: [e.number, " "]
			}) : /* @__PURE__ */ R("span", {
				className: "hh-visually-hidden",
				children: [
					e.checked ? "Done" : "Open",
					e.optional ? ", optional" : "",
					":",
					" "
				]
			}),
			/* @__PURE__ */ L(qm, { parts: e.inlines }),
			e.optional ? /* @__PURE__ */ L("span", {
				"aria-hidden": !0,
				children: " (optional)"
			}) : null
		] })]
	});
}
var Ym = 6;
function Xm(e, t) {
	return Math.min(Ym, e + t - 1);
}
function Zm({ block: e, baseLevel: t }) {
	switch (e.kind) {
		case "heading": return /* @__PURE__ */ L("p", {
			className: "hh-md-heading",
			role: "heading",
			"aria-level": Xm(t, e.level),
			"data-level": e.level,
			children: /* @__PURE__ */ L(qm, { parts: e.inlines })
		});
		case "paragraph": return /* @__PURE__ */ L("p", { children: /* @__PURE__ */ L(qm, { parts: e.inlines }) });
		case "quote": return /* @__PURE__ */ L("p", {
			className: "hh-md-quote",
			children: /* @__PURE__ */ L(qm, { parts: e.inlines })
		});
		case "list": return /* @__PURE__ */ L("ul", {
			className: "hh-md-list",
			children: e.items.map((e, t) => /* @__PURE__ */ L(Jm, { item: e }, t))
		});
		case "code": return /* @__PURE__ */ L("pre", {
			"data-language": e.language === "" ? void 0 : e.language,
			children: /* @__PURE__ */ L("code", { children: e.text })
		});
		case "rule": return /* @__PURE__ */ L("hr", {});
	}
}
function Qm({ text: e, baseLevel: t = 6 }) {
	let n = N(() => Km(e), [e]);
	return /* @__PURE__ */ R(I, { children: [n.blocks.map((e, n) => /* @__PURE__ */ L(Zm, {
		block: e,
		baseLevel: t
	}, n)), n.truncated ? /* @__PURE__ */ L("p", {
		className: "hh-artifact-note",
		children: "The document is longer than this view shows. Its digest covers all of it."
	}) : null] });
}
// src/components/ArtifactView.tsx
var $m = {
	unwritten: "plain",
	unknown: "plain",
	valid: "ok",
	invalid: "attention"
};
function eh({ state: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "valid": return /* @__PURE__ */ L(o, { ...t });
		case "invalid": return /* @__PURE__ */ L(n, { ...t });
		default: return /* @__PURE__ */ L(s, { ...t });
	}
}
function th({ view: e }) {
	let t = M();
	return /* @__PURE__ */ R("article", {
		className: "hh-artifact",
		"aria-labelledby": t,
		"data-artifact": e.phase,
		"data-validation": e.validation,
		children: [
			/* @__PURE__ */ R("div", {
				className: "hh-artifact-head",
				children: [/* @__PURE__ */ L(f, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("h5", {
					id: t,
					children: e.title
				})]
			}),
			e.content === null ? /* @__PURE__ */ L("p", {
				className: "hh-artifact-note",
				"data-content": "none",
				children: e.contentNote
			}) : /* @__PURE__ */ L("div", {
				className: "hh-document",
				role: "region",
				"aria-label": `${e.title} text`,
				tabIndex: 0,
				"data-content": "text",
				children: /* @__PURE__ */ L(Qm, { text: e.content })
			}),
			e.doorNote === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				"data-door-note": !0,
				children: [/* @__PURE__ */ L(k, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.doorNote })]
			}),
			/* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-tone": $m[e.validation],
				"data-validation-line": !0,
				children: [/* @__PURE__ */ L(eh, { state: e.validation }), /* @__PURE__ */ R("span", { children: [e.validationText, e.findings.length > 0 ? `. ${e.findingsText}:` : ""] })]
			}),
			e.findings.length === 0 ? null : /* @__PURE__ */ L("ul", {
				className: "hh-findings",
				"aria-label": `${e.title} findings`,
				children: e.findings.map((e, t) => /* @__PURE__ */ R("li", {
					"data-finding": e.code,
					children: [
						/* @__PURE__ */ L("code", { children: e.location }),
						": ",
						e.message,
						" ",
						/* @__PURE__ */ R("span", {
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
			/* @__PURE__ */ R("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ L("dt", { children: "Document" }),
					/* @__PURE__ */ L("dd", { children: /* @__PURE__ */ L("code", { children: e.documentPath }) }),
					e.revisionText === null ? null : /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("dt", { children: "Revision" }), /* @__PURE__ */ L("dd", { children: e.revisionText })] }),
					e.digest === null ? null : /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("dt", { children: "Digest" }), /* @__PURE__ */ R("dd", { children: [/* @__PURE__ */ L("code", {
						"data-digest": !0,
						children: e.digest
					}), " (SHA-256 of these bytes)"] })] }),
					/* @__PURE__ */ R("dt", { children: [/* @__PURE__ */ L(v, {
						size: 14,
						"aria-hidden": !0
					}), " May write"] }),
					/* @__PURE__ */ R("dd", { children: [/* @__PURE__ */ L("ul", {
						className: "hh-scope",
						"aria-label": `Paths the ghost of this room may write for the ${e.title.toLowerCase()}`,
						children: e.writeScope.map((e) => /* @__PURE__ */ L("li", { children: /* @__PURE__ */ L("code", { children: e }) }, e))
					}), "Nothing else: every other write needs your approval."] })
				]
			})
		]
	});
}
// src/components/GhostOutputSummary.tsx
function nh({ run: e }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-run",
		"data-run": e.runId,
		"data-ghost": e.ghostId,
		"data-state": e.state ?? "earlier",
		children: [
			/* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-tone": e.state === null ? "plain" : Em[e.state],
				children: [e.state === null ? /* @__PURE__ */ L(s, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ L(km, { state: e.state }), /* @__PURE__ */ R("span", { children: [
					e.ghostName,
					": ",
					e.stateText,
					e.taskId === null ? "" : `, task ${e.taskId}`,
					". ",
					e.attemptText,
					"."
				] })]
			}),
			e.summary === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-run-summary",
				"data-summary": !0,
				children: e.summary
			}),
			e.reasonText === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-tone": "attention",
				"data-reason": !0,
				children: [/* @__PURE__ */ L(k, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.reasonText })]
			}),
			e.writeScope.length === 0 ? null : /* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-claim": !0,
				children: [/* @__PURE__ */ L(v, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ R("span", { children: [
					"This run may write only:",
					" ",
					e.writeScope.map((e, t) => /* @__PURE__ */ R("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ L("code", { children: e })] }, e))
				] })]
			})
		]
	});
}
// src/components/RunRecoveryControls.tsx
function rh({ view: e, kind: t, describedBy: r, onSend: i }) {
	let a = e.command;
	return /* @__PURE__ */ R("button", {
		type: "button",
		className: t === "cancel" ? "hh-button hh-button-reject" : "hh-button",
		"data-control": t,
		"aria-disabled": a === null,
		"aria-describedby": a === null && e.blockedText !== null ? r : void 0,
		onClick: () => {
			a !== null && i(a);
		},
		children: [L(t === "cancel" ? n : E, {
			size: 16,
			"aria-hidden": !0
		}), e.busy ? "Sending…" : e.label]
	});
}
function ih({ run: e, onSend: t }) {
	let n = M(), r = e.cancel?.blockedText ?? e.retry?.blockedText ?? null;
	return e.cancel === null && e.retry === null && e.exhaustedText === null ? null : /* @__PURE__ */ R("div", {
		className: "hh-recovery",
		"data-recovery": e.runId,
		children: [
			e.cancel === null && e.retry === null ? null : /* @__PURE__ */ R("div", {
				className: "hh-decide",
				"aria-busy": (e.cancel?.busy ?? !1) || (e.retry?.busy ?? !1),
				children: [e.cancel === null ? null : /* @__PURE__ */ L(rh, {
					view: e.cancel,
					kind: "cancel",
					describedBy: n,
					onSend: t
				}), e.retry === null ? null : /* @__PURE__ */ L(rh, {
					view: e.retry,
					kind: "retry",
					describedBy: n,
					onSend: t
				})]
			}),
			r === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				id: n,
				children: [/* @__PURE__ */ L(v, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: r })]
			}),
			e.exhaustedText === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note",
				"data-exhausted": !0,
				children: [/* @__PURE__ */ L(v, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.exhaustedText })]
			})
		]
	});
}
function ah({ view: e, onOpen: t }) {
	let n = M(), r = e.slotKey, i = r === null || t === null, a = e.disabledText ?? (t === null ? "This version of Crew offers no way to open the session from here. Find it in Crew by its name." : null);
	return /* @__PURE__ */ R("p", {
		className: "hh-session-link",
		"data-session-link": i ? "off" : "on",
		children: [/* @__PURE__ */ R("button", {
			type: "button",
			className: "hh-button hh-button-quiet",
			"aria-disabled": i,
			"aria-describedby": i && a !== null ? n : void 0,
			"data-slot": r ?? void 0,
			onClick: () => {
				r !== null && t !== null && t(r);
			},
			children: [/* @__PURE__ */ L(d, {
				size: 14,
				"aria-hidden": !0
			}), e.label]
		}), i && a !== null ? /* @__PURE__ */ L("span", {
			id: n,
			className: "hh-session-link-note",
			children: a
		}) : null]
	});
}
// src/rooms/workshop/use-task-selection.ts
function oh(e) {
	let [t, n] = F(() => /* @__PURE__ */ new Set()), r = N(() => {
		let n = new Set(e.waves.flatMap((e) => e.tasks.filter((e) => e.selectable).map((e) => e.taskId)));
		return new Set([...t].filter((e) => n.has(e)));
	}, [e.waves, t]), i = A((e) => {
		n((t) => {
			let n = new Set(t);
			return n.delete(e) || n.add(e), n;
		});
	}, []), a = A(() => n(/* @__PURE__ */ new Set()), []);
	return {
		chosen: r,
		toggle: i,
		command: N(() => Hu(e, r), [e, r]),
		clear: a
	};
}
// src/rooms/workshop/WorkshopTaskBoard.tsx
var sh = {
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
function ch({ status: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "complete": return /* @__PURE__ */ L(a, { ...t });
		case "active": return /* @__PURE__ */ L(_, {
			...t,
			className: "hh-spin"
		});
		case "queued":
		case "backpressure": return /* @__PURE__ */ L(g, { ...t });
		case "failed": return /* @__PURE__ */ L(k, { ...t });
		case "blocked": return /* @__PURE__ */ L(v, { ...t });
		case "cancelled": return /* @__PURE__ */ L(n, { ...t });
		case "not_selected":
		case "skipped": return /* @__PURE__ */ L(s, { ...t });
	}
}
function lh({ row: e, chosen: t, onToggle: n, onSend: r, onOpenSession: i }) {
	let a = M();
	return /* @__PURE__ */ R("li", {
		className: "hh-task",
		"data-task": e.taskId,
		"data-status": e.status,
		"aria-labelledby": a,
		children: [
			/* @__PURE__ */ R("div", {
				className: "hh-task-head",
				children: [
					e.selectable ? /* @__PURE__ */ L("input", {
						type: "checkbox",
						checked: t,
						"aria-label": `Select task ${e.taskId}: ${e.title}`,
						onChange: () => n(e.taskId)
					}) : null,
					/* @__PURE__ */ R("span", {
						id: a,
						children: [
							/* @__PURE__ */ L("span", {
								className: "hh-task-id",
								children: e.taskId
							}),
							" ",
							e.title
						]
					}),
					e.optional ? /* @__PURE__ */ L("span", {
						className: "hh-tag",
						children: "Optional"
					}) : null
				]
			}),
			/* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-tone": sh[e.status],
				"data-task-status": !0,
				children: [/* @__PURE__ */ L(ch, { status: e.status }), /* @__PURE__ */ R("span", { children: [e.statusText, e.attemptText === null ? "" : `. ${e.attemptText}`] })]
			}),
			e.detail === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-task-detail",
				"data-task-detail": !0,
				children: e.detail
			}),
			/* @__PURE__ */ R("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ L("dt", { children: "Requirements" }),
					/* @__PURE__ */ L("dd", { children: e.requirementsText }),
					/* @__PURE__ */ L("dt", { children: "May write" }),
					/* @__PURE__ */ L("dd", { children: e.writes.map((e, t) => /* @__PURE__ */ R("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ L("code", { children: e })] }, e)) })
				]
			}),
			e.run === null ? null : /* @__PURE__ */ R(I, { children: [
				/* @__PURE__ */ L(nh, { run: e.run }),
				/* @__PURE__ */ L(ih, {
					run: e.run,
					onSend: r
				}),
				/* @__PURE__ */ L(ah, {
					view: e.run.sessionLink,
					onOpen: i
				})
			] })
		]
	});
}
function uh({ board: e, onSend: t, onOpenSession: n }) {
	let r = oh(e), i = M(), a = M(), o = r.chosen.size, s = e.startBlockedText ?? (o === 0 ? "Tick at least one open task to start." : null);
	return /* @__PURE__ */ R("section", {
		className: "hh-board",
		"aria-labelledby": i,
		"data-board": !0,
		children: [
			/* @__PURE__ */ L("h5", {
				id: i,
				children: "Task board"
			}),
			/* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-board-summary": !0,
				children: [/* @__PURE__ */ L(g, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ R("span", { children: [
					e.doneCount,
					" of ",
					e.taskCount,
					" tasks done. ",
					e.capacityText,
					"."
				] })]
			}),
			e.findings.length === 0 ? null : /* @__PURE__ */ L("ul", {
				className: "hh-findings",
				"aria-label": "Task plan findings",
				children: e.findings.map((e, t) => /* @__PURE__ */ R("li", {
					"data-finding": e.code,
					children: [
						/* @__PURE__ */ L("code", { children: e.location }),
						": ",
						e.message,
						" ",
						/* @__PURE__ */ R("span", {
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
			e.waves.map((e) => /* @__PURE__ */ L(dh, {
				title: e.title,
				children: e.tasks.map((e) => /* @__PURE__ */ L(lh, {
					row: e,
					chosen: r.chosen.has(e.taskId),
					onToggle: r.toggle,
					onSend: t,
					onOpenSession: n
				}, e.taskId))
			}, e.wave ?? "outside")),
			/* @__PURE__ */ L("div", {
				className: "hh-decide",
				"aria-busy": e.startBusy,
				children: /* @__PURE__ */ R("button", {
					type: "button",
					className: "hh-button hh-button-primary",
					"data-control": "start-workshop",
					"aria-disabled": r.command === null,
					"aria-describedby": r.command === null && s !== null ? a : void 0,
					onClick: () => {
						r.command !== null && (t(r.command), r.clear());
					},
					children: [/* @__PURE__ */ L(w, {
						size: 16,
						"aria-hidden": !0
					}), e.startBusy ? "Starting…" : o === 1 ? "Start 1 selected task" : `Start ${o} selected tasks`]
				})
			}),
			r.command !== null || s === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				id: a,
				children: [/* @__PURE__ */ L(v, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: s })]
			})
		]
	});
}
function dh({ title: e, children: t }) {
	let n = M();
	return /* @__PURE__ */ R("div", {
		className: "hh-wave",
		role: "group",
		"aria-labelledby": n,
		children: [/* @__PURE__ */ L("p", {
			className: "hh-proposal-group",
			id: n,
			children: e
		}), /* @__PURE__ */ L("ul", {
			className: "hh-tasks",
			children: t
		})]
	});
}
// src/rooms/house/RoomOutput.tsx
function fh({ output: e, onSend: t, onOpenSession: n }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-output",
		"data-room-output": e.room,
		children: [
			e.outputNote === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-house-note hh-house-muted",
				"data-output-note": !0,
				children: [/* @__PURE__ */ L(ee, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.outputNote })]
			}),
			e.documents.map((e) => /* @__PURE__ */ L(th, { view: e }, e.phase)),
			e.taskBoard === null ? null : /* @__PURE__ */ L(uh, {
				board: e.taskBoard,
				onSend: t,
				onOpenSession: n
			})
		]
	});
}
// src/rooms/house/RoomRuns.tsx
function ph({ output: e, onSend: t, onOpenSession: n }) {
	let r = new Set(e.taskBoard?.waves.flatMap((e) => e.tasks.flatMap((e) => e.run === null ? [] : [e.run.runId])) ?? []), i = e.runs.filter((e) => !r.has(e.runId));
	return i.length === 0 ? null : /* @__PURE__ */ R("div", {
		className: "hh-phase",
		"data-room-runs": !0,
		children: [/* @__PURE__ */ L("p", {
			className: "hh-proposal-group",
			children: "Runs in this room"
		}), /* @__PURE__ */ L("ul", {
			className: "hh-runs",
			children: i.map((e) => /* @__PURE__ */ R("li", { children: [
				/* @__PURE__ */ L(nh, { run: e }),
				/* @__PURE__ */ L(ih, {
					run: e,
					onSend: t
				}),
				/* @__PURE__ */ L(ah, {
					view: e.sessionLink,
					onOpen: n
				})
			] }, e.runId))
		})]
	});
}
// src/rooms/house/RoomPanel.tsx
var mh = () => {};
function hh({ detail: e, onSend: t, output: n = null, onRoomSend: r = mh, onOpenSession: i = null }) {
	let { room: a } = e;
	return /* @__PURE__ */ R("div", {
		className: "hh-room-panel",
		"data-room-body": a.id,
		children: [
			n === null ? null : /* @__PURE__ */ L(fh, {
				output: n,
				onSend: r,
				onOpenSession: i
			}),
			e.phases.map(({ line: e, start: i, door: a }) => /* @__PURE__ */ R("div", {
				className: "hh-phase",
				"data-phase": e.phase,
				"data-status": e.status,
				children: [
					/* @__PURE__ */ R("p", {
						className: "hh-room-line",
						"data-tone": wm[e.status],
						children: [/* @__PURE__ */ L(Dm, { status: e.status }), /* @__PURE__ */ R("span", { children: [
							e.name,
							": ",
							e.statusText
						] })]
					}),
					/* @__PURE__ */ R("p", {
						className: "hh-room-line",
						"data-tone": Tm[e.doorStatus],
						children: [/* @__PURE__ */ L(Om, { status: e.doorStatus }), /* @__PURE__ */ L("span", { children: e.doorHint })]
					}),
					i === null || e.phase === "implementation" && n?.ownsImplementationStart === !0 ? null : /* @__PURE__ */ L("div", {
						className: "hh-decide",
						"aria-busy": i.busy,
						children: /* @__PURE__ */ R("button", {
							type: "button",
							className: "hh-button hh-button-primary",
							"aria-disabled": i.command === null,
							onClick: () => {
								i.command !== null && t(i.command);
							},
							children: [/* @__PURE__ */ L(w, {
								size: 16,
								"aria-hidden": !0
							}), i.busy ? "Starting…" : i.label]
						})
					}),
					a === null ? null : /* @__PURE__ */ L(Cm, {
						view: a,
						onSend: t
					}),
					n?.documents.map((t) => t.phase === e.phase && t.feedback !== null ? /* @__PURE__ */ L(Mm, {
						view: t.feedback,
						onSend: r
					}, t.phase) : null)
				]
			}, e.phase)),
			/* @__PURE__ */ R("div", {
				className: "hh-phase",
				children: [/* @__PURE__ */ L("p", {
					className: "hh-proposal-group",
					children: "Ghosts in this room"
				}), a.ghosts.length === 0 ? /* @__PURE__ */ R("p", {
					className: "hh-room-line",
					children: [/* @__PURE__ */ L(km, { state: "idle" }), /* @__PURE__ */ L("span", { children: "No ghost here yet" })]
				}) : /* @__PURE__ */ L("ul", {
					className: "hh-ghost-lines",
					children: a.ghosts.map((e) => /* @__PURE__ */ R("li", {
						className: "hh-room-line",
						"data-tone": Em[e.state],
						"data-ghost": e.ghostId,
						children: [/* @__PURE__ */ L(km, { state: e.state }), /* @__PURE__ */ R("span", { children: [
							e.name,
							": ",
							e.stateText,
							e.pendingText === null ? null : `, ${e.pendingText}`,
							e.reason === null ? null : `. ${e.reason}`
						] })]
					}, e.key))
				})]
			}),
			e.risky.length === 0 ? null : /* @__PURE__ */ R("div", {
				className: "hh-phase",
				children: [/* @__PURE__ */ L("p", {
					className: "hh-proposal-group",
					children: "Risky actions"
				}), e.risky.map((e) => /* @__PURE__ */ L(Pm, {
					view: e,
					onSend: t
				}, e.proposalId))]
			}),
			n === null ? null : /* @__PURE__ */ L(ph, {
				output: n,
				onSend: r,
				onOpenSession: i
			})
		]
	});
}
// src/rooms/house/room-house-panel.ts
var gh = "This room's state has not been read yet.";
// src/rooms/drafting-room/DraftingHousePanel.tsx
function _h({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(xm, { room: e }), t === null ? /* @__PURE__ */ L("p", {
		className: "hh-ui-reason",
		children: gh
	}) : /* @__PURE__ */ L(hh, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/foyer/ActiveMansionFoyerPanel.tsx
var vh = "Escape also returns to the Foyer when no room is open.";
function yh({ room: t, mansion: n, onReturn: r }) {
	return /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L(xm, { room: t }),
		/* @__PURE__ */ R("dl", {
			className: "hh-shell-facts",
			"data-active-mansion": n.name,
			children: [
				/* @__PURE__ */ L("dt", { children: "Mansion" }),
				/* @__PURE__ */ L("dd", { children: n.name }),
				/* @__PURE__ */ L("dt", { children: "Project spec" }),
				/* @__PURE__ */ L("dd", { children: n.projectSpec }),
				/* @__PURE__ */ L("dt", { children: "Folder" }),
				/* @__PURE__ */ L("dd", { children: n.displayPath })
			]
		}),
		/* @__PURE__ */ R("div", {
			className: "hh-foyer-actions",
			children: [/* @__PURE__ */ R("button", {
				type: "button",
				className: "hh-button",
				onClick: r,
				children: [/* @__PURE__ */ L(e, {
					size: 16,
					"aria-hidden": !0
				}), "Return to Foyer"]
			}), /* @__PURE__ */ L("span", {
				className: "hh-foyer-hint",
				children: vh
			})]
		})
	] });
}
// src/rooms/seance-room/LockedSeancePanel.tsx
function bh() {
	return /* @__PURE__ */ R("p", {
		className: "hh-ui-note",
		"data-kind": "locked",
		"data-seance": "locked",
		children: [/* @__PURE__ */ L(v, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ L("span", { children: Zc })]
	});
}
// src/rooms/seance-room/SeanceRoomPanel.tsx
function xh({ status: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "reviewing": return /* @__PURE__ */ L(_, {
			...t,
			className: "hh-spin"
		});
		case "pass": return /* @__PURE__ */ L(o, { ...t });
		case "changes_requested": return /* @__PURE__ */ L(n, { ...t });
		case "blocked": return /* @__PURE__ */ L(v, { ...t });
	}
}
function Sh({ view: e, onOpenSession: t }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-room-panel",
		"data-review": e.status,
		children: [/* @__PURE__ */ R("div", {
			className: "hh-output",
			children: [
				/* @__PURE__ */ R("p", {
					className: "hh-room-line",
					"data-tone": e.status === "pass" ? "ok" : e.status === "reviewing" ? "plain" : "attention",
					"data-verdict": !0,
					children: [/* @__PURE__ */ L(xh, { status: e.status }), /* @__PURE__ */ R("span", { children: [
						e.statusText,
						". ",
						e.cycleText,
						"."
					] })]
				}),
				e.limitText === null ? null : /* @__PURE__ */ R("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					"data-review-limit": !0,
					children: [/* @__PURE__ */ L(v, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.limitText })]
				}),
				e.findings.length === 0 ? null : /* @__PURE__ */ L("ul", {
					className: "hh-tasks",
					"aria-label": "Review findings",
					children: e.findings.map((e) => /* @__PURE__ */ R("li", {
						className: "hh-task",
						"data-finding": e.findingId,
						children: [
							/* @__PURE__ */ L("p", {
								className: "hh-run-summary",
								children: e.summary
							}),
							/* @__PURE__ */ R("dl", {
								className: "hh-facts",
								children: [
									/* @__PURE__ */ L("dt", { children: "Requirements" }),
									/* @__PURE__ */ L("dd", { children: e.requirementsText }),
									/* @__PURE__ */ L("dt", { children: "Files" }),
									/* @__PURE__ */ L("dd", { children: e.paths.length === 0 ? "None" : e.paths.map((e, t) => /* @__PURE__ */ R("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ L("code", { children: e })] }, e)) })
								]
							}),
							e.repair === null ? null : /* @__PURE__ */ R("p", {
								className: "hh-room-line",
								"data-repair": e.repair.status,
								children: [/* @__PURE__ */ L(g, {
									size: 16,
									"aria-hidden": !0
								}), /* @__PURE__ */ R("span", { children: [
									"Repair task ",
									e.repair.taskId,
									": ",
									e.repair.title,
									". ",
									e.repair.statusText,
									". May write:",
									" ",
									e.repair.writes.map((e, t) => /* @__PURE__ */ R("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ L("code", { children: e })] }, e))
								] })]
							})
						]
					}, e.findingId))
				})
			]
		}), /* @__PURE__ */ R("div", {
			className: "hh-phase",
			children: [/* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-tone": e.state === null ? "plain" : Em[e.state],
				children: [/* @__PURE__ */ L(km, { state: e.state ?? "idle" }), /* @__PURE__ */ R("span", { children: [
					e.ghostName,
					": ",
					e.stateText
				] })]
			}), /* @__PURE__ */ L(ah, {
				view: e.sessionLink,
				onOpen: t
			})]
		})]
	});
}
// src/rooms/seance-room/SeanceHousePanel.tsx
var Ch = "No review yet. The Medium reviews only when the house asks it to.";
function wh({ room: e, review: t, onOpenSession: n }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(xm, { room: e }), t === null ? /* @__PURE__ */ L("p", {
		className: "hh-ui-reason",
		"data-seance": "empty",
		children: Ch
	}) : /* @__PURE__ */ L(Sh, {
		view: t,
		onOpenSession: n
	})] });
}
// src/rooms/study/StudyHousePanel.tsx
function Th({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(xm, { room: e }), t === null ? /* @__PURE__ */ L("p", {
		className: "hh-ui-reason",
		children: gh
	}) : /* @__PURE__ */ L(hh, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/workshop/WorkshopHousePanel.tsx
function Eh({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(xm, { room: e }), t === null ? /* @__PURE__ */ L("p", {
		className: "hh-ui-reason",
		children: gh
	}) : /* @__PURE__ */ L(hh, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/house/DoorSurface.tsx
function Dh({ room: e, door: t, decision: n, onSend: r, onOpenRoom: i }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-door-surface",
		"data-door-surface": t.phase,
		children: [
			/* @__PURE__ */ L(xm, { room: e }),
			/* @__PURE__ */ R("p", {
				className: "hh-ui-state",
				"data-door": t.state,
				children: [/* @__PURE__ */ L(Pt, { state: t.state }), /* @__PURE__ */ R("span", { children: ["Door state: ", /* @__PURE__ */ L("span", {
					className: "hh-ui-state-word",
					children: oa(t.state)
				})] })]
			}),
			/* @__PURE__ */ L("p", {
				"data-door-hint": !0,
				children: t.hint
			}),
			t.phaseText === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-ui-reason",
				children: t.phaseText
			}),
			n === null ? null : /* @__PURE__ */ L(Cm, {
				view: n,
				onSend: r
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-decide",
				children: /* @__PURE__ */ R("button", {
					type: "button",
					className: "hh-button",
					"data-opener-key": `nested:room:${e.roomId}`,
					onClick: (t) => i({
						kind: "room",
						roomId: e.roomId
					}, t.currentTarget),
					children: [
						/* @__PURE__ */ L(u, {
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
function Oh({ room: e, ghost: t, onOpenRoom: n }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-ghost-surface",
		"data-ghost-surface": t.ghostId,
		children: [
			/* @__PURE__ */ R("p", {
				className: "hh-ui-state",
				"data-ghost": t.state,
				children: [/* @__PURE__ */ L(Mt, {
					state: t.state,
					variant: Ot(t.ghostId)
				}), /* @__PURE__ */ R("span", { children: [
					"Ghost state: ",
					/* @__PURE__ */ L("span", {
						className: "hh-ui-state-word",
						children: oa(t.state)
					}),
					t.pendingText === null ? null : `, ${t.pendingText}`
				] })]
			}),
			t.reason === null ? null : /* @__PURE__ */ L("p", {
				"data-ghost-reason": !0,
				children: t.reason
			}),
			/* @__PURE__ */ R("p", {
				className: "hh-ui-reason",
				children: [
					t.name,
					" lives in the ",
					e.name,
					". Looking at a ghost changes nothing."
				]
			}),
			/* @__PURE__ */ L("div", {
				className: "hh-decide",
				children: /* @__PURE__ */ R("button", {
					type: "button",
					className: "hh-button",
					"data-opener-key": `nested:room:${e.roomId}`,
					onClick: (t) => n({
						kind: "room",
						roomId: e.roomId
					}, t.currentTarget),
					children: [
						/* @__PURE__ */ L(u, {
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
var kh = "\n.hh-room-panel h5, .hh-proposal h5, .hh-artifact h5 { font-size: 0.875rem; margin: 0; overflow-wrap: anywhere; }\n[data-surface] .hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer; min-width: 0;\n  max-width: 100%; text-align: left; color: var(--hh-text); background: var(--hh-surface-raised);\n  border: 1px solid var(--hh-border); border-radius: 6px; padding: 6px 12px; overflow-wrap: anywhere; }\n[data-surface] .hh-button-primary { color: var(--hh-primary-text); background: var(--hh-primary); }\n[data-surface] .hh-button:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }\n[data-surface] .hh-button[aria-disabled='true'] { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted);\n  background: var(--hh-surface); }\n[data-surface] .hh-button-reject { border-style: double; border-width: 3px; padding: 4px 10px; }\n[data-surface] .hh-button-reject[aria-disabled='true'] { border-style: dashed; border-width: 1px; padding: 6px 12px; }\n\n.hh-room-panel { display: grid; gap: 12px; min-width: 0; }\n.hh-room-line { display: flex; align-items: flex-start; gap: 6px; font-size: 0.875rem; overflow-wrap: anywhere; margin: 0; }\n.hh-room-line svg { flex: none; margin-top: 2px; color: var(--hh-text-muted); }\n.hh-room-line[data-tone='ok'] svg { color: var(--hh-ok); }\n.hh-room-line[data-tone='attention'] svg { color: var(--hh-accent); }\n.hh-house-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; overflow-wrap: anywhere; }\n.hh-house-note svg { flex: none; margin-top: 2px; }\n.hh-house-muted { color: var(--hh-text-muted); }\n.hh-phase { display: grid; gap: 6px; border-top: 1px solid var(--hh-border-soft); padding-top: 10px; min-width: 0; }\n.hh-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: 0.875rem; }\n.hh-facts dt { color: var(--hh-text-muted); }\n.hh-facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }\n.hh-facts code, .hh-proposal code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 0.8125rem; overflow-wrap: anywhere; }\n.hh-ghost-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }\n.hh-ghost-surface, .hh-door-surface { display: grid; gap: 10px; min-width: 0; }\n.hh-ghost-surface p, .hh-door-surface p { margin: 0; }\n.hh-shell-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; margin: 0; }\n.hh-shell-facts dt { font-weight: 600; }\n.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }\n\n.hh-proposal { border: 1px solid var(--hh-border-soft); border-left: 4px solid var(--hh-border);\n  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; min-width: 0; }\n.hh-proposal:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }\n.hh-proposal[data-state='pending'] { border-left-style: double; border-left-width: 6px; }\n.hh-proposal[data-blocked='true'] { border-style: dashed; border-left-style: dashed; }\n.hh-proposal-head { display: flex; align-items: flex-start; gap: 6px; }\n.hh-proposal-head svg { flex: none; margin-top: 2px; color: var(--hh-accent); }\n.hh-proposal-sub { font-size: 0.875rem; margin: 0; }\n.hh-proposal-group { font-size: 0.8125rem; font-weight: 600; margin: 4px 0 0; color: var(--hh-text-muted); }\n.hh-proposal-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-proposal-note svg { flex: none; margin-top: 2px; }\n.hh-proposal-blocked svg { color: var(--hh-accent); }\n.hh-proposal-outcome[data-outcome='approved'] svg { color: var(--hh-ok); }\n.hh-decide { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }\n\n@keyframes hh-house-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  [data-motion='low-frequency'] .hh-spin { animation: hh-house-spin 2s linear infinite; }\n}\n", Ah = "locked", jh = "The recording is paused at its start. Press Play to watch the house fill, or open the Attic to step through it.", Mh = "This is a recording. Nothing can be started, approved or rejected here.", Nh = kh + Bp;
function Ph({ mansion: e, onReturn: t, announcement: n = "", status: r, ghostNames: i, seanceRoom: a = Ah, panelMode: o, replayScheduler: s, now: c }) {
	let [l, u] = F(n);
	j(() => u(n), [n]);
	let d = A((e) => u(e), []), f = Kc(e.name, s), p = f.mode, m = cf({
		mansion: e,
		ghostNames: i,
		seanceRoom: a,
		mode: p,
		replay: f.upstream,
		replayed: f.house,
		onAnnounce: d
	}), { projection: h } = m, g = _m(f, d, {
		watch: p === "replay",
		refresh: !1
	}), _ = N(() => ({
		mansionId: e.name,
		active: p === "live",
		transitions: m.canonical.transitions,
		snapshots: m.canonical.snapshots,
		roomOf: m.canonical.roomOf,
		nameOf: m.canonical.nameOf,
		now: c
	}), [
		e.name,
		p,
		m.canonical,
		c
	]), y = (n, r) => {
		let i = n.target, a = h.rooms.find((e) => e.roomId === i.roomId);
		if (a === void 0) return null;
		let o = m.details.get(a.roomId) ?? null, s = m.outputs.get(a.roomId) ?? null;
		if (i.kind === "ghost") {
			let e = a.ghosts.find((e) => e.ghostId === i.ghostId);
			return e === void 0 ? null : /* @__PURE__ */ L(Oh, {
				room: a,
				ghost: e,
				onOpenRoom: r.openNested
			});
		}
		if (i.kind === "door") {
			let e = a.doors.find((e) => e.phase === i.phase);
			if (e === void 0) return null;
			let t = o?.phases.find((e) => e.line.phase === i.phase)?.door ?? null;
			return /* @__PURE__ */ L(Dh, {
				room: a,
				door: e,
				decision: t,
				onSend: m.send,
				onOpenRoom: r.openNested
			});
		}
		let c = {
			room: a,
			detail: o,
			output: s,
			onSend: m.send,
			onRoomSend: m.sendRoom,
			onOpenSession: m.openSession
		};
		switch (a.roomId) {
			case "foyer": return /* @__PURE__ */ L(yh, {
				room: a,
				mansion: e,
				onReturn: t
			});
			case "study": return /* @__PURE__ */ L(Th, { ...c });
			case "drafting-room": return /* @__PURE__ */ L(_h, { ...c });
			case "workshop": return /* @__PURE__ */ L(Eh, { ...c });
			case "attic": return /* @__PURE__ */ R(I, { children: [a.diagnostic === null || a.readOnly && a.integrity === "valid" ? null : /* @__PURE__ */ R("p", {
				className: "hh-ui-note",
				"data-kind": "diagnostic",
				"data-attic-diagnostic": !0,
				children: [/* @__PURE__ */ L(k, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: a.diagnostic })]
			}), /* @__PURE__ */ L(vm, {
				replay: f,
				onAnnounce: d,
				motion: r.stillHouse ? "none" : "low-frequency",
				watch: p !== "replay"
			})] });
			case "seance-room": return a.locked ? /* @__PURE__ */ L(bh, {}) : /* @__PURE__ */ L(wh, {
				room: a,
				review: m.review,
				onOpenSession: m.openSession
			});
		}
	}, b = /* @__PURE__ */ R("div", {
		className: "hh-ui-notes",
		children: [
			m.loading ? /* @__PURE__ */ R("p", {
				className: "hh-ui-note",
				"data-kind": "loading",
				"data-house-loading": !0,
				children: [/* @__PURE__ */ L(ee, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: "Loading the house…" })]
			}) : null,
			m.logProblem === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-ui-note",
				"data-kind": "diagnostic",
				"data-log-problem": !0,
				children: [/* @__PURE__ */ L(k, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: m.logProblem })]
			}),
			m.authority.text === null || m.authority.block === "loading" || p === "replay" && m.authority.block === "read_only" ? null : /* @__PURE__ */ R("p", {
				className: "hh-ui-note",
				"data-kind": m.authority.block === "read_only" ? "read-only" : "diagnostic",
				"data-block": m.authority.block,
				children: [/* @__PURE__ */ L(v, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: m.authority.text })]
			}),
			m.notice === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-ui-note",
				"data-kind": "notice",
				"data-house-notice": !0,
				children: /* @__PURE__ */ L("span", { children: m.notice })
			}),
			m.roomNotice === null ? null : /* @__PURE__ */ L("p", {
				className: "hh-ui-note",
				"data-kind": "notice",
				"data-room-notice": !0,
				children: /* @__PURE__ */ L("span", { children: m.roomNotice })
			})
		]
	});
	return /* @__PURE__ */ L(zp, {
		projection: h,
		renderSurface: y,
		host: _,
		message: l,
		status: r,
		notes: b,
		banner: p === "replay" ? /* @__PURE__ */ L(bm, {
			panel: g,
			readOnlyText: m.authority.block === "read_only" && m.authority.text !== null ? m.authority.text : Mh,
			startText: f.state.cursor === 0 ? jh : null
		}) : void 0,
		busy: m.loading,
		onReturn: t,
		panelMode: o,
		inFlight: m.inFlight,
		panelStyles: Nh
	});
}
// src/App.tsx
var Fh = {
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
function Ih(e) {
	return e === void 0 ? "" : ` (HTTP ${e})`;
}
function Lh(e) {
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
			text: `Not reachable${Ih(e.status)}`,
			detail: e.message
		};
	}
}
function Rh(e) {
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
			text: Fh[e.gateway.error].short
		};
	}
}
function zh(e) {
	switch (e.kind) {
		case "loading": return "Checking the backend…";
		case "unreachable": return `Backend not reachable${Ih(e.status)}`;
		case "ok": return "version" in e.gateway ? `Backend reachable · Gateway ${e.gateway.version}` : `Backend reachable · ${Fh[e.gateway.error].long}`;
	}
}
function Bh({ tone: e }) {
	let t = {
		size: 18,
		"aria-hidden": !0
	};
	switch (e) {
		case "ok": return /* @__PURE__ */ L(o, {
			...t,
			className: "hh-icon hh-icon-ok"
		});
		case "problem": return /* @__PURE__ */ L(k, {
			...t,
			className: "hh-icon hh-icon-problem"
		});
		case "pending": return /* @__PURE__ */ L(_, {
			...t,
			className: "hh-icon hh-icon-pending"
		});
		case "unknown": return /* @__PURE__ */ L(s, {
			...t,
			className: "hh-icon hh-icon-unknown"
		});
	}
}
function Vh({ name: e, view: t }) {
	return /* @__PURE__ */ R("li", {
		className: "hh-row",
		"data-tone": t.tone,
		children: [
			/* @__PURE__ */ L(Bh, { tone: t.tone }),
			/* @__PURE__ */ L("span", {
				className: "hh-row-name",
				children: e
			}),
			/* @__PURE__ */ L("span", {
				className: "hh-row-text",
				children: t.text
			}),
			t.detail ? /* @__PURE__ */ L("span", {
				className: "hh-row-detail",
				children: t.detail
			}) : null
		]
	});
}
var Hh = `
.hh-house { ${Bn("light")} ${Wn("light")}
  font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--card-fg, var(--text, var(--hh-fb-text))); line-height: 1.45;
  display: block; max-width: 76rem; margin: 0 auto; padding: 8px 12px 32px; box-sizing: border-box; }
@media (prefers-color-scheme: dark) { .hh-house { ${Bn("dark")} ${Wn("dark")} } }
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
/* The way in: the front door fills the page, the name is its brass plate, and the Foyer is a sheet of cream paper. */
.hh-house[data-landing='true'] { position: relative; max-width: none; min-height: 100vh; margin: 0; padding: 0 16px 48px; overflow: hidden;
  background: var(--hh-sc-front-door); }
.hh-landing-door { position: absolute; inset: 0; display: block; }
.hh-landing-keeper { display: none; }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] { position: relative; z-index: 1; display: block; max-width: 30rem; margin: 5vh auto 0;
  padding: 14px 24px 12px; text-align: center; color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 3px solid var(--hh-sc-ink);
  border-radius: 6px; box-shadow: 0 5px 0 var(--hh-sc-ink); }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] .hh-tagline { margin: 0 auto 6px; }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] .hh-summary { color: var(--hh-sc-ink); }
.hh-house[data-landing='true'] .hh-foyer { position: relative; z-index: 1; max-width: 44rem; }
.hh-house[data-landing='true'] .hh-foyer-hall { ${Bn("light")}
  --card: var(--hh-sc-balloon); --card-fg: var(--hh-fb-text); --text: var(--hh-fb-text); --muted: var(--hh-fb-text-muted);
  --border: var(--hh-fb-border); --border-strong: var(--hh-fb-border); --input: var(--hh-fb-surface-raised); --ok: var(--hh-fb-ok);
  --warn: var(--hh-fb-accent); --accent: var(--hh-fb-accent); --accent-fg: var(--hh-fb-accent-text); --ring: var(--hh-fb-focus);
  color: var(--hh-fb-text); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 10px;
  box-shadow: 4px 5px 0 var(--hh-sc-ink); }
@media (min-width: 900px) {
  .hh-landing-keeper { display: block; position: fixed; z-index: 1; right: 2.5%; bottom: 2%; width: clamp(96px, 11vw, 170px); aspect-ratio: 190 / 250; }
}
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
function Uh({ state: e }) {
	return /* @__PURE__ */ R("ul", {
		className: "hh-rows",
		"aria-label": "Status",
		children: [/* @__PURE__ */ L(Vh, {
			name: "Backend",
			view: Lh(e)
		}), /* @__PURE__ */ L(Vh, {
			name: "Gateway",
			view: Rh(e)
		})]
	});
}
function Wh({ landing: e } = {}) {
	let { state: t, retry: n } = ot(), r = e ?? (wt === null ? void 0 : Kn), [i, a] = F(""), [o, s] = F(null), c = t.kind === "ok", l = c && o !== null, u = A((e, n) => /* @__PURE__ */ L(Ph, {
		mansion: e,
		onReturn: n,
		announcement: i,
		status: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(Uh, { state: t }), /* @__PURE__ */ L("p", {
			className: "hh-summary",
			children: zh(t)
		})] })
	}), [i, t]);
	return /* @__PURE__ */ R("main", {
		className: "hh-house",
		"aria-labelledby": "hh-status-title",
		"data-landing": c && !l,
		children: [
			/* @__PURE__ */ L("style", { children: Hh + Pn }),
			c && !l ? /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("span", {
				className: "hh-landing-door",
				"aria-hidden": "true",
				children: /* @__PURE__ */ L(kn, {})
			}), /* @__PURE__ */ L("span", {
				className: "hh-landing-keeper",
				"aria-hidden": "true",
				children: /* @__PURE__ */ L(On, {})
			})] }) : null,
			/* @__PURE__ */ R("div", {
				className: "hh-status",
				"data-compact": l,
				"data-quiet": c && !l,
				children: [/* @__PURE__ */ L("h1", {
					id: "hh-status-title",
					children: "Haunted House"
				}), l ? null : /* @__PURE__ */ R(I, { children: [
					c ? /* @__PURE__ */ L("p", {
						className: "hh-tagline",
						children: Gn
					}) : null,
					/* @__PURE__ */ L(Uh, { state: t }),
					/* @__PURE__ */ R("p", {
						className: "hh-summary",
						"aria-live": "polite",
						children: [zh(t), c && i !== "" ? /* @__PURE__ */ R(I, { children: [" ", /* @__PURE__ */ L("span", {
							className: "hh-announcement",
							children: i
						})] }) : null]
					}),
					t.kind === "unreachable" ? /* @__PURE__ */ L("div", {
						className: "hh-actions",
						children: /* @__PURE__ */ R("button", {
							type: "button",
							className: "hh-retry",
							onClick: n,
							children: [/* @__PURE__ */ L(E, {
								size: 16,
								"aria-hidden": !0
							}), "Retry"]
						})
					}) : null
				] })]
			}),
			c ? /* @__PURE__ */ L(Cr, {
				onAnnounce: a,
				onMansionChange: s,
				renderShell: u,
				preselect: r?.mansion,
				invitation: r?.text
			}) : null
		]
	});
}
export { Wh as default };
