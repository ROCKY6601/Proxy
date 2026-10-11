// ============================================================
// ProxyMaster Pro — Frontend Logic
// ============================================================

const API = "api/check.php"; // backend endpoint

// ---------- TABS ----------
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

// ---------- ELEMENTS ----------
const $ = id => document.getElementById(id);
const progressWrap = $("progressWrap");
const progressFill = $("progressFill");
const progressText = $("progressText");
const progressPct  = $("progressPct");
const resultsBox   = $("results");
const tbody        = document.querySelector("#resultTable tbody");
const liveCountEl  = $("liveCount");
const deadCountEl  = $("deadCount");

let allResults = [];

// ---------- CHECK ONE PROXY (frontend call to backend) ----------
async function checkProxy(proxy) {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proxy)
    });
    if (!res.ok) throw new Error("Network error");
    return await res.json();
  } catch (e) {
    return { status: "dead", speed: 0, country: "-", anonymity: "-", error: true };
  }
}

// ---------- RENDER ROW ----------
function renderRow(index, data) {
  const tr = document.createElement("tr");

  const speedClass = data.speed < 800 ? "speed-fast"
                   : data.speed < 2000 ? "speed-mid"
                   : "speed-slow";

  const proxyLabel = data.user
    ? `${data.ip}:${data.port}:${data.user}:****`
    : `${data.ip}:${data.port}`;

  tr.innerHTML = `
    <td>${index}</td>
    <td><code>${proxyLabel}</code></td>
    <td><span class="${data.status === 'live' ? 'status-live' : 'status-dead'}">
        ${data.status === 'live' ? '● LIVE' : '● DEAD'}
    </span></td>
    <td>${data.status === 'live'
        ? `<span class="speed-bar ${speedClass}">${data.speed} ms</span>`
        : '-'}</td>
    <td>${data.country || '-'}</td>
    <td>${data.anonymity || '-'}</td>
  `;
  tbody.appendChild(tr);
}

// ---------- UPDATE COUNTERS ----------
function updateCounters() {
  const live = allResults.filter(r => r.status === "live").length;
  const dead = allResults.filter(r => r.status === "dead").length;
  liveCountEl.textContent = `Live: ${live}`;
  deadCountEl.textContent = `Dead: ${dead}`;
}

// ---------- SINGLE CHECK ----------
$("checkSingle").addEventListener("click", async () => {
  const ip   = $("ip").value.trim();
  const port = $("port").value.trim();
  const user = $("user").value.trim();
  const pass = $("pass").value.trim();

  if (!ip || !port) {
    alert("Please enter IP and Port.");
    return;
  }

  resetUI();
  progressWrap.classList.remove("hidden");
  progressText.textContent = "Checking proxy...";

  // fake progress for UX
  animateProgress(0, 60);

  const result = await checkProxy({ ip, port, user, pass });

  animateProgress(60, 100);
  setTimeout(() => {
    progressWrap.classList.add("hidden");
    resultsBox.classList.remove("hidden");

    allResults = [{ ...result, ip, port, user }];
    tbody.innerHTML = "";
    renderRow(1, allResults[0]);
    updateCounters();
  }, 400);
});

// ---------- BULK CHECK ----------
let bulkProxies = [];

$("dropZone").addEventListener("click", () => $("fileInput").click());
$("dropZone").addEventListener("dragover", e => {
  e.preventDefault(); $("dropZone").classList.add("dragover");
});
$("dropZone").addEventListener("dragleave", () => $("dropZone").classList.remove("dragover"));
$("dropZone").addEventListener("drop", e => {
  e.preventDefault(); $("dropZone").classList.remove("dragover");
  handleFile(e.dataTransfer.files[0]);
});
$("fileInput").addEventListener("change", e => handleFile(e.target.files[0]));

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    bulkProxies = parseProxies(e.target.result);
    alert(`✅ ${bulkProxies.length} proxies loaded.`);
  };
  reader.readAsText(file);
}

function parseProxies(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    // formats: ip:port  OR  ip:port:user:pass
    const p = line.split(":");
    return {
      ip: p[0],
      port: p[1],
      user: p[2] || "",
      pass: p[3] || ""
    };
  }).filter(p => p.ip && p.port);
}

$("checkBulk").addEventListener("click", async () => {
  if (!bulkProxies.length) {
    alert("Please upload a file first.");
    return;
  }

  resetUI();
  progressWrap.classList.remove("hidden");
  resultsBox.classList.remove("hidden");

  allResults = [];
  tbody.innerHTML = "";

  const total = bulkProxies.length;
  const CONCURRENCY = 15; // parallel checks
  let done = 0;

  async function worker(queue) {
    while (queue.length) {
      const proxy = queue.shift();
      const data = await checkProxy(proxy);
      allResults.push({ ...data, ...proxy });
      renderRow(allResults.length, { ...data, ...proxy });
      done++;
      const pct = Math.round((done / total) * 100);
      progressFill.style.width = pct + "%";
      progressPct.textContent  = pct + "%";
      progressText.textContent = `Checked ${done} / ${total}`;
      updateCounters();
    }
  }

  const queue = [...bulkProxies];
  const workers = Array.from({ length: CONCURRENCY }, () => worker(queue));
  await Promise.all(workers);

  progressText.textContent = "✅ All proxies checked!";
  setTimeout(() => progressWrap.classList.add("hidden"), 1500);
});

// ---------- HELPERS ----------
function resetUI() {
  tbody.innerHTML = "";
  allResults = [];
  progressFill.style.width = "0%";
  progressPct.textContent = "0%";
  updateCounters();
}

function animateProgress(from, to) {
  let cur = from;
  const step = setInterval(() => {
    cur += 2;
    if (cur >= to) { clearInterval(step); cur = to; }
    progressFill.style.width = cur + "%";
    progressPct.textContent  = cur + "%";
  }, 20);
}

// ---------- EXPORT ----------
$("exportCsv").addEventListener("click", () => exportData("csv"));
$("exportTxt").addEventListener("click", () => exportData("txt"));

function exportData(type) {
  if (!allResults.length) return alert("No results to export.");

  let content = "";
  if (type === "csv") {
    content = "IP,PORT,USER,STATUS,SPEED_MS,COUNTRY,ANONYMITY\n";
    allResults.forEach(r => {
      content += `${r.ip},${r.port},${r.user || ""},${r.status},${r.speed},${r.country},${r.anonymity}\n`;
    });
  } else {
    allResults.forEach(r => {
      content += `${r.ip}:${r.port}${r.user ? ":" + r.user : ""} | ${r.status.toUpperCase()} | ${r.speed}ms | ${r.country}\n`;
    });
  }

  const blob = new Blob([content], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `proxy-results.${type}`;
  a.click();
}
