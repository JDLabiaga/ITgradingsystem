const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TBL = { SEM: 'semesters3', SUB: 'subjects3', STU: 'students3', GRD: 'grades3' };
const $ = (id) => document.getElementById(id);

let currentSemesterId = null, subjects = [], students = [], chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    initChart();
    
    // Sidebar Toggles
    $('mobile-menu-btn').onclick = () => $('sidebar').classList.add('open');
    $('close-sidebar').onclick = () => $('sidebar').classList.remove('open');
    
    $('semester-select').onchange = (e) => {
        currentSemesterId = e.target.value;
        loadDashboard();
    };

    $('add-semester-btn').onclick = () => openModal('semester-modal');
    $('add-subject-btn').onclick = () => openModal('subject-modal');
    
    $('save-semester-btn').onclick = async () => {
        const name = $('semester-name').value;
        if(name) {
            await db.from(TBL.SEM).insert([{ name }]);
            location.reload();
        }
    };

    $('save-subject-btn').onclick = async () => {
        const name = $('new-subject-name').value;
        if(name && currentSemesterId) {
            await db.from(TBL.SUB).insert([{ name, semester_id: currentSemesterId }]);
            closeModal('subject-modal');
            loadDashboard(); // Refresh subjects
        }
    };

    $('delete-semester-btn').onclick = async () => {
        if(!currentSemesterId) return;
        if(confirm("Delete this batch and all its records?")) {
            await db.from(TBL.SEM).delete().eq('id', currentSemesterId);
            location.reload();
        }
    };

    $('add-student-btn').onclick = () => {
        $('grade-inputs').innerHTML = subjects.map(s => `
            <div class="flex-row" style="align-items:center; justify-content:space-between">
                <label style="font-size:0.8rem">${s.name}</label>
                <input type="number" step="0.1" class="grade-input tech-input" style="width:70px" data-sub-id="${s.id}">
            </div>
        `).join('');
        openModal('student-modal');
    };

    $('save-student-btn').onclick = async () => {
        const name = $('new-student-name').value;
        const section = $('new-student-section').value;
        if(!name) return;

        const { data: student } = await db.from(TBL.STU).insert([{ 
            full_name: name, 
            semester_id: currentSemesterId, 
            section: section 
        }]).select().single();

        if(student) {
            const grades = Array.from(document.querySelectorAll('.grade-input')).map(i => ({
                student_id: student.id,
                subject_id: i.dataset.subId,
                score: i.value ? parseFloat(i.value) : null
            })).filter(g => g.score !== null);
            
            if(grades.length) await db.from(TBL.GRD).insert(grades);
            closeModal('student-modal');
            loadStudents();
        }
    };

    $('search-input').oninput = (e) => renderTable(e.target.value);
});

async function loadSemesters() {
    const { data } = await db.from(TBL.SEM).select('*').order('created_at', { ascending: false });
    $('semester-select').innerHTML = '<option value="">Select Batch</option>' + 
        data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function loadDashboard() {
    if(!currentSemesterId) return;
    $('empty-state').style.display = 'none';
    $('table-section').style.display = 'block';
    $('add-student-btn').style.display = 'block';
    $('subjects-section').style.display = 'block';

    const { data } = await db.from(TBL.SUB).select('*').eq('semester_id', currentSemesterId);
    subjects = data || [];
    
    // Render Subject List in Sidebar
    $('subject-list').innerHTML = subjects.map(s => `
        <div class="sub-item">
            <span>${s.name}</span>
            <button class="btn-del-sub" onclick="deleteSubject('${s.id}')"><i class="fa-solid fa-circle-xmark"></i></button>
        </div>
    `).join('');
    
    loadStudents();
}

async function deleteSubject(id) {
    if(confirm("Delete this module and all associated grades?")) {
        await db.from(TBL.SUB).delete().eq('id', id);
        loadDashboard();
    }
}

async function loadStudents() {
    const { data: stu } = await db.from(TBL.STU).select('*').eq('semester_id', currentSemesterId);
    const { data: grd } = await db.from(TBL.GRD).select('*');
    
    students = (stu || []).map(s => ({
        ...s,
        grades: (grd || []).filter(g => g.student_id === s.id)
    }));
    renderTable();
}

async function deleteStudent(id) {
    if(confirm("Remove this student?")) {
        await db.from(TBL.STU).delete().eq('id', id);
        loadStudents();
    }
}

function renderTable(filter = '') {
    $('table-header').innerHTML = '<th>Name & Section</th>' + subjects.map(s => `<th>${s.name}</th>`).join('') + '<th>GWA</th><th>Action</th>';
    
    const filtered = students.filter(s => s.full_name.toLowerCase().includes(filter.toLowerCase()));
    let totalGWA = 0;

    $('table-body').innerHTML = filtered.map(s => {
        let sum = 0, count = 0;
        const cells = subjects.map(sub => {
            const g = s.grades.find(g => g.subject_id === sub.id);
            if(g) { sum += g.score; count++; }
            return `<td>${g ? g.score : '-'}</td>`;
        }).join('');
        
        const gwa = count > 0 ? (sum / count).toFixed(2) : '0.00';
        totalGWA += parseFloat(gwa);

        return `<tr>
            <td><strong>${s.full_name}</strong><br><small>${s.section || ''}</small></td>
            ${cells}
            <td><span class="stat-val" style="font-size:0.9rem">${gwa}</span></td>
            <td><button class="btn-row-delete" onclick="deleteStudent('${s.id}')"><i class="fa-solid fa-trash-can"></i></button></td>
        </tr>`;
    }).join('');

    $('stat-total-students').textContent = filtered.length;
    $('stat-average-class').textContent = filtered.length ? (totalGWA / filtered.length).toFixed(2) : '0.00';
    updateChart(filtered);
}

function initChart() {
    const ctx = $('dashboard-chart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'GWA Performance', data: [], borderColor: '#00f2ff', tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { reverse: true, min: 1, max: 5 } } }
    });
}

function updateChart(data) {
    chartInstance.data.labels = data.map(s => s.full_name.split(' ')[0]);
    chartInstance.data.datasets[0].data = data.map(s => {
        let sum = 0, count = 0;
        s.grades.forEach(g => { sum += g.score; count++; });
        return count > 0 ? (sum / count) : null;
    });
    chartInstance.update();
}

function openModal(id) { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); }