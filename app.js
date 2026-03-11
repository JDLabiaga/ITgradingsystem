const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TBL = { SEM: 'semesters3', SUB: 'subjects3', STU: 'students3', GRD: 'grades3' };
const $ = (id) => document.getElementById(id);

let currentSemesterId = null, subjects = [], students = [];

document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    $('mobile-menu-btn').onclick = () => $('sidebar').classList.add('open');
    $('close-sidebar').onclick = () => $('sidebar').classList.remove('open');
    $('search-input').oninput = (e) => renderTable(e.target.value);
    
    $('semester-select').onchange = (e) => {
        currentSemesterId = e.target.value;
        loadDashboard();
    };

    $('add-semester-btn').onclick = () => $('semester-modal').classList.add('active');
    $('add-subject-btn').onclick = () => $('subject-modal').classList.add('active');
    $('add-student-btn').onclick = () => {
        $('grade-inputs').innerHTML = subjects.map(s => `<div><label>${s.name}</label><input type="number" class="grade-input tech-input" data-sub-id="${s.id}"></div>`).join('');
        $('student-modal').classList.add('active');
    };

    $('save-semester-btn').onclick = async () => {
        const name = $('semester-name').value;
        if(name) { await db.from(TBL.SEM).insert([{name}]); location.reload(); }
    };

    $('save-student-btn').onclick = async () => {
        const name = $('new-student-name').value;
        const { data: student } = await db.from(TBL.STU).insert([{ full_name: name, semester_id: currentSemesterId, section: $('new-student-section').value }]).select().single();
        if(student) {
            const grades = Array.from(document.querySelectorAll('.grade-input')).map(i => ({ student_id: student.id, subject_id: i.dataset.subId, score: parseFloat(i.value) }));
            await db.from(TBL.GRD).insert(grades);
            closeModal('student-modal'); loadStudents();
        }
    };
});

async function loadSemesters() {
    const { data } = await db.from(TBL.SEM).select('*');
    $('semester-select').innerHTML = '<option>Select Batch</option>' + data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function loadDashboard() {
    $('empty-state').style.display = 'none'; $('table-section').style.display = 'block'; $('subjects-section').style.display = 'block'; $('add-student-btn').style.display = 'block';
    const { data } = await db.from(TBL.SUB).select('*').eq('semester_id', currentSemesterId);
    subjects = data || [];
    loadStudents();
}

async function loadStudents() {
    const { data: stu } = await db.from(TBL.STU).select('*').eq('semester_id', currentSemesterId);
    const { data: grd } = await db.from(TBL.GRD).select('*');
    students = (stu || []).map(s => ({ ...s, grades: (grd || []).filter(g => g.student_id === s.id) }));
    renderTable();
}

function renderTable(filter = '') {
    $('table-header').innerHTML = '<th>Name</th>' + subjects.map(s => `<th>${s.name}</th>`).join('') + '<th>GWA</th>';
    const filtered = students.filter(s => s.full_name.toLowerCase().includes(filter.toLowerCase()));
    $('table-body').innerHTML = filtered.map(s => {
        let sum = 0, count = 0;
        const cells = subjects.map(sub => {
            const g = s.grades.find(g => g.subject_id === sub.id);
            if(g) { sum += g.score; count++; }
            return `<td>${g ? g.score : '-'}</td>`;
        }).join('');
        return `<tr><td>${s.full_name}</td>${cells}<td>${count ? (sum/count).toFixed(2) : '0.00'}</td></tr>`;
    }).join('');
}
function closeModal(id) { $(id).classList.remove('active'); }