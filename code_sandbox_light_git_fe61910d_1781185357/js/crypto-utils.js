const CryptoUtils = {
    async sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async hashPassword(password) {
        return this.sha256(password);
    },

    async verifyPassword(inputPassword, storedHash) {
        const inputHash = await this.sha256(inputPassword);
        if (inputHash.length !== storedHash.length) return false;
        const inputBuf = new Uint8Array(inputHash.match(/.{2}/g).map(b => parseInt(b, 16)));
        const storedBuf = new Uint8Array(storedHash.match(/.{2}/g).map(b => parseInt(b, 16)));
        if (inputBuf.length !== storedBuf.length) return false;
        let diff = 0;
        for (let i = 0; i < inputBuf.length; i++) diff |= inputBuf[i] ^ storedBuf[i];
        return diff === 0;
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    },

    stripHtml(str) {
        if (!str) return '';
        return str.replace(/<[^>]*>/g, '');
    },

    sanitizeData(obj, fields) {
        if (!obj) return obj;
        fields.forEach(f => {
            if (obj[f] && typeof obj[f] === 'string') {
                obj[f] = this.stripHtml(obj[f]);
            }
        });
        return obj;
    }
};

window.CryptoUtils = CryptoUtils;
