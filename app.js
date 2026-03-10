// ===== Supabase Config =====
const SUPABASE_URL = 'https://bjcqygaqqgknplzjbmiw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqY3F5Z2FxcWdrbnBsempibWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDQ4NzMsImV4cCI6MjA4ODYyMDg3M30._I5BxEMAK7PtHc87fGhmlPJf31H3j525NqNoUjAgwR8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== State =====
let currentUser = null;
let currentSemesterId = null;
let semesters = [];
let subjects = [];
let students = [];
let sortColumn = null;
let sortDirection = 'asc';
let pendingDeleteFn = null;
let filterYearLevel = '';
let filterSection = '';

// ===== DOM References =====
const $ = (id) => document.getElementById(id);

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    bindEvents();
});

function bindEvents() {
    // Login
    $('login-form').addEventListener('submit', (e) => { e.preventDefault(); handleLogin(); });

    // Sidebar
    $('sidebar-collapse-btn').addEventListener('click', toggleSidebar);
    $('sidebar-open-btn').addEventListener('click', toggleSidebar);
    $('sidebar-overlay').addEventListener('click', closeSidebar);

    // Subjects toggle (collapsible)
    $('subjects-toggle').addEventListener('click', toggleSubjectsMenu);

    // Semester
    $('semester-select').addEventListener('change', switchSemester);
    $('add-semester-btn').addEventListener('click', () => openModal('semester-modal'));
    $('save-semester-btn').addEventListener('click', addSemester);

    // Subject
    $('add-subject-btn').addEventListener('click', () => openModal('subject-modal'));
    $('save-subject-btn').addEventListener('click', addSubject);

    // Student
    $('add-student-btn').addEventListener('click', () => openAddStudentModal());
    $('save-student-btn').addEventListener('click', saveStudent);
    $('update-student-btn').addEventListener('click', updateStudent);
    $('delete-student-btn').addEventListener('click', () => {
        const studentId = $('edit-student-id').value;
        const studentName = $('edit-student-name').value;
        closeModal('edit-modal');
        confirmDelete(`Delete student "${studentName}"?`, () => deleteStudent(studentId));
    });

    // Confirm modal
    $('confirm-delete-btn').addEventListener('click', () => {
        if (pendingDeleteFn) pendingDeleteFn();
        closeModal('confirm-modal');
        pendingDeleteFn = null;
    });

    // Search
    $('search-input').addEventListener('input', filterTable);

    // Filters
    $('filter-year').addEventListener('change', (e) => {
        filterYearLevel = e.target.value;
        renderTableBody();
    });
    $('filter-section').addEventListener('change', (e) => {
        filterSection = e.target.value;
        renderTableBody();
    });

    // Logout
    $('logout-btn').addEventListener('click', handleLogout);

    // Modal close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
        }
    });
}

// ===== Auth =====
async function handleLogin() {
    const email = $('email').value.trim();
    const password = $('password').value;
    $('login-error').textContent = '';

    if (!email || !password) {
        $('login-error').textContent = 'Please enter email and password.';
        return;
    }

    const btn = $('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        $('login-error').textContent = error.message;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
    } else {
        checkUser();
    }
}

async function handleLogout() {
    await db.auth.signOut();
    currentUser = null;
    currentSemesterId = null;
    $('dashboard-section').style.display = 'none';
    $('login-section').style.display = 'flex';
    $('email').value = '';
    $('password').value = '';
    $('login-error').textContent = '';
    toast('Signed out successfully', 'success');
}

async function checkUser() {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
        currentUser = user;
        $('login-section').style.display = 'none';
        $('dashboard-section').style.display = 'flex';
        $('user-email').textContent = user.email;
        await loadSemesters();
    }
}

// ===== Sidebar =====
function toggleSidebar() {
    const sidebar = $('sidebar');
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        sidebar.classList.toggle('open');
        $('sidebar-overlay').classList.toggle('active', sidebar.classList.contains('open'));
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.remove('active');
}

function toggleSubjectsMenu() {
    const toggle = $('subjects-toggle');
    const wrapper = $('subject-list-wrapper');
    toggle.classList.toggle('collapsed');
    wrapper.classList.toggle('collapsed');
}

// ===== Toast Notifications =====
function toast(message, type = 'success') {
    const container = $('toast-container');
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation'
    };

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.success}"></i>
        <span>${escapeHtml(message)}</span>
        <button class="toast-close">&times;</button>
    `;

    el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
    container.appendChild(el);

    setTimeout(() => removeToast(el), 4000);
}

function removeToast(el) {
    if (!el.parentNode) return;
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove());
}

// ===== Modals =====
function openModal(id) {
    $(id).classList.add('active');
    const firstInput = $(id).querySelector('input:not([type=hidden])');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
}

function closeModal(id) {
    $(id).classList.remove('active');
}

function confirmDelete(message, onConfirm) {
    $('confirm-message').textContent = message;
    pendingDeleteFn = onConfirm;
    openModal('confirm-modal');
}

// ===== Semesters =====
async function loadSemesters() {
    const { data, error } = await db.from('semesters')
        .select('*')
        .eq('teacher_id', currentUser.id)
        .order('id', { ascending: false });
    if (error) {
        toast('Failed to load semesters', 'error');
        return;
    }
    semesters = data || [];
    renderSemesterOptions();
}

function renderSemesterOptions() {
    const select = $('semester-select');
    select.innerHTML = '<option value="">-- Select Semester --</option>';
    semesters.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        if (s.id === currentSemesterId) opt.selected = true;
        select.appendChild(opt);
    });
}

async function addSemester() {
    const name = $('semester-name').value.trim();
    if (!name) { toast('Enter a semester name', 'warning'); return; }

    const { data, error } = await db.from('semesters')
        .insert([{ name, teacher_id: currentUser.id }])
        .select().single();
    if (error) { toast('Failed to create semester', 'error'); return; }

    semesters.unshift(data);
    renderSemesterOptions();
    $('semester-select').value = data.id;
    $('semester-name').value = '';
    closeModal('semester-modal');
    toast(`Semester "${name}" created`, 'success');
    await switchSemester();
}

async function switchSemester() {
    const id = $('semester-select').value;
    if (!id) {
        currentSemesterId = null;
        subjects = [];
        students = [];
        $('page-title').textContent = 'Select a Semester';
        $('add-student-btn').style.display = 'none';
        $('subjects-section').style.display = 'none';
        $('table-section').style.display = 'none';
        $('no-subjects-state').style.display = 'none';
        $('empty-state').style.display = 'flex';
        return;
    }

    currentSemesterId = parseInt(id);
    const sem = semesters.find(s => s.id === currentSemesterId);
    $('page-title').textContent = sem ? sem.name : 'Dashboard';
    $('empty-state').style.display = 'none';
    $('subjects-section').style.display = 'block';

    await loadSubjects();
    await loadStudents();
}

// ===== Subjects =====
async function loadSubjects() {
    const { data, error } = await db.from('subjects')
        .select('*')
        .eq('semester_id', currentSemesterId)
        .order('id');

    if (error) { toast('Failed to load subjects', 'error'); return; }
    subjects = data || [];
    renderSubjectList();
    updateTableVisibility();
}

function renderSubjectList() {
    const list = $('subject-list');
    list.innerHTML = '';

    subjects.forEach(sub => {
        const item = document.createElement('div');
        item.className = 'subject-item';
        item.innerHTML = `
            <div class="subject-name">
                <i class="fa-solid fa-book-open"></i>
                <span>${escapeHtml(sub.name)}</span>
            </div>
            <button class="delete-subject" title="Delete subject">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        item.querySelector('.delete-subject').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDelete(`Delete subject "${sub.name}"? All related grades will be removed.`, () => deleteSubject(sub.id));
        });
        list.appendChild(item);
    });
}

async function addSubject() {
    const name = $('new-subject-name').value.trim();
    if (!name) { toast('Enter a subject name', 'warning'); return; }
    if (!currentSemesterId) { toast('Select a semester first', 'warning'); return; }

    const { data, error } = await db.from('subjects')
        .insert([{ name, semester_id: currentSemesterId }])
        .select().single();

    if (error) { toast('Failed to add subject', 'error'); return; }

    subjects.push(data);
    renderSubjectList();
    $('new-subject-name').value = '';
    closeModal('subject-modal');
    toast(`Subject "${name}" added`, 'success');
    await loadStudents();
}

async function deleteSubject(id) {
    // Delete grades for this subject first
    await db.from('grades').delete().eq('subject_id', id);
    const { error } = await db.from('subjects').delete().eq('id', id);
    if (error) { toast('Failed to delete subject', 'error'); return; }

    subjects = subjects.filter(s => s.id !== id);
    renderSubjectList();
    toast('Subject deleted', 'success');
    await loadStudents();
}

// ===== Students =====
async function loadStudents() {
    if (!currentSemesterId) return;

    // Fetch students separately from grades for reliability
    const { data: studentData, error: studentError } = await db.from('students')
        .select('id, full_name, year_level, section')
        .eq('semester_id', currentSemesterId)
        .order('full_name');

    if (studentError) { toast('Failed to load students', 'error'); return; }

    const studentList = studentData || [];

    if (studentList.length === 0) {
        students = [];
        sortColumn = null;
        sortDirection = 'asc';
        updateFilterOptions();
        renderTable();
        return;
    }

    // Fetch all grades for these students
    const studentIds = studentList.map(s => s.id);
    const { data: gradeData, error: gradeError } = await db.from('grades')
        .select('id, student_id, subject_id, score')
        .in('student_id', studentIds);

    if (gradeError) { toast('Failed to load grades', 'error'); }

    const gradesByStudent = {};
    (gradeData || []).forEach(g => {
        if (!gradesByStudent[g.student_id]) gradesByStudent[g.student_id] = [];
        gradesByStudent[g.student_id].push(g);
    });

    // Merge grades into students
    students = studentList.map(s => ({
        ...s,
        grades: gradesByStudent[s.id] || []
    }));

    sortColumn = null;
    sortDirection = 'asc';
    updateFilterOptions();
    renderTable();
}

function updateFilterOptions() {
    const yearSet = new Set();
    const sectionSet = new Set();
    students.forEach(s => {
        if (s.year_level) yearSet.add(s.year_level);
        if (s.section) sectionSet.add(s.section);
    });

    const yearSelect = $('filter-year');
    const currentYear = yearSelect.value;
    yearSelect.innerHTML = '<option value="">All Years</option>';
    [...yearSet].sort().forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    });
    yearSelect.value = yearSet.has(currentYear) ? currentYear : '';
    filterYearLevel = yearSelect.value;

    const sectionSelect = $('filter-section');
    const currentSection = sectionSelect.value;
    sectionSelect.innerHTML = '<option value="">All Sections</option>';
    [...sectionSet].sort().forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        sectionSelect.appendChild(opt);
    });
    sectionSelect.value = sectionSet.has(currentSection) ? currentSection : '';
    filterSection = sectionSelect.value;
}

function updateTableVisibility() {
    if (subjects.length === 0) {
        $('table-section').style.display = 'none';
        $('no-subjects-state').style.display = 'flex';
        $('add-student-btn').style.display = 'none';
    } else {
        $('no-subjects-state').style.display = 'none';
        $('table-section').style.display = 'block';
        $('add-student-btn').style.display = 'inline-flex';
    }
}

function renderTable() {
    updateTableVisibility();
    renderTableHeader();
    renderTableBody();
    updateStudentCount();
}

function renderTableHeader() {
    const header = $('table-header');
    header.innerHTML = '';

    const thName = createTh('Name', 'name');
    header.appendChild(thName);

    const thYear = createTh('Year', 'year_level');
    header.appendChild(thYear);

    const thSection = createTh('Section', 'section');
    header.appendChild(thSection);

    subjects.forEach(sub => {
        const th = createTh(sub.name, `subject_${sub.id}`);
        header.appendChild(th);
    });

    const thAvg = createTh('General Avg', 'avg');
    header.appendChild(thAvg);

    const thActions = document.createElement('th');
    thActions.textContent = 'Actions';
    thActions.style.cursor = 'default';
    header.appendChild(thActions);
}

function createTh(label, key) {
    const th = document.createElement('th');
    th.dataset.sortKey = key;

    const isSorted = sortColumn === key;
    let iconClass = 'fa-sort';
    if (isSorted) iconClass = sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
    if (isSorted) th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');

    th.innerHTML = `${escapeHtml(label)} <i class="fa-solid ${iconClass} sort-icon"></i>`;
    th.addEventListener('click', () => handleSort(key));
    return th;
}

function handleSort(key) {
    if (sortColumn === key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = key;
        sortDirection = 'asc';
    }
    renderTable();
}

function getSortedStudents() {
    if (!sortColumn) return [...students];

    return [...students].sort((a, b) => {
        let valA, valB;

        if (sortColumn === 'name') {
            valA = a.full_name.toLowerCase();
            valB = b.full_name.toLowerCase();
        } else if (sortColumn === 'year_level') {
            valA = (a.year_level || '').toLowerCase();
            valB = (b.year_level || '').toLowerCase();
        } else if (sortColumn === 'section') {
            valA = (a.section || '').toLowerCase();
            valB = (b.section || '').toLowerCase();
        } else if (sortColumn === 'avg') {
            valA = computeAverage(a);
            valB = computeAverage(b);
        } else if (sortColumn.startsWith('subject_')) {
            const subId = parseInt(sortColumn.split('_')[1]);
            valA = getGradeScore(a, subId);
            valB = getGradeScore(b, subId);
        } else {
            return 0;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderTableBody() {
    const tbody = $('table-body');
    tbody.innerHTML = '';

    const sorted = getSortedStudents();
    const searchFilter = $('search-input').value.toLowerCase().trim();

    const filtered = sorted.filter(s => {
        if (searchFilter && !s.full_name.toLowerCase().includes(searchFilter)) return false;
        if (filterYearLevel && s.year_level !== filterYearLevel) return false;
        if (filterSection && s.section !== filterSection) return false;
        return true;
    });

    if (filtered.length === 0) {
        $('no-students').style.display = 'flex';
        if (students.length === 0) {
            $('no-students').querySelector('p').textContent = 'No students yet. Click "Add Student" to get started.';
        } else {
            $('no-students').querySelector('p').textContent = 'No students match your filters.';
        }
        updateStudentCount();
        return;
    }

    $('no-students').style.display = 'none';

    filtered.forEach(student => {
        const tr = document.createElement('tr');

        // Name cell
        const tdName = document.createElement('td');
        tdName.className = 'student-name-cell';
        tdName.textContent = student.full_name;
        tr.appendChild(tdName);

        // Year cell
        const tdYear = document.createElement('td');
        tdYear.className = 'year-cell';
        tdYear.textContent = student.year_level || '—';
        tr.appendChild(tdYear);

        // Section cell
        const tdSection = document.createElement('td');
        tdSection.className = 'section-cell';
        tdSection.textContent = student.section || '—';
        tr.appendChild(tdSection);

        // Grade cells (inline editable)
        subjects.forEach(sub => {
            const td = document.createElement('td');
            td.className = 'grade-cell';
            const score = getGradeScore(student, sub.id);

            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.max = '100';
            input.value = score;
            input.dataset.studentId = student.id;
            input.dataset.subjectId = sub.id;
            input.dataset.original = score;

            input.addEventListener('input', () => {
                input.classList.toggle('changed', input.value !== input.dataset.original);
                updateRowAverage(tr, student);
            });
            input.addEventListener('change', () => handleInlineGradeEdit(input, student, sub.id));

            td.appendChild(input);
            tr.appendChild(td);
        });

        // Average cell
        const tdAvg = document.createElement('td');
        tdAvg.className = 'avg-cell';
        const avg = computeAverage(student);
        tdAvg.textContent = avg.toFixed(2);
        tdAvg.classList.add(avg >= 75 ? 'avg-pass' : 'avg-fail');
        tr.appendChild(tdAvg);

        // Action buttons
        const tdActions = document.createElement('td');
        tdActions.className = 'action-btns';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-primary';
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        editBtn.title = 'Edit student';
        editBtn.addEventListener('click', () => openEditStudentModal(student));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.title = 'Delete student';
        deleteBtn.addEventListener('click', () => {
            confirmDelete(`Delete student "${student.full_name}"?`, () => deleteStudent(student.id));
        });

        tdActions.appendChild(editBtn);
        tdActions.appendChild(deleteBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });

    updateStudentCount();
}

function updateRowAverage(tr, student) {
    const inputs = tr.querySelectorAll('.grade-cell input');
    let total = 0, count = 0;
    inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val)) { total += val; count++; }
    });
    const avg = count > 0 ? total / count : 0;
    const avgCell = tr.querySelector('.avg-cell');
    avgCell.textContent = avg.toFixed(2);
    avgCell.className = 'avg-cell ' + (avg >= 75 ? 'avg-pass' : 'avg-fail');
}

function updateStudentCount() {
    const searchFilter = $('search-input').value.toLowerCase().trim();
    const count = students.filter(s => {
        if (searchFilter && !s.full_name.toLowerCase().includes(searchFilter)) return false;
        if (filterYearLevel && s.year_level !== filterYearLevel) return false;
        if (filterSection && s.section !== filterSection) return false;
        return true;
    }).length;
    $('student-count').textContent = `${count} student${count !== 1 ? 's' : ''}`;
}

function filterTable() {
    renderTableBody();
}

// ===== Inline Grade Editing =====
async function handleInlineGradeEdit(input, student, subjectId) {
    const newScore = parseFloat(input.value);
    if (isNaN(newScore) || newScore < 0 || newScore > 100) {
        input.value = input.dataset.original;
        input.classList.remove('changed');
        toast('Grade must be between 0 and 100', 'warning');
        return;
    }

    const existingGrade = student.grades.find(g => g.subject_id === subjectId);

    let error;
    if (existingGrade) {
        ({ error } = await db.from('grades').update({ score: newScore }).eq('id', existingGrade.id));
        if (!error) existingGrade.score = newScore;
    } else {
        const { data, error: insertError } = await db.from('grades')
            .insert([{ student_id: student.id, subject_id: subjectId, score: newScore }])
            .select().single();
        error = insertError;
        if (!error && data) student.grades.push(data);
    }

    if (error) {
        input.value = input.dataset.original;
        toast('Failed to update grade', 'error');
    } else {
        input.dataset.original = newScore;
        input.classList.remove('changed');
    }
}

// ===== Add Student Modal =====
function openAddStudentModal() {
    $('new-student-name').value = '';
    $('new-student-year').value = '';
    $('new-student-section').value = '';
    const container = $('grade-inputs');
    container.innerHTML = '';

    subjects.forEach(sub => {
        const row = document.createElement('div');
        row.className = 'grade-input-row';
        row.innerHTML = `
            <label>${escapeHtml(sub.name)}</label>
            <input type="number" min="0" max="100" value="0" data-subject-id="${sub.id}" placeholder="0">
        `;
        container.appendChild(row);
    });

    openModal('student-modal');
}

async function saveStudent() {
    const name = $('new-student-name').value.trim();
    if (!name) { toast('Enter the student name', 'warning'); return; }
    if (!currentSemesterId) { toast('Select a semester first', 'warning'); return; }

    const yearLevel = $('new-student-year').value || null;
    const section = $('new-student-section').value.trim() || null;

    const { data: student, error } = await db.from('students')
        .insert([{ full_name: name, semester_id: currentSemesterId, year_level: yearLevel, section }])
        .select().single();

    if (error) { toast('Failed to add student', 'error'); return; }

    // Insert grades
    const inputs = $('grade-inputs').querySelectorAll('input[data-subject-id]');
    const grades = [];
    inputs.forEach(inp => {
        grades.push({
            student_id: student.id,
            subject_id: parseInt(inp.dataset.subjectId),
            score: parseFloat(inp.value) || 0
        });
    });

    if (grades.length > 0) {
        const { data: gradeData, error: gradeError } = await db.from('grades').insert(grades).select();
        if (gradeError) { toast('Student added but some grades failed', 'warning'); }
        student.grades = gradeData || [];
    } else {
        student.grades = [];
    }

    students.push(student);
    closeModal('student-modal');
    toast(`Student "${name}" added`, 'success');
    updateFilterOptions();
    renderTable();
}

// ===== Edit Student Modal =====
function openEditStudentModal(student) {
    $('edit-student-id').value = student.id;
    $('edit-student-name').value = student.full_name;
    $('edit-student-year').value = student.year_level || '';
    $('edit-student-section').value = student.section || '';

    const container = $('edit-grade-inputs');
    container.innerHTML = '';

    subjects.forEach(sub => {
        const score = getGradeScore(student, sub.id);
        const row = document.createElement('div');
        row.className = 'grade-input-row';
        row.innerHTML = `
            <label>${escapeHtml(sub.name)}</label>
            <input type="number" min="0" max="100" value="${score}" data-subject-id="${sub.id}" placeholder="0">
        `;
        container.appendChild(row);
    });

    openModal('edit-modal');
}

async function updateStudent() {
    const studentId = parseInt($('edit-student-id').value);
    const name = $('edit-student-name').value.trim();
    if (!name) { toast('Enter the student name', 'warning'); return; }

    const yearLevel = $('edit-student-year').value || null;
    const section = $('edit-student-section').value.trim() || null;

    const { error } = await db.from('students')
        .update({ full_name: name, year_level: yearLevel, section })
        .eq('id', studentId);
    if (error) { toast('Failed to update student', 'error'); return; }

    // Update grades
    const inputs = $('edit-grade-inputs').querySelectorAll('input[data-subject-id]');
    const student = students.find(s => s.id === studentId);

    for (const inp of inputs) {
        const subjectId = parseInt(inp.dataset.subjectId);
        const newScore = parseFloat(inp.value) || 0;
        const existing = student.grades.find(g => g.subject_id === subjectId);

        if (existing) {
            await db.from('grades').update({ score: newScore }).eq('id', existing.id);
            existing.score = newScore;
        } else {
            const { data } = await db.from('grades')
                .insert([{ student_id: studentId, subject_id: subjectId, score: newScore }])
                .select().single();
            if (data) student.grades.push(data);
        }
    }

    student.full_name = name;
    student.year_level = yearLevel;
    student.section = section;
    closeModal('edit-modal');
    toast(`Student "${name}" updated`, 'success');
    updateFilterOptions();
    renderTable();
}

async function deleteStudent(id) {
    await db.from('grades').delete().eq('student_id', id);
    const { error } = await db.from('students').delete().eq('id', parseInt(id));
    if (error) { toast('Failed to delete student', 'error'); return; }

    students = students.filter(s => s.id !== parseInt(id));
    toast('Student deleted', 'success');
    updateFilterOptions();
    renderTable();
}

// ===== Helpers =====
function getGradeScore(student, subjectId) {
    const grade = student.grades.find(g => g.subject_id === subjectId);
    return grade ? grade.score : 0;
}

function computeAverage(student) {
    if (subjects.length === 0) return 0;
    let total = 0;
    subjects.forEach(sub => { total += getGradeScore(student, sub.id); });
    return total / subjects.length;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
