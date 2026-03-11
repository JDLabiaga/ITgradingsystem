const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TBL = { SEM: 'semesters3', SUB: 'subjects3', STU: 'students3', GRD: 'grades3' };
const $ = (id) => document.getElementById(id);

let currentSemesterId = null;
let subjects = [];
let students = [];
let dashboardChart = null;
let studentToDelete = null;

document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    initChart();
    bindEvents();
});

function bindEvents() {
    $('add-semester-btn').onclick = () => openModal('semester-modal');
    $('add-subject-btn').onclick = () => openModal('subject-modal');
    $('add-student-btn').onclick = openAddStudentModal;
    
    $('save-semester-btn').onclick = addSemester;
    $('save-subject-btn').onclick = addSubject;
    $('save-student-btn').onclick = saveStudent;
    $('confirm-delete-btn').onclick = executeDelete;

    $('semester-select').onchange = (e) => {
        currentSemesterId = e.target.value;
        localStorage.setItem('selectedBatchId', currentSemesterId);
        loadDashboard();
    };

    $('search-input').oninput = renderTable;
    $('filter-year').onchange = renderTable;
    $('filter-section').onchange = renderTable;

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.dataset.close);
    });
}

async function loadSemesters() {
    const { data } = await db.from(TBL.SEM).select('*').order('created_at', { ascending: false });
    const select = $('semester-select');
    select.innerHTML = '<option value="">Select Batch</option>';
    data?.forEach(sem => select.innerHTML += `<option value="${sem.id}">${sem.name}</option>`);

    const saved = localStorage.getItem('selectedBatchId');
    if (saved) {
        select.value = saved;
        currentSemesterId = saved;
        loadDashboard();
    }
}

async function loadDashboard() {
    if (!currentSemesterId) {
        $('empty-state').style.display = 'block';
        $('table-section').style.display = 'none';
        $('subjects-section').style.display = 'none';
        $('add-student-btn').style.display = 'none';
        return;
    }
    
    $('empty-state').style.display = 'none';
    $('table-section').style.display = 'block';
    $('subjects-section').style.display = 'block';
    $('add-student-btn').style.display = 'inline-flex';

    const { data: subData } = await db.from(TBL.SUB).select('*').eq('semester_id', currentSemesterId);
    subjects = subData || [];
    renderSubjectList();
    await loadStudents();
}

async function loadStudents() {
    const { data: studentList } = await db.from(TBL.STU).select('*').eq('semester_id', currentSemesterId);
    if (!studentList?.length) { students = []; renderTable(); return; }

    const { data: gradeData } = await db.from(TBL.GRD).select('*').in('student_id', studentList.map(s => s.id));
    students = studentList.map(s => ({
        ...s,
        grades: (gradeData || []).filter(g => g.student_id === s.id)
    }));
    updateFilterOptions();
    renderTable();
}

function renderTable() {
    const searchTerm = $('search-input').value.toLowerCase();
    const year = $('filter-year').value;
    const sec = $('filter-section').value;

    const filtered = students.filter(s => 
        s.full_name.toLowerCase().includes(searchTerm) &&
        (!year || s.year_level === year) &&
        (!sec || s.section === sec)
    );

    $('table-header').innerHTML = '<th>User Record</th>' + 
        subjects.map(sub => `<th>${sub.name}</th>`).join('') + '<th>GWA</th><th>Action</th>';

    $('table-body').innerHTML = filtered.map(s => {
        let sum = 0, count = 0;
        const cells = subjects.map(sub => {
            const g = s.grades.find(g => g.subject_id === sub.id);
            const val = g?.score || '-';
            if (val !== '-') { sum += parseFloat(val); count++; }
            return `<td>${val}</td>`;
        }).join('');

        const gwa = count > 0 ? (sum / count).toFixed(2) : '0.00';
        return `<tr>
            <td><strong>${s.full_name}</strong><br><small>${s.year_level}-${s.section}</small></td>
            ${cells}
            <td><span class="badge ${gwa <= 3.0 && gwa > 0 ? 'pass' : 'fail'}">${gwa}</span></td>
            <td><button class="btn-delete-outline" onclick="studentToDelete='${s.id}';openModal('confirm-modal')"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`;
    }).join('');
    updateStats(filtered);
}

async function saveStudent() {
    const name = $('new-student-name').value;
    if(!name) return;

    const { data: student } = await db.from(TBL.STU).insert([{ 
        full_name: name, semester_id: currentSemesterId,
        year_level: $('new-student-year').value, section: $('new-student-section').value
    }]).select().single();

    if (student) {
        const grades = Array.from(document.querySelectorAll('.subject-grade-input')).map(i => ({
            student_id: student.id, subject_id: i.dataset.subjectId,
            score: i.value ? parseFloat(i.value) : null
        })).filter(g => g.score !== null);

        if (grades.length) await db.from(TBL.GRD).insert(grades);
        closeModal('student-modal');
        loadStudents();
    }
}

async function addSemester() {
    const name = $('semester-name').value;
    if (name) {
        await db.from(TBL.SEM).insert([{ name }]);
        $('semester-name').value = '';
        closeModal('semester-modal');
        loadSemesters();
    }
}

async function addSubject() {
    const name = $('new-subject-name').value;
    if (name) {
        await db.from(TBL.SUB).insert([{ name, semester_id: currentSemesterId }]);
        $('new-subject-name').value = '';
        closeModal('subject-modal');
        loadDashboard();
    }
}

async function executeDelete() {
    await db.from(TBL.STU).delete().eq('id', studentToDelete);
    closeModal('confirm-modal');
    loadStudents();
}

function openAddStudentModal() {
    $('grade-inputs').innerHTML = subjects.map(sub => `
        <div class="input-group-tech">
            <label>${sub.name}</label>
            <input type="number" step="0.1" class="subject-grade-input tech-input" data-subject-id="${sub.id}">
        </div>
    `).join('');
    openModal('student-modal');
}

function updateStats(data) {
    $('stat-total-students').textContent = data.length;
    const gwas = data.map(s => {
        const sc = s.grades.map(g => g.score).filter(v => v);
        return sc.length ? sc.reduce((a,b)=>a+b,0)/sc.length : null;
    }).filter(v => v);
    const avg = gwas.length ? (gwas.reduce((a,b)=>a+b,0)/gwas.length).toFixed(2) : '0.00';
    $('stat-average-class').textContent = avg;
    $('stat-pass-rate').textContent = gwas.length ? Math.round((gwas.filter(v=>v<=3.0).length/gwas.length)*100)+'%' : '0%';
}

function initChart() {
    dashboardChart = new Chart($('dashboard-chart'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Avg', data: [], borderColor: '#00f2ff', tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { reverse: true, min: 1, max: 5 } } }
    });
}

function renderSubjectList() {
    $('subject-list').innerHTML = subjects.map(s => `<div class="badge pass">${s.name}</div>`).join(' ');
}

function openModal(id) { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); }