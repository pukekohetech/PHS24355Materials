/* script.js – core logic + fetch questions.json */
const STORAGE_KEY = "TECH_DATA";
let data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { answers: {} };
let currentAssessment = null;
let finalData = null;

const XOR_KEY = 42;
const xor = s => btoa([...s].map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join(''));
const unxor = s => atob(s).split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');

// Global variables filled from JSON
let APP_TITLE, APP_SUBTITLE, TEACHERS, ASSESSMENTS;

/* --------------------------------------------------------------
   Load questions.json
   -------------------------------------------------------------- */
async function loadQuestions() {
  try {
    const res = await fetch('questions.json');
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
        rubric: q.rubric?.map(r => ({
          ...r,
          check: new RegExp(r.check, 'i')
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

  if (data.id) {
    document.getElementById("locked-msg").classList.remove("hidden");
    document.getElementById("locked-id").textContent = data.id;
    idEl.readOnly = true;
  }

  const teacherSel = document.getElementById("teacher");
  TEACHERS.forEach(t => {
    const o = document.createElement("option");
    o.value = t.email; o.textContent = t.name;
    teacherSel.appendChild(o);
  });

  const assSel = document.getElementById("assessmentSelector");
  ASSESSMENTS.forEach((a, i) => {
    const o = document.createElement("option");
    o.value = i; o.textContent = `${a.title} – ${a.subtitle}`;
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

function saveAnswer(qid) {
  const val = document.getElementById("a" + qid).value;
  if (!data.answers[currentAssessment.id]) data.answers[currentAssessment.id] = {};
  data.answers[currentAssessment.id][qid] = xor(val);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getAnswer(id) {
  const raw = data.answers[currentAssessment.id]?.[id] || "";
  return raw ? unxor(raw) : "";
}

function gradeIt() {
  let total = 0, results = [];
  currentAssessment.questions.forEach(q => {
    const ans = getAnswer(q.id);
    let earned = 0, hints = [];

    if (q.rubric) {
      q.rubric.forEach(r => {
        if (r.check.test(ans)) earned += r.points;
        else if (r.hint) hints.push(r.hint);
      });
    }

    total += earned;
    const isCorrect = earned === q.maxPoints;
    results.push({
      id: q.id.toUpperCase(),
      question: q.text,
      answer: ans || "(blank)",
      earned, max: q.maxPoints,
      markText: isCorrect ? "Correct" : earned > 0 ? "Incorrect (partial)" : "Incorrect",
      hint: hints.length ? hints.join(" • ") : (isCorrect ? "" : q.hint || "Check your answer")
    });
  });
  return { total, results };
}

/* --------------------------------------------------------------
   Submit & show results
   -------------------------------------------------------------- */
window.submitWork = function () {
  saveStudentInfo();
  const name = data.name, id = data.id;
  if (!name || !id || !data.teacher) return alert("Fill Name, ID and Teacher");
  if (!currentAssessment) return alert("Select an assessment");
  if (data.id && document.getElementById("id").value !== data.id) return alert("ID locked to: " + data.id);

  const { total, results } = gradeIt();
  const pct = Math.round((total / currentAssessment.totalPoints) * 100);

  finalData = {
    name, id,
    teacherName: document.getElementById("teacher").selectedOptions[0].textContent,
    teacherEmail: data.teacher,
    assessment: currentAssessment,
    points: total, totalPoints: currentAssessment.totalPoints, pct,
    submittedAt: new Date().toLocaleString(),
    results
  };

  document.getElementById("student").textContent = name;
  document.getElementById("teacher-name").textContent = finalData.teacherName;
  document.getElementById("grade").innerHTML = `${total}/${currentAssessment.totalPoints}<br><small>(${pct}%)</small>`;

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
};

window.back = () => {
  document.getElementById("result").classList.add("hidden");
  document.getElementById("form").classList.remove("hidden");
};

/* --------------------------------------------------------------
   Email via PDF + mailto
   -------------------------------------------------------------- */
window.emailWork = async function () {
  if (!finalData) return alert("Submit first!");

  const load = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  try {
    await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await load('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  } catch (e) { return alert("Failed to load PDF tools."); }

  const { jsPDF } = window.jspdf;
  const resultEl = document.getElementById('result');
  const btns = document.querySelectorAll('.btn-group');
  btns.forEach(b => b.style.display = 'none');

  const canvas = await html2canvas(resultEl, { scale: 2 });
  const imgData = canvas.toDataURL('image/png');
  btns.forEach(b => b.style.display = '');

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  let crestImg = null;
  try {
    const img = new Image(); img.crossOrigin = 'anonymous';
    await new Promise(res => { img.onload = res; img.onerror = res; img.src = 'PHS_Crest.png?t=' + Date.now(); });
    if (img.width) crestImg = img;
  } catch (_) {}

  const drawHeader = (y = 0) => {
    pdf.setFillColor(26, 73, 113); pdf.rect(0, y, pageW, 35, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(18); pdf.setFont('helvetica', 'bold');
    pdf.text(APP_TITLE, 14, y + 20);
    pdf.setFontSize(12); pdf.setFont('helvetica', 'normal');
    pdf.text(APP_SUBTITLE, 14, y + 28);
    if (crestImg) pdf.addImage(crestImg, 'PNG', pageW - 38, y + 5, 28, 28);
  };
  drawHeader();

  pdf.setTextColor(0, 0, 0); pdf.setFontSize(11);
  pdf.text(`${finalData.name} (ID: ${finalData.id}) • ${finalData.teacherName} • ${finalData.submittedAt}`, 14, 40);
  pdf.setFillColor(240, 248, 255); pdf.rect(14, 45, 60, 15, 'F');
  pdf.setTextColor(26, 73, 113); pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
  pdf.text(`${finalData.points}/${finalData.totalPoints} (${finalData.pct}%)`, 18, 55);

  const imgW = pageW - 28;
  const imgH = (canvas.height * imgW) / canvas.width;
  let posY = 70, heightLeft = imgH;
  pdf.addImage(imgData, 'PNG', 14, posY, imgW, imgH);
  heightLeft -= pageH - posY - 10;
  while (heightLeft > 0) {
    posY = heightLeft - imgH;
    pdf.addPage();
    drawHeader();
    pdf.addImage(imgData, 'PNG', 14, posY, imgW, imgH);
    heightLeft -= pageH - 40;
  }

  pdf.setFontSize(9); pdf.setTextColor(100, 100, 100);
  pdf.text("Generated by Pukekohe High Tech Dept", 14, pageH - 10);

  const filename = `${finalData.name.replace(/\s+/g, '_')}_${finalData.assessment.id}_${finalData.pct}%.pdf`;
  const pdfBlob = pdf.output('blob');
  const fileUrl = URL.createObjectURL(pdfBlob);

  const a = document.createElement('a');
  a.href = fileUrl; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => {
    document.body.removeChild(a); URL.revokeObjectURL(fileUrl);
    const subject = encodeURIComponent(`${APP_TITLE} – ${finalData.name} (${finalData.pct}%)`);
    const body = encodeURIComponent(`Hi ${finalData.teacherName},\n\nPlease find the assessment attached.\n\nScore: ${finalData.points}/${finalData.totalPoints} (${finalData.pct}%)\nSubmitted: ${finalData.submittedAt}\n\nRegards,\nPukekohe High Tech`);
    window.location.href = `mailto:${finalData.teacherEmail}?subject=${subject}&body=${body}`;
  }, 1000);
};

/* --------------------------------------------------------------
   Protection
   -------------------------------------------------------------- */
const PASTE_BLOCKED_MESSAGE = 'Pasting blocked!';
function showToast(msg) {
  const t = document.createElement('div'); t.textContent = msg; t.className = 'toast';
  document.body.appendChild(t);
  requestAnimationFrame(() => t.style.opacity = 1);
  setTimeout(() => t.style.opacity = 0, 1800);
  setTimeout(() => t.remove(), 2200);
}
async function clearClipboard() { try { await navigator.clipboard.writeText(''); } catch (_) {} }
(async () => { await clearClipboard(); })();

function attachProtection() {
  document.querySelectorAll('.answer-field').forEach(f => {
    f.addEventListener('input', () => saveAnswer(f.id.slice(1)));
    f.addEventListener('paste', e => { e.preventDefault(); showToast(PASTE_BLOCKED_MESSAGE); clearClipboard(); });
    f.addEventListener('copy', e => e.preventDefault());
    f.addEventListener('cut', e => e.preventDefault());
  });
}
document.addEventListener('contextmenu', e => { if (!e.target.matches('input, textarea')) e.preventDefault(); });

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
