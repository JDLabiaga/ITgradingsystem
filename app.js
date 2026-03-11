const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TBL = { SEM: 'semesters3', SUB: 'subjects3', STU: 'students3', GRD: 'grades3' };
const $ = (id) => document.getElementById(id);

let currentSemesterId = null, subjects = [], students = [], dashboardChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    loadSemesters();
    bindEvents();
});

function bindEvents() {
    // UI Toggles
    $('mobile-menu-btn').onclick = () => $('sidebar').classList.add('open');
    $('close-sidebar').onclick = () => $('sidebar').classList.remove('open');
    
    // Select Semester
    $('semester-select').onchange = (e) => {
        currentSemesterId = e.target.value;
        localStorage.setItem('selectedBatchId', currentSemesterId);
        loadDashboard();
    };

    // Modal Triggers
    $('add-semester-btn').onclick = () => openModal('semester-modal');
    $('add-subject-btn').onclick = () => openModal('subject-modal');
    $('add-student-btn').onclick = () => {
        $('grade-inputs').innerHTML = subjects.map(s => `
            <div class="grade-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <label style="font-size:0.8rem">${s.name}</label>
                <input type="number" step="0.1" class="grade-input tech-input" style="width:80px; margin:0" data-sub-id="${s.id}">
            </div>
        `).join('');
        openModal('student-modal');
    };

    // Save Actions
    $('save-semester-btn').onclick = async () => {
        const name = $('semester-name').value;
        if(name) {
            await db.from(TBL.SEM).insert([{ name }]);
            location.reload();
        }
    };

    $('save-subject-btn').onclick = async () => {
        const name = $('new-subject-name').value;
        if(name) {
            await db.from(TBL.SUB).insert([{ name, semester_id: currentSemesterId }]);
            closeModal('subject-modal');
            loadDashboard();
        }
    };

    $('save-student-btn').onclick = async () => {
        const name = $('new-student-name').value;
        if(!name) return;

        const { data: student } = await db.from(TBL.STU).insert([{
            full_name: name, semester_id: currentSemesterId,
            year_level: $('new-student-year').value, section: $('new-student-section').value
        }]).select().single();

        if(student) {
            const grades = Array.from(document.querySelectorAll('.grade-input')).map(i => ({
                student_id: student.id, subject_id: i.dataset.subId,
                score: i.value ? parseFloat(i.value) : null
            })).filter(g => g.score !== null);

            if(grades.length) await db.from(TBL.GRD).insert(grades);
            closeModal('student-modal');
            loadStudents(); // Refresh the table
        }
    };
}

async function loadSemesters() {
    const { data } = await db.from(TBL.SEM).select('*').order('created_at', { ascending: false });
    const sel = $('semester-select');
    sel.innerHTML = '<option value="">Select Batch</option>' + data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    
    const saved = localStorage.getItem('selectedBatchId');
    if(saved && data.some(s => s.id === saved)) {
        sel.value = saved;
        currentSemesterId = saved;
        loadDashboard();
    }
}

async function loadDashboard() {
    if(!currentSemesterId) return;
    $('empty-state').style.display = 'none';
    $('table-section').style.display = 'block';
    $('subjects-section').style.display = 'block';
    $('add-student-btn').style.display = 'inline-flex';

    const { data: subData } = await db.from(TBL.SUB).select('*').eq('semester_id', currentSemesterId);
    subjects = subData || [];
    
    $('subject-list').innerHTML = subjects.map(s => `<div class="stat-tile" style="padding:10px; margin-bottom:5px; font-size:0.8rem"><i class="fa-solid fa-book"></i> ${s.name}</div>`).join('');
    
    loadStudents();
}

async function loadStudents() {
    const { data: stu } = await db.from(TBL.STU).select('*').eq('semester_id', currentSemesterId);
    if(!stu?.length) { students = []; renderTable(); return; }

    const { data: grd } = await db.from(TBL.GRD).select('*').in('student_id', stu.map(s => s.id));
    students = stu.map(s => ({
        ...s,
        grades: (grd || []).filter(g => g.student_id === s.id)
    }));
    renderTable();
}

function renderTable() {
    // Dynamic Header
    $('table-header').innerHTML = '<th>Student Profile</th>' + subjects.map(s => `<th>${s.name}</th>`).join('') + '<th>GWA</th>';

    // Body
    $('table-body').innerHTML = students.map(s => {
        let sum = 0, count = 0;
        const cells = subjects.map(sub => {
            const g = s.grades.find(g => g.subject_id === sub.id);
            if(g) { sum += g.score; count++; }
            return `<td>${g ? g.score : '-'}</td>`;
        }).join('');

        const gwa = count > 0 ? (sum / count).toFixed(2) : '0.00';
        return `<tr>
            <td><strong>${s.full_name}</strong><br><small>${s.year_level} - ${s.section}</small></td>
            ${cells}
            <td><span class="stat-value" style="font-size:1rem; color:${gwa <= 3.0 ? '#2ed573' : '#ff4757'}">${gwa}</span></td>
        </tr>`;
    }).join('');

    updateStats();
}

function updateStats() {
    $('stat-total-students').textContent = students.length;
    // Additional stat logic here...
}

function openModal(id) { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); document.querySelectorAll('.tech-input').forEach(i => i.value = ''); }

function initChart() {
    const ctx = $('dashboard-chart').getContext('2d');
    dashboardChart = new Chart(ctx, {
        type: 'line',
        data: { labels: ['M1', 'M2', 'M3', 'M4'], datasets: [{ label: 'Batch Performance', data: [2.5, 2.1, 1.8, 1.5], borderColor: '#00f2ff', tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { reverse: true, min: 1, max: 5 } } }
    });
}