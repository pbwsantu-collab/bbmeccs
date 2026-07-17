document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDatabase();
        // Hydrate data from the server if online, then render
        if (navigator.onLine) {
            await hydrateDatabaseFromServer();
        }
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
            if (navigator.onLine) syncLocalDataToCloud();
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
            if (navigator.onLine) syncLocalDataToCloud();
        });
    }

    // 4. Dynamic UI updates inside Ledger Transaction Form
    const txTypeSelect = document.getElementById('tx-type');
    const txMemberSelect = document.getElementById('tx-member');
    const loanSelectWrapper = document.getElementById('loan-select-wrapper');
    const targetLoanSelect = document.getElementById('tx-loan-id');

    if (txTypeSelect && txMemberSelect) {
        txTypeSelect.addEventListener('change', updateTargetLoanDropdown);
        txMemberSelect.addEventListener('change', updateTargetLoanDropdown);
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

            await saveTransactionLocal(transaction);
            await queueForSync('INSERT', 'transactions', transaction);

            txForm.reset();
            loanSelectWrapper.classList.add('hidden');
            renderAllData();
            if (navigator.onLine) syncLocalDataToCloud();
        });
    }

    // 6. Dividend Calculation & Post Engine
    const dividendForm = document.getElementById('dividend-form');
    let computedDividendsList = [];

    if (dividendForm) {
        dividendForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rate = parseFloat(document.getElementById('div-rate').value) / 100;
            const members = await getMembersLocal();
            const tableBody = document.getElementById('dividend-table-body');
            
            tableBody.innerHTML = '';
            computedDividendsList = [];

            if (members.length === 0) {
                alert("No members registered to calculate dividends.");
                return;
            }

            members.forEach(m => {
                const payout = parseFloat((m.thriftBalance * rate).toFixed(2));
                computedDividendsList.push({
                    memberId: m.memberId,
                    name: m.name,
                    thriftBalance: m.thriftBalance,
                    dividendAmount: payout
                });

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHTML(m.memberId)}</strong></td>
                    <td>₹${m.thriftBalance.toLocaleString('en-IN')}</td>
                    <td style="color:var(--success-color); font-weight:bold;">₹${payout.toLocaleString('en-IN')}</td>
                `;
                tableBody.appendChild(row);
            });

            document.getElementById('dividend-results-wrapper').classList.remove('hidden');
        });
    }

    const postDividendsBtn = document.getElementById('btn-post-dividends');
    if (postDividendsBtn) {
        postDividendsBtn.addEventListener('click', async () => {
            if (computedDividendsList.length === 0) return;
            
            if (confirm(`Are you sure you want to distribute dividends to ${computedDividendsList.length} members?`)) {
                for (const item of computedDividendsList) {
                    const transaction = {
                        txId: 'DIV-' + Date.now().toString().slice(-4) + '-' + Math.floor(Math.random() * 100),
                        memberId: item.memberId,
                        type: 'Thrift Deposit',
                        loanId: null,
                        amount: item.dividendAmount,
                        timestamp: new Date().toISOString()
                    };
                    
                    await saveTransactionLocal(transaction);
                    await queueForSync('INSERT', 'transactions', transaction);
                }

                alert("Dividends distributed and logged successfully!");
                document.getElementById('dividend-results-wrapper').classList.add('hidden');
                if (dividendForm) dividendForm.reset();
                renderAllData();
                if (navigator.onLine) syncLocalDataToCloud();
            }
        });
    }

    // 7. CSV Reporting Export Mechanics
    const setupExport = (buttonId, filename, dataFetcher, headers, mapper) => {
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.addEventListener('click', async () => {
                const data = await dataFetcher();
                if (data.length === 0) {
                    alert("No local records found to export.");
                    return;
                }

                let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
                csvContent += headers.join(",") + "\n";

                data.forEach(item => {
                    const row = mapper(item);
                    const快捷Row = row.map(v => `"${String(v).replace(/"/g, '""')}"`);
                    csvContent +=快捷Row.join(",") + "\n";
                });

                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    };

    setupExport('export-members', 'BBM_ECCS_Members.csv', getMembersLocal, 
        ['Member ID', 'Name', 'Thrift Balance (INR)'], 
        m => [m.memberId, m.name, m.thriftBalance]
    );

    setupExport('export-loans', 'BBM_ECCS_Loans.csv', getLoansLocal, 
        ['Loan ID', 'Member ID', 'Loan Type', 'Principal Remaining', 'Status'], 
        l => [l.loanId, l.memberId, l.type, l.principal, l.status]
    );

    setupExport('export-tx', 'BBM_ECCS_Transactions.csv', getTransactionsLocal, 
        ['Timestamp', 'Transaction ID', 'Member ID', 'Type', 'Amount (INR)', 'Loan Reference'], 
        t => [t.timestamp, t.txId, t.memberId, t.type, t.amount, t.loanId || 'N/A']
    );

    // 8. Connection Status Handler
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

// --- Server-to-Client Initial Seeding Engine ---
async function hydrateDatabaseFromServer() {
    try {
        console.log("🔄 Fetching central cloud data partitions...");
        const res = await fetch('/api/data');
        if (!res.ok) return;
        const cloudData = await res.json();

        // Seed members
        if (cloudData.members && cloudData.members.length > 0) {
            for (const m of cloudData.members) await saveMemberLocal(m);
        }
        // Seed loans
        if (cloudData.loans && cloudData.loans.length > 0) {
            for (const l of cloudData.loans) await saveLoanLocal(l);
        }
        // Seed transactions
        if (cloudData.transactions && cloudData.transactions.length > 0) {
            for (const t of cloudData.transactions) await saveTransactionLocal(t);
        }
        console.log("✅ IndexedDB storage system fully hydrated with cloud state.");
    } catch (err) {
        console.error("⚠️ Failed to download server records during startup hydration:", err);
    }
}

// --- Dynamic Render Pipelines ---
async function renderAllData() {
    const members = await getMembersLocal();
    const loans = await getLoansLocal();
    const transactions = await getTransactionsLocal();

    const sumThriftEl = document.getElementById('sum-thrift');
    const sumLoansEl = document.getElementById('sum-loans');
    if (sumThriftEl && sumLoansEl) {
        const totalThrift = members.reduce((acc, curr) => acc + curr.thriftBalance, 0);
        const totalOutstandingLoans = loans.reduce((acc, curr) => acc + (curr.principal || 0), 0);
        sumThriftEl.textContent = `₹${totalThrift.toLocaleString('en-IN')}`;
        sumLoansEl.textContent = `₹${totalOutstandingLoans.toLocaleString('en-IN')}`;
    }

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

    const loanTableBody = document.getElementById('loan-table-body');
    if (loanTableBody) {
        loanTableBody.innerHTML = '';
        if (loans.length === 0) {
            loanTableBody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">No active loans on record.</td></tr>`;
        } else {
            loans.forEach(l => {
                const memberObj = members.find(m => m.memberId === l.memberId);
                const memberName = memberObj ? memberObj.name : l.memberId;
                const statusClass = l.status === 'Fully Repaid' ? 'status-pending' : '';

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

    const txTableBody = document.getElementById('tx-table-body');
    if (txTableBody) {
        txTableBody.innerHTML = '';
        if (transactions.length === 0) {
            txTableBody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">No transactions logged yet.</td></tr>`;
        } else {
            transactions.slice().reverse().slice(0, 15).forEach(t => {
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
    if (!navigator.onLine) return;
    if (typeof dbInstance === 'undefined' || !dbInstance) return;

    const tx = dbInstance.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const request = store.getAll();

    request.onsuccess = async () => {
        const queue = request.result;
        if (queue.length === 0) return;

        console.log(`📡 Sending ${queue.length} items to server...`);
        try {
            const response = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queue })
            });
            if (response.ok) {
                const result = await response.json();
                console.log(`✅ Server successfully processed ${result.processed} items.`);
                const writeTx = dbInstance.transaction('sync_queue', 'readwrite');
                const writeStore = writeTx.writeStore ? writeTx.writeStore('sync_queue') : writeTx.objectStore('sync_queue');
                const clearRequest = writeStore.clear();
                clearRequest.onsuccess = () => {
                    console.log('Outbox cleaned up.');
                    renderAllData();
                };
            }
        } catch (err) {
            console.error('❌ Network failure during sync transfer:', err);
        }
    };
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
