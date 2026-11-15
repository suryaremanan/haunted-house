import { CircleCheck as e, CircleDashed as t, LoaderCircle as n, RotateCw as r, TriangleAlert as i } from "lucide-react";
import { useAppApi as a } from "@kirocrew/app-sdk";
import { useCallback as o, useEffect as s, useState as c } from "react";
import { jsx as l, jsxs as u } from "react/jsx-runtime";
// src/core/backend-status.ts
var d = "/apps/haunted-house/api/whoami", f = [
	"timeout",
	"unreachable",
	"denied",
	"config"
], p = /* @__PURE__ */ new Set(["ok", "replay"]), m = "Backend sent an unexpected reply.", h = "Request failed.", g = 200;
function _(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function v(e) {
	return typeof e == "string" && f.includes(e);
}
function y(e) {
	return _(e) ? typeof e.version == "string" && e.version.trim() !== "" ? { version: e.version.trim() } : v(e.error) ? { error: e.error } : null : null;
}
function b(e) {
	if (!_(e) || typeof e.backend != "string" || !p.has(e.backend)) return {
		kind: "unreachable",
		message: m
	};
	let t = y(e.gateway);
	return t === null ? {
		kind: "unreachable",
		message: m
	} : {
		kind: "ok",
		gateway: t
	};
}
function x(e) {
	if (!_(e) && !(e instanceof Error)) return;
	let t = e.status;
	if (typeof t == "number" && Number.isInteger(t) && t >= 100 && t <= 599) return t;
}
function S(e) {
	let t = e instanceof Error || _(e) ? e.message : void 0;
	if (typeof t != "string") return h;
	let n = t.trim();
	return n === "" ? h : n.length > g ? `${n.slice(0, 199)}…` : n;
}
function C(e) {
	let t = x(e), n = S(e);
	return t === void 0 ? {
		kind: "unreachable",
		message: n
	} : {
		kind: "unreachable",
		status: t,
		message: n
	};
}
// src/adapters/sdk.ts
function w() {
	let e = a(), [t, n] = c(0), [r, i] = c({ kind: "loading" });
	return s(() => {
		let t = !1;
		return i({ kind: "loading" }), Promise.resolve().then(() => e.get(d)).then((e) => {
			t || i(b(e));
		}, (e) => {
			t || i(C(e));
		}), () => {
			t = !0;
		};
	}, [t]), {
		state: r,
		retry: o(() => n((e) => e + 1), [])
	};
}
// src/App.tsx
var T = {
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
function E(e) {
	return e === void 0 ? "" : ` (HTTP ${e})`;
}
function D(e) {
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
			text: `Not reachable${E(e.status)}`,
			detail: e.message
		};
	}
}
function O(e) {
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
			text: T[e.gateway.error].short
		};
	}
}
function k(e) {
	switch (e.kind) {
		case "loading": return "Checking the backend…";
		case "unreachable": return `Backend not reachable${E(e.status)}`;
		case "ok": return "version" in e.gateway ? `Backend reachable · Gateway ${e.gateway.version}` : `Backend reachable · ${T[e.gateway.error].long}`;
	}
}
function A({ tone: r }) {
	let a = {
		size: 18,
		"aria-hidden": !0
	};
	switch (r) {
		case "ok": return /* @__PURE__ */ l(e, {
			...a,
			className: "hh-icon hh-icon-ok"
		});
		case "problem": return /* @__PURE__ */ l(i, {
			...a,
			className: "hh-icon hh-icon-problem"
		});
		case "pending": return /* @__PURE__ */ l(n, {
			...a,
			className: "hh-icon hh-icon-pending"
		});
		case "unknown": return /* @__PURE__ */ l(t, {
			...a,
			className: "hh-icon hh-icon-unknown"
		});
	}
}
function j({ name: e, view: t }) {
	return /* @__PURE__ */ u("li", {
		className: "hh-row",
		"data-tone": t.tone,
		children: [
			/* @__PURE__ */ l(A, { tone: t.tone }),
			/* @__PURE__ */ l("span", {
				className: "hh-row-name",
				children: e
			}),
			/* @__PURE__ */ l("span", {
				className: "hh-row-text",
				children: t.text
			}),
			t.detail ? /* @__PURE__ */ l("span", {
				className: "hh-row-detail",
				children: t.detail
			}) : null
		]
	});
}
var M = "\n.hh-status { color: var(--card-fg, var(--text, inherit)); background: var(--card, transparent);\n  border: 1px solid var(--border, currentColor); border-radius: 8px; padding: 16px 20px;\n  max-width: 560px; margin: 24px; font: inherit; }\n.hh-status h1 { font-size: 1.25rem; margin: 0 0 12px; }\n.hh-rows { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 8px; }\n.hh-row { display: grid; grid-template-columns: 18px 5rem 1fr; column-gap: 10px; align-items: center; }\n.hh-row-name { font-weight: 600; }\n.hh-row-detail { grid-column: 3; color: var(--muted, inherit); font-size: 0.875rem; overflow-wrap: anywhere; }\n.hh-icon { flex: none; }\n.hh-icon-ok { color: var(--ok, currentColor); }\n.hh-icon-problem { color: var(--warn, currentColor); }\n.hh-icon-pending, .hh-icon-unknown { color: var(--muted, currentColor); }\n.hh-summary { margin: 0; }\n.hh-actions { margin-top: 12px; }\n.hh-retry { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;\n  color: var(--accent-fg, inherit); background: var(--accent, transparent);\n  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 12px; }\n.hh-retry:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }\n@keyframes hh-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: no-preference) {\n  .hh-icon-pending { animation: hh-spin 2s linear infinite; }\n}\n";
function N() {
	let { state: e, retry: t } = w();
	return /* @__PURE__ */ u("main", {
		className: "hh-status",
		"aria-labelledby": "hh-status-title",
		children: [
			/* @__PURE__ */ l("style", { children: M }),
			/* @__PURE__ */ l("h1", {
				id: "hh-status-title",
				children: "Haunted House"
			}),
			/* @__PURE__ */ u("ul", {
				className: "hh-rows",
				"aria-label": "Status",
				children: [/* @__PURE__ */ l(j, {
					name: "Backend",
					view: D(e)
				}), /* @__PURE__ */ l(j, {
					name: "Gateway",
					view: O(e)
				})]
			}),
			/* @__PURE__ */ l("p", {
				className: "hh-summary",
				"aria-live": "polite",
				children: k(e)
			}),
			e.kind === "unreachable" ? /* @__PURE__ */ l("div", {
				className: "hh-actions",
				children: /* @__PURE__ */ u("button", {
					type: "button",
					className: "hh-retry",
					onClick: t,
					children: [/* @__PURE__ */ l(r, {
						size: 16,
						"aria-hidden": !0
					}), "Retry"]
				})
			}) : null
		]
	});
}
export { N as default };
