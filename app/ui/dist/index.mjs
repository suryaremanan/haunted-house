import { ArrowLeft as e, Ban as t, Bell as n, Check as r, CircleCheck as i, CircleDashed as a, DoorClosed as o, DoorOpen as s, ExternalLink as c, FileText as l, Hourglass as u, LoaderCircle as d, Lock as f, Moon as p, Play as m, Plus as h, RefreshCw as g, RotateCw as _, Send as v, Square as y, TriangleAlert as b, X as x } from "lucide-react";
import { forwardRef as S, useCallback as C, useEffect as w, useId as T, useMemo as E, useRef as D, useState as O } from "react";
import * as ee from "@kirocrew/app-sdk";
import { useAppApi as k, useAppEvents as te, useNavBadge as A, useNotify as ne, useTheme as re } from "@kirocrew/app-sdk";
import { Fragment as j, jsx as M, jsxs as N } from "react/jsx-runtime";
// src/core/backend-status.ts
var ie = "/apps/haunted-house/api/whoami", ae = [
	"timeout",
	"unreachable",
	"denied",
	"config"
], oe = /* @__PURE__ */ new Set(["ok", "replay"]), se = "Backend sent an unexpected reply.", ce = "Request failed.", le = 200;
function ue(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function de(e) {
	return typeof e == "string" && ae.includes(e);
}
function fe(e) {
	return ue(e) ? typeof e.version == "string" && e.version.trim() !== "" ? { version: e.version.trim() } : de(e.error) ? { error: e.error } : null : null;
}
function pe(e) {
	if (!ue(e) || typeof e.backend != "string" || !oe.has(e.backend)) return {
		kind: "unreachable",
		message: se
	};
	let t = fe(e.gateway);
	return t === null ? {
		kind: "unreachable",
		message: se
	} : {
		kind: "ok",
		gateway: t
	};
}
function me(e) {
	if (!ue(e) && !(e instanceof Error)) return;
	let t = e.status;
	if (typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599) return t;
}
function he(e) {
	let t = e instanceof Error || ue(e) ? e.message : void 0;
	if (typeof t != "string") return ce;
	let n = t.trim();
	return n === "" ? ce : n.length > le ? `${n.slice(0, 199)}…` : n;
}
function ge(e) {
	let t = me(e), n = he(e);
	return t === void 0 ? {
		kind: "unreachable",
		message: n
	} : {
		kind: "unreachable",
		status: t,
		message: n
	};
}
var _e = "Mansion service sent an unexpected reply.", ve = "Mansion request failed.", ye = [
	"ready",
	"missing",
	"conflict"
], be = ["created", "existing_compatible"], xe = [
	"invalid_request",
	"invalid_mansion_name",
	"unsafe_mansion_root",
	"symlink_escape",
	"mansion_conflict",
	"mansion_missing",
	"mansion_not_registered",
	"metadata_unavailable",
	"filesystem_error"
], P = class extends Error {
	constructor() {
		super(_e), this.name = "MansionApiParseError";
	}
}, Se = {
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
function Ce(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function we(e, t) {
	let n = Object.keys(e);
	return n.length === t.length && n.every((e) => t.includes(e));
}
function Te(e, t) {
	return typeof e == "string" && t.includes(e);
}
function Ee(e) {
	return typeof e != "string" || e.length === 0 || e.length > 40 ? !1 : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(e)?.[0] === e;
}
function De(e, t) {
	if (typeof e != "string" || !e.startsWith("~/") || e.includes("\\")) return !1;
	let n = e.slice(2).split("/");
	return n.length > 0 && n.every((e) => e !== "" && e !== "." && e !== ".." && !/[\u0000-\u001f\u007f]/.test(e)) && n.at(-1) === t;
}
function Oe(e) {
	if (!Ce(e)) throw new P();
	let { name: t, projectSpec: n, displayPath: r, status: i } = e;
	if (!Ee(t) || !Ee(n) || n !== t || !De(r, t) || !Te(i, ye)) throw new P();
	return {
		name: t,
		projectSpec: n,
		displayPath: r,
		status: i
	};
}
function ke(e) {
	if (!Ce(e) || e.schemaVersion !== 1 || !Array.isArray(e.mansions)) throw new P();
	let t = e.mansions.map(Oe);
	if (new Set(t.map(({ name: e }) => e)).size !== t.length) throw new P();
	return {
		schemaVersion: 1,
		mansions: t
	};
}
function Ae(e) {
	if (!Ce(e) || !Te(e.outcome, be)) throw new P();
	let t = Oe(e.mansion);
	if (t.status !== "ready") throw new P();
	return {
		outcome: e.outcome,
		mansion: t
	};
}
function je(e) {
	if (!Ce(e)) throw new P();
	let t = Oe(e.mansion);
	if (t.status !== "ready") throw new P();
	return { mansion: t };
}
function Me(e, t = ve) {
	if (typeof e != "string") return t;
	let n = e.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
	return n === "" ? t : n.length > 200 ? `${n.slice(0, 199)}…` : n;
}
function Ne(e) {
	if (!Ce(e) || !we(e, ["error"]) || !Ce(e.error)) throw new P();
	let t = e.error;
	if (!we(t, ["code", "message"]) || !Te(t.code, xe) || typeof t.message != "string" || t.message.trim() === "") throw new P();
	return { error: {
		code: t.code,
		message: Se[t.code]
	} };
}
// src/adapters/sdk.ts
var Pe = "/apps/haunted-house/api/mansions", Fe = "/apps/haunted-house/api/mansions/open", Ie = class extends Error {
	code;
	status;
	constructor(e, t = {}) {
		super(e), this.name = "MansionApiRequestError", this.code = t.code, this.status = t.status;
	}
};
function Le(e) {
	return typeof e == "object" && !!e || e instanceof Error;
}
function Re(e) {
	if (!Le(e)) return;
	let t = e.status;
	return typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599 ? t : void 0;
}
function ze(e) {
	let t = Re(e);
	if (!Le(e) || typeof e.body != "string") return new Ie(ve, { status: t });
	try {
		let n = Ne(JSON.parse(e.body));
		return new Ie(n.error.message, {
			code: n.error.code,
			status: t
		});
	} catch {
		return new Ie(_e, { status: t });
	}
}
function Be(e, t) {
	return Promise.resolve().then(e).then(t, (e) => {
		throw ze(e);
	});
}
function Ve() {
	let e = k(), t = D(e);
	return t.current = e, E(() => ({
		list: () => Be(() => t.current.get(Pe), ke),
		create: (e) => Be(() => t.current.post(Pe, { name: e }), Ae),
		open: (e) => Be(() => t.current.post(Fe, { name: e }), je)
	}), []);
}
function He() {
	let e = k(), [t, n] = O(0), [r, i] = O({ kind: "loading" });
	return w(() => {
		let t = !1;
		return i({ kind: "loading" }), Promise.resolve().then(() => e.get(ie)).then((e) => {
			t || i(pe(e));
		}, (e) => {
			t || i(ge(e));
		}), () => {
			t = !0;
		};
	}, [t]), {
		state: r,
		retry: C(() => n((e) => e + 1), [])
	};
}
function Ue() {
	try {
		let e = ee.useChatLauncher;
		return typeof e == "function" ? e : void 0;
	} catch {
		return;
	}
}
var We = Ue();
function Ge() {
	let e = We?.(), t = D(e);
	t.current = e;
	let n = C((e) => {
		e !== "" && t.current?.openChat?.({ slotKey: e });
	}, []);
	return typeof e?.openChat == "function" ? n : null;
}
// src/rooms/foyer/CreateMansionForm.tsx
var Ke = "Lowercase letters, numbers, and single hyphens, up to 40 characters. For example: weather-station.", qe = "Enter a name for the mansion.", Je = "Use 1–40 lowercase letters, numbers, and single hyphens.";
function Ye({ ready: e, mutation: t, onCreate: n }) {
	let r = T(), i = T(), a = T(), o = T(), s = D(null), [c, l] = O(""), [u, f] = O(null), p = t.kind === "creating" || t.kind === "opening", m = t.kind === "creating" ? t.name : null, g = t.kind === "error" && t.operation === "create" ? `Could not create ${t.name}. ${t.message}` : null, _ = u ?? g, v = !e || p;
	return /* @__PURE__ */ N("form", {
		className: "hh-create",
		noValidate: !0,
		onSubmit: async (e) => {
			e.preventDefault(), v || (Ee(c) ? (f(null), await n(c) ? l("") : s.current?.focus()) : (f(c === "" ? qe : Je), s.current?.focus()));
		},
		children: [
			/* @__PURE__ */ N("div", {
				className: "hh-field",
				children: [
					/* @__PURE__ */ M("label", {
						htmlFor: r,
						children: "New mansion name"
					}),
					/* @__PURE__ */ M("input", {
						id: r,
						ref: s,
						type: "text",
						name: "mansion-name",
						value: c,
						maxLength: 40,
						pattern: "[a-z0-9]+(-[a-z0-9]+)*",
						required: !0,
						autoComplete: "off",
						autoCapitalize: "none",
						spellCheck: !1,
						readOnly: m !== null,
						"aria-invalid": _ !== null,
						"aria-describedby": `${i} ${a}`,
						onChange: (e) => {
							l(e.target.value), f(null);
						}
					}),
					/* @__PURE__ */ M("span", {
						id: i,
						className: "hh-foyer-hint",
						children: Ke
					})
				]
			}),
			_ === null ? null : /* @__PURE__ */ N("p", {
				id: a,
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ M(b, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: _ })]
			}),
			/* @__PURE__ */ N("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ N("button", {
					type: "submit",
					className: "hh-button",
					"aria-disabled": v,
					"aria-describedby": o,
					children: [/* @__PURE__ */ M(h, {
						size: 16,
						"aria-hidden": !0
					}), "Create mansion"]
				}), /* @__PURE__ */ M("span", {
					id: o,
					className: "hh-foyer-inline",
					children: m === null ? null : /* @__PURE__ */ N(j, { children: [
						/* @__PURE__ */ M(d, {
							size: 16,
							"aria-hidden": !0,
							className: "hh-foyer-spin"
						}),
						"Creating ",
						m,
						"…"
					] })
				})]
			})
		]
	});
}
// src/rooms/foyer/foyer-styles.ts
var Xe = "\n.hh-foyer { color: var(--card-fg, var(--text, inherit)); font: inherit; max-width: 560px; margin: 24px; }\n.hh-foyer-hall, .hh-shell { background: var(--card, transparent); border: 1px solid var(--border, currentColor);\n  border-radius: 8px; padding: 16px 20px; }\n.hh-foyer h2 { font-size: 1.125rem; margin: 0 0 4px; }\n.hh-foyer h3 { font-size: 1rem; margin: 0 0 4px; }\n.hh-foyer h2:focus-visible, .hh-foyer-region:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-foyer-lede { margin: 0 0 16px; color: var(--muted, inherit); }\n.hh-foyer-region { margin: 0 0 20px; }\n.hh-foyer-inline { display: inline-flex; align-items: center; gap: 6px; margin: 0; }\n.hh-foyer-hint { display: block; margin: 4px 0 0; color: var(--muted, inherit); font-size: 0.875rem; }\n.hh-foyer-error { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; overflow-wrap: anywhere; }\n.hh-foyer-error svg { color: var(--warn, currentColor); flex: none; margin-top: 2px; }\n.hh-foyer-empty { border: 1px dashed var(--border, currentColor); border-radius: 8px; padding: 12px 16px; }\n.hh-foyer-empty p { margin: 0; color: var(--muted, inherit); }\n\n.hh-mansions { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 8px; }\n.hh-mansions legend { padding: 0; margin: 0 0 8px; font-weight: 600; }\n.hh-mansion { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 2px; align-items: center;\n  border: 1px solid var(--border, currentColor); border-radius: 8px; padding: 10px 12px; cursor: pointer; }\n.hh-mansion[data-selected='true'] { border-color: var(--border-strong, currentColor); border-width: 2px; padding: 9px 11px; }\n.hh-mansion[data-status='missing'], .hh-mansion[data-status='conflict'] { cursor: not-allowed; border-style: dashed; }\n.hh-mansion:focus-within { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-mansion input { margin: 0; width: 1rem; height: 1rem; accent-color: var(--accent, auto); }\n.hh-mansion-name { font-weight: 600; overflow-wrap: anywhere; }\n.hh-mansion-path, .hh-mansion-status { grid-column: 2; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-mansion-path { color: var(--muted, inherit); }\n.hh-mansion-status { display: inline-flex; align-items: center; gap: 6px; }\n.hh-status-ready svg { color: var(--ok, currentColor); }\n.hh-status-missing svg { color: var(--muted, currentColor); }\n.hh-status-conflict svg { color: var(--warn, currentColor); }\n\n.hh-foyer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 12px; }\n.hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;\n  color: inherit; background: transparent; border: 1px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 6px 12px; }\n.hh-button-primary { color: var(--accent-fg, inherit); background: var(--accent, transparent); }\n.hh-button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }\n.hh-button:focus-visible, .hh-field input:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n\n.hh-create { margin: 0; }\n.hh-field { display: grid; gap: 4px; }\n.hh-field label { font-weight: 600; }\n.hh-field input { font: inherit; color: inherit; background: var(--input, transparent);\n  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 10px; max-width: 24rem; }\n.hh-field input[aria-invalid='true'] { border-width: 2px; }\n\n.hh-shell-eyebrow { margin: 0; color: var(--muted, inherit); font-size: 0.875rem; }\n.hh-shell-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 12px 0; }\n.hh-shell-facts dt { font-weight: 600; }\n.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; }\n.hh-shell-rooms { margin: 12px 0; color: var(--muted, inherit); }\n\n.hh-foyer-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }\n\n@keyframes hh-foyer-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-foyer[data-motion='low-frequency'] .hh-foyer-spin { animation: hh-foyer-spin 2s linear infinite; }\n}\n", Ze = {
	ready: "Ready to open",
	missing: "Missing: its folder is no longer in storage, so it cannot be opened.",
	conflict: "Conflict: its folder no longer looks like a mansion, so it cannot be opened."
};
function Qe({ status: e }) {
	let t = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "ready": return /* @__PURE__ */ M(i, { ...t });
		case "missing": return /* @__PURE__ */ M(a, { ...t });
		case "conflict": return /* @__PURE__ */ M(b, { ...t });
	}
}
function $e({ mansion: e, group: t, selected: n, onSelect: r }) {
	return /* @__PURE__ */ N("label", {
		className: "hh-mansion",
		"data-status": e.status,
		"data-selected": n,
		children: [
			/* @__PURE__ */ M("input", {
				type: "radio",
				name: t,
				value: e.name,
				checked: n,
				disabled: e.status !== "ready",
				onChange: () => r(e.name)
			}),
			/* @__PURE__ */ M("span", {
				className: "hh-mansion-name",
				children: e.name
			}),
			/* @__PURE__ */ M("span", {
				className: "hh-mansion-path",
				children: e.displayPath
			}),
			/* @__PURE__ */ N("span", {
				className: `hh-mansion-status hh-status-${e.status}`,
				children: [/* @__PURE__ */ M(Qe, { status: e.status }), Ze[e.status]]
			})
		]
	});
}
function et({ load: e, selectedName: t, mutation: n, onSelect: r, onOpen: i, onRetry: a }) {
	let o = T(), c = T(), l = T(), u = T(), f = D(null), p = n.kind === "creating" || n.kind === "opening", m = n.kind === "error" && n.operation === "open" ? n : null, h = e.kind === "ready" && t !== null && !p, g = e.kind === "loading" || e.kind === "ready" && e.mansions.length > 0;
	return /* @__PURE__ */ N("div", {
		className: "hh-foyer-region",
		ref: f,
		tabIndex: -1,
		children: [
			e.kind === "loading" ? /* @__PURE__ */ N("p", {
				className: "hh-foyer-inline",
				children: [/* @__PURE__ */ M(d, {
					size: 16,
					"aria-hidden": !0,
					className: "hh-foyer-spin"
				}), "Loading mansions…"]
			}) : null,
			e.kind === "error" ? /* @__PURE__ */ N(j, { children: [/* @__PURE__ */ N("p", {
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ M(b, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ N("span", { children: ["Could not load the mansion list. ", e.message] })]
			}), /* @__PURE__ */ M("div", {
				className: "hh-foyer-actions",
				children: /* @__PURE__ */ N("button", {
					type: "button",
					className: "hh-button",
					onClick: () => {
						f.current?.focus(), a();
					},
					children: [/* @__PURE__ */ M(_, {
						size: 16,
						"aria-hidden": !0
					}), "Retry"]
				})
			})] }) : null,
			e.kind === "ready" && e.mansions.length === 0 ? /* @__PURE__ */ N("div", {
				className: "hh-foyer-empty",
				children: [/* @__PURE__ */ M("h3", { children: "No mansions yet" }), /* @__PURE__ */ M("p", { children: "The house is quiet. Name your first mansion below to create it." })]
			}) : null,
			e.kind === "ready" && e.mansions.length > 0 ? /* @__PURE__ */ N("fieldset", {
				className: "hh-mansions",
				role: "radiogroup",
				"aria-labelledby": c,
				onKeyDown: (e) => {
					let t = e.target;
					e.key === "Enter" && t instanceof HTMLInputElement && t.type === "radio" && (e.preventDefault(), !t.disabled && !p && i(t.value, t));
				},
				children: [/* @__PURE__ */ M("legend", {
					id: c,
					children: "Mansions"
				}), e.mansions.map((e) => /* @__PURE__ */ M($e, {
					mansion: e,
					group: o,
					selected: e.name === t,
					onSelect: r
				}, e.name))]
			}) : null,
			g ? /* @__PURE__ */ N("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ N("button", {
					type: "button",
					className: "hh-button hh-button-primary",
					"aria-disabled": !h,
					"aria-describedby": `${l} ${u}`,
					onClick: (e) => {
						h && t !== null && i(t, e.currentTarget);
					},
					children: [/* @__PURE__ */ M(s, {
						size: 16,
						"aria-hidden": !0
					}), t === null ? "Open mansion" : `Open ${t}`]
				}), /* @__PURE__ */ M("span", {
					id: l,
					className: "hh-foyer-inline",
					children: n.kind === "opening" ? /* @__PURE__ */ N(j, { children: [
						/* @__PURE__ */ M(d, {
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
			m ? /* @__PURE__ */ N("p", {
				id: u,
				className: "hh-foyer-error",
				children: [/* @__PURE__ */ M(b, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ N("span", { children: [
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
function tt({ mansion: t, onReturn: n, children: r }) {
	let i = T(), a = D(null), o = D(n);
	return o.current = n, w(() => {
		a.current?.focus();
	}, []), w(() => {
		let e = (e) => {
			e.key !== "Escape" || e.defaultPrevented || (e.preventDefault(), o.current());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, []), /* @__PURE__ */ N("section", {
		className: "hh-shell",
		"aria-labelledby": i,
		children: [
			/* @__PURE__ */ M("p", {
				className: "hh-shell-eyebrow",
				children: "Mansion"
			}),
			/* @__PURE__ */ M("h2", {
				id: i,
				ref: a,
				tabIndex: -1,
				children: t.name
			}),
			/* @__PURE__ */ N("div", {
				className: "hh-foyer-actions",
				children: [/* @__PURE__ */ N("button", {
					type: "button",
					className: "hh-button",
					onClick: n,
					children: [/* @__PURE__ */ M(e, {
						size: 16,
						"aria-hidden": !0
					}), "Return to Foyer"]
				}), /* @__PURE__ */ M("span", {
					className: "hh-foyer-hint",
					children: "Escape also returns to the Foyer."
				})]
			}),
			/* @__PURE__ */ N("dl", {
				className: "hh-shell-facts",
				children: [
					/* @__PURE__ */ M("dt", { children: "Project spec" }),
					/* @__PURE__ */ M("dd", { children: t.projectSpec }),
					/* @__PURE__ */ M("dt", { children: "Folder" }),
					/* @__PURE__ */ M("dd", { children: t.displayPath })
				]
			}),
			r ?? /* @__PURE__ */ M("p", {
				className: "hh-shell-rooms",
				children: "The rooms are still dark. Ghosts move in with a later chapter."
			})
		]
	});
}
// src/core/foyer-reducer.ts
function nt() {
	return {
		load: { kind: "loading" },
		mutation: { kind: "idle" },
		selectedName: null,
		view: { kind: "foyer" }
	};
}
function rt(e, t) {
	return e.name < t.name ? -1 : +(e.name > t.name);
}
function it(e, t) {
	return [...e.filter(({ name: e }) => e !== t.name), t].sort(rt);
}
function at(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.name, n);
	return [...t.values()].sort(rt);
}
function ot(e, t) {
	return e === null ? null : t.some(({ name: t, status: n }) => t === e && n === "ready") ? e : null;
}
function st(e) {
	return e.load.kind === "ready" ? e.load.mansions : null;
}
function ct(e) {
	return e.kind === "creating" || e.kind === "opening";
}
function lt(e, t, n) {
	return e.kind === t && e.name === n;
}
function ut(e, t) {
	switch (t.type) {
		case "load_started": return nt();
		case "load_succeeded": {
			let n = at(t.mansions);
			return {
				load: {
					kind: "ready",
					mansions: n
				},
				mutation: { kind: "idle" },
				selectedName: ot(e.selectedName, n),
				view: { kind: "foyer" }
			};
		}
		case "load_failed": return {
			load: {
				kind: "error",
				message: Me(t.message)
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
			let n = ot(t.name, e.load.mansions);
			return n === null || n === e.selectedName ? e : {
				...e,
				selectedName: n
			};
		}
		case "create_started": return e.view.kind !== "foyer" || e.load.kind !== "ready" || ct(e.mutation) ? e : {
			...e,
			mutation: {
				kind: "creating",
				name: t.name
			}
		};
		case "create_succeeded": {
			if (!lt(e.mutation, "creating", t.mansion.name)) return e;
			let n = st(e);
			if (n === null || t.mansion.status !== "ready") return e;
			let r = it(n, t.mansion);
			return {
				...e,
				load: {
					kind: "ready",
					mansions: r
				},
				mutation: { kind: "idle" },
				selectedName: ot(e.selectedName, r)
			};
		}
		case "create_failed": return lt(e.mutation, "creating", t.name) ? {
			...e,
			mutation: {
				kind: "error",
				operation: "create",
				name: t.name,
				message: Me(t.message)
			}
		} : e;
		case "open_started": return e.view.kind !== "foyer" || e.load.kind !== "ready" || ct(e.mutation) || e.selectedName !== t.name || !e.load.mansions.some(({ name: e, status: n }) => e === t.name && n === "ready") ? e : {
			...e,
			mutation: {
				kind: "opening",
				name: t.name
			}
		};
		case "open_succeeded": {
			if (!lt(e.mutation, "opening", t.mansion.name) || t.mansion.status !== "ready") return e;
			let n = st(e);
			return n === null ? e : {
				load: {
					kind: "ready",
					mansions: it(n, t.mansion)
				},
				mutation: { kind: "idle" },
				selectedName: t.mansion.name,
				view: {
					kind: "mansion",
					mansion: t.mansion
				}
			};
		}
		case "open_failed": return lt(e.mutation, "opening", t.name) ? {
			...e,
			mutation: {
				kind: "error",
				operation: "open",
				name: t.name,
				message: Me(t.message)
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
var dt = {
	created: (e) => `Mansion ${e} created.`,
	existing_compatible: (e) => `Mansion ${e} already exists. Nothing was changed.`
};
function ft(e) {
	return e instanceof Ie || e instanceof P ? e.message : ve;
}
function pt({ onAnnounce: e } = {}) {
	let t = Ve(), n = D(t);
	n.current = t;
	let r = D(e);
	r.current = e;
	let [i, a] = O(nt), o = D(i), s = D(!1), [c, l] = O(0), u = C((e) => {
		let t = ut(o.current, e);
		return t !== o.current && (o.current = t, s.current && a(t)), t;
	}, []);
	w(() => (s.current = !0, () => {
		s.current = !1;
	}), []), w(() => {
		let e = !1;
		return u({ type: "load_started" }), n.current.list().then(({ mansions: t }) => {
			e || u({
				type: "load_succeeded",
				mansions: t
			});
		}, (t) => {
			e || u({
				type: "load_failed",
				message: ft(t)
			});
		}), () => {
			e = !0;
		};
	}, [c, u]);
	let d = C(() => l((e) => e + 1), []), f = C((e) => {
		u({
			type: "mansion_selected",
			name: e
		});
	}, [u]), p = C(async (e) => {
		let t = o.current;
		if (u({
			type: "create_started",
			name: e
		}) === t) return !1;
		try {
			let { outcome: t, mansion: i } = await n.current.create(e);
			if (i.name !== e) throw new P();
			return u({
				type: "create_succeeded",
				mansion: i
			}), r.current?.(dt[t](e)), !0;
		} catch (t) {
			return u({
				type: "create_failed",
				name: e,
				message: ft(t)
			}), !1;
		}
	}, [u]), m = C((e) => {
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
				message: _e
			});
		}, (t) => {
			u({
				type: "open_failed",
				name: e,
				message: ft(t)
			});
		});
	}, [u]), h = C(() => {
		u({ type: "returned_to_foyer" });
	}, [u]);
	return E(() => ({
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
function mt({ onAnnounce: e, stillHouse: t = !1, renderMansion: n }) {
	let r = re(), i = T(), [a, o] = O(""), { state: s, retryLoad: c, select: l, create: u, open: d, returnToFoyer: f } = pt({ onAnnounce: e ?? o }), p = s.view.kind === "mansion", m = D(null), h = D(null), g = D(!1), _ = C((e, t) => {
		m.current = t, d(e);
	}, [d]);
	return w(() => {
		g.current && !p && (m.current?.isConnected ? m.current : h.current)?.focus(), g.current = p;
	}, [p]), /* @__PURE__ */ N("div", {
		className: "hh-foyer",
		"data-theme-mode": r.mode,
		"data-motion": t ? "none" : "low-frequency",
		style: { colorScheme: r.mode },
		children: [
			/* @__PURE__ */ M("style", { children: Xe }),
			/* @__PURE__ */ N("section", {
				className: "hh-foyer-hall",
				"aria-labelledby": i,
				hidden: p,
				children: [
					/* @__PURE__ */ M("h2", {
						id: i,
						ref: h,
						tabIndex: -1,
						children: "Foyer"
					}),
					/* @__PURE__ */ M("p", {
						className: "hh-foyer-lede",
						children: "Each mansion is one software project. Choose one to enter, or create a new one."
					}),
					/* @__PURE__ */ M(et, {
						load: s.load,
						selectedName: s.selectedName,
						mutation: s.mutation,
						onSelect: l,
						onOpen: _,
						onRetry: c
					}),
					/* @__PURE__ */ M(Ye, {
						ready: s.load.kind === "ready",
						mutation: s.mutation,
						onCreate: u
					})
				]
			}),
			s.view.kind === "mansion" ? /* @__PURE__ */ M(tt, {
				mansion: s.view.mansion,
				onReturn: f,
				children: n?.(s.view.mansion)
			}) : null,
			e ? null : /* @__PURE__ */ M("p", {
				className: "hh-foyer-announcer",
				"aria-live": "polite",
				children: a
			})
		]
	});
}
// src/components/room-output-styles.ts
var ht = "\n.hh-output { display: grid; gap: 10px; }\n.hh-artifact { border: 1px solid var(--border, currentColor); border-top: 3px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-artifact[data-validation='invalid'] { border-top-style: double; border-top-width: 5px; }\n.hh-artifact[data-validation='unwritten'] { border-style: dashed; }\n.hh-artifact-head { display: flex; align-items: flex-start; gap: 6px; }\n.hh-artifact-head svg { flex: none; margin-top: 2px; color: var(--hh-candle); }\n.hh-artifact-note { margin: 0; font-size: 0.875rem; color: var(--muted, inherit); }\n.hh-document { max-height: 24rem; overflow: auto; border: 1px solid var(--border, currentColor); border-radius: 4px;\n  padding: 8px 12px; background: var(--input, transparent); font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-document:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-document > :first-child { margin-top: 0; }\n.hh-document > :last-child { margin-bottom: 0; }\n.hh-md-heading { font-weight: 600; margin: 12px 0 4px; }\n.hh-md-heading[data-level='1'] { font-size: 1.0625rem; }\n.hh-md-heading[data-level='2'] { font-size: 1rem; }\n.hh-document p { margin: 6px 0; }\n.hh-md-quote { border-left: 3px solid var(--border-strong, currentColor); padding-left: 8px; }\n.hh-md-list { list-style: none; margin: 6px 0; padding: 0; display: grid; gap: 2px; }\n.hh-md-item { display: flex; align-items: flex-start; gap: 6px; }\n.hh-md-item svg { flex: none; margin-top: 3px; }\n.hh-md-marker { flex: none; min-width: 0.75rem; color: var(--muted, inherit); }\n.hh-document pre { margin: 6px 0; padding: 6px 8px; overflow: auto; border: 1px solid var(--border, currentColor);\n  border-radius: 4px; }\n.hh-document code, .hh-document pre, .hh-task code, .hh-run code, .hh-findings code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 0.8125rem; }\n.hh-document hr { border: 0; border-top: 1px solid var(--border, currentColor); margin: 8px 0; }\n.hh-findings { margin: 0; padding: 0 0 0 1.25rem; font-size: 0.875rem; display: grid; gap: 2px; }\n.hh-finding-code { color: var(--muted, inherit); }\n.hh-scope { list-style: none; margin: 0; padding: 0; }\n\n.hh-run { display: grid; gap: 4px; }\n.hh-run-summary { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-runs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }\n.hh-runs > li { display: grid; gap: 6px; }\n.hh-session-link { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-size: 0.875rem; }\n.hh-button-quiet { border-style: dotted; padding: 3px 10px; font-size: 0.875rem; }\n.hh-session-link-note { color: var(--muted, inherit); }\n\n.hh-board { border: 1px solid var(--border, currentColor); border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-wave { display: grid; gap: 6px; }\n.hh-tasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }\n.hh-task { border: 1px solid var(--border, currentColor); border-left: 4px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 8px 10px; display: grid; gap: 4px; }\n.hh-task[data-status='active'] { border-left-style: double; border-left-width: 6px; }\n.hh-task[data-status='not_selected'], .hh-task[data-status='skipped'] { border-left-style: dotted; }\n.hh-task[data-status='failed'], .hh-task[data-status='blocked'], .hh-task[data-status='cancelled'] { border-left-style: dashed; }\n.hh-task-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 0.875rem; }\n.hh-task-head input { margin: 0; width: 1rem; height: 1rem; align-self: center; accent-color: var(--accent, auto); }\n.hh-task-head input:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-task-id { font-weight: 600; }\n.hh-tag { border: 1px solid var(--border-strong, currentColor); border-radius: 999px; padding: 0 8px; font-size: 0.75rem; }\n.hh-task-detail { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n\n.hh-revision { display: grid; gap: 6px; }\n.hh-revision label { font-weight: 600; font-size: 0.875rem; }\n.hh-revision textarea { font: inherit; color: inherit; background: var(--input, transparent);\n  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 10px; min-height: 5rem;\n  resize: vertical; width: 100%; box-sizing: border-box; }\n.hh-revision textarea:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-revision textarea[aria-invalid='true'] { border-width: 2px; }\n\n.hh-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }\n";
function gt({ view: e, onOpen: t }) {
	let n = T(), r = e.slotKey, i = r === null || t === null, a = e.disabledText ?? (t === null ? "This version of Crew offers no way to open the session from here. Find it in Crew by its name." : null);
	return /* @__PURE__ */ N("p", {
		className: "hh-session-link",
		"data-session-link": i ? "off" : "on",
		children: [/* @__PURE__ */ N("button", {
			type: "button",
			className: "hh-button hh-button-quiet",
			"aria-disabled": i,
			"aria-describedby": i && a !== null ? n : void 0,
			"data-slot": r ?? void 0,
			onClick: () => {
				r !== null && t !== null && t(r);
			},
			children: [/* @__PURE__ */ M(c, {
				size: 14,
				"aria-hidden": !0
			}), e.label]
		}), i && a !== null ? /* @__PURE__ */ M("span", {
			id: n,
			className: "hh-session-link-note",
			children: a
		}) : null]
	});
}
// src/rooms/house/house-icons.tsx
var F = {
	size: 16,
	"aria-hidden": !0
}, _t = {
	not_started: "plain",
	ready: "plain",
	starting: "plain",
	working: "plain",
	waiting: "attention",
	revision_required: "attention",
	approved: "ok",
	failed: "attention",
	done: "ok"
}, vt = {
	sealed: "plain",
	waiting: "attention",
	open: "ok",
	rejected: "attention"
}, yt = {
	idle: "plain",
	working: "plain",
	waiting: "attention",
	blocked: "attention",
	failed: "attention",
	done: "ok"
};
function bt({ status: e }) {
	switch (e) {
		case "not_started": return /* @__PURE__ */ M(a, { ...F });
		case "ready": return /* @__PURE__ */ M(m, { ...F });
		case "starting":
		case "working": return /* @__PURE__ */ M(d, {
			...F,
			className: "hh-spin"
		});
		case "waiting": return /* @__PURE__ */ M(u, { ...F });
		case "revision_required": return /* @__PURE__ */ M(t, { ...F });
		case "failed": return /* @__PURE__ */ M(b, { ...F });
		case "approved":
		case "done": return /* @__PURE__ */ M(i, { ...F });
	}
}
function xt({ status: e }) {
	switch (e) {
		case "sealed": return /* @__PURE__ */ M(f, { ...F });
		case "waiting": return /* @__PURE__ */ M(o, { ...F });
		case "open": return /* @__PURE__ */ M(s, { ...F });
		case "rejected": return /* @__PURE__ */ M(t, { ...F });
	}
}
function St({ state: e }) {
	switch (e) {
		case "idle": return /* @__PURE__ */ M(p, { ...F });
		case "working": return /* @__PURE__ */ M(d, {
			...F,
			className: "hh-spin"
		});
		case "waiting": return /* @__PURE__ */ M(u, { ...F });
		case "blocked": return /* @__PURE__ */ M(f, { ...F });
		case "failed": return /* @__PURE__ */ M(b, { ...F });
		case "done": return /* @__PURE__ */ M(i, { ...F });
	}
}
function Ct({ status: e }) {
	switch (e) {
		case "pending": return /* @__PURE__ */ M(u, { ...F });
		case "approved":
		case "succeeded": return /* @__PURE__ */ M(i, { ...F });
		case "consumed": return /* @__PURE__ */ M(d, {
			...F,
			className: "hh-spin"
		});
		case "rejected":
		case "superseded": return /* @__PURE__ */ M(t, { ...F });
		case "failed": return /* @__PURE__ */ M(b, { ...F });
	}
}
// src/rooms/seance-room/SeanceRoomPanel.tsx
function wt({ status: e }) {
	let n = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "reviewing": return /* @__PURE__ */ M(d, {
			...n,
			className: "hh-spin"
		});
		case "pass": return /* @__PURE__ */ M(i, { ...n });
		case "changes_requested": return /* @__PURE__ */ M(t, { ...n });
		case "blocked": return /* @__PURE__ */ M(f, { ...n });
	}
}
function Tt({ view: e, onOpenSession: t }) {
	let n = T();
	return /* @__PURE__ */ N("section", {
		className: "hh-room-panel",
		"aria-labelledby": n,
		"data-room-panel": "seance-room",
		"data-review": e.status,
		children: [
			/* @__PURE__ */ M("h4", {
				id: n,
				children: "Séance Room"
			}),
			/* @__PURE__ */ N("div", {
				className: "hh-output",
				children: [
					/* @__PURE__ */ N("p", {
						className: "hh-room-line",
						"data-tone": e.status === "pass" ? "ok" : e.status === "reviewing" ? "plain" : "attention",
						"data-verdict": !0,
						children: [/* @__PURE__ */ M(wt, { status: e.status }), /* @__PURE__ */ N("span", { children: [
							e.statusText,
							". ",
							e.cycleText,
							"."
						] })]
					}),
					e.limitText === null ? null : /* @__PURE__ */ N("p", {
						className: "hh-proposal-note hh-proposal-blocked",
						"data-review-limit": !0,
						children: [/* @__PURE__ */ M(f, {
							size: 16,
							"aria-hidden": !0
						}), /* @__PURE__ */ M("span", { children: e.limitText })]
					}),
					e.findings.length === 0 ? null : /* @__PURE__ */ M("ul", {
						className: "hh-tasks",
						"aria-label": "Review findings",
						children: e.findings.map((e) => /* @__PURE__ */ N("li", {
							className: "hh-task",
							"data-finding": e.findingId,
							children: [
								/* @__PURE__ */ M("p", {
									className: "hh-run-summary",
									children: e.summary
								}),
								/* @__PURE__ */ N("dl", {
									className: "hh-facts",
									children: [
										/* @__PURE__ */ M("dt", { children: "Requirements" }),
										/* @__PURE__ */ M("dd", { children: e.requirementsText }),
										/* @__PURE__ */ M("dt", { children: "Files" }),
										/* @__PURE__ */ M("dd", { children: e.paths.length === 0 ? "None" : e.paths.map((e, t) => /* @__PURE__ */ N("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ M("code", { children: e })] }, e)) })
									]
								}),
								e.repair === null ? null : /* @__PURE__ */ N("p", {
									className: "hh-room-line",
									"data-repair": e.repair.status,
									children: [/* @__PURE__ */ M(u, {
										size: 16,
										"aria-hidden": !0
									}), /* @__PURE__ */ N("span", { children: [
										"Repair task ",
										e.repair.taskId,
										": ",
										e.repair.title,
										". ",
										e.repair.statusText,
										". May write:",
										" ",
										e.repair.writes.map((e, t) => /* @__PURE__ */ N("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ M("code", { children: e })] }, e))
									] })]
								})
							]
						}, e.findingId))
					})
				]
			}),
			/* @__PURE__ */ N("div", {
				className: "hh-phase",
				children: [/* @__PURE__ */ N("p", {
					className: "hh-room-line",
					"data-tone": e.state === null ? "plain" : yt[e.state],
					children: [/* @__PURE__ */ M(St, { state: e.state ?? "idle" }), /* @__PURE__ */ N("span", { children: [
						e.ghostName,
						": ",
						e.stateText
					] })]
				}), /* @__PURE__ */ M(gt, {
					view: e.sessionLink,
					onOpen: t
				})]
			})
		]
	});
}
// src/rooms/house/house-styles.ts
var Et = "\n.hh-house-map { --hh-candle: var(--warn, currentColor); margin: 16px 0 0; }\n.hh-house-map h3 { font-size: 1rem; margin: 0 0 4px; }\n.hh-house-map h4 { font-size: 0.9375rem; margin: 0; }\n.hh-house-map h5 { font-size: 0.875rem; margin: 0; }\n.hh-house-map h3:focus-visible, .hh-house-map h4:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-house-lede { margin: 0 0 12px; color: var(--muted, inherit); font-size: 0.875rem; }\n.hh-house-note { display: flex; align-items: flex-start; gap: 6px; margin: 0 0 12px; overflow-wrap: anywhere; }\n.hh-house-note svg { flex: none; margin-top: 2px; }\n.hh-house-blocked { border: 1px dashed var(--border-strong, currentColor); border-radius: 6px; padding: 8px 10px; }\n.hh-house-blocked svg, .hh-house-problem svg { color: var(--hh-candle); }\n.hh-house-muted { color: var(--muted, inherit); }\n\n.hh-needs { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer; color: inherit;\n  background: transparent; border: 1px solid var(--border-strong, currentColor); border-radius: 999px;\n  padding: 4px 12px; margin: 0 0 8px; }\n.hh-needs[data-count='0'] { border-style: dashed; cursor: default; color: var(--muted, inherit); }\n.hh-needs:not([data-count='0']) { border-width: 2px; padding: 3px 11px; font-weight: 600; }\n.hh-needs:not([data-count='0']) svg { color: var(--hh-candle); }\n.hh-needs:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-needs-list { margin: 0 0 12px; padding: 0 0 0 1.25rem; font-size: 0.875rem; }\n\n.hh-map { margin: 0 0 12px; }\n.hh-map-rooms { list-style: none; margin: 0; padding: 0; display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }\n.hh-room { display: grid; gap: 6px; width: 100%; height: 100%; text-align: left; font: inherit; color: inherit;\n  cursor: pointer; background: var(--card, transparent); border: 1px solid var(--border, currentColor);\n  border-top: 3px solid var(--border-strong, currentColor); border-radius: 10px 10px 4px 4px; padding: 10px 12px;\n  align-content: start; }\n.hh-room[aria-expanded='true'] { border-color: var(--border-strong, currentColor); border-width: 2px;\n  border-top-width: 3px; padding: 10px 11px 9px; }\n.hh-room[data-needs='true'] { border-top-style: double; border-top-width: 5px; padding-top: 8px; }\n.hh-room:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n.hh-room-name { font-weight: 600; }\n.hh-room-line { display: flex; align-items: flex-start; gap: 6px; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-room-line svg { flex: none; margin-top: 2px; color: var(--muted, currentColor); }\n.hh-room-line[data-tone='ok'] svg { color: var(--ok, currentColor); }\n.hh-room-line[data-tone='attention'] svg { color: var(--hh-candle); }\n.hh-room-needs { font-weight: 600; }\n\n.hh-room-panel { border: 1px solid var(--border-strong, currentColor); border-radius: 8px; padding: 12px 14px;\n  display: grid; gap: 12px; }\n.hh-room-panel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }\n.hh-phase { display: grid; gap: 6px; border-top: 1px solid var(--border, currentColor); padding-top: 10px; }\n.hh-facts { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 0; font-size: 0.875rem; }\n.hh-facts dt { color: var(--muted, inherit); }\n.hh-facts dd { margin: 0; overflow-wrap: anywhere; }\n.hh-facts code, .hh-proposal code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 0.8125rem; overflow-wrap: anywhere; }\n.hh-ghost-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }\n\n.hh-proposal { border: 1px solid var(--border, currentColor); border-left: 4px solid var(--border-strong, currentColor);\n  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }\n.hh-proposal[data-state='pending'] { border-left-style: double; border-left-width: 6px; }\n.hh-proposal[data-blocked='true'] { border-style: dashed; border-left-style: dashed; }\n.hh-proposal-head { display: flex; align-items: flex-start; gap: 6px; }\n.hh-proposal-head svg { flex: none; margin-top: 2px; color: var(--hh-candle); }\n.hh-proposal-sub { font-size: 0.875rem; margin: 0; }\n.hh-proposal-group { font-size: 0.8125rem; font-weight: 600; margin: 4px 0 0; color: var(--muted, inherit); }\n.hh-proposal-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-proposal-note svg { flex: none; margin-top: 2px; }\n.hh-proposal-blocked svg { color: var(--hh-candle); }\n.hh-proposal-outcome[data-outcome='approved'] svg { color: var(--ok, currentColor); }\n.hh-decide { display: flex; flex-wrap: wrap; gap: 8px; }\n.hh-house-map .hh-button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; border-style: dashed; }\n.hh-button-reject { border-style: double; border-width: 3px; padding: 4px 10px; }\n\n@keyframes hh-house-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-house-map:not([data-still='true']) .hh-spin { animation: hh-house-spin 2s linear infinite; }\n}\n", Dt = {
	idle: "Idle",
	working: "Working",
	waiting: "Waiting",
	blocked: "Blocked",
	failed: "Failed",
	done: "Done"
}, Ot = /* @__PURE__ */ new Set([
	"waiting",
	"blocked",
	"failed"
]), kt = {
	locked_door: "A door upstream is still sealed.",
	missing_input: "An input it needs is missing.",
	stalled: "The run stalled.",
	history_partial: "Part of its history could not be recovered.",
	cancelled: "The run was cancelled.",
	cancel_unconfirmed: "Cancelling was not confirmed.",
	capacity_unavailable: "No ghost is free to take this.",
	claim_conflict: "Another ghost holds this task.",
	contract_unavailable: "Its room contract is unavailable.",
	confinement_unavailable: "Its room limits could not be applied."
}, At = 120;
function jt(e, t) {
	let n = e.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function Mt(e) {
	if (e === null) return null;
	let t = Object.hasOwn(kt, e) ? kt[e] : void 0;
	if (t !== void 0) return t;
	if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(e)) {
		let t = jt(e.replace(/_/g, " "), At);
		return t.charAt(0).toUpperCase() + t.slice(1);
	}
	let n = jt(e, At);
	return n === "" ? null : n;
}
function Nt(e) {
	let t = jt(e.replace(/[-_]+/g, " "), 60);
	return t === "" ? "Ghost" : t.replace(/(^|\s)(\p{L})/gu, (e, t, n) => t + n.toUpperCase());
}
function Pt(e) {
	return e <= 0 ? null : e === 1 ? "1 approval pending" : `${e} approvals pending`;
}
var Ft = "house-operator";
function It(e, t = {}) {
	return Array.from(e).filter((e) => e.ghost_id !== Ft).map((e) => {
		let n = Object.hasOwn(t, e.ghost_id) ? t[e.ghost_id] : void 0;
		return {
			key: JSON.stringify([e.mansion_id, e.ghost_id]),
			ghostId: e.ghost_id,
			name: n === void 0 || n.trim() === "" ? Nt(e.ghost_id) : n,
			state: e.state,
			stateText: Dt[e.state],
			pendingCount: e.pending_approvals.length,
			pendingText: Pt(e.pending_approvals.length),
			reason: Mt(e.reason)
		};
	});
}
function Lt(e) {
	switch (e.state) {
		case "waiting": return `${e.name} is waiting for your approval.`;
		case "blocked": return e.reason === null ? `${e.name} is blocked.` : `${e.name} is blocked: ${e.reason}`;
		case "failed": return e.reason === null ? `${e.name} failed.` : `${e.name} failed: ${e.reason}`;
		default: return "";
	}
}
function Rt(e, t, n, r = {}) {
	let i = new Map(It(t, r).map((e) => [e.key, e])), a = /* @__PURE__ */ new Map();
	for (let t of e) t.from_state !== t.to_state && a.set(JSON.stringify([t.mansion_id, t.ghost_id]), t);
	let o = [], s = [];
	for (let [e, t] of a) {
		if (n.has(t.transition_id)) continue;
		o.push(t.transition_id);
		let r = i.get(e);
		r !== void 0 && r.state === t.to_state && Ot.has(r.state) && s.push(Lt(r));
	}
	for (let t of e) !n.has(t.transition_id) && !o.includes(t.transition_id) && o.push(t.transition_id);
	return s.length === 0 ? {
		seen: o,
		message: null
	} : s.length === 1 ? {
		seen: o,
		message: s[0]
	} : {
		seen: o,
		message: `${s.length} ghosts need you. ${s.join(" ")}`
	};
}
var zt = /* @__PURE__ */ new Set([
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"duplicate_sequence",
	"missing_sequence"
]);
function Bt(e) {
	let t = e.line === void 0 ? "" : ` at line ${e.line}`;
	if (zt.has(e.code)) return `The séance log failed its integrity check${t}. Showing only the records before it.`;
	switch (e.code) {
		case "invalid_record":
		case "unsupported_schema": return `A séance log record${t} could not be read and was left out.`;
		case "history_partial": return "Some activity could not be recovered from Crew history.";
		case "invalid_envelope":
		case "unknown_session":
		case "approval_unmatched": return "A Crew event was refused and not recorded.";
		case "persistence_failed": return /\s/.test(e.safe_detail) ? jt(e.safe_detail, 160) : "The séance log could not be saved or read. Showing the last confirmed state.";
		default: return "The séance log reported a problem. Showing the last confirmed state.";
	}
}
var Vt = new Map([
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
			ArrowUp: "attic",
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
			ArrowLeft: "study",
			ArrowRight: "workshop"
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
			ArrowUp: "attic",
			ArrowLeft: "foyer",
			ArrowRight: "seance-room"
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
		neighbors: {
			ArrowDown: "drafting-room",
			ArrowLeft: "study",
			ArrowRight: "workshop"
		},
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
			ArrowLeft: "workshop"
		},
		workflowPhases: [],
		ghostRoles: ["medium"]
	}
].map((e) => [e.id, e]));
function Ht(e) {
	return Vt.get(e);
}
var Ut = /* @__PURE__ */ new Set([
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
]), Wt = ["crew", "house"], Gt = [
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
], Kt = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, qt = 262144, Jt = new Set(Wt), Yt = new TextEncoder(), Xt = /^[0-9a-f]{64}$/, Zt = class extends Error {
	path;
	safeDetail;
	constructor(e, t) {
		super(t), this.path = e, this.safeDetail = t;
	}
};
function I(e, t) {
	throw new Zt(e, t);
}
function Qt(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) return !1;
	let t = Object.getPrototypeOf(e);
	return t === Object.prototype || t === null;
}
function $t(e, t) {
	Qt(e) || I(t, "must be a JSON object");
	let n = Object.getOwnPropertyDescriptors(e);
	for (let e of Reflect.ownKeys(n)) {
		typeof e != "string" && I(t, "must contain only JSON object members");
		let r = n[e];
		r.enumerable && "value" in r || I(t, "must contain only JSON object members");
	}
	return e;
}
function en(e, t, n = [], r = "$") {
	let i = /* @__PURE__ */ new Set([...t, ...n]), a = Object.keys(e);
	(t.some((t) => !Object.hasOwn(e, t)) || a.some((e) => !i.has(e))) && I(r, "has missing or unexpected fields");
}
function tn(e) {
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
function nn(e) {
	return Yt.encode(e).byteLength;
}
function L(e, t, { maxBytes: n = 160, allowEmpty: r = !1 } = {}) {
	(typeof e != "string" || tn(e)) && I(t, "must be a valid Unicode string");
	let i = nn(e);
	return (!r && i === 0 || i > n) && I(t, `must be ${r ? "at most" : "between 1 and"} ${n} UTF-8 bytes`), e;
}
function rn(e, t, n) {
	return (typeof e != "number" || !Number.isInteger(e) || e < n) && I(t, `must be an integer greater than or equal to ${n}`), e;
}
function an(e, t, n) {
	return n && e === null ? null : rn(e, t, 0);
}
function on(e, t) {
	let n = L(e, t, { maxBytes: 40 });
	return (n.length > 40 || !Kt.test(n)) && I(t, "must be a kebab-case Mansion_ID of at most 40 characters"), n;
}
function sn(e, t) {
	return typeof e == "string" && Ut.has(e) || I(t, "must be a supported Event_Type"), e;
}
function cn(e, t) {
	return typeof e == "string" && Jt.has(e) || I(t, "must be a supported event origin"), e;
}
function ln(e, t, n) {
	return typeof e == "string" && e.startsWith(t) && Xt.test(e.slice(t.length)) || I(n, `must be a lowercase ${t.slice(0, -1)} SHA-256 identifier`), e;
}
function un(e, t) {
	let n = $t(e, t);
	return en(n, [
		"mansion_id",
		"ghost_id",
		"session_slot",
		"run_id",
		"run_sequence"
	], [], t), {
		mansion_id: on(n.mansion_id, `${t}.mansion_id`),
		ghost_id: L(n.ghost_id, `${t}.ghost_id`),
		session_slot: L(n.session_slot, `${t}.session_slot`),
		run_id: L(n.run_id, `${t}.run_id`),
		run_sequence: rn(n.run_sequence, `${t}.run_sequence`, 0)
	};
}
function dn(e, t) {
	return (!Array.isArray(e) || e.length < 1 || e.length > 8) && I(t, "must contain between 1 and 8 identity parts"), e.map((e, n) => L(e, `${t}[${n}]`, {
		maxBytes: 512,
		allowEmpty: !0
	}));
}
function fn(e, t) {
	let n = $t(e, t);
	return en(n, [
		"origin",
		"source_type",
		"identity_parts",
		"revision",
		"generation",
		"source_sequence"
	], [], t), {
		origin: cn(n.origin, `${t}.origin`),
		source_type: L(n.source_type, `${t}.source_type`),
		identity_parts: dn(n.identity_parts, `${t}.identity_parts`),
		revision: rn(n.revision, `${t}.revision`, 0),
		generation: L(n.generation, `${t}.generation`, { allowEmpty: !0 }),
		source_sequence: rn(n.source_sequence, `${t}.source_sequence`, 0)
	};
}
function pn(e, t) {
	return ln(e, "e1:", t);
}
function mn(e, t, n) {
	return (!Array.isArray(e) || e.length > 32) && I(t, "must contain at most 32 causal predecessors"), e.map((e, r) => n(e, `${t}[${r}]`));
}
function hn(e, t, n) {
	if (e === null || typeof e == "boolean" || typeof e == "string") return typeof e == "string" && tn(e) && I(t, "must contain valid Unicode strings"), e;
	if (typeof e == "number") return Number.isFinite(e) || I(t, "must contain only finite numbers"), Object.is(e, -0) ? 0 : e;
	if (Array.isArray(e)) {
		n.has(e) && I(t, "must not contain a cycle"), n.add(e);
		try {
			return e.map((e) => hn(e, t, n));
		} finally {
			n.delete(e);
		}
	}
	if (Qt(e)) {
		n.has(e) && I(t, "must not contain a cycle"), n.add(e);
		try {
			let r = $t(e, t), i = {};
			for (let e of Object.keys(r)) tn(e) && I(t, "must contain valid Unicode object keys"), Object.defineProperty(i, e, {
				value: hn(r[e], t, n),
				enumerable: !0,
				configurable: !0,
				writable: !0
			});
			return i;
		} finally {
			n.delete(e);
		}
	}
	I(t, "must be JSON-compatible");
}
function gn(e, t) {
	let n = Array.from(e, (e) => e.codePointAt(0)), r = Array.from(t, (e) => e.codePointAt(0)), i = Math.min(n.length, r.length);
	for (let e = 0; e < i; e += 1) if (n[e] !== r[e]) return n[e] - r[e];
	return n.length - r.length;
}
function R(e) {
	if (e === null || typeof e == "boolean" || typeof e == "number" || typeof e == "string") return JSON.stringify(e);
	if (Array.isArray(e)) return `[${e.map(R).join(",")}]`;
	let t = e;
	return `{${Object.keys(t).sort(gn).map((e) => `${JSON.stringify(e)}:${R(t[e])}`).join(",")}}`;
}
var _n = [
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
function z(e, t) {
	return e >>> t | e << 32 - t;
}
function vn(e) {
	let t = Yt.encode(e), n = t.length * 8, r = Math.ceil((t.length + 9) / 64) * 64, i = new Uint8Array(r);
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
			let t = s[e - 15], n = s[e - 2], r = z(t, 7) ^ z(t, 18) ^ t >>> 3, i = z(n, 17) ^ z(n, 19) ^ n >>> 10;
			s[e] = s[e - 16] + r + s[e - 7] + i >>> 0;
		}
		let [t, n, r, i, c, l, u, d] = o;
		for (let e = 0; e < 64; e += 1) {
			let a = z(c, 6) ^ z(c, 11) ^ z(c, 25), o = c & l ^ ~c & u, f = d + a + o + _n[e] + s[e] >>> 0, p = (z(t, 2) ^ z(t, 13) ^ z(t, 22)) + (t & n ^ t & r ^ n & r) >>> 0;
			d = u, u = l, l = c, c = i + f >>> 0, i = r, r = n, n = t, t = f + p >>> 0;
		}
		o[0] = o[0] + t >>> 0, o[1] = o[1] + n >>> 0, o[2] = o[2] + r >>> 0, o[3] = o[3] + i >>> 0, o[4] = o[4] + c >>> 0, o[5] = o[5] + l >>> 0, o[6] = o[6] + u >>> 0, o[7] = o[7] + d >>> 0;
	}
	return Array.from(o, (e) => e.toString(16).padStart(8, "0")).join("");
}
function yn(e) {
	return {
		mansion_id: e.mansion_id,
		ghost_id: e.ghost_id,
		session_slot: e.session_slot,
		run_id: e.run_id,
		run_sequence: e.run_sequence
	};
}
function bn(e) {
	return {
		origin: e.origin,
		source_type: e.source_type,
		identity_parts: e.identity_parts,
		revision: e.revision,
		generation: e.generation,
		source_sequence: e.source_sequence
	};
}
function xn(e) {
	return {
		schema_version: e.schema_version,
		event_type: e.event_type,
		scope: yn(e.scope),
		source: bn(e.source),
		caused_by: e.caused_by,
		occurred_at_ms: e.occurred_at_ms,
		payload: e.payload
	};
}
function Sn(e) {
	return `e1:${vn(R([
		e.schema_version,
		e.event_type,
		yn(e.scope),
		{
			origin: e.source.origin,
			source_type: e.source.source_type,
			identity_parts: e.source.identity_parts
		}
	]))}`;
}
function Cn(e) {
	return `r1:${vn(R(xn(e)))}`;
}
function wn(e) {
	let t = {
		...xn(e),
		event_id: e.event_id,
		record_id: e.record_id,
		sequence: e.sequence,
		persisted_at_ms: e.persisted_at_ms
	};
	return e.prev_hash !== void 0 && e.hash !== void 0 && (t.prev_hash = e.prev_hash, t.hash = e.hash), t;
}
function Tn(e, t, n) {
	let r = hn(e, n, /* @__PURE__ */ new Set());
	return nn(R(r)) > 262144 && I(n, `must encode to at most ${qt} UTF-8 bytes`), t === "domain_event_recorded" ? En(r, n) : r;
}
function En(e, t) {
	let n = $t(e, t);
	return en(n, [
		"domain",
		"kind",
		"entity_id",
		"data"
	], [], t), {
		domain: L(n.domain, `${t}.domain`),
		kind: L(n.kind, `${t}.kind`),
		entity_id: L(n.entity_id, `${t}.entity_id`),
		data: hn(n.data, `${t}.data`, /* @__PURE__ */ new Set())
	};
}
function Dn(e, t) {
	if (e.schema_version !== 1) throw new On(t);
	return 1;
}
var On = class extends Error {
	path;
	constructor(e) {
		super("schema version is not supported"), this.path = e;
	}
};
function kn(e, t) {
	try {
		return {
			ok: !0,
			value: t()
		};
	} catch (t) {
		return t instanceof On ? {
			ok: !1,
			diagnostic: {
				code: "unsupported_schema",
				path: t.path,
				safe_detail: "Schema version is not supported."
			}
		} : t instanceof Zt ? {
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
function An(e) {
	return kn("invalid_record", () => {
		let t = $t(e, "$");
		en(t, [
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
		let n = Dn(t, "$.schema_version"), r = sn(t.event_type, "$.event_type"), i = {
			schema_version: n,
			event_type: r,
			scope: un(t.scope, "$.scope"),
			source: fn(t.source, "$.source"),
			caused_by: mn(t.caused_by, "$.caused_by", pn),
			occurred_at_ms: an(t.occurred_at_ms, "$.occurred_at_ms", !0),
			payload: Tn(t.payload, r, "$.payload")
		}, a = ln(t.event_id, "e1:", "$.event_id"), o = ln(t.record_id, "r1:", "$.record_id");
		a !== Sn(i) && I("$.event_id", "does not match canonical event content"), o !== Cn(i) && I("$.record_id", "does not match canonical event content");
		let s = Object.hasOwn(t, "prev_hash"), c = Object.hasOwn(t, "hash");
		s !== c && I("$", "prev_hash and hash must be present together");
		let l = {
			...i,
			event_id: a,
			record_id: o,
			sequence: rn(t.sequence, "$.sequence", 1),
			persisted_at_ms: an(t.persisted_at_ms, "$.persisted_at_ms", !1)
		};
		return s && c ? {
			...l,
			prev_hash: ln(t.prev_hash, "h1:", "$.prev_hash"),
			hash: ln(t.hash, "h1:", "$.hash")
		} : l;
	});
}
function jn(e) {
	return `${R(wn(e))}\n`;
}
var B = [
	"requirements",
	"design",
	"tasks",
	"implementation"
], Mn = [
	"not_started",
	"ready",
	"starting",
	"working",
	"waiting",
	"revision_required",
	"approved",
	"failed",
	"done"
], Nn = [
	"sealed",
	"waiting",
	"open",
	"rejected"
], Pn = [
	"pending",
	"approved",
	"rejected",
	"superseded"
], Fn = [
	"pending",
	"approved",
	"rejected",
	"consumed",
	"succeeded",
	"failed",
	"superseded"
], In = [
	"valid",
	"corrupt",
	"uncertain"
], Ln = [
	"delete_path",
	"run_command",
	"git_write"
], Rn = [
	"list",
	"read",
	"write",
	"delete",
	"command_read",
	"command_write",
	"git_write"
], zn = ["approved", "rejected"], Bn = ["operator", "crew"], Vn = 1024, Hn = ["[redacted]", "[home]/"], Un = class extends Error {
	path;
	constructor(e) {
		super("refused"), this.path = e;
	}
};
function V(e) {
	throw new Un(e);
}
function Wn(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function H(e, t, n, r = []) {
	Wn(e) || V(t);
	for (let i of Object.keys(e)) !n.includes(i) && !r.includes(i) && V(t);
	for (let r of n) Object.hasOwn(e, r) || V(`${t}.${r}`);
	return e;
}
function U(e, t, n) {
	return typeof e == "string" && t.includes(e) || V(n), e;
}
function Gn(e, t, n = 0) {
	return (typeof e != "number" || !Number.isSafeInteger(e) || e < n) && V(t), e;
}
var Kn = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
function W(e, t, n = 160) {
	return (typeof e != "string" || e.length === 0 || e.length > n || Kn.test(e)) && V(t), e;
}
function qn(e, t) {
	return typeof e == "string" && /^[0-9a-f]{64}$/.test(e) || V(t), e;
}
function Jn(e, t, n = !1) {
	if (n && e === "") return "";
	let r = W(e, t, Vn);
	(r.startsWith("/") || r.includes("\\")) && V(t);
	for (let e of r.split("/")) (e === "" || e === "." || e === "..") && V(t);
	return r;
}
function Yn(e, t) {
	return (typeof e != "string" || e.length > 40 || !Kt.test(e)) && V(t), e;
}
function Xn(e, t) {
	let n = H(e, t, [
		"revision",
		"sha256",
		"size_bytes"
	]);
	return {
		revision: Gn(n.revision, `${t}.revision`, 1),
		sha256: qn(n.sha256, `${t}.sha256`),
		sizeBytes: Gn(n.size_bytes, `${t}.size_bytes`)
	};
}
function Zn(e, t) {
	if (e === null) return null;
	let n = H(e, t, [
		"outcome",
		"actor",
		"event_id",
		"sequence"
	]), r = n.event_id;
	return typeof r == "string" && /^e1:[0-9a-f]{64}$/.test(r) || V(`${t}.event_id`), {
		outcome: U(n.outcome, zn, `${t}.outcome`),
		actor: U(n.actor, Bn, `${t}.actor`),
		eventId: r,
		sequence: Gn(n.sequence, `${t}.sequence`, 1)
	};
}
function Qn(e, t, n, r) {
	if (e === "pending") return t === null;
	if (e === "superseded") return t === null || r && t.outcome === "approved";
	let i = Object.hasOwn(n, e) ? n[e] : void 0;
	return i !== void 0 && t !== null && t.outcome === i;
}
var $n = {
	approved: "approved",
	rejected: "rejected"
}, er = {
	approved: "approved",
	rejected: "rejected",
	consumed: "approved",
	succeeded: "approved",
	failed: "approved"
};
function tr(e, t, n) {
	if (e === null) return null;
	let r = H(e, t, [
		"proposal_id",
		"phase",
		"document_path",
		"artifact_revision",
		"status",
		"created_sequence",
		"decision"
	]);
	r.phase !== n && V(`${t}.phase`);
	let i = U(r.status, Pn, `${t}.status`), a = Zn(r.decision, `${t}.decision`);
	return Qn(i, a, $n, !1) || V(`${t}.decision`), {
		proposalId: W(r.proposal_id, `${t}.proposal_id`),
		phase: n,
		documentPath: Jn(r.document_path, `${t}.document_path`),
		artifactRevision: Xn(r.artifact_revision, `${t}.artifact_revision`),
		status: i,
		createdSequence: Gn(r.created_sequence, `${t}.created_sequence`, 1),
		decision: a
	};
}
function nr(e, t) {
	switch (e) {
		case "waiting": return t?.status === "pending";
		case "open": return t?.status === "approved";
		case "rejected": return t?.status === "rejected";
		case "sealed": return t === null || t.status === "superseded" || t.status === "rejected";
	}
}
function rr(e, t, n) {
	let r = H(e, t, [
		"phase",
		"status",
		"ghost_ids",
		"door"
	]);
	r.phase !== n && V(`${t}.phase`), (!Array.isArray(r.ghost_ids) || r.ghost_ids.length > 16) && V(`${t}.ghost_ids`);
	let i = r.ghost_ids.map((e, n) => W(e, `${t}.ghost_ids[${n}]`));
	new Set(i).size !== i.length && V(`${t}.ghost_ids`);
	let a = H(r.door, `${t}.door`, ["status", "proposal"]), o = U(a.status, Nn, `${t}.door.status`), s = tr(a.proposal, `${t}.door.proposal`, n);
	return nr(o, s) || V(`${t}.door`), {
		phase: n,
		status: U(r.status, Mn, `${t}.status`),
		ghostIds: i,
		door: {
			status: o,
			proposal: s
		}
	};
}
function ir(e) {
	return Hn.some((t) => e.includes(t));
}
function ar(e, t = 0) {
	return t > 8 ? !1 : e === null || typeof e == "boolean" ? !0 : typeof e == "number" ? Number.isSafeInteger(e) : typeof e == "string" ? !Kn.test(e) && !ir(e) : Array.isArray(e) ? e.every((e) => ar(e, t + 1)) : Wn(e) ? Object.entries(e).every(([e, n]) => e !== "" && !Kn.test(e) && !ir(e) && ar(n, t + 1)) : !1;
}
function or(e) {
	try {
		let t = H(e, "$", [
			"schema_version",
			"mansion_id",
			"session_slot",
			"room",
			"kind",
			"working_directory",
			"arguments",
			"path_intents"
		]);
		if (t.schema_version !== 1 || !Wn(t.arguments) || !ar(t.arguments) || JSON.stringify(t.arguments).length > 16384 || !Array.isArray(t.path_intents) || t.path_intents.length > 64 || [
			t.session_slot,
			t.room,
			t.working_directory
		].some((e) => typeof e == "string" && ir(e))) return null;
		let n = t.path_intents.map((e, t) => {
			let n = H(e, `\$[${t}]`, ["path", "access"]);
			return typeof n.path == "string" && ir(n.path) && V("$"), {
				path: Jn(n.path, "$"),
				access: U(n.access, Rn, "$")
			};
		});
		return {
			schemaVersion: 1,
			mansionId: Yn(t.mansion_id, "$"),
			sessionSlot: W(t.session_slot, "$"),
			room: W(t.room, "$"),
			kind: U(t.kind, Ln, "$"),
			workingDirectory: Jn(t.working_directory, "$", !0),
			arguments: t.arguments,
			pathIntents: n
		};
	} catch (e) {
		if (e instanceof Un) return null;
		throw e;
	}
}
function sr(e, t, n) {
	let r = H(e, t, [
		"proposal_id",
		"ghost_id",
		"session_slot",
		"room",
		"status",
		"action_digest",
		"descriptor",
		"created_sequence",
		"decision"
	]), i = U(r.status, Fn, `${t}.status`), a = Zn(r.decision, `${t}.decision`);
	Qn(i, a, er, !0) || V(`${t}.decision`);
	let o = W(r.session_slot, `${t}.session_slot`), s = r.room === null ? null : W(r.room, `${t}.room`), c = r.descriptor === null ? null : or(r.descriptor);
	return c !== null && (c.mansionId !== n || c.sessionSlot !== o || c.room !== s) && (c = null), {
		proposalId: W(r.proposal_id, `${t}.proposal_id`),
		ghostId: W(r.ghost_id, `${t}.ghost_id`),
		sessionSlot: o,
		room: s,
		status: i,
		actionDigest: qn(r.action_digest, `${t}.action_digest`),
		descriptor: c,
		createdSequence: Gn(r.created_sequence, `${t}.created_sequence`, 1),
		decision: a
	};
}
function cr(e, t) {
	let n = H(e, t, [
		"slot",
		"mid",
		"requested_sequence",
		"tool_name",
		"action_digest",
		"proposal_id"
	]);
	return {
		slot: W(n.slot, `${t}.slot`),
		mid: W(n.mid, `${t}.mid`),
		requestedSequence: Gn(n.requested_sequence, `${t}.requested_sequence`, 1),
		toolName: n.tool_name === null ? null : W(n.tool_name, `${t}.tool_name`),
		actionDigest: n.action_digest === null ? null : qn(n.action_digest, `${t}.action_digest`),
		proposalId: n.proposal_id === null ? null : W(n.proposal_id, `${t}.proposal_id`)
	};
}
function lr(e, t) {
	new Set(e).size !== e.length && V(t);
}
function ur(e, t) {
	try {
		let n = H(e, "$", [
			"schema_version",
			"mansion_id",
			"version",
			"integrity",
			"waiting_count",
			"phases",
			"risky_proposals",
			"pending_permissions"
		], ["read_only"]);
		n.read_only !== void 0 && typeof n.read_only != "boolean" && V("$.read_only"), n.schema_version !== 1 && V("$.schema_version");
		let r = Yn(n.mansion_id, "$.mansion_id");
		t !== void 0 && r !== t && V("$.mansion_id");
		let i = Gn(n.version, "$.version");
		Array.isArray(n.phases) && n.phases.length === B.length || V("$.phases");
		let a = B.map((e, t) => rr(n.phases[t], `$.phases[${t}]`, e));
		(!Array.isArray(n.risky_proposals) || n.risky_proposals.length > 200) && V("$.risky_proposals");
		let o = n.risky_proposals.map((e, t) => sr(e, `$.risky_proposals[${t}]`, r));
		lr(o.map((e) => e.proposalId), "$.risky_proposals"), (!Array.isArray(n.pending_permissions) || n.pending_permissions.length > 200) && V("$.pending_permissions");
		let s = n.pending_permissions.map((e, t) => cr(e, `$.pending_permissions[${t}]`));
		return lr(s.map((e) => JSON.stringify([e.slot, e.mid])), "$.pending_permissions"), [
			...o.flatMap((e) => [e.createdSequence, e.decision?.sequence ?? 0]),
			...a.flatMap((e) => [e.door.proposal?.createdSequence ?? 0, e.door.proposal?.decision?.sequence ?? 0]),
			...s.map((e) => e.requestedSequence)
		].some((e) => e > i) && V("$.version"), {
			ok: !0,
			projection: {
				mansionId: r,
				version: i,
				integrity: U(n.integrity, In, "$.integrity"),
				waitingCount: Gn(n.waiting_count, "$.waiting_count"),
				phases: a,
				riskyProposals: o,
				pendingPermissions: s,
				readOnly: n.read_only === !0
			}
		};
	} catch (e) {
		if (e instanceof Un) return {
			ok: !1,
			path: e.path
		};
		throw e;
	}
}
function dr(e) {
	return {
		revision: e.revision,
		sha256: e.sha256,
		size_bytes: e.sizeBytes
	};
}
// src/core/house-view.ts
var fr = [
	"study",
	"drafting-room",
	"workshop"
], pr = fr.map((e) => {
	let t = Ht(e);
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
}, mr = {
	not_started: "Not started",
	ready: "Ready to start",
	starting: "Starting",
	working: "Working",
	waiting: "Waiting for your decision",
	revision_required: "Revision required",
	approved: "Approved",
	failed: "Failed to start",
	done: "Done"
}, hr = {
	sealed: "Sealed door",
	waiting: "Door waiting for your decision",
	open: "Open door",
	rejected: "Door kept shut"
};
function gr(e, t = {}) {
	let n = Object.hasOwn(t, e) ? t[e] : void 0;
	return n === void 0 || n.trim() === "" ? Nt(e) : n;
}
function _r(e) {
	return pr.find((t) => t.phases.includes(e)).id;
}
function vr(e, t) {
	if (t !== null) {
		for (let n of t.phases) if (n.ghostIds.includes(e)) return _r(n.phase);
	}
	for (let t of pr) if (t.roles.some((t) => e === t || e.startsWith(`${t}-`))) return t.id;
	return null;
}
function yr(e) {
	return B[B.indexOf(e) + 1] ?? null;
}
function br(e, t) {
	let n = G[e].toLowerCase(), r = yr(e);
	switch (t) {
		case "sealed": return `Sealed door: approve the ${n} to open it.`;
		case "waiting": return `The ${n} are ready. Approve or reject them to decide this door.`;
		case "open": return r === null ? `Open door: the ${n} were approved.` : `Open door: the ${n} were approved. ${G[r]} may be started.`;
		case "rejected": return `Door kept shut: the ${n} were rejected and need a revision.`;
	}
}
var xr = {
	read_only: "This is a recording. Nothing can be started, approved or rejected here.",
	loading: "Loading the state of the house. Decisions are off until it arrives.",
	unavailable: "The house could not be reached. Decisions are off until it answers.",
	malformed: "The house sent a state this page cannot read. Decisions are off.",
	integrity: "The séance log failed its integrity check. Decisions are off until it is repaired.",
	uncertain: "The latest ghost activity is not confirmed yet. Decisions are off until the house catches up.",
	catching_up: "Catching up with the séance log. Decisions are off until it is current.",
	stale: "Something changed in the house. Refreshing before you decide."
}, Sr = /* @__PURE__ */ new Set([
	"hash_mismatch",
	"hash_link_broken",
	"mixed_integrity_mode",
	"duplicate_sequence",
	"missing_sequence"
]);
function Cr(e) {
	let t = (e) => ({
		canDecide: !1,
		block: e,
		text: xr[e]
	});
	return e.readOnly === !0 || e.projection?.readOnly === !0 ? t("read_only") : e.projectionStatus === "malformed" ? t("malformed") : e.projection === null ? t(e.projectionStatus === "unavailable" ? "unavailable" : "loading") : e.projection.integrity === "corrupt" ? t("integrity") : e.canonical.diagnostic === null ? e.projection.integrity === "uncertain" ? t("uncertain") : e.projectionStatus === "unavailable" ? t("unavailable") : !e.canonical.loaded || e.canonical.catchingUp ? t("catching_up") : e.canonical.highestSequence > e.projection.version ? t("stale") : {
		canDecide: !0,
		block: null,
		text: null
	} : t(Sr.has(e.canonical.diagnostic.code) ? "integrity" : "uncertain");
}
function wr(e) {
	return e.kind === "start_phase" ? `phase:${e.phase}` : `proposal:${e.proposalId}`;
}
function Tr(e) {
	return e.slice(0, 12);
}
function Er(e) {
	return e === 1 ? "1 byte" : `${e.toLocaleString("en-US")} bytes`;
}
function Dr(e) {
	let t = e.outcome === "approved" ? "Approved" : "Rejected";
	return e.actor === "operator" ? `${t} by the operator in Haunted House.` : `${t} in Crew, outside Haunted House.`;
}
function Or(e, t, n, r, i) {
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
function kr(e, t, n, r) {
	let i = t.door.proposal;
	if (i === null) return null;
	let a = i.status === "pending" && t.door.status === "waiting", o = a ? "pending" : i.status === "pending" ? "superseded" : i.status, s = Or(a, !0, n, r, `proposal:${i.proposalId}`), c = (n) => ({
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
		digestPrefix: Tr(i.artifactRevision.sha256),
		sizeText: Er(i.artifactRevision.sizeBytes),
		outcomeText: i.decision === null ? o === "superseded" ? "Superseded: the document changed after this proposal. A new revision needs its own decision." : null : Dr(i.decision),
		approve: s.canApprove ? c("approve") : null,
		reject: s.canReject ? c("reject") : null
	};
}
var Ar = {
	delete_path: "Delete a file or empty folder",
	run_command: "Run a command",
	git_write: "Change the git repository"
}, jr = {
	list: "List",
	read: "Read",
	write: "Write",
	delete: "Delete",
	command_read: "Command may read",
	command_write: "Command may write",
	git_write: "Git may write"
}, Mr = {
	pending: "Waiting for your decision",
	approved: "Approved, not used yet",
	rejected: "Rejected",
	consumed: "Approval used: the action is running",
	succeeded: "Done: the approved action succeeded",
	failed: "Failed: the approved action did not succeed. The approval is used up.",
	superseded: "Superseded"
}, Nr = "Approving allows exactly one attempt of exactly this action. If the attempt fails, the approval is used up and the ghost must ask again.";
function Pr(e) {
	return Array.isArray(e) && e.every((e) => typeof e == "string") ? e.map((e) => JSON.stringify(e)).join(" ") : typeof e == "string" ? e : JSON.stringify(e);
}
function Fr(e) {
	return {
		scope: [
			{
				label: "Action",
				value: Ar[e.kind]
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
			value: Pr(e.arguments[t])
		})),
		paths: e.pathIntents.map((e) => ({
			label: jr[e.access],
			value: e.path
		}))
	};
}
function Ir(e, t, n, r, i = {}) {
	let a = t.descriptor !== null, o = Or(t.status === "pending", a, n, r, `proposal:${t.proposalId}`), s = t.descriptor === null ? {
		scope: [],
		arguments: [],
		paths: []
	} : Fr(t.descriptor), c = (n) => ({
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
		ghostName: gr(t.ghostId, i),
		status: t.status,
		statusText: Mr[t.status],
		title: t.descriptor === null ? "Risky action (details unavailable)" : Ar[t.descriptor.kind],
		complete: a,
		...s,
		digestPrefix: Tr(t.actionDigest),
		oneAttemptText: Nr,
		outcomeText: t.decision === null ? null : Dr(t.decision),
		approve: o.canApprove ? c("approve") : null,
		reject: o.canReject ? c("reject") : null
	};
}
var Lr = {
	ready: (e) => `Start ${e}`,
	failed: (e) => `Try starting ${e} again`,
	revision_required: (e) => `Start the ${e} revision`
};
function Rr(e, t, n, r) {
	let i = Lr[t.status];
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
function zr(e, t = {}) {
	if (e === null) return [];
	let n = [], r = (e) => gr(e, t);
	for (let t of e.phases) {
		let e = t.door.proposal;
		t.door.status === "waiting" && e !== null && e.status === "pending" && n.push({
			kind: "door",
			id: `door:${e.proposalId}`,
			room: _r(t.phase),
			phase: t.phase,
			ghostId: t.ghostIds.at(-1) ?? null,
			text: `The ${G[t.phase].toLowerCase()} door needs your decision.`
		});
	}
	let i = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set();
	for (let t of e.riskyProposals) {
		if (t.status !== "pending") continue;
		i.add(t.proposalId), a.add(t.sessionSlot);
		let o = t.descriptor === null ? "do something risky" : Ar[t.descriptor.kind].toLowerCase();
		n.push({
			kind: "risky",
			id: `risky:${t.proposalId}`,
			room: vr(t.ghostId, e) ?? "workshop",
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
function Br(e) {
	return e === 0 ? "Nothing needs you" : e === 1 ? "1 thing needs you" : `${e} things need you`;
}
function Vr(e, t) {
	let n = e.filter((e) => !t.has(e.id));
	if (n.length === 0) return {
		seen: [],
		message: null
	};
	let r = n.map((e) => e.text);
	return {
		seen: n.map((e) => e.id),
		message: r.length === 1 ? r[0] : `${r.length} things need you. ${r.join(" ")}`
	};
}
function Hr(e) {
	return e.length === 0 ? "No ghost here yet" : e.map((e) => `${e.name}: ${e.stateText}`).join(", ");
}
function Ur(e, t, n = {}) {
	let r = Array.from(t), i = zr(e, n);
	return pr.map((t) => {
		let a = e === null ? [] : t.phases.map((t) => {
			let n = e.phases[B.indexOf(t)];
			return {
				phase: t,
				name: G[t],
				status: n.status,
				statusText: mr[n.status],
				doorStatus: n.door.status,
				doorText: hr[n.door.status],
				doorHint: br(t, n.door.status)
			};
		}), o = It(r.filter((n) => vr(n.ghost_id, e) === t.id), n), s = i.filter((e) => e.room === t.id).length, c = a.length === 0 ? "State not loaded" : a.map((e) => `${e.name}: ${e.statusText}, ${e.doorText}`).join(". ");
		return {
			id: t.id,
			name: t.name,
			phases: a,
			ghosts: o,
			needsYou: s,
			label: `${t.name}. ${c}. ${Hr(o)}.${s > 0 ? ` ${Br(s)}.` : ""}`
		};
	});
}
function Wr(e, t) {
	let n = fr.indexOf(e);
	switch (t) {
		case "next": return fr[Math.min(n + 1, fr.length - 1)];
		case "previous": return fr[Math.max(n - 1, 0)];
		case "first": return fr[0];
		case "last": return fr[fr.length - 1];
	}
}
function Gr(e, t, n, r, i = {}) {
	if (e === null) return {
		room: t,
		phases: [],
		risky: []
	};
	let a = t.phases.map((t) => {
		let i = e.phases[B.indexOf(t.phase)];
		return {
			line: t,
			start: Rr(e, i, n, r),
			door: kr(e, i, n, r)
		};
	}), o = e.riskyProposals.filter((n) => (vr(n.ghostId, e) ?? "workshop") === t.id), s = o.filter((e) => e.status === "pending"), c = o.filter((e) => e.status !== "pending").sort((e, t) => t.createdSequence - e.createdSequence).slice(0, 5);
	return {
		room: t,
		phases: a,
		risky: [...s, ...c].map((t) => Ir(e, t, n, r, i))
	};
}
// src/rooms/house/HouseMap.tsx
var Kr = {
	ArrowRight: "next",
	ArrowDown: "next",
	ArrowLeft: "previous",
	ArrowUp: "previous",
	Home: "first",
	End: "last"
};
function qr({ rooms: e, focusedRoom: t, openRoom: r, panelId: i, onFocus: a, onMove: o, onOpen: s }) {
	let c = D(null);
	return w(() => {
		let e = c.current;
		e !== null && e.contains(document.activeElement) && e.querySelector(`[data-room="${t}"]`)?.focus();
	}, [t]), /* @__PURE__ */ M("nav", {
		className: "hh-map",
		"aria-label": "House map",
		ref: c,
		children: /* @__PURE__ */ M("ol", {
			className: "hh-map-rooms",
			children: e.map((e) => /* @__PURE__ */ M("li", { children: /* @__PURE__ */ N("button", {
				type: "button",
				className: "hh-room",
				"data-room": e.id,
				"data-needs": e.needsYou > 0,
				"aria-label": e.label,
				"aria-expanded": r === e.id,
				"aria-controls": r === e.id ? i : void 0,
				onFocus: () => a(e.id),
				onClick: () => s(e.id),
				onKeyDown: (e) => {
					let t = Kr[e.key];
					t !== void 0 && (e.preventDefault(), o(t));
				},
				children: [
					/* @__PURE__ */ M("span", {
						className: "hh-room-name",
						children: e.name
					}),
					e.phases.map((e) => /* @__PURE__ */ N("span", {
						style: { display: "contents" },
						"data-phase": e.phase,
						"data-status": e.status,
						"data-door": e.doorStatus,
						children: [/* @__PURE__ */ N("span", {
							className: "hh-room-line",
							"data-tone": _t[e.status],
							children: [/* @__PURE__ */ M(bt, { status: e.status }), /* @__PURE__ */ N("span", { children: [
								e.name,
								": ",
								e.statusText
							] })]
						}), /* @__PURE__ */ N("span", {
							className: "hh-room-line",
							"data-tone": vt[e.doorStatus],
							children: [/* @__PURE__ */ M(xt, { status: e.doorStatus }), /* @__PURE__ */ M("span", { children: e.doorText })]
						})]
					}, e.phase)),
					e.ghosts.length === 0 ? /* @__PURE__ */ N("span", {
						className: "hh-room-line",
						children: [/* @__PURE__ */ M(St, { state: "idle" }), /* @__PURE__ */ M("span", { children: "No ghost here yet" })]
					}) : e.ghosts.map((e) => /* @__PURE__ */ N("span", {
						className: "hh-room-line",
						"data-tone": yt[e.state],
						children: [/* @__PURE__ */ M(St, { state: e.state }), /* @__PURE__ */ N("span", { children: [
							e.name,
							": ",
							e.stateText
						] })]
					}, e.key)),
					e.needsYou > 0 ? /* @__PURE__ */ N("span", {
						className: "hh-room-line hh-room-needs",
						"data-tone": "attention",
						children: [/* @__PURE__ */ M(n, {
							size: 16,
							"aria-hidden": !0
						}), /* @__PURE__ */ M("span", { children: Br(e.needsYou) })]
					}) : null
				]
			}) }, e.id))
		})
	});
}
// src/rooms/house/NeedsYouBar.tsx
function Jr({ items: e, text: t, onJump: r }) {
	let i = e.some((e) => e.room !== null);
	return /* @__PURE__ */ N(j, { children: [/* @__PURE__ */ N("button", {
		type: "button",
		className: "hh-needs",
		"data-count": e.length,
		"aria-disabled": !i,
		"aria-label": i ? `Needs you: ${t}. Go to the first.` : `Needs you: ${t}.`,
		onClick: () => {
			i && r();
		},
		children: [/* @__PURE__ */ M(n, {
			size: 16,
			"aria-hidden": !0
		}), t]
	}), e.length === 0 ? null : /* @__PURE__ */ M("ul", {
		className: "hh-needs-list",
		"aria-label": "Waiting on you",
		children: e.map((e) => /* @__PURE__ */ M("li", { children: e.text }, e.id))
	})] });
}
// src/rooms/house/DecisionButtons.tsx
function Yr({ approve: e, reject: t, busy: n, subject: i, describedBy: a, onSend: o }) {
	return /* @__PURE__ */ N("div", {
		className: "hh-decide",
		"aria-busy": n,
		children: [/* @__PURE__ */ N("button", {
			type: "button",
			className: "hh-button hh-button-primary",
			"aria-label": `Approve ${i}`,
			"aria-disabled": e === null,
			"aria-describedby": e === null ? a : void 0,
			onClick: () => {
				e !== null && o(e);
			},
			children: [/* @__PURE__ */ M(r, {
				size: 16,
				"aria-hidden": !0
			}), n ? "Sending…" : "Approve"]
		}), /* @__PURE__ */ N("button", {
			type: "button",
			className: "hh-button hh-button-reject",
			"aria-label": `Reject ${i}`,
			"aria-disabled": t === null,
			"aria-describedby": t === null ? a : void 0,
			onClick: () => {
				t !== null && o(t);
			},
			children: [/* @__PURE__ */ M(x, {
				size: 16,
				"aria-hidden": !0
			}), "Reject"]
		})]
	});
}
// src/rooms/house/DoorPanel.tsx
function Xr({ view: e, onSend: n }) {
	let r = T(), a = T(), s = e.state === "pending";
	return /* @__PURE__ */ N("article", {
		className: "hh-proposal",
		"aria-labelledby": r,
		"data-state": e.state,
		"data-proposal": e.proposalId,
		children: [
			/* @__PURE__ */ N("div", {
				className: "hh-proposal-head",
				children: [/* @__PURE__ */ M(o, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("h5", {
					id: r,
					children: e.title
				})]
			}),
			/* @__PURE__ */ N("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ M("dt", { children: "Document" }),
					/* @__PURE__ */ M("dd", { children: /* @__PURE__ */ M("code", { children: e.documentPath }) }),
					/* @__PURE__ */ M("dt", { children: "Revision" }),
					/* @__PURE__ */ N("dd", { children: [
						e.revisionText,
						", ",
						e.sizeText
					] }),
					/* @__PURE__ */ M("dt", { children: "Digest" }),
					/* @__PURE__ */ N("dd", { children: [/* @__PURE__ */ M("code", { children: e.digestPrefix }), " (first 12 characters of its SHA-256)"] })
				]
			}),
			s ? /* @__PURE__ */ N(j, { children: [
				/* @__PURE__ */ M("p", {
					className: "hh-proposal-sub",
					children: "Your decision covers exactly this revision. If the document changes, it needs a new decision. Approving opens the door; the next phase starts only when you start it."
				}),
				e.blockedText === null ? null : /* @__PURE__ */ N("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: a,
					children: [/* @__PURE__ */ M(f, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ M("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ M(Yr, {
					approve: e.approve,
					reject: e.reject,
					busy: e.busy,
					subject: `${e.title}, ${e.revisionText.toLowerCase()}`,
					describedBy: e.blockedText === null ? void 0 : a,
					onSend: n
				})
			] }) : /* @__PURE__ */ N("p", {
				className: "hh-proposal-note hh-proposal-outcome",
				"data-outcome": e.state,
				children: [e.state === "approved" ? /* @__PURE__ */ M(i, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ M(t, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: e.outcomeText })]
			})
		]
	});
}
var Zr = [
	"requirements",
	"design",
	"tasks"
], Qr = [
	"queued",
	"active",
	"complete",
	"failed",
	"cancelled",
	"blocked",
	"skipped"
], $r = [
	"crew_capacity",
	"local_capacity",
	"claim_busy"
], ei = [
	"reviewing",
	"pass",
	"changes_requested",
	"blocked"
], ti = [
	"proposed",
	"approved",
	"rejected"
], ni = 1e3, ri = 1024, ii = class extends Error {
	path;
	constructor(e) {
		super("refused"), this.path = e;
	}
};
function K(e) {
	throw new ii(e);
}
function ai(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function q(e, t, n, r = []) {
	ai(e) || K(t);
	for (let i of Object.keys(e)) !n.includes(i) && !r.includes(i) && K(t);
	for (let r of n) Object.hasOwn(e, r) || K(`${t}.${r}`);
	return e;
}
function oi(e, t, n) {
	return typeof e == "string" && t.includes(e) || K(n), e;
}
function J(e, t, n = 0, r = 2 ** 53 - 1) {
	return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && K(t), e;
}
function si(e, t) {
	return typeof e != "boolean" && K(t), e;
}
function Y(e, t, n) {
	return (!Array.isArray(e) || e.length > n) && K(t), e;
}
var ci = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/, li = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
function ui(e, t, n = 160) {
	return (typeof e != "string" || e.length === 0 || e.length > n || ci.test(e)) && K(t), e;
}
function X(e, t) {
	return e === null ? null : t(e);
}
var di = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
function fi(e, t) {
	return typeof e == "string" && di.test(e) || K(t), e;
}
var pi = /^[a-z][a-z0-9_]{0,63}$/;
function mi(e, t) {
	return typeof e == "string" && pi.test(e) || K(t), e;
}
var hi = /^[1-9][0-9]{0,3}\.[1-9][0-9]{0,3}$/;
function gi(e, t) {
	return typeof e == "string" && hi.test(e) || K(t), e;
}
var _i = /^[A-Za-z0-9-]{1,160}$/;
function vi(e, t) {
	let n = ui(e, t, ri);
	(n.startsWith("/") || n.includes("\\") || n.startsWith("~")) && K(t);
	for (let e of n.split("/")) (e === "" || e === "." || e === "..") && K(t);
	return n;
}
function Z(e, t) {
	new Set(e).size !== e.length && K(t);
}
function yi(e, t) {
	let n = Y(e, t, 32).map((e, n) => vi(e, `${t}[${n}]`));
	return Z(n, t), n;
}
function bi(e, t, n) {
	return (typeof e != "string" || e.trim() === "" || e.length > n || li.test(e)) && K(t), e;
}
function xi(e, t) {
	let n = q(e, t, [
		"revision",
		"sha256",
		"size_bytes"
	]);
	return typeof n.sha256 == "string" && /^[0-9a-f]{64}$/.test(n.sha256) || K(`${t}.sha256`), {
		revision: J(n.revision, `${t}.revision`, 1),
		sha256: n.sha256,
		sizeBytes: J(n.size_bytes, `${t}.size_bytes`)
	};
}
function Si(e, t) {
	return Y(e, t, 50).map((e, n) => {
		let r = `${t}[${n}]`, i = q(e, r, [
			"code",
			"location",
			"message"
		]);
		return {
			code: mi(i.code, `${r}.code`),
			location: ui(i.location, `${r}.location`, 96),
			message: ui(i.message, `${r}.message`, 200)
		};
	});
}
function Ci(e, t) {
	let n = q(e, t, [
		"artifact_revision",
		"validated",
		"content",
		"findings"
	]), r = n.content;
	return r !== null && (typeof r != "string" || r.length > 524288) && K(`${t}.content`), {
		artifactRevision: xi(n.artifact_revision, `${t}.artifact_revision`),
		validated: si(n.validated, `${t}.validated`),
		content: r,
		findings: Si(n.findings, `${t}.findings`)
	};
}
function wi(e, t, n, r) {
	let i = q(e, t, [
		"phase",
		"document_path",
		"write_scope",
		"artifact"
	]);
	i.phase !== n && K(`${t}.phase`);
	let a = vi(i.document_path, `${t}.document_path`);
	return a !== `.kiro/specs/${r}/${n}.md` && K(`${t}.document_path`), {
		phase: n,
		documentPath: a,
		writeScope: yi(i.write_scope, `${t}.write_scope`),
		artifact: X(i.artifact, (e) => Ci(e, `${t}.artifact`))
	};
}
function Ti(e, t) {
	let n = q(e, t, [
		"status",
		"attempt",
		"run_id",
		"reason_code"
	]);
	return {
		status: oi(n.status, Qr, `${t}.status`),
		attempt: J(n.attempt, `${t}.attempt`, 0, 3),
		runId: X(n.run_id, (e) => fi(e, `${t}.run_id`)),
		reasonCode: X(n.reason_code, (e) => mi(e, `${t}.reason_code`))
	};
}
function Ei(e, t) {
	let n = q(e, t, [
		"dispatch_failures",
		"next_delay_seconds",
		"last_reason"
	]);
	return {
		dispatchFailures: J(n.dispatch_failures, `${t}.dispatch_failures`, 0, 1e6),
		nextDelaySeconds: J(n.next_delay_seconds, `${t}.next_delay_seconds`, 0, 15),
		lastReason: oi(n.last_reason, $r, `${t}.last_reason`)
	};
}
function Di(e, t) {
	let n = q(e, t, [
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
	]), r = Y(n.requirements, `${t}.requirements`, 64).map((e, n) => gi(e, `${t}.requirements[${n}]`));
	Z(r, `${t}.requirements`);
	let i = si(n.complete, `${t}.complete`), a = X(n.outcome, (e) => Ti(e, `${t}.outcome`));
	return a?.status === "complete" && !i && K(`${t}.outcome`), i && a !== null && a.status !== "complete" && K(`${t}.outcome`), {
		taskId: gi(n.task_id, `${t}.task_id`),
		title: ui(n.title, `${t}.title`, 200),
		optional: si(n.optional, `${t}.optional`),
		complete: i,
		requirements: r,
		writes: yi(n.writes, `${t}.writes`),
		wave: X(n.wave, (e) => J(e, `${t}.wave`, 0, 200)),
		selected: si(n.selected, `${t}.selected`),
		outcome: a,
		backpressure: X(n.backpressure, (e) => Ei(e, `${t}.backpressure`))
	};
}
function Oi(e, t) {
	let n = q(e, t, [
		"tasks",
		"waves",
		"findings"
	]), r = Y(n.tasks, `${t}.tasks`, 200).map((e, n) => Di(e, `${t}.tasks[${n}]`));
	Z(r.map((e) => e.taskId), `${t}.tasks`);
	let i = new Map(r.map((e) => [e.taskId, e])), a = Y(n.waves, `${t}.waves`, 200).map((e, n) => Y(e, `${t}.waves[${n}]`, 200).map((e, r) => {
		let a = `${t}.waves[${n}][${r}]`, o = gi(e, a);
		return i.get(o)?.wave !== n && K(a), o;
	}));
	Z(a.flat(), `${t}.waves`);
	let o = new Set(a.flat());
	for (let [e, n] of r.entries()) n.wave !== null && !o.has(n.taskId) && K(`${t}.tasks[${e}].wave`);
	return r.filter((e) => e.outcome?.status === "active").length > 3 && K(`${t}.tasks`), {
		tasks: r,
		waves: a,
		findings: Si(n.findings, `${t}.findings`)
	};
}
function ki(e, t) {
	let n = q(e, t, [
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
	]), r = oi(n.phase, B, `${t}.phase`), i = X(n.task_id, (e) => gi(e, `${t}.task_id`));
	i !== null != (r === "implementation") && K(`${t}.task_id`);
	let a = J(n.attempt, `${t}.attempt`, 1, 3), o = si(n.can_cancel, `${t}.can_cancel`), s = si(n.can_retry, `${t}.can_retry`);
	o && s && K(`${t}.can_retry`), s && a >= 3 && K(`${t}.can_retry`);
	let c = ui(n.session_slot, `${t}.session_slot`), l = n.session_link;
	l === null || typeof l == "string" && _i.test(l) || K(`${t}.session_link`);
	let u = yi(n.claim_paths, `${t}.claim_paths`);
	return u.length > 0 && i === null && K(`${t}.claim_paths`), {
		runId: fi(n.run_id, `${t}.run_id`),
		runSequence: J(n.run_sequence, `${t}.run_sequence`, 0, 1e6),
		ghostId: ui(n.ghost_id, `${t}.ghost_id`),
		sessionSlot: c,
		phase: r,
		taskId: i,
		attempt: a,
		canCancel: o,
		cancelRequested: si(n.cancel_requested, `${t}.cancel_requested`),
		canRetry: s,
		sessionLink: l,
		summary: X(n.summary, (e) => bi(e, `${t}.summary`, ni)),
		reasonCode: X(n.reason_code, (e) => mi(e, `${t}.reason_code`)),
		claimPaths: u
	};
}
function Ai(e, t) {
	let n = q(e, t, [
		"cycle",
		"status",
		"ghost_id",
		"session_link",
		"findings",
		"repairs"
	]), r = n.session_link;
	r === null || typeof r == "string" && _i.test(r) || K(`${t}.session_link`);
	let i = Y(n.findings, `${t}.findings`, 50).map((e, n) => {
		let r = `${t}.findings[${n}]`, i = q(e, r, [
			"finding_id",
			"requirement_ids",
			"paths",
			"summary"
		]), a = Y(i.requirement_ids, `${r}.requirement_ids`, 64).map((e, t) => gi(e, `${r}.requirement_ids[${t}]`));
		return Z(a, `${r}.requirement_ids`), {
			findingId: fi(i.finding_id, `${r}.finding_id`),
			requirementIds: a,
			paths: yi(i.paths, `${r}.paths`),
			summary: bi(i.summary, `${r}.summary`, ni)
		};
	});
	Z(i.map((e) => e.findingId), `${t}.findings`);
	let a = Y(n.repairs, `${t}.repairs`, 50).map((e, n) => {
		let r = `${t}.repairs[${n}]`, a = q(e, r, [
			"task_id",
			"finding_id",
			"title",
			"writes",
			"status"
		]), o = fi(a.finding_id, `${r}.finding_id`);
		return i.some((e) => e.findingId === o) || K(`${r}.finding_id`), {
			taskId: gi(a.task_id, `${r}.task_id`),
			findingId: o,
			title: ui(a.title, `${r}.title`, 200),
			writes: yi(a.writes, `${r}.writes`),
			status: oi(a.status, ti, `${r}.status`)
		};
	});
	Z(a.map((e) => e.findingId), `${t}.repairs`), Z(a.map((e) => e.taskId), `${t}.repairs`);
	let o = oi(n.status, ei, `${t}.status`);
	return o === "pass" && (i.length > 0 || a.length > 0) && K(`${t}.findings`), {
		cycle: J(n.cycle, `${t}.cycle`, 1, 3),
		status: o,
		ghostId: ui(n.ghost_id, `${t}.ghost_id`),
		sessionLink: r,
		findings: i,
		repairs: a
	};
}
var ji = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function Mi(e, t, n) {
	try {
		let r = q(e, "$", [
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
		r.schema_version !== 1 && K("$.schema_version"), r.read_only !== void 0 && typeof r.read_only != "boolean" && K("$.read_only");
		let i = r.mansion_id;
		(typeof i != "string" || i.length > 40 || !Kt.test(i)) && K("$.mansion_id"), t !== void 0 && i !== t && K("$.mansion_id");
		let a = r.spec_name;
		(typeof a != "string" || a.length > 40 || !ji.test(a)) && K("$.spec_name"), n !== void 0 && a !== n && K("$.spec_name"), Array.isArray(r.documents) && r.documents.length === Zr.length || K("$.documents");
		let o = Zr.map((e, t) => wi(r.documents[t], `$.documents[${t}]`, e, a)), s = Y(r.runs, "$.runs", 64).map((e, t) => ki(e, `$.runs[${t}]`));
		Z(s.map((e) => e.runId), "$.runs");
		let c = si(r.seance_enabled, "$.seance_enabled"), l = X(r.review, (e) => Ai(e, "$.review"));
		return l !== null && !c && K("$.review"), {
			ok: !0,
			roomGhosts: {
				mansionId: i,
				specName: a,
				version: J(r.version, "$.version"),
				integrity: oi(r.integrity, In, "$.integrity"),
				readOnly: r.read_only === !0,
				seanceEnabled: c,
				documents: o,
				taskPlan: X(r.task_plan, (e) => Oi(e, "$.task_plan")),
				runs: s,
				review: l
			}
		};
	} catch (e) {
		if (e instanceof ii) return {
			ok: !1,
			path: e.path
		};
		throw e;
	}
}
// src/core/room-view.ts
var Ni = 4e3;
function Pi(e) {
	switch (e.kind) {
		case "send_feedback": return `feedback:${e.phase}`;
		case "start_workshop": return "workshop";
		case "cancel_run":
		case "retry_run": return `run:${e.runId}`;
	}
}
var Fi = {
	loading: "Loading this room's output. Its controls are off until it arrives.",
	unavailable: "This room's output could not be read. Its controls are off; Door and approval decisions are unaffected.",
	malformed: "The house sent room output this page cannot read. This room's controls are off.",
	read_only: "This is a recording. Nothing can be sent, cancelled or retried here.",
	integrity: "The room's output failed its integrity check. Its controls are off until it is repaired.",
	mismatch: "The room's output and the house's state are from different moments. Refreshing before anything can be sent."
};
function Ii(e, t) {
	return t.documents.some((n) => {
		let r = e.phases[B.indexOf(n.phase)], i = r.door.proposal;
		return i === null || i.status !== "pending" || r.door.status !== "waiting" ? !1 : n.artifact === null ? !t.readOnly : n.artifact.artifactRevision.sha256 !== i.artifactRevision.sha256 || n.artifact.artifactRevision.revision !== i.artifactRevision.revision;
	});
}
function Li(e) {
	let t = (e, t = !1) => ({
		allowed: !1,
		block: e,
		text: Fi[e],
		needsRefresh: t
	});
	return e.roomGhosts?.readOnly === !0 ? t("read_only") : e.authority.canDecide ? e.roomGhostsStatus === "malformed" ? t("malformed") : e.roomGhosts === null || e.projection === null ? t(e.roomGhostsStatus === "unavailable" ? "unavailable" : "loading") : e.roomGhostsStatus === "ready" ? e.roomGhosts.integrity === "corrupt" || e.projection.integrity === "corrupt" ? t("integrity") : e.roomGhosts.integrity === e.projection.integrity ? e.roomGhosts.integrity === "valid" ? e.roomGhosts.mansionId !== e.projection.mansionId || e.roomGhosts.version !== e.projection.version || Ii(e.projection, e.roomGhosts) ? t("mismatch", !0) : {
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
var Ri = "Another request is on its way. Wait for it to finish.";
function zi(e, t, n, r, i = null) {
	let a = r === Pi(t), o = n.allowed ? i === null ? r === null ? null : Ri : i : n.text;
	return {
		label: e,
		command: o === null ? t : null,
		busy: a,
		blockedText: a ? null : o
	};
}
var Bi = {
	requirements: "Requirements document",
	design: "Design document",
	tasks: "Task plan"
}, Vi = {
	unwritten: "Not written yet",
	valid: "Valid: it passed the house's checks",
	invalid: "Not valid: it failed the house's checks",
	unknown: "Not checked here"
};
function Hi(e) {
	return e === 1 ? "1 byte" : `${e.toLocaleString("en-US")} bytes`;
}
function Ui(e) {
	return e === 0 ? "No findings" : e === 1 ? "1 finding" : `${e} findings`;
}
var Wi = /* @__PURE__ */ new Set(["waiting", "revision_required"]);
function Gi(e, t, n, r, i) {
	if (!Wi.has(e.status) || e.door.status === "open" || !n.runs.some((e) => e.phase === t)) return null;
	let a = `feedback:${t}`, o = r.allowed ? i !== null && i !== a ? Ri : null : r.text;
	return {
		phase: t,
		label: `Ask for a revision of the ${G[t].toLowerCase()}`,
		maxCharacters: Ni,
		enabled: o === null && i === null,
		busy: i === a,
		blockedText: o,
		expectedVersion: n.version
	};
}
function Ki(e) {
	let t = e.trim();
	return t === "" ? {
		ok: !1,
		text: "Write what should change before sending."
	} : t.length > 4e3 ? {
		ok: !1,
		text: `Keep the request under ${Ni.toLocaleString("en-US")} characters.`
	} : {
		ok: !0,
		feedback: t
	};
}
function qi(e) {
	for (let t of e.phases) {
		let e = t.door.proposal?.documentPath;
		if (e !== void 0 && e.includes("/")) return e.slice(0, e.lastIndexOf("/"));
	}
}
function Ji(e, t, n, r, i, a) {
	let o = t === null ? null : t.phases[B.indexOf(e)], s = o?.door.proposal ?? null, c = n?.documents[Zr.indexOf(e)] ?? null, l = c?.artifact ?? null, u = l?.artifactRevision ?? s?.artifactRevision ?? null, d = l !== null || t === null ? void 0 : qi(t), f = (l === null ? s?.documentPath ?? (d === void 0 ? void 0 : `${d}/${e}.md`) : void 0) ?? c?.documentPath ?? `.kiro/specs/${a}/${e}.md`, p = l === null ? u === null ? "unwritten" : "unknown" : l.validated ? "valid" : "invalid", m = s !== null && s.status === "pending" && o?.door.status === "waiting" ? s : null, h = l !== null && m !== null && (l.artifactRevision.sha256 !== m.artifactRevision.sha256 || l.artifactRevision.revision !== m.artifactRevision.revision);
	return {
		phase: e,
		title: Bi[e],
		documentPath: f,
		validation: p,
		validationText: Vi[p],
		revisionText: u === null ? null : `Revision ${u.revision} (${Hi(u.sizeBytes)})`,
		digest: u?.sha256 ?? null,
		digestPrefix: u === null ? null : Tr(u.sha256),
		content: l?.content ?? null,
		contentNote: l?.content == null ? u === null ? "Nothing has been written here yet." : n?.readOnly === !0 ? "The séance log records the path, revision and digest of a document, never its text, so this recording has no text to show." : l === null ? "The document text is not loaded. The facts below come from the door proposal." : "The house did not send the text of this document. Its path, revision and digest are exact." : null,
		findings: l?.findings ?? [],
		findingsText: Ui(l?.findings.length ?? 0),
		writeScope: c === null || l === null && f !== c.documentPath ? [f] : c.writeScope,
		doorNote: h ? `The text shown is revision ${l.artifactRevision.revision}. The door proposal covers revision ${m.artifactRevision.revision} (digest ${Tr(m.artifactRevision.sha256)}). The house is refreshing.` : null,
		feedback: o == null || n === null ? null : Gi(o, e, n, r, i)
	};
}
var Yi = "Opening this session from Haunted House is not available yet. Find it in Crew by its name.", Xi = "This is a recording: there is no Crew session to open.";
function Zi(e, t = 400) {
	let n = e.replace(/\s+/g, " ").trim(), r = Array.from(n);
	return r.length <= t ? n : `${r.slice(0, t - 1).join("").trimEnd()}…`;
}
function Qi(e, t, n, r, i, a) {
	let o = t.get(e.ghostId), s = o !== void 0 && o.run_id === e.runId ? o.state : null, c = s === null ? "Earlier run" : Dt[s], l = gr(e.ghostId, a), u = n.version;
	return {
		runId: e.runId,
		ghostId: e.ghostId,
		ghostName: l,
		phase: e.phase,
		taskId: e.taskId,
		state: s,
		stateText: c,
		attemptText: `Attempt ${e.attempt} of 3`,
		summary: e.summary === null ? null : Zi(e.summary),
		reasonText: Mt(e.reasonCode),
		writeScope: e.claimPaths,
		cancel: e.cancelRequested ? {
			label: "Cancelling…",
			command: null,
			busy: !1,
			blockedText: "Cancellation was requested. Waiting for Crew to confirm it."
		} : e.canCancel ? zi(`Cancel ${l}'s run`, {
			kind: "cancel_run",
			runId: e.runId,
			expectedVersion: u
		}, r, i) : null,
		retry: e.canRetry ? zi("Retry with a fresh session", {
			kind: "retry_run",
			runId: e.runId,
			expectedVersion: u
		}, r, i) : null,
		exhaustedText: !e.canRetry && !e.canCancel && e.attempt >= 3 && (s === "failed" || s === "blocked") ? "All 3 attempts are used. Nothing retries on its own." : null,
		sessionLink: {
			slotKey: n.readOnly ? null : e.sessionLink,
			label: `Open ${l}'s Crew session (${c})`,
			disabledText: n.readOnly ? Xi : e.sessionLink === null ? Yi : null
		}
	};
}
var $i = {
	not_selected: "Not selected",
	queued: "Queued",
	backpressure: "Queued: waiting for capacity",
	active: "A Tinker is working on it",
	complete: "Done",
	failed: "Failed",
	cancelled: "Cancelled",
	blocked: "Blocked",
	skipped: "Skipped"
}, ea = {
	crew_capacity: "Crew has no room for another ghost right now",
	local_capacity: "All 3 Tinker seats are taken",
	claim_busy: "Another task is writing the same files"
};
function ta(e) {
	return e.complete ? "complete" : e.outcome === null ? "not_selected" : e.outcome.status === "queued" && e.backpressure !== null ? "backpressure" : e.outcome.status;
}
function na(e) {
	if (e.complete) return null;
	if (e.backpressure !== null) {
		let { dispatchFailures: t, nextDelaySeconds: n, lastReason: r } = e.backpressure, i = t === 1 ? "1 refusal so far" : `${t} refusals so far`, a = n === 1 ? "1 second" : `${n} seconds`;
		return `${ea[r]}. Next try in ${a} (${i}). This does not use up an attempt.`;
	}
	return Mt(e.outcome?.reasonCode ?? null);
}
function ra(e) {
	return !e.complete && (e.outcome === null || e.outcome.status === "skipped");
}
function ia(e, t, n, r, i) {
	let a = t.taskPlan;
	if (a === null) return null;
	let o = new Map(n.filter((e) => e.taskId !== null).map((e) => [e.runId, e])), s = (e) => {
		let t = ta(e);
		return {
			taskId: e.taskId,
			title: e.title,
			optional: e.optional,
			complete: e.complete,
			status: t,
			statusText: $i[t],
			requirementsText: e.requirements.length === 0 ? "None" : e.requirements.join(", "),
			writes: e.writes,
			attemptText: e.outcome === null || e.outcome.attempt === 0 ? null : `Attempt ${e.outcome.attempt} of 3`,
			detail: na(e),
			selectable: ra(e),
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
	let u = a.tasks.filter((e) => e.outcome?.status === "active").length, d = e?.phases[B.indexOf("tasks")].door.status, f = r.allowed ? d === "open" ? a.findings.length > 0 ? "The task plan has findings. It needs a revision before any task can start." : a.tasks.some(ra) ? i !== null && i !== "workshop" ? Ri : null : "Every open task is already selected or done." : "Sealed door: approve the task plan before any task can start." : r.text;
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
function aa(e, t) {
	if (e.startBlockedText !== null || e.startBusy) return null;
	let n = e.waves.flatMap((e) => e.tasks), r = n.filter((e) => t.has(e.taskId)).map((e) => e.taskId);
	return r.length === 0 || r.length !== t.size || n.some((e) => t.has(e.taskId) && !e.selectable) ? null : {
		kind: "start_workshop",
		taskIds: r,
		expectedVersion: e.expectedVersion
	};
}
var oa = {
	study: ["requirements"],
	"drafting-room": ["design"],
	workshop: ["tasks"]
};
function sa(e) {
	let { room: t, projection: n, roomGhosts: r, snapshots: i } = e, a = e.names ?? {}, o = Li(e), s = t.phases.map((e) => e.phase), c = n === null ? [] : s.map((e) => n.phases[B.indexOf(e)]), l = new Set(t.ghosts.map((e) => e.ghostId)), u = r === null ? [] : r.runs.filter((e) => s.includes(e.phase)).map((t) => Qi(t, i, r, o, e.inFlight, a)).reverse(), d = r === null || t.id !== "workshop" ? null : ia(n, r, u, o, e.inFlight);
	return {
		projectionVersion: n?.version ?? 0,
		integrity: n === null ? "uncertain" : r === null ? n.integrity : ca(n.integrity, r.integrity),
		room: t.id,
		ghosts: Array.from(i.values()).filter((e) => l.has(e.ghost_id)),
		phases: c,
		gate: o,
		documents: oa[t.id].map((t) => Ji(t, n, r, o, e.inFlight, e.specName)),
		taskBoard: d,
		runs: u,
		outputNote: r === null ? e.roomGhostsStatus === "loading" ? Fi.loading : e.roomGhostsStatus === "malformed" ? Fi.malformed : Fi.unavailable : null,
		ownsImplementationStart: d !== null
	};
}
function ca(e, t) {
	return e === "corrupt" || t === "corrupt" ? "corrupt" : e === "uncertain" || t === "uncertain" ? "uncertain" : "valid";
}
function la(e, t, n, r, i) {
	if (!n.allowed || r !== null || e === null || t === null || i.expectedVersion !== e.version || i.expectedVersion !== t.version) return null;
	switch (i.kind) {
		case "send_feedback": {
			let n = Ki(i.feedback);
			if (!n.ok || n.feedback !== i.feedback) return null;
			let r = t.phases[B.indexOf(i.phase)];
			return !Wi.has(r.status) || r.door.status === "open" ? null : e.runs.some((e) => e.phase === i.phase) ? i : null;
		}
		case "start_workshop": {
			let n = e.taskPlan;
			if (n === null || n.findings.length > 0 || t.phases[B.indexOf("tasks")].door.status !== "open" || i.taskIds.length === 0 || new Set(i.taskIds).size !== i.taskIds.length) return null;
			let r = new Set(n.tasks.filter(ra).map((e) => e.taskId));
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
var ua = {
	reviewing: "The Medium is reviewing",
	pass: "Passed: the review found nothing to change",
	changes_requested: "Changes requested",
	blocked: "Blocked: the review needs your decision"
}, da = {
	proposed: "Proposed: not started",
	approved: "Approved for the Workshop",
	rejected: "Rejected"
};
function fa(e, t, n = {}) {
	if (e === null || !e.seanceEnabled || e.review === null) return null;
	let r = e.review, i = t.get(r.ghostId)?.state ?? null, a = i === null ? "No run yet" : Dt[i], o = gr(r.ghostId, n);
	return {
		status: r.status,
		statusText: ua[r.status],
		cycleText: `Review cycle ${r.cycle} of 3`,
		limitText: r.status === "blocked" || r.cycle >= 3 && r.status === "changes_requested" ? "Three review cycles ended without a pass. No fourth review starts on its own: the next step is your decision." : null,
		ghostName: o,
		state: i,
		stateText: a,
		findings: r.findings.map((e) => {
			let t = r.repairs.find((t) => t.findingId === e.findingId);
			return {
				findingId: e.findingId,
				summary: Zi(e.summary),
				requirementsText: e.requirementIds.length === 0 ? "None" : e.requirementIds.join(", "),
				paths: e.paths,
				repair: t === void 0 ? null : {
					taskId: t.taskId,
					title: t.title,
					writes: t.writes,
					status: t.status,
					statusText: da[t.status]
				}
			};
		}),
		sessionLink: {
			slotKey: e.readOnly ? null : r.sessionLink,
			label: `Open ${o}'s Crew session (${a})`,
			disabledText: e.readOnly ? Xi : r.sessionLink === null ? Yi : null
		}
	};
}
// src/rooms/house/use-revision-request.ts
function pa(e, t) {
	let [n, r] = O(!1), [i, a] = O(""), [o, s] = O(null), c = D(null), l = D(null), u = D(!1);
	return w(() => {
		n && !u.current && l.current?.focus(), !n && u.current && c.current?.focus(), u.current = n;
	}, [n]), {
		open: n,
		text: i,
		error: o,
		toggleRef: c,
		fieldRef: l,
		show: C(() => r(!0), []),
		hide: C(() => {
			r(!1), s(null);
		}, []),
		change: C((e) => {
			a(e), s(null);
		}, []),
		submit: C(() => {
			if (!e.enabled) return;
			let n = Ki(i);
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
function ma({ view: e, onSend: t }) {
	let n = pa(e, t), r = T(), i = T(), a = T(), o = T(), s = T();
	return /* @__PURE__ */ N("div", {
		className: "hh-revision",
		"data-revision": e.phase,
		children: [/* @__PURE__ */ M("div", {
			className: "hh-decide",
			"aria-busy": e.busy,
			children: /* @__PURE__ */ M("button", {
				type: "button",
				className: "hh-button hh-button-quiet",
				ref: n.toggleRef,
				"aria-expanded": n.open,
				"aria-controls": n.open ? r : void 0,
				onClick: n.open ? n.hide : n.show,
				children: e.busy ? "Sending the revision request…" : e.label
			})
		}), n.open ? /* @__PURE__ */ N("form", {
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
				/* @__PURE__ */ M("label", {
					htmlFor: i,
					children: "What should change?"
				}),
				/* @__PURE__ */ M("textarea", {
					id: i,
					ref: n.fieldRef,
					value: n.text,
					maxLength: e.maxCharacters,
					rows: 4,
					"aria-describedby": n.error === null ? a : `${a} ${o}`,
					"aria-invalid": n.error !== null,
					onChange: (e) => n.change(e.target.value)
				}),
				/* @__PURE__ */ N("p", {
					className: "hh-proposal-sub",
					id: a,
					children: [
						"Sent once, to the same ghost session. The door stays sealed until you approve a new revision. Up to",
						" ",
						e.maxCharacters.toLocaleString("en-US"),
						" characters."
					]
				}),
				n.error === null ? null : /* @__PURE__ */ N("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: o,
					children: [/* @__PURE__ */ M(f, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ M("span", { children: n.error })]
				}),
				e.blockedText === null ? null : /* @__PURE__ */ N("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: s,
					children: [/* @__PURE__ */ M(f, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ M("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ N("div", {
					className: "hh-decide",
					children: [/* @__PURE__ */ N("button", {
						type: "submit",
						className: "hh-button hh-button-primary",
						"aria-disabled": !e.enabled,
						"aria-describedby": e.blockedText === null ? void 0 : s,
						children: [/* @__PURE__ */ M(v, {
							size: 16,
							"aria-hidden": !0
						}), "Send revision request"]
					}), /* @__PURE__ */ N("button", {
						type: "button",
						className: "hh-button",
						onClick: n.hide,
						children: [/* @__PURE__ */ M(x, {
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
function ha({ title: e, lines: t, empty: n }) {
	return /* @__PURE__ */ N(j, { children: [/* @__PURE__ */ M("p", {
		className: "hh-proposal-group",
		children: e
	}), t.length === 0 ? /* @__PURE__ */ M("p", {
		className: "hh-proposal-sub",
		children: n
	}) : /* @__PURE__ */ M("dl", {
		className: "hh-facts",
		children: t.map((e, t) => /* @__PURE__ */ N("div", {
			style: { display: "contents" },
			children: [/* @__PURE__ */ M("dt", { children: e.label }), /* @__PURE__ */ M("dd", { children: /* @__PURE__ */ M("code", { children: e.value }) })]
		}, `${e.label}-${t}`))
	})] });
}
function ga({ view: e, onSend: t }) {
	let n = e.ghostName, r = T(), i = T(), a = e.status === "pending";
	return /* @__PURE__ */ N("article", {
		className: "hh-proposal",
		"aria-labelledby": r,
		"data-state": e.status,
		"data-blocked": a && !e.complete,
		"data-proposal": e.proposalId,
		children: [
			/* @__PURE__ */ N("div", {
				className: "hh-proposal-head",
				children: [/* @__PURE__ */ M(Ct, { status: e.status }), /* @__PURE__ */ N("h5", {
					id: r,
					children: [
						n,
						" asks: ",
						e.title
					]
				})]
			}),
			/* @__PURE__ */ M("p", {
				className: "hh-proposal-sub",
				children: e.statusText
			}),
			e.complete ? /* @__PURE__ */ N(j, { children: [
				/* @__PURE__ */ M(ha, {
					title: "Scope",
					lines: e.scope,
					empty: "No scope."
				}),
				/* @__PURE__ */ M(ha, {
					title: "Exact arguments",
					lines: e.arguments,
					empty: "No arguments."
				}),
				/* @__PURE__ */ M(ha, {
					title: "Paths it may touch",
					lines: e.paths,
					empty: "No paths."
				})
			] }) : null,
			/* @__PURE__ */ N("dl", {
				className: "hh-facts",
				children: [/* @__PURE__ */ M("dt", { children: "Digest" }), /* @__PURE__ */ N("dd", { children: [/* @__PURE__ */ M("code", { children: e.digestPrefix }), " (first 12 characters of the action's SHA-256)"] })]
			}),
			a ? /* @__PURE__ */ N(j, { children: [
				/* @__PURE__ */ M("p", {
					className: "hh-proposal-sub",
					children: e.oneAttemptText
				}),
				e.blockedText === null ? null : /* @__PURE__ */ N("p", {
					className: "hh-proposal-note hh-proposal-blocked",
					id: i,
					children: [/* @__PURE__ */ M(f, {
						size: 16,
						"aria-hidden": !0
					}), /* @__PURE__ */ M("span", { children: e.blockedText })]
				}),
				/* @__PURE__ */ M(Yr, {
					approve: e.approve,
					reject: e.reject,
					busy: e.busy,
					subject: `${e.title.toLowerCase()} for ${n}, digest ${e.digestPrefix}`,
					describedBy: e.blockedText === null ? void 0 : i,
					onSend: t
				})
			] }) : e.outcomeText === null ? null : /* @__PURE__ */ N("p", {
				className: "hh-proposal-note hh-proposal-outcome",
				"data-outcome": e.status,
				children: [/* @__PURE__ */ M(Ct, { status: e.status }), /* @__PURE__ */ M("span", { children: e.outcomeText })]
			})
		]
	});
}
// src/core/markdown-blocks.ts
var _a = 1500, va = /* @__PURE__ */ RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\u2028\u2029\\u202a-\\u202e\\u2066-\\u2069]", "g");
function ya(e) {
	return e.replace(/\r\n?/g, "\n").replace(va, "");
}
var ba = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|((?<![A-Za-z0-9_])_(?![\s_])[^_\n]+(?<!\s)_(?![A-Za-z0-9_]))/g;
function xa(e) {
	let t = [], n = 0;
	for (let r of e.matchAll(ba)) {
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
var Sa = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/, Ca = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]{0,24})/, wa = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/, Ta = /^(\s*)(?:([-*+])|(\d{1,4})[.)])\s+(.*)$/, Ea = /^\[( |x|X)\](\*?)\s+(.*)$/, Da = /^\s*\|.*\|\s*$/;
function Oa(e, t = _a) {
	let n = ya(e).split("\n"), r = [], i = [], a = [], o = !1, s = () => {
		i.length > 0 && (r.push({
			kind: "paragraph",
			inlines: xa(i.join(" "))
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
		let c = n[e], l = Ca.exec(c);
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
		let u = Sa.exec(c);
		if (u !== null) {
			s(), r.push({
				kind: "heading",
				level: u[1].length,
				inlines: xa(u[2])
			});
			continue;
		}
		if (wa.test(c)) {
			s(), r.push({ kind: "rule" });
			continue;
		}
		if (Da.test(c)) {
			s();
			let t = [c];
			for (; e + 1 < n.length && Da.test(n[e + 1]);) e += 1, t.push(n[e]);
			r.push({
				kind: "code",
				language: "table",
				text: t.join("\n")
			});
			continue;
		}
		let d = Ta.exec(c);
		if (d !== null) {
			i.length > 0 && s();
			let e = Ea.exec(d[4]);
			a.push({
				depth: Math.min(Math.floor(d[1].replace(/\t/g, "  ").length / 2), 5),
				checked: e === null ? null : e[1] !== " ",
				optional: e !== null && e[2] === "*",
				number: d[3] === void 0 ? null : `${d[3]}.`,
				inlines: xa(e === null ? d[4] : e[3])
			});
		} else c.trimStart().startsWith(">") ? (s(), r.push({
			kind: "quote",
			inlines: xa(c.trimStart().replace(/^>\s?/, ""))
		})) : (a.length > 0 && s(), i.push(c.trim()));
	}
	return o || s(), {
		blocks: r,
		truncated: o
	};
}
// src/components/MarkdownView.tsx
function ka({ parts: e }) {
	return /* @__PURE__ */ M(j, { children: e.map((e, t) => {
		switch (e.kind) {
			case "code": return /* @__PURE__ */ M("code", { children: e.text }, t);
			case "strong": return /* @__PURE__ */ M("strong", { children: e.text }, t);
			case "emphasis": return /* @__PURE__ */ M("em", { children: e.text }, t);
			default: return /* @__PURE__ */ M("span", { children: e.text }, t);
		}
	}) });
}
function Aa({ item: e }) {
	return /* @__PURE__ */ N("li", {
		className: "hh-md-item",
		style: { marginLeft: `${e.depth * 1.25}rem` },
		"data-checked": e.checked ?? void 0,
		children: [e.checked === null ? /* @__PURE__ */ M("span", {
			className: "hh-md-marker",
			"aria-hidden": !0,
			children: e.number ?? "•"
		}) : e.checked ? /* @__PURE__ */ M(r, {
			size: 14,
			"aria-hidden": !0
		}) : /* @__PURE__ */ M(y, {
			size: 14,
			"aria-hidden": !0
		}), /* @__PURE__ */ N("span", { children: [
			e.checked === null ? e.number === null ? null : /* @__PURE__ */ N("span", {
				className: "hh-visually-hidden",
				children: [e.number, " "]
			}) : /* @__PURE__ */ N("span", {
				className: "hh-visually-hidden",
				children: [
					e.checked ? "Done" : "Open",
					e.optional ? ", optional" : "",
					":",
					" "
				]
			}),
			/* @__PURE__ */ M(ka, { parts: e.inlines }),
			e.optional ? /* @__PURE__ */ M("span", {
				"aria-hidden": !0,
				children: " (optional)"
			}) : null
		] })]
	});
}
function ja({ block: e, baseLevel: t }) {
	switch (e.kind) {
		case "heading": return /* @__PURE__ */ M("p", {
			className: "hh-md-heading",
			role: "heading",
			"aria-level": t + e.level - 1,
			"data-level": e.level,
			children: /* @__PURE__ */ M(ka, { parts: e.inlines })
		});
		case "paragraph": return /* @__PURE__ */ M("p", { children: /* @__PURE__ */ M(ka, { parts: e.inlines }) });
		case "quote": return /* @__PURE__ */ M("p", {
			className: "hh-md-quote",
			children: /* @__PURE__ */ M(ka, { parts: e.inlines })
		});
		case "list": return /* @__PURE__ */ M("ul", {
			className: "hh-md-list",
			children: e.items.map((e, t) => /* @__PURE__ */ M(Aa, { item: e }, t))
		});
		case "code": return /* @__PURE__ */ M("pre", {
			"data-language": e.language === "" ? void 0 : e.language,
			children: /* @__PURE__ */ M("code", { children: e.text })
		});
		case "rule": return /* @__PURE__ */ M("hr", {});
	}
}
function Ma({ text: e, baseLevel: t = 6 }) {
	let n = E(() => Oa(e), [e]);
	return /* @__PURE__ */ N(j, { children: [n.blocks.map((e, n) => /* @__PURE__ */ M(ja, {
		block: e,
		baseLevel: t
	}, n)), n.truncated ? /* @__PURE__ */ M("p", {
		className: "hh-artifact-note",
		children: "The document is longer than this view shows. Its digest covers all of it."
	}) : null] });
}
// src/components/ArtifactView.tsx
var Na = {
	unwritten: "plain",
	unknown: "plain",
	valid: "ok",
	invalid: "attention"
};
function Pa({ state: e }) {
	let n = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "valid": return /* @__PURE__ */ M(i, { ...n });
		case "invalid": return /* @__PURE__ */ M(t, { ...n });
		default: return /* @__PURE__ */ M(a, { ...n });
	}
}
function Fa({ view: e }) {
	let t = T();
	return /* @__PURE__ */ N("article", {
		className: "hh-artifact",
		"aria-labelledby": t,
		"data-artifact": e.phase,
		"data-validation": e.validation,
		children: [
			/* @__PURE__ */ N("div", {
				className: "hh-artifact-head",
				children: [/* @__PURE__ */ M(l, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("h5", {
					id: t,
					children: e.title
				})]
			}),
			e.content === null ? /* @__PURE__ */ M("p", {
				className: "hh-artifact-note",
				"data-content": "none",
				children: e.contentNote
			}) : /* @__PURE__ */ M("div", {
				className: "hh-document",
				role: "region",
				"aria-label": `${e.title} text`,
				tabIndex: 0,
				"data-content": "text",
				children: /* @__PURE__ */ M(Ma, { text: e.content })
			}),
			e.doorNote === null ? null : /* @__PURE__ */ N("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				"data-door-note": !0,
				children: [/* @__PURE__ */ M(b, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: e.doorNote })]
			}),
			/* @__PURE__ */ N("p", {
				className: "hh-room-line",
				"data-tone": Na[e.validation],
				"data-validation-line": !0,
				children: [/* @__PURE__ */ M(Pa, { state: e.validation }), /* @__PURE__ */ N("span", { children: [e.validationText, e.findings.length > 0 ? `. ${e.findingsText}:` : ""] })]
			}),
			e.findings.length === 0 ? null : /* @__PURE__ */ M("ul", {
				className: "hh-findings",
				"aria-label": `${e.title} findings`,
				children: e.findings.map((e, t) => /* @__PURE__ */ N("li", {
					"data-finding": e.code,
					children: [
						/* @__PURE__ */ M("code", { children: e.location }),
						": ",
						e.message,
						" ",
						/* @__PURE__ */ N("span", {
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
			/* @__PURE__ */ N("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ M("dt", { children: "Document" }),
					/* @__PURE__ */ M("dd", { children: /* @__PURE__ */ M("code", { children: e.documentPath }) }),
					e.revisionText === null ? null : /* @__PURE__ */ N(j, { children: [/* @__PURE__ */ M("dt", { children: "Revision" }), /* @__PURE__ */ M("dd", { children: e.revisionText })] }),
					e.digest === null ? null : /* @__PURE__ */ N(j, { children: [/* @__PURE__ */ M("dt", { children: "Digest" }), /* @__PURE__ */ N("dd", { children: [/* @__PURE__ */ M("code", {
						"data-digest": !0,
						children: e.digest
					}), " (SHA-256 of these bytes)"] })] }),
					/* @__PURE__ */ N("dt", { children: [/* @__PURE__ */ M(f, {
						size: 14,
						"aria-hidden": !0
					}), " May write"] }),
					/* @__PURE__ */ N("dd", { children: [/* @__PURE__ */ M("ul", {
						className: "hh-scope",
						"aria-label": `Paths the ghost of this room may write for the ${e.title.toLowerCase()}`,
						children: e.writeScope.map((e) => /* @__PURE__ */ M("li", { children: /* @__PURE__ */ M("code", { children: e }) }, e))
					}), "Nothing else: every other write needs your approval."] })
				]
			})
		]
	});
}
// src/components/GhostOutputSummary.tsx
function Ia({ run: e }) {
	return /* @__PURE__ */ N("div", {
		className: "hh-run",
		"data-run": e.runId,
		"data-ghost": e.ghostId,
		"data-state": e.state ?? "earlier",
		children: [
			/* @__PURE__ */ N("p", {
				className: "hh-room-line",
				"data-tone": e.state === null ? "plain" : yt[e.state],
				children: [e.state === null ? /* @__PURE__ */ M(a, {
					size: 16,
					"aria-hidden": !0
				}) : /* @__PURE__ */ M(St, { state: e.state }), /* @__PURE__ */ N("span", { children: [
					e.ghostName,
					": ",
					e.stateText,
					e.taskId === null ? "" : `, task ${e.taskId}`,
					". ",
					e.attemptText,
					"."
				] })]
			}),
			e.summary === null ? null : /* @__PURE__ */ M("p", {
				className: "hh-run-summary",
				"data-summary": !0,
				children: e.summary
			}),
			e.reasonText === null ? null : /* @__PURE__ */ N("p", {
				className: "hh-room-line",
				"data-tone": "attention",
				"data-reason": !0,
				children: [/* @__PURE__ */ M(b, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: e.reasonText })]
			}),
			e.writeScope.length === 0 ? null : /* @__PURE__ */ N("p", {
				className: "hh-room-line",
				"data-claim": !0,
				children: [/* @__PURE__ */ M(f, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ N("span", { children: [
					"This run may write only:",
					" ",
					e.writeScope.map((e, t) => /* @__PURE__ */ N("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ M("code", { children: e })] }, e))
				] })]
			})
		]
	});
}
// src/components/RunRecoveryControls.tsx
function La({ view: e, kind: n, describedBy: r, onSend: i }) {
	let a = e.command;
	return /* @__PURE__ */ N("button", {
		type: "button",
		className: n === "cancel" ? "hh-button hh-button-reject" : "hh-button",
		"data-control": n,
		"aria-disabled": a === null,
		"aria-describedby": a === null && e.blockedText !== null ? r : void 0,
		onClick: () => {
			a !== null && i(a);
		},
		children: [M(n === "cancel" ? t : _, {
			size: 16,
			"aria-hidden": !0
		}), e.busy ? "Sending…" : e.label]
	});
}
function Ra({ run: e, onSend: t }) {
	let n = T(), r = e.cancel?.blockedText ?? e.retry?.blockedText ?? null;
	return e.cancel === null && e.retry === null && e.exhaustedText === null ? null : /* @__PURE__ */ N("div", {
		className: "hh-recovery",
		"data-recovery": e.runId,
		children: [
			e.cancel === null && e.retry === null ? null : /* @__PURE__ */ N("div", {
				className: "hh-decide",
				"aria-busy": (e.cancel?.busy ?? !1) || (e.retry?.busy ?? !1),
				children: [e.cancel === null ? null : /* @__PURE__ */ M(La, {
					view: e.cancel,
					kind: "cancel",
					describedBy: n,
					onSend: t
				}), e.retry === null ? null : /* @__PURE__ */ M(La, {
					view: e.retry,
					kind: "retry",
					describedBy: n,
					onSend: t
				})]
			}),
			r === null ? null : /* @__PURE__ */ N("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				id: n,
				children: [/* @__PURE__ */ M(f, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: r })]
			}),
			e.exhaustedText === null ? null : /* @__PURE__ */ N("p", {
				className: "hh-proposal-note",
				"data-exhausted": !0,
				children: [/* @__PURE__ */ M(f, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: e.exhaustedText })]
			})
		]
	});
}
// src/rooms/workshop/use-task-selection.ts
function za(e) {
	let [t, n] = O(() => /* @__PURE__ */ new Set()), r = E(() => {
		let n = new Set(e.waves.flatMap((e) => e.tasks.filter((e) => e.selectable).map((e) => e.taskId)));
		return new Set([...t].filter((e) => n.has(e)));
	}, [e.waves, t]), i = C((e) => {
		n((t) => {
			let n = new Set(t);
			return n.delete(e) || n.add(e), n;
		});
	}, []), a = C(() => n(/* @__PURE__ */ new Set()), []);
	return {
		chosen: r,
		toggle: i,
		command: E(() => aa(e, r), [e, r]),
		clear: a
	};
}
// src/rooms/workshop/WorkshopTaskBoard.tsx
var Ba = {
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
function Va({ status: e }) {
	let n = {
		size: 16,
		"aria-hidden": !0
	};
	switch (e) {
		case "complete": return /* @__PURE__ */ M(r, { ...n });
		case "active": return /* @__PURE__ */ M(d, {
			...n,
			className: "hh-spin"
		});
		case "queued":
		case "backpressure": return /* @__PURE__ */ M(u, { ...n });
		case "failed": return /* @__PURE__ */ M(b, { ...n });
		case "blocked": return /* @__PURE__ */ M(f, { ...n });
		case "cancelled": return /* @__PURE__ */ M(t, { ...n });
		case "not_selected":
		case "skipped": return /* @__PURE__ */ M(a, { ...n });
	}
}
function Ha({ row: e, chosen: t, onToggle: n, onSend: r, onOpenSession: i }) {
	let a = T();
	return /* @__PURE__ */ N("li", {
		className: "hh-task",
		"data-task": e.taskId,
		"data-status": e.status,
		"aria-labelledby": a,
		children: [
			/* @__PURE__ */ N("div", {
				className: "hh-task-head",
				children: [
					e.selectable ? /* @__PURE__ */ M("input", {
						type: "checkbox",
						checked: t,
						"aria-label": `Select task ${e.taskId}: ${e.title}`,
						onChange: () => n(e.taskId)
					}) : null,
					/* @__PURE__ */ N("span", {
						id: a,
						children: [
							/* @__PURE__ */ M("span", {
								className: "hh-task-id",
								children: e.taskId
							}),
							" ",
							e.title
						]
					}),
					e.optional ? /* @__PURE__ */ M("span", {
						className: "hh-tag",
						children: "Optional"
					}) : null
				]
			}),
			/* @__PURE__ */ N("p", {
				className: "hh-room-line",
				"data-tone": Ba[e.status],
				"data-task-status": !0,
				children: [/* @__PURE__ */ M(Va, { status: e.status }), /* @__PURE__ */ N("span", { children: [e.statusText, e.attemptText === null ? "" : `. ${e.attemptText}`] })]
			}),
			e.detail === null ? null : /* @__PURE__ */ M("p", {
				className: "hh-task-detail",
				"data-task-detail": !0,
				children: e.detail
			}),
			/* @__PURE__ */ N("dl", {
				className: "hh-facts",
				children: [
					/* @__PURE__ */ M("dt", { children: "Requirements" }),
					/* @__PURE__ */ M("dd", { children: e.requirementsText }),
					/* @__PURE__ */ M("dt", { children: "May write" }),
					/* @__PURE__ */ M("dd", { children: e.writes.map((e, t) => /* @__PURE__ */ N("span", { children: [t > 0 ? ", " : "", /* @__PURE__ */ M("code", { children: e })] }, e)) })
				]
			}),
			e.run === null ? null : /* @__PURE__ */ N(j, { children: [
				/* @__PURE__ */ M(Ia, { run: e.run }),
				/* @__PURE__ */ M(Ra, {
					run: e.run,
					onSend: r
				}),
				/* @__PURE__ */ M(gt, {
					view: e.run.sessionLink,
					onOpen: i
				})
			] })
		]
	});
}
function Ua({ board: e, onSend: t, onOpenSession: n }) {
	let r = za(e), i = T(), a = T(), o = r.chosen.size, s = e.startBlockedText ?? (o === 0 ? "Tick at least one open task to start." : null);
	return /* @__PURE__ */ N("section", {
		className: "hh-board",
		"aria-labelledby": i,
		"data-board": !0,
		children: [
			/* @__PURE__ */ M("h5", {
				id: i,
				children: "Task board"
			}),
			/* @__PURE__ */ N("p", {
				className: "hh-room-line",
				"data-board-summary": !0,
				children: [/* @__PURE__ */ M(u, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ N("span", { children: [
					e.doneCount,
					" of ",
					e.taskCount,
					" tasks done. ",
					e.capacityText,
					"."
				] })]
			}),
			e.findings.length === 0 ? null : /* @__PURE__ */ M("ul", {
				className: "hh-findings",
				"aria-label": "Task plan findings",
				children: e.findings.map((e, t) => /* @__PURE__ */ N("li", {
					"data-finding": e.code,
					children: [
						/* @__PURE__ */ M("code", { children: e.location }),
						": ",
						e.message,
						" ",
						/* @__PURE__ */ N("span", {
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
			e.waves.map((e) => /* @__PURE__ */ M(Wa, {
				title: e.title,
				children: e.tasks.map((e) => /* @__PURE__ */ M(Ha, {
					row: e,
					chosen: r.chosen.has(e.taskId),
					onToggle: r.toggle,
					onSend: t,
					onOpenSession: n
				}, e.taskId))
			}, e.wave ?? "outside")),
			/* @__PURE__ */ M("div", {
				className: "hh-decide",
				"aria-busy": e.startBusy,
				children: /* @__PURE__ */ N("button", {
					type: "button",
					className: "hh-button hh-button-primary",
					"data-control": "start-workshop",
					"aria-disabled": r.command === null,
					"aria-describedby": r.command === null && s !== null ? a : void 0,
					onClick: () => {
						r.command !== null && (t(r.command), r.clear());
					},
					children: [/* @__PURE__ */ M(m, {
						size: 16,
						"aria-hidden": !0
					}), e.startBusy ? "Starting…" : o === 1 ? "Start 1 selected task" : `Start ${o} selected tasks`]
				})
			}),
			r.command !== null || s === null ? null : /* @__PURE__ */ N("p", {
				className: "hh-proposal-note hh-proposal-blocked",
				id: a,
				children: [/* @__PURE__ */ M(f, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: s })]
			})
		]
	});
}
function Wa({ title: e, children: t }) {
	let n = T();
	return /* @__PURE__ */ N("div", {
		className: "hh-wave",
		role: "group",
		"aria-labelledby": n,
		children: [/* @__PURE__ */ M("p", {
			className: "hh-proposal-group",
			id: n,
			children: e
		}), /* @__PURE__ */ M("ul", {
			className: "hh-tasks",
			children: t
		})]
	});
}
// src/rooms/house/RoomOutput.tsx
function Ga({ output: e, onSend: t, onOpenSession: n }) {
	return /* @__PURE__ */ N("div", {
		className: "hh-output",
		"data-room-output": e.room,
		children: [
			e.outputNote === null ? null : /* @__PURE__ */ N("p", {
				className: "hh-house-note hh-house-muted",
				"data-output-note": !0,
				children: [/* @__PURE__ */ M(g, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: e.outputNote })]
			}),
			e.documents.map((e) => /* @__PURE__ */ M(Fa, { view: e }, e.phase)),
			e.taskBoard === null ? null : /* @__PURE__ */ M(Ua, {
				board: e.taskBoard,
				onSend: t,
				onOpenSession: n
			})
		]
	});
}
// src/rooms/house/RoomRuns.tsx
function Ka({ output: e, onSend: t, onOpenSession: n }) {
	let r = new Set(e.taskBoard?.waves.flatMap((e) => e.tasks.flatMap((e) => e.run === null ? [] : [e.run.runId])) ?? []), i = e.runs.filter((e) => !r.has(e.runId));
	return i.length === 0 ? null : /* @__PURE__ */ N("div", {
		className: "hh-phase",
		"data-room-runs": !0,
		children: [/* @__PURE__ */ M("p", {
			className: "hh-proposal-group",
			children: "Runs in this room"
		}), /* @__PURE__ */ M("ul", {
			className: "hh-runs",
			children: i.map((e) => /* @__PURE__ */ N("li", { children: [
				/* @__PURE__ */ M(Ia, { run: e }),
				/* @__PURE__ */ M(Ra, {
					run: e,
					onSend: t
				}),
				/* @__PURE__ */ M(gt, {
					view: e.sessionLink,
					onOpen: n
				})
			] }, e.runId))
		})]
	});
}
// src/rooms/house/RoomPanel.tsx
var qa = () => {}, Ja = S(function({ id: e, titleId: t, detail: n, onClose: r, onSend: i, output: a = null, onRoomSend: o = qa, onOpenSession: s = null }, c) {
	let { room: l } = n;
	return /* @__PURE__ */ N("section", {
		className: "hh-room-panel",
		id: e,
		"aria-labelledby": t,
		"data-room-panel": l.id,
		children: [
			/* @__PURE__ */ N("div", {
				className: "hh-room-panel-head",
				children: [/* @__PURE__ */ M("h4", {
					id: t,
					ref: c,
					tabIndex: -1,
					children: l.name
				}), /* @__PURE__ */ N("button", {
					type: "button",
					className: "hh-button",
					onClick: r,
					children: [/* @__PURE__ */ M(x, {
						size: 16,
						"aria-hidden": !0
					}), "Close room"]
				})]
			}),
			a === null ? null : /* @__PURE__ */ M(Ga, {
				output: a,
				onSend: o,
				onOpenSession: s
			}),
			n.phases.map(({ line: e, start: t, door: n }) => /* @__PURE__ */ N("div", {
				className: "hh-phase",
				"data-phase": e.phase,
				"data-status": e.status,
				children: [
					/* @__PURE__ */ N("p", {
						className: "hh-room-line",
						"data-tone": _t[e.status],
						children: [/* @__PURE__ */ M(bt, { status: e.status }), /* @__PURE__ */ N("span", { children: [
							e.name,
							": ",
							e.statusText
						] })]
					}),
					/* @__PURE__ */ N("p", {
						className: "hh-room-line",
						"data-tone": vt[e.doorStatus],
						children: [/* @__PURE__ */ M(xt, { status: e.doorStatus }), /* @__PURE__ */ M("span", { children: e.doorHint })]
					}),
					t === null || e.phase === "implementation" && a?.ownsImplementationStart === !0 ? null : /* @__PURE__ */ M("div", {
						className: "hh-decide",
						"aria-busy": t.busy,
						children: /* @__PURE__ */ N("button", {
							type: "button",
							className: "hh-button hh-button-primary",
							"aria-disabled": t.command === null,
							onClick: () => {
								t.command !== null && i(t.command);
							},
							children: [/* @__PURE__ */ M(m, {
								size: 16,
								"aria-hidden": !0
							}), t.busy ? "Starting…" : t.label]
						})
					}),
					n === null ? null : /* @__PURE__ */ M(Xr, {
						view: n,
						onSend: i
					}),
					a?.documents.map((t) => t.phase === e.phase && t.feedback !== null ? /* @__PURE__ */ M(ma, {
						view: t.feedback,
						onSend: o
					}, t.phase) : null)
				]
			}, e.phase)),
			/* @__PURE__ */ N("div", {
				className: "hh-phase",
				children: [/* @__PURE__ */ M("p", {
					className: "hh-proposal-group",
					children: "Ghosts in this room"
				}), l.ghosts.length === 0 ? /* @__PURE__ */ N("p", {
					className: "hh-room-line",
					children: [/* @__PURE__ */ M(St, { state: "idle" }), /* @__PURE__ */ M("span", { children: "No ghost here yet" })]
				}) : /* @__PURE__ */ M("ul", {
					className: "hh-ghost-lines",
					children: l.ghosts.map((e) => /* @__PURE__ */ N("li", {
						className: "hh-room-line",
						"data-tone": yt[e.state],
						"data-ghost": e.ghostId,
						children: [/* @__PURE__ */ M(St, { state: e.state }), /* @__PURE__ */ N("span", { children: [
							e.name,
							": ",
							e.stateText,
							e.pendingText === null ? null : `, ${e.pendingText}`,
							e.reason === null ? null : `. ${e.reason}`
						] })]
					}, e.key))
				})]
			}),
			n.risky.length === 0 ? null : /* @__PURE__ */ N("div", {
				className: "hh-phase",
				children: [/* @__PURE__ */ M("p", {
					className: "hh-proposal-group",
					children: "Risky actions"
				}), n.risky.map((e) => /* @__PURE__ */ M(ga, {
					view: e,
					onSend: i
				}, e.proposalId))]
			}),
			a === null ? null : /* @__PURE__ */ M(Ka, {
				output: a,
				onSend: o,
				onOpenSession: s
			})
		]
	});
}), Ya = [
	"waiting",
	"blocked",
	"failed"
], Xa = 1e4;
function Za(e) {
	return Ya.includes(e);
}
// src/core/notify-coalescer.ts
var Qa = Xa, $a = Ya, eo = {
	windows: /* @__PURE__ */ new Map(),
	nowMs: -Infinity
};
function to(e, t) {
	let n = e[e.length - 1];
	if (e.length === 1) return {
		ghostKey: n.ghostKey,
		text: n.text,
		count: 1,
		atMs: t
	};
	let r = $a.filter((t) => e.some((e) => e.kind === t)).map((e) => Dt[e].toLowerCase());
	return {
		ghostKey: n.ghostKey,
		text: `${n.ghostName}: ${e.length} more updates (${r.join(", ")}). Latest: ${n.text}`,
		count: e.length,
		atMs: t
	};
}
function no(e, t) {
	let n = Math.max(t, e.nowMs), r = null, i = [];
	for (let [t, a] of e.windows) n - a.openedAtMs < Qa || (r ??= new Map(e.windows), a.held.length === 0 ? r.delete(t) : (i.push(to(a.held, n)), r.set(t, {
		openedAtMs: n,
		held: []
	})));
	return {
		state: {
			windows: r ?? e.windows,
			nowMs: n
		},
		toasts: i
	};
}
function ro(e, t, n) {
	let r = no(e, n), i = r.state.nowMs, a = new Map(r.state.windows), o = a.get(t.ghostKey);
	return o === void 0 ? (a.set(t.ghostKey, {
		openedAtMs: i,
		held: []
	}), {
		state: {
			windows: a,
			nowMs: i
		},
		toasts: [...r.toasts, {
			ghostKey: t.ghostKey,
			text: t.text,
			count: 1,
			atMs: i
		}]
	}) : (a.set(t.ghostKey, {
		openedAtMs: o.openedAtMs,
		held: [...o.held, t]
	}), {
		state: {
			windows: a,
			nowMs: i
		},
		toasts: r.toasts
	});
}
function io(e) {
	let t = null;
	for (let n of e.windows.values()) {
		let e = n.openedAtMs + Qa;
		(t === null || e < t) && (t = e);
	}
	return t;
}
function ao(e) {
	return Za(e);
}
function oo(e, t) {
	return JSON.stringify([e, t]);
}
function so(e, t) {
	let n = Object.hasOwn(t, e) ? t[e] : void 0;
	return n === void 0 || n.trim() === "" ? Nt(e) : n;
}
var co = {
	waiting: (e) => `${e} is waiting for your approval.`,
	blocked: (e) => `${e} is blocked.`,
	failed: (e) => `${e} failed.`
};
function lo(e) {
	let t = e.names ?? {}, n = /* @__PURE__ */ new Map();
	for (let t of e.snapshots) n.set(oo(t.mansion_id, t.ghost_id), t);
	let r = /* @__PURE__ */ new Map();
	for (let t of e.transitions) t.from_state !== t.to_state && r.set(oo(t.mansion_id, t.ghost_id), t);
	let i = [], a = [];
	for (let o of e.transitions) {
		if (e.seen.has(o.transition_id)) continue;
		i.push(o.transition_id);
		let s = oo(o.mansion_id, o.ghost_id);
		if (r.get(s) !== o || o.ghost_id === "house-operator") continue;
		let c = n.get(s);
		if (c === void 0 || c.state !== o.to_state || !Ot.has(o.to_state) || !ao(o.to_state)) continue;
		let l = so(o.ghost_id, t);
		a.push({
			id: o.transition_id,
			ghostKey: s,
			ghostName: l,
			kind: o.to_state,
			text: co[o.to_state](l)
		});
	}
	for (let n of e.items) e.seen.has(n.id) || (i.push(n.id), n.ghostId !== null && a.push({
		id: n.id,
		ghostKey: oo(e.mansionId, n.ghostId),
		ghostName: so(n.ghostId, t),
		kind: "waiting",
		text: n.text
	}));
	return {
		seen: i,
		interruptions: a
	};
}
// src/adapters/house-interruptions.ts
function uo(e) {
	try {
		e();
	} catch {}
}
function fo(e) {
	let t = ne(), n = A(), r = D(t);
	r.current = t;
	let i = D(n);
	i.current = n;
	let a = D(e.now);
	a.current = e.now;
	let o = D(eo), s = D(/* @__PURE__ */ new Set()), c = D(null), l = e.mansionId === null ? 0 : e.items.length;
	w(() => {
		uo(() => i.current(l));
	}, [l]), w(() => () => uo(() => i.current(0)), []), w(() => (o.current = eo, s.current = /* @__PURE__ */ new Set(), () => {
		c.current !== null && clearTimeout(c.current), c.current = null;
	}), [e.mansionId]), w(() => {
		if (e.mansionId === null) return;
		let t = () => (a.current ?? Date.now)(), n = (e) => {
			for (let t of e) uo(() => r.current(t.text));
		}, i = () => {
			c.current !== null && clearTimeout(c.current), c.current = null;
			let e = io(o.current);
			e !== null && (c.current = setTimeout(() => {
				c.current = null;
				let e = no(o.current, t());
				o.current = e.state, n(e.toasts), i();
			}, Math.max(e - t(), 0)));
		}, l = lo({
			mansionId: e.mansionId,
			transitions: e.transitions,
			snapshots: e.snapshots.values(),
			items: e.items,
			seen: s.current,
			names: e.names
		});
		for (let e of l.seen) s.current.add(e);
		for (let e of l.interruptions) {
			let r = ro(o.current, e, t());
			o.current = r.state, n(r.toasts);
		}
		i();
	}, [
		e.mansionId,
		e.transitions,
		e.snapshots,
		e.items,
		e.names
	]);
}
// src/core/seance-api.ts
var po = "/apps/haunted-house/api/mansions";
function mo(e) {
	return `${po}/${encodeURIComponent(e)}/seance/ingest`;
}
function ho(e, t, n = 500) {
	return `${po}/${encodeURIComponent(e)}/seance/events?after_sequence=${t}&limit=${n}`;
}
function go(e) {
	return `${po}/${encodeURIComponent(e)}/seance/reconcile`;
}
var _o = new Set(Gt), vo = 160, yo = 20;
function bo(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function xo(e) {
	return {
		ok: !1,
		diagnostic: {
			code: "persistence_failed",
			safe_detail: e
		}
	};
}
function So(e) {
	if (!bo(e)) return null;
	let t = typeof e.code == "string" && _o.has(e.code) ? e.code : "persistence_failed", n = typeof e.safe_detail == "string" ? e.safe_detail : e.reason, r = typeof n == "string" ? n.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, vo) : "", i = typeof e.line == "number" && Number.isSafeInteger(e.line) && e.line > 0 ? e.line : null;
	return i === null ? {
		code: t,
		safe_detail: r
	} : {
		code: t,
		safe_detail: r,
		line: i
	};
}
function Co(e) {
	if (!bo(e)) return xo("The backend sent an unexpected response.");
	if (!Array.isArray(e.events)) return xo("The backend response has no event list.");
	let t = e.highest_sequence;
	if (typeof t != "number" || !Number.isSafeInteger(t) || t < 0) return xo("The backend response has no valid highest Sequence.");
	let n = [];
	if (Array.isArray(e.diagnostics)) for (let t of e.diagnostics.slice(0, yo)) {
		let e = So(t);
		e !== null && n.push(e);
	}
	let r = [];
	for (let t of e.events) {
		let e = An(t);
		e.ok ? r.push(e.value) : n.length < yo && n.push(e.diagnostic);
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
function wo(e) {
	if (typeof e != "object" || !e) return null;
	let t = e.status;
	return typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599 ? t : null;
}
var To = 4096;
function Eo(e) {
	if (typeof e != "object" || !e) return null;
	let t = e.body;
	if (typeof t != "string" || t.length > To) return null;
	try {
		let e = JSON.parse(t);
		if (!bo(e) || !bo(e.error)) return null;
		let n = e.error.code;
		return typeof n == "string" && /^[a-z_]{1,64}$/.test(n) ? n : null;
	} catch {
		return null;
	}
}
function Do(e, t) {
	if (typeof e != "object" || !e) return null;
	let n = e.body;
	if (typeof n != "string" || n.length > 65536) return null;
	let r;
	try {
		r = JSON.parse(n);
	} catch {
		return null;
	}
	if (!bo(r) || !Array.isArray(r.diagnostics)) return null;
	let i = /* @__PURE__ */ new Map();
	for (let e of r.diagnostics) {
		if (!bo(e)) return null;
		let { index: n, code: r } = e;
		if (typeof n != "number" || !Number.isInteger(n) || n < 0 || n >= t || typeof r != "string" || !/^[a-z_]{1,64}$/.test(r)) return null;
		i.has(n) || i.set(n, r);
	}
	return i.size === 0 ? null : Array.from(i, ([e, t]) => ({
		index: e,
		code: t
	})).sort((e, t) => e.index - t.index);
}
function Oo(e) {
	return e !== null && e >= 400 && e < 500 && e !== 408 && e !== 429;
}
// src/core/room-api.ts
var ko = "/apps/haunted-house/api";
function Ao(e, t) {
	return `${ko}/mansions/${encodeURIComponent(e)}/specs/${encodeURIComponent(t)}`;
}
function jo(e, t) {
	return `${Ao(e, t)}/room-ghosts`;
}
function Mo(e, t) {
	return `${Ao(e, t)}/feedback`;
}
function No(e, t) {
	return `${Ao(e, t)}/workshop/start`;
}
function Po(e) {
	return `${ko}/room-ghosts/runs/${encodeURIComponent(e)}/cancel`;
}
function Fo(e) {
	return `${ko}/room-ghosts/runs/${encodeURIComponent(e)}/retry`;
}
function Io(e, t, n, r) {
	let i = {
		command_id: r,
		expected_version: n.expectedVersion
	};
	switch (n.kind) {
		case "send_feedback": return {
			path: Mo(e, t),
			body: {
				...i,
				phase: n.phase,
				feedback: n.feedback
			}
		};
		case "start_workshop": return {
			path: No(e, t),
			body: {
				...i,
				task_ids: [...n.taskIds]
			}
		};
		case "cancel_run": return {
			path: Po(n.runId),
			body: {
				...i,
				mansion_id: e
			}
		};
		case "retry_run": return {
			path: Fo(n.runId),
			body: {
				...i,
				mansion_id: e
			}
		};
	}
}
var Lo = {
	conflict: "The room changed before your request arrived, so nothing was done. Check what is shown now and try again.",
	invalid: "The house refused that request. Nothing was done.",
	not_found: "That run or spec no longer exists. Nothing was done.",
	integrity: "The séance log failed its integrity check, so the house accepts no requests. Nothing was done.",
	contract: "The house cannot do this right now: a contract it depends on is unavailable. Nothing was done.",
	crew: "Crew did not answer in time. Check the state shown before trying again.",
	read_only: "This is a recording. Nothing was done.",
	unavailable: "The house could not be reached. It is not known whether anything was done; the state is being read again."
};
function Ro(e) {
	let t = (e) => ({
		kind: e,
		text: Lo[e]
	});
	switch (wo(e)) {
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
			let n = Eo(e);
			return t(n === "contract_unavailable" ? "contract" : n === "integrity_unavailable" ? "integrity" : "unavailable");
		}
	}
}
function zo(e) {
	switch (e.kind) {
		case "send_feedback": return "Revision request sent to the same session. The door stays sealed until you approve a new revision.";
		case "start_workshop": return e.taskIds.length === 1 ? "1 task selected. A Tinker starts when a seat and its files are free." : `${e.taskIds.length} tasks selected. Tinkers start as seats and files come free, at most three at a time.`;
		case "cancel_run": return "Cancellation requested. The run stops when Crew confirms it.";
		case "retry_run": return "Retry accepted. A fresh session takes the next attempt.";
	}
}
// src/adapters/room-ghosts-api.ts
var Bo = {
	status: "loading",
	roomGhosts: null,
	inFlight: null,
	notice: null
}, Vo = 5e3, Ho = 150, Uo = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
};
function Wo() {
	if (typeof crypto < "u" && typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(16);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
function Go(e) {
	let { api: t, mansionId: n, specName: r } = e, i = e.timers ?? Uo, a = e.pollMs ?? Vo, o = e.refreshDelayMs ?? Ho, s = e.newCommandId ?? Wo, c = Bo, l = /* @__PURE__ */ new Set(), u = !1, d = !0, f = null, p = !1, m = null, h = null, g = "";
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
		return u ? Promise.resolve() : f === null ? (m = v(m), h = v(h), f = Promise.resolve().then(() => t.get(jo(n, r))).then((e) => {
			let t = Mi(e, n, r);
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
			let o = la(c.roomGhosts, a.projection, a.gate, c.inFlight, i);
			if (o === null) return Promise.resolve();
			let l = Io(n, r, o, s());
			return _({
				inFlight: Pi(o),
				notice: null
			}), Promise.resolve().then(() => t.post(l.path, l.body)).then(() => zo(o), (e) => Ro(e).text).then((e) => S().then(() => _({
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
var Ko = () => Promise.resolve();
function qo(e, t, n, r) {
	let i = k(), a = D(i);
	a.current = i;
	let o = D(r);
	o.current = r;
	let s = D(null), [c, l] = O(Bo);
	return w(() => {
		if (e === null) {
			l(Bo);
			return;
		}
		let n = Go({
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
	}, [e, t]), w(() => {
		n !== null && s.current?.noteWorkflowVersion(n);
	}, [
		n,
		c.roomGhosts,
		c.status
	]), {
		state: c,
		send: C((e, t) => s.current?.send(e, t) ?? Ko(), []),
		refresh: C(() => s.current?.refresh() ?? Ko(), []),
		noteDisagreement: C((e) => s.current?.noteWorkflowVersion(e, !0), [])
	};
}
// src/core/ghost-state.ts
function Jo(e) {
	return e.caused_by.length + (e.occurred_at_ms === null ? 0 : 1) + (e.source.generation.length === 0 ? 0 : 1) + +(e.source.source_sequence > 0) + os(e.payload);
}
function Yo(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = t.get(n.record_id);
		(e === void 0 || us(n, e) < 0) && t.set(n.record_id, n);
	}
	let n = /* @__PURE__ */ new Map();
	for (let e of t.values()) {
		let t = n.get(e.event_id);
		t === void 0 ? n.set(e.event_id, [e]) : t.push(e);
	}
	let r = [], i = /* @__PURE__ */ new Map();
	for (let [e, t] of n) {
		let n = t[0];
		for (let e of t.slice(1)) ls(e, n) > 0 && (n = e);
		r.push(n);
		let a = t.map((e) => e.record_id).sort($);
		a.length > 1 && hs(i, {
			code: "conflicting_variant",
			event_id: e,
			related_event_id: null,
			kind: "conflict",
			record_ids: a
		});
	}
	r.sort(ds);
	let a = new Map(r.map((e, t) => [e.event_id, t]));
	return r.forEach((e, t) => {
		for (let n of new Set(e.caused_by)) {
			let r = a.get(n);
			r === void 0 ? hs(i, {
				code: "missing_predecessor",
				event_id: e.event_id,
				related_event_id: n,
				kind: "missing",
				record_ids: []
			}) : r >= t && hs(i, {
				code: "missing_predecessor",
				event_id: e.event_id,
				related_event_id: n,
				kind: "forward",
				record_ids: []
			});
		}
	}), {
		events: r,
		diagnostics: Array.from(i.values()).sort(ms)
	};
}
function Xo(e, t, n, r) {
	return `t1:${vn(R([
		e,
		t,
		n,
		r
	]))}`;
}
function Zo(e) {
	let t = Yo(e);
	return {
		selection: t,
		snapshots: Qo(t.events),
		transitions: ns(t.events)
	};
}
function Qo(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = [n.scope.mansion_id, n.scope.ghost_id];
		t.set(R(e), e);
	}
	return Array.from(t.values()).sort(ps).map(([t, n]) => rs(e, t, n));
}
function $o(e) {
	return R([
		e.run_sequence,
		e.run_id,
		e.session_slot
	]);
}
function es(e, t) {
	switch (e.latest = t, t.event_type) {
		case "approval_requested":
			Q(t, "mid") !== null && e.requests.push(t);
			break;
		case "approval_decided": {
			let n = Q(t, "mid");
			n !== null && e.decided.add(n);
			break;
		}
		case "tool_started": {
			let n = Q(t, "tool_call_id");
			n !== null && e.startedTools.add(n);
			break;
		}
		case "tool_finished": {
			let n = Q(t, "tool_call_id");
			n !== null && cs(t, "final") === !0 && e.finishedTools.add(n);
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
function ts(e, t, n) {
	let r = e.selectedStart;
	if (r === null) return is(t, n);
	let i = e.runs.get($o(r.scope)), a = /* @__PURE__ */ new Set();
	for (let e of i.requests) {
		let t = Q(e, "mid");
		i.decided.has(t) || a.add(t);
	}
	let o = Array.from(a).sort($), s = Array.from(i.startedTools).filter((e) => !i.finishedTools.has(e)).sort($), c, l;
	return i.failed === void 0 ? i.blocked === void 0 ? i.completed === void 0 ? o.length > 0 ? (c = "waiting", l = as(i.requests, (e) => a.has(Q(e, "mid")))) : (c = "working", l = i.progress) : (c = "done", l = i.completed) : (c = "blocked", l = i.blocked) : (c = "failed", l = i.failed), {
		mansion_id: t,
		ghost_id: n,
		run_id: r.scope.run_id,
		run_sequence: r.scope.run_sequence,
		state: c,
		pending_approvals: o,
		open_tools: s,
		latest_event_id: i.latest.event_id,
		latest_sequence: i.latest.sequence,
		reason: l === void 0 ? null : Q(l, "reason")
	};
}
function ns(e) {
	let t = /* @__PURE__ */ new Map(), n = [];
	for (let r of e) {
		let e = r.scope.mansion_id, i = r.scope.ghost_id, a = R([e, i]), o = t.get(a);
		o === void 0 && (o = {
			runs: /* @__PURE__ */ new Map(),
			selectedStart: null,
			snapshot: is(e, i)
		}, t.set(a, o));
		let s = $o(r.scope), c = o.runs.get(s);
		c === void 0 && (c = {
			requests: [],
			decided: /* @__PURE__ */ new Set(),
			startedTools: /* @__PURE__ */ new Set(),
			finishedTools: /* @__PURE__ */ new Set(),
			latest: r
		}, o.runs.set(s, c)), es(c, r), r.event_type === "run_started" && (o.selectedStart === null || fs(r, o.selectedStart) > 0) && (o.selectedStart = r);
		let l = o.snapshot, u = ts(o, e, i);
		o.snapshot = u, gs(l, u) || n.push({
			transition_id: Xo(r.event_id, e, i, u.state),
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
function rs(e, t, n) {
	let r = e.filter((e) => e.scope.mansion_id === t && e.scope.ghost_id === n), i = r.filter((e) => e.event_type === "run_started");
	if (i.length === 0) return is(t, n);
	let a = i[0];
	for (let e of i.slice(1)) fs(e, a) > 0 && (a = e);
	let o = r.filter((e) => e.scope.run_sequence === a.scope.run_sequence && e.scope.run_id === a.scope.run_id && e.scope.session_slot === a.scope.session_slot), s = new Set(o.filter((e) => e.event_type === "approval_requested").map((e) => Q(e, "mid")).filter((e) => e !== null)), c = new Set(o.filter((e) => e.event_type === "approval_decided").map((e) => Q(e, "mid")).filter((e) => e !== null)), l = Array.from(s).filter((e) => !c.has(e)).sort($), u = new Set(o.filter((e) => e.event_type === "tool_started").map((e) => Q(e, "tool_call_id")).filter((e) => e !== null)), d = new Set(o.filter((e) => e.event_type === "tool_finished" && cs(e, "final") === !0).map((e) => Q(e, "tool_call_id")).filter((e) => e !== null)), f = Array.from(u).filter((e) => !d.has(e)).sort($), p = o.filter((e) => e.event_type === "run_failed"), m = o.filter((e) => e.event_type === "run_blocked"), h = o.filter((e) => e.event_type === "run_completed"), g, _;
	p.length > 0 ? (g = "failed", _ = p.at(-1)) : m.length > 0 ? (g = "blocked", _ = m.at(-1)) : h.length > 0 ? (g = "done", _ = h.at(-1)) : l.length > 0 ? (g = "waiting", _ = as(o, (e) => e.event_type === "approval_requested" && l.includes(Q(e, "mid") ?? ""))) : (g = "working", _ = as(o, (e) => e.event_type === "ghost_progressed" || e.event_type === "run_started"));
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
		reason: _ === void 0 ? null : Q(_, "reason")
	};
}
function is(e, t) {
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
function as(e, t) {
	for (let n = e.length - 1; n >= 0; --n) {
		let r = e[n];
		if (t(r)) return r;
	}
}
function os(e) {
	return e === null ? 0 : typeof e == "string" ? e.length === 0 ? 0 : 1 : typeof e == "boolean" || typeof e == "number" ? 1 : Array.isArray(e) ? e.reduce((e, t) => e + os(t), 0) : Object.values(e).reduce((e, t) => e + os(t), 0);
}
function ss(e) {
	return e.payload === null || Array.isArray(e.payload) || typeof e.payload != "object" ? null : e.payload;
}
function Q(e, t) {
	let n = ss(e)?.[t];
	return typeof n == "string" && n.length > 0 ? n : null;
}
function cs(e, t) {
	let n = ss(e)?.[t];
	return typeof n == "boolean" ? n : null;
}
function ls(e, t) {
	if (e.source.revision !== t.source.revision) return e.source.revision - t.source.revision;
	let n = Jo(e) - Jo(t);
	return n === 0 ? $(e.record_id, t.record_id) : n;
}
function us(e, t) {
	if (e.sequence !== t.sequence) return e.sequence - t.sequence;
	let n = $(e.event_id, t.event_id);
	return n === 0 ? $(jn(e), jn(t)) : n;
}
function ds(e, t) {
	return e.sequence === t.sequence ? $(e.event_id, t.event_id) : e.sequence - t.sequence;
}
function fs(e, t) {
	if (e.scope.run_sequence !== t.scope.run_sequence) return e.scope.run_sequence - t.scope.run_sequence;
	let n = $(e.scope.run_id, t.scope.run_id);
	return n === 0 ? e.sequence === t.sequence ? $(e.event_id, t.event_id) : e.sequence - t.sequence : n;
}
function ps(e, t) {
	let n = $(e[0], t[0]);
	return n === 0 ? $(e[1], t[1]) : n;
}
function ms(e, t) {
	return [
		$(e.code, t.code),
		$(e.event_id, t.event_id),
		$(e.related_event_id ?? "", t.related_event_id ?? ""),
		$(e.kind, t.kind),
		$(e.record_ids.join(","), t.record_ids.join(","))
	].find((e) => e !== 0) ?? 0;
}
function hs(e, t) {
	e.set(R(t), t);
}
function gs(e, t) {
	return R(e) === R(t);
}
function $(e, t) {
	let n = Array.from(e, (e) => e.codePointAt(0)), r = Array.from(t, (e) => e.codePointAt(0)), i = Math.min(n.length, r.length);
	for (let e = 0; e < i; e += 1) if (n[e] !== r[e]) return n[e] - r[e];
	return n.length - r.length;
}
`${"0".repeat(64)}`;
var _s = {
	records: /* @__PURE__ */ new Map(),
	highestSequence: 0,
	contiguousSequence: 0
};
function vs(e, t) {
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
function ys(e) {
	let t = Zo(Array.from(e));
	return {
		events: t.selection.events,
		selectionDiagnostics: t.selection.diagnostics,
		snapshots: t.snapshots,
		transitions: t.transitions
	};
}
function bs(e) {
	return ys(e.records.values());
}
// src/adapters/seance-live.ts
var xs = [
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
], Ss = {
	highestSequence: 0,
	snapshots: /* @__PURE__ */ new Map(),
	catchingUp: !1,
	diagnostic: null,
	loaded: !1,
	transitions: [],
	pendingEnvelopes: 0
}, Cs = 5e3, ws = [
	1e3,
	2e3,
	5e3,
	15e3
], Ts = 500, Es = 50, Ds = 3e4, Os = 200, ks = 5e3, As = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
}, js = {
	code: "persistence_failed",
	safe_detail: "The backend did not confirm the latest ghost activity. Trying again."
}, Ms = {
	code: "invalid_envelope",
	safe_detail: "The backend refused a Crew event, so it was not recorded."
}, Ns = {
	code: "persistence_failed",
	safe_detail: "The séance log of this mansion is not available, so new ghost activity was not recorded."
}, Ps = {
	code: "persistence_failed",
	safe_detail: "Too much ghost activity is waiting for the backend. The oldest events were dropped."
}, Fs = {
	code: "persistence_failed",
	safe_detail: "Could not read the séance log. Showing the last confirmed state."
}, Is = {
	code: "history_partial",
	safe_detail: "Could not recover missed activity from Crew history."
};
function Ls(e) {
	let { api: t, mansionId: n } = e, r = e.timers ?? As, i = e.pollMs ?? Cs, a = e.retryDelaysMs ?? ws, o = e.maxQueue ?? Ts, s = Ss, c = _s, l = /* @__PURE__ */ new Set(), u = !1, d = !0, f = [], p = !1, m = 0, h = 0, g = null, _ = null, v = null, y = !1, b = !1, x = !1, S = null, C = null, w = null;
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
		let t = vs(c, e.events.filter((e) => e.scope.mansion_id === n));
		if (t.applied.length === 0) return;
		c = t.log;
		let r = bs(c);
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
	function ee(e) {
		if (_ = D(_), u || !d) return;
		let t = e === null ? O() ? i : null : Math.min(Math.max(e, Es), Ds);
		t !== null && (_ = r.set(() => {
			_ = null, k(!1);
		}, t));
	}
	function k(e) {
		return u ? Promise.resolve() : (e && !s.catchingUp && T({ catchingUp: !0 }), v === null ? (_ = D(_), v = Promise.resolve().then(async () => {
			let e = null, r = [];
			try {
				let i = null;
				for (let a = 0; a < Os; a += 1) {
					let a = await t.get(ho(n, c.contiguousSequence, 500));
					if (u) return;
					let o = Co(a);
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
				wo(e) === 404 && Eo(e) === "log_not_found" ? (w = null, T({
					catchingUp: b,
					loaded: !0
				})) : (w = Fs, T({ catchingUp: b }));
			}
			r.length > 0 && ne(r), ee(e);
		}).finally(() => {
			if (v = null, !u) {
				if (y) {
					let e = b;
					y = !1, b = !1, k(e);
				}
				A();
			}
		}), v) : (y = !0, b ||= e, v));
	}
	function te() {
		if (h >= a.length) return;
		let e = a[h];
		h += 1, g = r.set(() => {
			g = null, A();
		}, e);
	}
	function A() {
		if (u || p || g !== null || f.length === 0 || v !== null) return;
		let e = m > 0 ? 1 : Math.min(f.length, 100), r = f.slice(0, e);
		p = !0, Promise.resolve().then(() => t.post(mo(n), { envelopes: r })).then((e) => {
			if (p = !1, u) return;
			f[0] === r[0] && f.splice(0, r.length), m > 0 && --m, h = 0;
			let t = Co(e);
			t.ok ? (C = null, E(t.page), T({}), t.page.reconcileSlots.length > 0 && ne(t.page.reconcileSlots), c.contiguousSequence < Math.max(c.highestSequence, t.page.highestSequence) ? k(!1) : ee(null)) : (C = t.diagnostic, T({})), A();
		}, (e) => {
			if (p = !1, u) return;
			let t = wo(e);
			if (t === 404 || t === 409) f[0] === r[0] && f.splice(0, r.length), m = 0, C = Ns, T({}), A();
			else if (Oo(t)) {
				let t = Do(e, r.length);
				if (t !== null && f[0] === r[0]) {
					for (let { index: e } of [...t].reverse()) f.splice(e, 1);
					t.some(({ code: e }) => e !== "unknown_session") && (C = Ms), T({}), A();
					return;
				}
				r.length > 1 ? m = r.length : (f[0] === r[0] && f.shift(), m > 0 && --m, C = Ms), T({}), A();
			} else C = js, T({}), te();
		});
	}
	function ne(e) {
		if (u || x || S !== null || e.length === 0) return Promise.resolve();
		x = !0;
		let i = { slots: e.slice(0, 8) };
		return Promise.resolve().then(() => t.post(go(n), i)).then((e) => {
			if (u) return;
			let t = Co(e);
			t.ok ? (E(t.page), w = t.page.diagnostics[0] ?? w) : w = Is, T({});
		}, () => {
			u || (w = Is, T({}));
		}).finally(() => {
			if (x = !1, !u) return S = r.set(() => {
				S = null;
			}, ks), k(!1);
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
			k(!0);
		},
		forward(e, t) {
			u || (f.push({
				type: e,
				data: t
			}), f.length > o && (f.splice(0, f.length - o), C = Ps), T({}), g === null && h >= a.length && (h = Math.max(a.length - 1, 0)), A());
		},
		catchUp: () => k(!0),
		reconcile: ne,
		setVisible(e) {
			u || d === e || (d = e, d ? (h = 0, k(!0)) : _ = D(_));
		},
		dispose() {
			u = !0, _ = D(_), g = D(g), S = D(S), l.clear(), f.length = 0;
		}
	};
}
function Rs(e) {
	let t = k(), n = D(t);
	n.current = t;
	let r = D(null), [i, a] = O(Ss);
	w(() => {
		if (e === null) {
			a(Ss);
			return;
		}
		let t = Ls({
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
	let o = E(() => xs.map((e) => (t) => r.current?.forward(e, t)), []);
	xs.forEach((e, t) => {
		te(e, o[t]);
	});
	let s = C(() => {
		r.current?.catchUp();
	}, []);
	return E(() => ({
		state: i,
		catchUp: s
	}), [i, s]);
}
// src/core/house-reducer.ts
var zs = {
	projection: null,
	projectionStatus: "loading",
	focusedRoom: "study",
	openRoom: null,
	inFlight: null,
	notice: null
};
function Bs(e, t) {
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
		case "room_focused": return e.focusedRoom === t.room ? e : {
			...e,
			focusedRoom: t.room
		};
		case "room_moved": {
			let n = Wr(e.focusedRoom, t.direction);
			return n === e.focusedRoom ? e : {
				...e,
				focusedRoom: n
			};
		}
		case "room_opened": return {
			...e,
			focusedRoom: t.room,
			openRoom: t.room
		};
		case "room_closed": return e.openRoom === null ? e : {
			...e,
			openRoom: null
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
function Vs(e, t) {
	return e.revision === t.revision && e.sha256 === t.sha256 && e.sizeBytes === t.sizeBytes;
}
function Hs(e, t, n) {
	let r = e.projection;
	if (!t.canDecide || e.inFlight !== null || r === null || e.projectionStatus !== "ready" || n.expectedVersion !== r.version) return null;
	switch (n.kind) {
		case "start_phase": {
			let e = r.phases.find((e) => e.phase === n.phase);
			return e?.status === "ready" || e?.status === "failed" || e?.status === "revision_required" ? n : null;
		}
		case "decide_door": {
			let e = r.phases.find((e) => e.phase === n.phase), t = e?.door.proposal;
			return e === void 0 || t == null || e.door.status !== "waiting" || t.status !== "pending" || t.proposalId !== n.proposalId || t.documentPath !== n.documentPath ? null : Vs(t.artifactRevision, n.artifactRevision) ? n : null;
		}
		case "decide_risky": {
			let e = r.riskyProposals.find((e) => e.proposalId === n.proposalId);
			return e === void 0 || e.status !== "pending" || e.actionDigest !== n.actionDigest || n.decision === "approve" && e.descriptor === null ? null : n;
		}
	}
}
// src/core/workflow-api.ts
var Us = "/apps/haunted-house/api/mansions";
function Ws(e) {
	return `${Us}/${encodeURIComponent(e)}`;
}
function Gs(e) {
	return `${Ws(e)}/workflow`;
}
function Ks(e, t) {
	return `${Ws(e)}/phases/${t}/start`;
}
function qs(e, t, n) {
	return `${Ws(e)}/doors/${encodeURIComponent(t)}/${n}`;
}
function Js(e, t, n) {
	return `${Ws(e)}/approvals/${encodeURIComponent(t)}/${n}`;
}
function Ys(e, t, n) {
	let r = {
		command_id: n,
		expected_version: t.expectedVersion
	};
	switch (t.kind) {
		case "start_phase": return {
			path: Ks(e, t.phase),
			body: r
		};
		case "decide_door": return {
			path: qs(e, t.proposalId, t.decision),
			body: {
				...r,
				phase: t.phase,
				document_path: t.documentPath,
				artifact_revision: dr(t.artifactRevision)
			}
		};
		case "decide_risky": return {
			path: Js(e, t.proposalId, t.decision),
			body: {
				...r,
				action_digest: t.actionDigest
			}
		};
	}
}
function Xs(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Zs(e, t) {
	if (!Xs(e)) return null;
	let { event_id: n, sequence: r, version: i } = e;
	if (typeof n != "string" || !/^e1:[0-9a-f]{64}$/.test(n) || typeof r != "number" || !Number.isSafeInteger(r) || r < 1) return null;
	let a = ur(e.workflow, t);
	return !a.ok || i !== a.projection.version || r > a.projection.version ? null : {
		eventId: n,
		sequence: r,
		projection: a.projection
	};
}
var Qs = {
	conflict: "The house changed before your decision arrived, so nothing was recorded. Check what is shown now and decide again.",
	invalid: "The house refused that request. Nothing was recorded.",
	not_found: "That mansion or proposal no longer exists. Nothing was recorded.",
	integrity: "The séance log failed its integrity check, so the house accepts no decisions. Nothing was recorded.",
	crew: "Crew did not answer in time. Check the state shown before trying again.",
	read_only: "This is a recording. Nothing was recorded.",
	unavailable: "The house could not be reached. It is not known whether anything was recorded; the state is being read again."
}, $s = 524288;
function ec(e, t) {
	if (typeof e != "object" || !e) return null;
	let n = e.body;
	if (typeof n != "string" || n.length > $s) return null;
	try {
		let e = JSON.parse(n);
		if (!Xs(e)) return null;
		let r = ur(e.workflow, t);
		return r.ok ? r.projection : null;
	} catch {
		return null;
	}
}
function tc(e, t) {
	let n = wo(e), r = ec(e, t), i = (e) => ({
		kind: e,
		text: Qs[e],
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
		default: return i(Eo(e) === "integrity_unavailable" ? "integrity" : "unavailable");
	}
}
function nc(e) {
	switch (e.kind) {
		case "start_phase": return `${G[e.phase]} started.`;
		case "decide_door": return e.decision === "approve" ? `${G[e.phase]} door approved. The next phase starts only when you start it.` : `${G[e.phase]} door rejected. A revision is required.`;
		case "decide_risky": return e.decision === "approve" ? "Action approved for one attempt." : "Action rejected. It will not run.";
	}
}
// src/adapters/workflow-live.ts
var rc = 5e3, ic = 150, ac = "The house answered in a way this page cannot read. Reading the state again before anything else.", oc = {
	set: (e, t) => setTimeout(e, t),
	clear: (e) => clearTimeout(e)
};
function sc() {
	if (typeof crypto < "u" && typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(16);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
function cc(e) {
	let { api: t, mansionId: n } = e, r = e.timers ?? oc, i = e.pollMs ?? rc, a = e.refreshDelayMs ?? ic, o = e.newCommandId ?? sc, s = zs, c = /* @__PURE__ */ new Set(), l = !1, u = !0, d = null, f = !1, p = null, m = null, h = 0;
	function g(e) {
		if (l) return;
		let t = Bs(s, e);
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
		return e.readOnly ? !1 : h > e.version || e.integrity === "uncertain" || zr(e).length > 0 || e.phases.some((e) => e.status === "starting");
	}
	function y() {
		p = _(p), !l && u && v() && (p = r.set(() => {
			p = null, b();
		}, i));
	}
	function b() {
		return l ? Promise.resolve() : d === null ? (p = _(p), m = _(m), d = Promise.resolve().then(() => t.get(Gs(n))).then((e) => {
			let t = ur(e, n);
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
			let a = Hs(s, i, r);
			if (a === null) return Promise.resolve();
			let c = Ys(n, a, o());
			return g({
				type: "command_sent",
				target: wr(a)
			}), Promise.resolve().then(() => t.post(c.path, c.body)).then((e) => {
				let t = Zs(e, n);
				if (t === null) return g({
					type: "command_settled",
					notice: ac
				}), b();
				g({
					type: "projection_received",
					projection: t.projection
				}), g({
					type: "command_settled",
					notice: nc(a)
				}), y();
			}, (e) => {
				let t = tc(e, n);
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
var lc = () => Promise.resolve();
function uc(e, t, n) {
	let r = k(), i = D(r);
	i.current = r;
	let a = D(n);
	a.current = n;
	let o = D(null), [s, c] = O(zs);
	return w(() => {
		if (e === null) {
			c(zs);
			return;
		}
		let t = cc({
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
	}, [e]), w(() => {
		o.current?.noteCanonical(t);
	}, [t, s.projection]), {
		state: s,
		dispatch: C((e) => o.current?.dispatch(e) ?? void 0, []),
		send: C((e, t) => o.current?.send(e, t) ?? lc(), []),
		refresh: C(() => o.current?.refresh() ?? lc(), [])
	};
}
// src/rooms/house/use-house.ts
function dc({ mansionId: e, specName: t, ghostNames: n, onAnnounce: r }) {
	let { state: i, catchUp: a } = Rs(e), { state: o, dispatch: s, send: c, refresh: l } = uc(e, i.highestSequence, a), u = C(() => {
		a(), l();
	}, [a, l]), d = qo(e, t ?? e, o.projection?.version ?? null, u), f = Ge(), p = E(() => Cr({
		projection: o.projection,
		projectionStatus: o.projectionStatus,
		canonical: i
	}), [
		o.projection,
		o.projectionStatus,
		i
	]), m = E(() => Ur(o.projection, i.snapshots.values(), n), [
		o.projection,
		i.snapshots,
		n
	]), h = E(() => zr(o.projection, n), [o.projection, n]), g = E(() => {
		let e = m.find((e) => e.id === o.openRoom);
		return e === void 0 ? null : Gr(o.projection, e, p, o.inFlight, n);
	}, [
		m,
		o.openRoom,
		o.projection,
		o.inFlight,
		p,
		n
	]), _ = E(() => Li({
		projection: o.projection,
		roomGhosts: d.state.roomGhosts,
		roomGhostsStatus: d.state.status,
		authority: p
	}), [
		o.projection,
		d.state.roomGhosts,
		d.state.status,
		p
	]), v = d.noteDisagreement;
	w(() => {
		_.needsRefresh && o.projection !== null && v(o.projection.version);
	}, [
		_.needsRefresh,
		o.projection,
		d.state.roomGhosts,
		v
	]);
	let y = d.state.inFlight ?? (o.inFlight === null ? null : `workflow:${o.inFlight}`), b = E(() => {
		let r = m.find((e) => e.id === o.openRoom);
		return r === void 0 ? null : sa({
			room: r,
			specName: t ?? e,
			projection: o.projection,
			snapshots: i.snapshots,
			roomGhosts: d.state.roomGhosts,
			roomGhostsStatus: d.state.status,
			authority: p,
			inFlight: y,
			names: n
		});
	}, [
		m,
		o.openRoom,
		o.projection,
		i.snapshots,
		d.state.roomGhosts,
		d.state.status,
		p,
		y,
		n,
		t,
		e
	]), x = E(() => fa(d.state.roomGhosts, i.snapshots, n), [
		d.state.roomGhosts,
		i.snapshots,
		n
	]);
	fo({
		mansionId: e,
		transitions: i.transitions,
		snapshots: i.snapshots,
		items: h,
		names: n
	});
	let S = D(r);
	S.current = r;
	let T = D(n);
	T.current = n;
	let O = D(/* @__PURE__ */ new Set()), ee = D(/* @__PURE__ */ new Set());
	w(() => {
		let e = Rt(i.transitions, i.snapshots.values(), O.current, T.current);
		for (let t of e.seen) O.current.add(t);
		let t = Vr(h, ee.current);
		for (let e of t.seen) ee.current.add(e);
		let n = [t.message, e.message].filter((e) => e !== null).join(" ");
		n !== "" && S.current(n);
	}, [
		i.transitions,
		i.snapshots,
		h
	]), w(() => {
		o.notice !== null && S.current(o.notice);
	}, [o.notice]), w(() => {
		d.state.notice !== null && S.current(d.state.notice);
	}, [d.state.notice]);
	let k = d.send, te = D({
		projection: o.projection,
		gate: _,
		workflowBusy: o.inFlight !== null
	});
	te.current = {
		projection: o.projection,
		gate: _,
		workflowBusy: o.inFlight !== null
	};
	let A = C((e) => {
		k(e, te.current);
	}, [k]), ne = D(p);
	ne.current = p;
	let re = C((e) => {
		c(e, ne.current);
	}, [c]), j = C((e) => s({
		type: "room_focused",
		room: e
	}), [s]), M = C((e) => s({
		type: "room_moved",
		direction: e
	}), [s]), N = C((e) => s({
		type: "room_opened",
		room: e
	}), [s]), ie = C(() => s({ type: "room_closed" }), [s]), ae = D(h);
	ae.current = h;
	let oe = C(() => {
		let e = ae.current.find((e) => e.room !== null);
		e?.room != null && s({
			type: "room_opened",
			room: e.room
		});
	}, [s]);
	return {
		ui: o,
		authority: p,
		rooms: m,
		open: g,
		needsYou: h,
		needsYouText: Br(h.length),
		loading: o.projectionStatus === "loading" || !i.loaded && i.diagnostic === null,
		logProblem: i.diagnostic === null ? null : Bt(i.diagnostic),
		focusRoom: j,
		moveRoom: M,
		openRoom: N,
		closeRoom: ie,
		send: re,
		jumpToNeedsYou: oe,
		output: b,
		review: x,
		roomNotice: d.state.notice,
		inFlight: o.inFlight ?? d.state.inFlight,
		sendRoom: A,
		openSession: f
	};
}
// src/rooms/house/use-panel-focus.ts
function fc(e, t, n, r) {
	let i = D(null);
	w(() => {
		let r = i.current;
		i.current = n, n !== null && n !== r ? t.current?.focus() : n === null && r !== null && e.current?.querySelector(`[data-room="${r}"]`)?.focus();
	}, [
		n,
		t,
		e
	]);
	let a = D(null);
	w(() => {
		let e = a.current !== null && r === null;
		if (a.current = r, !e || n === null) return;
		let i = document.activeElement;
		(i === null || i === document.body) && t.current?.focus();
	}, [
		r,
		n,
		t
	]);
}
// src/rooms/house/House.tsx
function pc({ mansionId: e, specName: t, ghostNames: n, onAnnounce: r, stillHouse: i = !1 }) {
	let a = dc({
		mansionId: e,
		specName: t,
		ghostNames: n,
		onAnnounce: r
	}), o = T(), s = T(), c = T(), l = D(null), u = D(null);
	return fc(l, u, a.ui.openRoom, a.inFlight), /* @__PURE__ */ N("section", {
		className: "hh-house-map",
		"aria-labelledby": o,
		"aria-busy": a.loading,
		"data-still": i,
		ref: l,
		onKeyDown: (e) => {
			e.key === "Escape" && a.ui.openRoom !== null && (e.preventDefault(), a.closeRoom());
		},
		children: [
			/* @__PURE__ */ M("style", { children: Et + ht }),
			/* @__PURE__ */ M("h3", {
				id: o,
				children: "The house"
			}),
			/* @__PURE__ */ M("p", {
				className: "hh-house-lede",
				children: "Arrow keys move between rooms. Enter opens a room. Escape closes it. Doors open only when you approve them."
			}),
			a.loading ? /* @__PURE__ */ N("p", {
				className: "hh-house-note hh-house-muted",
				children: [/* @__PURE__ */ M(g, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: "Loading the house…" })]
			}) : null,
			a.logProblem === null ? null : /* @__PURE__ */ N("p", {
				className: "hh-house-note hh-house-problem",
				children: [/* @__PURE__ */ M(b, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: a.logProblem })]
			}),
			a.authority.text === null || a.authority.block === "loading" ? null : /* @__PURE__ */ N("p", {
				className: "hh-house-note hh-house-blocked",
				"data-block": a.authority.block,
				children: [/* @__PURE__ */ M(f, {
					size: 16,
					"aria-hidden": !0
				}), /* @__PURE__ */ M("span", { children: a.authority.text })]
			}),
			/* @__PURE__ */ M(Jr, {
				items: a.needsYou,
				text: a.needsYouText,
				onJump: a.jumpToNeedsYou
			}),
			/* @__PURE__ */ M(qr, {
				rooms: a.rooms,
				focusedRoom: a.ui.focusedRoom,
				openRoom: a.ui.openRoom,
				panelId: s,
				onFocus: a.focusRoom,
				onMove: a.moveRoom,
				onOpen: a.openRoom
			}),
			a.ui.notice === null ? null : /* @__PURE__ */ M("p", {
				className: "hh-house-note",
				children: a.ui.notice
			}),
			a.roomNotice === null ? null : /* @__PURE__ */ M("p", {
				className: "hh-house-note",
				"data-room-notice": !0,
				children: a.roomNotice
			}),
			a.open === null ? null : /* @__PURE__ */ M(Ja, {
				id: s,
				titleId: c,
				detail: a.open,
				ref: u,
				onClose: a.closeRoom,
				onSend: a.send,
				output: a.output,
				onRoomSend: a.sendRoom,
				onOpenSession: a.openSession
			}),
			a.review === null ? null : /* @__PURE__ */ M(Tt, {
				view: a.review,
				onOpenSession: a.openSession
			})
		]
	});
}
// src/App.tsx
var mc = {
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
function hc(e) {
	return e === void 0 ? "" : ` (HTTP ${e})`;
}
function gc(e) {
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
			text: `Not reachable${hc(e.status)}`,
			detail: e.message
		};
	}
}
function _c(e) {
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
			text: mc[e.gateway.error].short
		};
	}
}
function vc(e) {
	switch (e.kind) {
		case "loading": return "Checking the backend…";
		case "unreachable": return `Backend not reachable${hc(e.status)}`;
		case "ok": return "version" in e.gateway ? `Backend reachable · Gateway ${e.gateway.version}` : `Backend reachable · ${mc[e.gateway.error].long}`;
	}
}
function yc({ tone: e }) {
	let t = {
		size: 18,
		"aria-hidden": !0
	};
	switch (e) {
		case "ok": return /* @__PURE__ */ M(i, {
			...t,
			className: "hh-icon hh-icon-ok"
		});
		case "problem": return /* @__PURE__ */ M(b, {
			...t,
			className: "hh-icon hh-icon-problem"
		});
		case "pending": return /* @__PURE__ */ M(d, {
			...t,
			className: "hh-icon hh-icon-pending"
		});
		case "unknown": return /* @__PURE__ */ M(a, {
			...t,
			className: "hh-icon hh-icon-unknown"
		});
	}
}
function bc({ name: e, view: t }) {
	return /* @__PURE__ */ N("li", {
		className: "hh-row",
		"data-tone": t.tone,
		children: [
			/* @__PURE__ */ M(yc, { tone: t.tone }),
			/* @__PURE__ */ M("span", {
				className: "hh-row-name",
				children: e
			}),
			/* @__PURE__ */ M("span", {
				className: "hh-row-text",
				children: t.text
			}),
			t.detail ? /* @__PURE__ */ M("span", {
				className: "hh-row-detail",
				children: t.detail
			}) : null
		]
	});
}
var xc = "\n.hh-status { color: var(--card-fg, var(--text, inherit)); background: var(--card, transparent);\n  border: 1px solid var(--border, currentColor); border-radius: 8px; padding: 16px 20px;\n  max-width: 560px; margin: 24px; font: inherit; }\n.hh-status h1 { font-size: 1.25rem; margin: 0 0 12px; }\n.hh-rows { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 8px; }\n.hh-row { display: grid; grid-template-columns: 18px 5rem 1fr; column-gap: 10px; align-items: center; }\n.hh-row-name { font-weight: 600; }\n.hh-row-detail { grid-column: 3; color: var(--muted, inherit); font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-icon { flex: none; }\n.hh-icon-ok { color: var(--ok, currentColor); }\n.hh-icon-problem { color: var(--warn, currentColor); }\n.hh-icon-pending, .hh-icon-unknown { color: var(--muted, currentColor); }\n.hh-summary { margin: 0; }\n.hh-announcement { display: block; margin-top: 4px; }\n.hh-actions { margin-top: 12px; }\n.hh-retry { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;\n  color: var(--accent-fg, inherit); background: var(--accent, transparent);\n  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 12px; }\n.hh-retry:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n@keyframes hh-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-icon-pending { animation: hh-spin 2s linear infinite; }\n}\n";
function Sc() {
	let { state: e, retry: t } = He(), [n, r] = O(""), i = e.kind === "ok";
	return /* @__PURE__ */ N("main", {
		className: "hh-house",
		"aria-labelledby": "hh-status-title",
		children: [
			/* @__PURE__ */ M("style", { children: xc }),
			/* @__PURE__ */ N("div", {
				className: "hh-status",
				children: [
					/* @__PURE__ */ M("h1", {
						id: "hh-status-title",
						children: "Haunted House"
					}),
					/* @__PURE__ */ N("ul", {
						className: "hh-rows",
						"aria-label": "Status",
						children: [/* @__PURE__ */ M(bc, {
							name: "Backend",
							view: gc(e)
						}), /* @__PURE__ */ M(bc, {
							name: "Gateway",
							view: _c(e)
						})]
					}),
					/* @__PURE__ */ N("p", {
						className: "hh-summary",
						"aria-live": "polite",
						children: [vc(e), i && n !== "" ? /* @__PURE__ */ N(j, { children: [" ", /* @__PURE__ */ M("span", {
							className: "hh-announcement",
							children: n
						})] }) : null]
					}),
					e.kind === "unreachable" ? /* @__PURE__ */ M("div", {
						className: "hh-actions",
						children: /* @__PURE__ */ N("button", {
							type: "button",
							className: "hh-retry",
							onClick: t,
							children: [/* @__PURE__ */ M(_, {
								size: 16,
								"aria-hidden": !0
							}), "Retry"]
						})
					}) : null
				]
			}),
			i ? /* @__PURE__ */ M(mt, {
				onAnnounce: r,
				renderMansion: (e) => /* @__PURE__ */ M(pc, {
					mansionId: e.name,
					specName: e.projectSpec,
					onAnnounce: r
				})
			}) : null
		]
	});
}
export { Sc as default };
