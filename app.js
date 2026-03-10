const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentSemesterId = null;
let subjects = [];
let students = [];
let dashboardChart = null;

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    initChart();
    bindEvents();
});

function bindEvents() {
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
    
    // Search & filters
    const search = $('search-input'); if (search) search.oninput = () => renderTable();
    
    $('add-student-btn').onclick = openAddStudentModal;
    $('save-student-btn').onclick = saveStudent;

    // FIX: Link the Cancel button in the Student Modal
    const cancelBtn = document.querySelector('#student-modal .btn-outline');
    if (cancelBtn) cancelBtn.onclick = () => closeModal('student-modal');
}

async function loadSemesters() {
    const { data, error } = await db.from('semesters2').select('*').order('created_at', { ascending: false });
    if (error) return showToast('Error loading semesters', 'danger');
    renderSemestersToSelect(data);
}

function renderSemestersToSelect(data) {
    const select = $('semester-select');
    if (!select) return;
    select.innerHTML = '<option value="">Select Semester</option>';
    data?.forEach(sem => {
        select.innerHTML += `<option value="${sem.id}">${sem.name}</option>`;
    });
    const saved = localStorage.getItem('selectedSemesterId');
    if (saved) {
        select.value = saved;
        currentSemesterId = saved;
        setTimeout(()=>loadDashboard(), 0);
    }
}

async function loadDashboard() {
    if (!currentSemesterId) return;
    const { data: subData } = await db.from('subjects2').select('*').eq('semester_id', currentSemesterId);
    subjects = subData || [];
    renderSubjectList();
    if (subjects.length > 0) await loadStudents();
}

async function loadStudents() {
    const { data: studentList = [] } = await db.from('students2').select('*').eq('semester_id', currentSemesterId);
    let gradeData = [];
    if (studentList.length > 0) {
        const ids = studentList.map(s => s.id);
        const res = await db.from('grades2').select('*').in('student_id', ids);
        gradeData = res.data || [];
    }
    students = studentList.map(s => ({
        ...s,
        grades: gradeData.filter(g => g.student_id === s.id)
    }));
    renderTable();
}

// FIX: Improved Save Student to handle the Initial Grades from the modal
async function saveStudent() {
    const name = $('new-student-name').value.trim();
    const year = $('new-student-year').value;
    const sec = $('new-student-section').value;
    
    if (!name) return showToast('Name is required', 'danger');

    const { data: student, error } = await db.from('students2').insert([{ 
        full_name: name, 
        semester_id: currentSemesterId, 
        year_level: year, 
        section: sec 
    }]).select().single();

    if (!error && student) {
        // Collect grades from the dynamic inputs we created in openAddStudentModal
        const gradeInputs = document.querySelectorAll('.subject-grade-input');
        const gradesToInsert = [];

        gradeInputs.forEach((input, index) => {
            const val = input.value;
            if (val !== '') {
                gradesToInsert.push({
                    student_id: student.id,
                    subject_id: subjects[index].id,
                    score: parseFloat(val)
                });
            }
        });

        if (gradesToInsert.length > 0) {
            await db.from('grades2').insert(gradesToInsert);
        }

        closeModal('student-modal');
        showToast('Student & Grades added!', 'success');
        loadStudents();
    }
}

async function updateGrade(sid, subid, val) {
    const score = val === '' ? null : parseFloat(val);
    await db.from('grades2').upsert({ student_id: sid, subject_id: subid, score: score }, { onConflict: 'student_id,subject_id' });
    loadStudents(); // Refresh to update GWA and Chart
}

function renderTable() {
    const head = $('table-header');
    const body = $('table-body');
    head.innerHTML = '<th>Name</th><th>Year/Sec</th>';
    subjects.forEach(sub => head.innerHTML += `<th>${sub.name}</th>`);
    head.innerHTML += '<th>GWA</th><th>Action</th>';

    body.innerHTML = '';
    const subjectSums = subjects.map(() => 0);
    const subjectCounts = subjects.map(() => 0);

    students.forEach(s => {
        let row = `<tr><td>${s.full_name}</td><td>${s.year_level || ''}-${s.section || ''}</td>`;
        let total = 0; let count = 0;
        
        subjects.forEach((sub, idx) => {
            const g = s.grades.find(g => g.subject_id === sub.id);
            const val = (g && g.score != null) ? g.score : '';
            if (val !== '') {
                total += parseFloat(val); count++;
                subjectSums[idx] += parseFloat(val); subjectCounts[idx]++;
            }
            row += `<td><input type="number" class="glass-input-table" value="${val}" onchange="updateGrade('${s.id}', '${sub.id}', this.value)"></td>`;
        });

        const avg = count > 0 ? (total / count) : 0;
        row += `<td style="font-weight:bold; color:${avg >= 75 ? 'green':'red'}">${avg.toFixed(1)}</td>`;
        row += `<td><button class="btn btn-sm btn-outline" onclick="deleteStudent('${s.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
        body.innerHTML += row;
    });

    $('stat-total-students').textContent = students.length;
    updateChart(subjects.map(s => s.name), subjects.map((s, i) => subjectCounts[i] ? (subjectSums[i]/subjectCounts[i]) : 0));
}

// REST OF YOUR ORIGINAL FUNCTIONS (Unchanged)
async function addSemester() {
    const name = $('semester-name').value.trim();
    if (!name) return;
    await db.from('semesters2').insert([{ name }]);
    closeModal('semester-modal');
    loadSemesters();
}

async function addSubject() {
    const name = $('new-subject-name').value.trim();
    if (!name) return;
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

function renderSubjectList() {
    const wrapper = $('subject-list');
    wrapper.innerHTML = subjects.map(s => `<div class="subject-item"><i class="fa-solid fa-book"></i> ${s.name}</div>`).join('');
}

function openAddStudentModal() {
    const container = $('grade-inputs');
    if (container) {
        // We add the class "subject-grade-input" so saveStudent can find them easily
        container.innerHTML = subjects.map(sub => `
            <div class="input-group">
                <label style="font-size:0.8rem; display:block; margin-bottom:4px;">${sub.name}</label>
                <input type="number" placeholder="Grade" class="subject-grade-input" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ddd;">
            </div>
        `).join('');
    }
    openModal('student-modal');
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
    if (!dashboardChart) return;
    dashboardChart.data.labels = labels;
    dashboardChart.data.datasets[0].data = data;
    dashboardChart.update();
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