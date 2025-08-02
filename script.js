        // Configuração do Firebase (substitua com suas credenciais)
        const firebaseConfig = {
            apiKey: "AIzaSyBmLoKrkzykMEc5788Q70jJUBXlsI5r9eY",
            authDomain: "apper-efdb1.firebaseapp.com",
            databaseURL: "https://apper-efdb1-default-rtdb.firebaseio.com",
            projectId: "apper-efdb1",
            storageBucket: "apper-efdb1.firebasestorage.app",
            messagingSenderId: "928818893236",
            appId: "1:928818893236:web:1d72b54eb31b5cf4b822e1",
            measurementId: "G-RFW2KEN621"
        };

        // Inicializa o Firebase
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore();

        // Data Storage
        let people = [];
        let attendance = {};
        let currentUser = null;
        let selectedDate = null;

        // Initialize the application
        document.addEventListener('DOMContentLoaded', () => {
            // Verifica se o usuário já está logado
            auth.onAuthStateChanged(user => {
                if (user) {
                    currentUser = user;
                    handleSuccessfulLogin(user.email);
                }
            });

            // Login functionality
            document.getElementById('login-btn').addEventListener('click', attemptLogin);
            document.getElementById('logout-btn').addEventListener('click', logout);

            // Tab navigation
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => switchTab(tab.dataset.tab));
            });

            // Register form submission
            document.getElementById('register-form').addEventListener('submit', registerPerson);

            // Search functionality
            document.getElementById('search-btn').addEventListener('click', searchPeople);
            document.getElementById('search-person').addEventListener('keyup', event => {
                if (event.key === 'Enter') searchPeople();
            });

            // History person selection
            document.getElementById('person-select').addEventListener('change', showPersonHistory);

            // Calendar navigation
            document.getElementById('prev-month').addEventListener('click', () => navigateMonth(-1));
            document.getElementById('next-month').addEventListener('click', () => navigateMonth(1));

            // Modal close button
            document.querySelector('.close-modal').addEventListener('click', closeAttendanceModal);

            // Save attendance button
            document.getElementById('save-attendance').addEventListener('click', saveAttendanceData);

            // Initialize calendar
            initCalendar();
        });

        // Função de login
        async function attemptLogin(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            showLoading(true);
            hideError();

            try {
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                currentUser = userCredential.user;
                handleSuccessfulLogin(currentUser.email);
            } catch (error) {
                showError(getFirebaseAuthErrorMessage(error));
                console.error("Erro de login:", error);
            } finally {
                showLoading(false);
            }
        }

        function handleSuccessfulLogin(email) {
            // Verifica se é admin ou conselheiro
            const isAdmin = email === 'admin@escola.com';
            const isConselheiro = email === 'conselheiro@escola.com';

            if (!isAdmin && !isConselheiro) {
                auth.signOut();
                showError('Acesso restrito a administradores e conselheiros');
                return;
            }

            document.getElementById('current-user').textContent =
                isAdmin ? 'Administrador' : 'Conselheiro';

            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');

            // Configura permissões baseadas no tipo de usuário
            setupUserPermissions(isAdmin);

            // Carrega os dados do Firestore
            loadPeopleFromFirebase();
            loadAttendanceFromFirebase();
        }

        function setupUserPermissions(isAdmin) {
            // Esconde funcionalidades para conselheiros
            const adminOnlyElements = document.querySelectorAll('.admin-only');

            if (isAdmin) {
                adminOnlyElements.forEach(el => el.style.display = '');
            } else {
                adminOnlyElements.forEach(el => el.style.display = 'none');

                // Esconde botões de edição/exclusão na tabela
                document.querySelectorAll('.delete-btn, .edit-btn').forEach(btn => {
                    btn.style.display = 'none';
                });
            }
        }

        // Funções para carregar dados do Firestore
        async function loadPeopleFromFirebase() {
            try {
                showLoading(true);
                const snapshot = await db.collection('people').orderBy('name').get();
                people = [];
                snapshot.forEach(doc => {
                    people.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                renderPeopleTable();
                populatePersonSelect();
            } catch (error) {
                console.error('Erro ao carregar pessoas:', error);
                showError('Erro ao carregar dados. Tente recarregar a página.');
            } finally {
                showLoading(false);
            }
        }

        async function loadAttendanceFromFirebase() {
            try {
                const snapshot = await db.collection('attendance').get();
                attendance = {};
                snapshot.forEach(doc => {
                    attendance[doc.id] = doc.data();
                });
                // Atualiza o calendário se estiver na aba de frequência
                if (document.getElementById('attendance-tab').classList.contains('hidden') === false) {
                    const [monthName, year] = document.getElementById('current-month').textContent.split(' ');
                    const month = [
                        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
                    ].indexOf(monthName);

                    renderCalendar(parseInt(year), month);
                }
            } catch (error) {
                console.error('Erro ao carregar frequência:', error);
            }
        }

        // Funções para salvar dados no Firestore
        async function savePersonToFirebase(person) {
            try {
                showLoading(true);
                if (person.id) {
                    // Atualiza pessoa existente
                    await db.collection('people').doc(person.id).update({
                        name: person.name,
                        birthdate: person.birthdate,
                        role: person.role
                    });
                } else {
                    // Adiciona nova pessoa
                    const docRef = await db.collection('people').add({
                        name: person.name,
                        birthdate: person.birthdate,
                        role: person.role
                    });
                    person.id = docRef.id;
                }
                await loadPeopleFromFirebase();
                return true;
            } catch (error) {
                console.error('Erro ao salvar pessoa:', error);
                showError('Erro ao salvar dados. Tente novamente.');
                return false;
            } finally {
                showLoading(false);
            }
        }

        async function deletePersonFromFirebase(personId) {
            try {
                showLoading(true);
                await db.collection('people').doc(personId).delete();

                // Remove registros de frequência dessa pessoa
                const batch = db.batch();
                const attendanceQuery = await db.collection('attendance').get();

                attendanceQuery.forEach(doc => {
                    if (doc.data()[personId]) {
                        const updatedData = { ...doc.data() };
                        delete updatedData[personId];
                        batch.update(db.collection('attendance').doc(doc.id), updatedData);
                    }
                });

                await batch.commit();
                await loadPeopleFromFirebase();
                await loadAttendanceFromFirebase();
                return true;
            } catch (error) {
                console.error('Erro ao excluir pessoa:', error);
                showError('Erro ao excluir dados. Tente novamente.');
                return false;
            } finally {
                showLoading(false);
            }
        }

        async function saveAttendanceToFirebase(dateStr, attendanceData) {
            try {
                showLoading(true);
                await db.collection('attendance').doc(dateStr).set(attendanceData, { merge: true });
                attendance[dateStr] = attendanceData;
                return true;
            } catch (error) {
                console.error('Erro ao salvar frequência:', error);
                showError('Erro ao salvar frequência. Tente novamente.');
                return false;
            } finally {
                showLoading(false);
            }
        }

        // Funções de interface
        function showError(message) {
            const errorElement = document.getElementById('login-error');
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        }

        function hideError() {
            document.getElementById('login-error').classList.add('hidden');
        }

        function showLoading(show) {
            const loadingElement = document.getElementById('loading');
            if (loadingElement) {
                loadingElement.classList.toggle('hidden', !show);
            }
        }

        function getFirebaseAuthErrorMessage(error) {
            switch (error.code) {
                case 'auth/invalid-email':
                    return 'Email inválido';
                case 'auth/user-disabled':
                    return 'Usuário desativado';
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    return 'Email ou senha incorretos';
                case 'auth/too-many-requests':
                    return 'Muitas tentativas. Tente mais tarde.';
                default:
                    return 'Erro ao fazer login. Tente novamente.';
            }
        }

        // Logout function
        function logout() {
            auth.signOut().then(() => {
                currentUser = null;
                document.getElementById('app').classList.add('hidden');
                document.getElementById('login-screen').classList.remove('hidden');
                document.getElementById('email').value = '';
                document.getElementById('password').value = '';
            });
        }

        // Tab navigation
        function switchTab(tabId) {
            // Update tab buttons
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.tab === tabId);
            });

            // Hide all tab contents and show selected one
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById(`${tabId}-tab`).classList.remove('hidden');

            // Additional actions when switching to specific tabs
            if (tabId === 'attendance') {
                initCalendar();
            } else if (tabId === 'history') {
                populatePersonSelect();
            }
        }

        // Register new person
        async function registerPerson(e) {
            e.preventDefault();

            const name = document.getElementById('name').value;
            const birthdate = document.getElementById('birthdate').value;
            const role = document.getElementById('role').value;

            if (!name || !birthdate || !role) {
                showError('Por favor, preencha todos os campos.');
                return;
            }

            const newPerson = {
                name,
                birthdate,
                role
            };

            const success = await savePersonToFirebase(newPerson);
            if (success) {
                document.getElementById('register-form').reset();
            }
        }

        // Render people table
        function renderPeopleTable(filteredPeople = null) {
            const tableBody = document.querySelector('#people-table tbody');
            tableBody.innerHTML = '';

            const peopleToRender = filteredPeople || people;

            if (peopleToRender.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="4" style="text-align: center;">Nenhuma pessoa cadastrada</td>';
                tableBody.appendChild(row);
                return;
            }

            peopleToRender.forEach(person => {
                const row = document.createElement('tr');

                // Format date to DD/MM/YYYY
                const birthDate = new Date(person.birthdate);
                const formattedDate = birthDate.toLocaleDateString('pt-BR');

                // Capitalize role
                const capitalizedRole = person.role.charAt(0).toUpperCase() + person.role.slice(1);

                row.innerHTML = `
                    <td>${person.name}</td>
                    <td>${formattedDate}</td>
                    <td>${capitalizedRole}</td>
                    <td>
                        <button class="btn action-btn edit-btn" data-id="${person.id}">Editar</button>
                        <button class="btn action-btn delete-btn admin-only" data-id="${person.id}">Excluir</button>
                        <button class="btn action-btn attendance-btn" data-id="${person.id}">Frequência</button>
                    </td>
                `;

                tableBody.appendChild(row);
            });

            // Add event listeners to buttons
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => editPerson(btn.dataset.id));
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deletePerson(btn.dataset.id));
            });

            document.querySelectorAll('.attendance-btn').forEach(btn => {
                btn.addEventListener('click', () => viewPersonAttendance(btn.dataset.id));
            });
        }

        // Search people
        function searchPeople() {
            const searchTerm = document.getElementById('search-person').value.toLowerCase();

            if (!searchTerm) {
                renderPeopleTable();
                return;
            }

            const filteredPeople = people.filter(person =>
                person.name.toLowerCase().includes(searchTerm) ||
                person.role.toLowerCase().includes(searchTerm)
            );

            renderPeopleTable(filteredPeople);
        }

        // Edit person
        function editPerson(id) {
            const person = people.find(p => p.id === id);

            if (!person) {
                showError('Pessoa não encontrada.');
                return;
            }

            // Fill form with person data
            document.getElementById('name').value = person.name;
            document.getElementById('birthdate').value = person.birthdate;
            document.getElementById('role').value = person.role;

            // Change form behavior
            const form = document.getElementById('register-form');
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Atualizar';

            // Store original submit event and remove it
            const originalSubmit = form.onsubmit;
            form.onsubmit = null;

            // Add new submit event for update
            form.addEventListener('submit', async function updateHandler(e) {
                e.preventDefault();

                person.name = document.getElementById('name').value;
                person.birthdate = document.getElementById('birthdate').value;
                person.role = document.getElementById('role').value;

                const success = await savePersonToFirebase(person);
                if (success) {
                    // Reset form and restore original behavior
                    form.reset();
                    submitBtn.textContent = 'Cadastrar';
                    form.removeEventListener('submit', updateHandler);
                    form.onsubmit = originalSubmit;
                }
            }, { once: true });
        }

        // Delete person
        async function deletePerson(id) {
            if (!confirm('Tem certeza que deseja excluir esta pessoa? Esta ação não pode ser desfeita.')) {
                return;
            }

            const success = await deletePersonFromFirebase(id);
            if (success) {
                showError(''); // Clear any previous errors
            }
        }

        // View person attendance (redirect to history tab)
        function viewPersonAttendance(id) {
            switchTab('history');
            document.getElementById('person-select').value = id;
            showPersonHistory();
        }

        // Calendar functionality
        function initCalendar() {
            const now = new Date();
            renderCalendar(now.getFullYear(), now.getMonth());
        }

        function renderCalendar(year, month) {
            const calendarGrid = document.querySelector('.calendar-grid');
            const daysElements = calendarGrid.querySelectorAll('.calendar-day');

            // Remove old days
            daysElements.forEach(day => {
                if (!day.classList.contains('calendar-day-name')) {
                    day.remove();
                }
            });

            // Update month display
            const monthNames = [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ];
            document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`;

            // Get first day and number of days in month
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // Add blank spaces for days before first day of month
            for (let i = 0; i < firstDay; i++) {
                const emptyDay = document.createElement('div');
                emptyDay.className = 'calendar-day disabled';
                calendarGrid.appendChild(emptyDay);
            }

            // Add days of month
            for (let day = 1; day <= daysInMonth; day++) {
                const dayElement = document.createElement('div');
                dayElement.className = 'calendar-day';
                dayElement.textContent = day;

                // Check if this date has attendance records
                const dateStr = formatDate(new Date(year, month, day));
                if (attendance[dateStr]) {
                    dayElement.classList.add('has-attendance');
                }

                // Store date data
                dayElement.dataset.date = dateStr;

                // Add click event
                dayElement.addEventListener('click', () => {
                    showAttendanceModal(dateStr);
                });

                calendarGrid.appendChild(dayElement);
            }
        }

        function navigateMonth(change) {
            const currentMonth = document.getElementById('current-month').textContent;
            const [monthName, year] = currentMonth.split(' ');

            const monthNames = [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ];

            let month = monthNames.indexOf(monthName);
            let yearNum = parseInt(year);

            month += change;

            if (month < 0) {
                month = 11;
                yearNum--;
            } else if (month > 11) {
                month = 0;
                yearNum++;
            }

            renderCalendar(yearNum, month);
        }

        // Attendance modal functionality
        function showAttendanceModal(dateStr) {
            selectedDate = dateStr;

            // Set modal title with formatted date
            document.getElementById('modal-title').textContent = `Registro de Frequência - ${dateStr}`;

            // Generate attendance list
            const attendanceList = document.querySelector('.attendance-list');
            attendanceList.innerHTML = '';

            // Get attendance data for this date
            const dateAttendance = attendance[dateStr] || {};

            // Create attendance items for each person
            people.forEach(person => {
                const attendanceItem = document.createElement('div');
                attendanceItem.className = 'attendance-item';

                // Person's status for this date
                const status = dateAttendance[person.id] || 'absent';

                attendanceItem.innerHTML = `
                    <div class="person-name">${person.name}</div>
                    <div class="attendance-status">
                        <button class="btn status-btn present-btn ${status === 'present' ? 'active' : ''}" 
                                data-id="${person.id}" data-status="present">Presente</button>
                        <button class="btn status-btn absent-btn ${status === 'absent' ? 'active' : ''}" 
                                data-id="${person.id}" data-status="absent">Ausente</button>
                    </div>
                `;

                attendanceList.appendChild(attendanceItem);
            });

            // Add event listeners to status buttons
            document.querySelectorAll('.status-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Remove active class from sibling button
                    const siblingBtn = e.target.parentElement.querySelector(`.status-btn:not([data-status="${btn.dataset.status}"])`);
                    siblingBtn.classList.remove('active');

                    // Add active class to clicked button
                    btn.classList.add('active');
                });
            });

            // Show modal
            document.getElementById('attendance-modal').classList.remove('hidden');
        }

        function closeAttendanceModal() {
            document.getElementById('attendance-modal').classList.add('hidden');
            selectedDate = null;
        }

        // Save attendance data
        async function saveAttendanceData() {
            if (!selectedDate) return;

            // Create attendance object for selected date
            const attendanceData = {};

            // Get all active status buttons
            const activeButtons = document.querySelectorAll('.status-btn.active');

            // Update attendance status for each person
            activeButtons.forEach(btn => {
                const personId = btn.dataset.id;
                const status = btn.dataset.status;
                attendanceData[personId] = status;
            });

            // Save to Firebase
            const success = await saveAttendanceToFirebase(selectedDate, attendanceData);

            if (success) {
                // Refresh calendar to show updated attendance
                const [day, month, year] = selectedDate.split('/');
                renderCalendar(parseInt(year), parseInt(month) - 1);

                // Close modal
                closeAttendanceModal();
            }
        }

        // History functionality
        function populatePersonSelect() {
            const select = document.getElementById('person-select');

            // Keep only the first option
            while (select.options.length > 1) {
                select.remove(1);
            }

            // Add people to select
            people.forEach(person => {
                const option = document.createElement('option');
                option.value = person.id;
                option.textContent = person.name;
                select.appendChild(option);
            });
        }

        function showPersonHistory() {
            const personId = document.getElementById('person-select').value;

            if (!personId) {
                document.querySelector('#history-table tbody').innerHTML =
                    '<tr><td colspan="3" style="text-align: center;">Selecione uma pessoa para ver o histórico</td></tr>';
                return;
            }

            // Find attendance records for this person
            const records = [];
            for (const date in attendance) {
                if (attendance[date][personId]) {
                    records.push({
                        date,
                        status: attendance[date][personId]
                    });
                }
            }

            // Sort by date (most recent first)
            records.sort((a, b) => {
                const dateA = parseDate(a.date);
                const dateB = parseDate(b.date);
                return dateB - dateA;
            });

            // Render table
            const tableBody = document.querySelector('#history-table tbody');
            tableBody.innerHTML = '';

            if (records.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Nenhum registro encontrado</td></tr>';
                return;
            }

            records.forEach(record => {
                const row = document.createElement('tr');

                // Status in Portuguese
                const statusText = record.status === 'present' ? 'Presente' : 'Ausente';
                const statusClass = record.status === 'present' ? 'success' : 'danger';

                row.innerHTML = `
                    <td>${record.date}</td>
                    <td><span style="color: var(--${statusClass})">${statusText}</span></td>
                    <td>
                        <button class="btn action-btn edit-btn" data-date="${record.date}" data-id="${personId}">Editar</button>
                    </td>
                `;

                tableBody.appendChild(row);
            });

            // Add event listeners to edit buttons
            document.querySelectorAll('#history-table .edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    switchTab('attendance');
                    setTimeout(() => {
                        showAttendanceModal(btn.dataset.date);
                    }, 500);
                });
            });
        }

        // Helper functions
        function formatDate(date) {
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }

        function parseDate(dateStr) {
            const [day, month, year] = dateStr.split('/');
            return new Date(year, month - 1, day);
        }
