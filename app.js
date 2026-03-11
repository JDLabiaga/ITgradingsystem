const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TBL = { SEM: 'semesters3', SUB: 'subjects3', STU: 'students3', GRD: 'grades3' };
const $ = (id) => document.getElementById(id);

let currentSemesterId = null, subjects = [], students = [], chart = null;

document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    initChart();
    
    // Sidebar Toggles
    $('mobile-menu-btn').onclick = () => $('sidebar').classList.add('open');
    $('close-sidebar').onclick = () => $('sidebar').classList.remove('open');
    $('sidebar-overlay').onclick = () => $('sidebar').classList.remove('open');

    $('semester-select').onchange = (e) => { 
        currentSemesterId = e.target.value; 
        loadDashboard(); 
        if(window.innerWidth < 1024) $('sidebar').classList.remove('open');
    };

    $('add-semester-btn').onclick = () => openModal('semester-modal');
    $('add-subject-btn').onclick = () => openModal('subject-modal');
    
    $('save-semester-btn').onclick = async () => {
        const name = $('semester-name').value;
        if(name) { await db.from(TBL.SEM).insert([{ name }]); location.reload(); }
    };

    $('save-subject-btn').onclick = async () => {
        const name = $('new-subject-name').value;
        if(name && currentSemesterId) {
            await db.from(TBL.SUB).insert([{ name, semester_id: currentSemesterId }]);
            closeModal('subject-modal'); loadDashboard();
        }
    };

    $('delete-semester-btn').onclick = async () => {
        if(currentSemesterId && confirm("Wipe this batch data?")) {
            await db.from(TBL.SEM).delete().eq('id', currentSemesterId);
            location.reload();
        }
    };

    $('add-student-btn').onclick = () => {
        $('grade-inputs').innerHTML = subjects.map(s => `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px">
                <label style="font-size:0.8rem">${s.name}</label>
                <input type="number" step="0.1" class="grade-input tech-input" style="width:70px; margin:0" data-sub-id="${s.id}">
            </div>
        `).join('');
        openModal('student-modal');
    };

    $('save-student-btn').onclick = async () => {
        const name = $('new-student-name').value;
        if(!name) return;
        const { data: stu } = await db.from(TBL.STU).insert([{ full_name: name, section: $('new-student-section').value, semester_id: currentSemesterId }]).select().single();
        if(stu) {
            const grades = Array.from(document.querySelectorAll('.grade-input')).map(i => ({ student_id: stu.id, subject_id: i.dataset.subId, score: i.value ? parseFloat(i.value) : null })).filter(g => g.score !== null);
            if(grades.length) await db.from(TBL.GRD).insert(grades);
            closeModal('student-modal'); loadStudents();
        }
    };

    $('search-input').oninput = (e) => renderTable(e.target.value);
});

async function loadSemesters() {
    const { data } = await db.from(TBL.SEM).select('*').order('created_at', { ascending: false });
    $('semester-select').innerHTML = '<option value="">Select Batch</option>' + data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function loadDashboard() {
    if(!currentSemesterId) return;
    $('empty-state').style.display = 'none'; $('table-section').style.display = 'block'; $('subjects-section').style.display = 'block'; $('add-student-btn').style.display = 'block';
    const { data } = await db.from(TBL.SUB).select('*').eq('semester_id', currentSemesterId);
    subjects = data || [];
    $('subject-list').innerHTML = subjects.map(s => `<div class="stat-tile" style="padding:10px; margin-bottom:5px; display:flex; justify-content:space-between"><span>${s.name}</span><button onclick="deleteSubject('${s.id}')" style="background:none;border:none;color:var(--danger)"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
    loadStudents();
}

async function deleteSubject(id) {
    if(confirm("Delete module?")) { await db.from(TBL.SUB).delete().eq('id', id); loadDashboard(); }
}

async function loadStudents() {
    const { data: stu } = await db.from(TBL.STU).select('*').eq('semester_id', currentSemesterId);
    const { data: grd } = await db.from(TBL.GRD).select('*');
    students = (stu || []).map(s => ({ ...s, grades: (grd || []).filter(g => g.student_id === s.id) }));
    renderTable();
}

async function deleteStudent(id) {
    if(confirm("Remove student?")) { await db.from(TBL.STU).delete().eq('id', id); loadStudents(); }
}

function renderTable(filter = '') {
    $('table-header').innerHTML = '<th>Student</th>' + subjects.map(s => `<th>${s.name}</th>`).join('') + '<th>GWA</th><th>Action</th>';
    const filtered = students.filter(s => s.full_name.toLowerCase().includes(filter.toLowerCase()));
    let totalGWA = 0;

    $('table-body').innerHTML = filtered.map(s => {
        let sum = 0, count = 0;
        const cells = subjects.map(sub => {
            const g = s.grades.find(g => g.subject_id === sub.id);
            if(g) { sum += g.score; count++; }
            return `<td>${g ? g.score : '-'}</td>`;
        }).join('');
        const gwa = count > 0 ? (sum/count).toFixed(2) : '0.00';
        totalGWA += parseFloat(gwa);
        return `<tr><td><b>${s.full_name}</b><br><small>${s.section}</small></td>${cells}<td><b>${gwa}</b></td><td><button class="btn-danger-icon" onclick="deleteStudent('${s.id}')"><i class="fa-solid fa-trash-can"></i></button></td></tr>`;
    }).join('');

    $('stat-total-students').textContent = filtered.length;
    $('stat-average-class').textContent = filtered.length ? (totalGWA / filtered.length).toFixed(2) : '0.00';
    updateChart(filtered);
}

function initChart() {
    chart = new Chart($('dashboard-chart'), { 
        type: 'line', 
        data: { labels: [], datasets: [{ 
            label: 'Student Performance', 
            data: [], 
            borderColor: '#00f2ff', 
            backgroundColor: 'rgba(0, 242, 255, 0.1)',
            fill: true,
            borderWidth: 3,
            tension: 0.4,
            pointBackgroundColor: '#00f2ff'
        }] }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { 
                y: { reverse: true, min: 1, max: 5, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
                x: { grid: { display: false }, ticks: { color: '#64748b' } }
            },
            plugins: { legend: { display: false } }
        } 
    });
}

function updateChart(data) {
    chart.data.labels = data.map(s => s.full_name.split(' ')[0]);
    chart.data.datasets[0].data = data.map(s => {
        let sum = 0, count = 0;
        s.grades.forEach(g => { sum += g.score; count++; });
        return count > 0 ? (sum/count) : null;
    });
    chart.update();
}

function openModal(id) { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); }