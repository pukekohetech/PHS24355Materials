/* script.js – US 24355 app: core logic + JSON loading + PDF + share */

// Local storage key
const STORAGE_KEY = "TECH_DATA";
let data;

// Initialize data
try {
  data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { answers: {}, name: "", id: "", teacher: "", username: "" };
} catch (_) {
  data = { answers: {}, name: "", id: "", teacher: "", username: "" };
}

// Auto-detect Chromebook user (optional)
let detectedUsername = "";
if (window.chrome?.identity) {
  chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
    if (info?.email) {
      detectedUsername = info.email.split('@')[0];
      const el = document.getElementById("username");
      if (el && !el.value.trim()) {
        el.value = detectedUsername;
        data.username = detectedUsername;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    }
  });
}

// App state
let currentAssessment = null;
let finalData = null;

// XOR obfuscation
const XOR_KEY = 42;
const xor = s => btoa([...s].map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join(""));
const unxor = s => {
  try { return atob(s).split("").map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join(""); }
  catch { return ""; }
};

// Global config
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
    ASSESSMENTS = json.ASSESSMENTS.map(ass => ({
      ...ass,
      questions: ass.questions.map(q => ({
        ...q,
        rubric: q.rubric?.map(r => ({ ...r, check: new RegExp(r.check, "i") })) || []
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
   Initialize UI
   -------------------------------------------------------------- */
function initApp() {
  document.getElementById("loading")?.remove();
  document.getElementById("page-title").textContent = APP_TITLE;
  document.getElementById("header-title").textContent = APP_TITLE;
  document.getElementById("header-subtitle").textContent = APP_SUBTITLE;

  const nameEl = document.getElementById("name");
  const idEl = document.getElementById("id");
  const usernameEl = document.getElementById("username");

  nameEl.value = data.name || "";
  idEl.value = data.id || "";
  if (usernameEl) usernameEl.value = data.username || "";

  if (data.id) {
    document.getElementById("locked-msg").classList.remove("hidden");
    document.getElementById("locked-id").textContent = data.id;
    idEl.readOnly = true;
  }

  const teacherSel = document.getElementById("teacher");
  teacherSel.innerHTML = '<option value="">Select Teacher</option>';
  TEACHERS.forEach(t => {
    const o = document.createElement("option");
    o.value = t.email;
    o.textContent = t.name;
    if (t.email === data.teacher) o.selected = true;
    teacherSel.appendChild(o);
  });

  const assSel = document.getElementById("assessmentSelector");
  assSel.innerHTML = '<option value="">Select Assessment</option>';
  ASSESSMENTS.forEach((a, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `${a.title} – ${a.subtitle}`;
    assSel.appendChild(o);
  });
}

/* --------------------------------------------------------------
   Save student info
   -------------------------------------------------------------- */
function saveStudentInfo() {
  data.name = document.getElementById("name").value.trim();
  data.id = document.getElementById("id").value.trim();
  data.teacher = document.getElementById("teacher").value;
  data.username = document.getElementById("username")?.value.trim() || "";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* --------------------------------------------------------------
   Load assessment
   -------------------------------------------------------------- */
function loadAssessment() {
  const idx = document.getElementById("assessmentSelector").value;
  if (idx === "") return;
  saveStudentInfo();
  currentAssessment = ASSESSMENTS[idx];
  const container = document.getElementById("questions");
  container.innerHTML = `<div class="assessment-header"><h2>${currentAssessment.title}</h2><p>${currentAssessment.subtitle}</p></div>`;
  currentAssessment.questions.forEach(q => {
    const saved = data.answers[currentAssessment.id]?.[q.id] ? unxor(data.answers[currentAssessment.id][q.id]) : "";
    const field = q.type === "long"
      ? `<textarea rows="5" id="a${q.id}" class="answer-field">${saved}</textarea>`
      : `<input type="text" id="a${q.id}" value="${saved}" class="answer-field">`;
    const div = document.createElement("div");
    div.className = "q";
    div.innerHTML = `<strong>${q.id.toUpperCase()} (${q.maxPoints} pts)</strong><br>${q.text}<br>${field}`;
    container.appendChild(div);
  });
  attachProtection();
}

/* --------------------------------------------------------------
   Save answer
   -------------------------------------------------------------- */
function saveAnswer(qid) {
  const el = document.getElementById("a" + qid);
  if (!el) return;
  const val = el.value;
  if (!data.answers[currentAssessment.id]) data.answers[currentAssessment.id] = {};
  data.answers[currentAssessment.id][qid] = xor可能(val);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getAnswer(id) {
  const raw = data.answers[currentAssessment.id]?.[id] || "";
  return raw ? unxor(raw) : "";
}

/* --------------------------------------------------------------
   Grade
   -------------------------------------------------------------- */
function gradeIt() {
  let total = 0;
  const results = [];
  currentAssessment.questions.forEach(q => {
    const ans = getAnswer(q.id);
    let earned = 0;
    const hints = [];
    if (q.rubric) {
      q.rubric.forEach(r => {
        if (r.check.test(ans)) earned += r.points;
        else if (r.hint) hints.push(r.hint);
      });
    }
    earned = Math.min(earned, q.maxPoints);
    total += earned;
    const isCorrect = earned === q.maxPoints;
    results.push({
      id: q.id.toUpperCase(),
      question: q.text,
      answer: ans || "(blank)",
      earned,
      max: q.maxPoints,
      markText: isCorrect ? "Correct" : earned > 0 ? "Incorrect (partial)" : "Incorrect",
      hint: hints.length ? hints.join(" • ") : isCorrect ? "" : q.hint || "Check your answer"
    });
  });
  return { total, results };
}

/* --------------------------------------------------------------
   Submit
   -------------------------------------------------------------- */
function submitWork() {
  saveStudentInfo();
  const name = data.name;
  const id = data.id;
  const username = data.username || "";

  if (!name || !id || !data.teacher) return alert("Fill Name, ID, and Teacher");
  if (!currentAssessment) return alert("Select an assessment");
  if (data.id && document.getElementById("id").value !== data.id) return alert("ID locked to: " + data.id);

  const { total, results } = gradeIt();
  const totalPoints = currentAssessment.totalPoints || currentAssessment.questions.reduce((s, q) => s + q.maxPoints, 0);
  const pct = totalPoints ? Math.round((total / totalPoints) * 100) : 0;

  finalData = {
    name, id, username,
    teacherName: document.getElementById("teacher").selectedOptions[0].textContent,
    teacherEmail: data.teacher,
    assessment: currentAssessment,
    points: total,
    totalPoints,
    pct,
    submittedAt: new Date().toLocaleString(),
    results
  };

  document.getElementById("student").textContent = `${name}${username ? ` (${username}${detectedUsername === username ? ' (Device Auto)' : ''})` : ''}`;
  document.getElementById("teacher-name").textContent = finalData.teacherName;
  document.getElementById("grade").innerHTML = `${total}/${totalPoints}<br><small>(${pct}%)</small>`;

  const ansDiv = document.getElementById("answers");
  ansDiv.innerHTML = `<h3>${currentAssessment.title}<br><small>${currentAssessment.subtitle}</small></h3>`;
  results.forEach(r => {
    const d = document.createElement("div");
    d.className = `feedback ${r.earned === r.max ? "correct" : r.earned > 0 ? "partial" : "wrong"}`;
    d.innerHTML = `<strong>${r.id}: ${r.earned}/${r.max} — ${r.markText}</strong><br>Your answer: <em>${r.answer}</em><br>${r.earned < r.max ? "<strong>Tip:</strong> " + r.hint : "Perfect!"}`;
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
   Email body
   -------------------------------------------------------------- */
function buildEmailBody(fd) {
  const lines = [];
  lines.push(`Pukekohe High School – ${APP_TITLE}`);
  lines.push(APP_SUBTITLE);
  lines.push("");
  lines.push(`Assessment: ${fd.assessment.title} – ${fd.assessment.subtitle}`);
  lines.push(`Student: ${fd.name}${fd.username ? ` (${fd.username}${detectedUsername === fd.username ? ' (Device Auto)' : ''})` : ''} – ID: ${fd.id}`);
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
    if (r.earned < r.max && r.hint) lines.push(`Tip: ${r.hint}`);
    lines.push("-".repeat(60));
    lines.push("");
  });
  lines.push("Generated by Pukekohe High School Technology Dept");
  return lines.join("\n");
}

/* --------------------------------------------------------------
   Share PDF
   -------------------------------------------------------------- */
async function sharePDF(file) {
  if (!finalData) return;
  const subject = `${finalData.assessment.title} – ${finalData.name} (${finalData.id})`;
  const fullBody = buildEmailBody(finalData);
  const shareData = { files: [file], title: subject, text: fullBody };

  if (navigator.canShare && navigator.canShare(shareData)) {
    try { await navigator.share(shareData); showToast("Shared"); return; }
    catch (err) { if (!String(err).includes("AbortError")) showToast("Share failed", false); }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  const shortBody = [
    `Assessment: ${finalData.assessment.title}`,
    `Student: ${finalData.name}${finalData.username ? ` (${finalData.username})` : ''} – ID: ${finalData.id}`,
    `Teacher: ${finalData.teacherName}`,
    `Score: ${finalData.points}/${finalData.totalPoints} (${finalData.pct}%)`,
    "", "Full report attached as PDF."
  ].join("\n");

  window.location.href = `mailto:${encodeURIComponent(finalData.teacherEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shortBody)}`;
  showToast("Downloaded + email opened");
}

/* --------------------------------------------------------------
   Generate PDF – A4 Portrait, Teacher Email, Username
   -------------------------------------------------------------- */
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

  const canvas = await html2canvas(resultEl, { scale: 2, useCORS: true });
  btns.forEach(b => b.style.display = "");

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4"); // A4 Portrait
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const imgWidth = pageWidth - 2 * margin;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const addHeader = () => {
    pdf.setFillColor(26, 73, 113);
    pdf.rect(0, 0, pageWidth, 35, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(APP_TITLE, margin, 20);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.text(APP_SUBTITLE, margin, 28);
  };

  addHeader();

  // Student + Teacher Info
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
  const loginLabel = finalData.username ? ` (${finalData.username}${detectedUsername === finalData.username ? ' (Device Auto)' : ''})` : '';
  pdf.text(`${finalData.name}${loginLabel} • ID: ${finalData.id}`, margin, 38);
  pdf.text(`Teacher: ${finalData.teacherName} <${finalData.teacherEmail}> • ${finalData.submittedAt}`, margin, 44);

  // Grade
  pdf.setFillColor(240, 248, 255);
  pdf.rect(margin, 48, 60, 15, "F");
  pdf.setTextColor(26, 73, 113);
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text(`${finalData.points}/${finalData.totalPoints} (${finalData.pct}%)`, margin + 4, 58);

  let yPosition = 70;
  const availableHeight = pageHeight - yPosition - 20;

  if (imgHeight <= availableHeight) {
    pdf.addImage(imgData, "PNG", margin, yPosition, imgWidth, imgHeight);
  } else {
    let heightLeft = imgHeight;
    let sourceY = 0;
    while (heightLeft > 0) {
      const sliceHeight = Math.min(availableHeight, heightLeft);
      const scaledSliceHeight = (sliceHeight * canvas.width) / imgWidth;
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = scaledSliceHeight;
      const ctx = sliceCanvas.getContext("2d");
      ctx.drawImage(canvas, 0, sourceY, canvas.width, scaledSliceHeight, 0, 0, canvas.width, scaledSliceHeight);
      pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, yPosition, imgWidth, sliceHeight);
      heightLeft -= sliceHeight;
      sourceY += scaledSliceHeight;
      if (heightLeft > 0) { pdf.addPage(); addHeader(); yPosition = 50; }
    }
  }

  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text("Generated by Pukekohe High Tech Dept", margin, pageHeight - 10);

  const filename = `${finalData.name.replace(/\s+/g, "_")}_${finalData.assessment.id}_${finalData.pct}%.pdf`;
  const pdfBlob = pdf.output("blob");
  const file = new File([pdfBlob], filename, { type: "application/pdf" });
  await sharePDF(file);
}

/* --------------------------------------------------------------
   Toast
   -------------------------------------------------------------- */
function showToast(text, ok = true) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.style.cssText = `display:none; padding:10px 16px; border-radius:6px; background:#16a34a; color:#fff; position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:1000; box-shadow:0 4px 12px rgba(0,0,0,.15); font-family:inherit; font-size:.95rem; min-width:200px; text-align:center;`;
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.toggle("error", !ok);
  toast.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.style.display = "none", 3200);
}

/* --------------------------------------------------------------
   Protection
   -------------------------------------------------------------- */
const PASTE_BLOCKED_MESSAGE = "Pasting blocked!";
async function clearClipboard() {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(""); } catch (_) {}
  }
}
clearClipboard();

function attachProtection() {
  document.querySelectorAll(".answer-field").forEach(f => {
    f.addEventListener("input", () => saveAnswer(f.id.slice(1)));
    f.addEventListener("paste", e => { e.preventDefault(); showToast(PASTE_BLOCKED_MESSAGE, false); clearClipboard(); });
    f.addEventListener("copy", e => e.preventDefault());
    f.addEventListener("cut", e => e.preventDefault());
  });
}
document.addEventListener("contextmenu", e => { if (!e.target.matches("input, textarea")) e.preventDefault(); });

/* --------------------------------------------------------------
   Export
   -------------------------------------------------------------- */
window.loadAssessment = loadAssessment;
window.submitWork = submitWork;
window.back = back;
window.emailWork = emailWork;

/* --------------------------------------------------------------
   Start
   -------------------------------------------------------------- */
(async () => {
  try {
    await loadQuestions();
    initApp();
  } catch (err) {}
})();
