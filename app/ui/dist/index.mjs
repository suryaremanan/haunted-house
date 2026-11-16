import { ArrowLeft as e, Ban as t, Bell as n, Check as r, CircleCheck as i, CircleDashed as a, CircleDot as o, DoorClosed as s, DoorOpen as c, ExternalLink as l, FileText as u, Gauge as d, Ghost as f, History as p, Hourglass as m, LoaderCircle as h, Lock as g, MapPin as _, Moon as v, Pause as y, Play as b, Plus as x, RefreshCw as S, RotateCcw as C, RotateCw as w, Send as T, SkipBack as ee, SkipForward as E, Square as te, TriangleAlert as D, Wind as O, X as ne } from "lucide-react";
import { Fragment as k, forwardRef as re, useCallback as A, useEffect as j, useId as M, useLayoutEffect as ie, useMemo as N, useRef as P, useState as F } from "react";
import * as ae from "@kirocrew/app-sdk";
import { useAppApi as oe, useAppEvents as se } from "@kirocrew/app-sdk";
import { Fragment as I, jsx as L, jsxs as R } from "react/jsx-runtime";
// src/core/backend-status.ts
var ce = "/apps/haunted-house/api/whoami", le = [
	"timeout",
	"unreachable",
	"denied",
	"config"
], ue = /* @__PURE__ */ new Set(["ok", "replay"]), de = "Backend sent an unexpected reply.", fe = "Request failed.", pe = 200;
function me(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function he(e) {
	return typeof e == "string" && le.includes(e);
}
function ge(e) {
	return me(e) ? typeof e.version == "string" && e.version.trim() !== "" ? { version: e.version.trim() } : he(e.error) ? { error: e.error } : null : null;
}
function _e(e) {
	if (!me(e) || typeof e.backend != "string" || !ue.has(e.backend)) return {
		kind: "unreachable",
		message: de
	};
	let t = ge(e.gateway);
	return t === null ? {
		kind: "unreachable",
		message: de
	} : {
		kind: "ok",
		gateway: t
	};
}
function ve(e) {
	if (!me(e) && !(e instanceof Error)) return;
	let t = e.status;
	if (typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599) return t;
}
function ye(e) {
	let t = e instanceof Error || me(e) ? e.message : void 0;
	if (typeof t != "string") return fe;
	let n = t.trim();
	return n === "" ? fe : n.length > pe ? `${n.slice(0, 199)}…` : n;
}
function be(e) {
	let t = ve(e), n = ye(e);
	return t === void 0 ? {
		kind: "unreachable",
		message: n
	} : {
		kind: "unreachable",
		status: t,
		message: n
	};
}
var xe = "Mansion service sent an unexpected reply.", Se = "Mansion request failed.", Ce = [
	"ready",
	"missing",
	"conflict"
], we = ["created", "existing_compatible"], Te = [
	"invalid_request",
	"invalid_mansion_name",
	"unsafe_mansion_root",
	"symlink_escape",
	"mansion_conflict",
	"mansion_missing",
	"mansion_not_registered",
	"metadata_unavailable",
	"filesystem_error"
], z = class extends Error {
	constructor() {
		super(xe), this.name = "MansionApiParseError";
	}
}, Ee = {
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
function De(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Oe(e, t) {
	let n = Object.keys(e);
	return n.length === t.length && n.every((e) => t.includes(e));
}
function ke(e, t) {
	return typeof e == "string" && t.includes(e);
}
function Ae(e) {
	return typeof e != "string" || e.length === 0 || e.length > 40 ? !1 : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(e)?.[0] === e;
}
function je(e, t) {
	if (typeof e != "string" || !e.startsWith("~/") || e.includes("\\")) return !1;
	let n = e.slice(2).split("/");
	return n.length > 0 && n.every((e) => e !== "" && e !== "." && e !== ".." && !/[\u0000-\u001f\u007f]/.test(e)) && n.at(-1) === t;
}
function Me(e) {
	if (!De(e)) throw new z();
	let { name: t, projectSpec: n, displayPath: r, status: i } = e;
	if (!Ae(t) || !Ae(n) || n !== t || !je(r, t) || !ke(i, Ce)) throw new z();
	return {
		name: t,
		projectSpec: n,
		displayPath: r,
		status: i
	};
}
function Ne(e) {
	if (!De(e) || e.schemaVersion !== 1 || !Array.isArray(e.mansions)) throw new z();
	let t = e.mansions.map(Me);
	if (new Set(t.map(({ name: e }) => e)).size !== t.length) throw new z();
	return {
		schemaVersion: 1,
		mansions: t
	};
}
function Pe(e) {
	if (!De(e) || !ke(e.outcome, we)) throw new z();
	let t = Me(e.mansion);
	if (t.status !== "ready") throw new z();
	return {
		outcome: e.outcome,
		mansion: t
	};
}
function Fe(e) {
	if (!De(e)) throw new z();
	let t = Me(e.mansion);
	if (t.status !== "ready") throw new z();
	return { mansion: t };
}
function Ie(e, t = Se) {
	if (typeof e != "string") return t;
	let n = e.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
	return n === "" ? t : n.length > 200 ? `${n.slice(0, 199)}…` : n;
}
var Le = 2e3, Re = "[\\t\\n \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]", ze = RegExp(`^${Re}+|${Re}+$`, "g");
function Be(e) {
	let t = e.codePointAt(0) ?? 0;
	return t === 9 || t === 10 ? !1 : t <= 31 || t >= 127 && t <= 159 || t >= 55296 && t <= 57343;
}
function Ve(e) {
	let t = e.replace(/\r\n?/g, "\n"), n = t.replace(ze, ""), r = [...n].length;
	return [...t].some(Be) ? {
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
function He(e, t) {
	if (t === void 0) return { name: e };
	let n = Ve(t);
	if (!n.ok) throw RangeError(`mansion brief refused: ${n.reason}`);
	return n.brief === null ? { name: e } : {
		name: e,
		brief: n.brief
	};
}
function Ue(e) {
	if (!De(e) || !Oe(e, ["error"]) || !De(e.error)) throw new z();
	let t = e.error;
	if (!Oe(t, ["code", "message"]) || !ke(t.code, Te) || typeof t.message != "string" || t.message.trim() === "") throw new z();
	return { error: {
		code: t.code,
		message: Ee[t.code]
	} };
}
// src/adapters/sdk.ts
var We = "/apps/haunted-house/api/mansions", Ge = "/apps/haunted-house/api/mansions/open", Ke = class extends Error {
	code;
	status;
	constructor(e, t = {}) {
		super(e), this.name = "MansionApiRequestError", this.code = t.code, this.status = t.status;
	}
};
function qe(e) {
	return typeof e == "object" && !!e || e instanceof Error;
}
function Je(e) {
	if (!qe(e)) return;
	let t = e.status;
	return typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599 ? t : void 0;
}
function Ye(e) {
	let t = Je(e);
	if (!qe(e) || typeof e.body != "string") return new Ke(Se, { status: t });
	try {
		let n = Ue(JSON.parse(e.body));
		return new Ke(n.error.message, {
			code: n.error.code,
			status: t
		});
	} catch {
		return new Ke(xe, { status: t });
	}
}
function Xe(e, t) {
	return Promise.resolve().then(e).then(t, (e) => {
		throw Ye(e);
	});
}
function Ze() {
	let e = oe(), t = P(e);
	return t.current = e, N(() => ({
		list: () => Xe(() => t.current.get(We), Ne),
		create: (e, n) => Xe(() => t.current.post(We, He(e, n)), Pe),
		open: (e) => Xe(() => t.current.post(Ge, { name: e }), Fe)
	}), []);
}
function Qe() {
	let e = oe(), [t, n] = F(0), [r, i] = F({ kind: "loading" });
	return j(() => {
		let t = !1;
		return i({ kind: "loading" }), Promise.resolve().then(() => e.get(ce)).then((e) => {
			t || i(_e(e));
		}, (e) => {
			t || i(be(e));
		}), () => {
			t = !0;
		};
	}, [t]), {
		state: r,
		retry: A(() => n((e) => e + 1), [])
	};
}
function $e() {
	try {
		let e = ae.useChatLauncher;
		return typeof e == "function" ? e : void 0;
	} catch {
		return;
	}
}
var et = $e();
function tt() {
	let e = et?.(), t = P(e);
	t.current = e;
	let n = A((e) => {
		e !== "" && t.current?.openChat?.({ slotKey: e });
	}, []);
	return typeof e?.openChat == "function" ? n : null;
}
var nt = {
	mode: "light",
	accent: null,
	colorTheme: null
}, rt = 64;
function it(e) {
	if (typeof e != "string") return null;
	let t = e.trim();
	return t !== "" && t.length <= rt && /^[\w#(),.%\s-]+$/.test(t) ? t : null;
}
function at(e) {
	if (typeof e != "object" || !e) return nt;
	let t = e;
	return {
		mode: t.mode === "dark" ? "dark" : t.mode === "light" ? "light" : nt.mode,
		accent: it(t.accent),
		colorTheme: it(t.colorTheme)
	};
}
function ot(e) {
	try {
		let t = ae[e];
		return typeof t == "function" ? t : void 0;
	} catch {
		return;
	}
}
var st = ot("useTheme"), ct = ot("useNotify"), lt = ot("useNavBadge");
function ut(e) {
	if (e !== void 0) try {
		return e();
	} catch {
		return;
	}
}
function dt() {
	let e = at(ut(st));
	return N(() => e, [
		e.mode,
		e.accent,
		e.colorTheme
	]);
}
function ft(e) {
	typeof e == "object" && e && typeof e.then == "function" && e.then(void 0, () => {});
}
function pt() {
	let e = ut(ct), t = P(e);
	return t.current = e, A((e) => {
		let n = t.current;
		if (typeof n != "function" || e === "") return !1;
		try {
			return ft(n(e)), !0;
		} catch {
			return !1;
		}
	}, []);
}
function mt() {
	let e = ut(lt), t = P(e);
	return t.current = e, A((e) => {
		let n = t.current;
		if (typeof n != "function") return !1;
		let r = Number.isFinite(e) ? Math.max(0, Math.trunc(e)) : 0;
		try {
			return ft(n(r)), !0;
		} catch {
			return !1;
		}
	}, []);
}
function ht() {
	try {
		let e = ae.replayRecording;
		if (typeof e != "object" || !e) return null;
		let { load: t, present: n } = e;
		return typeof t == "function" && typeof n == "function" ? e : null;
	} catch {
		return null;
	}
}
var gt = ht();
// src/components/HeroArt.tsx
function _t() {
	return /* @__PURE__ */ R("svg", {
		className: "hh-hero-art",
		viewBox: "0 0 160 120",
		"aria-hidden": "true",
		focusable: "false",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 2,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: [
			/* @__PURE__ */ L("path", {
				className: "hh-hero-moon",
				d: "M28 10 a12 12 0 1 0 12 16 a9 9 0 1 1 -12 -16 z",
				fill: "currentColor",
				fillOpacity: .25
			}),
			/* @__PURE__ */ L("path", {
				d: "M58 8 v6 M55 11 h6 M136 22 v4 M134 24 h4",
				strokeWidth: 1.2
			}),
			/* @__PURE__ */ L("path", { d: "M104 30 V18 h10 v20" }),
			/* @__PURE__ */ L("path", {
				d: "M50 58 L92 22 L134 58",
				strokeWidth: 2.5
			}),
			/* @__PURE__ */ L("path", { d: "M58 52 V112 H126 V52" }),
			/* @__PURE__ */ L("circle", {
				cx: "92",
				cy: "44",
				r: "6"
			}),
			/* @__PURE__ */ L("path", {
				d: "M86 44 h12 M92 38 v12",
				strokeWidth: 1
			}),
			/* @__PURE__ */ L("path", { d: "M84 112 V90 a8 8 0 0 1 16 0 V112" }),
			/* @__PURE__ */ L("circle", {
				cx: "96",
				cy: "101",
				r: "1.2",
				fill: "currentColor"
			}),
			/* @__PURE__ */ L("rect", {
				x: "64",
				y: "64",
				width: "14",
				height: "16"
			}),
			/* @__PURE__ */ L("path", {
				d: "M71 64 v16 M64 72 h14",
				strokeWidth: 1
			}),
			/* @__PURE__ */ R("g", {
				className: "hh-hero-glow",
				children: [/* @__PURE__ */ L("rect", {
					x: "106",
					y: "64",
					width: "14",
					height: "16",
					fill: "currentColor",
					fillOpacity: .35
				}), /* @__PURE__ */ L("path", {
					d: "M113 64 v16 M106 72 h14",
					strokeWidth: 1
				})]
			}),
			/* @__PURE__ */ L("path", {
				d: "M4 113 H156",
				strokeWidth: 1.5
			}),
			/* @__PURE__ */ L("path", {
				d: "M92 113 q-6 4 -18 5 M98 113 q6 3 -2 6",
				strokeWidth: 1
			}),
			/* @__PURE__ */ R("g", {
				className: "hh-hero-ghost",
				children: [
					/* @__PURE__ */ L("path", {
						d: "M18 112 V80 a12 12 0 0 1 24 0 V112 l-4 -5 l-4 5 l-4 -5 l-4 5 l-4 -5 z",
						fill: "currentColor",
						fillOpacity: .15
					}),
					/* @__PURE__ */ L("circle", {
						cx: "26",
						cy: "80",
						r: "1.6",
						fill: "currentColor"
					}),
					/* @__PURE__ */ L("circle", {
						cx: "34",
						cy: "80",
						r: "1.6",
						fill: "currentColor"
					}),
					/* @__PURE__ */ L("path", { d: "M27 87 q3 3 6 0 M42 88 l8 -10 M18 90 q-4 4 -3 9" })
				]
			})
		]
	});
}
// src/components/house-palette.ts
var vt = [
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
], yt = {
	light: {
		canvas: "#f6ecd6",
		surface: "#fff8e8",
		surfaceRaised: "#fffdf6",
		text: "#241b17",
		textMuted: "#5b4a40",
		border: "#7a6452",
		focus: "#005fcc",
		accent: "#8a4b12",
		accentText: "#fffdf6",
		danger: "#a3261c",
		ok: "#2d6a3e",
		candle: "#9a5a00",
		ghost: "#5d4f86",
		working: "#1d5b86"
	},
	dark: {
		canvas: "#17121c",
		surface: "#211a29",
		surfaceRaised: "#2c2336",
		text: "#f3eadb",
		textMuted: "#c9bcae",
		border: "#9a8aa6",
		focus: "#8ec5ff",
		accent: "#f0b35a",
		accentText: "#1d1408",
		danger: "#ff9a8c",
		ok: "#8fd6a0",
		candle: "#ffc56b",
		ghost: "#d9d0ee",
		working: "#8cc8f0"
	}
}, bt = [
	"canvas",
	"surface",
	"surfaceRaised"
];
function xt(e, t) {
	return bt.map((n) => ({
		foreground: e,
		background: n,
		minimum: t
	}));
}
[
	...xt("text", 4.5),
	...xt("textMuted", 4.5),
	...xt("accent", 4.5),
	...xt("danger", 4.5),
	...xt("ok", 4.5),
	...xt("working", 4.5),
	...xt("border", 3),
	...xt("focus", 3),
	...xt("candle", 3),
	...xt("ghost", 3)
];
function St(e) {
	return `--hh-fb-${e.replace(/[A-Z]/g, (e) => `-${e.toLowerCase()}`)}`;
}
function Ct(e) {
	let t = yt[e];
	return vt.map((e) => `${St(e)}: ${t[e]};`).join(" ");
}
// src/landing.ts
var wt = "A house for your AI agents: each room is a phase of spec-driven work, each ghost an agent you can watch, and each door opens only when you approve.", Tt = {
	mansion: "demo-mansion",
	text: "Watch a mansion get built, then step through what happened."
}, Et = "What should this mansion become?", Dt = "Optional. A few plain sentences about the feature; the Archivist reads them before writing requirements.", Ot = `Keep the brief to ${Le} characters or fewer.`, kt = "Remove control characters from the brief. Line breaks and tabs are fine.", At = (e) => `${e.length} / ${Le} characters${e.ok ? "" : e.reason === "too_long" ? ", too long" : ""}`, jt = (e) => e.ok ? null : e.reason === "too_long" ? Ot : kt, Mt = () => {
	let [e, t] = F(""), [n, r] = F(null), i = N(() => Ve(e), [e]), a = A((e) => {
		t(e), r(null);
	}, []), o = A(() => {
		let e = jt(i);
		return r(e), e === null;
	}, [i]), s = A(() => {
		t(""), r(null);
	}, []);
	return {
		text: e,
		counter: At(i),
		error: n,
		change: a,
		check: o,
		clear: s
	};
}, Nt = "Lowercase letters, numbers, and single hyphens, up to 40 characters. For example: weather-station.", Pt = "Enter a name for the mansion.", Ft = "Use 1–40 lowercase letters, numbers, and single hyphens.";
function It({ ready: e, mutation: t, onCreate: n }) {
	let r = M(), i = M(), a = M(), o = M(), s = M(), c = M(), l = M(), u = M(), d = P(null), f = P(null), p = Mt(), [m, g] = F(""), [_, v] = F(null), y = t.kind === "creating" || t.kind === "opening", b = t.kind === "creating" ? t.name : null, S = t.kind === "error" && t.operation === "create" ? `Could not create ${t.name}. ${t.message}` : null, C = _ ?? S, w = !e || y;
	return /* @__PURE__ */ R("form", {
		className: "hh-create",
		noValidate: !0,
		onSubmit: async (e) => {
			e.preventDefault(), w || (Ae(m) ? (v(null), p.check() ? await n(m, p.text) ? (g(""), p.clear()) : d.current?.focus() : f.current?.focus()) : (v(m === "" ? Pt : Ft), d.current?.focus()));
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
						"aria-invalid": C !== null,
						"aria-describedby": `${i} ${a}`,
						onChange: (e) => {
							g(e.target.value), v(null);
						}
					}),
					/* @__PURE__ */ L("span", {
						id: i,
						className: "hh-foyer-hint",
						children: Nt
					})
				]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-field",
				children: [
					/* @__PURE__ */ L("label", {
						htmlFor: s,
						children: Et
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
						children: Dt
					}),
					/* @__PURE__ */ L("span", {
						id: l,
						className: "hh-foyer-hint",
						children: p.counter
					}),
					p.error === null ? null : /* @__PURE__ */ R("p", {
						id: u,
						className: "hh-foyer-error",
						children: [/* @__PURE__ */ L(D, {
							size: 16,
							"aria-hidden": !0
						}), /* @__PURE__ */ L("span", { children: p.error })]
					})
				]
			}),
			C === null ? null : /* @__PURE__ */ R("p", {
				id: a,
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ L(D, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: C })]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ R("button", {
					type: "submit",
					className: "hh-button",
					"aria-disabled": w,
					"aria-describedby": o,
					children: [/* @__PURE__ */ L(x, {
						size: 16,
						"aria-hidden": !0
					}), "Create mansion"]
				}), /* @__PURE__ */ L("span", {
					id: o,
					className: "hh-foyer-inline",
					children: b === null ? null : /* @__PURE__ */ R(I, { children: [
						/* @__PURE__ */ L(h, {
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
var Lt = "\n.hh-foyer { color: var(--card-fg, var(--text, var(--hh-fb-text, inherit))); font: inherit; max-width: 48rem; margin: 20px auto 0; }\n.hh-foyer[data-view='mansion'] { max-width: none; margin: 0; }\n.hh-foyer-hall, .hh-shell { background: var(--card, var(--hh-fb-surface, transparent));\n  border: 1px solid var(--border, var(--hh-fb-border, currentColor)); border-radius: 12px; padding: 18px 20px; }\n.hh-foyer h2 { font-family: ui-serif, \"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif; font-size: 1.375rem; margin: 0 0 4px; }\n.hh-foyer h3 { font-size: 1rem; margin: 0 0 4px; }\n.hh-foyer h2:focus-visible, .hh-foyer-region:focus-visible { outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n.hh-foyer-lede { margin: 0 0 12px; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n.hh-foyer-invite { margin: 0 0 16px; padding: 10px 14px; font-size: 1.0625rem; font-weight: 600;\n  border-left: 4px solid var(--warn, var(--hh-fb-accent, currentColor)); background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border-radius: 0 8px 8px 0; }\n.hh-foyer-region { margin: 0 0 24px; }\n.hh-foyer-inline { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n.hh-foyer-hint { display: block; margin: 4px 0 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); font-size: 0.875rem; }\n.hh-foyer-error { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; overflow-wrap: anywhere; }\n.hh-foyer-error svg { color: var(--warn, var(--hh-fb-danger, currentColor)); flex: none; margin-top: 2px; }\n.hh-foyer-empty { border: 1px dashed var(--border, var(--hh-fb-border, currentColor)); border-radius: 8px; padding: 12px 16px; }\n.hh-foyer-empty p { margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n\n.hh-mansions { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 10px;\n  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); }\n.hh-mansions legend { padding: 0; margin: 0 0 8px; font-weight: 700; }\n.hh-mansion { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 2px; align-items: center; min-width: 0;\n  background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border: 1px solid var(--border, var(--hh-fb-border, currentColor)); border-radius: 10px; padding: 12px 14px; cursor: pointer; }\n.hh-mansion[data-selected='true'] { border-color: var(--warn, var(--hh-fb-accent, currentColor)); border-width: 3px; padding: 10px 12px; }\n.hh-mansion[data-status='missing'], .hh-mansion[data-status='conflict'] { cursor: not-allowed; border-style: dashed;\n  background: transparent; }\n.hh-mansion:focus-within { outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n.hh-mansion input { margin: 0; width: 1rem; height: 1rem; accent-color: var(--warn, var(--hh-fb-accent, auto)); }\n.hh-mansion-name { font-family: ui-serif, \"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif; font-weight: 700; font-size: 1.0625rem;\n  overflow-wrap: anywhere; }\n.hh-mansion-path, .hh-mansion-status { grid-column: 2; font-size: 0.8125rem; overflow-wrap: anywhere; }\n.hh-mansion-path { color: var(--muted, var(--hh-fb-text-muted, inherit)); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }\n.hh-mansion-status { display: inline-flex; align-items: center; gap: 6px; }\n.hh-mansion { container-type: inline-size; }\n@container (min-width: 16em) { .hh-path-part { white-space: nowrap; } }\n.hh-status-ready svg { color: var(--ok, var(--hh-fb-ok, currentColor)); }\n.hh-status-missing svg { color: var(--muted, var(--hh-fb-text-muted, currentColor)); }\n.hh-status-conflict svg { color: var(--warn, var(--hh-fb-danger, currentColor)); }\n\n.hh-foyer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 14px; }\n.hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;\n  color: inherit; background: transparent; border: 1px solid var(--border-strong, var(--hh-fb-border, currentColor));\n  border-radius: 8px; padding: 6px 12px; }\n.hh-button-primary { color: var(--accent-fg, var(--hh-fb-accent-text, inherit)); background: var(--accent, var(--hh-fb-accent, transparent));\n  font-weight: 700; padding: 10px 18px; font-size: 1.0625rem; }\n.hh-button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }\n.hh-button:focus-visible, .hh-field input:focus-visible, .hh-field textarea:focus-visible {\n  outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }\n\n.hh-create { margin: 0; padding-top: 16px; border-top: 1px solid var(--border, var(--hh-fb-border, currentColor)); }\n.hh-field { display: grid; gap: 4px; min-width: 0; }\n.hh-field label { font-weight: 600; }\n.hh-field input, .hh-field textarea { font: inherit; color: inherit; background: var(--input, var(--hh-fb-surface-raised, transparent));\n  border: 1px solid var(--border-strong, var(--hh-fb-border, currentColor)); border-radius: 6px; padding: 6px 10px;\n  width: 100%; min-width: 0; max-width: 24rem; box-sizing: border-box; }\n.hh-field input[aria-invalid='true'], .hh-field textarea[aria-invalid='true'] { border-width: 2px; }\n.hh-field textarea { resize: vertical; max-width: 36rem; min-height: 5rem; }\n.hh-create .hh-field + .hh-field { margin-top: 12px; }\n\n.hh-shell-eyebrow { margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); font-size: 0.875rem; }\n.hh-shell-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 12px 0; }\n.hh-shell-facts dt { font-weight: 600; }\n.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; }\n.hh-shell-rooms { margin: 12px 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }\n\n.hh-foyer-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }\n\n@media (max-width: 640px) {\n  .hh-foyer-hall, .hh-shell { padding: 14px 12px; }\n}\n\n@keyframes hh-foyer-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-foyer[data-motion='low-frequency'] .hh-foyer-spin { animation: hh-foyer-spin 2s linear infinite; }\n}\n", Rt = {
	ready: "Ready to open",
	missing: "Missing: its folder is no longer in storage, so it cannot be opened.",
	conflict: "Conflict: its folder no longer looks like a mansion, so it cannot be opened."
};
function zt({ status: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "ready": return /* @__PURE__ */ L(i, { ...t });
		case "missing": return /* @__PURE__ */ L(a, { ...t });
		case "conflict": return /* @__PURE__ */ L(D, { ...t });
	}
}
function Bt({ path: e }) {
	let t = e.split("/");
	return /* @__PURE__ */ L(I, { children: t.map((e, n) => /* @__PURE__ */ R(k, { children: [/* @__PURE__ */ L("span", {
		className: "hh-path-part",
		children: n < t.length - 1 ? `${e}/` : e
	}), n < t.length - 1 ? /* @__PURE__ */ L("wbr", {}) : null] }, n)) });
}
function Vt({ mansion: e, group: t, selected: n, onSelect: r }) {
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
				children: /* @__PURE__ */ L(Bt, { path: e.displayPath })
			}),
			/* @__PURE__ */ R("span", {
				className: `hh-mansion-status hh-status-${e.status}`,
				children: [/* @__PURE__ */ L(zt, { status: e.status }), Rt[e.status]]
			})
		]
	});
}
function Ht({ load: e, selectedName: t, mutation: n, onSelect: r, onOpen: i, onRetry: a }) {
	let o = M(), s = M(), l = M(), u = M(), d = P(null), f = n.kind === "creating" || n.kind === "opening", p = n.kind === "error" && n.operation === "open" ? n : null, m = e.kind === "ready" && t !== null && !f, g = e.kind === "loading" || e.kind === "ready" && e.mansions.length > 0;
	return /* @__PURE__ */ R("div", {
		className: "hh-foyer-region",
		ref: d,
		tabIndex: -1,
		children: [
			e.kind === "loading" ? /* @__PURE__ */ R("p", {
				className: "hh-foyer-inline",
				children: [/* @__PURE__ */ L(h, {
					size: 16,
					"aria-hidden": !0,
					className: "hh-foyer-spin"
				}), "Loading mansions…"]
			}) : null,
			e.kind === "error" ? /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ R("p", {
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ L(D, {
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
					children: [/* @__PURE__ */ L(w, {
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
				}), e.mansions.map((e) => /* @__PURE__ */ L(Vt, {
					mansion: e,
					group: o,
					selected: e.name === t,
					onSelect: r
				}, e.name))]
			}) : null,
			g ? /* @__PURE__ */ R("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ R("button", {
					type: "button",
					className: "hh-button hh-button-primary",
					"aria-disabled": !m,
					"aria-describedby": `${l} ${u}`,
					onClick: (e) => {
						m && t !== null && i(t, e.currentTarget);
					},
					children: [/* @__PURE__ */ L(c, {
						size: 16,
						"aria-hidden": !0
					}), t === null ? "Open mansion" : `Open ${t}`]
				}), /* @__PURE__ */ L("span", {
					id: l,
					className: "hh-foyer-inline",
					children: n.kind === "opening" ? /* @__PURE__ */ R(I, { children: [
						/* @__PURE__ */ L(h, {
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
				id: u,
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ L(D, {
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
function Ut({ mansion: t, onReturn: n, children: r }) {
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
function Wt() {
	return {
		load: { kind: "loading" },
		mutation: { kind: "idle" },
		selectedName: null,
		view: { kind: "foyer" }
	};
}
function Gt(e, t) {
	return e.name < t.name ? -1 : +(e.name > t.name);
}
function Kt(e, t) {
	return [...e.filter(({ name: e }) => e !== t.name), t].sort(Gt);
}
function qt(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.name, n);
	return [...t.values()].sort(Gt);
}
function Jt(e, t) {
	return e === null ? null : t.some(({ name: t, status: n }) => t === e && n === "ready") ? e : null;
}
function Yt(e) {
	return e.load.kind === "ready" ? e.load.mansions : null;
}
function Xt(e) {
	return e.kind === "creating" || e.kind === "opening";
}
function Zt(e, t, n) {
	return e.kind === t && e.name === n;
}
function Qt(e, t) {
	switch (t.type) {
		case "load_started": return Wt();
		case "load_succeeded": {
			let n = qt(t.mansions);
			return {
				load: {
					kind: "ready",
					mansions: n
				},
				mutation: { kind: "idle" },
				selectedName: Jt(e.selectedName, n),
				view: { kind: "foyer" }
			};
		}
		case "load_failed": return {
			load: {
				kind: "error",
				message: Ie(t.message)
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
			let n = Jt(t.name, e.load.mansions);
			return n === null || n === e.selectedName ? e : {
				...e,
				selectedName: n
			};
		}
		case "create_started": return e.view.kind !== "foyer" || e.load.kind !== "ready" || Xt(e.mutation) ? e : {
			...e,
			mutation: {
				kind: "creating",
				name: t.name
			}
		};
		case "create_succeeded": {
			if (!Zt(e.mutation, "creating", t.mansion.name)) return e;
			let n = Yt(e);
			if (n === null || t.mansion.status !== "ready") return e;
			let r = Kt(n, t.mansion);
			return {
				...e,
				load: {
					kind: "ready",
					mansions: r
				},
				mutation: { kind: "idle" },
				selectedName: Jt(e.selectedName, r)
			};
		}
		case "create_failed": return Zt(e.mutation, "creating", t.name) ? {
			...e,
			mutation: {
				kind: "error",
				operation: "create",
				name: t.name,
				message: Ie(t.message)
			}
		} : e;
		case "open_started": return e.view.kind !== "foyer" || e.load.kind !== "ready" || Xt(e.mutation) || e.selectedName !== t.name || !e.load.mansions.some(({ name: e, status: n }) => e === t.name && n === "ready") ? e : {
			...e,
			mutation: {
				kind: "opening",
				name: t.name
			}
		};
		case "open_succeeded": {
			if (!Zt(e.mutation, "opening", t.mansion.name) || t.mansion.status !== "ready") return e;
			let n = Yt(e);
			return n === null ? e : {
				load: {
					kind: "ready",
					mansions: Kt(n, t.mansion)
				},
				mutation: { kind: "idle" },
				selectedName: t.mansion.name,
				view: {
					kind: "mansion",
					mansion: t.mansion
				}
			};
		}
		case "open_failed": return Zt(e.mutation, "opening", t.name) ? {
			...e,
			mutation: {
				kind: "error",
				operation: "open",
				name: t.name,
				message: Ie(t.message)
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
var $t = {
	created: (e) => `Mansion ${e} created.`,
	existing_compatible: (e) => `Mansion ${e} already exists. Nothing was changed.`
};
function en(e) {
	return e instanceof Ke || e instanceof z ? e.message : Se;
}
function tn({ onAnnounce: e } = {}) {
	let t = Ze(), n = P(t);
	n.current = t;
	let r = P(e);
	r.current = e;
	let [i, a] = F(Wt), o = P(i), s = P(!1), [c, l] = F(0), u = A((e) => {
		let t = Qt(o.current, e);
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
				message: en(t)
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
			if (a.name !== e) throw new z();
			return u({
				type: "create_succeeded",
				mansion: a
			}), r.current?.($t[i](e)), !0;
		} catch (t) {
			return u({
				type: "create_failed",
				name: e,
				message: en(t)
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
				message: xe
			});
		}, (t) => {
			u({
				type: "open_failed",
				name: e,
				message: en(t)
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
function nn({ onAnnounce: e, stillHouse: t = !1, renderMansion: n, renderShell: r, onMansionChange: i, preselect: a, invitation: o }) {
	let s = dt(), c = M(), [l, u] = F(""), { state: d, retryLoad: f, select: p, create: m, open: h, returnToFoyer: g } = tn({ onAnnounce: e ?? u }), _ = P(!1);
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
	return w.current = i, ie(() => {
		w.current?.(C);
	}, [C]), ie(() => () => w.current?.(null), []), /* @__PURE__ */ R("div", {
		className: "hh-foyer",
		"data-view": v ? "mansion" : "hall",
		"data-theme-mode": s.mode,
		"data-motion": t ? "none" : "low-frequency",
		style: { colorScheme: s.mode },
		children: [
			/* @__PURE__ */ L("style", { children: Lt }),
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
					/* @__PURE__ */ L(Ht, {
						load: d.load,
						selectedName: d.selectedName,
						mutation: d.mutation,
						onSelect: p,
						onOpen: S,
						onRetry: f
					}),
					/* @__PURE__ */ L(It, {
						ready: d.load.kind === "ready",
						mutation: d.mutation,
						onCreate: m
					})
				]
			}),
			d.view.kind === "mansion" ? r === void 0 ? /* @__PURE__ */ L(Ut, {
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
var rn = /* @__PURE__ */ new Set([
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
]), an = ["crew", "house"], on = [
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
], sn = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, cn = 262144, ln = new Set(an), un = new TextEncoder(), dn = /^[0-9a-f]{64}$/, fn = class extends Error {
	path;
	safeDetail;
	constructor(e, t) {
		super(t), this.path = e, this.safeDetail = t;
	}
};
function B(e, t) {
	throw new fn(e, t);
}
function pn(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) return !1;
	let t = Object.getPrototypeOf(e);
	return t === Object.prototype || t === null;
}
function mn(e, t) {
	pn(e) || B(t, "must be a JSON object");
	let n = Object.getOwnPropertyDescriptors(e);
	for (let e of Reflect.ownKeys(n)) {
		typeof e != "string" && B(t, "must contain only JSON object members");
		let r = n[e];
		r.enumerable && "value" in r || B(t, "must contain only JSON object members");
	}
	return e;
}
function hn(e, t, n = [], r = "$") {
	let i = /* @__PURE__ */ new Set([...t, ...n]), a = Object.keys(e);
	(t.some((t) => !Object.hasOwn(e, t)) || a.some((e) => !i.has(e))) && B(r, "has missing or unexpected fields");
}
function gn(e) {
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
function _n(e) {
	return un.encode(e).byteLength;
}
function vn(e, t, { maxBytes: n = 160, allowEmpty: r = !1 } = {}) {
	(typeof e != "string" || gn(e)) && B(t, "must be a valid Unicode string");
	let i = _n(e);
	return (!r && i === 0 || i > n) && B(t, `must be ${r ? "at most" : "between 1 and"} ${n} UTF-8 bytes`), e;
}
function yn(e, t, n) {
	return (typeof e != "number" || !Number.isInteger(e) || e < n) && B(t, `must be an integer greater than or equal to ${n}`), e;
}
function bn(e, t, n) {
	return n && e === null ? null : yn(e, t, 0);
}
function xn(e, t) {
	let n = vn(e, t, { maxBytes: 40 });
	return (n.length > 40 || !sn.test(n)) && B(t, "must be a kebab-case Mansion_ID of at most 40 characters"), n;
}
function Sn(e, t) {
	return typeof e == "string" && rn.has(e) || B(t, "must be a supported Event_Type"), e;
}
function Cn(e, t) {
	return typeof e == "string" && ln.has(e) || B(t, "must be a supported event origin"), e;
}
function wn(e, t, n) {
	return typeof e == "string" && e.startsWith(t) && dn.test(e.slice(t.length)) || B(n, `must be a lowercase ${t.slice(0, -1)} SHA-256 identifier`), e;
}
function Tn(e, t) {
	let n = mn(e, t);
	return hn(n, [
		"mansion_id",
		"ghost_id",
		"session_slot",
		"run_id",
		"run_sequence"
	], [], t), {
		mansion_id: xn(n.mansion_id, `${t}.mansion_id`),
		ghost_id: vn(n.ghost_id, `${t}.ghost_id`),
		session_slot: vn(n.session_slot, `${t}.session_slot`),
		run_id: vn(n.run_id, `${t}.run_id`),
		run_sequence: yn(n.run_sequence, `${t}.run_sequence`, 0)
	};
}
function En(e, t) {
	return (!Array.isArray(e) || e.length < 1 || e.length > 8) && B(t, "must contain between 1 and 8 identity parts"), e.map((e, n) => vn(e, `${t}[${n}]`, {
		maxBytes: 512,
		allowEmpty: !0
	}));
}
function Dn(e, t) {
	let n = mn(e, t);
	return hn(n, [
		"origin",
		"source_type",
		"identity_parts",
		"revision",
		"generation",
		"source_sequence"
	], [], t), {
		origin: Cn(n.origin, `${t}.origin`),
		source_type: vn(n.source_type, `${t}.source_type`),
		identity_parts: En(n.identity_parts, `${t}.identity_parts`),
		revision: yn(n.revision, `${t}.revision`, 0),
		generation: vn(n.generation, `${t}.generation`, { allowEmpty: !0 }),
		source_sequence: yn(n.source_sequence, `${t}.source_sequence`, 0)
	};
}
function On(e, t) {
	return wn(e, "e1:", t);
}
function kn(e, t, n) {
	return (!Array.isArray(e) || e.length > 32) && B(t, "must contain at most 32 causal predecessors"), e.map((e, r) => n(e, `${t}[${r}]`));
}
function An(e, t, n) {
	if (e === null || typeof e == "boolean" || typeof e == "string") return typeof e == "string" && gn(e) && B(t, "must contain valid Unicode strings"), e;
	if (typeof e == "number") return Number.isFinite(e) || B(t, "must contain only finite numbers"), Object.is(e, -0) ? 0 : e;
	if (Array.isArray(e)) {
		n.has(e) && B(t, "must not contain a cycle"), n.add(e);
		try {
			return e.map((e) => An(e, t, n));
		} finally {
			n.delete(e);
		}
	}
	if (pn(e)) {
		n.has(e) && B(t, "must not contain a cycle"), n.add(e);
		try {
			let r = mn(e, t), i = {};
			for (let e of Object.keys(r)) gn(e) && B(t, "must contain valid Unicode object keys"), Object.defineProperty(i, e, {
				value: An(r[e], t, n),
				enumerable: !0,
				configurable: !0,
				writable: !0
			});
			return i;
		} finally {
			n.delete(e);
		}
	}
	B(t, "must be JSON-compatible");
}
function jn(e, t) {
	let n = Array.from(e, (e) => e.codePointAt(0)), r = Array.from(t, (e) => e.codePointAt(0)), i = Math.min(n.length, r.length);
	for (let e = 0; e < i; e += 1) if (n[e] !== r[e]) return n[e] - r[e];
	return n.length - r.length;
}
function V(e) {
	if (e === null || typeof e == "boolean" || typeof e == "number" || typeof e == "string") return JSON.stringify(e);
	if (Array.isArray(e)) return `[${e.map(V).join(",")}]`;
	let t = e;
	return `{${Object.keys(t).sort(jn).map((e) => `${JSON.stringify(e)}:${V(t[e])}`).join(",")}}`;
}
var Mn = [
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
function Nn(e, t) {
	return e >>> t | e << 32 - t;
}
function Pn(e) {
	let t = un.encode(e), n = t.length * 8, r = Math.ceil((t.length + 9) / 64) * 64, i = new Uint8Array(r);
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
			let t = s[e - 15], n = s[e - 2], r = Nn(t, 7) ^ Nn(t, 18) ^ t >>> 3, i = Nn(n, 17) ^ Nn(n, 19) ^ n >>> 10;
			s[e] = s[e - 16] + r + s[e - 7] + i >>> 0;
		}
		let [t, n, r, i, c, l, u, d] = o;
		for (let e = 0; e < 64; e += 1) {
			let a = Nn(c, 6) ^ Nn(c, 11) ^ Nn(c, 25), o = c & l ^ ~c & u, f = d + a + o + Mn[e] + s[e] >>> 0, p = (Nn(t, 2) ^ Nn(t, 13) ^ Nn(t, 22)) + (t & n ^ t & r ^ n & r) >>> 0;
			d = u, u = l, l = c, c = i + f >>> 0, i = r, r = n, n = t, t = f + p >>> 0;
		}
		o[0] = o[0] + t >>> 0, o[1] = o[1] + n >>> 0, o[2] = o[2] + r >>> 0, o[3] = o[3] + i >>> 0, o[4] = o[4] + c >>> 0, o[5] = o[5] + l >>> 0, o[6] = o[6] + u >>> 0, o[7] = o[7] + d >>> 0;
	}
	return Array.from(o, (e) => e.toString(16).padStart(8, "0")).join("");
}
function Fn(e) {
	return {
		mansion_id: e.mansion_id,
		ghost_id: e.ghost_id,
		session_slot: e.session_slot,
		run_id: e.run_id,
		run_sequence: e.run_sequence
	};
}
function In(e) {
	return {
		origin: e.origin,
		source_type: e.source_type,
		identity_parts: e.identity_parts,
		revision: e.revision,
		generation: e.generation,
		source_sequence: e.source_sequence
	};
}
function Ln(e) {
	return {
		schema_version: e.schema_version,
		event_type: e.event_type,
		scope: Fn(e.scope),
		source: In(e.source),
		caused_by: e.caused_by,
		occurred_at_ms: e.occurred_at_ms,
		payload: e.payload
	};
}
function Rn(e) {
	return `e1:${Pn(V([
		e.schema_version,
		e.event_type,
		Fn(e.scope),
		{
			origin: e.source.origin,
			source_type: e.source.source_type,
			identity_parts: e.source.identity_parts
		}
	]))}`;
}
function zn(e) {
	return `r1:${Pn(V(Ln(e)))}`;
}
function Bn(e) {
	let t = {
		...Ln(e),
		event_id: e.event_id,
		record_id: e.record_id,
		sequence: e.sequence,
		persisted_at_ms: e.persisted_at_ms
	};
	return e.prev_hash !== void 0 && e.hash !== void 0 && (t.prev_hash = e.prev_hash, t.hash = e.hash), t;
}
function Vn(e, t, n) {
	let r = An(e, n, /* @__PURE__ */ new Set());
	return _n(V(r)) > 262144 && B(n, `must encode to at most ${cn} UTF-8 bytes`), t === "domain_event_recorded" ? Hn(r, n) : r;
}
function Hn(e, t) {
	let n = mn(e, t);
	return hn(n, [
		"domain",
		"kind",
		"entity_id",
		"data"
	], [], t), {
		domain: vn(n.domain, `${t}.domain`),
		kind: vn(n.kind, `${t}.kind`),
		entity_id: vn(n.entity_id, `${t}.entity_id`),
		data: An(n.data, `${t}.data`, /* @__PURE__ */ new Set())
	};
}
function Un(e, t) {
	if (e.schema_version !== 1) throw new Wn(t);
	return 1;
}
var Wn = class extends Error {
	path;
	constructor(e) {
		super("schema version is not supported"), this.path = e;
	}
};
function Gn(e, t) {
	try {
		return {
			ok: !0,
			value: t()
		};
	} catch (t) {
		return t instanceof Wn ? {
			ok: !1,
			diagnostic: {
				code: "unsupported_schema",
				path: t.path,
				safe_detail: "Schema version is not supported."
			}
		} : t instanceof fn ? {
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
function Kn(e) {
	return Gn("invalid_record", () => {
		let t = mn(e, "$");
		hn(t, [
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
		let n = Un(t, "$.schema_version"), r = Sn(t.event_type, "$.event_type"), i = {
			schema_version: n,
			event_type: r,
			scope: Tn(t.scope, "$.scope"),
			source: Dn(t.source, "$.source"),
			caused_by: kn(t.caused_by, "$.caused_by", On),
			occurred_at_ms: bn(t.occurred_at_ms, "$.occurred_at_ms", !0),
			payload: Vn(t.payload, r, "$.payload")
		}, a = wn(t.event_id, "e1:", "$.event_id"), o = wn(t.record_id, "r1:", "$.record_id");
		a !== Rn(i) && B("$.event_id", "does not match canonical event content"), o !== zn(i) && B("$.record_id", "does not match canonical event content");
		let s = Object.hasOwn(t, "prev_hash"), c = Object.hasOwn(t, "hash");
		s !== c && B("$", "prev_hash and hash must be present together");
		let l = {
			...i,
			event_id: a,
			record_id: o,
			sequence: yn(t.sequence, "$.sequence", 1),
			persisted_at_ms: bn(t.persisted_at_ms, "$.persisted_at_ms", !1)
		};
		return s && c ? {
			...l,
			prev_hash: wn(t.prev_hash, "h1:", "$.prev_hash"),
			hash: wn(t.hash, "h1:", "$.hash")
		} : l;
	});
}
function qn(e) {
	return `${V(Bn(e))}\n`;
}
function Jn(e, t) {
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
	let r = Kn(n);
	return r.ok ? r : {
		ok: !1,
		diagnostic: {
			...r.diagnostic,
			line: t
		}
	};
}
// src/core/ghost-state.ts
var Yn = [
	"idle",
	"working",
	"waiting",
	"blocked",
	"failed",
	"done"
];
function Xn(e) {
	return e.caused_by.length + (e.occurred_at_ms === null ? 0 : 1) + (e.source.generation.length === 0 ? 0 : 1) + +(e.source.source_sequence > 0) + cr(e.payload);
}
function Zn(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = t.get(n.record_id);
		(e === void 0 || fr(n, e) < 0) && t.set(n.record_id, n);
	}
	let n = /* @__PURE__ */ new Map();
	for (let e of t.values()) {
		let t = n.get(e.event_id);
		t === void 0 ? n.set(e.event_id, [e]) : t.push(e);
	}
	let r = [], i = /* @__PURE__ */ new Map();
	for (let [e, t] of n) {
		let n = t[0];
		for (let e of t.slice(1)) dr(e, n) > 0 && (n = e);
		r.push(n);
		let a = t.map((e) => e.record_id).sort(U);
		a.length > 1 && _r(i, {
			code: "conflicting_variant",
			event_id: e,
			related_event_id: null,
			kind: "conflict",
			record_ids: a
		});
	}
	r.sort(pr);
	let a = new Map(r.map((e, t) => [e.event_id, t]));
	return r.forEach((e, t) => {
		for (let n of new Set(e.caused_by)) {
			let r = a.get(n);
			r === void 0 ? _r(i, {
				code: "missing_predecessor",
				event_id: e.event_id,
				related_event_id: n,
				kind: "missing",
				record_ids: []
			}) : r >= t && _r(i, {
				code: "missing_predecessor",
				event_id: e.event_id,
				related_event_id: n,
				kind: "forward",
				record_ids: []
			});
		}
	}), {
		events: r,
		diagnostics: Array.from(i.values()).sort(gr)
	};
}
function Qn(e, t, n, r) {
	return `t1:${Pn(V([
		e,
		t,
		n,
		r
	]))}`;
}
function $n(e) {
	let t = Zn(e);
	return {
		selection: t,
		snapshots: er(t.events),
		transitions: ir(t.events)
	};
}
function er(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = [n.scope.mansion_id, n.scope.ghost_id];
		t.set(V(e), e);
	}
	return Array.from(t.values()).sort(hr).map(([t, n]) => ar(e, t, n));
}
function tr(e) {
	return V([
		e.run_sequence,
		e.run_id,
		e.session_slot
	]);
}
function nr(e, t) {
	switch (e.latest = t, t.event_type) {
		case "approval_requested":
			H(t, "mid") !== null && e.requests.push(t);
			break;
		case "approval_decided": {
			let n = H(t, "mid");
			n !== null && e.decided.add(n);
			break;
		}
		case "tool_started": {
			let n = H(t, "tool_call_id");
			n !== null && e.startedTools.add(n);
			break;
		}
		case "tool_finished": {
			let n = H(t, "tool_call_id");
			n !== null && ur(t, "final") === !0 && e.finishedTools.add(n);
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
function rr(e, t, n) {
	let r = e.selectedStart;
	if (r === null) return or(t, n);
	let i = e.runs.get(tr(r.scope)), a = /* @__PURE__ */ new Set();
	for (let e of i.requests) {
		let t = H(e, "mid");
		i.decided.has(t) || a.add(t);
	}
	let o = Array.from(a).sort(U), s = Array.from(i.startedTools).filter((e) => !i.finishedTools.has(e)).sort(U), c, l;
	return i.failed === void 0 ? i.blocked === void 0 ? i.completed === void 0 ? o.length > 0 ? (c = "waiting", l = sr(i.requests, (e) => a.has(H(e, "mid")))) : (c = "working", l = i.progress) : (c = "done", l = i.completed) : (c = "blocked", l = i.blocked) : (c = "failed", l = i.failed), {
		mansion_id: t,
		ghost_id: n,
		run_id: r.scope.run_id,
		run_sequence: r.scope.run_sequence,
		state: c,
		pending_approvals: o,
		open_tools: s,
		latest_event_id: i.latest.event_id,
		latest_sequence: i.latest.sequence,
		reason: l === void 0 ? null : H(l, "reason")
	};
}
function ir(e) {
	let t = /* @__PURE__ */ new Map(), n = [];
	for (let r of e) {
		let e = r.scope.mansion_id, i = r.scope.ghost_id, a = V([e, i]), o = t.get(a);
		o === void 0 && (o = {
			runs: /* @__PURE__ */ new Map(),
			selectedStart: null,
			snapshot: or(e, i)
		}, t.set(a, o));
		let s = tr(r.scope), c = o.runs.get(s);
		c === void 0 && (c = {
			requests: [],
			decided: /* @__PURE__ */ new Set(),
			startedTools: /* @__PURE__ */ new Set(),
			finishedTools: /* @__PURE__ */ new Set(),
			latest: r
		}, o.runs.set(s, c)), nr(c, r), r.event_type === "run_started" && (o.selectedStart === null || mr(r, o.selectedStart) > 0) && (o.selectedStart = r);
		let l = o.snapshot, u = rr(o, e, i);
		o.snapshot = u, vr(l, u) || n.push({
			transition_id: Qn(r.event_id, e, i, u.state),
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
function ar(e, t, n) {
	let r = e.filter((e) => e.scope.mansion_id === t && e.scope.ghost_id === n), i = r.filter((e) => e.event_type === "run_started");
	if (i.length === 0) return or(t, n);
	let a = i[0];
	for (let e of i.slice(1)) mr(e, a) > 0 && (a = e);
	let o = r.filter((e) => e.scope.run_sequence === a.scope.run_sequence && e.scope.run_id === a.scope.run_id && e.scope.session_slot === a.scope.session_slot), s = new Set(o.filter((e) => e.event_type === "approval_requested").map((e) => H(e, "mid")).filter((e) => e !== null)), c = new Set(o.filter((e) => e.event_type === "approval_decided").map((e) => H(e, "mid")).filter((e) => e !== null)), l = Array.from(s).filter((e) => !c.has(e)).sort(U), u = new Set(o.filter((e) => e.event_type === "tool_started").map((e) => H(e, "tool_call_id")).filter((e) => e !== null)), d = new Set(o.filter((e) => e.event_type === "tool_finished" && ur(e, "final") === !0).map((e) => H(e, "tool_call_id")).filter((e) => e !== null)), f = Array.from(u).filter((e) => !d.has(e)).sort(U), p = o.filter((e) => e.event_type === "run_failed"), m = o.filter((e) => e.event_type === "run_blocked"), h = o.filter((e) => e.event_type === "run_completed"), g, _;
	p.length > 0 ? (g = "failed", _ = p.at(-1)) : m.length > 0 ? (g = "blocked", _ = m.at(-1)) : h.length > 0 ? (g = "done", _ = h.at(-1)) : l.length > 0 ? (g = "waiting", _ = sr(o, (e) => e.event_type === "approval_requested" && l.includes(H(e, "mid") ?? ""))) : (g = "working", _ = sr(o, (e) => e.event_type === "ghost_progressed" || e.event_type === "run_started"));
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
		reason: _ === void 0 ? null : H(_, "reason")
	};
}
function or(e, t) {
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
function sr(e, t) {
	for (let n = e.length - 1; n >= 0; --n) {
		let r = e[n];
		if (t(r)) return r;
	}
}
function cr(e) {
	return e === null ? 0 : typeof e == "string" ? e.length === 0 ? 0 : 1 : typeof e == "boolean" || typeof e == "number" ? 1 : Array.isArray(e) ? e.reduce((e, t) => e + cr(t), 0) : Object.values(e).reduce((e, t) => e + cr(t), 0);
}
function lr(e) {
	return e.payload === null || Array.isArray(e.payload) || typeof e.payload != "object" ? null : e.payload;
}
function H(e, t) {
	let n = lr(e)?.[t];
	return typeof n == "string" && n.length > 0 ? n : null;
}
function ur(e, t) {
	let n = lr(e)?.[t];
	return typeof n == "boolean" ? n : null;
}
function dr(e, t) {
	if (e.source.revision !== t.source.revision) return e.source.revision - t.source.revision;
	let n = Xn(e) - Xn(t);
	return n === 0 ? U(e.record_id, t.record_id) : n;
}
function fr(e, t) {
	if (e.sequence !== t.sequence) return e.sequence - t.sequence;
	let n = U(e.event_id, t.event_id);
	return n === 0 ? U(qn(e), qn(t)) : n;
}
function pr(e, t) {
	return e.sequence === t.sequence ? U(e.event_id, t.event_id) : e.sequence - t.sequence;
}
function mr(e, t) {
	if (e.scope.run_sequence !== t.scope.run_sequence) return e.scope.run_sequence - t.scope.run_sequence;
	let n = U(e.scope.run_id, t.scope.run_id);
	return n === 0 ? e.sequence === t.sequence ? U(e.event_id, t.event_id) : e.sequence - t.sequence : n;
}
function hr(e, t) {
	let n = U(e[0], t[0]);
	return n === 0 ? U(e[1], t[1]) : n;
}
function gr(e, t) {
	return [
		U(e.code, t.code),
		U(e.event_id, t.event_id),
		U(e.related_event_id ?? "", t.related_event_id ?? ""),
		U(e.kind, t.kind),
		U(e.record_ids.join(","), t.record_ids.join(","))
	].find((e) => e !== 0) ?? 0;
}
function _r(e, t) {
	e.set(V(t), t);
}
function vr(e, t) {
	return V(e) === V(t);
}
function U(e, t) {
	let n = Array.from(e, (e) => e.codePointAt(0)), r = Array.from(t, (e) => e.codePointAt(0)), i = Math.min(n.length, r.length);
	for (let e = 0; e < i; e += 1) if (n[e] !== r[e]) return n[e] - r[e];
	return n.length - r.length;
}
// src/core/ghost-status.ts
var yr = {
	idle: "Idle",
	working: "Working",
	waiting: "Waiting",
	blocked: "Blocked",
	failed: "Failed",
	done: "Done"
}, br = /* @__PURE__ */ new Set([
	"waiting",
	"blocked",
	"failed"
]), xr = {
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
}, Sr = 120;
function Cr(e, t) {
	let n = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function wr(e) {
	if (e === null) return null;
	let t = Object.hasOwn(xr, e) ? xr[e] : void 0;
	if (t !== void 0) return t;
	if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(e)) {
		let t = Cr(e.replace(/_/g, " "), Sr);
		return t.charAt(0).toUpperCase() + t.slice(1);
	}
	let n = Cr(e, Sr);
	return n === "" ? null : n;
}
function Tr(e) {
	let t = Cr(e.replace(/[-_]+/g, " "), 60);
	return t === "" ? "Ghost" : t.replace(/(^|\s)(\p{L})/gu, (e, t, n) => t + n.toUpperCase());
}
function Er(e) {
	return e <= 0 ? null : e === 1 ? "1 approval pending" : `${e} approvals pending`;
}
var Dr = "house-operator";
function Or(e, t = {}) {
	return Array.from(e).filter((e) => e.ghost_id !== Dr).map((e) => {
		let n = Object.hasOwn(t, e.ghost_id) ? t[e.ghost_id] : void 0;
		return {
			key: JSON.stringify([e.mansion_id, e.ghost_id]),
			ghostId: e.ghost_id,
			name: n === void 0 || n.trim() === "" ? Tr(e.ghost_id) : n,
			state: e.state,
			stateText: yr[e.state],
			pendingCount: e.pending_approvals.length,
			pendingText: Er(e.pending_approvals.length),
			reason: wr(e.reason)
		};
	});
}
var kr = /* @__PURE__ */ new Set([
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"duplicate_sequence",
	"missing_sequence"
]);
function Ar(e) {
	let t = e.line === void 0 ? "" : ` at line ${e.line}`;
	if (kr.has(e.code)) return `The séance log failed its integrity check${t}. Showing only the records before it.`;
	switch (e.code) {
		case "invalid_record":
		case "unsupported_schema": return `A séance log record${t} could not be read and was left out.`;
		case "history_partial": return "Some activity could not be recovered from Crew history.";
		case "invalid_envelope":
		case "unknown_session":
		case "approval_unmatched": return "A Crew event was refused and not recorded.";
		case "persistence_failed": return /\s/.test(e.safe_detail) ? Cr(e.safe_detail, 160) : "The séance log could not be saved or read. Showing the last confirmed state.";
		default: return "The séance log reported a problem. Showing the last confirmed state.";
	}
}
// src/core/house-registry.ts
var jr = {
	navigation: "navigation",
	requirements: "requirements",
	design: "design",
	"tasks-and-implementation": "tasks and implementation",
	replay: "replay",
	review: "review"
}, Mr = [
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
], Nr = new Map(Mr.map((e) => [e.id, e]));
function Pr(e) {
	return typeof e == "string" && Nr.has(e);
}
function Fr(e) {
	return Nr.get(e);
}
function Ir(e) {
	return Fr(e).order;
}
function Lr(e, t) {
	return Ir(e) - Ir(t);
}
function Rr(e) {
	return Mr.filter((t) => t.scope === "mvp" || e !== "hidden");
}
function zr(e, t, n) {
	if (!n.has(e)) return e;
	let r = /* @__PURE__ */ new Set([e]), i = Nr.get(e)?.neighbors[t];
	for (; i !== void 0 && !r.has(i);) {
		if (n.has(i)) return i;
		r.add(i), i = Nr.get(i)?.neighbors[t];
	}
	return e;
}
function Br(e) {
	return e === "not_applicable" ? "not applicable" : e;
}
var W = [
	"requirements",
	"design",
	"tasks",
	"implementation"
], Vr = [
	"not_started",
	"ready",
	"starting",
	"working",
	"waiting",
	"revision_required",
	"approved",
	"failed",
	"done"
], Hr = [
	"sealed",
	"waiting",
	"open",
	"rejected"
], Ur = [
	"pending",
	"approved",
	"rejected",
	"superseded"
], Wr = [
	"pending",
	"approved",
	"rejected",
	"consumed",
	"succeeded",
	"failed",
	"superseded"
], Gr = [
	"valid",
	"corrupt",
	"uncertain"
], Kr = [
	"delete_path",
	"run_command",
	"git_write"
], qr = [
	"list",
	"read",
	"write",
	"delete",
	"command_read",
	"command_write",
	"git_write"
], Jr = ["approved", "rejected"], Yr = ["operator", "crew"], Xr = 1024, Zr = ["[redacted]", "[home]/"], Qr = class extends Error {
	path;
	constructor(e) {
		super("refused"), this.path = e;
	}
};
function G(e) {
	throw new Qr(e);
}
function $r(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function ei(e, t, n, r = []) {
	$r(e) || G(t);
	for (let i of Object.keys(e)) !n.includes(i) && !r.includes(i) && G(t);
	for (let r of n) Object.hasOwn(e, r) || G(`${t}.${r}`);
	return e;
}
function ti(e, t, n) {
	return typeof e == "string" && t.includes(e) || G(n), e;
}
function ni(e, t, n = 0) {
	return (typeof e != "number" || !Number.isSafeInteger(e) || e < n) && G(t), e;
}
var ri = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
function K(e, t, n = 160) {
	return (typeof e != "string" || e.length === 0 || e.length > n || ri.test(e)) && G(t), e;
}
function ii(e, t) {
	return typeof e == "string" && /^[0-9a-f]{64}$/.test(e) || G(t), e;
}
function ai(e, t, n = !1) {
	if (n && e === "") return "";
	let r = K(e, t, Xr);
	(r.startsWith("/") || r.includes("\\")) && G(t);
	for (let e of r.split("/")) (e === "" || e === "." || e === "..") && G(t);
	return r;
}
function oi(e, t) {
	return (typeof e != "string" || e.length > 40 || !sn.test(e)) && G(t), e;
}
function si(e, t) {
	let n = ei(e, t, [
		"revision",
		"sha256",
		"size_bytes"
	]);
	return {
		revision: ni(n.revision, `${t}.revision`, 1),
		sha256: ii(n.sha256, `${t}.sha256`),
		sizeBytes: ni(n.size_bytes, `${t}.size_bytes`)
	};
}
function ci(e, t) {
	if (e === null) return null;
	let n = ei(e, t, [
		"outcome",
		"actor",
		"event_id",
		"sequence"
	]), r = n.event_id;
	return typeof r == "string" && /^e1:[0-9a-f]{64}$/.test(r) || G(`${t}.event_id`), {
		outcome: ti(n.outcome, Jr, `${t}.outcome`),
		actor: ti(n.actor, Yr, `${t}.actor`),
		eventId: r,
		sequence: ni(n.sequence, `${t}.sequence`, 1)
	};
}
function li(e, t, n, r) {
	if (e === "pending") return t === null;
	if (e === "superseded") return t === null || r && t.outcome === "approved";
	let i = Object.hasOwn(n, e) ? n[e] : void 0;
	return i !== void 0 && t !== null && t.outcome === i;
}
var ui = {
	approved: "approved",
	rejected: "rejected"
}, di = {
	approved: "approved",
	rejected: "rejected",
	consumed: "approved",
	succeeded: "approved",
	failed: "approved"
};
function fi(e, t, n) {
	if (e === null) return null;
	let r = ei(e, t, [
		"proposal_id",
		"phase",
		"document_path",
		"artifact_revision",
		"status",
		"created_sequence",
		"decision"
	]);
	r.phase !== n && G(`${t}.phase`);
	let i = ti(r.status, Ur, `${t}.status`), a = ci(r.decision, `${t}.decision`);
	return li(i, a, ui, !1) || G(`${t}.decision`), {
		proposalId: K(r.proposal_id, `${t}.proposal_id`),
		phase: n,
		documentPath: ai(r.document_path, `${t}.document_path`),
		artifactRevision: si(r.artifact_revision, `${t}.artifact_revision`),
		status: i,
		createdSequence: ni(r.created_sequence, `${t}.created_sequence`, 1),
		decision: a
	};
}
function pi(e, t) {
	switch (e) {
		case "waiting": return t?.status === "pending";
		case "open": return t?.status === "approved";
		case "rejected": return t?.status === "rejected";
		case "sealed": return t === null || t.status === "superseded" || t.status === "rejected";
	}
}
function mi(e, t, n) {
	let r = ei(e, t, [
		"phase",
		"status",
		"ghost_ids",
		"door"
	]);
	r.phase !== n && G(`${t}.phase`), (!Array.isArray(r.ghost_ids) || r.ghost_ids.length > 16) && G(`${t}.ghost_ids`);
	let i = r.ghost_ids.map((e, n) => K(e, `${t}.ghost_ids[${n}]`));
	new Set(i).size !== i.length && G(`${t}.ghost_ids`);
	let a = ei(r.door, `${t}.door`, ["status", "proposal"]), o = ti(a.status, Hr, `${t}.door.status`), s = fi(a.proposal, `${t}.door.proposal`, n);
	return pi(o, s) || G(`${t}.door`), {
		phase: n,
		status: ti(r.status, Vr, `${t}.status`),
		ghostIds: i,
		door: {
			status: o,
			proposal: s
		}
	};
}
function hi(e) {
	return Zr.some((t) => e.includes(t));
}
function gi(e, t = 0) {
	return t > 8 ? !1 : e === null || typeof e == "boolean" ? !0 : typeof e == "number" ? Number.isSafeInteger(e) : typeof e == "string" ? !ri.test(e) && !hi(e) : Array.isArray(e) ? e.every((e) => gi(e, t + 1)) : $r(e) ? Object.entries(e).every(([e, n]) => e !== "" && !ri.test(e) && !hi(e) && gi(n, t + 1)) : !1;
}
function _i(e) {
	try {
		let t = ei(e, "$", [
			"schema_version",
			"mansion_id",
			"session_slot",
			"room",
			"kind",
			"working_directory",
			"arguments",
			"path_intents"
		]);
		if (t.schema_version !== 1 || !$r(t.arguments) || !gi(t.arguments) || JSON.stringify(t.arguments).length > 16384 || !Array.isArray(t.path_intents) || t.path_intents.length > 64 || [
			t.session_slot,
			t.room,
			t.working_directory
		].some((e) => typeof e == "string" && hi(e))) return null;
		let n = t.path_intents.map((e, t) => {
			let n = ei(e, `\$[${t}]`, ["path", "access"]);
			return typeof n.path == "string" && hi(n.path) && G("$"), {
				path: ai(n.path, "$"),
				access: ti(n.access, qr, "$")
			};
		});
		return {
			schemaVersion: 1,
			mansionId: oi(t.mansion_id, "$"),
			sessionSlot: K(t.session_slot, "$"),
			room: K(t.room, "$"),
			kind: ti(t.kind, Kr, "$"),
			workingDirectory: ai(t.working_directory, "$", !0),
			arguments: t.arguments,
			pathIntents: n
		};
	} catch (e) {
		if (e instanceof Qr) return null;
		throw e;
	}
}
function vi(e, t, n) {
	let r = ei(e, t, [
		"proposal_id",
		"ghost_id",
		"session_slot",
		"room",
		"status",
		"action_digest",
		"descriptor",
		"created_sequence",
		"decision"
	]), i = ti(r.status, Wr, `${t}.status`), a = ci(r.decision, `${t}.decision`);
	li(i, a, di, !0) || G(`${t}.decision`);
	let o = K(r.session_slot, `${t}.session_slot`), s = r.room === null ? null : K(r.room, `${t}.room`), c = r.descriptor === null ? null : _i(r.descriptor);
	return c !== null && (c.mansionId !== n || c.sessionSlot !== o || c.room !== s) && (c = null), {
		proposalId: K(r.proposal_id, `${t}.proposal_id`),
		ghostId: K(r.ghost_id, `${t}.ghost_id`),
		sessionSlot: o,
		room: s,
		status: i,
		actionDigest: ii(r.action_digest, `${t}.action_digest`),
		descriptor: c,
		createdSequence: ni(r.created_sequence, `${t}.created_sequence`, 1),
		decision: a
	};
}
function yi(e, t) {
	let n = ei(e, t, [
		"slot",
		"mid",
		"requested_sequence",
		"tool_name",
		"action_digest",
		"proposal_id"
	]);
	return {
		slot: K(n.slot, `${t}.slot`),
		mid: K(n.mid, `${t}.mid`),
		requestedSequence: ni(n.requested_sequence, `${t}.requested_sequence`, 1),
		toolName: n.tool_name === null ? null : K(n.tool_name, `${t}.tool_name`),
		actionDigest: n.action_digest === null ? null : ii(n.action_digest, `${t}.action_digest`),
		proposalId: n.proposal_id === null ? null : K(n.proposal_id, `${t}.proposal_id`)
	};
}
function bi(e, t) {
	new Set(e).size !== e.length && G(t);
}
function xi(e, t) {
	try {
		let n = ei(e, "$", [
			"schema_version",
			"mansion_id",
			"version",
			"integrity",
			"waiting_count",
			"phases",
			"risky_proposals",
			"pending_permissions"
		], ["read_only"]);
		n.read_only !== void 0 && typeof n.read_only != "boolean" && G("$.read_only"), n.schema_version !== 1 && G("$.schema_version");
		let r = oi(n.mansion_id, "$.mansion_id");
		t !== void 0 && r !== t && G("$.mansion_id");
		let i = ni(n.version, "$.version");
		Array.isArray(n.phases) && n.phases.length === W.length || G("$.phases");
		let a = W.map((e, t) => mi(n.phases[t], `$.phases[${t}]`, e));
		(!Array.isArray(n.risky_proposals) || n.risky_proposals.length > 200) && G("$.risky_proposals");
		let o = n.risky_proposals.map((e, t) => vi(e, `$.risky_proposals[${t}]`, r));
		bi(o.map((e) => e.proposalId), "$.risky_proposals"), (!Array.isArray(n.pending_permissions) || n.pending_permissions.length > 200) && G("$.pending_permissions");
		let s = n.pending_permissions.map((e, t) => yi(e, `$.pending_permissions[${t}]`));
		return bi(s.map((e) => JSON.stringify([e.slot, e.mid])), "$.pending_permissions"), [
			...o.flatMap((e) => [e.createdSequence, e.decision?.sequence ?? 0]),
			...a.flatMap((e) => [e.door.proposal?.createdSequence ?? 0, e.door.proposal?.decision?.sequence ?? 0]),
			...s.map((e) => e.requestedSequence)
		].some((e) => e > i) && G("$.version"), {
			ok: !0,
			projection: {
				mansionId: r,
				version: i,
				integrity: ti(n.integrity, Gr, "$.integrity"),
				waitingCount: ni(n.waiting_count, "$.waiting_count"),
				phases: a,
				riskyProposals: o,
				pendingPermissions: s,
				readOnly: n.read_only === !0
			}
		};
	} catch (e) {
		if (e instanceof Qr) return {
			ok: !1,
			path: e.path
		};
		throw e;
	}
}
function Si(e) {
	return {
		revision: e.revision,
		sha256: e.sha256,
		size_bytes: e.sizeBytes
	};
}
var Ci = [
	"study",
	"drafting-room",
	"workshop"
].map((e) => {
	let t = Fr(e);
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
}, wi = {
	not_started: "Not started",
	ready: "Ready to start",
	starting: "Starting",
	working: "Working",
	waiting: "Waiting for your decision",
	revision_required: "Revision required",
	approved: "Approved",
	failed: "Failed to start",
	done: "Done"
}, Ti = {
	sealed: "Sealed door",
	waiting: "Door waiting for your decision",
	open: "Open door",
	rejected: "Door kept shut"
};
function Ei(e, t = {}) {
	let n = Object.hasOwn(t, e) ? t[e] : void 0;
	return n === void 0 || n.trim() === "" ? Tr(e) : n;
}
function Di(e) {
	return Ci.find((t) => t.phases.includes(e)).id;
}
function Oi(e, t) {
	if (t !== null) {
		for (let n of t.phases) if (n.ghostIds.includes(e)) return Di(n.phase);
	}
	for (let t of Ci) if (t.roles.some((t) => e === t || e.startsWith(`${t}-`))) return t.id;
	return null;
}
function ki(e) {
	return W[W.indexOf(e) + 1] ?? null;
}
function Ai(e, t) {
	let n = q[e].toLowerCase(), r = ki(e);
	switch (t) {
		case "sealed": return `Sealed door: approve the ${n} to open it.`;
		case "waiting": return `The ${n} are ready. Approve or reject them to decide this door.`;
		case "open": return r === null ? `Open door: the ${n} were approved.` : `Open door: the ${n} were approved. ${q[r]} may be started.`;
		case "rejected": return `Door kept shut: the ${n} were rejected and need a revision.`;
	}
}
var ji = {
	read_only: "This is a recording. Nothing can be started, approved or rejected here.",
	loading: "Loading the state of the house. Decisions are off until it arrives.",
	unavailable: "The house could not be reached. Decisions are off until it answers.",
	malformed: "The house sent a state this page cannot read. Decisions are off.",
	integrity: "The séance log failed its integrity check. Decisions are off until it is repaired.",
	uncertain: "The latest ghost activity is not confirmed yet. Decisions are off until the house catches up.",
	catching_up: "Catching up with the séance log. Decisions are off until it is current.",
	stale: "Something changed in the house. Refreshing before you decide."
}, Mi = /* @__PURE__ */ new Set([
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"duplicate_sequence",
	"missing_sequence"
]);
function Ni(e) {
	let t = (e) => ({
		canDecide: !1,
		block: e,
		text: ji[e]
	});
	return e.readOnly === !0 || e.projection?.readOnly === !0 ? t("read_only") : e.projectionStatus === "malformed" ? t("malformed") : e.projection === null ? t(e.projectionStatus === "unavailable" ? "unavailable" : "loading") : e.projection.integrity === "corrupt" ? t("integrity") : e.canonical.diagnostic === null ? e.projection.integrity === "uncertain" ? t("uncertain") : e.projectionStatus === "unavailable" ? t("unavailable") : !e.canonical.loaded || e.canonical.catchingUp ? t("catching_up") : e.canonical.highestSequence > e.projection.version ? t("stale") : {
		canDecide: !0,
		block: null,
		text: null
	} : t(Mi.has(e.canonical.diagnostic.code) ? "integrity" : "uncertain");
}
function Pi(e) {
	return e.kind === "start_phase" ? `phase:${e.phase}` : `proposal:${e.proposalId}`;
}
function Fi(e) {
	return e.slice(0, 12);
}
function Ii(e) {
	return e === 1 ? "1 byte" : `${e.toLocaleString("en-US")} bytes`;
}
function Li(e) {
	let t = e.outcome === "approved" ? "Approved" : "Rejected";
	return e.actor === "operator" ? `${t} by the operator in Haunted House.` : `${t} in Crew, outside Haunted House.`;
}
function Ri(e, t, n, r, i) {
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
function zi(e, t, n, r) {
	let i = t.door.proposal;
	if (i === null) return null;
	let a = i.status === "pending" && t.door.status === "waiting", o = a ? "pending" : i.status === "pending" ? "superseded" : i.status, s = Ri(a, !0, n, r, `proposal:${i.proposalId}`), c = (n) => ({
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
		digestPrefix: Fi(i.artifactRevision.sha256),
		sizeText: Ii(i.artifactRevision.sizeBytes),
		outcomeText: i.decision === null ? o === "superseded" ? "Superseded: the document changed after this proposal. A new revision needs its own decision." : null : Li(i.decision),
		approve: s.canApprove ? c("approve") : null,
		reject: s.canReject ? c("reject") : null
	};
}
var Bi = {
	delete_path: "Delete a file or empty folder",
	run_command: "Run a command",
	git_write: "Change the git repository"
}, Vi = {
	list: "List",
	read: "Read",
	write: "Write",
	delete: "Delete",
	command_read: "Command may read",
	command_write: "Command may write",
	git_write: "Git may write"
}, Hi = {
	pending: "Waiting for your decision",
	approved: "Approved, not used yet",
	rejected: "Rejected",
	consumed: "Approval used: the action is running",
	succeeded: "Done: the approved action succeeded",
	failed: "Failed: the approved action did not succeed. The approval is used up.",
	superseded: "Superseded"
}, Ui = "Approving allows exactly one attempt of exactly this action. If the attempt fails, the approval is used up and the ghost must ask again.";
function Wi(e) {
	return Array.isArray(e) && e.every((e) => typeof e == "string") ? e.map((e) => JSON.stringify(e)).join(" ") : typeof e == "string" ? e : JSON.stringify(e);
}
function Gi(e) {
	return {
		scope: [
			{
				label: "Action",
				value: Bi[e.kind]
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
			value: Wi(e.arguments[t])
		})),
		paths: e.pathIntents.map((e) => ({
			label: Vi[e.access],
			value: e.path
		}))
	};
}
function Ki(e, t, n, r, i = {}) {
	let a = t.descriptor !== null, o = Ri(t.status === "pending", a, n, r, `proposal:${t.proposalId}`), s = t.descriptor === null ? {
		scope: [],
		arguments: [],
		paths: []
	} : Gi(t.descriptor), c = (n) => ({
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
		ghostName: Ei(t.ghostId, i),
		status: t.status,
		statusText: Hi[t.status],
		title: t.descriptor === null ? "Risky action (details unavailable)" : Bi[t.descriptor.kind],
		complete: a,
		...s,
		digestPrefix: Fi(t.actionDigest),
		oneAttemptText: Ui,
		outcomeText: t.decision === null ? null : Li(t.decision),
		approve: o.canApprove ? c("approve") : null,
		reject: o.canReject ? c("reject") : null
	};
}
var qi = {
	ready: (e) => `Start ${e}`,
	failed: (e) => `Try starting ${e} again`,
	revision_required: (e) => `Start the ${e} revision`
};
function Ji(e, t, n, r) {
	let i = qi[t.status];
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
function Yi(e, t = {}) {
	if (e === null) return [];
	let n = [], r = (e) => Ei(e, t);
	for (let t of e.phases) {
		let e = t.door.proposal;
		t.door.status === "waiting" && e !== null && e.status === "pending" && n.push({
			kind: "door",
			id: `door:${e.proposalId}`,
			room: Di(t.phase),
			phase: t.phase,
			ghostId: t.ghostIds.at(-1) ?? null,
			text: `The ${q[t.phase].toLowerCase()} door needs your decision.`
		});
	}
	let i = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set();
	for (let t of e.riskyProposals) {
		if (t.status !== "pending") continue;
		i.add(t.proposalId), a.add(t.sessionSlot);
		let o = t.descriptor === null ? "do something risky" : Bi[t.descriptor.kind].toLowerCase();
		n.push({
			kind: "risky",
			id: `risky:${t.proposalId}`,
			room: Oi(t.ghostId, e) ?? "workshop",
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
function Xi(e) {
	return e === 0 ? "Nothing needs you" : e === 1 ? "1 thing needs you" : `${e} things need you`;
}
function Zi(e) {
	return e.length === 0 ? "No ghost here yet" : e.map((e) => `${e.name}: ${e.stateText}`).join(", ");
}
function Qi(e, t, n = {}) {
	let r = Array.from(t), i = Yi(e, n);
	return Ci.map((t) => {
		let a = e === null ? [] : t.phases.map((t) => {
			let n = e.phases[W.indexOf(t)];
			return {
				phase: t,
				name: q[t],
				status: n.status,
				statusText: wi[n.status],
				doorStatus: n.door.status,
				doorText: Ti[n.door.status],
				doorHint: Ai(t, n.door.status)
			};
		}), o = Or(r.filter((n) => Oi(n.ghost_id, e) === t.id), n), s = i.filter((e) => e.room === t.id).length, c = a.length === 0 ? "State not loaded" : a.map((e) => `${e.name}: ${e.statusText}, ${e.doorText}`).join(". ");
		return {
			id: t.id,
			name: t.name,
			phases: a,
			ghosts: o,
			needsYou: s,
			label: `${t.name}. ${c}. ${Zi(o)}.${s > 0 ? ` ${Xi(s)}.` : ""}`
		};
	});
}
function $i(e, t, n, r, i = {}) {
	if (e === null) return {
		room: t,
		phases: [],
		risky: []
	};
	let a = t.phases.map((t) => {
		let i = e.phases[W.indexOf(t.phase)];
		return {
			line: t,
			start: Ji(e, i, n, r),
			door: zi(e, i, n, r)
		};
	}), o = e.riskyProposals.filter((n) => (Oi(n.ghostId, e) ?? "workshop") === t.id), s = o.filter((e) => e.status === "pending"), c = o.filter((e) => e.status !== "pending").sort((e, t) => t.createdSequence - e.createdSequence).slice(0, 5);
	return {
		room: t,
		phases: a,
		risky: [...s, ...c].map((t) => Ki(e, t, n, r, i))
	};
}
// src/core/seance-log.ts
var ea = `h1:${"0".repeat(64)}`;
function ta(e) {
	let t = { ...Bn(e) };
	return delete t.hash, `h1:${Pn(V(t))}`;
}
function na(e) {
	let t = e.split("\n");
	t.at(-1) === "" && t.pop();
	let n = [], r = [], i = /* @__PURE__ */ new Set(), a = null, o = ea;
	for (let e = 0; e < t.length; e += 1) {
		let s = e + 1, c = t[e].endsWith("\r") ? t[e].slice(0, -1) : t[e];
		if (c.trim() === "") continue;
		let l = Jn(c, s);
		if (!l.ok) {
			r.push(l.diagnostic);
			continue;
		}
		let u = l.value, d = ra(u, n.length + 1, a, o, i);
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
function ra(e, t, n, r, i) {
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
		if (e.hash !== ta(e)) return {
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
var ia = {
	records: /* @__PURE__ */ new Map(),
	highestSequence: 0,
	contiguousSequence: 0
};
function aa(e, t) {
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
function oa(e) {
	let t = $n(Array.from(e));
	return {
		events: t.selection.events,
		selectionDiagnostics: t.selection.diagnostics,
		snapshots: t.snapshots,
		transitions: t.transitions
	};
}
function sa(e) {
	return oa(e.records.values());
}
var ca = "guardrail", la = Dr, ua = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/, da = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/, fa = /^[a-z][a-z0-9_]{0,63}$/, pa = /^[0-9a-f]{64}$/, ma = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, ha = 2 ** 31 - 1, ga = 2 ** 53 - 1, _a = 1024, va = 32, ya = 255, ba = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u, xa = (e) => new TextEncoder().encode(e).length;
function Sa(e) {
	if (typeof e != "string" || e === "" || xa(e) > _a || e.includes("\\") || ba.test(e) || e.startsWith("/") || e.normalize("NFC") !== e) return !1;
	let t = e.split("/");
	return t.length > va ? !1 : t.every((e) => e !== "" && e !== "." && e !== ".." && xa(e) <= ya && !/%[0-9A-Fa-f]{2}/.test(e));
}
var J = (e) => typeof e == "string" && ua.test(e), Ca = (e) => typeof e == "string" && da.test(e), wa = (e) => typeof e == "string" && fa.test(e), Y = (e) => typeof e == "string" && W.includes(e), Ta = (e) => typeof e == "string" && pa.test(e), Ea = (e) => Sa(e), Da = (e, t) => (n) => typeof n == "number" && Number.isSafeInteger(n) && n >= e && n <= t, Oa = (...e) => (t) => typeof t == "string" && e.includes(t), ka = (e) => (t) => t === null || e(t), Aa = (e) => typeof e == "object" && !!e && !Array.isArray(e), ja = Da(1, ha), Ma = Da(0, ga), Na = Oa("operator", "crew"), Pa = {
	document_path: Ea,
	revision: ja,
	sha256: Ta,
	size_bytes: Ma
}, Fa = {
	phase: Y,
	proposal_id: J,
	...Pa,
	actor: Na,
	command_id: J
}, Ia = {
	proposal_id: J,
	action_digest: Ta,
	actor: Na,
	command_id: J,
	crew_slot: ka(Ca),
	crew_mid: ka(Ca)
}, La = {
	proposal_id: J,
	action_digest: Ta,
	claim_id: J,
	code: wa,
	exit_code: ka(Da(-255, 255)),
	output_bytes: Ma
}, Ra = {
	phase_start_reserved: [{
		phase: Y,
		reservation_id: J,
		command_id: J
	}, "phase"],
	phase_started: [{
		phase: Y,
		reservation_id: J,
		session_slot: Ca
	}, "phase"],
	phase_start_failed: [{
		phase: Y,
		reservation_id: J,
		code: wa
	}, "phase"],
	phase_start_denied: [{
		phase: Y,
		command_id: J,
		code: wa
	}, "phase"],
	phase_output_ready: [{
		phase: Y,
		proposal_id: J,
		...Pa
	}, "proposal_id"],
	revision_started: [{
		phase: Y,
		command_id: J,
		session_slot: Ca
	}, "phase"],
	door_superseded: [{
		phase: Y,
		proposal_id: J,
		revision: ja,
		sha256: Ta,
		code: wa
	}, "proposal_id"],
	door_approved: [Fa, "proposal_id"],
	door_rejected: [Fa, "proposal_id"],
	risky_action_proposed: [{
		proposal_id: J,
		action_digest: Ta,
		descriptor: Aa
	}, "proposal_id"],
	risky_action_approved: [Ia, "proposal_id"],
	risky_action_rejected: [Ia, "proposal_id"],
	risky_action_superseded: [{
		proposal_id: J,
		action_digest: Ta,
		code: wa
	}, "proposal_id"],
	risky_action_consumed: [{
		proposal_id: J,
		action_digest: Ta,
		claim_id: J,
		session_slot: Ca
	}, "proposal_id"],
	risky_action_denied: [{
		proposal_id: J,
		action_digest: ka(Ta),
		denial_id: J,
		session_slot: Ca,
		code: wa
	}, "proposal_id"],
	risky_action_succeeded: [La, "proposal_id"],
	risky_action_failed: [La, "proposal_id"],
	approval_resolution_ignored: [{
		resolution_id: J,
		session_slot: Ca,
		mid: Ca,
		outcome: Oa("approved", "rejected"),
		code: wa
	}, "resolution_id"],
	path_denied: [{
		denial_id: J,
		session_slot: Ca,
		room: wa,
		access: Oa(...qr),
		code: wa,
		path: ka(Ea)
	}, "denial_id"],
	spec_write_prepared: [{
		write_id: J,
		phase: Y,
		document_path: Ea,
		base_revision: Da(0, ha),
		base_sha256: ka(Ta),
		revision: ja,
		sha256: Ta,
		size_bytes: Ma
	}, "write_id"],
	spec_document_written: [{
		write_id: J,
		phase: Y,
		...Pa
	}, "write_id"],
	spec_write_recovered: [{
		write_id: J,
		phase: Y,
		document_path: Ea,
		outcome: Oa("completed", "not_applied")
	}, "write_id"],
	spec_write_uncertain: [{
		write_id: J,
		phase: Y,
		document_path: Ea,
		code: wa
	}, "write_id"],
	room_tool_answered: [{
		answer_id: J,
		session_slot: Ca,
		mid: Ca,
		tool: Oa("list_room_files", "read_room_file", "write_spec_document", "write_room_file", "submit_phase_output"),
		outcome: Oa("approved"),
		actor: Oa("house"),
		reason: Oa("non_risky_room_tool")
	}, "answer_id"]
};
Object.keys(Ra);
function za(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Ba(e) {
	if (e.event_type !== "domain_event_recorded") return null;
	let t = e.payload;
	if (!za(t) || t.domain !== "doors_and_guardrails") return null;
	if (e.source.origin !== "house" || e.source.source_type !== ca) return "untrusted_source";
	let n = Object.keys(t);
	if (n.length !== 4 || ![
		"domain",
		"kind",
		"entity_id",
		"data"
	].every((e) => n.includes(e))) return "invalid_shape";
	let r = t.kind;
	if (typeof r != "string" || !Object.hasOwn(Ra, r)) return "unsupported_value";
	let [i, a] = Ra[r], o = t.data;
	if (!za(o)) return "invalid_type";
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
var Va = /* @__PURE__ */ new Set([
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
function Ha(e) {
	if (!Sa(e)) return null;
	let t = e.split("/");
	return t.length !== 4 || t[0] !== ".kiro" || t[1] !== "specs" || t[2].length > 64 || !ma.test(t[2]) ? null : W.slice(0, 3).find((e) => t[3] === `${e}.md`) ?? null;
}
function Ua(e) {
	return {
		revision: e.revision,
		sha256: e.sha256,
		sizeBytes: e.size_bytes
	};
}
function Wa(e, t) {
	return e.revision === t.revision && e.sha256 === t.sha256 && e.sizeBytes === t.sizeBytes;
}
function Ga(e, t) {
	for (let n of e.pendingWrites.values()) if (n.documentPath === t) return !0;
	return !1;
}
function Ka(e, t) {
	return {
		outcome: t,
		actor: e.data.actor,
		eventId: e.eventId,
		sequence: e.sequence
	};
}
function qa(e, t) {
	let { kind: n, data: r } = t;
	if (!Va.has(n)) return null;
	let i = r.phase, a = e.phases[i];
	if (n === "phase_start_denied") return null;
	if (n === "phase_start_reserved") {
		let t = r.command_id;
		return e.commandIds.has(t) ? "duplicate_command" : W.slice(0, W.indexOf(i)).every((t) => e.phases[t].door === "open") ? a.status !== "ready" && a.status !== "failed" && a.status !== "revision_required" ? "invalid_state" : (e.commandIds.add(t), a.status = "starting", a.reservationId = r.reservation_id, null) : "predecessor_door_sealed";
	}
	if (n === "phase_started" || n === "phase_start_failed") return a.status === "starting" ? r.reservation_id === a.reservationId ? (n === "phase_started" ? (a.status = "working", a.sessionSlot = r.session_slot) : a.status = "failed", null) : "reservation_mismatch" : "invalid_state";
	if (n === "revision_started") {
		let t = r.command_id;
		return e.commandIds.has(t) ? "duplicate_command" : a.status === "revision_required" ? (e.commandIds.add(t), a.status = "working", a.sessionSlot = r.session_slot, null) : "invalid_state";
	}
	if (n === "phase_output_ready") {
		let n = r.proposal_id, o = r.document_path, s = Ua(r);
		if (a.status !== "working") return "invalid_state";
		if (e.proposalIds.has(n)) return "duplicate_proposal";
		let c = Ha(o);
		if (i === "implementation" ? c !== null : c !== i) return "document_mismatch";
		if (s.revision <= a.lastRevision) return "stale_revision";
		if (Ga(e, o)) return "write_pending";
		let l = e.documents.get(o);
		return l !== void 0 && !Wa(l, s) ? "artifact_mismatch" : (e.proposalIds.add(n), a.status = "waiting", a.door = "waiting", a.lastRevision = s.revision, a.proposal = {
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
		if (l !== void 0 && !Wa(l, s) || Ga(e, o.documentPath)) return "artifact_changed";
		if (e.commandIds.add(c), n === "door_approved") {
			a.status = "approved", a.door = "open", a.proposal = {
				...o,
				status: "approved",
				decision: Ka(t, "approved")
			};
			let n = W[W.indexOf(i) + 1];
			n !== void 0 && e.phases[n].status === "not_started" && (e.phases[n].status = "ready");
		} else a.status = "revision_required", a.door = "rejected", a.proposal = {
			...o,
			status: "rejected",
			decision: Ka(t, "rejected")
		};
		return null;
	}
	let o = r.write_id, s = r.document_path;
	if (n === "spec_write_prepared") {
		if (Ha(s) !== i) return "document_mismatch";
		if (a.status !== "working" && a.status !== "waiting") return "invalid_state";
		if (e.pendingWrites.has(o) || Ga(e, s)) return "write_pending";
		let t = e.documents.get(s), n = t?.revision ?? 0, c = t?.sha256 ?? null;
		return r.base_revision !== n || r.base_sha256 !== c || r.revision !== n + 1 ? "stale_revision" : (e.pendingWrites.set(o, {
			phase: i,
			documentPath: s,
			artifact: Ua(r)
		}), null);
	}
	let c = e.pendingWrites.get(o);
	return c === void 0 ? "write_missing" : c.phase !== i || c.documentPath !== s ? "write_mismatch" : n === "spec_document_written" ? Wa(Ua(r), c.artifact) ? (e.pendingWrites.delete(o), e.documents.set(s, c.artifact), null) : "write_mismatch" : (n === "spec_write_recovered" && (e.pendingWrites.delete(o), r.outcome === "completed" && e.documents.set(s, c.artifact)), null);
}
var Ja = /* @__PURE__ */ new Set([
	"risky_action_approved",
	"risky_action_rejected",
	"risky_action_superseded",
	"risky_action_consumed",
	"risky_action_denied",
	"risky_action_succeeded",
	"risky_action_failed"
]);
function Ya(e) {
	try {
		return Pn(V(e));
	} catch {
		return null;
	}
}
function Xa(e) {
	let t = _i(e.data.descriptor);
	return t === null || Ya(e.data.descriptor) !== e.data.action_digest || t.mansionId !== e.mansionId || t.sessionSlot !== e.sessionSlot ? null : t;
}
function Za(e, t) {
	let { kind: n, data: r } = t;
	if (n === "risky_action_proposed") {
		let n = r.proposal_id;
		if (e.proposals.has(n)) return "duplicate_proposal";
		let i = Xa(t);
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
	if (!Ja.has(n) || n === "risky_action_denied") return null;
	let i = e.proposals.get(r.proposal_id);
	if (i === void 0) return "proposal_missing";
	if (r.action_digest !== i.actionDigest) return "digest_mismatch";
	if (n === "risky_action_approved" || n === "risky_action_rejected") {
		let a = n === "risky_action_approved", o = r.command_id;
		return i.status === "pending" ? e.commandIds.has(o) ? "duplicate_command" : a && i.descriptor === null ? "proposal_blocked" : (e.commandIds.add(o), i.status = a ? "approved" : "rejected", i.decision = Ka(t, a ? "approved" : "rejected"), null) : "already_decided";
	}
	return n === "risky_action_superseded" ? i.status !== "pending" && i.status !== "approved" ? "not_supersedable" : (i.status = "superseded", null) : n === "risky_action_consumed" ? i.status === "approved" ? i.descriptor === null || r.session_slot !== i.sessionSlot || t.sessionSlot !== i.sessionSlot ? "identity_mismatch" : (i.status = "consumed", i.claimId = r.claim_id, null) : "not_approved" : i.status === "consumed" ? r.claim_id === i.claimId ? (i.status = n === "risky_action_succeeded" ? "succeeded" : "failed", null) : "claim_mismatch" : "not_consumed";
}
function Qa(e, t) {
	let n = Array.from(e).filter((e) => e.scope.mansion_id === t.mansionId).sort((e, t) => e.sequence - t.sequence || (e.event_id < t.event_id ? -1 : +(e.event_id > t.event_id))), r = Object.fromEntries(W.map((e, t) => [e, {
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
		l = Math.max(l, e.sequence), e.scope.ghost_id !== la && !s.has(e.scope.session_slot) && s.set(e.scope.session_slot, e.scope.ghost_id);
		let t = e.payload, n = za(t) ? t.mid : void 0;
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
		let r = Ba(e);
		if (r !== null) {
			if (typeof r == "string") c.push({
				sequence: e.sequence,
				eventId: e.event_id,
				kind: "invalid_payload",
				code: r
			});
			else for (let e of [qa(i, r), Za(a, r)]) e !== null && c.push({
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
	})), d = W.map((e) => {
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
var $a = {
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
function eo(e, t = {}) {
	return {
		code: e,
		...t.line === void 0 ? {} : { line: t.line },
		...t.recordId === void 0 ? {} : { recordId: t.recordId },
		safeDetail: $a[e]
	};
}
function to(e) {
	let t = { line: e.line };
	switch (e.code) {
		case "unsupported_schema": return eo("unsupported_schema", t);
		case "duplicate_sequence":
		case "missing_sequence":
		case "hash_mismatch":
		case "hash_link_broken":
		case "mixed_integrity_mode": return eo("integrity_failed", t);
		default: return eo("invalid_record", t);
	}
}
function no(e, t) {
	let n = { recordId: t.get(e.event_id) };
	return e.code === "conflicting_variant" ? eo("conflicting_variant", n) : eo(e.kind === "forward" ? "causal_cycle" : "missing_predecessor", n);
}
function ro(e) {
	return new Map(e.map((e) => [e.event_id, e.record_id]));
}
function io(e, t = {}) {
	let n = Zn(Array.from(e)), r = ro(n.events);
	return {
		records: n.events,
		diagnostics: [...t.diagnostics ?? [], ...n.diagnostics.map((e) => no(e, r))],
		integrityOk: t.integrityOk !== !1
	};
}
function ao(e) {
	let t = na(e);
	return io(t.events, {
		diagnostics: t.diagnostics.map(to),
		integrityOk: t.integrityOk
	});
}
function oo(e, t) {
	let n = Array.from(e), r = Array.from(t);
	for (let e = 0; e < Math.min(n.length, r.length); e += 1) {
		let t = n[e].codePointAt(0) - r[e].codePointAt(0);
		if (t !== 0) return t;
	}
	return n.length - r.length;
}
function so(e, t) {
	let n = t.integrityOk !== !1, r = e.events, i = ro(r), a = [], o = Array.from(new Set(r.map((e) => e.scope.mansion_id))).sort(oo).map((e) => {
		let t = Qa(r, {
			mansionId: e,
			integrity: n ? "valid" : "corrupt",
			readOnly: !0
		});
		for (let e of t.diagnostics) a.push(eo("invalid_transition", { recordId: i.get(e.eventId) }));
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
function co(e, t = {}) {
	return so(oa(e), t);
}
function lo(e, t = {}) {
	return so(sa(aa(ia, e).log), t);
}
function uo(e) {
	return (t) => co(t, { integrityOk: e.integrityOk });
}
function fo(e, t) {
	return e.workflows.find((e) => e.mansionId === t) ?? null;
}
var po = {
	parse: ao,
	select: (e) => io(e),
	fold: co,
	foldLive: lo
}, mo = "Recorded event", ho = "Operator";
function go(e) {
	let t = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), n = Array.from(t);
	return n.length <= 160 ? t : `${n.slice(0, 159).join("")}…`;
}
function _o(e) {
	return typeof e == "object" && e && !Array.isArray(e) ? e : {};
}
function vo(e, t, n) {
	let r = t[n];
	return typeof r == "string" && Object.hasOwn(e, r) ? e[r] : null;
}
var yo = Object.fromEntries(Ci.map((e) => [e.id, e.name])), bo = {
	approved: "approved",
	rejected: "rejected",
	denied: "rejected"
}, xo = {
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
}, So = {
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
function Co(e) {
	let t = Ba(e);
	if (t === null) return xo.domain_event_recorded;
	if (typeof t == "string") return "Workflow record refused";
	let n = So[t.kind], r = t.data.phase;
	return typeof r == "string" && W.includes(r) ? `${n}: ${q[r]}` : n;
}
function wo(e) {
	let t = Object.hasOwn(xo, e.event_type) ? xo[e.event_type] : void 0;
	if (t === void 0) return mo;
	let n = _o(e.payload);
	switch (e.event_type) {
		case "run_started": {
			let e = vo(yo, n, "room");
			return e === null ? t : `${t} in the ${e}`;
		}
		case "run_blocked":
		case "run_failed": {
			let e = vo(xr, n, "reason");
			return e === null ? t : `${t}: ${e}`;
		}
		case "tool_started": return n.is_shell === !0 ? "Shell tool call started" : t;
		case "approval_decided": {
			let e = vo(bo, n, "outcome");
			return e === null ? t : `${t}: ${e}`;
		}
		case "crew_turn_ended": return n.needs_input === !0 ? `${t}: needs input` : t;
		case "domain_event_recorded": return Co(e);
		default: return t;
	}
}
function To(e) {
	let t = e.scope.ghost_id;
	return t === "house-operator" ? ho : go(Tr(t));
}
function Eo(e, t) {
	return {
		recordId: e.record_id,
		eventId: e.event_id,
		eventType: Object.hasOwn(xo, e.event_type) ? e.event_type : "unknown",
		actorLabel: To(e),
		summary: go(wo(e)),
		presentationOffsetMs: t
	};
}
var Do = 4e3, Oo = 1e3;
function ko(e, t) {
	let n = e.occurred_at_ms, r = t.occurred_at_ms, i = Number.isSafeInteger(n) && Number.isSafeInteger(r) ? r - n : 0;
	return Math.min(Math.max(i > 0 ? i : Oo, 250), Do);
}
function Ao(e) {
	let t = [], n = 0;
	return e.forEach((r, i) => {
		i > 0 && (n += ko(e[i - 1], r)), t.push(n);
	}), t;
}
function jo(e) {
	let t = Ao(e.records);
	return {
		records: e.records,
		timeline: e.records.map((e, n) => Eo(e, t[n])),
		diagnostics: e.diagnostics,
		integrityOk: e.integrityOk
	};
}
function Mo(e) {
	return {
		records: [],
		timeline: [],
		diagnostics: [eo(e)],
		integrityOk: !0
	};
}
// src/core/seance-api.ts
var No = "/apps/haunted-house/api/mansions";
function Po(e) {
	return `${No}/${encodeURIComponent(e)}/seance/ingest`;
}
function Fo(e, t, n = 500) {
	return `${No}/${encodeURIComponent(e)}/seance/events?after_sequence=${t}&limit=${n}`;
}
function Io(e) {
	return `${No}/${encodeURIComponent(e)}/seance/reconcile`;
}
var Lo = new Set(on), Ro = 160, zo = 20;
function Bo(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Vo(e) {
	return {
		ok: !1,
		diagnostic: {
			code: "persistence_failed",
			safe_detail: e
		}
	};
}
function Ho(e) {
	if (!Bo(e)) return null;
	let t = typeof e.code == "string" && Lo.has(e.code) ? e.code : "persistence_failed", n = typeof e.safe_detail == "string" ? e.safe_detail : e.reason, r = typeof n == "string" ? n.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, Ro) : "", i = typeof e.line == "number" && Number.isSafeInteger(e.line) && e.line > 0 ? e.line : null;
	return i === null ? {
		code: t,
		safe_detail: r
	} : {
		code: t,
		safe_detail: r,
		line: i
	};
}
function Uo(e) {
	if (!Bo(e)) return Vo("The backend sent an unexpected response.");
	if (!Array.isArray(e.events)) return Vo("The backend response has no event list.");
	let t = e.highest_sequence;
	if (typeof t != "number" || !Number.isSafeInteger(t) || t < 0) return Vo("The backend response has no valid highest Sequence.");
	let n = [];
	if (Array.isArray(e.diagnostics)) for (let t of e.diagnostics.slice(0, zo)) {
		let e = Ho(t);
		e !== null && n.push(e);
	}
	let r = [];
	for (let t of e.events) {
		let e = Kn(t);
		e.ok ? r.push(e.value) : n.length < zo && n.push(e.diagnostic);
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
function Wo(e) {
	if (typeof e != "object" || !e) return null;
	let t = e.status;
	return typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599 ? t : null;
}
var Go = 4096;
function Ko(e) {
	if (typeof e != "object" || !e) return null;
	let t = e.body;
	if (typeof t != "string" || t.length > Go) return null;
	try {
		let e = JSON.parse(t);
		if (!Bo(e) || !Bo(e.error)) return null;
		let n = e.error.code;
		return typeof n == "string" && /^[a-z_]{1,64}$/.test(n) ? n : null;
	} catch {
		return null;
	}
}
function qo(e, t) {
	if (typeof e != "object" || !e) return null;
	let n = e.body;
	if (typeof n != "string" || n.length > 65536) return null;
	let r;
	try {
		r = JSON.parse(n);
	} catch {
		return null;
	}
	if (!Bo(r) || !Array.isArray(r.diagnostics)) return null;
	let i = /* @__PURE__ */ new Map();
	for (let e of r.diagnostics) {
		if (!Bo(e)) return null;
		let { index: n, code: r } = e;
		if (typeof n != "number" || !Number.isInteger(n) || n < 0 || n >= t || typeof r != "string" || !/^[a-z_]{1,64}$/.test(r)) return null;
		i.has(n) || i.set(n, r);
	}
	return i.size === 0 ? null : Array.from(i, ([e, t]) => ({
		index: e,
		code: t
	})).sort((e, t) => e.index - t.index);
}
function Jo(e) {
	return e !== null && e >= 400 && e < 500 && e !== 408 && e !== 429;
}
// src/adapters/attic-log-source.ts
var Yo = {
	status: "loading",
	selection: null,
	safeMessage: null
}, Xo = {
	status: "error",
	selection: null,
	safeMessage: $a.fixture_unavailable
}, Zo = {
	records: [],
	diagnostics: [],
	integrityOk: !0
};
function Qo(e) {
	return {
		status: "ready",
		selection: e,
		safeMessage: null
	};
}
function $o(e, t) {
	return {
		...e,
		records: e.records.filter((e) => e.scope.mansion_id === t)
	};
}
async function es(e, t) {
	let n;
	try {
		n = await e.load();
	} catch {
		return Xo;
	}
	return typeof n == "string" ? Qo($o(po.parse(n), t)) : Xo;
}
async function ts(e, t) {
	let n = [], r = [], i = /* @__PURE__ */ new Set(), a = 0;
	try {
		for (let o = 0; o < 200; o += 1) {
			let o = Uo(await e.get(Fo(t, a, 500)));
			if (!o.ok) return Xo;
			for (let e of o.page.diagnostics) {
				let t = to(e), n = `${t.code}:${t.line ?? ""}`;
				i.has(n) || r.length >= 50 || (i.add(n), r.push(t));
			}
			let s = a;
			for (let e of o.page.events) e.scope.mansion_id === t && n.push(e), s = Math.max(s, e.sequence);
			if (s === a || s >= o.page.highestSequence) break;
			a = s;
		}
	} catch (e) {
		return Wo(e) === 404 && Ko(e) === "log_not_found" ? Qo(Zo) : Xo;
	}
	return Qo(io(n, {
		diagnostics: r,
		integrityOk: !r.some((e) => e.code === "integrity_failed")
	}));
}
function ns(e) {
	let t = oe(), n = P(t);
	n.current = t;
	let [r, i] = F(0), [a, o] = F(Yo);
	j(() => {
		let t = !1;
		return o(Yo), (gt === null ? ts({ get: (e) => n.current.get(e) }, e) : es(gt, e)).then((e) => {
			t || o(e);
		}), () => {
			t = !0;
		};
	}, [e, r]);
	let s = A(() => i((e) => e + 1), []);
	return {
		result: a,
		mode: gt === null ? "live" : "replay",
		reload: s
	};
}
// src/core/replay-reducer.ts
var rs = [
	.5,
	1,
	2
], is = {
	invalid_cursor: "That position is not an event of this replay.",
	invalid_speed: "Playback speed must be 0.5×, 1× or 2×.",
	invalid_command: "That replay command is not supported.",
	contract_unavailable: "The replay could not show that position. The last valid state is kept."
};
function as(e) {
	return rs.includes(e);
}
function os(e, t) {
	return typeof t == "number" && Number.isInteger(t) && t >= 0 && t <= e.records.length;
}
function ss(e) {
	return {
		code: e,
		safeDetail: is[e]
	};
}
function cs(e, t) {
	return {
		status: "paused",
		cursor: 0,
		speed: 1,
		generation: 0,
		projection: t(e.records.slice(0, 0)),
		commandError: null
	};
}
function ls(e, t) {
	return e.commandError?.code === t ? e : {
		...e,
		commandError: ss(t)
	};
}
function us(e) {
	return e.commandError === null ? e : {
		...e,
		commandError: null
	};
}
function ds(e, t, n, r, i) {
	let a;
	try {
		a = i(e.records.slice(0, n));
	} catch {
		return {
			...t,
			status: t.status === "playing" ? "paused" : t.status,
			generation: t.generation + 1,
			commandError: ss("contract_unavailable")
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
function fs(e, t, n, r) {
	let i = e.records.length;
	switch (n.kind) {
		case "play":
		case "resume": return t.status === "playing" ? us(t) : i === 0 ? t.status === "complete" ? us(t) : {
			...t,
			status: "complete",
			commandError: null
		} : t.cursor >= i ? ds(e, t, 0, "playing", r) : {
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
		} : us(t);
		case "restart": return t.status === "paused" && t.cursor === 0 ? us(t) : ds(e, t, 0, "paused", r);
		case "set_speed": return as(n.speed) ? n.speed === t.speed ? us(t) : {
			...t,
			speed: n.speed,
			generation: t.status === "playing" ? t.generation + 1 : t.generation,
			commandError: null
		} : ls(t, "invalid_speed");
		case "seek": {
			if (!os(e, n.cursor)) return ls(t, "invalid_cursor");
			let a = n.cursor === i ? "complete" : t.status === "playing" ? "playing" : "paused";
			return ds(e, t, n.cursor, a, r);
		}
		case "step": {
			if (t.status !== "playing" || n.generation !== t.generation || t.cursor >= i) return t;
			let a = t.cursor + 1;
			return ds(e, t, a, a === i ? "complete" : "playing", r);
		}
		default: return ls(t, "invalid_command");
	}
}
function ps(e, t) {
	if (t.status !== "playing" || t.cursor >= e.timeline.length) return null;
	let n = e.timeline[t.cursor].presentationOffsetMs, r = t.cursor === 0 ? 0 : e.timeline[t.cursor - 1].presentationOffsetMs;
	return Math.max(n - r, 0) / t.speed;
}
function ms(e, t) {
	return t <= 0 ? "Start of replay" : `Event ${t} of ${e.records.length}`;
}
// src/adapters/replay-controller.ts
var hs = { schedule(e, t, n) {
	let r = setTimeout(n, e);
	return () => clearTimeout(r);
} };
function gs(e, t) {
	return e.records.length <= t.records.length && e.records.every((e, n) => e.record_id === t.records[n].record_id);
}
function _s(e, t, n) {
	let r = e.state.generation + 1, i = cs(t, n);
	if (e.state.cursor === 0 || !gs(e.model, t)) return {
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
function vs(e, t, n = hs) {
	let [r, i] = F(() => ({
		model: e,
		fold: t,
		state: cs(e, t)
	})), a = r;
	(r.model !== e || r.fold !== t) && (a = {
		model: e,
		fold: t,
		state: _s(r, e, t)
	}, i(a));
	let o = A((e) => {
		i((t) => {
			let n = fs(t.model, t.state, e, t.fold);
			return n === t.state ? t : {
				...t,
				state: n
			};
		});
	}, []), s = P(n);
	s.current = n;
	let { state: c } = a, l = a.model;
	return j(() => {
		let e = ps(l, c);
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
var ys = {
	records: [],
	timeline: [],
	diagnostics: [],
	integrityOk: !0
}, bs = Mo("fixture_unavailable");
function xs(e, t) {
	return e.integrityOk === t.integrityOk && e.records.length === t.records.length && e.records.every((e, n) => e.record_id === t.records[n].record_id) && e.diagnostics.length === t.diagnostics.length && e.diagnostics.every((e, n) => {
		let r = t.diagnostics[n];
		return e.code === r.code && e.line === r.line && e.recordId === r.recordId;
	});
}
function Ss(e, t, n) {
	return {
		workflow: fo(t, n) ?? Qa([], {
			mansionId: n,
			integrity: t.integrity === "incompatible" ? "corrupt" : "valid",
			readOnly: !0
		}).projection,
		snapshots: new Map(t.ghosts.filter((e) => e.mansion_id === n).map((e) => [e.ghost_id, e])),
		transitions: t.transitions,
		highestSequence: t.validRecordCount === 0 ? 0 : e.records[t.validRecordCount - 1]?.sequence ?? 0
	};
}
function Cs(e, t) {
	let n = [...e.diagnostics, ...t.diagnostics];
	return {
		integrity: t.integrity === "incompatible" || !e.integrityOk ? "incompatible" : n.length > 0 ? "diagnostic" : "valid",
		validRecordCount: e.records.length,
		diagnostics: n
	};
}
function ws(e, t) {
	let n = ns(e), { result: r } = n, i = P(null), a = N(() => {
		if (r.status === "ready" && r.selection !== null) {
			let t = jo(r.selection), n = i.current;
			return n !== null && n.mansionId === e && xs(n.model, t) ? n.model : (i.current = {
				mansionId: e,
				model: t
			}, t);
		}
		return r.status === "error" ? (i.current = null, bs) : i.current?.mansionId === e ? i.current.model : ys;
	}, [r, e]), o = vs(a, N(() => uo(a), [a]), t), { state: s } = o;
	j(() => {
		gt?.present(e, s.cursor);
	}, [e, s.cursor]);
	let c = n.mode, l = N(() => Cs(o.model, s.projection), [o.model, s.projection]), u = N(() => c === "replay" ? Ss(o.model, s.projection, e) : null, [
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
var Ts = [
	"valid",
	"uncertain",
	"incompatible",
	"corrupt"
];
function Es(e, t) {
	let n = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
var Ds = {
	uncertain: "This room's state is not confirmed. Its controls are off until the house catches up.",
	incompatible: "The house sent a state for this room that this page cannot read. Its controls are off.",
	corrupt: "This room's record failed its integrity check. Its controls are off until it is repaired."
}, Os = "This is a recording. Nothing can be started, approved, rejected or opened in Crew here.", ks = "The Séance Room is locked. Review is a later chapter of this house, so nothing can be started or changed here.", As = "This mansion's folder could not be confirmed. Return to the Foyer and open it again.", js = {
	diagnostic: "Part of the séance log was left out. The Attic shows the records that could be read.",
	incompatible: "The séance log failed its integrity check. The Attic shows only the records before the failure."
}, Ms = "Door state unavailable", Ns = "The state of this door could not be read. Nothing can be decided until it can.";
function Ps(e, t) {
	return Ts.indexOf(e) >= Ts.indexOf(t) ? e : t;
}
var Fs = {
	read_only: "valid",
	loading: "uncertain",
	unavailable: "uncertain",
	uncertain: "uncertain",
	catching_up: "uncertain",
	stale: "uncertain",
	malformed: "incompatible",
	integrity: "corrupt"
};
function Is(e, t) {
	switch (e.block) {
		case null:
		case "read_only":
		case "authority": return "valid";
		case "malformed": return "incompatible";
		case "integrity": return t.integrity === "corrupt" ? "corrupt" : "uncertain";
		default: return "uncertain";
	}
}
function Ls(e) {
	return typeof e == "string" && Hr.includes(e);
}
function Rs(e) {
	return typeof e == "string" && Vr.includes(e);
}
function zs(e) {
	return typeof e == "string" && Yn.includes(e);
}
function Bs(e, t) {
	let n = Oi(e, t);
	if (n !== null) return n;
	for (let t of Mr) if (t.ghostRoles.some((t) => e === t || e.startsWith(`${t}-`))) return t.id;
	return null;
}
var Vs = [
	"failed",
	"blocked",
	"waiting",
	"working",
	"done",
	"idle"
];
function Hs(e) {
	return e.length === 0 ? "not_applicable" : e.find((e) => e.state === "unavailable") === void 0 ? (e.find((e) => e.state !== "open") ?? e[e.length - 1]).state : "unavailable";
}
function Us(e) {
	return e.length === 0 ? "not_applicable" : e.some((e) => e.state === "unavailable") ? "unavailable" : Vs.find((t) => e.some((e) => e.state === t)) ?? "not_applicable";
}
function Ws(e, t) {
	let n = !1, r = t.workflow, i = e.workflowPhases.map((e) => {
		let t = r?.phases[W.indexOf(e)], i = t?.door?.status;
		if (t === void 0 || !Ls(i)) return r !== null && (n = !0), {
			phase: e,
			phaseName: q[e],
			state: "unavailable",
			text: Ms,
			hint: Ns,
			proposalId: null,
			phaseStatus: null,
			phaseText: null
		};
		let a = t.door.proposal;
		return {
			phase: e,
			phaseName: q[e],
			state: i,
			text: Ti[i],
			hint: Ai(e, i),
			proposalId: i === "waiting" && a !== null && a.status === "pending" ? a.proposalId : null,
			phaseStatus: Rs(t.status) ? t.status : null,
			phaseText: Rs(t.status) ? `${q[e]}: ${wi[t.status]}` : null
		};
	}), a = [];
	for (let n of t.ghosts.values()) n.ghost_id !== "house-operator" && n.mansion_id === t.mansion.name && Bs(n.ghost_id, r) === e.id && a.push(n);
	let o = a.filter((e) => zs(e.state)), s = new Map(Or(o, t.ghostNames).map((e) => [e.ghostId, e]));
	return {
		doors: i,
		ghosts: a.map((e) => {
			let t = s.get(e.ghost_id);
			return t === void 0 ? (n = !0, {
				ghostId: e.ghost_id,
				name: Es(e.ghost_id, 60),
				state: "unavailable",
				reason: null,
				pendingText: null
			}) : {
				ghostId: t.ghostId,
				name: Es(t.name, 60) || "Ghost",
				state: t.state,
				reason: t.reason,
				pendingText: t.pendingText
			};
		}),
		malformed: n
	};
}
var Gs = {
	door: "door-decision",
	risky: "risky-decision",
	permission: "tool-decision"
};
function Ks(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of Yi(e.workflow, e.ghostNames)) {
		let e = n.room ?? "foyer", r = t.get(e) ?? [];
		r.push({
			kind: Gs[n.kind],
			id: n.id,
			ghostId: n.ghostId,
			label: Es(n.text, 160),
			status: "pending",
			actionAvailable: !0
		}), t.set(e, r);
	}
	return t;
}
function qs(e) {
	return e === void 0 ? [] : e.runs.filter((e) => e.state === "failed").map((e) => ({
		runId: e.runId,
		ghostId: e.ghostId,
		label: Es(`${Es(e.ghostName, 60) || "A ghost"} failed. A fresh attempt can be started.`, 160),
		available: e.retry !== null
	}));
}
function Js(e) {
	return e === "valid" ? "valid" : e === "incompatible" ? "incompatible" : "uncertain";
}
function Ys(e, t, n, r) {
	let i = Ws(e, t), a = t.rooms.get(e.id), o = n.mode === "replay" || t.authority.block === "read_only", s = e.id === "seance-room" && n.seanceRoom !== "enabled", c = e.workflowPhases.length > 0 || e.id === "seance-room" && !s, l = "valid", u = null;
	e.id === "foyer" ? t.mansion.status !== "ready" && (l = "uncertain", u = As) : e.id === "attic" ? (l = Js(t.replay.integrity), t.replay.integrity !== "valid" && (u = js[t.replay.integrity])) : c && (t.authority.block !== null && (l = Fs[t.authority.block]), l = Ps(l, t.workflow === null ? "uncertain" : t.workflow.integrity), a !== void 0 && (l = Ps(l, Is(a.gate, a)), l = Ps(l, a.integrity)), l !== "valid" && (u = t.authority.block !== null && t.authority.block !== "read_only" ? t.authority.text : a !== void 0 && a.gate.block !== null && a.gate.block !== "read_only" && a.gate.block !== "authority" ? a.gate.text : null)), i.malformed && (l = Ps(l, "incompatible"), u = Ds.incompatible);
	let d = e.id !== "attic" && !s, f = !c || t.authority.canDecide && (a === void 0 || a.gate.allowed), p = d && !o && l === "valid" && f, m = l === "valid" ? s ? ks : o ? Os : p || !d ? null : t.authority.text ?? a?.gate.text ?? Ds.uncertain : u ?? Ds[l];
	return {
		roomId: e.id,
		name: e.name,
		phase: e.phase,
		door: Hs(i.doors),
		ghost: Us(i.ghosts),
		doors: i.doors,
		ghosts: i.ghosts,
		integrity: l,
		mutatingActionsEnabled: p,
		readOnly: o,
		locked: s,
		diagnostic: m === null ? null : Es(m, 240) || Ds.uncertain,
		waitingItems: s ? [] : r.get(e.id) ?? [],
		recoveryActions: s ? [] : qs(a)
	};
}
function Xs(e, t) {
	let n = Ks(e), r = Rr(t.seanceRoom).map((r) => Ys(r, e, t, n)), i = e.replay.diagnostics[0];
	return {
		mansionName: Es(e.mansion.name, 60),
		mode: t.mode,
		rooms: r,
		needsYou: Qs(r),
		replay: {
			integrity: e.replay.integrity,
			validRecordCount: Math.max(0, Math.trunc(e.replay.validRecordCount) || 0),
			diagnostic: i === void 0 ? e.replay.integrity === "valid" ? null : js[e.replay.integrity] : Es(i.safeDetail, 240)
		}
	};
}
function Zs(e) {
	return JSON.stringify([e.kind, e.id]);
}
function Qs(e) {
	let t = e.filter((e) => Pr(e.roomId)).map((e, t) => ({
		room: e,
		index: t
	})).sort((e, t) => Lr(e.room.roomId, t.room.roomId) || e.index - t.index), n = /* @__PURE__ */ new Set(), r = [], i = (e) => {
		let t = Zs(e);
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
function $s(e) {
	return e[0]?.roomId ?? null;
}
function ec(e) {
	return Xi(e.length);
}
function tc(e) {
	return [
		{
			label: "Phase",
			value: jr[e.phase]
		},
		{
			label: "Door",
			value: Br(e.door)
		},
		{
			label: "Ghost",
			value: Br(e.ghost)
		}
	];
}
function nc(e) {
	return `${Es(e.name, 60).replace(/[.:]+$/u, "") || Fr(e.roomId).name}. ${tc(e).map((e) => `${e.label}: ${e.value}.`).join(" ")}`;
}
function rc(e, t) {
	return `${t.name}, ghost in the ${e.name}. State: ${Br(t.state)}.`;
}
function ic(e, t) {
	return `${t.phaseName} door of the ${e.name}. State: ${Br(t.state)}.`;
}
function ac(e) {
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
function oc(e, t) {
	if (e === null) return null;
	let n = t.rooms.find((t) => t.roomId === e.target.roomId);
	if (n === void 0) return null;
	let r = e.target;
	return r.kind === "ghost" && !n.ghosts.some((e) => e.ghostId === r.ghostId) || r.kind === "door" && !n.doors.some((e) => e.phase === r.phase) ? null : e;
}
var sc = [
	"requirements",
	"design",
	"tasks"
], cc = [
	"queued",
	"active",
	"complete",
	"failed",
	"cancelled",
	"blocked",
	"skipped"
], lc = [
	"crew_capacity",
	"local_capacity",
	"claim_busy"
], uc = [
	"reviewing",
	"pass",
	"changes_requested",
	"blocked"
], dc = [
	"proposed",
	"approved",
	"rejected"
], fc = 1e3, pc = 1024, mc = class extends Error {
	path;
	constructor(e) {
		super("refused"), this.path = e;
	}
};
function X(e) {
	throw new mc(e);
}
function hc(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Z(e, t, n, r = []) {
	hc(e) || X(t);
	for (let i of Object.keys(e)) !n.includes(i) && !r.includes(i) && X(t);
	for (let r of n) Object.hasOwn(e, r) || X(`${t}.${r}`);
	return e;
}
function gc(e, t, n) {
	return typeof e == "string" && t.includes(e) || X(n), e;
}
function _c(e, t, n = 0, r = 2 ** 53 - 1) {
	return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && X(t), e;
}
function vc(e, t) {
	return typeof e != "boolean" && X(t), e;
}
function yc(e, t, n) {
	return (!Array.isArray(e) || e.length > n) && X(t), e;
}
var bc = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/, xc = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
function Sc(e, t, n = 160) {
	return (typeof e != "string" || e.length === 0 || e.length > n || bc.test(e)) && X(t), e;
}
function Q(e, t) {
	return e === null ? null : t(e);
}
var Cc = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
function wc(e, t) {
	return typeof e == "string" && Cc.test(e) || X(t), e;
}
var Tc = /^[a-z][a-z0-9_]{0,63}$/;
function Ec(e, t) {
	return typeof e == "string" && Tc.test(e) || X(t), e;
}
var Dc = /^[1-9][0-9]{0,3}\.[1-9][0-9]{0,3}$/;
function Oc(e, t) {
	return typeof e == "string" && Dc.test(e) || X(t), e;
}
var kc = /^[A-Za-z0-9-]{1,160}$/;
function Ac(e, t) {
	let n = Sc(e, t, pc);
	(n.startsWith("/") || n.includes("\\") || n.startsWith("~")) && X(t);
	for (let e of n.split("/")) (e === "" || e === "." || e === "..") && X(t);
	return n;
}
function jc(e, t) {
	new Set(e).size !== e.length && X(t);
}
function Mc(e, t) {
	let n = yc(e, t, 32).map((e, n) => Ac(e, `${t}[${n}]`));
	return jc(n, t), n;
}
function Nc(e, t, n) {
	return (typeof e != "string" || e.trim() === "" || e.length > n || xc.test(e)) && X(t), e;
}
function Pc(e, t) {
	let n = Z(e, t, [
		"revision",
		"sha256",
		"size_bytes"
	]);
	return typeof n.sha256 == "string" && /^[0-9a-f]{64}$/.test(n.sha256) || X(`${t}.sha256`), {
		revision: _c(n.revision, `${t}.revision`, 1),
		sha256: n.sha256,
		sizeBytes: _c(n.size_bytes, `${t}.size_bytes`)
	};
}
function Fc(e, t) {
	return yc(e, t, 50).map((e, n) => {
		let r = `${t}[${n}]`, i = Z(e, r, [
			"code",
			"location",
			"message"
		]);
		return {
			code: Ec(i.code, `${r}.code`),
			location: Sc(i.location, `${r}.location`, 96),
			message: Sc(i.message, `${r}.message`, 200)
		};
	});
}
function Ic(e, t) {
	let n = Z(e, t, [
		"artifact_revision",
		"validated",
		"content",
		"findings"
	]), r = n.content;
	return r !== null && (typeof r != "string" || r.length > 524288) && X(`${t}.content`), {
		artifactRevision: Pc(n.artifact_revision, `${t}.artifact_revision`),
		validated: vc(n.validated, `${t}.validated`),
		content: r,
		findings: Fc(n.findings, `${t}.findings`)
	};
}
function Lc(e, t, n, r) {
	let i = Z(e, t, [
		"phase",
		"document_path",
		"write_scope",
		"artifact"
	]);
	i.phase !== n && X(`${t}.phase`);
	let a = Ac(i.document_path, `${t}.document_path`);
	return a !== `.kiro/specs/${r}/${n}.md` && X(`${t}.document_path`), {
		phase: n,
		documentPath: a,
		writeScope: Mc(i.write_scope, `${t}.write_scope`),
		artifact: Q(i.artifact, (e) => Ic(e, `${t}.artifact`))
	};
}
function Rc(e, t) {
	let n = Z(e, t, [
		"status",
		"attempt",
		"run_id",
		"reason_code"
	]);
	return {
		status: gc(n.status, cc, `${t}.status`),
		attempt: _c(n.attempt, `${t}.attempt`, 0, 3),
		runId: Q(n.run_id, (e) => wc(e, `${t}.run_id`)),
		reasonCode: Q(n.reason_code, (e) => Ec(e, `${t}.reason_code`))
	};
}
function zc(e, t) {
	let n = Z(e, t, [
		"dispatch_failures",
		"next_delay_seconds",
		"last_reason"
	]);
	return {
		dispatchFailures: _c(n.dispatch_failures, `${t}.dispatch_failures`, 0, 1e6),
		nextDelaySeconds: _c(n.next_delay_seconds, `${t}.next_delay_seconds`, 0, 15),
		lastReason: gc(n.last_reason, lc, `${t}.last_reason`)
	};
}
function Bc(e, t) {
	let n = Z(e, t, [
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
	]), r = yc(n.requirements, `${t}.requirements`, 64).map((e, n) => Oc(e, `${t}.requirements[${n}]`));
	jc(r, `${t}.requirements`);
	let i = vc(n.complete, `${t}.complete`), a = Q(n.outcome, (e) => Rc(e, `${t}.outcome`));
	return a?.status === "complete" && !i && X(`${t}.outcome`), i && a !== null && a.status !== "complete" && X(`${t}.outcome`), {
		taskId: Oc(n.task_id, `${t}.task_id`),
		title: Sc(n.title, `${t}.title`, 200),
		optional: vc(n.optional, `${t}.optional`),
		complete: i,
		requirements: r,
		writes: Mc(n.writes, `${t}.writes`),
		wave: Q(n.wave, (e) => _c(e, `${t}.wave`, 0, 200)),
		selected: vc(n.selected, `${t}.selected`),
		outcome: a,
		backpressure: Q(n.backpressure, (e) => zc(e, `${t}.backpressure`))
	};
}
function Vc(e, t) {
	let n = Z(e, t, [
		"tasks",
		"waves",
		"findings"
	]), r = yc(n.tasks, `${t}.tasks`, 200).map((e, n) => Bc(e, `${t}.tasks[${n}]`));
	jc(r.map((e) => e.taskId), `${t}.tasks`);
	let i = new Map(r.map((e) => [e.taskId, e])), a = yc(n.waves, `${t}.waves`, 200).map((e, n) => yc(e, `${t}.waves[${n}]`, 200).map((e, r) => {
		let a = `${t}.waves[${n}][${r}]`, o = Oc(e, a);
		return i.get(o)?.wave !== n && X(a), o;
	}));
	jc(a.flat(), `${t}.waves`);
	let o = new Set(a.flat());
	for (let [e, n] of r.entries()) n.wave !== null && !o.has(n.taskId) && X(`${t}.tasks[${e}].wave`);
	return r.filter((e) => e.outcome?.status === "active").length > 3 && X(`${t}.tasks`), {
		tasks: r,
		waves: a,
		findings: Fc(n.findings, `${t}.findings`)
	};
}
function Hc(e, t) {
	let n = Z(e, t, [
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
	]), r = gc(n.phase, W, `${t}.phase`), i = Q(n.task_id, (e) => Oc(e, `${t}.task_id`));
	i !== null != (r === "implementation") && X(`${t}.task_id`);
	let a = _c(n.attempt, `${t}.attempt`, 1, 3), o = vc(n.can_cancel, `${t}.can_cancel`), s = vc(n.can_retry, `${t}.can_retry`);
	o && s && X(`${t}.can_retry`), s && a >= 3 && X(`${t}.can_retry`);
	let c = Sc(n.session_slot, `${t}.session_slot`), l = n.session_link;
	l === null || typeof l == "string" && kc.test(l) || X(`${t}.session_link`);
	let u = Mc(n.claim_paths, `${t}.claim_paths`);
	return u.length > 0 && i === null && X(`${t}.claim_paths`), {
		runId: wc(n.run_id, `${t}.run_id`),
		runSequence: _c(n.run_sequence, `${t}.run_sequence`, 0, 1e6),
		ghostId: Sc(n.ghost_id, `${t}.ghost_id`),
		sessionSlot: c,
		phase: r,
		taskId: i,
		attempt: a,
		canCancel: o,
		cancelRequested: vc(n.cancel_requested, `${t}.cancel_requested`),
		canRetry: s,
		sessionLink: l,
		summary: Q(n.summary, (e) => Nc(e, `${t}.summary`, fc)),
		reasonCode: Q(n.reason_code, (e) => Ec(e, `${t}.reason_code`)),
		claimPaths: u
	};
}
function Uc(e, t) {
	let n = Z(e, t, [
		"cycle",
		"status",
		"ghost_id",
		"session_link",
		"findings",
		"repairs"
	]), r = n.session_link;
	r === null || typeof r == "string" && kc.test(r) || X(`${t}.session_link`);
	let i = yc(n.findings, `${t}.findings`, 50).map((e, n) => {
		let r = `${t}.findings[${n}]`, i = Z(e, r, [
			"finding_id",
			"requirement_ids",
			"paths",
			"summary"
		]), a = yc(i.requirement_ids, `${r}.requirement_ids`, 64).map((e, t) => Oc(e, `${r}.requirement_ids[${t}]`));
		return jc(a, `${r}.requirement_ids`), {
			findingId: wc(i.finding_id, `${r}.finding_id`),
			requirementIds: a,
			paths: Mc(i.paths, `${r}.paths`),
			summary: Nc(i.summary, `${r}.summary`, fc)
		};
	});
	jc(i.map((e) => e.findingId), `${t}.findings`);
	let a = yc(n.repairs, `${t}.repairs`, 50).map((e, n) => {
		let r = `${t}.repairs[${n}]`, a = Z(e, r, [
			"task_id",
			"finding_id",
			"title",
			"writes",
			"status"
		]), o = wc(a.finding_id, `${r}.finding_id`);
		return i.some((e) => e.findingId === o) || X(`${r}.finding_id`), {
			taskId: Oc(a.task_id, `${r}.task_id`),
			findingId: o,
			title: Sc(a.title, `${r}.title`, 200),
			writes: Mc(a.writes, `${r}.writes`),
			status: gc(a.status, dc, `${r}.status`)
		};
	});
	jc(a.map((e) => e.findingId), `${t}.repairs`), jc(a.map((e) => e.taskId), `${t}.repairs`);
	let o = gc(n.status, uc, `${t}.status`);
	return o === "pass" && (i.length > 0 || a.length > 0) && X(`${t}.findings`), {
		cycle: _c(n.cycle, `${t}.cycle`, 1, 3),
		status: o,
		ghostId: Sc(n.ghost_id, `${t}.ghost_id`),
		sessionLink: r,
		findings: i,
		repairs: a
	};
}
var Wc = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function Gc(e, t, n) {
	try {
		let r = Z(e, "$", [
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
		r.schema_version !== 1 && X("$.schema_version"), r.read_only !== void 0 && typeof r.read_only != "boolean" && X("$.read_only");
		let i = r.mansion_id;
		(typeof i != "string" || i.length > 40 || !sn.test(i)) && X("$.mansion_id"), t !== void 0 && i !== t && X("$.mansion_id");
		let a = r.spec_name;
		(typeof a != "string" || a.length > 40 || !Wc.test(a)) && X("$.spec_name"), n !== void 0 && a !== n && X("$.spec_name"), Array.isArray(r.documents) && r.documents.length === sc.length || X("$.documents");
		let o = sc.map((e, t) => Lc(r.documents[t], `$.documents[${t}]`, e, a)), s = yc(r.runs, "$.runs", 64).map((e, t) => Hc(e, `$.runs[${t}]`));
		jc(s.map((e) => e.runId), "$.runs");
		let c = vc(r.seance_enabled, "$.seance_enabled"), l = Q(r.review, (e) => Uc(e, "$.review"));
		return l !== null && !c && X("$.review"), {
			ok: !0,
			roomGhosts: {
				mansionId: i,
				specName: a,
				version: _c(r.version, "$.version"),
				integrity: gc(r.integrity, Gr, "$.integrity"),
				readOnly: r.read_only === !0,
				seanceEnabled: c,
				documents: o,
				taskPlan: Q(r.task_plan, (e) => Vc(e, "$.task_plan")),
				runs: s,
				review: l
			}
		};
	} catch (e) {
		if (e instanceof mc) return {
			ok: !1,
			path: e.path
		};
		throw e;
	}
}
// src/core/room-view.ts
var Kc = 4e3;
function qc(e) {
	switch (e.kind) {
		case "send_feedback": return `feedback:${e.phase}`;
		case "start_workshop": return "workshop";
		case "cancel_run":
		case "retry_run": return `run:${e.runId}`;
	}
}
var Jc = {
	loading: "Loading this room's output. Its controls are off until it arrives.",
	unavailable: "This room's output could not be read. Its controls are off; Door and approval decisions are unaffected.",
	malformed: "The house sent room output this page cannot read. This room's controls are off.",
	read_only: "This is a recording. Nothing can be sent, cancelled or retried here.",
	integrity: "The room's output failed its integrity check. Its controls are off until it is repaired.",
	mismatch: "The room's output and the house's state are from different moments. Refreshing before anything can be sent."
};
function Yc(e, t) {
	return t.documents.some((n) => {
		let r = e.phases[W.indexOf(n.phase)], i = r.door.proposal;
		return i === null || i.status !== "pending" || r.door.status !== "waiting" ? !1 : n.artifact === null ? !t.readOnly : n.artifact.artifactRevision.sha256 !== i.artifactRevision.sha256 || n.artifact.artifactRevision.revision !== i.artifactRevision.revision;
	});
}
function Xc(e) {
	let t = (e, t = !1) => ({
		allowed: !1,
		block: e,
		text: Jc[e],
		needsRefresh: t
	});
	return e.roomGhosts?.readOnly === !0 ? t("read_only") : e.authority.canDecide ? e.roomGhostsStatus === "malformed" ? t("malformed") : e.roomGhosts === null || e.projection === null ? t(e.roomGhostsStatus === "unavailable" ? "unavailable" : "loading") : e.roomGhostsStatus === "ready" ? e.roomGhosts.integrity === "corrupt" || e.projection.integrity === "corrupt" ? t("integrity") : e.roomGhosts.integrity === e.projection.integrity ? e.roomGhosts.integrity === "valid" ? e.roomGhosts.mansionId !== e.projection.mansionId || e.roomGhosts.version !== e.projection.version || Yc(e.projection, e.roomGhosts) ? t("mismatch", !0) : {
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
var Zc = "Another request is on its way. Wait for it to finish.";
function Qc(e, t, n, r, i = null) {
	let a = r === qc(t), o = n.allowed ? i === null ? r === null ? null : Zc : i : n.text;
	return {
		label: e,
		command: o === null ? t : null,
		busy: a,
		blockedText: a ? null : o
	};
}
var $c = {
	requirements: "Requirements document",
	design: "Design document",
	tasks: "Task plan"
}, el = {
	unwritten: "Not written yet",
	valid: "Valid: it passed the house's checks",
	invalid: "Not valid: it failed the house's checks",
	unknown: "Not checked here"
};
function tl(e) {
	return e === 1 ? "1 byte" : `${e.toLocaleString("en-US")} bytes`;
}
function nl(e) {
	return e === 0 ? "No findings" : e === 1 ? "1 finding" : `${e} findings`;
}
var rl = /* @__PURE__ */ new Set(["waiting", "revision_required"]);
function il(e, t, n, r, i) {
	if (!rl.has(e.status) || e.door.status === "open" || !n.runs.some((e) => e.phase === t)) return null;
	let a = `feedback:${t}`, o = r.allowed ? i !== null && i !== a ? Zc : null : r.text;
	return {
		phase: t,
		label: `Ask for a revision of the ${q[t].toLowerCase()}`,
		maxCharacters: Kc,
		enabled: o === null && i === null,
		busy: i === a,
		blockedText: o,
		expectedVersion: n.version
	};
}
function al(e) {
	let t = e.trim();
	return t === "" ? {
		ok: !1,
		text: "Write what should change before sending."
	} : t.length > 4e3 ? {
		ok: !1,
		text: `Keep the request under ${Kc.toLocaleString("en-US")} characters.`
	} : {
		ok: !0,
		feedback: t
	};
}
function ol(e) {
	for (let t of e.phases) {
		let e = t.door.proposal?.documentPath;
		if (e !== void 0 && e.includes("/")) return e.slice(0, e.lastIndexOf("/"));
	}
}
function sl(e, t, n, r, i, a) {
	let o = t === null ? null : t.phases[W.indexOf(e)], s = o?.door.proposal ?? null, c = n?.documents[sc.indexOf(e)] ?? null, l = c?.artifact ?? null, u = l?.artifactRevision ?? s?.artifactRevision ?? null, d = l !== null || t === null ? void 0 : ol(t), f = (l === null ? s?.documentPath ?? (d === void 0 ? void 0 : `${d}/${e}.md`) : void 0) ?? c?.documentPath ?? `.kiro/specs/${a}/${e}.md`, p = l === null ? u === null ? "unwritten" : "unknown" : l.validated ? "valid" : "invalid", m = s !== null && s.status === "pending" && o?.door.status === "waiting" ? s : null, h = l !== null && m !== null && (l.artifactRevision.sha256 !== m.artifactRevision.sha256 || l.artifactRevision.revision !== m.artifactRevision.revision);
	return {
		phase: e,
		title: $c[e],
		documentPath: f,
		validation: p,
		validationText: el[p],
		revisionText: u === null ? null : `Revision ${u.revision} (${tl(u.sizeBytes)})`,
		digest: u?.sha256 ?? null,
		digestPrefix: u === null ? null : Fi(u.sha256),
		content: l?.content ?? null,
		contentNote: l?.content == null ? u === null ? "Nothing has been written here yet." : n?.readOnly === !0 ? "The séance log records the path, revision and digest of a document, never its text, so this recording has no text to show." : l === null ? "The document text is not loaded. The facts below come from the door proposal." : "The house did not send the text of this document. Its path, revision and digest are exact." : null,
		findings: l?.findings ?? [],
		findingsText: nl(l?.findings.length ?? 0),
		writeScope: c === null || l === null && f !== c.documentPath ? [f] : c.writeScope,
		doorNote: h ? `The text shown is revision ${l.artifactRevision.revision}. The door proposal covers revision ${m.artifactRevision.revision} (digest ${Fi(m.artifactRevision.sha256)}). The house is refreshing.` : null,
		feedback: o == null || n === null ? null : il(o, e, n, r, i)
	};
}
var cl = "Opening this session from Haunted House is not available yet. Find it in Crew by its name.", ll = "This is a recording: there is no Crew session to open.";
function ul(e, t = 400) {
	let n = e.replace(/\s+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function dl(e, t, n, r, i, a) {
	let o = t.get(e.ghostId), s = o !== void 0 && o.run_id === e.runId ? o.state : null, c = s === null ? "Earlier run" : yr[s], l = Ei(e.ghostId, a), u = n.version;
	return {
		runId: e.runId,
		ghostId: e.ghostId,
		ghostName: l,
		phase: e.phase,
		taskId: e.taskId,
		state: s,
		stateText: c,
		attemptText: `Attempt ${e.attempt} of 3`,
		summary: e.summary === null ? null : ul(e.summary),
		reasonText: wr(e.reasonCode),
		writeScope: e.claimPaths,
		cancel: e.cancelRequested ? {
			label: "Cancelling…",
			command: null,
			busy: !1,
			blockedText: "Cancellation was requested. Waiting for Crew to confirm it."
		} : e.canCancel ? Qc(`Cancel ${l}'s run`, {
			kind: "cancel_run",
			runId: e.runId,
			expectedVersion: u
		}, r, i) : null,
		retry: e.canRetry ? Qc("Retry with a fresh session", {
			kind: "retry_run",
			runId: e.runId,
			expectedVersion: u
		}, r, i) : null,
		exhaustedText: !e.canRetry && !e.canCancel && e.attempt >= 3 && (s === "failed" || s === "blocked") ? "All 3 attempts are used. Nothing retries on its own." : null,
		sessionLink: {
			slotKey: n.readOnly ? null : e.sessionLink,
			label: `Open ${l}'s Crew session (${c})`,
			disabledText: n.readOnly ? ll : e.sessionLink === null ? cl : null
		}
	};
}
var fl = {
	not_selected: "Not selected",
	queued: "Queued",
	backpressure: "Queued: waiting for capacity",
	active: "A Tinker is working on it",
	complete: "Done",
	failed: "Failed",
	cancelled: "Cancelled",
	blocked: "Blocked",
	skipped: "Skipped"
}, pl = {
	crew_capacity: "Crew has no room for another ghost right now",
	local_capacity: "All 3 Tinker seats are taken",
	claim_busy: "Another task is writing the same files"
};
function ml(e) {
	return e.complete ? "complete" : e.outcome === null ? "not_selected" : e.outcome.status === "queued" && e.backpressure !== null ? "backpressure" : e.outcome.status;
}
function hl(e) {
	if (e.complete) return null;
	if (e.backpressure !== null) {
		let { dispatchFailures: t, nextDelaySeconds: n, lastReason: r } = e.backpressure, i = t === 1 ? "1 refusal so far" : `${t} refusals so far`, a = n === 1 ? "1 second" : `${n} seconds`;
		return `${pl[r]}. Next try in ${a} (${i}). This does not use up an attempt.`;
	}
	return wr(e.outcome?.reasonCode ?? null);
}
function gl(e) {
	return !e.complete && (e.outcome === null || e.outcome.status === "skipped");
}
function _l(e, t, n, r, i) {
	let a = t.taskPlan;
	if (a === null) return null;
	let o = new Map(n.filter((e) => e.taskId !== null).map((e) => [e.runId, e])), s = (e) => {
		let t = ml(e);
		return {
			taskId: e.taskId,
			title: e.title,
			optional: e.optional,
			complete: e.complete,
			status: t,
			statusText: fl[t],
			requirementsText: e.requirements.length === 0 ? "None" : e.requirements.join(", "),
			writes: e.writes,
			attemptText: e.outcome === null || e.outcome.attempt === 0 ? null : `Attempt ${e.outcome.attempt} of 3`,
			detail: hl(e),
			selectable: gl(e),
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
	let u = a.tasks.filter((e) => e.outcome?.status === "active").length, d = e?.phases[W.indexOf("tasks")].door.status, f = r.allowed ? d === "open" ? a.findings.length > 0 ? "The task plan has findings. It needs a revision before any task can start." : a.tasks.some(gl) ? i !== null && i !== "workshop" ? Zc : null : "Every open task is already selected or done." : "Sealed door: approve the task plan before any task can start." : r.text;
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
function vl(e, t) {
	if (e.startBlockedText !== null || e.startBusy) return null;
	let n = e.waves.flatMap((e) => e.tasks), r = n.filter((e) => t.has(e.taskId)).map((e) => e.taskId);
	return r.length === 0 || r.length !== t.size || n.some((e) => t.has(e.taskId) && !e.selectable) ? null : {
		kind: "start_workshop",
		taskIds: r,
		expectedVersion: e.expectedVersion
	};
}
var yl = {
	study: ["requirements"],
	"drafting-room": ["design"],
	workshop: ["tasks"]
};
function bl(e) {
	let { room: t, projection: n, roomGhosts: r, snapshots: i } = e, a = e.names ?? {}, o = Xc(e), s = t.phases.map((e) => e.phase), c = n === null ? [] : s.map((e) => n.phases[W.indexOf(e)]), l = new Set(t.ghosts.map((e) => e.ghostId)), u = r === null ? [] : r.runs.filter((e) => s.includes(e.phase)).map((t) => dl(t, i, r, o, e.inFlight, a)).reverse(), d = r === null || t.id !== "workshop" ? null : _l(n, r, u, o, e.inFlight);
	return {
		projectionVersion: n?.version ?? 0,
		integrity: n === null ? "uncertain" : r === null ? n.integrity : xl(n.integrity, r.integrity),
		room: t.id,
		ghosts: Array.from(i.values()).filter((e) => l.has(e.ghost_id)),
		phases: c,
		gate: o,
		documents: yl[t.id].map((t) => sl(t, n, r, o, e.inFlight, e.specName)),
		taskBoard: d,
		runs: u,
		outputNote: r === null ? e.roomGhostsStatus === "loading" ? Jc.loading : e.roomGhostsStatus === "malformed" ? Jc.malformed : Jc.unavailable : null,
		ownsImplementationStart: d !== null
	};
}
function xl(e, t) {
	return e === "corrupt" || t === "corrupt" ? "corrupt" : e === "uncertain" || t === "uncertain" ? "uncertain" : "valid";
}
function Sl(e, t, n, r, i) {
	if (!n.allowed || r !== null || e === null || t === null || i.expectedVersion !== e.version || i.expectedVersion !== t.version) return null;
	switch (i.kind) {
		case "send_feedback": {
			let n = al(i.feedback);
			if (!n.ok || n.feedback !== i.feedback) return null;
			let r = t.phases[W.indexOf(i.phase)];
			return !rl.has(r.status) || r.door.status === "open" ? null : e.runs.some((e) => e.phase === i.phase) ? i : null;
		}
		case "start_workshop": {
			let n = e.taskPlan;
			if (n === null || n.findings.length > 0 || t.phases[W.indexOf("tasks")].door.status !== "open" || i.taskIds.length === 0 || new Set(i.taskIds).size !== i.taskIds.length) return null;
			let r = new Set(n.tasks.filter(gl).map((e) => e.taskId));
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
var Cl = {
	reviewing: "The Medium is reviewing",
	pass: "Passed: the review found nothing to change",
	changes_requested: "Changes requested",
	blocked: "Blocked: the review needs your decision"
}, wl = {
	proposed: "Proposed: not started",
	approved: "Approved for the Workshop",
	rejected: "Rejected"
};
function Tl(e, t, n = {}) {
	if (e === null || !e.seanceEnabled || e.review === null) return null;
	let r = e.review, i = t.get(r.ghostId)?.state ?? null, a = i === null ? "No run yet" : yr[i], o = Ei(r.ghostId, n);
	return {
		status: r.status,
		statusText: Cl[r.status],
		cycleText: `Review cycle ${r.cycle} of 3`,
		limitText: r.status === "blocked" || r.cycle >= 3 && r.status === "changes_requested" ? "Three review cycles ended without a pass. No fourth review starts on its own: the next step is your decision." : null,
		ghostName: o,
		state: i,
		stateText: a,
		findings: r.findings.map((e) => {
			let t = r.repairs.find((t) => t.findingId === e.findingId);
			return {
				findingId: e.findingId,
				summary: ul(e.summary),
				requirementsText: e.requirementIds.length === 0 ? "None" : e.requirementIds.join(", "),
				paths: e.paths,
				repair: t === void 0 ? null : {
					taskId: t.taskId,
					title: t.title,
					writes: t.writes,
					status: t.status,
					statusText: wl[t.status]
				}
			};
		}),
		sessionLink: {
			slotKey: e.readOnly ? null : r.sessionLink,
			label: `Open ${o}'s Crew session (${a})`,
			disabledText: e.readOnly ? ll : r.sessionLink === null ? cl : null
		}
	};
}
// src/core/room-api.ts
var El = "/apps/haunted-house/api";
function Dl(e, t) {
	return `${El}/mansions/${encodeURIComponent(e)}/specs/${encodeURIComponent(t)}`;
}
function Ol(e, t) {
	return `${Dl(e, t)}/room-ghosts`;
}
function kl(e, t) {
	return `${Dl(e, t)}/feedback`;
}
function Al(e, t) {
	return `${Dl(e, t)}/workshop/start`;
}
function jl(e) {
	return `${El}/room-ghosts/runs/${encodeURIComponent(e)}/cancel`;
}
function Ml(e) {
	return `${El}/room-ghosts/runs/${encodeURIComponent(e)}/retry`;
}
function Nl(e, t, n, r) {
	let i = {
		command_id: r,
		expected_version: n.expectedVersion
	};
	switch (n.kind) {
		case "send_feedback": return {
			path: kl(e, t),
			body: {
				...i,
				phase: n.phase,
				feedback: n.feedback
			}
		};
		case "start_workshop": return {
			path: Al(e, t),
			body: {
				...i,
				task_ids: [...n.taskIds]
			}
		};
		case "cancel_run": return {
			path: jl(n.runId),
			body: {
				...i,
				mansion_id: e
			}
		};
		case "retry_run": return {
			path: Ml(n.runId),
			body: {
				...i,
				mansion_id: e
			}
		};
	}
}
var Pl = {
	conflict: "The room changed before your request arrived, so nothing was done. Check what is shown now and try again.",
	invalid: "The house refused that request. Nothing was done.",
	not_found: "That run or spec no longer exists. Nothing was done.",
	integrity: "The séance log failed its integrity check, so the house accepts no requests. Nothing was done.",
	contract: "The house cannot do this right now: a contract it depends on is unavailable. Nothing was done.",
	crew: "Crew did not answer in time. Check the state shown before trying again.",
	read_only: "This is a recording. Nothing was done.",
	unavailable: "The house could not be reached. It is not known whether anything was done; the state is being read again."
};
function Fl(e) {
	let t = (e) => ({
		kind: e,
		text: Pl[e]
	});
	switch (Wo(e)) {
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
			let n = Ko(e);
			return t(n === "contract_unavailable" ? "contract" : n === "integrity_unavailable" ? "integrity" : "unavailable");
		}
	}
}
function Il(e) {
	switch (e.kind) {
		case "send_feedback": return "Revision request sent to the same session. The door stays sealed until you approve a new revision.";
		case "start_workshop": return e.taskIds.length === 1 ? "1 task selected. A Tinker starts when a seat and its files are free." : `${e.taskIds.length} tasks selected. Tinkers start as seats and files come free, at most three at a time.`;
		case "cancel_run": return "Cancellation requested. The run stops when Crew confirms it.";
		case "retry_run": return "Retry accepted. A fresh session takes the next attempt.";
	}
}
// src/adapters/room-ghosts-api.ts
var Ll = {
	status: "loading",
	roomGhosts: null,
	inFlight: null,
	notice: null
}, Rl = 5e3, zl = 150, Bl = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
};
function Vl() {
	if (typeof crypto < "u" && typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(16);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
function Hl(e) {
	let { api: t, mansionId: n, specName: r } = e, i = e.timers ?? Bl, a = e.pollMs ?? Rl, o = e.refreshDelayMs ?? zl, s = e.newCommandId ?? Vl, c = Ll, l = /* @__PURE__ */ new Set(), u = !1, d = !0, f = null, p = !1, m = null, h = null, g = "";
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
		return u ? Promise.resolve() : f === null ? (m = v(m), h = v(h), f = Promise.resolve().then(() => t.get(Ol(n, r))).then((e) => {
			let t = Gc(e, n, r);
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
			let o = Sl(c.roomGhosts, a.projection, a.gate, c.inFlight, i);
			if (o === null) return Promise.resolve();
			let l = Nl(n, r, o, s());
			return _({
				inFlight: qc(o),
				notice: null
			}), Promise.resolve().then(() => t.post(l.path, l.body)).then(() => Il(o), (e) => Fl(e).text).then((e) => S().then(() => _({
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
var Ul = () => Promise.resolve();
function Wl(e, t, n, r) {
	let i = oe(), a = P(i);
	a.current = i;
	let o = P(r);
	o.current = r;
	let s = P(null), [c, l] = F(Ll);
	return j(() => {
		if (e === null) {
			l(Ll);
			return;
		}
		let n = Hl({
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
		send: A((e, t) => s.current?.send(e, t) ?? Ul(), []),
		refresh: A(() => s.current?.refresh() ?? Ul(), []),
		noteDisagreement: A((e) => s.current?.noteWorkflowVersion(e, !0), [])
	};
}
// src/adapters/seance-live.ts
var Gl = [
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
], Kl = {
	highestSequence: 0,
	snapshots: /* @__PURE__ */ new Map(),
	catchingUp: !1,
	diagnostic: null,
	loaded: !1,
	transitions: [],
	pendingEnvelopes: 0
}, ql = 5e3, Jl = [
	1e3,
	2e3,
	5e3,
	15e3
], Yl = 500, Xl = 50, Zl = 3e4, Ql = 200, $l = 5e3, eu = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
}, tu = {
	code: "persistence_failed",
	safe_detail: "The backend did not confirm the latest ghost activity. Trying again."
}, nu = {
	code: "invalid_envelope",
	safe_detail: "The backend refused a Crew event, so it was not recorded."
}, ru = {
	code: "persistence_failed",
	safe_detail: "The séance log of this mansion is not available, so new ghost activity was not recorded."
}, iu = {
	code: "persistence_failed",
	safe_detail: "Too much ghost activity is waiting for the backend. The oldest events were dropped."
}, au = {
	code: "persistence_failed",
	safe_detail: "Could not read the séance log. Showing the last confirmed state."
}, ou = {
	code: "history_partial",
	safe_detail: "Could not recover missed activity from Crew history."
};
function su(e) {
	let { api: t, mansionId: n } = e, r = e.timers ?? eu, i = e.pollMs ?? ql, a = e.retryDelaysMs ?? Jl, o = e.maxQueue ?? Yl, s = Kl, c = ia, l = /* @__PURE__ */ new Set(), u = !1, d = !0, f = [], p = !1, m = 0, h = 0, g = null, _ = null, v = null, y = !1, b = !1, x = !1, S = null, C = null, w = null;
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
		let t = aa(c, e.events.filter((e) => e.scope.mansion_id === n));
		if (t.applied.length === 0) return;
		c = t.log;
		let r = sa(c);
		T({
			highestSequence: c.highestSequence,
			snapshots: new Map(r.snapshots.map((e) => [e.ghost_id, e])),
			transitions: r.transitions
		});
	}
	function E(e) {
		return e !== null && r.clear(e), null;
	}
	function te() {
		for (let e of s.snapshots.values()) if (e.state === "working" || e.state === "waiting") return !0;
		return !1;
	}
	function D(e) {
		if (_ = E(_), u || !d) return;
		let t = e === null ? te() ? i : null : Math.min(Math.max(e, Xl), Zl);
		t !== null && (_ = r.set(() => {
			_ = null, O(!1);
		}, t));
	}
	function O(e) {
		return u ? Promise.resolve() : (e && !s.catchingUp && T({ catchingUp: !0 }), v === null ? (_ = E(_), v = Promise.resolve().then(async () => {
			let e = null, r = [];
			try {
				let i = null;
				for (let a = 0; a < Ql; a += 1) {
					let a = await t.get(Fo(n, c.contiguousSequence, 500));
					if (u) return;
					let o = Uo(a);
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
				Wo(e) === 404 && Ko(e) === "log_not_found" ? (w = null, T({
					catchingUp: b,
					loaded: !0
				})) : (w = au, T({ catchingUp: b }));
			}
			r.length > 0 && re(r), D(e);
		}).finally(() => {
			if (v = null, !u) {
				if (y) {
					let e = b;
					y = !1, b = !1, O(e);
				}
				k();
			}
		}), v) : (y = !0, b ||= e, v));
	}
	function ne() {
		if (h >= a.length) return;
		let e = a[h];
		h += 1, g = r.set(() => {
			g = null, k();
		}, e);
	}
	function k() {
		if (u || p || g !== null || f.length === 0 || v !== null) return;
		let e = m > 0 ? 1 : Math.min(f.length, 100), r = f.slice(0, e);
		p = !0, Promise.resolve().then(() => t.post(Po(n), { envelopes: r })).then((e) => {
			if (p = !1, u) return;
			f[0] === r[0] && f.splice(0, r.length), m > 0 && --m, h = 0;
			let t = Uo(e);
			t.ok ? (C = null, ee(t.page), T({}), t.page.reconcileSlots.length > 0 && re(t.page.reconcileSlots), c.contiguousSequence < Math.max(c.highestSequence, t.page.highestSequence) ? O(!1) : D(null)) : (C = t.diagnostic, T({})), k();
		}, (e) => {
			if (p = !1, u) return;
			let t = Wo(e);
			if (t === 404 || t === 409) f[0] === r[0] && f.splice(0, r.length), m = 0, C = ru, T({}), k();
			else if (Jo(t)) {
				let t = qo(e, r.length);
				if (t !== null && f[0] === r[0]) {
					for (let { index: e } of [...t].reverse()) f.splice(e, 1);
					t.some(({ code: e }) => e !== "unknown_session") && (C = nu), T({}), k();
					return;
				}
				r.length > 1 ? m = r.length : (f[0] === r[0] && f.shift(), m > 0 && --m, C = nu), T({}), k();
			} else C = tu, T({}), ne();
		});
	}
	function re(e) {
		if (u || x || S !== null || e.length === 0) return Promise.resolve();
		x = !0;
		let i = { slots: e.slice(0, 8) };
		return Promise.resolve().then(() => t.post(Io(n), i)).then((e) => {
			if (u) return;
			let t = Uo(e);
			t.ok ? (ee(t.page), w = t.page.diagnostics[0] ?? w) : w = ou, T({});
		}, () => {
			u || (w = ou, T({}));
		}).finally(() => {
			if (x = !1, !u) return S = r.set(() => {
				S = null;
			}, $l), O(!1);
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
			O(!0);
		},
		forward(e, t) {
			u || (f.push({
				type: e,
				data: t
			}), f.length > o && (f.splice(0, f.length - o), C = iu), T({}), g === null && h >= a.length && (h = Math.max(a.length - 1, 0)), k());
		},
		catchUp: () => O(!0),
		reconcile: re,
		setVisible(e) {
			u || d === e || (d = e, d ? (h = 0, O(!0)) : _ = E(_));
		},
		dispose() {
			u = !0, _ = E(_), g = E(g), S = E(S), l.clear(), f.length = 0;
		}
	};
}
function cu(e) {
	let t = oe(), n = P(t);
	n.current = t;
	let r = P(null), [i, a] = F(Kl);
	j(() => {
		if (e === null) {
			a(Kl);
			return;
		}
		let t = su({
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
	let o = N(() => Gl.map((e) => (t) => r.current?.forward(e, t)), []);
	Gl.forEach((e, t) => {
		se(e, o[t]);
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
var lu = {
	projection: null,
	projectionStatus: "loading",
	inFlight: null,
	notice: null
};
function uu(e, t) {
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
function du(e, t) {
	return e.revision === t.revision && e.sha256 === t.sha256 && e.sizeBytes === t.sizeBytes;
}
function fu(e, t, n) {
	let r = e.projection;
	if (!t.canDecide || e.inFlight !== null || r === null || e.projectionStatus !== "ready" || n.expectedVersion !== r.version) return null;
	switch (n.kind) {
		case "start_phase": {
			let e = r.phases.find((e) => e.phase === n.phase);
			return e?.status === "ready" || e?.status === "failed" || e?.status === "revision_required" ? n : null;
		}
		case "decide_door": {
			let e = r.phases.find((e) => e.phase === n.phase), t = e?.door.proposal;
			return e === void 0 || t == null || e.door.status !== "waiting" || t.status !== "pending" || t.proposalId !== n.proposalId || t.documentPath !== n.documentPath ? null : du(t.artifactRevision, n.artifactRevision) ? n : null;
		}
		case "decide_risky": {
			let e = r.riskyProposals.find((e) => e.proposalId === n.proposalId);
			return e === void 0 || e.status !== "pending" || e.actionDigest !== n.actionDigest || n.decision === "approve" && e.descriptor === null ? null : n;
		}
	}
}
// src/core/workflow-api.ts
var pu = "/apps/haunted-house/api/mansions";
function mu(e) {
	return `${pu}/${encodeURIComponent(e)}`;
}
function hu(e) {
	return `${mu(e)}/workflow`;
}
function gu(e, t) {
	return `${mu(e)}/phases/${t}/start`;
}
function _u(e, t, n) {
	return `${mu(e)}/doors/${encodeURIComponent(t)}/${n}`;
}
function vu(e, t, n) {
	return `${mu(e)}/approvals/${encodeURIComponent(t)}/${n}`;
}
function yu(e, t, n) {
	let r = {
		command_id: n,
		expected_version: t.expectedVersion
	};
	switch (t.kind) {
		case "start_phase": return {
			path: gu(e, t.phase),
			body: r
		};
		case "decide_door": return {
			path: _u(e, t.proposalId, t.decision),
			body: {
				...r,
				phase: t.phase,
				document_path: t.documentPath,
				artifact_revision: Si(t.artifactRevision)
			}
		};
		case "decide_risky": return {
			path: vu(e, t.proposalId, t.decision),
			body: {
				...r,
				action_digest: t.actionDigest
			}
		};
	}
}
function bu(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function xu(e, t) {
	if (!bu(e)) return null;
	let { event_id: n, sequence: r, version: i } = e;
	if (typeof n != "string" || !/^e1:[0-9a-f]{64}$/.test(n) || typeof r != "number" || !Number.isSafeInteger(r) || r < 1) return null;
	let a = xi(e.workflow, t);
	return !a.ok || i !== a.projection.version || r > a.projection.version ? null : {
		eventId: n,
		sequence: r,
		projection: a.projection
	};
}
var Su = {
	conflict: "The house changed before your decision arrived, so nothing was recorded. Check what is shown now and decide again.",
	invalid: "The house refused that request. Nothing was recorded.",
	not_found: "That mansion or proposal no longer exists. Nothing was recorded.",
	integrity: "The séance log failed its integrity check, so the house accepts no decisions. Nothing was recorded.",
	crew: "Crew did not answer in time. Check the state shown before trying again.",
	read_only: "This is a recording. Nothing was recorded.",
	unavailable: "The house could not be reached. It is not known whether anything was recorded; the state is being read again."
}, Cu = 524288;
function wu(e, t) {
	if (typeof e != "object" || !e) return null;
	let n = e.body;
	if (typeof n != "string" || n.length > Cu) return null;
	try {
		let e = JSON.parse(n);
		if (!bu(e)) return null;
		let r = xi(e.workflow, t);
		return r.ok ? r.projection : null;
	} catch {
		return null;
	}
}
function Tu(e, t) {
	let n = Wo(e), r = wu(e, t), i = (e) => ({
		kind: e,
		text: Su[e],
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
		default: return i(Ko(e) === "integrity_unavailable" ? "integrity" : "unavailable");
	}
}
function Eu(e) {
	switch (e.kind) {
		case "start_phase": return `${q[e.phase]} started.`;
		case "decide_door": return e.decision === "approve" ? `${q[e.phase]} door approved. The next phase starts only when you start it.` : `${q[e.phase]} door rejected. A revision is required.`;
		case "decide_risky": return e.decision === "approve" ? "Action approved for one attempt." : "Action rejected. It will not run.";
	}
}
// src/adapters/workflow-live.ts
var Du = 5e3, Ou = 150, ku = "The house answered in a way this page cannot read. Reading the state again before anything else.", Au = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
};
function ju() {
	if (typeof crypto < "u" && typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(16);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
function Mu(e) {
	let { api: t, mansionId: n } = e, r = e.timers ?? Au, i = e.pollMs ?? Du, a = e.refreshDelayMs ?? Ou, o = e.newCommandId ?? ju, s = lu, c = /* @__PURE__ */ new Set(), l = !1, u = !0, d = null, f = !1, p = null, m = null, h = 0;
	function g(e) {
		if (l) return;
		let t = uu(s, e);
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
		return e.readOnly ? !1 : h > e.version || e.integrity === "uncertain" || Yi(e).length > 0 || e.phases.some((e) => e.status === "starting");
	}
	function y() {
		p = _(p), !l && u && v() && (p = r.set(() => {
			p = null, b();
		}, i));
	}
	function b() {
		return l ? Promise.resolve() : d === null ? (p = _(p), m = _(m), d = Promise.resolve().then(() => t.get(hu(n))).then((e) => {
			let t = xi(e, n);
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
			let a = fu(s, i, r);
			if (a === null) return Promise.resolve();
			let c = yu(n, a, o());
			return g({
				type: "command_sent",
				target: Pi(a)
			}), Promise.resolve().then(() => t.post(c.path, c.body)).then((e) => {
				let t = xu(e, n);
				if (t === null) return g({
					type: "command_settled",
					notice: ku
				}), b();
				g({
					type: "projection_received",
					projection: t.projection
				}), g({
					type: "command_settled",
					notice: Eu(a)
				}), y();
			}, (e) => {
				let t = Tu(e, n);
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
var Nu = () => Promise.resolve();
function Pu(e, t, n) {
	let r = oe(), i = P(r);
	i.current = r;
	let a = P(n);
	a.current = n;
	let o = P(null), [s, c] = F(lu);
	return j(() => {
		if (e === null) {
			c(lu);
			return;
		}
		let t = Mu({
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
		send: A((e, t) => o.current?.send(e, t) ?? Nu(), []),
		refresh: A(() => o.current?.refresh() ?? Nu(), [])
	};
}
// src/adapters/house-projection.ts
function Fu(e) {
	let t = e.diagnostic;
	if (t === null) return {
		integrity: "valid",
		validRecordCount: e.highestSequence,
		diagnostics: []
	};
	let n = to(t);
	return {
		integrity: n.code === "integrity_failed" ? "incompatible" : "diagnostic",
		validRecordCount: e.highestSequence,
		diagnostics: [n]
	};
}
function Iu(e) {
	let t = e.ghostNames, n = Ni({
		projection: e.workflow,
		projectionStatus: e.workflowStatus,
		canonical: e.canonical,
		readOnly: e.readOnly
	}), r = e.roomInFlight ?? (e.workflowInFlight === null ? null : `workflow:${e.workflowInFlight}`), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map();
	for (let o of Qi(e.workflow, e.snapshots.values(), t)) i.set(o.id, $i(e.workflow, o, n, e.workflowInFlight, t)), a.set(o.id, bl({
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
function Lu(e) {
	let { mansion: t, ghostNames: n, seanceRoom: r, mode: i } = e, a = t.name, o = t.projectSpec, s = e.replayed ?? null, { state: c, catchUp: l } = cu(a), { state: u, send: d, refresh: f } = Pu(a, c.highestSequence, l), p = A(() => {
		l(), f();
	}, [l, f]), m = Wl(a, o, (s === null ? u.projection : s.workflow)?.version ?? null, p), h = tt(), g = s === null ? u.projection : s.workflow, _ = s === null ? u.projectionStatus : "ready", v = s === null ? c.snapshots : s.snapshots, y = s === null ? c.transitions : s.transitions, b = m.state.roomGhosts, x = m.state.status, S = s === null ? c.highestSequence : s.highestSequence, C = i === "replay", w = N(() => ({
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
	]), T = N(() => e.replay ?? Fu(w), [e.replay, w]), ee = N(() => Iu({
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
	]), E = N(() => Xs(ee.input, {
		seanceRoom: r,
		mode: i
	}), [
		ee.input,
		r,
		i
	]), te = ee.authority, D = N(() => Xc({
		projection: g,
		roomGhosts: b,
		roomGhostsStatus: x,
		authority: te
	}), [
		g,
		b,
		x,
		te
	]), O = m.noteDisagreement;
	j(() => {
		s === null && D.needsRefresh && u.projection !== null && O(u.projection.version);
	}, [
		s,
		D.needsRefresh,
		u.projection,
		m.state.roomGhosts,
		O
	]);
	let ne = N(() => r === "enabled" ? Tl(b, v, n) : null, [
		r,
		b,
		v,
		n
	]), k = P(e.onAnnounce);
	k.current = e.onAnnounce, j(() => {
		u.notice !== null && k.current(u.notice);
	}, [u.notice]), j(() => {
		m.state.notice !== null && k.current(m.state.notice);
	}, [m.state.notice]);
	let re = m.send, M = P({
		projection: u.projection,
		gate: D,
		workflowBusy: u.inFlight !== null
	});
	M.current = {
		projection: u.projection,
		gate: D,
		workflowBusy: u.inFlight !== null
	};
	let ie = A((e) => {
		re(e, M.current);
	}, [re]), F = P(te);
	F.current = te;
	let ae = A((e) => {
		d(e, F.current);
	}, [d]), oe = A((e) => Bs(e, g), [g]), se = A((e) => Ei(e, n), [n]), I = N(() => ({
		transitions: y,
		snapshots: v,
		roomOf: oe,
		nameOf: se
	}), [
		y,
		v,
		oe,
		se
	]);
	return {
		projection: E,
		authority: te,
		loading: s === null && (u.projectionStatus === "loading" || !c.loaded && c.diagnostic === null),
		logProblem: c.diagnostic === null ? null : Ar(c.diagnostic),
		details: ee.details,
		outputs: ee.outputs,
		review: ne,
		notice: u.notice,
		roomNotice: m.state.notice,
		inFlight: u.inFlight ?? m.state.inFlight,
		send: ae,
		sendRoom: ie,
		openSession: h,
		canonical: I
	};
}
// src/core/interruption-policy.ts
var Ru = [
	"waiting",
	"blocked",
	"failed"
], zu = 1e4;
function Bu(e) {
	return Ru.includes(e);
}
var Vu = {
	seenEventIds: /* @__PURE__ */ new Set(),
	burst: null
}, Hu = [];
function Uu(e) {
	return Array.from(e).length;
}
function Wu(e) {
	let t = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim();
	if (t === "") return "A ghost";
	let n = Array.from(t);
	return n.length <= 60 ? t : `${n.slice(0, 59).join("").trimEnd()}…`;
}
var Gu = {
	waiting: (e) => `${e} is waiting for your approval.`,
	blocked: (e) => `${e} is blocked.`,
	failed: (e) => `${e} failed.`
};
function Ku(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.events) t.set(n.ghostId, n);
	let n = Array.from(t.values()).sort((e, t) => Ir(e.roomId) - Ir(t.roomId)), r = n.map((e) => Gu[e.state](Wu(e.ghostName)));
	e.events.length > 1 && r.push(`${e.events.length} events.`);
	let i = r.join(" ");
	return Uu(i) > 240 && (i = n.length === 1 ? "1 ghost needs attention. Open Needs you for details." : `${n.length} ghosts need attention. Open Needs you for details.`), {
		text: i,
		eventIds: e.events.map((e) => e.eventId)
	};
}
function qu(e) {
	return {
		kind: "summary",
		...Ku(e)
	};
}
function Ju(e, t) {
	if (t.kind !== "transition" || t.fromState === t.toState || !br.has(t.toState) || !Bu(t.toState) || e.seenEventIds.has(t.eventId)) return {
		state: e,
		effects: Hu
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
		effects: Hu
	} : {
		state: {
			seenEventIds: a,
			burst: {
				openedAtMs: r,
				lastAcceptedAtMs: r,
				events: [i]
			}
		},
		effects: n === null ? Hu : [qu(n)]
	};
}
function Yu(e, t) {
	let n = e.burst;
	return n === null || t - n.lastAcceptedAtMs < 1e4 ? {
		state: e,
		effects: Hu
	} : {
		state: {
			seenEventIds: e.seenEventIds,
			burst: null
		},
		effects: [qu(n)]
	};
}
function Xu(e) {
	return e.burst === null ? null : e.burst.lastAcceptedAtMs + zu;
}
function Zu(e, t) {
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
function Qu(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.transitions) n.from_state !== n.to_state && t.set(n.ghost_id, n);
	let n = [], r = [];
	for (let i of e.transitions) {
		if (e.offered.has(i.transition_id) || (n.push(i.transition_id), t.get(i.ghost_id) !== i) || e.currentState(i.ghost_id) !== i.to_state) continue;
		let a = Zu(i, {
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
function $u(e) {
	let t = dt(), n = pt(), r = mt(), i = P(e);
	i.current = e;
	let a = P(Vu), o = P(/* @__PURE__ */ new Set()), s = P(null), c = e.active ? Math.max(0, Math.trunc(e.needsYouCount) || 0) : 0;
	return j(() => {
		r(c);
	}, [c, r]), j(() => () => void r(0), [r]), j(() => (a.current = Vu, o.current = /* @__PURE__ */ new Set(), () => {
		s.current !== null && clearTimeout(s.current), s.current = null, a.current = Vu;
	}), [e.mansionId, e.active]), j(() => {
		if (!e.active) return;
		let t = () => (i.current.now ?? Date.now)(), r = (e) => {
			for (let t of e) t.kind === "summary" && (n(t.text), i.current.onSummary({
				text: t.text,
				eventIds: t.eventIds
			}));
		}, c = () => {
			s.current !== null && clearTimeout(s.current), s.current = null;
			let e = Xu(a.current);
			e !== null && (s.current = setTimeout(() => {
				s.current = null;
				let e = Yu(a.current, t());
				a.current = e.state, r(e.effects), c();
			}, Math.max(e - t(), 0)));
		}, l = Qu({
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
			let t = Ju(a.current, e);
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
function ed(e) {
	return e.stillHouse === !1 && e.prefersReducedMotion === !1 ? "low-frequency" : "none";
}
function td(e) {
	return e !== !1;
}
function nd(e) {
	return {
		stillHouse: e.stillHouse,
		prefersReducedMotion: e.prefersReducedMotion,
		effective: ed(e)
	};
}
// src/components/house-art.tsx
function rd({ viewBox: e, className: t, width: n, height: r, preserveAspectRatio: i, data: a = {}, children: o }) {
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
var id = "var(--hh-surface-raised, none)";
function ad({ seanceRoom: e = !1 }) {
	return /* @__PURE__ */ R(rd, {
		viewBox: "0 0 400 44",
		className: "hh-ui-house-art",
		data: { "data-seance": e ? "shown" : "hidden" },
		children: [
			/* @__PURE__ */ L("path", {
				d: "M298 30 V8 H316 V22",
				fill: id
			}),
			/* @__PURE__ */ L("path", {
				d: "M305 4 q4 -3 0 -6",
				strokeWidth: 1
			}),
			/* @__PURE__ */ L("path", {
				d: "M8 43 L200 3 L392 43 z",
				fill: id,
				strokeWidth: 2.5
			}),
			/* @__PURE__ */ L("path", {
				d: "M120 27 H280 M156 19 H244 M88 35 H312",
				strokeDasharray: "6 6",
				strokeWidth: 1
			}),
			/* @__PURE__ */ L("circle", {
				cx: "200",
				cy: "22",
				r: "5"
			}),
			/* @__PURE__ */ L("path", {
				d: "M195 22 H205 M200 17 V27",
				strokeWidth: 1
			})
		]
	});
}
var od = {
	foyer: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", { d: "M78 74 V40 a14 14 0 0 1 28 0 V74" }),
		/* @__PURE__ */ L("path", {
			d: "M78 40 H106 M92 26 V40",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("circle", {
			cx: "101",
			cy: "58",
			r: "1.5"
		}),
		/* @__PURE__ */ L("path", { d: "M62 74 V34 M56 40 l6 -6 l6 6 M57 74 h10" }),
		/* @__PURE__ */ L("ellipse", {
			cx: "92",
			cy: "77",
			rx: "20",
			ry: "2",
			strokeWidth: 1
		})
	] }),
	study: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("rect", {
			x: "84",
			y: "24",
			width: "30",
			height: "50"
		}),
		/* @__PURE__ */ L("path", {
			d: "M84 40 H114 M84 57 H114",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", {
			d: "M89 27 v11 M94 29 v9 M100 27 v11 M106 30 v8 M90 44 v11 M97 45 v10 M104 43 v12",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", { d: "M50 58 H78 M54 58 V74 M74 58 V74" }),
		/* @__PURE__ */ L("path", {
			d: "M66 58 v-5 h6 v5 M69 53 q2 -12 9 -16",
			strokeWidth: 1
		})
	] }),
	"drafting-room": /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", { d: "M62 44 L108 34 M72 42 V74 M100 36 V74 M66 74 H106" }),
		/* @__PURE__ */ L("path", {
			d: "M70 39 l24 -5 l-20 -8 z",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("circle", {
			cx: "48",
			cy: "70",
			r: "4"
		}),
		/* @__PURE__ */ L("path", {
			d: "M48 66 H30 M48 74 H30 M30 66 a4 4 0 0 0 0 8",
			strokeWidth: 1
		})
	] }),
	workshop: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", { d: "M56 52 H112 M62 52 V74 M106 52 V74 M62 64 H106" }),
		/* @__PURE__ */ L("path", { d: "M94 52 v-8 h10 v8 M99 44 v-5 M95 39 h8" }),
		/* @__PURE__ */ L("path", { d: "M70 50 l10 -12 M76 34 l8 7" }),
		/* @__PURE__ */ L("path", {
			d: "M58 24 H110 M66 24 v6 M82 24 v9 M98 24 v5",
			strokeWidth: 1
		})
	] }),
	attic: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("rect", {
			x: "74",
			y: "54",
			width: "36",
			height: "20",
			rx: "2"
		}),
		/* @__PURE__ */ L("path", {
			d: "M74 62 H110 M88 54 V74 M96 54 V74",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("circle", {
			cx: "52",
			cy: "40",
			r: "10"
		}),
		/* @__PURE__ */ L("path", {
			d: "M42 40 H62 M52 30 V50",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", {
			d: "M118 4 L98 4 M118 4 L118 24 M118 4 L102 20 M108 4 q1 6 -4 10 q5 -3 14 -2",
			strokeWidth: 1
		})
	] }),
	"seance-room": /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("ellipse", {
			cx: "88",
			cy: "54",
			rx: "22",
			ry: "5"
		}),
		/* @__PURE__ */ L("path", { d: "M68 55 q3 12 8 19 M108 55 q-3 12 -8 19 M76 74 H100" }),
		/* @__PURE__ */ L("circle", {
			cx: "88",
			cy: "42",
			r: "7"
		}),
		/* @__PURE__ */ L("path", {
			d: "M83 49 h10",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", {
			d: "M54 62 h10 M59 62 V74 M112 62 h6 M115 62 V74",
			strokeWidth: 1
		})
	] })
};
function sd({ room: e }) {
	return /* @__PURE__ */ L(rd, {
		viewBox: "0 0 120 80",
		className: "hh-ui-room-art",
		preserveAspectRatio: e === "foyer" ? "xMidYMax meet" : "xMaxYMax meet",
		data: { "data-room": e },
		children: /* @__PURE__ */ L("g", {
			strokeWidth: 1.5,
			children: od[e]
		})
	});
}
var cd = {
	foyer: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			d: "M60 0 V22",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", { d: "M42 30 q18 10 36 0 M46 30 V24 M60 34 V26 M74 30 V24" }),
		/* @__PURE__ */ L("path", {
			d: "M44 22 h4 M58 24 h4 M72 22 h4",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", { d: "M8 98 h12 v-12 h12 v-12 h12 v-12 h12 v-12 h12" }),
		/* @__PURE__ */ L("path", {
			d: "M8 98 L68 38",
			strokeWidth: 1,
			strokeDasharray: "2 4"
		})
	] }),
	study: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", { d: "M44 92 V24 a16 16 0 0 1 32 0 V92 z" }),
		/* @__PURE__ */ L("path", {
			d: "M60 8 V92 M44 52 H76",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", {
			d: "M68 24 a6 6 0 1 0 4 8 a4.5 4.5 0 1 1 -4 -8 z",
			fill: "currentColor",
			fillOpacity: .3,
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", { d: "M38 6 q4 40 -2 86 M82 6 q-4 40 2 86 M34 4 H86" })
	] }),
	"drafting-room": /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("rect", {
			x: "30",
			y: "14",
			width: "60",
			height: "44"
		}),
		/* @__PURE__ */ L("path", {
			d: "M38 48 H60 V26 H82 M60 38 H72 V48",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("circle", {
			cx: "34",
			cy: "18",
			r: "1.5",
			fill: "currentColor"
		}),
		/* @__PURE__ */ L("circle", {
			cx: "86",
			cy: "18",
			r: "1.5",
			fill: "currentColor"
		})
	] }),
	workshop: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("path", { d: "M20 16 H100" }), /* @__PURE__ */ L("path", {
		d: "M34 16 v10 l-4 4 h8 l-4 -4 M54 16 v26 M50 42 h8 M76 16 v8 a6 6 0 1 0 0.1 0 M92 16 l4 24",
		strokeWidth: 1.5
	})] }),
	attic: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L("circle", {
		cx: "60",
		cy: "30",
		r: "14"
	}), /* @__PURE__ */ L("path", {
		d: "M46 30 H74 M60 16 V44",
		strokeWidth: 1
	})] }),
	"seance-room": /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			d: "M60 0 V18",
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", { d: "M48 30 q12 -16 24 0 z" }),
		/* @__PURE__ */ L("path", {
			d: "M62 22 a3 3 0 1 0 2 4 a2 2 0 1 1 -2 -4 z",
			fill: "currentColor",
			fillOpacity: .3,
			strokeWidth: 1
		}),
		/* @__PURE__ */ L("path", {
			d: "M50 30 q10 8 20 0",
			strokeWidth: 1,
			strokeDasharray: "1 3"
		})
	] })
};
function ld({ room: e }) {
	return /* @__PURE__ */ L(rd, {
		viewBox: "0 0 120 60",
		className: "hh-ui-room-wall",
		preserveAspectRatio: "xMidYMin meet",
		data: { "data-room": e },
		children: /* @__PURE__ */ L("g", {
			transform: "translate(24 0) scale(0.6)",
			strokeWidth: 2.5,
			children: cd[e]
		})
	});
}
var ud = [
	"plain",
	"archivist",
	"draughtsman",
	"foreman",
	"tinker",
	"medium"
];
function dd(e) {
	return ud.find((t) => t !== "plain" && (e === t || e.startsWith(`${t}-`))) ?? "plain";
}
var fd = {
	plain: "M10 40 V20 a10 10 0 0 1 20 0 V40 l-3.5 -4 l-3.5 4 l-3 -4 l-3 4 l-3.5 -4 z",
	archivist: "M12 42 V18 a8 8 0 0 1 16 0 V36 q0 5 4 6 q-6 1 -8 -3 l-4 4 l-4 -4 z",
	draughtsman: "M10 40 V22 L20 6 L30 22 V40 l-5 -4 l-5 4 l-5 -4 z",
	foreman: "M7 40 V24 q0 -6 5 -8 a8 8 0 0 1 16 0 q5 2 5 8 V40 h-6 v-3 h-4 v3 h-4 v-3 h-4 v3 z",
	tinker: "M11 38 V24 a9 9 0 0 1 18 0 V38 l-3 -4 l-3 4 l-3 -4 l-3 4 l-3 -4 z",
	medium: "M4 40 q6 -4 6 -18 a10 10 0 0 1 20 0 q0 14 6 18 q-6 2 -9 -2 l-3.5 4 l-3.5 -4 l-3.5 4 l-3.5 -4 q-3 4 -9 2 z"
}, pd = {
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
}, md = {
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
function hd({ state: e, variant: t = "plain", size: n = 40 }) {
	let r = md[e], i = e === "not_applicable" || e === "unavailable";
	return /* @__PURE__ */ L(rd, {
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
					d: fd[t],
					fill: i ? "none" : id,
					strokeDasharray: i ? "2 4" : r.dash
				}),
				i ? null : pd[t],
				/* @__PURE__ */ L("g", {
					strokeWidth: 1.5,
					children: r.marks
				})
			]
		})
	});
}
var gd = {
	sealed: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
			fill: id
		}),
		/* @__PURE__ */ L("path", {
			d: "M5 22 H27",
			strokeWidth: 3
		}),
		/* @__PURE__ */ L("circle", {
			cx: "16",
			cy: "22",
			r: "4",
			fill: id
		}),
		/* @__PURE__ */ L("path", {
			d: "M14.5 22 h3",
			strokeWidth: 1
		})
	] }),
	waiting: /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L("path", {
			d: "M8 38 V12 a8 8 0 0 1 16 0 V38 z",
			fill: id
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
			fill: id
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
		fill: id
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
function _d({ state: e, size: t = 30 }) {
	return /* @__PURE__ */ L(rd, {
		viewBox: "0 0 36 44",
		className: "hh-ui-art-door",
		width: t,
		height: Math.round(t * 44 / 36),
		data: { "data-door": e },
		children: gd[e]
	});
}
function vd({ lit: e = !0, size: t = 16 }) {
	return /* @__PURE__ */ R(rd, {
		viewBox: "0 0 16 32",
		className: "hh-ui-art-candle",
		width: t,
		height: t * 2,
		data: { "data-lit": e ? "true" : "false" },
		children: [
			/* @__PURE__ */ L("path", {
				d: "M5 14 H11 V28 H5 z",
				fill: id
			}),
			/* @__PURE__ */ L("path", { d: "M2 28 H14 M8 14 V11 M11 18 q1.5 2 0 4" }),
			e ? /* @__PURE__ */ L("path", {
				className: "hh-ui-art-flame",
				d: "M8 2 q4 5 0 9 q-4 -4 0 -9 z",
				fill: "currentColor",
				strokeWidth: 1
			}) : null
		]
	});
}
function yd() {
	return /* @__PURE__ */ L(rd, {
		viewBox: "0 0 60 30",
		className: "hh-ui-art-dust",
		width: 60,
		height: 30,
		children: /* @__PURE__ */ R("g", {
			fill: "currentColor",
			stroke: "none",
			children: [
				/* @__PURE__ */ L("circle", {
					cx: "6",
					cy: "20",
					r: "1"
				}),
				/* @__PURE__ */ L("circle", {
					cx: "17",
					cy: "8",
					r: "0.8"
				}),
				/* @__PURE__ */ L("circle", {
					cx: "28",
					cy: "23",
					r: "1.2"
				}),
				/* @__PURE__ */ L("circle", {
					cx: "39",
					cy: "12",
					r: "0.7"
				}),
				/* @__PURE__ */ L("circle", {
					cx: "48",
					cy: "5",
					r: "1"
				}),
				/* @__PURE__ */ L("circle", {
					cx: "55",
					cy: "19",
					r: "0.8"
				})
			]
		})
	});
}
// src/components/RoomHotspots.tsx
var bd = /* @__PURE__ */ new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End"
]);
function xd({ room: e, needsYou: t, openKey: r, panelId: i, onOpen: o, onArrow: s }) {
	let c = M(), l = M(), u = {
		kind: "room",
		roomId: e.roomId
	}, d = ac(u), f = [t > 0 ? c : null, e.diagnostic === null ? null : l].filter((e) => e !== null).join(" "), [p, m, h] = tc(e), _ = e.readOnly && !e.locked && e.integrity === "valid", v = e.ghosts.some((e) => e.state === "working" || e.state === "waiting");
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
					"aria-label": nc(e),
					"aria-describedby": f === "" ? void 0 : f,
					"aria-disabled": e.locked ? !0 : void 0,
					"aria-expanded": r === d,
					"aria-controls": r === d ? i : void 0,
					onClick: (e) => o(u, e.currentTarget),
					onKeyDown: (t) => {
						!bd.has(t.key) || t.altKey || t.ctrlKey || t.metaKey || (t.preventDefault(), s(e.roomId, t.key));
					},
					children: [
						/* @__PURE__ */ R("span", {
							className: "hh-ui-room-name",
							children: [
								e.locked ? /* @__PURE__ */ L(g, {
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
							children: [/* @__PURE__ */ L(a, {
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
							children: [/* @__PURE__ */ L(_d, {
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
							children: [/* @__PURE__ */ L(hd, {
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
						let n = {
							kind: "ghost",
							roomId: e.roomId,
							ghostId: t.ghostId
						}, a = ac(n);
						return /* @__PURE__ */ R("button", {
							type: "button",
							className: "hh-ui-ghost-control",
							"data-ghost-control": t.ghostId,
							"data-ghost": t.state,
							"data-opener-key": a,
							"aria-label": rc(e, t),
							"aria-expanded": r === a,
							"aria-controls": r === a ? i : void 0,
							onClick: (e) => o(n, e.currentTarget),
							children: [/* @__PURE__ */ L(hd, {
								state: t.state,
								variant: dd(t.ghostId),
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
										children: Br(t.state)
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
						let n = {
							kind: "door",
							roomId: e.roomId,
							phase: t.phase,
							proposalId: t.proposalId
						}, a = ac(n);
						return /* @__PURE__ */ R("button", {
							type: "button",
							className: "hh-ui-door-control",
							"data-door-control": t.phase,
							"data-phase": t.phase,
							"data-status": t.phaseStatus ?? "unavailable",
							"data-door": t.state,
							"data-opener-key": a,
							"aria-label": ic(e, t),
							"aria-expanded": r === a,
							"aria-controls": r === a ? i : void 0,
							onClick: (e) => o(n, e.currentTarget),
							children: [/* @__PURE__ */ L(_d, { state: t.state }), /* @__PURE__ */ L("span", {
								className: "hh-ui-state",
								children: /* @__PURE__ */ R("span", { children: [
									t.phaseName,
									" door: ",
									/* @__PURE__ */ L("span", {
										className: "hh-ui-state-word",
										children: Br(t.state)
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
					children: [/* @__PURE__ */ L(n, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", {
						className: "hh-ui-state-word",
						children: Xi(t)
					})]
				}) : null,
				e.diagnostic === null ? null : /* @__PURE__ */ R("p", {
					className: _ ? "hh-ui-reason hh-ui-state hh-ui-visually-hidden" : "hh-ui-reason hh-ui-state",
					id: l,
					"data-room-reason": e.locked ? "locked" : e.readOnly ? "read-only" : "diagnostic",
					children: [e.locked || e.readOnly ? /* @__PURE__ */ L(g, {
						size: 16,
						"aria-hidden": !0
					}) : /* @__PURE__ */ L(D, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.diagnostic })]
				})
			]
		}), /* @__PURE__ */ R("div", {
			className: "hh-ui-room-scene",
			children: [
				/* @__PURE__ */ L(ld, { room: e.roomId }),
				/* @__PURE__ */ R("span", {
					className: "hh-ui-room-motifs",
					children: [/* @__PURE__ */ L(vd, { lit: v }), e.roomId === "attic" ? /* @__PURE__ */ L(yd, {}) : null]
				}),
				/* @__PURE__ */ L(sd, { room: e.roomId })
			]
		})]
	});
}
// src/components/HouseMap.tsx
var Sd = "Mansion rooms", Cd = "Arrow keys move between rooms. Enter opens a room, a ghost or a door. Escape closes it. Doors open only when you approve them.";
function wd({ projection: e, openSurface: t, motion: n, openKey: r = null, panelId: i = "" }) {
	let a = M(), o = P(null), s = N(() => new Set(e.rooms.map((e) => e.roomId)), [e.rooms]), c = s.has("seance-room"), l = A((t, n) => {
		let r = e.rooms.map((e) => e.roomId), i = n === "Home" ? r[0] : n === "End" ? r[r.length - 1] : zr(t, n, s);
		i !== void 0 && i !== t && o.current?.querySelector(`[data-room-control="${i}"]`)?.focus();
	}, [e.rooms, s]);
	return /* @__PURE__ */ R("nav", {
		className: "hh-ui-map",
		"aria-label": Sd,
		"data-motion-art": n,
		children: [
			/* @__PURE__ */ L("h3", {
				className: "hh-ui-map-title",
				id: a,
				tabIndex: -1,
				"data-map-title": !0,
				children: "The house"
			}),
			/* @__PURE__ */ L("p", {
				className: "hh-ui-reason hh-ui-map-help",
				children: Cd
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-ui-house",
				children: [/* @__PURE__ */ L(ad, { seanceRoom: c }), /* @__PURE__ */ L("ol", {
					className: "hh-ui-rooms",
					"data-seance": c ? "shown" : "hidden",
					ref: o,
					"aria-labelledby": a,
					children: e.rooms.map((n) => /* @__PURE__ */ L(xd, {
						room: n,
						needsYou: e.needsYou.filter((e) => e.roomId === n.roomId).length,
						openKey: r,
						panelId: i,
						onOpen: t,
						onArrow: l
					}, n.roomId))
				})]
			})
		]
	});
}
var Td = `
.hh-ui { ${Ct("light")}
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
.hh-ui[data-theme='dark'] { ${Ct("dark")} }
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
`, Ed = "Your browser asks for reduced motion, so the house is still either way.", Dd = re(function({ mansionName: e, needsYou: t, onNeedsYou: r, motion: i, onToggleStillHouse: a, status: o }, s) {
	let c = M(), l = ec(t), u = t.length === 0;
	return /* @__PURE__ */ R("div", {
		className: "hh-ui-toolbar",
		"data-toolbar": !0,
		children: [
			/* @__PURE__ */ R("h2", {
				className: "hh-ui-mansion-name",
				ref: s,
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
				"aria-disabled": u,
				"aria-label": u ? `Needs you: ${l}.` : `Needs you: ${l}. Go to the first.`,
				onClick: (e) => {
					u || r(e.currentTarget);
				},
				children: [/* @__PURE__ */ L(n, {
					size: 16,
					"aria-hidden": !0
				}), l]
			}),
			/* @__PURE__ */ R("button", {
				type: "button",
				className: "hh-ui-toggle",
				"aria-pressed": i.stillHouse,
				"aria-describedby": i.prefersReducedMotion ? c : void 0,
				onClick: a,
				children: [
					/* @__PURE__ */ L(O, {
						size: 16,
						"aria-hidden": !0
					}),
					"Still house: ",
					i.stillHouse ? "on" : "off"
				]
			}),
			i.prefersReducedMotion ? /* @__PURE__ */ L("span", {
				className: "hh-ui-reason",
				id: c,
				children: Ed
			}) : null,
			o === void 0 ? null : /* @__PURE__ */ R("details", {
				className: "hh-ui-status",
				children: [/* @__PURE__ */ L("summary", { children: "System status" }), /* @__PURE__ */ L("div", {
					className: "hh-ui-status-body",
					children: o
				})]
			}),
			u ? null : /* @__PURE__ */ L("ul", {
				className: "hh-ui-needs-list",
				"aria-label": "Waiting on you",
				children: t.map((e) => /* @__PURE__ */ L("li", { children: e.label }, `${e.kind}:${e.id}`))
			})
		]
	});
});
// src/components/LiveAnnouncer.tsx
function Od({ message: e, turn: t = 0 }) {
	return /* @__PURE__ */ L("p", {
		className: "hh-ui-announcer",
		"aria-live": "polite",
		"aria-atomic": "true",
		"data-announcer": !0,
		children: /* @__PURE__ */ L("span", { children: e }, t)
	});
}
// src/components/RoomPanelHost.tsx
function kd(e) {
	return e.replace(/["\\]/g, "\\$&");
}
function Ad(e, t, n = null) {
	let [r, i] = F([]), a = P(r);
	a.current = r;
	let o = P(null), s = P(null), c = P(null), l = A((e, t, n = {}) => {
		let r = {
			surface: {
				target: e,
				openerKey: t?.getAttribute("data-opener-key") ?? ac(e)
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
	}, []), d = r.findIndex((t) => oc(t.surface, e) === null);
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
		} else ((e.opener !== null && e.opener.isConnected ? e.opener : null) ?? n?.querySelector(`[data-opener-key="${kd(e.openerKey)}"]`) ?? null ?? n?.querySelector(`[data-room-control="${kd(e.target.roomId)}"]`) ?? null ?? n?.querySelector("[data-map-title]") ?? null)?.focus();
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
var jd = "button, [href], input, select, textarea, summary, [tabindex]:not([tabindex=\"-1\"])";
function Md({ id: e, title: t, mode: n, stack: r, closeLabel: i, children: a }) {
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
			let t = e.currentTarget, i = Array.from(t.querySelectorAll(jd)).filter((e) => !e.hasAttribute("disabled"));
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
				children: [/* @__PURE__ */ L(ne, {
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
var Nd = "(prefers-reduced-motion: reduce)";
function Pd() {
	try {
		return typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia(Nd) : null;
	} catch {
		return null;
	}
}
function Fd() {
	let [e, t] = F(() => td(Pd()?.matches));
	return j(() => {
		let e = Pd();
		if (e === null) {
			t(!0);
			return;
		}
		let n = (e) => t(td(e.matches));
		if (t(td(e.matches)), typeof e.addEventListener == "function") return e.addEventListener("change", n), () => e.removeEventListener("change", n);
		if (typeof e.addListener == "function") return e.addListener(n), () => e.removeListener(n);
		t(!0);
	}, []), e;
}
// src/components/MansionShell.tsx
var Id = {
	room: "Close room",
	ghost: "Close ghost details",
	door: "Close door details"
};
function Ld(e, t) {
	let n = e.rooms.find((e) => e.roomId === t.roomId);
	if (n === void 0) return "";
	switch (t.kind) {
		case "room": return n.name;
		case "ghost": return n.ghosts.find((e) => e.ghostId === t.ghostId)?.name ?? n.name;
		case "door": return `${n.doors.find((e) => e.phase === t.phase)?.phaseName ?? n.name} door`;
	}
}
function Rd(e) {
	return e.replace(/["\\]/g, "\\$&");
}
function zd(e) {
	let t = e.id.indexOf(":"), n = e.kind === "door-decision" || e.kind === "risky-decision" ? e.id.slice(t + 1) : null;
	return n === null || n === "" ? { kind: "heading" } : {
		kind: "selector",
		selector: `[data-proposal="${Rd(n)}"]`
	};
}
function Bd({ projection: e, renderSurface: t, host: n, message: r = "", status: i, notes: a, banner: o, busy: s = !1, onReturn: c, panelMode: l = "region", inFlight: u = null, panelStyles: d = "" }) {
	let f = P(null), p = P(null), m = M(), h = Ad(e, f, u), [g, _] = F(!1), v = nd({
		stillHouse: g,
		prefersReducedMotion: Fd()
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
	let C = A((e) => x(e.text), [x]), { theme: w } = $u({
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
	]), E = e.needsYou, te = A((e) => {
		let t = $s(E), n = E[0];
		t !== null && n !== void 0 && h.open({
			kind: "room",
			roomId: t
		}, e, {
			placement: "replace",
			focus: zd(n)
		});
	}, [E, h.open]), D = P({
		open: h.top !== null,
		close: h.close,
		onReturn: c
	});
	D.current = {
		open: h.top !== null,
		close: h.close,
		onReturn: c
	}, j(() => {
		let e = (e) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			let t = D.current;
			t.open ? (e.preventDefault(), t.close()) : t.onReturn !== void 0 && (e.preventDefault(), t.onReturn());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, []);
	let O = h.top, ne = l === "dialog" && O !== null ? { inert: "" } : {};
	return /* @__PURE__ */ R("section", {
		className: "hh-ui",
		"aria-label": `Mansion ${e.mansionName}`,
		"aria-busy": s,
		"data-theme": w.mode,
		"data-motion": v.effective,
		"data-still": v.effective === "none",
		"data-mode": e.mode,
		ref: f,
		onKeyDown: (e) => {
			e.key !== "Escape" || e.defaultPrevented || h.top === null || (e.preventDefault(), h.close());
		},
		children: [
			/* @__PURE__ */ L("style", { children: Td + d }),
			/* @__PURE__ */ R("div", {
				className: "hh-ui-behind",
				...ne,
				children: [
					/* @__PURE__ */ L(Dd, {
						ref: p,
						mansionName: e.mansionName,
						needsYou: E,
						onNeedsYou: te,
						motion: v,
						onToggleStillHouse: () => _((e) => !e),
						status: i
					}),
					o,
					/* @__PURE__ */ L(wd, {
						projection: e,
						openSurface: T,
						motion: v.effective,
						openKey: O === null ? null : ac(O.target),
						panelId: m
					}),
					a
				]
			}),
			O === null ? null : /* @__PURE__ */ L(Md, {
				id: m,
				title: Ld(e, O.target),
				mode: l,
				stack: h,
				closeLabel: Id[O.target.kind],
				children: t(O, ee)
			}, `${h.depth}:${ac(O.target)}`),
			/* @__PURE__ */ L(Od, {
				message: y.text,
				turn: y.turn
			})
		]
	});
}
// src/components/room-output-styles.ts
var Vd = "\n.hh-output { display: grid; gap: 10px; }\n.hh-artifact { border: 1px solid var(--border, currentColor); border-top: 3px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-artifact[data-validation='invalid'] { border-top-style: double; border-top-width: 5px; }\n.hh-artifact[data-validation='unwritten'] { border-style: dashed; }\n.hh-artifact-head { display: flex; align-items: flex-start; gap: 6px; }\n.hh-artifact-head svg { flex: none; margin-top: 2px; color: var(--hh-candle); }\n.hh-artifact-note { margin: 0; font-size: 0.875rem; color: var(--muted, inherit); }\n.hh-document { max-height: 24rem; overflow: auto; border: 1px solid var(--border, currentColor); border-radius: 4px;\n  padding: 8px 12px; background: var(--input, transparent); font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-document:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-document > :first-child { margin-top: 0; }\n.hh-document > :last-child { margin-bottom: 0; }\n.hh-md-heading { font-weight: 600; margin: 12px 0 4px; }\n.hh-md-heading[data-level='1'] { font-size: 1.0625rem; }\n.hh-md-heading[data-level='2'] { font-size: 1rem; }\n.hh-document p { margin: 6px 0; }\n.hh-md-quote { border-left: 3px solid var(--border-strong, currentColor); padding-left: 8px; }\n.hh-md-list { list-style: none; margin: 6px 0; padding: 0; display: grid; gap: 2px; }\n.hh-md-item { display: flex; align-items: flex-start; gap: 6px; }\n.hh-md-item svg { flex: none; margin-top: 3px; }\n.hh-md-marker { flex: none; min-width: 0.75rem; color: var(--muted, inherit); }\n.hh-document pre { margin: 6px 0; padding: 6px 8px; overflow: auto; border: 1px solid var(--border, currentColor);\n  border-radius: 4px; }\n.hh-document code, .hh-document pre, .hh-task code, .hh-run code, .hh-findings code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 0.8125rem; }\n.hh-document hr { border: 0; border-top: 1px solid var(--border, currentColor); margin: 8px 0; }\n.hh-findings { margin: 0; padding: 0 0 0 1.25rem; font-size: 0.875rem; display: grid; gap: 2px; }\n.hh-finding-code { color: var(--muted, inherit); }\n.hh-scope { list-style: none; margin: 0; padding: 0; }\n\n.hh-run { display: grid; gap: 4px; }\n.hh-run-summary { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-runs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }\n.hh-runs > li { display: grid; gap: 6px; }\n.hh-session-link { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-size: 0.875rem; }\n.hh-button-quiet { border-style: dotted; padding: 3px 10px; font-size: 0.875rem; }\n.hh-session-link-note { color: var(--muted, inherit); }\n\n.hh-board { border: 1px solid var(--border, currentColor); border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-wave { display: grid; gap: 6px; }\n.hh-tasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }\n.hh-task { border: 1px solid var(--border, currentColor); border-left: 4px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 8px 10px; display: grid; gap: 4px; }\n.hh-task[data-status='active'] { border-left-style: double; border-left-width: 6px; }\n.hh-task[data-status='not_selected'], .hh-task[data-status='skipped'] { border-left-style: dotted; }\n.hh-task[data-status='failed'], .hh-task[data-status='blocked'], .hh-task[data-status='cancelled'] { border-left-style: dashed; }\n.hh-task-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 0.875rem; }\n.hh-task-head input { margin: 0; width: 1rem; height: 1rem; align-self: center; accent-color: var(--accent, auto); }\n.hh-task-head input:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-task-id { font-weight: 600; }\n.hh-tag { border: 1px solid var(--border-strong, currentColor); border-radius: 999px; padding: 0 8px; font-size: 0.75rem; }\n.hh-task-detail { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n\n.hh-revision { display: grid; gap: 6px; }\n.hh-revision label { font-weight: 600; font-size: 0.875rem; }\n.hh-revision textarea { font: inherit; color: inherit; background: var(--input, transparent);\n  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 10px; min-height: 5rem;\n  resize: vertical; width: 100%; box-sizing: border-box; }\n.hh-revision textarea:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-revision textarea[aria-invalid='true'] { border-width: 2px; }\n\n.hh-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }\n", Hd = "This is a recording. It is read-only: nothing here starts, approves, rejects, retries or opens a Crew session.", Ud = "The Attic replays this mansion’s séance log. Replaying changes nothing: the rooms keep showing the live house.", Wd = "Reading the séance log…", Gd = "This log has no events yet. There is nothing to replay.", Kd = "No problems were found in this log.", qd = "Start of replay. No event has been shown yet.", Jd = "Now showing";
function Yd(e) {
	return e === 0 ? "No events recorded" : e === 1 ? "1 event recorded" : `${e} events recorded`;
}
function Xd(e) {
	return `${e}×`;
}
var Zd = rs.map((e) => ({
	speed: e,
	text: Xd(e)
}));
function Qd(e, t, n) {
	return e === "playing" ? "Playing" : e === "complete" ? n === 0 ? "Nothing to replay" : "Replay complete" : t === 0 ? "Paused at the start" : "Paused";
}
var $d = {
	enabled: !0,
	reason: null
}, ef = (e) => ({
	enabled: !1,
	reason: e
}), tf = "There are no events to replay.", nf = "The replay is at its start.", rf = "This is the last event.";
function af(e, t) {
	let n = e.records.length, r = n === 0, i = t.cursor >= n, a = t.cursor === 0, o = t.status === "playing" ? "pause" : a || i ? "play" : "resume";
	return {
		playAction: o,
		playLabel: o === "pause" ? "Pause" : o === "resume" ? "Resume" : "Play",
		play: o === "pause" ? $d : r ? ef(tf) : $d,
		restart: r ? ef(tf) : a && t.status !== "playing" ? ef(nf) : $d,
		previous: r ? ef(tf) : a ? ef(nf) : $d,
		next: r ? ef(tf) : i ? ef(rf) : $d,
		seek: r ? ef(tf) : $d,
		previousCursor: Math.max(t.cursor - 1, 0),
		nextCursor: Math.min(t.cursor + 1, n)
	};
}
function of(e, t) {
	return e.timeline.map((e, n) => ({
		key: e.recordId,
		position: n + 1,
		actor: e.actorLabel,
		summary: e.summary,
		current: n === t - 1,
		played: n < t
	}));
}
function sf(e, t) {
	let n = e.timeline[t - 1];
	return t <= 0 || n === void 0 ? qd : `${ms(e, t)}. ${n.actorLabel}: ${n.summary}.`;
}
function cf(e) {
	return `Replay complete. ${ms(e, e.records.length)}.`;
}
function lf(e) {
	return e <= 0 ? null : e === 1 ? "1 decision waiting at this point" : `${e} decisions waiting at this point`;
}
function uf(e, t, n) {
	let r = e.records.length, i = t.projection, a = fo(i, n), o = e.timeline[t.cursor - 1];
	return {
		statusText: Qd(t.status, t.cursor, r),
		positionText: ms(e, t.cursor),
		totalText: Yd(r),
		currentText: t.cursor <= 0 || o === void 0 ? qd : `${o.actorLabel}: ${o.summary}`,
		phases: a === null ? [] : a.phases.map((e) => ({
			phase: e.phase,
			status: e.status,
			door: e.door.status,
			text: `${q[e.phase]}: ${wi[e.status]}. ${Ti[e.door.status]}.`
		})),
		ghosts: i.ghosts.filter((e) => e.mansion_id === n && e.ghost_id !== "house-operator").map((e) => ({
			ghostId: e.ghost_id,
			state: e.state,
			text: `${Tr(e.ghost_id)}: ${yr[e.state]}`
		})),
		waitingText: lf(a?.waitingCount ?? 0)
	};
}
function df(e) {
	return e.line === void 0 ? e.safeDetail : `Line ${e.line}: ${e.safeDetail}`;
}
function ff(e, t) {
	let n = [
		...t.commandError === null ? [] : [t.commandError.safeDetail],
		...e.diagnostics.map(df),
		...t.projection.diagnostics.map(df)
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
var pf = "\n.hh-attic { display: grid; gap: 14px; min-width: 0; }\n.hh-attic h4 { margin: 0 0 6px; font-size: 0.9375rem; }\n.hh-attic p { margin: 0; overflow-wrap: anywhere; }\n.hh-attic-section { min-width: 0; display: grid; gap: 8px; }\n.hh-attic-note { display: flex; align-items: flex-start; gap: 6px; min-width: 0; padding: 8px 10px;\n  border: 1px solid var(--hh-border, currentColor); border-left-width: 6px; border-left-style: double; border-radius: 6px;\n  background: var(--hh-surface, transparent); }\n.hh-attic-note svg, .hh-attic-line svg { flex: none; margin-top: 2px; }\n.hh-attic-line { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }\n.hh-attic-status { font-weight: 600; }\n.hh-attic-muted { color: var(--hh-text-muted, inherit); }\n.hh-attic-buttons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }\n.hh-attic-button { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; min-height: 2.25rem;\n  font: inherit; text-align: left; color: var(--hh-text, inherit); background: var(--hh-surface-raised, transparent);\n  border: 1px solid var(--hh-border, currentColor); border-radius: 6px; padding: 6px 12px; cursor: pointer; }\n.hh-attic-button[data-variant='primary'] { color: var(--hh-primary-text, inherit); background: var(--hh-primary, transparent);\n  border-width: 2px; font-weight: 600; }\n.hh-attic-button[aria-disabled='true'] { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted, inherit);\n  background: var(--hh-surface, transparent); font-weight: 400; }\n.hh-attic-button:focus-visible, .hh-attic-range:focus-visible, .hh-attic-speed input:focus-visible,\n.hh-attic-timeline:focus-visible { outline: 2px solid var(--hh-focus, currentColor); outline-offset: 2px; }\n.hh-attic-reasons { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 0.875rem;\n  color: var(--hh-text-muted, inherit); }\n.hh-attic-speed { border: 1px solid var(--hh-border-soft, currentColor); border-radius: 6px; margin: 0; padding: 6px 10px;\n  display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; min-width: 0; }\n.hh-attic-speed legend { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; }\n.hh-attic-speed label { display: inline-flex; align-items: center; gap: 4px; min-height: 2rem; cursor: pointer; }\n.hh-attic-speed input:checked + span { font-weight: 700; text-decoration: underline; }\n.hh-attic-seek { display: grid; gap: 4px; min-width: 0; }\n.hh-attic-range { width: 100%; min-width: 0; margin: 0; accent-color: var(--hh-primary, auto); }\n.hh-attic-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; min-width: 0; }\n.hh-attic-timeline { max-height: 18rem; overflow-y: auto; min-width: 0; padding: 4px;\n  border: 1px solid var(--hh-border-soft, currentColor); border-radius: 6px; }\n.hh-attic-entries { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; min-width: 0; }\n.hh-attic-entry { display: grid; grid-template-columns: 1.25rem 2.5rem minmax(0, 1fr); column-gap: 6px; align-items: start;\n  padding: 4px 6px; border: 1px solid transparent; border-left: 4px solid transparent; border-radius: 4px; }\n.hh-attic-entry[data-played='false'] { color: var(--hh-text-muted, inherit); border-left: 4px dotted var(--hh-border-soft, currentColor); }\n.hh-attic-entry[data-played='true'] { border-left: 4px solid var(--hh-border, currentColor); }\n.hh-attic-entry[aria-current='step'] { font-weight: 700; border: 2px solid var(--hh-border, currentColor);\n  border-left: 6px double var(--hh-accent, currentColor); background: var(--hh-surface-raised, transparent); }\n.hh-attic-entry-mark svg { color: var(--hh-accent, currentColor); }\n.hh-attic-entry-number { font-variant-numeric: tabular-nums; }\n.hh-attic-entry-now { display: block; font-size: 0.8125rem; }\n.hh-attic-diagnostics li { display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px;\n  border: 1px dashed var(--hh-border, currentColor); border-left: 4px solid var(--hh-danger, currentColor); border-radius: 6px; }\n.hh-attic-diagnostics svg { flex: none; margin-top: 2px; color: var(--hh-danger, currentColor); }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-attic[data-motion='low-frequency'] .hh-attic-entry { transition: background-color 0.4s ease-out; }\n}\n.hh-attic[data-motion='none'] *, .hh-attic:not([data-motion]) * { animation: none !important; transition: none !important; }\n@media (prefers-reduced-motion: reduce) {\n  .hh-attic * { animation: none !important; transition: none !important; }\n}\n";
// src/rooms/attic/ReplayControls.tsx
function mf({ transport: e, speed: t, cursor: n, total: r, positionText: i, onPlay: a, onRestart: o, onPrevious: s, onNext: c, onSeek: l, onSpeed: u }) {
	let f = M(), p = (e) => `${f}-${e}-reason`, m = (e, t) => t.enabled ? void 0 : p(e), h = [
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
						children: [e.playAction === "pause" ? /* @__PURE__ */ L(y, {
							size: 16,
							"aria-hidden": !0
						}) : /* @__PURE__ */ L(b, {
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
						children: [/* @__PURE__ */ L(C, {
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
						children: [/* @__PURE__ */ L(ee, {
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
						children: [/* @__PURE__ */ L(E, {
							size: 16,
							"aria-hidden": !0
						}), "Next event"]
					})
				]
			}),
			h.some(([, , e]) => !e.enabled) ? /* @__PURE__ */ L("ul", {
				className: "hh-attic-reasons",
				children: h.map(([e, t, n]) => n.enabled ? null : /* @__PURE__ */ R("li", {
					id: p(e),
					children: [
						t,
						": ",
						n.reason
					]
				}, e))
			}) : null,
			/* @__PURE__ */ R("fieldset", {
				className: "hh-attic-speed",
				children: [/* @__PURE__ */ R("legend", { children: [/* @__PURE__ */ L(d, {
					size: 16,
					"aria-hidden": !0
				}), "Playback speed"] }), Zd.map((e) => /* @__PURE__ */ R("label", { children: [/* @__PURE__ */ L("input", {
					type: "radio",
					name: `${f}-speed`,
					value: e.speed,
					checked: t === e.speed,
					onChange: () => u(e.speed)
				}), /* @__PURE__ */ L("span", { children: e.text })] }, e.speed))]
			}),
			/* @__PURE__ */ R("div", {
				className: "hh-attic-seek",
				children: [
					/* @__PURE__ */ R("label", {
						htmlFor: `${f}-seek`,
						children: ["Replay position: ", i]
					}),
					/* @__PURE__ */ L("input", {
						id: `${f}-seek`,
						className: "hh-attic-range",
						type: "range",
						min: 0,
						max: r,
						step: 1,
						value: n,
						"aria-valuetext": i,
						"aria-disabled": !e.seek.enabled,
						"aria-describedby": e.seek.enabled ? void 0 : `${f}-seek-reason`,
						onChange: (t) => {
							e.seek.enabled && l(Number(t.currentTarget.value));
						}
					}),
					e.seek.enabled ? null : /* @__PURE__ */ L("p", {
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
function hf({ diagnostics: e }) {
	return e.rows.length === 0 ? /* @__PURE__ */ R("p", {
		className: "hh-attic-line hh-attic-muted",
		"data-attic": "diagnostics-empty",
		children: [/* @__PURE__ */ L(i, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ L("span", { children: Kd })]
	}) : /* @__PURE__ */ R("div", {
		className: "hh-attic-section",
		"data-attic": "diagnostics",
		children: [/* @__PURE__ */ L("ul", {
			className: "hh-attic-list hh-attic-diagnostics",
			children: e.rows.map((e) => /* @__PURE__ */ R("li", { children: [/* @__PURE__ */ L(D, {
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
function gf({ status: e }) {
	return L(e === "playing" ? b : e === "complete" ? i : y, {
		size: 16,
		"aria-hidden": !0
	});
}
function _f({ summary: e, status: t }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-attic-section",
		"data-attic": "summary",
		children: [
			/* @__PURE__ */ R("p", {
				className: "hh-attic-line hh-attic-status",
				"data-status": t,
				children: [/* @__PURE__ */ L(gf, { status: t }), /* @__PURE__ */ R("span", { children: [
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
				children: [/* @__PURE__ */ L(_, {
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
					children: [/* @__PURE__ */ L(s, {
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
					children: [/* @__PURE__ */ L(f, {
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
function vf({ rows: e, label: t }) {
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
		children: Gd
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
						children: e.current ? /* @__PURE__ */ L(_, {
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
							children: [Jd, ". "]
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
function yf(e, t, { watch: n = !0, refresh: r = !0 } = {}) {
	let { model: i, state: a, command: o, mansionId: s, source: c, mode: l, refresh: u } = e, d = P(t);
	d.current = t;
	let f = N(() => af(i, a), [i, a]), p = N(() => uf(i, a, s), [
		i,
		a,
		s
	]), m = N(() => of(i, a.cursor), [i, a.cursor]), h = N(() => ff(i, a), [i, a]), g = P({
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
		e.restart.enabled && (o({ kind: "restart" }), d.current(sf(t, 0)));
	}, [o]), y = A((e) => {
		let { transport: t, model: n } = g.current;
		if (!t[e].enabled) return;
		let r = e === "previous" ? t.previousCursor : t.nextCursor;
		o({
			kind: "seek",
			cursor: r
		}), d.current(sf(n, r));
	}, [o]), b = A(() => y("previous"), [y]), x = A(() => y("next"), [y]), S = A((e) => o({
		kind: "seek",
		cursor: e
	}), [o]), C = A((e) => o({
		kind: "set_speed",
		speed: e
	}), [o]), w = P(a.status);
	j(() => {
		let e = w.current;
		w.current = a.status, n && e === "playing" && a.status === "complete" && d.current(cf(i));
	}, [
		a.status,
		i,
		n
	]), j(() => {
		n && a.commandError !== null && d.current(a.commandError.safeDetail);
	}, [a.commandError, n]), j(() => {
		n && c === "error" && d.current($a.fixture_unavailable);
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
function bf({ replay: e, onAnnounce: t, motion: n = "none", watch: r = !0 }) {
	let i = yf(e, t, { watch: r }), a = M(), o = e.source === "loading" && i.total === 0;
	return /* @__PURE__ */ R("div", {
		className: "hh-attic",
		"data-attic-panel": !0,
		"data-mode": e.mode,
		"data-motion": n,
		"data-source": e.source,
		children: [
			/* @__PURE__ */ L("style", { children: pf }),
			/* @__PURE__ */ R("p", {
				className: "hh-attic-note",
				"data-attic": "mode",
				children: [e.readOnly ? /* @__PURE__ */ L(g, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ L(p, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.readOnly ? Hd : Ud })]
			}),
			o ? /* @__PURE__ */ R("p", {
				className: "hh-attic-line hh-attic-muted",
				"data-attic": "loading",
				children: [/* @__PURE__ */ L(S, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: Wd })]
			}) : null,
			/* @__PURE__ */ R("section", {
				className: "hh-attic-section",
				"aria-labelledby": `${a}-controls`,
				children: [/* @__PURE__ */ L("h4", {
					id: `${a}-controls`,
					children: "Playback"
				}), /* @__PURE__ */ L(mf, {
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
				}), /* @__PURE__ */ L(_f, {
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
				}), /* @__PURE__ */ L(vf, {
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
				}), /* @__PURE__ */ L(hf, { diagnostics: i.diagnostics })]
			})
		]
	});
}
// src/rooms/attic/ReplayBar.tsx
var xf = "Recording playback";
function Sf({ panel: e, readOnlyText: t, startText: n }) {
	let r = M(), { transport: i } = e, a = (e, t) => t.enabled ? null : /* @__PURE__ */ L("span", {
		className: "hh-ui-visually-hidden",
		id: `${r}-${e}`,
		children: t.reason
	});
	return /* @__PURE__ */ R("div", {
		className: "hh-ui-replay-bar",
		role: "group",
		"aria-label": xf,
		"data-replay-bar": !0,
		children: [
			/* @__PURE__ */ R("span", {
				className: "hh-ui-replay-label",
				children: [/* @__PURE__ */ L(o, {
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
						children: [i.playAction === "pause" ? /* @__PURE__ */ L(y, {
							size: 16,
							"aria-hidden": !0
						}) : /* @__PURE__ */ L(b, {
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
						children: [/* @__PURE__ */ L(C, {
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
				children: [/* @__PURE__ */ R("legend", { children: [/* @__PURE__ */ L(d, {
					size: 14,
					"aria-hidden": !0
				}), " Speed"] }), Zd.map((t) => /* @__PURE__ */ R("label", { children: [/* @__PURE__ */ L("input", {
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
				children: [/* @__PURE__ */ L(g, {
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
function Cf({ room: e }) {
	if (e.diagnostic === null) return null;
	let t = e.integrity === "valid" ? e.locked ? "locked" : e.readOnly ? "read-only" : "diagnostic" : "diagnostic";
	return /* @__PURE__ */ R("p", {
		className: "hh-ui-note",
		"data-kind": t,
		"data-room-note": !0,
		children: [L(t === "diagnostic" ? D : g, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ L("span", { children: e.diagnostic })]
	});
}
// src/rooms/house/DecisionButtons.tsx
function wf({ approve: e, reject: t, busy: n, subject: i, describedBy: a, onSend: o }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-decide",
		"aria-busy": n,
		children: [/* @__PURE__ */ R("button", {
			type: "button",
			className: "hh-button hh-button-primary",
			"aria-label": `Approve ${i}`,
			"aria-disabled": e === null,
			"aria-describedby": e === null ? a : void 0,
			onClick: () => {
				e !== null && o(e);
			},
			children: [/* @__PURE__ */ L(r, {
				size: 16,
				"aria-hidden": !0
			}), n ? "Sending…" : "Approve"]
		}), /* @__PURE__ */ R("button", {
			type: "button",
			className: "hh-button hh-button-reject",
			"aria-label": `Reject ${i}`,
			"aria-disabled": t === null,
			"aria-describedby": t === null ? a : void 0,
			onClick: () => {
				t !== null && o(t);
			},
			children: [/* @__PURE__ */ L(ne, {
				size: 16,
				"aria-hidden": !0
			}), "Reject"]
		})]
	});
}
// src/rooms/house/DoorPanel.tsx
function Tf({ view: e, onSend: n }) {
	let r = M(), a = M(), o = e.state === "pending";
	return /* @__PURE__ */ R("article", {
		className: "hh-proposal",
		"aria-labelledby": r,
		"data-state": e.state,
		"data-proposal": e.proposalId,
		children: [
			/* @__PURE__ */ R("div", {
				className: "hh-proposal-head",
				children: [/* @__PURE__ */ L(s, {
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
			o ? /* @__PURE__ */ R(I, { children: [
				/* @__PURE__ */ L("p", {
					className: "hh-proposal-sub",
					children: "Your decision covers exactly this revision. If the document changes, it needs a new decision. Approving opens the door; the next phase starts only when you start it."
				}),
				e.blockedText === null ? null : /* @__PURE__ */ R("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: a,
					children: [/* @__PURE__ */ L(g, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ L(wf, {
					approve: e.approve,
					reject: e.reject,
					busy: e.busy,
					subject: `${e.title}, ${e.revisionText.toLowerCase()}`,
					describedBy: e.blockedText === null ? void 0 : a,
					onSend: n
				})
			] }) : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-outcome",
				"data-outcome": e.state,
				children: [e.state === "approved" ? /* @__PURE__ */ L(i, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ L(t, {
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
}, Ef = {
	not_started: "plain",
	ready: "plain",
	starting: "plain",
	working: "plain",
	waiting: "attention",
	revision_required: "attention",
	approved: "ok",
	failed: "attention",
	done: "ok"
}, Df = {
	sealed: "plain",
	waiting: "attention",
	open: "ok",
	rejected: "attention"
}, Of = {
	idle: "plain",
	working: "plain",
	waiting: "attention",
	blocked: "attention",
	failed: "attention",
	done: "ok"
};
function kf({ status: e }) {
	switch (e) {
		case "not_started": return /* @__PURE__ */ L(a, { ...$ });
		case "ready": return /* @__PURE__ */ L(b, { ...$ });
		case "starting":
		case "working": return /* @__PURE__ */ L(h, {
			...$,
			className: "hh-spin"
		});
		case "waiting": return /* @__PURE__ */ L(m, { ...$ });
		case "revision_required": return /* @__PURE__ */ L(t, { ...$ });
		case "failed": return /* @__PURE__ */ L(D, { ...$ });
		case "approved":
		case "done": return /* @__PURE__ */ L(i, { ...$ });
	}
}
function Af({ status: e }) {
	switch (e) {
		case "sealed": return /* @__PURE__ */ L(g, { ...$ });
		case "waiting": return /* @__PURE__ */ L(s, { ...$ });
		case "open": return /* @__PURE__ */ L(c, { ...$ });
		case "rejected": return /* @__PURE__ */ L(t, { ...$ });
	}
}
function jf({ state: e }) {
	switch (e) {
		case "idle": return /* @__PURE__ */ L(v, { ...$ });
		case "working": return /* @__PURE__ */ L(h, {
			...$,
			className: "hh-spin"
		});
		case "waiting": return /* @__PURE__ */ L(m, { ...$ });
		case "blocked": return /* @__PURE__ */ L(g, { ...$ });
		case "failed": return /* @__PURE__ */ L(D, { ...$ });
		case "done": return /* @__PURE__ */ L(i, { ...$ });
	}
}
function Mf({ status: e }) {
	switch (e) {
		case "pending": return /* @__PURE__ */ L(m, { ...$ });
		case "approved":
		case "succeeded": return /* @__PURE__ */ L(i, { ...$ });
		case "consumed": return /* @__PURE__ */ L(h, {
			...$,
			className: "hh-spin"
		});
		case "rejected":
		case "superseded": return /* @__PURE__ */ L(t, { ...$ });
		case "failed": return /* @__PURE__ */ L(D, { ...$ });
	}
}
// src/rooms/house/use-revision-request.ts
function Nf(e, t) {
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
			let n = al(i);
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
function Pf({ view: e, onSend: t }) {
	let n = Nf(e, t), r = M(), i = M(), a = M(), o = M(), s = M();
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
					children: [/* @__PURE__ */ L(g, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: n.error })]
				}),
				e.blockedText === null ? null : /* @__PURE__ */ R("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: s,
					children: [/* @__PURE__ */ L(g, {
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
						children: [/* @__PURE__ */ L(T, {
							size: 16,
							"aria-hidden": !0
						}), "Send revision request"]
					}), /* @__PURE__ */ R("button", {
						type: "button",
						className: "hh-button",
						onClick: n.hide,
						children: [/* @__PURE__ */ L(ne, {
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
function Ff({ title: e, lines: t, empty: n }) {
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
function If({ view: e, onSend: t }) {
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
				children: [/* @__PURE__ */ L(Mf, { status: e.status }), /* @__PURE__ */ R("h5", {
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
				/* @__PURE__ */ L(Ff, {
					title: "Scope",
					lines: e.scope,
					empty: "No scope."
				}),
				/* @__PURE__ */ L(Ff, {
					title: "Exact arguments",
					lines: e.arguments,
					empty: "No arguments."
				}),
				/* @__PURE__ */ L(Ff, {
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
					children: [/* @__PURE__ */ L(g, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ L("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ L(wf, {
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
				children: [/* @__PURE__ */ L(Mf, { status: e.status }), /* @__PURE__ */ L("span", { children: e.outcomeText })]
			})
		]
	});
}
// src/core/markdown-blocks.ts
var Lf = 1500, Rf = /* @__PURE__ */ RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\u2028\u2029\\u202a-\\u202e\\u2066-\\u2069]", "g");
function zf(e) {
	return e.replace(/\r\n?/g, "\n").replace(Rf, "");
}
var Bf = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|((?<![A-Za-z0-9_])_(?![\s_])[^_\n]+(?<!\s)_(?![A-Za-z0-9_]))/g;
function Vf(e) {
	let t = [], n = 0;
	for (let r of e.matchAll(Bf)) {
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
var Hf = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/, Uf = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]{0,24})/, Wf = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/, Gf = /^(\s*)(?:([-*+])|(\d{1,4})[.)])\s+(.*)$/, Kf = /^\[( |x|X)\](\*?)\s+(.*)$/, qf = /^\s*\|.*\|\s*$/;
function Jf(e, t = Lf) {
	let n = zf(e).split("\n"), r = [], i = [], a = [], o = !1, s = () => {
		i.length > 0 && (r.push({
			kind: "paragraph",
			inlines: Vf(i.join(" "))
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
		let c = n[e], l = Uf.exec(c);
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
		let u = Hf.exec(c);
		if (u !== null) {
			s(), r.push({
				kind: "heading",
				level: u[1].length,
				inlines: Vf(u[2])
			});
			continue;
		}
		if (Wf.test(c)) {
			s(), r.push({ kind: "rule" });
			continue;
		}
		if (qf.test(c)) {
			s();
			let t = [c];
			for (; e + 1 < n.length && qf.test(n[e + 1]);) e += 1, t.push(n[e]);
			r.push({
				kind: "code",
				language: "table",
				text: t.join("\n")
			});
			continue;
		}
		let d = Gf.exec(c);
		if (d !== null) {
			i.length > 0 && s();
			let e = Kf.exec(d[4]);
			a.push({
				depth: Math.min(Math.floor(d[1].replace(/\t/g, "  ").length / 2), 5),
				checked: e === null ? null : e[1] !== " ",
				optional: e !== null && e[2] === "*",
				number: d[3] === void 0 ? null : `${d[3]}.`,
				inlines: Vf(e === null ? d[4] : e[3])
			});
		} else c.trimStart().startsWith(">") ? (s(), r.push({
			kind: "quote",
			inlines: Vf(c.trimStart().replace(/^>\s?/, ""))
		})) : (a.length > 0 && s(), i.push(c.trim()));
	}
	return o || s(), {
		blocks: r,
		truncated: o
	};
}
// src/components/MarkdownView.tsx
function Yf({ parts: e }) {
	return /* @__PURE__ */ L(I, { children: e.map((e, t) => {
		switch (e.kind) {
			case "code": return /* @__PURE__ */ L("code", { children: e.text }, t);
			case "strong": return /* @__PURE__ */ L("strong", { children: e.text }, t);
			case "emphasis": return /* @__PURE__ */ L("em", { children: e.text }, t);
			default: return /* @__PURE__ */ L("span", { children: e.text }, t);
		}
	}) });
}
function Xf({ item: e }) {
	return /* @__PURE__ */ R("li", {
		className: "hh-md-item",
		style: { marginLeft: `${e.depth * 1.25}rem` },
		"data-checked": e.checked ?? void 0,
		children: [e.checked === null ? /* @__PURE__ */ L("span", {
			className: "hh-md-marker",
			"aria-hidden": !0,
			children: e.number ?? "•"
		}) : e.checked ? /* @__PURE__ */ L(r, {
			size: 14,
			"aria-hidden": !0
		}) : /* @__PURE__ */ L(te, {
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
			/* @__PURE__ */ L(Yf, { parts: e.inlines }),
			e.optional ? /* @__PURE__ */ L("span", {
				"aria-hidden": !0,
				children: " (optional)"
			}) : null
		] })]
	});
}
var Zf = 6;
function Qf(e, t) {
	return Math.min(Zf, e + t - 1);
}
function $f({ block: e, baseLevel: t }) {
	switch (e.kind) {
		case "heading": return /* @__PURE__ */ L("p", {
			className: "hh-md-heading",
			role: "heading",
			"aria-level": Qf(t, e.level),
			"data-level": e.level,
			children: /* @__PURE__ */ L(Yf, { parts: e.inlines })
		});
		case "paragraph": return /* @__PURE__ */ L("p", { children: /* @__PURE__ */ L(Yf, { parts: e.inlines }) });
		case "quote": return /* @__PURE__ */ L("p", {
			className: "hh-md-quote",
			children: /* @__PURE__ */ L(Yf, { parts: e.inlines })
		});
		case "list": return /* @__PURE__ */ L("ul", {
			className: "hh-md-list",
			children: e.items.map((e, t) => /* @__PURE__ */ L(Xf, { item: e }, t))
		});
		case "code": return /* @__PURE__ */ L("pre", {
			"data-language": e.language === "" ? void 0 : e.language,
			children: /* @__PURE__ */ L("code", { children: e.text })
		});
		case "rule": return /* @__PURE__ */ L("hr", {});
	}
}
function ep({ text: e, baseLevel: t = 6 }) {
	let n = N(() => Jf(e), [e]);
	return /* @__PURE__ */ R(I, { children: [n.blocks.map((e, n) => /* @__PURE__ */ L($f, {
		block: e,
		baseLevel: t
	}, n)), n.truncated ? /* @__PURE__ */ L("p", {
		className: "hh-artifact-note",
		children: "The document is longer than this view shows. Its digest covers all of it."
	}) : null] });
}
// src/components/ArtifactView.tsx
var tp = {
	unwritten: "plain",
	unknown: "plain",
	valid: "ok",
	invalid: "attention"
};
function np({ state: e }) {
	let n = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "valid": return /* @__PURE__ */ L(i, { ...n });
		case "invalid": return /* @__PURE__ */ L(t, { ...n });
		default: return /* @__PURE__ */ L(a, { ...n });
	}
}
function rp({ view: e }) {
	let t = M();
	return /* @__PURE__ */ R("article", {
		className: "hh-artifact",
		"aria-labelledby": t,
		"data-artifact": e.phase,
		"data-validation": e.validation,
		children: [
			/* @__PURE__ */ R("div", {
				className: "hh-artifact-head",
				children: [/* @__PURE__ */ L(u, {
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
				children: /* @__PURE__ */ L(ep, { text: e.content })
			}),
			e.doorNote === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				"data-door-note": !0,
				children: [/* @__PURE__ */ L(D, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.doorNote })]
			}),
			/* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-tone": tp[e.validation],
				"data-validation-line": !0,
				children: [/* @__PURE__ */ L(np, { state: e.validation }), /* @__PURE__ */ R("span", { children: [e.validationText, e.findings.length > 0 ? `. ${e.findingsText}:` : ""] })]
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
					/* @__PURE__ */ R("dt", { children: [/* @__PURE__ */ L(g, {
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
function ip({ run: e }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-run",
		"data-run": e.runId,
		"data-ghost": e.ghostId,
		"data-state": e.state ?? "earlier",
		children: [
			/* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-tone": e.state === null ? "plain" : Of[e.state],
				children: [e.state === null ? /* @__PURE__ */ L(a, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ L(jf, { state: e.state }), /* @__PURE__ */ R("span", { children: [
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
				children: [/* @__PURE__ */ L(D, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.reasonText })]
			}),
			e.writeScope.length === 0 ? null : /* @__PURE__ */ R("p", {
				className: "hh-room-line",
				"data-claim": !0,
				children: [/* @__PURE__ */ L(g, {
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
function ap({ view: e, kind: n, describedBy: r, onSend: i }) {
	let a = e.command;
	return /* @__PURE__ */ R("button", {
		type: "button",
		className: n === "cancel" ? "hh-button hh-button-reject" : "hh-button",
		"data-control": n,
		"aria-disabled": a === null,
		"aria-describedby": a === null && e.blockedText !== null ? r : void 0,
		onClick: () => {
			a !== null && i(a);
		},
		children: [L(n === "cancel" ? t : w, {
			size: 16,
			"aria-hidden": !0
		}), e.busy ? "Sending…" : e.label]
	});
}
function op({ run: e, onSend: t }) {
	let n = M(), r = e.cancel?.blockedText ?? e.retry?.blockedText ?? null;
	return e.cancel === null && e.retry === null && e.exhaustedText === null ? null : /* @__PURE__ */ R("div", {
		className: "hh-recovery",
		"data-recovery": e.runId,
		children: [
			e.cancel === null && e.retry === null ? null : /* @__PURE__ */ R("div", {
				className: "hh-decide",
				"aria-busy": (e.cancel?.busy ?? !1) || (e.retry?.busy ?? !1),
				children: [e.cancel === null ? null : /* @__PURE__ */ L(ap, {
					view: e.cancel,
					kind: "cancel",
					describedBy: n,
					onSend: t
				}), e.retry === null ? null : /* @__PURE__ */ L(ap, {
					view: e.retry,
					kind: "retry",
					describedBy: n,
					onSend: t
				})]
			}),
			r === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				id: n,
				children: [/* @__PURE__ */ L(g, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: r })]
			}),
			e.exhaustedText === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note",
				"data-exhausted": !0,
				children: [/* @__PURE__ */ L(g, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.exhaustedText })]
			})
		]
	});
}
function sp({ view: e, onOpen: t }) {
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
			children: [/* @__PURE__ */ L(l, {
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
function cp(e) {
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
		command: N(() => vl(e, r), [e, r]),
		clear: a
	};
}
// src/rooms/workshop/WorkshopTaskBoard.tsx
var lp = {
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
function up({ status: e }) {
	let n = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "complete": return /* @__PURE__ */ L(r, { ...n });
		case "active": return /* @__PURE__ */ L(h, {
			...n,
			className: "hh-spin"
		});
		case "queued":
		case "backpressure": return /* @__PURE__ */ L(m, { ...n });
		case "failed": return /* @__PURE__ */ L(D, { ...n });
		case "blocked": return /* @__PURE__ */ L(g, { ...n });
		case "cancelled": return /* @__PURE__ */ L(t, { ...n });
		case "not_selected":
		case "skipped": return /* @__PURE__ */ L(a, { ...n });
	}
}
function dp({ row: e, chosen: t, onToggle: n, onSend: r, onOpenSession: i }) {
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
				"data-tone": lp[e.status],
				"data-task-status": !0,
				children: [/* @__PURE__ */ L(up, { status: e.status }), /* @__PURE__ */ R("span", { children: [e.statusText, e.attemptText === null ? "" : `. ${e.attemptText}`] })]
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
				/* @__PURE__ */ L(ip, { run: e.run }),
				/* @__PURE__ */ L(op, {
					run: e.run,
					onSend: r
				}),
				/* @__PURE__ */ L(sp, {
					view: e.run.sessionLink,
					onOpen: i
				})
			] })
		]
	});
}
function fp({ board: e, onSend: t, onOpenSession: n }) {
	let r = cp(e), i = M(), a = M(), o = r.chosen.size, s = e.startBlockedText ?? (o === 0 ? "Tick at least one open task to start." : null);
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
				children: [/* @__PURE__ */ L(m, {
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
			e.waves.map((e) => /* @__PURE__ */ L(pp, {
				title: e.title,
				children: e.tasks.map((e) => /* @__PURE__ */ L(dp, {
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
					children: [/* @__PURE__ */ L(b, {
						size: 16,
						"aria-hidden": !0
					}), e.startBusy ? "Starting…" : o === 1 ? "Start 1 selected task" : `Start ${o} selected tasks`]
				})
			}),
			r.command !== null || s === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				id: a,
				children: [/* @__PURE__ */ L(g, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: s })]
			})
		]
	});
}
function pp({ title: e, children: t }) {
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
function mp({ output: e, onSend: t, onOpenSession: n }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-output",
		"data-room-output": e.room,
		children: [
			e.outputNote === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-house-note hh-house-muted",
				"data-output-note": !0,
				children: [/* @__PURE__ */ L(S, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: e.outputNote })]
			}),
			e.documents.map((e) => /* @__PURE__ */ L(rp, { view: e }, e.phase)),
			e.taskBoard === null ? null : /* @__PURE__ */ L(fp, {
				board: e.taskBoard,
				onSend: t,
				onOpenSession: n
			})
		]
	});
}
// src/rooms/house/RoomRuns.tsx
function hp({ output: e, onSend: t, onOpenSession: n }) {
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
				/* @__PURE__ */ L(ip, { run: e }),
				/* @__PURE__ */ L(op, {
					run: e,
					onSend: t
				}),
				/* @__PURE__ */ L(sp, {
					view: e.sessionLink,
					onOpen: n
				})
			] }, e.runId))
		})]
	});
}
// src/rooms/house/RoomPanel.tsx
var gp = () => {};
function _p({ detail: e, onSend: t, output: n = null, onRoomSend: r = gp, onOpenSession: i = null }) {
	let { room: a } = e;
	return /* @__PURE__ */ R("div", {
		className: "hh-room-panel",
		"data-room-body": a.id,
		children: [
			n === null ? null : /* @__PURE__ */ L(mp, {
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
						"data-tone": Ef[e.status],
						children: [/* @__PURE__ */ L(kf, { status: e.status }), /* @__PURE__ */ R("span", { children: [
							e.name,
							": ",
							e.statusText
						] })]
					}),
					/* @__PURE__ */ R("p", {
						className: "hh-room-line",
						"data-tone": Df[e.doorStatus],
						children: [/* @__PURE__ */ L(Af, { status: e.doorStatus }), /* @__PURE__ */ L("span", { children: e.doorHint })]
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
							children: [/* @__PURE__ */ L(b, {
								size: 16,
								"aria-hidden": !0
							}), i.busy ? "Starting…" : i.label]
						})
					}),
					a === null ? null : /* @__PURE__ */ L(Tf, {
						view: a,
						onSend: t
					}),
					n?.documents.map((t) => t.phase === e.phase && t.feedback !== null ? /* @__PURE__ */ L(Pf, {
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
					children: [/* @__PURE__ */ L(jf, { state: "idle" }), /* @__PURE__ */ L("span", { children: "No ghost here yet" })]
				}) : /* @__PURE__ */ L("ul", {
					className: "hh-ghost-lines",
					children: a.ghosts.map((e) => /* @__PURE__ */ R("li", {
						className: "hh-room-line",
						"data-tone": Of[e.state],
						"data-ghost": e.ghostId,
						children: [/* @__PURE__ */ L(jf, { state: e.state }), /* @__PURE__ */ R("span", { children: [
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
				}), e.risky.map((e) => /* @__PURE__ */ L(If, {
					view: e,
					onSend: t
				}, e.proposalId))]
			}),
			n === null ? null : /* @__PURE__ */ L(hp, {
				output: n,
				onSend: r,
				onOpenSession: i
			})
		]
	});
}
// src/rooms/house/room-house-panel.ts
var vp = "This room's state has not been read yet.";
// src/rooms/drafting-room/DraftingHousePanel.tsx
function yp({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(Cf, { room: e }), t === null ? /* @__PURE__ */ L("p", {
		className: "hh-ui-reason",
		children: vp
	}) : /* @__PURE__ */ L(_p, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/foyer/ActiveMansionFoyerPanel.tsx
var bp = "Escape also returns to the Foyer when no room is open.";
function xp({ room: t, mansion: n, onReturn: r }) {
	return /* @__PURE__ */ R(I, { children: [
		/* @__PURE__ */ L(Cf, { room: t }),
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
				children: bp
			})]
		})
	] });
}
// src/rooms/seance-room/LockedSeancePanel.tsx
function Sp() {
	return /* @__PURE__ */ R("p", {
		className: "hh-ui-note",
		"data-kind": "locked",
		"data-seance": "locked",
		children: [/* @__PURE__ */ L(g, {
			size: 16,
			"aria-hidden": !0
		}), /* @__PURE__ */ L("span", { children: ks })]
	});
}
// src/rooms/seance-room/SeanceRoomPanel.tsx
function Cp({ status: e }) {
	let n = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "reviewing": return /* @__PURE__ */ L(h, {
			...n,
			className: "hh-spin"
		});
		case "pass": return /* @__PURE__ */ L(i, { ...n });
		case "changes_requested": return /* @__PURE__ */ L(t, { ...n });
		case "blocked": return /* @__PURE__ */ L(g, { ...n });
	}
}
function wp({ view: e, onOpenSession: t }) {
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
					children: [/* @__PURE__ */ L(Cp, { status: e.status }), /* @__PURE__ */ R("span", { children: [
						e.statusText,
						". ",
						e.cycleText,
						"."
					] })]
				}),
				e.limitText === null ? null : /* @__PURE__ */ R("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					"data-review-limit": !0,
					children: [/* @__PURE__ */ L(g, {
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
								children: [/* @__PURE__ */ L(m, {
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
				"data-tone": e.state === null ? "plain" : Of[e.state],
				children: [/* @__PURE__ */ L(jf, { state: e.state ?? "idle" }), /* @__PURE__ */ R("span", { children: [
					e.ghostName,
					": ",
					e.stateText
				] })]
			}), /* @__PURE__ */ L(sp, {
				view: e.sessionLink,
				onOpen: t
			})]
		})]
	});
}
// src/rooms/seance-room/SeanceHousePanel.tsx
var Tp = "No review yet. The Medium reviews only when the house asks it to.";
function Ep({ room: e, review: t, onOpenSession: n }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(Cf, { room: e }), t === null ? /* @__PURE__ */ L("p", {
		className: "hh-ui-reason",
		"data-seance": "empty",
		children: Tp
	}) : /* @__PURE__ */ L(wp, {
		view: t,
		onOpenSession: n
	})] });
}
// src/rooms/study/StudyHousePanel.tsx
function Dp({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(Cf, { room: e }), t === null ? /* @__PURE__ */ L("p", {
		className: "hh-ui-reason",
		children: vp
	}) : /* @__PURE__ */ L(_p, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/workshop/WorkshopHousePanel.tsx
function Op({ room: e, detail: t, output: n, onSend: r, onRoomSend: i, onOpenSession: a }) {
	return /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(Cf, { room: e }), t === null ? /* @__PURE__ */ L("p", {
		className: "hh-ui-reason",
		children: vp
	}) : /* @__PURE__ */ L(_p, {
		detail: t,
		output: n,
		onSend: r,
		onRoomSend: i,
		onOpenSession: a
	})] });
}
// src/rooms/house/DoorSurface.tsx
function kp({ room: e, door: t, decision: n, onSend: r, onOpenRoom: i }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-door-surface",
		"data-door-surface": t.phase,
		children: [
			/* @__PURE__ */ L(Cf, { room: e }),
			/* @__PURE__ */ R("p", {
				className: "hh-ui-state",
				"data-door": t.state,
				children: [/* @__PURE__ */ L(_d, { state: t.state }), /* @__PURE__ */ R("span", { children: ["Door state: ", /* @__PURE__ */ L("span", {
					className: "hh-ui-state-word",
					children: Br(t.state)
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
			n === null ? null : /* @__PURE__ */ L(Tf, {
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
						/* @__PURE__ */ L(c, {
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
function Ap({ room: e, ghost: t, onOpenRoom: n }) {
	return /* @__PURE__ */ R("div", {
		className: "hh-ghost-surface",
		"data-ghost-surface": t.ghostId,
		children: [
			/* @__PURE__ */ R("p", {
				className: "hh-ui-state",
				"data-ghost": t.state,
				children: [/* @__PURE__ */ L(hd, {
					state: t.state,
					variant: dd(t.ghostId)
				}), /* @__PURE__ */ R("span", { children: [
					"Ghost state: ",
					/* @__PURE__ */ L("span", {
						className: "hh-ui-state-word",
						children: Br(t.state)
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
						/* @__PURE__ */ L(c, {
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
var jp = "\n.hh-room-panel h5, .hh-proposal h5, .hh-artifact h5 { font-size: 0.875rem; margin: 0; overflow-wrap: anywhere; }\n[data-surface] .hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer; min-width: 0;\n  max-width: 100%; text-align: left; color: var(--hh-text); background: var(--hh-surface-raised);\n  border: 1px solid var(--hh-border); border-radius: 6px; padding: 6px 12px; overflow-wrap: anywhere; }\n[data-surface] .hh-button-primary { color: var(--hh-primary-text); background: var(--hh-primary); }\n[data-surface] .hh-button:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }\n[data-surface] .hh-button[aria-disabled='true'] { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted);\n  background: var(--hh-surface); }\n[data-surface] .hh-button-reject { border-style: double; border-width: 3px; padding: 4px 10px; }\n[data-surface] .hh-button-reject[aria-disabled='true'] { border-style: dashed; border-width: 1px; padding: 6px 12px; }\n\n.hh-room-panel { display: grid; gap: 12px; min-width: 0; }\n.hh-room-line { display: flex; align-items: flex-start; gap: 6px; font-size: 0.875rem; overflow-wrap: anywhere; margin: 0; }\n.hh-room-line svg { flex: none; margin-top: 2px; color: var(--hh-text-muted); }\n.hh-room-line[data-tone='ok'] svg { color: var(--hh-ok); }\n.hh-room-line[data-tone='attention'] svg { color: var(--hh-accent); }\n.hh-house-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; overflow-wrap: anywhere; }\n.hh-house-note svg { flex: none; margin-top: 2px; }\n.hh-house-muted { color: var(--hh-text-muted); }\n.hh-phase { display: grid; gap: 6px; border-top: 1px solid var(--hh-border-soft); padding-top: 10px; min-width: 0; }\n.hh-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: 0.875rem; }\n.hh-facts dt { color: var(--hh-text-muted); }\n.hh-facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }\n.hh-facts code, .hh-proposal code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 0.8125rem; overflow-wrap: anywhere; }\n.hh-ghost-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }\n.hh-ghost-surface, .hh-door-surface { display: grid; gap: 10px; min-width: 0; }\n.hh-ghost-surface p, .hh-door-surface p { margin: 0; }\n.hh-shell-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; margin: 0; }\n.hh-shell-facts dt { font-weight: 600; }\n.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }\n\n.hh-proposal { border: 1px solid var(--hh-border-soft); border-left: 4px solid var(--hh-border);\n  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; min-width: 0; }\n.hh-proposal:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }\n.hh-proposal[data-state='pending'] { border-left-style: double; border-left-width: 6px; }\n.hh-proposal[data-blocked='true'] { border-style: dashed; border-left-style: dashed; }\n.hh-proposal-head { display: flex; align-items: flex-start; gap: 6px; }\n.hh-proposal-head svg { flex: none; margin-top: 2px; color: var(--hh-accent); }\n.hh-proposal-sub { font-size: 0.875rem; margin: 0; }\n.hh-proposal-group { font-size: 0.8125rem; font-weight: 600; margin: 4px 0 0; color: var(--hh-text-muted); }\n.hh-proposal-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-proposal-note svg { flex: none; margin-top: 2px; }\n.hh-proposal-blocked svg { color: var(--hh-accent); }\n.hh-proposal-outcome[data-outcome='approved'] svg { color: var(--hh-ok); }\n.hh-decide { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }\n\n@keyframes hh-house-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  [data-motion='low-frequency'] .hh-spin { animation: hh-house-spin 2s linear infinite; }\n}\n", Mp = "locked", Np = "The recording is paused at its start. Press Play to watch the house fill, or open the Attic to step through it.", Pp = "This is a recording. Nothing can be started, approved or rejected here.", Fp = jp + Vd;
function Ip({ mansion: e, onReturn: t, announcement: n = "", status: r, ghostNames: i, seanceRoom: a = Mp, panelMode: o, replayScheduler: s, now: c }) {
	let [l, u] = F(n);
	j(() => u(n), [n]);
	let d = A((e) => u(e), []), f = ws(e.name, s), p = f.mode, m = Lu({
		mansion: e,
		ghostNames: i,
		seanceRoom: a,
		mode: p,
		replay: f.upstream,
		replayed: f.house,
		onAnnounce: d
	}), { projection: h } = m, _ = yf(f, d, {
		watch: p === "replay",
		refresh: !1
	}), v = N(() => ({
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
			return e === void 0 ? null : /* @__PURE__ */ L(Ap, {
				room: a,
				ghost: e,
				onOpenRoom: r.openNested
			});
		}
		if (i.kind === "door") {
			let e = a.doors.find((e) => e.phase === i.phase);
			if (e === void 0) return null;
			let t = o?.phases.find((e) => e.line.phase === i.phase)?.door ?? null;
			return /* @__PURE__ */ L(kp, {
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
			case "foyer": return /* @__PURE__ */ L(xp, {
				room: a,
				mansion: e,
				onReturn: t
			});
			case "study": return /* @__PURE__ */ L(Dp, { ...c });
			case "drafting-room": return /* @__PURE__ */ L(yp, { ...c });
			case "workshop": return /* @__PURE__ */ L(Op, { ...c });
			case "attic": return /* @__PURE__ */ R(I, { children: [a.diagnostic === null || a.readOnly && a.integrity === "valid" ? null : /* @__PURE__ */ R("p", {
				className: "hh-ui-note",
				"data-kind": "diagnostic",
				"data-attic-diagnostic": !0,
				children: [/* @__PURE__ */ L(D, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: a.diagnostic })]
			}), /* @__PURE__ */ L(bf, {
				replay: f,
				onAnnounce: d,
				motion: r.stillHouse ? "none" : "low-frequency",
				watch: p !== "replay"
			})] });
			case "seance-room": return a.locked ? /* @__PURE__ */ L(Sp, {}) : /* @__PURE__ */ L(Ep, {
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
				children: [/* @__PURE__ */ L(S, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: "Loading the house…" })]
			}) : null,
			m.logProblem === null ? null : /* @__PURE__ */ R("p", {
				className: "hh-ui-note",
				"data-kind": "diagnostic",
				"data-log-problem": !0,
				children: [/* @__PURE__ */ L(D, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ L("span", { children: m.logProblem })]
			}),
			m.authority.text === null || m.authority.block === "loading" || p === "replay" && m.authority.block === "read_only" ? null : /* @__PURE__ */ R("p", {
				className: "hh-ui-note",
				"data-kind": m.authority.block === "read_only" ? "read-only" : "diagnostic",
				"data-block": m.authority.block,
				children: [/* @__PURE__ */ L(g, {
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
	return /* @__PURE__ */ L(Bd, {
		projection: h,
		renderSurface: y,
		host: v,
		message: l,
		status: r,
		notes: b,
		banner: p === "replay" ? /* @__PURE__ */ L(Sf, {
			panel: _,
			readOnlyText: m.authority.block === "read_only" && m.authority.text !== null ? m.authority.text : Pp,
			startText: f.state.cursor === 0 ? Np : null
		}) : void 0,
		busy: m.loading,
		onReturn: t,
		panelMode: o,
		inFlight: m.inFlight,
		panelStyles: Fp
	});
}
// src/App.tsx
var Lp = {
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
function Rp(e) {
	return e === void 0 ? "" : ` (HTTP ${e})`;
}
function zp(e) {
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
			text: `Not reachable${Rp(e.status)}`,
			detail: e.message
		};
	}
}
function Bp(e) {
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
			text: Lp[e.gateway.error].short
		};
	}
}
function Vp(e) {
	switch (e.kind) {
		case "loading": return "Checking the backend…";
		case "unreachable": return `Backend not reachable${Rp(e.status)}`;
		case "ok": return "version" in e.gateway ? `Backend reachable · Gateway ${e.gateway.version}` : `Backend reachable · ${Lp[e.gateway.error].long}`;
	}
}
function Hp({ tone: e }) {
	let t = {
		size: 18,
		"aria-hidden": !0
	};
	switch (e) {
		case "ok": return /* @__PURE__ */ L(i, {
			...t,
			className: "hh-icon hh-icon-ok"
		});
		case "problem": return /* @__PURE__ */ L(D, {
			...t,
			className: "hh-icon hh-icon-problem"
		});
		case "pending": return /* @__PURE__ */ L(h, {
			...t,
			className: "hh-icon hh-icon-pending"
		});
		case "unknown": return /* @__PURE__ */ L(a, {
			...t,
			className: "hh-icon hh-icon-unknown"
		});
	}
}
function Up({ name: e, view: t }) {
	return /* @__PURE__ */ R("li", {
		className: "hh-row",
		"data-tone": t.tone,
		children: [
			/* @__PURE__ */ L(Hp, { tone: t.tone }),
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
var Wp = `
.hh-house { ${Ct("light")}
  font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--card-fg, var(--text, var(--hh-fb-text))); line-height: 1.45;
  display: block; max-width: 76rem; margin: 0 auto; padding: 8px 12px 32px; box-sizing: border-box; }
@media (prefers-color-scheme: dark) { .hh-house { ${Ct("dark")} } }
.hh-status { color: var(--card-fg, var(--text, var(--hh-fb-text))); background: var(--card, var(--hh-fb-surface));
  border: 1px solid var(--border, var(--hh-fb-border)); border-radius: 12px; padding: 16px 20px;
  max-width: 48rem; margin: 16px auto 0; font: inherit; }
.hh-status h1 { font-family: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif; font-size: 2rem; line-height: 1.15;
  margin: 0 0 12px; letter-spacing: 0.01em; }
.hh-status[data-compact='true'] { border: 0; background: transparent; padding: 0; margin: 8px 0 10px; max-width: none; }
.hh-status[data-compact='true'] h1 { margin: 0; font-size: 1.25rem; }
.hh-status[data-quiet='true'] { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 20px;
  border: 0; background: transparent; padding: 8px 0 0; }
.hh-status[data-quiet='true'] > :not(.hh-hero-art) { grid-column: 2; }
.hh-status[data-quiet='true'] h1 { margin: 0 0 6px; }
.hh-hero-art { grid-row: 1 / span 3; width: 9rem; max-width: 30vw; height: auto; color: var(--border-strong, var(--hh-fb-border)); }
.hh-hero-glow, .hh-hero-moon { color: var(--warn, var(--hh-fb-candle)); }
.hh-hero-ghost { color: var(--hh-fb-ghost); }
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
@media (max-width: 640px) {
  .hh-status[data-quiet='true'] { grid-template-columns: minmax(0, 1fr); }
  .hh-status[data-quiet='true'] > :not(.hh-hero-art) { grid-column: 1; }
  .hh-hero-art { grid-row: auto; width: 7rem; }
  .hh-status h1 { font-size: 1.625rem; }
}
@keyframes hh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .hh-icon-pending { animation: hh-spin 2s linear infinite; }
}
`;
function Gp({ state: e }) {
	return /* @__PURE__ */ R("ul", {
		className: "hh-rows",
		"aria-label": "Status",
		children: [/* @__PURE__ */ L(Up, {
			name: "Backend",
			view: zp(e)
		}), /* @__PURE__ */ L(Up, {
			name: "Gateway",
			view: Bp(e)
		})]
	});
}
function Kp({ landing: e } = {}) {
	let { state: t, retry: n } = Qe(), r = e ?? (gt === null ? void 0 : Tt), [i, a] = F(""), [o, s] = F(null), c = t.kind === "ok", l = c && o !== null, u = A((e, n) => /* @__PURE__ */ L(Ip, {
		mansion: e,
		onReturn: n,
		announcement: i,
		status: /* @__PURE__ */ R(I, { children: [/* @__PURE__ */ L(Gp, { state: t }), /* @__PURE__ */ L("p", {
			className: "hh-summary",
			children: Vp(t)
		})] })
	}), [i, t]);
	return /* @__PURE__ */ R("main", {
		className: "hh-house",
		"aria-labelledby": "hh-status-title",
		children: [
			/* @__PURE__ */ L("style", { children: Wp }),
			/* @__PURE__ */ R("div", {
				className: "hh-status",
				"data-compact": l,
				"data-quiet": c && !l,
				children: [
					c && !l ? /* @__PURE__ */ L(_t, {}) : null,
					/* @__PURE__ */ L("h1", {
						id: "hh-status-title",
						children: "Haunted House"
					}),
					l ? null : /* @__PURE__ */ R(I, { children: [
						c ? /* @__PURE__ */ L("p", {
							className: "hh-tagline",
							children: wt
						}) : null,
						/* @__PURE__ */ L(Gp, { state: t }),
						/* @__PURE__ */ R("p", {
							className: "hh-summary",
							"aria-live": "polite",
							children: [Vp(t), c && i !== "" ? /* @__PURE__ */ R(I, { children: [" ", /* @__PURE__ */ L("span", {
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
								children: [/* @__PURE__ */ L(w, {
									size: 16,
									"aria-hidden": !0
								}), "Retry"]
							})
						}) : null
					] })
				]
			}),
			c ? /* @__PURE__ */ L(nn, {
				onAnnounce: a,
				onMansionChange: s,
				renderShell: u,
				preselect: r?.mansion,
				invitation: r?.text
			}) : null
		]
	});
}
export { Kp as default };
