// 4-letter code generator for game sessions

// Use consonants to avoid vowel-heavy codes that might spell words
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ';
const ALL_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluding I and O to avoid confusion with 1 and 0

// Generate a random 4-letter code
export function generateCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += ALL_CHARS.charAt(Math.floor(Math.random() * ALL_CHARS.length));
    }
    return code;
}

// Validate code format (4 uppercase letters)
export function isValidCodeFormat(code) {
    return /^[A-Z]{4}$/.test(code.toUpperCase());
}

// Normalize code (uppercase, trim)
export function normalizeCode(code) {
    return code.trim().toUpperCase();
}
