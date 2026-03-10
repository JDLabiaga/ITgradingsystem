const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8'; // Use your full key
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = { id: '00000000-0000-0000-0000-000000000000' };
let currentSemesterId = null;
let subjects = [];
let students = [];
let dashboardChart = null;
let selectedSubjectId = null;

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    initChart();
    bindEvents();
});

function bindEvents() {
    $('sidebar-collapse-btn').onclick = () => $('sidebar').classList.toggle('collapsed');
    $('sidebar-open-btn').onclick = () => $('sidebar').classList.add('open');
    $('sidebar-overlay').onclick = () => $('sidebar').classList.remove('open');
    
    $('semester-select').onchange = (e) => {
        currentSemesterId = e.target.value;
        try { localStorage.setItem('selectedSemesterId', currentSemesterId || ''); } catch(e) { }
        loadDashboard();
    };

    $('add-semester-btn').onclick = () => openModal('semester-modal');
    $('save-semester-btn').onclick = addSemester;
    $('add-subject-btn').onclick = () => openModal('subject-modal');
    $('save-subject-btn').onclick = addSubject;
    const addSubjectTop = $('add-subject-top-btn'); if (addSubjectTop) addSubjectTop.onclick = () => openModal('subject-modal');
    
    const search = $('search-input'); if (search) search.oninput = () => renderTable();
    const fy = $('filter-year'); if (fy) fy.onchange = () => renderTable();
    const fs = $('filter-section'); if (fs) fs.onchange = () => renderTable();
    
    $('add-student-btn').onclick = openAddStudentModal;
    $('save-student-btn').onclick = saveStudent;

    // FIX: Modal Cancel Button
    const studentCancel = document.querySelector('#student-modal [data-close="student-modal"]') || document.querySelector('#student-modal .btn-outline');
    if (studentCancel) studentCancel.onclick = () => closeModal('student-modal');
}

async function loadSemesters() {
    const { data, error } = await db.from('semesters2').select('*').order('created_at', { ascending: false });
    if (error) { showToast('Failed to load semesters', 'danger'); return; }
    renderSemestersToSelect(data);
}

function renderSemestersToSelect(data) {
    const select = $('semester-select');
    if (!select) return;
    select.innerHTML = '<option value="">Select Semester</option>';
    data?.forEach(sem => {
        select.innerHTML += `<option value="${sem.id}">${sem.name}</option>`;
    });
    try {
        const saved = localStorage.getItem('selectedSemesterId');
        if (saved) {
            const opt = Array.from(select.options).find(o => o.value === saved);
            if (opt) {
                select.value = saved;
                currentSemesterId = saved;
                setTimeout(()=>loadDashboard(), 0);
            }
        }
    } catch (e) { }
}

async function loadDashboard() {
    if (!currentSemesterId) {
        $('empty-state').style.display = 'flex';
        $('table-section').style.display = 'none';
        return;
    }
    
    $('empty-state').style.display = 'none';
    const { data: subData } = await db.from('subjects2').select('*').eq('semester_id', currentSemesterId);
    subjects = subData || [];
    
    const subjSection = $('subjects-section'); if (subjSection) subjSection.style.display = 'block';
    renderSubjectList();
    
    if (subjects.length === 0) {
        $('no-subjects-state').style.display = 'flex';
        $('table-section').style.display = 'none';
        $('add-student-btn').style.display = 'none';
    } else {
        $('no-subjects-state').style.display = 'none';
        $('table-section').style.display = 'block';
        $('add-student-btn').style.display = 'flex';
        await loadStudents();
    }
}

async function loadStudents() {
    const { data: studentList = [] } = await db.from('students2').select('*').eq('semester_id', currentSemesterId);
    let gradeData = [];
    if (studentList.length > 0) {
        const ids = studentList.map(s => s.id);
        const res = await db.from('grades2').select('*').in('student_id', ids);
        gradeData = res.data || [];
    }

    students = (studentList || []).map(s => ({
        ...s,
        grades: (gradeData || []).filter(g => String(g.student_id) === String(s.id))
    }));
    renderTable();
}

// FIX: Save Student AND Initial Grades
async function saveStudent() {
    const name = $('new-student-name').value?.trim();
    const year = $('new-student-year').value?.trim();
    const section = $('new-student-section').value?.trim();

    if (!name) { showToast('Name is required', 'danger'); return; }

    try {
        const { data: student, error } = await db.from('students2').insert([{ 
            full_name: name, 
            semester_id: currentSemesterId,
            year_level: year,
            section: section
        }]).select().single();

        if (error) throw error;

        // Capture initial grades from modal inputs
        const gradeInputs = document.querySelectorAll('.subject-grade-input');
        const grades = [];
        gradeInputs.forEach((input, index) => {
            if (input.value !== '') {
                grades.push({
                    student_id: student.id,
                    subject_id: subjects[index].id,
                    score: parseFloat(input.value)
                });
            }
        });

        if (grades.length > 0) {
            await db.from('grades2').insert(grades);
        }

        closeModal('student-modal');
        showToast('Student added', 'success');
        loadStudents();
    } catch (err) {
        showToast('Failed to add student', 'danger');
    }
}

async function updateGrade(sid, subid, val) {
    const score = val === '' ? null : parseFloat(val);
    const { error } = await db.from('grades2').upsert({ 
        student_id: sid, 
        subject_id: subid, 
        score: score 
    }, { onConflict: 'student_id,subject_id' });

    if (!error) {
        showToast('Grade saved', 'success');
        loadStudents(); 
    }
}

function renderTable() {
    const head = $('table-header');
    const body = $('table-body');
    head.innerHTML = '<th>Name</th><th>Year/Sec</th>';
    subjects.forEach(sub => head.innerHTML += `<th>${sub.name}</th>`);
    head.innerHTML += '<th>Avg</th><th>Action</th>';

    body.innerHTML = '';
    const subjectSums = subjects.map(() => 0);
    const subjectCounts = subjects.map(() => 0);

    students.forEach(s => {
        let row = `<tr><td>${s.full_name}</td><td>${s.year_level || ''}-${s.section || ''}</td>`;
        let total = 0; let count = 0;
        subjects.forEach((sub, idx) => {
            const g = (s.grades || []).find(g => String(g.subject_id) === String(sub.id));
            const gradeVal = g && g.score != null ? parseFloat(g.score) : '';
            if (gradeVal !== '') {
                total += parseFloat(gradeVal); count++;
                subjectSums[idx] += parseFloat(gradeVal);
                subjectCounts[idx] += 1;
            }
            row += `<td><input type="number" step="0.1" class="glass-input-table" value="${gradeVal}" onchange="updateGrade('${s.id}', '${sub.id}', this.value)"></td>`;
        });
        const avg = count > 0 ? (total / count) : 0;
        row += `<td style="font-weight:bold; color:${avg >= 75 ? 'green':'red'}">${avg.toFixed(1)}</td>`;
        row += `<td><button class="btn btn-sm btn-outline" onclick="deleteStudent('${s.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
        body.innerHTML += row;
    });

    $('stat-total-students').textContent = students.length;
    const labels = subjects.map(s => s.name);
    const averages = subjects.map((s, i) => subjectCounts[i] ? (subjectSums[i] / subjectCounts[i]) : 0);
    updateChart(labels, averages);
}

// ORIGINAL MODAL AND LIST LOGIC RESTORED
function openAddStudentModal() {
    const container = $('grade-inputs');
    if (container) {
        container.innerHTML = subjects.map(sub => `
            <div class="input-group">
                <label style="font-size:0.8rem; display:block; margin-bottom:5px;">${sub.name}</label>
                <input type="number" placeholder="Grade" class="subject-grade-input">
            </div>
        `).join('');
    }
    openModal('student-modal');
}

function renderSubjectList() {
    const wrapper = $('subject-list');
    if (!wrapper) return;
    wrapper.innerHTML = subjects.length ? '' : '<div class="subject-empty">No subjects yet.</div>';
    subjects.forEach(s => {
        wrapper.innerHTML += `<div class="subject-item"><i class="fa-solid fa-book"></i> ${s.name}</div>`;
    });
}

async function addSemester() {
    const name = $('semester-name').value?.trim();
    if (!name) return;
    await db.from('semesters2').insert([{ name }]);
    closeModal('semester-modal');
    loadSemesters();
}

async function addSubject() {
    const name = $('new-subject-name').value;
    await db.from('subjects2').insert([{ name, semester_id: currentSemesterId }]);
    closeModal('subject-modal');
    loadDashboard();
}

async function deleteStudent(id) {
    if(confirm("Delete student?")) {
        await db.from('students2').delete().eq('id', id);
        loadStudents();
    }
}

function openModal(id) { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); }
function initChart() {
    const ctx = $('dashboard-chart').getContext('2d');
    dashboardChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Avg', data: [], backgroundColor: '#800000' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}
function updateChart(labels, data) {
    if (dashboardChart) {
        dashboardChart.data.labels = labels;
        dashboardChart.data.datasets[0].data = data;
        dashboardChart.update();
    }
}
function showToast(msg, type) {
    const container = $('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.borderLeft = `5px solid ${type === 'danger' ? '#e74c3c' : '#27ae60'}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}