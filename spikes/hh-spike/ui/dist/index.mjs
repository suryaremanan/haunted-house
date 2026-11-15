import { jsxs as b, jsx as a } from "react/jsx-runtime";
import { useState as p, useRef as K, useEffect as M, useCallback as P, useMemo as V } from "react";
import { useAppApi as Y, useAppEvents as W } from "@kirocrew/app-sdk";
const A = [
  "chat_append",
  "chat_chunk",
  "chat_done",
  "chat_error",
  "chat_message",
  "chat_message_update",
  "chat_segment",
  "chat_status",
  "chat_thinking",
  "chat_variant_switch",
  "tool_call",
  "tool_result",
  "shared_crew.decision",
  "approval_resolved"
], I = 5, x = 32, J = 8, w = 100, G = 8, Q = /* @__PURE__ */ new Set([
  "accepted_at",
  "approved",
  "approval_id",
  "author",
  "category",
  "cls",
  "code",
  "content",
  "continuing",
  "data",
  "decision",
  "decision_id",
  "detail",
  "display",
  "entries",
  "error",
  "final",
  "gen",
  "history",
  "id",
  "input",
  "input_preview",
  "is_shell",
  "is_update",
  "key",
  "kind",
  "last",
  "login",
  "message",
  "messages",
  "meta",
  "mid",
  "name",
  "needs_input",
  "outcome",
  "output",
  "principal",
  "purpose",
  "revision",
  "role",
  "schema_version",
  "seq",
  "session_key",
  "slot",
  "state",
  "status",
  "text",
  "tool",
  "tool_call_id",
  "tool_input",
  "tool_name",
  "ts",
  "turn",
  "turn_gen",
  "type",
  "value"
]);
function g(t) {
  return typeof t == "object" && t !== null && !Array.isArray(t) ? t : null;
}
function Z(t, e) {
  return { type: t, data: e };
}
function k(t, e = 0, n = /* @__PURE__ */ new Set()) {
  if (t === null) return "null";
  if (typeof t == "boolean") return "boolean";
  if (typeof t == "number") return Number.isFinite(t) ? "number" : "non_json";
  if (typeof t == "string") return "string";
  if (typeof t != "object") return "non_json";
  if (e >= I || n.has(t)) return "depth_limit";
  const r = new Set(n);
  if (r.add(t), Array.isArray(t)) {
    const c = t.slice(0, J);
    return {
      kind: "array",
      length: Math.min(t.length, w + 1),
      items: c.map((l) => k(l, e + 1, r)),
      omitted_items: Math.max(0, t.length - c.length)
    };
  }
  const s = Object.entries(t), d = s.filter(([c]) => Q.has(c)).sort(([c], [l]) => c.localeCompare(l)).slice(0, x);
  return {
    kind: "object",
    fields: Object.fromEntries(
      d.map(([c, l]) => [
        c,
        k(l, e + 1, r)
      ])
    ),
    omitted_fields: s.length - d.length
  };
}
function tt(t) {
  const e = g(t);
  if (!e) return null;
  if (typeof e.slot == "string") return e.slot;
  const n = g(e.decision);
  return n && typeof n.session_key == "string" ? n.session_key : null;
}
function et(t, e) {
  const n = g(e);
  if (n) {
    if (t === "tool_result")
      return {
        final: typeof n.final == "boolean" ? n.final : null,
        has_tool_call_id: typeof n.tool_call_id == "string",
        has_output: Object.prototype.hasOwnProperty.call(n, "output")
      };
    if (t === "chat_error")
      return {
        category_field: ["category", "code", "type", "name"].find(
          (s) => Object.prototype.hasOwnProperty.call(n, s)
        ) ?? "none",
        has_message: Object.prototype.hasOwnProperty.call(n, "message"),
        has_error: Object.prototype.hasOwnProperty.call(n, "error")
      };
    if (t === "chat_done")
      return {
        continuing: typeof n.continuing == "boolean" ? n.continuing : null,
        needs_input: typeof n.needs_input == "boolean" ? n.needs_input : null
      };
  }
}
function nt(t, e) {
  if (!e || tt(t.data) !== e) return null;
  const n = et(t.type, t.data);
  return {
    type: t.type,
    target_slot: "[target-slot]",
    bridge_preserved_data_reference: !0,
    data_shape: k(t.data),
    ...n ? { facts: n } : {}
  };
}
function C(t, e, n = 0) {
  if (n >= I || e.size >= G || t === null) return;
  if (Array.isArray(t)) {
    for (const s of t.slice(0, w))
      C(s, e, n + 1);
    return;
  }
  const r = g(t);
  if (r)
    for (const [s, d] of Object.entries(r).slice(0, x))
      (s === "slot" || s === "session_key" || n === 0 && s === "key") && typeof d == "string" ? e.add(d) : C(d, e, n + 1);
}
function ot(t, e) {
  if (!e) return null;
  const n = /* @__PURE__ */ new Set();
  return C(t, n), n.size === 0 || [...n].some((r) => r !== e) ? null : {
    target_slot: "[target-slot]",
    declared_slot_count: n.size,
    history_shape: k(t)
  };
}
function rt(t, e) {
  return [...t, e].slice(-w);
}
function st() {
  return Object.fromEntries(
    A.map((t) => [t, 0])
  );
}
function it(t) {
  var h, c;
  const e = st();
  let n = !1, r = !1, s = !1;
  for (const l of t.captures)
    e[l.type] += 1, l.type === "chat_error" && (n = !0), l.type === "tool_result" && ((h = l.facts) == null ? void 0 : h.final) === !0 && (r = !0), l.type === "tool_result" && ((c = l.facts) == null ? void 0 : c.final) === !1 && (s = !0);
  const d = t.unsubscribeStimulusCompleted ? t.callbacksAfterUnmount === 0 ? "passed" : "failed" : "not_run";
  return {
    probe: "S2-callback-contract",
    schema_version: 1,
    supported_event_types: A,
    callback_counts: e,
    captures: t.captures,
    chat_error: n ? "observed" : "not_observed",
    tool_result_final: r ? "observed" : "not_observed",
    tool_result_non_final: s ? "observed" : "not_observed",
    reconnect: {
      sdk_callback: "not_exposed_by_useAppEvents",
      mount_count: t.mountCount,
      online_indications: t.onlineIndications,
      visibility_return_indications: t.visibilityReturnIndications
    },
    unsubscribe: {
      stimulus_completed: t.unsubscribeStimulusCompleted,
      callbacks_after_unmount: t.callbacksAfterUnmount,
      result: d
    },
    post_restart_history: t.history
  };
}
function at({ type: t, onEnvelope: e }) {
  const n = P(
    (r) => e(Z(t, r)),
    [e, t]
  );
  return W(t, n), null;
}
function S(t) {
  if (typeof t != "object" || t === null) return "request_failed";
  const e = t.status;
  return typeof e == "number" ? `http_${e}` : "request_failed";
}
function lt() {
  const t = Y(), [e, n] = p(""), [r, s] = p(!1), [d, h] = p([]), [c, l] = p(null), [v, H] = p(0), [E, L] = p(0), [R, D] = p(0), [O, _] = p(0), [j, m] = p(!1), [F, i] = p("Enter one app-owned slot before arming the probe."), y = K(!1);
  M(() => {
    const o = () => L((f) => f + 1), u = () => {
      document.visibilityState === "visible" && D((f) => f + 1);
    };
    return window.addEventListener("online", o), document.addEventListener("visibilitychange", u), () => {
      window.removeEventListener("online", o), document.removeEventListener("visibilitychange", u);
    };
  }, []);
  const q = P(
    (o) => {
      const u = nt(o, e.trim());
      if (u) {
        if (!y.current) {
          _((f) => f + 1);
          return;
        }
        h((f) => rt(f, u));
      }
    },
    [e]
  ), N = () => {
    if (!e.trim()) {
      i("A target slot is required. The probe will not record global traffic.");
      return;
    }
    y.current = !0, s(!0), H((o) => o + 1), _(0), m(!1), i("Armed for the selected app-owned slot.");
  }, U = () => {
    y.current = !1, s(!1), i("Subscriptions unmounted. Send a target-slot event to test cleanup.");
  }, T = async (o) => {
    if (!e.trim()) {
      i("A target slot is required.");
      return;
    }
    if (o)
      y.current = !1, s(!1), _(0), m(!1), await new Promise((u) => window.setTimeout(u, 0));
    else if (!r) {
      i("Arm the callback subscriptions before sending the observed turn.");
      return;
    }
    i(o ? "Sending the cleanup-check turn…" : "Sending a no-tool turn…");
    try {
      await t.post("/api/chat", {
        slot: e.trim(),
        message: "Reply with exactly CALLBACK_PROBE_OK. Do not call tools."
      }), o && m(!0), i(
        o ? "Cleanup-check turn finished. Inspect the unsubscribe result." : "No-tool turn finished."
      );
    } catch (u) {
      i(`Safe turn ${S(u)}.`);
    }
  }, B = async () => {
    if (!e.trim() || !r) {
      i("Enter the target slot and arm the callback subscriptions first.");
      return;
    }
    i("Sending a read-only tool turn…");
    try {
      await t.post("/api/chat", {
        slot: e.trim(),
        message: "Read README.md, make no changes, and reply with exactly CALLBACK_READ_OK."
      }), i("Read-only turn finished. No approval should have been required.");
    } catch (o) {
      i(`Read-only turn ${S(o)}.`);
    }
  }, X = async () => {
    const o = e.trim();
    if (!o) {
      i("A target slot is required.");
      return;
    }
    i("Reading bounded target-slot history…");
    try {
      const u = await t.get(`/api/chat/slots/${encodeURIComponent(o)}`), f = ot(u, o);
      l(f), i(
        f ? "Target-slot history shape captured without values." : "History lacked one unambiguous target slot; nothing was captured."
      );
    } catch (u) {
      l(null), i(`History read ${S(u)}.`);
    }
  }, $ = () => {
    h([]), l(null), _(0), m(!1), i("Capture cleared.");
  }, z = V(
    () => it({
      captures: d,
      mountCount: v,
      onlineIndications: E,
      visibilityReturnIndications: R,
      unsubscribeStimulusCompleted: j,
      callbacksAfterUnmount: O,
      history: c
    }),
    [
      O,
      d,
      c,
      v,
      E,
      j,
      R
    ]
  );
  return /* @__PURE__ */ b("section", { "aria-labelledby": "s2-callback-probe-heading", children: [
    /* @__PURE__ */ a("h2", { id: "s2-callback-probe-heading", children: "S2 callback probe" }),
    /* @__PURE__ */ a("p", { children: "This development probe records field types and bounded flags only. It ignores callbacks without the exact app-owned slot." }),
    /* @__PURE__ */ b("label", { children: [
      "App-owned slot",
      /* @__PURE__ */ a(
        "input",
        {
          value: e,
          onChange: (o) => n(o.target.value),
          autoComplete: "off",
          spellCheck: !1
        }
      )
    ] }),
    /* @__PURE__ */ b("div", { children: [
      /* @__PURE__ */ a("button", { type: "button", onClick: N, children: "Arm subscriptions" }),
      " ",
      /* @__PURE__ */ a("button", { type: "button", onClick: U, children: "Unmount subscriptions" }),
      " ",
      /* @__PURE__ */ a("button", { type: "button", onClick: () => void T(!1), children: "Run no-tool turn" }),
      " ",
      /* @__PURE__ */ a("button", { type: "button", onClick: () => void B(), children: "Run read-only tool turn" }),
      " ",
      /* @__PURE__ */ a("button", { type: "button", onClick: () => void T(!0), children: "Run post-unmount check" }),
      " ",
      /* @__PURE__ */ a("button", { type: "button", onClick: () => void X(), children: "Read post-restart history" }),
      " ",
      /* @__PURE__ */ a("button", { type: "button", onClick: $, children: "Clear" })
    ] }),
    /* @__PURE__ */ a("p", { role: "status", children: F }),
    /* @__PURE__ */ b("p", { children: [
      "Subscriptions: ",
      r ? "mounted" : "unmounted"
    ] }),
    r ? A.map((o) => /* @__PURE__ */ a(at, { type: o, onEnvelope: q }, o)) : null,
    /* @__PURE__ */ b("details", { children: [
      /* @__PURE__ */ a("summary", { children: "Scrubbed machine-readable result" }),
      /* @__PURE__ */ a("pre", { children: JSON.stringify(z, null, 2) })
    ] })
  ] });
}
function pt() {
  const [t, e] = p("checking backend...");
  return M(() => {
    fetch("/apps/hh-spike/api/whoami").then((n) => n.text()).then(e).catch(() => e("backend unavailable"));
  }, []), /* @__PURE__ */ b("div", { style: { padding: 24 }, children: [
    /* @__PURE__ */ a("h1", { children: "HH Spike" }),
    /* @__PURE__ */ b("p", { children: [
      "Backend: ",
      /* @__PURE__ */ a("code", { children: t })
    ] }),
    /* @__PURE__ */ a(lt, {})
  ] });
}
export {
  pt as default
};
