document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize DB Core
    try {
        await initDatabase();
        renderAllData();
    } catch (e) {
        console.error('Core Database initialization failed:', e);
    }

    // 2. Mobile Tab Controller
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            tabButtons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            tabContents.forEach(content => content.classList.remove('active-content'));

            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            document.getElementById(targetId).classList.add('active-content');
        });
    });

    // 3. Member Registration Submission Trapping
    const memberForm = document.getElementById('member-form');
    if (memberForm) {
        memberForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newMember = {
                memberId: document.getElementById('m-id').value.trim(),
                name: document.getElementById('m-name').value.trim(),
                thriftBalance: parseFloat(document.getElementById('m-thrift').value) || 0
            };

            await saveMemberLocal(newMember);
            await queueForSync('INSERT', 'members', newMember);

            memberForm.reset();
            renderAllData();
            checkSyncQueue();
        });
    }

    // 4. Loan Disbursement Submission Trapping
    const loanForm = document.getElementById('loan-form');
    if (loanForm) {
        loanForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newLoan = {
                loanId: 'LN-' + Date.now(),
                memberId: document.getElementById('l-member').value,
                type: document.getElementById('l-type').value,
                principal: parseFloat(document.getElementById('l-principal').value) || 0,
                status: 'Pending Sync'
            };

            await saveLoanLocal(newLoan);
            await queueForSync('INSERT', 'loans', newLoan);

            loanForm.reset();
            renderAllData();
            checkSyncQueue();
        });
    }

    // 5. Connection Detection Engine
    const statusBanner = document.getElementById('network-status');
    
    function updateNetworkStatus() {
        if (!statusBanner) return;
        if (navigator.onLine) {
            statusBanner.textContent = "⚡ Connection Active. Processing Sync Queues...";
            statusBanner.className = "status-bar online";
            statusBanner.classList.remove('hidden');
            
            setTimeout(() => statusBanner.classList.add('hidden'), 3000);
            syncLocalDataToCloud();
        } else {
            statusBanner.textContent = "⚠️ Device Offline. Storage safe in Local IndexedDB.";
            statusBanner.className = "status-bar offline";
            statusBanner.classList.remove('hidden');
        }
    }

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    if (!navigator.onLine) updateNetworkStatus();

    // 6. Hard-Sync Button Handler
    const syncBtn = document.getElementById('btn-force-sync');
    if (syncBtn) {
        syncBtn.addEventListener('click', syncLocalDataToCloud);
    }
});

// --- Dynamic Render Engine ---
async function renderAllData() {
    const memberTableBody = document.getElementById('member-table-body');
    const loanDropdown = document.getElementById('l-member');

    if (memberTableBody && loanDropdown) {
        const members = await getMembersLocal();
        memberTableBody.innerHTML = '';
        loanDropdown.innerHTML = '<option value="">-- Choose Member --</option>';

        if (members.length === 0) {
            memberTableBody.innerHTML = `<tr><td colspan="3" class="text-muted" style="text-align:center;">No members registered yet.</td></tr>`;
        } else {
            members.forEach(m => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHTML(m.memberId)}</strong></td>
                    <td>${escapeHTML(m.name)}</td>
                    <td>₹${m.thriftBalance.toLocaleString('en-IN')}</td>
                `;
                memberTableBody.appendChild(row);

                const option = document.createElement('option');
                option.value = m.memberId;
                option.textContent = `${m.name} (${m.memberId})`;
                loanDropdown.appendChild(option);
            });
        }
    }

    const loanTableBody = document.getElementById('loan-table-body');
    if (loanTableBody) {
        const loans = await getLoansLocal();
        loanTableBody.innerHTML = '';

        if (loans.length === 0) {
            loanTableBody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">No active loans on record.</td></tr>`;
        } else {
            loans.forEach(l => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${escapeHTML(l.memberId)}</td>
                    <td>${escapeHTML(l.type)}</td>
                    <td>₹${l.principal.toLocaleString('en-IN')}</td>
                    <td><span class="status-badge status-pending">${escapeHTML(l.status)}</span></td>
                `;
                loanTableBody.appendChild(row);
            });
        }
    }

    checkSyncQueue();
}

// Update the Badge count on Tab 3
async function checkSyncQueue() {
    if (typeof dbInstance === 'undefined' || !dbInstance) return;
    const tx = dbInstance.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const request = store.getAll();

    request.onsuccess = () => {
        const queue = request.result;
        const queueCountEl = document.getElementById('queue-count');
        if (queueCountEl) queueCountEl.textContent = queue.length;
        
        const syncList = document.getElementById('sync-list');
        if (syncList) {
            syncList.innerHTML = '';

            if (queue.length === 0) {
                syncList.innerHTML = `<p class="text-muted" style="text-align:center;">Outbox is clean. All local modifications synced!</p>`;
            } else {
                queue.forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'sync-queue-item';
                    itemDiv.innerHTML = `
                        <strong>${item.action}</strong>: ${item.table} (${item.payload.memberId || item.payload.loanId})
                        <span class="text-muted" style="font-size:0.75rem; display:block;">Queued: ${new Date(item.timestamp).toLocaleTimeString()}</span>
                    `;
                    syncList.appendChild(itemDiv);
                });
            }
        }
    };
}

// Emulated Cloud Sync Pipeline
async function syncLocalDataToCloud() {
    if (!navigator.onLine) {
        alert("Cannot initiate synchronization. Device is still offline.");
        return;
    }
    if (typeof dbInstance === 'undefined' || !dbInstance) return;

    const tx = dbInstance.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const request = store.getAll();

    request.onsuccess = async () => {
        const queue = request.result;
        if (queue.length === 0) return;

        console.log(`Found ${queue.length} items ready to write to server. Uploading in progress...`);
        await new Promise(r => setTimeout(r, 1200));

        const writeTx = dbInstance.transaction('sync_queue', 'readwrite');
        const writeStore = writeTx.objectStore('sync_queue');
        const clearRequest = writeStore.clear();

        clearRequest.onsuccess = () => {
            console.log('Outbox synchronization complete.');
            renderAllData();
        };
    };
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
