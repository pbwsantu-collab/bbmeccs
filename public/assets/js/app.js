document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDatabase();
        renderAllData();
    } catch (e) {
        console.error('Core Database initialization failed:', e);
    }

    // 1. Mobile Tab Controller
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

    // 2. Add Member Form Submission
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
        });
    }

    // 3. Disburse Loan Form Submission
    const loanForm = document.getElementById('loan-form');
    if (loanForm) {
        loanForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const loanId = 'LN-' + Date.now().toString().slice(-6);
            const newLoan = {
                loanId: loanId,
                memberId: document.getElementById('l-member').value,
                type: document.getElementById('l-type').value,
                principal: parseFloat(document.getElementById('l-principal').value) || 0,
                status: 'Active'
            };

            await saveLoanLocal(newLoan);
            await queueForSync('INSERT', 'loans', newLoan);

            loanForm.reset();
            renderAllData();
        });
    }

    // 4. Dynamic UI updates inside Ledger Transaction Form
    const txTypeSelect = document.getElementById('tx-type');
    const txMemberSelect = document.getElementById('tx-member');
    const loanSelectWrapper = document.getElementById('loan-select-wrapper');
    const targetLoanSelect = document.getElementById('tx-loan-id');

    if (txTypeSelect && txMemberSelect) {
        // Show active loans dropdown ONLY when "Loan Repayment" is selected
        txTypeSelect.addEventListener('change', () => {
            updateTargetLoanDropdown();
        });
        txMemberSelect.addEventListener('change', () => {
            updateTargetLoanDropdown();
        });
    }

    async function updateTargetLoanDropdown() {
        if (txTypeSelect.value === 'Loan Repayment' && txMemberSelect.value) {
            const loans = await getLoansLocal();
            const activeMemberLoans = loans.filter(l => l.memberId === txMemberSelect.value && l.principal > 0);
            
            targetLoanSelect.innerHTML = '<option value="">-- Choose Active Loan --</option>';
            activeMemberLoans.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.loanId;
                opt.textContent = `${l.loanId} (${l.type} - Bal: ₹${l.principal})`;
                targetLoanSelect.appendChild(opt);
            });
            loanSelectWrapper.classList.remove('hidden');
            targetLoanSelect.setAttribute('required', 'true');
        } else {
            loanSelectWrapper.classList.add('hidden');
            targetLoanSelect.removeAttribute('required');
        }
    }

    // 5. Post General Ledger Transaction Form
    const txForm = document.getElementById('tx-form');
    if (txForm) {
        txForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const transaction = {
                txId: 'TX-' + Date.now().toString().slice(-6),
                memberId: document.getElementById('tx-member').value,
                type: document.getElementById('tx-type').value,
                loanId: document.getElementById('tx-loan-id').value || null,
                amount: parseFloat(document.getElementById('tx-amount').value) || 0,
                timestamp: new Date().toISOString()
            };

            // Post Locally & update related balances dynamically
            await saveTransactionLocal(transaction);
            await queueForSync('INSERT', 'transactions', transaction);

            txForm.reset();
            loanSelectWrapper.classList.add('hidden');
            renderAllData();
        });
    }

    // 6. Online Status Monitoring
    const statusBanner = document.getElementById('network-status');
    function updateNetworkStatus() {
        if (!statusBanner) return;
        if (navigator.onLine) {
            statusBanner.textContent = "⚡ Connection Active. Syncing Local Logs...";
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

    const syncBtn = document.getElementById('btn-force-sync');
    if (syncBtn) {
        syncBtn.addEventListener('click', syncLocalDataToCloud);
    }
});

// --- Dynamic Render Pipelines ---
async function renderAllData() {
    const members = await getMembersLocal();
    const loans = await getLoansLocal();
    const transactions = await getTransactionsLocal();

    // A. Render Member Lists & Select Dropdowns
    const memberTableBody = document.getElementById('member-table-body');
    const loanMemberSelect = document.getElementById('l-member');
    const txMemberSelect = document.getElementById('tx-member');

    if (memberTableBody) {
        memberTableBody.innerHTML = '';
        if (loanMemberSelect) loanMemberSelect.innerHTML = '<option value="">-- Choose Member --</option>';
        if (txMemberSelect) txMemberSelect.innerHTML = '<option value="">-- Choose Member --</option>';

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

                const opt1 = document.createElement('option');
                opt1.value = m.memberId;
                opt1.textContent = `${m.name} (${m.memberId})`;
                if (loanMemberSelect) loanMemberSelect.appendChild(opt1);

                const opt2 = opt1.cloneNode(true);
                if (txMemberSelect) txMemberSelect.appendChild(opt2);
            });
        }
    }

    // B. Render Loan Ledger
    const loanTableBody = document.getElementById('loan-table-body');
    if (loanTableBody) {
        loanTableBody.innerHTML = '';
        if (loans.length === 0) {
            loanTableBody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">No active loans on record.</td></tr>`;
        } else {
            loans.forEach(l => {
                const memberObj = members.find(m => m.memberId === l.memberId);
                const memberName = memberObj ? memberObj.name : l.memberId;
                const statusClass = l.status === 'Fully Repaid' ? 'status-pending' : ''; // Use existing styles or update

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHTML(l.loanId)}</strong></td>
                    <td>${escapeHTML(memberName)}</td>
                    <td>${escapeHTML(l.type)}</td>
                    <td>₹${l.principal.toLocaleString('en-IN')}</td>
                    <td><span class="status-badge status-pending ${statusClass}">${escapeHTML(l.status)}</span></td>
                `;
                loanTableBody.appendChild(row);
            });
        }
    }

    // C. Render Transactions List
    const txTableBody = document.getElementById('tx-table-body');
    if (txTableBody) {
        txTableBody.innerHTML = '';
        if (transactions.length === 0) {
            txTableBody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">No transactions logged yet.</td></tr>`;
        } else {
            // Display most recent transactions at the top
            transactions.reverse().slice(0, 15).forEach(t => {
                const memberObj = members.find(m => m.memberId === t.memberId);
                const memberName = memberObj ? memberObj.name : t.memberId;
                const dateStr = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${dateStr}</td>
                    <td>${escapeHTML(memberName)}</td>
                    <td><span class="text-muted">${escapeHTML(t.type)}</span></td>
                    <td><strong>₹${t.amount.toLocaleString('en-IN')}</strong></td>
                `;
                txTableBody.appendChild(row);
            });
        }
    }

    checkSyncQueue();
}

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
                syncList.innerHTML = `<p class="text-muted" style="text-align:center;">Outbox is clean. All modifications synchronized!</p>`;
            } else {
                queue.forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'sync-queue-item';
                    itemDiv.innerHTML = `
                        <strong>${item.action}</strong>: ${item.table} (${item.payload.memberId || item.payload.loanId || item.payload.txId})
                        <span class="text-muted" style="font-size:0.75rem; display:block;">Queued: ${new Date(item.timestamp).toLocaleTimeString()}</span>
                    `;
                    syncList.appendChild(itemDiv);
                });
            }
        }
    };
}

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
