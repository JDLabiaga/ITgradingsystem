/* --- 1. CONFIGURATION & V3 TABLES --- */
const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Pointing to the new Table Schema
const TBL = {
    SEM: 'semesters3',
    SUB: 'subjects3',
    STU: 'students3',
    GRD: 'grades3'
};

let currentSemesterId = null;
let subjects = [];
let students = [];
let dashboardChart = null;
let studentToDelete = null;

const $ = (id) => document.getElementById(id);

/* --- 2. INITIALIZATION --- */
document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    initChart();
    bindEvents();
});

function bindEvents() {
    // IT Theme Sidebar Toggle
    const toggleSidebar = () => {
        const sidebar = $('sidebar');
        const overlay = $('sidebar-overlay');
        
        if (window.innerWidth > 1024) {
            sidebar.classList.toggle('collapsed');
        } else {
            sidebar.classList.toggle('open');
            overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
        }
    };

    $('mobile-menu-btn').onclick = toggleSidebar;
    $('close-sidebar').onclick = toggleSidebar;
    $('sidebar-overlay').onclick = toggleSidebar;

    // Semester/Batch Selection
    $('semester-select').onchange = (e) => {
        currentSemesterId = e.target.value;
        localStorage.setItem('selectedBatchId', currentSemesterId || '');
        loadDashboard();
        
        if(window.innerWidth <= 1024) {
            $('sidebar').classList.remove('open');
            $('sidebar-overlay').style.display = 'none';
        }
    };

    // Main UI Actions
    $('add-semester-btn').onclick = () => openModal('semester-modal');
    $('add-subject-btn').onclick = () => openModal('subject-modal');
    $('add-student-btn').onclick = openAddStudentModal;
    $('save-semester-btn').onclick = addSemester;
    $('save-subject-btn').onclick = addSubject;
    $('save-student-btn').onclick = saveStudent;
    $('confirm-delete-btn').onclick = executeDelete;

    // Terminal Search & Filters
    $('search-input').oninput = renderTable;
    $('filter-year').onchange = renderTable;
    $('filter-section').onchange = renderTable;

    document.addEventListener('click', (e) => {
        if (e.target.dataset.close) closeModal(e.target.dataset.close);
        if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
    });
}

/* --- 3. DATA FETCHING (V3) --- */
async function loadSemesters() {
    const { data } = await db.from(TBL.SEM).select('*').order('created_at', { ascending: false });
    const select = $('semester-select');
    select.innerHTML = '<option value="">Select Batch</option>';
    data?.forEach(sem => select.innerHTML += `<option value="${sem.id}">${sem.name}</option>`);

    const saved = localStorage.getItem('selectedBatchId');
    if (saved && data?.find(s => s.id === saved)) {
        select.value = saved;
        currentSemesterId = saved;
        loadDashboard();
    }
}

async function loadDashboard() {
    if (!currentSemesterId) {
        $('empty-state').style.display = 'flex';
        $('table-section').style.display = 'none';
        $('subjects-section').style.display = 'none';
        $('add-student-btn').style.display = 'none';
        return;
    }
    
    $('empty-state').style.display = 'none';
    $('subjects-section').style.display = 'block';

    const { data: subData } = await db.from(TBL.SUB).select('*').eq('semester_id', currentSemesterId);
    subjects = subData || [];
    renderSubjectList();
    
    if (subjects.length > 0) {
        $('table-section').style.display = 'block';
        $('add-student-btn').style.display = 'inline-flex';
        await loadStudents();
    } else {
        $('table-section').style.display = 'none';
        $('add-student-btn').style.display = 'none';
    }
}

async function loadStudents() {
    const { data: studentList } = await db.from(TBL.STU).select('*').eq('semester_id', currentSemesterId);
    if (!studentList?.length) {
        students = [];
        renderTable();
        return;
    }

    const { data: gradeData } = await db.from(TBL.GRD).select('*').in('student_id', studentList.map(s => s.id));

    students = studentList.map(s => ({
        ...s,
        grades: (gradeData || []).filter(g => g.student_id === s.id)
    }));

    updateFilterOptions();
    renderTable();
}

/* --- 4. TABLE RENDERING --- */
function renderTable() {
    const searchTerm = $('search-input').value.toLowerCase();
    const year = $('filter-year').value;
    const sec = $('filter-section').value;

    const filtered = students.filter(s => 
        s.full_name.toLowerCase().includes(searchTerm) &&
        (!year || s.year_level === year) &&
        (!sec || s.section === sec)
    );

    // IT Table Header
    $('table-header').innerHTML = '<th>System User / Student</th>' + 
        subjects.map(sub => `<th class="text-center">${sub.name}</th>`).join('') + 
        '<th>GWA</th><th>Actions</th>';

    // IT Table Rows
    $('table-body').innerHTML = filtered.map(s => {
        let sum = 0, count = 0;
        const cells = subjects.map(sub => {
            const g = s.grades.find(g => g.subject_id === sub.id);
            const val = (g && g.score !== null) ? g.score : '-';
            if (val !== '-') { sum += parseFloat(val); count++; }
            return `<td class="text-center">${val}</td>`;
        }).join('');

        const gwa = count > 0 ? (sum / count).toFixed(2) : '0.00';
        const isPass = parseFloat(gwa) > 0 && parseFloat(gwa) <= 3.0;

        return `
            <tr>
                <td>
                    <div class="stu-name">${s.full_name}</div>
                    <div class="stu-meta">${s.year_level || ''} ${s.section || ''}</div>
                </td>
                ${cells}
                <td class="text-center"><span class="badge ${isPass ? 'pass' : 'fail'}">${gwa}</span></td>
                <td class="text-center">
                    <button class="btn-icon btn-delete" onclick="setStudentToDelete('${s.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');

    updateStats(filtered);
}

/* --- 5. STATS & CHART --- */
function updateStats(data) {
    const total = data.length;
    $('stat-total-students').textContent = total;
    
    let allSum = 0, allCount = 0, passingCount = 0;
    data.forEach(s => {
        let sSum = 0, sCount = 0;
        s.grades.forEach(g => { if(g.score) { allSum += g.score; allCount++; sSum += g.score; sCount++; } });
        if(sCount > 0 && (sSum/sCount) <= 3.0) passingCount++;
    });

    $('stat-average-class').textContent = allCount ? (allSum / allCount).toFixed(2) : '0.00';
    $('stat-pass-rate').textContent = total ? Math.round((passingCount / total) * 100) + '%' : '0%';
    
    const chartLabels = subjects.map(s => s.name);
    const chartValues = subjects.map(sub => {
        const subGrades = data.flatMap(s => s.grades).filter(g => g.subject_id === sub.id && g.score);
        return subGrades.length ? (subGrades.reduce((a,b) => a + b.score, 0) / subGrades.length).toFixed(2) : 5.0;
    });
    updateChart(chartLabels, chartValues);
}

function initChart() {
    const ctx = $('dashboard-chart').getContext('2d');
    dashboardChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Avg Grade', data: [], backgroundColor: '#00f2ff', borderRadius: 4 }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: { 
                y: { min: 1, max: 5, reverse: true, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#888' }, grid: { display: false } }
            } 
        }
    });
}

function updateChart(labels, data) {
    if (!dashboardChart) return;
    dashboardChart.data.labels = labels;
    dashboardChart.data.datasets[0].data = data;
    dashboardChart.update();
}

/* --- 6. ACTIONS (OPTIMIZED FOR SPEED) --- */
function openAddStudentModal() {
    const container = $('grade-inputs');
    container.innerHTML = subjects.map(sub => `
        <div class="input-group-tech">
            <label>${sub.name}</label>
            <input type="number" step="0.1" class="subject-grade-input tech-input" data-subject-id="${sub.id}" placeholder="0.0">
        </div>
    `).join('');
    openModal('student-modal');
    $('new-student-name').focus();
}

async function saveStudent() {
    const nameInput = $('new-student-name');
    const name = nameInput.value.trim();
    if (!name) return showToast('Name is required', 'danger');

    const { data: student } = await db.from(TBL.STU).insert([{ 
        full_name: name, semester_id: currentSemesterId,
        year_level: $('new-student-year').value, section: $('new-student-section').value
    }]).select().single();

    if (student) {
        const inputs = document.querySelectorAll('.subject-grade-input');
        const grades = Array.from(inputs).map(i => ({
            student_id: student.id, subject_id: i.dataset.subjectId,
            score: i.value === '' ? null : parseFloat(i.value)
        })).filter(g => g.score !== null);

        if (grades.length > 0) await db.from(TBL.GRD).insert(grades);
        
        showToast(`${name} Synced`, 'success');
        
        // Speed Optimization: Keep modal open, clear name, focus for next entry
        nameInput.value = '';
        inputs.forEach(i => i.value = '');
        nameInput.focus();
        
        loadStudents(); 
    }
}

window.setStudentToDelete = (id) => {
    studentToDelete = id;
    openModal('confirm-modal');
};

async function executeDelete() {
    if (!studentToDelete) return;
    const { error } = await db.from(TBL.STU).delete().eq('id', studentToDelete);
    if (!error) {
        showToast('Purged from Database', 'success');
        closeModal('confirm-modal');
        loadStudents();
    }
    studentToDelete = null;
}

window.deleteSubject = async (subjectId) => {
    if (!confirm("Remove this module?")) return;
    const { error } = await db.from(TBL.SUB).delete().eq('id', subjectId);
    if (!error) { loadDashboard(); showToast('Module Removed', 'success'); }
};

window.deleteSemester = async () => {
    if (!currentSemesterId || !confirm("Purge this entire batch?")) return;
    const { error } = await db.from(TBL.SEM).delete().eq('id', currentSemesterId);
    if (!error) { localStorage.removeItem('selectedBatchId'); location.reload(); }
};

async function addSemester() {
    const name = $('semester-name').value.trim();
    if (name) {
        await db.from(TBL.SEM).insert([{ name }]);
        $('semester-name').value = '';
        closeModal('semester-modal');
        loadSemesters();
    }
}

async function addSubject() {
    const name = $('new-subject-name').value.trim();
    if (name) {
        await db.from(TBL.SUB).insert([{ name, semester_id: currentSemesterId }]);
        $('new-subject-name').value = '';
        closeModal('subject-modal');
        loadDashboard();
    }
}

/* --- 7. UTILS --- */
function updateFilterOptions() {
    const years = [...new Set(students.map(s => s.year_level))].filter(Boolean);
    const sections = [...new Set(students.map(s => s.section))].filter(Boolean);
    $('filter-year').innerHTML = '<option value="">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    $('filter-section').innerHTML = '<option value="">Sections</option>' + sections.map(s => `<option value="${s}">${s}</option>`).join('');
}

function renderSubjectList() {
    $('subject-list').innerHTML = subjects.map(s => `
        <div class="module-pill">
            <span>${s.name}</span>
            <button onclick="deleteSubject('${s.id}')"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}

function openModal(id) { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); }

function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = `toast-tech ${type}`;
    t.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${msg}`;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}