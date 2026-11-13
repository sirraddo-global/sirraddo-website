// A small in-memory Cloudflare API (Pages, DNS, custom domains, Email Routing) for the tests.
export const CF = { zones: [], dns: [], projects: {}, assets: new Map(), deployments: [], domains: {}, addresses: [], rules: [], calls: [], n: 0 };
const ok = (result, status = 200) => new Response(JSON.stringify({ success: true, errors: [], result }), { status });
const err = (status, code, message) => new Response(JSON.stringify({ success: false, errors: [{ code, message }], result: null }), { status });
export async function cfFetch(url, opts = {}) {
  const u = new URL(url); const p = u.pathname.replace("/client/v4", ""); const m = (opts.method || "GET").toUpperCase();
  const auth = opts.headers?.Authorization || "";
  CF.calls.push(`${m} ${p}`);
  const body = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
  const id = () => "id" + (++CF.n);
  let mm;
  if (p.startsWith("/pages/assets/") && auth !== "Bearer JWT") return err(401, 8000000, "bad jwt");
  if (!p.startsWith("/pages/assets/") && auth !== "Bearer cftoken") return err(403, 10000, "Authentication error");
  if (p === "/zones" && m === "GET") return ok(CF.zones.filter((z) => z.name === u.searchParams.get("name")));
  if (p === "/zones" && m === "POST") { const z = { id: id(), name: body.name, status: "pending", name_servers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"] }; CF.zones.push(z); return ok(z); }
  if ((mm = p.match(/^\/zones\/([^/]+)$/))) return ok(CF.zones.find((z) => z.id === mm[1]));
  if ((mm = p.match(/^\/zones\/([^/]+)\/dns_records$/))) {
    if (m === "GET") return ok(CF.dns.filter((r) => r.zone === mm[1] && r.name === u.searchParams.get("name")));
    const r = { id: id(), zone: mm[1], ...body }; CF.dns.push(r); return ok(r);
  }
  if ((mm = p.match(/^\/zones\/([^/]+)\/dns_records\/([^/]+)$/)) && m === "DELETE") { CF.dns = CF.dns.filter((r) => r.id !== mm[2]); return ok({ id: mm[2] }); }
  if ((mm = p.match(/^\/accounts\/acct1\/pages\/projects\/([^/]+)$/))) return CF.projects[mm[1]] ? ok(CF.projects[mm[1]]) : err(404, 8000007, "Project not found");
  if (p === "/accounts/acct1/pages/projects" && m === "POST") { if (CF.projects[body.name]) return err(409, 8000002, "A project with this name already exists"); CF.projects[body.name] = { name: body.name, subdomain: body.name + ".pages.dev" }; return ok(CF.projects[body.name]); }
  if ((mm = p.match(/^\/accounts\/acct1\/pages\/projects\/([^/]+)\/upload-token$/))) return ok({ jwt: "JWT" });
  if (p === "/pages/assets/check-missing") return ok(body.hashes.filter((h) => !CF.assets.has(h)));
  if (p === "/pages/assets/upload") { for (const f of body) CF.assets.set(f.key, f); return ok(null); }
  if (p === "/pages/assets/upsert-hashes") return ok(null);
  if ((mm = p.match(/^\/accounts\/acct1\/pages\/projects\/([^/]+)\/deployments$/))) {
    const manifest = JSON.parse(opts.body.get("manifest"));
    const missing = Object.values(manifest).filter((h) => !CF.assets.has(h));
    if (missing.length) return err(400, 8000096, "missing assets " + missing.length);
    const d = { id: id(), project: mm[1], manifest, branch: opts.body.get("branch") }; CF.deployments.push(d); return ok(d);
  }
  if ((mm = p.match(/^\/accounts\/acct1\/pages\/projects\/([^/]+)\/domains$/))) {
    const list = CF.domains[mm[1]] ||= [];
    if (m === "GET") return ok(list);
    if (list.some((d) => d.name === body.name)) return err(409, 8000018, "You have already added this custom domain.");
    const d = { name: body.name, status: "pending" }; list.push(d); return ok(d);
  }
  if ((mm = p.match(/^\/zones\/([^/]+)\/email\/routing\/dns$/))) return ok({ enabled: true });
  if (p === "/accounts/acct1/email/routing/addresses") {
    if (m === "GET") return ok(CF.addresses);
    const a = { id: id(), email: body.email, verified: null }; CF.addresses.push(a); return ok(a);
  }
  if ((mm = p.match(/^\/zones\/([^/]+)\/email\/routing\/rules$/))) {
    if (m === "GET") return ok(CF.rules.filter((r) => r.zone === mm[1]));
    const to = body.actions[0].value[0];
    if (!CF.addresses.find((a) => a.email === to)?.verified) return err(400, 2020, "Destination address is not verified.");
    const r = { id: id(), zone: mm[1], ...body }; CF.rules.push(r); return ok(r);
  }
  if ((mm = p.match(/^\/zones\/([^/]+)\/email\/routing\/rules\/([^/]+)$/))) {
    const r = CF.rules.find((x) => x.id === mm[2]); if (m === "PUT") Object.assign(r, body); return ok(r);
  }
  return err(404, 7003, "No route for " + m + " " + p);
}
