/**
 * FPA ARGOS Analytics V3 — db.js
 * Persistência de dados locais utilizando IndexedDB
 */

const DB_NAME = 'FPA_ARGOS_DB';
const DB_VERSION = 1;
const STORE_NAME = 'app_data';

const db = {
    _dbInstance: null,

    /**
     * Inicializa o banco de dados
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("Erro ao abrir IndexedDB", event);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this._dbInstance = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const dbInstance = event.target.result;
                if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                    dbInstance.createObjectStore(STORE_NAME);
                }
            };
        });
    },

    /**
     * Salva um dado no banco
     * @param {string} key Chave do item
     * @param {any} value Valor a ser salvo
     */
    async setItem(key, value) {
        if (!this._dbInstance) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this._dbInstance.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, key);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    },

    /**
     * Carrega um dado do banco
     * @param {string} key Chave do item
     */
    async getItem(key) {
        if (!this._dbInstance) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this._dbInstance.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    },

    /**
     * Remove um item do banco
     * @param {string} key Chave do item
     */
    async removeItem(key) {
        if (!this._dbInstance) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this._dbInstance.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    },

    /**
     * Limpa todo o armazenamento
     */
    async clear() {
        if (!this._dbInstance) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this._dbInstance.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }
};

window.AppDB = db;
