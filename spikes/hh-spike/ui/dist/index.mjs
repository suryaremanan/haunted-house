import { jsxs as o, jsx as t } from "react/jsx-runtime";
import { useAppEvents as i } from "@kirocrew/app-sdk";
import { useState as l, useEffect as d } from "react";
function v() {
  const [h, s] = l("checking backend..."), [r, p] = l([]);
  d(() => {
    fetch("/apps/hh-spike/api/whoami").then((e) => e.text()).then(s).catch((e) => s(String(e)));
  }, []);
  const n = (e) => (c) => p((a) => [`${e}: ${JSON.stringify(c).slice(0, 200)}`, ...a].slice(0, 30));
  return i("tool_call", n("tool_call")), i("approval", n("approval")), i("subagent_done", n("subagent_done")), /* @__PURE__ */ o("div", { style: { padding: 24 }, children: [
    /* @__PURE__ */ t("h1", { children: "HH Spike" }),
    /* @__PURE__ */ o("p", { children: [
      "Backend: ",
      /* @__PURE__ */ t("code", { children: h })
    ] }),
    /* @__PURE__ */ t("h2", { children: "Events" }),
    /* @__PURE__ */ t("ul", { children: r.map((e, c) => /* @__PURE__ */ t("li", { children: /* @__PURE__ */ t("code", { children: e }) }, c)) })
  ] });
}
export {
  v as default
};
