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
    $('sidebar-overlay').onclick = () => $('sidebar').classList.remove('open');
    $('search-input').oninput = (e) => renderTable(e.target.value);
    
    $('semester-select').onchange = (e) => {
        currentSemesterId = e.target.value;
        localStorage.setItem('selectedBatchId', currentSemesterId);
        loadDashboard();
    };

    $('add-semester-btn').onclick = () => $('semester-modal').classList.add('active');
    $('add-subject-btn').onclick = () => $('subject-modal').classList.add('active');
    $('add-student-btn').onclick = () => {
        $('grade-inputs').innerHTML = subjects.map(s => `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><label>${s.name}</label><input type="number" step="0.1" class="grade-input tech-input" style="width:80px; margin:0" data-sub-id="${s.id}"></div>`).join('');
        $('student-modal').classList.add('active');
    };

    $('save-semester-btn').onclick = async () => {
        const name = $('semester-name').value;
        if(name) { await db.from(TBL.SEM).insert([{name}]); location.reload(); }
    };

    $('save-subject-btn').onclick = async () => {
        const name = $('new-subject-name').value;
        if(name) { await db.from(TBL.SUB).insert([{name, semester_id: currentSemesterId}]); closeModal('subject-modal'); loadDashboard(); }
    };

    $('save-student-btn').onclick = async () => {
        const name = $('new-student-name').value;
        if(!name) return;
        const { data: student } = await db.from(TBL.STU).insert([{ full_name: name, semester_id: currentSemesterId, year_level: $('new-student-year').value, section: $('new-student-section').value }]).select().single();
        if(student) {
            const grades = Array.from(document.querySelectorAll('.grade-input')).map(i => ({ student_id: student.id, subject_id: i.dataset.subId, score: i.value ? parseFloat(i.value) : null })).filter(g => g.score !== null);
            if(grades.length) await db.from(TBL.GRD).insert(grades);
            closeModal('student-modal'); loadStudents();
        }
    };
});

async function loadSemesters() {
    const { data } = await db.from(TBL.SEM).select('*').order('created_at', {ascending: false});
    $('semester-select').innerHTML = '<option value="">Select Batch</option>' + data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const saved = localStorage.getItem('selectedBatchId');
    if(saved) { $('semester-select').value = saved; currentSemesterId = saved; loadDashboard(); }
}

async function loadDashboard() {
    if(!currentSemesterId) return;
    $('empty-state').style.display = 'none'; $('table-section').style.display = 'block'; $('subjects-section').style.display = 'block'; $('add-student-btn').style.display = 'inline-flex';
    const { data } = await db.from(TBL.SUB).select('*').eq('semester_id', currentSemesterId);
    subjects = data || [];
    $('subject-list').innerHTML = subjects.map(s => `<div class="stat-tile" style="padding:10px; margin-bottom:5px; font-size:0.8rem">${s.name}</div>`).join('');
    loadStudents();
}

async function loadStudents() {
    const { data: stu } = await db.from(TBL.STU).select('*').eq('semester_id', currentSemesterId);
    if(!stu?.length) { students = []; renderTable(); return; }
    const { data: grd } = await db.from(TBL.GRD).select('*').in('student_id', stu.map(s => s.id));
    students = stu.map(s => ({ ...s, grades: (grd || []).filter(g => g.student_id === s.id) }));
    renderTable();
}

function renderTable(filter = '') {
    $('table-header').innerHTML = '<th>Student</th>' + subjects.map(s => `<th>${s.name}</th>`).join('') + '<th>GWA</th>';
    const filtered = students.filter(s => s.full_name.toLowerCase().includes(filter.toLowerCase()) || s.section.toLowerCase().includes(filter.toLowerCase()));
    
    let totalGWA = 0, passCount = 0;
    $('table-body').innerHTML = filtered.map(s => {
        let sum = 0, count = 0;
        const cells = subjects.map(sub => {
            const g = s.grades.find(g => g.subject_id === sub.id);
            if(g) { sum += g.score; count++; }
            return `<td>${g ? g.score : '-'}</td>`;
        }).join('');
        const gwa = count > 0 ? (sum/count).toFixed(2) : '0.00';
        totalGWA += parseFloat(gwa); if(parseFloat(gwa) <= 3.0 && count > 0) passCount++;
        return `<tr><td><strong>${s.full_name}</strong><br><small>${s.section}</small></td>${cells}<td><span style="color:${gwa <= 3.0 ? '#00f2ff':'#ff4757'}">${gwa}</span></td></tr>`;
    }).join('');

    $('stat-total-students').textContent = filtered.length;
    $('stat-average-class').textContent = filtered.length ? (totalGWA / filtered.length).toFixed(2) : '0.00';
    $('stat-pass-rate').textContent = filtered.length ? Math.round((passCount / filtered.length) * 100) + '%' : '0%';
}

function closeModal(id) { $(id).classList.remove('active'); }