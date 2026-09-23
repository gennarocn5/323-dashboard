// Builds the 323 Sports client dashboard from live HubSpot data.
// Runs daily in GitHub Actions. Needs env HUBSPOT_TOKEN (private app, crm.objects.contacts.read).
const fs = require("fs");

const OWNER_IDS = ["30688400", "30717295", "30719424", "30772289", "33234717", "349482852"];
const PROPS = ["firstname", "lastname", "hubspot_owner_id", "hs_lead_status", "createdate",
  "lead_passed_date", "lead_status_change", "num_contacted_notes", "notes_last_contacted",
  "hs_analytics_source"];

async function fetchContacts(token) {
  // Jan 1, or 31 days back if earlier, so "Last 30 Days" works in January
  const ytdStart = Math.min(Date.UTC(new Date().getUTCFullYear(), 0, 1), Date.now() - 31 * 86400000);
  const all = [];
  let after;
  do {
    const body = {
      filterGroups: [{ filters: [
        { propertyName: "hubspot_owner_id", operator: "IN", values: OWNER_IDS },
        { propertyName: "createdate", operator: "GTE", value: String(ytdStart) }
      ]}],
      properties: PROPS,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
      ...(after ? { after } : {})
    };
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const r of json.results) {
      const p = {};
      for (const k of PROPS) if (r.properties[k] != null && r.properties[k] !== "") p[k] = r.properties[k];
      all.push({ id: r.id, properties: p });
    }
    after = json.paging?.next?.after;
    await new Promise(r => setTimeout(r, 300));
  } while (after && all.length < 9900);
  return all;
}

(async () => {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN secret is not set.");
  const contacts = await fetchContacts(token);
  const data = { generatedAt: new Date().toISOString(), contacts };
  const tpl = fs.readFileSync("template.html", "utf8");
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const out = tpl.replace("/*__DATA__*/null", json);
  if (out === tpl) throw new Error("Data placeholder not found in template.");
  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync("dist/index.html", out);
  console.log(`Built dashboard with ${contacts.length} contacts.`);
})().catch(e => { console.error(e); process.exit(1); });
