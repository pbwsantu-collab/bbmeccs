const DB_NAME = 'bbm_eccs_local_db';
const DB_VERSION = 3; // Incremented to version 3 for transactions store

let dbInstance = null;

function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB Error:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('members')) {
                db.createObjectStore('members', { keyPath: 'memberId' });
            }

            if (!db.objectStoreNames.contains('loans')) {
                db.createObjectStore('loans', { keyPath: 'loanId' });
            }

            // Version 3 Upgrade: Added Transaction Ledger Store
            if (!db.objectStoreNames.contains('transactions')) {
                db.createObjectStore('transactions', { keyPath: 'txId' });
            }

            if (!db.objectStoreNames.contains('sync_queue')) {
                db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

function saveMemberLocal(member) {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return reject('Database not initialized');
        const tx = dbInstance.transaction('members', 'readwrite');
        const store = tx.objectStore('members');
        const request = store.put(member);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

function getMembersLocal() {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return resolve([]);
        const tx = dbInstance.transaction('members', 'readonly');
        const store = tx.objectStore('members');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function saveLoanLocal(loan) {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return reject('Database not initialized');
        const tx = dbInstance.transaction('loans', 'readwrite');
        const store = tx.objectStore('loans');
        const request = store.put(loan);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

function getLoansLocal() {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return resolve([]);
        const tx = dbInstance.transaction('loans', 'readonly');
        const store = tx.objectStore('loans');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Save transaction & update member balances locally
function saveTransactionLocal(transaction) {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return reject('Database not initialized');
        const tx = dbInstance.transaction(['transactions', 'members', 'loans'], 'readwrite');
        const txStore = tx.objectStore('transactions');
        const memberStore = tx.objectStore('members');
        const loanStore = tx.objectStore('loans');

        // 1. Add Transaction
        txStore.put(transaction);

        // 2. Fetch & update the associated Member's Thrift balance or Loan balance
        const memberReq = memberStore.get(transaction.memberId);
        memberReq.onsuccess = () => {
            const member = memberReq.result;
            if (member) {
                if (transaction.type === 'Thrift Deposit') {
                    member.thriftBalance += transaction.amount;
                } else if (transaction.type === 'Thrift Withdrawal') {
                    member.thriftBalance -= transaction.amount;
                }
                memberStore.put(member);
            }
        };

        // 3. If it's a loan repayment, we decrease the principal in the loans store
        if (transaction.type === 'Loan Repayment' && transaction.loanId) {
            const loanReq = loanStore.get(transaction.loanId);
            loanReq.onsuccess = () => {
                const loan = loanReq.result;
                if (loan) {
                    loan.principal = Math.max(0, loan.principal - transaction.amount);
                    if (loan.principal === 0) {
                        loan.status = 'Fully Repaid';
                    }
                    loanStore.put(loan);
                }
            };
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

function getTransactionsLocal() {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return resolve([]);
        const tx = dbInstance.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function queueForSync(action, table, data) {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return reject('Database not initialized');
        const tx = dbInstance.transaction('sync_queue', 'readwrite');
        const store = tx.objectStore('sync_queue');
        const request = store.add({
            action,
            table,
            payload: data,
            timestamp: new Date().toISOString()
        });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}
