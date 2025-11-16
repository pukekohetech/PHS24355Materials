/* script.js – US 24355 app: core logic + JSON loading + PDF + share  */

// Local storage
const STORAGE_KEY = "TECH_DATA";
let data;
try {
  data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { answers: {} };
} catch (_) {
  data = { answers: {} };
}

// State
let currentAssessment = null;
let finalData = null;

// Simple XOR obfuscation for answers
const XOR_KEY = 42;
const xor = s =>
  btoa(
    [...s]
      .map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY))
      .join("")
  );
const unxor = s => {
  try {
    return atob(s)
      .split("")
      .map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY))
      .join("");
  } catch (_) {
    return "";
  }
};

// Filled from questions.json
let APP_TITLE, APP_SUBTITLE, TEACHERS, ASSESSMENTS;

/* --------------------------------------------------------------
   Load questions.json
   -------------------------------------------------------------- */
async function loadQuestions() {
  try {
    const res = await fetch("questions.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    APP_TITLE = json.APP_TITLE;
    APP_SUBTITLE = json.APP_SUBTITLE;
    TEACHERS = json.TEACHERS;

    // Convert string regex to RegExp objects
    ASSESSMENTS = json.ASSESSMENTS.map(ass => ({
      ...ass,
      questions: ass.questions.map(q => ({
        ...q,
        rubric:
          q.rubric?.map(r => ({
            ...r,
            check: new RegExp(r.check, "i")
          })) || []
      }))
    }));
  } catch (err) {
    console.error("Failed to load questions.json:", err);
    document.body.innerHTML = `
      <div style="text-align:center;padding:40px;color:#e74c3c;font-family:sans-serif;">
        <h2>Failed to load assessment data</h2>
        <p>Check that <code>questions.json</code> exists and is valid JSON.</p>
        <p><strong>Error:</strong> ${err.message}</p>
      </div>`;
    throw err;
  }
}

/* --------------------------------------------------------------
   initApp – runs after JSON is loaded
   -------------------------------------------------------------- */
function initApp() {
  document.getElementById("loading")?.remove();

  document.getElementById("page-title").textContent = APP_TITLE;
  document.getElementById("header-title").textContent = APP_TITLE;
  document.getElementById("header-subtitle").textContent = APP_SUBTITLE;

  const nameEl = document.getElementById("name");
  const idEl = document.getElementById("id");
  nameEl.value = data.name || "";
  idEl.value = data.id || "";
  if (data.teacher) document.getElementById("teacher").value = data.teacher;

  // Lock ID if already set
  if (data.id) {
    document.getElementById("locked-msg").classList.remove("hidden");
    document.getElementById("locked-id").textContent = data.id;
    idEl.readOnly = true;
  }

  // Teacher list
  const teacherSel = document.getElementById("teacher");
  TEACHERS.forEach(t => {
    const o = document.createElement("option");
    o.value = t.email;
    o.textContent = t.name;
    teacherSel.appendChild(o);
  });

  // Assessment selector
  const assSel = document.getElementById("assessmentSelector");
  ASSESSMENTS.forEach((a, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `${a.title} – ${a.subtitle}`;
    assSel.appendChild(o);
  });
}

/* --------------------------------------------------------------
   Core functions
   -------------------------------------------------------------- */
function saveStudentInfo() {
  data.name = document.getElementById("name").value.trim();
  data.id = document.getElementById("id").value.trim();
  data.teacher = document.getElementById("teacher").value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadAssessment() {
  const idx = document.getElementById("assessmentSelector").value;
  if (idx === "") return;
  saveStudentInfo();
  currentAssessment = ASSESSMENTS[idx];

  const container = document.getElementById("questions");
  container.innerHTML = `
    <div class="assessment-header">
      <h2>${currentAssessment.title}</h2>
      <p>${currentAssessment.subtitle}</p>
    </div>`;

  currentAssessment.questions.forEach(q => {
    const saved = data.answers[currentAssessment.id]?.[q.id]
      ? unxor(data.answers[currentAssessment.id][q.id])
      : "";
    const field =
      q.type === "long"
        ? `<textarea rows="5" id="a${q.id}" class="answer-field">${saved}</textarea>`
        : `<input type="text" id="a${q.id}" value="${saved}" class="answer-field">`;

    const div = document.createElement("div");
    div.className = "q";
    div.innerHTML = `
      <strong>${q.id.toUpperCase()} (${q.maxPoints} pts)</strong><br>
      ${q.text}<br>
      ${field}`;
    container.appendChild(div);
  });

  attachProtection();
}

function saveAnswer(qid) {
  const el = document.getElementById("a" + qid);
  if (!el) return;
  const val = el.value;
  if (!data.answers[currentAssessment.id]) data.answers[currentAssessment.id] = {};
  data.answers[currentAssessment.id][qid] = xor(val);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getAnswer(id) {
  const raw = data.answers[currentAssessment.id]?.[id] || "";
  return raw ? unxor(raw) : "";
}

function gradeIt() {
  let total = 0;
  const results = [];

  currentAssessment.questions.forEach(q => {
    const ans = getAnswer(q.id);
    let earned = 0;
    const hints = [];

    if (q.rubric) {
      q.rubric.forEach(r => {
        if (r.check.test(ans)) {
          earned += r.points;
        } else if (r.hint) {
          hints.push(r.hint);
        }
      });
    }

    // Cap at maxPoints for safety
    earned = Math.min(earned, q.maxPoints);

    total += earned;
    const isCorrect = earned === q.maxPoints;
    results.push({
      id: q.id.toUpperCase(),
      question: q.text,
      answer: ans || "(blank)",
      earned,
      max: q.maxPoints,
      markText: isCorrect
        ? "Correct"
        : earned > 0
        ? "Incorrect (partial)"
        : "Incorrect",
      hint: hints.length
        ? hints.join(" • ")
        : isCorrect
        ? ""
        : q.hint || "Check your answer"
    });
  });

  return { total, results };
}

/* --------------------------------------------------------------
   Submit & show results
   -------------------------------------------------------------- */
function submitWork() {
  saveStudentInfo();
  const name = data.name;
  const id = data.id;

  if (!name || !id || !data.teacher) {
    return alert("Fill Name, ID and Teacher");
  }
  if (!currentAssessment) return alert("Select an assessment");
  if (data.id && document.getElementById("id").value !== data.id) {
    return alert("ID locked to: " + data.id);
  }

  const { total, results } = gradeIt();
  const totalPoints =
    currentAssessment.totalPoints ||
    currentAssessment.questions.reduce(
      (sum, q) => sum + (q.maxPoints || 0),
      0
    );
  const pct = totalPoints ? Math.round((total / totalPoints) * 100) : 0;

  finalData = {
    name,
    id,
    teacherName:
      document.getElementById("teacher").selectedOptions[0].textContent,
    teacherEmail: data.teacher,
    assessment: currentAssessment,
    points: total,
    totalPoints,
    pct,
    submittedAt: new Date().toLocaleString(),
    results
  };

  document.getElementById("student").textContent = name;
  document.getElementById("teacher-name").textContent = finalData.teacherName;
  document.getElementById(
    "grade"
  ).innerHTML = `${total}/${totalPoints}<br><small>(${pct}%)</small>`;

  const ansDiv = document.getElementById("answers");
  ansDiv.innerHTML = `
    <h3>${currentAssessment.title}<br>
    <small>${currentAssessment.subtitle}</small></h3>`;
  results.forEach(r => {
    const d = document.createElement("div");
    d.className = `feedback ${
      r.earned === r.max ? "correct" : r.earned > 0 ? "partial" : "wrong"
    }`;
    d.innerHTML = `
      <strong>${r.id}: ${r.earned}/${r.max} — ${r.markText}</strong><br>
      Your answer: <em>${r.answer}</em><br>
      ${r.earned < r.max ? "<strong>Tip:</strong> " + r.hint : "Perfect!"}`;
    ansDiv.appendChild(d);
  });

  document.getElementById("form").classList.add("hidden");
  document.getElementById("result").classList.remove("hidden");
}

function back() {
  document.getElementById("result").classList.add("hidden");
  document.getElementById("form").classList.remove("hidden");
}

/* --------------------------------------------------------------
   Build printable / email body from finalData
   -------------------------------------------------------------- */
function buildEmailBody(fd) {
  const lines = [];

  lines.push(`Pukekohe High School – ${APP_TITLE}`);
  lines.push(APP_SUBTITLE);
  lines.push("");
  lines.push(`Assessment: ${fd.assessment.title} – ${fd.assessment.subtitle}`);
  lines.push(`Student: ${fd.name} (ID: ${fd.id})`);
  lines.push(`Teacher: ${fd.teacherName} <${fd.teacherEmail}>`);
  lines.push(`Submitted: ${fd.submittedAt}`);
  lines.push("");
  lines.push(`Score: ${fd.points}/${fd.totalPoints} (${fd.pct}%)`);
  lines.push("=".repeat(60));
  lines.push("");

  fd.results.forEach(r => {
    lines.push(`${r.id}: ${r.earned}/${r.max} — ${r.markText}`);
    lines.push(`Question: ${r.question}`);
    lines.push(`Answer: ${r.answer}`);
    if (r.earned < r.max && r.hint) {
      lines.push(`Tip: ${r.hint}`);
    }
    lines.push("-".repeat(60));
    lines.push("");
  });

  lines.push("Generated by Pukekohe High School Technology Dept");
  return lines.join("\n");
}

/* --------------------------------------------------------------
   Share helper – PDF + text body, fallback to mailto (short)
   -------------------------------------------------------------- */
async function sharePDF(file) {
  if (!finalData) return;

  // Dynamic subject from questions.json title
  const subject = `${finalData.assessment.title} – ${finalData.name} (${finalData.id})`;

  const fullBody = buildEmailBody(finalData);

  const shareData = {
    files: [file],
    title: subject,
    text: fullBody
  };

  // Preferred: Web Share with file + full body text
  if (navigator.canShare && navigator.canShare(shareData)) {
    try {
      await navigator.share(shareData);
      showToast("Shared");
    } catch (err) {
      console.warn(err);
      if (!String(err).includes("AbortError")) {
        showToast("Share failed", false);
      }
    }
    return;
  }

  // Fallback → download the PDF
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  // Shorter body for mailto (avoid huge URL)
  const shortBodyLines = [
    `Assessment: ${finalData.assessment.title}`,
    `Student: ${finalData.name} (ID: ${finalData.id})`,
    `Teacher: ${finalData.teacherName}`,
    `Submitted: ${finalData.submittedAt}`,
    `Score: ${finalData.points}/${finalData.totalPoints} (${finalData.pct}%)`,
    "",
    "The full marked report is in the attached PDF (or in the downloaded file)."
  ];
  const shortBody = shortBodyLines.join("\n");

  const mailto =
    `mailto:${encodeURIComponent(finalData.teacherEmail)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(shortBody)}`;

  // This opens the mail client; body is small enough not to choke it
  window.location.href = mailto;

  showToast("Downloaded (share not supported)");
}

* --------------------------------------------------------------
   Email / PDF Share
   -------------------------------------------------------------- */
function buildEmailBody(fd) {
  const l = [];
  l.push(`Pukekohe High School – ${APP_TITLE}`); l.push(APP_SUBTITLE); l.push("");
  l.push(`Assessment: ${fd.assessment.title} – ${fd.assessment.subtitle}`);
  l.push(`Student: ${fd.name} (ID: ${fd.id})`);
  l.push(`Teacher: ${fd.teacherName} <${fd.teacherEmail}>`);
  l.push(`Submitted: ${fd.submittedAt}`); l.push("");
  l.push(`Score: ${fd.points}/${fd.totalPoints} (${fd.pct}%)`); l.push("=".repeat(60)); l.push("");
  fd.results.forEach(r => {
    l.push(`${r.id}: ${r.earned}/${r.max} — ${r.markText}`);
    l.push(`Question: ${r.question}`); l.push(`Answer: ${r.answer}`);
    if (r.earned < r.max && r.hint) l.push(`Tip: ${r.hint}`);
    l.push("-".repeat(60)); l.push("");
  });
  l.push("Generated by Pukekohe High School Technology Dept");
  return l.join("\n");
}

async function sharePDF(file) {
  if (!finalData) return;
  const subject = `${finalData.assessment.title} – ${finalData.name} (${finalData.id})`;
  const fullBody = buildEmailBody(finalData);
  const shareData = { files: [file], title: subject, text: fullBody };

  if (navigator.canShare && navigator.canShare(shareData)) {
    try { await navigator.share(shareData); showToast("Shared"); return; }
    catch (err) { if (!String(err).includes("AbortError")) showToast("Share failed", false); }
  }

  // Fallback: download + mailto
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  const shortBody = [
    `Assessment: ${finalData.assessment.title}`, `Student: ${finalData.name} (ID: ${finalData.id})`,
    `Teacher: ${finalData.teacherName}`, `Submitted: ${finalData.submittedAt}`,
    `Score: ${finalData.points}/${finalData.totalPoints} (${finalData.pct}%)`, "",
    "Full report attached as PDF."
  ].join("\n");

  window.location.href = `mailto:${encodeURIComponent(finalData.teacherEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shortBody)}`;
  showToast("Downloaded + email opened");
}

async function emailWork() {
  if (!finalData) return alert("Submit first!");

  const load = src => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });

  try {
    await load("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await load("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  } catch (e) {
    return showToast("Failed to load PDF tools", false);
  }

  const { jsPDF } = window.jspdf;
  const resultEl = document.getElementById("result");
  const btns = document.querySelectorAll(".btn-group");
  btns.forEach(b => b.style.display = "none");

  const canvas = await html2canvas(resultEl, { scale: 2 });
  btns.forEach(b => b.style.display = "");

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 28; // 14mm margin on each side
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // Header function
  const addHeader = () => {
    pdf.setFillColor(26, 73, 113);
    pdf.rect(0, 0, pageWidth, 35, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(APP_TITLE, 14, 20);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.text(APP_SUBTITLE, 14, 28);

    // Optional crest
    let crestImg = null;
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = "PHS_Crest.png?t=" + Date.now();
      // Wait for load (sync in try/catch)
      const loaded = new Promise(res => { img.onload = img.onerror = res; });
      await loaded;
      if (img.width) pdf.addImage(img, "PNG", pageWidth - 38, 5, 28, 28);
    } catch (_) {}
  };

  // Add first page header
  addHeader();

  // Student info
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(11);
  pdf.text(`${finalData.name} (ID: ${finalData.id}) • ${finalData.teacherName} • ${finalData.submittedAt}`, 14, 40);

  // Grade box
  pdf.setFillColor(240, 248, 255);
  pdf.rect(14, 45, 60, 15, "F");
  pdf.setTextColor(26, 73, 113);
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text(`${finalData.points}/${finalData.totalPoints} (${finalData.pct}%)`, 18, 55);

  // Image placement
  let yPosition = 70;
  const availableHeight = pageHeight - yPosition - 20; // bottom margin

  if (imgHeight <= availableHeight) {
    // Fits on first page
    pdf.addImage(imgData, "PNG", 14, yPosition, imgWidth, imgHeight);
  } else {
    // Split across pages
    let heightLeft = imgHeight;
    let sourceY = 0;

    while (heightLeft > 0) {
      const sliceHeight = Math.min(availableHeight, heightLeft);
      const scaledSliceHeight = (sliceHeight * canvas.width) / imgWidth;

      // Create canvas slice
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = scaledSliceHeight;
      const ctx = sliceCanvas.getContext("2d");
      ctx.drawImage(canvas, 0, sourceY, canvas.width, scaledSliceHeight, 0, 0, canvas.width, scaledSliceHeight);

      pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 14, yPosition, imgWidth, sliceHeight);

      heightLeft -= sliceHeight;
      sourceY += scaledSliceHeight;

      if (heightLeft > 0) {
        pdf.addPage();
        addHeader();
        yPosition = 50; // new page start
      }
    }
  }

  // Footer
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text("Generated by Pukekohe High Tech Dept", 14, pageHeight - 10);

  const filename = `${finalData.name.replace(/\s+/g, "_")}_${finalData.assessment.id}_${finalData.pct}%.pdf`;
  const pdfBlob = pdf.output("blob");
  const file = new File([pdfBlob], filename, { type: "application/pdf" });
  await sharePDF(file);
}


/* --------------------------------------------------------------
   Toast helper
   -------------------------------------------------------------- */
function showToast(text, ok = true) {
  const toast = document.getElementById("toast") || createToastElement();
  toast.textContent = text;
  toast.classList.toggle("error", !ok);
  toast.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.style.display = "none"), 3200);
}

function createToastElement() {
  const t = document.createElement("div");
  t.id = "toast";
  t.className = "toast";
  t.role = "status";
  t.setAttribute("aria-live", "polite");
  t.style.cssText = `
    display: none; padding: 10px 12px; border-radius: 6px;
    background: #16a34a; color: #fff; position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%); z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: inherit; font-size: 0.95rem;
  `;
  document.body.appendChild(t);
  return t;
}

/* --------------------------------------------------------------
   Protection (no copy/paste)
   -------------------------------------------------------------- */
const PASTE_BLOCKED_MESSAGE = "Pasting blocked!";
async function clearClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.writeText) return;
  try {
    await navigator.clipboard.writeText("");
  } catch (_) {}
}
(async () => {
  await clearClipboard();
})();

function attachProtection() {
  document.querySelectorAll(".answer-field").forEach(f => {
    f.addEventListener("input", () => saveAnswer(f.id.slice(1)));
    f.addEventListener("paste", e => {
      e.preventDefault();
      showToast(PASTE_BLOCKED_MESSAGE, false);
      clearClipboard();
    });
    f.addEventListener("copy", e => e.preventDefault());
    f.addEventListener("cut", e => e.preventDefault());
  });
}

document.addEventListener("contextmenu", e => {
  if (!e.target.matches("input, textarea")) e.preventDefault();
});

/* --------------------------------------------------------------
   Export functions for HTML onclick
   -------------------------------------------------------------- */
window.loadAssessment = loadAssessment;
window.submitWork = submitWork;
window.back = back;
window.emailWork = emailWork;

/* --------------------------------------------------------------
   Start the app
   -------------------------------------------------------------- */
(async () => {
  try {
    await loadQuestions();
    initApp();
  } catch (err) {
    // Error already shown in loadQuestions
  }
})();
