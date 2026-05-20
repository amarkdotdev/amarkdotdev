const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN is required");
}

const endpoint = "https://api.github.com/graphql";

const query = `
  query ProfileOssPanel {
    publicRecent: search(query: "is:pr author:amarkdotdev is:public sort:updated-desc", type: ISSUE, first: 8) {
      issueCount
      nodes {
        ... on PullRequest {
          title
          number
          url
          state
          isDraft
          updatedAt
          createdAt
          mergedAt
          author {
            login
          }
          repository {
            nameWithOwner
            owner {
              login
            }
          }
        }
      }
    }
    externalOpen: search(query: "is:pr author:amarkdotdev is:public is:open -user:amarkdotdev", type: ISSUE, first: 8) {
      issueCount
      nodes {
        ... on PullRequest {
          title
          number
          url
          state
          isDraft
          updatedAt
          createdAt
          mergedAt
          author {
            login
          }
          repository {
            nameWithOwner
            owner {
              login
            }
          }
        }
      }
    }
    externalMerged: search(query: "is:pr author:amarkdotdev is:public is:merged -user:amarkdotdev sort:updated-desc", type: ISSUE, first: 8) {
      issueCount
      nodes {
        ... on PullRequest {
          author {
            login
          }
        }
      }
    }
  }
`;

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "amarkdotdev-profile-panel"
  },
  body: JSON.stringify({ query })
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status}`);
}

const payload = await response.json();

if (payload.errors) {
  throw new Error(JSON.stringify(payload.errors, null, 2));
}

const data = payload.data;

const isMine = (pr) => pr?.author?.login === "amarkdotdev";

const publicRecent = data.publicRecent.nodes.filter(isMine);
const externalOpen = data.externalOpen.nodes.filter(isMine);
const externalMerged = data.externalMerged.nodes.filter(isMine);
const featured = externalOpen[0] ?? publicRecent[0] ?? null;

const monthKey = (iso) => iso.slice(0, 7);
const monthLabel = (iso) => {
  const [year, month] = iso.split("-");
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC"
  });
};

const now = new Date();
const months = [];
for (let i = 5; i >= 0; i -= 1) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  months.push({ key, label: monthLabel(key), count: 0 });
}

for (const pr of publicRecent) {
  const key = monthKey(pr.updatedAt);
  const bucket = months.find((m) => m.key === key);
  if (bucket) bucket.count += 1;
}

const maxCount = Math.max(1, ...months.map((m) => m.count));

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });

const formatRelativeDays = (iso) => {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
};

const truncate = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}...`);

const wrapText = (text, maxLen) => {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).map((line, i, arr) => {
    if (i === arr.length - 1 && lines.length > 2) return `${line.slice(0, Math.max(0, maxLen - 3))}...`;
    return line;
  });
};

const featuredTitleLines = featured ? wrapText(featured.title, 34) : ["No public PRs found"];
const recentRows = publicRecent.slice(0, 3);
const visibleRows = [...recentRows];
while (visibleRows.length < 3) {
  visibleRows.push(null);
}

const stateColor = (pr) => {
  if (pr.isDraft) return "#FFB357";
  if (pr.state === "OPEN") return "#33B5E5";
  if (pr.mergedAt) return "#73BF69";
  return "#F2495C";
};

const stateLabel = (pr) => {
  if (pr.isDraft) return "DRAFT";
  if (pr.state === "OPEN") return "OPEN";
  if (pr.mergedAt) return "MERGED";
  return pr.state;
};

const bars = months
  .map((month, index) => {
    const x = 544 + index * 52;
    const height = Math.round((month.count / maxCount) * 62);
    const y = 150 - height;
    return `
      <rect x="${x}" y="${y}" width="24" height="${height}" rx="6" fill="#33B5E5" opacity="${month.count === 0 ? "0.22" : "0.88"}" />
      <text x="${x + 12}" y="172" text-anchor="middle" class="axis">${month.label}</text>
      <text x="${x + 12}" y="${y - 8}" text-anchor="middle" class="tiny">${month.count}</text>
    `;
  })
  .join("");

const rows = visibleRows
  .map((pr, index) => {
    const y = 404 + index * 36;
    if (!pr) {
      return `
      <line x1="28" y1="${y - 20}" x2="892" y2="${y - 20}" stroke="#293241" stroke-width="1" />
      <circle cx="43" cy="${y}" r="4" fill="#4B5563" />
      <text x="58" y="${y + 5}" class="rowPlaceholder">waiting for next upstream contribution</text>
    `;
    }
    return `
      <line x1="28" y1="${y - 20}" x2="892" y2="${y - 20}" stroke="#293241" stroke-width="1" />
      <circle cx="43" cy="${y}" r="5" fill="${stateColor(pr)}" />
      <text x="58" y="${y + 5}" class="rowRepo">${escapeXml(pr.repository.nameWithOwner)}</text>
      <text x="392" y="${y + 5}" class="rowTitle">${escapeXml(truncate(pr.title, 44))}</text>
      <text x="790" y="${y + 5}" text-anchor="end" class="rowMeta">#${pr.number}</text>
      <text x="876" y="${y + 5}" text-anchor="end" class="rowMeta">${escapeXml(formatRelativeDays(pr.updatedAt))}</text>
    `;
  })
  .join("");

const refreshedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

const svg = `
<svg width="920" height="500" viewBox="0 0 920 500" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="OSS contribution panel">
  <defs>
    <linearGradient id="topline" x1="20" y1="0" x2="900" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#33B5E5" />
      <stop offset="1" stop-color="#73BF69" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <rect x="0" y="0" width="920" height="500" rx="18" fill="#111217" />
  <rect x="0" y="0" width="920" height="4" rx="4" fill="url(#topline)" />
  <rect x="14" y="14" width="892" height="472" rx="16" fill="#161A22" stroke="#2A3441" />

  <text x="28" y="44" class="title">OSS Contribution Panel</text>
  <circle cx="286" cy="38" r="5" fill="#73BF69" filter="url(#glow)" />
  <text x="300" y="43" class="live">LIVE</text>
  <text x="892" y="43" text-anchor="end" class="meta">refreshed ${escapeXml(refreshedAt)}</text>

  <rect x="28" y="62" width="200" height="84" rx="14" fill="#1D2430" stroke="#2F3B4C" />
  <text x="44" y="88" class="panelLabel">Open OSS PRs</text>
  <text x="44" y="125" class="bigValue">${externalOpen.length}</text>
  <text x="44" y="138" class="panelMeta">outside your own repos</text>

  <rect x="256" y="62" width="200" height="84" rx="14" fill="#1D2430" stroke="#2F3B4C" />
  <text x="272" y="88" class="panelLabel">Merged OSS PRs</text>
  <text x="272" y="125" class="bigValue">${externalMerged.length}</text>
  <text x="272" y="138" class="panelMeta">public merged history</text>

  <rect x="484" y="62" width="392" height="136" rx="14" fill="#1D2430" stroke="#2F3B4C" />
  <text x="500" y="88" class="panelLabel">Public PR activity (last 6 months)</text>
  ${bars}

  <rect x="28" y="214" width="864" height="142" rx="14" fill="#1D2430" stroke="#2F3B4C" />
  <text x="44" y="242" class="panelLabel">Featured contribution</text>
  ${
    featured
      ? `
    <text x="44" y="270" class="repo">${escapeXml(featured.repository.nameWithOwner)}</text>
    <rect x="724" y="236" width="132" height="30" rx="15" fill="${stateColor(featured)}" opacity="0.18" />
    <text x="790" y="256" text-anchor="middle" class="state" fill="${stateColor(featured)}">STATUS: ${stateLabel(featured)}</text>
    <text x="44" y="300" class="prTitle">${escapeXml(featuredTitleLines[0] ?? "")}</text>
    <text x="44" y="330" class="prTitle">${escapeXml(featuredTitleLines[1] ?? "")}</text>
    <text x="44" y="238" class="hidden"></text>
    <text x="600" y="302" class="panelMeta">PR #${featured.number}</text>
    <text x="600" y="328" class="panelMeta">updated ${escapeXml(formatDate(featured.updatedAt))}</text>
    <text x="740" y="302" class="panelMeta">created ${escapeXml(formatDate(featured.createdAt))}</text>
    <text x="740" y="328" class="panelMeta">${escapeXml(formatRelativeDays(featured.updatedAt))}</text>
  `
      : `
    <text x="44" y="224" class="prTitle">No public pull requests found yet.</text>
  `
  }

  <rect x="28" y="376" width="864" height="108" rx="14" fill="#1D2430" stroke="#2F3B4C" />
  <text x="44" y="404" class="panelLabel">Recent public pull requests</text>
  ${rows}

  <style>
    .title { fill: #E5E7EB; font: 700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .live { fill: #73BF69; font: 700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 1.2px; }
    .meta { fill: #8B97A7; font: 500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .panelLabel { fill: #9CA9B7; font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0.6px; text-transform: uppercase; }
    .bigValue { fill: #F9FAFB; font: 700 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .panelMeta { fill: #8B97A7; font: 500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .repo { fill: #33B5E5; font: 700 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .state { font: 700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0.8px; }
    .prTitle { fill: #E5E7EB; font: 700 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .rowRepo { fill: #A5D8FF; font: 600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .rowTitle { fill: #E5E7EB; font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .rowMeta { fill: #9CA9B7; font: 500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .rowPlaceholder { fill: #6B7280; font: 500 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .axis { fill: #7B8794; font: 500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .tiny { fill: #A5D8FF; font: 600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .hidden { display: none; }
  </style>
</svg>
`.trim();

process.stdout.write(svg);
